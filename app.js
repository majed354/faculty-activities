// ========================================
// نظام الأنشطة العلمية - قسم القراءات
// JavaScript Application
// ========================================

// ========================================
// المتغيرات العامة
// ========================================
let config = {};
let currentYear = 1446;
let allData = {
    faculty: [],
    students: [],
    theses: [],
    publications: [],
    events: [],
    awards: []
};
let data = {
    faculty: [],
    students: [],
    theses: [],
    publications: [],
    events: [],
    awards: []
};
let charts = {};

// تحديد مسار البيانات
const DATA_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? './data'
    : 'https://raw.githubusercontent.com/YOUR_USERNAME/faculty-activities/main/data';

// ========================================
// دوال التحميل
// ========================================
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

async function loadCSV(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        return result.data;
    } catch (error) {
        console.warn(`Failed to load ${url}:`, error);
        return [];
    }
}

async function loadConfig() {
    try {
        const response = await fetch(`${DATA_BASE_URL}/config.json`);
        config = await response.json();
        currentYear = config.current_year || 1446;
    } catch (error) {
        console.warn('Using default config');
        config = {
            current_year: 1446,
            available_years: [1446, 1447],
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
                event_attendance: 1,
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
        currentYear = 1446;
    }
}

async function loadAllData() {
    showLoading();
    
    const [faculty, students, theses, publications, events, awards] = await Promise.all([
        loadCSV(`${DATA_BASE_URL}/faculty.csv`),
        loadCSV(`${DATA_BASE_URL}/students_count.csv`),
        loadCSV(`${DATA_BASE_URL}/theses.csv`),
        loadCSV(`${DATA_BASE_URL}/publications.csv`),
        loadCSV(`${DATA_BASE_URL}/events.csv`),
        loadCSV(`${DATA_BASE_URL}/awards.csv`)
    ]);
    
    allData = { faculty, students, theses, publications, events, awards };
    
    await loadYearData(currentYear);
}

async function loadYearData(year) {
    // فلترة البيانات حسب السنة المختارة
    data.faculty = allData.faculty;
    data.students = allData.students.filter(s => parseInt(s.year) === year);
    data.theses = allData.theses.filter(t => parseInt(t.year) === year);
    data.publications = allData.publications.filter(p => parseInt(p.year) === year);
    data.events = allData.events.filter(e => parseInt(e.year) === year);
    data.awards = allData.awards.filter(a => parseInt(a.year) === year);
    
    hideLoading();
    renderAll();
}

// ========================================
// دوال مساعدة
// ========================================
function getMemberName(id) {
    const member = data.faculty.find(f => f.id === String(id));
    return member ? member.name : '-';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA-u-ca-islamic', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

function formatDateShort(dateStr) {
    if (!dateStr) return { day: '-', month: '-' };
    const date = new Date(dateStr);
    const day = date.getDate();
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return { day, month: months[date.getMonth()] };
}

function getCitationsEstimate(range) {
    return config.citations_ranges?.[range] || 5;
}

// ========================================
// حساب النقاط
// ========================================
function calculateMemberPoints(memberId) {
    const weights = config.weights || {};
    let points = 0;
    const breakdown = {};
    
    // البحوث
    const pubs = data.publications.filter(p => {
        const authors = (p.authors_ids || '').split('|');
        return authors.includes(String(memberId));
    });
    breakdown.publications = pubs.length;
    points += pubs.length * (weights.publication || 15);
    
    // الإشراف على الدكتوراه
    const phdSupervised = data.theses.filter(t => 
        t.type === 'دكتوراه' && t.supervisor_id === String(memberId)
    );
    breakdown.phdSupervision = phdSupervised.length;
    points += phdSupervised.length * (weights.phd_supervision || 10);
    
    // الإشراف المشارك على الدكتوراه
    const phdCoSupervised = data.theses.filter(t => 
        t.type === 'دكتوراه' && t.co_supervisor_id === String(memberId)
    );
    breakdown.phdCoSupervision = phdCoSupervised.length;
    points += phdCoSupervised.length * (weights.phd_co_supervision || 5);
    
    // الإشراف على الماجستير
    const mastersSupervised = data.theses.filter(t => 
        t.type === 'ماجستير' && t.supervisor_id === String(memberId)
    );
    breakdown.mastersSupervision = mastersSupervised.length;
    points += mastersSupervised.length * (weights.masters_supervision || 3);
    
    // الإشراف المشارك على الماجستير
    const mastersCoSupervised = data.theses.filter(t => 
        t.type === 'ماجستير' && t.co_supervisor_id === String(memberId)
    );
    breakdown.mastersCoSupervision = mastersCoSupervised.length;
    points += mastersCoSupervised.length * (weights.masters_co_supervision || 2);
    
    // مناقشة الرسائل
    const phdExamined = data.theses.filter(t => 
        t.type === 'دكتوراه' && (t.examiner1_id === String(memberId) || t.examiner2_id === String(memberId))
    );
    breakdown.phdDiscussion = phdExamined.length;
    points += phdExamined.length * (weights.phd_discussion || 5);
    
    const mastersExamined = data.theses.filter(t => 
        t.type === 'ماجستير' && (t.examiner1_id === String(memberId) || t.examiner2_id === String(memberId))
    );
    breakdown.mastersDiscussion = mastersExamined.length;
    points += mastersExamined.length * (weights.masters_discussion || 2);
    
    // المشاركة في الفعاليات
    data.events.forEach(e => {
        const participants = (e.participant_ids || '').split('|');
        if (participants.includes(String(memberId))) {
            if (e.type === 'مؤتمر' && e.participation_type === 'مشاركة بورقة') {
                breakdown.conferencePaper = (breakdown.conferencePaper || 0) + 1;
                points += weights.conference_paper || 8;
            } else if (e.type === 'ورشة') {
                breakdown.workshop = (breakdown.workshop || 0) + 1;
                points += weights.workshop_participation || 5;
            } else {
                breakdown.eventAttendance = (breakdown.eventAttendance || 0) + 1;
                points += weights.event_attendance || 1;
            }
        }
    });
    
    // الجوائز
    const memberAwards = data.awards.filter(a => a.recipient_id === String(memberId));
    memberAwards.forEach(a => {
        if (a.type === 'براءة اختراع') {
            breakdown.patent = (breakdown.patent || 0) + 1;
            points += weights.patent || 15;
        } else {
            breakdown.award = (breakdown.award || 0) + 1;
            points += weights.award || 10;
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
function calculateKPIs() {
    const activeMembers = data.faculty.filter(f => f.active === 'نعم');
    const totalMembers = activeMembers.length;
    
    if (totalMembers === 0) return null;
    
    // نسبة النشر العلمي
    const publishingMembers = new Set();
    data.publications.forEach(p => {
        const authors = (p.authors_ids || '').split('|');
        authors.forEach(id => publishingMembers.add(id));
    });
    const publishingRate = (publishingMembers.size / totalMembers) * 100;
    
    // معدل البحوث لكل عضو
    const pubPerMember = data.publications.length / totalMembers;
    
    // معدل الاقتباسات
    let totalCitations = 0;
    data.publications.forEach(p => {
        totalCitations += getCitationsEstimate(p.citations_range);
    });
    const citationsPerMember = totalCitations / totalMembers;
    
    // نسبة نشر الطلاب
    const studentPubs = data.publications.filter(p => p.student_author === 'نعم').length;
    const totalStudents = data.students.reduce((sum, s) => sum + parseInt(s.count || 0), 0);
    const studentPubRate = totalStudents > 0 ? (studentPubs / totalStudents) * 100 : 0;
    
    // معدل الإشراف
    const supervisionRate = data.theses.length / totalMembers;
    const phdCount = data.theses.filter(t => t.type === 'دكتوراه').length;
    const mastersCount = data.theses.filter(t => t.type === 'ماجستير').length;
    
    // الابتكار والتميز
    const awards = data.awards.filter(a => a.type === 'جائزة').length;
    const patents = data.awards.filter(a => a.type === 'براءة اختراع').length;
    const innovation = awards + patents;
    
    return {
        publishingRate: publishingRate.toFixed(1),
        pubPerMember: pubPerMember.toFixed(1),
        citationsPerMember: citationsPerMember.toFixed(1),
        studentPubRate: studentPubRate.toFixed(1),
        supervisionRate: supervisionRate.toFixed(1),
        phdCount,
        mastersCount,
        innovation,
        awards,
        patents
    };
}

// ========================================
// جمع آخر النشاطات
// ========================================
function getRecentActivities(limit = 10) {
    const activities = [];
    
    // البحوث
    data.publications.forEach(p => {
        activities.push({
            type: 'publication',
            icon: '📄',
            title: p.title,
            meta: p.journal,
            date: p.publish_date,
            dateObj: new Date(p.publish_date)
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
            dateObj: new Date(t.defense_date)
        });
    });
    
    // الفعاليات
    data.events.forEach(e => {
        activities.push({
            type: 'event',
            icon: e.type === 'مؤتمر' ? '🎤' : e.type === 'ندوة' ? '💬' : '🛠️',
            title: e.name,
            meta: `${e.type} - ${e.location}`,
            date: e.date,
            dateObj: new Date(e.date)
        });
    });
    
    // الجوائز
    data.awards.forEach(a => {
        activities.push({
            type: 'award',
            icon: a.type === 'براءة اختراع' ? '💡' : '🏆',
            title: a.name,
            meta: getMemberName(a.recipient_id),
            date: a.date,
            dateObj: new Date(a.date)
        });
    });
    
    // ترتيب حسب التاريخ (الأحدث أولاً)
    activities.sort((a, b) => b.dateObj - a.dateObj);
    
    return activities.slice(0, limit);
}

// ========================================
// دوال العرض
// ========================================
function populateYearSelector() {
    const select = document.getElementById('yearSelect');
    select.innerHTML = '';
    
    (config.available_years || [1446]).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year + 'هـ';
        if (year === currentYear) option.selected = true;
        select.appendChild(option);
    });
}

function renderDashboard() {
    // الإحصائيات السريعة
    document.getElementById('totalFaculty').textContent = data.faculty.filter(f => f.active === 'نعم').length;
    document.getElementById('totalPublications').textContent = data.publications.length;
    document.getElementById('totalTheses').textContent = data.theses.length;
    document.getElementById('totalEvents').textContent = data.events.length;
    
    // المتصدرون
    renderLeaderboard();
    
    // آخر النشاطات
    renderActivities();
    
    // الرسوم البيانية
    renderDashboardCharts();
}

function renderLeaderboard() {
    const leaderboard = getLeaderboard();
    
    // المنصة (أول 3)
    if (leaderboard[0]) {
        document.getElementById('first-name').textContent = leaderboard[0].name.replace('د. ', '').split(' ').slice(0, 2).join(' ');
        document.getElementById('first-points').textContent = leaderboard[0].points + ' نقطة';
    }
    if (leaderboard[1]) {
        document.getElementById('second-name').textContent = leaderboard[1].name.replace('د. ', '').split(' ').slice(0, 2).join(' ');
        document.getElementById('second-points').textContent = leaderboard[1].points + ' نقطة';
    }
    if (leaderboard[2]) {
        document.getElementById('third-name').textContent = leaderboard[2].name.replace('د. ', '').split(' ').slice(0, 2).join(' ');
        document.getElementById('third-points').textContent = leaderboard[2].points + ' نقطة';
    }
    
    // القائمة (4 فما بعد)
    const listContainer = document.getElementById('leaderboardList');
    listContainer.innerHTML = '';
    
    leaderboard.slice(3, 8).forEach((member, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span class="leaderboard-rank">${index + 4}</span>
            <span class="leaderboard-name">${member.name}</span>
            <span class="leaderboard-points">${member.points} نقطة</span>
        `;
        listContainer.appendChild(item);
    });
}

function renderActivities() {
    const activities = getRecentActivities(10);
    const container = document.getElementById('activitiesTimeline');
    container.innerHTML = '';
    
    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = `activity-item ${activity.type}`;
        item.innerHTML = `
            <span class="activity-icon">${activity.icon}</span>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-meta">${activity.meta}</div>
                <div class="activity-date">${formatDate(activity.date)}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

function renderDashboardCharts() {
    // رسم بياني للبحوث
    const pubCtx = document.getElementById('publicationsChart');
    if (pubCtx) {
        if (charts.publications) charts.publications.destroy();
        
        const monthlyPubs = new Array(12).fill(0);
        data.publications.forEach(p => {
            if (p.publish_date) {
                const month = new Date(p.publish_date).getMonth();
                monthlyPubs[month]++;
            }
        });
        
        charts.publications = new Chart(pubCtx, {
            type: 'bar',
            data: {
                labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
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
                plugins: {
                    legend: { display: false }
                },
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
    
    // رسم بياني للرسائل
    const thesesCtx = document.getElementById('thesesChart');
    if (thesesCtx) {
        if (charts.theses) charts.theses.destroy();
        
        const phdCompleted = data.theses.filter(t => t.type === 'دكتوراه' && t.status === 'منجزة').length;
        const phdOngoing = data.theses.filter(t => t.type === 'دكتوراه' && t.status === 'جارية').length;
        const mastersCompleted = data.theses.filter(t => t.type === 'ماجستير' && t.status === 'منجزة').length;
        const mastersOngoing = data.theses.filter(t => t.type === 'ماجستير' && t.status === 'جارية').length;
        
        charts.theses = new Chart(thesesCtx, {
            type: 'doughnut',
            data: {
                labels: ['دكتوراه منجزة', 'دكتوراه جارية', 'ماجستير منجزة', 'ماجستير جارية'],
                datasets: [{
                    data: [phdCompleted, phdOngoing, mastersCompleted, mastersOngoing],
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
    
    // نسبة النشر
    document.getElementById('kpiPublishingRate').textContent = kpis.publishingRate;
    document.getElementById('kpiPublishingRateBar').style.width = kpis.publishingRate + '%';
    
    // معدل البحوث
    document.getElementById('kpiPubPerMember').textContent = kpis.pubPerMember;
    const gaugeWidth = Math.min(parseFloat(kpis.pubPerMember) * 33, 100);
    document.getElementById('kpiPubPerMemberGauge').style.width = gaugeWidth + '%';
    
    // الاقتباسات
    document.getElementById('kpiCitations').textContent = kpis.citationsPerMember;
    
    // رسم مصغر للاقتباسات
    const miniChart = document.getElementById('kpiCitationsMini');
    miniChart.innerHTML = '';
    const heights = [30, 50, 70, 40, 80, 60, 90];
    heights.forEach(h => {
        const bar = document.createElement('div');
        bar.className = 'kpi-mini-bar';
        bar.style.height = h + '%';
        miniChart.appendChild(bar);
    });
    
    // نسبة نشر الطلاب
    document.getElementById('kpiStudentPub').textContent = kpis.studentPubRate;
    document.getElementById('kpiStudentPubBar').style.width = Math.min(parseFloat(kpis.studentPubRate) * 10, 100) + '%';
    
    // معدل الإشراف
    document.getElementById('kpiSupervision').textContent = kpis.supervisionRate;
    document.getElementById('kpiPhdCount').textContent = kpis.phdCount;
    document.getElementById('kpiMastersCount').textContent = kpis.mastersCount;
    
    const maxTheses = Math.max(kpis.phdCount, kpis.mastersCount, 1);
    document.getElementById('kpiPhdBar').style.width = (kpis.phdCount / maxTheses * 100) + '%';
    document.getElementById('kpiMastersBar').style.width = (kpis.mastersCount / maxTheses * 100) + '%';
    
    // الابتكار
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
    
    // رسم الرادار
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
                    Math.min(parseFloat(kpis.citationsPerMember), 100),
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
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderTheses() {
    const tbody = document.getElementById('thesesTableBody');
    tbody.innerHTML = '';
    
    const typeFilter = document.getElementById('thesesTypeFilter').value;
    const statusFilter = document.getElementById('thesesStatusFilter').value;
    
    let filtered = data.theses;
    if (typeFilter) filtered = filtered.filter(t => t.type === typeFilter);
    if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
    
    filtered.forEach(thesis => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge badge-${thesis.type === 'دكتوراه' ? 'phd' : 'masters'}">${thesis.type}</span></td>
            <td>${thesis.student_name}</td>
            <td>${thesis.title}</td>
            <td>${getMemberName(thesis.supervisor_id)}</td>
            <td><span class="badge badge-${thesis.status === 'منجزة' ? 'completed' : 'ongoing'}">${thesis.status}</span></td>
            <td>${formatDate(thesis.defense_date)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderPublications() {
    const container = document.getElementById('publicationsGrid');
    container.innerHTML = '';
    
    const searchTerm = document.getElementById('pubSearch').value.toLowerCase();
    const citationsFilter = document.getElementById('pubCitationsFilter').value;
    
    let filtered = data.publications;
    if (searchTerm) filtered = filtered.filter(p => p.title.toLowerCase().includes(searchTerm));
    if (citationsFilter) filtered = filtered.filter(p => p.citations_range === citationsFilter);
    
    filtered.forEach(pub => {
        const authors = (pub.authors_ids || '').split('|').map(id => getMemberName(id));
        
        const card = document.createElement('div');
        card.className = 'publication-card';
        card.innerHTML = `
            <div class="publication-title">${pub.title}</div>
            <div class="publication-journal">${pub.journal}</div>
            <div class="publication-authors">
                ${authors.map(a => `<span class="author-tag">${a}</span>`).join('')}
            </div>
            <div class="publication-meta">
                <span class="publication-date">${formatDate(pub.publish_date)}</span>
                <span class="publication-citations">${pub.citations_range}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderEvents() {
    const container = document.getElementById('eventsGrid');
    container.innerHTML = '';
    
    const typeFilter = document.getElementById('eventsTypeFilter').value;
    
    let filtered = data.events;
    if (typeFilter) filtered = filtered.filter(e => e.type === typeFilter);
    
    filtered.forEach(event => {
        const dateInfo = formatDateShort(event.date);
        const typeClass = event.type === 'مؤتمر' ? 'conference' : event.type === 'ندوة' ? 'seminar' : 'workshop';
        
        const card = document.createElement('div');
        card.className = `event-card ${typeClass}`;
        card.innerHTML = `
            <div class="event-header">
                <span class="event-type">${event.type}</span>
                <div class="event-date-box">
                    <div class="event-day">${dateInfo.day}</div>
                    <div class="event-month">${dateInfo.month}</div>
                </div>
            </div>
            <div class="event-body">
                <div class="event-name">${event.name}</div>
                <div class="event-location">📍 ${event.location}</div>
                <div class="event-participation">${event.participation_type}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderAwards() {
    const container = document.getElementById('awardsShowcase');
    container.innerHTML = '';
    
    data.awards.forEach(award => {
        const card = document.createElement('div');
        card.className = 'award-card';
        card.innerHTML = `
            <div class="award-icon">${award.type === 'براءة اختراع' ? '💡' : '🏆'}</div>
            <div class="award-type">${award.type}</div>
            <div class="award-name">${award.name}</div>
            <div class="award-recipient">${getMemberName(award.recipient_id)}</div>
            <div class="award-granter">${award.granting_body}</div>
            <div class="award-date">${formatDate(award.date)}</div>
        `;
        container.appendChild(card);
    });
}

function renderAll() {
    renderDashboard();
    renderQualityIndicators();
    renderTheses();
    renderPublications();
    renderEvents();
    renderAwards();
}

// ========================================
// التنقل بين التبويبات
// ========================================
function setupTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // تحديث الأزرار
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // تحديث المحتوى
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function setupFilters() {
    // فلاتر الرسائل
    document.getElementById('thesesTypeFilter').addEventListener('change', renderTheses);
    document.getElementById('thesesStatusFilter').addEventListener('change', renderTheses);
    
    // فلاتر البحوث
    document.getElementById('pubSearch').addEventListener('input', renderPublications);
    document.getElementById('pubCitationsFilter').addEventListener('change', renderPublications);
    
    // فلاتر الفعاليات
    document.getElementById('eventsTypeFilter').addEventListener('change', renderEvents);
}

function setupYearSelector() {
    document.getElementById('yearSelect').addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        loadYearData(currentYear);
    });
}

// ========================================
// التهيئة
// ========================================
async function init() {
    // تعيين السنة الهجرية في الفوتر
    const hijriYear = new Date().toLocaleDateString('ar-SA-u-ca-islamic', { year: 'numeric' }).replace(/[^0-9]/g, '');
    document.getElementById('currentYear').textContent = hijriYear;
    
    // تحميل الإعدادات والبيانات
    await loadConfig();
    populateYearSelector();
    setupTabs();
    setupFilters();
    setupYearSelector();
    await loadAllData();
}

// بدء التطبيق
document.addEventListener('DOMContentLoaded', init);
