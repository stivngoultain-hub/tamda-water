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
    
    window.addEventListener('online', () => { updateOnlineStatus(true); });
    window.addEventListener('offline', () => { updateOnlineStatus(false); });
    updateOnlineStatus(navigator.onLine);
    if(navigator.onLine) { loadDataFromCloud(); }
    ['click', 'touchstart', 'keypress', 'scroll'].forEach(evt => document.addEventListener(evt, updateLastActive));
    setInterval(checkSessionTimeout, 10000);
});

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
                document.getElementById('activeUserLabel').textContent = "بوابة المشتركين (عداد: " + localStorage.getItem('tamda_counter') + ")"; navigateTo('👤 فواتيري وطلباتي');
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
        if(pageName === '👥 إدارة المنخرطين') renderSubscribers();
        if(pageName === '⚙️ الإعدادات') loadSettingsToInputs();
        if(pageName === '📒 الديون والأرصدة') renderDebts();
        if(pageName === '💰 ملخص العمليات الشهرية') renderTransactions();
        if(pageName === '💖 سجل التبرعات') renderDonations();
        if(pageName === '🗄️ الأرشيف والتخزين') renderArchive();
        if(pageName === '📊 التقارير المالية') renderCapital();
        if(pageName === '📥 الشكايات والطلبات') renderAdminComplaints();
        if(pageName === '👤 فواتيري وطلباتي') renderSubPortalBills();
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
    recalculateFinancials();
}

function saveLocalData() {
    localStorage.setItem('local_subs', JSON.stringify(subscribers)); localStorage.setItem('local_trans', JSON.stringify(transactionsList));
    localStorage.setItem('local_donations', JSON.stringify(donationsList)); localStorage.setItem('local_bills', JSON.stringify(archiveBills));
    localStorage.setItem('local_fin', JSON.stringify(archiveFinance)); localStorage.setItem('local_complaints', JSON.stringify(complaintsList));
    localStorage.setItem('local_capital', JSON.stringify(capitalLedger));
}

function recalculateFinancials() {
    let transIncome = 0; totalExpense = 0;
    transactionsList.forEach(t => { if(t.type === 'income') transIncome += Number(t.amount || 0); else totalExpense += Number(t.amount || 0); });
    totalDonationsIncome = 0;
    donationsList.forEach(d => { totalDonationsIncome += Number(d.amount || 0); });
    let manualCap = 0;
    capitalLedger.forEach(c => { if(c.type === 'manual') manualCap += Number(c.amount || 0); });
    
    totalIncome = transIncome + totalDonationsIncome;
    window.actualTotalCapital = totalIncome + manualCap - totalExpense; // المعادلة الشاملة للصندوق
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
        
        saveLocalData(); recalculateFinancials();
        if(localStorage.getItem('tamda_auth') === 'true') {
            if(localStorage.getItem('tamda_role') !== 'subscriber') {
                renderSubscribers(); renderTransactions(); renderCapital(); renderArchive(); renderDebts();
            }
        }
    } catch (e) { console.error("Cloud fetch error:", e); }
}

function printThermalBill() {
    const printContainer = document.createElement('div'); printContainer.id = 'temp-print-container';
    printContainer.innerHTML = document.getElementById('billResult').innerHTML;
    document.body.appendChild(printContainer);
    document.body.classList.add('print-mode-thermal-direct');
    window.print();
    setTimeout(() => { document.body.classList.remove('print-mode-thermal-direct'); printContainer.remove(); }, 500);
}
function printDonations() { document.body.classList.add('print-mode-donations'); window.print(); setTimeout(() => { document.body.classList.remove('print-mode-donations'); }, 500); }

/* --- المنخرطين والفواتير --- */
async function saveSubscriber() { /* نفس الكود السابق */ }
function renderSubscribers() { /* نفس الكود السابق */ }

function autoFillSubscriber() { 
    const counterInput = document.getElementById('counterNum').value.trim(); 
    const sub = subscribers.find(s => s.counter == counterInput); 
    if (sub) { 
        document.getElementById('subscriberName').value = sub.name; 
        if(sub.lastBilledMonth) document.getElementById('billingMonth').value = getNextMonth(sub.lastBilledMonth); 
        
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
    } 
    document.getElementById('currReading').value = ''; window.autoAdjustTariff(); calculateBill(); 
}

// عرض وإمكانية تعديل فواتير العداد المحدد
window.renderCounterBills = function(counter) {
    const container = document.getElementById('counterBillsList');
    let bills = archiveBills.filter(b => b.counter == counter).sort((a,b) => b.month.localeCompare(a.month));
    if(bills.length === 0) { container.innerHTML = '<p class="text-success">لا توجد فواتير سابقة لهذا العداد.</p>'; return; }
    
    let html = `<div style="overflow-x:auto;"><table class="archive-table"><thead><tr><th>الشهر</th><th>الاستهلاك</th><th>المبلغ</th><th>الحالة</th><th>تعديل</th></tr></thead><tbody>`;
    bills.forEach(b => {
        let statusColor = b.status.includes('خالصة') ? 'var(--accent-green)' : 'var(--danger-red)';
        html += `<tr><td>${b.month}</td><td>${b.consumption} m³</td><td>${b.total} درهم</td><td style="color:${statusColor}; font-weight:bold;">${b.status}</td><td><button class="edit-btn" onclick="editBill('${b.firestoreId}')">✏️ تعديل</button></td></tr>`;
    });
    html += `</tbody></table></div>`; container.innerHTML = html;
}

