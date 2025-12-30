// ========================================
// المتغيرات العامة
// ========================================
let config = {};
let currentYear = 2025;
let data = {
    faculty: [],
    students: [],
    theses: [],
    publications: [],
    events: [],
    awards: []
};

// تحديد مسار البيانات (GitHub raw أو محلي)
const DATA_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? './data'
    : 'https://raw.githubusercontent.com/YOUR_USERNAME/faculty-activities/main/data';

// ========================================
// دوال تحميل البيانات
// ========================================

// تحميل ملف JSON
async function loadJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error loading JSON:', error);
        return null;
    }
}

// تحميل ملف CSV وتحويله لمصفوفة
async function loadCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        
        return new Promise((resolve) => {
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                }
            });
        });
    } catch (error) {
        console.error('Error loading CSV:', error);
        return [];
    }
}

// تحميل جميع بيانات سنة معينة
async function loadYearData(year) {
    showLoading();
    
    const basePath = `${DATA_BASE_URL}/${year}`;
    
    const [faculty, students, theses, publications, events, awards] = await Promise.all([
        loadCSV(`${basePath}/faculty.csv`),
        loadCSV(`${basePath}/students_count.csv`),
        loadCSV(`${basePath}/theses.csv`),
        loadCSV(`${basePath}/publications.csv`),
        loadCSV(`${basePath}/events.csv`),
        loadCSV(`${basePath}/awards.csv`)
    ]);
    
    data = { faculty, students, theses, publications, events, awards };
    
    hideLoading();
    renderAll();
}

// تحميل الإعدادات
async function loadConfig() {
    config = await loadJSON(`${DATA_BASE_URL}/config.json`);
    if (config) {
        currentYear = config.current_year;
        populateYearSelector();
    }
}

// ========================================
// دوال مساعدة
// ========================================

// الحصول على اسم العضو من ID
function getMemberName(id) {
    if (!id) return '';
    const member = data.faculty.find(m => m.id === id);
    return member ? member.name : `عضو ${id}`;
}

// الحصول على عدة أعضاء من IDs مفصولة بـ |
function getMembersNames(ids) {
    if (!ids) return [];
    return ids.split('|').map(id => getMemberName(id.trim())).filter(Boolean);
}

// تنسيق التاريخ
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

// تنسيق التاريخ المختصر
function formatShortDate(dateStr) {
    if (!dateStr) return { day: '-', month: '' };
    const date = new Date(dateStr);
    return {
        day: date.getDate(),
        month: date.toLocaleDateString('ar-SA', { month: 'short' })
    };
}

// حساب قيمة الاقتباسات التقريبية
function getCitationsValue(range) {
    const ranges = config.citations_ranges || {
        'أقل من 10': 5,
        '11-20': 15,
        '21-50': 35,
        '51-100': 75,
        '101-200': 150,
        '201-500': 350,
        'أكثر من 500': 600
    };
    return ranges[range] || 0;
}

// ========================================
// حساب النقاط والإحصائيات
// ========================================

