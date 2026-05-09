// ========================================
// نظام الأنشطة العلمية - كلية الشريعة
// JavaScript Application - النسخة المحدثة
// ========================================

// ========================================
// المتغيرات العامة
// ========================================
let config = {};
let currentYear = null;
let currentDepartment = 'all';
let currentProgram = 'all';
let currentThesis = null;
let currentDetailContext = null;
let currentEditContext = null;
let currentLeaderboard = [];
let showAllLeaderboard = false;
let sheetsDataLoaded = false;
let privilegeActionCallback = null;
let allData = {
    faculty: [],
    students: [],
    theses: [],
    participations: [],
    publications: []  // ملف البحوث المنفصل
};
let data = {
    faculty: [],
    students: [],
    theses: [],
    participations: [],
    publications: []  // ملف البحوث المنفصل
};
let charts = {};
const PRIVILEGE_PASSWORD = '2008';
const KPI_EXCLUDED_RANKS = new Set(['معيد', 'محاضر', 'متعاون', 'مدرس']);
const KPI_EXCLUDED_RANKS_FOR_PHD = new Set(['معيد', 'محاضر', 'متعاون', 'مدرس', 'أستاذ مساعد']);
const localActivityAuditTrail = [];
let publicationStatsState = { records: [], selectedJournal: '', selectedRecords: [] };
let statsCardInteractionsBound = false;
let statsDetailState = null;
let currentThesesView = [];
let analyticsStudioReport = null;
let analyticsStudioChart = null;
let analyticsStudioTeachingRowsCache = null;
let analyticsStudioInitialized = false;
let memberModalState = { memberId: null, selectedYear: 'all', token: 0 };

// بيانات الخطط الدراسية والبرامج
let allPlansData = [];
let courseCodeToPrograms = {};    // رمز المقرر → [{program, degree, key}]
let courseCodeToProgramKeys = {};  // رمز المقرر → Set مفاتيح البرامج (لتحسين الأداء)
let programExclusiveCodes = {};  // "برنامج - درجة" → Set من رموز المقررات الفريدة
let programNonSharedCodes = {};  // "برنامج - درجة" → Set من رموز المقررات غير المشتركة (غير متطلبات جامعية)
let programAvgLoad = {};         // "برنامج - درجة" → متوسط عدد المقررات غير المشتركة التي يأخذها الطالب في السنة
let teachingProgramAggregatesCache = null; // cache لتجميع إحصائيات البرامج من بيانات التدريس

// تحديد مسار البيانات (محلي دائماً - المستودع خاص)
const DATA_BASE_URL = './data';

// ========================================
// دوال التحميل
// ========================================
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// ========================================
// دالة اكتشاف الفاصل تلقائياً
// ========================================
function detectDelimiter(text) {
    const firstLine = text.split('\n')[0];
    
    const delimiters = [
        { char: ';', count: (firstLine.match(/;/g) || []).length },
        { char: ',', count: (firstLine.match(/,/g) || []).length },
        { char: '\t', count: (firstLine.match(/\t/g) || []).length }
    ];
    
    delimiters.sort((a, b) => b.count - a.count);
    
    if (delimiters[0].count > 0) {
        return delimiters[0].char;
    }
    
    return ',';
}

function getCurrentHijriYearNumber() {
    const rawYear = new Date().toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { year: 'numeric' });
    const normalizedYear = normalizeArabicDigits(rawYear).replace(/[^\d]/g, '');
    const parsedYear = parseInt(normalizedYear, 10);
    return Number.isFinite(parsedYear) ? parsedYear : 1447;
}

function normalizeConfiguredYear(value) {
    const normalized = normalizeArabicDigits(String(value ?? '')).trim();
    if (!normalized || normalized.toLowerCase() === 'all') return 'all';
    const parsed = parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : 'all';
}

async function loadCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        
        const delimiter = detectDelimiter(text);
        const delimiterName = delimiter === '\t' ? 'TAB' : delimiter;
        console.log(`📄 تحميل ${url.split('/').pop()} ← الفاصل: "${delimiterName}"`);
        
        const result = Papa.parse(text, { 
            header: true, 
            skipEmptyLines: true,
            delimiter: delimiter
        });
        
        return result.data;
    } catch (error) {
        console.warn(`❌ فشل تحميل ${url}:`, error);
        return [];
    }
}

async function loadConfig() {
    const defaultHijriYear = getCurrentHijriYearNumber();
    try {
        const response = await fetch(`${DATA_BASE_URL}/config.json`);
        config = await response.json();
        const configuredYear = normalizeConfiguredYear(config.current_year);
        currentYear = configuredYear === 'all' ? defaultHijriYear : configuredYear;
        currentDepartment = config.current_department || 'all';

        const availableYears = Array.isArray(config.available_years) ? [...config.available_years] : [];
        if (!availableYears.includes(defaultHijriYear)) {
            availableYears.push(defaultHijriYear);
        }
        config.available_years = availableYears
            .map(y => parseInt(normalizeArabicDigits(String(y)), 10))
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
    } catch (error) {
        console.warn('Using default config');
        config = {
            current_year: defaultHijriYear,
            current_department: 'all',
            available_years: [1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447],
            departments: ["القراءات", "الشريعة", "الأنظمة", "الثقافة الإسلامية"],
            college_name: "كلية الشريعة",
            department_name: "كلية الشريعة",
            university_name: "جامعة الطائف",
            weights: {
                phd_supervision: 10,
                phd_co_supervision: 5,
                masters_supervision: 3,
                masters_co_supervision: 2,
                phd_discussion: 5,
                masters_discussion: 2,
                publication: 15,
                conference_paper: 8,
                workshop_participation: 5,
                seminar_participation: 4,
                event_attendance: 1,
                event_organization: 10,
                external_discussion: 6,
                student_research: 8,
                award: 10,
                patent: 15
            },
            citations_ranges: {
                "أقل من 10": 5,
                "11-20": 15,
                "21-50": 35,
                "51-100": 75,
                "101-200": 150,
                "201-500": 350,
                "أكثر من 500": 600
            }
        };
        if (!config.available_years.includes(defaultHijriYear)) {
            config.available_years.push(defaultHijriYear);
        }
        currentYear = defaultHijriYear;
        currentDepartment = 'all';
    }
}

// ========================================
// تحميل البيانات من Google Sheets (مباشرة)
// ========================================
async function loadFromGoogleSheets() {
    const apiUrl = config.google_sheets_api;
    if (!apiUrl) return false;

    try {
        console.log('📡 جاري تحميل البيانات من Google Sheets...');
        const response = await fetch(`${apiUrl}?action=read`, {
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const sheetsData = await response.json();

        if (sheetsData.error) {
            console.warn('⚠️ خطأ من Apps Script:', sheetsData.error);
            return false;
        }

        // تطبيع القيم القادمة من Google Sheets (خصوصًا التواريخ التي قد تصل بصيغة Date.toString)
        normalizeGoogleSheetsPayload(sheetsData);

        // دمج البيانات من Google Sheets مع البيانات الحالية
        if (sheetsData.faculty && sheetsData.faculty.length > 0) {
            // إضافة أعضاء جدد غير موجودين
            sheetsData.faculty.forEach(newMember => {
                const exists = allData.faculty.some(f =>
                    String(f.id).trim() === String(newMember.id).trim() &&
                    String(f.year).trim() === String(newMember.year).trim()
                );
                if (!exists) allData.faculty.push(newMember);
            });
        }

        if (sheetsData.publications && sheetsData.publications.length > 0) {
            sheetsData.publications.forEach(newPub => {
                const exists = allData.publications.some(p =>
                    p.title === newPub.title && p.authors_ids === newPub.authors_ids
                );
                if (!exists) allData.publications.push(newPub);
            });
        }

        if (sheetsData.theses && sheetsData.theses.length > 0) {
            sheetsData.theses.forEach(newThesis => {
                const exists = allData.theses.some(t =>
                    t.student_name === newThesis.student_name && t.title === newThesis.title
                );
                if (!exists) allData.theses.push(newThesis);
            });
        }

        if (sheetsData.participations && sheetsData.participations.length > 0) {
            sheetsData.participations.forEach(newPart => {
                const exists = allData.participations.some(p =>
                    p.title === newPart.title && p.participant_ids === newPart.participant_ids && p.date === newPart.date
                );
                if (!exists) allData.participations.push(newPart);
            });
        }

        console.log('✅ تم تحميل البيانات من Google Sheets بنجاح');
        sheetsDataLoaded = true;
        return true;
    } catch (error) {
        console.warn('⚠️ تعذر الاتصال بـ Google Sheets:', error.message);
        return false;
    }
}

function normalizeGoogleSheetsPayload(payload) {
    if (!payload || typeof payload !== 'object') return;

    const normalizeRows = (rows, dateFields = []) => {
        if (!Array.isArray(rows)) return;
        rows.forEach(row => {
            if (!row || typeof row !== 'object') return;
            dateFields.forEach(field => {
                if (row[field]) {
                    row[field] = normalizeIncomingDateValue(row[field]);
                }
            });
        });
    };

    normalizeRows(payload.publications, ['publish_date', 'date']);
    normalizeRows(payload.participations, ['date']);
    normalizeRows(payload.theses, ['defense_date']);
}

// ========================================
// دوال فلترة القسم
// ========================================
function getDepartmentFacultyIds(department) {
    if (department === 'all') return null; // null يعني لا فلترة
    return new Set(
        allData.faculty
            .filter(f => (f.department || '').trim() === department)
            .map(f => String(f.id).trim())
    );
}

function filterByDepartment(items, department, idField) {
    if (department === 'all') return items;
    const deptIds = getDepartmentFacultyIds(department);
    if (!deptIds) return items;

    return items.filter(item => {
        // دعم حقول متعددة (مثل participant_ids أو authors_ids مفصولة بـ |)
        const ids = (item[idField] || '').split('|').map(id => id.trim());
        return ids.some(id => deptIds.has(id));
    });
}

// ========================================
// بناء خريطة ربط المقررات بالبرامج
// ========================================
function getPlanCell(row, keys) {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null) {
            return String(row[key]).trim();
        }
    }
    return '';
}

function normalizeCourseCode(code) {
    return String(code || '').trim();
}

function buildCourseToPrograms() {
    courseCodeToPrograms = {};
    courseCodeToProgramKeys = {};
    programExclusiveCodes = {};
    programNonSharedCodes = {};
    programAvgLoad = {};
    teachingProgramAggregatesCache = null;

    const explicitExclusiveByProgram = {};   // من new_all_plans.csv (نوع المقرر = فريد)
    const programLevelCounts = {};           // key → { maxLevel, nonSharedPerLevel: {level: Set} }
    let hasPlanTypeColumn = false;
    let hasOldPlanColumns = false;
    const missingTypeRowsByDegree = {};
    let missingTypeRowsTotal = 0;

    allPlansData.forEach(row => {
        // دعم الصيغة القديمة والجديدة + BOM
        const code = normalizeCourseCode(getPlanCell(row, ['Code', '\ufeffCode', 'رمز المقرر']));
        const prog = getPlanCell(row, ['Program', '\ufeffProgram', 'البرنامج']);
        const deg = getPlanCell(row, ['Degree', 'الدرجة']);
        const category = getPlanCell(row, ['Category', 'التصنيف']);
        const courseType = getPlanCell(row, ['نوع المقرر']);
        const levelRaw = getPlanCell(row, ['Level', 'المستوى']);

        if (!code || !prog) return;
        const key = prog + ' - ' + deg;

        // خريطة المقرر → البرامج
        if (!courseCodeToPrograms[code]) courseCodeToPrograms[code] = [];
        if (!courseCodeToProgramKeys[code]) courseCodeToProgramKeys[code] = new Set();
        if (!courseCodeToPrograms[code].some(p => p.key === key)) {
            courseCodeToPrograms[code].push({ program: prog, degree: deg, key });
            courseCodeToProgramKeys[code].add(key);
        }

        // صيغة الخطة الجديدة: نوع المقرر (فريد / مشترك)
        if (courseType) {
            hasPlanTypeColumn = true;
            if (courseType.includes('فريد')) {
                if (!explicitExclusiveByProgram[key]) explicitExclusiveByProgram[key] = new Set();
                explicitExclusiveByProgram[key].add(code);
            }
            if (!courseType.includes('مشترك')) {
                if (!programNonSharedCodes[key]) programNonSharedCodes[key] = new Set();
                programNonSharedCodes[key].add(code);
            }
        } else if (Object.prototype.hasOwnProperty.call(row, 'نوع المقرر')) {
            // يوجد عمود التصنيف لكن الصف غير معبأ
            missingTypeRowsTotal++;
            const degLabel = deg || 'غير محدد';
            missingTypeRowsByDegree[degLabel] = (missingTypeRowsByDegree[degLabel] || 0) + 1;
        }

        // الصيغة القديمة: Category/Level
        if (category || levelRaw) {
            hasOldPlanColumns = true;
        }

        // المقررات غير المشتركة في الصيغة القديمة: ليست متطلبات جامعية
        if (category && !category.includes('متطلبات جامعية')) {
            if (!programNonSharedCodes[key]) programNonSharedCodes[key] = new Set();
            programNonSharedCodes[key].add(code);

            const level = parseInt(levelRaw || '0', 10);
            if (level) {
                if (!programLevelCounts[key]) {
                    programLevelCounts[key] = { maxLevel: 0, nonSharedPerLevel: {} };
                }
                if (level > programLevelCounts[key].maxLevel) {
                    programLevelCounts[key].maxLevel = level;
                }
                if (!programLevelCounts[key].nonSharedPerLevel[level]) {
                    programLevelCounts[key].nonSharedPerLevel[level] = new Set();
                }
                programLevelCounts[key].nonSharedPerLevel[level].add(code);
            }
        }
    });

    if (hasPlanTypeColumn) {
        // عند توفر ملف new_all_plans.csv بتصنيف (فريد/مشترك) نعتمد التصنيف الصريح فقط
        Object.entries(explicitExclusiveByProgram).forEach(([key, codes]) => {
            if (!programExclusiveCodes[key]) programExclusiveCodes[key] = new Set();
            codes.forEach(code => programExclusiveCodes[key].add(code));
        });
    } else {
        // fallback للملف القديم: اعتبار المقرر فريدًا إذا ارتبط ببرنامج واحد فقط
        Object.entries(courseCodeToPrograms).forEach(([code, progs]) => {
            if (progs.length === 1) {
                const key = progs[0].key;
                if (!programExclusiveCodes[key]) programExclusiveCodes[key] = new Set();
                programExclusiveCodes[key].add(code);
            }
        });
    }

    // حساب متوسط حمل الطالب السنوي (فقط عند توفر بيانات الخطة القديمة)
    Object.entries(programLevelCounts).forEach(([key, info]) => {
        const years = Math.max(1, Math.ceil(info.maxLevel / 2));
        let totalNonShared = 0;
        Object.values(info.nonSharedPerLevel).forEach(codesSet => {
            totalNonShared += codesSet.size;
        });
        programAvgLoad[key] = totalNonShared > 0 ? totalNonShared / years : 1;
    });

    const totalCourseProgramLinks = Object.values(courseCodeToPrograms).reduce((sum, progs) => sum + progs.length, 0);
    console.log(`📋 خريطة البرامج: ${Object.keys(courseCodeToPrograms).length} مقرر → ${totalCourseProgramLinks} ربط برنامج`);
    console.log(`📚 مصدر الخطط: ${hasPlanTypeColumn ? 'new_all_plans.csv (تصنيف صريح فريد/مشترك)' : 'all_plans.csv (اشتقاق آلي)'}`);
    if (missingTypeRowsTotal > 0) {
        console.warn(`⚠️ توجد ${missingTypeRowsTotal} صفوف في new_all_plans.csv بدون تصنيف "نوع المقرر"؛ لن تظهر في مؤشرات المقررات الفريدة حتى تعبئتها.`, missingTypeRowsByDegree);
    }
    if (hasOldPlanColumns && Object.keys(programAvgLoad).length > 0) {
        console.log(`📊 حمل الطالب السنوي:`, Object.entries(programAvgLoad).map(([k, v]) => `${k}: ${v.toFixed(1)}`).join(', '));
    }
}

async function loadAllData() {
    showLoading();

    const [faculty, students, theses, participations, publications] = await Promise.all([
        loadCSV(`${DATA_BASE_URL}/faculty.csv`),
        loadCSV(`${DATA_BASE_URL}/students_count.csv`),
        loadCSV(`${DATA_BASE_URL}/theses.csv`),
        loadCSV(`${DATA_BASE_URL}/participations.csv`),
        loadCSV(`${DATA_BASE_URL}/publications.csv`)
    ]);

    const plans = await loadCSV(`${DATA_BASE_URL}/new_all_plans.csv`);
    if (!plans || plans.length === 0) {
        throw new Error('تعذر تحميل data/new_all_plans.csv أو الملف فارغ. هذا الملف أصبح المصدر المعتمد الوحيد لربط المقررات بالبرامج.');
    }

    allData = { faculty, students, theses, participations, publications };
    allPlansData = plans;
    buildCourseToPrograms();

    // محاولة تحميل البيانات الحية من Google Sheets ودمجها
    await loadFromGoogleSheets();

    await loadYearData(currentYear);
}

async function loadYearData(year) {
    if (year === 'all') {
        // عرض كل البيانات من جميع السنوات
        data.faculty = [...allData.faculty];
        data.students = [...allData.students];
        data.theses = [...allData.theses];
        data.participations = [...allData.participations];
        data.publications = [...allData.publications];

        // إزالة التكرارات من أعضاء هيئة التدريس (نفس العضو قد يظهر في سنوات متعددة)
        const uniqueFaculty = {};
        allData.faculty.forEach(f => {
            if (!uniqueFaculty[f.id] || f.active === 'نعم') {
                uniqueFaculty[f.id] = f;
            }
        });
        data.faculty = Object.values(uniqueFaculty);

        // تجميع أعداد الطلاب من كل السنوات (آخر قيمة لكل برنامج)
        const latestStudents = {};
        allData.students.forEach(s => {
            const key = s.program;
            if (!latestStudents[key] || parseInt(s.year) > parseInt(latestStudents[key].year)) {
                latestStudents[key] = s;
            }
        });
        data.students = Object.values(latestStudents);
    } else {
        data.faculty = allData.faculty.filter(f => parseInt(f.year) === year);
        data.students = allData.students.filter(s => parseInt(s.year) === year);
        data.theses = allData.theses.filter(t => parseInt(t.year) === year);
        data.participations = allData.participations.filter(p => parseInt(p.year) === year);
        data.publications = allData.publications.filter(p => parseInt(p.year) === year);
    }

    // فلترة حسب القسم
    if (currentDepartment !== 'all') {
        data.faculty = data.faculty.filter(f => (f.department || '').trim() === currentDepartment);
        const deptIds = new Set(data.faculty.map(f => String(f.id).trim()));
        data.theses = data.theses.filter(t => deptIds.has(String(t.supervisor_id).trim()));
        data.publications = data.publications.filter(p => {
            const ids = (p.authors_ids || '').split('|').map(id => id.trim());
            return ids.some(id => deptIds.has(id));
        });
        data.participations = data.participations.filter(p => {
            const ids = (p.participant_ids || '').split('|').map(id => id.trim());
            return ids.some(id => deptIds.has(id));
        });
    }

    // إعادة تعيين عرض المتصدرين
    showAllLeaderboard = false;

    hideLoading();
    populateThesesFilters();
    renderAll();
}

// ========================================
// دوال مساعدة
// ========================================
function getMemberName(id) {
    if (!id || id === '' || id === null || id === undefined) return '-';
    
    const idStr = String(id).trim();
    if (idStr === '') return '-';
    
    // التحقق إذا كان المدخل معرف رقمي أم اسم نصي (للمناقشين الخارجيين)
    // المعرف الرقمي يتكون من أرقام فقط أو يبدأ بأرقام
    const isNumericId = /^\d+$/.test(idStr);
    
    if (isNumericId) {
        // البحث أولاً في بيانات السنة الحالية
        let member = data.faculty.find(f => String(f.id).trim() === idStr);
        
        // إذا لم يوجد، البحث في كل البيانات
        if (!member) {
            member = allData.faculty.find(f => String(f.id).trim() === idStr);
        }
        
        return member ? member.name : '-';
    } else {
        // إذا كان نصاً (اسم مناقش خارجي)، نعيده كما هو
        return idStr;
    }
}

// دالة جديدة للحصول على بيانات العضو كاملة
function getMemberData(id) {
    if (!id || id === '' || id === null || id === undefined) return null;
    
    const idStr = String(id).trim();
    if (idStr === '') return null;
    
    // التحقق إذا كان المدخل معرف رقمي
    const isNumericId = /^\d+$/.test(idStr);
    
    if (isNumericId) {
        let member = data.faculty.find(f => String(f.id).trim() === idStr);
        if (!member) {
            member = allData.faculty.find(f => String(f.id).trim() === idStr);
        }
        return member || null;
    } else {
        // إذا كان نصاً (اسم مناقش خارجي)، نعيد كائن وهمي بالاسم
        return { id: idStr, name: idStr, rank: 'خارجي', active: 'نعم' };
    }
}

// دالة لاستخراج الاسم المختصر مع اللقب
function getShortName(fullName) {
    if (!fullName || fullName === '-') return '-';
    
    // استخراج اللقب (أ.د. أو د. أو أ.)
    let prefix = '';
    let name = fullName;
    
    if (fullName.startsWith('أ.د.')) {
        prefix = 'أ.د.';
        name = fullName.replace('أ.د.', '').trim();
    } else if (fullName.startsWith('د.')) {
        prefix = 'د.';
        name = fullName.replace('د.', '').trim();
    } else if (fullName.startsWith('أ.')) {
        prefix = 'أ.';
        name = fullName.replace('أ.', '').trim();
    }
    
    // الحصول على أول اسمين فقط
    const nameParts = name.split(' ').filter(p => p.length > 0);
    const shortName = nameParts.slice(0, 2).join(' ');
    
    return prefix + ' ' + shortName;
}

function isMastersScientificThesis(thesis) {
    if (!thesis) return false;
    const type = (thesis.type || '').trim();
    if (type !== 'ماجستير') return false;

    const year = parseInt(String(thesis.year || '').trim(), 10);
    const specialization = (thesis.specialization || '').trim();

    return (!Number.isNaN(year) && year <= 1440) || specialization === 'العقيدة';
}

function isScientificThesis(thesis) {
    if (!thesis) return false;
    const type = (thesis.type || '').trim();
    if (type === 'دكتوراه') return true;
    return isMastersScientificThesis(thesis);
}

function normalizeMemberYearFilter(year) {
    if (year === null || year === undefined || year === '' || year === 'all') return 'all';
    if (year === 'current') return 'current';
    const parsedYear = parseInt(String(year).trim(), 10);
    return Number.isNaN(parsedYear) ? 'all' : parsedYear;
}

function recordMatchesYear(record, selectedYear) {
    if (selectedYear === 'all' || selectedYear === 'current') return true;
    const rawYear = record?.year ?? record?.y;
    const parsedYear = parseInt(String(rawYear || '').trim(), 10);
    return !Number.isNaN(parsedYear) && parsedYear === selectedYear;
}

function getScopedDataCollection(key, selectedYear = 'current') {
    const normalizedYear = normalizeMemberYearFilter(selectedYear);
    if (normalizedYear === 'current') {
        return Array.isArray(data[key]) ? data[key] : [];
    }

    const source = Array.isArray(allData[key]) ? allData[key] : [];
    if (normalizedYear === 'all') return source;
    return source.filter(record => recordMatchesYear(record, normalizedYear));
}

function getMemberAvailableYears(memberId) {
    const memberIdStr = String(memberId || '').trim();
    const years = new Set();
    const addYear = value => {
        const parsedYear = parseInt(String(value || '').trim(), 10);
        if (!Number.isNaN(parsedYear)) years.add(parsedYear);
    };

    (allData.faculty || []).forEach(member => {
        if (String(member.id || '').trim() === memberIdStr) addYear(member.year);
    });

    (allData.theses || []).forEach(thesis => {
        const matchesMember =
            String(thesis.supervisor_id || '').trim() === memberIdStr ||
            String(thesis.co_supervisor_id || '').trim() === memberIdStr ||
            String(thesis.examiner1_id || '').trim() === memberIdStr ||
            String(thesis.examiner2_id || '').trim() === memberIdStr;
        if (matchesMember) addYear(thesis.year);
    });

    (allData.publications || []).forEach(publication => {
        const authors = (publication.authors_ids || publication.participant_ids || '')
            .split('|')
            .map(id => id.trim());
        if (authors.includes(memberIdStr)) addYear(publication.year);
    });

    (allData.participations || []).forEach(participation => {
        const participants = (participation.participant_ids || '')
            .split('|')
            .map(id => id.trim());
        if (participants.includes(memberIdStr)) addYear(participation.year);
    });

    if (typeof teachingData !== 'undefined' && teachingData && Array.isArray(teachingData.records)) {
        teachingData.records.forEach(record => {
            if (String(record.fid || '').trim() === memberIdStr) addYear(record.y);
        });
    }

    return Array.from(years).sort((a, b) => b - a);
}

function getMemberScopeLabel(selectedYear) {
    const normalizedYear = normalizeMemberYearFilter(selectedYear);
    if (normalizedYear === 'all') return 'كل السنوات';
    if (normalizedYear === 'current') return 'السنة الحالية';
    return `${formatArabicDigits(normalizedYear)}هـ`;
}

// دالة لتحويل مسمى نوع الرسالة للعرض
function getThesisTypeName(type, thesis = null) {
    if (type === 'دكتوراه') return 'رسالة علمية';
    if (type === 'ماجستير') return (thesis && isScientificThesis(thesis)) ? 'رسالة علمية' : 'مشروع بحثي';
    return type;
}

function getThesisProgramLabel(typeOrThesis, specialization = '') {
    if (typeof typeOrThesis === 'object' && typeOrThesis !== null) {
        const thesis = typeOrThesis;
        const thesisType = (thesis.type || '').trim();
        const thesisSpec = (thesis.specialization || '').trim();
        const thesisTypeName = getThesisTypeName(thesisType, thesis);
        return thesisSpec ? `${thesisTypeName} ${thesisSpec}` : thesisTypeName;
    }

    const thesisType = (typeOrThesis || '').trim();
    const thesisSpec = (specialization || '').trim();
    const thesisTypeName = thesisType === 'ماجستير' ? 'ماجستير' : getThesisTypeName(thesisType);
    return thesisSpec ? `${thesisTypeName} ${thesisSpec}` : thesisTypeName;
}

function getThesesFiltersSource() {
    return Array.isArray(data?.theses) ? data.theses : [];
}

function getThesesFilterConfig(kind) {
    const configByKind = {
        program: {
            defaultLabel: 'جميع البرامج',
            extraContainerId: 'thesesProgramFilterExtras'
        },
        year: {
            defaultLabel: 'جميع السنوات',
            extraContainerId: 'thesesYearFilterExtras'
        },
        supervisor: {
            defaultLabel: 'جميع المشرفين',
            extraContainerId: 'thesesSupervisorFilterExtras'
        }
    };
    return configByKind[kind] || null;
}

function getThesesProgramFilterOptions() {
    const source = getThesesFiltersSource();
    const pairs = new Map();

    source.forEach(thesis => {
        const type = (thesis.type || '').trim();
        const spec = (thesis.specialization || '').trim();
        if (!type || !spec) return;
        const key = `${type}|${spec}`;
        if (!pairs.has(key)) {
            pairs.set(key, {
                value: key,
                type,
                spec,
                label: getThesisProgramLabel(type, spec)
            });
        }
    });

    const typeOrder = { 'دكتوراه': 0, 'ماجستير': 1 };
    return Array.from(pairs.values()).sort((a, b) => {
        const aOrder = typeOrder[a.type] ?? 99;
        const bOrder = typeOrder[b.type] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.spec.localeCompare(b.spec, 'ar');
    });
}

function getThesesYearFilterOptions() {
    const yearSet = new Set();
    getThesesFiltersSource().forEach(thesis => {
        const year = String(thesis.year || '').trim();
        if (year) yearSet.add(year);
    });

    return Array.from(yearSet)
        .sort((a, b) => {
            const aNum = parseInt(a, 10);
            const bNum = parseInt(b, 10);
            if (Number.isFinite(aNum) && Number.isFinite(bNum)) return bNum - aNum;
            return b.localeCompare(a, 'ar');
        })
        .map(year => ({
            value: year,
            label: `سنة ${year}هـ`
        }));
}

function getThesesSupervisorFilterOptions() {
    const supervisorSet = new Set();
    getThesesFiltersSource().forEach(thesis => {
        const supervisorId = String(thesis.supervisor_id || '').trim();
        if (supervisorId) supervisorSet.add(supervisorId);
    });

    return Array.from(supervisorSet)
        .map(id => {
            const memberName = getMemberName(id);
            return {
                value: id,
                label: memberName === '-' ? id : memberName
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}

function setThesesFilterOptions(kind, options) {
    const filterConfig = getThesesFilterConfig(kind);
    if (!filterConfig) return;

    const selects = Array.from(document.querySelectorAll(`select[data-theses-filter-kind="${kind}"]`));
    selects.forEach(selectEl => {
        const previousValue = String(selectEl.value || '').trim();
        selectEl.innerHTML = '';

        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = filterConfig.defaultLabel;
        selectEl.appendChild(allOption);

        options.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            selectEl.appendChild(option);
        });

        const canRestore = options.some(item => item.value === previousValue);
        selectEl.value = canRestore ? previousValue : '';
    });
}

function populateThesesFilters() {
    setThesesFilterOptions('program', getThesesProgramFilterOptions());
    setThesesFilterOptions('year', getThesesYearFilterOptions());
    setThesesFilterOptions('supervisor', getThesesSupervisorFilterOptions());
}

function createThesesExtraFilterRow(kind) {
    const baseSelect = document.querySelector(`select[data-theses-filter-kind="${kind}"]`);
    if (!baseSelect) return null;

    const row = document.createElement('div');
    row.className = 'theses-multi-filter-row theses-multi-filter-row-extra';

    const select = document.createElement('select');
    select.className = 'theses-filter-select';
    select.dataset.thesesFilterKind = kind;
    Array.from(baseSelect.options).forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.textContent;
        select.appendChild(option);
    });
    select.addEventListener('change', renderTheses);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'theses-filter-remove-btn';
    removeBtn.textContent = '-';
    removeBtn.title = 'حذف هذا المحدد';
    removeBtn.addEventListener('click', () => {
        row.remove();
        renderTheses();
    });

    row.appendChild(select);
    row.appendChild(removeBtn);
    return row;
}

function addThesesFilterSelect(kind) {
    const filterConfig = getThesesFilterConfig(kind);
    if (!filterConfig) return;

    const extraContainer = document.getElementById(filterConfig.extraContainerId);
    if (!extraContainer) return;

    const row = createThesesExtraFilterRow(kind);
    if (!row) return;
    extraContainer.appendChild(row);
}

function getSelectedThesesFilterValues(kind) {
    const values = Array.from(document.querySelectorAll(`select[data-theses-filter-kind="${kind}"]`))
        .map(select => String(select.value || '').trim())
        .filter(Boolean);
    return Array.from(new Set(values));
}

function getSelectedThesesFilterLabels(kind) {
    const labels = Array.from(document.querySelectorAll(`select[data-theses-filter-kind="${kind}"]`))
        .filter(select => String(select.value || '').trim())
        .map(select => select.options[select.selectedIndex]?.textContent?.trim() || '')
        .filter(Boolean);
    return Array.from(new Set(labels));
}

function getFilteredThesesRecords() {
    const statusFilter = String(document.getElementById('thesesStatusFilter')?.value || '').trim();
    const searchTerm = normalizeSearchText(document.getElementById('thesesSearch')?.value || '');
    const selectedPrograms = new Set(getSelectedThesesFilterValues('program'));
    const selectedYears = new Set(getSelectedThesesFilterValues('year'));
    const selectedSupervisors = new Set(getSelectedThesesFilterValues('supervisor'));

    let filtered = [...getThesesFiltersSource()];

    if (selectedPrograms.size > 0) {
        filtered = filtered.filter(thesis => {
            const programKey = `${(thesis.type || '').trim()}|${(thesis.specialization || '').trim()}`;
            return selectedPrograms.has(programKey);
        });
    }

    if (selectedYears.size > 0) {
        filtered = filtered.filter(thesis => selectedYears.has(String(thesis.year || '').trim()));
    }

    if (selectedSupervisors.size > 0) {
        filtered = filtered.filter(thesis => selectedSupervisors.has(String(thesis.supervisor_id || '').trim()));
    }

    if (statusFilter) {
        filtered = filtered.filter(thesis => String(thesis.status || '').trim() === statusFilter);
    }

    if (searchTerm) {
        filtered = filtered.filter(thesis =>
            normalizeSearchText(thesis.title || '').includes(searchTerm) ||
            normalizeSearchText(thesis.student_name || '').includes(searchTerm) ||
            normalizeSearchText(getMemberName(thesis.supervisor_id)).includes(searchTerm)
        );
    }

    return sortByDateDesc(filtered, thesis => thesis.defense_date);
}

function printFilteredTheses() {
    const records = currentThesesView.length ? [...currentThesesView] : getFilteredThesesRecords();
    if (!records.length) {
        alert('لا توجد بيانات مطابقة للفلاتر الحالية.');
        return;
    }

    const statusFilter = String(document.getElementById('thesesStatusFilter')?.value || '').trim();
    const searchValue = String(document.getElementById('thesesSearch')?.value || '').trim();
    const programLabels = getSelectedThesesFilterLabels('program');
    const yearLabels = getSelectedThesesFilterLabels('year');
    const supervisorLabels = getSelectedThesesFilterLabels('supervisor');

    const programsText = programLabels.length ? programLabels.join('، ') : 'الكل';
    const yearsText = yearLabels.length ? yearLabels.join('، ') : 'الكل';
    const supervisorsText = supervisorLabels.length ? supervisorLabels.join('، ') : 'الكل';
    const statusText = statusFilter || 'الكل';
    const searchText = searchValue || 'بدون';

    const rowsHtml = records.map((thesis, index) => {
        const program = getThesisProgramLabel(thesis);
        const supervisor = getMemberName(thesis.supervisor_id);
        return `
            <tr>
                <td>${formatArabicDigits(index + 1)}</td>
                <td>${escapeHtml(thesis.year || '-')}</td>
                <td>${escapeHtml(program || '-')}</td>
                <td>${escapeHtml(thesis.student_name || '-')}</td>
                <td>${escapeHtml(thesis.title || '-')}</td>
                <td>${escapeHtml(supervisor || '-')}</td>
                <td>${escapeHtml(thesis.status || '-')}</td>
                <td>${escapeHtml(formatDate(thesis.defense_date))}</td>
            </tr>
        `;
    }).join('');

    const printContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>طباعة الرسائل والمشاريع البحثية</title>
    <style>
        body { font-family: 'Cairo', sans-serif; margin: 20px; color: #1f2937; }
        h1 { margin: 0 0 8px; font-size: 24px; }
        .meta { margin-bottom: 16px; line-height: 1.8; }
        .meta b { color: #0f172a; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: right; }
        th { background: #f3f4f6; }
        .count { margin: 10px 0 16px; font-weight: 700; color: #111827; }
        @media print { body { margin: 10px; } }
    </style>
</head>
<body>
    <h1>طباعة الرسائل والمشاريع البحثية</h1>
    <div class="meta">
        <div><b>البرامج:</b> ${escapeHtml(programsText)}</div>
        <div><b>السنوات:</b> ${escapeHtml(yearsText)}</div>
        <div><b>المشرفون:</b> ${escapeHtml(supervisorsText)}</div>
        <div><b>الحالة:</b> ${escapeHtml(statusText)}</div>
        <div><b>البحث:</b> ${escapeHtml(searchText)}</div>
    </div>
    <div class="count">إجمالي النتائج: ${formatArabicDigits(records.length)}</div>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>السنة</th>
                <th>البرنامج</th>
                <th>الطالب</th>
                <th>عنوان البحث</th>
                <th>المشرف</th>
                <th>الحالة</th>
                <th>تاريخ المناقشة</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>
    <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
        return;
    }

    printWindow.document.write(printContent);
    printWindow.document.close();
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const hijriMonths = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
    
    const parsed = parseDateParts(dateStr);
    if (!parsed) return dateStr;
    let { day, month, year } = parsed;
    
    if (year < 2000) {
        return formatHijriDateDisplay(day, month, year, hijriMonths);
    }
    
    const gregorianDate = new Date(year, month - 1, day);
    const hijriDate = gregorianDate.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'numeric', 
        year: 'numeric'
    });
    const hijriParts = normalizeArabicDigits(hijriDate).match(/(\d+)/g);
    if (hijriParts && hijriParts.length >= 3) {
        day = parseInt(hijriParts[0]);
        month = parseInt(hijriParts[1]);
        year = parseInt(hijriParts[2]);
    }
    
    return formatHijriDateDisplay(day, month, year, hijriMonths);
}

function formatDateShort(dateStr) {
    if (!dateStr) return { day: '-', month: '-' };
    
    const hijriMonths = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
    const parsed = parseDateParts(dateStr);
    if (!parsed) return { day: '-', month: '-' };
    let { day, month, year } = parsed;

    if (year >= 2000) {
        const gregorianDate = new Date(year, month - 1, day);
        const hijriDate = gregorianDate.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
        });
        const hijriParts = normalizeArabicDigits(hijriDate).match(/(\d+)/g);
        if (hijriParts && hijriParts.length >= 3) {
            day = parseInt(hijriParts[0], 10);
            month = parseInt(hijriParts[1], 10);
        }
    }
    
    return { day: formatArabicDigits(pad2(day || '')), month: hijriMonths[month - 1] || '-' };
}

function normalizeArabicDigits(value) {
    if (value === null || value === undefined) return '';
    const map = {
        '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
        '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
        '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
        '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
    };
    return String(value).replace(/[٠-٩۰-۹]/g, ch => map[ch] || ch);
}

function formatArabicDigits(value) {
    const map = {
        '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
        '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩'
    };
    return String(value ?? '').replace(/\d/g, ch => map[ch] || ch);
}

