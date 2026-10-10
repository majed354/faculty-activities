import { PROFILE_SECTIONS, normalizeProfile, profileChecklist } from './cv-schema.mjs';
import { buildCvDocument, renderCvDocument, html } from './cv-document.mjs';
import { CERTIFICATE_CHOICES, chooseEntry, chooseInterest, draftBiography } from './cv-choices.mjs';
import { EDITOR_STEPS, CHOICE_IDENTITIES, entryHtml, editorStepsHtml, syncChoices, filterChoices } from './cv-editor.mjs';
import { chartCsvRows } from './cv-chart-data.mjs';
import { confirmCvMembers, cancelCvConfirmation } from './cv-access.mjs';
import { readData } from './site-data.mjs';
import printStyles from '../cv-studio.css';

const ENDPOINT = '/.netlify/functions/cv-profiles';
const profiles = new Map();
let initialized = false;
let editing = null;
let sessionReady = false;
let returnFocus = null;
let editorRequestId = 0;
let sessionPrompt = null;
const byId = id => document.getElementById(id);
const context = () => ({ university: config.university_name || 'جامعة الطائف', college: config.college_name || 'كلية الشريعة', formatDate, yearLabel: formatCustomStatsYearLabel });
const options = () => ({ mode: byId('cvStudioMode')?.value || 'public', personal: !!byId('cvStudioPersonal')?.checked, generatedAt: cvStudioReport?.generatedAt });
const message = (text, error = false) => {
  const status = byId('cvStudioStorageStatus');
  if (status) { status.textContent = text; status.classList.toggle('is-error', error); }
  byId('cvStudioActivate')?.classList.toggle('hidden', sessionReady);
};

