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
let currentLeaderboard = [];
let showAllLeaderboard = false;
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
            available_years: [1436, 1437, 1438, 1439, 1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447],
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
    
    const [faculty, students, theses, participations, publications] = await Promise.all([
        loadCSV(`${DATA_BASE_URL}/faculty.csv`),
        loadCSV(`${DATA_BASE_URL}/students_count.csv`),
        loadCSV(`${DATA_BASE_URL}/theses.csv`),
        loadCSV(`${DATA_BASE_URL}/participations.csv`),
        loadCSV(`${DATA_BASE_URL}/publications.csv`)
    ]);
    
    allData = { faculty, students, theses, participations, publications };
    
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
    
    // إعادة تعيين عرض المتصدرين
    showAllLeaderboard = false;
    
    hideLoading();
    renderAll();
}

// ========================================
// دوال مساعدة
// ========================================
function getMemberName(id) {
    if (!id || id === '' || id === null || id === undefined) return '-';
    
    const idStr = String(id).trim();
    if (idStr === '') return '-';
    
    // البحث أولاً في بيانات السنة الحالية
    let member = data.faculty.find(f => String(f.id).trim() === idStr);
    
    // إذا لم يوجد، البحث في كل البيانات
    if (!member) {
        member = allData.faculty.find(f => String(f.id).trim() === idStr);
    }
    
    return member ? member.name : '-';
}