function formatHijriDateDisplay(day, month, year, hijriMonths) {
    const monthName = hijriMonths?.[month - 1] || '-';
    const dayText = formatArabicDigits(pad2(day));
    const yearText = formatArabicDigits(year);
    return `${dayText} ${monthName} ${yearText}هـ`;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function parseJsDateStringParts(dateStr) {
    const raw = String(dateStr || '').trim();
    if (!raw) return null;

    // مثال: Tue Jul 02 1444 00:00:00 GMT+0306 (التوقيت العربي الرسمي)
    const match = raw.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
    if (!match) return null;

    const monthMap = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
    };

    const month = monthMap[match[1]];
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null;
    return { year, month, day };
}

function normalizeIncomingDateValue(value) {
    if (value === null || value === undefined) return value;
    const raw = String(value).trim();
    if (!raw) return '';

    // ISO datetime => نكتفي بالجزء التاريخي
    const isoMatch = normalizeArabicDigits(raw).match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const parts = parseDateParts(raw);
    if (!parts) return raw;

    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function parseDateParts(dateStr) {
    if (!dateStr) return null;
    const normalized = normalizeArabicDigits(dateStr).trim();
    if (!normalized) return null;

    // صيغة Date.toString القادمة أحيانًا من Google Sheets / Apps Script
    const jsDateParts = parseJsDateStringParts(normalized);
    if (jsDateParts) return jsDateParts;

    // ISO datetime
    const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
        return {
            year: parseInt(isoMatch[1], 10),
            month: parseInt(isoMatch[2], 10),
            day: parseInt(isoMatch[3], 10)
        };
    }

    const separator = normalized.includes('-') ? '-' : (normalized.includes('/') ? '/' : null);
    if (!separator) return null;

    const parts = normalized.split(separator).map(p => p.trim()).filter(Boolean);
    if (parts.length < 3) return null;

    let year;
    let month;
    let day;

    if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
    } else if (parts[2].length === 4) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
    } else {
        // fallback: نفترض ترتيب يوم/شهر/سنة
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
    }

    if (![year, month, day].every(Number.isFinite)) return null;
    return { year, month, day };
}

function getSortableDateValue(dateStr) {
    const parts = parseDateParts(dateStr);
    if (!parts) return -1;
    return (parts.year * 10000) + (parts.month * 100) + parts.day;
}

function sortByDateDesc(items, dateAccessor) {
    return [...items].sort((a, b) => {
        const diff = getSortableDateValue(dateAccessor(b)) - getSortableDateValue(dateAccessor(a));
        if (diff !== 0) return diff;
        const aTitle = (a.title || a.student_name || '').toString();
        const bTitle = (b.title || b.student_name || '').toString();
        return aTitle.localeCompare(bTitle, 'ar');
    });
}

function parseCitationValue(value) {
    if (value === null || value === undefined) return 0;
    const raw = String(value).trim();
    if (!raw) return 0;

    if (config.citations_ranges && Object.prototype.hasOwnProperty.call(config.citations_ranges, raw)) {
        return Number(config.citations_ranges[raw]) || 0;
    }

    const normalized = normalizeArabicDigits(raw)
        .replace(/[()（）]/g, '')
        .replace(/[–—]/g, '-')
        .trim();

    const rangeMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
        const a = parseFloat(rangeMatch[1]);
        const b = parseFloat(rangeMatch[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    }

    const singleNumber = normalized.match(/^(\d+(?:\.\d+)?)$/);
    if (singleNumber) {
        return parseFloat(singleNumber[1]) || 0;
    }

    const allNumbers = normalized.match(/\d+(?:\.\d+)?/g);
    if (allNumbers && allNumbers.length === 2) {
        const a = parseFloat(allNumbers[0]);
        const b = parseFloat(allNumbers[1]);
        if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    }
    if (allNumbers && allNumbers.length === 1) {
        return parseFloat(allNumbers[0]) || 0;
    }

    return 0;
}

function getCitationsEstimate(range) {
    return parseCitationValue(range);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getRecordModifierName(record) {
    if (!record || typeof record !== 'object') return '';

    const explicitName = String(
        record.last_modified_by_name ||
        record.modified_by_name ||
        record.edited_by_name ||
        ''
    ).trim();
    if (explicitName) return explicitName;

    const actorId = String(
        record.last_modified_by_id ||
        record.modified_by_id ||
        record.edited_by_id ||
        ''
    ).trim();
    if (!actorId) return '';

    const memberName = getMemberName(actorId);
    return memberName && memberName !== '-' ? memberName : '';
}

function getRecordModifiedByHtml(record) {
    const actorName = getRecordModifierName(record);
    if (!actorName) return '';
    return `<div class="record-modified-by">تم التعديل بواسطة: ${escapeHtml(actorName)}</div>`;
}

// ========================================
// دوال استخراج البيانات من participations و publications
// ========================================

// البحوث العلمية للأعضاء (من ملف publications.csv)
function getPublications() {
    return data.publications || [];
}

// بحوث الطلاب (من participations)
function getStudentResearch() {
    return data.participations.filter(p => p.category === 'بحوث الطلاب');
}

// جميع الفعاليات والأنشطة (11 فئة)
function getEvents() {
    return data.participations.filter(p => 
        p.category === 'مؤتمر' || 
        p.category === 'ندوة' || 
        p.category === 'ورشة عمل' ||
        p.category === 'تحكيم علمي' ||
        p.category === 'تأليف كتب' ||
        p.category === 'استشارة علمية' ||
        p.category === 'مشاركة إعلامية' ||
        p.category === 'مناقشة خارجية' ||
        p.category === 'جائزة' ||
        p.category === 'براءة اختراع' ||
        p.category === 'بحوث الطلاب'
    );
}

// المناقشات الخارجية
function getExternalDiscussions() {
    return data.participations.filter(p => p.category === 'مناقشة خارجية');
}

// التحكيم العلمي
function getReviewing() {
    return data.participations.filter(p => p.category === 'تحكيم علمي');
}

// الجوائز وبراءات الاختراع
function getAwards() {
    return data.participations.filter(p => 
        p.category === 'جائزة' || p.category === 'براءة اختراع'
    );
}

// كل المشاركات (للإحصائيات)
function getAllParticipations() {
    return data.participations;
}

// ========================================
// حساب النقاط
// ========================================
function calculateMemberPoints(memberId, options = {}) {
    const weights = config.weights || {};
    let points = 0;
    const breakdown = {};
    const memberIdStr = String(memberId).trim();
    const selectedYear = normalizeMemberYearFilter(options.year ?? 'current');
    const scopedPublications = getScopedDataCollection('publications', selectedYear);
    const scopedParticipations = getScopedDataCollection('participations', selectedYear);
    const scopedTheses = getScopedDataCollection('theses', selectedYear);
    
    // 1. البحوث العلمية للأعضاء (من publications.csv)
    if (scopedPublications.length > 0) {
        const memberPubs = scopedPublications.filter(p => {
            const authors = (p.authors_ids || '').split('|').map(id => id.trim());
            return authors.includes(memberIdStr);
        });
        breakdown.publications = memberPubs.length;
        points += memberPubs.length * (weights.publication || 15);
    }
    
    // 2. بحوث الطلاب (الإشراف على نشر بحث لطالب)
    const studentResearch = scopedParticipations.filter(p => {
        if (p.category !== 'بحوث الطلاب') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    breakdown.studentResearch = studentResearch.length;
    points += studentResearch.length * (weights.student_research || 8);
    
    // 3. الإشراف على الرسائل العلمية (دكتوراه + ماجستير وفق تصنيف الرسالة)
    const phdSupervised = scopedTheses.filter(t => 
        t.type === 'دكتوراه' && String(t.supervisor_id).trim() === memberIdStr && t.status === 'منجزة'
    );
    const scientificMastersSupervised = scopedTheses.filter(t =>
        (t.type || '').trim() === 'ماجستير' &&
        isScientificThesis(t) &&
        String(t.supervisor_id).trim() === memberIdStr &&
        t.status === 'منجزة'
    );
    const projectMastersSupervised = scopedTheses.filter(t =>
        (t.type || '').trim() === 'ماجستير' &&
        !isScientificThesis(t) &&
        String(t.supervisor_id).trim() === memberIdStr &&
        t.status === 'منجزة'
    );
    breakdown.phdSupervision = phdSupervised.length + scientificMastersSupervised.length;
    breakdown.mastersSupervision = projectMastersSupervised.length;
    points += (phdSupervised.length + scientificMastersSupervised.length) * (weights.phd_supervision || 10);
    points += projectMastersSupervised.length * (weights.masters_supervision || 3);
    
    // 4. الإشراف المشارك (رسائل علمية + مشاريع بحثية)
    const phdCoSupervised = scopedTheses.filter(t => 
        t.type === 'دكتوراه' && String(t.co_supervisor_id).trim() === memberIdStr && t.status === 'منجزة'
    );
    const scientificMastersCoSupervised = scopedTheses.filter(t =>
        (t.type || '').trim() === 'ماجستير' &&
        isScientificThesis(t) &&
        String(t.co_supervisor_id).trim() === memberIdStr &&
        t.status === 'منجزة'
    );
    const projectMastersCoSupervised = scopedTheses.filter(t =>
        (t.type || '').trim() === 'ماجستير' &&
        !isScientificThesis(t) &&
        String(t.co_supervisor_id).trim() === memberIdStr &&
        t.status === 'منجزة'
    );
    breakdown.phdCoSupervision = phdCoSupervised.length + scientificMastersCoSupervised.length;
    breakdown.mastersCoSupervision = projectMastersCoSupervised.length;
    points += (phdCoSupervised.length + scientificMastersCoSupervised.length) * (weights.phd_co_supervision || 5);
    points += projectMastersCoSupervised.length * (weights.masters_co_supervision || 2);
    
    // 7. مناقشة الرسائل العلمية (دكتوراه + ماجستير وفق التصنيف)
    const phdExamined = scopedTheses.filter(t => 
        t.type === 'دكتوراه' && 
        (String(t.examiner1_id).trim() === memberIdStr || String(t.examiner2_id).trim() === memberIdStr)
    );
    const scientificMastersExamined = scopedTheses.filter(t =>
        (t.type || '').trim() === 'ماجستير' &&
        isScientificThesis(t) &&
        (String(t.examiner1_id).trim() === memberIdStr || String(t.examiner2_id).trim() === memberIdStr)
    );
    const projectMastersExamined = scopedTheses.filter(t =>
        (t.type || '').trim() === 'ماجستير' &&
        !isScientificThesis(t) &&
        (String(t.examiner1_id).trim() === memberIdStr || String(t.examiner2_id).trim() === memberIdStr)
    );
    breakdown.phdDiscussion = phdExamined.length + scientificMastersExamined.length;
    breakdown.mastersDiscussion = projectMastersExamined.length;
    points += (phdExamined.length + scientificMastersExamined.length) * (weights.phd_discussion || 5);
    points += projectMastersExamined.length * (weights.masters_discussion || 2);
    
    // 9. المشاركات العلمية من participations
    scopedParticipations.forEach(p => {
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        if (!participants.includes(memberIdStr)) return;
        
        // تخطي بحوث الطلاب (تم احتسابها أعلاه)
        if (p.category === 'بحوث الطلاب') return;
        
        const partType = (p.participation_type || '').trim();
        
        switch(p.category) {
            case 'مؤتمر':
                if (partType === 'مشاركة' || partType === 'نشر') {
                    breakdown.conferencePaper = (breakdown.conferencePaper || 0) + 1;
                    points += weights.conference_paper || 8;
                } else if (partType === 'حضور') {
                    breakdown.eventAttendance = (breakdown.eventAttendance || 0) + 1;
                    points += weights.event_attendance || 1;
                } else {
                    breakdown.conferencePaper = (breakdown.conferencePaper || 0) + 1;
                    points += weights.conference_paper || 8;
                }
                break;
                
            case 'ندوة':
                if (partType === 'مشاركة' || partType === 'نشر') {
                    breakdown.seminar = (breakdown.seminar || 0) + 1;
                    points += weights.seminar_participation || 5;
                } else if (partType === 'حضور') {
                    breakdown.eventAttendance = (breakdown.eventAttendance || 0) + 1;
                    points += weights.event_attendance || 1;
                } else {
                    breakdown.seminar = (breakdown.seminar || 0) + 1;
                    points += weights.seminar_participation || 5;
                }
                break;
                
            case 'ورشة عمل':
                if (partType === 'مشاركة' || partType === 'نشر') {
                    breakdown.workshop = (breakdown.workshop || 0) + 1;
                    points += weights.workshop_participation || 5;
                } else if (partType === 'حضور') {
                    breakdown.eventAttendance = (breakdown.eventAttendance || 0) + 1;
                    points += weights.event_attendance || 1;
                } else {
                    breakdown.workshop = (breakdown.workshop || 0) + 1;
                    points += weights.workshop_participation || 5;
                }
                break;
                
            case 'مناقشة خارجية':
                breakdown.externalDiscussion = (breakdown.externalDiscussion || 0) + 1;
                points += weights.external_discussion || 6;
                break;
                
            case 'تحكيم علمي':
                breakdown.reviewing = (breakdown.reviewing || 0) + 1;
                points += weights.reviewing || 5;
                break;
                
            case 'جائزة':
                breakdown.award = (breakdown.award || 0) + 1;
                points += weights.award || 10;
                break;
                
            case 'براءة اختراع':
                breakdown.patent = (breakdown.patent || 0) + 1;
                points += weights.patent || 15;
                break;
                
            case 'تأليف كتب':
                breakdown.book = (breakdown.book || 0) + 1;
                points += weights.book || 20;
                break;
                
            case 'استشارة علمية':
                // حساب نقاط الاستشارة بناءً على عدد الساعات (0.25 نقطة لكل ساعة)
                const hours = parseFloat(p.consulting_hours) || 1;
                const consultingPoints = hours * 0.25;
                breakdown.consulting = (breakdown.consulting || 0) + 1;
                breakdown.consultingHours = (breakdown.consultingHours || 0) + hours;
                points += consultingPoints;
                break;
                
            case 'مشاركة إعلامية':
                breakdown.media = (breakdown.media || 0) + 1;
                points += weights.media || 5;
                break;
        }
    });
    
    return { points, breakdown };
}

function getLeaderboard() {
    const activeMembers = data.faculty.filter(f => f.active === 'نعم');
    const leaderboard = activeMembers.map(member => {
        const { points, breakdown } = calculateMemberPoints(member.id);
        return {
            id: member.id,
            name: member.name,
            rank: member.rank,
            points,
            breakdown
        };
    });
    
    return leaderboard.sort((a, b) => b.points - a.points);
}

// ========================================
// حساب مؤشرات الجودة
// ========================================
function getUniqueActiveFacultyMembers() {
    const byId = new Map();
    (data.faculty || []).forEach(member => {
        if ((member.active || '').trim() !== 'نعم') return;
        const id = String(member.id || '').trim();
        if (!id) return;
        byId.set(id, member);
    });
    return Array.from(byId.values());
}

function getEligibleFacultyMembersForKPI(options = {}) {
    const excludedRanks = options.forPhd ? KPI_EXCLUDED_RANKS_FOR_PHD : KPI_EXCLUDED_RANKS;
    return getUniqueActiveFacultyMembers().filter(member => !excludedRanks.has((member.rank || '').trim()));
}

function calculateKPIs() {
    const eligibleMembers = getEligibleFacultyMembersForKPI();
    const phdEligibleMembers = getEligibleFacultyMembersForKPI({ forPhd: true });
    const eligibleIds = new Set(eligibleMembers.map(m => String(m.id).trim()));
    const totalEligibleMembers = eligibleMembers.length;

    if (totalEligibleMembers === 0) return null;

    const publications = getPublications();
    const awards = getAwards();

    const publishingMembers = new Set();
    publications.forEach(p => {
        const participants = (p.authors_ids || p.participant_ids || '')
            .split('|')
            .map(id => String(id || '').trim())
            .filter(Boolean);
        participants.forEach(id => {
            if (eligibleIds.has(id)) publishingMembers.add(id);
        });
    });
    const publishingRate = (publishingMembers.size / totalEligibleMembers) * 100;

    const pubPerMember = publications.length / totalEligibleMembers;

    let totalCitations = 0;
    publications.forEach(p => {
        totalCitations += getCitationsEstimate(p.citations_range);
    });
    const citationsPerPublication = publications.length > 0 ? (totalCitations / publications.length) : 0;

    const studentPubs = publications.filter(p => p.student_author === 'نعم' || p.category === 'بحوث الطلاب').length;
    const totalStudents = data.students.reduce((sum, s) => sum + parseInt(s.count || 0), 0);
    const studentPubRate = totalStudents > 0 ? (studentPubs / totalStudents) * 100 : 0;

    const phdCount = data.theses.filter(t => t.type === 'دكتوراه').length;
    const mastersCount = data.theses.filter(t => t.type === 'ماجستير').length;
    const mastersSupervisionRate = mastersCount / Math.max(eligibleMembers.length, 1);
    const phdSupervisionRate = phdCount / Math.max(phdEligibleMembers.length, 1);
    const supervisionRate = mastersSupervisionRate + phdSupervisionRate;

    const awardsCount = awards.filter(a => a.category === 'جائزة').length;
    const patentsCount = awards.filter(a => a.category === 'براءة اختراع').length;
    const innovation = awardsCount + patentsCount;

    return {
        publishingRate: publishingRate.toFixed(1),
        pubPerMember: pubPerMember.toFixed(1),
        citationsPerPublication: citationsPerPublication.toFixed(1),
        studentPubRate: studentPubRate.toFixed(1),
        supervisionRate: supervisionRate.toFixed(1),
        phdCount,
        mastersCount,
        innovation,
        awards: awardsCount,
        patents: patentsCount,
        eligibleFacultyCount: eligibleMembers.length,
        phdEligibleFacultyCount: phdEligibleMembers.length
    };
}

// ========================================
// جمع آخر النشاطات
// ========================================
function getRecentActivities(limit = 10) {
    const activities = [];
    
    // البحوث العلمية من publications.csv
    if (data.publications && data.publications.length > 0) {
        data.publications.forEach(p => {
            const dateValue = p.publish_date || p.date;
            activities.push({
                type: 'بحث منشور',
                icon: '📄',
                title: p.title,
                meta: p.journal || '',
                date: dateValue,
                sortableDate: getSortableDateValue(dateValue),
                entity: 'publications',
                record: p,
                cssClass: 'publication'
            });
        });
    }
    
    // المشاركات من participations.csv
    data.participations.forEach(p => {
        let icon = '📄';
        let title = p.title;
        let meta = p.location;
        
        switch(p.category) {
            case 'بحوث الطلاب':
                icon = '🎓';
                meta = p.location;
                break;
            case 'مؤتمر':
                icon = '🎤';
                break;
            case 'ندوة':
                icon = '💬';
                break;
            case 'ورشة عمل':
                icon = '🛠️';
                break;
            case 'مناقشة خارجية':
                icon = '📋';
                break;
            case 'تحكيم علمي':
                icon = '✅';
                break;
            case 'جائزة':
                icon = '🏆';
                meta = p.location;
                break;
            case 'براءة اختراع':
                icon = '💡';
                meta = p.location;
                break;
        }
        
        const activityClass = (p.category === 'جائزة' || p.category === 'براءة اختراع') ? 'award' : 'event';
        activities.push({
            type: p.category,
            icon,
            title,
            meta,
            date: p.date,
            sortableDate: getSortableDateValue(p.date),
            entity: 'participations',
            record: p,
            cssClass: activityClass
        });
    });
    
    // الرسائل المنجزة
    data.theses.filter(t => t.status === 'منجزة').forEach(t => {
        activities.push({
            type: 'thesis',
            icon: '🎓',
            title: `مناقشة رسالة ${t.type}: ${t.student_name}`,
            meta: getMemberName(t.supervisor_id),
            date: t.defense_date,
            sortableDate: getSortableDateValue(t.defense_date),
            entity: 'theses',
            record: t,
            cssClass: 'thesis'
        });
    });
    
    activities.sort((a, b) => {
        const diff = (b.sortableDate || -1) - (a.sortableDate || -1);
        if (diff !== 0) return diff;
        return (a.title || '').localeCompare(b.title || '', 'ar');
    });
    
    return activities.slice(0, limit);
}

function getLoggedInEmployeeId() {
    return String(sessionStorage.getItem('employeeId') || '').trim();
}

function getLoggedInEmployeeName() {
    return String(sessionStorage.getItem('employeeName') || '').trim();
}

function splitIds(value) {
    return String(value || '')
        .split('|')
        .map(v => v.trim())
        .filter(Boolean);
}

function getContextOwnerIds(context) {
    if (!context || !context.record) return [];
    const record = context.record;
    if (context.entity === 'publications') {
        return splitIds(record.authors_ids || record.participant_ids);
    }
    if (context.entity === 'participations') {
        return splitIds(record.participant_ids);
    }
    if (context.entity === 'theses') {
        return [
            record.supervisor_id,
            record.co_supervisor_id,
            record.examiner1_id,
            record.examiner2_id
        ]
            .map(id => String(id || '').trim())
            .filter(id => id && /^\d+$/.test(id));
    }
    return [];
}

function canCurrentUserManageRecord(context = currentDetailContext) {
    const empId = getLoggedInEmployeeId();
    if (!empId) return false;
    return getContextOwnerIds(context).includes(empId);
}

function getRecordTitle(context) {
    const record = context?.record || {};
    if (context?.entity === 'theses') return record.title || record.student_name || 'تفاصيل الرسالة';
    return record.title || 'تفاصيل السجل';
}

function getRecordBadgeText(context) {
    const record = context?.record || {};
    if (context?.entity === 'publications') return 'نشر علمي';
    if (context?.entity === 'participations') return record.category || 'فعالية علمية';
    if (context?.entity === 'theses') return (record.type || 'رسالة') + (record.specialization ? ` - ${record.specialization}` : '');
    return 'سجل';
}

function getRecordEntityLabel(entity) {
    if (entity === 'publications') return 'بحث';
    if (entity === 'participations') return 'فعالية';
    if (entity === 'theses') return 'رسالة';
    return 'سجل';
}

function getFieldLabel(field) {
    const labels = {
        id: 'المعرف',
        year: 'السنة',
        title: 'العنوان',
        journal: 'المجلة',
        publish_date: 'تاريخ النشر',
        citations_range: 'الاقتباسات',
        student_author: 'مشاركة طالب',
        authors_ids: 'المؤلفون',
        participant_ids: 'المشاركون',
        category: 'الفئة',
        participation_type: 'نوع المشاركة',
        location: 'المكان',
        date: 'التاريخ',
        organized_by_department: 'تنظيم الكلية',
        student_details: 'تفاصيل الطلاب',
        notes: 'ملاحظات',
        consulting_hours: 'ساعات الاستشارة',
        type: 'نوع الرسالة',
        specialization: 'التخصص',
        student_name: 'الطالب',
        supervisor_id: 'المشرف الرئيسي',
        co_supervisor_id: 'المشرف المشارك',
        examiner1_id: 'المناقش الأول',
        examiner2_id: 'المناقش الثاني',
        status: 'الحالة',
        defense_date: 'تاريخ المناقشة'
    };
    return labels[field] || field;
}

function formatRecordFieldValue(field, value, context) {
    if (value === null || value === undefined || value === '') return '-';

    if (field === 'publish_date' || field === 'date' || field === 'defense_date') {
        return formatDate(String(value));
    }

    if (field === 'authors_ids' || field === 'participant_ids') {
        const names = splitIds(value).map(getMemberName).filter(Boolean);
        return names.length ? names.join('، ') : '-';
    }

    if (['supervisor_id', 'co_supervisor_id', 'examiner1_id', 'examiner2_id'].includes(field)) {
        return getMemberName(String(value));
    }

    if (field === 'citations_range') {
        const estimate = getCitationsEstimate(value);
        return `${value} (تقديريًا ${estimate})`;
    }

    if (field === 'year') {
        return `${value}هـ`;
    }

    return String(value);
}

function getDisplayFieldsForContext(context) {
    const record = context?.record || {};
    if (context?.entity === 'publications') {
        return ['year', 'publish_date', 'journal', 'citations_range', 'student_author', 'authors_ids'];
    }
    if (context?.entity === 'participations') {
        const base = ['year', 'category', 'participation_type', 'date', 'location', 'participant_ids', 'organized_by_department'];
        if (record.student_details) base.push('student_details');
        if (record.consulting_hours) base.push('consulting_hours');
        if (record.notes) base.push('notes');
        return base;
    }
    if (context?.entity === 'theses') {
        return ['year', 'type', 'specialization', 'student_name', 'status', 'defense_date', 'supervisor_id', 'co_supervisor_id', 'examiner1_id', 'examiner2_id'];
    }
    return Object.keys(record || {});
}

function ensureGenericDetailModalHost() {
    let modal = document.getElementById('recordDetailModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'recordDetailModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content record-detail-modal-content"></div>';
    document.body.appendChild(modal);
    return modal;
}

function closeRecordDetailModal() {
    const modal = document.getElementById('recordDetailModal');
    if (modal) modal.classList.remove('active');
}

function buildGenericDetailModalHtml(context) {
    const record = context.record || {};
    const fieldsHtml = getDisplayFieldsForContext(context)
        .filter(field => field !== 'title')
        .map(field => `
            <div class="info-item">
                <span class="info-label">${escapeHtml(getFieldLabel(field))}</span>
                <span class="info-value">${escapeHtml(formatRecordFieldValue(field, record[field], context))}</span>
            </div>
        `)
        .join('');

    const showActions = canCurrentUserManageRecord(context);
    const ownerNames = getContextOwnerIds(context).map(getMemberName).filter(Boolean);
    const modifiedByHtml = getRecordModifiedByHtml(record);

    return `
        <span class="modal-close" onclick="closeRecordDetailModal()">&times;</span>
        <div class="thesis-details generic-record-details">
            <div class="thesis-badge ${context.entity === 'publications' ? 'masters' : 'phd'}">${escapeHtml(getRecordBadgeText(context))}</div>
            <h2>${escapeHtml(getRecordTitle(context))}</h2>
            <div class="thesis-info">
                ${fieldsHtml}
            </div>
            ${ownerNames.length ? `
                <div class="record-owners-note">
                    أصحاب السجل: ${escapeHtml(ownerNames.join('، '))}
                </div>
            ` : ''}
            ${modifiedByHtml}
            <div class="record-detail-actions" id="recordDetailActions" style="display:${showActions ? 'block' : 'none'}">
                <div class="record-detail-actions-note">بعد التحقق بكلمة مرور الصلاحيات يمكنك تعديل هذا ${escapeHtml(getRecordEntityLabel(context.entity))} أو حذفه.</div>
                <div class="modal-actions detail-actions-buttons">
                    <button type="button" class="btn btn-secondary" onclick="openCurrentRecordEditor()">✏️ تعديل</button>
                    <button type="button" class="btn btn-danger" onclick="confirmDeleteCurrentRecord()">🗑️ حذف</button>
                </div>
            </div>
        </div>
    `;
}

function openGenericRecordDetails(context) {
    if (!context || !context.record) return;
    currentDetailContext = context;
    const modal = ensureGenericDetailModalHost();
    const content = modal.querySelector('.record-detail-modal-content');
    content.innerHTML = buildGenericDetailModalHtml(context);
    modal.classList.add('active');
    updateDetailActionAvailability();
}

function showPublicationDetails(publication) {
    openGenericRecordDetails({ entity: 'publications', record: publication, modalKind: 'generic' });
}

function showEventDetails(eventRecord) {
    openGenericRecordDetails({ entity: 'participations', record: eventRecord, modalKind: 'generic' });
}

function showRecentActivityDetails(activity) {
    if (!activity || !activity.record) return;
    if (activity.entity === 'theses') {
        showThesisDetails(activity.record);
        return;
    }
    if (activity.entity === 'publications') {
        showPublicationDetails(activity.record);
        return;
    }
    if (activity.entity === 'participations') {
        showEventDetails(activity.record);
    }
}

function ensureThesisDetailActions() {
    const modal = document.getElementById('thesisModal');
    if (!modal) return;
    const container = modal.querySelector('.thesis-details');
    if (!container || container.querySelector('#thesisDetailActions')) return;

    container.insertAdjacentHTML('beforeend', `
        <div class="record-detail-actions" id="thesisDetailActions" style="display:none">
            <div class="record-detail-actions-note">بعد التحقق بكلمة مرور الصلاحيات يمكنك تعديل هذه الرسالة أو حذفها إذا كانت مرتبطة بك.</div>
            <div class="modal-actions detail-actions-buttons">
                <button type="button" class="btn btn-secondary" onclick="openCurrentRecordEditor()">✏️ تعديل</button>
                <button type="button" class="btn btn-danger" onclick="confirmDeleteCurrentRecord()">🗑️ حذف</button>
            </div>
        </div>
    `);
}

function updateDetailActionAvailability() {
    const canManage = canCurrentUserManageRecord(currentDetailContext);
    const genericActions = document.getElementById('recordDetailActions');
    if (genericActions) {
        genericActions.style.display = (currentDetailContext?.modalKind === 'generic' && canManage) ? 'block' : 'none';
    }
    const thesisActions = document.getElementById('thesisDetailActions');
    if (thesisActions) {
        thesisActions.style.display = (currentDetailContext?.entity === 'theses' && canManage) ? 'block' : 'none';
    }
}

function ensurePrivilegePasswordModal() {
    let modal = document.getElementById('privilegePasswordModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'privilegePasswordModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content record-editor-modal-content privilege-modal-content">
            <span class="modal-close" onclick="closePrivilegePasswordModal()">&times;</span>
            <div class="editor-modal-header">
                <h3>كلمة مرور الصلاحيات</h3>
                <p>أدخل كلمة المرور للمتابعة إلى التعديل أو الحذف.</p>
            </div>
            <div class="form-group">
                <label for="privilegePasswordInput">كلمة المرور</label>
                <input type="password" id="privilegePasswordInput" class="form-input">
            </div>
            <p id="privilegePasswordError" class="login-error" style="margin-top:-8px;"></p>
            <div class="modal-actions detail-actions-buttons">
                <button type="button" class="btn btn-secondary" onclick="closePrivilegePasswordModal()">إلغاء</button>
                <button type="button" class="btn btn-primary" onclick="submitPrivilegePassword()">تحقق</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function requestPrivilegeAccess(callback) {
    privilegeActionCallback = typeof callback === 'function' ? callback : null;
    const modal = ensurePrivilegePasswordModal();
    const input = modal.querySelector('#privilegePasswordInput');
    const error = modal.querySelector('#privilegePasswordError');
    if (error) error.textContent = '';
    if (input) input.value = '';
    if (input) {
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitPrivilegePassword();
            }
        };
    }
    modal.classList.add('active');
    setTimeout(() => input?.focus(), 0);
}

function closePrivilegePasswordModal() {
    const modal = document.getElementById('privilegePasswordModal');
    if (modal) modal.classList.remove('active');
    privilegeActionCallback = null;
}

function submitPrivilegePassword() {
    const modal = document.getElementById('privilegePasswordModal');
    if (!modal) return;
    const input = modal.querySelector('#privilegePasswordInput');
    const error = modal.querySelector('#privilegePasswordError');
    const pass = input?.value || '';

    if (normalizeArabicDigits(pass) !== PRIVILEGE_PASSWORD) {
        if (error) error.textContent = 'كلمة مرور الصلاحيات غير صحيحة';
        input?.focus();
        return;
    }

    const callback = privilegeActionCallback;
    closePrivilegePasswordModal();
    if (typeof callback === 'function') callback();
}

function getEditorFieldsForContext(context) {
    const record = context?.record || {};
    const preferred = {
        publications: ['year', 'title', 'journal', 'publish_date', 'citations_range', 'student_author', 'authors_ids'],
        participations: ['year', 'category', 'participation_type', 'title', 'location', 'date', 'participant_ids', 'organized_by_department', 'student_details', 'consulting_hours', 'notes'],
        theses: ['year', 'type', 'specialization', 'student_name', 'title', 'supervisor_id', 'co_supervisor_id', 'examiner1_id', 'examiner2_id', 'status', 'defense_date']
    }[context?.entity] || [];

    const existingKeys = Object.keys(record).filter(key => key && key !== 'id');
    const ordered = [
        ...preferred.filter(key => existingKeys.includes(key)),
        ...existingKeys.filter(key => !preferred.includes(key))
    ];
    return ordered;
}

function getEditorInputType(field) {
    if (['publish_date', 'date', 'defense_date'].includes(field)) return 'date';
    if (field === 'notes' || field === 'title') return 'textarea';
    return 'text';
}

function ensureRecordEditorModal() {
    let modal = document.getElementById('recordEditorModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'recordEditorModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content record-editor-modal-content"></div>';
    document.body.appendChild(modal);
    return modal;
}

function closeRecordEditModal() {
    const modal = document.getElementById('recordEditorModal');
    if (modal) modal.classList.remove('active');
    currentEditContext = null;
}

function buildRecordEditorModalHtml(context) {
    const record = context.record || {};
    const fields = getEditorFieldsForContext(context);
    const fieldsHtml = fields.map(field => {
        const type = getEditorInputType(field);
        const value = String(record[field] ?? '');
        if (type === 'textarea') {
            return `
                <div class="form-group editor-form-group full">
                    <label>${escapeHtml(getFieldLabel(field))}</label>
                    <textarea class="form-textarea" data-edit-field="${escapeHtml(field)}">${escapeHtml(value)}</textarea>
                </div>
            `;
        }
        return `
            <div class="form-group editor-form-group">
                <label>${escapeHtml(getFieldLabel(field))}</label>
                <input type="${type}" class="form-input" data-edit-field="${escapeHtml(field)}" value="${escapeHtml(value)}">
            </div>
        `;
    }).join('');

    return `
        <span class="modal-close" onclick="closeRecordEditModal()">&times;</span>
        <div class="editor-modal-header">
            <h3>تعديل ${escapeHtml(getRecordEntityLabel(context.entity))}</h3>
            <p>المعرف: ${escapeHtml(String(record.id || '-'))}</p>
        </div>
        <div class="record-editor-grid">
            ${fieldsHtml}
        </div>
        <div class="modal-actions detail-actions-buttons">
            <button type="button" class="btn btn-secondary" onclick="closeRecordEditModal()">إلغاء</button>
            <button type="button" class="btn btn-success" onclick="submitRecordEdit()">حفظ التعديلات</button>
        </div>
    `;
}

function openCurrentRecordEditor() {
    if (!currentDetailContext || !currentDetailContext.record) return;
    if (!canCurrentUserManageRecord(currentDetailContext)) {
        alert('لا يمكنك تعديل هذا السجل لأنه لا يخص حسابك.');
        return;
    }

    requestPrivilegeAccess(() => {
        currentEditContext = {
            entity: currentDetailContext.entity,
            record: { ...currentDetailContext.record },
            modalKind: currentDetailContext.modalKind
        };
        const modal = ensureRecordEditorModal();
        const content = modal.querySelector('.record-editor-modal-content');
        content.innerHTML = buildRecordEditorModalHtml(currentEditContext);
        modal.classList.add('active');
    });
}

function matchRecordByContext(row, context) {
    if (!row || !context?.record) return false;
    const rowId = String(row.id || '').trim();
    const targetId = String(context.record.id || '').trim();
    if (rowId && targetId) {
        if (rowId !== targetId) return false;
        const rowYear = String(row.year || '').trim();
        const targetYear = String(context.record.year || '').trim();
        if (rowYear && targetYear && rowYear !== targetYear) return false;
        return true;
    }

    // fallback احتياطي عند غياب id
    return String(row.title || '').trim() === String(context.record.title || '').trim()
        && String(row.year || '').trim() === String(context.record.year || '').trim();
}

function replaceRecordInArray(arr, context, updatedRecord) {
    if (!Array.isArray(arr)) return { replaced: false, removed: false };
    const index = arr.findIndex(row => matchRecordByContext(row, context));
    if (index === -1) return { replaced: false, removed: false };
    arr[index] = updatedRecord;
    return { replaced: true, removed: false };
}

function removeRecordFromArray(arr, context) {
    if (!Array.isArray(arr)) return false;
    const index = arr.findIndex(row => matchRecordByContext(row, context));
    if (index === -1) return false;
    arr.splice(index, 1);
    return true;
}

async function syncRecordMutationToSheets(payload) {
    const apiUrl = config.google_sheets_api;
    if (!apiUrl) {
        return { ok: false, skipped: true, message: 'لا يوجد رابط Google Apps Script في الإعدادات' };
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            return { ok: false, message: `HTTP ${response.status}` };
        }

        const rawText = await response.text();
        let result = null;
        try {
            result = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
            result = { raw: rawText };
        }
        return { ok: true, result };
    } catch (error) {
        return { ok: false, message: error.message || 'Network error' };
    }
}

async function logAndSyncRecordChange(action, context, oldRecord, newRecord) {
    const auditEntry = {
        timestamp: new Date().toISOString(),
        actor_id: getLoggedInEmployeeId(),
        actor_name: getLoggedInEmployeeName(),
        action,
        entity: context.entity,
        record_id: String(oldRecord?.id || newRecord?.id || ''),
        year: String(newRecord?.year || oldRecord?.year || ''),
        title: String(newRecord?.title || oldRecord?.title || ''),
        old_values: oldRecord || null,
        new_values: newRecord || null
    };

    localActivityAuditTrail.push(auditEntry);

    return syncRecordMutationToSheets({
        action: 'record_mutation',
        mutation: action,
        entity: context.entity,
        actor: {
            id: auditEntry.actor_id,
            name: auditEntry.actor_name
        },
        record_id: auditEntry.record_id,
        old_record: oldRecord,
        new_record: newRecord,
        audit_log: auditEntry
    });
}

function rerenderAfterRecordMutation(updatedContext = null) {
    renderAll();

    if (!updatedContext) {
        currentDetailContext = null;
        const thesisModal = document.getElementById('thesisModal');
        thesisModal?.classList.remove('active');
        closeRecordDetailModal();
        closeRecordEditModal();
        return;
    }

    if (updatedContext.entity === 'theses') {
        showThesisDetails(updatedContext.record);
    } else {
        openGenericRecordDetails(updatedContext);
    }
}

async function submitRecordEdit() {
    if (!currentEditContext) return;
    const modal = document.getElementById('recordEditorModal');
    if (!modal) return;

    const updatedRecord = { ...currentEditContext.record };
    modal.querySelectorAll('[data-edit-field]').forEach(el => {
        const field = el.getAttribute('data-edit-field');
        updatedRecord[field] = (el.value ?? '').trim();
    });

    const actorId = getLoggedInEmployeeId();
    const actorName = getLoggedInEmployeeName();
    if (actorId || actorName) {
        updatedRecord.last_modified_by_id = actorId;
        updatedRecord.last_modified_by_name = actorName || getMemberName(actorId);
        updatedRecord.last_modified_at = new Date().toISOString();
    }

    const entityKey = currentEditContext.entity;
    replaceRecordInArray(allData[entityKey], currentEditContext, { ...updatedRecord });
    replaceRecordInArray(data[entityKey], currentEditContext, { ...updatedRecord });

    if (entityKey === 'theses' && currentThesis && matchRecordByContext(currentThesis, currentEditContext)) {
        currentThesis = { ...updatedRecord };
    }

    const newContext = { ...currentEditContext, record: { ...updatedRecord } };
    currentDetailContext = newContext;
    closeRecordEditModal();

    const syncResult = await logAndSyncRecordChange('update', currentEditContext, currentEditContext.record, updatedRecord);
    rerenderAfterRecordMutation(newContext);

    if (!syncResult.ok) {
        alert(`تم حفظ التعديل محليًا وتحديث الواجهة، لكن لم يتم تأكيد المزامنة/سجل التعديلات في Google Sheets: ${syncResult.message || 'غير معروف'}`);
    }
}

function confirmDeleteCurrentRecord() {
    if (!currentDetailContext || !currentDetailContext.record) return;
    if (!canCurrentUserManageRecord(currentDetailContext)) {
        alert('لا يمكنك حذف هذا السجل لأنه لا يخص حسابك.');
        return;
    }

    requestPrivilegeAccess(async () => {
        const title = getRecordTitle(currentDetailContext);
        const ok = window.confirm(`تأكيد الحذف:\nهل أنت متأكد من حذف السجل التالي؟\n${title}`);
        if (!ok) return;

        const deleteContext = {
            entity: currentDetailContext.entity,
            record: { ...currentDetailContext.record },
            modalKind: currentDetailContext.modalKind
        };

        removeRecordFromArray(allData[deleteContext.entity], deleteContext);
        removeRecordFromArray(data[deleteContext.entity], deleteContext);

        if (deleteContext.entity === 'theses' && currentThesis && matchRecordByContext(currentThesis, deleteContext)) {
            currentThesis = null;
        }

        const thesisModal = document.getElementById('thesisModal');
        thesisModal?.classList.remove('active');
        closeRecordDetailModal();
        closeRecordEditModal();
        currentDetailContext = null;

        const syncResult = await logAndSyncRecordChange('delete', deleteContext, deleteContext.record, null);
        rerenderAfterRecordMutation(null);

        if (!syncResult.ok) {
            alert(`تم حذف السجل محليًا وتحديث الواجهة، لكن لم يتم تأكيد المزامنة/سجل التعديلات في Google Sheets: ${syncResult.message || 'غير معروف'}`);
        }
    });
}

// ========================================
// دوال العرض
// ========================================
function populateYearSelector() {
    const select = document.getElementById('yearSelect');
    select.innerHTML = '';

    // إضافة خيار "الكل" في البداية
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'الكل';
    if (currentYear === 'all') allOption.selected = true;
    select.appendChild(allOption);

    // إضافة السنوات بترتيب تنازلي (الأحدث أولاً)
    const years = [...(config.available_years || [1446])].sort((a, b) => b - a);
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year + 'هـ';
        if (year === currentYear) option.selected = true;
        select.appendChild(option);
    });
}

function populateDepartmentSelector() {
    const select = document.getElementById('deptSelect');
    if (!select) return;
    select.innerHTML = '';

    // خيار الكل
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'جميع الأقسام';
    if (currentDepartment === 'all') allOption.selected = true;
    select.appendChild(allOption);

    // إضافة الأقسام
    const departments = config.departments || ['القراءات'];
    departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = 'قسم ' + dept;
        if (dept === currentDepartment) option.selected = true;
        select.appendChild(option);
    });
}

function setupDepartmentSelector() {
    const select = document.getElementById('deptSelect');
    if (!select) return;
    select.addEventListener('change', (e) => {
        currentDepartment = e.target.value;
        loadYearData(currentYear);
    });
}

// ========================================
// فلتر البرنامج الأكاديمي
// ========================================
function populateProgramSelector() {
    // ملء فلتر البرنامج في تبويب إحصائيات الشعب
    const selectors = [
        document.getElementById('sectionsProgramFilter'),
        document.getElementById('tblProgramFilter')
    ];

    const programs = config.programs || [];
    const degrees = ['بكالوريوس', 'ماجستير', 'دكتوراه'];

    selectors.forEach(select => {
        if (!select) return;
        const currentVal = select.value || 'all';
        select.innerHTML = '';

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'جميع البرامج';
        select.appendChild(allOption);

        degrees.forEach(deg => {
            const degreePrograms = programs.filter(p => p.degree === deg);
            if (degreePrograms.length === 0) return;
            const group = document.createElement('optgroup');
            group.label = deg;
            degreePrograms.forEach(p => {
                const option = document.createElement('option');
                option.value = p.name + ' - ' + p.degree;
                option.textContent = p.name;
                group.appendChild(option);
            });
            select.appendChild(group);
        });
        select.value = currentVal;
    });
}

function setupProgramSelector() {
    const sectionsFilter = document.getElementById('sectionsProgramFilter');
    if (sectionsFilter) {
        sectionsFilter.addEventListener('change', (e) => {
            currentProgram = e.target.value;
            // إعادة عرض بيانات تبويب إحصائيات الشعب
            renderSectionsTab();
        });
    }
}

// عرض بيانات تبويب إحصائيات الشعب
let sectionsTabInitialized = false;

function renderSectionsTab() {
    if (!teachingData) return;
    if (typeof renderProgramStats === 'function') {
        renderProgramStats();
    }
    renderProgramQualityIndicators();
    ensureCustomSectionsStatsState();
    renderCustomStatsControls();
    if (customSectionsStatsState.lastReport) {
        renderCustomStatsReport(buildCustomStatsReport());
    } else if (customSectionsStatsState.isOpen) {
        renderCustomStatsEmpty('اختر السنوات والمؤشرات ثم أنشئ التقرير.');
    }
}

function getFilteredRecordsForSections() {
    if (!teachingData) return [];
    let records = teachingData.records;
    const yearFilter = document.getElementById('sectionsYearFilter');
    const selectedYear = yearFilter ? yearFilter.value : 'all';
    if (selectedYear !== 'all') {
        const y = parseInt(selectedYear);
        records = records.filter(r => r.y === y);
    }
    return records;
}

function setupSectionsFilters() {
    // تعبئة فلتر السنوات
    const yearFilter = document.getElementById('sectionsYearFilter');
    if (yearFilter) {
        const currentVal = yearFilter.value;
        const years = (teachingData && Array.isArray(teachingData.years))
            ? [...teachingData.years].sort((a, b) => a - b)
            : [];
        yearFilter.innerHTML = '<option value="all">جميع السنوات</option>';
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y + 'هـ';
            yearFilter.appendChild(opt);
        });
        const currentValExists = years.some(y => String(y) === String(currentVal));
        yearFilter.value = currentValExists ? currentVal : 'all';
        yearFilter.onchange = () => renderSectionsTab();
    }

    // تعبئة فلتر البرامج
    populateProgramSelector();
}