// حساب نقاط عضو واحد
function calculateMemberPoints(memberId) {
    const weights = config.weights || {};
    let points = 0;
    let details = {
        publications: 0,
        supervision: 0,
        events: 0,
        awards: 0
    };
    
    // نقاط البحوث
    data.publications.forEach(pub => {
        const authors = pub.authors_ids ? pub.authors_ids.split('|') : [];
        if (authors.includes(memberId)) {
            points += weights.publication || 15;
            details.publications++;
        }
    });
    
    // نقاط الإشراف والمناقشة
    data.theses.forEach(thesis => {
        if (thesis.supervisor_id === memberId) {
            if (thesis.type === 'دكتوراه') {
                points += weights.phd_supervision || 10;
            } else {
                points += weights.masters_supervision || 3;
            }
            details.supervision++;
        }
        if (thesis.co_supervisor_id === memberId) {
            points += (thesis.type === 'دكتوراه' ? 5 : 2);
            details.supervision++;
        }
        if (thesis.examiner1_id === memberId || thesis.examiner2_id === memberId) {
            if (thesis.type === 'دكتوراه') {
                points += weights.phd_discussion || 5;
            } else {
                points += weights.masters_discussion || 2;
            }
        }
    });
    
    // نقاط الفعاليات
    data.events.forEach(event => {
        const participants = event.participant_ids ? event.participant_ids.split('|') : [];
        if (participants.includes(memberId)) {
            if (event.participation_type === 'مشاركة بورقة') {
                points += weights.conference_paper || 8;
            } else if (event.participation_type === 'مشاركة') {
                points += weights.workshop_participation || 5;
            } else {
                points += weights.event_attendance || 1;
            }
            details.events++;
        }
    });
    
    // نقاط الجوائز
    data.awards.forEach(award => {
        if (award.recipient_id === memberId) {
            if (award.type === 'براءة اختراع') {
                points += weights.patent || 15;
            } else {
                points += weights.award || 10;
            }
            details.awards++;
        }
    });
    
    return { points, details };
}

// حساب إحصائيات KPI
function calculateKPIs() {
    const activeFaculty = data.faculty.filter(m => m.active === 'نعم');
    const totalFaculty = activeFaculty.length;
    
    // عدد الأعضاء الذين نشروا
    const publishingMembers = new Set();
    data.publications.forEach(pub => {
        const authors = pub.authors_ids ? pub.authors_ids.split('|') : [];
        authors.forEach(id => publishingMembers.add(id));
    });
    
    // نسبة النشر
    const publishingRate = totalFaculty > 0 
        ? ((publishingMembers.size / totalFaculty) * 100).toFixed(1)
        : 0;
    
    // معدل البحوث لكل عضو
    const pubsPerMember = totalFaculty > 0
        ? (data.publications.length / totalFaculty).toFixed(2)
        : 0;
    
    // إجمالي الاقتباسات التقريبية
    let totalCitations = 0;
    data.publications.forEach(pub => {
        totalCitations += getCitationsValue(pub.citations_range);
    });
    const citationsPerMember = totalFaculty > 0
        ? (totalCitations / totalFaculty).toFixed(1)
        : 0;
    
    // نسبة نشر الطلاب
    const totalStudents = data.students.reduce((sum, s) => sum + parseInt(s.count || 0), 0);
    const studentPublications = data.publications.filter(p => p.student_author === 'نعم').length;
    const studentPubRate = totalStudents > 0
        ? ((studentPublications / totalStudents) * 100).toFixed(1)
        : 0;
    
    // الابتكار والتميز
    const innovationCount = data.awards.length;
    
    return {
        publishingRate,
        pubsPerMember,
        citationsPerMember,
        studentPubRate,
        innovationCount,
        totalFaculty,
        totalPublications: data.publications.length,
        totalTheses: data.theses.length,
        completedTheses: data.theses.filter(t => t.status === 'منجزة').length,
        totalEvents: data.events.length,
        totalConferences: data.events.filter(e => e.type === 'مؤتمر').length,
        totalSeminars: data.events.filter(e => e.type === 'ندوة').length,
        totalWorkshops: data.events.filter(e => e.type === 'ورشة').length
    };
}

// إنشاء ترتيب المتصدرين
function getLeaderboard() {
    return data.faculty
        .filter(m => m.active === 'نعم')
        .map(member => {
            const { points, details } = calculateMemberPoints(member.id);
            return {
                ...member,
                points,
                ...details
            };
        })
        .sort((a, b) => b.points - a.points);
}

// ========================================
// دوال العرض (Rendering)
// ========================================

