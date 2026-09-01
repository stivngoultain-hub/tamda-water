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

let totalIncome = 0; let totalExpense = 0; let totalDonationsIncome = 0;
let currentBillTotal = 0; let currentConsumptionData = 0;
let currentT1 = 0, currentT2 = 0, currentT3 = 0;

let subscribers = []; 
let complaintsList = []; 
let appSettings = { tier1: 4, tier2: 8, tier3: 15, maintenance: 15, penalty: 50 }; 
let transactionsList = []; let donationsList = []; 
let archiveBills = []; let archiveFinance = [];
let sessionStartTime = Date.now();

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

document.addEventListener('DOMContentLoaded', () => {
    loadLocalData();
    checkAuth(); 
    loadSettings();
    let savedBylaw = localStorage.getItem('tamda_bylaws') || '';
    if(document.getElementById('bylawInput')) document.getElementById('bylawInput').value = savedBylaw;
    if(document.getElementById('bylawDisplay')) document.getElementById('bylawDisplay').textContent = savedBylaw || 'لا يوجد قانون أساسي مسجل حالياً.';
    renderPDFReportsList();
    window.addEventListener('online', () => { updateOnlineStatus(true); syncOfflineQueue(); });
    window.addEventListener('offline', () => { updateOnlineStatus(false); });
    updateOnlineStatus(navigator.onLine);
    if(navigator.onLine) { loadDataFromCloud(); }
    setInterval(updateSessionTimeAndPresence, 10000);
});

function updateOnlineStatus(isOnline) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    statusEl.textContent = isOnline ? "متصل (Online)" : "غير متصل (Offline)";
    statusEl.style.background = isOnline ? "#25D366" : "#c1272d";
}

function loadLocalData() {
    subscribers = JSON.parse(localStorage.getItem('local_subs')) || [];
    transactionsList = JSON.parse(localStorage.getItem('local_trans')) || [];
    donationsList = JSON.parse(localStorage.getItem('local_donations')) || []; 
    archiveBills = JSON.parse(localStorage.getItem('local_bills')) || [];
    archiveFinance = JSON.parse(localStorage.getItem('local_fin')) || [];
    complaintsList = JSON.parse(localStorage.getItem('local_complaints')) || [];
    recalculateFinancials();
}

function saveLocalData() {
    localStorage.setItem('local_subs', JSON.stringify(subscribers));
    localStorage.setItem('local_trans', JSON.stringify(transactionsList));
    localStorage.setItem('local_donations', JSON.stringify(donationsList)); 
    localStorage.setItem('local_bills', JSON.stringify(archiveBills));
    localStorage.setItem('local_fin', JSON.stringify(archiveFinance));
    localStorage.setItem('local_complaints', JSON.stringify(complaintsList));
}

function recalculateFinancials() {
    let transIncome = 0; totalExpense = 0;
    transactionsList.forEach(t => { if(t.type === 'income') transIncome += Number(t.amount || 0); else totalExpense += Number(t.amount || 0); });
    totalDonationsIncome = 0;
    donationsList.forEach(d => { totalDonationsIncome += Number(d.amount || 0); });
    totalIncome = transIncome + totalDonationsIncome;
}

async function loadDataFromCloud() {
    try {
        const subSnapshot = await getDocs(collection(db, "subscribers"));
        subscribers = []; subSnapshot.forEach(d => { subscribers.push({ firestoreId: d.id, ...d.data() }); });
        subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));

        const compSnap = await getDocs(collection(db, "complaints"));
        complaintsList = []; compSnap.forEach(d => { complaintsList.push({ firestoreId: d.id, ...d.data() }); });

        const donSnap = await getDocs(collection(db, "donations"));
        donationsList = []; donSnap.forEach(d => { donationsList.push({ firestoreId: d.id, ...d.data() }); });

        const transSnapshot = await getDocs(collection(db, "transactions"));
        transactionsList = []; transSnapshot.forEach(d => { transactionsList.push({ firestoreId: d.id, ...d.data() }); });

        const billsSnap = await getDocs(collection(db, "archive_bills"));
        archiveBills = []; billsSnap.forEach(d => archiveBills.push({ firestoreId: d.id, ...d.data() }));

        const finSnap = await getDocs(collection(db, "archive_finance"));
        archiveFinance = []; finSnap.forEach(d => archiveFinance.push({ firestoreId: d.id, ...d.data() }));

        saveLocalData(); recalculateFinancials();
        
        if(sessionStorage.getItem('tamda_auth') === 'true') {
            if(sessionStorage.getItem('tamda_role') === 'subscriber') {
                renderSubPortalBills();
            } else {
                renderSubscribers(); updateFinancialDashboard(); renderTransactions(); renderDonations(); renderDebts(); renderAdminComplaints();
            }
        }
    } catch (e) { console.log("وضع أوفلاين نشط."); }
}

async function queueOfflineAction(actionType, data) {
    let queue = JSON.parse(localStorage.getItem('offline_queue')) || [];
    queue.push({ actionType, data, timestamp: new Date().toISOString() });
    localStorage.setItem('offline_queue', JSON.stringify(queue));
}

async function syncOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem('offline_queue')) || [];
    if (queue.length === 0) return;
    try {
        for (let item of queue) {
            if (item.actionType === 'add_subscriber') await addDoc(collection(db, "subscribers"), item.data);
            else if (item.actionType === 'add_transaction') await addDoc(collection(db, "transactions"), item.data);
            else if (item.actionType === 'add_donation') await addDoc(collection(db, "donations"), item.data);
            else if (item.actionType === 'add_bill') await addDoc(collection(db, "archive_bills"), item.data);
            else if (item.actionType === 'add_complaint') await addDoc(collection(db, "complaints"), item.data);
        }
        localStorage.removeItem('offline_queue');
        showToast('تمت مزامنة البيانات المعلقة بنجاح!');
        loadDataFromCloud();
    } catch (e) { console.error(e); }
}

