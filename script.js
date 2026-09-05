import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
const storage = getStorage(app);

let secureCodes = JSON.parse(localStorage.getItem('tamda_codes')) || { 'admin': '1111' };
const roleNames = { 'admin': 'إدارة الجمعية', 'subscriber': 'المنخرط' };

let totalIncome = 0; let totalExpense = 0; let totalDonationsIncome = 0; let actualTotalCapital = 0;
let currentBillTotal = 0; let currentConsumptionData = 0;
let dashboardChartInstance = null; let perfChartInstance = null; let consChartInstance = null;

let subscribers = []; let complaintsList = []; let transactionsList = []; let donationsList = []; 
let archiveBills = []; let archiveFinance = []; let capitalLedger = []; let pdfReportsList = []; let majorExpensesList = [];
let appSettings = { tier1: 4, tier2: 8, tier3: 15, maintenance: 15, penalty: 50 }; 

const SESSION_TIMEOUT = 3 * 60 * 1000; 
const views = {
    '🏠 لوحة القيادة': 'view-dashboard', '👥 إدارة المنخرطين': 'view-subscribers', '💧 إدارة ماء الشرب': 'view-water', 
    '📊 الإحصائيات الشهرية': 'view-stats', '📊 التقارير المالية': 'view-reports', '💰 ملخص العمليات الشهرية': 'view-finance',
    '🏢 المصاريف الكبرى': 'view-major-expenses', '💖 سجل الدعم والتبرعات': 'view-donations', '📈 مؤشرات الأداء': 'view-indicators',
    '📒 الديون والأرصدة': 'view-debts', '📥 الشكايات والطلبات': 'view-complaints', '📜 القانون والتقارير': 'view-bylaws', 
    '🗄️ الأرشيف والتخزين': 'view-archive', '👥 نشاط الأعضاء': 'view-member-activity', '⚙️ الإعدادات': 'view-settings', '👤 فواتيري وطلباتي': 'view-sub-portal'
};

document.addEventListener('DOMContentLoaded', () => {
    loadLocalData(); loadSettings(); checkAuth(); 
    if(localStorage.getItem('tamda_bylaws')) document.getElementById('bylawInput').value = localStorage.getItem('tamda_bylaws');
    if(localStorage.getItem('tamda_darkmode') === 'true') document.body.classList.add('dark-mode');
    
    let now = new Date(); let m = String(now.getMonth() + 1).padStart(2, '0');
    if(document.getElementById('billingMonth')) document.getElementById('billingMonth').value = now.getFullYear() + "-" + m;

    window.addEventListener('online', () => updateOnlineStatus(true));
    window.addEventListener('offline', () => updateOnlineStatus(false));
    updateOnlineStatus(navigator.onLine);
    if(navigator.onLine) loadDataFromCloud();
    ['click', 'touchstart', 'keypress', 'scroll'].forEach(evt => document.addEventListener(evt, updateLastActive));
    setInterval(checkSessionTimeout, 10000);
});

/* Utilities */
function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
function updateOnlineStatus(isOnline) { const el = document.getElementById('connectionStatus'); el.textContent = isOnline ? "متصل (Online)" : "غير متصل (Offline)"; el.style.background = isOnline ? "#25D366" : "#c1272d"; }
function updateLastActive() { if(localStorage.getItem('tamda_auth') === 'true') localStorage.setItem('tamda_last_active', Date.now()); }
function checkSessionTimeout() { if(localStorage.getItem('tamda_auth') === 'true') { let last = parseInt(localStorage.getItem('tamda_last_active')||'0'); if(last > 0 && (Date.now() - last > SESSION_TIMEOUT)) window.logout(); } }

function checkAuth() {
    let isAuth = localStorage.getItem('tamda_auth') === 'true';
    if(isAuth) {
        document.getElementById('loginScreen').style.display = 'none'; document.getElementById('appContent').style.display = 'block'; localStorage.setItem('tamda_last_active', Date.now());
        if (localStorage.getItem('tamda_role') === 'subscriber') {
            document.getElementById('adminLinks').style.display = 'none'; document.getElementById('subscriberLinks').style.display = 'block';
            document.getElementById('activeUserLabel').textContent = "بوابة المشتركين (عداد: " + localStorage.getItem('tamda_counter') + ")"; 
            if(document.getElementById('portalSubName')) document.getElementById('portalSubName').textContent = localStorage.getItem('tamda_subname') || '';
            if(document.getElementById('portalSubCounter')) document.getElementById('portalSubCounter').textContent = localStorage.getItem('tamda_counter') || '';
            window.navigateTo('👤 فواتيري وطلباتي');
        } else {
            document.getElementById('adminLinks').style.display = 'block'; document.getElementById('subscriberLinks').style.display = 'none';
            document.getElementById('activeUserLabel').textContent = "مرحباً: إدارة الجمعية"; window.navigateTo('🏠 لوحة القيادة'); renderCapital();
        }
    } else { document.getElementById('loginScreen').style.display = 'flex'; document.getElementById('appContent').style.display = 'none'; }
}

async function loadDataFromCloud() {
    showLoading();
    try {
        const collections = ['subscribers', 'transactions', 'archive_bills', 'archive_finance', 'donations', 'capital_ledger', 'documents', 'complaints', 'major_expenses'];
        const dataMaps = [subscribers, transactionsList, archiveBills, archiveFinance, donationsList, capitalLedger, pdfReportsList, complaintsList, majorExpensesList];
        
        for (let i = 0; i < collections.length; i++) {
            const snap = await getDocs(collection(db, collections[i]));
            dataMaps[i].length = 0;
            snap.forEach(d => dataMaps[i].push({ ...d.data(), firestoreId: d.id }));
        }
        subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));
        saveLocalData(); recalculateFinancials();
        
        if(localStorage.getItem('tamda_auth') === 'true' && localStorage.getItem('tamda_role') === 'admin') {
            renderSubscribers(); renderTransactions(); renderCapital(); renderArchive(); renderDebts(); renderDashboard(); renderMajorExpenses();
        }
    } catch (e) { console.error("Fetch Error:", e); }
    hideLoading();
}

