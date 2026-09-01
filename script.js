// ==========================================
// 1. استيراد مكتبات Firebase
// ==========================================
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

// ==========================================
// 2. المتغيرات والثوابت العامة
// ==========================================
const secureCodes = { 'president': '1111', 'secretary': '2222', 'treasurer': '3333' };
const roleNames = { 'president': 'الرئيس', 'secretary': 'الكاتب العام', 'treasurer': 'أمين المال' };

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const toast = document.getElementById('toast');

let totalIncome = 0; 
let totalExpense = 0; 
let currentBillTotal = 0; 
let subscribers = []; 
let appSettings = { tier1: 4, tier2: 8, tier3: 15, maintenance: 15, penalty: 50 }; 
let transactionsList = []; 
let archiveBills = []; 
let archiveFinance = [];

const views = {
    '🏠 لوحة القيادة': 'view-dashboard', 
    '👥 إدارة المنخرطين': 'view-subscribers',
    '💧 إدارة ماء الشرب': 'view-water', 
    '📊 الإحصائيات الشهرية': 'view-stats',
    '📊 التقارير المالية': 'view-reports',
    '💰 المداخيل والمصاريف': 'view-finance',
    '📒 الديون والأرصدة': 'view-debts', 
    '📜 القانون الأساسي': 'view-bylaws', 
    '🗄️ الأرشيف والتخزين': 'view-archive',
    '⚙️ الإعدادات': 'view-settings'
};

// ==========================================
// 3. التحميل الأولي وجلب البيانات
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth(); 
    loadSettings();
    
    let savedBylaw = localStorage.getItem('tamda_bylaws') || '';
    const bylawInput = document.getElementById('bylawInput');
    const bylawDisplay = document.getElementById('bylawDisplay');
    if(bylawInput) bylawInput.value = savedBylaw;
    if(bylawDisplay) bylawDisplay.textContent = savedBylaw || 'لا يوجد قانون أساسي مسجل حالياً.';

    loadDataFromCloud();
});

async function loadDataFromCloud() {
    try {
        const subSnapshot = await getDocs(collection(db, "subscribers"));
        subscribers = [];
        subSnapshot.forEach((docSnap) => {
            subscribers.push({ firestoreId: docSnap.id, ...docSnap.data() });
        });
        
        // ترتيب المنخرطين حسب رقم العداد تصاعدياً من 1 إلى الأخير
        subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));

        const transSnapshot = await getDocs(collection(db, "transactions"));
        transactionsList = [];
        totalIncome = 0;
        totalExpense = 0;
        transSnapshot.forEach((docSnap) => {
            let t = docSnap.data();
            transactionsList.push({ firestoreId: docSnap.id, ...t });
            if(t.type === 'income') totalIncome += Number(t.amount || 0); 
            else totalExpense += Number(t.amount || 0);
        });

        const billsSnap = await getDocs(collection(db, "archive_bills"));
        archiveBills = [];
        billsSnap.forEach(d => archiveBills.push(d.data()));

        const finSnap = await getDocs(collection(db, "archive_finance"));
        archiveFinance = [];
        finSnap.forEach(d => archiveFinance.push(d.data()));

        renderSubscribers();
        updateFinancialDashboard();
        renderTransactions();
        renderDebts();
    } catch (e) {
        console.error("خطأ في جلب البيانات: ", e);
    }
}

// ==========================================
// 4. المصادقة وتسجيل الدخول
// ==========================================
window.checkAuth = function() {
    if(sessionStorage.getItem('tamda_auth') === 'true') {
        const loginScreen = document.getElementById('loginScreen');
        const appContent = document.getElementById('appContent');
        const activeUserLabel = document.getElementById('activeUserLabel');
        if(loginScreen) loginScreen.style.display = 'none';
        if(appContent) appContent.style.display = 'block';
        if(activeUserLabel) activeUserLabel.textContent = "مرحباً: " + (roleNames[sessionStorage.getItem('tamda_role')] || '');
    }
}

window.handleEnter = function(e) { if (e.key === 'Enter') authenticate(); }