function normalizeArabicSearchBase(value) {
    return normalizeArabicDigits(String(value || ''))
        .toLowerCase()
        .replace(/[\u200c-\u200f\u061c]/g, '')
        .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
        .replace(/\u0640/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ء/g, '')
        .replace(/و{2,}/g, 'و')
        .replace(/ي{2,}/g, 'ي')
        .replace(/ى/g, 'ي')
        .replace(/[ةه]/g, 'ه')
        .replace(/\s+/g, '')
        .trim();
}

function normalizeSearchText(value) {
    return normalizeArabicSearchBase(value);
}

function getSearchTokens(value) {
    return normalizeArabicDigits(String(value || ''))
        .split(/\s+/)
        .map(token => normalizeSearchText(token))
        .filter(Boolean);
}

function setupStatCardInteractions() {
    if (statsCardInteractionsBound) return;
    const cards = document.querySelectorAll('.quick-stats .stat-card[data-stat-type]');
    if (!cards.length) return;

    cards.forEach(card => {
        const statType = card.dataset.statType;
        if (!statType) return;

        card.classList.add('clickable-stat-card');
        card.addEventListener('click', () => openDashboardStatDetails(statType));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDashboardStatDetails(statType);
            }
        });
    });

    statsCardInteractionsBound = true;
}

function ensureStatsDetailModal() {
    let modal = document.getElementById('statsDetailModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'statsDetailModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content stats-detail-modal-content"></div>';
    document.body.appendChild(modal);
    return modal;
}

function closeStatsDetailModal() {
    const modal = document.getElementById('statsDetailModal');
    if (modal) modal.classList.remove('active');
    statsDetailState = null;
}

function buildFacultyStatDetailItems() {
    const members = getUniqueActiveFacultyMembers()
        .sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'ar'));

    return members.map((member, index) => {
        const memberId = String(member.id || '').trim();
        const memberName = String(member.name || '').trim() || 'عضو هيئة تدريس';
        const rank = String(member.rank || '').trim();
        const department = String(member.department || '').trim();
        const email = String(member.email || '').trim();

        const subtitleParts = [];
        if (rank) subtitleParts.push(rank);
        if (department) subtitleParts.push(department);

        const metaParts = [];
        if (memberId) metaParts.push(`الرقم الوظيفي: ${memberId}`);
        if (email) metaParts.push(email);

        return {
            title: memberName,
            subtitle: subtitleParts.join(' | '),
            meta: metaParts.join(' | '),
            badge: rank || 'عضو',
            primarySearch: normalizeSearchText(`${memberName} ${memberId}`),
            searchText: normalizeSearchText(`${memberName} ${memberId} ${rank} ${department} ${email}`),
            defaultOrder: index,
            onClick: memberId ? () => {
                closeStatsDetailModal();
                showMemberDetails(memberId);
            } : null
        };
    });
}

function buildPublicationsStatDetailItems() {
    const publications = sortByDateDesc(getPublications(), p => p.publish_date || p.date);
    return publications.map((pub, index) => {
        const authorNames = splitIds(pub.authors_ids || pub.participant_ids)
            .map(id => getMemberName(id))
            .filter(name => name && name !== '-');
        const authorsText = authorNames.length ? authorNames.join('، ') : 'مؤلفون غير محددين';
        const journal = String(pub.journal || pub.location || '').trim() || 'جهة نشر غير محددة';
        const publishDate = formatDate(pub.publish_date || pub.date);
        const title = String(pub.title || '').trim() || 'بحث بدون عنوان';

        return {
            title,
            subtitle: authorsText,
            meta: `${journal} | ${publishDate}`,
            badge: pub.student_author === 'نعم' ? 'طالب مشارك' : 'بحث',
            primarySearch: normalizeSearchText(title),
            searchText: normalizeSearchText(`${title} ${authorsText} ${journal} ${pub.citations_range || ''} ${publishDate}`),
            defaultOrder: index,
            onClick: () => {
                closeStatsDetailModal();
                showPublicationDetails(pub);
            }
        };
    });
}

function buildThesesStatDetailItems() {
    const theses = sortByDateDesc((data.theses || []), t => t.defense_date);
    return theses.map((thesis, index) => {
        const title = String(thesis.title || '').trim() || 'عنوان غير متوفر';
        const studentName = String(thesis.student_name || '').trim() || 'طالب غير محدد';
        const thesisType = getThesisTypeName(thesis.type || 'رسالة', thesis);
        const supervisor = getMemberName(thesis.supervisor_id);
        const defenseDate = formatDate(thesis.defense_date);

        return {
            title,
            subtitle: `${studentName} | ${thesisType}`,
            meta: `المشرف: ${supervisor} | ${defenseDate}`,
            badge: thesis.status || thesis.type || 'رسالة',
            primarySearch: normalizeSearchText(`${title} ${studentName}`),
            searchText: normalizeSearchText(`${title} ${studentName} ${thesis.type || ''} ${thesis.status || ''} ${supervisor} ${defenseDate}`),
            defaultOrder: index,
            onClick: () => {
                closeStatsDetailModal();
                showThesisDetails(thesis);
            }
        };
    });
}

function buildEventsStatDetailItems() {
    const events = sortByDateDesc(getEvents(), eventItem => eventItem.date);
    return events.map((eventItem, index) => {
        const title = String(eventItem.title || '').trim() || (eventItem.category || 'فعالية علمية');
        const category = String(eventItem.category || '').trim() || 'فعالية';
        const participationType = String(eventItem.participation_type || '').trim();
        const location = String(eventItem.location || eventItem.journal || '').trim() || 'مكان غير محدد';
        const eventDate = formatDate(eventItem.date);
        const participantNames = splitIds(eventItem.participant_ids)
            .slice(0, 3)
            .map(id => getMemberName(id))
            .filter(name => name && name !== '-');
        const participantsText = participantNames.length ? participantNames.join('، ') : '';

        const subtitleParts = [category];
        if (participationType) subtitleParts.push(participationType);
        if (participantsText) subtitleParts.push(participantsText);

        return {
            title,
            subtitle: subtitleParts.join(' | '),
            meta: `${location} | ${eventDate}`,
            badge: category,
            primarySearch: normalizeSearchText(`${title} ${category}`),
            searchText: normalizeSearchText(`${title} ${category} ${participationType} ${location} ${participantsText} ${eventDate}`),
            defaultOrder: index,
            onClick: () => {
                closeStatsDetailModal();
                showEventDetails(eventItem);
            }
        };
    });
}

function buildDashboardStatDetailsPayload(statType) {
    if (statType === 'faculty') {
        const items = buildFacultyStatDetailItems();
        return {
            title: 'قائمة أعضاء هيئة التدريس',
            subtitle: `الإجمالي: ${items.length} عضو`,
            placeholder: 'ابحث بالاسم أو الرقم الوظيفي أو الرتبة العلمية...',
            emptyMessage: 'لا توجد نتائج مطابقة في قائمة أعضاء هيئة التدريس.',
            items
        };
    }

    if (statType === 'publications') {
        const items = buildPublicationsStatDetailItems();
        return {
            title: 'تفاصيل البحوث المنشورة',
            subtitle: `الإجمالي: ${items.length} بحث`,
            placeholder: 'ابحث بعنوان البحث أو المؤلفين أو جهة النشر...',
            emptyMessage: 'لا توجد نتائج مطابقة في قائمة البحوث.',
            items
        };
    }

    if (statType === 'theses') {
        const items = buildThesesStatDetailItems();
        return {
            title: 'تفاصيل الرسائل والمشاريع البحثية',
            subtitle: `الإجمالي: ${items.length} سجل`,
            placeholder: 'ابحث بعنوان الرسالة أو اسم الطالب أو المشرف...',
            emptyMessage: 'لا توجد نتائج مطابقة في قائمة الرسائل.',
            items
        };
    }

    if (statType === 'events') {
        const items = buildEventsStatDetailItems();
        return {
            title: 'تفاصيل الفعاليات العلمية',
            subtitle: `الإجمالي: ${items.length} فعالية`,
            placeholder: 'ابحث بعنوان الفعالية أو نوعها أو المكان...',
            emptyMessage: 'لا توجد نتائج مطابقة في قائمة الفعاليات.',
            items
        };
    }

    return null;
}

function calculateStatsDetailSearchScore(item, normalizedQuery, tokens) {
    const primarySearch = item.primarySearch || '';
    const fullSearch = item.searchText || '';
    let score = 0;

    if (!normalizedQuery) return score;

    if (primarySearch === normalizedQuery) score += 1200;
    else if (primarySearch.startsWith(normalizedQuery)) score += 900;
    else if (primarySearch.includes(normalizedQuery)) score += 600;

    if (fullSearch.startsWith(normalizedQuery)) score += 220;
    else if (fullSearch.includes(normalizedQuery)) score += 140;

    tokens.forEach(token => {
        if (!token) return;
        if (primarySearch.startsWith(token)) score += 90;
        else if (primarySearch.includes(token)) score += 60;
        else if (fullSearch.includes(token)) score += 30;
    });

    return score;
}

function createStatsDetailItemElement(item) {
    const element = document.createElement(item.onClick ? 'button' : 'div');
    if (item.onClick) {
        element.type = 'button';
        element.className = 'stats-detail-item clickable';
        element.addEventListener('click', item.onClick);
    } else {
        element.className = 'stats-detail-item';
    }

    const topRow = document.createElement('div');
    topRow.className = 'stats-detail-item-top';

    const titleEl = document.createElement('div');
    titleEl.className = 'stats-detail-item-title';
    titleEl.textContent = item.title || '-';
    topRow.appendChild(titleEl);

    if (item.badge) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'stats-detail-item-badge';
        badgeEl.textContent = item.badge;
        topRow.appendChild(badgeEl);
    }

    element.appendChild(topRow);

    if (item.subtitle) {
        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'stats-detail-item-subtitle';
        subtitleEl.textContent = item.subtitle;
        element.appendChild(subtitleEl);
    }

    if (item.meta) {
        const metaEl = document.createElement('div');
        metaEl.className = 'stats-detail-item-meta';
        metaEl.textContent = item.meta;
        element.appendChild(metaEl);
    }

    return element;
}

function renderDashboardStatDetailsList(query) {
    if (!statsDetailState) return;
    const listContainer = document.getElementById('statsDetailList');
    const counter = document.getElementById('statsDetailCount');
    if (!listContainer || !counter) return;

    const normalizedQuery = normalizeSearchText(query || '');
    const tokens = getSearchTokens(query || '');

    let results = [...statsDetailState.items];
    if (tokens.length > 0) {
        results = results
            .filter(item => tokens.every(token => (item.searchText || '').includes(token)))
            .map(item => ({
                ...item,
                _searchScore: calculateStatsDetailSearchScore(item, normalizedQuery, tokens)
            }))
            .sort((a, b) => {
                const scoreDiff = (b._searchScore || 0) - (a._searchScore || 0);
                if (scoreDiff !== 0) return scoreDiff;
                return (a.defaultOrder || 0) - (b.defaultOrder || 0);
            });
    } else {
        results.sort((a, b) => (a.defaultOrder || 0) - (b.defaultOrder || 0));
    }

    counter.textContent = `النتائج: ${results.length} من ${statsDetailState.items.length}`;
    listContainer.innerHTML = '';

    if (results.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'stats-detail-empty';
        emptyEl.textContent = statsDetailState.emptyMessage || 'لا توجد بيانات مطابقة.';
        listContainer.appendChild(emptyEl);
        return;
    }

    results.forEach(item => {
        listContainer.appendChild(createStatsDetailItemElement(item));
    });
}

function openDashboardStatDetails(statType) {
    const payload = buildDashboardStatDetailsPayload(statType);
    if (!payload) return;

    statsDetailState = payload;
    const modal = ensureStatsDetailModal();
    const content = modal.querySelector('.stats-detail-modal-content');
    if (!content) return;

    content.innerHTML = `
        <span class="modal-close" onclick="closeStatsDetailModal()">&times;</span>
        <div class="stats-detail-header">
            <h3>${escapeHtml(payload.title)}</h3>
            <p class="stats-detail-subtitle">${escapeHtml(payload.subtitle)}</p>
        </div>
        <div class="stats-detail-controls">
            <input type="text" id="statsDetailSearchInput" class="stats-detail-search-input" placeholder="${escapeHtml(payload.placeholder)}" autocomplete="off">
            <div class="stats-detail-count" id="statsDetailCount"></div>
        </div>
        <div class="stats-detail-list" id="statsDetailList"></div>
    `;

    const searchInput = content.querySelector('#statsDetailSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderDashboardStatDetailsList(e.target.value || '');
        });
    }

    modal.classList.add('active');
    renderDashboardStatDetailsList('');
    requestAnimationFrame(() => searchInput?.focus());
}

function renderDashboard() {
    const publications = getPublications();
    const events = getEvents();
    
    document.getElementById('totalFaculty').textContent = data.faculty.filter(f => f.active === 'نعم').length;
    document.getElementById('totalPublications').textContent = publications.length;
    document.getElementById('totalTheses').textContent = data.theses.length;
    document.getElementById('totalEvents').textContent = events.length;

    setupStatCardInteractions();

    renderLeaderboard();
    renderActivities();
    renderDashboardCharts();
}

function renderLeaderboard() {
    currentLeaderboard = getLeaderboard();
    
    // المنصة - الثلاثة الأوائل
    if (currentLeaderboard[0]) {
        const firstName = document.getElementById('first-name');
        firstName.textContent = currentLeaderboard[0].name;
        firstName.style.fontSize = '0.8rem';
        firstName.style.lineHeight = '1.3';
        firstName.style.cursor = 'pointer';
        firstName.onclick = () => showMemberDetails(currentLeaderboard[0].id);
        document.getElementById('first-points').textContent = currentLeaderboard[0].points + ' نقطة';
    }
    if (currentLeaderboard[1]) {
        const secondName = document.getElementById('second-name');
        secondName.textContent = currentLeaderboard[1].name;
        secondName.style.fontSize = '0.8rem';
        secondName.style.lineHeight = '1.3';
        secondName.style.cursor = 'pointer';
        secondName.onclick = () => showMemberDetails(currentLeaderboard[1].id);
        document.getElementById('second-points').textContent = currentLeaderboard[1].points + ' نقطة';
    }
    if (currentLeaderboard[2]) {
        const thirdName = document.getElementById('third-name');
        thirdName.textContent = currentLeaderboard[2].name;
        thirdName.style.fontSize = '0.8rem';
        thirdName.style.lineHeight = '1.3';
        thirdName.style.cursor = 'pointer';
        thirdName.onclick = () => showMemberDetails(currentLeaderboard[2].id);
        document.getElementById('third-points').textContent = currentLeaderboard[2].points + ' نقطة';
    }
    
    const listContainer = document.getElementById('leaderboardList');
    listContainer.innerHTML = '';
    
    // تحديد عدد العناصر للعرض
    const displayCount = showAllLeaderboard ? currentLeaderboard.length : 8;
    const displayItems = currentLeaderboard.slice(3, displayCount);
    
    displayItems.forEach((member, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.style.cursor = 'pointer';
        item.onclick = () => showMemberDetails(member.id);
        item.innerHTML = `
            <span class="leaderboard-rank">${index + 4}</span>
            <span class="leaderboard-name">${member.name}</span>
            <span class="leaderboard-points">${member.points} نقطة</span>
        `;
        listContainer.appendChild(item);
    });
    
    // إضافة زر المزيد/الأقل إذا كان هناك أكثر من 8 أعضاء
    if (currentLeaderboard.length > 8) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'leaderboard-toggle-btn';
        toggleBtn.innerHTML = showAllLeaderboard 
            ? '<span>▲</span> عرض أقل' 
            : `<span>▼</span> عرض الكل (${currentLeaderboard.length - 3})`;
        toggleBtn.onclick = () => {
            showAllLeaderboard = !showAllLeaderboard;
            renderLeaderboard();
        };
        listContainer.appendChild(toggleBtn);
    }
}

// ========================================
// عرض تفاصيل العضو
// ========================================
function computeMemberTeachingSummary(memberId, options = {}) {
    if (typeof teachingData === 'undefined' || !teachingData || !Array.isArray(teachingData.records)) {
        return null;
    }

    const memberIdStr = String(memberId || '').trim();
    const selectedYear = normalizeMemberYearFilter(options.year ?? 'all');
    const memberRecords = teachingData.records.filter(record => {
        if (String(record.fid || '').trim() !== memberIdStr) return false;
        return recordMatchesYear(record, selectedYear);
    });

    let totalSections = 0;
    let totalStudents = 0;
    let totalHours = 0;
    const uniqueCourses = new Set();
    const uniqueYears = new Set();

    memberRecords.forEach(record => {
        uniqueYears.add(record.y);
        (record.cs || []).forEach(course => {
            totalSections += 1;
            uniqueCourses.add((course.cc || course.cn || '').trim());
            totalStudents += Number(course.e) || 0;
            totalHours += Number(course.h) || 0;
        });
    });

    return {
        totalSections,
        totalCourses: uniqueCourses.size,
        totalStudents,
        totalHours,
        totalYears: uniqueYears.size,
        avgStudents: totalSections > 0 ? Math.round(totalStudents / totalSections) : 0
    };
}

function buildMemberTeachingSummaryHtml(summary, { loading = false } = {}) {
    if (loading) {
        return `
            <div class="activity-group member-teaching-summary">
                <h4>🏫 ملخص النشاط التدريسي</h4>
                <div class="member-teaching-empty">جاري تحميل بيانات النشاط التدريسي للعضو...</div>
            </div>
        `;
    }

    if (!summary) {
        return `
            <div class="activity-group member-teaching-summary">
                <h4>🏫 ملخص النشاط التدريسي</h4>
                <div class="member-teaching-empty">لا تتوفر بيانات النشاط التدريسي حالياً.</div>
            </div>
        `;
    }

    if (!summary.totalSections) {
        return `
            <div class="activity-group member-teaching-summary">
                <h4>🏫 ملخص النشاط التدريسي</h4>
                <div class="member-teaching-empty">لا توجد سجلات تدريس لهذا العضو.</div>
            </div>
        `;
    }

    return `
        <div class="activity-group member-teaching-summary">
            <h4>🏫 ملخص النشاط التدريسي</h4>
            <div class="member-teaching-stats">
                <div class="member-teaching-stat"><span class="label">المقررات</span><span class="value">${summary.totalCourses.toLocaleString('ar-SA')}</span></div>
                <div class="member-teaching-stat"><span class="label">الشعب</span><span class="value">${summary.totalSections.toLocaleString('ar-SA')}</span></div>
                <div class="member-teaching-stat"><span class="label">الطلاب</span><span class="value">${summary.totalStudents.toLocaleString('ar-SA')}</span></div>
                <div class="member-teaching-stat"><span class="label">ساعات التدريس</span><span class="value">${summary.totalHours.toLocaleString('ar-SA')}</span></div>
                <div class="member-teaching-stat"><span class="label">متوسط الطلاب/شعبة</span><span class="value">${summary.avgStudents.toLocaleString('ar-SA')}</span></div>
                <div class="member-teaching-stat"><span class="label">سنوات التغطية</span><span class="value">${summary.totalYears.toLocaleString('ar-SA')}</span></div>
            </div>
        </div>
    `;
}

function loadMemberTeachingSummaryIntoModal(memberId, selectedYear = 'all', requestToken = memberModalState.token) {
    if (typeof ensureTeachingLoaded !== 'function') return;

    ensureTeachingLoaded()
        .then(() => {
            const requestedMemberId = String(memberId || '').trim();
            const requestedYear = normalizeMemberYearFilter(selectedYear);
            if (
                memberModalState.memberId !== requestedMemberId ||
                normalizeMemberYearFilter(memberModalState.selectedYear) !== requestedYear ||
                memberModalState.token !== requestToken
            ) {
                return;
            }
            const container = document.getElementById('memberTeachingSummaryContainer');
            if (!container) return;
            const summary = computeMemberTeachingSummary(memberId, { year: requestedYear });
            container.innerHTML = buildMemberTeachingSummaryHtml(summary);
        })
        .catch(() => {
            const requestedMemberId = String(memberId || '').trim();
            const requestedYear = normalizeMemberYearFilter(selectedYear);
            if (
                memberModalState.memberId !== requestedMemberId ||
                normalizeMemberYearFilter(memberModalState.selectedYear) !== requestedYear ||
                memberModalState.token !== requestToken
            ) {
                return;
            }
            const container = document.getElementById('memberTeachingSummaryContainer');
            if (!container) return;
            container.innerHTML = buildMemberTeachingSummaryHtml(null);
        });
}

