import { PROFILE_FIELDS, PROFILE_SECTIONS } from './cv-schema.mjs';
import { html } from './cv-document.mjs';
import { EXPERIENCE_GROUPS, SKILL_GROUPS, CERTIFICATE_CHOICES, CERTIFICATE_DOMAINS, LANGUAGES, FIELD_CHOICES, researchChoices, searchKey } from './cv-choices.mjs';

export const EDITOR_STEPS = ['التعريف والمؤهلات', 'الخبرة والمهارات', 'الشهادات والتطوير', 'الروابط وبقية الإنجازات'];
const MOBILE_STEPS = ['التعريف', 'الخبرة', 'الشهادات', 'الإنجازات'];
export const CHOICE_IDENTITIES = { expertise: 'domain', skills: 'name', certifications: 'title', languages: 'name' };
const choiceGroups = section => section === 'expertise' ? EXPERIENCE_GROUPS : section === 'skills' ? SKILL_GROUPS : section === 'certifications'
  ? [{ name: 'شهادات واختبارات شائعة', options: CERTIFICATE_CHOICES.map(row => row.title) }]
  : [{ name: 'اللغات', options: LANGUAGES }];

function fieldHtml([key, label, max, type], value, attributes = '') {
  return `<label class="${max > 900 ? 'cv-field-wide' : ''}"><span>${html(label)}</span>${max > 900
    ? `<textarea rows="3" maxlength="${max}" ${attributes}>${html(value || '')}</textarea>`
    : `<input type="${type || 'text'}" maxlength="${max}" ${attributes} value="${html(value || '')}">`}</label>`;
}

export function entryHtml(section, entry = {}) {
  return `<div class="cv-edit-entry"><div class="cv-entry-fields">${[...section.fields, ['source', 'المصدر أو مرجع الإثبات (داخلي)', 1200]].map(([key, label, max]) => fieldHtml(
    [key, `${label}${section.required.includes(key) ? ' *' : ''}`, max, key === 'url' ? 'url' : 'text'], entry[key],
    `data-entry-field="${key}" ${section.required.includes(key) ? 'required' : ''} ${FIELD_CHOICES[`${section.key}.${key}`] ? `list="cvChoices-${section.key}-${key}"` : ''} ${section.key === 'expertise' && key === 'years' ? 'inputmode="decimal" placeholder="مثال: 5 أو 0.5"' : ''}`
  )).join('')}</div><div class="cv-entry-actions"><button type="button" data-move-entry="up" aria-label="نقل السجل لأعلى">نقل لأعلى</button><button type="button" data-move-entry="down" aria-label="نقل السجل لأسفل">نقل لأسفل</button><button type="button" class="cv-remove-entry" data-remove-entry aria-label="حذف هذا السجل من المسودة">حذف السجل</button></div></div>`;
}

function choicesHtml(section, entries) {
  const identity = CHOICE_IDENTITIES[section];
  const years = section === 'expertise';
  return `<div class="cv-choice-picker" data-choice-section="${section}"><label class="cv-choice-search-label">ابحث في القائمة<input type="search" data-choice-search placeholder="اكتب لتصفية الخيارات…" autocomplete="off"></label>
    <p class="cv-choice-help">${years ? 'حدد المجالات التي لديك خبرة فعلية فيها، وأدخل عدد السنوات بجوار كل مجال. يمكن إدخال 0.5 لنصف سنة. الفترات قد تتداخل بين المجالات، ولذلك لا تُجمع مددها.' : section === 'certifications' ? 'اختر الشهادات التي حصلت عليها فقط. أضف اسم الإصدار أو المستوى والجهة والتاريخ في التفاصيل إن توفرت.' : 'اختر بندًا واحدًا أو أكثر. يمكنك إضافة بند غير موجود وتعديل تفاصيل الاختيارات.'}</p>
    ${choiceGroups(section).map((group, index) => `<details class="cv-choice-group" ${index === 0 || entries.some(row => group.options.includes(row[identity])) ? 'open' : ''}><summary>${html(group.name)}</summary><div class="cv-choice-options">${group.options.map(value => {
      const selected = entries.find(row => row[identity] === value);
      return `<div class="cv-choice-option" data-choice-row="${html(value)}"><label class="cv-choice-check"><input type="checkbox" data-choice-value="${html(value)}" ${selected ? 'checked' : ''}><span>${html(value)}</span></label>${years ? `<label class="cv-choice-duration"><span>عدد السنوات</span><input type="text" inputmode="decimal" maxlength="80" data-choice-years="${html(value)}" aria-label="سنوات الخبرة في ${html(value)}" placeholder="السنوات" value="${html(selected?.years || '')}" ${selected ? 'required' : 'disabled'}></label>` : ''}</div>`;
    }).join('')}</div></details>`).join('')}
    <p class="cv-choice-empty" hidden>لا توجد خيارات مطابقة. يمكنك إضافة خيار غير موجود أسفل القائمة.</p></div>`;
}

