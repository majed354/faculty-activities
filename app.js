// ========================================
// نظام الأنشطة العلمية - قسم القراءات
// JavaScript Application - النسخة المحدثة
// ========================================

// ========================================
// المتغيرات العامة
// ========================================
let config = {};
let currentYear = 1446;
let currentThesis = null;
let allData = {
    faculty: [],
    students: [],
    theses: [],
    participations: []
};
let data = {
    faculty: [],
    students: [],
    theses: [],
    participations: []
};
let charts = {};

// تحديد مسار البيانات
const DATA_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? './data'
    : 'https://raw.githubusercontent.com/majed354/faculty-activities/main/data';

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
    try {
        const response = await fetch(`${DATA_BASE_URL}/config.json`);
        config = await response.json();
        currentYear = config.current_year || 1446;
    } catch (error) {
        console.warn('Using default config');
        config = {
            current_year: 1446,
            available_years: [1445, 1446, 1447],
            department_name: "قسم القراءات",
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
        currentYear = 1446;
    }
}

async function loadAllData() {
    showLoading();
    
    const [faculty, students, theses, participations] = await Promise.all([
        loadCSV(`${DATA_BASE_URL}/faculty.csv`),
        loadCSV(`${DATA_BASE_URL}/students_count.csv`),
        loadCSV(`${DATA_BASE_URL}/theses.csv`),
        loadCSV(`${DATA_BASE_URL}/participations.csv`)
    ]);
    
    allData = { faculty, students, theses, participations };
    
    await loadYearData(currentYear);
}

async function loadYearData(year) {
    data.faculty = allData.faculty.filter(f => parseInt(f.year) === year);
    data.students = allData.students.filter(s => parseInt(s.year) === year);
    data.theses = allData.theses.filter(t => parseInt(t.year) === year);
    data.participations = allData.participations.filter(p => parseInt(p.year) === year);
    
    hideLoading();
    renderAll();
}

// ========================================
// دوال مساعدة
// ========================================
function getMemberName(id) {
    let member = data.faculty.find(f => f.id === String(id));
    if (!member) {
        member = allData.faculty.find(f => f.id === String(id));
    }
    return member ? member.name : '-';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const hijriMonths = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
    
    let day, month, year;
    
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        day = parseInt(parts[0]);
        month = parseInt(parts[1]);
        year = parseInt(parts[2]);
    } else if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts[0].length === 4) {
            year = parseInt(parts[0]);
            month = parseInt(parts[1]);
            day = parseInt(parts[2]);
        } else {
            day = parseInt(parts[0]);
            month = parseInt(parts[1]);
            year = parseInt(parts[2]);
        }
    } else {
        return dateStr;
    }
    
    if (year < 2000) {
        return `${day} ${hijriMonths[month - 1]} ${year}هـ`;
    }
    
    const gregorianDate = new Date(year, month - 1, day);
    const hijriDate = gregorianDate.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'numeric', 
        year: 'numeric'
    });
    const hijriParts = hijriDate.match(/(\d+)/g);
    if (hijriParts && hijriParts.length >= 3) {
        day = parseInt(hijriParts[0]);
        month = parseInt(hijriParts[1]);
        year = parseInt(hijriParts[2]);
    }
    
    return `${day} ${hijriMonths[month - 1]} ${year}هـ`;
}

function formatDateShort(dateStr) {
    if (!dateStr) return { day: '-', month: '-' };
    
    const hijriMonths = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
    
    let day, month;
    
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts[0].length === 4) {
            month = parseInt(parts[1]);
            day = parseInt(parts[2]);
        } else {
            day = parseInt(parts[0]);
            month = parseInt(parts[1]);
        }
    } else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        day = parseInt(parts[0]);
        month = parseInt(parts[1]);
    }
    
    return { day: day || '-', month: hijriMonths[month - 1] || '-' };
}

function getCitationsEstimate(range) {
    return config.citations_ranges?.[range] || 5;
}

// ========================================
// دوال استخراج البيانات من participations
// ========================================
function getPublications() {
    return data.participations.filter(p => p.category === 'بحث منشور' || p.category === 'بحوث الطلاب');
}

