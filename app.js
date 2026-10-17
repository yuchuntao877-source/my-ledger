(() => {
"use strict";
const KEY = "my-ledger-v1";
const $ = id => document.getElementById(id);
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthNow = () => today().slice(0,7);
const money = n => "¥" + Number(n||0).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const defaultState = () => ({
  records:[], loans:[], activities:[], budget:{}, recurring:[],
  accounts:[
    {id:"cash",name:"现金",initial:0},{id:"wechat",name:"微信",initial:0},
    {id:"alipay",name:"支付宝",initial:0},{id:"bank",name:"银行卡",initial:0}
  ],
  categories: {
    expense: ["餐饮","交通","购物","居家","住房","医疗","娱乐","学习","人情","旅行","通讯","其他"].map(n=>({name:n, icon:getDefaultIcon(n)})),
    income: ["工资","奖金","兼职","投资收益","红包","退款","其他收入"].map(n=>({name:n, icon:getDefaultIcon(n)}))
  },
  settings: { pin: "", themeColor: "blue", fontFamily: "default", fontColor: "default" }
});

function getDefaultIcon(name) {
  const icons = {"餐饮":"🍜","交通":"🚇","购物":"🛍️","居家":"🏠","住房":"🏡","医疗":"💊","娱乐":"🎮","学习":"📚","人情":"🎁","旅行":"✈️","通讯":"📱","其他":"🧾","工资":"💼","奖金":"🎉","兼职":"🧑‍💻","投资收益":"📈","红包":"🧧","退款":"↩️","其他收入":"💰","转账":"↔️","借出":"💸","借入":"🤝","活动":"🎯"};
  return icons[name] || "📌";
}

let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || defaultState(); } catch { state=defaultState(); }
if (!Array.isArray(state.records)) state.records = [];
if (!Array.isArray(state.loans)) state.loans = [];
if (!Array.isArray(state.activities)) state.activities = [];
if (!Array.isArray(state.recurring)) state.recurring = [];
if (!state.budget || typeof state.budget !== "object") state.budget = {};
if (!Array.isArray(state.accounts) || !state.accounts.length) state.accounts = defaultState().accounts;
if (!state.categories) state.categories = defaultState().categories;
if (!state.settings) state.settings = { pin: "" };
if (!state.settings.themeColor) state.settings.themeColor = "blue";
if (!state.settings.fontFamily) state.settings.fontFamily = "default";
if (!state.settings.fontColor) state.settings.fontColor = "default";

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('#themeColors .theme-btn').forEach(b => b.classList.toggle('active', b.dataset.color === theme));
}

function applyFont(family) {
  document.documentElement.setAttribute('data-font', family);
  if ($("fontFamilySelect")) $("fontFamilySelect").value = family;
}

function applyFontColor(color) {
  document.documentElement.setAttribute('data-text', color);
  document.querySelectorAll('#textColors .theme-btn').forEach(b => b.classList.toggle('active', b.dataset.text === color));
}

function backupState() { try { localStorage.setItem(KEY + "_backup", localStorage.getItem(KEY) || ""); } catch(e){} }
function save(){ backupState(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){ toast("保存失败"); } }
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove("show"),2300); }

function getIcon(name) { return [...state.categories.expense, ...state.categories.income].find(c => c.name === name)?.icon || getDefaultIcon(name); }
function accountName(id) { return state.accounts.find(a=>a.id===id)?.name || "已删除"; }

function renderAccountsSelect() {
  const options = state.accounts.map(a=>`<option value="${safe(a.id)}">${safe(a.name)}</option>`).join("");
  $("account").innerHTML = options; $("toAccount").innerHTML = options;
  if($("editAccount")) $("editAccount").innerHTML = options;
}