function saveLocalData() {
    localStorage.setItem('local_subs', JSON.stringify(subscribers)); localStorage.setItem('local_trans', JSON.stringify(transactionsList));
    localStorage.setItem('local_donations', JSON.stringify(donationsList)); localStorage.setItem('local_bills', JSON.stringify(archiveBills));
    localStorage.setItem('local_fin', JSON.stringify(archiveFinance)); localStorage.setItem('local_complaints', JSON.stringify(complaintsList));
    localStorage.setItem('local_capital', JSON.stringify(capitalLedger)); localStorage.setItem('local_docs', JSON.stringify(pdfReportsList));
    localStorage.setItem('local_major', JSON.stringify(majorExpensesList));
}
function loadLocalData() {
    subscribers = JSON.parse(localStorage.getItem('local_subs')) || []; transactionsList = JSON.parse(localStorage.getItem('local_trans')) || [];
    donationsList = JSON.parse(localStorage.getItem('local_donations')) || []; archiveBills = JSON.parse(localStorage.getItem('local_bills')) || [];
    archiveFinance = JSON.parse(localStorage.getItem('local_fin')) || []; complaintsList = JSON.parse(localStorage.getItem('local_complaints')) || [];
    capitalLedger = JSON.parse(localStorage.getItem('local_capital')) || []; pdfReportsList = JSON.parse(localStorage.getItem('local_docs')) || [];
    majorExpensesList = JSON.parse(localStorage.getItem('local_major')) || [];
    recalculateFinancials();
}
function loadSettings() { let saved = JSON.parse(localStorage.getItem('tamda_settings')); if(saved) appSettings = Object.assign(appSettings, saved); }

function recalculateFinancials() {
    let transIncome = 0; totalExpense = 0; totalDonationsIncome = 0; let manualCap = 0; let majorExpTotal = 0;
    transactionsList.forEach(t => { if(t.type === 'income') transIncome += Number(t.amount); else totalExpense += Number(t.amount); });
    donationsList.forEach(d => totalDonationsIncome += Number(d.amount));
    capitalLedger.forEach(c => { if(c.type === 'manual') manualCap += Number(c.amount); });
    majorExpensesList.forEach(e => majorExpTotal += Number(e.amount));
    totalIncome = transIncome + totalDonationsIncome;
    actualTotalCapital = totalIncome + manualCap - totalExpense - majorExpTotal;
}

/* === Window Binding === */
window.toggleLoginCounter = () => { document.getElementById('loginCounter').style.display = document.getElementById('userRole').value === 'subscriber' ? 'block' : 'none'; };
window.handleEnter = (e) => { if (e.key === 'Enter') window.authenticate(); };
window.toggleSidebar = () => { document.getElementById('sidebar').classList.toggle('active'); document.getElementById('overlay').classList.toggle('active'); };
window.toggleDarkMode = () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('tamda_darkmode', document.body.classList.contains('dark-mode')); if(dashboardChartInstance) renderCharts(); if(perfChartInstance) renderIndicators(); };
window.logout = () => { localStorage.clear(); checkAuth(); document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); };

window.authenticate = () => {
    const role = document.getElementById('userRole').value; const code = document.getElementById('loginCode').value.trim(); const err = document.getElementById('loginError');
    if (role === 'subscriber') {
        const counter = document.getElementById('loginCounter').value.trim();
        let sub = subscribers.find(s => String(s.counter) === counter && s.pin === code);
        if(sub) { localStorage.setItem('tamda_auth', 'true'); localStorage.setItem('tamda_role', 'subscriber'); localStorage.setItem('tamda_counter', counter); localStorage.setItem('tamda_subname', sub.name); err.style.display = 'none'; checkAuth(); showToast('مرحباً بك!'); } 
        else { err.style.display = 'block'; err.textContent = 'البيانات غير صحيحة!'; }
    } else {
        if(secureCodes['admin'] === code) { localStorage.setItem('tamda_auth', 'true'); localStorage.setItem('tamda_role', 'admin'); err.style.display = 'none'; checkAuth(); showToast('تم الدخول'); } 
        else { err.style.display = 'block'; err.textContent = 'الرمز السري للإدارة غير صحيح!'; }
    }
}

window.navigateTo = (page) => {
    document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active');
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    if(views[page] && document.getElementById(views[page])) {
        document.getElementById(views[page]).style.display = 'block';
        if(page === '🏠 لوحة القيادة') renderDashboard(); if(page === '👥 إدارة المنخرطين') window.renderSubscribers();
        if(page === '💧 إدارة ماء الشرب') window.checkUnbilledCounters(); if(page === '⚙️ الإعدادات') loadSettingsToInputs();
        if(page === '📒 الديون والأرصدة') window.renderDebts(); if(page === '💰 ملخص العمليات الشهرية') window.renderTransactions();
        if(page === '💖 سجل الدعم والتبرعات') window.renderDonations(); if(page === '🗄️ الأرشيف والتخزين') window.renderArchive();
        if(page === '📊 التقارير المالية') renderCapital(); if(page === '📥 الشكايات والطلبات') window.renderAdminComplaints();
        if(page === '📜 القانون والتقارير') window.renderDocuments(); if(page === '👥 نشاط الأعضاء') window.renderAuditTrail();
        if(page === '🏢 المصاريف الكبرى') window.renderMajorExpenses(); if(page === '📈 مؤشرات الأداء') window.renderIndicators();
        if(page === '👤 فواتيري وطلباتي') window.renderSubPortalBills();
    }
}
function renderDashboard() {
    if(document.getElementById('dashSubCount')) document.getElementById('dashSubCount').textContent = subscribers.length;
    let debts = 0; subscribers.forEach(s => debts += Number(s.debtAmount || 0)); 
    if(document.getElementById('dashDebts')) document.getElementById('dashDebts').textContent = debts + ' درهم';
}

