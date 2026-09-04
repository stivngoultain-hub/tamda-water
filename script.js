import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFFwAQ2XOerYs2H1Qrs9b9_mWMmoToxfo",
  authDomain: "tamda-water-management.firebaseapp.com",
  projectId: "tamda-water-management",
  storageBucket: "tamda-water-management.firebasestorage.app",
  messagingSenderId: "917420512189",
  appId: "1:917420512189:web:6fd0deb84b12590e13b8d4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let secureCodes = JSON.parse(localStorage.getItem('tamda_codes')) || { 'president': '1111', 'secretary': '2222', 'treasurer': '3333' };
const roleNames = { 'president': 'الرئيس', 'secretary': 'الكاتب العام', 'treasurer': 'أمين المال', 'subscriber': 'المنخرط' };

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const toast = document.getElementById('toast');

let totalIncome = 0; let totalExpense = 0; let totalDonationsIncome = 0; window.actualTotalCapital = 0;
let currentBillTotal = 0; let currentConsumptionData = 0;
let currentT1 = 0, currentT2 = 0, currentT3 = 0;
let financeChartInstance = null; // للمبيانات

let subscribers = []; 
let complaintsList = []; 
let appSettings = { tier1: 4, tier2: 8, tier3: 15, maintenance: 15, penalty: 50 }; 
let transactionsList = []; let donationsList = []; 
let archiveBills = []; let archiveFinance = [];
let capitalLedger = []; 
let pdfReportsList = []; 

const SESSION_TIMEOUT = 3 * 60 * 1000; 

const views = {
    '🏠 لوحة القيادة': 'view-dashboard', 
    '👥 إدارة المنخرطين': 'view-subscribers',
    '💧 إدارة ماء الشرب': 'view-water', 
    '📊 الإحصائيات الشهرية': 'view-stats',
    '📊 التقارير المالية': 'view-reports',
    '💰 ملخص العمليات الشهرية': 'view-finance',
    '💖 سجل التبرعات': 'view-donations',
    '📒 الديون والأرصدة': 'view-debts',
    '📥 الشكايات والطلبات': 'view-complaints',
    '📜 القانون والتقارير': 'view-bylaws', 
    '🗄️ الأرشيف والتخزين': 'view-archive',
    '👥 نشاط الأعضاء': 'view-member-activity',
    '⚙️ الإعدادات': 'view-settings',
    '👤 فواتيري وطلباتي': 'view-sub-portal'
};

let backPressTimer = null;
history.pushState(null, null, location.href);
window.addEventListener('popstate', (e) => {
    if (backPressTimer) { clearTimeout(backPressTimer); window.history.back(); } 
    else { e.preventDefault(); history.pushState(null, null, location.href); showToast('⚠️ اضغط مرة أخرى للخروج'); backPressTimer = setTimeout(() => { backPressTimer = null; }, 2000); }
});

document.addEventListener('DOMContentLoaded', () => {
    loadLocalData(); loadSettings(); checkAuth(); 
    let savedBylaw = localStorage.getItem('tamda_bylaws') || '';
    if(document.getElementById('bylawInput')) document.getElementById('bylawInput').value = savedBylaw;
    
    // تفعيل الوضع الداكن إذا كان محفوظاً
    if(localStorage.getItem('tamda_darkmode') === 'true') document.body.classList.add('dark-mode');
    
    window.addEventListener('online', () => { updateOnlineStatus(true); });
    window.addEventListener('offline', () => { updateOnlineStatus(false); });
    updateOnlineStatus(navigator.onLine);
    if(navigator.onLine) { loadDataFromCloud(); }
    ['click', 'touchstart', 'keypress', 'scroll'].forEach(evt => document.addEventListener(evt, updateLastActive));
    setInterval(checkSessionTimeout, 10000);
});

window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('tamda_darkmode', document.body.classList.contains('dark-mode'));
    if(financeChartInstance) renderCharts(); // تحديث ألوان المبيان
}

function updateOnlineStatus(isOnline) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    statusEl.textContent = isOnline ? "متصل (Online)" : "غير متصل (Offline)";
    statusEl.style.background = isOnline ? "#25D366" : "#c1272d";
}
function updateLastActive() { if(localStorage.getItem('tamda_auth') === 'true') localStorage.setItem('tamda_last_active', Date.now()); }
function checkSessionTimeout() {
    if(localStorage.getItem('tamda_auth') === 'true') {
        let last = parseInt(localStorage.getItem('tamda_last_active') || '0');
        if(last > 0 && (Date.now() - last > SESSION_TIMEOUT)) logout(true);
    }
}
function checkAuth() {
    try {
        let isAuth = localStorage.getItem('tamda_auth') === 'true';
        if(isAuth) {
            document.getElementById('loginScreen').style.display = 'none'; document.getElementById('appContent').style.display = 'block'; localStorage.setItem('tamda_last_active', Date.now());
            let role = localStorage.getItem('tamda_role');
            if (role === 'subscriber') {
                document.getElementById('adminLinks').style.display = 'none'; document.getElementById('subscriberLinks').style.display = 'block';
                document.getElementById('activeUserLabel').textContent = "بوابة المشتركين (عداد: " + localStorage.getItem('tamda_counter') + ")"; 
                if(document.getElementById('portalSubName')) document.getElementById('portalSubName').textContent = localStorage.getItem('tamda_subname') || '';
                if(document.getElementById('portalSubCounter')) document.getElementById('portalSubCounter').textContent = localStorage.getItem('tamda_counter') || '';
                navigateTo('👤 فواتيري وطلباتي');
            } else {
                document.getElementById('adminLinks').style.display = 'block'; document.getElementById('subscriberLinks').style.display = 'none';
                document.getElementById('activeUserLabel').textContent = "مرحباً: " + roleNames[role]; navigateTo('🏠 لوحة القيادة'); renderCapital();
            }
        } else {
            document.getElementById('loginScreen').style.display = 'flex'; document.getElementById('appContent').style.display = 'none';
        }
    } catch(e) {}
}

function authenticate() {
    const roleSelect = document.getElementById('userRole'); const codeInput = document.getElementById('loginCode'); const err = document.getElementById('loginError');
    if(!roleSelect || !codeInput || !err) return;
    const role = roleSelect.value; const code = codeInput.value.trim();
    if (role === 'subscriber') {
        const counter = document.getElementById('loginCounter').value.trim();
        let sub = subscribers.find(s => String(s.counter).trim() === counter && s.pin && s.pin === code);
        if(sub) { localStorage.setItem('tamda_auth', 'true'); localStorage.setItem('tamda_role', 'subscriber'); localStorage.setItem('tamda_counter', counter); localStorage.setItem('tamda_subname', sub.name); err.style.display = 'none'; codeInput.value = ''; checkAuth(); showToast('مرحباً بك في بوابتك الخاصة'); } 
        else { err.style.display = 'block'; err.textContent = 'رقم العداد أو الرمز السري غير صحيح!'; }
    } else {
        if(secureCodes[role] === code) { localStorage.setItem('tamda_auth', 'true'); localStorage.setItem('tamda_role', role); err.style.display = 'none'; codeInput.value = ''; checkAuth(); showToast('تم تسجيل الدخول بنجاح'); } 
        else { err.style.display = 'block'; err.textContent = 'الرمز السري غير صحيح!'; }
    }
}
function logout(isTimeout = false) { localStorage.clear(); checkAuth(); if(sidebar) sidebar.classList.remove('active'); if(overlay) overlay.classList.remove('active'); if(isTimeout===true) showToast("تم الخروج تلقائياً لمرور 3 دقائق"); }
function handleEnter(e) { if (e.key === 'Enter') authenticate(); }
function toggleSidebar() { if (sidebar) sidebar.classList.toggle('active'); if (overlay) overlay.classList.toggle('active'); }
function showToast(message) { if(!toast) return; toast.textContent = message; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 3000); }

