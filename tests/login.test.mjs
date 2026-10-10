import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// Exercise the login script used by the page, including its user-facing errors.
const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = page.match(/<script>\s*\/\/ =+[\s\S]*?نظام تسجيل الدخول[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
function loginHarness(loadCsv) {
  const elements = new Map();
  const storage = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', style: {} });
    return elements.get(id);
  };
  const context = vm.createContext({
    SiteData: { loadCsv }, window: {}, console: { warn() {} },
    sessionStorage: { setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: element, addEventListener() {} }
  });
  vm.runInContext(script, context);
  element('loginPassword').value = '1429';
  return { element, storage, login: id => { element('loginEmployeeId').value = id; return context.handleLogin(); } };
}

test('a roster outage never tells an existing member their number is missing', async () => {
  let available = false;
  const app = loginHarness(async () => { if (!available) throw new Error('HTTP 503'); return [{ id: '4280548', name: 'ماجد' }]; });
  await app.login('4280548');
  assert.match(app.element('loginErrorMsg').textContent, /تعذر تحميل قائمة الأعضاء/);
  assert.doesNotMatch(app.element('loginErrorMsg').textContent, /غير موجود/);
  assert.equal(app.storage.has('loggedIn'), false);
  assert.equal(app.element('loginBtn').disabled, false);
  available = true;
  await app.login('٤٢٨٠٥٤٨');
  assert.equal(app.storage.get('employeeId'), '4280548');
  assert.equal(app.element('loginOverlay').style.display, 'none');
});

test('only a valid loaded roster can establish that an employee number is unknown', async () => {
  const app = loginHarness(async () => [{ id: '4280548', name: 'ماجد' }]);
  await app.login('9999999');
  assert.match(app.element('loginErrorMsg').textContent, /غير موجود/);
  assert.equal(app.storage.has('loggedIn'), false);
  await app.login('4280548');
  assert.equal(app.storage.get('loggedIn'), 'true');
});