/* === المصاريف الكبرى ورفع الملفات === */
window.saveMajorExpense = async () => {
    let date = document.getElementById('majorDate').value; let desc = document.getElementById('majorDesc').value; let amount = parseFloat(document.getElementById('majorAmount').value); let fileInput = document.getElementById('majorFile').files[0];
    if(!date || !desc || !amount) return showToast('يرجى ملء جميع البيانات');
    if(!navigator.onLine) return showToast('يلزم الاتصال بالإنترنت');
    showLoading(); let fileUrl = "";
    try {
        if(fileInput) { const storageRef = ref(storage, `major_expenses/${Date.now()}_${fileInput.name}`); await uploadBytes(storageRef, fileInput); fileUrl = await getDownloadURL(storageRef); }
        let obj = { date, desc, amount, fileUrl, timestamp: new Date().toISOString() };
        let docRef = await addDoc(collection(db, "major_expenses"), obj); obj.firestoreId = docRef.id; majorExpensesList.push(obj);
        saveLocalData(); recalculateFinancials(); window.renderMajorExpenses(); renderCapital();
        document.getElementById('majorDate').value=''; document.getElementById('majorDesc').value=''; document.getElementById('majorAmount').value=''; document.getElementById('majorFile').value='';
        showToast('تم الخصم من الصندوق وحفظ العملية');
    } catch(e) { showToast('خطأ أثناء الحفظ'); } hideLoading();
}
window.renderMajorExpenses = () => {
    let container = document.getElementById('majorExpensesContainer'); if(!container) return; container.innerHTML = '';
    if(majorExpensesList.length === 0) return container.innerHTML = '<p>لا توجد مصاريف كبرى.</p>';
    majorExpensesList.forEach(e => {
        let link = e.fileUrl ? `<a href="${e.fileUrl}" target="_blank" style="color:var(--primary-blue); text-decoration:underline;">📄 المرفق</a>` : 'بدون مرفق';
        container.innerHTML += `<div class="list-item" style="border-right-color:var(--danger-red);"><div class="list-info"><strong class="text-danger">${e.amount} درهم</strong><span>${e.desc} | ${e.date}</span><span>${link}</span></div><button class="action-btn no-print" onclick="window.deleteMajorExpense('${e.firestoreId}')">حذف</button></div>`;
    });
}
window.deleteMajorExpense = async (id) => {
    if(confirm('سيتم إلغاء المصروف وإرجاع مبلغه للصندوق. متأكد؟')) {
        showLoading(); await deleteDoc(doc(db, "major_expenses", id)); majorExpensesList = majorExpensesList.filter(e => e.firestoreId !== id);
        saveLocalData(); recalculateFinancials(); window.renderMajorExpenses(); renderCapital(); hideLoading(); showToast('تم الحذف');
    }
}

/* === الوثائق === */
window.saveDocument = async () => {
    let name = document.getElementById('docName').value.trim(); let url = document.getElementById('docUrl').value.trim(); let fileInput = document.getElementById('docUploadFile').files[0];
    if(!name) return showToast('أدخل اسم الوثيقة'); if(!navigator.onLine) return showToast('يلزم الإنترنت'); showLoading();
    try {
        if(fileInput) { const storageRef = ref(storage, `documents/${Date.now()}_${fileInput.name}`); await uploadBytes(storageRef, fileInput); url = await getDownloadURL(storageRef); }
        if(!url) { hideLoading(); return showToast('يرجى اختيار ملف أو وضع رابط'); }
        let docObj = { name, url, timestamp: new Date().toISOString() }; let refDoc = await addDoc(collection(db, "documents"), docObj); docObj.firestoreId = refDoc.id; pdfReportsList.push(docObj);
        saveLocalData(); window.renderDocuments(); document.getElementById('docName').value=''; document.getElementById('docUrl').value=''; document.getElementById('docUploadFile').value=''; showToast("تم الحفظ بنجاح");
    } catch(e) { showToast("فشل الحفظ."); } hideLoading();
}
window.deleteDocument = async (id) => { if(confirm("حذف الوثيقة؟")) { await deleteDoc(doc(db, "documents", id)); pdfReportsList = pdfReportsList.filter(d => d.firestoreId !== id); saveLocalData(); window.renderDocuments(); } }
window.renderDocuments = () => { let c = document.getElementById('pdfReportsContainer'); if(!c) return; c.innerHTML = ''; if(pdfReportsList.length===0) return c.innerHTML='<p>لا توجد وثائق.</p>'; pdfReportsList.forEach(d => c.innerHTML += `<div class="list-item" style="border-right-color:var(--secondary-cyan);"><div class="list-info"><a href="${d.url}" target="_blank" style="font-weight:bold; color:var(--primary-blue);">📄 ${d.name}</a></div><button class="action-btn no-print" onclick="window.deleteDocument('${d.firestoreId}')">حذف</button></div>`); }
window.saveBylaws = () => { localStorage.setItem('tamda_bylaws', document.getElementById('bylawInput').value); showToast('تم حفظ القانون الأساسي'); }

