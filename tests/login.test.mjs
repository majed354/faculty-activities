import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// Exercise the login script used by the page, including its user-facing errors.
const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = page.match(/<script>\s*\/\/ =+[\s\S]*?نظام تسجيل الدخول[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
function loginHarness(loadCsv, { bootstrap, cvSignIn, blockedStorage = false } = {}) {
  const elements = new Map();
  const storage = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', style: {} });
    return elements.get(id);
  };
  const context = vm.createContext({
    SiteData: { loadCsv }, window: { SiteBootstrap: bootstrap, ...(cvSignIn ? { AcademicCv: { signIn: cvSignIn } } : {}) }, console: { warn() {} },
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage blocked'); return storage.get(key); },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage blocked'); storage.set(key, value); },
      removeItem(key) { if (blockedStorage) throw new Error('Storage blocked'); storage.delete(key); }
    },
    document: { getElementById: element, addEventListener() {} }
  });
  vm.runInContext(script, context);
  element('loginPassword').value = '1429';
  return { element, storage, context, login: id => { element('loginEmployeeId').value = id; return context.handleLogin(); } };
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

test('the bundled member list opens the page while the CV service is still unresolved', async () => {
  let finish, reads = 0;
  const cv = new Promise(resolve => { finish = resolve; });
  const app = loginHarness(async () => { reads++; throw new Error('Network unavailable'); }, {
    bootstrap: { members: [{ id: '4280548', name: 'ماجد' }] }, cvSignIn: () => cv
  });
  const pending = app.login('\u061c٤٢٨٠٥٤٨\u200f');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
  assert.equal(app.element('loginOverlay').style.display, 'none');
  assert.equal(app.element('mainApp').style.display, 'block');
  assert.equal(app.storage.get('employeeId'), '4280548');
  finish(false); await pending;
});

test('unavailable browser storage cannot prevent a valid login or keep a logged-out identity', async () => {
  const app = loginHarness(async () => [], { bootstrap: { members: [{ id: '4280548', name: 'ماجد' }] }, blockedStorage: true });
  await app.login('4280548');
  assert.equal(app.element('mainApp').style.display, 'block');
  assert.equal(app.context.window.SiteSession.getItem('employeeId'), '4280548');
  app.context.handleLogout();
  assert.equal(app.context.window.SiteSession.getItem('employeeId'), null);
  assert.equal(app.element('mainApp').style.display, 'none');
});

test('only a valid loaded roster can establish that an employee number is unknown', async () => {
  const app = loginHarness(async () => [{ id: '4280548', name: 'ماجد' }]);
  await app.login('9999999');
  assert.match(app.element('loginErrorMsg').textContent, /غير موجود/);
  assert.equal(app.storage.has('loggedIn'), false);
  await app.login('4280548');
  assert.equal(app.storage.get('loggedIn'), 'true');
});
