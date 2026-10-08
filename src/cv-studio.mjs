import { PROFILE_FIELDS, PROFILE_SECTIONS, normalizeProfile, profileChecklist } from './cv-schema.mjs';
import { buildCvDocument, renderCvDocument, html } from './cv-document.mjs';
import printStyles from '../cv-studio.css';

const ENDPOINT = '/.netlify/functions/cv-profiles';
const profiles = new Map();
let initialized = false;
let editing = null;
let sessionReady = false;
let returnFocus = null;
const byId = id => document.getElementById(id);
const context = () => ({ university: config.university_name || 'جامعة الطائف', college: config.college_name || 'كلية الشريعة', formatDate, yearLabel: formatCustomStatsYearLabel });
const options = () => ({ mode: byId('cvStudioMode')?.value || 'public', personal: !!byId('cvStudioPersonal')?.checked, generatedAt: cvStudioReport?.generatedAt });
const message = (text, error = false) => {
  const status = byId('cvStudioStorageStatus');
  if (status) { status.textContent = text; status.classList.toggle('is-error', error); }
  byId('cvStudioActivate')?.classList.toggle('hidden', sessionReady);
};

async function api(path = '', body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${ENDPOINT}${path}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    let data;
    try { data = await response.json(); } catch { throw new Error('خدمة حفظ السير غير متاحة. أعد المحاولة بعد لحظات.'); }
    if (!response.ok) {
      if (response.status === 401) { sessionReady = false; message(data.message, true); }
      const error = new Error(data.message || 'تعذر الاتصال بحفظ السير.'); error.status = response.status; throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('انتهت مهلة الاتصال. لم يتم تأكيد الحفظ؛ احتفظ بالمسودة وأعد تحميل النسخة المحفوظة قبل تكرار الحفظ.');
    throw error;
  } finally { clearTimeout(timeout); }
}

async function signIn(employeeId, password) {
  try {
    await api('', { action: 'login', employeeId, password });
    sessionReady = true;
    profiles.clear();
    message('الحفظ الدائم متصل. بيانات السيرة مرتبطة بالعضو وتبقى محفوظة بين السنوات والأجهزة.');
    return true;
  } catch (error) { sessionReady = false; message(error.message, true); return false; }
}

async function signOut() {
  sessionReady = false;
  profiles.clear();
  cvStudioClearReport();
  if (editing) closeEditor();
  byId('cvSessionModal')?.remove();
  try { await api('', { action: 'logout' }); } catch { /* The current app still signs out when offline. */ }
  message('أعد تسجيل الدخول لتفعيل بيانات السيرة المحفوظة.');
}

