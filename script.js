import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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

let secureCodes = JSON.parse(localStorage.getItem('tamda_codes')) || { 'president': '1111', 'secretary': '2222', 'treasurer': '3333' };
const roleNames = { 'president': 'الرئيس', 'secretary': 'الكاتب العام', 'treasurer': 'أمين المال', 'subscriber': 'المنخرط' };

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const toast = document.getElementById('toast');

let totalIncome = 0; let totalExpense = 0; let totalDonationsIncome = 0;
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
    '💰 المداخيل والمصاريف': 'view-finance',
    '💖 سجل التبرعات': 'view-donations',
    '📒 الديون والأرصدة': 'view-debts',
    '📥 الشكايات والطلبات': 'view-complaints',
    '📜 القانون والتقارير': 'view-bylaws', 
    '🗄️ الأرشيف والتخزين': 'view-archive',
    '👥 نشاط الأعضاء': 'view-member-activity',
    '⚙️ الإعدادات': 'view-settings',
    '👤 فواتيري وطلباتي': 'view-sub-portal'
};

function loadJsPDF() {
    return new Promise((resolve, reject) => {
        if (window.jspdf) { resolve(); return; }
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
    });
}

// التحكم في زر الرجوع (الضغطتين)
let backPressTimer = null;
history.pushState(null, null, location.href);

