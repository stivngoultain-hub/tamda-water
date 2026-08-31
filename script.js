const secureCodes = { 'president': '1111', 'secretary': '2222', 'treasurer': '3333' };
const roleNames = { 'president': 'الرئيس', 'secretary': 'الكاتب العام', 'treasurer': 'أمين المال' };

const menuBtn = document.getElementById('menuBtn');
const closeBtn = document.getElementById('closeBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const toast = document.getElementById('toast');

let totalIncome = 0; let totalExpense = 0; let currentBillTotal = 0; 
let subscribers = []; let appSettings = {}; let transactionsList = []; let archiveBills = []; let archiveFinance = [];

const views = {
    '🏠 لوحة القيادة': 'view-dashboard', '👥 إدارة المنخرطين': 'view-subscribers',
    '💧 إدارة ماء الشرب': 'view-water', '💰 المداخيل والمصاريف': 'view-finance',
    '📒 الديون والأرصدة': 'view-debts', '📊 التقارير المالية': 'view-reports',
    '📜 القانون الأساسي': 'view-bylaws', '🗄️ الأرشيف والتخزين': 'view-archive',
    '⚙️ الإعدادات': 'view-settings'
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth(); loadSettings();
    subscribers = JSON.parse(localStorage.getItem('tamda_subscribers')) || [];
    transactionsList = JSON.parse(localStorage.getItem('tamda_transactions')) || [];
    archiveBills = JSON.parse(localStorage.getItem('tamda_archive_bills')) || [];
    archiveFinance = JSON.parse(localStorage.getItem('tamda_archive_finance')) || [];
    
    let savedBylaw = localStorage.getItem('tamda_bylaws') || '';
    document.getElementById('bylawInput').value = savedBylaw;
    document.getElementById('bylawDisplay').textContent = savedBylaw || 'لا يوجد قانون أساسي مسجل حالياً.';
    
    transactionsList.forEach(t => { if(t.type === 'income') totalIncome += t.amount; else totalExpense += t.amount; });
    let billsIncome = parseFloat(localStorage.getItem('tamda_bills_income')) || 0;
    totalIncome += billsIncome;

    renderSubscribers(); updateFinancialDashboard();
});

function checkAuth() {
    if(sessionStorage.getItem('tamda_auth') === 'true') {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        document.getElementById('activeUserLabel').textContent = "مرحباً: " + roleNames[sessionStorage.getItem('tamda_role')];
    }
}
function handleEnter(e) { if (e.key === 'Enter') authenticate(); }
function authenticate() {
    const role = document.getElementById('userRole').value;
    const code = document.getElementById('loginCode').value;
    if(secureCodes[role] === code) {
        sessionStorage.setItem('tamda_auth', 'true'); sessionStorage.setItem('tamda_role', role);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
        document.getElementById('activeUserLabel').textContent = "مرحباً: " + roleNames[role];
        showToast('تم تسجيل الدخول بنجاح');
    } else { document.getElementById('loginError').style.display = 'block'; }
}
function logout() { sessionStorage.removeItem('tamda_auth'); sessionStorage.removeItem('tamda_role'); location.reload(); }

function toggleSidebar() { sidebar.classList.toggle('active'); overlay.classList.toggle('active'); }
menuBtn.addEventListener('click', toggleSidebar); closeBtn.addEventListener('click', toggleSidebar); overlay.addEventListener('click', toggleSidebar);

function showToast(message) {
    toast.textContent = message; toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 2500);
}

function navigateTo(pageName) {
    if (sidebar.classList.contains('active')) toggleSidebar();
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    if (views[pageName] && document.getElementById(views[pageName])) {
        document.getElementById(views[pageName]).style.display = 'block';
        if(pageName === '👥 إدارة المنخرطين') renderSubscribers();
        if(pageName === '⚙️ الإعدادات') loadSettingsToInputs();
        if(pageName === '📒 الديون والأرصدة') renderDebts();
        if(pageName === '💰 المداخيل والمصاريف') renderTransactions();
        if(pageName === '🗄️ الأرشيف والتخزين') renderArchive();
        showToast('تم الانتقال إلى: ' + pageName);
    }
}