function getEvents() {
    return data.participations.filter(p => 
        p.category === 'مؤتمر' || 
        p.category === 'ندوة' || 
        p.category === 'ورشة عمل' ||
        p.category === 'مناقشة علمية خارجية'
    );
}

function getAwards() {
    return data.participations.filter(p => p.category === 'جائزة' || p.category === 'براءة اختراع');
}

// ========================================
// حساب النقاط
// ========================================
function calculateMemberPoints(memberId) {
    const weights = config.weights || {};
    let points = 0;
    const breakdown = {};
    
    // البحوث من participations
    const pubs = data.participations.filter(p => {
        if (p.category !== 'بحث منشور' && p.category !== 'بحوث الطلاب') return false;
        const participants = (p.participant_ids || '').split('|');
        return participants.includes(String(memberId));
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
    
    // مناقشة رسائل الدكتوراه (داخلية)
    const phdExamined = data.theses.filter(t => 
        t.type === 'دكتوراه' && (t.examiner1_id === String(memberId) || t.examiner2_id === String(memberId))
    );
    breakdown.phdDiscussion = phdExamined.length;
    points += phdExamined.length * (weights.phd_discussion || 5);
    
    // مناقشة رسائل الماجستير (داخلية)
    const mastersExamined = data.theses.filter(t => 
        t.type === 'ماجستير' && (t.examiner1_id === String(memberId) || t.examiner2_id === String(memberId))
    );
    breakdown.mastersDiscussion = mastersExamined.length;
    points += mastersExamined.length * (weights.masters_discussion || 2);
    
    // المشاركات العلمية من participations
    data.participations.forEach(p => {
        const participants = (p.participant_ids || '').split('|');
        if (!participants.includes(String(memberId))) return;
        
        switch(p.category) {
            case 'مؤتمر':
                if (p.participation_type === 'مشاركة بورقة' || p.participation_type === 'نشر') {
                    breakdown.conferencePaper = (breakdown.conferencePaper || 0) + 1;
                    points += weights.conference_paper || 8;
                } else if (p.participation_type === 'تنظيم') {
                    breakdown.eventOrganization = (breakdown.eventOrganization || 0) + 1;
                    points += weights.event_organization || 10;
                } else if (p.participation_type === 'حضور') {
                    breakdown.eventAttendance = (breakdown.eventAttendance || 0) + 1;
                    points += weights.event_attendance || 1;
                } else {
                    breakdown.conferencePaper = (breakdown.conferencePaper || 0) + 1;
                    points += weights.conference_paper || 8;
                }
                break;
                
            case 'ندوة':
                if (p.participation_type === 'تنظيم') {
                    breakdown.eventOrganization = (breakdown.eventOrganization || 0) + 1;
                    points += weights.event_organization || 10;
                } else if (p.participation_type === 'حضور') {
                    breakdown.eventAttendance = (breakdown.eventAttendance || 0) + 1;
                    points += weights.event_attendance || 1;
                } else {
                    breakdown.seminar = (breakdown.seminar || 0) + 1;
                    points += weights.seminar_participation || 4;
                }
                break;
                
            case 'ورشة عمل':
                if (p.participation_type === 'تنظيم') {
                    breakdown.eventOrganization = (breakdown.eventOrganization || 0) + 1;
                    points += weights.event_organization || 10;
                } else if (p.participation_type === 'حضور') {
                    breakdown.eventAttendance = (breakdown.eventAttendance || 0) + 1;
                    points += weights.event_attendance || 1;
                } else {
                    breakdown.workshop = (breakdown.workshop || 0) + 1;
                    points += weights.workshop_participation || 5;
                }
                break;
                
            case 'مناقشة علمية خارجية':
                breakdown.externalDiscussion = (breakdown.externalDiscussion || 0) + 1;
                points += weights.external_discussion || 6;
                break;
                
            case 'جائزة':
                breakdown.award = (breakdown.award || 0) + 1;
                points += weights.award || 10;
                break;
                
            case 'براءة اختراع':
                breakdown.patent = (breakdown.patent || 0) + 1;
                points += weights.patent || 15;
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
function calculateKPIs() {
    const activeMembers = data.faculty.filter(f => f.active === 'نعم');
    const totalMembers = activeMembers.length;
    
    if (totalMembers === 0) return null;
    
    const publications = getPublications();
    const awards = getAwards();
    
    const publishingMembers = new Set();
    publications.forEach(p => {
        const participants = (p.participant_ids || '').split('|');
        participants.forEach(id => publishingMembers.add(id));
    });
    const publishingRate = (publishingMembers.size / totalMembers) * 100;
    
    const pubPerMember = publications.length / totalMembers;
    
    let totalCitations = 0;
    publications.forEach(p => {
        totalCitations += getCitationsEstimate(p.citations_range);
    });
    const citationsPerMember = totalCitations / totalMembers;
    
    const studentPubs = publications.filter(p => p.student_author === 'نعم' || p.category === 'بحوث الطلاب').length;
    const totalStudents = data.students.reduce((sum, s) => sum + parseInt(s.count || 0), 0);
    const studentPubRate = totalStudents > 0 ? (studentPubs / totalStudents) * 100 : 0;
    
    const supervisionRate = data.theses.length / totalMembers;
    const phdCount = data.theses.filter(t => t.type === 'دكتوراه').length;
    const mastersCount = data.theses.filter(t => t.type === 'ماجستير').length;
    
    const awardsCount = awards.filter(a => a.category === 'جائزة').length;
    const patentsCount = awards.filter(a => a.category === 'براءة اختراع').length;
    const innovation = awardsCount + patentsCount;
    
    return {
        publishingRate: publishingRate.toFixed(1),
        pubPerMember: pubPerMember.toFixed(1),
        citationsPerMember: citationsPerMember.toFixed(1),
        studentPubRate: studentPubRate.toFixed(1),
        supervisionRate: supervisionRate.toFixed(1),
        phdCount,
        mastersCount,
        innovation,
        awards: awardsCount,
        patents: patentsCount
    };
}

// ========================================
// جمع آخر النشاطات
// ========================================
function getRecentActivities(limit = 10) {
    const activities = [];
    
    data.participations.forEach(p => {
        let icon = '📄';
        let title = p.title;
        let meta = p.location;
        
        switch(p.category) {
            case 'بحث منشور':
            case 'بحوث الطلاب':
                icon = '📄';
                meta = p.journal || p.location;
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
            case 'مناقشة علمية خارجية':
                icon = '🎓';
                break;
            case 'جائزة':
                icon = '🏆';
                meta = p.granting_body || p.location;
                break;
            case 'براءة اختراع':
                icon = '💡';
                meta = p.granting_body || p.location;
                break;
        }
        
        activities.push({
            type: p.category,
            icon,
            title,
            meta,
            date: p.date,
            dateObj: new Date(p.date?.replace(/-/g, '/') || Date.now())
        });
    });
    
    data.theses.filter(t => t.status === 'منجزة').forEach(t => {
        activities.push({
            type: 'thesis',
            icon: '🎓',
            title: `مناقشة رسالة ${t.type}: ${t.student_name}`,
            meta: getMemberName(t.supervisor_id),
            date: t.defense_date,
            dateObj: new Date(t.defense_date?.replace(/-/g, '/') || Date.now())
        });
    });
    
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
    const publications = getPublications();
    const events = getEvents();
    
    document.getElementById('totalFaculty').textContent = data.faculty.filter(f => f.active === 'نعم').length;
    document.getElementById('totalPublications').textContent = publications.length;
    document.getElementById('totalTheses').textContent = data.theses.length;
    document.getElementById('totalEvents').textContent = events.length;
    
    renderLeaderboard();
    renderActivities();
    renderDashboardCharts();
}

function renderLeaderboard() {
    const leaderboard = getLeaderboard();
    
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
        item.className = `activity-item`;
        item.innerHTML = `
            <span class="activity-icon">${activity.icon}</span>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-meta">${activity.meta || ''}</div>
                <div class="activity-date">${formatDate(activity.date)}</div>
            </div>
        `;
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
    
    document.getElementById('kpiPublishingRate').textContent = kpis.publishingRate;
    document.getElementById('kpiPublishingRateBar').style.width = kpis.publishingRate + '%';
    
    document.getElementById('kpiPubPerMember').textContent = kpis.pubPerMember;
    const gaugeWidth = Math.min(parseFloat(kpis.pubPerMember) * 33, 100);
    document.getElementById('kpiPubPerMemberGauge').style.width = gaugeWidth + '%';
    
    document.getElementById('kpiCitations').textContent = kpis.citationsPerMember;
    
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
            plugins: { legend: { display: false } }
        }
    });
}

// ========================================
// عرض الرسائل العلمية
// ========================================
function renderTheses() {
    const tbody = document.getElementById('thesesTableBody');
    tbody.innerHTML = '';
    
    const typeFilter = document.getElementById('thesesTypeFilter').value;
    const statusFilter = document.getElementById('thesesStatusFilter').value;
    const searchTerm = document.getElementById('thesesSearch')?.value?.toLowerCase() || '';
    
    let filtered = data.theses;
    
    if (searchTerm) filtered = filtered.filter(t => 
        (t.title && t.title.toLowerCase().includes(searchTerm)) || 
        (t.student_name && t.student_name.toLowerCase().includes(searchTerm)) ||
        getMemberName(t.supervisor_id).toLowerCase().includes(searchTerm)
    );
    
    if (typeFilter) {
        const [type, specialization] = typeFilter.split('-');
        filtered = filtered.filter(t => {
            const thesisType = (t.type || '').trim();
            const thesisSpec = (t.specialization || '').trim();
            return thesisType === type.trim() && thesisSpec === specialization.trim();
        });
    }
    
    if (statusFilter) filtered = filtered.filter(t => (t.status || '').trim() === statusFilter);
    
    filtered.forEach(thesis => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => showThesisDetails(thesis);
        tr.innerHTML = `
            <td><span class="badge badge-${(thesis.type || '').trim() === 'دكتوراه' ? 'phd' : 'masters'}">${thesis.type}</span></td>
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
    const modal = document.getElementById('thesisModal');
    const thesisType = (thesis.type || '').trim();
    const thesisSpec = (thesis.specialization || '').trim();
    const programName = thesisType + ' ' + (thesisSpec === 'قراءات' ? 'القراءات' : 'الدراسات القرآنية');
    
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
    
    modal.classList.add('active');
}

// ========================================
// طباعة الرسالة العلمية
// ========================================
function printThesis() {
    if (!currentThesis) return;
    
    const thesis = currentThesis;
    const thesisType = (thesis.type || '').trim();
    const thesisSpec = (thesis.specialization || '').trim();
    const programName = thesisType + ' ' + (thesisSpec === 'قراءات' ? 'القراءات' : 'الدراسات القرآنية');
    const universityName = config.university_name || 'جامعة الطائف';
    const departmentName = config.department_name || 'قسم القراءات';
    
    // تحضير أعضاء اللجنة
    const supervisor = getMemberName(thesis.supervisor_id);
    const coSupervisor = thesis.co_supervisor_id?.trim() ? getMemberName(thesis.co_supervisor_id) : null;
    const examiner1Name = getMemberName(thesis.examiner1_id);
    const examiner2Name = getMemberName(thesis.examiner2_id);
    const examiner1 = thesis.examiner1_id?.trim() && examiner1Name !== '-' ? examiner1Name : null;
    const examiner2 = thesis.examiner2_id?.trim() && examiner2Name !== '-' ? examiner2Name : null;
    
    const printContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>بيانات الرسالة العلمية - ${thesis.student_name}</title>
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
            <div class="document-title">بيانات الرسالة العلمية</div>
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
    if (e.target === modal || e.target.classList.contains('modal-close')) {
        modal.classList.remove('active');
    }
});

// ========================================
// عرض البحوث المنشورة
// ========================================
function renderPublications() {
    const container = document.getElementById('publicationsGrid');
    container.innerHTML = '';
    
    const searchTerm = document.getElementById('pubSearch')?.value?.toLowerCase() || '';
    const citationsFilter = document.getElementById('pubCitationsFilter')?.value || '';
    
    let filtered = getPublications();
    if (searchTerm) filtered = filtered.filter(p => p.title && p.title.toLowerCase().includes(searchTerm));
    if (citationsFilter) filtered = filtered.filter(p => p.citations_range === citationsFilter);
    
    filtered.forEach(pub => {
        const participants = (pub.participant_ids || '').split('|').map(id => getMemberName(id));
        
        const card = document.createElement('div');
        card.className = 'publication-card';
        card.innerHTML = `
            <div class="publication-title">${pub.title}</div>
            <div class="publication-journal">${pub.journal || pub.location}</div>
            <div class="publication-authors">
                ${participants.map(a => `<span class="author-tag">${a}</span>`).join('')}
            </div>
            <div class="publication-meta">
                <span class="publication-date">${formatDate(pub.date)}</span>
                <span class="publication-citations">${pub.citations_range || '-'}</span>
            </div>
            ${pub.student_author === 'نعم' || pub.category === 'بحوث الطلاب' ? '<span class="student-badge">بحث طالب</span>' : ''}
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
    
    filtered.forEach(event => {
        const dateInfo = formatDateShort(event.date);
        let typeClass = 'workshop';
        if (event.category === 'مؤتمر') typeClass = 'conference';
        else if (event.category === 'ندوة') typeClass = 'seminar';
        else if (event.category === 'مناقشة علمية خارجية') typeClass = 'discussion';
        
        const card = document.createElement('div');
        card.className = `event-card ${typeClass}`;
        card.innerHTML = `
            <div class="event-header">
                <span class="event-type">${event.category}</span>
                <div class="event-date-box">
                    <div class="event-day">${dateInfo.day}</div>
                    <div class="event-month">${dateInfo.month}</div>
                </div>
            </div>
            <div class="event-body">
                <div class="event-name">${event.title}</div>
                <div class="event-location">📍 ${event.location}</div>
                <div class="event-participation">${event.participation_type}</div>
                ${event.organized_by_department === 'نعم' ? '<span class="organized-badge">من تنظيم القسم</span>' : ''}
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
    
    awards.forEach(award => {
        const card = document.createElement('div');
        card.className = 'award-card';
        card.innerHTML = `
            <div class="award-icon">${award.category === 'براءة اختراع' ? '💡' : '🏆'}</div>
            <div class="award-type">${award.category}</div>
            <div class="award-name">${award.title}</div>
            <div class="award-recipient">${(award.participant_ids || '').split('|').map(id => getMemberName(id)).join('، ')}</div>
            <div class="award-granter">${award.granting_body || award.location}</div>
            <div class="award-date">${formatDate(award.date)}</div>
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
        });
    });
}

function setupFilters() {
    document.getElementById('thesesSearch')?.addEventListener('input', renderTheses);
    document.getElementById('thesesTypeFilter')?.addEventListener('change', renderTheses);
    document.getElementById('thesesStatusFilter')?.addEventListener('change', renderTheses);
    
    document.getElementById('pubSearch')?.addEventListener('input', renderPublications);
    document.getElementById('pubCitationsFilter')?.addEventListener('change', renderPublications);
    
    document.getElementById('eventsTypeFilter')?.addEventListener('change', renderEvents);
    document.getElementById('eventsParticipationFilter')?.addEventListener('change', renderEvents);
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
    const hijriYear = new Date().toLocaleDateString('ar-SA-u-ca-islamic', { year: 'numeric' }).replace(/[^0-9]/g, '');
    document.getElementById('currentYear').textContent = hijriYear;
    
    await loadConfig();
    populateYearSelector();
    setupTabs();
    setupFilters();
    setupYearSelector();
    await loadAllData();
}

document.addEventListener('DOMContentLoaded', init);