async function load(ids, force = false) {
  const required = [...new Set(ids.map(String))].filter(id => force || !profiles.has(id));
  if (!required.length) return;
  for (let offset = 0; offset < required.length; offset += 80) {
    const result = await api(`?ids=${encodeURIComponent(required.slice(offset, offset + 80).join(','))}`);
    result.records.forEach(record => profiles.set(record.employeeId, record));
  }
  sessionReady = true;
  message('الحفظ الدائم متصل. البيانات التعريفية تراكمية، ومرشح السنة يحدد سجلات النشاط فقط.');
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
  const completeProfiles = report.members.filter(bundle => profileChecklist(getProfile(bundle.member.id)).every(([, present]) => present)).length;
  return [
    { value: report.members.length.toLocaleString('ar-SA'), label: 'الأعضاء المختارون' },
    { value: options().mode === 'internal' ? 'تقرير داخلي' : options().mode === 'short' ? 'سيرة مختصرة' : 'سيرة كاملة للنشر', label: 'نوع الملف' },
    { value: report.yearLabel, label: 'نطاق سجلات النشاط' },
    { value: completeProfiles.toLocaleString('ar-SA'), label: 'سير استُكملت حقولها التعريفية الستة' }
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

function exportPdf(id) {
  const documents = selectedDocuments(id);
  if (!documents.length) return;
  const popup = window.open('', '_blank');
  if (!popup) { alert('اسمح بفتح نافذة الطباعة لتنزيل PDF.'); return; }
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(fileName(documents))}</title><style>${printStyles}</style></head><body class="cv-print-body"><div class="cv-print-hint">اختر «حفظ بصيغة PDF» من نافذة الطباعة. النص والروابط قابلان للنسخ والبحث.</div>${documents.map(renderCvDocument).join('')}</body></html>`);
  popup.addEventListener('load', async () => {
    await popup.document.fonts.ready;
    await Promise.all([...popup.document.images].map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = () => { img.remove(); resolve(); }; setTimeout(resolve, 4000); })));
    popup.focus(); popup.print();
  }, { once: true });
  popup.document.close();
}

async function exportWord(id) {
  const documents = selectedDocuments(id);
  if (!documents.length) return;
  try {
    message('جارٍ إعداد ملف Word…');
    const { createWordBlob } = await import('/assets/cv-word.js');
    download(await createWordBlob(documents), `${fileName(documents)}.docx`);
    message('تم إعداد Word بالبيانات الظاهرة في المعاينة.');
  } catch (error) { message(`تعذر إعداد Word: ${error.message}`, true); }
}

function exportCsv() {
  const documents = selectedDocuments();
  const rows = [['العضو', 'المحور', 'العنوان', 'التفاصيل', 'رابط الوصول', 'المصدر']];
  documents.forEach(doc => {
    doc.profileItems.forEach(([label, value]) => rows.push([doc.name, 'التعريف الأكاديمي', label, value, '', '']));
    doc.links.forEach(([label, url]) => rows.push([doc.name, 'الروابط العلمية', label, '', url, '']));
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
  let modal = byId('cvSessionModal');
  if (modal) { modal.querySelector('input').focus(); return; }
  modal = document.createElement('div');
  modal.id = 'cvSessionModal'; modal.className = 'modal active';
  modal.innerHTML = `<div class="modal-content cv-session-dialog" role="dialog" aria-modal="true" aria-labelledby="cvSessionTitle"><h3 id="cvSessionTitle">تفعيل حفظ السير</h3><p>أدخل كلمة مرور الدخول الحالية لربط جلستك ببيانات السير المحفوظة.</p><form><label for="cvSessionPassword">كلمة مرور الدخول</label><input id="cvSessionPassword" class="form-input" type="password" autocomplete="current-password" required><p class="cv-form-error" role="alert"></p><div class="cv-dialog-actions"><button type="button" data-close>إلغاء</button><button type="submit" class="cv-primary">تفعيل</button></div></form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').onclick = () => modal.remove();
  modal.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const button = modal.querySelector('[type=submit]'); button.disabled = true;
    const ok = await signIn(getLoggedInEmployeeId(), byId('cvSessionPassword').value);
    button.disabled = false;
    if (ok) { modal.remove(); if (cvStudioReport) { await load(cvStudioReport.members.map(bundle => String(bundle.member.id))); renderCvStudioResults(); } }
    else modal.querySelector('.cv-form-error').textContent = byId('cvStudioStorageStatus').textContent;
  };
  modal.querySelector('input').focus();
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

function entryHtml(section, entry = {}) {
  return `<div class="cv-edit-entry"><div class="cv-entry-fields">${[...section.fields, ['source', 'المصدر أو مرجع الإثبات (داخلي)', 1200]].map(([key, label, max]) => `<label><span>${html(label)}${section.required.includes(key) ? ' <b class="cv-required">*</b>' : ''}</span><${max > 900 ? 'textarea' : 'input'} ${max > 900 ? 'rows="2"' : `type="${key === 'url' ? 'url' : 'text'}" value="${html(entry[key] || '')}"`} data-entry-field="${key}" maxlength="${max}" ${section.required.includes(key) ? 'required' : ''}>${max > 900 ? html(entry[key] || '') : ''}${max > 900 ? '</textarea>' : ''}</label>`).join('')}</div><div class="cv-entry-actions"><button type="button" data-move-entry="up" aria-label="نقل السجل لأعلى">نقل لأعلى</button><button type="button" data-move-entry="down" aria-label="نقل السجل لأسفل">نقل لأسفل</button><button type="button" class="cv-remove-entry" data-remove-entry aria-label="حذف هذا السجل من المسودة">حذف السجل</button></div></div>`;
}

function editorHtml(member, profile) {
  return `<div class="modal-content cv-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="cvEditorTitle">
    <div class="cv-editor-header"><div><p>الملف الأكاديمي الدائم</p><h3 id="cvEditorTitle">${html(member.name)}</h3><p>المعلومات هنا مرتبطة بالعضو. أضف البيانات المثبتة واترك ما يحتاج إلى تحقق فارغًا. رتّب السجلات من الأحدث إلى الأقدم؛ ترتيبها هنا هو ترتيبها في السيرة.</p></div><button type="button" data-close-editor aria-label="إغلاق محرر السيرة">×</button></div>
    <div class="cv-editor-import"><button type="button" id="cvRestoreDraft" class="hidden">استعادة مسودة هذا الجهاز</button><button type="button" id="cvProfileBackup">تنزيل نسخة من البيانات</button><label class="cv-file-label">استيراد نسخة بيانات<input type="file" id="cvProfileImport" accept=".json,application/json"></label><p>نسخة البيانات تحفظ الحقول بصيغة JSON لاستعادتها أو نقلها. تنزيل السيرة للنشر متاح بصيغتي PDF وWord.</p></div>
    <form id="cvProfileForm">
      <div class="cv-basic-fields">${PROFILE_FIELDS.map(([key, label, max, type]) => `<label class="${max > 900 ? 'cv-field-wide' : ''}">${html(label)}${max > 900 ? `<textarea rows="4" maxlength="${max}" data-profile-field="${key}">${html(profile[key])}</textarea>` : `<input type="${type || 'text'}" maxlength="${max}" data-profile-field="${key}" value="${html(profile[key])}">`}</label>`).join('')}</div>
      ${PROFILE_SECTIONS.map(section => `<details class="cv-editor-section" data-profile-section="${section.key}" ${section.key === 'education' || profile[section.key].length ? 'open' : ''}><summary>${html(section.title)} <span>(${profile[section.key].length})</span></summary>${section.key === 'publications' ? '<p>الأنشطة المسجلة تُضاف تلقائيًا. لاستكمال بيانات عمل موجود، استخدم عنوانه نفسه وسنته ووعاء نشره؛ تُدمج بياناته دون تكرار. هذه الإضافات لا تغيّر سجلات النشاط أو نقاطها.</p>' : ''}<div class="cv-edit-entries">${profile[section.key].map(entry => entryHtml(section, entry)).join('')}</div><button type="button" class="cv-add-entry" data-add-entry="${section.key}">إضافة سجل</button></details>`).join('')}
      <label class="cv-field-wide cv-internal-notes">ملاحظات المصادر (داخلية)<textarea rows="3" data-profile-field="notes" maxlength="4000">${html(profile.notes)}</textarea></label>
      ${editing.id !== getLoggedInEmployeeId() ? '<label class="cv-privilege-field">كلمة مرور الصلاحيات لحفظ سيرة عضو آخر<input type="password" id="cvEditorPrivilege" autocomplete="off" required></label>' : ''}
      <div class="cv-editor-footer"><div><p id="cvEditorSaveState">${profile.updatedAt ? 'تعرض النسخة المحفوظة. التعديلات تُعتمد بعد الضغط على حفظ.' : 'لم تُضف بيانات تعريفية لهذه السيرة بعد.'}</p><p class="cv-form-error" id="cvEditorError" role="alert"></p></div><div class="cv-dialog-actions"><button type="button" id="cvReloadProfile">تحميل النسخة المحفوظة</button><button type="button" data-close-editor>إغلاق</button><button type="submit" id="cvProfileSave" class="cv-primary">حفظ السيرة</button></div></div>
    </form></div>`;
}

function fillEditor(profile) {
  const form = byId('cvProfileForm');
  form.querySelectorAll('[data-profile-field]').forEach(input => { input.value = profile[input.dataset.profileField] || ''; });
  PROFILE_SECTIONS.forEach(section => {
    const element = form.querySelector(`[data-profile-section="${section.key}"]`);
    element.querySelector('.cv-edit-entries').innerHTML = (profile[section.key] || []).map(entry => entryHtml(section, entry)).join('');
    element.querySelector('summary span').textContent = `(${(profile[section.key] || []).length})`;
    if (profile[section.key]?.length) element.open = true;
  });
}

async function openEditor(id) {
  if (editing?.saving) return;
  if (!sessionReady) { openSession(); return; }
  const members = getCvStudioFacultyRowsInScope(getCvStudioSelectedYearValue(), getCvStudioSelectedDepartmentValue());
  const target = id || (members.some(member => String(member.id) === getLoggedInEmployeeId()) ? getLoggedInEmployeeId() : String(members[0]?.id || ''));
  const member = getCvStudioMemberRecord(target, 'all');
  if (!member) return;
  try { await load([target], true); } catch (error) { message(error.message, true); if (error.status === 401) { sessionReady = false; openSession(); } return; }
  if (editing) closeEditor();
  returnFocus = document.activeElement;
  editing = { id: target, etag: profiles.get(target)?.etag || '', saving: false };
  const modal = document.createElement('div'); modal.id = 'cvProfileModal'; modal.className = 'modal active';
  modal.innerHTML = editorHtml(member, getProfile(target)); document.body.appendChild(modal);
  document.body.classList.add('cv-editor-open');
  try { if (localStorage.getItem(draftKey(target))) byId('cvRestoreDraft').classList.remove('hidden'); } catch { /* Optional local draft. */ }
  modal.addEventListener('input', event => { if (event.target.closest('#cvProfileForm') && event.target.type !== 'password') storeDraft(); });
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-close-editor]')) closeEditor();
    const add = event.target.closest('[data-add-entry]');
    if (add) {
      const section = PROFILE_SECTIONS.find(section => section.key === add.dataset.addEntry);
      const wrapper = add.closest('details');
      if (wrapper.querySelectorAll('.cv-edit-entry').length >= 100) { byId('cvEditorError').textContent = 'الحد الأعلى ١٠٠ سجل في المحور.'; return; }
      wrapper.querySelector('.cv-edit-entries').insertAdjacentHTML('beforeend', entryHtml(section));
      wrapper.querySelector('summary span').textContent = `(${wrapper.querySelectorAll('.cv-edit-entry').length})`;
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
    if (remove) { const wrapper = remove.closest('details'); remove.closest('.cv-edit-entry').remove(); wrapper.querySelector('summary span').textContent = `(${wrapper.querySelectorAll('.cv-edit-entry').length})`; storeDraft(); }
  });
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
      const focusable = [...modal.querySelectorAll('button,input,textarea,summary')].filter(element => !element.disabled && element.getClientRects().length);
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