function navigateTo(pageName) {
    if (sidebar) sidebar.classList.remove('active'); if (overlay) overlay.classList.remove('active');
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    if (views[pageName] && document.getElementById(views[pageName])) {
        document.getElementById(views[pageName]).style.display = 'block';
        if(pageName === '🏠 لوحة القيادة') renderDashboard();
        if(pageName === '👥 إدارة المنخرطين') renderSubscribers();
        if(pageName === '💧 إدارة ماء الشرب') window.checkUnbilledCounters();
        if(pageName === '⚙️ الإعدادات') loadSettingsToInputs();
        if(pageName === '📒 الديون والأرصدة') renderDebts();
        if(pageName === '💰 ملخص العمليات الشهرية') renderTransactions();
        if(pageName === '💖 سجل التبرعات') renderDonations();
        if(pageName === '🗄️ الأرشيف والتخزين') renderArchive();
        if(pageName === '📊 التقارير المالية') renderCapital();
        if(pageName === '📥 الشكايات والطلبات') renderAdminComplaints();
        if(pageName === '👤 فواتيري وطلباتي') renderSubPortalBills();
        if(pageName === '📜 القانون والتقارير') renderDocuments(); 
        if(pageName === '👥 نشاط الأعضاء') renderAuditTrail(); // سجل التتبع الإداري
    }
}

function loadLocalData() {
    subscribers = (JSON.parse(localStorage.getItem('local_subs')) || []).filter(s => s.firestoreId && !s.firestoreId.startsWith('local_'));
    transactionsList = (JSON.parse(localStorage.getItem('local_trans')) || []).filter(t => t.firestoreId && !t.firestoreId.startsWith('local_'));
    donationsList = (JSON.parse(localStorage.getItem('local_donations')) || []).filter(d => d.firestoreId && !d.firestoreId.startsWith('local_')); 
    archiveBills = (JSON.parse(localStorage.getItem('local_bills')) || []).filter(b => b.firestoreId && !b.firestoreId.startsWith('local_'));
    archiveFinance = (JSON.parse(localStorage.getItem('local_fin')) || []).filter(f => f.firestoreId && !f.firestoreId.startsWith('local_'));
    complaintsList = (JSON.parse(localStorage.getItem('local_complaints')) || []).filter(c => c.firestoreId && !c.firestoreId.startsWith('local_'));
    capitalLedger = (JSON.parse(localStorage.getItem('local_capital')) || []).filter(item => item.firestoreId && !item.firestoreId.startsWith('local_'));
    pdfReportsList = (JSON.parse(localStorage.getItem('local_docs')) || []).filter(d => d.firestoreId && !d.firestoreId.startsWith('local_'));
    recalculateFinancials();
}

function saveLocalData() {
    localStorage.setItem('local_subs', JSON.stringify(subscribers)); localStorage.setItem('local_trans', JSON.stringify(transactionsList));
    localStorage.setItem('local_donations', JSON.stringify(donationsList)); localStorage.setItem('local_bills', JSON.stringify(archiveBills));
    localStorage.setItem('local_fin', JSON.stringify(archiveFinance)); localStorage.setItem('local_complaints', JSON.stringify(complaintsList));
    localStorage.setItem('local_capital', JSON.stringify(capitalLedger));
    localStorage.setItem('local_docs', JSON.stringify(pdfReportsList));
}

function recalculateFinancials() {
    let transIncome = 0; totalExpense = 0;
    transactionsList.forEach(t => { if(t.type === 'income') transIncome += Number(t.amount || 0); else totalExpense += Number(t.amount || 0); });
    totalDonationsIncome = 0;
    donationsList.forEach(d => { totalDonationsIncome += Number(d.amount || 0); });
    let manualCap = 0;
    capitalLedger.forEach(c => { if(c.type === 'manual') manualCap += Number(c.amount || 0); });
    
    totalIncome = transIncome + totalDonationsIncome;
    window.actualTotalCapital = totalIncome + manualCap - totalExpense; 
}

function loadSettings() { let saved = JSON.parse(localStorage.getItem('tamda_settings')); if(saved) appSettings = Object.assign(appSettings, saved); }
function saveSettings() {
    appSettings.tier1 = parseFloat(document.getElementById('setTier1').value) || 4; appSettings.tier2 = parseFloat(document.getElementById('setTier2').value) || 8; appSettings.tier3 = parseFloat(document.getElementById('setTier3').value) || 15;
    appSettings.maintenance = parseFloat(document.getElementById('setMaintenance').value) || 15; appSettings.penalty = parseFloat(document.getElementById('setPenalty').value) || 50;
    localStorage.setItem('tamda_settings', JSON.stringify(appSettings)); showToast('تم حفظ الإعدادات!');
}
function loadSettingsToInputs() { document.getElementById('setTier1').value = appSettings.tier1; document.getElementById('setTier2').value = appSettings.tier2; document.getElementById('setTier3').value = appSettings.tier3; document.getElementById('setMaintenance').value = appSettings.maintenance; document.getElementById('setPenalty').value = appSettings.penalty; }

async function loadDataFromCloud() {
    try {
        const subSnapshot = await getDocs(collection(db, "subscribers")); subscribers = []; subSnapshot.forEach(d => { subscribers.push({ ...d.data(), firestoreId: d.id }); }); subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));
        const transSnapshot = await getDocs(collection(db, "transactions")); transactionsList = []; transSnapshot.forEach(d => { transactionsList.push({ ...d.data(), firestoreId: d.id }); });
        const billsSnap = await getDocs(collection(db, "archive_bills")); archiveBills = []; billsSnap.forEach(d => { archiveBills.push({ ...d.data(), firestoreId: d.id }); });
        const finSnap = await getDocs(collection(db, "archive_finance")); archiveFinance = []; finSnap.forEach(d => { archiveFinance.push({ ...d.data(), firestoreId: d.id }); });
        const donSnap = await getDocs(collection(db, "donations")); donationsList = []; donSnap.forEach(d => { donationsList.push({ ...d.data(), firestoreId: d.id }); });
        const capSnap = await getDocs(collection(db, "capital_ledger")); capitalLedger = []; capSnap.forEach(d => { capitalLedger.push({ ...d.data(), firestoreId: d.id }); });
        const docsSnap = await getDocs(collection(db, "documents")); pdfReportsList = []; docsSnap.forEach(d => { pdfReportsList.push({ ...d.data(), firestoreId: d.id }); });
        
        saveLocalData(); recalculateFinancials();
        if(localStorage.getItem('tamda_auth') === 'true') {
            if(localStorage.getItem('tamda_role') !== 'subscriber') {
                renderSubscribers(); renderTransactions(); renderCapital(); renderArchive(); renderDebts(); renderDashboard();
            } else {
                renderSubPortalBills();
            }
        }
    } catch (e) { console.error("Cloud fetch error:", e); }
}

/* --- لوحة القيادة والمبيانات التفاعلية --- */
function renderDashboard() {
    if(document.getElementById('dashSubCount')) document.getElementById('dashSubCount').textContent = subscribers.length;
    let totalDebts = 0; subscribers.forEach(s => totalDebts += Number(s.debtAmount || 0)); 
    if(document.getElementById('dashDebts')) document.getElementById('dashDebts').textContent = totalDebts + ' درهم';
    renderCharts();
}