window.editBill = async function(id) {
    let bill = archiveBills.find(b => b.firestoreId === id); if(!bill) return;
    if(!confirm('سيتم حذف الفاتورة الخاطئة لإعادة إدخالها مصححة. هل توافق؟')) return;
    
    await deleteArchiveBill(id, true); // True = الحذف صامتاً بدون تنبيه
    
    document.getElementById('billingMonth').value = bill.month;
    document.getElementById('prevReading').value = bill.prevReading || (bill.currReading - bill.consumption) || 0;
    document.getElementById('currReading').value = bill.currReading || 0;
    document.getElementById('delayMonths').value = 0;
    document.getElementById('exemptionCheck').checked = bill.isExempt || false;
    
    window.autoAdjustTariff(); calculateBill();
    showToast('تم إلغاء الفاتورة.. أدخل البيانات الصحيحة واضغط حفظ من جديد.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getNextMonth(monthString) { let parts = monthString.split('-'); let d = new Date(parseInt(parts[0]), parseInt(parts[1]), 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

function calculateBill() { /* نفس كود الحساب */
    const counterNumInput = document.getElementById('counterNum').value.trim(); 
    const prev = parseFloat(document.getElementById('prevReading').value) || 0; 
    const curr = parseFloat(document.getElementById('currReading').value) || 0; 
    const delayMonths = parseInt(document.getElementById('delayMonths').value) || 0; 
    const tariffSystem = document.getElementById('tariffSystem').value; 
    const isExempt = document.getElementById('exemptionCheck').checked; 
    
    if (!counterNumInput) return; 
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
    
    document.getElementById('printMonth').textContent = document.getElementById('billingMonth').value; document.getElementById('printName').textContent = document.getElementById('subscriberName').value; document.getElementById('printCounter').textContent = counterNumInput; document.getElementById('printPrev').textContent = prev; document.getElementById('printCurr').textContent = curr; document.getElementById('printMaintenance').textContent = maintenance; document.getElementById('consumptionResult').textContent = consumption; document.getElementById('totalPriceResult').textContent = currentBillTotal + ' درهم';
    document.getElementById('billResult').style.display = 'block'; 
}

async function saveBill(isPaid) { 
    if(currentBillTotal >= 0) { 
        if(!navigator.onLine) return showToast('⚠️ يلزم الاتصال بالإنترنت');
        const counterInput = document.getElementById('counterNum').value.trim(); const curr = parseFloat(document.getElementById('currReading').value) || 0; const prev = parseFloat(document.getElementById('prevReading').value) || 0; const currentMonth = document.getElementById('billingMonth').value; const isExempt = document.getElementById('exemptionCheck').checked; const sub = subscribers.find(s => s.counter == counterInput); 
        
        let billArchiveObj = { month: currentMonth, counter: counterInput, name: document.getElementById('subscriberName').value, prevReading: prev, currReading: curr, consumption: currentConsumptionData, total: currentBillTotal, status: isPaid ? 'خالصة' : 'دين', isExempt: isExempt, timestamp: new Date().toISOString() }; 
        
        try { 
            let billRef = await addDoc(collection(db, "archive_bills"), billArchiveObj); billArchiveObj.firestoreId = billRef.id; archiveBills.push(billArchiveObj);
            if (isPaid && currentBillTotal > 0) { 
                let transObj = { month: currentMonth, type: 'income', amount: currentBillTotal, desc: `استخلاص فاتورة ماء - عداد: ${counterInput}`, timestamp: new Date().toISOString() }; 
                let transRef = await addDoc(collection(db, "transactions"), transObj); transObj.firestoreId = transRef.id; transactionsList.push(transObj); archiveFinance.push(transObj); 
            }
            if(sub) await recalculateSubscriberDebt(counterInput);
            
            saveLocalData(); recalculateFinancials(); showToast('تم حفظ الفاتورة بنجاح'); currentBillTotal = 0; document.getElementById('billResult').style.display = 'none'; autoFillSubscriber(); 
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
        saveLocalData(); recalculateFinancials(); renderArchive(); renderCapital(); renderTransactions();
        if(!isEdit) showToast('تم الحذف بنجاح'); 
    } catch(e){ console.error(e); }
}

/* --- سجل العمليات (معدل ليعرض ملخصاً شهرياً فقط) --- */
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
    
    let html = `<table class="archive-table"><thead><tr><th>الشهر</th><th>إجمالي الماء المستهلك</th><th>مجموع مداخيل الشهر</th></tr></thead><tbody>`;
    sortedMonths.forEach(m => {
        html += `<tr><td><strong>${m}</strong></td><td style="color:var(--primary-blue); font-weight:bold;">${months[m].water} m³</td><td class="text-success">${months[m].income} درهم</td></tr>`;
    });
    html += `</tbody></table>`; container.innerHTML = html;
}

/* --- تقارير الصندوق (معدل لعرض الرصيد والمداخيل الشهرية) --- */
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
    
    // 1. عرض الرصيد الإجمالي
    document.getElementById('mainCapitalAmount').textContent = window.actualTotalCapital + " درهم";

    // 2. عرض الإضافات اليدوية
    container.innerHTML = '';
    let manuals = capitalLedger.filter(c => c.type === 'manual').sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    manuals.forEach(item => {
        container.innerHTML += `<div class="list-item" style="border-right-color: var(--primary-blue);"><div class="list-info"><strong style="color: var(--primary-blue);">${item.amount} درهم</strong><span>${item.desc} | ${item.date}</span></div><div><button class="action-btn" onclick="deleteCapitalEntry('${item.firestoreId}')">حذف</button></div></div>`;
    });
    if(manuals.length === 0) container.innerHTML = '<p class="text-success">لا توجد إضافات يدوية مسجلة.</p>';

    // 3. جدول المداخيل والمصاريف لكل شهر
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
        let tableHtml = `<table class="archive-table"><thead><tr><th>الشهر</th><th>المداخيل (درهم)</th><th>المصاريف (درهم)</th><th>الرصيد الصافي للشهر</th></tr></thead><tbody>`;
        sortedMonths.forEach(m => {
            let net = months[m].income - months[m].expense;
            tableHtml += `<tr><td><strong>${m}</strong></td><td class="text-success">${months[m].income}</td><td class="text-danger">${months[m].expense}</td><td style="font-weight:bold; color:${net >= 0 ? 'var(--accent-green)' : 'var(--danger-red)'}">${net}</td></tr>`;
        });
        tableHtml += `</tbody></table>`;
        monthlyContainer.innerHTML = tableHtml;
    }
}