function loadSettings() { appSettings = JSON.parse(localStorage.getItem('tamda_settings')) || { tier1: 4, tier2: 8, tier3: 15, maintenance: 15, penalty: 50 }; }
function loadSettingsToInputs() {
    document.getElementById('setTier1').value = appSettings.tier1; document.getElementById('setTier2').value = appSettings.tier2;
    document.getElementById('setTier3').value = appSettings.tier3; document.getElementById('setMaintenance').value = appSettings.maintenance;
    document.getElementById('setPenalty').value = appSettings.penalty;
}
function saveSettings() {
    appSettings.tier1 = parseFloat(document.getElementById('setTier1').value) || 4; appSettings.tier2 = parseFloat(document.getElementById('setTier2').value) || 8;
    appSettings.tier3 = parseFloat(document.getElementById('setTier3').value) || 15; appSettings.maintenance = parseFloat(document.getElementById('setMaintenance').value) || 15;
    appSettings.penalty = parseFloat(document.getElementById('setPenalty').value) || 50;
    localStorage.setItem('tamda_settings', JSON.stringify(appSettings)); showToast('تم حفظ الإعدادات!');
}

function saveBylaws() {
    const text = document.getElementById('bylawInput').value;
    localStorage.setItem('tamda_bylaws', text);
    document.getElementById('bylawDisplay').textContent = text || 'لا يوجد قانون أساسي مسجل حالياً.';
    showToast('تم حفظ القانون الأساسي بنجاح');
}

