import { validateActivityPayload, MAX_SNAPSHOT_AGE_MS, SYNC_INTERVAL_MS } from './sheets-cache.mjs';

const ENDPOINT = '/.netlify/functions/sheets-data';
const CACHE_NAME = 'faculty-confirmed-activity-v1';

export function validateConfirmedActivity(payload, sourceId, now = Date.now()) {
  validateActivityPayload(payload);
  const syncedAt = Date.parse(payload.sync?.syncedAt || '');
  if (!sourceId || payload.sync?.sourceId !== sourceId || !Number.isFinite(syncedAt)
    || syncedAt > now + SYNC_INTERVAL_MS || now - syncedAt > MAX_SNAPSHOT_AGE_MS) {
    throw new Error('نسخة النشاط منتهية أو لا تنتمي إلى مصدر الموقع الحالي.');
  }
  return payload;
}

// CacheStorage is optional (private mode, quota, or storage restrictions).
// Store only the public activity read, never CV profiles or authentication.
export function createBrowserSnapshotStore(sourceId) {
  const key = new URL(`${ENDPOINT}?snapshot=${sourceId}`, globalThis.location?.href || 'http://localhost').href;
  return {
    async read() {
      const cache = await globalThis.caches?.open(CACHE_NAME);
      const response = await cache?.match(key);
      return response ? response.json() : null;
    },
    async write(serialized) {
      const cache = await globalThis.caches?.open(CACHE_NAME);
      if (cache) await cache.put(key, new Response(serialized, { headers: { 'Content-Type': 'application/json' } }));
    }
  };
}

export function createActivityReader({ readData, sourceId, store = createBrowserSnapshotStore(sourceId), now = () => Date.now(), storageTimeoutMs = 1000 }) {
  const inFlight = new Map();
  let initialLive;
  const clone = payload => JSON.parse(JSON.stringify(payload));
  async function savedRead() {
    let timer;
    try {
      const payload = await Promise.race([
        Promise.resolve().then(() => store.read()),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), storageTimeoutMs); })
      ]);
      return validateConfirmedActivity(payload, sourceId, now());
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  function liveRead(bypassCache, options) {
    const url = ENDPOINT + (bypassCache ? '?fresh=1' : '');
    if (!inFlight.has(url)) {
      const request = Promise.resolve().then(() => readData(url, options)).then(payload => {
        validateConfirmedActivity(payload, sourceId, now());
        // Serialize before callers normalize dates or otherwise mutate their copy.
        const serialized = JSON.stringify(payload);
        Promise.resolve().then(() => store.write(serialized)).catch(() => {});
        return payload;
      }).finally(() => inFlight.delete(url));
      // An initial saved read may win before the live request rejects.
      request.catch(() => {});
      inFlight.set(url, request);
    }
    return inFlight.get(url);
  }
  return async function loadActivity({ initial = true, bypassCache = false, ...options } = {}) {
    let live;
    if (!initial && !bypassCache && initialLive) {
      live = initialLive;
      initialLive = null;
    } else live = liveRead(bypassCache, options);
    if (initial && !bypassCache) {
      initialLive = live;
      const saved = savedRead();
      const result = await Promise.race([
        live.then(payload => ({ payload, live: true })).catch(async error => {
          const payload = await saved;
          if (payload) return { payload, live: false };
          throw error;
        }),
        saved.then(payload => payload ? { payload, live: false } : live.then(value => ({ payload: value, live: true })))
      ]);
      if (result.live) initialLive = null;
      const payload = clone(result.payload);
      if (!result.live) payload.sync = { ...payload.sync, state: 'stale', delivery: 'browser', refreshing: true, lastAttemptFailed: false };
      return payload;
    }
    return clone(await live);
  };
}