function renderCategories() {
  const type = document.querySelector(".type-btn.active")?.dataset.type || "expense";
  const cats = type === "income" ? state.categories.income : type === "transfer" ? [{name:"转账"}] : state.categories.expense;
  $("category").innerHTML = cats.map(c=>`<option value="${safe(c.name)}">${safe(c.name)}</option>`).join("");
  $("transferFields").classList.toggle("hidden", type !== "transfer");
  $("category").disabled = type === "transfer";
  $("saveRecord").textContent = type === "transfer" ? "保存转账" : type === "income" ? "保存收入" : "保存支出";
  if($("editCategory")) $("editCategory").innerHTML = [...state.categories.expense, ...state.categories.income].map(c=>`<option value="${safe(c.name)}">${safe(c.name)}</option>`).join("");
}

function go(page) {
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
  if (page === "budget") renderBudgetPage();
  if (page === "activities") renderActivities();
  if (page === "loans") renderLoans();
  window.scrollTo({top:0,behavior:"smooth"});
}

function calcNetWorth() {
  const accountBals = state.accounts.reduce((sum, a) => {
    let bal = Number(a.initial) || 0;
    state.records.forEach(r => {
      const amt = Number(r.amount) || 0;
      if(r.type==="income"&&r.accountId===a.id) bal+=amt;
      if(r.type==="expense"&&r.accountId===a.id) bal-=amt;
      if(r.type==="transfer"){ if(r.accountId===a.id) bal-=amt; if(r.toAccountId===a.id) bal+=amt; }
    });
    return sum + bal;
  }, 0);
  const lent = state.loans.filter(l=>l.type==="lent").reduce((s,l)=>s + Math.max(0, l.amount-(l.repaid||0)), 0);
  const borrowed = state.loans.filter(l=>l.type==="borrowed").reduce((s,l)=>s + Math.max(0, l.amount-(l.repaid||0)), 0);
  return accountBals + lent - borrowed;
}

function formatDateLabel(dateStr) {
  const dateObj = new Date(dateStr);
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const week = `周${days[dateObj.getDay()]}`;
  const td = today();
  const d = new Date(td); d.setDate(d.getDate() - 1);
  const yd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  if (dateStr === td) return `今天 ${week}`;
  if (dateStr === yd) return `昨天 ${week}`;
  return `${dateStr.replace(/-/g, "/")} ${week}`;
}

function renderDateDivider(dateStr, dayRecords) {
  let inc = 0, exp = 0;
  dayRecords.forEach(r => {
    if(r.type === "income") inc += Number(r.amount);
    if(r.type === "expense") exp += Number(r.amount);
  });
  let summary = "";
  if (inc > 0 && exp > 0) summary = `支 ${money(exp)} / 收 ${money(inc)}`;
  else if (exp > 0) summary = `支出 ${money(exp)}`;
  else if (inc > 0) summary = `收入 ${money(inc)}`;
  else summary = "转账等";
  return `<div class="date-divider"><span class="date-label">${formatDateLabel(dateStr)}</span><span class="date-summary">${summary}</span></div>`;
}