window.checkAuth = function() {
    if(sessionStorage.getItem('tamda_auth') === 'true') {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        
        let role = sessionStorage.getItem('tamda_role');
        if (role === 'subscriber') {
            document.getElementById('adminLinks').style.display = 'none';
            document.getElementById('subscriberLinks').style.display = 'block';
            document.getElementById('activeUserLabel').textContent = "بوابة المشتركين (عداد: " + sessionStorage.getItem('tamda_counter') + ")";
            navigateTo('👤 فواتيري وطلباتي');
        } else {
            document.getElementById('adminLinks').style.display = 'block';
            document.getElementById('subscriberLinks').style.display = 'none';
            document.getElementById('activeUserLabel').textContent = "مرحباً: " + roleNames[role];
            navigateTo('🏠 لوحة القيادة');
        }
    }
}

window.handleEnter = function(e) { if (e.key === 'Enter') authenticate(); }

window.authenticate = function() {
    const role = document.getElementById('userRole').value;
    const code = document.getElementById('loginCode').value.trim();
    const err = document.getElementById('loginError');
    
    if (role === 'subscriber') {
        const counter = document.getElementById('loginCounter').value.trim();
        let sub = subscribers.find(s => String(s.counter).trim() === counter && s.pin && s.pin === code);
        
        if(sub) {
            sessionStorage.setItem('tamda_auth', 'true'); 
            sessionStorage.setItem('tamda_role', 'subscriber');
            sessionStorage.setItem('tamda_counter', counter);
            sessionStorage.setItem('tamda_subname', sub.name);
            err.style.display = 'none';
            checkAuth();
            showToast('مرحباً بك في بوابتك الخاصة');
        } else { 
            err.style.display = 'block'; 
            err.textContent = 'رقم العداد أو الرمز السري غير صحيح (أو لم يتم تفعيله بعد)!'; 
        }
    } else {
        if(secureCodes[role] === code) {
            sessionStorage.setItem('tamda_auth', 'true'); 
            sessionStorage.setItem('tamda_role', role);
            sessionStartTime = Date.now();
            recordLoginStats(role);
            err.style.display = 'none';
            checkAuth();
            showToast('تم تسجيل الدخول بنجاح');
        } else { 
            err.style.display = 'block'; 
            err.textContent = 'الرمز السري للإدارة غير صحيح!'; 
        }
    }
}

function recordLoginStats(role) {
    if(role === 'subscriber') return;
    let currentMonth = new Date().toISOString().slice(0, 7);
    let allActivity = JSON.parse(localStorage.getItem('tamda_member_activity')) || {};
    if(!allActivity[currentMonth]) allActivity[currentMonth] = {};
    if(!allActivity[currentMonth][role]) allActivity[currentMonth][role] = { logins: 0, minutes: 0 };
    allActivity[currentMonth][role].logins += 1;
    localStorage.setItem('tamda_member_activity', JSON.stringify(allActivity));
}

function updateSessionTimeAndPresence() {
    if(sessionStorage.getItem('tamda_auth') !== 'true' || sessionStorage.getItem('tamda_role') === 'subscriber') return;
    let role = sessionStorage.getItem('tamda_role');
    let currentMonth = new Date().toISOString().slice(0, 7);
    
    let elapsedMinutes = Math.floor((Date.now() - sessionStartTime) / 60000);
    if(elapsedMinutes > 0) {
        let allActivity = JSON.parse(localStorage.getItem('tamda_member_activity')) || {};
        if(allActivity[currentMonth] && allActivity[currentMonth][role]) {
            sessionStartTime = Date.now();
            allActivity[currentMonth][role].minutes += elapsedMinutes;
            localStorage.setItem('tamda_member_activity', JSON.stringify(allActivity));
        }
    }

    let now = Date.now();
    let presences = JSON.parse(localStorage.getItem('tamda_presences')) || {};
    presences[role] = now;
    localStorage.setItem('tamda_presences', JSON.stringify(presences));

    let activePeers = [];
    for(let r in presences) {
        if(now - presences[r] < 15000 && r !== role) {
            activePeers.push(roleNames[r]);
        }
    }

    const badge = document.getElementById('activePeerBadge');
    if(badge) {
        if(activePeers.length > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = `⚡ متواجد معك: ${activePeers.join(', ')}`;
        } else {
            badge.style.display = 'none';
        }
    }
}

window.logout = function() { sessionStorage.clear(); location.reload(); }

window.updatePassword = function() {
    const role = document.getElementById('targetRole').value;
    const newCode = document.getElementById('newSecretCode').value.trim();
    if (!newCode || newCode.length < 4) { showToast('أدخل رمزاً صحيحاً (4 أرقام على الأقل)'); return; }
    secureCodes[role] = newCode;
    localStorage.setItem('tamda_codes', JSON.stringify(secureCodes));
    document.getElementById('newSecretCode').value = '';
    showToast(`تم تحديث الرمز السري لـ (${roleNames[role]}) بنجاح!`);
};