/* === المنخرطين (استعادة خاصية توليد الكود) === */
window.saveSubscriber = async () => {
    const id = document.getElementById('editingSubId').value; const counter = document.getElementById('newSubCounter').value; const name = document.getElementById('newSubName').value; const phone = document.getElementById('newSubPhone').value; const loc = document.getElementById('newSubLocation').value; const exempt = document.getElementById('newSubAlwaysExempt').checked;
    if(!counter || !name) return showToast('أدخل العداد والاسم'); showLoading();
    try {
        if(id) { let sub = subscribers.find(s=>s.firestoreId===id); if(sub){ sub.counter=counter; sub.name=name; sub.phone=phone; sub.location=loc; sub.isAlwaysExempt=exempt; } await updateDoc(doc(db,"subscribers",id), {counter,name,phone,location:loc,isAlwaysExempt:exempt}); showToast('تم التعديل'); window.resetSubForm(); }
        else {
            if(subscribers.find(s=>s.counter==counter)) { hideLoading(); return showToast('العداد مسجل!'); }
            let obj = { counter, name, phone, location:loc, isAlwaysExempt:exempt, lastReading:null, delayMonths:0, debtAmount:0, lastBilledMonth:'', pin:'' };
            let refDoc = await addDoc(collection(db,"subscribers"), obj); obj.firestoreId=refDoc.id; subscribers.push(obj); subscribers.sort((a,b)=>Number(a.counter)-Number(b.counter)); window.resetSubForm(); showToast('تمت الإضافة');
        }
        saveLocalData(); window.renderSubscribers();
    } catch(e) { showToast('خطأ بالحفظ'); } hideLoading();
}
window.resetSubForm = () => { document.getElementById('editingSubId').value=''; document.getElementById('newSubCounter').value=''; document.getElementById('newSubName').value=''; document.getElementById('newSubPhone').value=''; document.getElementById('newSubLocation').value=''; document.getElementById('newSubAlwaysExempt').checked=false; document.getElementById('subFormTitle').textContent='➕ إضافة مشترك جديد'; document.getElementById('subCancelBtn').style.display='none'; }
window.editSubscriber = (id) => { let sub = subscribers.find(s=>s.firestoreId===id); if(!sub)return; document.getElementById('editingSubId').value=id; document.getElementById('newSubCounter').value=sub.counter; document.getElementById('newSubName').value=sub.name; document.getElementById('newSubPhone').value=sub.phone||''; document.getElementById('newSubLocation').value=sub.location||''; document.getElementById('newSubAlwaysExempt').checked=sub.isAlwaysExempt||false; document.getElementById('subFormTitle').textContent='✏️ تعديل مشترك'; document.getElementById('subCancelBtn').style.display='block'; window.scrollTo(0,0); }
window.deleteSubscriber = async (id) => { if(confirm('حذف المشترك نهائياً؟')) { await deleteDoc(doc(db,"subscribers",id)); subscribers = subscribers.filter(s=>s.firestoreId!==id); saveLocalData(); window.renderSubscribers(); showToast('تم الحذف'); } }
window.generateAndSendPIN = async (id) => {
    let sub = subscribers.find(s => s.firestoreId === id); if (!sub) return;
    if (!sub.phone) return showToast('رقم هاتف المنخرط غير مسجل!');
    let pin = Math.floor(1000 + Math.random() * 9000).toString(); sub.pin = pin; saveLocalData();
    if(navigator.onLine) await updateDoc(doc(db, "subscribers", id), { pin: pin }).catch(()=>{});
    let msg = `مرحباً السيد(ة) ${sub.name}،\nتم تفعيل حسابك في بوابة المشتركين لتطبيق ماء تامدة.\n\n👤 اسم المستخدم (رقم العداد): ${sub.counter}\n🔑 الرمز السري: ${pin}`;
    window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(msg)}`, '_blank'); showToast('تم التوليد'); window.renderSubscribers();
}
window.renderSubscribers = () => {
    let c = document.getElementById('subscribersListContainer'); if(!c) return; let term = document.getElementById('searchSub').value.toLowerCase(); c.innerHTML='';
    let f = subscribers.filter(s=>s.name.toLowerCase().includes(term)||String(s.counter).includes(term)); document.getElementById('subListCount').textContent=f.length;
    f.forEach(s => {
        let badge = s.isAlwaysExempt ? '<strong style="color:green; font-size:0.8rem;">(معفى)</strong>' : '';
        let pinBtn = s.pin ? "🔄 إعادة الكود للمشترك" : "🔑 إرسال كود الدخول";
        c.innerHTML += `<div class="list-item" style="flex-direction:column; align-items:stretch;">
            <div class="list-info" style="margin-bottom:10px;"><strong>عداد (${s.counter}): ${s.name} ${badge}</strong><span>هاتف: ${s.phone||'-'} | ديون: <strong class="${s.debtAmount>0?'text-danger':'text-success'}">${s.debtAmount||0} درهم</strong></span><span>حالة البوابة: ${s.pin ? '<strong style="color:var(--accent-green);">✔️ مفعل</strong>' : '<strong style="color:var(--danger-red);">❌ غير مفعل</strong>'}</span></div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; gap:8px;"><button class="edit-btn" style="flex:1;" onclick="window.editSubscriber('${s.firestoreId}')">تعديل</button><button class="action-btn" style="flex:1;" onclick="window.deleteSubscriber('${s.firestoreId}')">حذف</button></div>
                <button class="btn btn-outline" style="padding:8px; margin:0;" onclick="window.generateAndSendPIN('${s.firestoreId}')">${pinBtn}</button>
            </div>
        </div>`;
    });
}

/* === الفواتير (استعادة سجل العدادات) === */
window.autoAdjustTariff = () => { let m = document.getElementById('billingMonth').value; if(m) document.getElementById('tariffSystem').value = (m <= "2026-06") ? "old" : "new"; }
window.checkUnbilledCounters = () => { let m = document.getElementById('billingMonth').value; let a = document.getElementById('unbilledAlertBox'); let l = document.getElementById('unbilledList'); if(!m||!a||!l) return; let b = archiveBills.filter(x=>x.month===m).map(x=>x.counter); let u = subscribers.filter(s=>!b.includes(s.counter)).map(s=>s.counter); if(u.length > 0 && u.length < subscribers.length) { l.textContent = u.join("، "); a.style.display='block'; } else a.style.display='none'; }
window.autoFillSubscriber = () => {
    let c = document.getElementById('counterNum').value; let s = subscribers.find(x=>x.counter==c);
    if(s) { 
        document.getElementById('subscriberName').value=s.name; document.getElementById('exemptionCheck').checked=s.isAlwaysExempt||false; document.getElementById('prevReading').value=s.lastReading||''; if(s.lastReading) document.getElementById('prevReading').setAttribute('readonly',true); else document.getElementById('prevReading').removeAttribute('readonly'); document.getElementById('delayMonths').value=s.delayMonths||0; 
        document.getElementById('counterHistoryCard').style.display='block'; window.renderCounterBills(c);
    } else { 
        document.getElementById('subscriberName').value=''; document.getElementById('prevReading').value=''; document.getElementById('exemptionCheck').checked=false; document.getElementById('counterHistoryCard').style.display='none';
    }
}
window.renderCounterBills = (counter) => {
    let container = document.getElementById('counterBillsList'); let bills = archiveBills.filter(b => b.counter == counter).sort((a,b) => b.month.localeCompare(a.month));
    if(bills.length === 0) { container.innerHTML = '<p class="text-success">لا توجد فواتير سابقة.</p>'; return; }
    let html = `<div class="table-responsive"><table class="archive-table"><thead><tr><th>الشهر</th><th>الاستهلاك</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>`;
    bills.forEach(b => { let statCol = b.status.includes('خالصة') ? 'var(--accent-green)' : 'var(--danger-red)'; html += `<tr><td>${b.month}</td><td>${b.consumption} m³</td><td>${b.total} درهم</td><td style="color:${statCol}; font-weight:bold;">${b.status}</td></tr>`; });
    html += `</tbody></table></div>`; container.innerHTML = html;
}
window.calculateBill = () => {
    let c=document.getElementById('counterNum').value, p=parseFloat(document.getElementById('prevReading').value)||0, r=parseFloat(document.getElementById('currReading').value)||0, d=parseInt(document.getElementById('delayMonths').value)||0, sys=document.getElementById('tariffSystem').value, ex=document.getElementById('exemptionCheck').checked, m=document.getElementById('billingMonth').value;
    if(!c||!m) return; if(archiveBills.some(b=>b.counter==c && b.month===m)) return showToast('مفوتر مسبقاً!'); if(r<p) return showToast('القراءة الحالية أقل!');
    let cons = r-p; currentConsumptionData=cons; let t1=0,t2=0,t3=0, tc1=0,tc2=0,tc3=0, maint=sys==='old'?15:appSettings.maintenance;
    if(sys==='old') { if(cons<=20){t1=cons;}else if(cons<=30){t1=20;t2=cons-20;}else{t1=20;t2=10;t3=cons-30;} tc1=t1*3; tc2=t2*5; tc3=t3*7; }
    else { if(cons<=15){t1=cons;}else if(cons<=20){t1=15;t2=cons-15;}else{t1=15;t2=5;t3=cons-20;} tc1=t1*appSettings.tier1; tc2=t2*appSettings.tier2; tc3=t3*appSettings.tier3; }
    let pen = d>=2?appSettings.penalty:0; currentBillTotal = ex ? 0 : (tc1+tc2+tc3+maint+pen);
    document.getElementById('row-t1').style.display=t1>0?'flex':'none'; document.getElementById('t1-val').textContent=`${t1}m³ = ${tc1}درهم`;
    document.getElementById('row-t2').style.display=t2>0?'flex':'none'; document.getElementById('t2-val').textContent=`${t2}m³ = ${tc2}درهم`;
    document.getElementById('row-t3').style.display=t3>0?'flex':'none'; document.getElementById('t3-val').textContent=`${t3}m³ = ${tc3}درهم`;
    document.getElementById('penaltyRow').style.display=pen>0?'flex':'none'; if(pen>0) document.getElementById('printPenalty').textContent=pen+'درهم';
    document.getElementById('printMonth').textContent=m; document.getElementById('printName').textContent=document.getElementById('subscriberName').value; document.getElementById('printCounter').textContent=c; document.getElementById('printPrev').textContent=p; document.getElementById('printCurr').textContent=r; document.getElementById('printMaintenance').textContent=maint+'درهم'; document.getElementById('consumptionResult').textContent=cons+'m³'; document.getElementById('totalPriceResult').textContent=currentBillTotal+'درهم';
    document.getElementById('exemptionNotice').style.display = ex ? 'block':'none'; document.getElementById('billResult').style.display='block'; document.getElementById('billActionsContainer').style.display='block';
}
window.saveBill = async (isPaid) => {
    let c=document.getElementById('counterNum').value, r=parseFloat(document.getElementById('currReading').value)||0, p=parseFloat(document.getElementById('prevReading').value)||0, m=document.getElementById('billingMonth').value, ex=document.getElementById('exemptionCheck').checked, s=subscribers.find(x=>x.counter==c);
    if(archiveBills.some(b=>b.counter==c && b.month===m)) return showToast('مفوتر!'); showLoading();
    let bObj = { month:m, counter:c, name:document.getElementById('subscriberName').value, prevReading:p, currReading:r, consumption:currentConsumptionData, total:currentBillTotal, status:isPaid?'خالصة':'دين', isExempt:ex, createdBy:localStorage.getItem('tamda_role'), timestamp:new Date().toISOString() };
    try {
        let bRef = await addDoc(collection(db,"archive_bills"), bObj); bObj.firestoreId=bRef.id; archiveBills.push(bObj);
        if(isPaid && currentBillTotal>0) { let tObj = { month:m, type:'income', amount:currentBillTotal, desc:`فاتورة - عداد: ${c}`, createdBy:localStorage.getItem('tamda_role'), timestamp:new Date().toISOString() }; let tRef = await addDoc(collection(db,"transactions"), tObj); tObj.firestoreId=tRef.id; transactionsList.push(tObj); archiveFinance.push(tObj); }
        if(s) { let unpaid = archiveBills.filter(x=>x.counter==c && x.status==='دين'); let dbt=0; unpaid.forEach(x=>dbt+=Number(x.total)); let del=unpaid.length; await updateDoc(doc(db,"subscribers",s.firestoreId), {debtAmount:dbt, delayMonths:del, lastReading:r, lastBilledMonth:m}); s.debtAmount=dbt; s.delayMonths=del; s.lastReading=r; s.lastBilledMonth=m; }
        saveLocalData(); recalculateFinancials(); document.getElementById('billResult').style.display='none'; document.getElementById('billActionsContainer').style.display='none'; window.autoFillSubscriber(); window.checkUnbilledCounters(); showToast('تم حفظ الفاتورة');
    } catch(e){ showToast('خطأ بالحفظ'); } hideLoading();
}
window.downloadBillAsImage = () => { let el = document.getElementById('billResult'); el.style.background='#fff'; html2canvas(el,{scale:2}).then(c=>{ let l=document.createElement('a'); l.download=`فاتورة_${document.getElementById('printCounter').textContent}.png`; l.href=c.toDataURL(); l.click(); el.style.background=''; showToast('تم التحميل'); }); }
window.sendWhatsAppNotification = () => { let s=subscribers.find(x=>x.counter==document.getElementById('counterNum').value); if(!s||!s.phone) return showToast('لا يوجد هاتف'); let msg=`فاتورة ماء تامدة لشهر: ${document.getElementById('billingMonth').value}\nالعداد: ${s.counter}\nالمبلغ: ${currentBillTotal} درهم`; window.open(`https://wa.me/${s.phone}?text=${encodeURIComponent(msg)}`); }