async function api(path = '', body, isCurrent = () => true) {
  try {
    return await readData(`${ENDPOINT}${path}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, timeoutMs: 15000, maxWaitMs: 47000 });
  } catch (error) {
    if (error.status === 401 && isCurrent()) { sessionReady = false; message(error.message, true); }
    if (error.name === 'TimeoutError' && body?.action === 'save') throw new Error('انتهت مهلة الاتصال. لم يتم تأكيد الحفظ؛ احتفظ بالمسودة وأعد تحميل النسخة المحفوظة قبل تكرار الحفظ.');
    throw error;
  }
}

async function signIn(employeeId, password) {
  cancelCvConfirmation();
  try {
    await api('', { action: 'login', employeeId, password });
    sessionReady = true;
    profiles.clear();
    message('الحفظ الدائم متصل. بيانات السيرة مرتبطة بالعضو وتبقى محفوظة بين السنوات والأجهزة.');
    return true;
  } catch (error) { sessionReady = false; message(error.message, true); return false; }
}

async function signOut() {
  editorRequestId += 1;
  cancelCvConfirmation();
  sessionReady = false;
  profiles.clear();
  cvStudioClearReport();
  if (editing) closeEditor();
  sessionPrompt?.finish(false);
  try { await api('', { action: 'logout' }); } catch { /* The current app still signs out when offline. */ }
  message('أعد تسجيل الدخول لتفعيل بيانات السيرة المحفوظة.');
}

async function load(ids, force = false, { isCurrent = () => true } = {}) {
  const checkCurrent = () => {
    if (isCurrent()) return;
    const error = new Error('تم إلغاء فتح السيرة.'); error.name = 'CancelledError'; throw error;
  };
  checkCurrent();
  const required = [...new Set(ids.map(String))].filter(id => force || !profiles.has(id));
  if (!required.length) return;
  const received = [];
  for (let offset = 0; offset < required.length; offset += 80) {
    checkCurrent();
    const path = `?ids=${encodeURIComponent(required.slice(offset, offset + 80).join(','))}`;
    let result;
    try { result = await api(path, undefined, isCurrent); }
    catch (error) {
      checkCurrent();
      if (error.status !== 401) throw error;
      if (!await openSession()) { const cancelled = new Error('تم إلغاء فتح السيرة.'); cancelled.name = 'CancelledError'; throw cancelled; }
      checkCurrent();
      result = await api(path, undefined, isCurrent);
    }
    received.push(...result.records);
  }
  checkCurrent();
  received.forEach(record => profiles.set(record.employeeId, record));
  sessionReady = true;
  message('الحفظ الدائم متصل. تجمع السيرة البيانات المحفوظة وسجلات النشاط من جميع السنوات.');
}

function confirmMembers(ids) {
  return confirmCvMembers(ids.map(id => getCvStudioMemberRecord(id, 'all')));
}

function cancelConfirmation() {
  editorRequestId += 1;
  cancelCvConfirmation();
  sessionPrompt?.finish(false);
}

function documentFor(bundle) {
  return buildCvDocument({ ...bundle, profile: getProfile(bundle.member.id), breakdownEntries: getCvStudioBreakdownEntries(bundle) }, options(), context());
}

function getProfile(id) { return profiles.get(String(id))?.profile || normalizeProfile(); }

function renderMember(bundle) {
  const profile = getProfile(bundle.member.id);
  const missing = profileChecklist(profile).filter(([, present]) => !present).map(([label]) => label);
  return `<div class="analytics-studio-card cv-academic-card" data-cv-member="${html(bundle.member.id)}">
    <div class="cv-card-tools">
      <div><span class="cv-status-pill">${profile.updatedAt ? 'بيانات سيرة محفوظة' : 'بيانات السيرة بحاجة إلى استكمال'}</span>${missing.length ? `<p class="cv-missing-note">حقول مقترحة للاستكمال: ${html(missing.join('، '))}.</p>` : ''}</div>
      <div class="cv-tool-buttons"><button type="button" data-cv-action="edit" data-cv-id="${html(bundle.member.id)}">استكمال السيرة</button><button type="button" data-cv-action="pdf" data-cv-id="${html(bundle.member.id)}">PDF</button><button type="button" data-cv-action="word" data-cv-id="${html(bundle.member.id)}">Word</button></div>
    </div>${renderCvDocument(documentFor(bundle))}</div>`;
}

function renderSummary(report) {
  const savedProfiles = report.members.filter(bundle => getProfile(bundle.member.id).updatedAt).length;
  return [
    { value: report.members.length.toLocaleString('ar-SA'), label: 'الأعضاء المختارون' },
    { value: options().mode === 'internal' ? 'تقرير داخلي' : options().mode === 'short' ? 'سيرة مختصرة' : 'سيرة كاملة للنشر', label: 'نوع الملف' },
    { value: report.departmentLabel, label: 'القسم' },
    { value: savedProfiles.toLocaleString('ar-SA'), label: 'ملفات محفوظة' }
  ];
}

function selectedDocuments(id) {
  if (!cvStudioReport) return [];
  return cvStudioReport.members.filter(bundle => !id || String(bundle.member.id) === String(id)).map(documentFor);
}

function fileName(documents) {
  return analyticsStudioSafeFileName(documents.length === 1 ? `${documents[0].modeLabel}-${documents[0].name}` : `${options().mode === 'internal' ? 'التقارير-الداخلية' : 'السير-الأكاديمية'}-${cvStudioReport.departmentLabel}`);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const PDF_ENDPOINT = '/api/cv-pdf';

// The typeset PDF is produced on the server and arrives as a file. That is what
// makes this behave the same on a phone: no popup to be blocked, no print
// dialog to configure, and no browser header stamped across every page.
// Typst needs the bytes, not the address. A portrait that cannot be fetched —
// blocked by CORS, moved, or offline — is simply left out, and the masthead
// lays out without it rather than reserving an empty frame.
async function withPortrait(doc) {
  if (!doc.photo) return doc;
  try {
    const response = await fetch(doc.photo, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) return doc;
    const blob = await response.blob();
    if (!blob.size || blob.size > 3 * 1024 * 1024) return doc;
    const portraitData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { ...doc, portraitData };
  } catch { return doc; }
}

async function exportPdf(id) {
  const selected = selectedDocuments(id);
  if (!selected.length) return;
  const documents = await Promise.all(selected.map(withPortrait));
  const name = fileName(documents);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    message('جارٍ توليد ملف PDF…');
    const response = await fetch(PDF_ENDPOINT, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents, fileName: name }),
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = 'تعذر توليد الملف.';
      try { detail = (await response.json()).message || detail; } catch { /* Not every failure returns JSON. */ }
      throw new Error(detail);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('وصل ملف فارغ من الخادم');
    download(blob, `${name}.pdf`);
    message('تم تنزيل ملف PDF.');
  } catch (error) {
    // Printing still yields a usable file offline or while the service is
    // down, so the member is never left without a way to export.
    const reason = error.name === 'AbortError' ? 'انتهت مهلة توليد الملف' : error.message;
    message(`${reason}. سيُفتح بديل الطباعة.`, true);
    printFallback(documents, name);
  } finally { clearTimeout(timeout); }
}

function printFallback(documents, name) {
  const popup = window.open('', '_blank');
  if (!popup) { alert('تعذر توليد PDF. اسمح بفتح نافذة الطباعة لاستخدام البديل.'); return; }
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(name)}</title><style>${printStyles}</style></head><body class="cv-print-body"><div class="cv-print-hint">اختر «حفظ بصيغة PDF» من نافذة الطباعة، وأوقف خيار ترويسة الصفحة وتذييلها.</div>${documents.map(renderCvDocument).join('')}</body></html>`);
  popup.addEventListener('load', async () => {
    await popup.document.fonts.ready;
    await Promise.all([...popup.document.images].map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = () => { img.remove(); resolve(); }; setTimeout(resolve, 4000); })));
    popup.focus(); popup.print();
  }, { once: true });
  popup.document.close();
}