function groupByDate(records) {
  const groups = {};
  records.forEach(r => { if (!groups[r.date]) groups[r.date] = []; groups[r.date].push(r); });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function recordHtml(r) {
  const isInc = r.type === "income", isTransfer = r.type === "transfer";
  const sign = isTransfer ? "↔" : isInc ? "+" : "−";
  const amountClass = isTransfer ? "" : isInc ? "income" : "expense";
  const details = isTransfer ? `${accountName(r.accountId)} → ${accountName(r.toAccountId)}` : `${accountName(r.accountId)}${r.note ? " · " + safe(r.note) : ""}`;
  const icon = getIcon(r.category);
  return `
  <div class="swipe-wrapper">
    <div class="swipe-content">
      <article class="record-item">
        <div class="record-icon ${isInc?'icon-income':isTransfer?'icon-transfer':'icon-expense'}">${icon}</div>
        <div class="record-main"><div class="record-name">${safe(r.category)}${r.note?` · ${safe(r.note)}`:""}</div><div class="record-meta">${safe(details)}</div></div>
        <div class="record-right"><div class="record-amount ${amountClass}">${sign}${money(r.amount)}</div></div>
      </article>
    </div>
    <div class="swipe-actions">
      <button class="swipe-btn edit" data-edit="${safe(r.id)}">编辑</button>
      <button class="swipe-btn delete" data-delete="${safe(r.id)}">删除</button>
    </div>
  </div>`;
}

function empty(msg){ return `<div class="empty-state">${safe(msg)}</div>`; }
function monthRecords(m){ return state.records.filter(r=>r.date.startsWith(m)); }
function sum(rows,type){ return rows.filter(r=>r.type===type).reduce((a,r)=>a+Number(r.amount),0); }

function renderHome() {
  const m = monthNow(), rows = monthRecords(m), inc = sum(rows,"income"), exp = sum(rows,"expense"), budget = Number(state.budget[m]||0);
  $("monthLabel").textContent = `${m.replace("-","年")}月概览`;
  $("monthBalance").textContent = money(inc - exp); $("monthIncome").textContent = money(inc); $("monthExpense").textContent = money(exp);
  $("netWorth").textContent = money(calcNetWorth());
  $("budgetText").textContent = budget ? `已用 ${money(exp)} / ${money(budget)}（${Math.round(exp/budget*100)}%）` : "尚未设置本月预算";
  $("budgetBar").style.width = budget ? `${Math.min(100,exp/budget*100)}%` : "0%";

  const recent = [...state.records].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created)).slice(0,15);
  if (recent.length === 0) { $("recentRecords").innerHTML = empty("还没有账单，记下第一笔吧"); }
  else {
    const grouped = groupByDate(recent);
    $("recentRecords").innerHTML = grouped.map(([date, dayRows]) => renderDateDivider(date, dayRows) + `<div class="record-list">` + dayRows.map(recordHtml).join("") + `</div>`).join("");
  }
}

function renderRecords() {
  const q = $("searchRecords").value.trim().toLowerCase(), m = $("filterMonth").value, type = $("filterType").value;
  const rows = [...state.records].filter(r => (!m || r.date.startsWith(m)) && (type === "all" || r.type === type) && (!q || [r.note, r.category, accountName(r.accountId)].join(" ").toLowerCase().includes(q))).sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
  if (rows.length === 0) { $("allRecords").innerHTML = empty("没有找到符合条件的账单"); }
  else {
    const grouped = groupByDate(rows);
    $("allRecords").innerHTML = grouped.map(([date, dayRows]) => renderDateDivider(date, dayRows) + `<div class="record-list">` + dayRows.map(recordHtml).join("") + `</div>`).join("");
  }
}

function renderStats() {
  const m = $("statsMonth").value || monthNow(), rows = monthRecords(m), inc = sum(rows,"income"), exp = sum(rows,"expense");
  $("statsIncome").textContent = money(inc); $("statsExpense").textContent = money(exp); $("statsBalance").textContent = money(inc - exp); $("statsCount").textContent = rows.length;

  const cats = {};
  rows.filter(r=>r.type==="expense").forEach(r => cats[r.category] = (cats[r.category]||0) + Number(r.amount));
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]), max = sorted[0]?.[1] || 1;
  $("categoryStats").innerHTML = sorted.length ? sorted.map(([name,val])=>`
    <div class="cat-row"><span>${getIcon(name)} ${safe(name)}</span><div class="cat-bar"><span style="width:${val/max*100}%"></span></div><span class="cat-value">${money(val)}</span></div>`).join("") : empty("本月暂无支出记录");

  const days = new Date(Number(m.slice(0,4)), Number(m.slice(5,7)), 0).getDate();
  const daily = Array.from({length:days}, (_,i)=>({ day: i+1, val: rows.filter(r=>r.type==="expense" && Number(r.date.slice(8,10))===i+1).reduce((a,r)=>a+Number(r.amount),0) }));
  const maxDay = Math.max(...daily.map(d=>d.val), 1);
  $("dailyStats").innerHTML = daily.map(d=>`<div class="day-column" title="${d.day}日 ${money(d.val)}"><div class="day-bar" style="height:${Math.max(d.val?4:2, d.val/maxDay*100)}%"></div><span class="day-label">${d.day%5===1 || d.day===days ? d.day : ""}</span></div>`).join("");
}