function sectionHtml(key, profile) {
  const section = PROFILE_SECTIONS.find(row => row.key === key);
  const quick = !!CHOICE_IDENTITIES[key];
  const entries = profile[key] || [];
  return `<details class="cv-editor-section" data-profile-section="${key}" ${quick || key === 'education' || entries.length ? 'open' : ''}><summary>${html(section.title)} <span data-section-count>(${entries.length})</span></summary>
    ${key === 'publications' ? '<p>سجلات النشاط تُضاف تلقائيًا. استكمل بيانات العمل الموجود باستخدام عنوانه وسنته ووعاء نشره نفسه لتجنب التكرار.</p>' : ''}
    ${quick ? choicesHtml(key, entries) : ''}
    ${key === 'certifications' ? `<div class="cv-certificate-domain"><label>أو ابدأ بمجال الشهادة<select id="cvCertificateDomain"><option value="">اختر المجال…</option>${CERTIFICATE_DOMAINS.map(value => `<option>${html(value)}</option>`).join('')}</select></label><button type="button" data-add-certificate>إضافة شهادة في هذا المجال</button></div>` : ''}
    ${quick ? `<details class="cv-entry-detail"><summary>تفاصيل الاختيارات والبنود الأخرى</summary>` : ''}
    <div class="cv-edit-entries">${entries.map(entry => entryHtml(section, entry)).join('')}</div>
    ${quick ? '</details>' : ''}
    <button type="button" class="cv-add-entry" data-add-entry="${key}">${quick ? 'إضافة خيار غير موجود' : 'إضافة سجل'}</button></details>`;
}

export function editorStepsHtml(member, profile) {
  const fields = keys => `<div class="cv-basic-fields">${PROFILE_FIELDS.filter(([key]) => keys.includes(key)).map(field => fieldHtml(field, profile[field[0]], `data-profile-field="${field[0]}"`)).join('')}</div>`;
  const sections = keys => keys.map(key => sectionHtml(key, profile)).join('');
  const interests = researchChoices(member.department);
  const panels = [
    `${fields(['displayName', 'englishName', 'generalSpecialization', 'specialization', 'biography'])}<div class="cv-bio-tools"><button type="button" id="cvSuggestBiography">اقتراح نبذة من البيانات المدخلة</button><div id="cvBiographySuggestion" hidden><p class="cv-choice-help">راجع الصياغة، ثم اعتمدها في حقل النبذة. لا تُحفظ إلا عند حفظ السيرة.</p><textarea id="cvBiographyDraft" rows="4" maxlength="4000"></textarea><button type="button" id="cvApplyBiography">اعتماد هذه النبذة</button></div></div>${sections(['education', 'appointments'])}`,
    `${sections(['expertise', 'skills'])}<details class="cv-editor-section" open><summary>الاهتمامات البحثية</summary><div class="cv-interest-choices">${interests.map(value => `<label class="cv-choice-check"><input type="checkbox" data-interest-choice="${html(value)}"><span>${html(value)}</span></label>`).join('')}</div>${fields(['researchInterests'])}</details>${sections(['languages'])}`,
    sections(['certifications', 'training', 'licenses']),
    `${fields(['website', 'orcid', 'scholar', 'scopus', 'photo', 'teachingStatement'])}${sections(['committees', 'administration', 'service', 'teaching', 'publications', 'grants', 'awards'])}<label class="cv-field-wide cv-internal-notes">ملاحظات المصادر (داخلية)<textarea rows="3" data-profile-field="notes" maxlength="4000">${html(profile.notes)}</textarea></label>`
  ];
  return `<nav class="cv-step-nav" aria-label="مراحل استكمال السيرة">${EDITOR_STEPS.map((label, index) => `<button type="button" data-editor-step="${index}" aria-label="${html(label)}" ${index === 0 ? 'aria-current="step"' : ''}><b>${index + 1}</b><span class="cv-step-full">${html(label)}</span><span class="cv-step-short" aria-hidden="true">${MOBILE_STEPS[index]}</span></button>`).join('')}</nav>
    ${panels.map((content, index) => `<section class="cv-step-panel" data-editor-panel="${index}" ${index ? 'hidden' : ''}><h4>${html(EDITOR_STEPS[index])}</h4>${content}</section>`).join('')}
    ${Object.entries(FIELD_CHOICES).map(([key, values]) => `<datalist id="cvChoices-${key.replace('.', '-')}">${values.map(value => `<option value="${html(value)}"></option>`).join('')}</datalist>`).join('')}`;
}

export function syncChoices(form, profile) {
  form.querySelectorAll('[data-choice-section]').forEach(picker => {
    const section = picker.dataset.choiceSection, identity = CHOICE_IDENTITIES[section];
    picker.querySelectorAll('[data-choice-value]').forEach(checkbox => {
      const row = (profile[section] || []).find(row => row[identity] === checkbox.dataset.choiceValue);
      checkbox.checked = !!row;
      const years = checkbox.closest('.cv-choice-option').querySelector('[data-choice-years]');
      if (years) { years.disabled = !row; years.required = !!row; years.value = row?.years || ''; }
    });
  });
  const interests = String(profile.researchInterests || '').split('\n').map(row => row.trim());
  form.querySelectorAll('[data-interest-choice]').forEach(checkbox => { checkbox.checked = interests.includes(checkbox.dataset.interestChoice); });
}

export function filterChoices(picker, query) {
  const key = searchKey(query);
  let visible = 0;
  picker.querySelectorAll('.cv-choice-group').forEach(group => {
    let groupVisible = 0;
    group.querySelectorAll('[data-choice-row]').forEach(row => { row.hidden = !searchKey(row.dataset.choiceRow).includes(key); if (!row.hidden) groupVisible++; });
    group.hidden = !groupVisible; visible += groupVisible;
    if (key && groupVisible) group.open = true;
  });
  picker.querySelector('.cv-choice-empty').hidden = !!visible;
}