async function saveEditor(event) {
  event.preventDefault();
  if (editing?.saving) return;
  const state = editing;
  const button = byId('cvProfileSave'), errorLabel = byId('cvEditorError');
  try {
    const profile = normalizeProfile(rawForm(), { strict: true });
    state.saving = true;
    byId('cvProfileModal').querySelectorAll('input,textarea,button').forEach(element => { element.disabled = true; });
    button.disabled = true; button.textContent = 'جارٍ الحفظ…'; errorLabel.textContent = '';
    const result = await api('', { action: 'save', employeeId: state.id, profile, expectedEtag: state.etag, privilegePassword: byId('cvEditorPrivilege')?.value || '' });
    profiles.set(state.id, result); state.etag = result.etag;
    try { localStorage.removeItem(draftKey(state.id)); } catch { /* Optional local draft. */ }
    byId('cvRestoreDraft').classList.add('hidden');
    byId('cvEditorSaveState').textContent = 'تم حفظ السيرة على الموقع. ستظهر من الأجهزة الأخرى بعد تسجيل الدخول.';
    byId('cvEditorPrivilege') && (byId('cvEditorPrivilege').value = '');
    if (cvStudioReport) renderCvStudioResults();
    message('تم حفظ البيانات الأكاديمية وتحديث المعاينة.');
  } catch (error) { errorLabel.textContent = error.message; storeDraft(); }
  finally {
    state.saving = false;
    byId('cvProfileModal').querySelectorAll('input,textarea,button').forEach(element => { element.disabled = false; });
    button.textContent = 'حفظ السيرة';
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
  try { await api(); sessionReady = true; message('الحفظ الدائم متصل.'); }
  catch (error) { message(error.message, true); }
}

window.AcademicCv = { setup, signIn, signOut, load, getProfile, renderMember, renderSummary, exportPdf, exportWord, exportCsv };