window.renderMemberActivityStats = function() {
    const container = document.getElementById('standaloneMemberActivity');
    if(!container) return;
    let currentMonth = new Date().toISOString().slice(0, 7);
    let allActivity = JSON.parse(localStorage.getItem('tamda_member_activity')) || {};
    let monthData = allActivity[currentMonth] || {};

    let html = `<p>إحصائيات شهر: <strong>${currentMonth}</strong></p><div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">`;
    for(let r in roleNames) {
        if(r === 'subscriber') continue;
        let stats = monthData[r] || { logins: 0, minutes: 0 };
        let hours = (stats.minutes / 60).toFixed(1);
        html += `<div class="list-item">
            <div class="list-info">
                <strong>${roleNames[r]}</strong>
                <span>عدد تسجيلات الدخول: <strong>${stats.logins}</strong> مرة | مجموع ساعات العمل: <strong class="text-success">${hours} ساعة</strong></span>
            </div>
        </div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
};

window.toggleSidebar = function() { 
    if (sidebar) sidebar.classList.toggle('active'); 
    if (overlay) overlay.classList.toggle('active'); 
}
window.showToast = function(message) {
    if(!toast) return; toast.textContent = message; toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 2500);
}
window.navigateTo = function(pageName) {
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
        if(pageName === '📊 التقارير المالية') updateFinancialDashboard();
        if(pageName === '📜 القانون والتقارير') renderPDFReportsList();
        if(pageName === '📥 الشكايات والطلبات') renderAdminComplaints();
        if(pageName === '👤 فواتيري وطلباتي') renderSubPortalBills();
        showToast('تم الانتقال إلى: ' + pageName);
    }
}
window.printDonations = function() {
    document.body.classList.add('print-mode-donations');
    window.print();
    setTimeout(() => { document.body.classList.remove('print-mode-donations'); }, 500);
}

// ==========================================
// إدارة المنخرطين ونظام الرمز السري
// ==========================================
window.saveSubscriber = async function() {
    const editingId = document.getElementById('editingSubId').value;
    const counter = document.getElementById('newSubCounter').value.trim();
    const name = document.getElementById('newSubName').value.trim();
    const phone = document.getElementById('newSubPhone').value.trim();
    const loc = document.getElementById('newSubLocation').value.trim();
    if (!counter || !name) { showToast('المرجو إدخال رقم العداد والاسم'); return; }
    
    try {
        if (editingId) {
            let sub = subscribers.find(s => s.firestoreId === editingId);
            if(sub) { sub.counter = counter; sub.name = name; sub.phone = phone; sub.location = loc; }
            await updateDoc(doc(db, "subscribers", editingId), { counter, name, phone, location: loc }).catch(() => {});
            showToast('تم تعديل بيانات المشترك بنجاح!');
            resetSubForm();
        } else {
            if (subscribers.find(s => s.counter == counter)) { showToast('العداد مسجل مسبقاً!'); return; }
            let newSub = {
                firestoreId: 'local_' + Date.now(), counter: counter, name: name, phone: phone, location: loc,
                lastReading: null, delayMonths: 0, debtAmount: 0, lastBilledMonth: '', avgConsumption: 15, pin: ''
            };
            subscribers.push(newSub); subscribers.sort((a, b) => Number(a.counter) - Number(b.counter));
            if (navigator.onLine) await addDoc(collection(db, "subscribers"), newSub); else queueOfflineAction('add_subscriber', newSub);
            document.getElementById('newSubCounter').value = ''; document.getElementById('newSubName').value = '';
            document.getElementById('newSubPhone').value = ''; document.getElementById('newSubLocation').value = '';
            showToast('تم حفظ المشترك بنجاح');
        }
        saveLocalData(); renderSubscribers();
    } catch (e) { showToast('تم الحفظ محلياً'); }
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
    document.getElementById('editingSubId').value = ''; document.getElementById('newSubCounter').value = '';
    document.getElementById('newSubName').value = ''; document.getElementById('newSubPhone').value = '';
    document.getElementById('newSubLocation').value = ''; document.getElementById('subFormTitle').textContent = '➕ إضافة مشترك جديد';
    document.getElementById('subSaveBtn').textContent = '💾 حفظ المشترك'; document.getElementById('subCancelBtn').style.display = 'none';
};

window.renderSubscribers = function() {
    const container = document.getElementById('subscribersListContainer');
    if(!container) return;
    const searchTerm = document.getElementById('searchSub').value.toLowerCase();
    container.innerHTML = '';
    
    let filtered = subscribers.filter(s => s.name.toLowerCase().includes(searchTerm) || s.counter.toString().includes(searchTerm));
    document.getElementById('subListCount').textContent = filtered.length;
    document.getElementById('dashSubCount').textContent = subscribers.length;
    let totalDebts = 0; subscribers.forEach(s => totalDebts += Number(s.debtAmount || 0));
    document.getElementById('dashDebts').textContent = totalDebts + ' درهم';

    filtered.forEach((sub) => {
        const div = document.createElement('div'); div.className = 'list-item';
        let pinBtnText = sub.pin ? "🔄 إعادة إرسال الكود" : "🔑 توليد وإرسال كود الدخول";
        div.innerHTML = `
            <div class="list-info">
                <strong>عداد (${sub.counter}): ${sub.name}</strong>
                <span>الهاتف: ${sub.phone || 'غير مسجل'} | الموقع: ${sub.location || 'غير محدد'}</span>
                <span>ديون: ${sub.debtAmount || 0} درهم | حالة البوابة: ${sub.pin ? '<span style="color:var(--accent-green);font-weight:bold;">مفعل ✔️</span>' : '<span style="color:var(--danger-red);font-weight:bold;">غير مفعل ❌</span>'}</span>
            </div>
            <div style="display:flex; gap:5px; flex-wrap:wrap; flex-direction:column;">
                <div style="display:flex; gap:5px;">
                    <button class="edit-btn" onclick="editSubscriber('${sub.firestoreId}')">تعديل</button>
                    <button class="action-btn" onclick="deleteSubscriber('${sub.firestoreId}')">حذف</button>
                </div>
                <button class="btn btn-outline" style="padding:4px 8px; margin:0;" onclick="generateAndSendPIN('${sub.firestoreId}')">${pinBtnText}</button>
            </div>
        `;
        container.appendChild(div);
    });
};

window.generateAndSendPIN = async function(firestoreId) {
    let sub = subscribers.find(s => s.firestoreId === firestoreId);
    if (!sub) return;
    if (!sub.phone) { showToast('رقم هاتف المنخرط غير مسجل! قم بإضافة رقمه أولاً.'); return; }
    
    let pin = Math.floor(1000 + Math.random() * 9000).toString();
    sub.pin = pin;
    saveLocalData();
    if(navigator.onLine && !firestoreId.startsWith('local_')) {
        await updateDoc(doc(db, "subscribers", firestoreId), { pin: pin }).catch(()=>{});
    }
    
    let msg = `مرحباً السيد(ة) ${sub.name}،\nتم تفعيل حسابك في بوابة المشتركين لتطبيق تسيير ماء تامدة.\n\n👤 اسم المستخدم (رقم العداد): ${sub.counter}\n🔑 الرمز السري: ${pin}\n\nيمكنك الآن الدخول للاطلاع على فواتيرك وتقديم طلباتك عبر التطبيق.`;
    window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(msg)}`, '_blank');
    showToast('تم توليد الكود وفتح واتساب للإرسال');
    renderSubscribers();
};