/* خصائص الطباعة المخصصة (تمت استعادتها) */
window.printThermalBill = () => {
    let prt = document.getElementById('temp-print-container');
    if(!prt) { prt = document.createElement('div'); prt.id = 'temp-print-container'; document.body.appendChild(prt); }
    prt.innerHTML = document.getElementById('billResult').innerHTML;
    document.body.classList.add('print-mode-thermal-direct');
    window.print();
    document.body.classList.remove('print-mode-thermal-direct');
}
window.printDonations = () => {
    document.body.classList.add('print-mode-donations'); window.print(); document.body.classList.remove('print-mode-donations');
}

/* === العمليات المالية، الديون والدعم === */
window.saveTransaction = async () => {
    let m=document.getElementById('transMonth').value, t=document.getElementById('transType').value, a=parseFloat(document.getElementById('transAmount').value)||0, d=document.getElementById('transDesc').value;
    if(a<=0||!m)return showToast('أكمل البيانات'); showLoading();
    let obj = { month:m, type:t, amount:a, desc:d, createdBy:localStorage.getItem('tamda_role'), timestamp:new Date().toISOString() };
    try { let r = await addDoc(collection(db,"transactions"), obj); obj.firestoreId=r.id; await addDoc(collection(db,"archive_finance"), obj); transactionsList.push(obj); archiveFinance.push(obj); recalculateFinancials(); saveLocalData(); window.renderTransactions(); renderCapital(); document.getElementById('transAmount').value=''; document.getElementById('transDesc').value=''; showToast('تم الحفظ'); } catch(e){} hideLoading();
}
window.renderTransactions = () => {
    let c = document.getElementById('transactionsListContainer'); if(!c)return; let mths={};
    archiveBills.forEach(b=>{ if(!mths[b.month]) mths[b.month]={w:0,i:0}; mths[b.month].w+=Number(b.consumption||0); });
    transactionsList.forEach(t=>{ if(!mths[t.month]) mths[t.month]={w:0,i:0}; if(t.type==='income') mths[t.month].i+=Number(t.amount); });
    c.innerHTML=''; let ks = Object.keys(mths).sort().reverse(); if(ks.length===0) return c.innerHTML='<p>لا يوجد.</p>';
    let h=`<table class="archive-table"><thead><tr><th>الشهر</th><th>الاستهلاك</th><th>المداخيل</th></tr></thead><tbody>`; ks.forEach(k=>{ h+=`<tr><td>${k}</td><td>${mths[k].w} m³</td><td class="text-success">${mths[k].i} درهم</td></tr>`; }); c.innerHTML=h+'</tbody></table>';
}
window.renderDebts = () => {
    let c = document.getElementById('debtsListContainer'); if(!c)return; c.innerHTML='';
    let sort = document.getElementById('debtSortSelect').value; let d = subscribers.filter(s=>s.debtAmount>0);
    if(sort==='counter') d.sort((a,b)=>a.counter-b.counter); else if(sort==='highest') d.sort((a,b)=>b.debtAmount-a.debtAmount); else d.sort((a,b)=>b.delayMonths-a.delayMonths);
    if(d.length===0) return c.innerHTML='<p>لا توجد ديون.</p>';
    d.forEach(s => c.innerHTML+=`<div class="list-item"><div class="list-info"><strong class="text-danger">عداد ${s.counter}: ${s.name}</strong><span>الدين: ${s.debtAmount} درهم | تأخير: ${s.delayMonths} شهر</span></div><button class="pay-btn" onclick="window.collectDebt('${s.firestoreId}',${s.debtAmount},'${s.counter}')">استخلاص</button></div>`);
}
window.collectDebt = async (id, amt, cnt) => {
    if(confirm(`استخلاص (${amt}) درهم؟`)) { showLoading(); let s=subscribers.find(x=>x.firestoreId===id); if(s){s.debtAmount=0; s.delayMonths=0;} let m=new Date().toISOString().slice(0,7); let o={month:m, type:'income', amount:Number(amt), desc:`استخلاص دين عداد ${cnt}`, timestamp:new Date().toISOString()}; let r=await addDoc(collection(db,"transactions"), o); o.firestoreId=r.id; transactionsList.push(o); archiveBills.filter(b=>b.counter==cnt&&b.status==='دين').forEach(async b=>{b.status='خالصة'; await updateDoc(doc(db,"archive_bills",b.firestoreId),{status:'خالصة'});}); await updateDoc(doc(db,"subscribers",id),{debtAmount:0,delayMonths:0}); saveLocalData(); recalculateFinancials(); window.renderDebts(); showToast('تم'); hideLoading(); }
}
window.saveDonation = async () => {
    let t=document.getElementById('donType').value, m=document.getElementById('donationMonth').value, n=document.getElementById('donationName').value, a=parseFloat(document.getElementById('donationAmount').value);
    if(!a||!m||!n) return showToast('أكمل البيانات'); showLoading(); let o = { type:t, month:m, name:n, amount:a, timestamp:new Date().toISOString() };
    let r = await addDoc(collection(db,"donations"), o); o.firestoreId=r.id; donationsList.push(o); saveLocalData(); recalculateFinancials(); window.renderDonations(); document.getElementById('donationName').value=''; document.getElementById('donationAmount').value=''; hideLoading(); showToast('تم');
}
window.renderDonations = () => { let c = document.getElementById('donationsListContainer'); if(!c)return; c.innerHTML=''; donationsList.slice().reverse().forEach(d=>c.innerHTML+=`<div class="list-item"><div class="list-info"><strong class="text-success">+ ${d.amount} درهم</strong><span>${d.type} - ${d.name} | ${d.month}</span></div></div>`); }

