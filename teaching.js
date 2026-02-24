// ========================================
// النشاط التدريسي - Teaching Activities Module
// ========================================
// نظام فلاتر مزدوج:
// 1. الفلتر العلوي الثابت (yearSelect + deptSelect) → يؤثر على الإحصائيات والمخططات
// 2. فلاتر الجدول التفصيلي → مستقلة تماماً عن الفلتر العلوي

let teachingData = null;
let teachingCharts = {};
let allCoursesMap = null;
let teachingInitialized = false;
let teachingDataLoading = false;

// فلاتر الجدول التفصيلي (مستقلة تماماً)
let tableFilters = {
    search: '',
    year: 'all',
    department: 'all',
    program: 'all',
    mode: 'all',
    rank: 'all',
    sort: 'sections'
};

// ========================================
// تحميل البيانات (lazy - تتأخر حتى يفتح المستخدم تبويب التدريس)
// ========================================
async function loadTeachingData() {
    if (teachingData || teachingDataLoading) return;
    teachingDataLoading = true;
    showTeachingLoader(true);
    try {
        const t0 = performance.now();
        const response = await fetch(`${DATA_BASE_URL}/teaching_data.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        teachingData = await response.json();
        console.log(`🏫 تحميل JSON: ${Math.round(performance.now() - t0)}ms`);

        buildCoursesMap();
        initTeachingFilters();

        // المرحلة 1: عرض الجدول فوراً (الأهم للمستخدم)
        renderTeachingTable();
        teachingInitialized = true;

        // المرحلة 2: تأجيل المخططات للإطار التالي حتى يظهر الجدول بدون تجميد
        requestAnimationFrame(() => {
            renderTeachingOverview();
            chartsVisible = true;
            showTeachingLoader(false);
            console.log(`🏫 اكتمال التحميل: ${Math.round(performance.now() - t0)}ms`);
        });
    } catch (error) {
        console.warn('⚠️ تعذر تحميل بيانات النشاط التدريسي:', error.message);
        showTeachingLoader(false);
    } finally {
        teachingDataLoading = false;
    }
}

// مؤشر التحميل
function showTeachingLoader(show) {
    let loader = document.getElementById('teachingLoader');
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'teachingLoader';
        loader.innerHTML = '<div class="t-loader-spinner"></div><span>جاري تحميل بيانات النشاط التدريسي...</span>';
        const teaching = document.getElementById('teaching');
        if (teaching) teaching.insertBefore(loader, teaching.children[1]);
    }
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// تحميل بيانات التدريس عند الطلب فقط
async function ensureTeachingLoaded() {
    if (!teachingInitialized && !teachingDataLoading) {
        await loadTeachingData();
    }
}

// ========================================
// بناء فهرس المقررات للبحث
// ========================================
function buildCoursesMap() {
    allCoursesMap = {};
    teachingData.records.forEach(r => {
        r.cs.forEach(c => {
            const key = c.cc;
            if (!allCoursesMap[key]) {
                allCoursesMap[key] = { code: c.cc, name: c.cn, sections: [] };
            }
            allCoursesMap[key].sections.push({
                fid: r.fid,
                year: r.y,
                semester: r.sn,
                mode: c.m,
                students: c.e || 0,
                hours: c.h || 0,
                degree: c.dg || '',
                activity: c.a || ''
            });
        });
    });
}

// ========================================
// تهيئة الفلاتر
// ========================================
function initTeachingFilters() {
    if (!teachingData) return;

    // === ربط الفلتر العلوي الثابت بالإحصائيات والمخططات ===
    const headerYear = document.getElementById('yearSelect');
    const headerDept = document.getElementById('deptSelect');

    if (headerYear) {
        headerYear.addEventListener('change', () => {
            renderTeachingOverview();
        });
    }

    if (headerDept) {
        headerDept.addEventListener('change', () => {
            renderTeachingOverview();
        });
    }

    // === فلاتر الجدول التفصيلي (مستقلة تماماً) ===
    // تعبئة السنوات
    const tblYear = document.getElementById('tblYearFilter');
    if (tblYear) {
        tblYear.innerHTML = '<option value="all">جميع السنوات</option>';
        teachingData.years.forEach(y => {
            tblYear.innerHTML += `<option value="${y}">${y}هـ</option>`;
        });
        tblYear.addEventListener('change', (e) => {
            tableFilters.year = e.target.value;
            renderTeachingTable();
        });
    }

    // تعبئة الأقسام
    const tblDept = document.getElementById('tblDeptFilter');
    if (tblDept) {
        tblDept.innerHTML = '<option value="all">جميع الأقسام</option>';
        teachingData.departments.forEach(d => {
            tblDept.innerHTML += `<option value="${d}">${d}</option>`;
        });
        tblDept.addEventListener('change', (e) => {
            tableFilters.department = e.target.value;
            renderTeachingTable();
        });
    }

    // تعبئة فلتر البرنامج
    const tblProgram = document.getElementById('tblProgramFilter');
    if (tblProgram) {
        tblProgram.innerHTML = '<option value="all">جميع البرامج</option>';
        const programs = (typeof config !== 'undefined' && config.programs) || [];
        const degrees = ['بكالوريوس', 'ماجستير', 'دكتوراه'];
        degrees.forEach(deg => {
            const degProgs = programs.filter(p => p.degree === deg);
            if (degProgs.length === 0) return;
            const group = document.createElement('optgroup');
            group.label = deg;
            degProgs.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name + ' - ' + p.degree;
                opt.textContent = p.name;
                group.appendChild(opt);
            });
            tblProgram.appendChild(group);
        });
        tblProgram.addEventListener('change', (e) => {
            tableFilters.program = e.target.value;
            renderTeachingTable();
        });
    }

    // فلتر طريقة التدريس
    const tblMode = document.getElementById('tblModeFilter');
    if (tblMode) {
        tblMode.addEventListener('change', (e) => {
            tableFilters.mode = e.target.value;
            renderTeachingTable();
        });
    }

    // تعبئة المراتب
    const tblRank = document.getElementById('tblRankFilter');
    if (tblRank) {
        const ranksSet = new Set();
        Object.values(teachingData.faculty_index).forEach(fi => {
            if (fi.r) ranksSet.add(fi.r);
        });
        const ranks = Array.from(ranksSet).sort((a, b) => {
            const order = ['أستاذ', 'أستاذ مشارك', 'أستاذ مساعد', 'محاضر', 'معيد'];
            const ia = order.findIndex(o => a.includes(o));
            const ib = order.findIndex(o => b.includes(o));
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        tblRank.innerHTML = '<option value="all">جميع المراتب</option>';
        ranks.forEach(r => {
            tblRank.innerHTML += `<option value="${r}">${r}</option>`;
        });
        tblRank.addEventListener('change', (e) => {
            tableFilters.rank = e.target.value;
            renderTeachingTable();
        });
    }

    // البحث (مع debounce لتحسين الأداء)
    let searchDebounce;
    document.getElementById('teachingSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            tableFilters.search = e.target.value.trim();
            renderTeachingTable();
        }, 250);
    });

    // الترتيب
    document.getElementById('teachingSortFilter')?.addEventListener('change', (e) => {
        tableFilters.sort = e.target.value;
        renderTeachingTable();
    });

    // تصدير
    document.getElementById('exportAllTeaching')?.addEventListener('click', exportAllTeachingCSV);

    // البحث بالمقرر
    initCourseSearch();

    // Modal
    document.getElementById('teachingModalClose')?.addEventListener('click', closeTeachingModal);
    document.getElementById('teachingPrintBtn')?.addEventListener('click', printTeachingReport);
    document.getElementById('teachingModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'teachingModal') closeTeachingModal();
    });
}

// ========================================
// البحث بالمقرر
// ========================================
function initCourseSearch() {
    const input = document.getElementById('courseSearchInput');
    const dropdown = document.getElementById('courseSearchDropdown');
    if (!input || !dropdown) return;

    let debounceTimer;

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const resultsDiv = document.getElementById('courseSearchResults');
        if (resultsDiv && e.target.value.trim().length < 2) {
            resultsDiv.style.display = 'none';
        }
        debounceTimer = setTimeout(() => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                dropdown.style.display = 'none';
                return;
            }
            showCourseDropdown(query);
        }, 200);
    });

    input.addEventListener('focus', () => {
        const query = input.value.trim();
        if (query.length >= 2) showCourseDropdown(query);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.course-search-wrapper')) {
            dropdown.style.display = 'none';
        }
    });
}

function showCourseDropdown(query) {
    const dropdown = document.getElementById('courseSearchDropdown');
    if (!dropdown || !allCoursesMap) return;

    const q = query.toLowerCase();
    const matches = Object.values(allCoursesMap)
        .filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
        .sort((a, b) => b.sections.length - a.sections.length)
        .slice(0, 15);

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="course-dd-empty">لا توجد نتائج</div>';
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = matches.map(c => `
        <div class="course-dd-item" onclick="selectCourse('${c.code.replace(/'/g, "\\'")}')">
            <span class="course-dd-name">${c.name}</span>
            <span class="course-dd-code">${c.code}</span>
            <span class="course-dd-count">${c.sections.length} شعبة</span>
        </div>
    `).join('');
    dropdown.style.display = 'block';
}

function selectCourse(courseCode) {
    const dropdown = document.getElementById('courseSearchDropdown');
    const input = document.getElementById('courseSearchInput');
    const resultsDiv = document.getElementById('courseSearchResults');

    if (dropdown) dropdown.style.display = 'none';

    const course = allCoursesMap[courseCode];
    if (!course || !resultsDiv) return;

    if (input) input.value = `${course.name} (${course.code})`;

    const yearGroups = {};
    course.sections.forEach(s => {
        if (!yearGroups[s.year]) yearGroups[s.year] = [];
        yearGroups[s.year].push(s);
    });

    const totalSections = course.sections.length;
    const totalStudents = course.sections.reduce((sum, s) => sum + s.students, 0);
    const uniqueFaculty = new Set(course.sections.map(s => s.fid)).size;

    resultsDiv.innerHTML = `
        <div class="course-results-header">
            <h4>${course.name} <span class="course-code-tag">${course.code}</span></h4>
            <div class="course-results-stats">
                <span>📊 ${totalSections} شعبة</span>
                <span>👥 ${uniqueFaculty} عضو هيئة تدريس</span>
                <span>🎓 ${totalStudents.toLocaleString('ar-SA')} طالب شعبة</span>
            </div>
        </div>
        <div class="course-results-table-wrap">
            <table class="course-results-table">
                <thead>
                    <tr>
                        <th>السنة</th>
                        <th>الفصل</th>
                        <th>عضو هيئة التدريس</th>
                        <th>القسم</th>
                        <th>الطريقة</th>
                        <th>طلاب الشعبة</th>
                        <th>الساعات</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.keys(yearGroups).sort().map(year =>
                        yearGroups[year].sort((a, b) => a.semester.localeCompare(b.semester, 'ar')).map(s => {
                            const fi = teachingData.faculty_index[s.fid] || {};
                            return `
                                <tr class="course-result-row" onclick="openTeachingModal('${s.fid}')">
                                    <td>${year}هـ</td>
                                    <td>${s.semester}</td>
                                    <td class="course-faculty-name">${fi.n || s.fid}</td>
                                    <td><span class="dept-badge dept-${getDeptClass(fi.d || '')}">${fi.d || '-'}</span></td>
                                    <td><span class="mode-badge-sm mode-${s.mode === 'عن بعد' ? 'remote' : 'inperson'}">${s.mode}</span></td>
                                    <td>${s.students.toLocaleString('ar-SA')}</td>
                                    <td>${s.hours}</td>
                                </tr>
                            `;
                        }).join('')
                    ).join('')}
                </tbody>
            </table>
        </div>
    `;
    resultsDiv.style.display = 'block';
}

function clearCourseSearch() {
    const input = document.getElementById('courseSearchInput');
    const dropdown = document.getElementById('courseSearchDropdown');
    const results = document.getElementById('courseSearchResults');
    if (input) input.value = '';
    if (dropdown) dropdown.style.display = 'none';
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }
}

// ========================================
// الفلترة: نظامان مستقلان
// ========================================

// 1. فلترة الإحصائيات والمخططات (من الفلتر العلوي الثابت)
function getOverviewFilteredRecords() {
    if (!teachingData) return [];
    let records = teachingData.records;

    // قراءة السنة من الفلتر العلوي الثابت
    const headerYear = document.getElementById('yearSelect')?.value;
    if (headerYear && headerYear !== 'all') {
        const year = parseInt(headerYear);
        if (!isNaN(year)) {
            records = records.filter(r => r.y === year);
        }
    }

    // قراءة القسم من الفلتر العلوي الثابت
    const headerDept = document.getElementById('deptSelect')?.value;
    if (headerDept && headerDept !== 'all') {
        records = records.filter(r => {
            const fi = teachingData.faculty_index[r.fid];
            return fi && fi.d === headerDept;
        });
    }

    return records;
}

// 2. فلترة الجدول التفصيلي (مستقلة تماماً)
function getTableFilteredRecords() {
    if (!teachingData) return [];
    let records = teachingData.records;

    // فلتر السنة
    if (tableFilters.year !== 'all') {
        const year = parseInt(tableFilters.year);
        records = records.filter(r => r.y === year);
    }

    // فلتر القسم
    if (tableFilters.department !== 'all') {
        records = records.filter(r => {
            const fi = teachingData.faculty_index[r.fid];
            return fi && fi.d === tableFilters.department;
        });
    }

    // فلتر البرنامج
    if (tableFilters.program !== 'all') {
        records = filterRecordsByProgram(records, tableFilters.program);
    }

    // فلتر طريقة التدريس
    if (tableFilters.mode !== 'all') {
        records = records.map(r => ({
            ...r,
            cs: r.cs.filter(c => {
                if (tableFilters.mode === 'حضوري') return c.m === 'حضوري' || c.m === 'غير محدد';
                if (tableFilters.mode === 'عن بعد') return c.m === 'عن بعد';
                return true;
            })
        })).filter(r => r.cs.length > 0);
    }

    // فلتر المرتبة
    if (tableFilters.rank !== 'all') {
        records = records.filter(r => {
            const fi = teachingData.faculty_index[r.fid];
            return fi && fi.r === tableFilters.rank;
        });
    }

    return records;
}

// ========================================
// حساب الإحصائيات
// ========================================
function computeTeachingStats(records) {
    let totalCourses = 0, totalStudents = 0, inPerson = 0, remote = 0, hybrid = 0;

    records.forEach(r => {
        r.cs.forEach(c => {
            totalCourses++;
            totalStudents += c.e || 0;
            if (c.m === 'حضوري') inPerson++;
            else if (c.m === 'عن بعد') remote++;
            else if (c.m === 'مدمج') hybrid++;
            else inPerson++;
        });
    });

    return { totalCourses, totalStudents, inPerson, remote, hybrid };
}

function computeFacultySummary(records) {
    const summary = {};

    records.forEach(r => {
        if (!summary[r.fid]) {
            const fi = teachingData.faculty_index[r.fid] || {};
            summary[r.fid] = {
                id: r.fid,
                name: fi.n || '',
                department: fi.d || '',
                rank: fi.r || '',
                totalSections: 0,
                totalCourses: 0,
                totalStudents: 0,
                totalHours: 0,
                inPerson: 0,
                remote: 0,
                years: new Set(),
                uniqueCourses: new Set()
            };
        }

        const s = summary[r.fid];
        s.years.add(r.y);

        r.cs.forEach(c => {
            s.totalSections++;
            s.uniqueCourses.add(c.cc);
            s.totalStudents += c.e || 0;
            s.totalHours += c.h || 0;
            if (c.m === 'حضوري' || c.m === 'غير محدد') s.inPerson++;
            else if (c.m === 'عن بعد') s.remote++;
            else s.inPerson++;
        });
    });

    return Object.values(summary).map(s => {
        s.yearsCount = s.years.size;
        s.years = Array.from(s.years).sort();
        s.totalCourses = s.uniqueCourses.size;
        delete s.uniqueCourses;
        return s;
    });
}

// ========================================
// تحريك الأرقام
// ========================================
function animateNumber(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const current = parseInt(el.textContent.replace(/[^\d]/g, '')) || 0;
    const duration = 400;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = Math.round(current + (targetValue - current) * eased);
        el.textContent = val.toLocaleString('ar-SA');
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

// ========================================
// رسم الإحصائيات والمخططات (يتأثر بالفلتر العلوي الثابت فقط)
// ========================================
function renderTeachingOverview() {
    if (!teachingData) return;

    const records = getOverviewFilteredRecords();
    const stats = computeTeachingStats(records);

    animateNumber('tTotalCourses', stats.totalCourses);
    animateNumber('tTotalStudents', stats.totalStudents);
    animateNumber('tInPerson', stats.inPerson);
    animateNumber('tRemote', stats.remote);

    renderTeachingCharts(records);
}

// ========================================
// المخططات البيانية
// ========================================
function renderTeachingCharts(records) {
    // رسم المخططات بشكل تدريجي لمنع تجميد الصفحة
    renderTrendChart(records);
    renderModeChart(records);
    // تأجيل المخططات التالية للإطار التالي
    requestAnimationFrame(() => {
        renderDeptChart(records);
        renderTopChart(records);
        requestAnimationFrame(() => {
            renderProgramChart(records);
        });
    });
}

function renderTrendChart(records) {
    const canvas = document.getElementById('teachingTrendChart');
    if (!canvas) return;

    const yearData = {};
    teachingData.years.forEach(y => { yearData[y] = { courses: 0, students: 0 }; });

    records.forEach(r => {
        if (!yearData[r.y]) yearData[r.y] = { courses: 0, students: 0 };
        r.cs.forEach(c => {
            yearData[r.y].courses++;
            yearData[r.y].students += c.e || 0;
        });
    });

    const years = Object.keys(yearData).sort();
    const coursesData = years.map(y => yearData[y].courses);
    const studentsData = years.map(y => yearData[y].students);

    if (teachingCharts.trend) teachingCharts.trend.destroy();

    teachingCharts.trend = new Chart(canvas, {
        type: 'line',
        data: {
            labels: years.map(y => y + 'هـ'),
            datasets: [
                {
                    label: 'عدد شعب المقررات',
                    data: coursesData,
                    borderColor: '#d4af37',
                    backgroundColor: 'rgba(212,175,55,0.1)',
                    fill: true, tension: 0.4, yAxisID: 'y'
                },
                {
                    label: 'عدد الطلاب',
                    data: studentsData,
                    borderColor: '#4ecdc4',
                    backgroundColor: 'rgba(78,205,196,0.1)',
                    fill: true, tension: 0.4, yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true, resizeDelay: 300, animation: { duration: 0 },
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo' } } } },
            scales: {
                y: { type: 'linear', position: 'right', title: { display: true, text: 'شعب المقررات', color: '#d4af37', font: { family: 'Cairo' } }, ticks: { color: '#d4af37' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y1: { type: 'linear', position: 'left', title: { display: true, text: 'الطلاب', color: '#4ecdc4', font: { family: 'Cairo' } }, ticks: { color: '#4ecdc4' }, grid: { drawOnChartArea: false } },
                x: { ticks: { color: '#e0e0e0', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderModeChart(records) {
    const canvas = document.getElementById('teachingModeChart');
    if (!canvas) return;
    const stats = computeTeachingStats(records);
    if (teachingCharts.mode) teachingCharts.mode.destroy();
    teachingCharts.mode = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['حضوري', 'عن بعد', 'مدمج'],
            datasets: [{ data: [stats.inPerson, stats.remote, stats.hybrid], backgroundColor: ['#4ecdc4', '#e74c3c', '#f39c12'], borderColor: '#1a3a5c', borderWidth: 2 }]
        },
        options: {
            responsive: true, resizeDelay: 300, animation: { duration: 0 },
            plugins: {
                legend: { position: 'bottom', labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 13 }, padding: 20 } },
                tooltip: { callbacks: { label: function(ctx) { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0; return `${ctx.label}: ${ctx.raw.toLocaleString('ar-SA')} (${pct}%)`; } } }
            }
        }
    });
}

function renderDeptChart(records) {
    const canvas = document.getElementById('teachingDeptChart');
    if (!canvas) return;
    const deptData = {};
    records.forEach(r => {
        const fi = teachingData.faculty_index[r.fid];
        const dept = fi ? fi.d : 'غير محدد';
        if (!deptData[dept]) deptData[dept] = { courses: 0 };
        r.cs.forEach(() => { deptData[dept].courses++; });
    });
    const depts = Object.keys(deptData);
    const colors = ['#d4af37', '#4ecdc4', '#e74c3c', '#9b59b6', '#3498db'];
    if (teachingCharts.dept) teachingCharts.dept.destroy();
    teachingCharts.dept = new Chart(canvas, {
        type: 'bar',
        data: { labels: depts, datasets: [{ label: 'شعب المقررات', data: depts.map(d => deptData[d].courses), backgroundColor: colors.map(c => c + '99'), borderColor: colors, borderWidth: 1 }] },
        options: {
            responsive: true, resizeDelay: 300, animation: { duration: 0 }, indexAxis: 'y',
            plugins: { legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo' } } } },
            scales: {
                x: { ticks: { color: '#e0e0e0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#e0e0e0', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderTopChart(records) {
    const canvas = document.getElementById('teachingTopChart');
    if (!canvas) return;
    const facultySummary = computeFacultySummary(records);
    const top10 = facultySummary.sort((a, b) => b.totalCourses - a.totalCourses).slice(0, 10);
    if (teachingCharts.top) teachingCharts.top.destroy();
    teachingCharts.top = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: top10.map(f => { const parts = f.name.split(' '); return parts.slice(0, 3).join(' '); }),
            datasets: [{ label: 'عدد شعب المقررات', data: top10.map(f => f.totalCourses), backgroundColor: 'rgba(212,175,55,0.7)', borderColor: '#d4af37', borderWidth: 1 }]
        },
        options: {
            responsive: true, resizeDelay: 300, animation: { duration: 0 }, indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#e0e0e0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

// ========================================
// جدول الأعضاء (يتأثر بفلاتر الجدول المستقلة فقط)
// ========================================
function renderTeachingTable() {
    if (!teachingData) return;

    const records = getTableFilteredRecords();
    let facultySummary = computeFacultySummary(records);

    // فلتر البحث بالاسم
    if (tableFilters.search) {
        const q = tableFilters.search.toLowerCase();
        facultySummary = facultySummary.filter(f =>
            f.name.toLowerCase().includes(q) || f.id.includes(q)
        );
    }

    // الترتيب
    switch (tableFilters.sort) {
        case 'sections': facultySummary.sort((a, b) => b.totalSections - a.totalSections); break;
        case 'courses': facultySummary.sort((a, b) => b.totalCourses - a.totalCourses); break;
        case 'students': facultySummary.sort((a, b) => b.totalStudents - a.totalStudents); break;
        case 'hours': facultySummary.sort((a, b) => b.totalHours - a.totalHours); break;
        case 'name': facultySummary.sort((a, b) => a.name.localeCompare(b.name, 'ar')); break;
    }

    const tbody = document.getElementById('teachingTableBody');
    if (!tbody) return;

    if (facultySummary.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:#888;">لا توجد بيانات مطابقة</td></tr>';
        return;
    }

    tbody.innerHTML = facultySummary.map((f, i) => `
        <tr class="teaching-row" onclick="openTeachingModal('${f.id}')">
            <td class="rank-cell">${i + 1}</td>
            <td class="name-cell">
                <div class="faculty-name-cell">
                    <span class="faculty-avatar">${getRankIcon(f.rank)}</span>
                    <div>
                        <div class="faculty-name">${f.name}</div>
                        <div class="faculty-id">${f.id}</div>
                    </div>
                </div>
            </td>
            <td><span class="dept-badge dept-${getDeptClass(f.department)}">${f.department}</span></td>
            <td>${f.rank}</td>
            <td><strong>${f.totalSections.toLocaleString('ar-SA')}</strong></td>
            <td><strong>${f.totalCourses.toLocaleString('ar-SA')}</strong></td>
            <td>${f.totalStudents.toLocaleString('ar-SA')}</td>
            <td>${f.totalHours.toLocaleString('ar-SA')}</td>
            <td><span class="mode-badge mode-inperson">${f.inPerson}</span></td>
            <td><span class="mode-badge mode-remote">${f.remote}</span></td>
            <td>
                <button class="detail-btn" onclick="event.stopPropagation();openTeachingModal('${f.id}')" title="عرض التفاصيل">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function getRankIcon(rank) {
    if (rank.includes('أستاذ مشارك') || rank.includes('استاذ مشارك')) return '🔵';
    if (rank.includes('أستاذ مساعد') || rank.includes('استاذ مساعد')) return '🟢';
    if (rank.includes('أستاذ') || rank.includes('استاذ')) return '🟡';
    if (rank.includes('محاضر')) return '🟠';
    if (rank.includes('معيد')) return '🔴';
    return '⚪';
}

function getDeptClass(dept) {
    if (dept.includes('قراءات') || dept.includes('القراءات')) return 'qiraat';
    if (dept.includes('شريعة') || dept.includes('الشريعة')) return 'sharia';
    if (dept.includes('أنظمة') || dept.includes('الأنظمة')) return 'law';
    if (dept.includes('ثقافة') || dept.includes('الثقافة')) return 'culture';
    return 'other';
}

// ========================================
// Modal تفاصيل العضو
// ========================================
function openTeachingModal(facultyId) {
    if (!teachingData) return;

    const fi = teachingData.faculty_index[facultyId];
    if (!fi) return;

    // عرض كل بيانات العضو (بدون فلاتر) حتى تكون النافذة شاملة
    let records = teachingData.records.filter(r => r.fid === facultyId);

    const yearGroups = {};
    records.forEach(r => {
        if (!yearGroups[r.y]) yearGroups[r.y] = [];
        yearGroups[r.y].push(r);
    });

    let totalSections = 0, totalStudents = 0, totalHours = 0, inPerson = 0, remote = 0;
    const uniqueCourseCodes = new Set();
    records.forEach(r => {
        r.cs.forEach(c => {
            totalSections++;
            uniqueCourseCodes.add(c.cc);
            totalStudents += c.e || 0;
            totalHours += c.h || 0;
            if (c.m === 'حضوري' || c.m === 'غير محدد') inPerson++;
            else if (c.m === 'عن بعد') remote++;
            else inPerson++;
        });
    });
    const totalUniqueCourses = uniqueCourseCodes.size;
    const avgStudents = totalSections > 0 ? Math.round(totalStudents / totalSections) : 0;

    const modalBody = document.getElementById('teachingModalBody');
    modalBody.innerHTML = `
        <div class="t-modal-header">
            <div class="t-modal-avatar">${getRankIcon(fi.r)}</div>
            <div class="t-modal-info">
                <h2>${fi.n}</h2>
                <p>${fi.r} | ${fi.d} | رقم: ${facultyId}</p>
            </div>
        </div>

        <div class="t-modal-stats">
            <div class="t-m-stat"><span class="t-m-num">${totalSections}</span><span class="t-m-label">شعبة</span></div>
            <div class="t-m-stat"><span class="t-m-num">${totalUniqueCourses}</span><span class="t-m-label">مقرر</span></div>
            <div class="t-m-stat"><span class="t-m-num">${totalStudents.toLocaleString('ar-SA')}</span><span class="t-m-label">طالب شعبة</span></div>
            <div class="t-m-stat"><span class="t-m-num">${totalHours}</span><span class="t-m-label">ساعة</span></div>
            <div class="t-m-stat"><span class="t-m-num">${avgStudents}</span><span class="t-m-label">متوسط طلاب/شعبة</span></div>
            <div class="t-m-stat"><span class="t-m-num">${inPerson}</span><span class="t-m-label">حضوري</span></div>
            <div class="t-m-stat"><span class="t-m-num">${remote}</span><span class="t-m-label">عن بعد</span></div>
        </div>

        <div class="t-modal-chart-row">
            <div class="t-modal-chart-box"><canvas id="memberTrendChart"></canvas></div>
            <div class="t-modal-chart-box"><canvas id="memberModeChart"></canvas></div>
        </div>

        <div class="t-modal-years">
            ${Object.keys(yearGroups).sort().map(year => {
                const yearRecords = yearGroups[year];
                let yc = 0, ys = 0;
                const allCourses = [];
                yearRecords.forEach(r => {
                    r.cs.forEach(c => { yc++; ys += c.e || 0; allCourses.push({ ...c, semester: r.sn }); });
                });
                return `
                    <div class="t-year-section">
                        <div class="t-year-header" onclick="this.parentElement.classList.toggle('collapsed')">
                            <h3>${year}هـ</h3>
                            <span class="t-year-summary">${yc} شعبة | ${ys.toLocaleString('ar-SA')} طالب</span>
                            <span class="t-year-toggle">▼</span>
                        </div>
                        <div class="t-year-body">
                            <table class="t-courses-table">
                                <thead><tr><th>الفصل</th><th>المقرر</th><th>الرمز</th><th>النوع</th><th>الدرجة</th><th>الطريقة</th><th>المقر</th><th>الساعات</th><th>طلاب الشعبة</th></tr></thead>
                                <tbody>
                                    ${allCourses.map(c => `
                                        <tr>
                                            <td>${c.semester}</td><td>${c.cn}</td><td class="code-cell">${c.cc}</td>
                                            <td>${c.a || '-'}</td><td>${c.dg || '-'}</td>
                                            <td><span class="mode-badge-sm mode-${c.m === 'عن بعد' ? 'remote' : 'inperson'}">${c.m}</span></td>
                                            <td>${c.l || '-'}</td><td>${c.h || 0}</td>
                                            <td><strong>${(c.e || 0).toLocaleString('ar-SA')}</strong></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        <div class="t-modal-actions">
            <button class="t-export-btn" onclick="exportFacultyReport('${facultyId}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                تنزيل التقرير (CSV)
            </button>
        </div>
    `;

    // عرض النافذة فوراً ثم رسم المخططات في الإطار التالي
    document.getElementById('teachingModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        renderMemberTrendChart(yearGroups);
        renderMemberModeChart(records);
    });
}

let modalCharts = [];

function closeTeachingModal() {
    document.getElementById('teachingModal').classList.remove('active');
    document.body.style.overflow = '';
    // تنظيف مخططات الـ Modal لتوفير الذاكرة
    modalCharts.forEach(c => { try { c.destroy(); } catch(e) {} });
    modalCharts = [];
}

function renderMemberTrendChart(yearGroups) {
    const canvas = document.getElementById('memberTrendChart');
    if (!canvas) return;
    const years = Object.keys(yearGroups).sort();
    const coursesData = [], studentsData = [];
    years.forEach(y => {
        let c = 0, s = 0;
        yearGroups[y].forEach(r => { r.cs.forEach(course => { c++; s += course.e || 0; }); });
        coursesData.push(c); studentsData.push(s);
    });
    const chart1 = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: years.map(y => y + 'هـ'),
            datasets: [
                { label: 'شعب المقررات', data: coursesData, backgroundColor: 'rgba(212,175,55,0.7)', borderColor: '#d4af37', borderWidth: 1, yAxisID: 'y' },
                { label: 'الطلاب', data: studentsData, type: 'line', borderColor: '#4ecdc4', backgroundColor: 'rgba(78,205,196,0.1)', fill: true, tension: 0.4, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, resizeDelay: 300, animation: { duration: 0 },
            plugins: {
                legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } } },
                title: { display: true, text: 'شعب المقررات والطلاب عبر السنوات', color: '#e0e0e0', font: { family: 'Cairo', size: 13 } }
            },
            scales: {
                y: { position: 'right', ticks: { color: '#d4af37' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y1: { position: 'left', ticks: { color: '#4ecdc4' }, grid: { drawOnChartArea: false } },
                x: { ticks: { color: '#e0e0e0', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
    modalCharts.push(chart1);
}

function renderMemberModeChart(records) {
    const canvas = document.getElementById('memberModeChart');
    if (!canvas) return;
    let ip = 0, rm = 0, hy = 0;
    records.forEach(r => { r.cs.forEach(c => { if (c.m === 'حضوري' || c.m === 'غير محدد') ip++; else if (c.m === 'عن بعد') rm++; else if (c.m === 'مدمج') hy++; else ip++; }); });
    const chart2 = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: ['حضوري', 'عن بعد', 'مدمج'], datasets: [{ data: [ip, rm, hy], backgroundColor: ['#4ecdc4', '#e74c3c', '#f39c12'], borderColor: '#1a3a5c', borderWidth: 2 }] },
        options: { responsive: true, resizeDelay: 300, animation: { duration: 0 }, plugins: { legend: { position: 'bottom', labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } } }, title: { display: true, text: 'طريقة التدريس', color: '#e0e0e0', font: { family: 'Cairo', size: 13 } } } }
    });
    modalCharts.push(chart2);
}

// ========================================
// فلترة السجلات حسب البرنامج
// ========================================
function filterRecordsByProgram(records, selectedProgram) {
    if (!selectedProgram || selectedProgram === 'all') return records;
    const parts = selectedProgram.split(' - ');
    const progName = parts[0];
    const progDeg = parts[1] || '';
    return records.map(r => ({
        ...r,
        cs: r.cs.filter(c => {
            const code = (c.cc || '').trim();
            const progs = (typeof courseCodeToPrograms !== 'undefined') ? courseCodeToPrograms[code] : null;
            if (!progs) return false;
            return progs.some(p => p.program === progName && p.degree === progDeg);
        })
    })).filter(r => r.cs.length > 0);
}

// ========================================
// مخطط البرامج الأكاديمية
// ========================================
function renderProgramChart(records) {
    const canvas = document.getElementById('teachingProgramChart');
    if (!canvas || typeof courseCodeToPrograms === 'undefined') return;

    const progData = {};
    const programs = (typeof config !== 'undefined' && config.programs) || [];
    programs.forEach(p => {
        progData[p.name + ' - ' + p.degree] = { sections: 0, students: 0 };
    });
    progData['غير مصنف'] = { sections: 0, students: 0 };

    records.forEach(r => {
        r.cs.forEach(c => {
            const code = (c.cc || '').trim();
            const progs = courseCodeToPrograms[code];
            if (progs && progs.length > 0) {
                progs.forEach(p => {
                    if (progData[p.key]) {
                        progData[p.key].sections++;
                        progData[p.key].students += c.e || 0;
                    }
                });
            } else {
                progData['غير مصنف'].sections++;
                progData['غير مصنف'].students += c.e || 0;
            }
        });
    });

    // ترتيب حسب عدد الشعب (الأكبر أولاً)
    const entries = Object.entries(progData).filter(([, v]) => v.sections > 0)
        .sort((a, b) => b[1].sections - a[1].sections);

    const labels = entries.map(([k]) => k);
    const data = entries.map(([, v]) => v.sections);

    const degreeColors = {
        'بكالوريوس': '#4ecdc4',
        'ماجستير': '#d4af37',
        'دكتوراه': '#e74c3c'
    };
    const bgColors = labels.map(l => {
        if (l === 'غير مصنف') return 'rgba(156,163,175,0.6)';
        const deg = l.split(' - ')[1];
        const base = degreeColors[deg] || '#9ca3af';
        return base + '99';
    });
    const borderColors = labels.map(l => {
        if (l === 'غير مصنف') return '#9ca3af';
        const deg = l.split(' - ')[1];
        return degreeColors[deg] || '#9ca3af';
    });

    if (teachingCharts.program) teachingCharts.program.destroy();

    teachingCharts.program = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد الشعب',
                data: data,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, resizeDelay: 300, animation: { duration: 0 },
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(ctx) {
                            const key = labels[ctx.dataIndex];
                            const entry = progData[key];
                            return `الطلاب: ${entry.students.toLocaleString('ar-SA')}`;
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

// ========================================
// إحصائيات البرامج الأكاديمية
// ========================================
function renderProgramStats(records) {
    const tbody = document.getElementById('programStatsBody');
    if (!tbody || typeof courseCodeToPrograms === 'undefined') return;

    const programs = (typeof config !== 'undefined' && config.programs) || [];
    const stats = [];

    programs.forEach(p => {
        const key = p.name + ' - ' + p.degree;
        let totalSections = 0, totalStudents = 0;
        let nonSharedSections = 0, nonSharedStudents = 0;
        const facultySet = new Set();
        const nonSharedFacultySet = new Set();

        // المقررات الفريدة للبرنامج (غير المتطلبات الجامعية المشتركة)
        const nonSharedCodes = (typeof programNonSharedCodes !== 'undefined' && programNonSharedCodes[key])
            ? programNonSharedCodes[key] : new Set();

        records.forEach(r => {
            r.cs.forEach(c => {
                const code = (c.cc || '').trim();
                const progs = courseCodeToPrograms[code];
                if (!progs) return;
                const belongs = progs.some(pp => pp.program === p.name && pp.degree === p.degree);
                if (!belongs) return;

                totalSections++;
                totalStudents += c.e || 0;
                facultySet.add(r.fid);

                if (nonSharedCodes.has(code)) {
                    nonSharedSections++;
                    nonSharedStudents += c.e || 0;
                    nonSharedFacultySet.add(r.fid);
                }
            });
        });

        if (totalSections > 0) {
            const avgNonShared = nonSharedSections > 0 ? Math.round(nonSharedStudents / nonSharedSections) : 0;
            const nonSharedFacultyCount = nonSharedFacultySet.size;
            // تقدير عدد الطلاب الفعلي باستخدام متوسط حمل الطالب السنوي
            const avgLoad = (typeof programAvgLoad !== 'undefined' && programAvgLoad[key]) || 1;
            const estimatedStudents = Math.round(nonSharedStudents / avgLoad);
            const studentFacultyRatio = nonSharedFacultyCount > 0
                ? (estimatedStudents / nonSharedFacultyCount).toFixed(1)
                : '-';
            stats.push({
                name: p.name,
                degree: p.degree,
                totalSections,
                totalStudents,
                faculty: facultySet.size,
                nonSharedSections,
                avgNonShared,
                studentFacultyRatio,
                nonSharedFacultyCount,
                estimatedStudents,
                avgLoad
            });
        }
    });

    // ترتيب: بكالوريوس أولاً ثم ماجستير ثم دكتوراه، وداخل كل مستوى بعدد الشعب
    const degreeOrder = { 'بكالوريوس': 0, 'ماجستير': 1, 'دكتوراه': 2 };
    stats.sort((a, b) => {
        const da = degreeOrder[a.degree] ?? 3;
        const db = degreeOrder[b.degree] ?? 3;
        if (da !== db) return da - db;
        return b.totalSections - a.totalSections;
    });

    const degreeClass = { 'بكالوريوس': 'bsc', 'ماجستير': 'msc', 'دكتوراه': 'phd' };

    // تحديد لون النسبة (أخضر: جيد، أصفر: مقبول، أحمر: مرتفع)
    function getRatioBadge(ratio) {
        if (ratio === '-') return '<span class="ratio-badge ratio-na">-</span>';
        const val = parseFloat(ratio);
        if (val <= 25) return `<span class="ratio-badge ratio-good">${val.toLocaleString('ar-SA')} : 1</span>`;
        if (val <= 40) return `<span class="ratio-badge ratio-warning">${val.toLocaleString('ar-SA')} : 1</span>`;
        return `<span class="ratio-badge ratio-high">${val.toLocaleString('ar-SA')} : 1</span>`;
    }

    tbody.innerHTML = stats.map(s => `
        <tr>
            <td class="prog-name-cell">${s.name}</td>
            <td><span class="degree-badge degree-${degreeClass[s.degree] || 'other'}">${s.degree}</span></td>
            <td><strong>${s.totalSections.toLocaleString('ar-SA')}</strong></td>
            <td>${s.nonSharedSections.toLocaleString('ar-SA')}</td>
            <td><strong>${s.avgNonShared.toLocaleString('ar-SA')}</strong></td>
            <td>${(s.estimatedStudents || 0).toLocaleString('ar-SA')}</td>
            <td>${s.faculty}</td>
            <td>${getRatioBadge(s.studentFacultyRatio)}</td>
        </tr>
    `).join('');

    // تخزين الإحصائيات للاستخدام في تبويب الجودة
    window._lastProgramStats = stats;
}

// ========================================
// التصدير
// ========================================
function exportFacultyReport(facultyId) {
    if (!teachingData) return;
    const fi = teachingData.faculty_index[facultyId];
    if (!fi) return;
    let records = teachingData.records.filter(r => r.fid === facultyId);
    const BOM = '\uFEFF';
    let csv = BOM + 'تقرير النشاط التدريسي\n';
    csv += `العضو: ${fi.n}\nالرقم الوظيفي: ${facultyId}\nالقسم: ${fi.d}\nالمرتبة: ${fi.r}\n\n`;
    csv += 'السنة,الفصل,رمز المقرر,اسم المقرر,النوع,الدرجة,طريقة التدريس,المقر,الساعات الأسبوعية,طلاب الشعبة\n';
    records.forEach(r => { r.cs.forEach(c => { csv += `${r.y},${r.sn},${c.cc},"${c.cn}",${c.a || ''},${c.dg || ''},${c.m},${c.l || ''},${c.h || 0},${c.e || 0}\n`; }); });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `تقرير_تدريسي_${fi.n.replace(/\s+/g, '_')}.csv`;
    a.click(); URL.revokeObjectURL(url);
}

function exportAllTeachingCSV() {
    if (!teachingData) return;
    const records = getTableFilteredRecords();
    const BOM = '\uFEFF';
    let csv = BOM + 'الرقم الوظيفي,الاسم,القسم,المرتبة,السنة,الفصل,رمز المقرر,اسم المقرر,النوع,الدرجة,طريقة التدريس,المقر,الساعات الأسبوعية,طلاب الشعبة,البرامج\n';
    records.forEach(r => {
        const fi = teachingData.faculty_index[r.fid] || {};
        r.cs.forEach(c => {
            const code = (c.cc || '').trim();
            const progs = (typeof courseCodeToPrograms !== 'undefined' && courseCodeToPrograms[code]) || [];
            const progStr = progs.map(p => p.key).join(' | ');
            csv += `${r.fid},"${fi.n || ''}",${fi.d || ''},${fi.r || ''},${r.y},${r.sn},${c.cc},"${c.cn}",${c.a || ''},${c.dg || ''},${c.m},${c.l || ''},${c.h || 0},${c.e || 0},"${progStr}"\n`;
        });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `النشاط_التدريسي_${tableFilters.year === 'all' ? 'الكل' : tableFilters.year}.csv`;
    a.click(); URL.revokeObjectURL(url);
}

function printTeachingReport() {
    document.body.classList.add('printing-teaching-modal');
    window.print();
    window.addEventListener('afterprint', function handler() {
        document.body.classList.remove('printing-teaching-modal');
        window.removeEventListener('afterprint', handler);
    });
}

// ========================================
// التحميل عند الطلب (lazy loading) + إدارة المخططات
// ========================================
let chartsVisible = false;

document.addEventListener('DOMContentLoaded', () => {
    // مراقبة تبويب التدريس
    const observer = new MutationObserver(() => {
        const teachingTab = document.getElementById('teaching');
        if (!teachingTab) return;

        const isActive = teachingTab.classList.contains('active');

        if (isActive && !teachingInitialized) {
            ensureTeachingLoaded();
        } else if (isActive && teachingInitialized && !chartsVisible) {
            // عند العودة للتبويب: إعادة رسم المخططات بتأخير لمنع التجميد
            chartsVisible = true;
            requestAnimationFrame(() => renderTeachingOverview());
        } else if (!isActive && chartsVisible) {
            // عند مغادرة التبويب: تدمير المخططات لتوفير الذاكرة ومنع resize المكلف
            chartsVisible = false;
            Object.values(teachingCharts).forEach(c => { try { c.destroy(); } catch(e) {} });
            teachingCharts = {};
        }
    });

    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        observer.observe(mainContent, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // النقر على زر التبويب مباشرة
    document.querySelectorAll('[data-tab="teaching"]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!teachingInitialized) {
                ensureTeachingLoaded();
            } else if (!chartsVisible) {
                chartsVisible = true;
                requestAnimationFrame(() => renderTeachingOverview());
            }
        });
    });
});