window.authenticate = function() {
    const role = document.getElementById('userRole').value;
    const code = document.getElementById('loginCode').value;
    if(secureCodes[role] === code) {
        sessionStorage.setItem('tamda_auth', 'true'); 
        sessionStorage.setItem('tamda_role', role);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        document.getElementById('activeUserLabel').textContent = "مرحباً: " + roleNames[role];
        showToast('تم تسجيل الدخول بنجاح');
    } else { 
        const err = document.getElementById('loginError');
        if(err) err.style.display = 'block'; 
    }
}

window.logout = function() { 
    sessionStorage.removeItem('tamda_auth'); 
    sessionStorage.removeItem('tamda_role'); 
    location.reload(); 
}

// ==========================================
// 5. التنقل وإغلاق القائمة الجانبية فوراً
// ==========================================
window.toggleSidebar = function() { 
    if(sidebar) sidebar.classList.toggle('active'); 
    if(overlay) overlay.classList.toggle('active'); 
}

window.showToast = function(message) {
    if(!toast) return;
    toast.textContent = message; 
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 2500);
}

window.navigateTo = function(pageName) {
    // إغلاق القائمة والخلفية المعتمة تماماً عند النقر على أي صفحة
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');

    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    
    if (views[pageName] && document.getElementById(views[pageName])) {
        document.getElementById(views[pageName]).style.display = 'block';
        if(pageName === '👥 إدارة المنخرطين') renderSubscribers();
        if(pageName === '⚙️ الإعدادات') loadSettingsToInputs();
        if(pageName === '📒 الديون والأرصدة') renderDebts();
        if(pageName === '💰 المداخيل والمصاريف') renderTransactions();
        if(pageName === '🗄️ الأرشيف والتخزين') renderArchive();
        if(pageName === '📊 الإحصائيات الشهرية') renderMonthlyStats();
        if(pageName === '📊 التقارير المالية') updateFinancialDashboard();
        showToast('تم الانتقال إلى: ' + pageName);
    }
}

// ==========================================
// 6. الإعدادات والقانون الأساسي
// ==========================================
function loadSettings() { 
    let savedSettings = localStorage.getItem('tamda_settings');
    if(savedSettings) { appSettings = JSON.parse(savedSettings); }
}

window.loadSettingsToInputs = function() {
    document.getElementById('setTier1').value = appSettings.tier1; 
    document.getElementById('setTier2').value = appSettings.tier2;
    document.getElementById('setTier3').value = appSettings.tier3; 
    document.getElementById('setMaintenance').value = appSettings.maintenance;
    document.getElementById('setPenalty').value = appSettings.penalty;
}

window.saveSettings = function() {
    appSettings.tier1 = parseFloat(document.getElementById('setTier1').value) || 4; 
    appSettings.tier2 = parseFloat(document.getElementById('setTier2').value) || 8;
    appSettings.tier3 = parseFloat(document.getElementById('setTier3').value) || 15; 
    appSettings.maintenance = parseFloat(document.getElementById('setMaintenance').value) || 15;
    appSettings.penalty = parseFloat(document.getElementById('setPenalty').value) || 50;
    
    localStorage.setItem('tamda_settings', JSON.stringify(appSettings)); 
    showToast('تم حفظ الإعدادات بنجاح!');
}

window.saveBylaws = function() {
    const text = document.getElementById('bylawInput').value;
    localStorage.setItem('tamda_bylaws', text);
    const display = document.getElementById('bylawDisplay');
    if(display) display.textContent = text || 'لا يوجد قانون أساسي مسجل حالياً.';
    showToast('تم حفظ القانون الأساسي بنجاح');
}