window.addEventListener('popstate', (e) => {
    if (backPressTimer) {
        clearTimeout(backPressTimer);
        window.history.back();
    } else {
        e.preventDefault();
        history.pushState(null, null, location.href); 
        showToast('⚠️ اضغط مرة أخرى للخروج من التطبيق');
        backPressTimer = setTimeout(() => { backPressTimer = null; }, 2000);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadLocalData();
    loadSettings();
    checkAuth(); 
    
    let savedBylaw = localStorage.getItem('tamda_bylaws') || '';
    if(document.getElementById('bylawInput')) document.getElementById('bylawInput').value = savedBylaw;
    if(document.getElementById('bylawDisplay')) document.getElementById('bylawDisplay').textContent = savedBylaw || 'لا يوجد قانون أساسي مسجل حالياً.';
    
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

function updateLastActive() {
    if(localStorage.getItem('tamda_auth') === 'true') {
        localStorage.setItem('tamda_last_active', Date.now());
    }
}

function checkSessionTimeout() {
    if(localStorage.getItem('tamda_auth') === 'true') {
        let last = parseInt(localStorage.getItem('tamda_last_active') || '0');
        if(last > 0 && (Date.now() - last > SESSION_TIMEOUT)) {
            logout(true);
        }
    }
}

function checkAuth() {
    try {
        let isAuth = localStorage.getItem('tamda_auth') === 'true';
        const loginScreen = document.getElementById('loginScreen');
        const appContent = document.getElementById('appContent');

        if (isAuth) {
            let lastActive = parseInt(localStorage.getItem('tamda_last_active') || '0');
            if (lastActive > 0 && (Date.now() - lastActive > SESSION_TIMEOUT)) {
                logout(true);
                return;
            }
        }

        if(isAuth) {
            if(loginScreen) loginScreen.style.display = 'none';
            if(appContent) appContent.style.display = 'block';
            localStorage.setItem('tamda_last_active', Date.now());
            
            let role = localStorage.getItem('tamda_role');
            if (role === 'subscriber') {
                document.getElementById('adminLinks').style.display = 'none';
                document.getElementById('subscriberLinks').style.display = 'block';
                document.getElementById('activeUserLabel').textContent = "بوابة المشتركين (عداد: " + localStorage.getItem('tamda_counter') + ")";
                navigateTo('👤 فواتيري وطلباتي');
            } else {
                document.getElementById('adminLinks').style.display = 'block';
                document.getElementById('subscriberLinks').style.display = 'none';
                document.getElementById('activeUserLabel').textContent = "مرحباً: " + roleNames[role];
                navigateTo('🏠 لوحة القيادة');
                renderCapital();
            }
        } else {
            if(loginScreen) loginScreen.style.display = 'flex';
            if(appContent) appContent.style.display = 'none';
        }
    } catch(e) {}
}

function authenticate() {
    try {
        const roleSelect = document.getElementById('userRole');
        const codeInput = document.getElementById('loginCode');
        const err = document.getElementById('loginError');
        
        if(!roleSelect || !codeInput || !err) return;
        const role = roleSelect.value;
        const code = codeInput.value.trim();
        
        if (role === 'subscriber') {
            const counterInput = document.getElementById('loginCounter');
            const counter = counterInput ? counterInput.value.trim() : '';
            let sub = subscribers.find(s => String(s.counter).trim() === counter && s.pin && s.pin === code);
            if(sub) {
                localStorage.setItem('tamda_auth', 'true'); 
                localStorage.setItem('tamda_role', 'subscriber');
                localStorage.setItem('tamda_counter', counter);
                localStorage.setItem('tamda_subname', sub.name);
                localStorage.setItem('tamda_last_active', Date.now());
                err.style.display = 'none';
                codeInput.value = '';
                checkAuth();
                showToast('مرحباً بك في بوابتك الخاصة');
            } else { err.style.display = 'block'; err.textContent = 'رقم العداد أو الرمز السري غير صحيح!'; }
        } else {
            if(secureCodes[role] === code) {
                localStorage.setItem('tamda_auth', 'true'); 
                localStorage.setItem('tamda_role', role);
                localStorage.setItem('tamda_last_active', Date.now());
                recordLoginStats(role);
                err.style.display = 'none';
                codeInput.value = '';
                checkAuth();
                showToast('تم تسجيل الدخول بنجاح');
            } else { err.style.display = 'block'; err.textContent = 'الرمز السري للإدارة غير صحيح!'; }
        }
    } catch(e) {}
}

function logout(isTimeout = false) { 
    localStorage.removeItem('tamda_auth');
    localStorage.removeItem('tamda_role');
    localStorage.removeItem('tamda_counter');
    localStorage.removeItem('tamda_subname');
    localStorage.removeItem('tamda_last_active');
    const loginCode = document.getElementById('loginCode');
    const loginError = document.getElementById('loginError');
    if(loginCode) loginCode.value = '';
    if(loginError) loginError.style.display = 'none';
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    const appContent = document.getElementById('appContent');
    const loginScreen = document.getElementById('loginScreen');
    if(appContent) appContent.style.display = 'none';
    if(loginScreen) loginScreen.style.display = 'flex';
    if(isTimeout === true) showToast("تم تسجيل الخروج تلقائياً لمرور 3 دقائق دون نشاط.");
}

function handleEnter(e) { if (e.key === 'Enter') authenticate(); }

function recordLoginStats(role) {
    if(role === 'subscriber') return;
    let currentMonth = new Date().toISOString().slice(0, 7);
    let allActivity = JSON.parse(localStorage.getItem('tamda_member_activity')) || {};
    if(!allActivity[currentMonth]) allActivity[currentMonth] = {};
    if(!allActivity[currentMonth][role]) allActivity[currentMonth][role] = { logins: 0, minutes: 0 };
    allActivity[currentMonth][role].logins += 1;
    localStorage.setItem('tamda_member_activity', JSON.stringify(allActivity));
}

function toggleSidebar() { 
    if (sidebar) sidebar.classList.toggle('active'); 
    if (overlay) overlay.classList.toggle('active'); 
}

function showToast(message) {
    if(!toast) return; toast.textContent = message; toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function navigateTo(pageName) {
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    
    if (views[pageName] && document.getElementById(views[pageName])) {
        document.getElementById(views[pageName]).style.display = 'block';
        if(pageName === '👥 إدارة المنخرطين') renderSubscribers();
        if(pageName === '⚙️ الإعدادات') loadSettingsToInputs();
        if(pageName === '👥 نشاط الأعضاء') renderMemberActivityStats();
        if(pageName === '📒 الديون والأرصدة') renderDebts();
        if(pageName === '💰 المداخيل والمصاريف') renderTransactions();
        if(pageName === '💖 سجل التبرعات') renderDonations();
        if(pageName === '🗄️ الأرشيف والتخزين') renderArchive();
        if(pageName === '📊 الإحصائيات الشهرية') renderAdvancedStats();
        if(pageName === '📊 التقارير المالية') { updateFinancialDashboard(); renderCapital(); }
        if(pageName === '📜 القانون والتقارير') renderPDFReportsList();
        if(pageName === '📥 الشكايات والطلبات') renderAdminComplaints();
        if(pageName === '👤 فواتيري وطلباتي') renderSubPortalBills();
    }
}

function loadLocalData() {
    subscribers = JSON.parse(localStorage.getItem('local_subs')) || [];
    transactionsList = JSON.parse(localStorage.getItem('local_trans')) || [];
    donationsList = JSON.parse(localStorage.getItem('local_donations')) || []; 
    archiveBills = JSON.parse(localStorage.getItem('local_bills')) || [];
    archiveFinance = JSON.parse(localStorage.getItem('local_fin')) || [];
    complaintsList = JSON.parse(localStorage.getItem('local_complaints')) || [];
    capitalLedger = JSON.parse(localStorage.getItem('local_capital')) || [];
    capitalLedger = capitalLedger.filter(item => Number(item.amount) > 0);
    pdfReportsList = JSON.parse(localStorage.getItem('local_pdf_reports')) || [];
    saveLocalData();
    recalculateFinancials();
}

function saveLocalData() {
    localStorage.setItem('local_subs', JSON.stringify(subscribers));
    localStorage.setItem('local_trans', JSON.stringify(transactionsList));
    localStorage.setItem('local_donations', JSON.stringify(donationsList)); 
    localStorage.setItem('local_bills', JSON.stringify(archiveBills));
    localStorage.setItem('local_fin', JSON.stringify(archiveFinance));
    localStorage.setItem('local_complaints', JSON.stringify(complaintsList));
    localStorage.setItem('local_capital', JSON.stringify(capitalLedger));
    localStorage.setItem('local_pdf_reports', JSON.stringify(pdfReportsList));
}

function recalculateFinancials() {
    let transIncome = 0; 
    totalExpense = 0;
    transactionsList.forEach(t => { 
        if(t.type === 'income') { transIncome += Number(t.amount || 0); } 
        else { totalExpense += Number(t.amount || 0); }
    });
    totalDonationsIncome = 0;
    donationsList.forEach(d => { totalDonationsIncome += Number(d.amount || 0); });
    totalIncome = transIncome + totalDonationsIncome;
}

function loadSettings() {
    let saved = JSON.parse(localStorage.getItem('tamda_settings'));
    if(saved) appSettings = Object.assign(appSettings, saved);
}

function loadSettingsToInputs() {
    if(document.getElementById('setTier1')) document.getElementById('setTier1').value = appSettings.tier1;
    if(document.getElementById('setTier2')) document.getElementById('setTier2').value = appSettings.tier2;
    if(document.getElementById('setTier3')) document.getElementById('setTier3').value = appSettings.tier3;
    if(document.getElementById('setMaintenance')) document.getElementById('setMaintenance').value = appSettings.maintenance;
    if(document.getElementById('setPenalty')) document.getElementById('setPenalty').value = appSettings.penalty;
}

function saveSettings() {
    appSettings.tier1 = parseFloat(document.getElementById('setTier1').value) || 4;
    appSettings.tier2 = parseFloat(document.getElementById('setTier2').value) || 8;
    appSettings.tier3 = parseFloat(document.getElementById('setTier3').value) || 15;
    appSettings.maintenance = parseFloat(document.getElementById('setMaintenance').value) || 15;
    appSettings.penalty = parseFloat(document.getElementById('setPenalty').value) || 50;
    localStorage.setItem('tamda_settings', JSON.stringify(appSettings));
    showToast('تم حفظ الإعدادات بنجاح!');
}

async function loadDataFromCloud() {
    try {
        const subSnapshot = await getDocs(collection(db, "subscribers"));
        subscribers = []; subSnapshot.forEach(d => { subscribers.push({ firestoreId: d.id, ...d.data() }); });
        subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));

        const compSnap = await getDocs(collection(db, "complaints"));
        complaintsList = []; compSnap.forEach(d => { complaintsList.push({ firestoreId: d.id, ...d.data() }); });

        const donSnap = await getDocs(collection(db, "donations"));
        donationsList = []; donSnap.forEach(d => { 
            let data = d.data();
            // تجاهل أي عنصر قديم يحمل معرف محلي وهمي غير حقيقي
            if (d.id && !d.id.startsWith('local_')) {
                donationsList.push({ firestoreId: d.id, ...data }); 
            }
        });

        const transSnapshot = await getDocs(collection(db, "transactions"));
        transactionsList = []; transSnapshot.forEach(d => { 
            if (d.id && !d.id.startsWith('local_')) {
                transactionsList.push({ firestoreId: d.id, ...d.data() }); 
            }
        });

        const billsSnap = await getDocs(collection(db, "archive_bills"));
        archiveBills = []; billsSnap.forEach(d => { if(d.id && !d.id.startsWith('local_')) archiveBills.push({ firestoreId: d.id, ...d.data() }); });

        const finSnap = await getDocs(collection(db, "archive_finance"));
        archiveFinance = []; finSnap.forEach(d => { if(d.id && !d.id.startsWith('local_')) archiveFinance.push({ firestoreId: d.id, ...d.data() }); });
        
        const capSnap = await getDocs(collection(db, "capital_ledger"));
        capitalLedger = []; capSnap.forEach(d => { let item = d.data(); if(d.id && !d.id.startsWith('local_') && Number(item.amount) > 0) capitalLedger.push({ firestoreId: d.id, ...item }); });
        
        const bylawSnap = await getDocs(collection(db, "bylaws"));
        if(!bylawSnap.empty) {
            let cloudText = bylawSnap.docs[0].data().text;
            localStorage.setItem('tamda_bylaws', cloudText);
            if(document.getElementById('bylawInput')) document.getElementById('bylawInput').value = cloudText;
            if(document.getElementById('bylawDisplay')) document.getElementById('bylawDisplay').textContent = cloudText;
        }

        const reportsSnap = await getDocs(collection(db, "pdf_reports"));
        pdfReportsList = []; reportsSnap.forEach(d => { if(d.id && !d.id.startsWith('local_')) pdfReportsList.push({ firestoreId: d.id, ...d.data() }); });

        saveLocalData(); recalculateFinancials();
        
        if(localStorage.getItem('tamda_auth') === 'true') {
            if(localStorage.getItem('tamda_role') === 'subscriber') {
                renderSubPortalBills();
            } else {
                renderSubscribers(); updateFinancialDashboard(); renderTransactions(); renderDonations(); renderDebts(); renderAdminComplaints(); processAutoMonthlyCapital(); renderCapital(); renderPDFReportsList();
            }
        }
    } catch (e) {}
}

function printDonations() { document.body.classList.add('print-mode-donations'); window.print(); setTimeout(() => { document.body.classList.remove('print-mode-donations'); }, 500); }

function renderMemberActivityStats() {
    const container = document.getElementById('standaloneMemberActivity'); if(!container) return;
    let currentMonth = new Date().toISOString().slice(0, 7);
    let allActivity = JSON.parse(localStorage.getItem('tamda_member_activity')) || {};
    let monthData = allActivity[currentMonth] || {};
    let html = `<p>إحصائيات شهر: <strong>${currentMonth}</strong></p><div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">`;
    for(let r in roleNames) {
        if(r === 'subscriber') continue;
        let stats = monthData[r] || { logins: 0, minutes: 0 };
        let hours = (stats.minutes / 60).toFixed(1);
        html += `<div class="list-item"><div class="list-info"><strong>${roleNames[r]}</strong><span>تسجيلات الدخول: <strong>${stats.logins}</strong> مرة | ساعات العمل: <strong class="text-success">${hours} ساعة</strong></span></div></div>`;
    }
    html += `</div>`; container.innerHTML = html;
}

// ================== إدارة المنخرطين ==================
async function saveSubscriber() {
    const editingId = document.getElementById('editingSubId').value;
    const counter = document.getElementById('newSubCounter').value.trim();
    const name = document.getElementById('newSubName').value.trim();
    const phone = document.getElementById('newSubPhone').value.trim();
    const loc = document.getElementById('newSubLocation').value.trim();
    if (!counter || !name) return showToast('المرجو إدخال رقم العداد والاسم');
    
    try {
        if (editingId) {
            let sub = subscribers.find(s => s.firestoreId === editingId);
            if(sub) { sub.counter = counter; sub.name = name; sub.phone = phone; sub.location = loc; }
            if (navigator.onLine) {
                await updateDoc(doc(db, "subscribers", editingId), { counter, name, phone, location: loc });
            }
            showToast('تم تعديل بيانات المشترك بنجاح!');
            resetSubForm();
        } else {
            if (subscribers.find(s => s.counter == counter)) return showToast('العداد مسجل مسبقاً!');
            
            let newSub = { counter: counter, name: name, phone: phone, location: loc, lastReading: null, delayMonths: 0, debtAmount: 0, lastBilledMonth: '', avgConsumption: 15, pin: '' };
            if (!navigator.onLine) return showToast('⚠️ يجب الاتصال بالإنترنت لإضافة مشترك جديد');
            
            let docRef = await addDoc(collection(db, "subscribers"), newSub);
            newSub.firestoreId = docRef.id;
            
            subscribers.push(newSub);
            subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));
            
            document.getElementById('newSubCounter').value = ''; document.getElementById('newSubName').value = ''; document.getElementById('newSubPhone').value = ''; document.getElementById('newSubLocation').value = ''; 
            showToast('تم حفظ المشترك بنجاح');
        }
        saveLocalData(); renderSubscribers();
    } catch (e) { showToast('❌ حدث خطأ أثناء الحفظ'); }
}