function renderCharts() {
    const ctx = document.getElementById('financeChart');
    if(!ctx) return;
    
    // تجميع البيانات لآخر 6 أشهر
    let months = {};
    archiveBills.forEach(b => { if(!months[b.month]) months[b.month] = { income: 0, exp: 0 }; });
    transactionsList.forEach(t => { 
        if(!months[t.month]) months[t.month] = { income: 0, exp: 0 };
        if(t.type === 'income') months[t.month].income += Number(t.amount);
        if(t.type === 'expense') months[t.month].exp += Number(t.amount);
    });
    
    let sortedKeys = Object.keys(months).sort().slice(-6); // آخر 6 أشهر
    let labels = sortedKeys;
    let incomes = sortedKeys.map(k => months[k].income);
    let expenses = sortedKeys.map(k => months[k].exp);
    
    let isDark = document.body.classList.contains('dark-mode');
    let textColor = isDark ? '#e0e0e0' : '#333';
    let gridColor = isDark ? '#444' : '#ddd';

    if (financeChartInstance) { financeChartInstance.destroy(); }
    
    financeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'المداخيل', data: incomes, backgroundColor: '#25D366' },
                { label: 'المصاريف', data: expenses, backgroundColor: '#d32f2f' }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: { legend: { labels: { color: textColor } } }
        }
    });
}

/* --- كشف العدادات المنسية --- */
window.checkUnbilledCounters = function() {
    const month = document.getElementById('billingMonth').value;
    const alertBox = document.getElementById('unbilledAlertBox');
    const listSpan = document.getElementById('unbilledList');
    if(!month || !alertBox || !listSpan) return;
    
    let billedCounters = archiveBills.filter(b => b.month === month).map(b => b.counter);
    let unbilled = subscribers.filter(s => !billedCounters.includes(s.counter)).map(s => s.counter);
    
    if (unbilled.length > 0 && unbilled.length < subscribers.length) { // لا نعرض التنبيه إذا كان الشهر جديداً بالكامل
        listSpan.textContent = unbilled.join("، ");
        alertBox.style.display = 'block';
    } else {
        alertBox.style.display = 'none';
    }
}

/* --- المنخرطين --- */
async function saveSubscriber() {
    const editingId = document.getElementById('editingSubId').value;
    const counter = document.getElementById('newSubCounter').value.trim();
    const name = document.getElementById('newSubName').value.trim();
    const phone = document.getElementById('newSubPhone').value.trim();
    const loc = document.getElementById('newSubLocation').value.trim();
    const isAlwaysExempt = document.getElementById('newSubAlwaysExempt').checked;

    if (!counter || !name) return showToast('المرجو إدخال رقم العداد والاسم');
    
    try {
        if (editingId) {
            let sub = subscribers.find(s => s.firestoreId === editingId);
            if(sub) { sub.counter = counter; sub.name = name; sub.phone = phone; sub.location = loc; sub.isAlwaysExempt = isAlwaysExempt; }
            if (navigator.onLine) await updateDoc(doc(db, "subscribers", editingId), { counter, name, phone, location: loc, isAlwaysExempt });
            showToast('تم تعديل بيانات المشترك بنجاح!'); resetSubForm();
        } else {
            if (subscribers.find(s => s.counter == counter)) return showToast('العداد مسجل مسبقاً!');
            if (!navigator.onLine) return showToast('⚠️ يجب الاتصال بالإنترنت لإضافة مشترك');
            let newSub = { counter, name, phone, location: loc, isAlwaysExempt, lastReading: null, delayMonths: 0, debtAmount: 0, lastBilledMonth: '', pin: '' };
            let docRef = await addDoc(collection(db, "subscribers"), newSub); newSub.firestoreId = docRef.id;
            subscribers.push(newSub); subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));
            resetSubForm();
            showToast('تم حفظ المشترك بنجاح');
        }
        saveLocalData(); renderSubscribers();
    } catch (e) { showToast('❌ حدث خطأ أثناء الحفظ'); }
}

