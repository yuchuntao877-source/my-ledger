(() => {
"use strict";
const KEY = "my-ledger-v2"; // 升级存储键，强制拉新默认配置
const $ = id => document.getElementById(id);
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthNow = () => today().slice(0,7);
const money = n => "¥" + Number(n||0).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const defaultState = () => ({
  records:[], loans:[], activities:[], budget:{}, recurring:[],
  accounts: [
    {id:"wechat", name:"微信", initial:0},
    {id:"meituan", name:"美团", initial:0},
    {id:"douyin", name:"抖音", initial:0},
    {id:"xianyu", name:"闲鱼", initial:0},
    {id:"jd", name:"京东", initial:0},
    {id:"pdd", name:"拼多多", initial:0},
    {id:"taobao", name:"淘宝", initial:0},
    {id:"cash", name:"现金", initial:0}
  ],
  categories: {
    expense: ["餐饮","交通","购物","居家","住房","医疗","娱乐","学习","人情","旅行","通讯","其他"].map(n=>({name:n, icon:getDefaultIcon(n)})),
    income: ["工资","奖金","兼职","投资收益","红包","退款","其他收入"].map(n=>({name:n, icon:getDefaultIcon(n)}))
  },
  settings: { pin: "", themeColor: "blue", fontFamily: "default", fontColor: "default", customTheme: "#4a7ce0", customText: "#1d2738" }
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
if (!state.settings.customTheme) state.settings.customTheme = "#4a7ce0";
if (!state.settings.customText) state.settings.customText = "#1d2738";

const FONTS = [
  { id: "default",   name: "系统默认（清爽黑体）",       stack: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: "round",     name: "圆润幼圆（可爱风）",         stack: '"Yuanti SC", "YouYuan", "Quicksand", "PingFang SC", sans-serif' },
  { id: "serif",     name: "优雅衬线（宋体/阅读风）",     stack: '"Songti SC", "SimSun", Georgia, serif' },
  { id: "mono",      name: "数字等宽（极客风）",         stack: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace' },
  { id: "kaiti",     name: "楷体（书写风）",             stack: '"Kaiti SC", "KaiTi", "STKaiti", "楷体", serif' },
  { id: "fangsong",  name: "仿宋（公文风）",             stack: '"FangSong", "STFangsong", "仿宋", serif' },
  { id: "heiti",     name: "黑体（醒目风）",             stack: '"Heiti SC", "SimHei", "黑体", sans-serif' },
  { id: "yahei",     name: "微软雅黑",                   stack: '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif' },
  { id: "pingfang",  name: "苹方（现代 iOS）",           stack: '"PingFang SC", "苹方-简", "Helvetica Neue", sans-serif' },
  { id: "hiragino",  name: "冬青黑体",                   stack: '"Hiragino Sans GB", "冬青黑体简体中文", sans-serif' },
  { id: "dengxian",  name: "等线（清爽细体）",           stack: '"DengXian", "等线", "Microsoft YaHei", sans-serif' },
  { id: "lanting",   name: "兰亭黑",                     stack: '"Lantinghei SC", "兰亭黑", sans-serif' },
  { id: "xingkai",   name: "华文行楷（书法风）",         stack: '"STXingkai", "Xingkai SC", "华文行楷", "KaiTi", serif' },
  { id: "lishu",     name: "华文隶书",                   stack: '"STLiti", "LiSu", "华文隶书", serif' },
  { id: "helvetica", name: "Helvetica（经典无衬线）",    stack: 'Helvetica, "Helvetica Neue", Arial, sans-serif' },
  { id: "arial",     name: "Arial",                      stack: 'Arial, Helvetica, sans-serif' },
  { id: "verdana",   name: "Verdana（易读）",            stack: 'Verdana, Geneva, sans-serif' },
  { id: "georgia",   name: "Georgia（英文衬线）",        stack: 'Georgia, "Times New Roman", serif' },
  { id: "times",     name: "Times New Roman",            stack: '"Times New Roman", Times, serif' },
  { id: "trebuchet", name: "Trebuchet MS",               stack: '"Trebuchet MS", Tahoma, sans-serif' },
  { id: "courier",   name: "Courier New（打字机）",      stack: '"Courier New", Courier, monospace' },
  { id: "impact",    name: "Impact（粗标题）",           stack: 'Impact, "Arial Black", sans-serif' },
  { id: "comic",     name: "Comic Sans MS",              stack: '"Comic Sans MS", "Chalkboard SE", cursive' },
  { id: "cursive",   name: "手写体",                     stack: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' }
];

const PRESET_THEME_HEX = { blue:"#4a7ce0", green:"#10b981", purple:"#8b5cf6", orange:"#f97316", pink:"#ec4899", red:"#ef4444", teal:"#14b8a6", indigo:"#6366f1", amber:"#f59e0b", dark:"#334155" };
const INK_MAP = { default:"#1d2738", black:"#000000", gray:"#4b5563", brown:"#5c4033", blue:"#1e3a8a" };
const clampPct = v => Math.max(6, Math.min(92, v));
const isHex = h => /^#[0-9a-f]{6}$/i.test(h || "");

function hexToHsl(hex) {
  const h6 = String(hex || "").replace("#", "");
  let r=0,g=0,b=0;
  if (h6.length===3){ r=parseInt(h6[0]+h6[0],16); g=parseInt(h6[1]+h6[1],16); b=parseInt(h6[2]+h6[2],16); }
  else if (h6.length===6){ r=parseInt(h6.slice(0,2),16); g=parseInt(h6.slice(2,4),16); b=parseInt(h6.slice(4,6),16); }
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0,s=0,l=(max+min)/2;
  if (max!==min){
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h*=60;
  }
  return { h:Math.round(h), s:Math.round(s*100), l:Math.round(l*100) };
}

function initFontSelect() {
  const sel = $("fontFamilySelect");
  if (!sel) return;
  sel.innerHTML = FONTS.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
  sel.value = state.settings.fontFamily || "default";
}

function applyTheme(theme, customHex) {
  const root = document.documentElement;
  const custom = theme === "custom" && isHex(customHex);
  const effective = (theme === "custom" && !custom) ? "blue" : (theme || "blue");
  if (custom) {
    const c = hexToHsl(customHex);
    root.removeAttribute("data-theme");
    root.style.setProperty("--c-primary", `hsl(${c.h}, ${c.s}%, ${c.l}%)`);
    root.style.setProperty("--c-hero",
      `linear-gradient(135deg, hsl(${c.h},${c.s}%,${clampPct(c.l-16)}%) 0%, hsl(${c.h},${c.s}%,${c.l}%) 50%, hsl(${c.h},${c.s}%,${clampPct(c.l+14)}%) 100%)`);
    root.style.setProperty("--c-btn",
      `linear-gradient(110deg, hsl(${c.h},${c.s}%,${clampPct(c.l-8)}%), hsl(${c.h},${c.s}%,${clampPct(c.l+10)}%))`);
  } else {
    root.style.removeProperty("--c-primary");
    root.style.removeProperty("--c-hero");
    root.style.removeProperty("--c-btn");
    root.setAttribute("data-theme", effective);
  }
  document.querySelectorAll("#themeColors .theme-btn").forEach(b =>
    b.classList.toggle("active", !custom && b.dataset.color === effective));
  const picker = $("customThemePicker");
  if (picker) picker.value = custom ? customHex : (PRESET_THEME_HEX[effective] || "#4a7ce0");
  const center = $("themeWheelCenter");
  if (center) center.style.background = custom ? customHex : (PRESET_THEME_HEX[effective] || "#4a7ce0");
}

function applyFont(family) {
  const f = FONTS.find(x => x.id === family) || FONTS[0];
  document.documentElement.style.setProperty("--font", f.stack);
  const sel = $("fontFamilySelect");
  if (sel) sel.value = f.id;
}

function applyFontColor(color, customHex) {
  const root = document.documentElement;
  const custom = color === "custom" && isHex(customHex);
  const effective = (color === "custom" && !custom) ? "default" : (color || "default");
  const hex = custom ? customHex : (INK_MAP[effective] || INK_MAP.default);
  root.style.setProperty("--ink", hex);
  root.removeAttribute("data-text");
  document.querySelectorAll("#textColors .theme-btn").forEach(b =>
    b.classList.toggle("active", !custom && b.dataset.text === effective));
  const picker = $("customTextPicker");
  if (picker) picker.value = hex;
  const center = $("textWheelCenter");
  if (center) center.style.background = hex;
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
  const days = ["日","一","二","三","四","五","六"];
  const week = `周${days[dateObj.getDay()]}`;
  const td = today();
  const d = new Date(td); d.setDate(d.getDate() - 1);
  const yd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  if (dateStr === td) return `今天 ${week}`;
  if (dateStr === yd) return `昨天 ${week}`;
  return `${dateStr.replace(/-/g, "/")} ${week}`;
}

function renderDateDivider(dateStr, dayRecords) {
  let inc=0, exp=0;
  dayRecords.forEach(r => { if(r.type==="income") inc+=Number(r.amount); if(r.type==="expense") exp+=Number(r.amount); });
  let summary = "";
  if (inc>0 && exp>0) summary = `支 ${money(exp)} / 收 ${money(inc)}`;
  else if (exp>0) summary = `支出 ${money(exp)}`;
  else if (inc>0) summary = `收入 ${money(inc)}`;
  else summary = "转账等";
  return `<div class="date-divider"><span class="date-label">${formatDateLabel(dateStr)}</span><span class="date-summary">${summary}</span></div>`;
}

function groupByDate(records) {
  const groups = {};
  records.forEach(r => { if (!groups[r.date]) groups[r.date] = []; groups[r.date].push(r); });
  return Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0]));
}

function recordHtml(r) {
  const isInc = r.type === "income", isTransfer = r.type === "transfer";
  const sign = isTransfer ? "↔" : isInc ? "+" : "−";
  const amountClass = isTransfer ? "" : isInc ? "income" : "expense";
  const details = isTransfer ? `${accountName(r.accountId)} → ${accountName(r.toAccountId)}` : `${accountName(r.accountId)}${r.note ? " · " + safe(r.note) : ""}`;
  const icon = getIcon(r.category);
  return `
  <article class="record-item">
    <div class="record-icon ${isInc?'icon-income':isTransfer?'icon-transfer':'icon-expense'}">${icon}</div>
    <div class="record-main">
      <div class="record-name">${safe(r.category)}${r.note?` · ${safe(r.note)}`:""}</div>
      <div class="record-meta">${safe(details)}</div>
    </div>
    <div class="record-right">
      <div class="record-amount ${amountClass}">${sign}${money(r.amount)}</div>
      <button class="more-btn" data-more="${safe(r.id)}" aria-label="操作">⋮</button>
    </div>
  </article>`;
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
  const daily = Array.from({length:days}, (_,i)=>({ day:i+1, val: rows.filter(r=>r.type==="expense" && Number(r.date.slice(8,10))===i+1).reduce((a,r)=>a+Number(r.amount),0) }));
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
  const total = Number(a.total) || 0, people = Number(a.people) || 0, extra = Number(a.extra) || 0;
  const per = people > 0 ? total / people : 0, due = total + extra;
  const received = Number(a.received) || 0;
  const remain = Math.max(0, due - received);
  const settled = remain <= 0.001;
  const history = (a.history || []).slice(-3);
  return `<article class="record-item">
    <div class="record-icon icon-activity">🎯</div>
    <div class="record-main">
      <div class="record-name">${safe(a.name)}${settled ? ' <span class="tag-done">已收齐</span>' : ''}</div>
      <div class="record-meta">${safe(a.date)} · ${people} 人 · 每人 ${money(per)} · 额外收 ${money(extra)}<br>
        应收 ${money(due)} · 已收 ${money(received)} · 未收 ${money(remain)}${a.note ? ' · ' + safe(a.note) : ''}</div>
      ${history.length ? `<div class="repay-history">${history.map(h => `<span>${safe(h.date)} ${money(h.amount)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="record-right">
      <div class="record-amount">${money(total)}</div>
      <div class="record-actions" style="display:flex;flex-direction:column;gap:5px;margin-top:5px">
        ${settled ? '' : `<button class="mini-action primary" style="background:none;border:none;color:var(--c-primary);font-size:10px;padding:0" data-activity-receive="${safe(a.id)}">快捷收款</button>`}
        <button class="mini-action delete" style="background:none;border:none;color:var(--red);font-size:10px;padding:0" data-activity-delete="${safe(a.id)}">删除</button>
      </div>
    </div>
  </article>`;
}

function renderActivities() {
  const rows = [...state.activities].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
  $("activityList").innerHTML = rows.length ? rows.map(activityHtml).join("") : empty("还没有活动费用记录");
}

function renderLoans() {
  const rows = [...state.loans].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
  $("loanList").innerHTML = rows.length ? rows.map(l => {
    const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
    const done = remain <= 0.001;
    const history = (l.history || []).slice(-3);
    return `<article class="record-item">
      <div class="record-icon icon-loan">${l.type === "lent" ? "↗️" : "↙️"}</div>
      <div class="record-main">
        <div class="record-name">${l.type === "lent" ? "借给" : "向"} ${safe(l.person)}${done ? ' <span class="tag-done">已结清</span>' : ''}</div>
        <div class="record-meta">${safe(l.date)}${l.note ? ' · ' + safe(l.note) : ''}<br>已还 ${money(l.repaid || 0)} · 剩余 ${money(remain)}</div>
        ${history.length ? `<div class="repay-history">${history.map(h => `<span>${safe(h.date)} ${money(h.amount)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="record-right">
        <div class="record-amount">${money(l.amount)}</div>
        <div class="record-actions" style="display:flex;flex-direction:column;gap:5px;margin-top:5px">
          ${done ? '' : `<button class="mini-action primary" style="background:none;border:none;color:var(--c-primary);font-size:10px;padding:0" data-loan-repay="${safe(l.id)}">快捷还款</button>`}
          <button class="mini-action delete" style="background:none;border:none;color:var(--red);font-size:10px;padding:0" data-loan-delete="${safe(l.id)}">删除</button>
        </div>
      </div>
    </article>`;
  }).join("") : empty("还没有借款或还款记录");
}

function renderAll() {
  renderAccountsSelect(); renderCategories(); renderHome();
  renderRecords(); renderStats(); renderBudgetPage();
  renderActivities(); renderLoans();
}

function openQuickDialog(mode, id) {
  $("quickMode").value = mode; $("quickId").value = id; $("quickDate").value = today();
  if (mode === "loan") {
    const l = state.loans.find(x => x.id === id); if (!l) return;
    const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
    $("quickTitle").textContent = l.type === "lent" ? `登记 ${l.person} 的还款` : `登记还给 ${l.person}`;
    $("quickAmount").value = remain ? remain.toFixed(2) : "";
    $("quickAutoRecord").checked = false;
    $("quickAutoLabel").textContent = l.type === "lent" ? "同时记一笔收入（钱已收回）" : "同时记一笔支出（钱已还出）";
    const chips = [];
    if (remain > 0) {
      chips.push(`<button type="button" class="quick-chip" data-amt="${remain.toFixed(2)}">全部结清 ${money(remain)}</button>`);
      if (remain > 0.01) chips.push(`<button type="button" class="quick-chip" data-amt="${(remain/2).toFixed(2)}">还一半 ${money(remain/2)}</button>`);
    }
    $("quickAmounts").innerHTML = chips.join("");
  } else {
    const a = state.activities.find(x => x.id === id); if (!a) return;
    const due = Number(a.total || 0) + Number(a.extra || 0);
    const remain = Math.max(0, due - Number(a.received || 0));
    $("quickTitle").textContent = `确认收款 · ${a.name}`;
    $("quickAmount").value = remain ? remain.toFixed(2) : "";
    $("quickAutoRecord").checked = true;
    $("quickAutoLabel").textContent = "同时记一笔收入账单";
    $("quickAmounts").innerHTML = remain > 0 ? `<button type="button" class="quick-chip" data-amt="${remain.toFixed(2)}">全部收齐 ${money(remain)}</button>` : "";
  }
  $("quickDialog").showModal();
}

$("quickAmounts").addEventListener("click", e => {
  const chip = e.target.closest("[data-amt]");
  if (chip) $("quickAmount").value = chip.dataset.amt;
});

$("quickForm").addEventListener("submit", e => {
  e.preventDefault();
  const mode = $("quickMode").value, id = $("quickId").value;
  const amt = Math.round(Number($("quickAmount").value) * 100) / 100;
  const date = $("quickDate").value, auto = $("quickAutoRecord").checked;
  if (!Number.isFinite(amt) || amt <= 0) return toast("请输入有效金额");
  if (!date) return toast("请选择日期");
  if (mode === "loan") {
    const l = state.loans.find(x => x.id === id); if (!l) return;
    const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
    if (amt > remain + 0.001) return toast("金额超过剩余未还金额");
    l.repaid = Math.round((Number(l.repaid || 0) + amt) * 100) / 100;
    (l.history = l.history || []).push({ date, amount: amt, ts: Date.now() });
    if (auto) {
      const isLent = l.type === "lent";
      state.records.push({
        id: uid(), type: isLent ? "income" : "expense", amount: amt,
        category: isLent ? "其他收入" : "其他", accountId: "cash", date,
        note: `[快捷${isLent ? "收款" : "还款"}] ${l.person}`, created: Date.now()
      });
    }
  } else {
    const a = state.activities.find(x => x.id === id); if (!a) return;
    const due = Number(a.total || 0) + Number(a.extra || 0);
    const received = Number(a.received || 0);
    if (amt > due - received + 0.001) return toast("金额超过未收金额");
    a.received = Math.round((received + amt) * 100) / 100;
    (a.history = a.history || []).push({ date, amount: amt, ts: Date.now() });
    if (auto) {
      state.records.push({
        id: uid(), type: "income", amount: amt, category: "活动",
        accountId: "wechat", date, note: `[快捷收款] ${a.name}`, created: Date.now()
      });
    }
  }
  save(); renderAll(); $("quickDialog").close(); toast("已记录");
});

function download(name, content, type) {
  const blob = new Blob(["\ufeff", content], {type}); const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function exportJson() { download(`我的账本备份-${today()}.json`, JSON.stringify({version:3, state}, null, 2), "application/json;charset=utf-8"); }
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
  const header = ["日期","活动名称","总金额","人数","每人AA","额外收取","应收合计","已收","未收","含额外人均","备注"];
  const rows = state.activities.map(a => {
    const total = Number(a.total)||0, people = Number(a.people)||0, extra = Number(a.extra)||0;
    const per = people>0?total/people:0, due = total+extra, received = Number(a.received)||0, remain = Math.max(0, due-received);
    return [a.date,a.name,total,people,Math.round(per*100)/100,extra,Math.round(due*100)/100,Math.round(received*100)/100,Math.round(remain*100)/100,Math.round((people>0?due/people:0)*100)/100,a.note||""];
  });
  download(`我的活动-${today()}.csv`, [header,...rows].map(row=>row.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

function checkRecurring() {
  const td = today(); let changed = false;
  state.recurring.forEach(rule => {
    while (rule.nextDate <= td) {
      state.records.push({ id: uid(), type: rule.type, amount: rule.amount, category: rule.category, accountId: rule.accountId, date: rule.nextDate, note: `[自动]${rule.note}`, created: Date.now() });
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
function renderDots() { const dots = $("pinDots").children; for(let i=0;i<4;i++) dots[i].classList.toggle("filled", i < currentPin.length); }
function checkPinLock() { if (state.settings.pin) { $("lockScreen").classList.remove("hidden"); currentPin = ""; renderDots(); } else { $("lockScreen").classList.add("hidden"); } }

let calcExpr = "", calcTargetInput = null;
function openKeypad(inputEl) { calcTargetInput = inputEl; calcExpr = inputEl.value !== "" ? inputEl.value : "0"; $("keypadExpr").textContent = calcExpr; $("customKeypad").classList.remove("hidden"); }
function closeKeypad() {
  let finalVal = calcExpr;
  try { if (/[+\-*/]/.test(calcExpr) || calcExpr.includes("×") || calcExpr.includes("÷")) { const se = calcExpr.replace(/×/g,"*").replace(/÷/g,"/").replace(/[^0-9+\-*/.()]/g,""); finalVal = String(eval(se)); } } catch { finalVal = calcExpr; }
  const num = Number(finalVal); calcTargetInput.value = isNaN(num) ? "" : Math.round(num*100)/100; $("customKeypad").classList.add("hidden");
}

document.querySelectorAll(".tab,[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
document.querySelectorAll(".type-btn").forEach(b=>b.addEventListener("click",()=>{
  if (b.dataset.cattype) return;
  document.querySelectorAll(".type-btn").forEach(x=>x.classList.toggle("active",x===b)); renderCategories();
}));

document.addEventListener('dblclick', e => e.preventDefault(), { passive:false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, false);

if($("themeColors")) {
  $("themeColors").addEventListener("click", e => {
    const btn = e.target.closest(".theme-btn");
    if (btn) { state.settings.themeColor = btn.dataset.color; save(); applyTheme(btn.dataset.color, state.settings.customTheme); }
  });
}
if($("customThemePicker")) {
  $("customThemePicker").addEventListener("input", e => {
    state.settings.themeColor = "custom";
    state.settings.customTheme = e.target.value;
    applyTheme("custom", e.target.value);
  });
  $("customThemePicker").addEventListener("change", () => save());
}
if($("fontFamilySelect")) {
  $("fontFamilySelect").addEventListener("change", e => {
    state.settings.fontFamily = e.target.value; save(); applyFont(e.target.value);
  });
}
if($("textColors")) {
  $("textColors").addEventListener("click", e => {
    const btn = e.target.closest(".theme-btn");
    if (btn) { state.settings.fontColor = btn.dataset.text; save(); applyFontColor(btn.dataset.text, state.settings.customText); }
  });
}
if($("customTextPicker")) {
  $("customTextPicker").addEventListener("input", e => {
    state.settings.fontColor = "custom";
    state.settings.customText = e.target.value;
    applyFontColor("custom", e.target.value);
  });
  $("customTextPicker").addEventListener("change", () => save());
}

$("recordDate").value = today(); $("loanDate").value = today(); $("activityDate").value = today();
$("filterMonth").value = monthNow(); $("statsMonth").value = monthNow();
$("amount").addEventListener("focus", e => { e.target.blur(); openKeypad(e.target); });

$("recordForm").addEventListener("submit", e => {
  e.preventDefault(); const type = document.querySelector(".type-btn.active").dataset.type; const amount = Number($("amount").value);
  if (!Number.isFinite(amount) || amount <= 0) return toast("请输入大于 0 的金额");
  const accountId = $("account").value, toAccountId = $("toAccount").value;
  if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return toast("请选择不同的转出和转入账户");
  const r = { id: uid(), type, amount: Math.round(amount*100)/100, category: type === "transfer" ? "转账" : $("category").value, accountId, date: $("recordDate").value, note: $("note").value.trim(), created: Date.now() };
  if (type === "transfer") r.toAccountId = toAccountId;
  state.records.push(r);
  const freq = $("recurringFreq").value;
  if (freq !== "none") {
    const d = new Date(r.date);
    if (freq === "daily") d.setDate(d.getDate()+1);
    if (freq === "weekly") d.setDate(d.getDate()+7);
    if (freq === "monthly") d.setMonth(d.getMonth()+1);
    state.recurring.push({ ...r, id: "rec-"+Date.now(), freq, nextDate: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` });
  }
  save(); $("amount").value = ""; $("note").value = ""; $("recordDate").value = today(); $("recurringFreq").value = "none";
  renderAll(); toast("已保存");
});

let editingRecordId = null;
let actionRecordId = null;
function openEditDialog(id) {
  const r = state.records.find(x=>x.id===id); if (!r) return;
  editingRecordId = id;
  $("editId").value = id; $("editAmount").value = r.amount; $("editCategory").value = r.category;
  $("editAccount").value = r.accountId; $("editDate").value = r.date; $("editNote").value = r.note || "";
  $("editDialog").showModal();
}

$("actionEdit").addEventListener("click", () => { $("actionDialog").close(); openEditDialog(actionRecordId); });
$("actionDelete").addEventListener("click", () => {
  $("actionDialog").close();
  const r = state.records.find(x=>x.id===actionRecordId);
  if (r && confirm(`确定删除这笔 ${money(r.amount)} 吗？`)) {
    state.records = state.records.filter(x=>x.id!==r.id);
    save(); renderAll(); toast("已删除");
  }
});

$("editForm").addEventListener("submit", e => {
  e.preventDefault();
  const r = state.records.find(x=>x.id===editingRecordId); if (!r) return;
  r.amount = Math.round(Number($("editAmount").value)*100)/100;
  r.category = $("editCategory").value; r.accountId = $("editAccount").value;
  r.date = $("editDate").value; r.note = $("editNote").value.trim();
  save(); renderAll(); $("editDialog").close(); toast("已更新");
});

document.addEventListener("click", e => {
  const more = e.target.closest("[data-more]");
  if (more) { actionRecordId = more.dataset.more; $("actionDialog").showModal(); return; }

  const actDel = e.target.closest("[data-activity-delete]");
  if (actDel) {
    const a = state.activities.find(x=>x.id===actDel.dataset.activityDelete);
    if (a && confirm(`确定删除活动“${a.name}”吗？`)) {
      state.activities = state.activities.filter(x=>x.id!==a.id);
      save(); renderActivities(); toast("已删除");
    }
    return;
  }
  const ld = e.target.closest("[data-loan-delete]");
  if (ld) {
    if (confirm("确定删除这条借还记录吗？")) {
      state.loans = state.loans.filter(l=>l.id!==ld.dataset.loanDelete);
      save(); renderLoans(); toast("已删除");
    }
    return;
  }
  const repay = e.target.closest("[data-loan-repay]");
  if (repay) {
    const l = state.loans.find(x=>x.id===repay.dataset.loanRepay);
    if (!l) return;
    if (Math.max(0, Number(l.amount) - Number(l.repaid || 0)) <= 0.001) return toast("该笔已结清");
    openQuickDialog("loan", repay.dataset.loanRepay);
    return;
  }
  const receive = e.target.closest("[data-activity-receive]");
  if (receive) {
    const a = state.activities.find(x=>x.id===receive.dataset.activityReceive);
    if (!a) return;
    const due = Number(a.total || 0) + Number(a.extra || 0);
    if (Math.max(0, due - Number(a.received || 0)) <= 0.001) return toast("该活动已收齐");
    openQuickDialog("activity", receive.dataset.activityReceive);
    return;
  }
});

$("searchRecords").addEventListener("input", renderRecords);
$("filterMonth").addEventListener("change", renderRecords);
$("filterType").addEventListener("change", renderRecords);
$("statsMonth").addEventListener("change", renderStats);

$("budgetForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = Number($("budgetAmount").value);
  if (v < 0 || !Number.isFinite(v)) return toast("请输入有效预算");
  state.budget[monthNow()] = Math.round(v*100)/100;
  save(); renderAll(); toast("预算已保存");
});

["activityTotal","activityPeople","activityExtra"].forEach(id => $(id).addEventListener("input", renderActivityCalc));
renderActivityCalc();
$("activityForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("activityName").value.trim();
  const total = Number($("activityTotal").value);
  const people = Number($("activityPeople").value);
  const extra = Number($("activityExtra").value || 0);
  if (!name) return toast("请填写活动名称");
  if (!Number.isFinite(total) || total <= 0) return toast("请输入大于 0 的总金额");
  if (!Number.isInteger(people) || people < 1) return toast("人数需为正整数");
  const due = total + extra;
  const act = { id: "act-"+Date.now(), name, date: $("activityDate").value, total: Math.round(total*100)/100, people, extra: Math.round(extra*100)/100, note: $("activityNote").value.trim(), created: Date.now(), received: 0, history: [] };
  state.activities.push(act);
  if ($("activityAutoRecord").checked) {
    state.records.push({ id: uid(), type: "income", amount: Math.round(due*100)/100, category: "活动", accountId: "wechat", date: act.date, note: `[活动自动] ${name}`, created: Date.now() });
  }
  save();
  $("activityName").value = ""; $("activityTotal").value = ""; $("activityPeople").value = "";
  $("activityExtra").value = "0"; $("activityNote").value = ""; $("activityDate").value = today();
  renderActivities(); renderActivityCalc(); renderHome(); toast("活动已添加");
});

$("loanForm").addEventListener("submit", e => {
  e.preventDefault();
  const amount = Number($("loanAmount").value);
  if (amount <= 0) return toast("请输入有效金额");
  const type = $("loanType").value, person = $("loanPerson").value.trim(), date = $("loanDate").value;
  state.loans.push({ id: "l-"+Date.now(), type, person, amount: Math.round(amount*100)/100, date, note: $("loanNote").value.trim(), created: Date.now(), repaid: 0, history: [] });
  if ($("loanAutoRecord").checked) {
    state.records.push({ id: uid(), type: type === "lent" ? "expense" : "income", amount: Math.round(amount*100)/100, category: type === "lent" ? "借出" : "借入", accountId: "cash", date, note: `[借还自动] ${person}`, created: Date.now() });
  }
  save();
  $("loanPerson").value = ""; $("loanAmount").value = ""; $("loanNote").value = "";
  renderLoans(); renderHome(); toast("已添加借还记录");
});

$("exportCsv").addEventListener("click", exportCsv);
$("exportExcel").addEventListener("click", exportExcel);
$("exportJson").addEventListener("click", exportJson);
$("settingsExport").addEventListener("click", exportJson);
$("exportActivities").addEventListener("click", exportActivitiesCsv);
$("settingsBtn").addEventListener("click", ()=>go("settings"));

$("importJson").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (!obj.state || !Array.isArray(obj.state.records)) throw new Error();
    if (!confirm("恢复备份会覆盖当前数据，继续吗？")) return;
    state = obj.state;
    if (!state.categories) state.categories = defaultState().categories;
    if (!Array.isArray(state.accounts) || !state.accounts.length) state.accounts = defaultState().accounts;
    if (!state.settings) state.settings = { pin: "" };
    if (!state.settings.themeColor) state.settings.themeColor = "blue";
    if (!state.settings.fontFamily) state.settings.fontFamily = "default";
    if (!state.settings.fontColor) state.settings.fontColor = "default";
    if (!state.settings.customTheme) state.settings.customTheme = "#4a7ce0";
    if (!state.settings.customText) state.settings.customText = "#1d2738";
    if (!Array.isArray(state.activities)) state.activities = [];
    if (!Array.isArray(state.loans)) state.loans = [];
    if (!Array.isArray(state.recurring)) state.recurring = [];
    if (!state.budget) state.budget = {};
    save(); initFontSelect(); renderAll();
    applyTheme(state.settings.themeColor, state.settings.customTheme);
    applyFont(state.settings.fontFamily);
    applyFontColor(state.settings.fontColor, state.settings.customText);
    checkPinLock();
    toast("恢复成功");
  } catch { toast("恢复失败：文件格式不正确"); }
  finally { e.target.value = ""; }
});

$("restoreBackupBtn").addEventListener("click", () => {
  const bak = localStorage.getItem(KEY + "_backup");
  if (!bak) return toast("没有找到历史版本");
  if (!confirm("将恢复到上一次保存前的状态，当前改动会丢失。确定吗？")) return;
  try {
    state = JSON.parse(bak);
    if (!state.settings) state.settings = { pin: "" };
    if (!state.settings.themeColor) state.settings.themeColor = "blue";
    if (!state.settings.fontFamily) state.settings.fontFamily = "default";
    if (!state.settings.fontColor) state.settings.fontColor = "default";
    if (!state.settings.customTheme) state.settings.customTheme = "#4a7ce0";
    if (!state.settings.customText) state.settings.customText = "#1d2738";
    if (!Array.isArray(state.activities)) state.activities = [];
    save(); initFontSelect(); renderAll();
    applyTheme(state.settings.themeColor, state.settings.customTheme);
    applyFont(state.settings.fontFamily);
    applyFontColor(state.settings.fontColor, state.settings.customText);
    toast("已恢复历史版本");
  } catch { toast("恢复失败"); }
});

$("clearAll").addEventListener("click", () => {
  if (!confirm("彻底清空所有数据？此操作不可撤销！")) return;
  if (!confirm("建议先导出备份。仍要清空吗？")) return;
  state = defaultState(); save(); initFontSelect(); renderAll();
  applyTheme("blue", "#4a7ce0");
  applyFont("default");
  applyFontColor("default", "#1d2738");
  go("home"); toast("已清空");
});

/* ===== 账户管理 ===== */
function renderAccountManage() {
  $("accountList").innerHTML = state.accounts.map((a, i) => `
    <div class="cat-manage-item">
      <span>${safe(a.name)}</span>
      <button type="button" class="mini-action delete" data-delaccount="${i}">删除</button>
    </div>`).join("");
}
$("manageAccountsBtn").addEventListener("click", () => { renderAccountManage(); $("accountDialog").showModal(); });
$("addAccountBtn").addEventListener("click", () => {
  const name = $("newAccountName").value.trim();
  if (!name) return toast("请输入账户名称");
  if (state.accounts.some(a => a.name === name)) return toast("该账户已存在");
  state.accounts.push({ id: "acc-" + Date.now(), name, initial: 0 });
  save(); renderAccountManage(); renderAll();
  $("newAccountName").value = "";
  toast("账户已添加");
});
$("accountList").addEventListener("click", e => {
  const btn = e.target.closest("[data-delaccount]"); if (!btn) return;
  const idx = Number(btn.dataset.delaccount);
  const acc = state.accounts[idx];
  if (state.accounts.length <= 1) return toast("至少保留一个账户");
  const used = state.records.some(r => r.accountId === acc.id || r.toAccountId === acc.id);
  if (used) return toast("该账户下已有账单记录，无法删除！");
  if (confirm(`确定删除账户“${acc.name}”吗？`)) {
    state.accounts.splice(idx, 1);
    save(); renderAccountManage(); renderAll();
  }
});

/* ===== 分类管理 & 图标选择器 ===== */
let currentCatType = "expense";
const EMOJIS = {
  food: ["🍜","🍚","🍔","🍕","🍣","🍰","🍺","☕","🍎","🍉","🥩","🍤","🥗","🍦","🍩","🧋","🥘","🍛","🍝"],
  traffic: ["🚗","🚕","🚌","🚇","🚄","✈️","🚢","🚲","🛵","⛽","🅿️","🚦"],
  shopping: ["🛍️","👗","👟","💄","💍","👜","🧸","📱","💻","⌚","🎁","🧴","📦"],
  life: ["🏠","💡","🚰","🛋️","🧹","🧺","💊","🏥","🏫","💈","🛁","🔑"],
  fun: ["🎮","🎬","🎤","🎧","🎳","🎯","🎲","🎸","🎨","⚽","🏀","🏋️","🏕️","🏖️"],
  work: ["💼","💰","💳","📈","🏦","🧑‍💻","📚","✏️","📁","⏰","📅"],
  other: ["📌","❤️","🔥","✨","🎉","🧧","↩️","💸","🤝","↔️","🧾","💡","🔔"]
};

function renderEmojiGrid(type = "food") {
  $("emojiGrid").innerHTML = EMOJIS[type].map(e => `<span>${e}</span>`).join("");
}
$("emojiGrid").addEventListener("click", e => {
  if (e.target.tagName === "SPAN") {
    $("newCatIcon").value = e.target.textContent;
  }
});
document.querySelectorAll(".emoji-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".emoji-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderEmojiGrid(tab.dataset.etype);
  });
});

function renderCatManage() {
  const list = state.categories[currentCatType];
  $("catList").innerHTML = list.map((c, i) => `<div class="cat-manage-item"><span>${c.icon} ${c.name}</span><button type="button" class="mini-action delete" data-delcat="${i}">删除</button></div>`).join("");
}
document.querySelectorAll("#catDialog [data-cattype]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#catDialog [data-cattype]").forEach(x=>x.classList.toggle("active", x===b));
  currentCatType = b.dataset.cattype; renderCatManage();
}));
$("manageCatsBtn").addEventListener("click", () => { 
  renderCatManage(); 
  $("catDialog").showModal(); 
  renderEmojiGrid("food");
});
$("addCatBtn").addEventListener("click", () => {
  const name = $("newCatName").value.trim(), icon = $("newCatIcon").value.trim() || "📌";
  if (!name) return toast("请输入名称");
  if (state.categories[currentCatType].some(c=>c.name===name)) return toast("已存在");
  state.categories[currentCatType].push({name, icon});
  save(); renderCatManage(); renderAll();
  $("newCatName").value = ""; $("newCatIcon").value = "";
});
$("catList").addEventListener("click", e => {
  const btn = e.target.closest("[data-delcat]"); if (!btn) return;
  if (confirm("删除后已使用该分类的账单不会消失，但将无法选择。确定吗？")) {
    state.categories[currentCatType].splice(Number(btn.dataset.delcat), 1);
    save(); renderCatManage(); renderAll();
  }
});

$("setPinBtn").addEventListener("click", () => {
  const p = prompt("请输入新的 4 位数字密码：");
  if (p === null) return;
  if (!/^\d{4}$/.test(p)) return toast("必须是 4 位数字");
  state.settings.pin = p; save(); toast("密码已设置");
});
$("removePinBtn").addEventListener("click", () => { state.settings.pin = ""; save(); toast("密码锁已关闭"); });
$("pinPad").addEventListener("click", e => {
  const btn = e.target.closest("button"); if (!btn) return;
  const num = btn.dataset.num;
  if (num === "del") { currentPin = currentPin.slice(0, -1); renderDots(); }
  else if (num === "ok") {
    if (currentPin === state.settings.pin) $("lockScreen").classList.add("hidden");
    else { toast("密码错误"); currentPin = ""; renderDots(); }
  } else if (currentPin.length < 4) { currentPin += num; renderDots(); }
});

$("customKeypad").addEventListener("click", e => {
  const btn = e.target.closest("button"); if (!btn) return;
  if (btn.id === "keypadDone") return closeKeypad();
  const k = btn.dataset.k;
  if (k === "del") calcExpr = calcExpr.slice(0, -1) || "0";
  else if (k === "clear") calcExpr = "0";
  else if (k === "=") {
    try { const se = calcExpr.replace(/×/g,"*").replace(/÷/g,"/").replace(/[^0-9+\-*/.()]/g,""); calcExpr = String(eval(se)); }
    catch { toast("表达式错误"); }
  } else {
    if (calcExpr === "0" && !/[+\-*/.]/.test(k)) calcExpr = k;
    else calcExpr += k;
  }
  $("keypadExpr").textContent = calcExpr;
});

checkRecurring();
initFontSelect();
renderAll();
applyTheme(state.settings.themeColor, state.settings.customTheme);
applyFont(state.settings.fontFamily);
applyFontColor(state.settings.fontColor, state.settings.customText);
checkPinLock();

})();