function renderBudgetPage() {
  const m = monthNow(), b = Number(state.budget[m]||0), spent = sum(monthRecords(m),"expense");
  $("budgetAmount").value = b || ""; $("budgetSpent").textContent = money(spent);
  $("budgetRemaining").textContent = b ? money(b - spent) : "尚未设置";
}

function renderActivityCalc() {
  const total = Number($("activityTotal").value || 0), people = Number($("activityPeople").value || 0), extra = Number($("activityExtra").value || 0);
  const per = people > 0 ? total / people : 0, due = total + extra, perWithExtra = people > 0 ? due / people : 0;
  $("activityPerPerson").textContent = money(per); $("activityDue").textContent = money(due); $("activityPerWithExtra").textContent = money(perWithExtra);
}

function activityHtml(a) {
  const total = Number(a.total)||0, people = Number(a.people)||0, extra = Number(a.extra)||0;
  const per = people>0 ? total/people : 0, due = total + extra, perWithExtra = people>0 ? due/people : 0;
  return `<article class="record-item">
    <div class="record-icon icon-activity">🎯</div>
    <div class="record-main"><div class="record-name">${safe(a.name)}</div><div class="record-meta">${safe(a.date)} · ${people} 人 · 每人 ${money(per)} · 额外收 ${money(extra)}<br>应收合计 ${money(due)} · 含额外人均 ${money(perWithExtra)}${a.note?` · ${safe(a.note)}`:""}</div></div>
    <div class="record-right"><div class="record-amount">${money(total)}</div><div class="record-actions"><button class="mini-action delete" data-activity-delete="${safe(a.id)}">删除</button></div></div>
  </article>`;
}

function renderActivities() {
  const rows = [...state.activities].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
  $("activityList").innerHTML = rows.length ? rows.map(activityHtml).join("") : empty("还没有活动费用记录");
}

function renderLoans() {
  const rows = [...state.loans].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
  $("loanList").innerHTML = rows.length ? rows.map(l=>`
    <article class="record-item">
      <div class="record-icon icon-loan">${l.type==="lent"?"↗️":"↙️"}</div>
      <div class="record-main"><div class="record-name">${l.type==="lent"?"借给":"向"} ${safe(l.person)}</div><div class="record-meta">${safe(l.date)}${l.note?" · "+safe(l.note):""}<br>已还 ${money(l.repaid||0)} · 剩余 ${money(Math.max(0, l.amount-(l.repaid||0)))}</div></div>
      <div class="record-right"><div class="record-amount">${money(l.amount)}</div><div class="record-actions"><button class="mini-action" data-loan-repay="${safe(l.id)}">登记还款</button><button class="mini-action delete" data-loan-delete="${safe(l.id)}">删除</button></div></div>
    </article>`).join("") : empty("还没有借款或还款记录");
}

function renderAll() {
  renderAccountsSelect(); renderCategories(); renderHome();
  renderRecords(); renderStats(); renderBudgetPage();
  renderActivities(); renderLoans();
}

