import Papa from 'papaparse';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Retry reads only. A timed-out write may already have reached the server.
export function createDataReader({ fetchImpl = (...args) => fetch(...args), sleep = pause, now = Date.now, baseUrl = () => document.baseURI } = {}) {
  const csvRequests = new Map();

  async function readData(url, { type = 'json', timeoutMs = 12000, attempts = 3, maxWaitMs = 40000, onRetry, ...options } = {}) {
    const started = now();
    const canRetry = (options.method || 'GET').toUpperCase() === 'GET';
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, Math.max(1, maxWaitMs - (now() - started))));
      let failure;
      let retryAfter = 0;
      try {
        const response = await fetchImpl(url, { ...options, signal: controller.signal });
        if (!response.ok) {
          const retryHeader = response.headers.get('Retry-After');
          retryAfter = /^\d+$/.test(retryHeader || '') ? Number(retryHeader) * 1000 : Math.max(0, Date.parse(retryHeader) - now()) || 0;
          let body; try { body = await response.json(); } catch { /* A proxy may return HTML. */ }
          const error = new Error(body?.message || `تعذر تحميل البيانات (HTTP ${response.status}).`);
          error.status = response.status;
          throw error;
        }
        return type === 'text' ? await response.text() : await response.json();
      } catch (error) {
        failure = error;
      } finally { clearTimeout(timer); }
      const retryable = !failure.status || RETRYABLE.has(failure.status);
      const delay = Math.max(750, retryAfter || attempt * 750);
      if (!canRetry || !retryable || attempt >= attempts || now() - started + delay >= maxWaitMs) {
        if (failure.name === 'AbortError') {
          const error = new Error('انتهت مهلة الاتصال بالخدمة. تحقق من الاتصال ثم أعد المحاولة.');
          error.name = 'TimeoutError';
          throw error;
        }
        throw failure;
      }
      onRetry?.({ attempt, delay, error: failure });
      await sleep(delay);
    }
  }

  async function loadCsv(url, { requiredFields = [] } = {}) {
    const key = new URL(url, baseUrl()).href;
    if (!csvRequests.has(key)) {
      const request = readData(key, { type: 'text' }).then(text => {
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: header => header.trim() });
        return { rows: parsed.data, fields: parsed.meta.fields || [] };
      }).catch(error => { csvRequests.delete(key); throw error; });
      csvRequests.set(key, request);
    }
    const { rows, fields } = await csvRequests.get(key);
    if (requiredFields.length && (!rows.length || requiredFields.some(field => !fields.includes(field)))) {
      csvRequests.delete(key);
      throw new Error('ملف بيانات الأعضاء فارغ أو غير صالح. أعد المحاولة بعد لحظات.');
    }
    return rows;
  }

  return { readData, loadCsv };
}

export const { readData, loadCsv } = createDataReader();