// دالة جديدة للحصول على بيانات العضو كاملة
function getMemberData(id) {
    if (!id || id === '' || id === null || id === undefined) return null;
    
    const idStr = String(id).trim();
    if (idStr === '') return null;
    
    let member = data.faculty.find(f => String(f.id).trim() === idStr);
    if (!member) {
        member = allData.faculty.find(f => String(f.id).trim() === idStr);
    }
    
    return member || null;
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

// الفعاليات (مؤتمرات، ندوات، ورش عمل)
function getEvents() {
    return data.participations.filter(p => 
        p.category === 'مؤتمر' || 
        p.category === 'ندوة' || 
        p.category === 'ورشة عمل'
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
function calculateMemberPoints(memberId) {
    const weights = config.weights || {};
    let points = 0;
    const breakdown = {};
    const memberIdStr = String(memberId).trim();
    
    // 1. البحوث العلمية للأعضاء (من publications.csv)
    if (data.publications && data.publications.length > 0) {
        const memberPubs = data.publications.filter(p => {
            const authors = (p.authors_ids || '').split('|').map(id => id.trim());
            return authors.includes(memberIdStr);
        });
        breakdown.publications = memberPubs.length;
        points += memberPubs.length * (weights.publication || 15);
    }
    
    // 2. بحوث الطلاب (الإشراف على نشر بحث لطالب)
    const studentResearch = data.participations.filter(p => {
        if (p.category !== 'بحوث الطلاب') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    breakdown.studentResearch = studentResearch.length;
    points += studentResearch.length * (weights.student_research || 8);
    
    // 3. الإشراف على الدكتوراه
    const phdSupervised = data.theses.filter(t => 
        t.type === 'دكتوراه' && String(t.supervisor_id).trim() === memberIdStr
    );
    breakdown.phdSupervision = phdSupervised.length;
    points += phdSupervised.length * (weights.phd_supervision || 10);
    
    // 4. الإشراف المشارك على الدكتوراه
    const phdCoSupervised = data.theses.filter(t => 
        t.type === 'دكتوراه' && String(t.co_supervisor_id).trim() === memberIdStr
    );
    breakdown.phdCoSupervision = phdCoSupervised.length;
    points += phdCoSupervised.length * (weights.phd_co_supervision || 5);
    
    // 5. الإشراف على الماجستير
    const mastersSupervised = data.theses.filter(t => 
        t.type === 'ماجستير' && String(t.supervisor_id).trim() === memberIdStr
    );
    breakdown.mastersSupervision = mastersSupervised.length;
    points += mastersSupervised.length * (weights.masters_supervision || 3);
    
    // 6. الإشراف المشارك على الماجستير
    const mastersCoSupervised = data.theses.filter(t => 
        t.type === 'ماجستير' && String(t.co_supervisor_id).trim() === memberIdStr
    );
    breakdown.mastersCoSupervision = mastersCoSupervised.length;
    points += mastersCoSupervised.length * (weights.masters_co_supervision || 2);
    
    // 7. مناقشة رسائل الدكتوراه (داخلية)
    const phdExamined = data.theses.filter(t => 
        t.type === 'دكتوراه' && 
        (String(t.examiner1_id).trim() === memberIdStr || String(t.examiner2_id).trim() === memberIdStr)
    );
    breakdown.phdDiscussion = phdExamined.length;
    points += phdExamined.length * (weights.phd_discussion || 5);
    
    // 8. مناقشة رسائل الماجستير (داخلية)
    const mastersExamined = data.theses.filter(t => 
        t.type === 'ماجستير' && 
        (String(t.examiner1_id).trim() === memberIdStr || String(t.examiner2_id).trim() === memberIdStr)
    );
    breakdown.mastersDiscussion = mastersExamined.length;
    points += mastersExamined.length * (weights.masters_discussion || 2);
    
    // 9. المشاركات العلمية من participations
    data.participations.forEach(p => {
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
    
    // البحوث العلمية من publications.csv
    if (data.publications && data.publications.length > 0) {
        data.publications.forEach(p => {
            activities.push({
                type: 'بحث منشور',
                icon: '📄',
                title: p.title,
                meta: p.journal || '',
                date: p.publish_date || p.date,
                dateObj: new Date((p.publish_date || p.date)?.replace(/-/g, '/') || Date.now())
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
        
        activities.push({
            type: p.category,
            icon,
            title,
            meta,
            date: p.date,
            dateObj: new Date(p.date?.replace(/-/g, '/') || Date.now())
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
    
    // إضافة خيار "الكل" في البداية
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'الكل';
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
    currentLeaderboard = getLeaderboard();
    
    // المنصة - الثلاثة الأوائل
    if (currentLeaderboard[0]) {
        const firstName = document.getElementById('first-name');
        firstName.textContent = getShortName(currentLeaderboard[0].name);
        firstName.style.fontSize = '0.85rem';
        firstName.style.cursor = 'pointer';
        firstName.onclick = () => showMemberDetails(currentLeaderboard[0].id);
        document.getElementById('first-points').textContent = currentLeaderboard[0].points + ' نقطة';
    }
    if (currentLeaderboard[1]) {
        const secondName = document.getElementById('second-name');
        secondName.textContent = getShortName(currentLeaderboard[1].name);
        secondName.style.fontSize = '0.85rem';
        secondName.style.cursor = 'pointer';
        secondName.onclick = () => showMemberDetails(currentLeaderboard[1].id);
        document.getElementById('second-points').textContent = currentLeaderboard[1].points + ' نقطة';
    }
    if (currentLeaderboard[2]) {
        const thirdName = document.getElementById('third-name');
        thirdName.textContent = getShortName(currentLeaderboard[2].name);
        thirdName.style.fontSize = '0.85rem';
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
            <span class="leaderboard-name" style="font-size: 0.85rem;">${member.name}</span>
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
function showMemberDetails(memberId) {
    const member = getMemberData(memberId);
    if (!member) return;
    
    const { points, breakdown } = calculateMemberPoints(memberId);
    
    // جمع أنشطة العضو
    const memberActivities = getMemberActivities(memberId);
    
    // إنشاء HTML للـ Modal
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
                    </div>
                </div>
                
                <div class="member-breakdown">
                    <h3>📊 تفصيل النقاط</h3>
                    <div class="breakdown-grid">
                        ${breakdown.phdSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🎓</span>
                            <span class="breakdown-label">إشراف دكتوراه</span>
                            <span class="breakdown-count">${breakdown.phdSupervision}</span>
                        </div>` : ''}
                        ${breakdown.phdCoSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">🎓</span>
                            <span class="breakdown-label">إشراف مشارك (دكتوراه)</span>
                            <span class="breakdown-count">${breakdown.phdCoSupervision}</span>
                        </div>` : ''}
                        ${breakdown.mastersSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📚</span>
                            <span class="breakdown-label">إشراف ماجستير</span>
                            <span class="breakdown-count">${breakdown.mastersSupervision}</span>
                        </div>` : ''}
                        ${breakdown.mastersCoSupervision ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📚</span>
                            <span class="breakdown-label">إشراف مشارك (ماجستير)</span>
                            <span class="breakdown-count">${breakdown.mastersCoSupervision}</span>
                        </div>` : ''}
                        ${breakdown.phdDiscussion ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📋</span>
                            <span class="breakdown-label">مناقشة دكتوراه</span>
                            <span class="breakdown-count">${breakdown.phdDiscussion}</span>
                        </div>` : ''}
                        ${breakdown.mastersDiscussion ? `
                        <div class="breakdown-item">
                            <span class="breakdown-icon">📋</span>
                            <span class="breakdown-label">مناقشة ماجستير</span>
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
                    
                    ${memberActivities.theses.length > 0 ? `
                    <div class="activity-group">
                        <h4>🎓 الرسائل العلمية (${memberActivities.theses.length})</h4>
                        <div class="activity-list">
                            ${memberActivities.theses.map(t => `
                                <div class="activity-item-detail">
                                    <span class="activity-badge ${t.type === 'دكتوراه' ? 'phd' : 'masters'}">${t.type}</span>
                                    <span class="activity-role">${t.role}</span>
                                    <span class="activity-title">${t.student_name} - ${t.title.substring(0, 50)}...</span>
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
                                    <span class="activity-meta">${p.journal || p.location} - ${formatDate(p.date)}</span>
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
                                    <span class="activity-meta">${e.location} - ${e.participation_type}</span>
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
                                    <span class="activity-meta">${a.granting_body || a.location}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}
                </div>
            </div>
        </div>
    `;
    
    // إزالة أي modal سابق
    const existingModal = document.getElementById('memberModal');
    if (existingModal) existingModal.remove();
    
    // إضافة الـ modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// دالة لجمع أنشطة العضو
function getMemberActivities(memberId) {
    const memberIdStr = String(memberId).trim();
    
    // الرسائل العلمية
    const theses = [];
    data.theses.forEach(t => {
        if (String(t.supervisor_id).trim() === memberIdStr) {
            theses.push({ ...t, role: 'مشرف رئيسي' });
        } else if (String(t.co_supervisor_id).trim() === memberIdStr) {
            theses.push({ ...t, role: 'مشرف مشارك' });
        } else if (String(t.examiner1_id).trim() === memberIdStr || String(t.examiner2_id).trim() === memberIdStr) {
            theses.push({ ...t, role: 'مناقش' });
        }
    });
    
    // البحوث العلمية للأعضاء (من publications.csv)
    const publications = (data.publications || []).filter(p => {
        const authors = (p.authors_ids || '').split('|').map(id => id.trim());
        return authors.includes(memberIdStr);
    });
    
    // بحوث الطلاب (من participations.csv)
    const studentResearch = data.participations.filter(p => {
        if (p.category !== 'بحوث الطلاب') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // الفعاليات (مؤتمرات، ندوات، ورش عمل)
    const events = data.participations.filter(p => {
        if (p.category !== 'مؤتمر' && p.category !== 'ندوة' && p.category !== 'ورشة عمل') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // المناقشات الخارجية
    const externalDiscussions = data.participations.filter(p => {
        if (p.category !== 'مناقشة خارجية') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // التحكيم العلمي
    const reviewing = data.participations.filter(p => {
        if (p.category !== 'تحكيم علمي') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    // الجوائز وبراءات الاختراع
    const awards = data.participations.filter(p => {
        if (p.category !== 'جائزة' && p.category !== 'براءة اختراع') return false;
        const participants = (p.participant_ids || '').split('|').map(id => id.trim());
        return participants.includes(memberIdStr);
    });
    
    return { theses, publications, studentResearch, events, externalDiscussions, reviewing, awards };
}

// دالة إغلاق modal العضو
function closeMemberModal() {
    const modal = document.getElementById('memberModal');
    if (modal) modal.remove();
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
    
    // البحوث من ملف publications.csv
    let filtered = getPublications();
    if (searchTerm) filtered = filtered.filter(p => p.title && p.title.toLowerCase().includes(searchTerm));
    if (citationsFilter) filtered = filtered.filter(p => p.citations_range === citationsFilter);
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد بحوث علمية مسجلة لهذا العام</div>';
        return;
    }
    
    filtered.forEach(pub => {
        // دعم authors_ids من publications.csv
        const authorIds = pub.authors_ids || pub.participant_ids || '';
        const authors = authorIds.split('|').map(id => getMemberName(id.trim())).filter(n => n);
        
        const card = document.createElement('div');
        card.className = 'publication-card';
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
        `;
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
        
        // الحصول على أسماء المشاركين
        const participants = (event.participant_ids || '').split('|')
            .map(id => getMemberName(id.trim()))
            .filter(n => n);
        
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
                <div class="event-name">${event.title || ''}</div>
                <div class="event-location">📍 ${event.location || ''}</div>
                <div class="event-participation">${event.participation_type || ''}</div>
                ${participants.length > 0 ? `<div class="event-participants">${participants.map(p => `<span class="participant-tag">${p}</span>`).join('')}</div>` : ''}
                ${event.organized_by_department === 'نعم' ? '<span class="organized-badge">من تنظيم القسم</span>' : ''}
                ${event.student_details && !isNaN(event.student_details) ? `<span class="attendance-badge">👥 ${event.student_details} حاضر</span>` : ''}
                ${event.notes ? `<div class="event-notes">${event.notes}</div>` : ''}
            </div>
        `;
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
                        <input type="text" class="form-input" id="actJournal" placeholder="اسم المجلة">
                    </div>
                    <div class="form-group">
                        <label><span class="required">*</span> تاريخ النشر</label>
                        <input type="date" class="form-input" id="actDate">
                    </div>
                </div>
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
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> اسم الطالب</label>
                    <input type="text" class="form-input" id="actStudentName" placeholder="اسم الطالب الكامل">
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> عنوان الرسالة</label>
                    <textarea class="form-textarea" id="actTitle" placeholder="عنوان الرسالة"></textarea>
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
                        <label><span class="required">*</span> تاريخ المناقشة</label>
                        <input type="date" class="form-input" id="actDate">
                    </div>
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> اسم الطالب</label>
                    <input type="text" class="form-input" id="actStudentName" placeholder="اسم الطالب">
                </div>
                <div class="form-group">
                    <label><span class="required">*</span> عنوان الرسالة</label>
                    <textarea class="form-textarea" id="actTitle" placeholder="عنوان الرسالة"></textarea>
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
                    <label>هل الفعالية من تنظيم القسم؟</label>
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
        const selectedValue = e.target.value;
        if (selectedValue === 'all') {
            currentYear = 'all';
        } else {
            currentYear = parseInt(selectedValue);
        }
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
    
    // إنشاء واجهة إضافة الأنشطة
  //  createAddActivityUI();
}

document.addEventListener('DOMContentLoaded', init);