window.deleteCapitalEntry = async function(id) { 
    if(!confirm('متأكد من حذف هذه الإضافة اليدوية؟')) return;
    await deleteDoc(doc(db, "capital_ledger", id)); 
    capitalLedger = capitalLedger.filter(c => c.firestoreId !== id); saveLocalData(); recalculateFinancials(); renderCapital(); 
}

/* --- الأرشيف الشامل --- */
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
        let html = `<h4>📅 أرشيف شهر: ${month}</h4><div style="display:flex; gap:20px; margin-bottom:10px; background:var(--bg-light); padding:8px; border-radius:6px;"><span>الاستهلاك: <strong>${monthTotalWater} m³</strong></span><span>المبالغ المحصلة: <strong class="text-success">${monthTotalAmount} درهم</strong></span></div>`; 
        
        if(monthBills.length > 0) { 
            html += `<table class="archive-table"><thead><tr><th>رقم العداد والاسم</th><th>الاستهلاك (m³)</th><th>الثمن (درهم)</th><th>الوضع</th><th class="no-print">حذف</th></tr></thead><tbody>`; 
            monthBills.forEach(b => { 
                let subscriberName = b.name || 'غير مسجل';
                html += `<tr><td><strong>${b.counter}</strong> - ${subscriberName}</td><td>${b.consumption}</td><td>${b.total}</td><td>${b.status}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveBill('${b.firestoreId}')">حذف</button></td></tr>`; 
            }); 
            html += `</tbody></table>`; 
        } 
        
        html += `<h5 style="margin: 15px 0 5px 0; color:var(--text-dark);">💰 العمليات المالية:</h5>`; 
        if(monthFinance.length > 0) { 
            html += `<table class="archive-table"><thead><tr><th>النوع</th><th>المبلغ (درهم)</th><th>الوصف</th><th class="no-print">حذف</th></tr></thead><tbody>`; 
            monthFinance.forEach(f => { 
                html += `<tr><td class="${f.type === 'income' ? 'text-success' : 'text-danger'}">${f.type === 'income' ? 'مدخول' : 'مصروف'}</td><td>${f.amount}</td><td>${f.desc}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveFinance('${f.firestoreId}')">حذف</button></td></tr>`; 
            }); 
            html += `</tbody></table>`; 
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

window.checkAuth = checkAuth; window.handleEnter = handleEnter; window.authenticate = authenticate; window.logout = logout; window.toggleSidebar = toggleSidebar; window.showToast = showToast; window.navigateTo = navigateTo; window.printDonations = printDonations; window.printThermalBill = printThermalBill; window.saveSubscriber = saveSubscriber; window.autoFillSubscriber = autoFillSubscriber; window.calculateBill = calculateBill; window.saveBill = saveBill; window.saveTransaction = saveTransaction; window.saveSettings = saveSettings; window.saveDonation = saveDonation;
