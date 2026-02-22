// ========================================
// النشاط التدريسي - Teaching Activities Module
// ========================================

let teachingData = null;
let teachingCharts = {};
let teachingFilters = {
    year: 'all',
    department: 'all',
    search: '',
    sort: 'courses'
};

// ========================================
// تحميل البيانات
// ========================================
async function loadTeachingData() {
    try {
        const response = await fetch(`${DATA_BASE_URL}/teaching_data.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        teachingData = await response.json();
        console.log('🏫 تم تحميل بيانات النشاط التدريسي:', teachingData.records.length, 'سجل');
        initTeachingFilters();
        renderTeaching();
    } catch (error) {
        console.warn('⚠️ تعذر تحميل بيانات النشاط التدريسي:', error.message);
    }
}

// ========================================
// تهيئة الفلاتر
// ========================================
function initTeachingFilters() {
    if (!teachingData) return;

    const yearSelect = document.getElementById('teachingYearFilter');
    const deptSelect = document.getElementById('teachingDeptFilter');

    if (yearSelect) {
        yearSelect.innerHTML = '<option value="all">جميع السنوات</option>';
        teachingData.years.forEach(y => {
            yearSelect.innerHTML += `<option value="${y}">${y}هـ</option>`;
        });
        yearSelect.addEventListener('change', (e) => {
            teachingFilters.year = e.target.value;
            renderTeaching();
        });
    }

    if (deptSelect) {
        deptSelect.innerHTML = '<option value="all">جميع الأقسام</option>';
        teachingData.departments.forEach(d => {
            deptSelect.innerHTML += `<option value="${d}">${d}</option>`;
        });
        deptSelect.addEventListener('change', (e) => {
            teachingFilters.department = e.target.value;
            renderTeaching();
        });
    }

    document.getElementById('teachingSearch')?.addEventListener('input', (e) => {
        teachingFilters.search = e.target.value.trim();
        renderTeachingTable();
    });

    document.getElementById('teachingSortFilter')?.addEventListener('change', (e) => {
        teachingFilters.sort = e.target.value;
        renderTeachingTable();
    });

    document.getElementById('exportAllTeaching')?.addEventListener('click', exportAllTeachingCSV);

    // Modal events
    document.getElementById('teachingModalClose')?.addEventListener('click', closeTeachingModal);
    document.getElementById('teachingPrintBtn')?.addEventListener('click', printTeachingReport);
    document.getElementById('teachingModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'teachingModal') closeTeachingModal();
    });
}

// ========================================
// حساب الإحصائيات
// ========================================
function getFilteredRecords() {
    if (!teachingData) return [];
    let records = teachingData.records;

    if (teachingFilters.year !== 'all') {
        const year = parseInt(teachingFilters.year);
        records = records.filter(r => r.y === year);
    }

    if (teachingFilters.department !== 'all') {
        records = records.filter(r => {
            const fi = teachingData.faculty_index[r.fid];
            return fi && fi.d === teachingFilters.department;
        });
    }

    return records;
}

function computeTeachingStats(records) {
    let totalCourses = 0, totalStudents = 0, inPerson = 0, remote = 0, hybrid = 0;

    records.forEach(r => {
        r.cs.forEach(c => {
            totalCourses++;
            totalStudents += c.e || 0;
            if (c.m === 'حضوري') inPerson++;
            else if (c.m === 'عن بعد') remote++;
            else if (c.m === 'مدمج') hybrid++;
            else inPerson++; // default
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
                totalCourses: 0,
                totalStudents: 0,
                totalHours: 0,
                inPerson: 0,
                remote: 0,
                years: new Set()
            };
        }

        const s = summary[r.fid];
        s.years.add(r.y);

        r.cs.forEach(c => {
            s.totalCourses++;
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
        return s;
    });
}

// ========================================
// تحريك الأرقام
// ========================================
function animateNumber(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    const duration = 800;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (targetValue - start) * eased);
        el.textContent = current.toLocaleString('ar-SA');
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

// ========================================
// الرسم الرئيسي
// ========================================
function renderTeaching() {
    if (!teachingData) return;

    const records = getFilteredRecords();
    const stats = computeTeachingStats(records);

    // تحديث البطاقات
    animateNumber('tTotalCourses', stats.totalCourses);
    animateNumber('tTotalStudents', stats.totalStudents);
    animateNumber('tInPerson', stats.inPerson);
    animateNumber('tRemote', stats.remote);

    renderTeachingCharts(records);
    renderTeachingTable();
}

// ========================================
// المخططات البيانية
// ========================================
function renderTeachingCharts(records) {
    renderTrendChart(records);
    renderModeChart(records);
    renderDeptChart(records);
    renderTopChart(records);
}

function renderTrendChart(records) {
    const canvas = document.getElementById('teachingTrendChart');
    if (!canvas) return;

    // تجميع حسب السنة
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
                    label: 'عدد المقررات',
                    data: coursesData,
                    borderColor: '#d4af37',
                    backgroundColor: 'rgba(212,175,55,0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'عدد الطلاب',
                    data: studentsData,
                    borderColor: '#4ecdc4',
                    backgroundColor: 'rgba(78,205,196,0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo' } } }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'المقررات', color: '#d4af37', font: { family: 'Cairo' } },
                    ticks: { color: '#d4af37' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y1: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'الطلاب', color: '#4ecdc4', font: { family: 'Cairo' } },
                    ticks: { color: '#4ecdc4' },
                    grid: { drawOnChartArea: false }
                },
                x: {
                    ticks: { color: '#e0e0e0', font: { family: 'Cairo' } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
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
            datasets: [{
                data: [stats.inPerson, stats.remote, stats.hybrid],
                backgroundColor: ['#4ecdc4', '#e74c3c', '#f39c12'],
                borderColor: '#1a3a5c',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 13 }, padding: 20 }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return `${ctx.label}: ${ctx.raw.toLocaleString('ar-SA')} (${pct}%)`;
                        }
                    }
                }
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
        if (!deptData[dept]) deptData[dept] = { courses: 0, students: 0 };
        r.cs.forEach(c => {
            deptData[dept].courses++;
            deptData[dept].students += c.e || 0;
        });
    });

    const depts = Object.keys(deptData);
    const colors = ['#d4af37', '#4ecdc4', '#e74c3c', '#9b59b6', '#3498db'];

    if (teachingCharts.dept) teachingCharts.dept.destroy();

    teachingCharts.dept = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: depts,
            datasets: [
                {
                    label: 'المقررات',
                    data: depts.map(d => deptData[d].courses),
                    backgroundColor: colors.map(c => c + '99'),
                    borderColor: colors,
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo' } } }
            },
            scales: {
                x: {
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#e0e0e0', font: { family: 'Cairo' } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderTopChart(records) {
    const canvas = document.getElementById('teachingTopChart');
    if (!canvas) return;

    const facultySummary = computeFacultySummary(records);
    const top10 = facultySummary
        .sort((a, b) => b.totalCourses - a.totalCourses)
        .slice(0, 10);

    if (teachingCharts.top) teachingCharts.top.destroy();

    teachingCharts.top = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: top10.map(f => {
                const parts = f.name.split(' ');
                return parts.slice(0, 3).join(' ');
            }),
            datasets: [{
                label: 'عدد المقررات',
                data: top10.map(f => f.totalCourses),
                backgroundColor: 'rgba(212,175,55,0.7)',
                borderColor: '#d4af37',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

// ========================================
// جدول الأعضاء
// ========================================
function renderTeachingTable() {
    if (!teachingData) return;

    const records = getFilteredRecords();
    let facultySummary = computeFacultySummary(records);

    // فلتر البحث
    if (teachingFilters.search) {
        const q = teachingFilters.search.toLowerCase();
        facultySummary = facultySummary.filter(f =>
            f.name.toLowerCase().includes(q) || f.id.includes(q)
        );
    }

    // الترتيب
    switch (teachingFilters.sort) {
        case 'courses':
            facultySummary.sort((a, b) => b.totalCourses - a.totalCourses);
            break;
        case 'students':
            facultySummary.sort((a, b) => b.totalStudents - a.totalStudents);
            break;
        case 'hours':
            facultySummary.sort((a, b) => b.totalHours - a.totalHours);
            break;
        case 'name':
            facultySummary.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
            break;
    }

    const tbody = document.getElementById('teachingTableBody');
    if (!tbody) return;

    if (facultySummary.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:#888;">لا توجد بيانات مطابقة</td></tr>';
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

    // جمع كل سجلات هذا العضو
    let records = teachingData.records.filter(r => r.fid === facultyId);

    if (teachingFilters.year !== 'all') {
        const year = parseInt(teachingFilters.year);
        records = records.filter(r => r.y === year);
    }

    // تجميع حسب السنة
    const yearGroups = {};
    records.forEach(r => {
        if (!yearGroups[r.y]) yearGroups[r.y] = [];
        yearGroups[r.y].push(r);
    });

    // إحصائيات إجمالية
    let totalCourses = 0, totalStudents = 0, totalHours = 0, inPerson = 0, remote = 0;
    records.forEach(r => {
        r.cs.forEach(c => {
            totalCourses++;
            totalStudents += c.e || 0;
            totalHours += c.h || 0;
            if (c.m === 'حضوري' || c.m === 'غير محدد') inPerson++;
            else if (c.m === 'عن بعد') remote++;
            else inPerson++;
        });
    });

    const avgStudents = totalCourses > 0 ? Math.round(totalStudents / totalCourses) : 0;

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
            <div class="t-m-stat"><span class="t-m-num">${totalCourses}</span><span class="t-m-label">مقرر</span></div>
            <div class="t-m-stat"><span class="t-m-num">${totalStudents.toLocaleString('ar-SA')}</span><span class="t-m-label">طالب</span></div>
            <div class="t-m-stat"><span class="t-m-num">${totalHours}</span><span class="t-m-label">ساعة</span></div>
            <div class="t-m-stat"><span class="t-m-num">${avgStudents}</span><span class="t-m-label">متوسط طلاب/مقرر</span></div>
            <div class="t-m-stat"><span class="t-m-num">${inPerson}</span><span class="t-m-label">حضوري</span></div>
            <div class="t-m-stat"><span class="t-m-num">${remote}</span><span class="t-m-label">عن بعد</span></div>
        </div>

        <div class="t-modal-chart-row">
            <div class="t-modal-chart-box">
                <canvas id="memberTrendChart"></canvas>
            </div>
            <div class="t-modal-chart-box">
                <canvas id="memberModeChart"></canvas>
            </div>
        </div>

        <div class="t-modal-years">
            ${Object.keys(yearGroups).sort().map(year => {
                const yearRecords = yearGroups[year];
                let yc = 0, ys = 0;
                const allCourses = [];
                yearRecords.forEach(r => {
                    r.cs.forEach(c => {
                        yc++;
                        ys += c.e || 0;
                        allCourses.push({ ...c, semester: r.sn });
                    });
                });

                return `
                    <div class="t-year-section">
                        <div class="t-year-header" onclick="this.parentElement.classList.toggle('collapsed')">
                            <h3>${year}هـ</h3>
                            <span class="t-year-summary">${yc} مقرر | ${ys.toLocaleString('ar-SA')} طالب</span>
                            <span class="t-year-toggle">▼</span>
                        </div>
                        <div class="t-year-body">
                            <table class="t-courses-table">
                                <thead>
                                    <tr>
                                        <th>الفصل</th>
                                        <th>المقرر</th>
                                        <th>الرمز</th>
                                        <th>النوع</th>
                                        <th>الدرجة</th>
                                        <th>الطريقة</th>
                                        <th>المقر</th>
                                        <th>الساعات</th>
                                        <th>المسجلين</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${allCourses.map(c => `
                                        <tr>
                                            <td>${c.semester}</td>
                                            <td>${c.cn}</td>
                                            <td class="code-cell">${c.cc}</td>
                                            <td>${c.a || '-'}</td>
                                            <td>${c.dg || '-'}</td>
                                            <td><span class="mode-badge-sm mode-${c.m === 'عن بعد' ? 'remote' : 'inperson'}">${c.m}</span></td>
                                            <td>${c.l || '-'}</td>
                                            <td>${c.h || 0}</td>
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

    // رسم المخططات في Modal
    renderMemberTrendChart(yearGroups);
    renderMemberModeChart(records);

    document.getElementById('teachingModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeTeachingModal() {
    document.getElementById('teachingModal').classList.remove('active');
    document.body.style.overflow = '';
}

function renderMemberTrendChart(yearGroups) {
    const canvas = document.getElementById('memberTrendChart');
    if (!canvas) return;

    const years = Object.keys(yearGroups).sort();
    const coursesData = [];
    const studentsData = [];

    years.forEach(y => {
        let c = 0, s = 0;
        yearGroups[y].forEach(r => {
            r.cs.forEach(course => {
                c++;
                s += course.e || 0;
            });
        });
        coursesData.push(c);
        studentsData.push(s);
    });

    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: years.map(y => y + 'هـ'),
            datasets: [
                {
                    label: 'المقررات',
                    data: coursesData,
                    backgroundColor: 'rgba(212,175,55,0.7)',
                    borderColor: '#d4af37',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'الطلاب',
                    data: studentsData,
                    type: 'line',
                    borderColor: '#4ecdc4',
                    backgroundColor: 'rgba(78,205,196,0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } } },
                title: { display: true, text: 'المقررات والطلاب عبر السنوات', color: '#e0e0e0', font: { family: 'Cairo', size: 13 } }
            },
            scales: {
                y: { position: 'right', ticks: { color: '#d4af37' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y1: { position: 'left', ticks: { color: '#4ecdc4' }, grid: { drawOnChartArea: false } },
                x: { ticks: { color: '#e0e0e0', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderMemberModeChart(records) {
    const canvas = document.getElementById('memberModeChart');
    if (!canvas) return;

    let ip = 0, rm = 0, hy = 0;
    records.forEach(r => {
        r.cs.forEach(c => {
            if (c.m === 'حضوري' || c.m === 'غير محدد') ip++;
            else if (c.m === 'عن بعد') rm++;
            else if (c.m === 'مدمج') hy++;
            else ip++;
        });
    });

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['حضوري', 'عن بعد', 'مدمج'],
            datasets: [{
                data: [ip, rm, hy],
                backgroundColor: ['#4ecdc4', '#e74c3c', '#f39c12'],
                borderColor: '#1a3a5c',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#e0e0e0', font: { family: 'Cairo', size: 11 } } },
                title: { display: true, text: 'طريقة التدريس', color: '#e0e0e0', font: { family: 'Cairo', size: 13 } }
            }
        }
    });
}

// ========================================
// التصدير
// ========================================
function exportFacultyReport(facultyId) {
    if (!teachingData) return;

    const fi = teachingData.faculty_index[facultyId];
    if (!fi) return;

    let records = teachingData.records.filter(r => r.fid === facultyId);

    if (teachingFilters.year !== 'all') {
        records = records.filter(r => r.y === parseInt(teachingFilters.year));
    }

    // بناء CSV
    const BOM = '\uFEFF';
    let csv = BOM;
    csv += 'تقرير النشاط التدريسي\n';
    csv += `العضو: ${fi.n}\n`;
    csv += `الرقم الوظيفي: ${facultyId}\n`;
    csv += `القسم: ${fi.d}\n`;
    csv += `المرتبة: ${fi.r}\n\n`;
    csv += 'السنة,الفصل,رمز المقرر,اسم المقرر,النوع,الدرجة,طريقة التدريس,المقر,الساعات الأسبوعية,عدد المسجلين\n';

    records.forEach(r => {
        r.cs.forEach(c => {
            csv += `${r.y},${r.sn},${c.cc},"${c.cn}",${c.a || ''},${c.dg || ''},${c.m},${c.l || ''},${c.h || 0},${c.e || 0}\n`;
        });
    });

    // تحميل الملف
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_تدريسي_${fi.n.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportAllTeachingCSV() {
    if (!teachingData) return;

    const records = getFilteredRecords();
    const BOM = '\uFEFF';
    let csv = BOM;
    csv += 'الرقم الوظيفي,الاسم,القسم,المرتبة,السنة,الفصل,رمز المقرر,اسم المقرر,النوع,الدرجة,طريقة التدريس,المقر,الساعات الأسبوعية,عدد المسجلين\n';

    records.forEach(r => {
        const fi = teachingData.faculty_index[r.fid] || {};
        r.cs.forEach(c => {
            csv += `${r.fid},"${fi.n || ''}",${fi.d || ''},${fi.r || ''},${r.y},${r.sn},${c.cc},"${c.cn}",${c.a || ''},${c.dg || ''},${c.m},${c.l || ''},${c.h || 0},${c.e || 0}\n`;
        });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `النشاط_التدريسي_${teachingFilters.year === 'all' ? 'الكل' : teachingFilters.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function printTeachingReport() {
    window.print();
}

// ========================================
// التحميل عند بدء التشغيل
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // تأخير التحميل قليلاً حتى يكتمل تحميل app.js
    setTimeout(loadTeachingData, 500);
});