function editSubscriber(firestoreId) {
    const sub = subscribers.find(s => s.firestoreId === firestoreId); if (!sub) return;
    document.getElementById('editingSubId').value = sub.firestoreId; document.getElementById('newSubCounter').value = sub.counter; document.getElementById('newSubName').value = sub.name; document.getElementById('newSubPhone').value = sub.phone || ''; document.getElementById('newSubLocation').value = sub.location || ''; document.getElementById('subFormTitle').textContent = '✏️ تعديل بيانات المشترك'; document.getElementById('subSaveBtn').textContent = '💾 تحديث البيانات'; document.getElementById('subCancelBtn').style.display = 'block'; window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSubForm() {
    document.getElementById('editingSubId').value = ''; document.getElementById('newSubCounter').value = ''; document.getElementById('newSubName').value = ''; document.getElementById('newSubPhone').value = ''; document.getElementById('newSubLocation').value = ''; document.getElementById('subFormTitle').textContent = '➕ إضافة مشترك جديد'; document.getElementById('subSaveBtn').textContent = '💾 حفظ المشترك'; document.getElementById('subCancelBtn').style.display = 'none';
}

function renderSubscribers() {
    const container = document.getElementById('subscribersListContainer'); if(!container) return;
    const searchTerm = document.getElementById('searchSub').value.toLowerCase(); container.innerHTML = '';
    let filtered = subscribers.filter(s => s.name.toLowerCase().includes(searchTerm) || s.counter.toString().includes(searchTerm));
    document.getElementById('subListCount').textContent = filtered.length; if(document.getElementById('dashSubCount')) document.getElementById('dashSubCount').textContent = subscribers.length;
    let totalDebts = 0; subscribers.forEach(s => totalDebts += Number(s.debtAmount || 0)); if(document.getElementById('dashDebts')) document.getElementById('dashDebts').textContent = totalDebts + ' درهم';
    filtered.forEach((sub) => {
        const div = document.createElement('div'); div.className = 'list-item'; div.style.flexDirection = 'column'; div.style.alignItems = 'stretch';
        let pinBtnText = sub.pin ? "🔄 إعادة إرسال الكود للمشترك" : "🔑 توليد وإرسال كود الدخول";
        div.innerHTML = `
            <div class="list-info" style="text-align: right; width: 100%; margin-bottom: 10px;">
                <strong>عداد (${sub.counter}): ${sub.name}</strong>
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

async function generateAndSendPIN(firestoreId) {
    let sub = subscribers.find(s => s.firestoreId === firestoreId); if (!sub) return;
    if (!sub.phone) return showToast('رقم هاتف المنخرط غير مسجل!');
    let pin = Math.floor(1000 + Math.random() * 9000).toString(); sub.pin = pin; saveLocalData();
    if(navigator.onLine) await updateDoc(doc(db, "subscribers", firestoreId), { pin: pin }).catch(()=>{});
    let msg = `مرحباً السيد(ة) ${sub.name}،\nتم تفعيل حسابك في بوابة المشتركين لتطبيق تسيير ماء تامدة.\n\n👤 اسم المستخدم (رقم العداد): ${sub.counter}\n🔑 الرمز السري: ${pin}`;
    window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(msg)}`, '_blank'); showToast('تم توليد الكود وفتح واتساب'); renderSubscribers();
}

async function deleteSubscriber(id) { 
    if(confirm('هل أنت متأكد من حذف المشترك نهائياً؟')) { 
        subscribers = subscribers.filter(s => s.firestoreId !== id); 
        saveLocalData(); 
        if(navigator.onLine) {
            try { await deleteDoc(doc(db, "subscribers", id)); } catch(e){}
        }
        renderSubscribers(); showToast('تم الحذف بنجاح'); 
    } 
}

// ================== بوابات ونظام المشتركين ==================
function renderSubPortalBills() {
    let subCounter = localStorage.getItem('tamda_counter'); let subName = localStorage.getItem('tamda_subname'); if(!subCounter) return;
    document.getElementById('portalSubName').textContent = subName; document.getElementById('portalSubCounter').textContent = subCounter;
    const container = document.getElementById('portalBillsContainer'); container.innerHTML = '';
    let myBills = archiveBills.filter(b => b.counter == subCounter); myBills.sort((a,b) => b.month.localeCompare(a.month)); 
    if(myBills.length === 0) return container.innerHTML = '<p>لا توجد فواتير مسجلة في الأرشيف لعدادك حتى الآن.</p>';
    myBills.forEach(b => {
        let isPaid = b.status === 'خالصة'; let color = isPaid ? 'var(--accent-green)' : 'var(--danger-red)';
        container.innerHTML += `<div class="list-item" style="border-right-color: ${color}"><div class="list-info"><strong style="color: ${color}">شهر: ${b.month} | المبلغ: ${b.total} درهم</strong><span>الاستهلاك: ${b.consumption} m³ | الوضعية: <strong style="color: ${color}">${b.status}</strong> ${b.isExempt ? '(إعفاء)' : ''}</span></div></div>`;
    });
}

async function submitComplaint() {
    const text = document.getElementById('complaintText').value.trim(); if(!text) return showToast('المرجو كتابة الشكاية أو الطلب أولاً');
    let subCounter = localStorage.getItem('tamda_counter'); let subName = localStorage.getItem('tamda_subname');
    let comp = { counter: subCounter, name: subName, text: text, date: new Date().toLocaleDateString('ar-MA'), status: 'جديدة' };
    
    try {
        if(!navigator.onLine) return showToast('⚠️ يجب الاتصال بالإنترنت');
        let docRef = await addDoc(collection(db, "complaints"), comp);
        comp.firestoreId = docRef.id;
        complaintsList.push(comp); saveLocalData(); document.getElementById('complaintText').value = ''; showToast('تم إرسال طلبك للإدارة بنجاح!');
    } catch (e) { showToast('❌ خطأ في الإرسال'); }
}

function renderAdminComplaints() {
    const container = document.getElementById('complaintsListContainer'); if(!container) return; container.innerHTML = '';
    if(complaintsList.length === 0) return container.innerHTML = '<p class="text-success">لا توجد شكايات أو طلبات واردة حالياً.</p>';
    complaintsList.slice().reverse().forEach(c => {
        let isNew = c.status === 'جديدة'; const div = document.createElement('div'); div.className = 'list-item'; div.style.borderRightColor = isNew ? 'var(--danger-red)' : 'var(--accent-green)';
        div.innerHTML = `<div class="list-info"><strong>من: ${c.name} (عداد: ${c.counter}) - <span style="font-size:0.8rem; color:#666;">${c.date}</span></strong><div style="font-size: 1rem; color: #333; margin:10px 0; padding:10px; background:#fff; border-radius:5px; border:1px solid #ddd; white-space: pre-wrap;">${c.text}</div><span style="color: ${isNew ? 'var(--danger-red)' : 'var(--accent-green)'}; font-weight:bold;">الحالة: ${c.status}</span></div><div style="display:flex; flex-direction:column; gap:5px; min-width: 120px;">${isNew ? `<button class="pay-btn" style="margin-top:0;" onclick="markComplaintRead('${c.firestoreId}')">✔️ تمت المعالجة</button>` : ''}<button class="action-btn" onclick="deleteComplaint('${c.firestoreId}')">🗑️ حذف</button></div>`;
        container.appendChild(div);
    });
}
async function markComplaintRead(id) { let comp = complaintsList.find(c => c.firestoreId === id); if(comp) { comp.status = 'تمت المعالجة'; saveLocalData(); if(navigator.onLine) await updateDoc(doc(db, "complaints", id), { status: 'تمت المعالجة' }); renderAdminComplaints(); } }
async function deleteComplaint(id) { 
    if(confirm('هل تريد حذف هذه الشكاية نهائياً؟')) { 
        complaintsList = complaintsList.filter(c => c.firestoreId !== id); saveLocalData(); 
        if(navigator.onLine) { try{ await deleteDoc(doc(db, "complaints", id)); }catch(e){} }
        renderAdminComplaints(); 
    } 
}

function processAutoMonthlyCapital() {
    let currentMonth = new Date().toISOString().slice(0, 7); let allPastMonths = new Set();
    transactionsList.forEach(t => { if(t.month && t.month < currentMonth) allPastMonths.add(t.month); });
    donationsList.forEach(d => { if(d.month && d.month < currentMonth) allPastMonths.add(d.month); });
    allPastMonths.forEach(async (monthStr) => {
        let alreadyClosed = capitalLedger.some(c => c.type === 'auto_month' && c.targetMonth === monthStr);
        if(!alreadyClosed) {
            let mIncome = 0, mExpense = 0, mDonations = 0;
            transactionsList.filter(t => t.month === monthStr).forEach(t => { if(t.type === 'income') mIncome += Number(t.amount); else mExpense += Number(t.amount); });
            donationsList.filter(d => d.month === monthStr).forEach(d => { mDonations += Number(d.amount); });
            let netAmount = (mIncome + mDonations) - mExpense;
            if (netAmount > 0) {
                let ledgerEntry = { date: new Date().toLocaleDateString('ar-MA'), targetMonth: monthStr, type: 'auto_month', amount: netAmount, desc: `الرصيد الصافي المحصل لشهر ${monthStr}`, timestamp: new Date().toISOString() };
                try {
                    if(navigator.onLine) {
                        let docRef = await addDoc(collection(db, "capital_ledger"), ledgerEntry);
                        ledgerEntry.firestoreId = docRef.id;
                        capitalLedger.push(ledgerEntry); saveLocalData();
                    }
                } catch(e) {}
            }
        }
    });
}

async function addManualCapital() {
    let amtStr = prompt("أدخل المبلغ المراد إضافته للصندوق (بالدرهم):"); if(!amtStr) return;
    let amount = parseFloat(amtStr); if(isNaN(amount) || amount <= 0) return showToast("مبلغ غير صحيح");
    let desc = prompt("أدخل سبب أو مصدر هذا المبلغ:", "إضافة يدوية للرصيد"); if(!desc) desc = "إضافة يدوية للرصيد";
    
    let ledgerEntry = { date: new Date().toLocaleDateString('ar-MA'), targetMonth: new Date().toISOString().slice(0, 7), type: 'manual', amount: amount, desc: desc, timestamp: new Date().toISOString() };
    
    try {
        if(!navigator.onLine) return showToast('⚠️ يجب الاتصال بالإنترنت');
        let docRef = await addDoc(collection(db, "capital_ledger"), ledgerEntry);
        ledgerEntry.firestoreId = docRef.id;
        capitalLedger.push(ledgerEntry); saveLocalData(); renderCapital(); showToast("تم إضافة المبلغ للصندوق بنجاح");
    } catch(e) { showToast("❌ حدث خطأ في الحفظ"); }
}

function renderCapital() {
    const container = document.getElementById('capitalLedgerContainer'); if(!container) return;
    let totalCap = 0; container.innerHTML = '';
    capitalLedger.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(item => {
        let amt = Number(item.amount); totalCap += amt; let color = item.type === 'auto_month' ? 'var(--accent-green)' : 'var(--primary-blue)';
        container.innerHTML += `<div class="list-item" style="border-right-color: ${color}; display:flex; justify-content:space-between; align-items:center;"><div class="list-info"><strong style="color: ${color}; direction: ltr; display: inline-block;">${amt} درهم</strong><span>${item.desc} | التاريخ: ${item.date}</span></div><div><button class="action-btn" onclick="deleteCapitalEntry('${item.firestoreId}')">🗑️ حذف</button></div></div>`;
    });
    if(capitalLedger.length === 0) container.innerHTML = '<p>لا توجد مبالغ في الصندوق.</p>';
    if(document.getElementById('mainCapitalAmount')) document.getElementById('mainCapitalAmount').textContent = totalCap + " درهم";
}
async function deleteCapitalEntry(id) { 
    if(confirm('هل تريد حذف هذه العملية من الصندوق نهائياً؟')) { 
        capitalLedger = capitalLedger.filter(c => c.firestoreId !== id); saveLocalData(); 
        if(navigator.onLine) { try{ await deleteDoc(doc(db, "capital_ledger", id)); }catch(e){} }
        renderCapital(); showToast('تم الحذف بنجاح!'); 
    } 
}

// ================== سجل التبرعات ==================
async function saveDonation() { 
    const month = document.getElementById('donationMonth').value; 
    const name = document.getElementById('donationName').value.trim(); 
    const amount = parseFloat(document.getElementById('donationAmount').value) || 0; 
    if (amount <= 0 || !month || !name) return showToast('أدخل البيانات كاملة'); 
    if (!navigator.onLine) return showToast('⚠️ يلزم الاتصال بالإنترنت لحفظ التبرع');
    
    let donObj = { month, name, amount, timestamp: new Date().toISOString() }; 
    
    try {
        let docRef = await addDoc(collection(db, "donations"), donObj);
        donObj.firestoreId = docRef.id; 
        
        donationsList.push(donObj); 
        recalculateFinancials(); saveLocalData(); 
        
        document.getElementById('donationName').value = ''; document.getElementById('donationAmount').value = ''; 
        showToast('تم تسجيل التبرع بنجاح'); renderDonations(); updateFinancialDashboard(); 
    } catch (e) { showToast('❌ حدث خطأ في الحفظ السحابي'); }
}

function renderDonations() { 
    const container = document.getElementById('donationsListContainer'); if(!container) return; container.innerHTML = ''; 
    if(donationsList.length === 0) return container.innerHTML = '<div style="text-align:center; padding:40px 20px; background:#f9f9f9; border-radius:12px; border:1px dashed #ccc;"><div style="font-size:3rem; margin-bottom:10px;">💖</div><p style="color:#666; font-size:1.1rem; margin:0;">لا توجد تبرعات مسجلة حتى الآن.</p></div>'; 
    let totalDonations = 0; donationsList.forEach(d => totalDonations += Number(d.amount));
    let html = `<div style="background: linear-gradient(135deg, #d81b60, #ff4081); color: white; padding: 20px; border-radius: 12px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(216, 27, 96, 0.3);"><div><h4 style="margin: 0; font-size: 1.2rem; font-weight:bold;">إجمالي التبرعات</h4><p style="margin: 5px 0 0 0; font-size: 0.95rem; opacity: 0.9;">مجموع مساهمات المحسنين</p></div><div style="font-size: 1.5rem; font-weight: bold; background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.3);">${totalDonations} درهم</div></div><div style="overflow-x: auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #f0f0f0;"><table style="width: 100%; border-collapse: collapse; min-width: 600px; text-align: right;"><thead><tr style="background-color: #f8f9fa; border-bottom: 2px solid #eaeaea;"><th style="padding: 15px; color: #444; font-weight: 600; font-size: 0.95rem;">📅 التاريخ</th><th style="padding: 15px; color: #444; font-weight: 600; font-size: 0.95rem;">👤 اسم المحسن(ة)</th><th style="padding: 15px; color: #444; font-weight: 600; font-size: 0.95rem;">💖 المبلغ</th><th style="padding: 15px; color: #444; font-weight: 600; font-size: 0.95rem; text-align: center;" class="no-print">⚙️ الإجراء</th></tr></thead><tbody>`; 
    donationsList.slice().reverse().forEach((d, index) => { 
        let rowBg = index % 2 === 0 ? '#ffffff' : '#fafafa';
        html += `<tr style="background-color: ${rowBg}; border-bottom: 1px solid #f0f0f0;"><td style="padding: 15px; color: #666; font-size: 0.95rem;">${d.month}</td><td style="padding: 15px; font-weight: bold; color: #2c3e50; font-size: 1.05rem;">السيد(ة) ${d.name}</td><td style="padding: 15px;"><span style="background: #e8f5e9; color: #2e7d32; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 0.9rem; display: inline-block; border: 1px solid #c8e6c9;">+ ${d.amount} درهم</span></td><td style="padding: 15px; text-align: center;" class="no-print"><button style="background: #fff; color: #e74c3c; border: 1px solid #fadbd8; padding: 6px 15px; border-radius: 6px; font-size: 0.85rem; font-weight:bold; cursor: pointer; transition: 0.2s;" onclick="deleteDonation('${d.firestoreId}')" onmouseover="this.style.background='#e74c3c'; this.style.color='#fff';" onmouseout="this.style.background='#fff'; this.style.color='#e74c3c';">🗑️ حذف التبرع</button></td></tr>`; 
    }); 
    html += `</tbody></table></div>`; container.innerHTML = html; 
}

async function deleteDonation(id) { 
    if(!id || id.startsWith('local_')) { 
        showToast('⚠️ لا يمكن حذف عنصر غير متزامن'); 
        return; 
    }
    if(confirm('هل تريد حذف هذا التبرع نهائياً؟')) { 
        try { 
            await deleteDoc(doc(db, "donations", id)); 
            donationsList = donationsList.filter(d => d.firestoreId !== id); 
            recalculateFinancials(); saveLocalData(); 
            renderDonations(); updateFinancialDashboard();
            showToast('تم الحذف بنجاح');
        } catch(e) { showToast('❌ فشل الحذف من السحابة'); }
    } 
}

function updateFinancialDashboard() { const normalIncome = totalIncome - totalDonationsIncome; if(document.getElementById('normalIncomeReport')) document.getElementById('normalIncomeReport').textContent = normalIncome + ' درهم'; if(document.getElementById('donationsIncomeReport')) document.getElementById('donationsIncomeReport').textContent = totalDonationsIncome + ' درهم'; if(document.getElementById('totalIncomeReport')) document.getElementById('totalIncomeReport').textContent = totalIncome + ' درهم'; if(document.getElementById('totalExpenseReport')) document.getElementById('totalExpenseReport').textContent = totalExpense + ' درهم'; }

// ================== المعاملات المالية والسكانر ==================
async function scanToPDFAndUpload(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = function(e) {
            let img = new Image(); img.onload = async function() {
                let canvas = document.createElement('canvas'); let ctx = canvas.getContext('2d');
                let maxWidth = 800; let scale = maxWidth / img.width; canvas.width = maxWidth; canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); let data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                    let avg = (data[i] + data[i+1] + data[i+2]) / 3; let contrast = 2.0; avg = (avg - 128) * contrast + 128;
                    if(avg > 200) avg = 255; if(avg < 70) avg = 0; avg = Math.min(Math.max(avg, 0), 255);
                    data[i] = avg; data[i+1] = avg; data[i+2] = avg;
                }
                ctx.putImageData(imgData, 0, 0);
                const { jsPDF } = window.jspdf;
                let pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "l" : "p", unit: "px", format: [canvas.width, canvas.height] });
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, canvas.width, canvas.height);
                let pdfBase64 = pdf.output('datauristring');
                try {
                    const fileName = 'receipts/scan_' + Date.now() + '.pdf'; const storageRef = ref(storage, fileName);
                    await uploadBytes(storageRef, await (await fetch(pdfBase64)).blob());
                    let downloadUrl = await getDownloadURL(storageRef); resolve(downloadUrl);
                } catch(err) { reject(err); }
            }; img.src = e.target.result;
        }; reader.readAsDataURL(file);
    });
}