function download(name, content, type) {
  const blob = new Blob(["\ufeff", content], {type}); const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function exportJson() { download(`我的账本备份-${today()}.json`, JSON.stringify({version:2, state}, null, 2), "application/json;charset=utf-8"); }
function exportCsv() {
  const header = ["日期","类型","分类","金额","账户","转入账户","备注"];
  const rows = state.records.map(r => [r.date,{expense:"支出",income:"收入",transfer:"转账"}[r.type]||r.type,r.category,r.amount,accountName(r.accountId),r.toAccountId?accountName(r.toAccountId):"",r.note||""]);
  download(`我的账单-${today()}.csv`, [header,...rows].map(row=>row.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}
function exportExcel() {
  let html = '<html><head><meta charset="utf-8"></head><body><table border="1">';
  html += '<tr><th>日期</th><th>类型</th><th>分类</th><th>金额</th><th>账户</th><th>备注</th></tr>';
  state.records.forEach(r => { html += `<tr><td>${r.date}</td><td>${{expense:"支出",income:"收入",transfer:"转账"}[r.type]||r.type}</td><td>${r.category}</td><td>${r.amount}</td><td>${accountName(r.accountId)}</td><td>${r.note||""}</td></tr>`; });
  html += '</table></body></html>';
  download(`我的账单-${today()}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
}
function exportActivitiesCsv() {
  const header = ["日期","活动名称","总金额","人数","每人AA","额外收取","应收合计","含额外人均","备注"];
  const rows = state.activities.map(a => {
    const total = Number(a.total)||0, people = Number(a.people)||0, extra = Number(a.extra)||0;
    const per = people>0?total/people:0, due = total+extra, perWithExtra = people>0?due/people:0;
    return [a.date,a.name,total,people,Math.round(per*100)/100,extra,Math.round(due*100)/100,Math.round(perWithExtra*100)/100,a.note||""];
  });
  download(`我的活动-${today()}.csv`, [header,...rows].map(row=>row.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

function checkRecurring() {
  const td = today(); let changed = false;
  state.recurring.forEach(rule => {
    while (rule.nextDate <= td) {
      state.records.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()), type: rule.type, amount: rule.amount, category: rule.category, accountId: rule.accountId, date: rule.nextDate, note: `[自动]${rule.note}`, created: Date.now() });
      const d = new Date(rule.nextDate);
      if (rule.freq === "daily") d.setDate(d.getDate() + 1);
      if (rule.freq === "weekly") d.setDate(d.getDate() + 7);
      if (rule.freq === "monthly") d.setMonth(d.getMonth() + 1);
      rule.nextDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      changed = true;
    }
  });
  if (changed) save();
}

let currentPin = "";
function renderDots() { const dots = $("pinDots").children; for(let i=0; i<4; i++) dots[i].classList.toggle("filled", i < currentPin.length); }
function checkPinLock() { if (state.settings.pin) { $("lockScreen").classList.remove("hidden"); currentPin = ""; renderDots(); } else { $("lockScreen").classList.add("hidden"); } }

let calcExpr = "", calcTargetInput = null;
function openKeypad(inputEl) { calcTargetInput = inputEl; calcExpr = inputEl.value !== "" ? inputEl.value : "0"; $("keypadExpr").textContent = calcExpr; $("customKeypad").classList.remove("hidden"); }
function closeKeypad() {
  let finalVal = calcExpr;
  try { if (/[+\-*/]/.test(calcExpr) || calcExpr.includes("×") || calcExpr.includes("÷")) { const safeExpr = calcExpr.replace(/×/g,"*").replace(/÷/g,"/").replace(/[^0-9+\-*/.()]/g,""); finalVal = String(eval(safeExpr)); } } catch { finalVal = calcExpr; }
  const num = Number(finalVal); calcTargetInput.value = isNaN(num) ? "" : Math.round(num*100)/100; $("customKeypad").classList.add("hidden");
}

document.querySelectorAll(".tab,[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
document.querySelectorAll(".type-btn").forEach(b=>b.addEventListener("click",()=>{
  if (b.dataset.cattype) return;
  document.querySelectorAll(".type-btn").forEach(x=>x.classList.toggle("active",x===b)); renderCategories();
}));

// 拦截双击放大
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, false);

// 颜色、字体、字体颜色切换
if($("themeColors")) {
  $("themeColors").addEventListener("click", e => {
    const btn = e.target.closest(".theme-btn");
    if (btn) { state.settings.themeColor = btn.dataset.color; save(); applyTheme(btn.dataset.color); }
  });
}
if($("fontFamilySelect")) {
  $("fontFamilySelect").addEventListener("change", e => {
    state.settings.fontFamily = e.target.value; save(); applyFont(e.target.value);
  });
}
if($("textColors")) {
  $("textColors").addEventListener("click", e => {
    const btn = e.target.closest(".theme-btn");
    if (btn) { state.settings.fontColor = btn.dataset.text; save(); applyFontColor(btn.dataset.text); }
  });
}

$("recordDate").value = today(); $("loanDate").value = today(); $("activityDate").value = today();
$("filterMonth").value = monthNow(); $("statsMonth").value = monthNow();
$("amount").addEventListener("focus", e => { e.target.blur(); openKeypad(e.target); });

$("recordForm").addEventListener("submit", e => {
  e.preventDefault(); const type = document.querySelector(".type-btn.active").dataset.type; const amount = Number($("amount").value);
  if (!Number.isFinite(amount) || amount <= 0) return toast("请输入大于 0 的金额");
  const accountId = $("account").value, toAccountId = $("toAccount").value;
  if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return toast("请选择不同的转出和转入账户");
  const r = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()), type, amount: Math.round(amount*100)/100, category: type === "transfer" ? "转账" : $("category").value, accountId, date: $("recordDate").value, note: $("note").value.trim(), created: Date.now() };
  if (type === "transfer") r.toAccountId = toAccountId;
  state.records.push(r);
  const freq = $("recurringFreq").value;
  if (freq !== "none") {
    const d = new Date(r.date); if (freq === "daily") d.setDate(d.getDate() + 1); if (freq === "weekly") d.setDate(d.getDate() + 7); if (freq === "monthly") d.setMonth(d.getMonth() + 1);
    state.recurring.push({ ...r, id: "rec-"+Date.now(), freq, nextDate: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` });
  }
  save(); $("amount").value = ""; $("note").value = ""; $("recordDate").value = today(); $("recurringFreq").value = "none"; renderAll(); toast("已保存");
});