// عرض حالة التحميل
function showLoading() {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>جاري تحميل البيانات...</p>
            </div>
        `;
    });
}

function hideLoading() {
    // سيتم استبدال المحتوى بالبيانات الفعلية
}

// ملء قائمة السنوات
function populateYearSelector() {
    const select = document.getElementById('yearSelect');
    select.innerHTML = '';
    
    (config.available_years || [2025]).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        select.appendChild(option);
    });
}

// عرض كل الأقسام
function renderAll() {
    renderDashboard();
    renderTheses();
    renderPublications();
    renderEvents();
    renderAwards();
    renderLeaderboard();
}

// ========================================
// عرض لوحة المعلومات
// ========================================
function renderDashboard() {
    const kpis = calculateKPIs();
    
    // بطاقات KPI
    document.getElementById('kpiGrid').innerHTML = `
        <div class="kpi-card green">
            <div class="kpi-icon">📊</div>
            <div class="kpi-value">${kpis.publishingRate}%</div>
            <div class="kpi-label">نسبة النشر العلمي للأعضاء</div>
        </div>
        <div class="kpi-card blue">
            <div class="kpi-icon">📚</div>
            <div class="kpi-value">${kpis.pubsPerMember}</div>
            <div class="kpi-label">معدل البحوث لكل عضو</div>
        </div>
        <div class="kpi-card orange">
            <div class="kpi-icon">📈</div>
            <div class="kpi-value">${kpis.citationsPerMember}</div>
            <div class="kpi-label">معدل الاقتباسات لكل عضو</div>
        </div>
        <div class="kpi-card purple">
            <div class="kpi-icon">🎓</div>
            <div class="kpi-value">${kpis.studentPubRate}%</div>
            <div class="kpi-label">نسبة نشر الطلاب</div>
        </div>
        <div class="kpi-card gold">
            <div class="kpi-icon">🏆</div>
            <div class="kpi-value">${kpis.innovationCount}</div>
            <div class="kpi-label">الجوائز وبراءات الاختراع</div>
        </div>
    `;
    
    // الإحصائيات العامة
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${kpis.totalFaculty}</div>
            <div class="stat-label">أعضاء هيئة التدريس</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${kpis.totalPublications}</div>
            <div class="stat-label">بحث منشور</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${kpis.completedTheses}/${kpis.totalTheses}</div>
            <div class="stat-label">رسائل منجزة</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${kpis.totalConferences}</div>
            <div class="stat-label">مؤتمر</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${kpis.totalSeminars}</div>
            <div class="stat-label">ندوة</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${kpis.totalWorkshops}</div>
            <div class="stat-label">ورشة عمل</div>
        </div>
    `;
    
    // آخر الأنشطة
    renderRecentActivities();
}

// عرض آخر الأنشطة
function renderRecentActivities() {
    const activities = [];
    
    // إضافة البحوث
    data.publications.slice(0, 3).forEach(pub => {
        activities.push({
            type: 'publication',
            icon: '📝',
            title: pub.title,
            meta: getMembersNames(pub.authors_ids).join('، '),
            date: pub.publish_date
        });
    });
    
    // إضافة الفعاليات
    data.events.slice(0, 3).forEach(event => {
        activities.push({
            type: 'event',
            icon: event.type === 'مؤتمر' ? '🎤' : event.type === 'ندوة' ? '💬' : '🛠️',
            title: event.name,
            meta: event.location,
            date: event.date
        });
    });
    
    // ترتيب حسب التاريخ
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    document.getElementById('recentActivities').innerHTML = activities.slice(0, 5).map(act => `
        <div class="recent-item">
            <div class="recent-icon">${act.icon}</div>
            <div class="recent-info">
                <div class="recent-title">${act.title}</div>
                <div class="recent-meta">${act.meta}</div>
            </div>
            <div class="recent-date">${formatDate(act.date)}</div>
        </div>
    `).join('') || '<div class="empty-state"><div class="empty-state-icon">📭</div><p>لا توجد أنشطة حديثة</p></div>';
}