// ==========================================
// 7. إدارة المنخرطين
// ==========================================
window.saveSubscriber = async function() {
    const editingId = document.getElementById('editingSubId').value;
    const counterEl = document.getElementById('newSubCounter');
    const nameEl = document.getElementById('newSubName');
    const phoneEl = document.getElementById('newSubPhone');
    const locationEl = document.getElementById('newSubLocation');
    
    if (!counterEl || !nameEl) return;
    const counter = counterEl.value.trim();
    const name = nameEl.value.trim();
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const location = locationEl ? locationEl.value.trim() : '';
    
    if (!counter || !name) { showToast('المرجو إدخال رقم العداد والاسم'); return; }
    
    try {
        showToast('جاري الحفظ...');
        if (editingId) {
            await updateDoc(doc(db, "subscribers", editingId), { counter, name, phone, location });
            showToast('تم تعديل بيانات المشترك بنجاح!');
            resetSubForm();
        } else {
            if (subscribers.find(s => s.counter == counter)) { showToast('العداد مسجل مسبقاً!'); return; }
            await addDoc(collection(db, "subscribers"), {
                counter: counter, name: name, phone: phone, location: location,
                lastReading: null, delayMonths: 0, debtAmount: 0, lastBilledMonth: ''
            });
            counterEl.value = ''; nameEl.value = ''; if(phoneEl) phoneEl.value = ''; if(locationEl) locationEl.value = '';
            showToast('تم حفظ المشترك بنجاح!');
        }
        await loadDataFromCloud();
    } catch (e) {
        showToast('فشل الحفظ، تحقق من الإنترنت');
    }
};