let editingRecordId = null;
function openEditDialog(id) {
  const r = state.records.find(x=>x.id===id); if (!r) return;
  editingRecordId = id; $("editId").value = id; $("editAmount").value = r.amount; $("editCategory").value = r.category; $("editAccount").value = r.accountId; $("editDate").value = r.date; $("editNote").value = r.note || ""; $("editDialog").showModal();
}
$("editForm").addEventListener("submit", e => {
  e.preventDefault(); const r = state.records.find(x=>x.id===editingRecordId); if (!r) return;
  r.amount = Math.round(Number($("editAmount").value)*100)/100; r.category = $("editCategory").value; r.accountId = $("editAccount").value; r.date = $("editDate").value; r.note = $("editNote").value.trim();
  save(); renderAll(); $("editDialog").close(); toast("已更新");
});

document.addEventListener("click", e => {
  const del = e.target.closest("[data-delete]"); if (del) { const r = state.records.find(x=>x.id===del.dataset.delete); if (r && confirm(`确定删除这笔 ${money(r.amount)} 吗？`)) { state.records = state.records.filter(x=>x.id!==r.id); save(); renderAll(); toast("已删除"); } return; }
  const edit = e.target.closest("[data-edit]"); if (edit) { openEditDialog(edit.dataset.edit); return; }
  const actDel = e.target.closest("[data-activity-delete]"); if (actDel) { const a = state.activities.find(x=>x.id===actDel.dataset.activityDelete); if (a && confirm(`确定删除活动“${a.name}”吗？`)) { state.activities = state.activities.filter(x=>x.id!==a.id); save(); renderActivities(); toast("已删除"); } return; }
  const ld = e.target.closest("[data-loan-delete]"); if (ld) { if (confirm("确定删除这条借还记录吗？")) { state.loans = state.loans.filter(l=>l.id!==ld.dataset.loanDelete); save(); renderLoans(); toast("已删除"); } return; }
  const repay = e.target.closest("[data-loan-repay]"); if (repay) { const l = state.loans.find(x=>x.id===repay.dataset.loanRepay); if (!l) return; const v = prompt("输入还款金额（不自动记账）", Math.max(0, l.amount-(l.repaid||0)).toFixed(2)); if (v === null) return; const n = Number(v); if (!Number.isFinite(n) || n <= 0 || n > l.amount-(l.repaid||0)+0.001) return toast("金额无效"); l.repaid = (l.repaid||0) + n; save(); renderLoans(); toast("已登记还款"); return; }
});

$("searchRecords").addEventListener("input", renderRecords);
$("filterMonth").addEventListener("change", renderRecords);
$("filterType").addEventListener("change", renderRecords);
$("statsMonth").addEventListener("change", renderStats);
$("budgetForm").addEventListener("submit", e => { e.preventDefault(); const v = Number($("budgetAmount").value); if (v < 0 || !Number.isFinite(v)) return toast("请输入有效预算"); state.budget[monthNow()] = Math.round(v*100)/100; save(); renderAll(); toast("预算已保存"); });

