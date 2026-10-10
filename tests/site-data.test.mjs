import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataReader } from '../src/site-data.mjs';

test('transient reads retry and respect Retry-After before recovering', async () => {
  const delays = []; let calls = 0;
  const reader = createDataReader({ sleep: async ms => delays.push(ms), fetchImpl: async () => ++calls === 1
    ? new Response('Temporary proxy failure', { status: 503, headers: { 'Retry-After': '5' } })
    : Response.json({ ok: true }) });
  assert.deepEqual(await reader.readData('/data'), { ok: true });
  assert.deepEqual(delays, [5000]); assert.equal(calls, 2);
});

test('network interruption and truncated JSON can recover on the next read', async () => {
  let calls = 0;
  const reader = createDataReader({ sleep: async () => {}, fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new TypeError('Failed to fetch');
    return calls === 2 ? new Response('{') : Response.json({ records: [] });
  } });
  assert.deepEqual(await reader.readData('/data'), { records: [] }); assert.equal(calls, 3);
});

test('expired sessions are not retried and keep their HTTP status', async () => {
  let calls = 0;
  const reader = createDataReader({ fetchImpl: async () => { calls++; return Response.json({ message: 'Session expired' }, { status: 401 }); } });
  await assert.rejects(reader.readData('/profiles'), error => error.status === 401 && error.message === 'Session expired');
  assert.equal(calls, 1);
});

test('writes are never retried after a transient server error or network timeout', async () => {
  for (const timeout of [false, true]) {
    let calls = 0;
    const reader = createDataReader({ fetchImpl: async (url, { signal }) => {
      calls++;
      if (!timeout) return new Response('Failed', { status: 503 });
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError'))));
    } });
    await assert.rejects(reader.readData('/save', { method: 'POST', timeoutMs: 5 }));
    assert.equal(calls, 1);
  }
});

test('retry window is bounded even when a server keeps preparing its snapshot', async () => {
  let time = 0, calls = 0;
  const reader = createDataReader({ now: () => time, sleep: async ms => { time += ms; }, fetchImpl: async () => {
    calls++; return new Response('', { status: 503, headers: { 'Retry-After': '5' } });
  } });
  await assert.rejects(reader.readData('/sheets', { attempts: 24, maxWaitMs: 12000 }), { status: 503 });
  assert.equal(calls, 3); assert.equal(time, 10000);
});

test('login and app share one roster read, including Arabic names and BOM headers', async () => {
  let calls = 0;
  const reader = createDataReader({ baseUrl: () => 'https://faculty.test/', fetchImpl: async () => {
    calls++; return new Response('\uFEFFid,name\n4280548,ماجد الجهني\n');
  } });
  const [app, login] = await Promise.all([
    reader.loadCsv('./data/faculty.csv'), reader.loadCsv('/data/faculty.csv', { requiredFields: ['id', 'name'] })
  ]);
  assert.deepEqual(login, [{ id: '4280548', name: 'ماجد الجهني' }]); assert.deepEqual(app, login); assert.equal(calls, 1);
});

test('failed or malformed rosters are not cached as empty membership lists', async () => {
  let calls = 0;
  const reader = createDataReader({ baseUrl: () => 'https://faculty.test/', sleep: async () => {}, fetchImpl: async () => {
    calls++; return calls <= 3 ? new Response('', { status: 503 }) : calls === 4 ? new Response('<html>Proxy error</html>') : new Response('id,name\n4280548,ماجد\n');
  } });
  const load = () => reader.loadCsv('/data/faculty.csv', { requiredFields: ['id', 'name'] });
  await assert.rejects(load()); await assert.rejects(load(), /غير صالح/);
  assert.equal((await load())[0].id, '4280548'); assert.equal(calls, 5);
});