// ------ الأرشيف المجمع الشهري ------
function renderArchive() {
    const container = document.getElementById('archiveContainer');
    container.innerHTML = '';
    
    // استخراج جميع الشهور الموجودة في الفواتير والعمليات المالية
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
        
        const box = document.createElement('div');
        box.className = 'archive-month-box';
        
        let html = `
            <div id="print-month-${month}" class="printable-archive">
                <h4 style="margin-top:0; color:var(--primary-blue); border-bottom:2px solid var(--secondary-cyan); padding-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>📅 أرشيف شهر: ${month}</span>
                    <button class="btn btn-blue no-print" style="margin:0; width:auto; padding:6px 12px; font-size:0.85rem;" onclick="printMonthArchive('${month}')">🖨️ تحميل/طبع وثيقة الشهر</button>
                </h4>
                
                <h5 style="margin: 15px 0 5px 0; color:var(--text-dark);">💧 فواتير العدادات المحصلة:</h5>
        `;
        
        if(monthBills.length > 0) {
            html += `
                <table class="archive-table">
                    <thead><tr><th>رقم العداد</th><th>اسم المشترك</th><th>المبلغ المؤدى (درهم)</th><th>الحالة</th></tr></thead>
                    <tbody>
            `;
            monthBills.forEach(b => {
                html += `<tr><td>${b.counter}</td><td>${b.name}</td><td>${b.total}</td><td>${b.status}</td></tr>`;
            });
            html += `</tbody></table>`;
        } else {
            html += `<p style="font-size:0.9rem; color:#666;">لا توجد فواتير مسجلة لهذا الشهر.</p>`;
        }
        
        html += `<h5 style="margin: 15px 0 5px 0; color:var(--text-dark);">💰 المداخيل والمصاريف المنجزة:</h5>`;
        
        if(monthFinance.length > 0) {
            html += `
                <table class="archive-table">
                    <thead><tr><th>النوع</th><th>المبلغ (درهم)</th><th>البيان / الوصف</th><th>المرفق</th></tr></thead>
                    <tbody>
            `;
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
}

function printMonthArchive(month) {
    let printContent = document.getElementById(`print-month-${month}`).innerHTML;
    let originalBody = document.body.innerHTML;
    
    document.body.innerHTML = `<div style="padding:20px; direction:rtl; font-family:'Segoe UI', Tahoma, sans-serif;">
        <h2 style="text-align:center; color:#1b6393;">جمعية تامدة للتنمية</h2>
        <h3 style="text-align:center; color:#444;">تقرير الأرشيف الشهري المجمع - ${month}</h3>
        <hr style="margin-bottom:20px;">
        ${printContent}
    </div>`;
    
    window.print();
    document.body.innerHTML = originalBody;
    location.reload(); // إعادة تفعيل الأحداث بعد الطباعة
}

function saveSubscriber() {
    const counter = document.getElementById('newSubCounter').value.trim();
    const name = document.getElementById('newSubName').value.trim();
    const location = document.getElementById('newSubLocation').value.trim();
    if (!counter || !name) { showToast('المرجو إدخال رقم العداد والاسم'); return; }
    if (subscribers.find(s => s.counter == counter)) { showToast('العداد مسجل مسبقاً!'); return; }
    subscribers.push({ counter, name, location, lastReading: null, delayMonths: 0, debtAmount: 0, lastBilledMonth: '' });
    localStorage.setItem('tamda_subscribers', JSON.stringify(subscribers));
    document.getElementById('newSubCounter').value = ''; document.getElementById('newSubName').value = ''; document.getElementById('newSubLocation').value = '';
    renderSubscribers(); showToast('تم حفظ المشترك!');
}

function renderSubscribers() {
    const container = document.getElementById('subscribersListContainer');
    const searchEl = document.getElementById('searchSub');
    const searchTerm = (searchEl ? searchEl.value.toLowerCase() : '');
    container.innerHTML = '';
    let filteredSubs = subscribers.filter(s => s.name.toLowerCase().includes(searchTerm) || s.counter.toString().includes(searchTerm));
    document.getElementById('subListCount').textContent = filteredSubs.length;
    document.getElementById('dashSubCount').textContent = subscribers.length;
    
    let totalDebts = 0; subscribers.forEach(s => totalDebts += (s.debtAmount || 0));
    document.getElementById('dashDebts').textContent = totalDebts + ' درهم';

    filteredSubs.forEach((sub) => {
        const index = subscribers.findIndex(orig => orig.counter === sub.counter);
        const div = document.createElement('div'); div.className = 'list-item';
        div.innerHTML = `<div class="list-info"><strong>${sub.name} (عداد: ${sub.counter})</strong><span>الموقع: ${sub.location || 'غير محدد'} | قراءة سابقة: ${sub.lastReading !== null ? sub.lastReading : 'لا توجد'}</span><span class="${(sub.debtAmount > 0) ? 'text-danger' : 'text-success'}">ديون: ${sub.debtAmount || 0} درهم (تأخير: ${sub.delayMonths || 0} أشهر)</span></div>
            <button class="action-btn" onclick="deleteSubscriber(${index})">حذف</button>`;
        container.appendChild(div);
    });
}
function deleteSubscriber(index) { if(confirm('متأكد من حذف المشترك؟')) { subscribers.splice(index, 1); localStorage.setItem('tamda_subscribers', JSON.stringify(subscribers)); renderSubscribers(); } }

function renderDebts() {
    const container = document.getElementById('debtsListContainer');
    container.innerHTML = '';
    const debtors = subscribers.filter(s => s.debtAmount > 0);
    if(debtors.length === 0) { container.innerHTML = '<p class="text-success" style="font-weight:bold;">لا توجد ديون مسجلة حالياً. جميع الفواتير خالصة.</p>'; return; }
    
    debtors.forEach((sub) => {
        const div = document.createElement('div'); div.className = 'list-item'; div.style.borderRightColor = 'var(--danger-red)';
        div.innerHTML = `<div class="list-info"><strong style="color:var(--danger-red);">${sub.name} (عداد: ${sub.counter})</strong><span>المبلغ المتبقي: <strong>${sub.debtAmount} درهم</strong> | تأخير: ${sub.delayMonths} أشهر</span></div>`;
        container.appendChild(div);
    });
}

function getNextMonth(monthString) {
    if (!monthString) return '';
    let [year, month] = monthString.split('-'); let d = new Date(year, parseInt(month), 1); 
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function autoFillSubscriber() {
    const counterInput = document.getElementById('counterNum').value.trim();
    const sub = subscribers.find(s => s.counter == counterInput);
    if (sub) {
        document.getElementById('subscriberName').value = sub.name;
        if(sub.lastBilledMonth) document.getElementById('billingMonth').value = getNextMonth(sub.lastBilledMonth);
        if (sub.lastReading !== null) { document.getElementById('prevReading').value = sub.lastReading; document.getElementById('prevReading').readOnly = true; document.getElementById('prevReadingHint').style.display = 'block'; } 
        else { document.getElementById('prevReading').value = ''; document.getElementById('prevReading').readOnly = false; document.getElementById('prevReadingHint').style.display = 'none'; }
        document.getElementById('delayMonths').value = sub.delayMonths || 0;
    } else {
        document.getElementById('subscriberName').value = ''; document.getElementById('prevReading').value = ''; document.getElementById('prevReading').readOnly = false; document.getElementById('prevReadingHint').style.display = 'none'; document.getElementById('delayMonths').value = 0;
    }
}

function updateFinancialDashboard() {
    const netBalance = totalIncome - totalExpense;
    document.getElementById('totalIncomeReport').textContent = totalIncome + ' درهم';
    document.getElementById('totalExpenseReport').textContent = totalExpense + ' درهم';
    document.getElementById('netBalanceReport').textContent = netBalance + ' درهم';
    document.getElementById('dashBalance').textContent = netBalance + ' درهم';
}

function saveTransaction() {
    const month = document.getElementById('transMonth').value;
    const type = document.getElementById('transType').value;
    const amount = parseFloat(document.getElementById('transAmount').value) || 0;
    const desc = document.getElementById('transDesc').value.trim();
    const fileInput = document.getElementById('transFile');
    
    if (amount <= 0 || !month) { showToast('المرجو إدخال المبلغ والشهر'); return; }
    
    let fileName = 'بدون مرفق';
    if(fileInput.files.length > 0) fileName = fileInput.files[0].name;

    let transactionObj = { month, type, amount, desc, fileName };
    transactionsList.push(transactionObj);
    archiveFinance.push(transactionObj);
    
    localStorage.setItem('tamda_transactions', JSON.stringify(transactionsList));
    localStorage.setItem('tamda_archive_finance', JSON.stringify(archiveFinance));

    if (type === 'income') totalIncome += amount; else totalExpense += amount;
    updateFinancialDashboard(); renderTransactions();
    
    document.getElementById('transAmount').value = ''; document.getElementById('transDesc').value = ''; fileInput.value = '';
    showToast('تم تسجيل العملية بنجاح وإضافتها للأرشيف الشهري');
}

function renderTransactions() {
    const container = document.getElementById('transactionsListContainer');
    container.innerHTML = '';
    if(transactionsList.length === 0) { container.innerHTML = '<p>لا توجد عمليات مسجلة.</p>'; return; }
    
    transactionsList.slice().reverse().forEach((t, index) => {
        let actualIndex = transactionsList.length - 1 - index;
        const div = document.createElement('div'); div.className = 'list-item';
        div.style.borderRightColor = t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)';
        div.innerHTML = `<div class="list-info"><strong style="color:${t.type === 'income' ? 'var(--accent-green)' : 'var(--danger-red)'}">${t.type === 'income' ? 'مدخول (+)' : 'مصروف (-)'} ${t.amount} درهم</strong><span>الوصف: ${t.desc} | الشهر: ${t.month} | المرفق: ${t.fileName}</span></div>
            <button class="action-btn" onclick="deleteTransaction(${actualIndex})">حذف</button>`;
        container.appendChild(div);
    });
}

function deleteTransaction(index) {
    if(confirm('حذف هذه العملية المالية؟')) {
        let t = transactionsList[index];
        if(t.type === 'income') totalIncome -= t.amount; else totalExpense -= t.amount;
        transactionsList.splice(index, 1);
        archiveFinance = archiveFinance.filter(f => !(f.month === t.month && f.amount === t.amount && f.desc === t.desc));
        localStorage.setItem('tamda_transactions', JSON.stringify(transactionsList));
        localStorage.setItem('tamda_archive_finance', JSON.stringify(archiveFinance));
        updateFinancialDashboard(); renderTransactions();
    }
}

function calculateBill() {
    const counterNum = document.getElementById('counterNum').value || 'غير محدد';
    const subName = document.getElementById('subscriberName').value || 'غير محدد';
    const billingMonth = document.getElementById('billingMonth').value || 'غير محدد';
    const prev = parseFloat(document.getElementById('prevReading').value) || 0;
    const curr = parseFloat(document.getElementById('currReading').value) || 0;
    const delayMonths = parseInt(document.getElementById('delayMonths').value) || 0;

    if (!document.getElementById('counterNum').value) { showToast('أدخل رقم العداد'); return; }
    if (curr < prev) { showToast('القراءة الحالية أقل من السابقة!'); return; }

    const consumption = curr - prev;
    let t1_cons = 0, t2_cons = 0, t3_cons = 0;
    if (consumption <= 15) { t1_cons = consumption; } else if (consumption <= 20) { t1_cons = 15; t2_cons = consumption - 15; } else { t1_cons = 15; t2_cons = 5; t3_cons = consumption - 20; }

    const t1_cost = t1_cons * appSettings.tier1, t2_cost = t2_cons * appSettings.tier2, t3_cost = t3_cons * appSettings.tier3;
    const consumptionCost = t1_cost + t2_cost + t3_cost;
    
    document.getElementById('row-t1').style.display = t1_cons > 0 ? 'flex' : 'none'; document.getElementById('t1-val').textContent = `${t1_cons} m³ = ${t1_cost} درهم`;
    document.getElementById('row-t2').style.display = t2_cons > 0 ? 'flex' : 'none'; document.getElementById('t2-val').textContent = `${t2_cons} m³ = ${t2_cost} درهم`;
    document.getElementById('row-t3').style.display = t3_cons > 0 ? 'flex' : 'none'; document.getElementById('t3-val').textContent = `${t3_cons} m³ = ${t3_cost} درهم`;

    let penaltyCost = 0;
    if (delayMonths >= 2) { penaltyCost = appSettings.penalty; document.getElementById('penaltyRow').style.display = 'flex'; document.getElementById('printPenalty').textContent = penaltyCost + ' درهم'; } 
    else { document.getElementById('penaltyRow').style.display = 'none'; }

    currentBillTotal = consumptionCost + appSettings.maintenance + penaltyCost;

    document.getElementById('printMonth').textContent = billingMonth; document.getElementById('printName').textContent = subName;
    document.getElementById('printCounter').textContent = counterNum; document.getElementById('printPrev').textContent = prev;
    document.getElementById('printCurr').textContent = curr; document.getElementById('printMaintenance').textContent = appSettings.maintenance + ' درهم';
    document.getElementById('consumptionResult').textContent = consumption + ' m³'; document.getElementById('consumptionPriceResult').textContent = consumptionCost + ' درهم';
    document.getElementById('totalPriceResult').textContent = currentBillTotal + ' درهم';
    
    document.getElementById('billResult').style.display = 'block'; showToast('تم الحساب بنجاح');
}

function saveBill(isPaid) {
    if(currentBillTotal > 0) {
        const counterInput = document.getElementById('counterNum').value.trim();
        const subNameStr = document.getElementById('subscriberName').value || 'غير محدد';
        const curr = parseFloat(document.getElementById('currReading').value) || 0;
        const currentMonth = document.getElementById('billingMonth').value;
        const subIndex = subscribers.findIndex(s => s.counter == counterInput);
        
        // أرشفة الفاتورة في جدول الفواتير المجمع شهرياً
        archiveBills.push({
            month: currentMonth,
            counter: counterInput,
            name: subNameStr,
            total: currentBillTotal,
            status: isPaid ? 'خالصة' : 'دين'
        });
        localStorage.setItem('tamda_archive_bills', JSON.stringify(archiveBills));

        if (subIndex > -1) {
            subscribers[subIndex].lastReading = curr;
            subscribers[subIndex].lastBilledMonth = currentMonth;
            if (isPaid) {
                subscribers[subIndex].delayMonths = 0; subscribers[subIndex].debtAmount = 0; 
                totalIncome += currentBillTotal;
                let billsIncome = parseFloat(localStorage.getItem('tamda_bills_income')) || 0;
                localStorage.setItem('tamda_bills_income', billsIncome + currentBillTotal);
                showToast('تم حفظ الفاتورة كـ (خالصة) بنجاح');
            } else {
                subscribers[subIndex].delayMonths = (subscribers[subIndex].delayMonths || 0) + 1;
                subscribers[subIndex].debtAmount = (subscribers[subIndex].debtAmount || 0) + currentBillTotal;
                showToast('تم تسجيل الفاتورة كـ (دين) بنجاح');
            }
            localStorage.setItem('tamda_subscribers', JSON.stringify(subscribers));
            renderSubscribers();
        } else {
            if (isPaid) { totalIncome += currentBillTotal; let billsIncome = parseFloat(localStorage.getItem('tamda_bills_income')) || 0; localStorage.setItem('tamda_bills_income', billsIncome + currentBillTotal); }
            showToast('تم الحفظ (مشترك غير مسجل في اللائحة)');
        }

        updateFinancialDashboard(); currentBillTotal = 0; document.getElementById('billResult').style.display = 'none';
        
        document.getElementById('currReading').value = '';
        let nextCounter = parseInt(counterInput);
        if (!isNaN(nextCounter)) { document.getElementById('counterNum').value = nextCounter + 1; }
        autoFillSubscriber();

    } else { showToast('يرجى حساب الفاتورة أولاً'); }
}