["activityTotal","activityPeople","activityExtra"].forEach(id => $(id).addEventListener("input", renderActivityCalc));
renderActivityCalc();

$("activityForm").addEventListener("submit", e => {
  e.preventDefault(); const name = $("activityName").value.trim(); const total = Number($("activityTotal").value); const people = Number($("activityPeople").value); const extra = Number($("activityExtra").value || 0);
  if (!name) return toast("请填写活动名称"); if (!Number.isFinite(total) || total <= 0) return toast("请输入大于 0 的总金额"); if (!Number.isInteger(people) || people < 1) return toast("人数需为正整数");
  const due = total + extra; const act = { id: "act-"+Date.now(), name, date: $("activityDate").value, total: Math.round(total*100)/100, people, extra: Math.round(extra*100)/100, note: $("activityNote").value.trim(), created: Date.now() };
  state.activities.push(act);
  if ($("activityAutoRecord").checked) { state.records.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()), type: "income", amount: Math.round(due*100)/100, category: "活动", accountId: "wechat", date: act.date, note: `[活动自动] ${name}`, created: Date.now() }); }
  save(); $("activityName").value = ""; $("activityTotal").value = ""; $("activityPeople").value = ""; $("activityExtra").value = "0"; $("activityNote").value = ""; $("activityDate").value = today(); renderActivities(); renderActivityCalc(); renderHome(); toast("活动已添加");
});

$("loanForm").addEventListener("submit", e => {
  e.preventDefault(); const amount = Number($("loanAmount").value); if (amount <= 0) return toast("请输入有效金额"); const type = $("loanType").value, person = $("loanPerson").value.trim(), date = $("loanDate").value;
  state.loans.push({ id: "l-"+Date.now(), type, person, amount: Math.round(amount*100)/100, date, note: $("loanNote").value.trim(), created: Date.now(), repaid: 0 });
  if ($("loanAutoRecord").checked) { state.records.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()), type: type === "lent" ? "expense" : "income", amount: Math.round(amount*100)/100, category: type === "lent" ? "借出" : "借入", accountId: "cash", date, note: `[借还自动] ${person}`, created: Date.now() }); }
  save(); $("loanPerson").value = ""; $("loanAmount").value = ""; $("loanNote").value = ""; renderLoans(); renderHome(); toast("已添加借还记录");
});

$("exportCsv").addEventListener("click", exportCsv); $("exportExcel").addEventListener("click", exportExcel); $("exportJson").addEventListener("click", exportJson); $("settingsExport").addEventListener("click", exportJson); $("exportActivities").addEventListener("click", exportActivitiesCsv); $("settingsBtn").addEventListener("click", ()=>go("settings"));

$("importJson").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const obj = JSON.parse(await f.text()); if (!obj.state || !Array.isArray(obj.state.records)) throw new Error(); if (!confirm("恢复备份会覆盖当前数据，继续吗？")) return; state = obj.state; if (!state.categories) state.categories = defaultState().categories; if (!state.accounts.length) state.accounts = defaultState().accounts; if (!state.settings) state.settings = {pin:""}; if (!state.settings.themeColor) state.settings.themeColor = "blue"; if (!state.settings.fontFamily) state.settings.fontFamily = "default"; if (!state.settings.fontColor) state.settings.fontColor = "default"; save(); renderAll(); applyTheme(state.settings.themeColor); applyFont(state.settings.fontFamily); applyFontColor(state.settings.fontColor); checkPinLock(); toast("恢复成功"); } catch { toast("恢复失败：文件格式不正确"); } finally { e.target.value = ""; }
});