async function saveTransaction() { 
    const month = document.getElementById('transMonth').value; const type = document.getElementById('transType').value; 
    const amount = parseFloat(document.getElementById('transAmount').value) || 0; const desc = document.getElementById('transDesc').value.trim(); 
    const fileInput = document.getElementById('transFile'); 
    if (amount <= 0 || !month) return showToast('أدخل البيانات كاملة'); 
    if (!navigator.onLine) return showToast('⚠️ يلزم الاتصال بالإنترنت لحفظ المعاملة المالية');
    
    let receiptUrl = '';
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        showToast('⏳ جاري المسح الضوئي وتحويل الوثيقة لـ PDF...');
        try { await loadJsPDF(); receiptUrl = await scanToPDFAndUpload(fileInput.files[0]); } catch (e) { return showToast('❌ فشل تحويل أو رفع الوثيقة.'); }
    }
    
    let transactionObj = { month, type, amount, desc, fileName: receiptUrl, timestamp: new Date().toISOString() }; 
    
    try {
        let docRef = await addDoc(collection(db, "transactions"), transactionObj); 
        transactionObj.firestoreId = docRef.id; 
        await addDoc(collection(db, "archive_finance"), transactionObj); 
        
        transactionsList.push(transactionObj); archiveFinance.push(transactionObj); 
        recalculateFinancials(); saveLocalData(); 
        
        document.getElementById('transAmount').value = ''; document.getElementById('transDesc').value = ''; if(fileInput) fileInput.value = '';
        showToast('تم تسجيل العملية المالية بنجاح'); renderTransactions(); updateFinancialDashboard(); 
    } catch(e) { showToast('❌ حدث خطأ في الحفظ'); }
}

