export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 3 * 60 * 1000;
const ACTIVITY_KEYS = ['publications', 'theses', 'participations'];

export function validateActivityPayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.error || payload.status === 'error' || payload.meta?.status === 'error') throw new Error('لم تؤكد خدمة الشيت نجاح القراءة.');
  if (ACTIVITY_KEYS.some(key => !Array.isArray(payload[key]) || payload[key].some(row => !row || typeof row !== 'object' || Array.isArray(row)))) throw new Error('استجابة الشيت ناقصة أو غير صالحة.');
  if (!ACTIVITY_KEYS.some(key => payload[key].length)) throw new Error('استجابة الشيت خالية من جميع سجلات النشاط.');
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 5_000_000) throw new Error('استجابة الشيت أكبر من الحد المسموح.');
  return payload;
}

// The cache holds only complete, successful reads from the configured Sheet.
// Its refresh lease collapses concurrent refreshes into one upstream read.
export function createSheetsCache({ store, sourceUrl, fetchSource, now = () => Date.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const validSnapshot = record => {
    if (record?.data?.sourceUrl !== sourceUrl || !Number.isFinite(Date.parse(record.data.syncedAt))) return false;
    try { validateActivityPayload(record.data.payload); return true; } catch { return false; }
  };
  async function read() {
    const [snapshot, status] = await Promise.all([store.getWithMetadata('latest', { type: 'json' }), store.getWithMetadata('refresh-status', { type: 'json' })]);
    const sync = status?.data || {};
    const refreshing = sync.refreshingUntil > now();
    if (!validSnapshot(snapshot)) return { payload: null, sync: { refreshing, lastAttemptAt: sync.attemptedAt || '', state: 'missing' } };
    const age = Math.max(0, now() - Date.parse(snapshot.data.syncedAt));
    if (age > MAX_SNAPSHOT_AGE_MS) return { payload: null, sync: { refreshing, lastAttemptAt: sync.attemptedAt || '', state: 'expired' } };
    return {
      payload: snapshot.data.payload,
      sync: { syncedAt: snapshot.data.syncedAt, sourceGeneratedAt: snapshot.data.payload.meta?.generated_at || '', state: age >= SYNC_INTERVAL_MS ? 'stale' : 'fresh', refreshing, lastAttemptAt: sync.attemptedAt || '', lastAttemptFailed: sync.state === 'failed', refreshIntervalMinutes: 5 }
    };
  }
  async function refresh({ force = false } = {}) {
    const [snapshot, status] = await Promise.all([store.getWithMetadata('latest', { type: 'json' }), store.getWithMetadata('refresh-status', { type: 'json' })]);
    const started = now();
    if (status?.data?.refreshingUntil > started) return { skipped: 'already-refreshing' };
    if (!force && validSnapshot(snapshot) && started - Date.parse(snapshot.data.syncedAt) < SYNC_INTERVAL_MS) return { skipped: 'fresh' };
    if (status?.data?.attemptedAt && started - Date.parse(status.data.attemptedAt) < 10_000) return { skipped: 'cooldown' };
    const attemptedAt = new Date(started).toISOString();
    const lease = await store.setJSON('refresh-status', { state: 'refreshing', attemptedAt, refreshingUntil: started + LEASE_MS }, status?.etag ? { onlyIfMatch: status.etag } : { onlyIfNew: true });
    if (!lease.modified) return { skipped: 'already-refreshing' };
    let lastError;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const payload = validateActivityPayload(await fetchSource(sourceUrl));
          const syncedAt = new Date(now()).toISOString();
          await store.setJSON('latest', { sourceUrl, syncedAt, payload });
          await store.setJSON('refresh-status', { state: 'ready', attemptedAt, completedAt: syncedAt, refreshingUntil: 0 }, { onlyIfMatch: lease.etag });
          return { syncedAt, counts: Object.fromEntries(ACTIVITY_KEYS.map(key => [key, payload[key].length])) };
        } catch (error) { lastError = error; if (!attempt) await pause(1000); }
      }
      throw lastError;
    } catch (error) {
      await store.setJSON('refresh-status', { state: 'failed', attemptedAt, completedAt: new Date(now()).toISOString(), refreshingUntil: 0 }, { onlyIfMatch: lease.etag });
      throw error;
    }
  }
  return { read, refresh };
}

export function createSheetsDataHandler({ cache, dispatchRefresh }) {
  return async (request, context) => {
    const headers = { 'Cache-Control': 'no-store' };
    if (!['GET', 'POST'].includes(request.method)) return Response.json({ message: 'طريقة الطلب غير مدعومة.' }, { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
    const queue = force => {
      const task = dispatchRefresh(force).catch(error => console.error('Sheet refresh dispatch failed:', error.message));
      context.waitUntil(task);
    };
    try {
      if (request.method === 'POST') {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return Response.json({ message: 'مصدر الطلب غير مسموح.' }, { status: 403, headers });
        const text = await request.text();
        if (text.length > 1000) return Response.json({ message: 'الطلب أكبر من الحد المسموح.' }, { status: 413, headers });
        let body; try { body = JSON.parse(text || '{}'); } catch { return Response.json({ message: 'الطلب غير صالح.' }, { status: 400, headers }); }
        if (body?.action !== 'refresh') return Response.json({ message: 'عملية غير مدعومة.' }, { status: 400, headers });
        queue(true);
        return Response.json({ refreshQueued: true }, { status: 202, headers });
      }
      const result = await cache.read();
      if (!result.sync.refreshing && result.sync.state !== 'fresh') queue(false);
      if (!result.payload) return Response.json({ message: 'جارٍ إعداد نسخة مؤكدة من الشيت. أعد المحاولة بعد قليل.', sync: result.sync }, { status: 503, headers: { ...headers, 'Retry-After': '5' } });
      return Response.json({ ...result.payload, sync: result.sync }, { headers });
    } catch (error) {
      console.error('Sheet cache read failed:', error.message);
      return Response.json({ message: 'تعذر تحميل نسخة الشيت المحفوظة. أعد المحاولة.', sync: { state: 'unavailable' } }, { status: 503, headers });
    }
  };
}