function showMemberDetails(memberId, selectedYear = 'all') {
    const member = getMemberData(memberId);
    if (!member) return;

    const normalizedMemberId = String(memberId).trim();
    const availableYears = getMemberAvailableYears(normalizedMemberId);
    const normalizedSelectedYear = normalizeMemberYearFilter(selectedYear);
    const resolvedSelectedYear =
        normalizedSelectedYear === 'all' || normalizedSelectedYear === 'current' || availableYears.includes(normalizedSelectedYear)
            ? normalizedSelectedYear
            : 'all';
    const renderToken = memberModalState.token + 1;
    memberModalState = { memberId: normalizedMemberId, selectedYear: resolvedSelectedYear, token: renderToken };

    const { points, breakdown } = calculateMemberPoints(normalizedMemberId, { year: resolvedSelectedYear });
    const memberActivities = getMemberActivities(normalizedMemberId, { year: resolvedSelectedYear });
    const teachingSummary = computeMemberTeachingSummary(normalizedMemberId, { year: resolvedSelectedYear });
    const shouldLoadTeachingSummary = !teachingSummary && typeof ensureTeachingLoaded === 'function';
    const scopeLabel = getMemberScopeLabel(resolvedSelectedYear);
    const hasDetailedActivities = [
        memberActivities.theses,
        memberActivities.publications,
        memberActivities.events,
        memberActivities.externalDiscussions,
        memberActivities.reviewing,
        memberActivities.books,
        memberActivities.consultings,
        memberActivities.media,
        memberActivities.studentResearch,
        memberActivities.awards
    ].some(list => list.length > 0);

    const modalHtml = `
        <div id="memberModal" class="modal active">
            <div class="modal-content member-modal-content">
                <span class="modal-close" onclick="closeMemberModal()">&times;</span>

                <div class="member-header">
                    <div class="member-avatar-large">👨‍🏫</div>
                    <div class="member-info-main">
                        <h2>${member.name}</h2>
                        <span class="member-rank-badge">${member.rank}</span>
                        <span class="member-email">${member.email || ''}</span>
                    </div>
                    <div class="member-points-display">
                        <span class="points-number">${points}</span>
                        <span class="points-label">نقطة</span>
                        <span class="member-points-scope">${scopeLabel}</span>
                    </div>
                </div>

                <div class="member-modal-toolbar">
                    <div class="member-modal-year-filter">
                        <label for="memberModalYearFilter">السنة</label>
                        <select id="memberModalYearFilter" onchange="changeMemberModalYear(this.value)">
                            <option value="all" ${resolvedSelectedYear === 'all' ? 'selected' : ''}>كل السنوات</option>
                            ${availableYears.map(year => `
                                <option value="${year}" ${resolvedSelectedYear === year ? 'selected' : ''}>${formatArabicDigits(year)}هـ</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="member-modal-scope-note">يتم تحديث البحوث والفعاليات والتفاصيل وفق السنة المختارة.</div>
                </div>

                <div class="member-breakdown">
                    <h3>📊 تفصيل النقاط</h3>
                    <div class="breakdown-grid">
                        ${breakdown.phdSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🎓</span>
                            <span class="breakdown-label">إشراف رسالة علمية</span>
                            <span class="breakdown-count">${breakdown.phdSupervision}</span>
                        </div>` : ''}
                        ${breakdown.phdCoSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🎓</span>
                            <span class="breakdown-label">إشراف مشارك (رسالة)</span>
                            <span class="breakdown-count">${breakdown.phdCoSupervision}</span>
                        </div>` : ''}
                        ${breakdown.mastersSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📚</span>
                            <span class="breakdown-label">إشراف مشروع بحثي</span>
                            <span class="breakdown-count">${breakdown.mastersSupervision}</span>
                        </div>` : ''}
                        ${breakdown.mastersCoSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📚</span>
                            <span class="breakdown-label">إشراف مشارك (مشروع)</span>
                            <span class="breakdown-count">${breakdown.mastersCoSupervision}</span>
                        </div>` : ''}
                        ${breakdown.phdDiscussion ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📋</span>
                            <span class="breakdown-label">مناقشة رسالة علمية</span>
                            <span class="breakdown-count">${breakdown.phdDiscussion}</span>
                        </div>` : ''}
                        ${breakdown.mastersDiscussion ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📋</span>
                            <span class="breakdown-label">مناقشة مشروع بحثي</span>
                            <span class="breakdown-count">${breakdown.mastersDiscussion}</span>
                        </div>` : ''}
                        ${breakdown.publications ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📄</span>
                            <span class="breakdown-label">بحوث منشورة</span>
                            <span class="breakdown-count">${breakdown.publications}</span>
                        </div>` : ''}
                        ${breakdown.conferencePaper ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🎤</span>
                            <span class="breakdown-label">مشاركة بورقة</span>
                            <span class="breakdown-count">${breakdown.conferencePaper}</span>
                        </div>` : ''}
                        ${breakdown.seminar ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">💬</span>
                            <span class="breakdown-label">ندوات</span>
                            <span class="breakdown-count">${breakdown.seminar}</span>
                        </div>` : ''}
                        ${breakdown.workshop ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🛠️</span>
                            <span class="breakdown-label">ورش عمل</span>
                            <span class="breakdown-count">${breakdown.workshop}</span>
                        </div>` : ''}
                        ${breakdown.externalDiscussion ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🎓</span>
                            <span class="breakdown-label">مناقشات خارجية</span>
                            <span class="breakdown-count">${breakdown.externalDiscussion}</span>
                        </div>` : ''}
                        ${breakdown.eventOrganization ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📅</span>
                            <span class="breakdown-label">تنظيم فعاليات</span>
                            <span class="breakdown-count">${breakdown.eventOrganization}</span>
                        </div>` : ''}
                        ${breakdown.eventAttendance ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">👥</span>
                            <span class="breakdown-label">حضور فعاليات</span>
                            <span class="breakdown-count">${breakdown.eventAttendance}</span>
                        </div>` : ''}
                        ${breakdown.reviewing ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">✅</span>
                            <span class="breakdown-label">تحكيم علمي</span>
                            <span class="breakdown-count">${breakdown.reviewing}</span>
                        </div>` : ''}
                        ${breakdown.studentResearch ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📝</span>
                            <span class="breakdown-label">بحوث طلاب (إشراف)</span>
                            <span class="breakdown-count">${breakdown.studentResearch}</span>
                        </div>` : ''}
                        ${breakdown.book ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📖</span>
                            <span class="breakdown-label">تأليف كتب</span>
                            <span class="breakdown-count">${breakdown.book}</span>
                        </div>` : ''}
                        ${breakdown.consulting ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">💼</span>
                            <span class="breakdown-label">استشارات (${breakdown.consultingHours || 0} ساعة)</span>
                            <span class="breakdown-count">${breakdown.consulting}</span>
                        </div>` : ''}
                        ${breakdown.media ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📺</span>
                            <span class="breakdown-label">مشاركات إعلامية</span>
                            <span class="breakdown-count">${breakdown.media}</span>
                        </div>` : ''}
                        ${breakdown.award ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🏆</span>
                            <span class="breakdown-label">جوائز</span>
                            <span class="breakdown-count">${breakdown.award}</span>
                        </div>` : ''}
                        ${breakdown.patent ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">💡</span>
                            <span class="breakdown-label">براءات اختراع</span>
                            <span class="breakdown-count">${breakdown.patent}</span>
                        </div>` : ''}
                    </div>
                </div>

                <div class="member-activities-section">
                    <h3>📝 تفاصيل الأنشطة</h3>
                    <div id="memberTeachingSummaryContainer">
                        ${buildMemberTeachingSummaryHtml(teachingSummary, { loading: shouldLoadTeachingSummary })}
                    </div>

                    ${memberActivities.theses.length > 0 ? `
                    <div class="activity-group">
                        <h4>🎓 الرسائل العلمية (${memberActivities.theses.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.theses.map(t => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge ${t.type === 'دكتوراه' ? 'phd' : 'masters'}">${t.type}</span>
                                    <span class="activity-role">${t.role}</span>
                                    <span class="activity-title">${t.student_name} - ${t.title.substring(0, 50)}...</span>
                                    <span class="activity-meta">${formatDate(t.defense_date)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.publications.length > 0 ? `
                    <div class="activity-group">
                        <h4>📄 البحوث المنشورة (${memberActivities.publications.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.publications.map(p => `
                                <div class="activity-item-detail">
                                    <span class="activity-title">${p.title}</span>
                                    <span class="activity-meta">${p.journal || p.location || 'وعاء نشر غير محدد'} - ${formatDate(p.publish_date || p.date)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.events.length > 0 ? `
                    <div class="activity-group">
                        <h4>🎯 الفعاليات العلمية (${memberActivities.events.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.events.map(e => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge event">${e.category}</span>
                                    <span class="activity-title">${e.title}</span>
                                    <span class="activity-meta">${[e.location, e.participation_type, formatDate(e.date)].filter(Boolean).join(' - ')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.externalDiscussions.length > 0 ? `
                    <div class="activity-group">
                        <h4>🎓 المناقشات الخارجية (${memberActivities.externalDiscussions.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.externalDiscussions.map(d => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge discussion">مناقشة خارجية</span>
                                    <span class="activity-title">${d.title}</span>
                                    <span class="activity-meta">${d.location || 'جامعة خارجية'} - ${formatDate(d.date)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.reviewing.length > 0 ? `
                    <div class="activity-group">
                        <h4>✅ التحكيم العلمي (${memberActivities.reviewing.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.reviewing.map(r => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge reviewing">تحكيم</span>
                                    <span class="activity-title">${r.title}</span>
                                    <span class="activity-meta">${[r.location, formatDate(r.date)].filter(Boolean).join(' - ')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.books.length > 0 ? `
                    <div class="activity-group">
                        <h4>📖 التأليف والنشر (${memberActivities.books.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.books.map(b => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge event">تأليف كتب</span>
                                    <span class="activity-title">${b.title}</span>
                                    <span class="activity-meta">${[b.location, formatDate(b.date)].filter(Boolean).join(' - ')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.consultings.length > 0 ? `
                    <div class="activity-group">
                        <h4>💼 الاستشارات العلمية (${memberActivities.consultings.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.consultings.map(c => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge event">استشارة</span>
                                    <span class="activity-title">${c.title}</span>
                                    <span class="activity-meta">${[c.location, c.consulting_hours ? `${c.consulting_hours} ساعة` : '', formatDate(c.date)].filter(Boolean).join(' - ')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.media.length > 0 ? `
                    <div class="activity-group">
                        <h4>📺 المشاركات الإعلامية (${memberActivities.media.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.media.map(m => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge event">إعلام</span>
                                    <span class="activity-title">${m.title}</span>
                                    <span class="activity-meta">${[m.location, formatDate(m.date)].filter(Boolean).join(' - ')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.studentResearch.length > 0 ? `
                    <div class="activity-group">
                        <h4>📝 بحوث الطلاب - إشراف (${memberActivities.studentResearch.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.studentResearch.map(s => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge student">بحث طالب</span>
                                    <span class="activity-title">${s.title}</span>
                                    <span class="activity-meta">${[s.location, formatDate(s.date)].filter(Boolean).join(' - ')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${memberActivities.awards.length > 0 ? `
                    <div class="activity-group">
                        <h4>🏆 الجوائز والتكريمات (${memberActivities.awards.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.awards.map(a => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge award">${a.category}</span>
                                    <span class="activity-title">${a.title}</span>
                                    <span class="activity-meta">${[a.granting_body || a.location, formatDate(a.date)].filter(Boolean).join(' - ')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${!hasDetailedActivities ? `
                    <div class="activity-group">
                        <div class="member-teaching-empty">لا توجد سجلات بحثية أو نشاطات إضافية لهذا العضو في ${scopeLabel}.</div>
                    </div>` : ''}
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('memberModal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    if (shouldLoadTeachingSummary) {
        loadMemberTeachingSummaryIntoModal(normalizedMemberId, resolvedSelectedYear, renderToken);
    }
}

function changeMemberModalYear(value) {
    if (!memberModalState.memberId) return;
    showMemberDetails(memberModalState.memberId, value);
}

// دالة لجمع أنشطة العضو
function getMemberActivities(memberId, options = {}) {
    const memberIdStr = String(memberId).trim();
    const selectedYear = normalizeMemberYearFilter(options.year ?? 'current');
    const scopedTheses = getScopedDataCollection('theses', selectedYear);
    const scopedPublications = getScopedDataCollection('publications', selectedYear);
    const scopedParticipations = getScopedDataCollection('participations', selectedYear);
    
    // الرسائل العلمية
    const theses = [];
    scopedTheses.forEach(t => {
        if (String(t.supervisor_id).trim() === memberIdStr) {
            theses.push({ ...t, role: 'مشرف رئيسي' });
        } else if (String(t.co_supervisor_id).trim() === memberIdStr) {
            theses.push({ ...t, role: 'مشرف مشارك' });
        } else if (String(t.examiner1_id).trim() === memberIdStr || String(t.examiner2_id).trim() === memberIdStr) {
            theses.push({ ...t, role: 'مناقش' });
        }
    });
    
    // البحوث العلمية للأعضاء (من publications.csv)
    const publications = scopedPublications.filter(p => {
        const authors = (p.authors_ids || '').split('|').map(id => id.trim());
        return authors.includes(memberIdStr);
    });
    
    // بحوث الطلاب (من participations.csv)
    const studentResearch = scopedParticipations.filter(p => {
        if (p.category !== 'بحوث الطلاب') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // الفعاليات (مؤتمرات، ندوات، ورش عمل)
    const events = scopedParticipations.filter(p => {
        if (p.category !== 'مؤتمر' && p.category !== 'ندوة' && p.category !== 'ورشة عمل') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // المناقشات الخارجية
    const externalDiscussions = scopedParticipations.filter(p => {
        if (p.category !== 'مناقشة خارجية') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // التحكيم العلمي
    const reviewing = scopedParticipations.filter(p => {
        if (p.category !== 'تحكيم علمي') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });

    // التأليف والنشر (الكتب)
    const books = scopedParticipations.filter(p => {
        if (p.category !== 'تأليف كتب') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });

    // الاستشارات العلمية
    const consultings = scopedParticipations.filter(p => {
        if (p.category !== 'استشارة علمية') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });

    // المشاركات الإعلامية
    const media = scopedParticipations.filter(p => {
        if (p.category !== 'مشاركة إعلامية') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // الجوائز وبراءات الاختراع
    const awards = scopedParticipations.filter(p => {
        if (p.category !== 'جائزة' && p.category !== 'براءة اختراع') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });

    return {
        theses: sortByDateDesc(theses, thesis => thesis.defense_date),
        publications: sortByDateDesc(publications, publication => publication.publish_date || publication.date),
        studentResearch: sortByDateDesc(studentResearch, item => item.date),
        events: sortByDateDesc(events, item => item.date),
        externalDiscussions: sortByDateDesc(externalDiscussions, item => item.date),
        reviewing: sortByDateDesc(reviewing, item => item.date),
        books: sortByDateDesc(books, item => item.date),
        consultings: sortByDateDesc(consultings, item => item.date),
        media: sortByDateDesc(media, item => item.date),
        awards: sortByDateDesc(awards, item => item.date)
    };
}

// دالة إغلاق modal العضو
function closeMemberModal() {
    const modal = document.getElementById('memberModal');
    if (modal) modal.remove();
    memberModalState = { memberId: null, selectedYear: 'all', token: memberModalState.token };
}

// إغلاق modal العضو بالنقر خارجه
document.addEventListener('click', (e) => {
    const memberModal = document.getElementById('memberModal');
    if (e.target === memberModal) {
        closeMemberModal();
    }
});

function renderActivities() {
    const activities = getRecentActivities(10);
    const container = document.getElementById('activitiesTimeline');
    container.innerHTML = '';
    
    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = `activity-item clickable ${activity.cssClass || 'event'}`;
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.innerHTML = `
            <span class="activity-icon">${activity.icon}</span>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-meta">${activity.meta || ''}</div>
                <div class="activity-date">${formatDate(activity.date)}</div>
            </div>
        `;
        item.onclick = () => showRecentActivityDetails(activity);
        item.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showRecentActivityDetails(activity);
            }
        };
        container.appendChild(item);
    });
}

function renderDashboardCharts() {
    const publications = getPublications();
    
    const pubCtx = document.getElementById('publicationsChart');
    if (pubCtx) {
        if (charts.publications) charts.publications.destroy();
        
        const monthlyPubs = new Array(12).fill(0);
        publications.forEach(p => {
            if (p.date) {
                const parts = p.date.split('-');
                const month = parseInt(parts[1]) - 1;
                if (month >= 0 && month < 12) monthlyPubs[month]++;
            }
        });
        
        const hijriMonths = ['محرم', 'صفر', 'ربيع أول', 'ربيع ثاني', 'جمادى أولى', 'جمادى آخرة', 
                           'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
        
        charts.publications = new Chart(pubCtx, {
            type: 'bar',
            data: {
                labels: hijriMonths,
                datasets: [{
                    label: 'عدد البحوث',
                    data: monthlyPubs,
                    backgroundColor: 'rgba(16, 185, 129, 0.6)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: '#9ca3af' },
                        grid: { display: false }
                    }
                }
            }
        });
    }
    
    const thesesCtx = document.getElementById('thesesChart');
    if (thesesCtx) {
        if (charts.theses) charts.theses.destroy();
        
        const scientificCompleted = data.theses.filter(t => isScientificThesis(t) && t.status === 'منجزة').length;
        const scientificOngoing = data.theses.filter(t => isScientificThesis(t) && t.status === 'جارية').length;
        const projectCompleted = data.theses.filter(t => !isScientificThesis(t) && (t.type || '').trim() === 'ماجستير' && t.status === 'منجزة').length;
        const projectOngoing = data.theses.filter(t => !isScientificThesis(t) && (t.type || '').trim() === 'ماجستير' && t.status === 'جارية').length;
        
        charts.theses = new Chart(thesesCtx, {
            type: 'doughnut',
            data: {
                labels: ['رسائل علمية منجزة', 'رسائل علمية جارية', 'مشاريع بحثية منجزة', 'مشاريع بحثية جارية'],
                datasets: [{
                    data: [scientificCompleted, scientificOngoing, projectCompleted, projectOngoing],
                    backgroundColor: [
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(245, 158, 11, 0.4)',
                        'rgba(14, 165, 233, 0.8)',
                        'rgba(14, 165, 233, 0.4)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#9ca3af', padding: 15 }
                    }
                }
            }
        });
    }
}

function renderQualityIndicators() {
    const kpis = calculateKPIs();
    if (!kpis) return;
    
    document.getElementById('kpiPublishingRate').textContent = kpis.publishingRate;
    document.getElementById('kpiPublishingRateBar').style.width = kpis.publishingRate + '%';
    
    document.getElementById('kpiPubPerMember').textContent = kpis.pubPerMember;
    const gaugeWidth = Math.min(parseFloat(kpis.pubPerMember) * 33, 100);
    document.getElementById('kpiPubPerMemberGauge').style.width = gaugeWidth + '%';
    
    document.getElementById('kpiCitations').textContent = kpis.citationsPerPublication;
    
    const miniChart = document.getElementById('kpiCitationsMini');
    miniChart.innerHTML = '';
    const heights = [30, 50, 70, 40, 80, 60, 90];
    heights.forEach(h => {
        const bar = document.createElement('div');
        bar.className = 'kpi-mini-bar';
        bar.style.height = h + '%';
        miniChart.appendChild(bar);
    });
    
    document.getElementById('kpiStudentPub').textContent = kpis.studentPubRate;
    document.getElementById('kpiStudentPubBar').style.width = Math.min(parseFloat(kpis.studentPubRate) * 10, 100) + '%';
    
    document.getElementById('kpiSupervision').textContent = kpis.supervisionRate;
    document.getElementById('kpiPhdCount').textContent = kpis.phdCount;
    document.getElementById('kpiMastersCount').textContent = kpis.mastersCount;
    
    const maxTheses = Math.max(kpis.phdCount, kpis.mastersCount, 1);
    document.getElementById('kpiPhdBar').style.width = (kpis.phdCount / maxTheses * 100) + '%';
    document.getElementById('kpiMastersBar').style.width = (kpis.mastersCount / maxTheses * 100) + '%';
    
    document.getElementById('kpiInnovation').textContent = kpis.innovation;
    const iconsContainer = document.getElementById('kpiInnovationIcons');
    iconsContainer.innerHTML = '';
    for (let i = 0; i < kpis.awards; i++) {
        const icon = document.createElement('span');
        icon.className = 'kpi-icon-item';
        icon.textContent = '🏆';
        icon.style.animationDelay = (i * 0.1) + 's';
        iconsContainer.appendChild(icon);
    }
    for (let i = 0; i < kpis.patents; i++) {
        const icon = document.createElement('span');
        icon.className = 'kpi-icon-item';
        icon.textContent = '💡';
        icon.style.animationDelay = ((kpis.awards + i) * 0.1) + 's';
        iconsContainer.appendChild(icon);
    }
    
    renderQualityRadarChart(kpis);
}

function renderQualityRadarChart(kpis) {
    const ctx = document.getElementById('qualityRadarChart');
    if (!ctx) return;
    
    if (charts.qualityRadar) charts.qualityRadar.destroy();
    
    charts.qualityRadar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['نسبة النشر', 'معدل البحوث', 'الاقتباسات', 'نشر الطلاب', 'الإشراف', 'الابتكار'],
            datasets: [{
                label: 'الأداء الحالي',
                data: [
                    Math.min(parseFloat(kpis.publishingRate), 100),
                    Math.min(parseFloat(kpis.pubPerMember) * 20, 100),
                    Math.min(parseFloat(kpis.citationsPerPublication), 100),
                    Math.min(parseFloat(kpis.studentPubRate) * 10, 100),
                    Math.min(parseFloat(kpis.supervisionRate) * 20, 100),
                    Math.min(kpis.innovation * 10, 100)
                ],
                backgroundColor: 'rgba(198, 169, 98, 0.2)',
                borderColor: 'rgba(198, 169, 98, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(198, 169, 98, 1)'
            }]
        },
        options: {
            responsive: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: '#9ca3af', backdropColor: 'transparent' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: { color: '#e5e7eb', font: { size: 12 } }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ========================================
// أدوات مساعدة لإحصائيات البرامج (تبويب إحصائيات الشعب)
// ========================================
function resetTeachingProgramAggregatesCache() {
    teachingProgramAggregatesCache = null;
}

function getCourseProgramsForCode(code) {
    return courseCodeToPrograms[normalizeCourseCode(code)] || [];
}

function courseBelongsToProgramKey(code, programKey) {
    const set = courseCodeToProgramKeys[normalizeCourseCode(code)];
    return !!(set && set.has(programKey));
}

function detectSectionGender(course) {
    const location = String(course?.l || '').trim();

    // القاعدة المعتمدة: ما يحتوي "طالبات" أو "الطالبات" = إناث، وما عدا ذلك = ذكور
    if (location.includes('طالبات') || location.includes('الطالبات')) return 'female';
    return 'male';
}

function createProgramSectionBucket() {
    return {
        totalSections: 0,
        totalStudents: 0,
        facultySet: new Set(),

        exclusiveSections: 0,
        exclusiveStudents: 0,
        exclusiveFacultySet: new Set(),

        maleSections: 0,
        maleStudents: 0,
        femaleSections: 0,
        femaleStudents: 0,
        unknownSections: 0,
        unknownStudents: 0
    };
}

function getOrCreateProgramBucket(map, key) {
    if (!map[key]) map[key] = createProgramSectionBucket();
    return map[key];
}

function addSectionToProgramBucket(bucket, fid, students, gender, isExclusive) {
    bucket.totalSections++;
    bucket.totalStudents += students;
    bucket.facultySet.add(fid);

    if (!isExclusive) return;

    bucket.exclusiveSections++;
    bucket.exclusiveStudents += students;
    bucket.exclusiveFacultySet.add(fid);

    if (gender === 'female') {
        bucket.femaleSections++;
        bucket.femaleStudents += students;
    } else if (gender === 'male') {
        bucket.maleSections++;
        bucket.maleStudents += students;
    } else {
        bucket.unknownSections++;
        bucket.unknownStudents += students;
    }
}

function buildTeachingProgramAggregates() {
    if (teachingProgramAggregatesCache) return teachingProgramAggregatesCache;

    const aggregate = {
        all: {},
        byYear: {}
    };

    if (!teachingData || !Array.isArray(teachingData.records)) {
        teachingProgramAggregatesCache = aggregate;
        return aggregate;
    }

    teachingData.records.forEach(r => {
        const yearKey = String(r.y);
        if (!aggregate.byYear[yearKey]) aggregate.byYear[yearKey] = {};
        const yearMap = aggregate.byYear[yearKey];

        r.cs.forEach(c => {
            const code = normalizeCourseCode(c.cc);
            if (!code) return;

            const programEntries = getCourseProgramsForCode(code);
            if (!programEntries.length) return;

            const students = Number(c.e) || 0;
            const gender = detectSectionGender(c);

            programEntries.forEach(p => {
                const allBucket = getOrCreateProgramBucket(aggregate.all, p.key);
                const yearBucket = getOrCreateProgramBucket(yearMap, p.key);
                const exclusiveSet = programExclusiveCodes[p.key];
                const isExclusive = !!(exclusiveSet && exclusiveSet.has(code));

                addSectionToProgramBucket(allBucket, r.fid, students, gender, isExclusive);
                addSectionToProgramBucket(yearBucket, r.fid, students, gender, isExclusive);
            });
        });
    });

    teachingProgramAggregatesCache = aggregate;
    return aggregate;
}

function getSectionsSelectedYear() {
    const yearFilter = document.getElementById('sectionsYearFilter');
    return (yearFilter && yearFilter.value) ? yearFilter.value : 'all';
}

function getProgramAggregateMapForSelectedSectionsYear() {
    const aggregate = buildTeachingProgramAggregates();
    const selectedYear = getSectionsSelectedYear();
    if (selectedYear === 'all') return aggregate.all;
    return aggregate.byYear[String(selectedYear)] || {};
}

function getProgramAggregateMapForYear(year) {
    const aggregate = buildTeachingProgramAggregates();
    if (year === 'all') return aggregate.all;
    return aggregate.byYear[String(year)] || {};
}

function finalizeProgramBucket(bucket) {
    const safe = bucket || createProgramSectionBucket();
    const exclusiveSections = safe.exclusiveSections || 0;
    const exclusiveStudents = safe.exclusiveStudents || 0;
    const maleSections = safe.maleSections || 0;
    const femaleSections = safe.femaleSections || 0;
    const unknownSections = safe.unknownSections || 0;

    return {
        totalSections: safe.totalSections || 0,
        totalStudents: safe.totalStudents || 0,
        facultyCount: safe.facultySet ? safe.facultySet.size : 0,
        exclusiveSections,
        exclusiveStudents,
        exclusiveFacultyCount: safe.exclusiveFacultySet ? safe.exclusiveFacultySet.size : 0,
        avgExclusiveStudents: exclusiveSections > 0 ? Math.round(exclusiveStudents / exclusiveSections) : 0,
        maleSections,
        maleStudents: safe.maleStudents || 0,
        avgMaleStudents: maleSections > 0 ? Math.round((safe.maleStudents || 0) / maleSections) : 0,
        femaleSections,
        femaleStudents: safe.femaleStudents || 0,
        avgFemaleStudents: femaleSections > 0 ? Math.round((safe.femaleStudents || 0) / femaleSections) : 0,
        unknownSections,
        unknownStudents: safe.unknownStudents || 0,
        avgUnknownStudents: unknownSections > 0 ? Math.round((safe.unknownStudents || 0) / unknownSections) : 0
    };
}

// ========================================
// مؤشرات البرامج الأكاديمية (تبويب إحصائيات الشعب)
// ========================================
let programQualityCharts = {};
const CUSTOM_STATS_DEFAULT_METRICS = ['faculty_count', 'publications_count', 'teaching_faculty_count', 'sections_count', 'students_count'];
const CUSTOM_STATS_EVENT_CATEGORIES = new Set([
    'مؤتمر',
    'ندوة',
    'ورشة عمل',
    'تحكيم علمي',
    'تأليف كتب',
    'استشارة علمية',
    'مشاركة إعلامية',
    'مناقشة خارجية',
    'جائزة',
    'براءة اختراع',
    'بحوث الطلاب'
]);
let customSectionsStatsState = null;

function renderProgramQualityIndicators() {
    const grid = document.getElementById('programQualityGrid');
    if (!grid) return;

    if (!teachingData || typeof courseCodeToPrograms === 'undefined') {
        grid.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">جاري تحميل بيانات التدريس...</p>';
        return;
    }

    const selectedYear = getSectionsSelectedYear();
    const selectedProgram = currentProgram || 'all';
    const programs = (typeof config !== 'undefined' && config.programs) || [];
    const stats = [];
    const degreeOrder = { 'بكالوريوس': 0, 'ماجستير': 1, 'دكتوراه': 2 };

    if (selectedProgram !== 'all') {
        const aggregate = buildTeachingProgramAggregates();
        const selectedMeta = programs.find(p => (p.name + ' - ' + p.degree) === selectedProgram);
        const selectedYears = selectedYear === 'all'
            ? [...(teachingData.years || [])].sort((a, b) => a - b)
            : [parseInt(selectedYear, 10)];

        selectedYears.forEach(year => {
            const bucket = aggregate.byYear[String(year)]?.[selectedProgram];
            const m = finalizeProgramBucket(bucket);
            if (m.exclusiveSections <= 0) return;
            stats.push({
                viewMode: 'year',
                key: selectedProgram,
                year,
                name: selectedMeta ? selectedMeta.name : selectedProgram.split(' - ')[0],
                degree: selectedMeta ? selectedMeta.degree : (selectedProgram.split(' - ')[1] || ''),
                ...m
            });
        });
        stats.sort((a, b) => a.year - b.year);
    } else {
        const programMap = getProgramAggregateMapForSelectedSectionsYear();
        programs.forEach(p => {
            const key = p.name + ' - ' + p.degree;
            const m = finalizeProgramBucket(programMap[key]);
            if (m.exclusiveSections <= 0) return;
            stats.push({
                viewMode: 'program',
                key,
                name: p.name,
                degree: p.degree,
                id: p.id,
                ...m
            });
        });
        stats.sort((a, b) => {
            const da = degreeOrder[a.degree] ?? 3;
            const db = degreeOrder[b.degree] ?? 3;
            if (da !== db) return da - db;
            return b.exclusiveSections - a.exclusiveSections;
        });
    }

    const degreeIcons = { 'بكالوريوس': '📘', 'ماجستير': '📗', 'دكتوراه': '📕' };
    const degreeClass = { 'بكالوريوس': 'bsc', 'ماجستير': 'msc', 'دكتوراه': 'phd' };

    if (stats.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">لا توجد بيانات مطابقة للفلتر الحالي.</p>';
        renderProgramQualityCharts([], { selectedProgram, selectedYear });
        return;
    }

    grid.innerHTML = stats.map(s => `
        <div class="program-quality-card">
            <div class="pq-card-header">
                <span class="pq-icon">${degreeIcons[s.degree] || '📄'}</span>
                <div class="pq-title">
                    <h4>${s.name}</h4>
                    <span class="degree-badge degree-${degreeClass[s.degree] || 'other'}">${s.degree}</span>
                </div>
            </div>
            <div class="pq-metrics">
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.avgExclusiveStudents.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">متوسط طلاب/شعبة</span>
                </div>
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.exclusiveSections.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">عدد الشعب</span>
                </div>
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.maleSections.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">شعب الذكور</span>
                </div>
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.avgMaleStudents.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">متوسط الذكور/شعبة</span>
                </div>
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.femaleSections.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">شعب الإناث</span>
                </div>
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.avgFemaleStudents.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">متوسط الإناث/شعبة</span>
                </div>
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.exclusiveFacultyCount.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">أعضاء هيئة التدريس</span>
                </div>
                ${s.unknownSections > 0 ? `
                <div class="pq-metric">
                    <span class="pq-metric-value">${s.unknownSections.toLocaleString('ar-SA')}</span>
                    <span class="pq-metric-label">شعب غير مصنفة</span>
                </div>` : ''}
            </div>
            <div class="pq-year-label">${s.viewMode === 'year' ? `${s.year}هـ` : (selectedYear === 'all' ? 'جميع السنوات' : `${selectedYear}هـ`)}</div>
        </div>
    `).join('');

    renderProgramQualityCharts(stats, { selectedProgram, selectedYear });
}

function setProgramQualityChartTitle(canvasId, title) {
    const canvas = document.getElementById(canvasId);
    const card = canvas?.closest('.chart-card');
    const heading = card?.querySelector('h3');
    if (heading) heading.textContent = title;
}

function renderProgramQualityCharts(stats, context = {}) {
    const { selectedProgram = 'all', selectedYear = 'all' } = context;
    const degreeColors = { 'بكالوريوس': '#4ecdc4', 'ماجستير': '#d4af37', 'دكتوراه': '#e74c3c' };

    const avgCanvas = document.getElementById('programAvgStudentsChart');
    const genderCanvas = document.getElementById('programRatioChart');

    if ((!stats || stats.length === 0)) {
        if (programQualityCharts.avg) { programQualityCharts.avg.destroy(); programQualityCharts.avg = null; }
        if (programQualityCharts.ratio) { programQualityCharts.ratio.destroy(); programQualityCharts.ratio = null; }
        setProgramQualityChartTitle('programAvgStudentsChart', 'لا توجد بيانات للعرض');
        setProgramQualityChartTitle('programRatioChart', 'لا توجد بيانات للعرض');
        return;
    }

    if (selectedProgram !== 'all') {
        setProgramQualityChartTitle('programAvgStudentsChart', 'متوسط الطلاب في شعب الذكور والإناث عبر السنوات');
        setProgramQualityChartTitle('programRatioChart', 'عدد شعب الذكور والإناث عبر السنوات');
    } else {
        setProgramQualityChartTitle('programAvgStudentsChart', 'متوسط عدد الطلاب في الشعبة لكل برنامج');
        setProgramQualityChartTitle('programRatioChart', `شعب الذكور والإناث لكل برنامج${selectedYear === 'all' ? '' : ` - ${selectedYear}هـ`}`);
    }

    // مخطط المتوسطات
    if (avgCanvas) {
        if (programQualityCharts.avg) programQualityCharts.avg.destroy();
        if (selectedProgram !== 'all') {
            const labels = stats.map(s => `${s.year}هـ`);
            programQualityCharts.avg = new Chart(avgCanvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'متوسط الذكور/شعبة',
                            data: stats.map(s => s.avgMaleStudents),
                            backgroundColor: 'rgba(78,205,196,0.7)',
                            borderColor: '#4ecdc4',
                            borderWidth: 1
                        },
                        {
                            label: 'متوسط الإناث/شعبة',
                            data: stats.map(s => s.avgFemaleStudents),
                            backgroundColor: 'rgba(212,175,55,0.7)',
                            borderColor: '#d4af37',
                            borderWidth: 1
                        },
                        {
                            label: 'متوسط عام',
                            data: stats.map(s => s.avgExclusiveStudents),
                            type: 'line',
                            borderColor: '#e74c3c',
                            backgroundColor: 'rgba(231,76,60,0.15)',
                            yAxisID: 'y',
                            tension: 0.25
                        }
                    ]
                },
                options: {
                    responsive: true, animation: { duration: 0 },
                    plugins: { legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } } } },
                    scales: {
                        x: { ticks: { color: '#e0e0e0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { beginAtZero: true, ticks: { color: '#e0e0e0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                }
            });
        } else {
            const labels = stats.map(s => s.name + ' (' + s.degree.charAt(0) + ')');
            const bgColors = stats.map(s => (degreeColors[s.degree] || '#9ca3af') + '99');
            const borderColorsList = stats.map(s => degreeColors[s.degree] || '#9ca3af');

            programQualityCharts.avg = new Chart(avgCanvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'متوسط طلاب/شعبة',
                        data: stats.map(s => s.avgExclusiveStudents),
                        backgroundColor: bgColors,
                        borderColor: borderColorsList,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true, animation: { duration: 0 }, indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    const s = stats[ctx.dataIndex];
                                    return [
                                        `متوسط عام: ${s.avgExclusiveStudents.toLocaleString('ar-SA')}`,
                                        `متوسط الذكور: ${s.avgMaleStudents.toLocaleString('ar-SA')}`,
                                        `متوسط الإناث: ${s.avgFemaleStudents.toLocaleString('ar-SA')}`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { color: '#e0e0e0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { ticks: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                }
            });
        }
    }

    // مخطط شعب الذكور/الإناث
    if (genderCanvas) {
        if (programQualityCharts.ratio) programQualityCharts.ratio.destroy();

        const labels = selectedProgram !== 'all'
            ? stats.map(s => `${s.year}هـ`)
            : stats.map(s => s.name + ' (' + s.degree.charAt(0) + ')');

        const datasets = [
            {
                label: 'شعب الذكور',
                data: stats.map(s => s.maleSections),
                backgroundColor: 'rgba(78,205,196,0.7)',
                borderColor: '#4ecdc4',
                borderWidth: 1
            },
            {
                label: 'شعب الإناث',
                data: stats.map(s => s.femaleSections),
                backgroundColor: 'rgba(212,175,55,0.7)',
                borderColor: '#d4af37',
                borderWidth: 1
            }
        ];

        if (stats.some(s => s.unknownSections > 0)) {
            datasets.push({
                label: 'غير مصنفة',
                data: stats.map(s => s.unknownSections),
                backgroundColor: 'rgba(156,163,175,0.6)',
                borderColor: '#9ca3af',
                borderWidth: 1
            });
        }

        programQualityCharts.ratio = new Chart(genderCanvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                animation: { duration: 0 },
                indexAxis: selectedProgram === 'all' ? 'y' : 'x',
                plugins: {
                    legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } } },
                    tooltip: {
                        callbacks: {
                            afterBody: function(items) {
                                const idx = items?.[0]?.dataIndex ?? 0;
                                const s = stats[idx];
                                return [
                                    `متوسط الذكور/شعبة: ${s.avgMaleStudents.toLocaleString('ar-SA')}`,
                                    `متوسط الإناث/شعبة: ${s.avgFemaleStudents.toLocaleString('ar-SA')}`,
                                    `متوسط عام: ${s.avgExclusiveStudents.toLocaleString('ar-SA')}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, ticks: { color: '#e0e0e0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { beginAtZero: true, ticks: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }
}

function parseCustomStatsYear(value) {
    const parsed = parseInt(normalizeArabicDigits(String(value ?? '')).trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatCustomStatsNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
        ? numericValue.toLocaleString('ar-SA')
        : String(value ?? '-');
}

function formatCustomStatsYearLabel(year) {
    return `${formatCustomStatsNumber(year)}هـ`;
}

function formatCustomStatsYearsLabel(years) {
    const labels = years.map(formatCustomStatsYearLabel);
    if (labels.length <= 3) return labels.join('، ');
    return `${labels.slice(0, 3).join('، ')} ...`;
}

function getCustomStatsProgramLabel(programKey = currentProgram || 'all') {
    if (!programKey || programKey === 'all') return 'جميع البرامج';
    return programKey;
}

function getCustomStatsDepartmentLabel() {
    return currentDepartment === 'all' ? 'جميع الأقسام' : `قسم ${currentDepartment}`;
}

function getCustomStatsAvailableYears() {
    const years = new Set();

    (config.available_years || []).forEach(year => {
        const parsedYear = parseCustomStatsYear(year);
        if (parsedYear !== null) years.add(parsedYear);
    });

    if (teachingData && Array.isArray(teachingData.years)) {
        teachingData.years.forEach(year => {
            const parsedYear = parseCustomStatsYear(year);
            if (parsedYear !== null) years.add(parsedYear);
        });
    }

    ['faculty', 'publications', 'theses', 'participations'].forEach(key => {
        (allData[key] || []).forEach(record => {
            const parsedYear = parseCustomStatsYear(record?.year);
            if (parsedYear !== null) years.add(parsedYear);
        });
    });

    return Array.from(years).sort((a, b) => b - a);
}

function getDefaultCustomStatsYears() {
    const availableYears = getCustomStatsAvailableYears();
    if (availableYears.length === 0) return [];

    const sectionsYear = getSectionsSelectedYear();
    const parsedSectionsYear = sectionsYear !== 'all' ? parseCustomStatsYear(sectionsYear) : null;
    if (parsedSectionsYear !== null && availableYears.includes(parsedSectionsYear)) {
        return [parsedSectionsYear];
    }

    const parsedCurrentYear = currentYear !== 'all' ? parseCustomStatsYear(currentYear) : null;
    if (parsedCurrentYear !== null && availableYears.includes(parsedCurrentYear)) {
        return [parsedCurrentYear];
    }

    return [availableYears[0]];
}

function ensureCustomSectionsStatsState() {
    const availableYears = getCustomStatsAvailableYears();
    const availableMetricKeys = getCustomStatsMetricDefinitions().map(metric => metric.key);

    if (!customSectionsStatsState) {
        customSectionsStatsState = {
            isOpen: false,
            reportMode: 'summary',
            detailMode: 'summary',
            selectedYears: getDefaultCustomStatsYears(),
            selectedMetrics: [...CUSTOM_STATS_DEFAULT_METRICS],
            lastReport: null
        };
    }

    customSectionsStatsState.selectedYears = (customSectionsStatsState.selectedYears || [])
        .map(parseCustomStatsYear)
        .filter(year => year !== null && availableYears.includes(year));

    if (customSectionsStatsState.selectedYears.length === 0) {
        customSectionsStatsState.selectedYears = getDefaultCustomStatsYears();
    }

    customSectionsStatsState.selectedMetrics = (customSectionsStatsState.selectedMetrics || [])
        .filter(key => availableMetricKeys.includes(key));

    if (customSectionsStatsState.selectedMetrics.length === 0) {
        customSectionsStatsState.selectedMetrics = [...CUSTOM_STATS_DEFAULT_METRICS];
    }
}

function getCustomStatsMetricDefinitions() {
    const sharedScopeLabel = getCustomStatsDepartmentLabel();
    const teachingScopeLabel = currentProgram === 'all'
        ? `${getCustomStatsDepartmentLabel()} - النشاط التدريسي`
        : `${getCustomStatsDepartmentLabel()} - ${getCustomStatsProgramLabel()}`;

    return [
        {
            key: 'faculty_count',
            label: 'عدد أعضاء هيئة التدريس',
            description: 'الأعضاء الفاعلون في السنوات المحددة',
            scopeLabel: sharedScopeLabel,
            compute(context) {
                return {
                    value: context.activeFaculty.length,
                    details: context.activeFaculty.map(member => `${member.name}${member.rank ? ` - ${member.rank}` : ''}`),
                    scopeLabel: sharedScopeLabel
                };
            }
        },
        {
            key: 'publications_count',
            label: 'عدد البحوث المنشورة',
            description: 'بحوث الأعضاء المنشورة',
            scopeLabel: sharedScopeLabel,
            compute(context) {
                return {
                    value: context.publications.length,
                    details: context.publications.map(pub => {
                        const journal = String(pub.journal || '').trim();
                        return `${pub.title || 'بحث بدون عنوان'}${journal ? ` - ${journal}` : ''}`;
                    }),
                    scopeLabel: sharedScopeLabel
                };
            }
        },
        {
            key: 'student_research_count',
            label: 'عدد بحوث الطلاب',
            description: 'الإشراف على نشر أبحاث الطلاب',
            scopeLabel: sharedScopeLabel,
            compute(context) {
                return {
                    value: context.studentResearch.length,
                    details: context.studentResearch.map(item => item.title || 'بحث طلابي'),
                    scopeLabel: sharedScopeLabel
                };
            }
        },
        {
            key: 'theses_total_count',
            label: 'عدد الرسائل والمشاريع',
            description: 'جميع الرسائل والمشاريع البحثية المرتبطة بالقسم',
            scopeLabel: sharedScopeLabel,
            compute(context) {
                return {
                    value: context.theses.length,
                    details: context.theses.map(thesis => `${thesis.student_name || 'طالب'} - ${thesis.title || 'عنوان غير متوفر'}`),
                    scopeLabel: sharedScopeLabel
                };
            }
        },
        {
            key: 'scientific_theses_count',
            label: 'عدد الرسائل العلمية',
            description: 'الدكتوراه والماجستير المصنف كرسالة علمية',
            scopeLabel: sharedScopeLabel,
            compute(context) {
                return {
                    value: context.scientificTheses.length,
                    details: context.scientificTheses.map(thesis => `${thesis.student_name || 'طالب'} - ${thesis.title || 'عنوان غير متوفر'}`),
                    scopeLabel: sharedScopeLabel
                };
            }
        },
        {
            key: 'research_projects_count',
            label: 'عدد المشاريع البحثية',
            description: 'مشاريع الماجستير المصنفة كمشروع بحثي',
            scopeLabel: sharedScopeLabel,
            compute(context) {
                return {
                    value: context.researchProjects.length,
                    details: context.researchProjects.map(thesis => `${thesis.student_name || 'طالب'} - ${thesis.title || 'عنوان غير متوفر'}`),
                    scopeLabel: sharedScopeLabel
                };
            }
        },
        {
            key: 'events_count',
            label: 'عدد الفعاليات العلمية',
            description: 'المؤتمرات والندوات والورش وسائر الأنشطة العلمية',
            scopeLabel: sharedScopeLabel,
            compute(context) {
                return {
                    value: context.events.length,
                    details: context.events.map(eventItem => `${eventItem.category || 'فعالية'} - ${eventItem.title || 'بدون عنوان'}`),
                    scopeLabel: sharedScopeLabel
                };
            }
        },
        {
            key: 'teaching_faculty_count',
            label: 'عدد أعضاء التدريس في الشعب',
            description: 'الأعضاء الذين لديهم نشاط تدريسي فعلي في النطاق المختار',
            scopeLabel: teachingScopeLabel,
            compute(context) {
                return {
                    value: context.teaching.facultyCount,
                    details: context.teaching.facultyDetails.map(item => `${item.name} - ${formatCustomStatsNumber(item.sections)} شعبة`),
                    scopeLabel: teachingScopeLabel
                };
            }
        },
        {
            key: 'sections_count',
            label: 'عدد الشعب التدريسية',
            description: 'إجمالي الشعب المرتبطة بالنطاق المختار',
            scopeLabel: teachingScopeLabel,
            compute(context) {
                return {
                    value: context.teaching.totalSections,
                    details: context.teaching.sectionDetails.map(item => `${item.courseName}${item.courseCode ? ` (${item.courseCode})` : ''} - ${item.facultyName} - ${formatCustomStatsNumber(item.students)} طالب - ${formatCustomStatsNumber(item.hours)} ساعة`),
                    scopeLabel: teachingScopeLabel
                };
            }
        },
        {
            key: 'courses_count',
            label: 'عدد المقررات',
            description: 'المقررات الفريدة ضمن الشعب المختارة',
            scopeLabel: teachingScopeLabel,
            compute(context) {
                return {
                    value: context.teaching.totalCourses,
                    details: context.teaching.courseDetails.map(item => `${item.name}${item.code ? ` (${item.code})` : ''} - ${formatCustomStatsNumber(item.sections)} شعبة - ${formatCustomStatsNumber(item.students)} طالب`),
                    scopeLabel: teachingScopeLabel
                };
            }
        },
        {
            key: 'students_count',
            label: 'عدد الطلاب',
            description: 'إجمالي طلاب الشعب ضمن النطاق المختار',
            scopeLabel: teachingScopeLabel,
            compute(context) {
                return {
                    value: context.teaching.totalStudents,
                    details: context.teaching.courseDetails.map(item => `${item.name}${item.code ? ` (${item.code})` : ''} - ${formatCustomStatsNumber(item.students)} طالب`),
                    scopeLabel: teachingScopeLabel
                };
            }
        },
        {
            key: 'teaching_hours',
            label: 'ساعات التدريس',
            description: 'مجموع الساعات المعتمدة في الشعب المختارة',
            scopeLabel: teachingScopeLabel,
            compute(context) {
                return {
                    value: context.teaching.totalHours,
                    details: context.teaching.courseDetails.map(item => `${item.name}${item.code ? ` (${item.code})` : ''} - ${formatCustomStatsNumber(item.hours)} ساعة`),
                    scopeLabel: teachingScopeLabel
                };
            }
        }
    ];
}

function getCustomStatsMetricDefinitionMap() {
    const map = new Map();
    getCustomStatsMetricDefinitions().forEach(metric => map.set(metric.key, metric));
    return map;
}

function customStatsRecordMatchesYears(recordYear, selectedYearSet) {
    const parsedYear = parseCustomStatsYear(recordYear);
    return parsedYear !== null && selectedYearSet.has(parsedYear);
}

function customStatsRecordMatchesDepartment(idsFieldValue, deptIds) {
    if (!deptIds) return true;
    const ids = splitIds(idsFieldValue || '');
    return ids.some(id => deptIds.has(id));
}

function buildCustomStatsTeachingScope(selectedYearSet, deptIds, programKey) {
    const result = {
        totalSections: 0,
        totalStudents: 0,
        totalHours: 0,
        totalCourses: 0,
        facultyCount: 0,
        sectionDetails: [],
        courseDetails: [],
        facultyDetails: []
    };

    if (!teachingData || !Array.isArray(teachingData.records)) return result;

    const courseMap = new Map();
    const facultyMap = new Map();
    const sectionDetails = [];

    teachingData.records.forEach(record => {
        const recordYear = parseCustomStatsYear(record?.y);
        if (recordYear === null || !selectedYearSet.has(recordYear)) return;

        const facultyId = String(record?.fid || '').trim();
        if (deptIds && !deptIds.has(facultyId)) return;

        const facultyInfo = teachingData.faculty_index?.[facultyId] || getMemberData(facultyId) || {};
        const facultyName = String(facultyInfo.n || facultyInfo.name || getMemberName(facultyId) || '-').trim() || '-';
        const facultyEntry = facultyMap.get(facultyId) || {
            id: facultyId,
            name: facultyName,
            sections: 0,
            students: 0,
            hours: 0
        };

        (record?.cs || []).forEach(course => {
            const courseCode = normalizeCourseCode(course?.cc);
            if (programKey !== 'all' && !courseBelongsToProgramKey(courseCode, programKey)) return;

            const courseName = String(course?.cn || courseCode || 'مقرر').trim() || 'مقرر';
            const students = Number(course?.e) || 0;
            const hours = Number(course?.h) || 0;
            const mode = String(course?.m || '').trim();

            result.totalSections += 1;
            result.totalStudents += students;
            result.totalHours += hours;

            facultyEntry.sections += 1;
            facultyEntry.students += students;
            facultyEntry.hours += hours;
            facultyMap.set(facultyId, facultyEntry);

            const courseEntry = courseMap.get(courseCode || courseName) || {
                code: courseCode,
                name: courseName,
                sections: 0,
                students: 0,
                hours: 0
            };
            courseEntry.sections += 1;
            courseEntry.students += students;
            courseEntry.hours += hours;
            courseMap.set(courseCode || courseName, courseEntry);

            sectionDetails.push({
                year: recordYear,
                courseCode,
                courseName,
                facultyName,
                students,
                hours,
                mode
            });
        });
    });

    result.totalCourses = courseMap.size;
    result.facultyCount = facultyMap.size;
    result.sectionDetails = sectionDetails.sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return (a.courseName || '').localeCompare((b.courseName || ''), 'ar');
    });
    result.courseDetails = Array.from(courseMap.values()).sort((a, b) => {
        if (b.sections !== a.sections) return b.sections - a.sections;
        return (a.name || '').localeCompare((b.name || ''), 'ar');
    });
    result.facultyDetails = Array.from(facultyMap.values()).sort((a, b) => {
        if (b.sections !== a.sections) return b.sections - a.sections;
        return (a.name || '').localeCompare((b.name || ''), 'ar');
    });

    return result;
}

function buildCustomStatsContextForYears(years) {
    const selectedYearSet = new Set((years || []).map(parseCustomStatsYear).filter(year => year !== null));
    const deptIds = getDepartmentFacultyIds(currentDepartment || 'all');
    const activeFacultyMap = new Map();

    (allData.faculty || []).forEach(member => {
        if (!customStatsRecordMatchesYears(member?.year, selectedYearSet)) return;
        if (currentDepartment !== 'all' && String(member?.department || '').trim() !== currentDepartment) return;
        if (String(member?.active || '').trim() !== 'نعم') return;

        const memberId = String(member?.id || '').trim();
        if (!memberId) return;
        if (!activeFacultyMap.has(memberId)) {
            activeFacultyMap.set(memberId, member);
        }
    });

    const publications = (allData.publications || []).filter(pub =>
        customStatsRecordMatchesYears(pub?.year, selectedYearSet) &&
        customStatsRecordMatchesDepartment(pub?.authors_ids || pub?.participant_ids || '', deptIds)
    );

    const theses = (allData.theses || []).filter(thesis =>
        customStatsRecordMatchesYears(thesis?.year, selectedYearSet) &&
        (!deptIds || deptIds.has(String(thesis?.supervisor_id || '').trim()))
    );

    const participations = (allData.participations || []).filter(item =>
        customStatsRecordMatchesYears(item?.year, selectedYearSet) &&
        customStatsRecordMatchesDepartment(item?.participant_ids || '', deptIds)
    );

    const studentResearch = participations.filter(item => String(item?.category || '').trim() === 'بحوث الطلاب');
    const events = participations.filter(item => CUSTOM_STATS_EVENT_CATEGORIES.has(String(item?.category || '').trim()));
    const researchProjects = theses.filter(thesis => (thesis.type || '').trim() === 'ماجستير' && !isScientificThesis(thesis));
    const scientificTheses = theses.filter(thesis => isScientificThesis(thesis));
    const teaching = buildCustomStatsTeachingScope(selectedYearSet, deptIds, currentProgram || 'all');

    return {
        years: Array.from(selectedYearSet).sort((a, b) => a - b),
        activeFaculty: Array.from(activeFacultyMap.values()).sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'ar')),
        publications,
        theses,
        scientificTheses,
        researchProjects,
        participations,
        studentResearch,
        events,
        teaching
    };
}

function buildCustomStatsRow(label, context, metricDefinitions) {
    const metrics = {};
    metricDefinitions.forEach(metric => {
        metrics[metric.key] = metric.compute(context);
    });
    return { label, context, metrics };
}

function buildCustomStatsDetailBlock(title, row, metricDefinitions) {
    return {
        title,
        sections: metricDefinitions.map(metric => {
            const metricResult = row.metrics[metric.key] || {};
            return {
                metricKey: metric.key,
                metricLabel: metric.label,
                value: metricResult.value || 0,
                scopeLabel: metricResult.scopeLabel || metric.scopeLabel || '',
                items: Array.isArray(metricResult.details) ? metricResult.details : []
            };
        })
    };
}

function buildCustomStatsReport() {
    ensureCustomSectionsStatsState();

    const years = [...(customSectionsStatsState.selectedYears || [])].sort((a, b) => a - b);
    const metricMap = getCustomStatsMetricDefinitionMap();
    const metricDefinitions = (customSectionsStatsState.selectedMetrics || [])
        .map(key => metricMap.get(key))
        .filter(Boolean);

    if (years.length === 0) {
        return { error: 'اختر سنة واحدة على الأقل لإنشاء التقرير.' };
    }

    if (metricDefinitions.length === 0) {
        return { error: 'اختر مؤشرًا واحدًا على الأقل لإنشاء التقرير.' };
    }

    const reportMode = customSectionsStatsState.reportMode || 'summary';
    const detailMode = customSectionsStatsState.detailMode || 'summary';
    const scope = {
        departmentLabel: getCustomStatsDepartmentLabel(),
        programLabel: getCustomStatsProgramLabel(),
        affectsTeachingByProgram: currentProgram !== 'all'
    };

    let rows = [];
    let totalRow = null;
    let detailBlocks = [];

    if (reportMode === 'aggregate') {
        const context = buildCustomStatsContextForYears(years);
        const row = buildCustomStatsRow(formatCustomStatsYearsLabel(years), context, metricDefinitions);
        rows = [row];
        if (detailMode === 'detailed') {
            detailBlocks = [buildCustomStatsDetailBlock('تفاصيل الإجمالي', row, metricDefinitions)];
        }
    } else {
        rows = years.map(year => {
            const context = buildCustomStatsContextForYears([year]);
            return buildCustomStatsRow(formatCustomStatsYearLabel(year), context, metricDefinitions);
        });

        if (years.length > 1) {
            const totalContext = buildCustomStatsContextForYears(years);
            totalRow = buildCustomStatsRow('الإجمالي', totalContext, metricDefinitions);
        }

        if (detailMode === 'detailed') {
            detailBlocks = rows.map(row => buildCustomStatsDetailBlock(`تفاصيل ${row.label}`, row, metricDefinitions));
        }
    }

    return {
        generatedAt: new Date(),
        years,
        reportMode,
        detailMode,
        scope,
        metricDefinitions,
        rows,
        totalRow,
        detailBlocks
    };
}

function getCustomStatsModeOptions() {
    return [
        { value: 'aggregate', label: 'إجمالي' },
        { value: 'summary', label: 'ملخص سنوي' }
    ];
}

function getCustomStatsDetailOptions() {
    return [
        { value: 'summary', label: 'ملخص' },
        { value: 'detailed', label: 'تفصيلي' }
    ];
}

function renderCustomStatsModeSwitch() {
    const container = document.getElementById('customStatsModeSwitch');
    if (!container) return;

    container.innerHTML = getCustomStatsModeOptions().map(option => `
        <button type="button" class="${customSectionsStatsState.reportMode === option.value ? 'active' : ''}" data-custom-stats-mode="${option.value}">
            ${escapeHtml(option.label)}
        </button>
    `).join('');
}

function renderCustomStatsDetailSwitch() {
    const container = document.getElementById('customStatsDetailSwitch');
    if (!container) return;

    container.innerHTML = getCustomStatsDetailOptions().map(option => `
        <button type="button" class="${customSectionsStatsState.detailMode === option.value ? 'active' : ''}" data-custom-stats-detail="${option.value}">
            ${escapeHtml(option.label)}
        </button>
    `).join('');
}

function renderCustomStatsScopeMeta() {
    const container = document.getElementById('customStatsScopeMeta');
    if (!container) return;

    container.innerHTML = `
        <span class="custom-stats-meta-pill"><strong>القسم:</strong>${escapeHtml(getCustomStatsDepartmentLabel())}</span>
        <span class="custom-stats-meta-pill"><strong>البرنامج:</strong>${escapeHtml(getCustomStatsProgramLabel())}</span>
        <span class="custom-stats-meta-pill"><strong>ملاحظة:</strong>مؤشرات التدريس تتأثر بفلتر البرنامج الحالي، أما المؤشرات العامة فتُحسب على مستوى القسم والسنوات المختارة.</span>
    `;
}

function renderCustomStatsYearsList() {
    const container = document.getElementById('customStatsYearsList');
    if (!container) return;

    const availableYears = getCustomStatsAvailableYears();
    container.innerHTML = availableYears.map(year => `
        <label class="custom-stats-year-chip">
            <input type="checkbox" data-custom-stats-year="${year}" ${customSectionsStatsState.selectedYears.includes(year) ? 'checked' : ''}>
            <span>${formatCustomStatsYearLabel(year)}</span>
        </label>
    `).join('');
}

function renderCustomStatsMetricsList() {
    const container = document.getElementById('customStatsMetricsList');
    if (!container) return;

    const metricDefinitions = getCustomStatsMetricDefinitions();
    container.innerHTML = metricDefinitions.map(metric => `
        <div class="custom-stats-metric-card">
            <input type="checkbox" id="metric_${metric.key}" data-custom-stats-metric="${metric.key}" ${customSectionsStatsState.selectedMetrics.includes(metric.key) ? 'checked' : ''}>
            <label for="metric_${metric.key}">
                <span class="custom-stats-metric-title">${escapeHtml(metric.label)}</span>
                <span class="custom-stats-metric-desc">${escapeHtml(metric.description)}</span>
            </label>
        </div>
    `).join('');
}

function renderCustomStatsControls() {
    ensureCustomSectionsStatsState();
    renderCustomStatsModeSwitch();
    renderCustomStatsDetailSwitch();
    renderCustomStatsScopeMeta();
    renderCustomStatsYearsList();
    renderCustomStatsMetricsList();
    updateCustomStatsExportButtons();
}

function updateCustomStatsExportButtons() {
    const hasReport = !!customSectionsStatsState?.lastReport;
    ['customStatsExportExcelBtn', 'customStatsExportCsvBtn', 'customStatsExportPdfBtn'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = !hasReport;
    });
}

function toggleCustomStatsWorkspace(forceState = null) {
    ensureCustomSectionsStatsState();
    const workspace = document.getElementById('customStatsWorkspace');
    if (!workspace) return;

    customSectionsStatsState.isOpen = forceState === null ? !customSectionsStatsState.isOpen : !!forceState;
    workspace.style.display = customSectionsStatsState.isOpen ? 'grid' : 'none';

    if (customSectionsStatsState.isOpen) {
        renderCustomStatsControls();
        if (customSectionsStatsState.lastReport) {
            renderCustomStatsReport(buildCustomStatsReport());
        } else {
            renderCustomStatsEmpty('اختر السنوات والمؤشرات ثم أنشئ التقرير.');
        }
    }
}

function getCustomStatsSummaryText(report) {
    if (!report) return 'اختر السنوات والمؤشرات ثم أنشئ التقرير.';

    const metricsLabel = `${formatCustomStatsNumber(report.metricDefinitions.length)} مؤشر`;
    const yearsLabel = report.reportMode === 'aggregate'
        ? formatCustomStatsYearsLabel(report.years)
        : `${formatCustomStatsNumber(report.years.length)} سنة`;
    const modeLabel = report.reportMode === 'aggregate' ? 'إجمالي' : 'ملخص سنوي';
    const detailLabel = report.detailMode === 'detailed' ? 'تفصيلي' : 'ملخص';

    return `${modeLabel} - ${detailLabel} - ${metricsLabel} - ${yearsLabel}`;
}

function renderCustomStatsEmpty(message) {
    const container = document.getElementById('customStatsResult');
    const summary = document.getElementById('customStatsResultSummary');
    if (summary) summary.textContent = message;
    if (container) container.innerHTML = `<div class="custom-stats-empty">${escapeHtml(message)}</div>`;
    customSectionsStatsState.lastReport = null;
    updateCustomStatsExportButtons();
}

function getCustomStatsMainTableHeaders(report) {
    const firstHeader = report.reportMode === 'aggregate' ? 'الفترة' : 'السنة';
    return [firstHeader, ...report.metricDefinitions.map(metric => metric.label)];
}

function getCustomStatsMainTableRows(report) {
    const rows = report.rows.map(row => [
        row.label,
        ...report.metricDefinitions.map(metric => formatCustomStatsNumber(row.metrics[metric.key]?.value || 0))
    ]);

    if (report.totalRow) {
        rows.push([
            report.totalRow.label,
            ...report.metricDefinitions.map(metric => formatCustomStatsNumber(report.totalRow.metrics[metric.key]?.value || 0))
        ]);
    }

    return rows;
}

function buildCustomStatsTableHtml(report) {
    const headers = getCustomStatsMainTableHeaders(report);
    const rows = getCustomStatsMainTableRows(report);

    return `
        <div class="data-table-container">
            <table class="data-table custom-stats-report-table">
                <thead>
                    <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map((row, rowIndex) => {
                        const isTotalRow = !!report.totalRow && rowIndex === rows.length - 1;
                        return `
                            <tr class="${isTotalRow ? 'total-row' : ''}">
                                ${row.map((cell, cellIndex) => `<td class="${cellIndex === 0 ? 'metric-cell' : ''}">${escapeHtml(cell)}</td>`).join('')}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function buildCustomStatsDetailHtml(report) {
    if (report.detailMode !== 'detailed' || !report.detailBlocks.length) return '';

    const maxVisibleItems = 24;

    return `
        <div class="custom-stats-detail-board">
            ${report.detailBlocks.map(block => `
                <div class="custom-stats-detail-card">
                    <h4>${escapeHtml(block.title)}</h4>
                    ${block.sections.map(section => {
                        const items = section.items || [];
                        const visibleItems = items.slice(0, maxVisibleItems);
                        const hiddenCount = Math.max(items.length - visibleItems.length, 0);

                        return `
                            <div class="custom-stats-detail-section">
                                <div class="custom-stats-detail-section-title">
                                    ${escapeHtml(section.metricLabel)}: ${escapeHtml(formatCustomStatsNumber(section.value))}
                                </div>
                                <ul class="custom-stats-detail-list">
                                    ${visibleItems.length > 0
                                        ? visibleItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')
                                        : '<li>لا توجد تفاصيل إضافية لهذا المؤشر.</li>'}
                                </ul>
                                ${hiddenCount > 0 ? `<div class="custom-stats-detail-note">تم إظهار أول ${formatCustomStatsNumber(maxVisibleItems)} عنصر فقط، والمتبقي ${formatCustomStatsNumber(hiddenCount)} عنصر.</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `).join('')}
        </div>
    `;
}

function renderCustomStatsReport(report) {
    const container = document.getElementById('customStatsResult');
    const summary = document.getElementById('customStatsResultSummary');
    if (!container || !summary) return;

    if (!report || report.error) {
        renderCustomStatsEmpty(report?.error || 'تعذر إنشاء التقرير المطلوب.');
        return;
    }

    customSectionsStatsState.lastReport = report;
    summary.textContent = getCustomStatsSummaryText(report);

    const metaHtml = `
        <div class="custom-stats-result-meta">
            <span class="custom-stats-meta-pill"><strong>القسم:</strong>${escapeHtml(report.scope.departmentLabel)}</span>
            <span class="custom-stats-meta-pill"><strong>البرنامج:</strong>${escapeHtml(report.scope.programLabel)}</span>
            <span class="custom-stats-meta-pill"><strong>السنوات:</strong>${escapeHtml(formatCustomStatsYearsLabel(report.years))}</span>
            <span class="custom-stats-meta-pill"><strong>التوليد:</strong>${escapeHtml(new Date(report.generatedAt).toLocaleString('ar-SA'))}</span>
        </div>
    `;

    container.innerHTML = metaHtml + buildCustomStatsTableHtml(report) + buildCustomStatsDetailHtml(report);
    updateCustomStatsExportButtons();
}

function generateCustomStatsReport() {
    renderCustomStatsReport(buildCustomStatsReport());
}

function resetCustomStatsSelections() {
    customSectionsStatsState = {
        isOpen: true,
        reportMode: 'summary',
        detailMode: 'summary',
        selectedYears: getDefaultCustomStatsYears(),
        selectedMetrics: [...CUSTOM_STATS_DEFAULT_METRICS],
        lastReport: null
    };
    renderCustomStatsControls();
    renderCustomStatsEmpty('تمت إعادة ضبط الإعدادات. اختر المؤشرات والسنوات ثم أنشئ التقرير.');
}

function buildCustomStatsMainMatrix(report) {
    return [
        getCustomStatsMainTableHeaders(report),
        ...getCustomStatsMainTableRows(report)
    ];
}

function buildCustomStatsDetailsMatrix(report) {
    if (report.detailMode !== 'detailed' || !report.detailBlocks.length) return [];

    const rows = [['الفترة', 'المؤشر', 'القيمة', 'النطاق', 'التفصيل']];
    report.detailBlocks.forEach(block => {
        block.sections.forEach(section => {
            const items = section.items && section.items.length ? section.items : ['لا توجد تفاصيل إضافية'];
            items.forEach((item, index) => {
                rows.push([
                    block.title,
                    index === 0 ? section.metricLabel : '',
                    index === 0 ? formatCustomStatsNumber(section.value) : '',
                    index === 0 ? section.scopeLabel : '',
                    item
                ]);
            });
        });
    });
    return rows;
}

function escapeCsvValue(value, delimiter = ';') {
    const text = String(value ?? '');
    if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function convertMatrixToDelimitedText(matrix, delimiter = ';') {
    return matrix.map(row => row.map(cell => escapeCsvValue(cell, delimiter)).join(delimiter)).join('\n');
}

function downloadBlobFile(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function getCustomStatsFileBaseName(report) {
    const modePart = report.reportMode === 'aggregate' ? 'aggregate' : 'summary';
    const yearsPart = report.years.join('-');
    return `custom_sections_stats_${modePart}_${yearsPart}`;
}

function exportCustomStatsCsv() {
    const report = customSectionsStatsState?.lastReport;
    if (!report) return;

    const mainText = convertMatrixToDelimitedText(buildCustomStatsMainMatrix(report));
    const detailsMatrix = buildCustomStatsDetailsMatrix(report);
    const detailsText = detailsMatrix.length ? `\n\n${convertMatrixToDelimitedText(detailsMatrix)}` : '';
    const blob = new Blob([`\uFEFF${mainText}${detailsText}`], { type: 'text/csv;charset=utf-8;' });
    downloadBlobFile(blob, `${getCustomStatsFileBaseName(report)}.csv`);
}

function buildCustomStatsMatrixTableHtml(matrix) {
    if (!matrix || matrix.length === 0) return '';
    const [headers, ...rows] = matrix;

    return `
        <table>
            <thead>
                <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
            </tbody>
        </table>
    `;
}

function exportCustomStatsExcel() {
    const report = customSectionsStatsState?.lastReport;
    if (!report) return;

    const mainTable = buildCustomStatsMatrixTableHtml(buildCustomStatsMainMatrix(report));
    const detailsMatrix = buildCustomStatsDetailsMatrix(report);
    const detailsTable = detailsMatrix.length
        ? `<h3>تفاصيل المؤشرات</h3>${buildCustomStatsMatrixTableHtml(detailsMatrix)}`
        : '';

    const html = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Tahoma, Arial, sans-serif; padding: 24px; direction: rtl; }
                h1, h3 { color: #1f2937; }
                .meta { margin-bottom: 16px; color: #4b5563; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; }
                th { background: #e2e8f0; }
            </style>
        </head>
        <body>
            <h1>الإحصائيات المخصصة - إحصائيات الشعب</h1>
            <div class="meta">القسم: ${escapeHtml(report.scope.departmentLabel)} | البرنامج: ${escapeHtml(report.scope.programLabel)} | السنوات: ${escapeHtml(formatCustomStatsYearsLabel(report.years))}</div>
            ${mainTable}
            ${detailsTable}
        </body>
        </html>
    `;

    const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    downloadBlobFile(blob, `${getCustomStatsFileBaseName(report)}.xls`);
}

function exportCustomStatsPdf() {
    const report = customSectionsStatsState?.lastReport;
    if (!report) return;

    const mainTable = buildCustomStatsMatrixTableHtml(buildCustomStatsMainMatrix(report));
    const detailsMatrix = buildCustomStatsDetailsMatrix(report);
    const detailsTable = detailsMatrix.length
        ? `<h2>تفاصيل المؤشرات</h2>${buildCustomStatsMatrixTableHtml(detailsMatrix)}`
        : '';

    const printContent = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>الإحصائيات المخصصة</title>
            <style>
                body { font-family: "Cairo", Tahoma, Arial, sans-serif; margin: 24px; color: #111827; direction: rtl; }
                h1, h2 { margin-bottom: 8px; }
                .meta { margin-bottom: 18px; line-height: 1.8; color: #374151; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; vertical-align: top; }
                th { background: #f3f4f6; }
                @media print { body { margin: 10mm; } }
            </style>
        </head>
        <body>
            <h1>الإحصائيات المخصصة - إحصائيات الشعب</h1>
            <div class="meta">
                القسم: ${escapeHtml(report.scope.departmentLabel)}<br>
                البرنامج: ${escapeHtml(report.scope.programLabel)}<br>
                السنوات: ${escapeHtml(formatCustomStatsYearsLabel(report.years))}<br>
                تاريخ التوليد: ${escapeHtml(new Date(report.generatedAt).toLocaleString('ar-SA'))}
            </div>
            ${mainTable}
            ${detailsTable}
            <script>window.onload = function(){ window.print(); };</script>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
        return;
    }

    printWindow.document.write(printContent);
    printWindow.document.close();
}

function bindCustomStatsWorkspaceEvents() {
    const workspace = document.getElementById('customStatsWorkspace');
    if (!workspace || workspace.dataset.bound === 'true') return;

    workspace.dataset.bound = 'true';

    workspace.addEventListener('click', event => {
        const modeButton = event.target.closest('[data-custom-stats-mode]');
        if (modeButton) {
            ensureCustomSectionsStatsState();
            customSectionsStatsState.reportMode = modeButton.getAttribute('data-custom-stats-mode') || 'summary';
            renderCustomStatsControls();
            if (customSectionsStatsState.lastReport) generateCustomStatsReport();
            return;
        }

        const detailButton = event.target.closest('[data-custom-stats-detail]');
        if (detailButton) {
            ensureCustomSectionsStatsState();
            customSectionsStatsState.detailMode = detailButton.getAttribute('data-custom-stats-detail') || 'summary';
            renderCustomStatsControls();
            if (customSectionsStatsState.lastReport) generateCustomStatsReport();
        }
    });

    workspace.addEventListener('change', event => {
        const yearInput = event.target.closest('[data-custom-stats-year]');
        if (yearInput) {
            ensureCustomSectionsStatsState();
            const year = parseCustomStatsYear(yearInput.getAttribute('data-custom-stats-year'));
            if (year === null) return;

            if (yearInput.checked) {
                if (!customSectionsStatsState.selectedYears.includes(year)) {
                    customSectionsStatsState.selectedYears.push(year);
                }
            } else {
                customSectionsStatsState.selectedYears = customSectionsStatsState.selectedYears.filter(value => value !== year);
            }

            if (customSectionsStatsState.lastReport) generateCustomStatsReport();
            return;
        }

        const metricInput = event.target.closest('[data-custom-stats-metric]');
        if (metricInput) {
            ensureCustomSectionsStatsState();
            const metricKey = metricInput.getAttribute('data-custom-stats-metric');
            if (!metricKey) return;

            if (metricInput.checked) {
                if (!customSectionsStatsState.selectedMetrics.includes(metricKey)) {
                    customSectionsStatsState.selectedMetrics.push(metricKey);
                }
            } else {
                customSectionsStatsState.selectedMetrics = customSectionsStatsState.selectedMetrics.filter(key => key !== metricKey);
            }

            if (customSectionsStatsState.lastReport) generateCustomStatsReport();
        }
    });
}

function setupCustomStatsWorkspace() {
    ensureCustomSectionsStatsState();
    bindCustomStatsWorkspaceEvents();

    document.getElementById('sectionsCustomStatsBtn')?.addEventListener('click', () => {
        toggleCustomStatsWorkspace();
    });

    document.getElementById('customStatsGenerateBtn')?.addEventListener('click', generateCustomStatsReport);
    document.getElementById('customStatsResetBtn')?.addEventListener('click', resetCustomStatsSelections);
    document.getElementById('customStatsResetMetricsBtn')?.addEventListener('click', () => {
        ensureCustomSectionsStatsState();
        customSectionsStatsState.selectedMetrics = [...CUSTOM_STATS_DEFAULT_METRICS];
        renderCustomStatsControls();
        if (customSectionsStatsState.lastReport) generateCustomStatsReport();
    });
    document.getElementById('customStatsSelectAllYearsBtn')?.addEventListener('click', () => {
        ensureCustomSectionsStatsState();
        customSectionsStatsState.selectedYears = [...getCustomStatsAvailableYears()];
        renderCustomStatsControls();
        if (customSectionsStatsState.lastReport) generateCustomStatsReport();
    });
    document.getElementById('customStatsExportExcelBtn')?.addEventListener('click', exportCustomStatsExcel);
    document.getElementById('customStatsExportCsvBtn')?.addEventListener('click', exportCustomStatsCsv);
    document.getElementById('customStatsExportPdfBtn')?.addEventListener('click', exportCustomStatsPdf);

    renderCustomStatsControls();
    if (!customSectionsStatsState.lastReport) {
        renderCustomStatsEmpty('اختر السنوات والمؤشرات ثم أنشئ التقرير.');
    }
}

// ========================================
// الاستوديو الإحصائي
// ========================================
function analyticsStudioText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function analyticsStudioNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function analyticsStudioFormatCount(value) {
    return formatCustomStatsNumber(Math.round(analyticsStudioNumber(value)));
}

function analyticsStudioFormatDecimal(value, digits = 2) {
    const numericValue = analyticsStudioNumber(value);
    return numericValue.toLocaleString('ar-SA', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits
    });
}

function analyticsStudioDistinctCount(records, selector) {
    const values = new Set();
    records.forEach(record => {
        const value = selector(record);
        if (Array.isArray(value)) {
            value.forEach(item => {
                const key = analyticsStudioText(item);
                if (key) values.add(key);
            });
            return;
        }

        const key = analyticsStudioText(value);
        if (key) values.add(key);
    });
    return values.size;
}

function analyticsStudioCountWhere(records, predicate) {
    return records.reduce((count, record) => count + (predicate(record) ? 1 : 0), 0);
}

function analyticsStudioAverage(records, selector) {
    if (!records.length) return 0;
    const sum = records.reduce((total, record) => total + analyticsStudioNumber(selector(record)), 0);
    return sum / records.length;
}

function analyticsStudioSum(records, selector) {
    return records.reduce((total, record) => total + analyticsStudioNumber(selector(record)), 0);
}

function analyticsStudioQueryMatch(sourceText, query) {
    const normalizedQuery = normalizeSearchText(query || '');
    if (!normalizedQuery) return true;
    const haystack = normalizeSearchText(sourceText || '');
    const tokens = getSearchTokens(query || '');
    if (!tokens.length) return haystack.includes(normalizedQuery);
    return tokens.every(token => haystack.includes(token));
}

function analyticsStudioSafeFileName(value) {
    return String(value || 'analytics-studio-report')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'analytics-studio-report';
}

function analyticsStudioMetricHeader(metric) {
    return metric.unit ? `${metric.label}` : metric.label;
}

function analyticsStudioFormatValue(value, formatter = null) {
    if (typeof formatter === 'function') {
        return formatter(value);
    }

    if (Array.isArray(value)) {
        const items = value.map(item => analyticsStudioText(item)).filter(Boolean);
        return items.length ? items.join('، ') : '-';
    }

    if (value === null || value === undefined || value === '') {
        return '-';
    }

    return String(value);
}

function analyticsStudioDestroyChart() {
    if (analyticsStudioChart) {
        analyticsStudioChart.destroy();
        analyticsStudioChart = null;
    }
}

function analyticsStudioClearReport() {
    analyticsStudioReport = null;
    analyticsStudioDestroyChart();
    document.getElementById('analyticsStudioResults')?.classList.add('hidden');
}

function analyticsStudioGetFacultyRowById(id) {
    const idStr = String(id || '').trim();
    if (!idStr) return null;
    return getMemberData(idStr) || allData.faculty.find(member => String(member.id || '').trim() === idStr) || null;
}

function analyticsStudioGetFacultyDepartment(id) {
    return analyticsStudioText(analyticsStudioGetFacultyRowById(id)?.department, 'غير محدد');
}

function analyticsStudioGetFacultyRank(id) {
    return analyticsStudioText(analyticsStudioGetFacultyRowById(id)?.rank, 'غير محدد');
}

function analyticsStudioGetNamesFromIds(idsValue) {
    return splitIds(idsValue || '')
        .map(id => getMemberName(id))
        .filter(name => name && name !== '-');
}

function analyticsStudioGetDepartmentsFromIds(idsValue) {
    return Array.from(new Set(
        splitIds(idsValue || '')
            .map(id => analyticsStudioGetFacultyDepartment(id))
            .filter(Boolean)
            .filter(value => value !== 'غير محدد')
    ));
}

function analyticsStudioGetPrimaryDepartment(idsValue) {
    const departments = analyticsStudioGetDepartmentsFromIds(idsValue);
    if (!departments.length) return 'غير محدد';
    if (departments.length === 1) return departments[0];
    return 'متعدد الأقسام';
}

function analyticsStudioNormalizeYesNo(value) {
    return analyticsStudioText(value, 'لا') === 'نعم' ? 'نعم' : 'لا';
}

function analyticsStudioCategoryIncludes(value, needle) {
    return normalizeSearchText(value || '').includes(normalizeSearchText(needle || ''));
}

function analyticsStudioGetPublicationRows() {
    return (allData.publications || []).map(publication => {
        const meta = parsePublicationJournalMeta(publication.journal);
        const authorIds = publication.authors_ids || publication.participant_ids || '';
        const authorNames = analyticsStudioGetNamesFromIds(authorIds);
        const departmentList = analyticsStudioText(publication.department)
            ? [analyticsStudioText(publication.department)]
            : analyticsStudioGetDepartmentsFromIds(authorIds);
        return {
            ...publication,
            year: parseCustomStatsYear(publication.year),
            departmentLabel: analyticsStudioText(publication.department, analyticsStudioGetPrimaryDepartment(authorIds)),
            departmentList,
            journalName: analyticsStudioText(meta.journalName, 'غير محدد'),
            institution: analyticsStudioText(meta.institution, 'غير محدد'),
            city: analyticsStudioText(meta.city, 'غير محدد'),
            country: analyticsStudioText(meta.country, 'غير محدد'),
            studentAuthorLabel: analyticsStudioNormalizeYesNo(publication.student_author),
            authorNames,
            authorCount: splitIds(authorIds).length,
            citationScore: analyticsStudioNumber(config.citations_ranges?.[analyticsStudioText(publication.citations_range)])
        };
    }).filter(row => row.year !== null);
}

function analyticsStudioGetThesisRows() {
    return (allData.theses || []).map(thesis => {
        const supervisorId = String(thesis.supervisor_id || '').trim();
        return {
            ...thesis,
            year: parseCustomStatsYear(thesis.year),
            thesisKind: isScientificThesis(thesis) ? 'رسالة علمية' : 'مشروع بحثي',
            degreeLabel: analyticsStudioText(thesis.type, 'غير محدد'),
            specializationLabel: analyticsStudioText(thesis.specialization, 'غير محدد'),
            statusLabel: analyticsStudioText(thesis.status, 'غير محدد'),
            programLabel: getThesisProgramLabel(thesis),
            supervisorName: analyticsStudioText(getMemberName(supervisorId), 'غير محدد'),
            supervisorDepartment: analyticsStudioGetFacultyDepartment(supervisorId)
        };
    }).filter(row => row.year !== null);
}

function analyticsStudioGetParticipationRows() {
    return (allData.participations || []).map(item => {
        const participantIds = item.participant_ids || '';
        const departmentList = analyticsStudioGetDepartmentsFromIds(participantIds);
        return {
            ...item,
            year: parseCustomStatsYear(item.year),
            categoryLabel: analyticsStudioText(item.category, 'غير محدد'),
            participationTypeLabel: analyticsStudioText(item.participation_type, 'غير محدد'),
            locationLabel: analyticsStudioText(item.location || item.journal, 'غير محدد'),
            departmentLabel: analyticsStudioGetPrimaryDepartment(participantIds),
            departmentList,
            participantNames: analyticsStudioGetNamesFromIds(participantIds),
            participantCount: splitIds(participantIds).length,
            organizedByDepartmentLabel: analyticsStudioNormalizeYesNo(item.organized_by_department || item.organized_by_dept)
        };
    }).filter(row => row.year !== null);
}

function analyticsStudioBuildTeachingRows() {
    if (!teachingData || !Array.isArray(teachingData.records)) return [];
    if (analyticsStudioTeachingRowsCache) return analyticsStudioTeachingRowsCache;

    const rows = [];

    teachingData.records.forEach(record => {
        const year = parseCustomStatsYear(record?.y);
        if (year === null) return;

        const facultyId = String(record?.fid || '').trim();
        const facultyInfo = teachingData.faculty_index?.[facultyId] || analyticsStudioGetFacultyRowById(facultyId) || {};
        const facultyName = analyticsStudioText(facultyInfo.n || facultyInfo.name || getMemberName(facultyId), 'غير محدد');
        const department = analyticsStudioText(facultyInfo.d || facultyInfo.department, analyticsStudioGetFacultyDepartment(facultyId));
        const rank = analyticsStudioText(facultyInfo.r || facultyInfo.rank, analyticsStudioGetFacultyRank(facultyId));

        (record?.cs || []).forEach(course => {
            const courseCode = normalizeCourseCode(course?.cc);
            const programEntries = getCourseProgramsForCode(courseCode);
            const programNames = Array.from(new Set(programEntries.map(entry => analyticsStudioText(entry.program)).filter(Boolean)));

            rows.push({
                year,
                facultyId,
                facultyName,
                department,
                rank,
                courseCode: analyticsStudioText(courseCode, 'غير محدد'),
                courseName: analyticsStudioText(course?.cn || courseCode, 'غير محدد'),
                students: analyticsStudioNumber(course?.e),
                hours: analyticsStudioNumber(course?.h),
                mode: analyticsStudioText(course?.m, 'غير محدد'),
                degree: analyticsStudioText(course?.dg, 'غير محدد'),
                term: analyticsStudioText(record?.sn, 'غير محدد'),
                programLabel: programNames.length === 1 ? programNames[0] : (programNames.length > 1 ? 'مشترك بين برامج' : 'غير محدد')
            });
        });
    });

    analyticsStudioTeachingRowsCache = rows;
    return rows;
}

function getAnalyticsStudioSourceDefinitions() {
    return {
        faculty: {
            key: 'faculty',
            label: 'أعضاء هيئة التدريس',
            rowLabel: 'سجل',
            getRows: analyticsStudioGetFacultyRows,
            getYear: row => row.year,
            searchText: row => `${row.name || ''} ${row.id || ''} ${row.rank || ''} ${row.department || ''} ${row.email || ''}`,
            detailColumns: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value) },
                { id: 'id', label: 'الرقم', getValue: row => analyticsStudioText(row.id, '-') },
                { id: 'name', label: 'الاسم', getValue: row => analyticsStudioText(row.name, '-') },
                { id: 'rank', label: 'الرتبة العلمية', getValue: row => analyticsStudioText(row.rank, '-') },
                { id: 'email', label: 'البريد الإلكتروني', getValue: row => analyticsStudioText(row.email, '-') },
                { id: 'active', label: 'الحالة', getValue: row => analyticsStudioText(row.active, '-') },
                { id: 'department', label: 'القسم', getValue: row => analyticsStudioText(row.department, '-') }
            ],
            groups: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value), sort: 'numeric' },
                { id: 'department', label: 'القسم', getValue: row => analyticsStudioText(row.department, 'غير محدد') },
                { id: 'rank', label: 'الرتبة العلمية', getValue: row => analyticsStudioText(row.rank, 'غير محدد') },
                { id: 'active', label: 'الحالة', getValue: row => analyticsStudioText(row.active, 'غير محدد') }
            ],
            filters: [
                { id: 'department', label: 'القسم', getValue: row => analyticsStudioText(row.department, 'غير محدد') },
                { id: 'rank', label: 'الرتبة العلمية', getValue: row => analyticsStudioText(row.rank, 'غير محدد'), multi: true },
                { id: 'active', label: 'الحالة', getValue: row => analyticsStudioText(row.active, 'غير محدد') }
            ],
            defaultMetrics: ['unique_faculty', 'active_faculty', 'distinct_departments', 'assistant_professor_count'],
            metrics: [
                { id: 'record_count', label: 'عدد السجلات', unit: 'سجل', compute: rows => rows.length, format: analyticsStudioFormatCount },
                { id: 'unique_faculty', label: 'عدد الأعضاء', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows, row => row.id), format: analyticsStudioFormatCount },
                { id: 'active_faculty', label: 'الأعضاء الفاعلون', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows.filter(row => analyticsStudioText(row.active) === 'نعم'), row => row.id), format: analyticsStudioFormatCount },
                { id: 'distinct_departments', label: 'عدد الأقسام', unit: 'قسم', compute: rows => analyticsStudioDistinctCount(rows, row => row.department), format: analyticsStudioFormatCount },
                { id: 'professor_count', label: 'عدد الأساتذة', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows.filter(row => analyticsStudioText(row.rank) === 'أستاذ'), row => row.id), format: analyticsStudioFormatCount },
                { id: 'associate_professor_count', label: 'عدد الأساتذة المشاركين', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows.filter(row => analyticsStudioText(row.rank) === 'أستاذ مشارك'), row => row.id), format: analyticsStudioFormatCount },
                { id: 'assistant_professor_count', label: 'عدد الأساتذة المساعدين', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows.filter(row => analyticsStudioText(row.rank) === 'أستاذ مساعد'), row => row.id), format: analyticsStudioFormatCount }
            ]
        },
        publications: {
            key: 'publications',
            label: 'البحوث المنشورة',
            rowLabel: 'بحث',
            getRows: analyticsStudioGetPublicationRows,
            getYear: row => row.year,
            searchText: row => `${row.title || ''} ${row.journal || ''} ${(row.authorNames || []).join(' ')} ${row.departmentLabel || ''} ${row.city || ''} ${row.country || ''}`,
            detailColumns: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value) },
                { id: 'title', label: 'عنوان البحث', getValue: row => analyticsStudioText(row.title, '-') },
                { id: 'authors', label: 'المؤلفون', getValue: row => row.authorNames },
                { id: 'department', label: 'القسم', getValue: row => row.departmentList?.length ? row.departmentList : [row.departmentLabel] },
                { id: 'journal', label: 'وعاء النشر', getValue: row => row.journalName },
                { id: 'institution', label: 'الجهة', getValue: row => row.institution },
                { id: 'city', label: 'المدينة', getValue: row => row.city },
                { id: 'country', label: 'الدولة', getValue: row => row.country },
                { id: 'publish_date', label: 'تاريخ النشر', getValue: row => formatDate(row.publish_date || row.date) },
                { id: 'citations_range', label: 'نطاق الاقتباسات', getValue: row => analyticsStudioText(row.citations_range, '-') },
                { id: 'student_author', label: 'طالب مشارك', getValue: row => row.studentAuthorLabel }
            ],
            groups: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value), sort: 'numeric' },
                { id: 'department', label: 'القسم', getValue: row => row.departmentLabel },
                { id: 'journal', label: 'وعاء النشر', getValue: row => row.journalName },
                { id: 'institution', label: 'الجهة', getValue: row => row.institution },
                { id: 'city', label: 'المدينة', getValue: row => row.city },
                { id: 'country', label: 'الدولة', getValue: row => row.country },
                { id: 'student_author', label: 'طالب مشارك', getValue: row => row.studentAuthorLabel }
            ],
            filters: [
                {
                    id: 'department',
                    label: 'القسم',
                    getValue: row => row.departmentLabel,
                    getOptionsValues: row => row.departmentList?.length ? row.departmentList : [row.departmentLabel],
                    matches: (row, selectedValue) => (row.departmentList || []).includes(selectedValue) || row.departmentLabel === selectedValue
                },
                { id: 'journal', label: 'وعاء النشر', getValue: row => row.journalName },
                { id: 'country', label: 'الدولة', getValue: row => row.country },
                { id: 'city', label: 'المدينة', getValue: row => row.city },
                { id: 'student_author', label: 'طالب مشارك', getValue: row => row.studentAuthorLabel },
                { id: 'citations_range', label: 'نطاق الاقتباسات', getValue: row => analyticsStudioText(row.citations_range, 'غير محدد') }
            ],
            defaultMetrics: ['record_count', 'distinct_journals', 'unique_authors', 'student_author_count'],
            metrics: [
                { id: 'record_count', label: 'عدد البحوث', unit: 'بحث', compute: rows => rows.length, format: analyticsStudioFormatCount },
                { id: 'distinct_journals', label: 'عدد أوعية النشر', unit: 'وعاء', compute: rows => analyticsStudioDistinctCount(rows, row => row.journalName), format: analyticsStudioFormatCount },
                { id: 'unique_authors', label: 'عدد المؤلفين الفريدين', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows, row => splitIds(row.authors_ids || row.participant_ids || '')), format: analyticsStudioFormatCount },
                { id: 'student_author_count', label: 'بحوث الطلاب المشاركين', unit: 'بحث', compute: rows => analyticsStudioCountWhere(rows, row => row.studentAuthorLabel === 'نعم'), format: analyticsStudioFormatCount },
                { id: 'distinct_countries', label: 'عدد الدول', unit: 'دولة', compute: rows => analyticsStudioDistinctCount(rows.filter(row => !isUnknownPublicationMetaValue(row.country)), row => row.country), format: analyticsStudioFormatCount },
                { id: 'distinct_cities', label: 'عدد المدن', unit: 'مدينة', compute: rows => analyticsStudioDistinctCount(rows.filter(row => !isUnknownPublicationMetaValue(row.city)), row => row.city), format: analyticsStudioFormatCount },
                { id: 'citation_points_sum', label: 'مجموع نقاط الاقتباسات', unit: 'نقطة', compute: rows => analyticsStudioSum(rows, row => row.citationScore), format: analyticsStudioFormatCount },
                { id: 'citation_points_avg', label: 'متوسط نقاط الاقتباسات', unit: 'نقطة', compute: rows => analyticsStudioAverage(rows, row => row.citationScore), format: value => analyticsStudioFormatDecimal(value, 2) }
            ]
        },
        theses: {
            key: 'theses',
            label: 'الرسائل والمشاريع',
            rowLabel: 'سجل',
            getRows: analyticsStudioGetThesisRows,
            getYear: row => row.year,
            searchText: row => `${row.title || ''} ${row.student_name || ''} ${row.supervisorName || ''} ${row.specializationLabel || ''} ${row.statusLabel || ''}`,
            detailColumns: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value) },
                { id: 'title', label: 'العنوان', getValue: row => analyticsStudioText(row.title, '-') },
                { id: 'student_name', label: 'الطالب', getValue: row => analyticsStudioText(row.student_name, '-') },
                { id: 'kind', label: 'التصنيف', getValue: row => row.thesisKind },
                { id: 'degree', label: 'الدرجة', getValue: row => row.degreeLabel },
                { id: 'specialization', label: 'التخصص', getValue: row => row.specializationLabel },
                { id: 'status', label: 'الحالة', getValue: row => row.statusLabel },
                { id: 'program', label: 'البرنامج', getValue: row => row.programLabel },
                { id: 'supervisor', label: 'المشرف', getValue: row => row.supervisorName },
                { id: 'department', label: 'القسم', getValue: row => row.supervisorDepartment },
                { id: 'defense_date', label: 'تاريخ المناقشة', getValue: row => formatDate(row.defense_date) }
            ],
            groups: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value), sort: 'numeric' },
                { id: 'kind', label: 'التصنيف', getValue: row => row.thesisKind },
                { id: 'degree', label: 'الدرجة', getValue: row => row.degreeLabel },
                { id: 'status', label: 'الحالة', getValue: row => row.statusLabel },
                { id: 'specialization', label: 'التخصص', getValue: row => row.specializationLabel },
                { id: 'supervisor', label: 'المشرف', getValue: row => row.supervisorName },
                { id: 'department', label: 'القسم', getValue: row => row.supervisorDepartment }
            ],
            filters: [
                { id: 'kind', label: 'التصنيف', getValue: row => row.thesisKind },
                { id: 'degree', label: 'الدرجة', getValue: row => row.degreeLabel },
                { id: 'status', label: 'الحالة', getValue: row => row.statusLabel },
                { id: 'specialization', label: 'التخصص', getValue: row => row.specializationLabel },
                { id: 'department', label: 'القسم', getValue: row => row.supervisorDepartment },
                { id: 'supervisor', label: 'المشرف', getValue: row => row.supervisorName }
            ],
            defaultMetrics: ['record_count', 'scientific_count', 'research_project_count', 'completed_count'],
            metrics: [
                { id: 'record_count', label: 'عدد السجلات', unit: 'سجل', compute: rows => rows.length, format: analyticsStudioFormatCount },
                { id: 'scientific_count', label: 'عدد الرسائل العلمية', unit: 'رسالة', compute: rows => analyticsStudioCountWhere(rows, row => row.thesisKind === 'رسالة علمية'), format: analyticsStudioFormatCount },
                { id: 'research_project_count', label: 'عدد المشاريع البحثية', unit: 'مشروع', compute: rows => analyticsStudioCountWhere(rows, row => row.thesisKind === 'مشروع بحثي'), format: analyticsStudioFormatCount },
                { id: 'completed_count', label: 'عدد المنجز', unit: 'سجل', compute: rows => analyticsStudioCountWhere(rows, row => row.statusLabel === 'منجزة'), format: analyticsStudioFormatCount },
                { id: 'ongoing_count', label: 'عدد الجاري', unit: 'سجل', compute: rows => analyticsStudioCountWhere(rows, row => row.statusLabel === 'جارية'), format: analyticsStudioFormatCount },
                { id: 'phd_count', label: 'عدد الدكتوراه', unit: 'سجل', compute: rows => analyticsStudioCountWhere(rows, row => row.degreeLabel === 'دكتوراه'), format: analyticsStudioFormatCount },
                { id: 'masters_count', label: 'عدد الماجستير', unit: 'سجل', compute: rows => analyticsStudioCountWhere(rows, row => row.degreeLabel === 'ماجستير'), format: analyticsStudioFormatCount },
                { id: 'unique_supervisors', label: 'عدد المشرفين الفريدين', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows, row => row.supervisor_id), format: analyticsStudioFormatCount }
            ]
        },
        participations: {
            key: 'participations',
            label: 'الفعاليات والمشاركات',
            rowLabel: 'فعالية',
            getRows: analyticsStudioGetParticipationRows,
            getYear: row => row.year,
            searchText: row => `${row.title || ''} ${row.categoryLabel || ''} ${row.participationTypeLabel || ''} ${row.locationLabel || ''} ${(row.participantNames || []).join(' ')} ${row.departmentLabel || ''}`,
            detailColumns: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value) },
                { id: 'title', label: 'العنوان', getValue: row => analyticsStudioText(row.title, '-') },
                { id: 'category', label: 'التصنيف', getValue: row => row.categoryLabel },
                { id: 'type', label: 'نوع المشاركة', getValue: row => row.participationTypeLabel },
                { id: 'participants', label: 'المشاركون', getValue: row => row.participantNames },
                { id: 'department', label: 'القسم', getValue: row => row.departmentList?.length ? row.departmentList : [row.departmentLabel] },
                { id: 'location', label: 'المكان', getValue: row => row.locationLabel },
                { id: 'organized', label: 'تنظيم القسم', getValue: row => row.organizedByDepartmentLabel },
                { id: 'student_details', label: 'تفاصيل الطلاب', getValue: row => analyticsStudioText(row.student_details, '-') },
                { id: 'date', label: 'التاريخ', getValue: row => formatDate(row.date) }
            ],
            groups: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value), sort: 'numeric' },
                { id: 'category', label: 'التصنيف', getValue: row => row.categoryLabel },
                { id: 'type', label: 'نوع المشاركة', getValue: row => row.participationTypeLabel },
                { id: 'department', label: 'القسم', getValue: row => row.departmentLabel },
                { id: 'location', label: 'المكان', getValue: row => row.locationLabel },
                { id: 'organized', label: 'تنظيم القسم', getValue: row => row.organizedByDepartmentLabel }
            ],
            filters: [
                { id: 'category', label: 'التصنيف', getValue: row => row.categoryLabel },
                { id: 'type', label: 'نوع المشاركة', getValue: row => row.participationTypeLabel },
                {
                    id: 'department',
                    label: 'القسم',
                    getValue: row => row.departmentLabel,
                    getOptionsValues: row => row.departmentList?.length ? row.departmentList : [row.departmentLabel],
                    matches: (row, selectedValue) => (row.departmentList || []).includes(selectedValue) || row.departmentLabel === selectedValue
                },
                { id: 'organized', label: 'تنظيم القسم', getValue: row => row.organizedByDepartmentLabel },
                { id: 'location', label: 'المكان', getValue: row => row.locationLabel }
            ],
            defaultMetrics: ['record_count', 'conference_count', 'workshop_count', 'unique_participants'],
            metrics: [
                { id: 'record_count', label: 'عدد السجلات', unit: 'فعالية', compute: rows => rows.length, format: analyticsStudioFormatCount },
                { id: 'conference_count', label: 'عدد المؤتمرات', unit: 'فعالية', compute: rows => analyticsStudioCountWhere(rows, row => analyticsStudioCategoryIncludes(row.categoryLabel, 'مؤتمر')), format: analyticsStudioFormatCount },
                { id: 'seminar_count', label: 'عدد الندوات', unit: 'فعالية', compute: rows => analyticsStudioCountWhere(rows, row => analyticsStudioCategoryIncludes(row.categoryLabel, 'ندوة')), format: analyticsStudioFormatCount },
                { id: 'workshop_count', label: 'عدد الورش', unit: 'فعالية', compute: rows => analyticsStudioCountWhere(rows, row => analyticsStudioCategoryIncludes(row.categoryLabel, 'ورشة')), format: analyticsStudioFormatCount },
                { id: 'award_count', label: 'عدد الجوائز', unit: 'جائزة', compute: rows => analyticsStudioCountWhere(rows, row => row.categoryLabel === 'جائزة'), format: analyticsStudioFormatCount },
                { id: 'patent_count', label: 'عدد البراءات', unit: 'براءة', compute: rows => analyticsStudioCountWhere(rows, row => analyticsStudioCategoryIncludes(row.categoryLabel, 'براءة')), format: analyticsStudioFormatCount },
                { id: 'student_research_count', label: 'عدد بحوث الطلاب', unit: 'بحث', compute: rows => analyticsStudioCountWhere(rows, row => row.categoryLabel === 'بحوث الطلاب'), format: analyticsStudioFormatCount },
                { id: 'unique_participants', label: 'عدد المشاركين الفريدين', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows, row => splitIds(row.participant_ids || '')), format: analyticsStudioFormatCount }
            ]
        },
        teaching: {
            key: 'teaching',
            label: 'النشاط التدريسي',
            rowLabel: 'شعبة',
            ensureLoaded: ensureTeachingLoaded,
            getRows: analyticsStudioBuildTeachingRows,
            getYear: row => row.year,
            searchText: row => `${row.courseName || ''} ${row.courseCode || ''} ${row.facultyName || ''} ${row.department || ''} ${row.mode || ''} ${row.degree || ''} ${row.programLabel || ''}`,
            detailColumns: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value) },
                { id: 'faculty', label: 'عضو هيئة التدريس', getValue: row => row.facultyName },
                { id: 'department', label: 'القسم', getValue: row => row.department },
                { id: 'rank', label: 'الرتبة العلمية', getValue: row => row.rank },
                { id: 'courseCode', label: 'رمز المقرر', getValue: row => row.courseCode },
                { id: 'courseName', label: 'اسم المقرر', getValue: row => row.courseName },
                { id: 'program', label: 'البرنامج', getValue: row => row.programLabel },
                { id: 'degree', label: 'الدرجة', getValue: row => row.degree },
                { id: 'mode', label: 'النمط', getValue: row => row.mode },
                { id: 'term', label: 'الفصل', getValue: row => row.term },
                { id: 'students', label: 'عدد الطلاب', getValue: row => analyticsStudioFormatCount(row.students) },
                { id: 'hours', label: 'الساعات', getValue: row => analyticsStudioFormatCount(row.hours) }
            ],
            groups: [
                { id: 'year', label: 'السنة', getValue: row => row.year, format: value => formatCustomStatsYearLabel(value), sort: 'numeric' },
                { id: 'department', label: 'القسم', getValue: row => row.department },
                { id: 'faculty', label: 'عضو هيئة التدريس', getValue: row => row.facultyName },
                { id: 'rank', label: 'الرتبة العلمية', getValue: row => row.rank },
                { id: 'degree', label: 'الدرجة', getValue: row => row.degree },
                { id: 'mode', label: 'النمط', getValue: row => row.mode },
                { id: 'program', label: 'البرنامج', getValue: row => row.programLabel }
            ],
            filters: [
                { id: 'department', label: 'القسم', getValue: row => row.department },
                { id: 'faculty', label: 'عضو هيئة التدريس', getValue: row => row.facultyName },
                { id: 'rank', label: 'الرتبة العلمية', getValue: row => row.rank, multi: true },
                { id: 'degree', label: 'الدرجة', getValue: row => row.degree },
                { id: 'mode', label: 'النمط', getValue: row => row.mode },
                { id: 'program', label: 'البرنامج', getValue: row => row.programLabel }
            ],
            defaultMetrics: ['sections_count', 'teaching_faculty_count', 'courses_count', 'students_sum', 'hours_sum'],
            metrics: [
                { id: 'sections_count', label: 'عدد الشعب', unit: 'شعبة', compute: rows => rows.length, format: analyticsStudioFormatCount },
                { id: 'teaching_faculty_count', label: 'عدد أعضاء التدريس', unit: 'عضو', compute: rows => analyticsStudioDistinctCount(rows, row => row.facultyId), format: analyticsStudioFormatCount },
                { id: 'courses_count', label: 'عدد المقررات', unit: 'مقرر', compute: rows => analyticsStudioDistinctCount(rows, row => row.courseCode || row.courseName), format: analyticsStudioFormatCount },
                { id: 'students_sum', label: 'عدد الطلاب', unit: 'طالب', compute: rows => analyticsStudioSum(rows, row => row.students), format: analyticsStudioFormatCount },
                { id: 'hours_sum', label: 'ساعات التدريس', unit: 'ساعة', compute: rows => analyticsStudioSum(rows, row => row.hours), format: analyticsStudioFormatCount },
                { id: 'avg_students_per_section', label: 'متوسط الطلاب/شعبة', unit: 'طالب', compute: rows => analyticsStudioAverage(rows, row => row.students), format: value => analyticsStudioFormatDecimal(value, 2) },
                { id: 'avg_hours_per_section', label: 'متوسط الساعات/شعبة', unit: 'ساعة', compute: rows => analyticsStudioAverage(rows, row => row.hours), format: value => analyticsStudioFormatDecimal(value, 2) }
            ]
        }
    };
}

function analyticsStudioGetFacultyRows() {
    return (allData.faculty || []).map(member => ({
        ...member,
        year: parseCustomStatsYear(member.year),
        department: analyticsStudioText(member.department, 'غير محدد'),
        rank: analyticsStudioText(member.rank, 'غير محدد'),
        active: analyticsStudioText(member.active, 'غير محدد')
    })).filter(row => row.year !== null);
}

function getAnalyticsStudioCurrentSource() {
    const sourceKey = document.getElementById('analyticsStudioSource')?.value;
    const definitions = getAnalyticsStudioSourceDefinitions();
    return definitions[sourceKey] || Object.values(definitions)[0] || null;
}

async function renderAnalyticsStudioBuilder(resetSelections = false) {
    const source = getAnalyticsStudioCurrentSource();
    if (!source) return;

    if (typeof source.ensureLoaded === 'function') {
        await source.ensureLoaded();
    }

    renderAnalyticsStudioYears(source, resetSelections);
    renderAnalyticsStudioGroups(source, resetSelections);
    renderAnalyticsStudioFilters(source, resetSelections);
    renderAnalyticsStudioMetrics(source, resetSelections);
    syncAnalyticsStudioGroupingState();

    const caption = document.getElementById('analyticsStudioFiltersCaption');
    if (caption) {
        const labels = (source.filters || []).map(filter => filter.label).join('، ');
        caption.textContent = labels ? `الفلاتر المتاحة لهذا المصدر: ${labels}.` : 'لا توجد فلاتر إضافية لهذا المصدر.';
    }
}

function renderAnalyticsStudioYears(source, resetSelections = false) {
    const fromSelect = document.getElementById('analyticsStudioYearFrom');
    const toSelect = document.getElementById('analyticsStudioYearTo');
    if (!fromSelect || !toSelect) return;

    const years = Array.from(new Set(source.getRows().map(row => source.getYear(row)).filter(year => year !== null))).sort((a, b) => a - b);
    if (!years.length) {
        fromSelect.innerHTML = '<option value="">—</option>';
        toSelect.innerHTML = '<option value="">—</option>';
        return;
    }

    const currentFrom = !resetSelections ? parseCustomStatsYear(fromSelect.value) : null;
    const currentTo = !resetSelections ? parseCustomStatsYear(toSelect.value) : null;
    const optionsHtml = years.map(year => `<option value="${year}">${formatCustomStatsYearLabel(year)}</option>`).join('');
    fromSelect.innerHTML = optionsHtml;
    toSelect.innerHTML = optionsHtml;
    fromSelect.value = years.includes(currentFrom) ? String(currentFrom) : String(years[0]);
    toSelect.value = years.includes(currentTo) ? String(currentTo) : String(years[years.length - 1]);
}

function renderAnalyticsStudioGroups(source, resetSelections = false) {
    const primarySelect = document.getElementById('analyticsStudioGroupPrimary');
    if (!primarySelect) return;

    const currentPrimary = !resetSelections ? primarySelect.value : '';
    primarySelect.innerHTML = '<option value="">بدون تجميع</option>' +
        source.groups.map(group => `<option value="${group.id}">${escapeHtml(group.label)}</option>`).join('');

    if (currentPrimary && source.groups.some(group => group.id === currentPrimary)) {
        primarySelect.value = currentPrimary;
    } else {
        primarySelect.value = '';
    }

    updateAnalyticsStudioSecondaryGroups(resetSelections);
}

function updateAnalyticsStudioSecondaryGroups(resetSelections = false) {
    const source = getAnalyticsStudioCurrentSource();
    const primarySelect = document.getElementById('analyticsStudioGroupPrimary');
    const secondarySelect = document.getElementById('analyticsStudioGroupSecondary');
    if (!source || !primarySelect || !secondarySelect) return;

    const primaryValue = primarySelect.value;
    const currentSecondary = !resetSelections ? secondarySelect.value : '';
    const optionsHtml = source.groups
        .filter(group => group.id !== primaryValue)
        .map(group => `<option value="${group.id}">${escapeHtml(group.label)}</option>`)
        .join('');

    secondarySelect.innerHTML = '<option value="">بدون تجميع ثانوي</option>' + optionsHtml;
    if (currentSecondary && primaryValue && source.groups.some(group => group.id === currentSecondary && group.id !== primaryValue)) {
        secondarySelect.value = currentSecondary;
    } else {
        secondarySelect.value = '';
    }
}

function syncAnalyticsStudioGroupingState() {
    const source = getAnalyticsStudioCurrentSource();
    const mode = document.getElementById('analyticsStudioMode')?.value || 'summary';
    const primarySelect = document.getElementById('analyticsStudioGroupPrimary');
    const secondarySelect = document.getElementById('analyticsStudioGroupSecondary');
    if (!source || !primarySelect || !secondarySelect) return;

    if (mode === 'summary') {
        primarySelect.value = '';
        secondarySelect.value = '';
        primarySelect.disabled = true;
        secondarySelect.disabled = true;
        return;
    }

    primarySelect.disabled = false;
    updateAnalyticsStudioSecondaryGroups();
    secondarySelect.disabled = !primarySelect.value;
    if (!primarySelect.value) secondarySelect.value = '';
}

function renderAnalyticsStudioFilters(source, resetSelections = false) {
    const container = document.getElementById('analyticsStudioFilters');
    if (!container) return;

    const rows = source.getRows();
    container.innerHTML = source.filters.map(filter => {
        const rawValues = Array.from(new Set(rows.flatMap(row => {
            const values = typeof filter.getOptionsValues === 'function'
                ? filter.getOptionsValues(row)
                : [filter.getValue(row)];
            return (Array.isArray(values) ? values : [values]).map(value => analyticsStudioText(value)).filter(Boolean);
        })));
        const options = rawValues.sort((a, b) => a.localeCompare(b, 'ar'));
        const defaultValues = resetSelections && filter.id === 'department' && currentDepartment !== 'all' && options.includes(currentDepartment)
            ? [currentDepartment]
            : [];
        const multipleAttr = filter.multi ? 'multiple size="5"' : '';
        const defaultAttr = encodeURIComponent(JSON.stringify(defaultValues));

        return `
            <div class="analytics-studio-field">
                <label for="analyticsStudioFilter_${filter.id}">${escapeHtml(filter.label)}</label>
                <select id="analyticsStudioFilter_${filter.id}" data-filter-id="${filter.id}" data-default-values="${defaultAttr}" ${multipleAttr}>
                    ${filter.multi ? '' : '<option value="">الكل</option>'}
                    ${options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
                </select>
            </div>
        `;
    }).join('');

    container.querySelectorAll('select').forEach(select => {
        const defaultValues = JSON.parse(decodeURIComponent(select.getAttribute('data-default-values') || '%5B%5D'));
        Array.from(select.options).forEach(option => {
            option.selected = defaultValues.includes(option.value);
        });
        select.addEventListener('change', analyticsStudioClearReport);
    });
}

function renderAnalyticsStudioMetrics(source, resetSelections = false) {
    const container = document.getElementById('analyticsStudioMetrics');
    if (!container) return;

    const currentChecked = !resetSelections
        ? Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value)
        : [];
    const selectedMetrics = currentChecked.length ? currentChecked : source.defaultMetrics;

    container.innerHTML = source.metrics.map(metric => {
        const checked = selectedMetrics.includes(metric.id) ? 'checked' : '';
        return `
            <label class="analytics-studio-metric-chip">
                <input type="checkbox" value="${metric.id}" ${checked}>
                <span class="analytics-studio-metric-chip-body">
                    <span class="analytics-studio-metric-title">${escapeHtml(metric.label)}</span>
                    <span class="analytics-studio-metric-meta">${escapeHtml(metric.unit ? `الوحدة: ${metric.unit}` : 'قيمة مباشرة')}</span>
                </span>
            </label>
        `;
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', analyticsStudioClearReport);
    });
}

function getSelectedAnalyticsStudioMetrics(source) {
    const selectedIds = Array.from(document.querySelectorAll('#analyticsStudioMetrics input[type="checkbox"]:checked'))
        .map(input => input.value);
    return source.metrics.filter(metric => selectedIds.includes(metric.id));
}

function getAnalyticsStudioSelectedFilterValues(filter) {
    const select = document.getElementById(`analyticsStudioFilter_${filter.id}`);
    if (!select) return [];
    if (filter.multi) {
        return Array.from(select.selectedOptions)
            .map(option => analyticsStudioText(option.value))
            .filter(Boolean);
    }
    const value = analyticsStudioText(select.value);
    return value ? [value] : [];
}

function getAnalyticsStudioFilteredRows(source) {
    const fromYear = parseCustomStatsYear(document.getElementById('analyticsStudioYearFrom')?.value);
    const toYear = parseCustomStatsYear(document.getElementById('analyticsStudioYearTo')?.value);
    const search = document.getElementById('analyticsStudioSearch')?.value || '';

    let rows = [...source.getRows()];
    rows = rows.filter(row => {
        const rowYear = source.getYear(row);
        if (rowYear === null) return false;
        if (fromYear !== null && rowYear < Math.min(fromYear, toYear ?? fromYear)) return false;
        if (toYear !== null && rowYear > Math.max(fromYear ?? toYear, toYear)) return false;
        return true;
    });

    source.filters.forEach(filter => {
        const selectedValues = getAnalyticsStudioSelectedFilterValues(filter);
        if (!selectedValues.length) return;
        rows = rows.filter(row => (
            typeof filter.matches === 'function'
                ? selectedValues.some(selectedValue => filter.matches(row, selectedValue))
                : selectedValues.includes(analyticsStudioText(filter.getValue(row)))
        ));
    });

    if (search.trim()) {
        rows = rows.filter(row => analyticsStudioQueryMatch(source.searchText(row), search));
    }

    return rows;
}

function computeAnalyticsStudioMetricValues(records, metricDefs) {
    const values = {};
    metricDefs.forEach(metric => {
        values[metric.id] = metric.compute(records);
    });
    return values;
}

function analyticsStudioFormatGroupValue(group, value) {
    if (!group) return analyticsStudioText(value, '—');
    return group.format ? group.format(value) : analyticsStudioText(value, 'غير محدد');
}

function analyticsStudioBuildYearLabel(rows, source) {
    const years = Array.from(new Set(rows.map(row => source.getYear(row)).filter(year => year !== null))).sort((a, b) => a - b);
    if (!years.length) return '—';
    if (years.length === 1) return formatCustomStatsYearLabel(years[0]);
    return `${formatCustomStatsYearLabel(years[0])} - ${formatCustomStatsYearLabel(years[years.length - 1])}`;
}

function analyticsStudioCompareGroupValues(left, right, group) {
    if (!group) return 0;
    if (group.sort === 'numeric') {
        return analyticsStudioNumber(left) - analyticsStudioNumber(right);
    }
    return analyticsStudioFormatGroupValue(group, left).localeCompare(analyticsStudioFormatGroupValue(group, right), 'ar');
}

function analyticsStudioSortGroups(rows, primaryGroup, secondaryGroup) {
    rows.sort((a, b) => {
        const primaryCmp = analyticsStudioCompareGroupValues(a.primaryValue, b.primaryValue, primaryGroup);
        if (primaryCmp !== 0) return primaryCmp;
        return analyticsStudioCompareGroupValues(a.secondaryValue, b.secondaryValue, secondaryGroup);
    });
}

function analyticsStudioBuildGroupedMetricRows(records, metricDefs, primaryGroup, secondaryGroup) {
    if (!primaryGroup) return [];

    const grouped = new Map();
    records.forEach(record => {
        const primaryValue = primaryGroup.getValue(record);
        const secondaryValue = secondaryGroup ? secondaryGroup.getValue(record) : '';
        const key = `${analyticsStudioText(primaryValue)}||${analyticsStudioText(secondaryValue)}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                primaryValue,
                secondaryValue,
                records: []
            });
        }

        grouped.get(key).records.push(record);
    });

    const rows = Array.from(grouped.values()).map(group => ({
        ...group,
        metricValues: computeAnalyticsStudioMetricValues(group.records, metricDefs)
    }));

    analyticsStudioSortGroups(rows, primaryGroup, secondaryGroup);
    return rows;
}

function analyticsStudioGetVisibleDetailColumns(source, primaryGroup, secondaryGroup) {
    const detailColumns = Array.isArray(source.detailColumns) ? source.detailColumns : [];
    const hiddenIds = new Set([primaryGroup?.id, secondaryGroup?.id].filter(Boolean));
    return detailColumns.filter(column => !hiddenIds.has(column.id));
}

function analyticsStudioSortDetailRecords(records, source, primaryGroup, secondaryGroup) {
    const rows = [...records];
    rows.sort((left, right) => {
        const primaryCmp = primaryGroup
            ? analyticsStudioCompareGroupValues(primaryGroup.getValue(left), primaryGroup.getValue(right), primaryGroup)
            : 0;
        if (primaryCmp !== 0) return primaryCmp;

        const secondaryCmp = secondaryGroup
            ? analyticsStudioCompareGroupValues(secondaryGroup.getValue(left), secondaryGroup.getValue(right), secondaryGroup)
            : 0;
        if (secondaryCmp !== 0) return secondaryCmp;

        const leftYear = source.getYear(left);
        const rightYear = source.getYear(right);
        if (leftYear !== rightYear) {
            return analyticsStudioNumber(rightYear) - analyticsStudioNumber(leftYear);
        }

        return analyticsStudioText(source.searchText(left)).localeCompare(analyticsStudioText(source.searchText(right)), 'ar');
    });
    return rows;
}

function analyticsStudioBuildCaption(report) {
    const parts = [
        report.source.label,
        report.mode === 'summary' ? 'تقرير إجمالي' : 'تقرير تفصيلي',
        `الفترة: ${report.yearLabel}`
    ];

    if (report.mode === 'detail') {
        if (report.primaryGroup) {
            const grouping = report.secondaryGroup
                ? `${report.primaryGroup.label} ثم ${report.secondaryGroup.label}`
                : report.primaryGroup.label;
            parts.push(`الترتيب: ${grouping}`);
        } else {
            parts.push('الترتيب: مباشر حسب السجلات');
        }
    }

    if (report.activeFilters.length) {
        parts.push(`الفلاتر: ${report.activeFilters.join('، ')}`);
    }

    if (report.searchText) {
        parts.push(`البحث: ${report.searchText}`);
    }

    return parts.join(' | ');
}

function runAnalyticsStudioReport() {
    const source = getAnalyticsStudioCurrentSource();
    if (!source) return;

    const mode = document.getElementById('analyticsStudioMode')?.value || 'summary';
    const metricDefs = getSelectedAnalyticsStudioMetrics(source);
    if (!metricDefs.length) {
        alert('اختر إحصائية واحدة على الأقل قبل بناء التقرير.');
        return;
    }

    const filteredRows = getAnalyticsStudioFilteredRows(source);
    if (!filteredRows.length) {
        analyticsStudioClearReport();
        alert('لا توجد بيانات مطابقة للفلاتر المختارة.');
        return;
    }

    const activeFilters = source.filters.map(filter => {
        const values = getAnalyticsStudioSelectedFilterValues(filter);
        return values.length ? `${filter.label}: ${values.join('، ')}` : '';
    }).filter(Boolean);

    const yearLabel = analyticsStudioBuildYearLabel(filteredRows, source);
    const searchText = analyticsStudioText(document.getElementById('analyticsStudioSearch')?.value);

    let rows = [];
    let primaryGroup = null;
    let secondaryGroup = null;
    let chartRows = [];
    let tableHeaders = [];
    let tableRows = [];
    let outputRowsCount = 0;

    const primaryId = mode === 'detail'
        ? analyticsStudioText(document.getElementById('analyticsStudioGroupPrimary')?.value)
        : '';
    const secondaryId = mode === 'detail'
        ? analyticsStudioText(document.getElementById('analyticsStudioGroupSecondary')?.value)
        : '';

    primaryGroup = source.groups.find(group => group.id === primaryId) || null;
    secondaryGroup = primaryGroup
        ? (source.groups.find(group => group.id === secondaryId && group.id !== primaryGroup.id) || null)
        : null;

    if (mode === 'summary') {
        rows = [{
            primaryValue: 'الإجمالي',
            secondaryValue: '',
            records: filteredRows,
            metricValues: computeAnalyticsStudioMetricValues(filteredRows, metricDefs)
        }];
        chartRows = rows;
        tableHeaders = ['النطاق', ...metricDefs.map(analyticsStudioMetricHeader)];
        tableRows = rows.map(row => [
            'إجمالي البيانات المطابقة',
            ...metricDefs.map(metric => metric.format(row.metricValues[metric.id]))
        ]);
        outputRowsCount = rows.length;
    } else if (Array.isArray(source.detailColumns) && source.detailColumns.length) {
        const detailColumns = analyticsStudioGetVisibleDetailColumns(source, primaryGroup, secondaryGroup);
        const detailRecords = analyticsStudioSortDetailRecords(filteredRows, source, primaryGroup, secondaryGroup);
        chartRows = primaryGroup ? analyticsStudioBuildGroupedMetricRows(filteredRows, metricDefs, primaryGroup, secondaryGroup) : [];
        rows = chartRows;
        tableHeaders = [
            ...(primaryGroup ? [primaryGroup.label] : []),
            ...(secondaryGroup ? [secondaryGroup.label] : []),
            ...detailColumns.map(column => column.label)
        ];
        tableRows = detailRecords.map(record => {
            const cells = [];
            if (primaryGroup) cells.push(analyticsStudioFormatGroupValue(primaryGroup, primaryGroup.getValue(record)));
            if (secondaryGroup) cells.push(analyticsStudioFormatGroupValue(secondaryGroup, secondaryGroup.getValue(record)));
            detailColumns.forEach(column => {
                cells.push(analyticsStudioFormatValue(column.getValue(record), column.format));
            });
            return cells;
        });
        outputRowsCount = tableRows.length;
    } else {
        if (!primaryGroup) {
            alert('اختر التجميع الأساسي لبناء التقرير التفصيلي لهذا المصدر.');
            return;
        }

        rows = analyticsStudioBuildGroupedMetricRows(filteredRows, metricDefs, primaryGroup, secondaryGroup);
        chartRows = rows;
        tableHeaders = [];
        if (primaryGroup) tableHeaders.push(primaryGroup.label);
        if (secondaryGroup) tableHeaders.push(secondaryGroup.label);
        tableHeaders.push(...metricDefs.map(analyticsStudioMetricHeader));
        tableRows = rows.map(row => {
            const cells = [];
            if (primaryGroup) {
                cells.push(analyticsStudioFormatGroupValue(primaryGroup, row.primaryValue));
            }
            if (secondaryGroup) {
                cells.push(analyticsStudioFormatGroupValue(secondaryGroup, row.secondaryValue));
            }
            metricDefs.forEach(metric => {
                cells.push(metric.format(row.metricValues[metric.id]));
            });
            return cells;
        });
        outputRowsCount = rows.length;
    }

    analyticsStudioReport = {
        source,
        mode,
        metricDefs,
        rows,
        chartRows,
        filteredRows,
        tableHeaders,
        tableRows,
        primaryGroup,
        secondaryGroup,
        filteredRowsCount: filteredRows.length,
        outputRowsCount,
        yearLabel,
        activeFilters,
        searchText,
        caption: '',
        filenameBase: analyticsStudioSafeFileName(`الاستوديو-الإحصائي-${source.label}-${mode === 'summary' ? 'إجمالي' : 'تفصيلي'}`)
    };
    analyticsStudioReport.caption = analyticsStudioBuildCaption(analyticsStudioReport);
    renderAnalyticsStudioResults();
}

function buildAnalyticsStudioSummaryCards(report) {
    if (!report) return [];

    if (report.mode === 'summary') {
        const summaryRow = report.rows[0];
        return [
            { value: analyticsStudioFormatCount(report.filteredRowsCount), label: report.source.rowLabel },
            { value: report.yearLabel, label: 'الفترة الزمنية' },
            ...report.metricDefs.slice(0, 4).map(metric => ({
                value: metric.format(summaryRow.metricValues[metric.id]),
                label: metric.label
            }))
        ];
    }

    const groupingLabel = report.secondaryGroup
        ? `${report.primaryGroup.label} + ${report.secondaryGroup.label}`
        : (report.primaryGroup?.label || 'بدون تجميع');
    return [
        { value: report.source.label, label: 'مصدر البيانات' },
        { value: analyticsStudioFormatCount(report.filteredRowsCount), label: report.source.rowLabel },
        { value: analyticsStudioFormatCount(report.outputRowsCount), label: 'الصفوف التفصيلية' },
        { value: report.yearLabel, label: 'الفترة الزمنية' },
        { value: groupingLabel, label: 'مستوى التفصيل' },
        { value: analyticsStudioFormatCount(report.metricDefs.length), label: 'الإحصاءات المختارة' },
        ...report.metricDefs.slice(0, 2).map(metric => ({
            value: metric.format(metric.compute(report.filteredRows || report.rows[0]?.records || [])),
            label: metric.label
        }))
    ];
}

function renderAnalyticsStudioResults() {
    if (!analyticsStudioReport) return;

    const results = document.getElementById('analyticsStudioResults');
    const caption = document.getElementById('analyticsStudioCaption');
    const summary = document.getElementById('analyticsStudioSummary');
    const head = document.getElementById('analyticsStudioTableHead');
    const body = document.getElementById('analyticsStudioTableBody');

    if (!results || !caption || !summary || !head || !body) return;

    caption.textContent = analyticsStudioReport.caption;
    const summaryCards = buildAnalyticsStudioSummaryCards(analyticsStudioReport);
    summary.innerHTML = summaryCards.map(card => `
        <div class="analytics-studio-summary-card">
            <span class="analytics-studio-summary-value">${escapeHtml(card.value)}</span>
            <span class="analytics-studio-summary-label">${escapeHtml(card.label)}</span>
        </div>
    `).join('');

    head.innerHTML = `<tr>${analyticsStudioReport.tableHeaders.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
    body.innerHTML = analyticsStudioReport.tableRows.map(row => `
        <tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
    `).join('');

    renderAnalyticsStudioChart();
    results.classList.remove('hidden');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ensureAnalyticsStudioChartCanvas() {
    const wrap = document.querySelector('#analytics .analytics-studio-chart-wrap');
    if (!wrap) return null;
    if (!document.getElementById('analyticsStudioChart')) {
        wrap.innerHTML = '<canvas id="analyticsStudioChart"></canvas>';
    }
    return wrap;
}

function renderAnalyticsStudioChart() {
    const wrap = ensureAnalyticsStudioChartCanvas();
    const title = document.getElementById('analyticsStudioChartTitle');
    if (!wrap || !analyticsStudioReport) return;

    analyticsStudioDestroyChart();
    const firstMetric = analyticsStudioReport.metricDefs[0];
    if (!firstMetric) {
        wrap.innerHTML = '<div class="analytics-studio-empty">لا توجد إحصاءات مختارة للرسم.</div>';
        return;
    }

    if (analyticsStudioReport.mode === 'detail' && !analyticsStudioReport.primaryGroup) {
        wrap.innerHTML = '<div class="analytics-studio-empty">في التقرير التفصيلي يظهر الرسم البياني عند اختيار تجميع أساسي.</div>';
        if (title) title.textContent = 'التمثيل البياني';
        return;
    }

    const ctx = document.getElementById('analyticsStudioChart')?.getContext('2d');
    if (!ctx) return;

    if (analyticsStudioReport.mode === 'summary') {
        const labels = analyticsStudioReport.metricDefs.map(metric => metric.label);
        const data = analyticsStudioReport.metricDefs.map(metric => analyticsStudioNumber(analyticsStudioReport.rows[0].metricValues[metric.id]));

        if (title) title.textContent = 'التمثيل البياني للإحصاءات المختارة';
        analyticsStudioChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'القيم الإجمالية',
                    data,
                    backgroundColor: [
                        'rgba(212, 175, 55, 0.75)',
                        'rgba(14, 165, 233, 0.75)',
                        'rgba(16, 185, 129, 0.75)',
                        'rgba(245, 158, 11, 0.75)',
                        'rgba(244, 63, 94, 0.75)',
                        'rgba(139, 92, 246, 0.75)'
                    ],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => `القيمة: ${analyticsStudioFormatDecimal(context.parsed.y ?? context.parsed, 2)}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#d1d5db', font: { family: 'Cairo', size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#d1d5db', font: { family: 'Cairo' } },
                        grid: { color: 'rgba(255,255,255,0.08)' }
                    }
                }
            }
        });
        return;
    }

    const maxGroups = 20;
    const sourceRows = Array.isArray(analyticsStudioReport.chartRows) ? analyticsStudioReport.chartRows : analyticsStudioReport.rows;
    const chartRows = sourceRows.slice(0, maxGroups);
    if (!chartRows.length) {
        wrap.innerHTML = '<div class="analytics-studio-empty">لا توجد مجموعات مناسبة للرسم البياني.</div>';
        if (title) title.textContent = 'التمثيل البياني';
        return;
    }

    if (analyticsStudioReport.secondaryGroup) {
        const primaryLabels = Array.from(new Set(chartRows.map(row => analyticsStudioFormatGroupValue(analyticsStudioReport.primaryGroup, row.primaryValue))));
        const secondaryLabels = Array.from(new Set(chartRows.map(row => analyticsStudioFormatGroupValue(analyticsStudioReport.secondaryGroup, row.secondaryValue))));

        const palette = ['#d4af37', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];
        const datasets = secondaryLabels.map((secondaryLabel, index) => ({
            label: secondaryLabel,
            data: primaryLabels.map(primaryLabel => {
                const found = chartRows.find(row =>
                    analyticsStudioFormatGroupValue(analyticsStudioReport.primaryGroup, row.primaryValue) === primaryLabel &&
                    analyticsStudioFormatGroupValue(analyticsStudioReport.secondaryGroup, row.secondaryValue) === secondaryLabel
                );
                return found ? analyticsStudioNumber(found.metricValues[firstMetric.id]) : 0;
            }),
            backgroundColor: palette[index % palette.length],
            borderRadius: 6
        }));

        if (title) title.textContent = `التمثيل البياني: ${firstMetric.label}`;
        analyticsStudioChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: primaryLabels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#d1d5db', font: { family: 'Cairo' } } }
                },
                scales: {
                    x: {
                        ticks: { color: '#d1d5db', font: { family: 'Cairo', size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#d1d5db', font: { family: 'Cairo' } },
                        grid: { color: 'rgba(255,255,255,0.08)' }
                    }
                }
            }
        });
        return;
    }

    const labels = chartRows.map(row => analyticsStudioFormatGroupValue(analyticsStudioReport.primaryGroup, row.primaryValue));
    const data = chartRows.map(row => analyticsStudioNumber(row.metricValues[firstMetric.id]));
    const isYearSeries = analyticsStudioReport.primaryGroup?.id === 'year';

    if (title) {
        const suffix = analyticsStudioReport.rows.length > maxGroups ? ' (أول 20 مجموعة)' : '';
        title.textContent = `التمثيل البياني: ${firstMetric.label}${suffix}`;
    }

    analyticsStudioChart = new Chart(ctx, {
        type: isYearSeries ? 'line' : 'bar',
        data: {
            labels,
            datasets: [{
                label: firstMetric.label,
                data,
                borderColor: '#d4af37',
                backgroundColor: isYearSeries
                    ? 'rgba(212, 175, 55, 0.18)'
                    : labels.map((_, index) => ['#d4af37', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'][index % 6]),
                borderRadius: 8,
                fill: isYearSeries,
                tension: 0.28,
                pointRadius: isYearSeries ? 4 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: isYearSeries, labels: { color: '#d1d5db', font: { family: 'Cairo' } } }
            },
            scales: {
                x: {
                    ticks: { color: '#d1d5db', font: { family: 'Cairo', size: 10 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#d1d5db', font: { family: 'Cairo' } },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                }
            }
        }
    });
}

function buildAnalyticsStudioExportMatrix() {
    if (!analyticsStudioReport) return [];
    return [
        analyticsStudioReport.tableHeaders,
        ...analyticsStudioReport.tableRows
    ];
}

function buildAnalyticsStudioTableHtml(matrix) {
    if (!matrix.length) return '';
    const [headers, ...rows] = matrix;
    return `
        <table>
            <thead>
                <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
            </tbody>
        </table>
    `;
}

function exportAnalyticsStudioCSV() {
    if (!analyticsStudioReport) return;
    const csvText = convertMatrixToDelimitedText(buildAnalyticsStudioExportMatrix());
    downloadCSV(csvText, `${analyticsStudioReport.filenameBase}.csv`);
}

function exportAnalyticsStudioExcel() {
    if (!analyticsStudioReport) return;

    const summaryRows = buildAnalyticsStudioSummaryCards(analyticsStudioReport)
        .map(card => `<tr><td>${escapeHtml(card.label)}</td><td>${escapeHtml(card.value)}</td></tr>`)
        .join('');
    const tableHtml = buildAnalyticsStudioTableHtml(buildAnalyticsStudioExportMatrix());

    const html = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Tahoma, Arial, sans-serif; padding: 24px; direction: rtl; }
                h1 { color: #1f2937; }
                p { color: #4b5563; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; }
                th { background: #e2e8f0; }
            </style>
        </head>
        <body>
            <h1>الاستوديو الإحصائي</h1>
            <p>${escapeHtml(analyticsStudioReport.caption)}</p>
            <table>${summaryRows}</table>
            ${tableHtml}
        </body>
        </html>
    `;

    const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    downloadBlobFile(blob, `${analyticsStudioReport.filenameBase}.xls`);
}

function exportAnalyticsStudioPDF() {
    if (!analyticsStudioReport) return;

    const chartImage = analyticsStudioChart ? analyticsStudioChart.toBase64Image() : '';
    const summaryCards = buildAnalyticsStudioSummaryCards(analyticsStudioReport).map(card => `
        <div class="summary-item">
            <strong>${escapeHtml(card.value)}</strong>
            <span>${escapeHtml(card.label)}</span>
        </div>
    `).join('');

    const printContent = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>الاستوديو الإحصائي</title>
            <style>
                body { font-family: "Cairo", Tahoma, Arial, sans-serif; margin: 24px; color: #111827; direction: rtl; }
                h1, h2 { margin-bottom: 8px; }
                p { color: #374151; line-height: 1.8; }
                .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0 24px; }
                .summary-item { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px; text-align: center; }
                .summary-item strong { display: block; font-size: 1.2rem; margin-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; vertical-align: top; }
                th { background: #f3f4f6; }
                img { max-width: 100%; margin-top: 18px; border: 1px solid #e5e7eb; border-radius: 14px; }
                @media print { body { margin: 10mm; } }
            </style>
        </head>
        <body>
            <h1>الاستوديو الإحصائي</h1>
            <p>${escapeHtml(analyticsStudioReport.caption)}</p>
            <div class="summary-grid">${summaryCards}</div>
            ${chartImage ? `<img src="${chartImage}" alt="Analytics Chart">` : ''}
            ${buildAnalyticsStudioTableHtml(buildAnalyticsStudioExportMatrix())}
            <script>window.onload = function(){ window.print(); };</script>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
        return;
    }

    printWindow.document.write(printContent);
    printWindow.document.close();
}

function resetAnalyticsStudioView() {
    const modeSelect = document.getElementById('analyticsStudioMode');
    const sourceSelect = document.getElementById('analyticsStudioSource');
    const searchInput = document.getElementById('analyticsStudioSearch');

    if (modeSelect) modeSelect.value = 'summary';
    if (sourceSelect && !sourceSelect.value) {
        const firstOption = sourceSelect.querySelector('option');
        sourceSelect.value = firstOption ? firstOption.value : '';
    }
    if (searchInput) searchInput.value = '';

    renderAnalyticsStudioBuilder(true).then(() => {
        document.getElementById('analyticsStudioResults')?.classList.add('hidden');
        analyticsStudioReport = null;
        analyticsStudioDestroyChart();
    });
}

function setupAnalyticsStudio() {
    if (analyticsStudioInitialized) return;

    const sourceSelect = document.getElementById('analyticsStudioSource');
    const modeSelect = document.getElementById('analyticsStudioMode');
    if (!sourceSelect || !modeSelect) return;

    const sources = Object.values(getAnalyticsStudioSourceDefinitions());
    sourceSelect.innerHTML = sources.map(source => `<option value="${source.key}">${escapeHtml(source.label)}</option>`).join('');

    sourceSelect.addEventListener('change', async () => {
        await renderAnalyticsStudioBuilder(true);
        analyticsStudioClearReport();
    });
    modeSelect.addEventListener('change', () => {
        syncAnalyticsStudioGroupingState();
        analyticsStudioClearReport();
    });
    document.getElementById('analyticsStudioGroupPrimary')?.addEventListener('change', () => {
        updateAnalyticsStudioSecondaryGroups();
        analyticsStudioClearReport();
    });
    document.getElementById('analyticsStudioGroupSecondary')?.addEventListener('change', analyticsStudioClearReport);
    document.getElementById('analyticsStudioYearFrom')?.addEventListener('change', analyticsStudioClearReport);
    document.getElementById('analyticsStudioYearTo')?.addEventListener('change', analyticsStudioClearReport);
    document.getElementById('analyticsStudioSearch')?.addEventListener('input', analyticsStudioClearReport);
    document.getElementById('analyticsStudioRunBtn')?.addEventListener('click', runAnalyticsStudioReport);
    document.getElementById('analyticsStudioResetBtn')?.addEventListener('click', resetAnalyticsStudioView);
    document.getElementById('analyticsStudioExportPdfBtn')?.addEventListener('click', exportAnalyticsStudioPDF);
    document.getElementById('analyticsStudioExportCsvBtn')?.addEventListener('click', exportAnalyticsStudioCSV);
    document.getElementById('analyticsStudioExportExcelBtn')?.addEventListener('click', exportAnalyticsStudioExcel);

    analyticsStudioInitialized = true;
    resetAnalyticsStudioView();
}

// ========================================
// عرض الرسائل العلمية
// ========================================
function renderTheses() {
    const tbody = document.getElementById('thesesTableBody');
    tbody.innerHTML = '';

    const filtered = getFilteredThesesRecords();
    currentThesesView = filtered;
    
    filtered.forEach(thesis => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => showThesisDetails(thesis);
        tr.innerHTML = `
            <td><span class="badge badge-${(thesis.type || '').trim() === 'دكتوراه' ? 'phd' : 'masters'}">${getThesisTypeName(thesis.type, thesis)}</span></td>
            <td>${thesis.student_name}</td>
            <td>${thesis.title}</td>
            <td>${getMemberName(thesis.supervisor_id)}</td>
            <td><span class="badge badge-${(thesis.status || '').trim() === 'منجزة' ? 'completed' : 'ongoing'}">${thesis.status}</span></td>
            <td>${formatDate(thesis.defense_date)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function showThesisDetails(thesis) {
    currentThesis = thesis;
    currentDetailContext = { entity: 'theses', record: thesis, modalKind: 'thesis' };
    const modal = document.getElementById('thesisModal');
    const thesisType = (thesis.type || '').trim();
    const programName = getThesisProgramLabel(thesis);
    
    document.getElementById('modalBadge').textContent = programName;
    document.getElementById('modalBadge').className = 'thesis-badge ' + (thesisType === 'دكتوراه' ? 'phd' : 'masters');
    document.getElementById('modalTitle').textContent = thesis.title;
    document.getElementById('modalStudent').textContent = thesis.student_name;
    document.getElementById('modalProgram').textContent = programName;
    document.getElementById('modalLocation').textContent = config.university_name || 'جامعة الطائف';
    document.getElementById('modalStatus').textContent = thesis.status;
    document.getElementById('modalDate').textContent = formatDate(thesis.defense_date);
    document.getElementById('modalSupervisor').textContent = getMemberName(thesis.supervisor_id);
    
    // المشرف المشارك
    const coSupervisorSection = document.getElementById('coSupervisorSection');
    if (thesis.co_supervisor_id && thesis.co_supervisor_id.trim()) {
        coSupervisorSection.style.display = 'block';
        document.getElementById('modalCoSupervisor').textContent = getMemberName(thesis.co_supervisor_id);
    } else {
        coSupervisorSection.style.display = 'none';
    }
    
    // المناقش الأول
    const examiner1Section = document.getElementById('examiner1Section');
    const examiner1Name = getMemberName(thesis.examiner1_id);
    if (thesis.examiner1_id && thesis.examiner1_id.trim() && examiner1Name !== '-') {
        examiner1Section.style.display = 'block';
        document.getElementById('modalExaminer1').textContent = examiner1Name;
    } else {
        examiner1Section.style.display = 'none';
    }
    
    // المناقش الثاني
    const examiner2Section = document.getElementById('examiner2Section');
    const examiner2Name = getMemberName(thesis.examiner2_id);
    if (thesis.examiner2_id && thesis.examiner2_id.trim() && examiner2Name !== '-') {
        examiner2Section.style.display = 'block';
        document.getElementById('modalExaminer2').textContent = examiner2Name;
    } else {
        examiner2Section.style.display = 'none';
    }

    const thesisModifiedByEl = document.getElementById('thesisModifiedBy');
    if (thesisModifiedByEl) {
        thesisModifiedByEl.innerHTML = getRecordModifiedByHtml(thesis);
    }
    
    ensureThesisDetailActions();
    updateDetailActionAvailability();
    modal.classList.add('active');
}

// ========================================
// طباعة الرسالة العلمية
// ========================================
function printThesis() {
    if (!currentThesis) return;
    
    const thesis = currentThesis;
    const thesisType = (thesis.type || '').trim();
    const programName = getThesisProgramLabel(thesis);
    const universityName = config.university_name || 'جامعة الطائف';
    const departmentName = config.department_name || 'قسم القراءات';
    
    // تحضير أعضاء اللجنة
    const supervisor = getMemberName(thesis.supervisor_id);
    const coSupervisor = thesis.co_supervisor_id?.trim() ? getMemberName(thesis.co_supervisor_id) : null;
    const examiner1Name = getMemberName(thesis.examiner1_id);
    const examiner2Name = getMemberName(thesis.examiner2_id);
    const examiner1 = thesis.examiner1_id?.trim() && examiner1Name !== '-' ? examiner1Name : null;
    const examiner2 = thesis.examiner2_id?.trim() && examiner2Name !== '-' ? examiner2Name : null;
    
    // تحديد عنوان الصفحة حسب تصنيف الرسالة (رسالة علمية/مشروع بحثي)
    const pageTitle = isScientificThesis(thesis) ? 'بيانات الرسالة العلمية' : 'بيانات المشروع البحثي';
    
    const printContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>${pageTitle} - ${thesis.student_name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Cairo', 'Amiri', sans-serif;
            background: #fff;
            color: #1a1a2e;
            padding: 40px;
            line-height: 1.8;
        }
        
        .print-container {
            max-width: 800px;
            margin: 0 auto;
            border: 3px double #c6a962;
            padding: 40px;
            position: relative;
        }
        
        .print-header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #c6a962;
        }
        
        .university-name {
            font-size: 24px;
            font-weight: 700;
            color: #1a365d;
            margin-bottom: 5px;
        }
        
        .department-name {
            font-size: 18px;
            color: #666;
            margin-bottom: 15px;
        }
        
        .document-title {
            font-size: 20px;
            font-weight: 700;
            color: #c6a962;
            background: #1a365d;
            padding: 10px 30px;
            display: inline-block;
            border-radius: 25px;
        }
        
        .thesis-badge-print {
            display: inline-block;
            padding: 8px 25px;
            border-radius: 20px;
            font-size: 16px;
            font-weight: 600;
            margin: 20px 0;
        }
        
        .thesis-badge-print.phd {
            background: linear-gradient(135deg, #c6a962, #a08339);
            color: #1a1a2e;
        }
        
        .thesis-badge-print.masters {
            background: linear-gradient(135deg, #4a9d9a, #2d6a6a);
            color: #fff;
        }
        
        .thesis-title-print {
            font-size: 22px;
            font-weight: 700;
            color: #1a365d;
            text-align: center;
            margin: 25px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
            border-right: 5px solid #c6a962;
        }
        
        .info-section { margin: 30px 0; }
        
        .info-section h3 {
            font-size: 18px;
            color: #c6a962;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 1px solid #eee;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        
        .info-item-print {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-right: 3px solid #1a365d;
        }
        
        .info-label-print {
            font-size: 12px;
            color: #888;
            margin-bottom: 5px;
        }
        
        .info-value-print {
            font-size: 16px;
            font-weight: 600;
            color: #1a365d;
        }
        
        .committee-grid-print {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        
        .committee-member-print {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #eee;
        }
        
        .committee-member-print.supervisor {
            border-color: #c6a962;
            background: linear-gradient(145deg, #fffbf0, #fff9e6);
        }
        
        .committee-member-print.examiner {
            border-color: #0ea5e9;
            background: linear-gradient(145deg, #f0f9ff, #e6f4ff);
        }
        
        .member-role-print {
            font-size: 12px;
            color: #c6a962;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .committee-member-print.examiner .member-role-print {
            color: #0ea5e9;
        }
        
        .member-name-print {
            font-size: 15px;
            color: #1a365d;
            font-weight: 600;
        }
        
        .print-footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #c6a962;
            text-align: center;
            color: #888;
            font-size: 12px;
        }
        
        .decorative-corner {
            position: absolute;
            width: 50px;
            height: 50px;
            border: 3px solid #c6a962;
        }
        
        .corner-top-right { top: 10px; right: 10px; border-left: none; border-bottom: none; }
        .corner-top-left { top: 10px; left: 10px; border-right: none; border-bottom: none; }
        .corner-bottom-right { bottom: 10px; right: 10px; border-left: none; border-top: none; }
        .corner-bottom-left { bottom: 10px; left: 10px; border-right: none; border-top: none; }
        
        @media print {
            body { padding: 0; }
            .print-container { border: 2px solid #333; }
        }
    </style>
</head>
<body>
    <div class="print-container">
        <div class="decorative-corner corner-top-right"></div>
        <div class="decorative-corner corner-top-left"></div>
        <div class="decorative-corner corner-bottom-right"></div>
        <div class="decorative-corner corner-bottom-left"></div>
        
        <div class="print-header">
            <div class="university-name">${universityName}</div>
            <div class="department-name">${departmentName}</div>
            <div class="document-title">${pageTitle}</div>
        </div>
        
        <div style="text-align: center;">
            <span class="thesis-badge-print ${thesisType === 'دكتوراه' ? 'phd' : 'masters'}">${programName}</span>
        </div>
        
        <div class="thesis-title-print">${thesis.title}</div>
        
        <div class="info-section">
            <h3>📋 البيانات الأساسية</h3>
            <div class="info-grid">
                <div class="info-item-print">
                    <div class="info-label-print">اسم الطالب</div>
                    <div class="info-value-print">${thesis.student_name}</div>
                </div>
                <div class="info-item-print">
                    <div class="info-label-print">البرنامج</div>
                    <div class="info-value-print">${programName}</div>
                </div>
                <div class="info-item-print">
                    <div class="info-label-print">المكان</div>
                    <div class="info-value-print">${universityName}</div>
                </div>
                <div class="info-item-print">
                    <div class="info-label-print">الحالة</div>
                    <div class="info-value-print">${thesis.status}</div>
                </div>
                <div class="info-item-print" style="grid-column: span 2;">
                    <div class="info-label-print">تاريخ المناقشة</div>
                    <div class="info-value-print">${formatDate(thesis.defense_date)}</div>
                </div>
            </div>
        </div>
        
        <div class="info-section">
            <h3>👥 لجنة الإشراف والمناقشة</h3>
            <div class="committee-grid-print">
                <div class="committee-member-print supervisor">
                    <div class="member-role-print">المشرف الرئيسي</div>
                    <div class="member-name-print">${supervisor}</div>
                </div>
                ${coSupervisor ? `
                <div class="committee-member-print supervisor">
                    <div class="member-role-print">المشرف المشارك</div>
                    <div class="member-name-print">${coSupervisor}</div>
                </div>
                ` : ''}
                ${examiner1 ? `
                <div class="committee-member-print examiner">
                    <div class="member-role-print">المناقش الأول</div>
                    <div class="member-name-print">${examiner1}</div>
                </div>
                ` : ''}
                ${examiner2 ? `
                <div class="committee-member-print examiner">
                    <div class="member-role-print">المناقش الثاني</div>
                    <div class="member-name-print">${examiner2}</div>
                </div>
                ` : ''}
            </div>
        </div>
        
        <div class="print-footer">
            <p>تم الطباعة من نظام الأنشطة العلمية - ${departmentName} - ${universityName}</p>
            <p>التاريخ: ${new Date().toLocaleDateString('ar-SA-u-ca-islamic-umalqura')}</p>
        </div>
    </div>
    
    <script>window.onload = function() { window.print(); }</script>
</body>
</html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
}

// إغلاق Modal
document.addEventListener('click', (e) => {
    const modal = document.getElementById('thesisModal');
    if (!modal) return;
    if (e.target === modal || (e.target.classList?.contains('modal-close') && modal.contains(e.target))) {
        modal.classList.remove('active');
    }
});

document.addEventListener('click', (e) => {
    if (e.target?.id === 'recordDetailModal') closeRecordDetailModal();
    if (e.target?.id === 'recordEditorModal') closeRecordEditModal();
    if (e.target?.id === 'privilegePasswordModal') closePrivilegePasswordModal();
    if (e.target?.id === 'statsDetailModal') closeStatsDetailModal();
});

// ========================================
// عرض البحوث المنشورة
// ========================================
function normalizeJournalStatKey(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function isUnknownPublicationMetaValue(value) {
    const normalized = normalizeJournalStatKey(value);
    return !normalized || normalized === 'غير محدد' || normalized === 'unknown' || normalized === '-';
}

function parsePublicationJournalMeta(journalText) {
    const raw = String(journalText || '').trim().replace(/\s+/g, ' ');
    if (!raw) {
        return {
            journalName: 'غير محدد',
            institution: 'غير محدد',
            city: 'غير محدد',
            country: 'غير محدد',
            journalKey: 'unknown'
        };
    }

    const dashParts = raw.split(/\s*-\s*/);
    const beforeDash = (dashParts.shift() || raw).trim();
    const locationPart = dashParts.join(' - ').trim();

    const institutionMatch = beforeDash.match(/\(([^)]+)\)/);
    let institution = institutionMatch ? institutionMatch[1].trim() : '';

    let journalName = beforeDash.replace(/\([^)]*\)/g, '').trim();
    if (!journalName) journalName = beforeDash;
    if (!institution && /جامعة/.test(journalName)) institution = journalName;

    let city = 'غير محدد';
    let country = 'غير محدد';
    if (locationPart) {
        const locationTokens = locationPart
            .split(/[،,]/)
            .map(token => token.trim())
            .filter(Boolean);

        if (locationTokens.length === 1) {
            country = locationTokens[0];
        } else if (locationTokens.length >= 2) {
            city = locationTokens[0];
            country = locationTokens[locationTokens.length - 1];
        }
    }

    return {
        journalName,
        institution: institution || 'غير محدد',
        city,
        country,
        journalKey: normalizeJournalStatKey(journalName) || 'unknown'
    };
}

function incrementLabeledCounter(counterMap, rawKey, rawLabel) {
    const key = normalizeJournalStatKey(rawKey || rawLabel) || 'unknown';
    const label = String(rawLabel || rawKey || 'غير محدد').trim() || 'غير محدد';
    const current = counterMap.get(key);
    if (current) {
        current.count += 1;
    } else {
        counterMap.set(key, { key, label, count: 1 });
    }
}

function toTopCounterEntries(counterMap, limit = 6) {
    return Array.from(counterMap.values())
        .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, 'ar'))
        .slice(0, limit);
}

function closeJournalPublicationsPanel(skipRerender = false) {
    publicationStatsState.selectedJournal = '';
    publicationStatsState.selectedRecords = [];
    const panel = document.getElementById('journalPublicationsPanel');
    if (panel) {
        panel.style.display = 'none';
        panel.innerHTML = '';
    }
    if (!skipRerender) {
        renderPublicationVesselStats(publicationStatsState.records || []);
    }
}

function getScopedPublicationRecords(records, scopeType, scopeKey) {
    if (!Array.isArray(records)) return [];
    return records.filter(pub => {
        const meta = parsePublicationJournalMeta(pub.journal);
        if (scopeType === 'city') return normalizeJournalStatKey(meta.city) === scopeKey;
        if (scopeType === 'country') return normalizeJournalStatKey(meta.country) === scopeKey;
        if (scopeType === 'institution') return normalizeJournalStatKey(meta.institution) === scopeKey;
        return false;
    });
}

function showJournalPublications(journalKey, sourceRecords = publicationStatsState.records, contextLabel = '') {
    const panel = document.getElementById('journalPublicationsPanel');
    const records = Array.isArray(sourceRecords) ? sourceRecords : [];
    if (!panel || !journalKey || !records.length) return;

    const selected = records.filter(pub => parsePublicationJournalMeta(pub.journal).journalKey === journalKey);
    if (!selected.length) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
    }

    const sorted = sortByDateDesc(selected, p => p.publish_date || p.date);
    publicationStatsState.selectedJournal = journalKey;
    publicationStatsState.selectedRecords = sorted;
    const journalLabel = parsePublicationJournalMeta(sorted[0].journal).journalName;
    const contextSuffix = contextLabel ? ` <span class="journal-context-label">(${escapeHtml(contextLabel)})</span>` : '';

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="journal-panel-header">
            <h3>📚 بحوث منشورة في: ${escapeHtml(journalLabel)}${contextSuffix}</h3>
            <button type="button" class="journal-panel-close" onclick="closeJournalPublicationsPanel()">إخفاء</button>
        </div>
        <div class="journal-publications-list">
            ${sorted.map((pub, index) => {
                const authorIds = pub.authors_ids || pub.participant_ids || '';
                const authors = authorIds.split('|').map(id => getMemberName(id.trim())).filter(Boolean);
                return `
                    <div class="journal-publication-item" data-journal-record-index="${index}">
                        <div class="jp-title">${escapeHtml(pub.title || '-')}</div>
                        <div class="jp-meta">${escapeHtml((pub.journal || '').trim())}</div>
                        <div class="jp-authors">${authors.map(a => `<span class="author-tag">${escapeHtml(a)}</span>`).join('')}</div>
                        <div class="jp-footer">
                            <span>${escapeHtml(formatDate(pub.publish_date || pub.date))}</span>
                            <span>${escapeHtml(pub.citations_range || '-')}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    panel.querySelectorAll('[data-journal-record-index]').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.getAttribute('data-journal-record-index'), 10);
            const pub = publicationStatsState.selectedRecords?.[idx];
            if (pub) showPublicationDetails(pub);
        });
    });
}

function showScopeJournals(scopeType, scopeKey, scopeLabel) {
    const panel = document.getElementById('journalPublicationsPanel');
    const records = Array.isArray(publicationStatsState.records) ? publicationStatsState.records : [];
    if (!panel || !scopeType || !scopeKey || !records.length) return;

    const scopedRecords = getScopedPublicationRecords(records, scopeType, scopeKey);
    const journalCounter = new Map();

    scopedRecords.forEach(pub => {
        const meta = parsePublicationJournalMeta(pub.journal);
        if (!isUnknownPublicationMetaValue(meta.journalName) && meta.journalKey !== 'unknown') {
            incrementLabeledCounter(journalCounter, meta.journalKey, meta.journalName);
        }
    });

    const journals = toTopCounterEntries(journalCounter, 50);
    const scopeTitleMap = {
        city: 'مجلات النشر في المدينة',
        country: 'مجلات النشر في الدولة',
        institution: 'مجلات الجهة'
    };
    const scopeTitle = scopeTitleMap[scopeType] || 'المجلات';

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="journal-panel-header">
            <h3>📍 ${escapeHtml(scopeTitle)}: ${escapeHtml(scopeLabel)}</h3>
            <button type="button" class="journal-panel-close" onclick="closeJournalPublicationsPanel()">إخفاء</button>
        </div>
        ${journals.length ? `
            <div class="scope-journals-list">
                ${journals.map(entry => `
                    <button type="button" class="vessel-stat-btn scope-journal-btn" data-scope-journal-key="${encodeURIComponent(entry.key)}">
                        <span class="vessel-label">${escapeHtml(entry.label)}</span>
                        <span class="vessel-count">${entry.count.toLocaleString('ar-SA')}</span>
                    </button>
                `).join('')}
            </div>
            <div class="vessel-stat-hint">انقر على اسم المجلة لعرض البحوث المنشورة فيها</div>
        ` : `
            <div class="vessel-empty">لا توجد مجلات محددة لهذه القيمة.</div>
        `}
    `;

    panel.querySelectorAll('[data-scope-journal-key]').forEach(btn => {
        btn.addEventListener('click', () => {
            const encodedKey = btn.getAttribute('data-scope-journal-key') || '';
            const journalKey = decodeURIComponent(encodedKey);
            showJournalPublications(journalKey, scopedRecords, `${scopeLabel}`);
        });
    });
}

function renderPublicationVesselStats(records) {
    const container = document.getElementById('publicationVesselStats');
    const section = document.getElementById('publicationVesselsSection');
    if (!container) return;

    if (!Array.isArray(records) || records.length === 0) {
        publicationStatsState.records = [];
        publicationStatsState.selectedRecords = [];
        container.innerHTML = '';
        if (section) section.style.display = 'none';
        closeJournalPublicationsPanel(true);
        return;
    }

    if (section) section.style.display = 'block';
    publicationStatsState.records = records;

    const journalCounter = new Map();
    const institutionCounter = new Map();
    const cityCounter = new Map();
    const countryCounter = new Map();

    records.forEach(pub => {
        const meta = parsePublicationJournalMeta(pub.journal);
        if (!isUnknownPublicationMetaValue(meta.journalName) && meta.journalKey !== 'unknown') {
            incrementLabeledCounter(journalCounter, meta.journalKey, meta.journalName);
        }
        if (!isUnknownPublicationMetaValue(meta.institution)) {
            incrementLabeledCounter(institutionCounter, meta.institution, meta.institution);
        }
        if (!isUnknownPublicationMetaValue(meta.city)) {
            incrementLabeledCounter(cityCounter, meta.city, meta.city);
        }
        if (!isUnknownPublicationMetaValue(meta.country)) {
            incrementLabeledCounter(countryCounter, meta.country, meta.country);
        }
    });

    const topJournals = toTopCounterEntries(journalCounter, 8);
    const topInstitutions = toTopCounterEntries(institutionCounter, 6);
    const topCities = toTopCounterEntries(cityCounter, 6);
    const topCountries = toTopCounterEntries(countryCounter, 6);

    const listHtml = (entries, mode, scopeType = '') => {
        if (!entries.length) return '<div class="vessel-empty">لا توجد بيانات</div>';
        return entries.map(entry => {
            if (mode === 'journal') {
                return `
                    <button type="button" class="vessel-stat-btn" data-journal-key="${encodeURIComponent(entry.key)}">
                        <span class="vessel-label">${escapeHtml(entry.label)}</span>
                        <span class="vessel-count">${entry.count.toLocaleString('ar-SA')}</span>
                    </button>
                `;
            }
            if (mode === 'scope') {
                return `
                    <button type="button" class="vessel-stat-btn" data-scope-type="${scopeType}" data-scope-key="${encodeURIComponent(entry.key)}" data-scope-label="${escapeHtml(entry.label)}">
                        <span class="vessel-label">${escapeHtml(entry.label)}</span>
                        <span class="vessel-count">${entry.count.toLocaleString('ar-SA')}</span>
                    </button>
                `;
            }
            return `
                <div class="vessel-stat-row">
                    <span class="vessel-label">${escapeHtml(entry.label)}</span>
                    <span class="vessel-count">${entry.count.toLocaleString('ar-SA')}</span>
                </div>
            `;
        }).join('');
    };

    container.innerHTML = `
        <div class="vessel-stat-card">
            <h3>🏷️ أكثر المجلات</h3>
            <div class="vessel-stat-list">${listHtml(topJournals, 'journal')}</div>
            <div class="vessel-stat-hint">انقر على اسم المجلة لعرض البحوث المنشورة فيها</div>
        </div>
        <div class="vessel-stat-card">
            <h3>🏛️ الجهات/الجامعات الناشرة</h3>
            <div class="vessel-stat-list">${listHtml(topInstitutions, 'row')}</div>
        </div>
        <div class="vessel-stat-card">
            <h3>🌍 أكثر المدن نشرًا</h3>
            <div class="vessel-stat-list">${listHtml(topCities, 'scope', 'city')}</div>
            <div class="vessel-stat-hint">انقر على المدينة لعرض المجلات فيها</div>
        </div>
        <div class="vessel-stat-card">
            <h3>🗺️ أكثر الدول نشرًا</h3>
            <div class="vessel-stat-list">${listHtml(topCountries, 'scope', 'country')}</div>
            <div class="vessel-stat-hint">انقر على الدولة لعرض المجلات فيها</div>
        </div>
    `;

    container.querySelectorAll('[data-journal-key]').forEach(btn => {
        btn.addEventListener('click', () => {
            const encodedKey = btn.getAttribute('data-journal-key') || '';
            const journalKey = decodeURIComponent(encodedKey);
            showJournalPublications(journalKey);
        });
    });

    container.querySelectorAll('[data-scope-key]').forEach(btn => {
        btn.addEventListener('click', () => {
            const scopeType = btn.getAttribute('data-scope-type') || '';
            const encodedKey = btn.getAttribute('data-scope-key') || '';
            const scopeKey = decodeURIComponent(encodedKey);
            const scopeLabel = btn.getAttribute('data-scope-label') || scopeKey;
            showScopeJournals(scopeType, scopeKey, scopeLabel);
        });
    });
}

function getPublicationVesselSourceRecords() {
    let records = Array.isArray(allData.publications) ? [...allData.publications] : [];

    // أوعية النشر لا تتأثر بفلتر السنة، لكنها تظل مرتبطة بفلتر القسم الحالي
    if (currentDepartment !== 'all') {
        const deptIds = getDepartmentFacultyIds(currentDepartment);
        if (deptIds && deptIds.size > 0) {
            records = records.filter(pub => {
                const authorIds = splitIds(pub.authors_ids || pub.participant_ids);
                return authorIds.some(id => deptIds.has(id));
            });
        } else {
            records = [];
        }
    }

    return records;
}

function renderPublications() {
    const container = document.getElementById('publicationsGrid');
    container.innerHTML = '';
    
    const searchTerm = normalizeSearchText(document.getElementById('pubSearch')?.value || '');
    const citationsFilter = document.getElementById('pubCitationsFilter')?.value || '';
    
    // البحوث من ملف publications.csv
    let filtered = getPublications();
    if (searchTerm) {
        filtered = filtered.filter(pub => {
            const titleMatches = normalizeSearchText(pub.title || '').includes(searchTerm);
            if (titleMatches) return true;

            const authorNames = splitIds(pub.authors_ids || pub.participant_ids)
                .map(id => getMemberName(id))
                .filter(name => name && name !== '-')
                .join(' ');
            return normalizeSearchText(authorNames).includes(searchTerm);
        });
    }
    if (citationsFilter) filtered = filtered.filter(p => p.citations_range === citationsFilter);
    filtered = sortByDateDesc(filtered, p => p.publish_date || p.date);

    renderPublicationVesselStats(getPublicationVesselSourceRecords());
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد بحوث علمية مسجلة لهذا العام</div>';
        return;
    }
    
    filtered.forEach(pub => {
        // دعم authors_ids من publications.csv
        const authorIds = pub.authors_ids || pub.participant_ids || '';
        const authors = authorIds.split('|').map(id => getMemberName(id.trim())).filter(n => n);
        
        const card = document.createElement('div');
        card.className = 'publication-card clickable';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.innerHTML = `
            <div class="publication-title">${pub.title || ''}</div>
            <div class="publication-journal">${pub.journal || ''}</div>
            <div class="publication-authors">
                ${authors.map(a => `<span class="author-tag">${a}</span>`).join('')}
            </div>
            <div class="publication-meta">
                <span class="publication-date">${formatDate(pub.publish_date || pub.date)}</span>
                <span class="publication-citations">${pub.citations_range || '-'}</span>
            </div>
            ${pub.student_author === 'نعم' ? '<span class="student-badge">مشاركة طالب</span>' : ''}
            ${getRecordModifiedByHtml(pub)}
        `;
        card.onclick = () => showPublicationDetails(pub);
        card.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showPublicationDetails(pub);
            }
        };
        container.appendChild(card);
    });
}

// ========================================
// عرض بحوث الطلاب
// ========================================
function renderStudentResearch() {
    const container = document.getElementById('studentResearchGrid');
    if (!container) return;
    container.innerHTML = '';
    
    const filtered = getStudentResearch();
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد بحوث طلاب مسجلة لهذا العام</div>';
        return;
    }
    
    filtered.forEach(pub => {
        const supervisors = (pub.participant_ids || '').split('|').map(id => getMemberName(id.trim())).filter(n => n);
        
        const card = document.createElement('div');
        card.className = 'publication-card student-research';
        card.innerHTML = `
            <div class="publication-title">${pub.title || ''}</div>
            <div class="publication-journal">${pub.location || ''}</div>
            <div class="publication-authors">
                <span class="supervisor-label">المشرف:</span>
                ${supervisors.map(a => `<span class="author-tag">${a}</span>`).join('')}
            </div>
            ${pub.student_details ? `<div class="student-name">🎓 الطالب: ${pub.student_details}</div>` : ''}
            <div class="publication-meta">
                <span class="publication-date">${formatDate(pub.date)}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// ========================================
// عرض الفعاليات العلمية
// ========================================
function renderEvents() {
    const container = document.getElementById('eventsGrid');
    container.innerHTML = '';
    
    const typeFilter = document.getElementById('eventsTypeFilter')?.value || '';
    const participationFilter = document.getElementById('eventsParticipationFilter')?.value || '';
    
    let filtered = getEvents();
    if (typeFilter) filtered = filtered.filter(e => e.category === typeFilter);
    if (participationFilter) filtered = filtered.filter(e => e.participation_type === participationFilter);
    filtered = sortByDateDesc(filtered, e => e.date);
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد فعاليات مسجلة لهذا العام</div>';
        return;
    }
    
    filtered.forEach(event => {
        const dateInfo = formatDateShort(event.date);
        let typeClass = 'workshop';
        if (event.category === 'مؤتمر') typeClass = 'conference';
        else if (event.category === 'ندوة') typeClass = 'seminar';
        else if (event.category === 'ورشة عمل') typeClass = 'workshop';
        else if (event.category === 'تحكيم علمي') typeClass = 'reviewing';
        else if (event.category === 'تأليف كتب') typeClass = 'book';
        else if (event.category === 'استشارة علمية') typeClass = 'consulting';
        else if (event.category === 'مشاركة إعلامية') typeClass = 'media';
        else if (event.category === 'مناقشة خارجية') typeClass = 'discussion';
        else if (event.category === 'جائزة') typeClass = 'award';
        else if (event.category === 'براءة اختراع') typeClass = 'patent';
        else if (event.category === 'بحوث الطلاب') typeClass = 'student-research';
        
        // الحصول على أسماء المشاركين
        const participants = (event.participant_ids || '').split('|')
            .map(id => getMemberName(id.trim()))
            .filter(n => n);
        
        const card = document.createElement('div');
        card.className = `event-card clickable ${typeClass}`;
        card.innerHTML = `
            <div class="event-header">
                <span class="event-type">${event.category}</span>
                <div class="event-date-box">
                    <div class="event-day">${dateInfo.day}</div>
                    <div class="event-month">${dateInfo.month}</div>
                </div>
            </div>
            <div class="event-body">
                <div class="event-name">${event.title || ''}</div>
                <div class="event-location">📍 ${event.location || ''}</div>
                <div class="event-participation">${event.participation_type || ''}</div>
                ${participants.length > 0 ? `<div class="event-participants">${participants.map(p => `<span class="participant-tag">${p}</span>`).join('')}</div>` : ''}
                ${event.organized_by_department === 'نعم' ? '<span class="organized-badge">من تنظيم الكلية</span>' : ''}
                ${event.student_details && !isNaN(event.student_details) ? `<span class="attendance-badge">👥 ${event.student_details} حاضر</span>` : ''}
                ${event.notes ? `<div class="event-notes">${event.notes}</div>` : ''}
                ${getRecordModifiedByHtml(event)}
            </div>
        `;
        card.onclick = () => showEventDetails(event);
        container.appendChild(card);
    });
}

// ========================================
// عرض المناقشات الخارجية
// ========================================
function renderExternalDiscussions() {
    const container = document.getElementById('externalDiscussionsGrid');
    if (!container) return;
    container.innerHTML = '';
    
    const filtered = getExternalDiscussions();
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد مناقشات خارجية مسجلة لهذا العام</div>';
        return;
    }
    
    filtered.forEach(event => {
        const dateInfo = formatDateShort(event.date);
        const participants = (event.participant_ids || '').split('|')
            .map(id => getMemberName(id.trim()))
            .filter(n => n);
        
        const card = document.createElement('div');
        card.className = 'event-card discussion';
        card.innerHTML = `
            <div class="event-header">
                <span class="event-type">مناقشة خارجية</span>
                <div class="event-date-box">
                    <div class="event-day">${dateInfo.day}</div>
                    <div class="event-month">${dateInfo.month}</div>
                </div>
            </div>
            <div class="event-body">
                <div class="event-name">${event.title || ''}</div>
                <div class="event-location">🏛️ ${event.location || ''}</div>
                ${participants.length > 0 ? `<div class="event-participants"><span class="participant-label">المناقش:</span> ${participants.map(p => `<span class="participant-tag">${p}</span>`).join('')}</div>` : ''}
                ${event.notes ? `<div class="event-notes">${event.notes}</div>` : ''}
                ${getRecordModifiedByHtml(event)}
            </div>
        `;
        container.appendChild(card);
    });
}

// ========================================
// عرض الجوائز
// ========================================
function renderAwards() {
    const container = document.getElementById('awardsShowcase');
    if (!container) return;
    container.innerHTML = '';
    
    const awards = getAwards();
    
    if (awards.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد جوائز مسجلة لهذا العام</div>';
        return;
    }
    
    awards.forEach(award => {
        const recipients = (award.participant_ids || '').split('|')
            .map(id => getMemberName(id.trim()))
            .filter(n => n);
        
        const card = document.createElement('div');
        card.className = 'award-card';
        card.innerHTML = `
            <div class="award-icon">${award.category === 'براءة اختراع' ? '💡' : '🏆'}</div>
            <div class="award-type">${award.category}</div>
            <div class="award-name">${award.title || ''}</div>
            <div class="award-recipient">${recipients.join('، ')}</div>
            <div class="award-granter">${award.location || ''}</div>
            <div class="award-date">${formatDate(award.date)}</div>
            ${getRecordModifiedByHtml(award)}
        `;
        container.appendChild(card);
    });
}

function renderAll() {
    renderDashboard();
    renderPublications();
    renderTheses();
    renderEvents();
    renderQualityIndicators();
    // مؤشرات إحصائيات الشعب تعتمد على بيانات التدريس (lazy load)
    if (teachingData) renderSectionsTab();
}

// ========================================
// نظام إضافة الأنشطة
// ========================================

// أنواع الأنشطة المتاحة
const activityTypes = [
    { id: 'publication', name: 'نشر علمي', icon: '📄', category: 'بحث منشور' },
    { id: 'thesis_supervision', name: 'إشراف رسائل', icon: '🎓', category: 'إشراف' },
    { id: 'internal_discussion', name: 'مناقشة داخلية', icon: '📋', category: 'مناقشة' },
    { id: 'external_discussion', name: 'مناقشة خارجية', icon: '🎯', category: 'مناقشة علمية خارجية' },
    { id: 'conference_attendance', name: 'حضور مؤتمرات', icon: '👥', category: 'مؤتمر' },
    { id: 'conference_participation', name: 'مشاركة في مؤتمرات', icon: '🎤', category: 'مؤتمر' },
    { id: 'workshop_attendance', name: 'حضور ندوات وورش عمل', icon: '📚', category: 'ورشة عمل' },
    { id: 'workshop_participation', name: 'مشاركة في ندوات وورش عمل', icon: '🛠️', category: 'ندوة' },
    { id: 'award', name: 'الحصول على جوائز علمية', icon: '🏆', category: 'جائزة' }
];

// متغيرات نظام الإضافة
let selectedMemberForAdd = null;
let selectedActivityType = null;
let currentAddStep = 1;
let pendingActivities = []; // الأنشطة المعلقة للإضافة

function getJournalSuggestions() {
    const source = (Array.isArray(allData.publications) && allData.publications.length)
        ? allData.publications
        : (data.publications || []);

    const unique = new Set();
    source.forEach(pub => {
        const journalName = String(pub?.journal || '').trim();
        if (journalName) unique.add(journalName);
    });

    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ar'));
}

function buildJournalSuggestionsDatalist() {
    return getJournalSuggestions()
        .map(journalName => `<option value="${escapeHtml(journalName)}"></option>`)
        .join('');
}

// إنشاء الزر العائم و Modal الإضافة
function createAddActivityUI() {
    // إنشاء الزر العائم
    const fabContainer = document.createElement('div');
    fabContainer.className = 'fab-container';
    fabContainer.innerHTML = `
        <button class="fab-button" onclick="toggleAddModal()" title="إضافة نشاط جديد">
            <span>+</span>
        </button>
    `;
    document.body.appendChild(fabContainer);
    
    // إنشاء Modal الإضافة
    const modal = document.createElement('div');
    modal.id = 'addActivityModal';
    modal.className = 'add-activity-modal';
    modal.innerHTML = `
        <div class="add-modal-content">
            <div class="add-modal-header">
                <h2>➕ إضافة نشاط علمي جديد</h2>
                <button class="add-modal-close" onclick="closeAddModal()">×</button>
            </div>
            <div class="add-modal-body">
                <!-- خطوات الإضافة -->
                <div class="add-steps">
                    <div class="add-step active" data-step="1">
                        <span class="step-number">1</span>
                        <span>اختيار العضو</span>
                    </div>
                    <div class="add-step" data-step="2">
                        <span class="step-number">2</span>
                        <span>نوع النشاط</span>
                    </div>
                    <div class="add-step" data-step="3">
                        <span class="step-number">3</span>
                        <span>البيانات</span>
                    </div>
                    <div class="add-step" data-step="4">
                        <span class="step-number">4</span>
                        <span>المراجعة</span>
                    </div>
                </div>
                
                <!-- الخطوة 1: اختيار العضو -->
                <div class="step-content active" id="step1Content">
                    <div class="member-select-section">
                        <div class="form-group">
                            <label><span class="required">*</span> اختر عضو هيئة التدريس</label>
                            <select class="form-select" id="memberSelectDropdown" onchange="onMemberSelected()">
                                <option value="">-- اختر العضو --</option>
                            </select>
                        </div>
                    </div>
                    
                    <div id="memberActivitiesSummary" class="member-activities-summary" style="display: none;">
                        <!-- ملخص أنشطة العضو -->
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-primary" onclick="goToStep(2)" id="step1NextBtn" disabled>
                            التالي <span>←</span>
                        </button>
                    </div>
                </div>
                
                <!-- الخطوة 2: نوع النشاط -->
                <div class="step-content" id="step2Content">
                    <h3 style="color: var(--gray-300); margin-bottom: 20px;">اختر نوع النشاط</h3>
                    <div class="activity-types-grid" id="activityTypesGrid">
                        <!-- يتم ملؤها بـ JavaScript -->
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="goToStep(1)">
                            <span>→</span> السابق
                        </button>
                        <button class="btn btn-primary" onclick="goToStep(3)" id="step2NextBtn" disabled>
                            التالي <span>←</span>
                        </button>
                    </div>
                </div>
                
                <!-- الخطوة 3: إدخال البيانات -->
                <div class="step-content" id="step3Content">
                    <div id="activityFormContainer">
                        <!-- يتم ملؤها حسب نوع النشاط -->
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="goToStep(2)">
                            <span>→</span> السابق
                        </button>
                        <button class="btn btn-primary" onclick="goToStep(4)" id="step3NextBtn">
                            معاينة <span>←</span>
                        </button>
                    </div>
                </div>
                
                <!-- الخطوة 4: المراجعة والإرسال -->
                <div class="step-content" id="step4Content">
                    <div class="preview-section">
                        <div class="preview-header">
                            <span>📋</span> مراجعة البيانات قبل الإضافة
                        </div>
                        <div class="preview-data" id="previewData">
                            <!-- يتم ملؤها بالبيانات -->
                        </div>
                    </div>
                    
                    <div class="alert alert-info" style="margin-top: 20px;">
                        <span>💡</span>
                        <span>سيتم تنزيل ملف CSV يحتوي على البيانات الجديدة. يمكنك إضافته لمجلد البيانات.</span>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="goToStep(3)">
                            <span>→</span> تعديل
                        </button>
                        <button class="btn btn-success" onclick="submitActivity()">
                            <span>✓</span> تأكيد وتنزيل
                        </button>
                    </div>
                </div>
                
                <!-- رسالة النجاح -->
                <div class="step-content" id="successContent">
                    <div class="success-message">
                        <div class="success-icon">✅</div>
                        <h3>تم إنشاء ملف البيانات بنجاح!</h3>
                        <p>تم تنزيل الملف. قم برفعه إلى مجلد data في المستودع.</p>
                        <div class="modal-actions" style="justify-content: center;">
                            <button class="btn btn-primary" onclick="resetAddForm()">
                                إضافة نشاط آخر
                            </button>
                            <button class="btn btn-secondary" onclick="closeAddModal()">
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // ملء قائمة الأنشطة
    populateActivityTypes();
}

// ملء قائمة أنواع الأنشطة
function populateActivityTypes() {
    const grid = document.getElementById('activityTypesGrid');
    if (!grid) return;
    
    grid.innerHTML = activityTypes.map(type => `
        <button class="activity-type-btn" data-type="${type.id}" onclick="selectActivityType('${type.id}')">
            <span class="type-icon">${type.icon}</span>
            <span>${type.name}</span>
        </button>
    `).join('');
}

// فتح/إغلاق Modal الإضافة
function toggleAddModal() {
    const modal = document.getElementById('addActivityModal');
    const fab = document.querySelector('.fab-button');
    
    if (modal.classList.contains('active')) {
        closeAddModal();
    } else {
        openAddModal();
    }
}

function openAddModal() {
    const modal = document.getElementById('addActivityModal');
    const fab = document.querySelector('.fab-button');
    
    modal.classList.add('active');
    fab.classList.add('active');
    
    // تحديث قائمة الأعضاء
    populateMemberDropdown();
    
    // إعادة تعيين النموذج
    resetAddForm();
}

function closeAddModal() {
    const modal = document.getElementById('addActivityModal');
    const fab = document.querySelector('.fab-button');
    
    modal.classList.remove('active');
    fab.classList.remove('active');
}

// ملء قائمة الأعضاء
function populateMemberDropdown() {
    const select = document.getElementById('memberSelectDropdown');
    if (!select) return;
    
    const activeMembers = data.faculty.filter(f => f.active === 'نعم');
    
    select.innerHTML = '<option value="">-- اختر العضو --</option>';
    activeMembers.forEach(member => {
        select.innerHTML += `<option value="${member.id}">${member.name} - ${member.rank}</option>`;
    });
}

// عند اختيار عضو
function onMemberSelected() {
    const select = document.getElementById('memberSelectDropdown');
    const memberId = select.value;
    const nextBtn = document.getElementById('step1NextBtn');
    const summaryDiv = document.getElementById('memberActivitiesSummary');
    
    if (memberId) {
        selectedMemberForAdd = getMemberData(memberId);
        nextBtn.disabled = false;
        
        // عرض ملخص أنشطة العضو
        const activities = getMemberActivities(memberId);
        const { points, breakdown } = calculateMemberPoints(memberId);
        
        summaryDiv.style.display = 'block';
        summaryDiv.innerHTML = `
            <div class="summary-header">
                <h3>📊 ملخص أنشطة ${selectedMemberForAdd.name}</h3>
                <span style="color: var(--emerald-400); font-weight: 700;">${points} نقطة</span>
            </div>
            <div class="summary-stats">
                <div class="summary-stat">
                    <div class="summary-stat-value">${activities.theses.length}</div>
                    <div class="summary-stat-label">رسائل علمية</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${activities.publications.length}</div>
                    <div class="summary-stat-label">بحوث منشورة</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${activities.events.length}</div>
                    <div class="summary-stat-label">فعاليات</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${activities.awards.length}</div>
                    <div class="summary-stat-label">جوائز</div>
                </div>
            </div>
        `;
    } else {
        selectedMemberForAdd = null;
        nextBtn.disabled = true;
        summaryDiv.style.display = 'none';
    }
}

// اختيار نوع النشاط
function selectActivityType(typeId) {
    selectedActivityType = activityTypes.find(t => t.id === typeId);
    
    // تحديث الأزرار
    document.querySelectorAll('.activity-type-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.type === typeId) {
            btn.classList.add('selected');
        }
    });
    
    document.getElementById('step2NextBtn').disabled = false;
}

// التنقل بين الخطوات
function goToStep(step) {
    currentAddStep = step;
    
    // تحديث مؤشرات الخطوات
    document.querySelectorAll('.add-step').forEach(s => {
        const stepNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (stepNum === step) {
            s.classList.add('active');
        } else if (stepNum < step) {
            s.classList.add('completed');
        }
    });
    
    // إظهار المحتوى المناسب
    document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`step${step}Content`).classList.add('active');
    
    // تحضير محتوى الخطوة
    if (step === 3) {
        generateActivityForm();
    } else if (step === 4) {
        generatePreview();
    }
}

// توليد نموذج إدخال البيانات حسب نوع النشاط
function generateActivityForm() {
    const container = document.getElementById('activityFormContainer');
    if (!selectedActivityType) return;
    
    let formHTML = `<h3 style="color: var(--gold-400); margin-bottom: 20px;">${selectedActivityType.icon} ${selectedActivityType.name}</h3>`;
    
    switch(selectedActivityType.id) {
        case 'publication':
            formHTML += `
                <div class="form-group">
                    <label><span class="required">*</span> عنوان البحث</label>
                    <input type="text" class="form-input" id="actTitle" placeholder="أدخل عنوان البحث">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><span class="required">*</span> اسم المجلة</label>
                        <input type="text" class="form-input" id="actJournal" list="actJournalSuggestions" placeholder="اسم المجلة">
                    </div>
                    <div class="form-group">
                        <label><span class="required">*</span> تاريخ النشر</label>
                        <input type="date" class="form-input" id="actDate">
                    </div>
                </div>
                <datalist id="actJournalSuggestions">
                    ${buildJournalSuggestionsDatalist()}
                </datalist>
                <div class="form-row">
                    <div class="form-group">
                        <label>نطاق الاقتباسات</label>
                        <select class="form-select" id="actCitations">
                            <option value="أقل من 10">أقل من 10</option>
                            <option value="11-20">11-20</option>
                            <option value="21-50">21-50</option>
                            <option value="51-100">51-100</option>
                            <option value="101-200">101-200</option>
                            <option value="201-500">201-500</option>
                            <option value="أكثر من 500">أكثر من 500</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>هل هناك طالب مشارك؟</label>
                        <select class="form-select" id="actStudentAuthor">
                            <option value="لا">لا</option>
                            <option value="نعم">نعم</option>
                        </select>
                    </div>
                </div>
            `;
            break;
            
        case 'thesis_supervision':
            formHTML += `
                <div class="form-row">
                    <div class="form-group">
                        <label><span class="required">*</span> نوع الرسالة</label>
                        <select class="form-select" id="actThesisType">
                            <option value="دكتوراه">دكتوراه</option>
                            <option value="ماجستير">ماجستير</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label><span class="required">*</span> التخصص</label>
                        <select class="form-select" id="actSpecialization">
                            <option value="قراءات">قراءات</option>
                            <option value="دراسات قرآنية">دراسات قرآنية</option>
                            <option value="أصول الفقه">أصول الفقه</option>
                            <option value="الفقه">الفقه</option>
                            <option value="العقيدة">العقيدة</option>
                            <option value="القانون">القانون</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> اسم الطالب</label>
                    <input type="text" class="form-input" id="actStudentName" placeholder="اسم الطالب الكامل">
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> عنوان الرسالة / المشروع</label>
                    <textarea class="form-textarea" id="actTitle" placeholder="عنوان الرسالة أو المشروع"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>نوع الإشراف</label>
                        <select class="form-select" id="actSupervisionType">
                            <option value="رئيسي">مشرف رئيسي</option>
                            <option value="مشارك">مشرف مشارك</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>الحالة</label>
                        <select class="form-select" id="actStatus">
                            <option value="جارية">جارية</option>
                            <option value="منجزة">منجزة</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>تاريخ المناقشة (إن وجد)</label>
                    <input type="date" class="form-input" id="actDate">
                </div>
            `;
            break;
            
        case 'internal_discussion':
        case 'external_discussion':
            formHTML += `
                <div class="form-row">
                    <div class="form-group">
                        <label><span class="required">*</span> نوع الرسالة</label>
                        <select class="form-select" id="actThesisType">
                            <option value="دكتوراه">دكتوراه</option>
                            <option value="ماجستير">ماجستير</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label><span class="required">*</span> التخصص</label>
                        <select class="form-select" id="actSpecialization">
                            <option value="قراءات">قراءات</option>
                            <option value="دراسات قرآنية">دراسات قرآنية</option>
                            <option value="أصول الفقه">أصول الفقه</option>
                            <option value="الفقه">الفقه</option>
                            <option value="العقيدة">العقيدة</option>
                            <option value="القانون">القانون</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><span class="required">*</span> تاريخ المناقشة</label>
                        <input type="date" class="form-input" id="actDate">
                    </div>
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> اسم الطالب</label>
                    <input type="text" class="form-input" id="actStudentName" placeholder="اسم الطالب">
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> عنوان الرسالة / المشروع</label>
                    <textarea class="form-textarea" id="actTitle" placeholder="عنوان الرسالة أو المشروع"></textarea>
                </div>
                ${selectedActivityType.id === 'external_discussion' ? `
                <div class="form-group">
                    <label>الجامعة/الجهة</label>
                    <input type="text" class="form-input" id="actLocation" placeholder="اسم الجامعة أو الجهة">
                </div>
                ` : ''}
            `;
            break;
            
        case 'conference_attendance':
        case 'conference_participation':
        case 'workshop_attendance':
        case 'workshop_participation':
            const isParticipation = selectedActivityType.id.includes('participation');
            formHTML += `
                <div class="form-group">
                    <label><span class="required">*</span> اسم الفعالية</label>
                    <input type="text" class="form-input" id="actTitle" placeholder="اسم المؤتمر أو الورشة">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><span class="required">*</span> المكان</label>
                        <input type="text" class="form-input" id="actLocation" placeholder="المدينة أو الجهة">
                    </div>
                    <div class="form-group">
                        <label><span class="required">*</span> التاريخ</label>
                        <input type="date" class="form-input" id="actDate">
                    </div>
                </div>
                ${isParticipation ? `
                <div class="form-group">
                    <label>نوع المشاركة</label>
                    <select class="form-select" id="actParticipationType">
                        <option value="مشاركة بورقة">مشاركة بورقة بحثية</option>
                        <option value="مشاركة">مشاركة</option>
                        <option value="تنظيم">تنظيم</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>عنوان الورقة (إن وجد)</label>
                    <input type="text" class="form-input" id="actPaperTitle" placeholder="عنوان الورقة البحثية">
                </div>
                ` : ''}
                <div class="form-group">
                    <label>هل الفعالية من تنظيم الكلية؟</label>
                    <select class="form-select" id="actOrganizedByDept">
                        <option value="لا">لا</option>
                        <option value="نعم">نعم</option>
                    </select>
                </div>
            `;
            break;
            
        case 'award':
            formHTML += `
                <div class="form-group">
                    <label><span class="required">*</span> نوع التكريم</label>
                    <select class="form-select" id="actAwardType">
                        <option value="جائزة">جائزة</option>
                        <option value="براءة اختراع">براءة اختراع</option>
                    </select>
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> اسم الجائزة/البراءة</label>
                    <input type="text" class="form-input" id="actTitle" placeholder="اسم الجائزة أو البراءة">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><span class="required">*</span> الجهة المانحة</label>
                        <input type="text" class="form-input" id="actGrantingBody" placeholder="الجهة المانحة">
                    </div>
                    <div class="form-group">
                        <label><span class="required">*</span> التاريخ</label>
                        <input type="date" class="form-input" id="actDate">
                    </div>
                </div>
            `;
            break;
    }
    
    container.innerHTML = formHTML;
}

// توليد معاينة البيانات
function generatePreview() {
    const container = document.getElementById('previewData');
    const formData = collectFormData();
    
    let previewHTML = `
        <div class="preview-item" style="grid-column: span 2;">
            <div class="preview-item-label">العضو</div>
            <div class="preview-item-value">${selectedMemberForAdd?.name || '-'}</div>
        </div>
        <div class="preview-item">
            <div class="preview-item-label">نوع النشاط</div>
            <div class="preview-item-value">${selectedActivityType?.name || '-'}</div>
        </div>
        <div class="preview-item">
            <div class="preview-item-label">السنة</div>
            <div class="preview-item-value">${currentYear}هـ</div>
        </div>
    `;
    
    Object.entries(formData).forEach(([key, value]) => {
        if (value && key !== 'member_id' && key !== 'year') {
            const labels = {
                title: 'العنوان',
                journal: 'المجلة',
                date: 'التاريخ',
                citations_range: 'الاقتباسات',
                student_author: 'طالب مشارك',
                thesis_type: 'نوع الرسالة',
                specialization: 'التخصص',
                student_name: 'اسم الطالب',
                supervision_type: 'نوع الإشراف',
                status: 'الحالة',
                location: 'المكان',
                participation_type: 'نوع المشاركة',
                organized_by_dept: 'تنظيم القسم',
                award_type: 'نوع التكريم',
                granting_body: 'الجهة المانحة'
            };
            
            previewHTML += `
                <div class="preview-item">
                    <div class="preview-item-label">${labels[key] || key}</div>
                    <div class="preview-item-value">${value}</div>
                </div>
            `;
        }
    });
    
    container.innerHTML = previewHTML;
}

// جمع بيانات النموذج
function collectFormData() {
    const data = {
        member_id: selectedMemberForAdd?.id,
        year: currentYear
    };
    
    // جمع القيم من النموذج
    const fields = ['Title', 'Journal', 'Date', 'Citations', 'StudentAuthor', 'ThesisType', 
                    'Specialization', 'StudentName', 'SupervisionType', 'Status', 'Location',
                    'ParticipationType', 'OrganizedByDept', 'AwardType', 'GrantingBody', 'PaperTitle'];
    
    fields.forEach(field => {
        const el = document.getElementById('act' + field);
        if (el && el.value) {
            data[field.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')] = el.value;
        }
    });
    
    return data;
}

// إرسال النشاط
function submitActivity() {
    const formData = collectFormData();
    
    // تحديد الملف المناسب
    let csvContent = '';
    let filename = '';
    
    switch(selectedActivityType.id) {
        case 'publication':
            filename = 'participations_new.csv';
            csvContent = generateParticipationCSV(formData, 'بحث منشور');
            break;
        case 'thesis_supervision':
            filename = 'theses_new.csv';
            csvContent = generateThesisCSV(formData);
            break;
        case 'internal_discussion':
        case 'external_discussion':
            filename = selectedActivityType.id === 'external_discussion' ? 'participations_new.csv' : 'theses_update.csv';
            csvContent = selectedActivityType.id === 'external_discussion' 
                ? generateParticipationCSV(formData, 'مناقشة علمية خارجية')
                : generateDiscussionNote(formData);
            break;
        case 'conference_attendance':
        case 'conference_participation':
            filename = 'participations_new.csv';
            csvContent = generateParticipationCSV(formData, 'مؤتمر');
            break;
        case 'workshop_attendance':
        case 'workshop_participation':
            filename = 'participations_new.csv';
            const cat = selectedActivityType.id.includes('workshop') ? 'ورشة عمل' : 'ندوة';
            csvContent = generateParticipationCSV(formData, cat);
            break;
        case 'award':
            filename = 'participations_new.csv';
            csvContent = generateParticipationCSV(formData, formData.award_type || 'جائزة');
            break;
    }
    
    // تنزيل الملف
    downloadCSV(csvContent, filename);
    
    // عرض رسالة النجاح
    document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
    document.getElementById('successContent').classList.add('active');
}

// توليد CSV للمشاركات
function generateParticipationCSV(data, category) {
    const participationType = data.participation_type || 
        (selectedActivityType.id.includes('attendance') ? 'حضور' : 'مشاركة');
    
    const headers = 'id;year;category;title;participant_ids;date;location;journal;citations_range;student_author;participation_type;organized_by_department;granting_body';
    const newId = Date.now(); // ID مؤقت
    
    const row = [
        newId,
        data.year,
        category,
        data.title || data.paper_title || '',
        data.member_id,
        data.date || '',
        data.location || '',
        data.journal || '',
        data.citations_range || '',
        data.student_author || '',
        participationType,
        data.organized_by_dept || 'لا',
        data.granting_body || ''
    ].join(';');
    
    return headers + '\n' + row;
}

// توليد CSV للرسائل
function generateThesisCSV(data) {
    const headers = 'id;year;type;specialization;student_name;title;supervisor_id;co_supervisor_id;examiner1_id;examiner2_id;status;defense_date';
    const newId = Date.now();
    
    const supervisorId = data.supervision_type === 'رئيسي' ? data.member_id : '';
    const coSupervisorId = data.supervision_type === 'مشارك' ? data.member_id : '';
    
    const row = [
        newId,
        data.year,
        data.thesis_type || 'ماجستير',
        data.specialization || 'قراءات',
        data.student_name || '',
        data.title || '',
        supervisorId,
        coSupervisorId,
        '', // examiner1
        '', // examiner2
        data.status || 'جارية',
        data.date || ''
    ].join(';');
    
    return headers + '\n' + row;
}

// ملاحظة للمناقشة الداخلية
function generateDiscussionNote(data) {
    return `ملاحظة: لإضافة مناقشة داخلية، يجب تحديث بيانات الرسالة الموجودة في ملف theses.csv
العضو: ${selectedMemberForAdd?.name}
الطالب: ${data.student_name}
العنوان: ${data.title}
التاريخ: ${data.date}

قم بإضافة معرف العضو (${data.member_id}) في حقل examiner1_id أو examiner2_id للرسالة المناسبة.`;
}

// تنزيل ملف CSV
function downloadCSV(content, filename) {
    const BOM = '\uFEFF'; // لضمان ظهور العربية صحيحة
    const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// إعادة تعيين النموذج
function resetAddForm() {
    selectedMemberForAdd = null;
    selectedActivityType = null;
    currentAddStep = 1;
    
    // إعادة تعيين العناصر
    const memberSelect = document.getElementById('memberSelectDropdown');
    if (memberSelect) memberSelect.value = '';
    
    const summaryDiv = document.getElementById('memberActivitiesSummary');
    if (summaryDiv) summaryDiv.style.display = 'none';
    
    document.querySelectorAll('.activity-type-btn').forEach(btn => btn.classList.remove('selected'));
    
    document.getElementById('step1NextBtn').disabled = true;
    document.getElementById('step2NextBtn').disabled = true;
    
    // العودة للخطوة الأولى
    goToStep(1);
}

// ========================================
// التنقل بين التبويبات
// ========================================
function setupTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');

            // عند فتح تبويب إحصائيات الشعب: تحميل بيانات التدريس والبرامج
            if (tabId === 'sections') {
                ensureTeachingLoaded().then(() => {
                    setupSectionsFilters();
                    sectionsTabInitialized = true;
                    renderSectionsTab();
                });
            }
            // عند فتح تبويب الجودة
            if (tabId === 'quality') {
                // مؤشرات الجودة العامة لا تحتاج بيانات التدريس
            }
            if (tabId === 'analytics') {
                setupAnalyticsStudio();
            }
        });
    });
}

function setupFilters() {
    document.getElementById('thesesSearch')?.addEventListener('input', renderTheses);
    document.getElementById('thesesStatusFilter')?.addEventListener('change', renderTheses);
    document.getElementById('thesesTypeFilter')?.addEventListener('change', renderTheses);
    document.getElementById('thesesYearFilter')?.addEventListener('change', renderTheses);
    document.getElementById('thesesSupervisorFilter')?.addEventListener('change', renderTheses);
    document.getElementById('addThesesProgramFilter')?.addEventListener('click', () => addThesesFilterSelect('program'));
    document.getElementById('addThesesYearFilter')?.addEventListener('click', () => addThesesFilterSelect('year'));
    document.getElementById('addThesesSupervisorFilter')?.addEventListener('click', () => addThesesFilterSelect('supervisor'));
    document.getElementById('printFilteredThesesBtn')?.addEventListener('click', printFilteredTheses);
    
    document.getElementById('pubSearch')?.addEventListener('input', renderPublications);
    document.getElementById('pubCitationsFilter')?.addEventListener('change', renderPublications);
    
    document.getElementById('eventsTypeFilter')?.addEventListener('change', renderEvents);
    document.getElementById('eventsParticipationFilter')?.addEventListener('change', renderEvents);
}

function setupYearSelector() {
    document.getElementById('yearSelect').addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        if (selectedValue === 'all') {
            currentYear = 'all';
        } else {
            currentYear = parseInt(selectedValue);
        }
        loadYearData(currentYear);
    });
}

function syncMainNavOffset() {
    const header = document.querySelector('.main-header');
    if (!header) return;

    const headerHeight = Math.ceil(header.getBoundingClientRect().height);
    if (!Number.isFinite(headerHeight) || headerHeight <= 0) return;

    document.documentElement.style.setProperty('--main-nav-offset', `${headerHeight}px`);
}

window.syncMainNavOffset = syncMainNavOffset;

// ========================================
// التهيئة
// ========================================
async function init() {
    const hijriYear = getCurrentHijriYearNumber();
    document.getElementById('currentYear').textContent = formatArabicDigits(hijriYear);

    await loadConfig();
    populateYearSelector();
    populateDepartmentSelector();
    populateProgramSelector();
    setupTabs();
    setupFilters();
    setupYearSelector();
    setupDepartmentSelector();
    setupProgramSelector();
    syncMainNavOffset();
    window.addEventListener('resize', syncMainNavOffset);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncMainNavOffset);
    }
    await loadAllData();
    setupAnalyticsStudio();

    // مؤشر حالة البيانات الحية
    if (sheetsDataLoaded) {
        console.log('🟢 البيانات محدثة من Google Sheets');
    }

    // إنشاء واجهة إضافة الأنشطة
  //  createAddActivityUI();
}

document.addEventListener('DOMContentLoaded', init);