window.addManualCapital = async () => { let a=parseFloat(prompt("المبلغ:")); if(isNaN(a)||a<=0)return; let d=prompt("السبب:","إضافة"); showLoading(); let o={type:'manual',amount:a,desc:d,date:new Date().toLocaleDateString('ar-MA'),timestamp:new Date().toISOString()}; let r=await addDoc(collection(db,"capital_ledger"), o); o.firestoreId=r.id; capitalLedger.push(o); saveLocalData(); recalculateFinancials(); renderCapital(); hideLoading(); showToast('تم'); }
function renderCapital() { document.getElementById('mainCapitalAmount').textContent = actualTotalCapital + ' درهم'; let c=document.getElementById('capitalLedgerContainer'); if(!c)return; c.innerHTML=''; capitalLedger.filter(x=>x.type==='manual').forEach(x=>c.innerHTML+=`<div class="list-item"><div class="list-info"><strong>${x.amount} درهم</strong><span>${x.desc}</span></div></div>`); }

/* === الأرشيف الشامل (تمت استعادة تصميمه وتفاصيله) === */
window.renderArchive = () => {
    let c = document.getElementById('archiveContainer'); if(!c) return; c.innerHTML = '';
    let ms = new Set(); archiveBills.forEach(b => ms.add(b.month)); archiveFinance.forEach(f => ms.add(f.month));
    let sortedMonths = Array.from(ms).sort().reverse();
    if(sortedMonths.length === 0) return c.innerHTML = '<p>لا توجد بيانات مسجلة في الأرشيف.</p>';
    sortedMonths.forEach(m => {
        let mBills = archiveBills.filter(b => b.month === m).sort((a,b) => a.counter - b.counter);
        let mFin = archiveFinance.filter(f => f.month === m);
        let wTotal = 0, aTotal = 0; mBills.forEach(b => { wTotal += Number(b.consumption); aTotal += Number(b.total); });
        
        let html = `<div class="archive-month-box" style="margin-bottom:25px; border:1px solid var(--border-color); padding:15px; border-radius:8px; background:var(--card-bg);">
            <h4 style="color:var(--primary-blue); margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">📅 أرشيف شهر: ${m}</h4>
            <div style="display:flex; gap:20px; margin-bottom:15px; background:var(--bg-light); padding:10px; border-radius:6px;">
                <span>الاستهلاك: <strong>${wTotal} m³</strong></span>
                <span>المبالغ المحصلة: <strong class="text-success">${aTotal} درهم</strong></span>
            </div>`;
        
        if(mBills.length > 0) {
            html += `<h5 style="margin-bottom:10px;">💧 فواتير الماء:</h5><div class="table-responsive"><table class="archive-table"><thead><tr><th>العداد والاسم</th><th>الاستهلاك</th><th>المبلغ</th><th>الحالة</th><th class="no-print">حذف</th></tr></thead><tbody>`;
            mBills.forEach(b => { html += `<tr><td><strong>${b.counter}</strong> - ${b.name}</td><td>${b.consumption}</td><td>${b.total}</td><td style="color:${b.status.includes('خالصة')?'var(--accent-green)':'var(--danger-red)'}; font-weight:bold;">${b.status}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="window.deleteArchiveBill('${b.firestoreId}')">حذف</button></td></tr>`; });
            html += `</tbody></table></div>`;
        }
        
        if(mFin.length > 0) {
            html += `<h5 style="margin-top:20px; margin-bottom:10px;">💰 العمليات المالية:</h5><div class="table-responsive"><table class="archive-table"><thead><tr><th>النوع</th><th>المبلغ</th><th>البيان</th><th class="no-print">حذف</th></tr></thead><tbody>`;
            mFin.forEach(f => { html += `<tr><td class="${f.type==='income'?'text-success':'text-danger'}">${f.type==='income'?'مدخول':'مصروف'}</td><td>${f.amount}</td><td>${f.desc}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="window.deleteArchiveFinance('${f.firestoreId}')">حذف</button></td></tr>`; });
            html += `</tbody></table></div>`;
        }
        html += `</div>`;
        c.innerHTML += html;
    });
}
window.deleteArchiveBill = async (id) => {
    if(!confirm('متأكد من حذف الفاتورة؟')) return;
    showLoading(); try { await deleteDoc(doc(db,"archive_bills",id)); archiveBills = archiveBills.filter(b=>b.firestoreId!==id); saveLocalData(); window.renderArchive(); showToast('تم الحذف'); } catch(e){} hideLoading();
}
window.deleteArchiveFinance = async (id) => {
    if(!confirm('متأكد من حذف العملية؟')) return;
    showLoading(); try { await deleteDoc(doc(db,"archive_finance",id)); archiveFinance = archiveFinance.filter(f=>f.firestoreId!==id); await deleteDoc(doc(db,"transactions",id)).catch(()=>{}); transactionsList = transactionsList.filter(t=>t.firestoreId!==id); saveLocalData(); recalculateFinancials(); window.renderArchive(); renderCapital(); showToast('تم الحذف'); } catch(e){} hideLoading();
}