async function exportWord(id, propagateError = false) {
  const documents = selectedDocuments(id);
  if (!documents.length) return;
  try {
    message('جارٍ إعداد ملف Word…');
    const { createWordBlob } = await import('/assets/cv-word.js');
    download(await createWordBlob(documents), `${fileName(documents)}.docx`);
    message('تم إعداد Word بالبيانات الظاهرة في المعاينة.');
  } catch (error) { message(`تعذر إعداد Word: ${error.message}`, true); if (propagateError) throw error; }
}

function exportCsv() {
  const documents = selectedDocuments();
  const rows = [['العضو', 'المحور', 'العنوان', 'التفاصيل', 'رابط الوصول', 'المصدر']];
  documents.forEach(doc => {
    doc.profileItems.forEach(([label, value]) => rows.push([doc.name, 'التعريف الأكاديمي', label, value, '', '']));
    doc.links.forEach(([label, url]) => rows.push([doc.name, 'الروابط العلمية', label, '', url, '']));
    rows.push(...chartCsvRows(doc));
    doc.sections.forEach(section => {
      if (section.text) rows.push([doc.name, section.title, '', section.text, '', '']);
      (section.entries || []).forEach(row => rows.push([doc.name, section.title, row.title, row.details, row.url, row.source]));
    });
  });
  // Prevent spreadsheet programs from treating user text as executable formulas.
  const safeRows = rows.map(row => row.map(value => /^[=+\-@\t\r]/.test(String(value)) ? `'${value}` : value));
  downloadCSV(convertMatrixToDelimitedText(safeRows), `${fileName(documents)}.csv`);
}

function openSession() {
  if (sessionPrompt) { byId('cvSessionPassword')?.focus(); return sessionPrompt.promise; }
  const modal = document.createElement('div');
  modal.id = 'cvSessionModal'; modal.className = 'modal active';
  modal.innerHTML = `<div class="modal-content cv-session-dialog" role="dialog" aria-modal="true" aria-labelledby="cvSessionTitle"><h3 id="cvSessionTitle">تجديد جلسة السير</h3><p>انتهت جلسة السير أو لم تُفعّل. أدخل كلمة مرور الدخول للمتابعة؛ سيُستكمل فتح السيرة تلقائيًا.</p><form><label for="cvSessionPassword">كلمة مرور الدخول</label><input id="cvSessionPassword" class="form-input" type="password" autocomplete="current-password" required><p class="cv-form-error" role="alert"></p><div class="cv-dialog-actions"><button type="button" data-close>إلغاء</button><button type="submit" class="cv-primary">متابعة</button></div></form></div>`;
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const prompt = { promise, finish: ok => { if (sessionPrompt !== prompt) return; modal.remove(); sessionPrompt = null; resolve(ok); } };
  sessionPrompt = prompt;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').onclick = () => prompt.finish(false);
  modal.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = modal.querySelector('[type=submit]');
    if (button.disabled) return;
    button.disabled = true;
    const ok = await signIn(getLoggedInEmployeeId(), normalizeArabicDigits(byId('cvSessionPassword').value));
    if (sessionPrompt !== prompt) return;
    button.disabled = false;
    if (ok) prompt.finish(true);
    else modal.querySelector('.cv-form-error').textContent = byId('cvStudioStorageStatus').textContent;
  };
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); prompt.finish(false); }
    if (event.key === 'Tab') {
      const items = [...modal.querySelectorAll('button,input')].filter(element => !element.disabled);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }
  });
  modal.querySelector('input').focus();
  return promise;
}