window.editSubscriber = function(firestoreId) {
    const sub = subscribers.find(s => s.firestoreId === firestoreId); if (!sub) return;
    document.getElementById('editingSubId').value = sub.firestoreId; document.getElementById('newSubCounter').value = sub.counter; document.getElementById('newSubName').value = sub.name; document.getElementById('newSubPhone').value = sub.phone || ''; document.getElementById('newSubLocation').value = sub.location || ''; document.getElementById('newSubAlwaysExempt').checked = sub.isAlwaysExempt || false; document.getElementById('subFormTitle').textContent = '✏️ تعديل بيانات المشترك'; document.getElementById('subSaveBtn').textContent = '💾 تحديث البيانات'; document.getElementById('subCancelBtn').style.display = 'block'; window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.resetSubForm = function() { document.getElementById('editingSubId').value = ''; document.getElementById('newSubCounter').value = ''; document.getElementById('newSubName').value = ''; document.getElementById('newSubPhone').value = ''; document.getElementById('newSubLocation').value = ''; document.getElementById('newSubAlwaysExempt').checked = false; document.getElementById('subFormTitle').textContent = '➕ إضافة مشترك جديد'; document.getElementById('subSaveBtn').textContent = '💾 حفظ المشترك'; document.getElementById('subCancelBtn').style.display = 'none'; }

window.deleteSubscriber = async function(id) { 
    if(!id || id.startsWith('local_')) return showToast('⚠️ يرجى التحديث');
    if(confirm('هل أنت متأكد من حذف المشترك نهائياً؟')) { 
        try { await deleteDoc(doc(db, "subscribers", id)); subscribers = subscribers.filter(s => s.firestoreId !== id); saveLocalData(); renderSubscribers(); showToast('تم الحذف بنجاح'); } catch(e){ showToast('❌ فشل الحذف'); }
    } 
}

window.generateAndSendPIN = async function(firestoreId) {
    let sub = subscribers.find(s => s.firestoreId === firestoreId); if (!sub) return;
    if (!sub.phone) return showToast('رقم هاتف المنخرط غير مسجل!');
    let pin = Math.floor(1000 + Math.random() * 9000).toString(); sub.pin = pin; saveLocalData();
    if(navigator.onLine) await updateDoc(doc(db, "subscribers", firestoreId), { pin: pin }).catch(()=>{});
    let msg = `مرحباً السيد(ة) ${sub.name}،\nتم تفعيل حسابك في بوابة المشتركين لتطبيق تسيير ماء تامدة.\n\n👤 اسم المستخدم (رقم العداد): ${sub.counter}\n🔑 الرمز السري: ${pin}`;
    window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(msg)}`, '_blank'); showToast('تم توليد الكود وفتح واتساب'); renderSubscribers();
}

function renderSubscribers() {
    const container = document.getElementById('subscribersListContainer'); if(!container) return;
    const searchTerm = document.getElementById('searchSub').value.toLowerCase(); container.innerHTML = '';
    let filtered = subscribers.filter(s => s.name.toLowerCase().includes(searchTerm) || s.counter.toString().includes(searchTerm));
    document.getElementById('subListCount').textContent = filtered.length; 
    filtered.forEach((sub) => {
        const div = document.createElement('div'); div.className = 'list-item'; div.style.flexDirection = 'column'; div.style.alignItems = 'stretch';
        let pinBtnText = sub.pin ? "🔄 إعادة إرسال الكود للمشترك" : "🔑 توليد وإرسال كود الدخول";
        let exemptBadge = sub.isAlwaysExempt ? '<strong style="color:var(--accent-green); background:#e8f5e9; padding:2px 5px; border-radius:4px; font-size:0.8rem;">معفى دائماً</strong>' : '';
        div.innerHTML = `
            <div class="list-info" style="text-align: right; width: 100%; margin-bottom: 10px;">
                <strong>عداد (${sub.counter}): ${sub.name} ${exemptBadge}</strong>
                <span>الهاتف: ${sub.phone || 'غير مسجل'} | الموقع: ${sub.location || 'غير محدد'}</span>
                <span class="${(sub.debtAmount > 0) ? 'text-danger' : 'text-success'}">ديون: ${sub.debtAmount || 0} درهم (تأخير: ${sub.delayMonths || 0} أشهر)</span>
                <span>حالة البوابة: ${sub.pin ? '<strong style="color:var(--accent-green);">✔️ مفعل</strong>' : '<strong style="color:var(--danger-red);">❌ غير مفعل</strong>'}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; width: 100%;">
                <div style="display:flex; gap:8px;"><button class="edit-btn" style="flex:1;" onclick="editSubscriber('${sub.firestoreId}')">✏️ تعديل</button><button class="action-btn" style="flex:1;" onclick="deleteSubscriber('${sub.firestoreId}')">🗑️ حذف</button></div>
                <button class="btn btn-outline" style="padding:8px; margin:0;" onclick="generateAndSendPIN('${sub.firestoreId}')">${pinBtnText}</button>
            </div>
        `;
        container.appendChild(div);
    });
}

/* --- الفوترة و تصدير الصور --- */
function autoFillSubscriber() { 
    const counterInput = document.getElementById('counterNum').value.trim(); 
    const sub = subscribers.find(s => s.counter == counterInput); 
    if (sub) { 
        document.getElementById('subscriberName').value = sub.name; 
        document.getElementById('exemptionCheck').checked = sub.isAlwaysExempt || false; // تطبيق الإعفاء الدائم تلقائياً
        
        if(sub.lastBilledMonth) {
            document.getElementById('billingMonth').value = getNextMonth(sub.lastBilledMonth); 
            window.autoAdjustTariff();
            window.checkUnbilledCounters();
        }
        document.getElementById('counterHistoryCard').style.display = 'block';
        renderCounterBills(counterInput);
        let prevInput = document.getElementById('prevReading');
        if (sub.lastReading) { prevInput.value = sub.lastReading; prevInput.setAttribute('readonly', 'true'); } 
        else { prevInput.value = ''; prevInput.removeAttribute('readonly'); }
        document.getElementById('delayMonths').value = sub.delayMonths || 0; 
    } else { 
        document.getElementById('subscriberName').value = ''; document.getElementById('prevReading').value = ''; 
        document.getElementById('prevReading').removeAttribute('readonly'); document.getElementById('currReading').value = ''; 
        document.getElementById('counterHistoryCard').style.display = 'none';
        document.getElementById('exemptionCheck').checked = false;
    } 
    document.getElementById('currReading').value = ''; 
}

window.renderCounterBills = function(counter) {
    const container = document.getElementById('counterBillsList');
    let bills = archiveBills.filter(b => b.counter == counter).sort((a,b) => b.month.localeCompare(a.month));
    if(bills.length === 0) { container.innerHTML = '<p class="text-success">لا توجد فواتير سابقة لهذا العداد.</p>'; return; }
    let html = `<div class="table-responsive"><table class="archive-table"><thead><tr><th>الشهر</th><th>الاستهلاك</th><th>المبلغ</th><th>الحالة</th><th>تعديل</th></tr></thead><tbody>`;
    bills.forEach(b => {
        let statusColor = b.status.includes('خالصة') ? 'var(--accent-green)' : 'var(--danger-red)';
        html += `<tr><td>${b.month}</td><td>${b.consumption} m³</td><td>${b.total} درهم</td><td style="color:${statusColor}; font-weight:bold;">${b.status}</td><td><button class="edit-btn" onclick="editBill('${b.firestoreId}')">✏️ تعديل</button></td></tr>`;
    });
    html += `</tbody></table></div>`; container.innerHTML = html;
}

window.editBill = async function(id) {
    let bill = archiveBills.find(b => b.firestoreId === id); if(!bill) return;
    if(!confirm('سيتم حذف الفاتورة الخاطئة لإعادة إدخالها مصححة. هل توافق؟')) return;
    await deleteArchiveBill(id, true);
    document.getElementById('billingMonth').value = bill.month;
    document.getElementById('prevReading').value = bill.prevReading || (bill.currReading - bill.consumption) || 0;
    document.getElementById('currReading').value = bill.currReading || 0;
    document.getElementById('delayMonths').value = 0;
    document.getElementById('exemptionCheck').checked = bill.isExempt || false;
    window.autoAdjustTariff();
    showToast('تم إلغاء الفاتورة.. أدخل البيانات الصحيحة واضغط حساب ثم حفظ من جديد.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getNextMonth(monthString) { let parts = monthString.split('-'); let d = new Date(parseInt(parts[0]), parseInt(parts[1]), 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

function calculateBill() { 
    const counterNumInput = document.getElementById('counterNum').value.trim(); 
    const prev = parseFloat(document.getElementById('prevReading').value) || 0; 
    const curr = parseFloat(document.getElementById('currReading').value) || 0; 
    const delayMonths = parseInt(document.getElementById('delayMonths').value) || 0; 
    const tariffSystem = document.getElementById('tariffSystem').value; 
    const isExempt = document.getElementById('exemptionCheck').checked; 
    const billingMonth = document.getElementById('billingMonth').value;
    
    if (!counterNumInput || !billingMonth) return; 
    
    let isAlreadyBilled = archiveBills.some(b => b.counter == counterNumInput && b.month === billingMonth);
    if (isAlreadyBilled) { document.getElementById('billResult').style.display = 'none'; document.getElementById('billActionsContainer').style.display = 'none'; return showToast('❌ تحذير: هذا الشهر تم فوترته مسبقاً لهذا العداد!'); }

    if (curr < prev) return showToast('القراءة الحالية أقل من السابقة!');

    const consumption = curr - prev; currentConsumptionData = consumption; 
    currentT1 = 0; currentT2 = 0; currentT3 = 0; let t1_cost = 0, t2_cost = 0, t3_cost = 0, maintenance = (tariffSystem === 'old') ? 15 : appSettings.maintenance;
    
    if (tariffSystem === 'old') { 
        if (consumption <= 20) { currentT1 = consumption; } else if (consumption <= 30) { currentT1 = 20; currentT2 = consumption - 20; } else { currentT1 = 20; currentT2 = 10; currentT3 = consumption - 30; } 
        t1_cost = currentT1 * 3; t2_cost = currentT2 * 5; t3_cost = currentT3 * 7; 
    } else { 
        if (consumption <= 15) { currentT1 = consumption; } else if (consumption <= 20) { currentT1 = 15; currentT2 = consumption - 15; } else { currentT1 = 15; currentT2 = 5; currentT3 = consumption - 20; } 
        t1_cost = currentT1 * appSettings.tier1; t2_cost = currentT2 * appSettings.tier2; t3_cost = currentT3 * appSettings.tier3; 
    } 
    
    const consumptionCost = t1_cost + t2_cost + t3_cost; let penaltyCost = (delayMonths >= 2) ? appSettings.penalty : 0; 
    currentBillTotal = isExempt ? 0 : (consumptionCost + maintenance + penaltyCost); 
    
    document.getElementById('row-t1').style.display = currentT1 > 0 ? 'flex' : 'none'; document.getElementById('t1-val').textContent = `${currentT1} m³ = ${t1_cost} درهم`; 
    document.getElementById('row-t2').style.display = currentT2 > 0 ? 'flex' : 'none'; document.getElementById('t2-val').textContent = `${currentT2} m³ = ${t2_cost} درهم`; 
    document.getElementById('row-t3').style.display = currentT3 > 0 ? 'flex' : 'none'; document.getElementById('t3-val').textContent = `${currentT3} m³ = ${t3_cost} درهم`; 
    if (penaltyCost > 0) { document.getElementById('penaltyRow').style.display = 'flex'; document.getElementById('printPenalty').textContent = penaltyCost + ' درهم'; } else { document.getElementById('penaltyRow').style.display = 'none'; } 

    document.getElementById('printMonth').textContent = billingMonth; document.getElementById('printName').textContent = document.getElementById('subscriberName').value; document.getElementById('printCounter').textContent = counterNumInput; document.getElementById('printPrev').textContent = prev; document.getElementById('printCurr').textContent = curr; document.getElementById('printMaintenance').textContent = maintenance + ' درهم'; document.getElementById('consumptionResult').textContent = consumption + ' m³'; document.getElementById('totalPriceResult').textContent = currentBillTotal + ' درهم';
    
    if(isExempt) { document.getElementById('exemptionNotice').style.display = 'block'; } else { document.getElementById('exemptionNotice').style.display = 'none'; }

    document.getElementById('billResult').style.display = 'block'; 
    document.getElementById('billActionsContainer').style.display = 'block'; 
}

// تصدير الفاتورة كصورة
window.downloadBillAsImage = function() {
    const billElement = document.getElementById('billResult');
    // إزالة الشفافية وجعل الخلفية بيضاء صلبة للصورة
    billElement.style.background = '#ffffff'; 
    
    html2canvas(billElement, { scale: 2 }).then(canvas => {
        let link = document.createElement('a');
        link.download = `فاتورة_${document.getElementById('printMonth').textContent}_عداد_${document.getElementById('printCounter').textContent}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        showToast("تم تنزيل الفاتورة كصورة بنجاح");
        billElement.style.background = ''; // استعادة التنسيق
    });
}

