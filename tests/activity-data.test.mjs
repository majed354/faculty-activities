import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityReader, validateConfirmedActivity, createBrowserSnapshotStore } from '../src/activity-data.mjs';
import { MAX_SNAPSHOT_AGE_MS } from '../src/sheets-cache.mjs';

const clock = Date.parse('2026-10-11T00:00:00Z');
const snapshot = () => ({
  publications: [{ id: 'confirmed', publish_date: '1448/01/01' }], theses: [], participations: [],
  sync: { syncedAt: new Date(clock - 60_000).toISOString(), sourceId: 'sheet-a', state: 'fresh' }
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const setup = (readData, store, options = {}) => createActivityReader({ readData, store, sourceId: 'sheet-a', now: () => clock, ...options });

test('a saved confirmed read opens while the live request is unresolved, then shares the refresh', async () => {
  const live = deferred(); let calls = 0, written;
  const saved = snapshot();
  const load = setup(() => { calls++; return live.promise; }, { read: async () => saved, write: async text => { written = JSON.parse(text); } });
  const result = await load();
  assert.equal(calls, 1);
  assert.equal(result.sync.delivery, 'browser');
  assert.equal(result.sync.refreshing, true);
  assert.equal(result.sync.syncedAt, saved.sync.syncedAt);
  result.publications[0].publish_date = 'mutated-by-renderer';
  assert.equal(saved.publications[0].publish_date, '1448/01/01');
  const next = snapshot(); next.publications[0].id = 'new'; next.sync.syncedAt = new Date(clock).toISOString();
  const refresh = load({ initial: false });
  live.resolve(next);
  const updated = await refresh;
  assert.equal(calls, 1); assert.equal(updated.publications[0].id, 'new');
  assert.equal(updated.sync.delivery, undefined);
  updated.publications[0].publish_date = 'mutated';
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(written.publications[0].publish_date, '1448/01/01');
  assert.equal(written.sync.syncedAt, next.sync.syncedAt);
});

test('failed live refresh preserves the saved timestamp without an unhandled rejection', async () => {
  const live = deferred(); const saved = snapshot();
  const load = setup(() => live.promise, { read: async () => saved });
  const result = await load(); live.reject(new Error('Temporary network failure'));
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(load({ initial: false }), /Temporary/);
  assert.equal(result.sync.syncedAt, saved.sync.syncedAt);
});

test('expired, wrong-source, future, malformed and entirely empty snapshots are refused', async () => {
  for (const mutate of [
    p => { p.sync.syncedAt = new Date(clock - MAX_SNAPSHOT_AGE_MS - 1).toISOString(); },
    p => { p.sync.sourceId = 'different-sheet'; },
    p => { p.sync.syncedAt = new Date(clock + 600_000).toISOString(); },
    p => { delete p.participations; },
    p => { p.publications = []; },
    p => { p.sync.syncedAt = 'invalid'; }
  ]) {
    const invalid = snapshot(); mutate(invalid);
    assert.throws(() => validateConfirmedActivity(invalid, 'sheet-a', clock));
    const load = setup(async () => { throw new Error('offline'); }, { read: async () => invalid });
    await assert.rejects(load(), /offline/);
  }
  let writes = 0;
  const load = setup(async () => ({ ...snapshot(), theses: null }), { read: async () => null, write: async () => { writes++; } });
  await assert.rejects(load(), /ناقصة/); assert.equal(writes, 0);
});

test('unavailable or stalled browser storage does not delay a successful live read', async () => {
  for (const read of [async () => { throw new Error('Storage unavailable'); }, () => new Promise(() => {})]) {
    const load = setup(async () => snapshot(), { read, write: async () => { throw new Error('Quota'); } }, { storageTimeoutMs: 10 });
    const result = await load(); assert.equal(result.sync.delivery, undefined);
  }
  const live = deferred();
  const load = setup(() => live.promise, { read: () => new Promise(() => {}) }, { storageTimeoutMs: 10 });
  const result = load();
  await new Promise(resolve => setTimeout(resolve, 20));
  live.reject(new Error('offline')); await assert.rejects(result, /offline/);
});

test('manual refresh uses an uncached URL and cannot reuse a pending normal read', async () => {
  const normal = deferred(); const calls = [];
  const load = setup((url, options) => { calls.push({ url, options }); return url.includes('fresh=1') ? snapshot() : normal.promise; }, { read: async () => snapshot(), write: async () => {} });
  await load();
  const forced = await load({ initial: false, bypassCache: true, cache: 'no-store' });
  assert.equal(forced.sync.delivery, undefined);
  assert.equal(calls.length, 2); assert.match(calls[1].url, /\?fresh=1$/);
  assert.equal(calls[1].options.cache, 'no-store');
  normal.resolve(snapshot()); await load({ initial: false });
});

test('browser CacheStorage persists only the public snapshot under its source key', async () => {
  const original = globalThis.caches; const objects = new Map(), opened = [];
  globalThis.caches = { open: async name => { opened.push(name); return {
    put: async (key, response) => objects.set(key, await response.text()),
    match: async key => objects.has(key) ? new Response(objects.get(key)) : undefined
  }; } };
  try {
    const a = createBrowserSnapshotStore('sheet-a'), b = createBrowserSnapshotStore('sheet-b');
    await a.write(JSON.stringify(snapshot()));
    assert.deepEqual(await a.read(), snapshot()); assert.equal(await b.read(), null);
    assert.equal(new Set(opened).size, 1);
    assert.ok([...objects.keys()].every(key => key.includes('/.netlify/functions/sheets-data?snapshot=sheet-a')));
  } finally { if (original === undefined) delete globalThis.caches; else globalThis.caches = original; }
});