/* === مؤشرات الأداء (Dashboards) === */
window.renderIndicators = () => {
    let ctxFin = document.getElementById('financialPerformanceChart'); let ctxCons = document.getElementById('consumptionChart');
    if(!ctxFin || !ctxCons) return;
    let mths={}; archiveBills.forEach(b=>{ if(!mths[b.month]) mths[b.month]={w:0,i:0,e:0}; mths[b.month].w+=Number(b.consumption); mths[b.month].i+=Number(b.total); });
    transactionsList.forEach(t=>{ if(!mths[t.month]) mths[t.month]={w:0,i:0,e:0}; if(t.type==='expense') mths[t.month].e+=Number(t.amount); if(t.type==='income') mths[t.month].i+=Number(t.amount); });
    majorExpensesList.forEach(e=>{ let m=e.date.slice(0,7); if(!mths[m]) mths[m]={w:0,i:0,e:0}; mths[m].e+=Number(e.amount); });
    let ks = Object.keys(mths).sort().slice(-12);
    let lbs=ks, incs=ks.map(k=>mths[k].i), exps=ks.map(k=>mths[k].e), wts=ks.map(k=>mths[k].w);
    let isDk = document.body.classList.contains('dark-mode'); let txt = isDk?'#ddd':'#333'; let grid = isDk?'#444':'#ddd';
    
    if(perfChartInstance) perfChartInstance.destroy();
    perfChartInstance = new Chart(ctxFin, { type:'line', data:{ labels:lbs, datasets:[{label:'المداخيل', data:incs, borderColor:'#25D366', fill:false}, {label:'المصاريف', data:exps, borderColor:'#d32f2f', fill:false}] }, options:{scales:{x:{ticks:{color:txt},grid:{color:grid}},y:{ticks:{color:txt},grid:{color:grid}}}, plugins:{legend:{labels:{color:txt}}}} });
    if(consChartInstance) consChartInstance.destroy();
    consChartInstance = new Chart(ctxCons, { type:'bar', data:{ labels:lbs, datasets:[{label:'الاستهلاك (m³)', data:wts, backgroundColor:'#00bcd4'}] }, options:{scales:{x:{ticks:{color:txt},grid:{color:grid}},y:{ticks:{color:txt},grid:{color:grid}}}, plugins:{legend:{labels:{color:txt}}}} });
}
window.downloadChart = (id, name) => { let c=document.getElementById(id); let l=document.createElement('a'); l.download=`${name}.png`; l.href=c.toDataURL('image/png',1.0); l.click(); }