async function saveBill(isPaid) { 
    if(currentBillTotal >= 0) { 
        if(!navigator.onLine) return showToast('⚠️ يلزم الاتصال بالإنترنت');
        const counterInput = document.getElementById('counterNum').value.trim(); const curr = parseFloat(document.getElementById('currReading').value) || 0; const prev = parseFloat(document.getElementById('prevReading').value) || 0; const currentMonth = document.getElementById('billingMonth').value; const isExempt = document.getElementById('exemptionCheck').checked; const sub = subscribers.find(s => s.counter == counterInput); 
        
        let isAlreadyBilled = archiveBills.some(b => b.counter == counterInput && b.month === currentMonth);
        if (isAlreadyBilled) { return showToast('❌ خطأ: تم حفظ فاتورة هذا الشهر مسبقاً!'); }

        let userRole = localStorage.getItem('tamda_role') || 'غير معروف';

        let billArchiveObj = { month: currentMonth, counter: counterInput, name: document.getElementById('subscriberName').value, prevReading: prev, currReading: curr, consumption: currentConsumptionData, total: currentBillTotal, status: isPaid ? 'خالصة' : 'دين', isExempt: isExempt, createdBy: userRole, timestamp: new Date().toISOString() }; 
        try { 
            let billRef = await addDoc(collection(db, "archive_bills"), billArchiveObj); billArchiveObj.firestoreId = billRef.id; archiveBills.push(billArchiveObj);
            if (isPaid && currentBillTotal > 0) { 
                let transObj = { month: currentMonth, type: 'income', amount: currentBillTotal, desc: `استخلاص فاتورة ماء - عداد: ${counterInput}`, createdBy: userRole, timestamp: new Date().toISOString() }; 
                let transRef = await addDoc(collection(db, "transactions"), transObj); transObj.firestoreId = transRef.id; transactionsList.push(transObj); archiveFinance.push(transObj); 
            }
            if(sub) await recalculateSubscriberDebt(counterInput);
            saveLocalData(); recalculateFinancials(); showToast('تم حفظ الفاتورة بنجاح'); currentBillTotal = 0; document.getElementById('billResult').style.display = 'none'; document.getElementById('billActionsContainer').style.display = 'none'; autoFillSubscriber(); window.checkUnbilledCounters();
        } catch (e) { showToast('❌ فشل الحفظ'); } 
    }
}

async function recalculateSubscriberDebt(counter) {
    let sub = subscribers.find(s => s.counter == counter); if(!sub) return;
    let unpaid = archiveBills.filter(b => b.counter == counter && b.status === 'دين');
    let debt = 0; let delay = unpaid.length;
    unpaid.forEach(b => { debt += Number(b.total); });
    let allSubBills = archiveBills.filter(b => b.counter == counter).sort((a,b) => a.month.localeCompare(b.month));
    if(allSubBills.length > 0) {
        let last = allSubBills[allSubBills.length - 1];
        sub.lastReading = last.currReading || last.consumption; sub.lastBilledMonth = last.month;
    } else { sub.lastReading = 0; sub.lastBilledMonth = ''; }
    sub.debtAmount = debt; sub.delayMonths = delay;
    if(navigator.onLine) await updateDoc(doc(db, "subscribers", sub.firestoreId), { debtAmount: debt, delayMonths: delay, lastReading: sub.lastReading, lastBilledMonth: sub.lastBilledMonth });
}

window.deleteArchiveBill = async function(id, isEdit = false) { 
    if(!id || id.startsWith('local_')) return;
    if(!isEdit && !confirm('متأكد من الحذف؟')) return;
    try { 
        let bill = archiveBills.find(b => b.firestoreId === id);
        await deleteDoc(doc(db, "archive_bills", id)); 
        archiveBills = archiveBills.filter(b => b.firestoreId !== id); 
        if(bill && (bill.status.includes('خالصة') || bill.status === 'paid')) {
            let trans = transactionsList.find(t => t.desc.includes(bill.counter) && t.month === bill.month && t.amount == bill.total);
            if(trans) { await deleteDoc(doc(db, "transactions", trans.firestoreId)); transactionsList = transactionsList.filter(t => t.firestoreId !== trans.firestoreId); }
        }
        if(bill) await recalculateSubscriberDebt(bill.counter);
        saveLocalData(); recalculateFinancials(); renderArchive(); renderCapital(); renderTransactions(); window.checkUnbilledCounters();
        if(!isEdit) showToast('تم الحذف بنجاح'); 
    } catch(e){ console.error(e); }
}