function renderTransactions() { 
    const container = document.getElementById('transactionsListContainer'); if(!container) return; container.innerHTML = ''; 
    if(transactionsList.length === 0) return container.innerHTML = '<p>لا توجد عمليات مسجلة.</p>';
    transactionsList.slice().reverse().forEach((t) => { 
        const div = document.createElement('div'); div.className = 'list-item'; div.style.borderRightColor = t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)'; 
        div.innerHTML = `<div class="list-info"><strong style="color:${t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)'}">${t.type === 'income' ? 'مدخول (+)' : 'مصروف (-)'} ${t.amount} درهم</strong><span>الوصف: ${t.desc} | الشهر: ${t.month}</span></div><div style="display:flex; flex-direction:column; gap:5px;">${t.fileName ? `<a href="${t.fileName}" target="_blank" class="btn btn-blue" style="padding:4px 8px; font-size:0.8rem; margin:0; text-decoration:none; text-align:center;">📄 الوثيقة (PDF)</a>` : ''}<button class="action-btn" onclick="deleteTransaction('${t.firestoreId}', '${t.fileName}')">حذف</button></div>`; 
        container.appendChild(div); 
    }); 
}

async function deleteTransaction(firestoreId, fileUrl) { 
    if(!firestoreId || firestoreId.startsWith('local_')) { 
        showToast('⚠️ عنصر غير متزامن'); 
        return; 
    }
    if(confirm('هل تريد حذف هذه العملية المالية؟')) { 
        try {
            await deleteDoc(doc(db, "transactions", firestoreId)); 
            await deleteDoc(doc(db, "archive_finance", firestoreId)).catch(()=>{});
            if(fileUrl && fileUrl.includes('firebasestorage')) { const fileRef = ref(storage, fileUrl); await deleteObject(fileRef); }
            
            transactionsList = transactionsList.filter(t => t.firestoreId !== firestoreId); 
            archiveFinance = archiveFinance.filter(f => f.firestoreId !== firestoreId); 
            capitalLedger = capitalLedger.filter(c => c.firestoreId !== firestoreId);
            
            recalculateFinancials(); saveLocalData(); 
            renderTransactions(); updateFinancialDashboard(); renderArchive(); renderCapital(); 
            showToast('تم حذف العملية بنجاح!');
        } catch(e) { showToast('❌ فشل الحذف'); }
    } 
}

// ================== القانون الأساسي و التقارير ==================
async function saveBylaws() { 
    let text = document.getElementById('bylawInput').value; document.getElementById('bylawDisplay').textContent = text || 'لا يوجد قانون أساسي مسجل حالياً.'; 
    showToast('⏳ جاري الحفظ في السحابة...');
    if(navigator.onLine) {
        try {
            const bylawSnap = await getDocs(collection(db, "bylaws"));
            if(bylawSnap.empty) { await addDoc(collection(db, "bylaws"), { text: text }); } else { let id = bylawSnap.docs[0].id; await updateDoc(doc(db, "bylaws", id), { text: text }); }
            localStorage.setItem('tamda_bylaws', text); showToast('✅ تم حفظ القانون الأساسي بنجاح للجميع');
        } catch(e) { showToast('❌ خطأ في الحفظ السحابي'); }
    } else { localStorage.setItem('tamda_bylaws', text); showToast('⚠️ تم الحفظ محلياً في هاتفك فقط لانعدام الإنترنت'); }
}