$("restoreBackupBtn").addEventListener("click", () => { const bak = localStorage.getItem(KEY + "_backup"); if (!bak) return toast("没有找到历史版本"); if (confirm("将恢复到上一次保存前的状态，当前改动会丢失。确定吗？")) { try { state = JSON.parse(bak); if (!state.settings.themeColor) state.settings.themeColor = "blue"; if (!state.settings.fontFamily) state.settings.fontFamily = "default"; if (!state.settings.fontColor) state.settings.fontColor = "default"; save(); renderAll(); applyTheme(state.settings.themeColor); applyFont(state.settings.fontFamily); applyFontColor(state.settings.fontColor); toast("已恢复历史版本"); } catch { toast("恢复失败"); } } });
$("clearAll").addEventListener("click", () => { if (confirm("彻底清空所有数据？此操作不可撤销！")) { if (confirm("建议先导出备份。仍要清空吗？")) { state = defaultState(); save(); renderAll(); applyTheme("blue"); applyFont("default"); applyFontColor("default"); go("home"); toast("已清空"); } } });

let currentCatType = "expense";
function renderCatManage() { const list = state.categories[currentCatType]; $("catList").innerHTML = list.map((c, i) => `<div class="cat-manage-item"><span>${c.icon} ${c.name}</span><button type="button" class="mini-action delete" data-delcat="${i}">删除</button></div>`).join(""); }
document.querySelectorAll("#catDialog [data-cattype]").forEach(b => b.addEventListener("click", () => { document.querySelectorAll("#catDialog [data-cattype]").forEach(x=>x.classList.toggle("active", x===b)); currentCatType = b.dataset.cattype; renderCatManage(); }));
$("manageCatsBtn").addEventListener("click", () => { renderCatManage(); $("catDialog").showModal(); });
$("addCatBtn").addEventListener("click", () => { const name = $("newCatName").value.trim(), icon = $("newCatIcon").value.trim() || "📌"; if (!name) return toast("请输入名称"); if (state.categories[currentCatType].some(c=>c.name===name)) return toast("已存在"); state.categories[currentCatType].push({name, icon}); save(); renderCatManage(); renderAll(); $("newCatName").value=""; $("newCatIcon").value=""; });
$("catList").addEventListener("click", e => { const btn = e.target.closest("[data-delcat]"); if (btn) { if (confirm("删除后已使用该分类的账单不会消失，但将无法选择。确定吗？")) { state.categories[currentCatType].splice(Number(btn.dataset.delcat), 1); save(); renderCatManage(); renderAll(); } } });

$("setPinBtn").addEventListener("click", () => { const p = prompt("请输入新的 4 位数字密码："); if (p === null) return; if (!/^\d{4}$/.test(p)) return toast("必须是 4 位数字"); state.settings.pin = p; save(); toast("密码已设置"); });
$("removePinBtn").addEventListener("click", () => { state.settings.pin = ""; save(); toast("密码锁已关闭"); });
$("pinPad").addEventListener("click", e => { const btn = e.target.closest("button"); if (!btn) return; const num = btn.dataset.num; if (num === "del") { currentPin = currentPin.slice(0, -1); renderDots(); } else if (num === "ok") { if (currentPin === state.settings.pin) $("lockScreen").classList.add("hidden"); else { toast("密码错误"); currentPin = ""; renderDots(); } } else if (currentPin.length < 4) { currentPin += num; renderDots(); } });

$("customKeypad").addEventListener("click", e => {
  const btn = e.target.closest("button"); if (!btn) return; if (btn.id === "keypadDone") return closeKeypad();
  const k = btn.dataset.k;
  if (k === "del") calcExpr = calcExpr.slice(0, -1) || "0"; else if (k === "clear") calcExpr = "0";
  else if (k === "=") { try { const safeExpr = calcExpr.replace(/×/g,"*").replace(/÷/g,"/").replace(/[^0-9+\-*/.()]/g,""); calcExpr = String(eval(safeExpr)); } catch { toast("表达式错误"); } }
  else { if (calcExpr === "0" && !/[+\-*/.]/.test(k)) calcExpr = k; else calcExpr += k; }
  $("keypadExpr").textContent = calcExpr;
});

checkRecurring();
renderAll();
applyTheme(state.settings.themeColor);
applyFont(state.settings.fontFamily);
applyFontColor(state.settings.fontColor);
checkPinLock();
})();