window.sendWhatsAppNotification = function() {
    const counterInput = document.getElementById('counterNum').value.trim(); const sub = subscribers.find(s => s.counter == counterInput);
    if (!sub || !sub.phone) return showToast('رقم هاتف المنخرط غير مسجل!');
    const currentMonth = document.getElementById('billingMonth').value;
    let msg = `فاتورة ماء تامدة لشهر: ${currentMonth}\n\n👤 المشترك: ${sub.name}\n🔢 رقم العداد: ${sub.counter}\n💧 الاستهلاك: ${currentConsumptionData} m³\n💰 المبلغ الإجمالي: ${currentBillTotal} درهم\n\nالمرجو الأداء وشكراً.`;
    window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* --- سجل العمليات --- */
function renderTransactions() {
    const container = document.getElementById('transactionsListContainer'); if(!container) return; 
    let months = {};
    archiveBills.forEach(b => {
        if(!months[b.month]) months[b.month] = { water: 0, income: 0 };
        months[b.month].water += Number(b.consumption || 0);
    });
    transactionsList.forEach(t => {
        if(!months[t.month]) months[t.month] = { water: 0, income: 0 };
        if(t.type === 'income') months[t.month].income += Number(t.amount || 0);
    });
    donationsList.forEach(d => {
        if(!months[d.month]) months[d.month] = { water: 0, income: 0 };
        months[d.month].income += Number(d.amount || 0);
    });

    container.innerHTML = '';
    let sortedMonths = Object.keys(months).sort().reverse();
    if(sortedMonths.length === 0) return container.innerHTML = '<p class="text-success">لا توجد عمليات مسجلة.</p>';
    
    let html = `<div class="table-responsive"><table class="archive-table"><thead><tr><th>الشهر</th><th>الماء المستهلك</th><th>مداخيل الشهر</th></tr></thead><tbody>`;
    sortedMonths.forEach(m => {
        html += `<tr><td><strong>${m}</strong></td><td style="color:var(--primary-blue); font-weight:bold;">${months[m].water} m³</td><td class="text-success">${months[m].income} درهم</td></tr>`;
    });
    html += `</tbody></table></div>`; container.innerHTML = html;
}

async function saveTransaction() { 
    const month = document.getElementById('transMonth').value; const type = document.getElementById('transType').value; 
    const amount = parseFloat(document.getElementById('transAmount').value) || 0; const desc = document.getElementById('transDesc').value.trim(); 
    if (amount <= 0 || !month) return showToast('أدخل البيانات كاملة'); 
    if (!navigator.onLine) return showToast('⚠️ يلزم الاتصال بالإنترنت لحفظ المعاملة');
    
    let userRole = localStorage.getItem('tamda_role') || 'غير معروف';
    let transactionObj = { month, type, amount, desc, createdBy: userRole, timestamp: new Date().toISOString() }; 
    try {
        let docRef = await addDoc(collection(db, "transactions"), transactionObj); transactionObj.firestoreId = docRef.id; await addDoc(collection(db, "archive_finance"), transactionObj); 
        transactionsList.push(transactionObj); archiveFinance.push(transactionObj); 
        recalculateFinancials(); saveLocalData(); document.getElementById('transAmount').value = ''; document.getElementById('transDesc').value = ''; showToast('تم تسجيل العملية المالية بنجاح'); renderTransactions(); renderCapital();
    } catch(e) { showToast('❌ حدث خطأ في الحفظ'); }
}

/* --- تقارير الصندوق --- */
window.addManualCapital = async function() {
    let amtStr = prompt("أدخل المبلغ المراد إضافته يدوياً للصندوق:"); if(!amtStr) return;
    let amount = parseFloat(amtStr); if(isNaN(amount) || amount <= 0) return;
    let desc = prompt("أدخل سبب الإضافة:", "إضافة يدوية للرصيد");
    let ledgerEntry = { date: new Date().toLocaleDateString('ar-MA'), type: 'manual', amount: amount, desc: desc, timestamp: new Date().toISOString() };
    try {
        let docRef = await addDoc(collection(db, "capital_ledger"), ledgerEntry); ledgerEntry.firestoreId = docRef.id;
        capitalLedger.push(ledgerEntry); saveLocalData(); recalculateFinancials(); renderCapital(); showToast("تم إضافة الرصيد بنجاح");
    } catch(e) {}
}

function renderCapital() {
    const container = document.getElementById('capitalLedgerContainer'); 
    const monthlyContainer = document.getElementById('monthlyIncomeContainer');
    if(!container) return;
    
    document.getElementById('mainCapitalAmount').textContent = window.actualTotalCapital + " درهم";
    container.innerHTML = '';
    let manuals = capitalLedger.filter(c => c.type === 'manual').sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    manuals.forEach(item => {
        container.innerHTML += `<div class="list-item" style="border-right-color: var(--primary-blue);"><div class="list-info"><strong style="color: var(--primary-blue);">${item.amount} درهم</strong><span>${item.desc} | ${item.date}</span></div><div><button class="action-btn no-print" onclick="deleteCapitalEntry('${item.firestoreId}')">حذف</button></div></div>`;
    });
    if(manuals.length === 0) container.innerHTML = '<p class="text-success">لا توجد إضافات يدوية مسجلة.</p>';

    if(monthlyContainer) {
        let months = {};
        transactionsList.forEach(t => {
            if(!months[t.month]) months[t.month] = { income: 0, expense: 0 };
            if(t.type === 'income') months[t.month].income += Number(t.amount);
            if(t.type === 'expense') months[t.month].expense += Number(t.amount);
        });
        donationsList.forEach(d => {
            if(!months[d.month]) months[d.month] = { income: 0, expense: 0 };
            months[d.month].income += Number(d.amount);
        });

        let sortedMonths = Object.keys(months).sort().reverse();
        let tableHtml = `<div class="table-responsive"><table class="archive-table"><thead><tr><th>الشهر</th><th>المداخيل (درهم)</th><th>المصاريف (درهم)</th><th>الصافي</th></tr></thead><tbody>`;
        sortedMonths.forEach(m => {
            let net = months[m].income - months[m].expense;
            tableHtml += `<tr><td><strong>${m}</strong></td><td class="text-success">${months[m].income}</td><td class="text-danger">${months[m].expense}</td><td style="font-weight:bold; color:${net >= 0 ? 'var(--accent-green)' : 'var(--danger-red)'}">${net}</td></tr>`;
        });
        tableHtml += `</tbody></table></div>`;
        monthlyContainer.innerHTML = tableHtml;
    }
}

window.deleteCapitalEntry = async function(id) { 
    if(!confirm('متأكد من حذف هذه الإضافة اليدوية؟')) return;
    await deleteDoc(doc(db, "capital_ledger", id)); capitalLedger = capitalLedger.filter(c => c.firestoreId !== id); saveLocalData(); recalculateFinancials(); renderCapital(); 
}

/* --- الإحصائيات والتقرير السنوي --- */
window.toggleStatInputs = function() {
    const type = document.getElementById('statTypeSelect').value;
    document.getElementById('monthInputGroup').style.display = type === 'monthly' ? 'block' : 'none';
    document.getElementById('yearInputGroup').style.display = type === 'yearly' ? 'block' : 'none';
    renderAdvancedStats();
}

window.renderAdvancedStats = function() {
    const container = document.getElementById('statsContainer'); if(!container) return;
    const type = document.getElementById('statTypeSelect').value;
    let filteredBills = []; let title = "";

    if (type === 'monthly') {
        const month = document.getElementById('statsMonthSelect').value;
        if (!month) return container.innerHTML = '<p class="text-danger" style="text-align:center;">يرجى اختيار الشهر أعلاه.</p>';
        filteredBills = archiveBills.filter(b => b.month === month);
        title = `نتائج شهر: ${month}`;
    } else {
        const year = document.getElementById('statsYearSelect').value;
        if (!year) return container.innerHTML = '<p class="text-danger" style="text-align:center;">يرجى كتابة السنة أعلاه.</p>';
        filteredBills = archiveBills.filter(b => b.month.startsWith(year));
        title = `نتائج سنة: ${year}`;
    }

    let tConsumption = 0, tExpected = 0, tCollected = 0, tDebt = 0;
    filteredBills.forEach(b => {
        tConsumption += Number(b.consumption || 0);
        tExpected += Number(b.total || 0);
        if(b.status.includes('خالصة')) tCollected += Number(b.total || 0); else tDebt += Number(b.total || 0);
    });

    container.innerHTML = `
        <h4 style="text-align:center; color:var(--primary-blue); margin-bottom:15px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">${title}</h4>
        <div class="stat-grid">
            <div class="stat-card" style="border-color:var(--secondary-cyan);"><h3>${tConsumption} m³</h3><p>مجموع الاستهلاك</p></div>
            <div class="stat-card" style="border-color:var(--primary-blue);"><h3>${tExpected} درهم</h3><p>المداخيل المتوقعة</p></div>
            <div class="stat-card" style="border-color:var(--accent-green);"><h3 class="text-success">${tCollected} درهم</h3><p>المداخيل المحصلة</p></div>
            <div class="stat-card" style="border-color:var(--danger-red);"><h3 class="text-danger">${tDebt} درهم</h3><p>الديون المتأخرة</p></div>
        </div>
    `;
}

window.generateAnnualReport = function() {
    const year = document.getElementById('statsYearSelect').value;
    if(!year) return showToast('المرجو كتابة السنة أولاً');
    
    // فلترة بناء على السنة
    let yearBills = archiveBills.filter(b => b.month.startsWith(year));
    let yearTrans = transactionsList.filter(t => t.month.startsWith(year));
    let yearDonations = donationsList.filter(d => d.month.startsWith(year));
    
    let totalWater = 0, expectedIncome = 0;
    yearBills.forEach(b => { totalWater += Number(b.consumption); expectedIncome += Number(b.total); });
    
    let totalIncome = 0, totalExpense = 0;
    yearTrans.forEach(t => { if(t.type === 'income') totalIncome += Number(t.amount); else totalExpense += Number(t.amount); });
    let totalDon = 0; yearDonations.forEach(d => totalDon += Number(d.amount));
    
    let printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html dir="rtl" lang="ar"><head><title>التقرير السنوي - ${year}</title>
        <style>body{font-family: Arial; padding: 20px; line-height: 1.6;} h1, h2, h3{color: #1e3c72; text-align: center;} table{width: 100%; border-collapse: collapse; margin-bottom: 20px;} th, td{border: 1px solid #000; padding: 10px; text-align: center;}</style>
        </head><body>
        <h1>جمعية تامدة لتسيير ماء الشرب</h1>
        <h2>التقرير الأدبي والمالي لسنة ${year}</h2><hr>
        <h3>1. التقرير الأدبي (إحصائيات الاستهلاك)</h3>
        <ul><li>إجمالي الماء المستهلك والمضخوخ: <strong>${totalWater} m³</strong></li><li>عدد المنخرطين المسجلين بالشبكة: <strong>${subscribers.length} منخرط</strong></li></ul>
        <h3>2. التقرير المالي (الخزينة)</h3>
        <table><tr><th>البيان</th><th>المبلغ (درهم)</th></tr>
        <tr><td>مجموع المداخيل المحصلة من الفواتير</td><td>${totalIncome}</td></tr>
        <tr><td>مجموع التبرعات</td><td>${totalDon}</td></tr>
        <tr><td><strong>إجمالي المداخيل</strong></td><td><strong>${totalIncome + totalDon}</strong></td></tr>
        <tr><td style="color:red;"><strong>إجمالي المصاريف</strong></td><td style="color:red;"><strong>${totalExpense}</strong></td></tr>
        <tr><td style="font-size:1.2rem; font-weight:bold;">الرصيد الصافي المتبقي من السنة</td><td style="font-size:1.2rem; font-weight:bold; color:green;">${(totalIncome + totalDon) - totalExpense}</td></tr>
        </table>
        <p style="text-align:left; margin-top:50px;">التوقيع:</p>
        <script>window.print();</script></body></html>
    `);
}

/* --- سجل التتبع والأرشيف --- */
function renderArchive() { 
    const container = document.getElementById('archiveContainer'); if(!container) return; container.innerHTML = ''; 
    let allMonths = new Set(); archiveBills.forEach(b => allMonths.add(b.month)); archiveFinance.forEach(f => allMonths.add(f.month)); 
    let sortedMonths = Array.from(allMonths).sort().reverse(); 
    if(sortedMonths.length === 0) return container.innerHTML = '<p>لا توجد بيانات مسجلة.</p>';
    
    sortedMonths.forEach(month => { 
        let monthBills = archiveBills.filter(b => b.month === month); 
        let monthFinance = archiveFinance.filter(f => f.month === month); 
        monthBills.sort((a, b) => Number(a.counter) - Number(b.counter)); 
        
        let monthTotalWater = 0, monthTotalAmount = 0; 
        monthBills.forEach(b => { monthTotalWater += Number(b.consumption || 0); monthTotalAmount += Number(b.total || 0); }); 
        
        const box = document.createElement('div'); box.className = 'archive-month-box printable-archive'; 
        let html = `<h4>📅 أرشيف شهر: ${month}</h4><div style="display:flex; gap:20px; margin-bottom:10px; background:var(--card-bg); padding:8px; border-radius:6px; border:1px solid var(--border-color);"><span>الاستهلاك: <strong>${monthTotalWater} m³</strong></span><span>المبالغ المحصلة: <strong class="text-success">${monthTotalAmount} درهم</strong></span></div>`; 
        
        if(monthBills.length > 0) { 
            html += `<div class="table-responsive"><table class="archive-table"><thead><tr><th>رقم العداد والاسم</th><th>الاستهلاك (m³)</th><th>الثمن (درهم)</th><th>الوضع</th><th class="no-print">حذف</th></tr></thead><tbody>`; 
            monthBills.forEach(b => { 
                let subscriberName = b.name || 'غير مسجل';
                let editorBadge = b.createdBy ? `<br><small style="color:#888;">(بواسطة: ${roleNames[b.createdBy] || b.createdBy})</small>` : '';
                html += `<tr><td><strong>${b.counter}</strong> - ${subscriberName} ${editorBadge}</td><td>${b.consumption}</td><td>${b.total}</td><td>${b.status}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveBill('${b.firestoreId}')">حذف</button></td></tr>`; 
            }); 
            html += `</tbody></table></div>`; 
        } 
        
        html += `<h5 style="margin: 15px 0 5px 0;">💰 العمليات المالية:</h5>`; 
        if(monthFinance.length > 0) { 
            html += `<div class="table-responsive"><table class="archive-table"><thead><tr><th>النوع</th><th>المبلغ (درهم)</th><th>الوصف</th><th class="no-print">حذف</th></tr></thead><tbody>`; 
            monthFinance.forEach(f => { 
                html += `<tr><td class="${f.type === 'income' ? 'text-success' : 'text-danger'}">${f.type === 'income' ? 'مدخول' : 'مصروف'}</td><td>${f.amount}</td><td>${f.desc}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveFinance('${f.firestoreId}')">حذف</button></td></tr>`; 
            }); 
            html += `</tbody></table></div>`; 
        } 
        box.innerHTML = html; container.appendChild(box); 
    }); 
}