window.deleteSubscriber = async function(id) {
    if(confirm('حذف المشترك نهائياً؟')) {
        subscribers = subscribers.filter(s => s.firestoreId !== id);
        saveLocalData();
        if(navigator.onLine && !id.startsWith('local_')) await deleteDoc(doc(db, "subscribers", id));
        renderSubscribers();
    }
}

// ==========================================
// بوابة المنخرط (المشترك) - فواتيري والشكايات
// ==========================================
window.renderSubPortalBills = function() {
    let subCounter = sessionStorage.getItem('tamda_counter');
    let subName = sessionStorage.getItem('tamda_subname');
    if(!subCounter) return;
    
    document.getElementById('portalSubName').textContent = subName;
    document.getElementById('portalSubCounter').textContent = subCounter;
    
    const container = document.getElementById('portalBillsContainer');
    container.innerHTML = '';
    
    let myBills = archiveBills.filter(b => b.counter == subCounter);
    myBills.sort((a,b) => b.month.localeCompare(a.month)); 
    
    if(myBills.length === 0) {
        container.innerHTML = '<p>لا توجد فواتير مسجلة في الأرشيف لعدادك حتى الآن.</p>'; return;
    }
    
    myBills.forEach(b => {
        let isPaid = b.status === 'خالصة';
        let color = isPaid ? 'var(--accent-green)' : 'var(--danger-red)';
        container.innerHTML += `
            <div class="list-item" style="border-right-color: ${color}">
                <div class="list-info">
                    <strong style="color: ${color}">شهر: ${b.month} | المبلغ: ${b.total} درهم</strong>
                    <span>الاستهلاك: ${b.consumption} m³ | الوضعية: <strong style="color: ${color}">${b.status}</strong> ${b.isExempt ? '(إعفاء)' : ''}</span>
                </div>
            </div>
        `;
    });
};

window.submitComplaint = async function() {
    const text = document.getElementById('complaintText').value.trim();
    if(!text) { showToast('المرجو كتابة الشكاية أو الطلب أولاً'); return; }
    
    let subCounter = sessionStorage.getItem('tamda_counter');
    let subName = sessionStorage.getItem('tamda_subname');
    
    let comp = {
        firestoreId: 'local_' + Date.now(),
        counter: subCounter, name: subName, text: text,
        date: new Date().toLocaleDateString('ar-MA'), status: 'جديدة'
    };
    
    complaintsList.push(comp);
    saveLocalData();
    if(navigator.onLine) { await addDoc(collection(db, "complaints"), comp); } else { queueOfflineAction('add_complaint', comp); }
    
    document.getElementById('complaintText').value = '';
    showToast('تم إرسال طلبك للإدارة بنجاح!');
};

window.renderAdminComplaints = function() {
    const container = document.getElementById('complaintsListContainer');
    if(!container) return;
    container.innerHTML = '';
    
    if(complaintsList.length === 0) {
        container.innerHTML = '<p class="text-success">لا توجد شكايات أو طلبات واردة حالياً.</p>'; return;
    }
    
    complaintsList.slice().reverse().forEach(c => {
        let isNew = c.status === 'جديدة';
        const div = document.createElement('div'); div.className = 'list-item';
        div.style.borderRightColor = isNew ? 'var(--danger-red)' : 'var(--accent-green)';
        div.innerHTML = `
            <div class="list-info">
                <strong>من: ${c.name} (عداد: ${c.counter}) - <span style="font-size:0.8rem; color:#666;">${c.date}</span></strong>
                <div style="font-size: 1rem; color: #333; margin:10px 0; padding:10px; background:#fff; border-radius:5px; border:1px solid #ddd; white-space: pre-wrap;">${c.text}</div>
                <span style="color: ${isNew ? 'var(--danger-red)' : 'var(--accent-green)'}; font-weight:bold;">الحالة: ${c.status}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px; min-width: 120px;">
                ${isNew ? `<button class="pay-btn" style="margin-top:0;" onclick="markComplaintRead('${c.firestoreId}')">✔️ تم المعالجة</button>` : ''}
                <button class="action-btn" onclick="deleteComplaint('${c.firestoreId}')">🗑️ حذف</button>
            </div>
        `;
        container.appendChild(div);
    });
};

window.markComplaintRead = async function(id) {
    let comp = complaintsList.find(c => c.firestoreId === id);
    if(comp) {
        comp.status = 'تمت المعالجة';
        saveLocalData();
        if(navigator.onLine && !id.startsWith('local_')) await updateDoc(doc(db, "complaints", id), { status: 'تمت المعالجة' });
        renderAdminComplaints();
    }
};
window.deleteComplaint = async function(id) {
    if(confirm('حذف هذه الشكاية نهائياً؟')) {
        complaintsList = complaintsList.filter(c => c.firestoreId !== id);
        saveLocalData();
        if(navigator.onLine && !id.startsWith('local_')) await deleteDoc(doc(db, "complaints", id));
        renderAdminComplaints();
    }
};

// ==========================================
// باقي الوظائف الأساسية للإدارة
// ==========================================
window.saveDonation = async function() {
    const month = document.getElementById('donationMonth').value;
    const name = document.getElementById('donationName').value.trim();
    const amount = parseFloat(document.getElementById('donationAmount').value) || 0;
    if (amount <= 0 || !month || !name) return showToast('أدخل البيانات كاملة');
    let donObj = { firestoreId: 'local_' + Date.now(), month, name, amount, timestamp: new Date().toISOString() };
    donationsList.push(donObj); recalculateFinancials(); saveLocalData();
    if (navigator.onLine) await addDoc(collection(db, "donations"), donObj); else queueOfflineAction('add_donation', donObj);
    document.getElementById('donationName').value = ''; document.getElementById('donationAmount').value = ''; 
    showToast('تم تسجيل التبرع'); renderDonations(); updateFinancialDashboard();
};