async function uploadFinancialPDF() {
    const fileInput = document.getElementById('pdfReportFile');
    const titleInput = document.getElementById('pdfReportTitle');
    const uploadBtn = document.querySelector('button[onclick="uploadFinancialPDF()"]');

    if(!fileInput.files || fileInput.files.length === 0) return showToast('اختر ملف PDF أو صورة أولاً');
    if(!navigator.onLine) return showToast('⚠️ يجب الاتصال بالإنترنت لرفع التقارير');

    let file = fileInput.files[0];
    let title = titleInput.value.trim() || file.name;

    if(uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = '⏳ جاري الرفع للسحابة...';
    }

    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storageRef = ref(storage, 'reports/doc_' + Date.now() + '_' + safeName);
        
        await uploadBytes(storageRef, file);
        let downloadURL = await getDownloadURL(storageRef);
        
        let reportObj = { 
            title: title, 
            fileUrl: downloadURL, 
            date: new Date().toLocaleDateString('ar-MA'), 
            timestamp: new Date().toISOString() 
        };
        
        let docRef = await addDoc(collection(db, "pdf_reports"), reportObj);
        reportObj.firestoreId = docRef.id;
        
        pdfReportsList.unshift(reportObj);
        saveLocalData();
        
        fileInput.value = ''; titleInput.value = '';
        showToast('✅ تم الرفع بنجاح');
        renderPDFReportsList();
    } catch(err) {
        console.error(err);
        showToast('❌ فشل الرفع: تأكد من تفعيل Storage في Firebase');
    } finally {
        if(uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '⬆️ رفع وحفظ في سحابة الأرشيف';
        }
    }
}

function renderPDFReportsList() { 
    const container = document.getElementById('pdfReportsContainer'); if(!container) return; container.innerHTML = ''; 
    if(pdfReportsList.length === 0) return container.innerHTML = '<p style="color:#666;">لا توجد وثائق أو تقارير مرفوعة في السحابة حتى الآن.</p>'; 
    pdfReportsList.forEach((rep) => { 
        container.innerHTML += `<div class="list-item" style="display:flex; justify-content:space-between; align-items:center;"><div><strong style="color:var(--primary-blue); font-size:1.1rem;">${rep.title}</strong><br><span style="font-size:0.85rem; color:#666;">مرفوع بتاريخ: ${rep.date}</span></div><div style="display:flex; gap:8px; flex-wrap:wrap;"><a href="${rep.fileUrl}" target="_blank" class="btn btn-blue" style="padding:6px 12px; margin:0; font-size:0.85rem; text-decoration:none;">👁️ قراءة / تحميل</a><button class="action-btn" onclick="deletePDFReport('${rep.firestoreId}', '${rep.fileUrl}')">حذف</button></div></div>`; 
    }); 
}

async function deletePDFReport(id, fileUrl) { 
    if(!id || id.startsWith('local_')) { showToast('عنصر غير متزامن'); return; }
    if(confirm('هل أنت متأكد من حذف هذه الوثيقة من سحابة الأرشيف العام؟')) { 
        try {
            await deleteDoc(doc(db, "pdf_reports", id));
            const fileRef = ref(storage, fileUrl); await deleteObject(fileRef);
            pdfReportsList = pdfReportsList.filter(r => r.firestoreId !== id); saveLocalData(); renderPDFReportsList();
            showToast('تم الحذف بنجاح'); 
        } catch(e) { showToast('❌ فشل الحذف'); }
    } 
}

// ================== الفوترة والتحصيل ==================
function autoFillSubscriber() { 
    const counterInput = document.getElementById('counterNum').value.trim(); 
    const sub = subscribers.find(s => s.counter == counterInput); 
    
    if (sub) { 
        document.getElementById('subscriberName').value = sub.name; 
        if(sub.lastBilledMonth) document.getElementById('billingMonth').value = getNextMonth(sub.lastBilledMonth); 
        
        let prevInput = document.getElementById('prevReading');
        if (sub.lastReading !== null && sub.lastReading !== undefined && sub.lastReading !== '') {
            prevInput.value = sub.lastReading; 
            prevInput.setAttribute('readonly', 'true');
        } else {
            prevInput.value = '';
            prevInput.removeAttribute('readonly'); 
        }
        
        document.getElementById('currReading').value = ''; 
        document.getElementById('delayMonths').value = sub.delayMonths || 0; 
    } else { 
        document.getElementById('subscriberName').value = ''; 
        document.getElementById('prevReading').value = ''; 
        document.getElementById('prevReading').removeAttribute('readonly');
        document.getElementById('currReading').value = ''; 
        document.getElementById('delayMonths').value = 0; 
    } 
    
    window.autoAdjustTariff(); calculateBill(); 
}

function getNextMonth(monthString) { 
    if (!monthString) return ''; 
    let parts = monthString.split('-'); 
    if(parts.length < 2) return ''; 
    let d = new Date(parseInt(parts[0]), parseInt(parts[1]), 1); 
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); 
}

function calculateBill() { 
    const counterNumInput = document.getElementById('counterNum').value.trim(); 
    const subName = document.getElementById('subscriberName').value || 'غير محدد'; 
    const billingMonth = document.getElementById('billingMonth').value || 'غير محدد'; 
    const prev = parseFloat(document.getElementById('prevReading').value) || 0; 
    const curr = parseFloat(document.getElementById('currReading').value) || 0; 
    const delayMonths = parseInt(document.getElementById('delayMonths').value) || 0; 
    const tariffSystem = document.getElementById('tariffSystem').value; 
    const isExempt = document.getElementById('exemptionCheck').checked; 
    const alertBox = document.getElementById('smartAlertBox'); 
    
    if (!counterNumInput) return; 
    if (curr < prev) return showToast('القراءة الحالية أقل من السابقة!'); 
    
    const consumption = curr - prev; 
    currentConsumptionData = consumption; 
    let alertMessages = []; 
    let currentCounterNum = parseInt(counterNumInput); 
    
    let sub = subscribers.find(s => s.counter == counterNumInput); 
    
    if (sub && sub.lastBilledMonth && sub.lastBilledMonth !== '') {
        let prevCounterExists = subscribers.some(s => Number(s.counter) === currentCounterNum - 1 && (!s.lastBilledMonth || s.lastBilledMonth !== billingMonth) && s.lastBilledMonth !== ''); 
        let nextCounterExists = subscribers.some(s => Number(s.counter) === currentCounterNum + 1 && (!s.lastBilledMonth || s.lastBilledMonth !== billingMonth) && s.lastBilledMonth !== ''); 
        if (prevCounterExists || nextCounterExists) alertMessages.push('⚠️ تنبيه: يبدو أنك نسيت قراءة عداد مجاور.'); 
        
        let historicAvg = sub.avgConsumption || 25; 
        if (historicAvg > 20 && consumption <= 3) alertMessages.push(`⚠️ تنبيه: هذا المنخرط يستهلك عادة معدل ${historicAvg}، وسجلت ${consumption} فقط! تأكد من الرقم.`); 
    }
    
    if (alertMessages.length > 0) { 
        alertBox.style.display = 'block'; alertBox.innerHTML = alertMessages.join('<br>'); 
    } else { 
        alertBox.style.display = 'none'; alertBox.innerHTML = ''; 
    } 
    
    currentT1 = 0; currentT2 = 0; currentT3 = 0; 
    let t1_cost = 0, t2_cost = 0, t3_cost = 0, maintenance = 0; 
    
    if (tariffSystem === 'old') { 
        maintenance = appSettings.maintenance; 
        if (consumption <= 15) { currentT1 = consumption; } 
        else if (consumption <= 20) { currentT1 = 15; currentT2 = consumption - 15; } 
        else { currentT1 = 15; currentT2 = 5; currentT3 = consumption - 20; } 
        t1_cost = currentT1 * appSettings.tier1; t2_cost = currentT2 * appSettings.tier2; t3_cost = currentT3 * appSettings.tier3; 
    } else { 
        maintenance = 15; 
        if (consumption <= 20) { currentT1 = consumption; } 
        else if (consumption <= 30) { currentT1 = 20; currentT2 = consumption - 20; } 
        else { currentT1 = 20; currentT2 = 10; currentT3 = consumption - 30; } 
        t1_cost = currentT1 * 3; t2_cost = currentT2 * 5; t3_cost = currentT3 * 7; 
    } 
    
    const consumptionCost = t1_cost + t2_cost + t3_cost; 
    document.getElementById('row-t1').style.display = currentT1 > 0 ? 'flex' : 'none'; document.getElementById('t1-val').textContent = `${currentT1} m³ = ${t1_cost} درهم`; 
    document.getElementById('row-t2').style.display = currentT2 > 0 ? 'flex' : 'none'; document.getElementById('t2-val').textContent = `${currentT2} m³ = ${t2_cost} درهم`; 
    document.getElementById('row-t3').style.display = currentT3 > 0 ? 'flex' : 'none'; document.getElementById('t3-val').textContent = `${currentT3} m³ = ${t3_cost} درهم`; 
    
    let penaltyCost = (delayMonths >= 2) ? appSettings.penalty : 0; 
    if (penaltyCost > 0) { document.getElementById('penaltyRow').style.display = 'flex'; document.getElementById('printPenalty').textContent = penaltyCost + ' درهم'; } 
    else { document.getElementById('penaltyRow').style.display = 'none'; } 
    
    currentBillTotal = isExempt ? 0 : (consumptionCost + maintenance + penaltyCost); 
    if(isExempt) document.getElementById('exemptionNotice').style.display = 'flex'; else document.getElementById('exemptionNotice').style.display = 'none'; 
    document.getElementById('printMonth').textContent = billingMonth; document.getElementById('printName').textContent = subName; document.getElementById('printCounter').textContent = counterNumInput; document.getElementById('printPrev').textContent = prev; document.getElementById('printCurr').textContent = curr; document.getElementById('printMaintenance').textContent = maintenance + ' درهم'; document.getElementById('consumptionResult').textContent = consumption + ' m³'; document.getElementById('consumptionPriceResult').textContent = consumptionCost + ' درهم'; document.getElementById('totalPriceResult').textContent = currentBillTotal + ' درهم'; document.getElementById('billResult').style.display = 'block'; 
}

