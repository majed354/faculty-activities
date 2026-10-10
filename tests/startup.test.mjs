import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function startupHarness() {
  const requests = new Map(), timers = new Map(), elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set(id === 'loadingOverlay' ? ['active'] : []);
      elements.set(id, {
        hidden: id === 'activityWorkspace', textContent: '',
        classList: {
          add: name => classes.add(name), remove: name => classes.delete(name),
          contains: name => classes.has(name),
          toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
        },
        querySelector: selector => element(selector),
        setAttribute(name) { if (name === 'hidden') this.hidden = true; }
      });
    }
    return elements.get(id);
  };
  const request = (url, options) => {
    const result = deferred(); requests.set(url, { ...result, options }); return result.promise;
  };
  let timerId = 0;
  const context = vm.createContext({
    document: {
      getElementById: element, querySelector: () => element('.loading-rings'),
      addEventListener() {}
    },
    window: { addEventListener() {} },
    console: { warn() {}, log() {}, error() {} },
    SiteData: { readData: request },
    setInterval() {},
    setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(source, context);
  context.loadCSV = request;
  context.getCurrentHijriYearNumber = () => 1448;
  context.normalizeFacultyMemberCollection = rows => rows;
  context.normalizeAcademicPromotionRows = rows => rows;
  context.normalizeGoogleSheetsPayload = () => {};
  for (const name of ['buildCourseToPrograms', 'populateYearSelector', 'populateDepartmentSelector',
    'populateProgramSelector', 'setupTabs', 'setupFilters', 'setupYearSelector',
    'setupDepartmentSelector', 'setupProgramSelector', 'syncMainNavOffset',
    'populateThesesFilters', 'setupAnalyticsStudio', 'renderSheetsSyncStatus']) context[name] = () => {};
  let renders = 0;
  context.renderAll = () => { renders++; };
  const find = fragment => [...requests].find(([url]) => url.includes(fragment))?.[1];
  const resolveLocal = () => {
    find('config.json').resolve({ available_years: [1448], current_department: 'all' });
    find('faculty.csv').resolve([{ id: '4280548', name: 'ماجد', year: '1448' }]);
    find('students_count.csv').resolve([]);
    find('academic_promotions.csv').resolve([{ id: 'csv-backup', year: '1448' }]);
    find('new_all_plans.csv').resolve([{ course_code: 'TEST' }]);
  };
  const sheets = {
    publications: [{ id: 'sheet-publication', year: '1448' }], theses: [], participations: [],
    academic_promotions: [], sync: { syncedAt: '2026-10-11T00:00:00Z', state: 'fresh' }
  };
  return { context, element, requests, timers, find, resolveLocal, sheets, renders: () => renders };
}

test('login is outside the activity wait and external fonts cannot block startup scripts', () => {
  assert.ok(page.indexOf('id="loginOverlay"') < page.indexOf('id="mainApp"'));
  assert.ok(page.indexOf('id="mainApp"') < page.indexOf('id="loadingOverlay"'));
  assert.ok(page.indexOf('id="loadingOverlay"') < page.indexOf('نهاية mainApp'));
  assert.match(page, /id="activityWorkspace" hidden/);
  assert.match(page, /fonts\.googleapis\.com\/css2[^>]+media="print"[^>]+onload=/);
  for (const script of ['assets/site-runtime.js', 'app.js', 'assets/cv-studio.js', 'teaching.js']) {
    assert.ok(page.includes(`<script defer src="${script}?`));
  }
});

test('startup reads begin together; a slow sheet never exposes placeholder activity totals', async () => {
  const app = startupHarness();
  const pending = app.context.init();
  assert.equal(app.requests.size, 6, 'config, four CSVs and the sheet start without waiting for each other');
  assert.equal(app.find('sheets-data').options.maxWaitMs, 30000);
  assert.equal(app.renders(), 0);
  assert.equal(app.element('activityWorkspace').hidden, true);
  [...app.timers.values()].find(timer => timer.ms === 12000).callback();
  assert.equal(app.element('.loading-rings').hidden, true);
  app.find('sheets-data').options.onRetry({ error: { status: 503 } });
  assert.equal(app.element('.loading-rings').hidden, true, 'another retry does not bring back the spinner');
  app.resolveLocal();
  app.find('sheets-data').resolve(app.sheets);
  await pending;
  assert.equal(app.renders(), 1);
  assert.equal(app.element('activityWorkspace').hidden, false);
  assert.equal(app.element('loadingOverlay').classList.contains('active'), false);
  assert.equal(app.timers.size, 0);
  assert.equal(vm.runInContext('data.publications[0].id', app.context), 'sheet-publication');
  assert.equal(vm.runInContext('allData.academicPromotions.length', app.context), 0, 'an empty confirmed sheet beats the local backup');
});

test('an unavailable sheet ends with a retry action and no spinning or synthetic activity', async () => {
  const app = startupHarness();
  const pending = app.context.init();
  app.resolveLocal();
  app.find('sheets-data').reject(new Error('Network unavailable'));
  await pending;
  assert.equal(app.renders(), 0);
  assert.equal(app.element('activityWorkspace').hidden, true);
  assert.equal(app.element('.loading-rings').hidden, true);
  assert.equal(app.element('#loadingRetryButton').hidden, false);
  assert.match(app.element('#loadingMessage').textContent, /تعذر تحميل نسخة مؤكدة/);
  assert.equal(app.timers.size, 0);
});

test('failed rendering keeps the workspace concealed and reports the failure', async () => {
  const app = startupHarness();
  app.context.renderAll = () => { throw new Error('Rendering failed'); };
  const pending = app.context.init();
  app.resolveLocal(); app.find('sheets-data').resolve(app.sheets);
  await pending;
  assert.equal(app.element('activityWorkspace').hidden, true);
  assert.equal(app.element('.loading-rings').hidden, true);
  assert.match(app.element('#loadingMessage').textContent, /Rendering failed/);
});