// ========================================
// عرض الرسائل العلمية
// ========================================
function renderTheses(typeFilter = 'all', statusFilter = 'all') {
    let filtered = [...data.theses];
    
    if (typeFilter !== 'all') {
        filtered = filtered.filter(t => t.type === typeFilter);
    }
    if (statusFilter !== 'all') {
        filtered = filtered.filter(t => t.status === statusFilter);
    }
    
    const tbody = document.querySelector('#thesesTable tbody');
    tbody.innerHTML = filtered.map((thesis, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td><span class="type-badge ${thesis.type === 'دكتوراه' ? 'phd' : 'masters'}">${thesis.type}</span></td>
            <td>${thesis.specialization}</td>
            <td>${thesis.student_name}</td>
            <td>${thesis.title}</td>
            <td>${getMemberName(thesis.supervisor_id)}</td>
            <td><span class="status-badge ${thesis.status === 'منجزة' ? 'completed' : 'ongoing'}">${thesis.status}</span></td>
            <td>${thesis.defense_date ? formatDate(thesis.defense_date) : '-'}</td>
        </tr>
    `).join('') || '<tr><td colspan="8" class="empty-state">لا توجد رسائل مسجلة</td></tr>';
}

// ========================================
// عرض البحوث المنشورة
// ========================================
function renderPublications(searchTerm = '', citationsFilter = 'all') {
    let filtered = [...data.publications];
    
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(p => 
            p.title.toLowerCase().includes(term) ||
            p.journal.toLowerCase().includes(term)
        );
    }
    
    if (citationsFilter !== 'all') {
        filtered = filtered.filter(p => p.citations_range === citationsFilter);
    }
    
    document.getElementById('publicationsGrid').innerHTML = filtered.map(pub => `
        <div class="publication-card">
            <div class="pub-title">${pub.title}</div>
            <div class="pub-authors">
                ${getMembersNames(pub.authors_ids).map(name => `<span class="pub-author">${name}</span>`).join('')}
            </div>
            <div class="pub-journal">📰 ${pub.journal}</div>
            <div class="pub-meta">
                <span class="pub-date">${formatDate(pub.publish_date)}</span>
                <span class="pub-citations">${pub.citations_range} اقتباس</span>
            </div>
        </div>
    `).join('') || '<div class="empty-state"><div class="empty-state-icon">📭</div><p>لا توجد بحوث منشورة</p></div>';
}

// ========================================
// عرض الفعاليات
// ========================================
function renderEvents(typeFilter = 'all', participationFilter = 'all') {
    let filtered = [...data.events];
    
    if (typeFilter !== 'all') {
        filtered = filtered.filter(e => e.type === typeFilter);
    }
    if (participationFilter !== 'all') {
        filtered = filtered.filter(e => e.participation_type === participationFilter);
    }
    
    // ترتيب حسب التاريخ
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    document.getElementById('eventsTimeline').innerHTML = filtered.map(event => {
        const dateInfo = formatShortDate(event.date);
        const typeClass = event.type === 'مؤتمر' ? 'conference' : event.type === 'ندوة' ? 'seminar' : 'workshop';
        
        return `
            <div class="event-card ${typeClass}">
                <div class="event-date-box">
                    <div class="event-day">${dateInfo.day}</div>
                    <div class="event-month">${dateInfo.month}</div>
                </div>
                <div class="event-info">
                    <span class="event-type ${typeClass}">${event.type}</span>
                    <div class="event-title">${event.name}</div>
                    <div class="event-location">📍 ${event.location}</div>
                    <div class="event-participants">
                        ${getMembersNames(event.participant_ids).map(name => `<span class="participant-tag">${name}</span>`).join('')}
                        <span class="participation-type">${event.participation_type}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('') || '<div class="empty-state"><div class="empty-state-icon">📭</div><p>لا توجد فعاليات مسجلة</p></div>';
}

// ========================================
// عرض الجوائز
// ========================================
function renderAwards() {
    document.getElementById('awardsGrid').innerHTML = data.awards.map(award => `
        <div class="award-card ${award.type === 'براءة اختراع' ? 'patent' : 'award'}">
            <div class="award-icon">${award.type === 'براءة اختراع' ? '💡' : '🏆'}</div>
            <div class="award-name">${award.name}</div>
            <div class="award-body">${award.granting_body}</div>
            <div class="award-recipient">${getMemberName(award.recipient_id)}</div>
            <div class="award-date">${formatDate(award.date)}</div>
        </div>
    `).join('') || '<div class="empty-state"><div class="empty-state-icon">🏆</div><p>لا توجد جوائز مسجلة</p></div>';
}

// ========================================
// عرض المتصدرين
// ========================================
function renderLeaderboard() {
    const leaderboard = getLeaderboard();
    const top3 = leaderboard.slice(0, 3);
    
    // المنصة
    const podiumOrder = [1, 0, 2]; // ثاني، أول، ثالث
    document.getElementById('podium').innerHTML = podiumOrder.map(idx => {
        const member = top3[idx];
        if (!member) return '';
        
        const placeClass = idx === 0 ? 'first' : idx === 1 ? 'second' : 'third';
        const placeNum = idx + 1;
        
        return `
            <div class="podium-place ${placeClass}">
                <div class="podium-avatar">👤</div>
                <div class="podium-name">${member.name}</div>
                <div class="podium-points">${member.points} نقطة</div>
                <div class="podium-stand">${placeNum}</div>
            </div>
        `;
    }).join('');
    
    // جدول الترتيب
    const tbody = document.querySelector('#leaderboardTable tbody');
    tbody.innerHTML = leaderboard.map((member, idx) => {
        const rank = idx + 1;
        let rankClass = 'normal';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';
        
        return `
            <tr>
                <td><span class="rank-badge ${rankClass}">${rank}</span></td>
                <td>
                    <div class="member-name">${member.name}</div>
                </td>
                <td><span class="member-rank">${member.rank}</span></td>
                <td><span class="points-value">${member.points}</span></td>
                <td>${member.publications}</td>
                <td>${member.supervision}</td>
                <td>${member.events}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="7" class="empty-state">لا توجد بيانات</td></tr>';
}

// ========================================
// معالجات الأحداث
// ========================================

// تبديل التبويبات
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // إزالة active من كل الأزرار والمحتوى
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // إضافة active للزر والمحتوى المختار
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
}

// تغيير السنة
function setupYearSelector() {
    document.getElementById('yearSelect').addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        loadYearData(currentYear);
    });
}

// فلاتر الرسائل
function setupThesesFilters() {
    const typeFilter = document.getElementById('thesesTypeFilter');
    const statusFilter = document.getElementById('thesesStatusFilter');
    
    const applyFilters = () => {
        renderTheses(typeFilter.value, statusFilter.value);
    };
    
    typeFilter.addEventListener('change', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
}

// فلاتر البحوث
function setupPublicationsFilters() {
    const searchInput = document.getElementById('pubSearchInput');
    const citationsFilter = document.getElementById('pubCitationsFilter');
    
    const applyFilters = () => {
        renderPublications(searchInput.value, citationsFilter.value);
    };
    
    searchInput.addEventListener('input', applyFilters);
    citationsFilter.addEventListener('change', applyFilters);
}

// فلاتر الفعاليات
function setupEventsFilters() {
    const typeFilter = document.getElementById('eventsTypeFilter');
    const participationFilter = document.getElementById('eventsParticipationFilter');
    
    const applyFilters = () => {
        renderEvents(typeFilter.value, participationFilter.value);
    };
    
    typeFilter.addEventListener('change', applyFilters);
    participationFilter.addEventListener('change', applyFilters);
}

// ========================================
// التهيئة
// ========================================
async function init() {
    // تعيين السنة الحالية في الفوتر
    document.getElementById('currentYear').textContent = new Date().getFullYear();
    
    // إعداد معالجات الأحداث
    setupTabs();
    setupYearSelector();
    setupThesesFilters();
    setupPublicationsFilters();
    setupEventsFilters();
    
    // تحميل الإعدادات والبيانات
    await loadConfig();
    await loadYearData(currentYear);
}

// بدء التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', init);