window.renderDonations = function() {
    const container = document.getElementById('donationsListContainer');
    if(!container) return;
    container.innerHTML = '';
    if(donationsList.length === 0) { container.innerHTML = '<p>لا توجد تبرعات مسجلة بعد.</p>'; return; }
    
    let tableHTML = `<table class="archive-table"><thead><tr><th>تاريخ التبرع</th><th>اسم المتبرع</th><th>المبلغ (درهم)</th><th class="no-print">إجراء</th></tr></thead><tbody>`;
    donationsList.slice().reverse().forEach((d) => {
        tableHTML += `<tr>
            <td>${d.month}</td>
            <td>السيد(ة) ${d.name}</td>
            <td style="color:#d81b60; font-weight:bold;">${d.amount}</td>
            <td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteDonation('${d.firestoreId}')">حذف</button></td>
        </tr>`;
    });
    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
};

window.deleteDonation = async function(id) {
    if(confirm('حذف التبرع؟ سيتم خصمه من الصندوق.')) {
        donationsList = donationsList.filter(d => d.firestoreId !== id);
        recalculateFinancials(); saveLocalData();
        if(navigator.onLine && !id.startsWith('local_')) await deleteDoc(doc(db, "donations", id));
        renderDonations(); updateFinancialDashboard();
    }
};

window.updateFinancialDashboard = function() {
    const netBalance = totalIncome - totalExpense;
    const normalIncome = totalIncome - totalDonationsIncome;
    if(document.getElementById('normalIncomeReport')) document.getElementById('normalIncomeReport').textContent = normalIncome + ' درهم';
    if(document.getElementById('donationsIncomeReport')) document.getElementById('donationsIncomeReport').textContent = totalDonationsIncome + ' درهم';
    if(document.getElementById('totalIncomeReport')) document.getElementById('totalIncomeReport').textContent = totalIncome + ' درهم';
    if(document.getElementById('totalExpenseReport')) document.getElementById('totalExpenseReport').textContent = totalExpense + ' درهم';
    if(document.getElementById('netBalanceReport')) document.getElementById('netBalanceReport').textContent = netBalance + ' درهم';
    if(document.getElementById('dashBalance')) document.getElementById('dashBalance').textContent = netBalance + ' درهم';
};

window.saveTransaction = async function() {
    const month = document.getElementById('transMonth').value;
    const type = document.getElementById('transType').value;
    const amount = parseFloat(document.getElementById('transAmount').value) || 0;
    const desc = document.getElementById('transDesc').value.trim();
    if (amount <= 0 || !month) return showToast('أدخل البيانات كاملة');
    let transactionObj = { firestoreId: 'local_' + Date.now(), month, type, amount, desc, fileName: '', timestamp: new Date().toISOString() };
    transactionsList.push(transactionObj); archiveFinance.push(transactionObj);
    recalculateFinancials(); saveLocalData();
    if (navigator.onLine) { await addDoc(collection(db, "transactions"), transactionObj); await addDoc(collection(db, "archive_finance"), transactionObj); } else { queueOfflineAction('add_transaction', transactionObj); }
    document.getElementById('transAmount').value = ''; document.getElementById('transDesc').value = '';
    showToast('تم تسجيل العملية'); renderTransactions(); updateFinancialDashboard();
};

window.renderTransactions = function() {
    const container = document.getElementById('transactionsListContainer');
    if(!container) return;
    container.innerHTML = '';
    if(transactionsList.length === 0) { container.innerHTML = '<p>لا توجد عمليات مسجلة.</p>'; return; }
    transactionsList.slice().reverse().forEach((t) => {
        const div = document.createElement('div'); div.className = 'list-item';
        div.style.borderRightColor = t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)';
        div.innerHTML = `
            <div class="list-info">
                <strong style="color:${t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)'}">${t.type === 'income' ? 'مدخول (+)' : 'مصروف (-)'} ${t.amount} درهم</strong>
                <span>الوصف: ${t.desc} | الشهر: ${t.month}</span>
            </div>
            <button class="action-btn" onclick="deleteTransaction('${t.firestoreId}')">حذف</button>
        `;
        container.appendChild(div);
    });
};

window.deleteTransaction = async function(firestoreId) {
    if(confirm('حذف هذه العملية؟')) {
        transactionsList = transactionsList.filter(t => t.firestoreId !== firestoreId);
        archiveFinance = archiveFinance.filter(f => f.firestoreId !== firestoreId);
        recalculateFinancials(); saveLocalData();
        if(navigator.onLine && !firestoreId.startsWith('local_')) await deleteDoc(doc(db, "transactions", firestoreId));
        renderTransactions(); updateFinancialDashboard();
    }
};

window.uploadFinancialPDF = function() {
    const fileInput = document.getElementById('pdfReportFile');
    const titleInput = document.getElementById('pdfReportTitle');
    if(!fileInput.files || fileInput.files.length === 0) return showToast('اختر ملف PDF');
    let file = fileInput.files[0]; let title = titleInput.value.trim() || file.name;
    let reader = new FileReader();
    reader.onload = function(e) {
        let reports = JSON.parse(localStorage.getItem('tamda_pdf_reports')) || [];
        reports.push({ title: title, data: e.target.result, date: new Date().toLocaleDateString('ar-MA') });
        localStorage.setItem('tamda_pdf_reports', JSON.stringify(reports));
        fileInput.value = ''; titleInput.value = ''; showToast('تم رفع الوثيقة بنجاح!'); renderPDFReportsList();
    };
    reader.readAsDataURL(file);
};