const draftKey = id => `academic-cv-draft-v1:${getLoggedInEmployeeId()}:${id}`;
function rawForm() {
  const form = byId('cvProfileForm');
  const result = {};
  form.querySelectorAll('[data-profile-field]').forEach(input => { result[input.dataset.profileField] = input.value; });
  PROFILE_SECTIONS.forEach(section => {
    result[section.key] = [...form.querySelectorAll(`[data-profile-section="${section.key}"] .cv-edit-entry`)].map(row => {
      const values = {}; row.querySelectorAll('[data-entry-field]').forEach(input => { values[input.dataset.entryField] = input.value; }); return values;
    });
  });
  return result;
}

function storeDraft() {
  if (!editing || !byId('cvProfileForm')) return;
  try { localStorage.setItem(draftKey(editing.id), JSON.stringify({ profile: rawForm(), baseEtag: editing.etag, savedAt: new Date().toISOString() })); } catch { /* Saving to the server remains available without local storage. */ }
  byId('cvEditorSaveState').textContent = 'مسودة — اضغط «حفظ السيرة» لاعتماد التعديلات.';
  byId('cvRestoreDraft')?.classList.remove('hidden');
}

function editorHtml(member, profile) {
  return `<div class="modal-content cv-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="cvEditorTitle">
    <div class="cv-editor-header"><div><p>جميع حقول استكمال السيرة اختيارية</p><h3 id="cvEditorTitle">${html(member.name)}</h3><p>أدخل ما تشاء واترك الباقي فارغًا، بما فيه سنوات الخبرة، ثم احفظ وولّد الملف. الحفظ دائم، والتوليد يشمل جميع سنوات النشاط.</p></div><button type="button" data-close-editor aria-label="إغلاق محرر السيرة">×</button></div>
    <details class="cv-import-tools"><summary>نسخ البيانات واستعادة المسودة</summary><div class="cv-editor-import"><button type="button" id="cvRestoreDraft" class="hidden">استعادة مسودة هذا الجهاز</button><button type="button" id="cvProfileBackup">تنزيل نسخة من البيانات</button><label class="cv-file-label">استيراد نسخة بيانات<input type="file" id="cvProfileImport" accept=".json,application/json"></label><p>النسخة هنا لاستعادة الحقول. استخدم «حفظ وتوليد الملف» لتنزيل السيرة بصيغة Word أو PDF.</p></div></details>
    <form id="cvProfileForm" novalidate>
      ${editorStepsHtml(member, profile)}
      ${editing.id !== getLoggedInEmployeeId() ? '<label class="cv-privilege-field">كلمة مرور الصلاحيات لحفظ سيرة عضو آخر<input type="password" id="cvEditorPrivilege" autocomplete="off" required></label>' : ''}
      <div class="cv-editor-footer"><div class="cv-step-controls"><button type="button" data-step-back disabled>السابق</button><p id="cvStepStatus" role="status">الخطوة ١ من ٤</p><button type="button" data-step-next>التالي</button></div><div class="cv-save-status"><p id="cvEditorSaveState">${profile.updatedAt ? 'التعديلات تُعتمد عند الحفظ.' : 'أكمل ما ينطبق عليك فقط.'}</p><p class="cv-form-error" id="cvEditorError" role="alert"></p></div><details class="cv-generation-settings"><summary id="cvEditorOutputLabel">إعدادات الملف: Word</summary><div class="cv-generation-options"><label>نوع السيرة<select id="cvEditorMode"><option value="public">كاملة للنشر</option><option value="short">مختصرة</option><option value="internal">تقرير داخلي</option></select></label><label>الملف بعد الحفظ<select id="cvEditorOutput"><option value="word">Word قابل للتحرير</option><option value="pdf">PDF احترافي بالمخططات</option><option value="preview">معاينة فقط</option></select></label></div></details><div class="cv-dialog-actions"><button type="button" id="cvReloadProfile">النسخة المحفوظة</button><button type="submit" id="cvProfileSave">حفظ</button><button type="submit" id="cvProfileSaveGenerate" data-save-generate class="cv-primary">حفظ وتوليد Word</button></div></div>
    </form></div>`;
}