async function saveBill(isPaid) { 
    if(currentBillTotal >= 0) { 
        if(!navigator.onLine) return showToast('⚠️ يلزم الاتصال بالإنترنت لحفظ الفاتورة');
        const counterInput = document.getElementById('counterNum').value.trim(); 
        const subNameStr = document.getElementById('subscriberName').value || 'غير محدد'; 
        const curr = parseFloat(document.getElementById('currReading').value) || 0; 
        const currentMonth = document.getElementById('billingMonth').value; 
        const isExempt = document.getElementById('exemptionCheck').checked; 
        const sub = subscribers.find(s => s.counter == counterInput); 
        
        let billArchiveObj = { month: currentMonth, counter: counterInput, name: subNameStr, consumption: currentConsumptionData, t1: currentT1, t2: currentT2, t3: currentT3, total: currentBillTotal, status: isPaid ? 'خالصة' : 'دين', isExempt: isExempt, timestamp: new Date().toISOString() }; 
        
        try { 
            let billRef = await addDoc(collection(db, "archive_bills"), billArchiveObj);
            billArchiveObj.firestoreId = billRef.id;
            archiveBills.push(billArchiveObj);

            if (sub) { 
                let newDelay = isPaid ? 0 : ((sub.delayMonths || 0) + 1); 
                let newDebt = isPaid ? 0 : ((sub.debtAmount || 0) + currentBillTotal); 
                sub.lastReading = curr; sub.lastBilledMonth = currentMonth; sub.delayMonths = newDelay; sub.debtAmount = newDebt; sub.avgConsumption = Math.round((sub.avgConsumption ? (sub.avgConsumption + currentConsumptionData) / 2 : currentConsumptionData)); 
                await updateDoc(doc(db, "subscribers", sub.firestoreId), { lastReading: curr, lastBilledMonth: currentMonth, delayMonths: newDelay, debtAmount: newDebt, avgConsumption: sub.avgConsumption }); 
            } 
            
            if (isPaid && currentBillTotal > 0) { 
                let transObj = { month: currentMonth, type: 'income', amount: currentBillTotal, desc: `استخلاص فاتورة ماء - عداد: ${counterInput}`, fileName: '', timestamp: new Date().toISOString() }; 
                let transRef = await addDoc(collection(db, "transactions"), transObj);
                transObj.firestoreId = transRef.id;
                transactionsList.push(transObj); archiveFinance.push(transObj); 
                recalculateFinancials(); 
            } 
            
            saveLocalData(); 
            showToast('تم حفظ الفاتورة بنجاح'); currentBillTotal = 0; document.getElementById('billResult').style.display = 'none'; document.getElementById('currReading').value = ''; document.getElementById('exemptionCheck').checked = false; document.getElementById('smartAlertBox').style.display = 'none'; let nextCounter = parseInt(counterInput); if (!isNaN(nextCounter)) document.getElementById('counterNum').value = nextCounter + 1; autoFillSubscriber(); 
        } catch (e) { showToast('❌ فشل الحفظ'); } 
    } else { showToast('يرجى حساب الفاتورة أولاً'); } 
}

function sendWhatsAppNotification() { const counterInput = document.getElementById('counterNum').value.trim(); const currentMonth = document.getElementById('billingMonth').value || 'الحالي'; const sub = subscribers.find(s => s.counter == counterInput); if (!sub || !sub.phone) return showToast('رقم هاتف المشترك غير مسجل!'); let message = `مرحباً السيد(ة) ${sub.name}،\nفاتورة استهلاك ماء الشرب لشهر ${currentMonth} هي: ${currentBillTotal} درهم.\nالمرجو المبادرة بالأداء وشكراً.`; window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(message)}`, '_blank'); }
function enableEdit(elementId) { document.getElementById(elementId).removeAttribute('readonly'); document.getElementById(elementId).focus(); showToast('تم فتح الحقل للتعديل'); }

function renderDebts() { const container = document.getElementById('debtsListContainer'); if(!container) return; container.innerHTML = ''; const debtors = subscribers.filter(s => Number(s.debtAmount) > 0); debtors.sort((a, b) => Number(a.counter) - Number(b.counter)); if(debtors.length === 0) return container.innerHTML = '<p class="text-success" style="font-weight:bold;">لا توجد ديون مسجلة حالياً.</p>'; debtors.forEach((sub) => { const div = document.createElement('div'); div.className = 'list-item'; div.style.borderRightColor = 'var(--danger-red)'; div.innerHTML = `<div class="list-info"><strong style="color:var(--danger-red);">عداد (${sub.counter}): ${sub.name}</strong><span>المبلغ المتبقي: <strong>${sub.debtAmount} درهم</strong> | تأخير: ${sub.delayMonths} أشهر</span></div><div><button class="pay-btn" onclick="collectDebt('${sub.firestoreId}', ${sub.debtAmount}, '${sub.counter}', '${sub.name}')">💵 استخلاص</button></div>`; container.appendChild(div); }); }

async function collectDebt(firestoreId, amount, counter, name) { 
    if(!navigator.onLine) return showToast('⚠️ يلزم الاتصال بالإنترنت');
    if(confirm(`هل تؤكد استخلاص مبلغ الدين (${amount} درهم)؟`)) { 
        try {
            let sub = subscribers.find(s => s.firestoreId === firestoreId); if(sub) { sub.debtAmount = 0; sub.delayMonths = 0; } 
            let nowMonth = new Date().toISOString().slice(0, 7); 
            let newTrans = { month: nowMonth, type: 'income', amount: Number(amount), desc: `استخلاص دين متأخر - عداد: ${counter}`, fileName: '', timestamp: new Date().toISOString() }; 
            
            let transRef = await addDoc(collection(db, "transactions"), newTrans); 
            newTrans.firestoreId = transRef.id;
            await updateDoc(doc(db, "subscribers", firestoreId), { debtAmount: 0, delayMonths: 0 }); 
            
            transactionsList.push(newTrans); 
            recalculateFinancials(); saveLocalData(); 
            showToast('تم الاستخلاص بنجاح!'); renderDebts(); updateFinancialDashboard(); 
        } catch(e) { showToast('❌ فشل الاستخلاص'); }
    } 
}

function renderArchive() { 
    const container = document.getElementById('archiveContainer'); if(!container) return; container.innerHTML = ''; 
    let allMonths = new Set(); archiveBills.forEach(b => allMonths.add(b.month)); archiveFinance.forEach(f => allMonths.add(f.month)); 
    let sortedMonths = Array.from(allMonths).sort().reverse(); 
    if(sortedMonths.length === 0) return container.innerHTML = '<p>لا توجد بيانات مسجلة.</p>';
    sortedMonths.forEach(month => { 
        let monthBills = archiveBills.filter(b => b.month === month); let monthFinance = archiveFinance.filter(f => f.month === month); 
        monthBills.sort((a, b) => Number(a.counter) - Number(b.counter)); 
        let monthTotalWater = 0, monthTotalAmount = 0; 
        monthBills.forEach(b => { monthTotalWater += Number(b.consumption || 0); monthTotalAmount += Number(b.total || 0); }); 
        const box = document.createElement('div'); box.className = 'archive-month-box'; 
        let html = `<div class="printable-archive"><h4 style="margin-top:0; color:var(--primary-blue); border-bottom:2px solid var(--secondary-cyan); padding-bottom:8px;"><span>📅 الأرشيف الشامل - شهر: ${month}</span></h4><div style="display:flex; gap:20px; margin-bottom:10px; font-size:0.95rem; background:var(--bg-light); padding:8px; border-radius:6px;"><span>الاستهلاك: <strong>${monthTotalWater} m³</strong></span><span>المبالغ المحصلة: <strong class="text-success">${monthTotalAmount} درهم</strong></span></div>`; 
        if(monthBills.length > 0) { html += `<table class="archive-table"><thead><tr><th>رقم العداد</th><th>الاستهلاك (m³)</th><th>الثمن (درهم)</th><th>الوضع</th><th class="no-print">إجراءات</th></tr></thead><tbody>`; monthBills.forEach(b => { html += `<tr><td>${b.counter}</td><td>${b.consumption}</td><td>${b.total}</td><td>${b.status} ${b.isExempt ? '(إعفاء)' : ''}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveBill('${b.firestoreId}')">حذف</button></td></tr>`; }); html += `</tbody></table>`; } 
        html += `<h5 style="margin: 15px 0 5px 0; color:var(--text-dark);">💰 العمليات المالية (مع الوثائق):</h5>`; 
        if(monthFinance.length > 0) { html += `<table class="archive-table"><thead><tr><th>النوع</th><th>المبلغ (درهم)</th><th>الوصف</th><th class="no-print">الوثيقة</th><th class="no-print">إجراءات</th></tr></thead><tbody>`; monthFinance.forEach(f => { html += `<tr><td class="${f.type === 'income' ? 'text-success' : 'text-danger'}">${f.type === 'income' ? 'مدخول' : 'مصروف'}</td><td>${f.amount}</td><td>${f.desc}</td><td class="no-print">${f.fileName ? `<a href="${f.fileName}" target="_blank" style="color:var(--primary-blue); font-weight:bold; text-decoration:underline;">📄 عرض (PDF)</a>` : '-'}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveFinance('${f.firestoreId}', '${f.fileName}')">حذف</button></td></tr>`; }); html += `</tbody></table>`; } 
        html += `</div>`; box.innerHTML = html; container.appendChild(box); 
    }); 
}
async function deleteArchiveBill(id) { 
    if(!id || id.startsWith('local_')) { showToast('عنصر غير متزامن'); return; }
    if(confirm('متأكد من الحذف؟')) { 
        archiveBills = archiveBills.filter(b => b.firestoreId !== id); saveLocalData(); 
        if(navigator.onLine) { try{ await deleteDoc(doc(db, "archive_bills", id)); }catch(e){} }
        renderArchive(); 
    } 
}
async function deleteArchiveFinance(id, fileUrl) { 
    if(!id || id.startsWith('local_')) { showToast('عنصر غير متزامن'); return; }
    if(confirm('متأكد من الحذف؟')) { 
        archiveFinance = archiveFinance.filter(f => f.firestoreId !== id); transactionsList = transactionsList.filter(t => t.firestoreId !== id); saveLocalData(); 
        if(navigator.onLine) { 
            try{
                await deleteDoc(doc(db, "archive_finance", id)); await deleteDoc(doc(db, "transactions", id)).catch(()=>{}); 
                if(fileUrl && fileUrl.includes('firebasestorage')) { const fileRef = ref(storage, fileUrl); await deleteObject(fileRef); } 
            } catch(e){}
        } 
        renderArchive(); 
    } 
}