window.renderPDFReportsList = function() {
    const container = document.getElementById('pdfReportsContainer');
    if(!container) return;
    let reports = JSON.parse(localStorage.getItem('tamda_pdf_reports')) || [];
    container.innerHTML = '';
    if(reports.length === 0) { container.innerHTML = '<p style="color:#666;">لا توجد وثائق مرفوعة.</p>'; return; }
    reports.forEach((rep, idx) => {
        container.innerHTML += `<div class="list-item" style="display:flex; justify-content:space-between; align-items:center;">
            <div><strong>${rep.title}</strong><span style="font-size:0.8rem; color:#666;">تاريخ: ${rep.date}</span></div>
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
                <button class="btn btn-blue" style="padding:6px 12px; margin:0; font-size:0.85rem;" onclick="viewPDF(${idx})">👁️ عرض</button>
                <button class="action-btn" onclick="deletePDFReport(${idx})">حذف</button>
            </div>
        </div>`;
    });
};

window.viewPDF = function(index) {
    let reports = JSON.parse(localStorage.getItem('tamda_pdf_reports')) || [];
    if (reports[index]) {
        document.getElementById('pdfModalTitle').textContent = reports[index].title;
        document.getElementById('pdfViewerFrame').src = reports[index].data;
        document.getElementById('pdfModal').style.display = 'flex';
    }
};
window.closePDFModal = function() { document.getElementById('pdfModal').style.display = 'none'; document.getElementById('pdfViewerFrame').src = ''; };
window.deletePDFReport = function(index) {
    if(confirm('حذف هذه الوثيقة؟')) {
        let reports = JSON.parse(localStorage.getItem('tamda_pdf_reports')) || [];
        reports.splice(index, 1); localStorage.setItem('tamda_pdf_reports', JSON.stringify(reports));
        renderPDFReportsList(); showToast('تم الحذف');
    }
};

window.calculateBill = function() {
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
    if (curr < prev) { showToast('القراءة الحالية أقل من السابقة!'); return; }

    const consumption = curr - prev;
    currentConsumptionData = consumption;
    let alertMessages = [];
    let currentCounterNum = parseInt(counterNumInput);
    let prevCounterExists = subscribers.some(s => Number(s.counter) === currentCounterNum - 1 && (!s.lastBilledMonth || s.lastBilledMonth !== billingMonth));
    let nextCounterExists = subscribers.some(s => Number(s.counter) === currentCounterNum + 1 && (!s.lastBilledMonth || s.lastBilledMonth !== billingMonth));
    if (prevCounterExists || nextCounterExists) alertMessages.push('⚠️ تنبيه: يبدو أنك نسيت قراءة عداد مجاور.');
    let sub = subscribers.find(s => s.counter == counterNumInput);
    let historicAvg = sub ? (sub.avgConsumption || 25) : 25;
    if (historicAvg > 20 && consumption < 10) alertMessages.push(`⚠️ تنبيه: هذا المنخرط يستهلك عادة أكثر من 20، وسجلت ${consumption} فقط!`);
    
    if (alertMessages.length > 0) { alertBox.style.display = 'block'; alertBox.innerHTML = alertMessages.join('<br>'); } 
    else { alertBox.style.display = 'none'; alertBox.innerHTML = ''; }

    currentT1 = 0; currentT2 = 0; currentT3 = 0;
    let t1_cost = 0, t2_cost = 0, t3_cost = 0, maintenance = 0;

    if (tariffSystem === 'current') {
        maintenance = appSettings.maintenance;
        if (consumption <= 15) { currentT1 = consumption; } else if (consumption <= 20) { currentT1 = 15; currentT2 = consumption - 15; } else { currentT1 = 15; currentT2 = 5; currentT3 = consumption - 20; }
        t1_cost = currentT1 * appSettings.tier1; t2_cost = currentT2 * appSettings.tier2; t3_cost = currentT3 * appSettings.tier3;
    } else {
        maintenance = 15;
        if (consumption <= 20) { currentT1 = consumption; } else if (consumption <= 30) { currentT1 = 20; currentT2 = consumption - 20; } else { currentT1 = 20; currentT2 = 10; currentT3 = consumption - 30; }
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
    
    document.getElementById('printMonth').textContent = billingMonth; document.getElementById('printName').textContent = subName;
    document.getElementById('printCounter').textContent = counterNumInput; document.getElementById('printPrev').textContent = prev;
    document.getElementById('printCurr').textContent = curr; document.getElementById('printMaintenance').textContent = maintenance + ' درهم';
    document.getElementById('consumptionResult').textContent = consumption + ' m³'; document.getElementById('consumptionPriceResult').textContent = consumptionCost + ' درهم';
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
            firestoreId: 'local_' + Date.now(), month: currentMonth, counter: counterInput, name: subNameStr,
            consumption: currentConsumptionData, t1: currentT1, t2: currentT2, t3: currentT3,
            total: currentBillTotal, status: isPaid ? 'خالصة' : 'دين', isExempt: isExempt, timestamp: new Date().toISOString()
        };

        try {
            archiveBills.push(billArchiveObj);
            if (sub) {
                let newDelay = isPaid ? 0 : ((sub.delayMonths || 0) + 1);
                let newDebt = isPaid ? 0 : ((sub.debtAmount || 0) + currentBillTotal);
                sub.lastReading = curr; sub.lastBilledMonth = currentMonth; sub.delayMonths = newDelay; sub.debtAmount = newDebt;
                sub.avgConsumption = Math.round((sub.avgConsumption ? (sub.avgConsumption + currentConsumptionData) / 2 : currentConsumptionData));
                if(navigator.onLine && !sub.firestoreId.startsWith('local_')) await updateDoc(doc(db, "subscribers", sub.firestoreId), { lastReading: curr, lastBilledMonth: currentMonth, delayMonths: newDelay, debtAmount: newDebt, avgConsumption: sub.avgConsumption }).catch(() => {});
            }
            if (isPaid && currentBillTotal > 0) {
                let transObj = { firestoreId: 'local_' + Date.now(), month: currentMonth, type: 'income', amount: currentBillTotal, desc: `استخلاص فاتورة ماء - عداد: ${counterInput}`, fileName: '', timestamp: new Date().toISOString() };
                transactionsList.push(transObj); archiveFinance.push(transObj); recalculateFinancials();
                if(navigator.onLine) addDoc(collection(db, "transactions"), transObj);
            }
            saveLocalData();
            if (navigator.onLine) await addDoc(collection(db, "archive_bills"), billArchiveObj); else queueOfflineAction('add_bill', billArchiveObj);

            showToast('تم حفظ الفاتورة بنجاح'); currentBillTotal = 0; 
            document.getElementById('billResult').style.display = 'none'; document.getElementById('currReading').value = '';
            document.getElementById('exemptionCheck').checked = false; document.getElementById('smartAlertBox').style.display = 'none';
            let nextCounter = parseInt(counterInput);
            if (!isNaN(nextCounter)) document.getElementById('counterNum').value = nextCounter + 1;
            autoFillSubscriber();
        } catch (e) { showToast('فشل الحفظ'); }
    } else { showToast('يرجى حساب الفاتورة أولاً'); }
};