window.editSubscriber = function(firestoreId) {
    const sub = subscribers.find(s => s.firestoreId === firestoreId);
    if (!sub) return;
    document.getElementById('editingSubId').value = sub.firestoreId;
    document.getElementById('newSubCounter').value = sub.counter;
    document.getElementById('newSubName').value = sub.name;
    document.getElementById('newSubPhone').value = sub.phone || '';
    document.getElementById('newSubLocation').value = sub.location || '';
    
    document.getElementById('subFormTitle').textContent = '✏️ تعديل بيانات المشترك';
    document.getElementById('subSaveBtn').textContent = '💾 تحديث البيانات';
    document.getElementById('subCancelBtn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.resetSubForm = function() {
    document.getElementById('editingSubId').value = '';
    document.getElementById('newSubCounter').value = '';
    document.getElementById('newSubName').value = '';
    document.getElementById('newSubPhone').value = '';
    document.getElementById('newSubLocation').value = '';
    document.getElementById('subFormTitle').textContent = '➕ إضافة مشترك جديد';
    document.getElementById('subSaveBtn').textContent = '💾 حفظ المشترك';
    document.getElementById('subCancelBtn').style.display = 'none';
};

window.renderSubscribers = function() {
    const container = document.getElementById('subscribersListContainer');
    if(!container) return;
    const searchEl = document.getElementById('searchSub');
    const searchTerm = (searchEl ? searchEl.value.toLowerCase() : '');
    container.innerHTML = '';
    
    let filteredSubs = subscribers.filter(s => s.name.toLowerCase().includes(searchTerm) || s.counter.toString().includes(searchTerm));
    const subCountEl = document.getElementById('subListCount');
    const dashSubEl = document.getElementById('dashSubCount');
    if(subCountEl) subCountEl.textContent = filteredSubs.length;
    if(dashSubEl) dashSubEl.textContent = subscribers.length;
    
    let totalDebts = 0; 
    subscribers.forEach(s => totalDebts += Number(s.debtAmount || 0));
    const dashDebtsEl = document.getElementById('dashDebts');
    if(dashDebtsEl) dashDebtsEl.textContent = totalDebts + ' درهم';

    filteredSubs.forEach((sub) => {
        const div = document.createElement('div'); 
        div.className = 'list-item';
        div.innerHTML = `
            <div class="list-info">
                <strong>عداد (${sub.counter}): ${sub.name}</strong>
                <span>الهاتف: ${sub.phone || 'غير مسجل'} | الموقع: ${sub.location || 'غير محدد'}</span>
                <span class="${(sub.debtAmount > 0) ? 'text-danger' : 'text-success'}">ديون: ${sub.debtAmount || 0} درهم (تأخير: ${sub.delayMonths || 0} أشهر)</span>
            </div>
            <div>
                <button class="edit-btn" onclick="editSubscriber('${sub.firestoreId}')">تعديل</button>
                <button class="action-btn" onclick="deleteSubscriber('${sub.firestoreId}')">حذف</button>
            </div>
        `;
        container.appendChild(div);
    });
};

window.deleteSubscriber = async function(firestoreId) {
    if(confirm('متأكد من حذف المشترك؟')) {
        try {
            await deleteDoc(doc(db, "subscribers", firestoreId));
            showToast('تم الحذف بنجاح');
            await loadDataFromCloud();
        } catch (e) { showToast('فشل الحذف'); }
    }
};

// ==========================================
// 8. الديون والأرصدة
// ==========================================
window.renderDebts = function() {
    const container = document.getElementById('debtsListContainer');
    if(!container) return;
    container.innerHTML = '';
    
    const debtors = subscribers.filter(s => Number(s.debtAmount) > 0);
    debtors.sort((a, b) => Number(a.counter) - Number(b.counter));

    if(debtors.length === 0) { 
        container.innerHTML = '<p class="text-success" style="font-weight:bold;">لا توجد ديون مسجلة حالياً. جميع الفواتير خالصة.</p>'; 
        return; 
    }
    
    debtors.forEach((sub) => {
        const div = document.createElement('div'); 
        div.className = 'list-item'; 
        div.style.borderRightColor = 'var(--danger-red)';
        div.innerHTML = `
            <div class="list-info">
                <strong style="color:var(--danger-red);">عداد (${sub.counter}): ${sub.name}</strong>
                <span>الهاتف: ${sub.phone || 'غير مسجل'} | المبلغ المتبقي: <strong>${sub.debtAmount} درهم</strong> | تأخير: ${sub.delayMonths} أشهر</span>
            </div>
            <div>
                <button class="pay-btn" onclick="collectDebt('${sub.firestoreId}', ${sub.debtAmount}, '${sub.counter}', '${sub.name}')">💵 استخلاص الدين</button>
            </div>
        `;
        container.appendChild(div);
    });
};

window.collectDebt = async function(firestoreId, amount, counter, name) {
    if(confirm(`هل تؤكد استخلاص مبلغ الدين (${amount} درهم) للمشترك ${name} (عداد ${counter})؟`)) {
        try {
            await updateDoc(doc(db, "subscribers", firestoreId), {
                debtAmount: 0,
                delayMonths: 0
            });

            let nowMonth = new Date().toISOString().slice(0, 7);
            await addDoc(collection(db, "transactions"), {
                month: nowMonth,
                type: 'income',
                amount: Number(amount),
                desc: `استخلاص دين متأخر - عداد: ${counter} (${name})`,
                fileName: 'استخلاص دين',
                timestamp: new Date().toISOString()
            });

            showToast('تم استخلاص الدين وتسجيله في المداخيل بنجاح!');
            await loadDataFromCloud();
        } catch (e) {
            showToast('فشل عملية الاستخلاص');
        }
    }
};

function getNextMonth(monthString) {
    if (!monthString) return '';
    let parts = monthString.split('-'); 
    if(parts.length < 2) return '';
    let d = new Date(parseInt(parts[0]), parseInt(parts[1]), 1); 
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

window.autoFillSubscriber = function() {
    const counterInput = document.getElementById('counterNum').value.trim();
    const sub = subscribers.find(s => s.counter == counterInput);
    if (sub) {
        document.getElementById('subscriberName').value = sub.name;
        if(sub.lastBilledMonth) document.getElementById('billingMonth').value = getNextMonth(sub.lastBilledMonth);
        if (sub.lastReading !== null) { 
            document.getElementById('prevReading').value = sub.lastReading; 
        } else { 
            document.getElementById('prevReading').value = ''; 
        }
        document.getElementById('currReading').value = '';
        document.getElementById('delayMonths').value = sub.delayMonths || 0;
    } else {
        document.getElementById('subscriberName').value = ''; 
        document.getElementById('prevReading').value = ''; 
        document.getElementById('currReading').value = '';
        document.getElementById('delayMonths').value = 0;
    }
    calculateBill();
};

window.enableEdit = function(elementId) {
    const input = document.getElementById(elementId);
    input.focus();
    showToast('تم فتح الحقل للتعديل اليدوي في حال الخطأ');
};

// ==========================================
// 9. العمليات المالية والتقارير
// ==========================================
window.updateFinancialDashboard = function() {
    const netBalance = totalIncome - totalExpense;
    const incReport = document.getElementById('totalIncomeReport');
    const expReport = document.getElementById('totalExpenseReport');
    const netReport = document.getElementById('netBalanceReport');
    const dashBal = document.getElementById('dashBalance');
    
    if(incReport) incReport.textContent = totalIncome + ' درهم';
    if(expReport) expReport.textContent = totalExpense + ' درهم';
    if(netReport) netReport.textContent = netBalance + ' درهم';
    if(dashBal) dashBal.textContent = netBalance + ' درهم';
};

window.saveTransaction = async function() {
    const month = document.getElementById('transMonth').value;
    const type = document.getElementById('transType').value;
    const amount = parseFloat(document.getElementById('transAmount').value) || 0;
    const desc = document.getElementById('transDesc').value.trim();
    const fileInput = document.getElementById('transFile');
    if (amount <= 0 || !month) { showToast('المرجو إدخال المبلغ والشهر'); return; }
    
    let fileName = 'وثيقة مسح ضوئي';
    if(fileInput && fileInput.files.length > 0) fileName = fileInput.files[0].name;

    let transactionObj = { month, type, amount, desc, fileName, timestamp: new Date().toISOString() };
    try {
        await addDoc(collection(db, "transactions"), transactionObj);
        await addDoc(collection(db, "archive_finance"), transactionObj);
        document.getElementById('transAmount').value = ''; 
        document.getElementById('transDesc').value = ''; 
        if(fileInput) fileInput.value = '';
        showToast('تم تسجيل العملية بنجاح');
        await loadDataFromCloud();
    } catch (e) { showToast('فشل الحفظ'); }
};

window.renderTransactions = function() {
    const container = document.getElementById('transactionsListContainer');
    if(!container) return;
    container.innerHTML = '';
    if(transactionsList.length === 0) { container.innerHTML = '<p>لا توجد عمليات مسجلة.</p>'; return; }
    transactionsList.slice().reverse().forEach((t) => {
        const div = document.createElement('div'); 
        div.className = 'list-item';
        div.style.borderRightColor = t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)';
        div.innerHTML = `
            <div class="list-info">
                <strong style="color:${t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)'}">${t.type === 'income' ? 'مدخول (+)' : 'مصروف (-)'} ${t.amount} درهم</strong>
                <span>الوصف: ${t.desc} | الشهر: ${t.month} | المستند: ${t.fileName}</span>
            </div>
            <button class="action-btn" onclick="deleteTransaction('${t.firestoreId}')">حذف</button>
        `;
        container.appendChild(div);
    });
};

window.deleteTransaction = async function(firestoreId) {
    if(confirm('حذف هذه العملية؟')) {
        try {
            await deleteDoc(doc(db, "transactions", firestoreId));
            showToast('تم الحذف بنجاح');
            await loadDataFromCloud();
        } catch (e) { showToast('فشل الحذف'); }
    }
};

// ==========================================
// 10. حساب وفواتير الماء
// ==========================================
let currentConsumptionData = 0;
let currentT1 = 0, currentT2 = 0, currentT3 = 0;

window.calculateBill = function() {
    const counterNum = document.getElementById('counterNum').value || 'غير محدد';
    const subName = document.getElementById('subscriberName').value || 'غير محدد';
    const billingMonth = document.getElementById('billingMonth').value || 'غير محدد';
    const prev = parseFloat(document.getElementById('prevReading').value) || 0;
    const curr = parseFloat(document.getElementById('currReading').value) || 0;
    const delayMonths = parseInt(document.getElementById('delayMonths').value) || 0;
    const tariffSystem = document.getElementById('tariffSystem').value;
    const isExempt = document.getElementById('exemptionCheck').checked;

    if (!document.getElementById('counterNum').value) return;
    if (curr < prev) { showToast('القراءة الحالية أقل من السابقة!'); return; }

    const consumption = curr - prev;
    currentConsumptionData = consumption;
    currentT1 = 0; currentT2 = 0; currentT3 = 0;
    let t1_cost = 0, t2_cost = 0, t3_cost = 0, maintenance = 0;

    if (tariffSystem === 'current') {
        maintenance = appSettings.maintenance;
        if (consumption <= 15) { currentT1 = consumption; } 
        else if (consumption <= 20) { currentT1 = 15; currentT2 = consumption - 15; } 
        else { currentT1 = 15; currentT2 = 5; currentT3 = consumption - 20; }

        t1_cost = currentT1 * appSettings.tier1;
        t2_cost = currentT2 * appSettings.tier2;
        t3_cost = currentT3 * appSettings.tier3;
    } else {
        maintenance = 15;
        if (consumption <= 20) { currentT1 = consumption; } 
        else if (consumption <= 30) { currentT1 = 20; currentT2 = consumption - 20; } 
        else { currentT1 = 20; currentT2 = 10; currentT3 = consumption - 30; }

        t1_cost = currentT1 * 3;
        t2_cost = currentT2 * 5;
        t3_cost = currentT3 * 7;
    }

    const consumptionCost = t1_cost + t2_cost + t3_cost;
    
    document.getElementById('row-t1').style.display = currentT1 > 0 ? 'flex' : 'none'; 
    document.getElementById('t1-val').textContent = `${currentT1} m³ = ${t1_cost} درهم`;
    document.getElementById('row-t2').style.display = currentT2 > 0 ? 'flex' : 'none'; 
    document.getElementById('t2-val').textContent = `${currentT2} m³ = ${t2_cost} درهم`;
    document.getElementById('row-t3').style.display = currentT3 > 0 ? 'flex' : 'none'; 
    document.getElementById('t3-val').textContent = `${currentT3} m³ = ${t3_cost} درهم`;

    let penaltyCost = 0;
    if (delayMonths >= 2) { 
        penaltyCost = appSettings.penalty; 
        document.getElementById('penaltyRow').style.display = 'flex'; 
        document.getElementById('printPenalty').textContent = penaltyCost + ' درهم'; 
    } else { 
        document.getElementById('penaltyRow').style.display = 'none'; 
    }

    let calculatedTotal = consumptionCost + maintenance + penaltyCost;

    if (isExempt) {
        currentBillTotal = 0;
        document.getElementById('exemptionNotice').style.display = 'flex';
    } else {
        currentBillTotal = calculatedTotal;
        document.getElementById('exemptionNotice').style.display = 'none';
    }

    document.getElementById('printMonth').textContent = billingMonth; 
    document.getElementById('printName').textContent = subName;
    document.getElementById('printCounter').textContent = counterNum; 
    document.getElementById('printPrev').textContent = prev;
    document.getElementById('printCurr').textContent = curr; 
    document.getElementById('printMaintenance').textContent = maintenance + ' درهم';
    document.getElementById('consumptionResult').textContent = consumption + ' m³'; 
    document.getElementById('consumptionPriceResult').textContent = consumptionCost + ' درهم';
    document.getElementById('totalPriceResult').textContent = currentBillTotal + ' درهم';
    
    document.getElementById('billResult').style.display = 'block'; 
};

window.saveBill = async function(isPaid) {
    if(currentBillTotal >= 0) {
        const counterInput = document.getElementById('counterNum').value.trim();
        const subNameStr = document.getElementById('subscriberName').value || 'غير محدد';
        const curr = parseFloat(document.getElementById('currReading').value) || 0;
        const currentMonth = document.getElementById('billingMonth').value;
        const isExempt = document.getElementById('exemptionCheck').checked;
        const sub = subscribers.find(s => s.counter == counterInput);
        
        let billArchiveObj = {
            month: currentMonth,
            counter: counterInput,
            name: subNameStr,
            consumption: currentConsumptionData,
            t1: currentT1,
            t2: currentT2,
            t3: currentT3,
            total: currentBillTotal,
            status: isPaid ? 'خالصة' : 'دين',
            isExempt: isExempt,
            timestamp: new Date().toISOString()
        };

        try {
            await addDoc(collection(db, "archive_bills"), billArchiveObj);

            if (sub) {
                let newDelay = isPaid ? 0 : ((sub.delayMonths || 0) + 1);
                let newDebt = isPaid ? 0 : ((sub.debtAmount || 0) + currentBillTotal);
                await updateDoc(doc(db, "subscribers", sub.firestoreId), {
                    lastReading: curr, lastBilledMonth: currentMonth, delayMonths: newDelay, debtAmount: newDebt
                });
            }

            if (isPaid && currentBillTotal > 0) {
                await addDoc(collection(db, "transactions"), {
                    month: currentMonth, type: 'income', amount: currentBillTotal,
                    desc: `استخلاص فاتورة ماء - عداد: ${counterInput} (${subNameStr})`,
                    fileName: 'فاتورة أوتوماتيكية', timestamp: new Date().toISOString()
                });
            }

            if (currentConsumptionData > 20 && sub && sub.phone) {
                setTimeout(() => {
                    if (confirm(`تنبيه: هذا المشترك (${subNameStr}) تجاوز استهلاكه 20 طناً (${currentConsumptionData} m³).\nهل تريد إرسال إنذار ترشيد الاستهلاك عبر واتساب؟`)) {
                        let alertMsg = `⚠️ إنذار ترشيد استهلاك الماء\nمرحباً السيد(ة) ${subNameStr}،\nتلاحظ لجمعية تامدة للتنمية أن استهلاككم لشهر ${currentMonth} قد بلغ ${currentConsumptionData} طن (m³)، وهو ما يتجاوز الحد الطبيعي (20 طن).\nالمرجو ترشيد الاستهلاك وشكراً.`;
                        window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(alertMsg)}`, '_blank');
                    }
                }, 500);
            }

            showToast('تم حفظ الفاتورة بنجاح');
            currentBillTotal = 0; 
            document.getElementById('billResult').style.display = 'none';
            document.getElementById('currReading').value = '';
            document.getElementById('exemptionCheck').checked = false;
            
            let nextCounter = parseInt(counterInput);
            if (!isNaN(nextCounter)) { document.getElementById('counterNum').value = nextCounter + 1; }
            autoFillSubscriber();
            await loadDataFromCloud();

        } catch (e) { showToast('فشل حفظ الفاتورة'); }
    } else { showToast('يرجى حساب الفاتورة أولاً'); }
};

window.sendWhatsAppNotification = function() {
    const counterInput = document.getElementById('counterNum').value.trim();
    const subNameStr = document.getElementById('subscriberName').value || 'المشترك';
    const currentMonth = document.getElementById('billingMonth').value || 'الحالي';
    const sub = subscribers.find(s => s.counter == counterInput);
    if (!sub || !sub.phone) { showToast('رقم هاتف المشترك غير مسجل في ملفه!'); return; }

    let message = `مرحباً السيد(ة) ${subNameStr}،\nتعلَمكم جمعية تامدة للتنمية أن فاتورة استهلاك ماء الشرب لشهر ${currentMonth} هي: ${currentBillTotal} درهم.\nالمرجو المبادرة بالأداء وشكراً.`;
    window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(message)}`, '_blank');
};

// ==========================================
// 11. الإحصائيات الشهرية
// ==========================================
window.renderMonthlyStats = function() {
    const container = document.getElementById('statsContainer');
    if(!container) return;
    const monthSelect = document.getElementById('statsMonthSelect');
    if(!monthSelect.value) {
        let now = new Date();
        monthSelect.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    const selectedMonth = monthSelect.value;
    
    let monthBills = archiveBills.filter(b => b.month === selectedMonth);
    if(monthBills.length === 0) {
        container.innerHTML = `<p style="margin-top:15px; color:#666;">لا توجد بيانات استهلاك مسجلة لشهر ${selectedMonth}.</p>`;
        return;
    }

    let totalWater = 0, totalT1 = 0, totalT2 = 0, totalT3 = 0, maxConsumption = -1, topConsumer = '---';
    monthBills.forEach(b => {
        let cons = Number(b.consumption || 0);
        totalWater += cons;
        totalT1 += Number(b.t1 || 0);
        totalT2 += Number(b.t2 || 0);
        totalT3 += Number(b.t3 || 0);
        if(cons > maxConsumption) {
            maxConsumption = cons;
            topConsumer = `عداد (${b.counter}) ${b.name} - ${cons} m³`;
        }
    });

    container.innerHTML = `
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:10px;">
            <div class="stat-row"><span>مجموع الاستهلاك المائي لشهر ${selectedMonth}:</span><strong style="color:var(--primary-blue);">${totalWater} m³</strong></div>
            <div class="stat-row"><span>مجموع استهلاك الشطر الأول:</span><strong>${totalT1} m³</strong></div>
            <div class="stat-row"><span>مجموع استهلاك الشطر الثاني:</span><strong>${totalT2} m³</strong></div>
            <div class="stat-row"><span>مجموع استهلاك الشطر الثالث:</span><strong>${totalT3} m³</strong></div>
            <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
            <div class="stat-row"><span>أكثر شخص استهلاكاً للماء:</span><strong class="text-danger">${topConsumer}</strong></div>
        </div>
    `;
};

// ==========================================
// 12. ملف الاستهلاك الشهري الشامل والأرشيف
// ==========================================
window.renderArchive = function() {
    const container = document.getElementById('archiveContainer');
    if(!container) return;
    container.innerHTML = '';
    
    let allMonths = new Set();
    archiveBills.forEach(b => allMonths.add(b.month));
    archiveFinance.forEach(f => allMonths.add(f.month));
    let sortedMonths = Array.from(allMonths).sort().reverse();
    
    if(sortedMonths.length === 0) {
        container.innerHTML = '<p>لا توجد بيانات مسجلة في الأرشيف بعد.</p>';
        return;
    }

    sortedMonths.forEach(month => {
        let monthBills = archiveBills.filter(b => b.month === month);
        let monthFinance = archiveFinance.filter(f => f.month === month);
        
        monthBills.sort((a, b) => Number(a.counter) - Number(b.counter));

        let monthTotalWater = 0, monthTotalAmount = 0;
        monthBills.forEach(b => {
            monthTotalWater += Number(b.consumption || 0);
            monthTotalAmount += Number(b.total || 0);
        });

        const box = document.createElement('div');
        box.className = 'archive-month-box';
        
        let html = `
            <div class="printable-archive">
                <h4 style="margin-top:0; color:var(--primary-blue); border-bottom:2px solid var(--secondary-cyan); padding-bottom:8px;">
                    <span>📅 ملف الاستهلاك الشامل - شهر: ${month}</span>
                </h4>
                <div style="display:flex; gap:20px; margin-bottom:10px; font-size:0.95rem; background:var(--bg-light); padding:8px; border-radius:6px;">
                    <span>إجمالي الاستهلاك الشهري: <strong>${monthTotalWater} m³</strong></span>
                    <span>إجمالي المبالغ المحصلة: <strong class="text-success">${monthTotalAmount} درهم</strong></span>
                </div>
                <h5 style="margin: 15px 0 5px 0; color:var(--text-dark);">💧 تفاصيل استهلاك العدادات والوضعيات:</h5>
        `;
        
        if(monthBills.length > 0) {
            html += `<table class="archive-table"><thead><tr><th>رقم العداد</th><th>اسم المشترك</th><th>الاستهلاك (m³)</th><th>الثمن (درهم)</th><th>الوضع</th></tr></thead><tbody>`;
            monthBills.forEach(b => { 
                html += `<tr><td>${b.counter}</td><td>${b.name}</td><td>${b.consumption}</td><td>${b.total}</td><td>${b.status} ${b.isExempt ? '(إعفاء)' : ''}</td></tr>`; 
            });
            html += `</tbody></table>`;
        } else {
            html += `<p style="font-size:0.9rem; color:#666;">لا توجد فواتير مسجلة لهذا الشهر.</p>`;
        }
        
        html += `<h5 style="margin: 15px 0 5px 0; color:var(--text-dark);">💰 العمليات المالية (مداخيل ومصاريف):</h5>`;
        if(monthFinance.length > 0) {
            html += `<table class="archive-table"><thead><tr><th>النوع</th><th>المبلغ (درهم)</th><th>الوصف</th><th>المستند</th></tr></thead><tbody>`;
            monthFinance.forEach(f => {
                let typeText = f.type === 'income' ? 'مدخول (+)' : 'مصروف (-)';
                let colorClass = f.type === 'income' ? 'text-success' : 'text-danger';
                html += `<tr><td class="${colorClass}">${typeText}</td><td>${f.amount}</td><td>${f.desc}</td><td>${f.fileName}</td></tr>`;
            });
            html += `</tbody></table>`;
        } else {
            html += `<p style="font-size:0.9rem; color:#666;">لا توجد عمليات مالية مسجلة لهذا الشهر.</p>`;
        }
        
        html += `</div>`;
        box.innerHTML = html;
        container.appendChild(box);
    });
};