window.deleteArchiveFinance = async function(id) { 
    if(!id || id.startsWith('local_')) return;
    if(confirm('متأكد من الحذف؟')) { 
        await deleteDoc(doc(db, "archive_finance", id)); await deleteDoc(doc(db, "transactions", id)).catch(()=>{}); 
        archiveFinance = archiveFinance.filter(f => f.firestoreId !== id); transactionsList = transactionsList.filter(t => t.firestoreId !== id); saveLocalData(); recalculateFinancials(); renderArchive(); renderTransactions(); renderCapital();
    } 
}

function renderAuditTrail() {
    let container = document.getElementById('standaloneMemberActivity');
    if(!container) return;
    let trail = transactionsList.filter(t => t.createdBy).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50); // آخر 50 عملية
    
    if(trail.length === 0) return container.innerHTML = '<p>لا يوجد نشاط مسجل للأعضاء بعد.</p>';
    
    let html = `<div class="table-responsive"><table class="archive-table"><thead><tr><th>التاريخ</th><th>العضو</th><th>العملية</th></tr></thead><tbody>`;
    trail.forEach(t => {
        let date = new Date(t.timestamp).toLocaleString('ar-MA');
        html += `<tr><td style="direction:ltr;">${date}</td><td><strong>${roleNames[t.createdBy] || t.createdBy}</strong></td><td>تسجيل ${t.type==='income'?'مدخول':'مصروف'}: ${t.desc}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

/* --- سجل التبرعات والديون المفلترة --- */
async function saveDonation() { 
    const month = document.getElementById('donationMonth').value; const name = document.getElementById('donationName').value.trim(); const amount = parseFloat(document.getElementById('donationAmount').value) || 0; 
    if (amount <= 0 || !month || !name) return showToast('أدخل البيانات كاملة'); 
    let donObj = { month, name, amount, timestamp: new Date().toISOString() }; 
    try {
        let docRef = await addDoc(collection(db, "donations"), donObj); donObj.firestoreId = docRef.id; donationsList.push(donObj); 
        recalculateFinancials(); saveLocalData(); document.getElementById('donationName').value = ''; document.getElementById('donationAmount').value = ''; showToast('تم تسجيل التبرع'); renderDonations(); renderTransactions(); renderCapital();
    } catch (e) { showToast('❌ حدث خطأ'); }
}

function renderDonations() { 
    const container = document.getElementById('donationsListContainer'); if(!container) return; container.innerHTML = ''; 
    if(donationsList.length === 0) return container.innerHTML = '<p class="text-success">لا توجد تبرعات مسجلة حتى الآن.</p>'; 
    let html = `<div class="table-responsive"><table class="archive-table"><thead><tr><th>الشهر</th><th>اسم المحسن(ة)</th><th>المبلغ</th><th class="no-print">حذف</th></tr></thead><tbody>`; 
    donationsList.slice().reverse().forEach((d) => { 
        html += `<tr><td>${d.month}</td><td>${d.name}</td><td class="text-success">+ ${d.amount} درهم</td><td class="no-print"><button class="action-btn" onclick="deleteDonation('${d.firestoreId}')">حذف</button></td></tr>`; 
    }); 
    html += `</tbody></table></div>`; container.innerHTML = html; 
}

window.deleteDonation = async function(id) { 
    if(confirm('متأكد من حذف التبرع؟')) { 
        await deleteDoc(doc(db, "donations", id)); donationsList = donationsList.filter(d => d.firestoreId !== id); recalculateFinancials(); saveLocalData(); renderDonations(); renderTransactions(); renderCapital(); showToast('تم الحذف بنجاح');
    } 
}

window.renderDebts = function() {
    const container = document.getElementById('debtsListContainer'); if(!container) return; container.innerHTML = ''; 
    const sortType = document.getElementById('debtSortSelect') ? document.getElementById('debtSortSelect').value : 'counter';
    
    let debtors = subscribers.filter(s => Number(s.debtAmount) > 0);
    
    if (sortType === 'counter') { debtors.sort((a, b) => Number(a.counter) - Number(b.counter)); }
    else if (sortType === 'highest') { debtors.sort((a, b) => Number(b.debtAmount) - Number(a.debtAmount)); } // من الأكبر للأصغر
    else if (sortType === 'oldest') { debtors.sort((a, b) => Number(b.delayMonths) - Number(a.delayMonths)); } // الأكثر أشهر تأخير
    
    if(debtors.length === 0) return container.innerHTML = '<p class="text-success" style="font-weight:bold;">لا توجد ديون مسجلة حالياً.</p>'; 
    
    debtors.forEach((sub) => { 
        const div = document.createElement('div'); div.className = 'list-item'; div.style.borderRightColor = 'var(--danger-red)'; 
        div.innerHTML = `<div class="list-info"><strong style="color:var(--danger-red);">عداد (${sub.counter}): ${sub.name}</strong><span>المبلغ المتبقي: <strong>${sub.debtAmount} درهم</strong> | تأخير: ${sub.delayMonths} أشهر</span></div><div><button class="pay-btn" onclick="collectDebt('${sub.firestoreId}', ${sub.debtAmount}, '${sub.counter}')">💵 استخلاص</button></div>`; 
        container.appendChild(div); 
    });
}

window.collectDebt = async function(firestoreId, amount, counter) { 
    if(confirm(`تأكيد استخلاص مبلغ الدين (${amount} درهم)؟`)) { 
        try {
            let sub = subscribers.find(s => s.firestoreId === firestoreId); if(sub) { sub.debtAmount = 0; sub.delayMonths = 0; } 
            let nowMonth = new Date().toISOString().slice(0, 7); 
            let userRole = localStorage.getItem('tamda_role') || '';
            let newTrans = { month: nowMonth, type: 'income', amount: Number(amount), desc: `استخلاص دين متأخر - عداد: ${counter}`, createdBy: userRole, timestamp: new Date().toISOString() }; 
            let transRef = await addDoc(collection(db, "transactions"), newTrans); newTrans.firestoreId = transRef.id;
            let unpaidBills = archiveBills.filter(b => b.counter == counter && b.status === 'دين');
            for (let b of unpaidBills) { b.status = 'خالصة'; if(b.firestoreId) await updateDoc(doc(db, "archive_bills", b.firestoreId), { status: 'خالصة' }); }
            await updateDoc(doc(db, "subscribers", firestoreId), { debtAmount: 0, delayMonths: 0 }); 
            transactionsList.push(newTrans); recalculateFinancials(); saveLocalData(); showToast('تم الاستخلاص بنجاح!'); renderDebts(); renderTransactions(); renderCapital(); renderArchive();
        } catch(e) { showToast('❌ فشل الاستخلاص'); }
    } 
}

/* --- القانون والوثائق --- */
window.saveBylaws = function() {
    const text = document.getElementById('bylawInput').value;
    localStorage.setItem('tamda_bylaws', text);
    showToast('تم حفظ نص القانون الأساسي بنجاح!');
}

window.saveDocument = async function() {
    let name = document.getElementById('docName').value.trim();
    let url = document.getElementById('docUrl').value.trim();
    if(!name || !url) return showToast("يرجى إدخال اسم ورابط الوثيقة");
    if(!navigator.onLine) return showToast("⚠️ يلزم الإنترنت");
    
    let docObj = { name: name, url: url, timestamp: new Date().toISOString() };
    try {
        let ref = await addDoc(collection(db, "documents"), docObj); docObj.firestoreId = ref.id; pdfReportsList.push(docObj);
        saveLocalData(); renderDocuments();
        document.getElementById('docName').value = ''; document.getElementById('docUrl').value = ''; showToast("تم إضافة الوثيقة بنجاح!");
    } catch(e) { showToast("❌ فشل الإضافة"); }
}

window.deleteDocument = async function(id) {
    if(confirm("هل تريد حذف هذه الوثيقة؟")) {
        await deleteDoc(doc(db, "documents", id)); pdfReportsList = pdfReportsList.filter(d => d.firestoreId !== id); saveLocalData(); renderDocuments();
    }
}

function renderDocuments() {
    let container = document.getElementById('pdfReportsContainer'); if(!container) return; container.innerHTML = '';
    if(pdfReportsList.length === 0) { container.innerHTML = '<p class="text-success">لا توجد وثائق محفوظة حالياً.</p>'; return; }
    pdfReportsList.forEach(d => {
        container.innerHTML += `<div class="list-item" style="border-right-color: var(--secondary-cyan);">
            <div class="list-info"><a href="${d.url}" target="_blank" style="color:var(--primary-blue); font-weight:bold; font-size:1.1rem; text-decoration:none;">📄 ${d.name}</a></div>
            <div><button class="action-btn no-print" onclick="deleteDocument('${d.firestoreId}')">🗑️ حذف</button></div>
        </div>`;
    });
}

function renderAdminComplaints() { document.getElementById('complaintsListContainer').innerHTML = '<p class="text-success">لا توجد شكايات مسجلة حالياً.</p>'; }

function renderSubPortalBills() {
    const container = document.getElementById('portalBillsContainer'); if(!container) return;
    const subCounter = localStorage.getItem('tamda_counter'); if(!subCounter) return;
    let bills = archiveBills.filter(b => b.counter == subCounter).sort((a,b) => b.month.localeCompare(a.month));
    if(bills.length === 0) { container.innerHTML = '<p>لا توجد فواتير مسجلة بعد.</p>'; return; }
    let html = `<div class="table-responsive"><table class="archive-table"><thead><tr><th>الشهر</th><th>الاستهلاك</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>`;
    bills.forEach(b => {
        let statusColor = b.status.includes('خالصة') ? 'var(--accent-green)' : 'var(--danger-red)';
        html += `<tr><td>${b.month}</td><td>${b.consumption} m³</td><td>${b.total} درهم</td><td style="color:${statusColor}; font-weight:bold;">${b.status}</td></tr>`;
    });
    html += `</tbody></table></div>`; container.innerHTML = html;
}

window.checkAuth = checkAuth; window.handleEnter = handleEnter; window.authenticate = authenticate; window.logout = logout; window.toggleSidebar = toggleSidebar; window.showToast = showToast; window.navigateTo = navigateTo; window.printDonations = printDonations; window.printThermalBill = printThermalBill; window.saveSubscriber = saveSubscriber; window.autoFillSubscriber = autoFillSubscriber; window.calculateBill = calculateBill; window.saveBill = saveBill; window.saveTransaction = saveTransaction; window.saveSettings = saveSettings; window.saveDonation = saveDonation; window.sendWhatsAppNotification = sendWhatsAppNotification;