window.sendWhatsAppNotification = function() {
    const counterInput = document.getElementById('counterNum').value.trim();
    const currentMonth = document.getElementById('billingMonth').value || 'الحالي';
    const sub = subscribers.find(s => s.counter == counterInput);
    if (!sub || !sub.phone) return showToast('رقم هاتف المشترك غير مسجل!');
    let message = `مرحباً السيد(ة) ${sub.name}،\nفاتورة استهلاك ماء الشرب لشهر ${currentMonth} هي: ${currentBillTotal} درهم.\nالمرجو المبادرة بالأداء وشكراً.`;
    window.open(`https://wa.me/${sub.phone}?text=${encodeURIComponent(message)}`, '_blank');
};

function getNextMonth(monthString) {
    if (!monthString) return '';
    let parts = monthString.split('-'); if(parts.length < 2) return '';
    let d = new Date(parseInt(parts[0]), parseInt(parts[1]), 1); 
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

window.autoFillSubscriber = function() {
    const counterInput = document.getElementById('counterNum').value.trim();
    const sub = subscribers.find(s => s.counter == counterInput);
    if (sub) {
        document.getElementById('subscriberName').value = sub.name;
        if(sub.lastBilledMonth) document.getElementById('billingMonth').value = getNextMonth(sub.lastBilledMonth);
        document.getElementById('prevReading').value = (sub.lastReading !== null) ? sub.lastReading : '';
        document.getElementById('currReading').value = ''; document.getElementById('delayMonths').value = sub.delayMonths || 0;
    } else {
        document.getElementById('subscriberName').value = ''; document.getElementById('prevReading').value = ''; 
        document.getElementById('currReading').value = ''; document.getElementById('delayMonths').value = 0;
    }
    calculateBill();
};

window.enableEdit = function(elementId) { document.getElementById(elementId).focus(); showToast('تم فتح الحقل للتعديل'); };

window.renderDebts = function() {
    const container = document.getElementById('debtsListContainer');
    if(!container) return; container.innerHTML = '';
    const debtors = subscribers.filter(s => Number(s.debtAmount) > 0);
    debtors.sort((a, b) => Number(a.counter) - Number(b.counter));
    if(debtors.length === 0) { container.innerHTML = '<p class="text-success" style="font-weight:bold;">لا توجد ديون مسجلة حالياً.</p>'; return; }
    
    debtors.forEach((sub) => {
        const div = document.createElement('div'); div.className = 'list-item'; div.style.borderRightColor = 'var(--danger-red)';
        div.innerHTML = `
            <div class="list-info"><strong style="color:var(--danger-red);">عداد (${sub.counter}): ${sub.name}</strong><span>المبلغ المتبقي: <strong>${sub.debtAmount} درهم</strong> | تأخير: ${sub.delayMonths} أشهر</span></div>
            <div><button class="pay-btn" onclick="collectDebt('${sub.firestoreId}', ${sub.debtAmount}, '${sub.counter}', '${sub.name}')">💵 استخلاص</button></div>
        `;
        container.appendChild(div);
    });
};

window.collectDebt = async function(firestoreId, amount, counter, name) {
    if(confirm(`هل تؤكد استخلاص مبلغ الدين (${amount} درهم)؟`)) {
        let sub = subscribers.find(s => s.firestoreId === firestoreId);
        if(sub) { sub.debtAmount = 0; sub.delayMonths = 0; }
        let nowMonth = new Date().toISOString().slice(0, 7);
        let newTrans = { firestoreId: 'local_' + Date.now(), month: nowMonth, type: 'income', amount: Number(amount), desc: `استخلاص دين متأخر - عداد: ${counter}`, fileName: '', timestamp: new Date().toISOString() };
        transactionsList.push(newTrans); recalculateFinancials(); saveLocalData();
        if (navigator.onLine) { await addDoc(collection(db, "transactions"), newTrans); if(!firestoreId.startsWith('local_')) await updateDoc(doc(db, "subscribers", firestoreId), { debtAmount: 0, delayMonths: 0 }); }
        showToast('تم الاستخلاص بنجاح!'); renderDebts(); updateFinancialDashboard();
    }
};

window.renderArchive = function() {
    const container = document.getElementById('archiveContainer');
    if(!container) return; container.innerHTML = '';
    let allMonths = new Set(); archiveBills.forEach(b => allMonths.add(b.month)); archiveFinance.forEach(f => allMonths.add(f.month));
    let sortedMonths = Array.from(allMonths).sort().reverse();
    if(sortedMonths.length === 0) { container.innerHTML = '<p>لا توجد بيانات مسجلة.</p>'; return; }

    sortedMonths.forEach(month => {
        let monthBills = archiveBills.filter(b => b.month === month);
        let monthFinance = archiveFinance.filter(f => f.month === month);
        monthBills.sort((a, b) => Number(a.counter) - Number(b.counter));
        let monthTotalWater = 0, monthTotalAmount = 0;
        monthBills.forEach(b => { monthTotalWater += Number(b.consumption || 0); monthTotalAmount += Number(b.total || 0); });

        const box = document.createElement('div'); box.className = 'archive-month-box';
        let html = `<div class="printable-archive"><h4 style="margin-top:0; color:var(--primary-blue); border-bottom:2px solid var(--secondary-cyan); padding-bottom:8px;"><span>📅 الأرشيف الشامل - شهر: ${month}</span></h4>
        <div style="display:flex; gap:20px; margin-bottom:10px; font-size:0.95rem; background:var(--bg-light); padding:8px; border-radius:6px;"><span>الاستهلاك: <strong>${monthTotalWater} m³</strong></span><span>المبالغ المحصلة: <strong class="text-success">${monthTotalAmount} درهم</strong></span></div>`;
        
        if(monthBills.length > 0) {
            html += `<table class="archive-table"><thead><tr><th>رقم العداد</th><th>الاستهلاك (m³)</th><th>الثمن (درهم)</th><th>الوضع</th><th class="no-print">إجراءات</th></tr></thead><tbody>`;
            monthBills.forEach(b => { html += `<tr><td>${b.counter}</td><td>${b.consumption}</td><td>${b.total}</td><td>${b.status} ${b.isExempt ? '(إعفاء)' : ''}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveBill('${b.firestoreId}')">حذف</button></td></tr>`; });
            html += `</tbody></table>`;
        }
        
        html += `<h5 style="margin: 15px 0 5px 0; color:var(--text-dark);">💰 العمليات المالية:</h5>`;
        if(monthFinance.length > 0) {
            html += `<table class="archive-table"><thead><tr><th>النوع</th><th>المبلغ (درهم)</th><th>الوصف</th><th class="no-print">إجراءات</th></tr></thead><tbody>`;
            monthFinance.forEach(f => { html += `<tr><td class="${f.type === 'income' ? 'text-success' : 'text-danger'}">${f.type === 'income' ? 'مدخول' : 'مصروف'}</td><td>${f.amount}</td><td>${f.desc}</td><td class="no-print"><button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteArchiveFinance('${f.firestoreId}')">حذف</button></td></tr>`; });
            html += `</tbody></table>`;
        }
        html += `</div>`; box.innerHTML = html; container.appendChild(box);
    });
};

window.deleteArchiveBill = async function(id) {
    if(confirm('متأكد من الحذف؟')) { archiveBills = archiveBills.filter(b => b.firestoreId !== id); saveLocalData(); if(navigator.onLine && !id.startsWith('local_')) await deleteDoc(doc(db, "archive_bills", id)); renderArchive(); }
};
window.deleteArchiveFinance = async function(id) {
    if(confirm('متأكد من الحذف؟')) { archiveFinance = archiveFinance.filter(f => f.firestoreId !== id); saveLocalData(); if(navigator.onLine && !id.startsWith('local_')) await deleteDoc(doc(db, "archive_finance", id)); renderArchive(); }
};

window.toggleStatInputs = function() {
    const type = document.getElementById('statTypeSelect').value;
    document.getElementById('monthInputGroup').style.display = (type === 'monthly') ? 'block' : 'none';
    document.getElementById('yearInputGroup').style.display = (type === 'yearly') ? 'block' : 'none';
    renderAdvancedStats();
};

window.renderAdvancedStats = function() {
    const container = document.getElementById('statsContainer');
    if(!container) return; const type = document.getElementById('statTypeSelect').value;
    let filteredBills = []; let periodTitle = '';

    if (type === 'monthly') {
        const monthSelect = document.getElementById('statsMonthSelect');
        if(!monthSelect.value) { let now = new Date(); monthSelect.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'); }
        filteredBills = archiveBills.filter(b => b.month === monthSelect.value); periodTitle = `شهر: ${monthSelect.value}`;
    } else {
        const yearSelect = document.getElementById('statsYearSelect');
        filteredBills = archiveBills.filter(b => b.month && b.month.startsWith(yearSelect.value)); periodTitle = `سنة: ${yearSelect.value}`;
    }

    if(filteredBills.length === 0) { container.innerHTML = `<p style="margin-top:15px; color:#666;">لا توجد بيانات لـ (${periodTitle}).</p>`; return; }

    let totalWater = 0, totalT1 = 0, totalT2 = 0, totalT3 = 0, maxConsumption = -1, topConsumer = '---';
    filteredBills.forEach(b => {
        let cons = Number(b.consumption || 0); totalWater += cons; totalT1 += Number(b.t1 || 0); totalT2 += Number(b.t2 || 0); totalT3 += Number(b.t3 || 0);
        if(cons > maxConsumption) { maxConsumption = cons; topConsumer = `عداد (${b.counter}) ${b.name} (${cons} m³)`; }
    });

    let p1 = totalWater > 0 ? Math.round((totalT1 / totalWater) * 100) : 0;
    let p2 = totalWater > 0 ? Math.round((totalT2 / totalWater) * 100) : 0;
    let p3 = totalWater > 0 ? Math.round((totalT3 / totalWater) * 100) : 0;

    container.innerHTML = `
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:12px;">
            <div class="stat-row"><span>الاستهلاك (${periodTitle}):</span><strong style="color:var(--primary-blue); font-size:1.2rem;">${totalWater} m³</strong></div>
            <div class="stat-row"><span>الأكثر استهلاكاً:</span><strong class="text-danger">${topConsumer}</strong></div>
            <h4 style="margin:10px 0 5px 0; color:var(--primary-blue);">📈 مبيانات الأشطر:</h4>
            <div class="chart-container">
                <div class="chart-bar-wrap"><div class="chart-bar-label"><span>الشطر الأول</span><span>${p1}%</span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${p1}%; background: var(--accent-green);"></div></div></div>
                <div class="chart-bar-wrap"><div class="chart-bar-label"><span>الشطر الثاني</span><span>${p2}%</span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${p2}%; background: var(--secondary-cyan);"></div></div></div>
                <div class="chart-bar-wrap"><div class="chart-bar-label"><span>الشطر الثالث</span><span>${p3}%</span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${p3}%; background: var(--danger-red);"></div></div></div>
            </div>
        </div>
    `;
};