function fillEditor(profile) {
  const form = byId('cvProfileForm');
  form.querySelectorAll('[data-profile-field]').forEach(input => { input.value = profile[input.dataset.profileField] || ''; });
  PROFILE_SECTIONS.forEach(section => {
    const element = form.querySelector(`[data-profile-section="${section.key}"]`);
    element.querySelector('.cv-edit-entries').innerHTML = (profile[section.key] || []).map(entry => entryHtml(section, entry)).join('');
    element.querySelector('[data-section-count]').textContent = `(${(profile[section.key] || []).length})`;
    if (profile[section.key]?.length) element.open = true;
  });
  syncChoices(form, profile);
}

function showStep(index, scroll = true) {
  if (!editing) return;
  editing.step = Math.max(0, Math.min(EDITOR_STEPS.length - 1, index));
  const form = byId('cvProfileForm');
  form.querySelectorAll('[data-editor-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.editorPanel) !== editing.step; });
  form.querySelectorAll('[data-editor-step]').forEach(button => { if (Number(button.dataset.editorStep) === editing.step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
  form.querySelector('[data-step-back]').disabled = editing.step === 0;
  form.querySelector('[data-step-next]').disabled = editing.step === EDITOR_STEPS.length - 1;
  byId('cvStepStatus').textContent = `الخطوة ${String(editing.step + 1).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit])} من ٤`;
  if (scroll) form.querySelector(`[data-editor-panel="${editing.step}"]`).scrollTo({ top: 0, behavior: 'smooth' });
}

function replaceEntries(key, rows) {
  const section = PROFILE_SECTIONS.find(section => section.key === key);
  const wrapper = byId('cvProfileForm').querySelector(`[data-profile-section="${key}"]`);
  wrapper.querySelector('.cv-edit-entries').innerHTML = rows.map(row => entryHtml(section, row)).join('');
  wrapper.querySelector('[data-section-count]').textContent = `(${rows.length})`;
  syncChoices(byId('cvProfileForm'), rawForm());
}

async function openEditor(id) {
  if (editing?.saving) return;
  const members = getCvStudioFacultyRowsInScope('all', getCvStudioSelectedDepartmentValue());
  const target = id || (members.some(member => String(member.id) === getLoggedInEmployeeId()) ? getLoggedInEmployeeId() : String(members[0]?.id || ''));
  const member = getCvStudioMemberRecord(target, 'all');
  if (!member) return;
  const requestId = ++editorRequestId;
  const alreadyOpen = !byId('cvStudioResults')?.classList.contains('hidden') && cvStudioReport?.members.some(bundle => String(bundle.member.id) === target);
  if (!alreadyOpen && !await confirmMembers([target])) return;
  if (requestId !== editorRequestId) return;
  try { await load([target], true, { isCurrent: () => requestId === editorRequestId }); } catch (error) { if (error.name !== 'CancelledError') message(error.message, true); return; }
  if (requestId !== editorRequestId) return;
  if (editing) closeEditor();
  returnFocus = document.activeElement;
  editing = { id: target, member, etag: profiles.get(target)?.etag || '', saving: false, step: 0, removedChoices: new Map() };
  const modal = document.createElement('div'); modal.id = 'cvProfileModal'; modal.className = 'modal active';
  modal.innerHTML = editorHtml(member, getProfile(target)); document.body.appendChild(modal);
  document.body.classList.add('cv-editor-open');
  byId('cvEditorMode').value = options().mode;
  byId('cvEditorOutput').onchange = () => {
    const label = { word: 'Word', pdf: 'PDF', preview: 'المعاينة' }[byId('cvEditorOutput').value];
    byId('cvEditorOutputLabel').textContent = `إعدادات الملف: ${label}`;
    byId('cvProfileSaveGenerate').textContent = `حفظ وتوليد ${label}`;
  };
  syncChoices(byId('cvProfileForm'), getProfile(target));
  try { if (localStorage.getItem(draftKey(target))) byId('cvRestoreDraft').classList.remove('hidden'); } catch { /* Optional local draft. */ }
  modal.addEventListener('input', event => {
    const input = event.target;
    if (input.matches('[data-choice-search]')) { filterChoices(input.closest('[data-choice-section]'), input.value); return; }
    if (input.matches('[data-choice-years]')) {
      const section = input.closest('[data-choice-section]').dataset.choiceSection;
      const rows = byId('cvProfileForm').querySelector(`[data-profile-section="${section}"] .cv-edit-entries`);
      const row = [...rows.children].find(row => row.querySelector('[data-entry-field="domain"]').value === input.dataset.choiceYears);
      if (row) row.querySelector('[data-entry-field="years"]').value = input.value;
      storeDraft(); return;
    }
    if (input.matches('[data-profile-field],[data-entry-field]')) { syncChoices(byId('cvProfileForm'), rawForm()); storeDraft(); }
  });
  modal.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-choice-value]')) {
      const section = input.closest('[data-choice-section]').dataset.choiceSection;
      const value = input.dataset.choiceValue, identity = CHOICE_IDENTITIES[section];
      const current = rawForm()[section], cacheKey = `${section}:${value}`;
      if (!input.checked) editing.removedChoices.set(cacheKey, current.filter(row => row[identity] === value));
      const certificate = CERTIFICATE_CHOICES.find(row => row.title === value);
      const cached = editing.removedChoices.get(cacheKey);
      const rows = input.checked && cached?.length && !current.some(row => row[identity] === value)
        ? [...current, ...cached]
        : chooseEntry(current, identity, value, input.checked, section === 'certifications' ? { domain: certificate.domain, kind: certificate.kind } : {});
      if (rows.length > 100) { input.checked = false; byId('cvEditorError').textContent = 'الحد الأعلى ١٠٠ سجل في المحور.'; return; }
      replaceEntries(section, rows); storeDraft();
    }
    if (input.matches('[data-interest-choice]')) {
      const textarea = modal.querySelector('[data-profile-field="researchInterests"]');
      textarea.value = chooseInterest(textarea.value, input.dataset.interestChoice, input.checked);
      storeDraft();
    }
  });
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-close-editor]')) closeEditor();
    const step = event.target.closest('[data-editor-step]');
    if (step) showStep(Number(step.dataset.editorStep));
    if (event.target.closest('[data-step-back]')) showStep(editing.step - 1);
    if (event.target.closest('[data-step-next]')) showStep(editing.step + 1);
    if (event.target.closest('[data-add-certificate]')) {
      const domain = byId('cvCertificateDomain').value;
      if (!domain) { byId('cvEditorError').textContent = 'اختر مجال الشهادة أولًا، ثم أكمل اسمها كما في الوثيقة.'; return; }
      const rows = rawForm().certifications;
      if (rows.length >= 100) { byId('cvEditorError').textContent = 'الحد الأعلى ١٠٠ شهادة.'; return; }
      replaceEntries('certifications', [...rows, { domain }]);
      const wrapper = modal.querySelector('[data-profile-section="certifications"]');
      wrapper.querySelector('.cv-entry-detail').open = true;
      wrapper.querySelector('.cv-edit-entry:last-child input').focus(); storeDraft();
    }
    const add = event.target.closest('[data-add-entry]');
    if (add) {
      const section = PROFILE_SECTIONS.find(section => section.key === add.dataset.addEntry);
      const wrapper = add.closest('[data-profile-section]');
      if (wrapper.querySelectorAll('.cv-edit-entry').length >= 100) { byId('cvEditorError').textContent = 'الحد الأعلى ١٠٠ سجل في المحور.'; return; }
      wrapper.querySelector('.cv-edit-entries').insertAdjacentHTML('beforeend', entryHtml(section));
      wrapper.querySelector('[data-section-count]').textContent = `(${wrapper.querySelectorAll('.cv-edit-entry').length})`;
      const detail = wrapper.querySelector('.cv-entry-detail'); if (detail) detail.open = true;
      wrapper.querySelector('.cv-edit-entry:last-child input')?.focus(); storeDraft();
    }
    const move = event.target.closest('[data-move-entry]');
    if (move) {
      const row = move.closest('.cv-edit-entry');
      if (move.dataset.moveEntry === 'up' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
      if (move.dataset.moveEntry === 'down' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
      storeDraft();
    }
    const remove = event.target.closest('[data-remove-entry]');
    if (remove) { const wrapper = remove.closest('[data-profile-section]'); remove.closest('.cv-edit-entry').remove(); wrapper.querySelector('[data-section-count]').textContent = `(${wrapper.querySelectorAll('.cv-edit-entry').length})`; syncChoices(byId('cvProfileForm'), rawForm()); storeDraft(); }
  });
  byId('cvSuggestBiography').onclick = () => {
    byId('cvBiographyDraft').value = draftBiography(rawForm(), editing.member, context().university);
    byId('cvBiographySuggestion').hidden = false;
    byId('cvBiographyDraft').focus();
  };
  byId('cvApplyBiography').onclick = () => {
    modal.querySelector('[data-profile-field="biography"]').value = byId('cvBiographyDraft').value;
    byId('cvBiographySuggestion').hidden = true; storeDraft();
  };
  byId('cvRestoreDraft').onclick = () => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey(target)));
      const profile = normalizeProfile(draft.profile);
      if (draft.baseEtag !== editing.etag) {
        byId('cvEditorError').textContent = 'المسودة أقدم من النسخة المحفوظة. نزّل نسخة من بياناتها أولًا إذا أردت مقارنتها؛ لن تُستبدل النسخة الحالية تلقائيًا.';
        download(new Blob([JSON.stringify({ employeeId: target, profile }, null, 2)], { type: 'application/json' }), `مسودة-السيرة-${target}.json`);
        return;
      }
      fillEditor(profile); byId('cvEditorSaveState').textContent = 'تمت استعادة المسودة؛ لم تُحفظ على الموقع بعد.';
    } catch (error) { byId('cvEditorError').textContent = `تعذر استعادة المسودة: ${error.message}`; }
  };
  byId('cvProfileBackup').onclick = () => {
    try { download(new Blob([JSON.stringify({ format: 'academic-cv-v1', employeeId: target, profile: normalizeProfile(rawForm()) }, null, 2)], { type: 'application/json' }), `بيانات-السيرة-${target}.json`); }
    catch (error) { byId('cvEditorError').textContent = error.message; }
  };
  byId('cvProfileImport').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 250000) throw new Error('حجم نسخة البيانات أكبر من الحد المسموح.');
      const backup = JSON.parse(await file.text());
      if (backup.employeeId && String(backup.employeeId) !== target) throw new Error('نسخة البيانات تخص عضوًا آخر.');
      fillEditor(normalizeProfile(backup.profile || backup)); storeDraft();
      byId('cvEditorError').textContent = '';
    } catch (error) { byId('cvEditorError').textContent = `تعذر الاستيراد: ${error.message}`; }
    event.target.value = '';
  };
  byId('cvReloadProfile').onclick = async () => {
    if (editing.saving) return;
    storeDraft();
    try { await load([target], true); editing.etag = profiles.get(target)?.etag || ''; fillEditor(getProfile(target)); byId('cvEditorError').textContent = ''; byId('cvEditorSaveState').textContent = 'تم تحميل النسخة المحفوظة. مسودتك السابقة محفوظة على هذا الجهاز.'; }
    catch (error) { byId('cvEditorError').textContent = error.message; }
  };
  byId('cvProfileForm').onsubmit = saveEditor;
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeEditor(); }
    if (event.key === 'Tab') {
      const focusable = [...modal.querySelectorAll('button,input,textarea,select,summary')].filter(element => !element.disabled && element.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  modal.querySelector('[data-profile-field]')?.focus();
}

function closeEditor() {
  if (editing?.saving) return;
  byId('cvProfileModal')?.remove(); editing = null;
  document.body.classList.remove('cv-editor-open'); returnFocus?.focus();
}

function showSavedMember(id, mode) {
  const bundle = buildCvStudioMemberBundle(id, 'all');
  if (!bundle) throw new Error('تعذر جمع سجلات العضو للتوليد. بياناتك محفوظة ويمكن إعادة المحاولة.');
  byId('cvStudioMode').value = mode;
  byId('cvStudioDepartmentFilter').value = bundle.member.department || 'all';
  renderCvStudioMemberPicker(true);
  const checkboxes = [...byId('cvStudioMemberSelect').querySelectorAll('.cv-studio-member-options input[type="checkbox"]')];
  checkboxes.forEach(checkbox => { checkbox.checked = checkbox.value === String(id); });
  checkboxes.find(checkbox => checkbox.checked)?.dispatchEvent(new Event('change', { bubbles: true }));
  const yearLabel = getCvStudioYearLabel('all');
  cvStudioReport = {
    year: 'all', yearLabel, department: bundle.member.department || 'all', departmentLabel: bundle.member.department || 'الأعضاء', members: [bundle],
    generatedAt: new Date().toISOString(), caption: `السيرة الذاتية | ${bundle.member.name}`,
    filenameBase: analyticsStudioSafeFileName(`السيرة-الذاتية-${bundle.member.name}`)
  };
  renderCvStudioResults();
}

function validateEditor() {
  const invalid = [...byId('cvProfileForm').querySelectorAll('input,textarea,select')].find(input => !input.disabled && !input.checkValidity());
  if (!invalid) return true;
  const panel = invalid.closest('[data-editor-panel]');
  if (panel) showStep(Number(panel.dataset.editorPanel));
  let ancestor = invalid.parentElement;
  while (ancestor && ancestor !== byId('cvProfileForm')) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
  byId('cvEditorError').textContent = invalid.validity.valueMissing ? 'أدخل كلمة مرور الصلاحيات لحفظ سيرة عضو آخر.' : 'راجع قيمة الحقل المحدد، أو اتركه فارغًا؛ حقول استكمال السيرة اختيارية.';
  invalid.reportValidity(); invalid.focus(); return false;
}

async function saveEditor(event) {
  event.preventDefault();
  if (editing?.saving) return;
  if (!validateEditor()) return;
  const state = editing;
  const button = byId('cvProfileSave'), errorLabel = byId('cvEditorError');
  const generate = !!event.submitter?.hasAttribute('data-save-generate');
  const output = byId('cvEditorOutput').value, mode = byId('cvEditorMode').value;
  let confirmed = false;
  try {
    const profile = normalizeProfile(rawForm());
    state.saving = true;
    byId('cvProfileModal').querySelectorAll('input,textarea,select,button').forEach(element => { element.disabled = true; });
    button.disabled = true; button.textContent = 'جارٍ الحفظ…'; errorLabel.textContent = '';
    const result = await api('', { action: 'save', employeeId: state.id, profile, expectedEtag: state.etag, privilegePassword: byId('cvEditorPrivilege')?.value || '' });
    profiles.set(state.id, result); state.etag = result.etag;
    confirmed = true;
    try { localStorage.removeItem(draftKey(state.id)); } catch { /* Optional local draft. */ }
    byId('cvRestoreDraft').classList.add('hidden');
    byId('cvEditorSaveState').textContent = 'تم حفظ السيرة على الموقع. ستظهر من الأجهزة الأخرى بعد تسجيل الدخول.';
    byId('cvEditorPrivilege') && (byId('cvEditorPrivilege').value = '');
    if (cvStudioReport) renderCvStudioResults();
    message('تم حفظ البيانات الأكاديمية وتحديث المعاينة.');
  } catch (error) { errorLabel.textContent = error.message; storeDraft(); }
  finally {
    state.saving = false;
    byId('cvProfileModal').querySelectorAll('input,textarea,select,button').forEach(element => { element.disabled = false; });
    syncChoices(byId('cvProfileForm'), rawForm()); showStep(state.step, false);
    button.textContent = 'حفظ';
  }
  if (confirmed && generate) {
    try {
      showSavedMember(state.id, mode);
      closeEditor();
      byId('cvStudioResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (output === 'word') await exportWord(state.id, true);
      if (output === 'pdf') await exportPdf(state.id);
      if (output === 'preview') message('تم الحفظ الدائم وتوليد معاينة السيرة من جميع سنوات النشاط.');
    } catch (error) { message(`تم حفظ البيانات، لكن تعذر توليد الملف: ${error.message}`, true); }
  }
}

async function setup() {
  if (initialized) return;
  initialized = true;
  byId('cvStudioEditProfile')?.addEventListener('click', () => openEditor(getLoggedInEmployeeId()));
  byId('cvStudioActivate')?.addEventListener('click', openSession);
  byId('cvStudioExportWordBtn')?.addEventListener('click', () => exportWord());
  ['cvStudioMode', 'cvStudioPersonal'].forEach(id => byId(id)?.addEventListener('change', () => { if (cvStudioReport) renderCvStudioResults(); }));
  byId('cvStudioMembersContainer')?.addEventListener('click', event => {
    const button = event.target.closest('[data-cv-action]'); if (!button) return;
    if (button.dataset.cvAction === 'edit') openEditor(button.dataset.cvId);
    if (button.dataset.cvAction === 'pdf') exportPdf(button.dataset.cvId);
    if (button.dataset.cvAction === 'word') exportWord(button.dataset.cvId);
  });
  document.addEventListener('error', event => { if (event.target.matches?.('.cv-portrait')) event.target.remove(); }, true);
  // A read renews an expired session and resumes after password confirmation.
  // A separate session probe would delay the member picker on a slow connection.
  if (sessionReady) message('الحفظ الدائم متصل.');
  else message('ستُجدّد جلسة السير عند الحاجة إلى فتح بياناتها المحفوظة.');
}

window.AcademicCv = { setup, signIn, signOut, load, getProfile, renderMember, renderSummary, exportPdf, exportWord, exportCsv, confirmMembers, cancelConfirmation };