function toggleStatInputs() { const type = document.getElementById('statTypeSelect').value; document.getElementById('monthInputGroup').style.display = (type === 'monthly') ? 'block' : 'none'; document.getElementById('yearInputGroup').style.display = (type === 'yearly') ? 'block' : 'none'; renderAdvancedStats(); }
function renderAdvancedStats() { const container = document.getElementById('statsContainer'); if(!container) return; const type = document.getElementById('statTypeSelect').value; let filteredBills = []; let periodTitle = ''; if (type === 'monthly') { const monthSelect = document.getElementById('statsMonthSelect'); if(!monthSelect.value) { let now = new Date(); monthSelect.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'); } filteredBills = archiveBills.filter(b => b.month === monthSelect.value); periodTitle = `شهر: ${monthSelect.value}`; } else { const yearSelect = document.getElementById('statsYearSelect'); filteredBills = archiveBills.filter(b => b.month && b.month.startsWith(yearSelect.value)); periodTitle = `سنة: ${yearSelect.value}`; } if(filteredBills.length === 0) return container.innerHTML = `<p style="margin-top:15px; color:#666;">لا توجد بيانات لـ (${periodTitle}).</p>`; let totalWater = 0, totalT1 = 0, totalT2 = 0, totalT3 = 0, maxConsumption = -1, topConsumer = '---'; filteredBills.forEach(b => { let cons = Number(b.consumption || 0); totalWater += cons; totalT1 += Number(b.t1 || 0); totalT2 += Number(b.t2 || 0); totalT3 += Number(b.t3 || 0); if(cons > maxConsumption) { maxConsumption = cons; topConsumer = `عداد (${b.counter}) ${b.name} (${cons} m³)`; } }); let p1 = totalWater > 0 ? Math.round((totalT1 / totalWater) * 100) : 0; let p2 = totalWater > 0 ? Math.round((totalT2 / totalWater) * 100) : 0; let p3 = totalWater > 0 ? Math.round((totalT3 / totalWater) * 100) : 0; container.innerHTML = `<div style="margin-top:15px; display:flex; flex-direction:column; gap:12px;"><div class="stat-row"><span>الاستهلاك (${periodTitle}):</span><strong style="color:var(--primary-blue); font-size:1.2rem;">${totalWater} m³</strong></div><div class="stat-row"><span>الأكثر استهلاكاً:</span><strong class="text-danger">${topConsumer}</strong></div><h4 style="margin:10px 0 5px 0; color:var(--primary-blue);">📈 مبيانات الأشطر:</h4><div class="chart-container"><div class="chart-bar-wrap"><div class="chart-bar-label"><span>الشطر الأول</span><span>${p1}%</span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${p1}%; background: var(--accent-green);"></div></div></div><div class="chart-bar-wrap"><div class="chart-bar-label"><span>الشطر الثاني</span><span>${p2}%</span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${p2}%; background: var(--secondary-cyan);"></div></div></div><div class="chart-bar-wrap"><div class="chart-bar-label"><span>الشطر الثالث</span><span>${p3}%</span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${p3}%; background: var(--danger-red);"></div></div></div></div></div>`; }

window.checkAuth = checkAuth; window.handleEnter = handleEnter; window.authenticate = authenticate; window.logout = logout; window.toggleSidebar = toggleSidebar; window.showToast = showToast; window.navigateTo = navigateTo; window.printDonations = printDonations; window.saveSubscriber = saveSubscriber; window.editSubscriber = editSubscriber; window.resetSubForm = resetSubForm; window.renderSubscribers = renderSubscribers; window.generateAndSendPIN = generateAndSendPIN; window.deleteSubscriber = deleteSubscriber; window.renderSubPortalBills = renderSubPortalBills; window.submitComplaint = submitComplaint; window.renderAdminComplaints = renderAdminComplaints; window.markComplaintRead = markComplaintRead; window.deleteComplaint = deleteComplaint; window.saveDonation = saveDonation; window.renderDonations = renderDonations; window.deleteDonation = deleteDonation; window.updateFinancialDashboard = updateFinancialDashboard; window.saveTransaction = saveTransaction; window.renderTransactions = renderTransactions; window.deleteTransaction = deleteTransaction; window.uploadFinancialPDF = uploadFinancialPDF; window.renderPDFReportsList = renderPDFReportsList; window.deletePDFReport = deletePDFReport; window.calculateBill = calculateBill; window.saveBill = saveBill; window.sendWhatsAppNotification = sendWhatsAppNotification; window.autoFillSubscriber = autoFillSubscriber; window.enableEdit = enableEdit; window.renderDebts = renderDebts; window.collectDebt = collectDebt; window.renderArchive = renderArchive; window.deleteArchiveBill = deleteArchiveBill; window.deleteArchiveFinance = deleteArchiveFinance; window.toggleStatInputs = toggleStatInputs; window.renderAdvancedStats = renderAdvancedStats; window.addManualCapital = addManualCapital; window.renderCapital = renderCapital; window.deleteCapitalEntry = deleteCapitalEntry; window.saveBylaws = saveBylaws; window.saveSettings = saveSettings;