/* === التقرير السنوي والتصدير والشكايات === */
window.toggleStatInputs = () => { let t = document.getElementById('statTypeSelect').value; document.getElementById('monthInputGroup').style.display = t==='monthly'?'block':'none'; document.getElementById('yearInputGroup').style.display = t==='yearly'?'block':'none'; }
window.generateAnnualReport = () => {
    let y = document.getElementById('statsYearSelect').value; if(!y) return; let printW = window.open('','_blank');
    let inc=0, exp=0, w=0; transactionsList.filter(t=>t.month.startsWith(y)).forEach(t=>{ if(t.type==='income')inc+=Number(t.amount); else exp+=Number(t.amount); }); archiveBills.filter(b=>b.month.startsWith(y)).forEach(b=>{ w+=Number(b.consumption); inc+=Number(b.total); }); majorExpensesList.filter(e=>e.date.startsWith(y)).forEach(e=>exp+=Number(e.amount));
    printW.document.write(`<html dir="rtl"><body style="font-family:Arial; padding:20px;"><h2>التقرير السنوي ${y}</h2><hr><p>الاستهلاك: <strong>${w} m³</strong></p><p>المداخيل: <strong style="color:green;">${inc} درهم</strong></p><p>المصاريف: <strong style="color:red;">${exp} درهم</strong></p><script>window.print();</script></body></html>`);
}
window.exportToExcel = () => { let ws = XLSX.utils.json_to_sheet(subscribers.map(s=>({ "العداد":s.counter, "الاسم":s.name, "الهاتف":s.phone||'', "الديون":s.debtAmount||0, "التأخير":s.delayMonths||0 }))); let wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "المنخرطين"); XLSX.writeFile(wb, "لائحة_المنخرطين.xlsx"); }
window.saveSettings = () => { appSettings.tier1 = parseFloat(document.getElementById('setTier1').value)||4; appSettings.tier2 = parseFloat(document.getElementById('setTier2').value)||8; appSettings.tier3 = parseFloat(document.getElementById('setTier3').value)||15; appSettings.maintenance = parseFloat(document.getElementById('setMaintenance').value)||15; appSettings.penalty = parseFloat(document.getElementById('setPenalty').value)||50; localStorage.setItem('tamda_settings', JSON.stringify(appSettings)); let p = document.getElementById('setAdminPassword').value.trim(); if(p) { secureCodes['admin']=p; localStorage.setItem('tamda_codes', JSON.stringify(secureCodes)); document.getElementById('setAdminPassword').value=''; } showToast('تم الحفظ'); }
function loadSettingsToInputs() { document.getElementById('setTier1').value = appSettings.tier1; document.getElementById('setTier2').value = appSettings.tier2; document.getElementById('setTier3').value = appSettings.tier3; document.getElementById('setMaintenance').value = appSettings.maintenance; document.getElementById('setPenalty').value = appSettings.penalty; }
window.submitComplaint = async () => { let t = document.getElementById('subComplaintText').value; if(!t)return; showLoading(); let o = { counter:localStorage.getItem('tamda_counter'), name:localStorage.getItem('tamda_subname'), text:t, date:new Date().toLocaleDateString('ar-MA'), timestamp:new Date().toISOString() }; let r = await addDoc(collection(db,"complaints"),o); o.firestoreId=r.id; complaintsList.push(o); saveLocalData(); document.getElementById('subComplaintText').value=''; hideLoading(); showToast('تم الإرسال'); }
window.renderAdminComplaints = () => { let c = document.getElementById('complaintsListContainer'); if(!c)return; c.innerHTML=''; complaintsList.forEach(x=>c.innerHTML+=`<div class="list-item"><div class="list-info"><strong>${x.name} (${x.counter})</strong><p>${x.text}</p></div><button class="action-btn" onclick="window.deleteComplaint('${x.firestoreId}')">إغلاق</button></div>`); }
window.deleteComplaint = async (id) => { await deleteDoc(doc(db,"complaints",id)); complaintsList=complaintsList.filter(c=>c.firestoreId!==id); saveLocalData(); window.renderAdminComplaints(); }
window.renderAuditTrail = () => { let c = document.getElementById('standaloneMemberActivity'); if(!c)return; c.innerHTML=''; transactionsList.slice(-20).reverse().forEach(t=>c.innerHTML+=`<div class="list-item"><span>${t.timestamp.slice(0,10)} | ${t.desc}</span></div>`); }
window.renderSubPortalBills = () => { 
    if(document.getElementById('infoT1')) { document.getElementById('infoT1').textContent = appSettings.tier1; document.getElementById('infoT2').textContent = appSettings.tier2; document.getElementById('infoT3').textContent = appSettings.tier3; document.getElementById('infoMaint').textContent = appSettings.maintenance; document.getElementById('infoPenalty').textContent = appSettings.penalty; }
    let c = document.getElementById('portalBillsContainer'); if(!c)return; c.innerHTML=''; archiveBills.filter(b=>b.counter==localStorage.getItem('tamda_counter')).forEach(b=>c.innerHTML+=`<div class="list-item"><strong>${b.month}</strong><span>${b.total} درهم</span></div>`); 
}
