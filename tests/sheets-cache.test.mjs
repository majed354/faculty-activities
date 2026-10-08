import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsCache, createSheetsDataHandler, validateActivityPayload, SYNC_INTERVAL_MS, MAX_SNAPSHOT_AGE_MS } from '../src/sheets-cache.mjs';
import scheduledRefresh from '../netlify/functions/sheets-schedule.mjs';

const payload = { meta: { status: 'ok', api_version: '3' }, publications: [{ id: '1', title: 'بحث مثبت' }], theses: [{ id: '2' }], participations: [{ id: '3' }] };
function fixture(fetchSource = async () => structuredClone(payload)) {
  const objects = new Map(); let sequence = 0, clock = Date.parse('2026-10-08T12:00:00Z');
  const store = {
    async getWithMetadata(key) { return objects.get(key) || null; },
    async setJSON(key, data, condition = {}) {
      const existing = objects.get(key);
      if (condition.onlyIfNew && existing || condition.onlyIfMatch && existing?.etag !== condition.onlyIfMatch) return { modified: false };
      const etag = `"cache-${++sequence}"`; objects.set(key, { data: structuredClone(data), etag }); return { modified: true, etag };
    }
  };
  const cache = createSheetsCache({ store, sourceUrl: 'https://sheet.example/exec', fetchSource, now: () => clock, pause: async () => {} });
  return { cache, objects, advance: ms => { clock += ms; } };
}

test('cached reads return immediately while upstream refresh is unresolved', async () => {
  const f = fixture(); await f.cache.refresh(); f.advance(SYNC_INTERVAL_MS + 1);
  const pending = []; let release;
  const handler = createSheetsDataHandler({ cache: f.cache, dispatchRefresh: () => new Promise(resolve => { release = resolve; }) });
  const response = await handler(new Request('https://site.example/.netlify/functions/sheets-data'), { waitUntil: task => pending.push(task) });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.sync.state, 'stale'); assert.equal(data.publications[0].title, 'بحث مثبت');
  assert.equal(data.sync.syncedAt, '2026-10-08T12:00:00.000Z');
  assert.equal(pending.length, 1); release(); await pending[0];
});

test('concurrent refreshes share one upstream request and preserve a complete snapshot', async () => {
  let release, calls = 0;
  const f = fixture(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  const first = f.cache.refresh({ force: true }), second = f.cache.refresh({ force: true });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1);
  release(payload); await Promise.all([first, second]);
  assert.deepEqual((await f.cache.read()).payload, payload);
  assert.equal((await f.cache.read()).sync.refreshing, false);
});

test('failed or incomplete upstream reads keep the last confirmed data and timestamp', async () => {
  let broken = false;
  const f = fixture(async () => broken ? { publications: [], theses: [] } : payload);
  await f.cache.refresh(); f.advance(SYNC_INTERVAL_MS + 1); broken = true;
  await assert.rejects(f.cache.refresh(), /ناقصة/);
  const result = await f.cache.read();
  assert.deepEqual(result.payload, payload); assert.equal(result.sync.syncedAt, '2026-10-08T12:00:00.000Z');
  assert.equal(result.sync.lastAttemptFailed, true); assert.equal(result.sync.refreshing, false);
});

test('empty, expired, and wrong-source snapshots are never represented as current data', async () => {
  assert.throws(() => validateActivityPayload({ publications: [], theses: [], participations: [] }), /خالية/);
  assert.throws(() => validateActivityPayload({ ...payload, meta: { status: 'error' } }), /نجاح/);
  assert.throws(() => validateActivityPayload({ ...payload, publications: [{ title: 'ع'.repeat(2_500_001) }] }), /أكبر/);
  const f = fixture(); assert.equal((await f.cache.read()).payload, null);
  await f.cache.refresh(); f.advance(MAX_SNAPSHOT_AGE_MS + 1);
  assert.equal((await f.cache.read()).sync.state, 'expired');
  assert.equal((await f.cache.read()).payload, null);
  f.objects.get('latest').data.sourceUrl = 'https://another.example/exec';
  assert.equal((await f.cache.read()).sync.state, 'missing');
});

test('refresh API acknowledges queueing, validates origins, and never accepts cache contents', async () => {
  const f = fixture(), pending = []; let calls = 0;
  const handler = createSheetsDataHandler({ cache: f.cache, dispatchRefresh: async force => { assert.equal(force, true); calls++; } });
  const request = (body, origin = 'https://site.example') => handler(new Request('https://site.example/.netlify/functions/sheets-data', { method: 'POST', headers: { origin }, body }), { waitUntil: task => pending.push(task) });
  assert.equal((await request('{')).status, 400);
  assert.equal((await request(JSON.stringify({ action: 'seed', payload }))).status, 400);
  assert.equal((await request('{"action":"refresh"}', 'https://other.example')).status, 403);
  assert.equal((await request('{"action":"refresh"}')).status, 202);
  await Promise.all(pending); assert.equal(calls, 1); assert.equal(f.objects.size, 0);
});

test('missing cache returns an explicit unavailable response, never synthetic zero counts', async () => {
  const f = fixture(); const pending = [];
  const handler = createSheetsDataHandler({ cache: f.cache, dispatchRefresh: async () => {} });
  const response = await handler(new Request('https://site.example/.netlify/functions/sheets-data'), { waitUntil: task => pending.push(task) });
  assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '5');
  const result = await response.json(); assert.equal(result.publications, undefined); assert.equal(result.sync.state, 'missing');
  await Promise.all(pending);
});

test('scheduled refresh does not skip alternate runs when previous reads completed late', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return payload; });
  await f.cache.refresh(); f.advance(SYNC_INTERVAL_MS - 10_000);
  const originalFetch = globalThis.fetch, originalNetlify = globalThis.Netlify;
  globalThis.Netlify = { env: { get: () => 'test-only-internal-secret' } };
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://site.example/.netlify/functions/sheets-refresh');
    assert.equal(JSON.parse(options.body).force, true);
    await f.cache.refresh(JSON.parse(options.body));
    return new Response('', { status: 202 });
  };
  try {
    await scheduledRefresh(new Request('https://site.example'), { site: { url: 'http://site.example' } });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; if (originalNetlify === undefined) delete globalThis.Netlify; else globalThis.Netlify = originalNetlify; }
});
