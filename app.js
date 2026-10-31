(() => {
"use strict";

/* =========================================================
   我的账本 v2 · 逻辑
   - 数据结构 v3，自动从 v2 迁移
   - 深色模式 / 图标记账面板 / 图表 / 分类预算 / 周期管理 / 资产 / PWA
   ========================================================= */

const KEY = "my-ledger-v3";
const LEGACY_KEY = "my-ledger-v2";
const SNAP_KEY = "my-ledger-snapshots";

const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const pad = n => String(n).padStart(2, "0");
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const monthNow = () => today().slice(0, 7);
const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));
const safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function money(n) {
  const v = round2(n);
  const s = Math.abs(v).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-¥" : "¥") + s;
}
function moneyShort(n) {
  const v = Math.abs(round2(n));
  if (v >= 10000) return "¥" + (v / 10000).toFixed(v >= 100000 ? 0 : 1) + "万";
  return "¥" + v.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/* ---------------- 日期工具 ---------------- */
const pad2 = n => String(n).padStart(2, "0");
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseDate(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function shiftDateStr(s, days) { const d = parseDate(s); d.setDate(d.getDate() + days); return fmtDate(d); }
function daysInMonth(m) { const y = +m.slice(0, 4), mo = +m.slice(5, 7); return new Date(y, mo, 0).getDate(); }
function shiftMonth(m, delta) { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + delta, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function monthLabel(m) { return `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`; }
function weekdayCN(s) { return "周" + "日一二三四五六"[parseDate(s).getDay()]; }
function dateLabel(s) {
  const t = today();
  if (s === t) return `今天 · ${weekdayCN(s)}`;
  if (s === shiftDateStr(t, -1)) return `昨天 · ${weekdayCN(s)}`;
  if (s === shiftDateStr(t, -2)) return `前天 · ${weekdayCN(s)}`;
  return `${s.replace(/-/g, "/")} · ${weekdayCN(s)}`;
}

/* ---------------- 默认数据 ---------------- */
const DEFAULT_CATS = {
  expense: [["餐饮", "🍜"], ["交通", "🚇"], ["购物", "🛍️"], ["居家", "🏠"], ["住房", "🏡"], ["医疗", "💊"], ["娱乐", "🎮"], ["学习", "📚"], ["人情", "🎁"], ["旅行", "✈️"], ["通讯", "📱"], ["其他", "🧾"]],
  income: [["工资", "💼"], ["奖金", "🎉"], ["兼职", "🧑‍💻"], ["投资收益", "📈"], ["红包", "🧧"], ["退款", "↩️"], ["其他收入", "💰"]]
};
const EXTRA_ICONS = { "转账": "↔️", "借出": "💸", "借入": "🤝", "活动": "🎯" };

const DEFAULT_ACCOUNTS = [
  { id: "wechat", name: "微信" }, { id: "meituan", name: "美团" }, { id: "douyin", name: "抖音" },
  { id: "xianyu", name: "闲鱼" }, { id: "jd", name: "京东" }, { id: "pdd", name: "拼多多" },
  { id: "taobao", name: "淘宝" }, { id: "cash", name: "现金" }
];

function defaultState() {
  return {
    version: 3,
    records: [], loans: [], activities: [], recurring: [],
    budget: {}, catBudget: {},
    accounts: DEFAULT_ACCOUNTS.map(a => ({ ...a, initial: 0 })),
    categories: {
      expense: DEFAULT_CATS.expense.map(([name, icon]) => ({ name, icon })),
      income: DEFAULT_CATS.income.map(([name, icon]) => ({ name, icon }))
    },
    settings: {
      pinHash: "", pin: "",
      themeColor: "blue", customTheme: "#3b6fe8",
      fontFamily: "default", fontColor: "default", customText: "#0e1524",
      mode: "light", hideAmounts: false, autoLock: 5, defaultAccount: "",
      bg: "auto", oled: false
    },
    meta: { createdAt: Date.now(), lastBackupAt: 0 }
  };
}

function normalize(raw) {
  const base = defaultState();
  const src = (raw && typeof raw === "object") ? raw : {};
  const out = { ...base, ...src };
  out.records = Array.isArray(src.records) ? src.records.filter(r => r && r.date).map(r => ({
    id: r.id || uid(),
    type: ["income", "expense", "transfer"].includes(r.type) ? r.type : "expense",
    amount: round2(r.amount),
    category: String(r.category || "其他"),
    accountId: r.accountId || "",
    toAccountId: r.toAccountId || "",
    date: String(r.date).slice(0, 10),
    note: String(r.note || ""),
    created: Number(r.created) || 0
  })) : [];
  out.loans = Array.isArray(src.loans) ? src.loans.map(l => ({
    id: l.id || uid(), type: l.type === "borrowed" ? "borrowed" : "lent",
    person: String(l.person || ""), amount: round2(l.amount), repaid: round2(l.repaid || 0),
    date: l.date || today(), note: String(l.note || ""), created: Number(l.created) || 0,
    history: Array.isArray(l.history) ? l.history : []
  })) : [];
  out.activities = Array.isArray(src.activities) ? src.activities.map(a => ({
    id: a.id || uid(), name: String(a.name || "活动"), date: a.date || today(),
    total: round2(a.total), people: Math.max(1, Number(a.people) || 1), extra: round2(a.extra || 0),
    received: round2(a.received || 0), note: String(a.note || ""), created: Number(a.created) || 0,
    history: Array.isArray(a.history) ? a.history : []
  })) : [];
  out.recurring = Array.isArray(src.recurring) ? src.recurring.map(r => ({
    id: r.id || uid(), type: r.type === "income" ? "income" : "expense",
    amount: round2(r.amount), category: String(r.category || "其他"),
    accountId: r.accountId || "", note: String(r.note || ""),
    freq: ["daily", "weekly", "monthly"].includes(r.freq) ? r.freq : "monthly",
    nextDate: r.nextDate || today(), enabled: r.enabled !== false
  })) : [];
  out.budget = (src.budget && typeof src.budget === "object") ? src.budget : {};
  out.catBudget = (src.catBudget && typeof src.catBudget === "object") ? src.catBudget : {};
  out.accounts = (Array.isArray(src.accounts) && src.accounts.length)
    ? src.accounts.map(a => ({ id: a.id || uid(), name: String(a.name || "账户"), initial: round2(a.initial || 0) }))
    : base.accounts;
  out.categories = {
    expense: (src.categories && Array.isArray(src.categories.expense) && src.categories.expense.length)
      ? src.categories.expense.map(c => ({ name: String(c.name || "其他"), icon: c.icon || "📌" })) : base.categories.expense,
    income: (src.categories && Array.isArray(src.categories.income) && src.categories.income.length)
      ? src.categories.income.map(c => ({ name: String(c.name || "其他收入"), icon: c.icon || "💰" })) : base.categories.income
  };
  out.settings = { ...base.settings, ...(src.settings || {}) };
  if (!out.settings.themeColor) out.settings.themeColor = "blue";
  if (!out.settings.mode) out.settings.mode = "light";
  out.settings.autoLock = Number.isFinite(Number(out.settings.autoLock)) ? Number(out.settings.autoLock) : 5;
  out.settings.hideAmounts = !!out.settings.hideAmounts;
  out.settings.bg = ["auto", "plain", "paper", "mint", "sunset", "night"].includes(out.settings.bg) ? out.settings.bg : "auto";
  out.settings.oled = !!out.settings.oled;
  out.meta = { ...base.meta, ...(src.meta || {}) };
  return out;
}

/* ---------------- 读取 / 保存 ---------------- */
let state;
function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { raw = null; }
  if (!raw) {
    try { raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); } catch { raw = null; }
  }
  state = normalize(raw);
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    toast("保存失败：存储空间可能已满");
  }
}

function readSnaps() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "[]") || []; } catch { return []; }
}
function writeSnaps(list) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); } catch { try { localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(0, 2))); } catch { } }
}
function snapshot(tag) {
  const list = readSnaps();
  list.unshift({ ts: Date.now(), tag: tag || "手动", data: JSON.stringify(state) });
  while (list.length > 5) list.pop();
  writeSnaps(list);
}

/* ---------------- 主题 / 字体 ---------------- */
const THEMES = [
  { id: "blue", hex: "#3b6fe8", name: "海蓝" }, { id: "indigo", hex: "#5b5bd6", name: "黛蓝" },
  { id: "violet", hex: "#8b5cf6", name: "紫罗兰" }, { id: "pink", hex: "#ec4899", name: "樱花粉" },
  { id: "red", hex: "#e0554b", name: "珊瑚" }, { id: "orange", hex: "#f2762e", name: "暖橙" },
  { id: "amber", hex: "#e0a325", name: "琥珀" }, { id: "green", hex: "#12a06e", name: "松绿" },
  { id: "teal", hex: "#0f9c96", name: "青碧" }, { id: "slate", hex: "#475569", name: "石墨" }
];
const INKS = [
  { id: "default", hex: "#0e1524", name: "深墨" }, { id: "black", hex: "#000000", name: "纯黑" },
  { id: "gray", hex: "#4b5563", name: "烟灰" }, { id: "brown", hex: "#5c4033", name: "咖色" },
  { id: "blue", hex: "#1e3a8a", name: "藏蓝" }
];
const FONTS = [
  { id: "default", name: "系统默认（苹方 / 黑体）", stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: "round", name: "圆润可爱", stack: '"Yuanti SC", "YouYuan", "Quicksand", "PingFang SC", sans-serif' },
  { id: "serif", name: "优雅衬线", stack: '"Songti SC", "SimSun", Georgia, serif' },
  { id: "mono", name: "等宽数字", stack: '"SFMono-Regular", Consolas, Menlo, monospace' },
  { id: "kaiti", name: "楷体", stack: '"Kaiti SC", "KaiTi", "楷体", serif' },
  { id: "fangsong", name: "仿宋", stack: '"FangSong", "STFangsong", "仿宋", serif' },
  { id: "heiti", name: "黑体", stack: '"Heiti SC", "SimHei", "黑体", sans-serif' },
  { id: "pingfang", name: "苹方", stack: '"PingFang SC", "Helvetica Neue", sans-serif' },
  { id: "dengxian", name: "等线", stack: '"DengXian", "等线", "Microsoft YaHei", sans-serif' },
  { id: "xingkai", name: "行楷", stack: '"STXingkai", "Xingkai SC", "KaiTi", serif' },
  { id: "lishu", name: "隶书", stack: '"STLiti", "LiSu", serif' },
  { id: "helvetica", name: "Helvetica", stack: 'Helvetica, "Helvetica Neue", Arial, sans-serif' },
  { id: "verdana", name: "Verdana", stack: 'Verdana, Geneva, sans-serif' },
  { id: "georgia", name: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { id: "impact", name: "Impact（粗标题）", stack: 'Impact, "Arial Black", sans-serif' },
  { id: "comic", name: "Comic Sans MS", stack: '"Comic Sans MS", "Chalkboard SE", cursive' }
];

const isHex = h => /^#[0-9a-f]{6}$/i.test(h || "");
function hexToHsl(hex) {
  const h6 = String(hex || "").replace("#", "");
  let r = 0, g = 0, b = 0;
  if (h6.length === 3) { r = parseInt(h6[0] + h6[0], 16); g = parseInt(h6[1] + h6[1], 16); b = parseInt(h6[2] + h6[2], 16); }
  else if (h6.length === 6) { r = parseInt(h6.slice(0, 2), 16); g = parseInt(h6.slice(2, 4), 16); b = parseInt(h6.slice(4, 6), 16); }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
const hsl = (h, s, l, a) => `hsl(${h}, ${clamp(s, 0, 100)}%, ${clamp(l, 0, 100)}%${a === undefined ? "" : `, ${a}`})`;

function resolveThemeHex() {
  const s = state.settings;
  if (s.themeColor === "custom" && isHex(s.customTheme)) return s.customTheme;
  return (THEMES.find(t => t.id === s.themeColor) || THEMES[0]).hex;
}
function resolveInkHex() {
  const s = state.settings;
  if (s.fontColor === "custom" && isHex(s.customText)) return s.customText;
  return (INKS.find(i => i.id === s.fontColor) || INKS[0]).hex;
}
function effectiveMode() {
  const m = state.settings.mode;
  if (m === "auto") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return m === "dark" ? "dark" : "light";
}
function applyMode() {
  const mode = effectiveMode();
  document.documentElement.setAttribute("data-mode", mode);
  const meta = $("metaTheme");
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0b0f16" : "#f3f5fa");
  const appleBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleBar) appleBar.setAttribute("content", mode === "dark" ? "black-translucent" : "default");
  $$("#modeSeg button").forEach(b => b.classList.toggle("active", b.dataset.mode === state.settings.mode));
  applyTheme();
  applyInk();
}
function applyTheme() {
  const root = document.documentElement;
  const hex = resolveThemeHex();
  const c = hexToHsl(hex);
  const dark = root.getAttribute("data-mode") === "dark";
  root.style.setProperty("--c-primary", hex);
  root.style.setProperty("--c-primary-soft", hsl(c.h, c.s, dark ? 62 : 52, dark ? .26 : .13));
  root.style.setProperty("--c-hero", dark
    ? `linear-gradient(145deg, ${hsl(c.h, Math.max(35, c.s - 5), 22)}, ${hsl(c.h, c.s, 31)}, ${hsl((c.h + 16) % 360, Math.max(30, c.s - 12), 27)})`
    : `linear-gradient(145deg, ${hsl(c.h, c.s, clamp(c.l - 13, 18, 62))}, ${hsl(c.h, c.s, c.l)}, ${hsl((c.h + 16) % 360, c.s, clamp(c.l + 16, 30, 78))})`);
  root.style.setProperty("--c-btn", `linear-gradient(110deg, ${hsl(c.h, c.s, clamp(c.l - 4, 18, 62))}, ${hsl((c.h + 14) % 360, c.s, clamp(c.l + 9, 30, 72))})`);
  root.style.setProperty("--c-hero-shadow", `0 18px 40px ${hsl(c.h, c.s, c.l, dark ? .34 : .26)}`);

  $$("#themeSwatches .swatch").forEach(b => b.classList.toggle("active", state.settings.themeColor !== "custom" && b.dataset.id === state.settings.themeColor));
  $$("#inkSwatches .swatch").forEach(b => b.classList.toggle("active", state.settings.fontColor !== "custom" && b.dataset.id === state.settings.fontColor));
  if ($("themeWheelCenter")) $("themeWheelCenter").style.background = hex;
  if ($("inkWheelCenter")) $("inkWheelCenter").style.background = resolveInkHex();
  if ($("themePicker")) $("themePicker").value = hex;
  if ($("inkPicker")) $("inkPicker").value = resolveInkHex();
}
function applyFont() {
  const f = FONTS.find(x => x.id === state.settings.fontFamily) || FONTS[0];
  document.documentElement.style.setProperty("--font", f.stack);
  if ($("fontSelect")) $("fontSelect").value = f.id;
}
function applyInk() {
  const root = document.documentElement;
  const dark = root.getAttribute("data-mode") === "dark";
  const hex = resolveInkHex();
  if (dark) {
    // 深色模式下保留色相、提亮，保证可读
    const c = hexToHsl(hex);
    if (c.s < 6) {
      root.style.setProperty("--ink", "#eef2fa");
    } else {
      root.style.setProperty("--ink", hsl(c.h, Math.min(c.s, 42), clamp(Math.max(c.l, 80), 80, 92)));
    }
  } else {
    root.style.setProperty("--ink", hex);
  }
  $$("#inkSwatches .swatch").forEach(b => b.classList.toggle("active", state.settings.fontColor !== "custom" && b.dataset.id === state.settings.fontColor));
  if ($("inkWheelCenter")) $("inkWheelCenter").style.background = hex;
  if ($("inkPicker")) $("inkPicker").value = hex;
}
function applyPrivacy() {
  document.documentElement.classList.toggle("privacy", !!state.settings.hideAmounts);
  const btn = $("privacyBtn");
  if (btn) {
    btn.classList.toggle("on", !!state.settings.hideAmounts);
    btn.textContent = state.settings.hideAmounts ? "🙈" : "👁";
  }
  if ($("hideSwitch")) $("hideSwitch").classList.toggle("on", !!state.settings.hideAmounts);
}
function applySurface() {
  const root = document.documentElement;
  root.setAttribute("data-bg", state.settings.bg || "auto");
  root.setAttribute("data-oled", state.settings.oled ? "true" : "false");
  if ($("oledSwitch")) $("oledSwitch").classList.toggle("on", !!state.settings.oled);
}
function applyAllVisual() {
  applyMode(); applyFont(); applyInk(); applyPrivacy(); applySurface();
}

/* ---------------- 分类图标 ---------------- */
function catHue(name) {
  let h = 7;
  for (const ch of String(name || "")) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}
function getIcon(name) {
  const all = [...state.categories.expense, ...state.categories.income];
  const hit = all.find(c => c.name === name);
  return hit ? hit.icon : (EXTRA_ICONS[name] || "📌");
}
const acct = id => state.accounts.find(a => a.id === id);
const acctName = id => (acct(id) || {}).name || "已删除账户";
function defaultAccountId() {
  const d = state.settings.defaultAccount;
  if (d && acct(d)) return d;
  return state.accounts[0] ? state.accounts[0].id : "";
}

/* ---------------- 账户余额 / 净资产 ---------------- */
function acctBalance(id) {
  let bal = Number((acct(id) || {}).initial) || 0;
  for (const r of state.records) {
    const a = Number(r.amount) || 0;
    if (r.type === "income" && r.accountId === id) bal += a;
    else if (r.type === "expense" && r.accountId === id) bal -= a;
    else if (r.type === "transfer") {
      if (r.accountId === id) bal -= a;
      if (r.toAccountId === id) bal += a;
    }
  }
  return round2(bal);
}
function loanTotals() {
  let lent = 0, borrowed = 0;
  state.loans.forEach(l => {
    const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
    if (l.type === "lent") lent += remain; else borrowed += remain;
  });
  return { lent: round2(lent), borrowed: round2(borrowed) };
}
function netWorth() {
  const cash = state.accounts.reduce((s, a) => s + acctBalance(a.id), 0);
  const { lent, borrowed } = loanTotals();
  return round2(cash + lent - borrowed);
}

/* ---------------- 统计聚合 ---------------- */
function aggMonth(m) {
  const out = { inc: 0, exp: 0, count: 0, byCat: {}, incCat: {}, byDay: {}, byAccount: {}, rows: [] };
  for (const r of state.records) {
    if (r.date.slice(0, 7) !== m) continue;
    out.rows.push(r);
    out.count++;
    const a = Number(r.amount) || 0;
    if (r.type === "income") { out.inc += a; out.incCat[r.category] = (out.incCat[r.category] || 0) + a; }
    else if (r.type === "expense") {
      out.exp += a;
      out.byCat[r.category] = (out.byCat[r.category] || 0) + a;
      const d = Number(r.date.slice(8, 10));
      out.byDay[d] = (out.byDay[d] || 0) + a;
    }
    if (r.type !== "transfer" && r.accountId) out.byAccount[r.accountId] = (out.byAccount[r.accountId] || 0) + (r.type === "income" ? a : -a);
  }
  out.inc = round2(out.inc); out.exp = round2(out.exp);
  return out;
}
function sortRecordsDesc(rows) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || (Number(b.created) || 0) - (Number(a.created) || 0));
}
function groupByDate(rows) {
  const g = {};
  rows.forEach(r => { (g[r.date] = g[r.date] || []).push(r); });
  return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
}

/* ---------------- UI 基础 ---------------- */
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}
let openStack = [];
function openOverlay(id, stack) {
  const ov = $(id);
  if (!ov) return;
  if (!stack) { openStack.forEach(x => { const el = $(x); if (el) el.classList.remove("show"); }); openStack = []; }
  ov.classList.add("show");
  ov.setAttribute("aria-hidden", "false");
  if (!openStack.includes(id)) openStack.push(id);
  document.body.style.overflow = "hidden";
}
function closeOverlay(id) {
  const ov = $(id);
  if (ov) { ov.classList.remove("show"); ov.setAttribute("aria-hidden", "true"); }
  openStack = openStack.filter(x => x !== id);
  if (!openStack.length) document.body.style.overflow = "";
}
function closeAllOverlays() {
  openStack.forEach(id => { const el = $(id); if (el) { el.classList.remove("show"); el.setAttribute("aria-hidden", "true"); } });
  openStack = [];
  document.body.style.overflow = "";
}

let actionHandlers = [];
function openActions(title, items) {
  $("actionTitle").textContent = title || "操作";
  $("actionButtons").innerHTML = items.map((it, i) =>
    `<button type="button" class="action-item${it.danger ? " danger" : ""}" data-action-index="${i}">${safe(it.label)}</button>`
  ).join("");
  actionHandlers = items.map(it => it.onClick);
  openOverlay("actionOverlay");
}

/* ---------------- 页面切换 ---------------- */
const PAGES = ["home", "records", "stats", "activities", "loans", "budget", "settings"];
function moveNavPill() {
  const tabs = $("tabs"), pill = $("navPill"), active = document.querySelector(".tab.active");
  if (!tabs || !pill || !active) return;
  const tr = tabs.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  pill.style.width = ar.width + "px";
  pill.style.transform = `translateX(${ar.left - tr.left - tabs.clientLeft}px)`;
}
function go(page) {
  if (!PAGES.includes(page)) page = "home";
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  if (page === "budget") renderBudget();
  if (page === "activities") renderActivities();
  if (page === "loans") renderLoans();
  if (page === "settings") { renderSettings(); }
  if (page === "records") renderRecords();
  if (page === "stats") renderStats();
  if (page === "home") renderHome();
  moveNavPill();
  window.scrollTo({ top: 0, behavior: "smooth" });
  try { history.replaceState(null, "", "#" + page); } catch { }
}

/* =========================================================
   首页
   ========================================================= */
/* ---------------- 金额数字动画 ---------------- */
const MONEY_PREV = new WeakMap();
function animateNumber(el, value, render) {
  if (!el) return;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = MONEY_PREV.has(el) ? MONEY_PREV.get(el) : value;
  MONEY_PREV.set(el, value);
  if (reduced || from === value) { render(value); return; }
  const t0 = performance.now(), dur = 520;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    render(from + (value - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function setMoneyText(el, value) {
  animateNumber(el, value, v => { el.textContent = money(v); });
}
function setHeroAmount(elId, value) {
  const el = $(elId);
  if (!el) return;
  const num = el.querySelector(".num") || el;
  const cur = el.querySelector(".cur");
  animateNumber(el, value, v => {
    const txt = Math.abs(v).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num !== el) {
      num.textContent = txt;
      num.style.fontSize = txt.length > 12 ? "29px" : txt.length > 10 ? "33px" : "";
      if (cur) cur.textContent = v < 0 ? "-¥" : "¥";
    } else {
      el.textContent = money(v);
    }
  });
}

function renderHome() {
  const m = monthNow();
  const a = aggMonth(m);
  const budget = Number(state.budget[m] || 0);
  const balance = round2(a.inc - a.exp);

  $("monthLabel").textContent = monthLabel(m);
  setHeroAmount("monthExpenseBig", a.exp);
  setMoneyText($("monthIncome"), a.inc);
  setMoneyText($("monthBalance"), balance);

  const pct = budget > 0 ? a.exp / budget * 100 : 0;
  $("budgetBar").style.width = budget > 0 ? Math.min(100, pct) + "%" : "0%";
  const track = $("budgetTrack");
  track.classList.toggle("warn", budget > 0 && pct >= 80 && pct < 100);
  track.classList.toggle("over", budget > 0 && pct >= 100);
  $("budgetText").textContent = budget > 0
    ? `预算 ${moneyShort(budget)} · 已用 ${pct.toFixed(0)}%${pct >= 100 ? "（已超支）" : ""}`
    : "尚未设置本月预算";

  const d = new Date();
  $("todayChip").textContent = `${d.getMonth() + 1}/${d.getDate()} ${weekdayCN(today())}`;
  const h = d.getHours();
  $("greeting").textContent = h < 6 ? "夜深了，早点睡" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";

  const days = daysInMonth(m);
  const elapsed = m === monthNow() ? d.getDate() : days;
  const maxRec = a.rows.filter(r => r.type === "expense").sort((x, y) => y.amount - x.amount)[0];
  $("quickStats").innerHTML = `
    <div class="qs-item"><span>本月日均支出</span><strong>${money(a.exp / Math.max(1, elapsed))}</strong></div>
    <div class="qs-item"><span>本月记账</span><strong>${a.count} 笔</strong></div>
    <div class="qs-item"><span>最大单笔</span><strong>${maxRec ? moneyShort(maxRec.amount) : "—"}</strong></div>`;

  const recent = sortRecordsDesc(state.records).slice(0, 12);
  $("recentRecords").innerHTML = recent.length
    ? groupByDate(recent).map(([date, rows]) => dateDivider(date, rows) + rows.map(recordRow).join("")).join("")
    : emptyHtml("receipt", "还没有账单，点右下角「＋」记第一笔");
}

function dateDivider(date, rows) {
  let inc = 0, exp = 0;
  rows.forEach(r => { if (r.type === "income") inc += Number(r.amount) || 0; if (r.type === "expense") exp += Number(r.amount) || 0; });
  let sum = "";
  if (inc && exp) sum = `支出 ${money(exp)} · 收入 ${money(inc)}`;
  else if (exp) sum = `支出 ${money(exp)}`;
  else if (inc) sum = `收入 ${money(inc)}`;
  else sum = "转账";
  return `<div class="date-divider"><span class="date-label">${dateLabel(date)}</span><span class="date-summary">${sum}</span></div>`;
}
const EMPTY_ART = {
  receipt: `<svg class="empty-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 7h28v49l-4.7-3.2L36.6 56 32 52.8 27.4 56l-4.7-3.2L18 56z"/><path d="M24 20h16M24 28h16M24 36h10"/></svg>`,
  search: `<svg class="empty-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="15"/><path d="M39.5 39.5 54 54"/><path d="M22 26a7 7 0 0 1 7-6"/></svg>`,
  chart: `<svg class="empty-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 52h44"/><rect x="15" y="30" width="8" height="22" rx="2.5"/><rect x="28" y="18" width="8" height="34" rx="2.5"/><rect x="41" y="38" width="8" height="14" rx="2.5"/></svg>`,
  income: `<svg class="empty-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="32" cy="21" rx="16" ry="7"/><path d="M16 21v10c0 3.9 7.2 7 16 7s16-3.1 16-7V21"/><path d="M16 31v10c0 3.9 7.2 7 16 7s16-3.1 16-7V31"/></svg>`,
  activity: `<svg class="empty-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="22" r="8"/><path d="M8 52c0-8.8 7.2-14 16-14s16 5.2 16 14"/><circle cx="45" cy="24" r="6"/><path d="M45 38c6.6 0 11 4.6 11 12"/></svg>`,
  loan: `<svg class="empty-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 24h38l-8-8"/><path d="M54 40H16l8 8"/><circle cx="32" cy="32" r="2"/></svg>`
};
function emptyHtml(kind, text, cta) {
  const art = EMPTY_ART[kind] || EMPTY_ART.receipt;
  return `<div class="empty">${art}<p>${safe(text)}</p>${cta ? `<p class="empty-cta">${cta}</p>` : ""}</div>`;
}
function recordRow(r) {
  const isT = r.type === "transfer";
  const isInc = r.type === "income";
  const icon = isT ? "↔️" : getIcon(r.category);
  const cls = isT ? "transfer" : isInc ? "income" : "expense";
  const sign = isT ? "" : isInc ? "+" : "−";
  const colorCls = isT ? "" : isInc ? "in" : "out";
  const meta = isT
    ? `${acctName(r.accountId)} → ${acctName(r.toAccountId)}`
    : acctName(r.accountId);
  return `<button type="button" class="record" data-record="${safe(r.id)}">
    <span class="record-icon ${cls}" style="--h:${isT ? 222 : catHue(r.category)}">${icon}</span>
    <span class="record-main">
      <span class="record-name">${safe(isT ? "转账" : r.category)}${(!isT && r.note) ? `<span class="note">${safe(r.note)}</span>` : ""}</span>
      <span class="record-meta">${safe(meta)}</span>
    </span>
    <span class="record-right">
      <span class="record-amount ${colorCls}">${sign}${money(r.amount)}</span>
      ${isT ? '<span class="record-sub">转账</span>' : ""}
    </span>
  </button>`;
}

/* =========================================================
   明细
   ========================================================= */
const recFilter = { q: "", month: monthNow(), allMonths: false, type: "all", account: "all" };

function renderRecordFilters() {
  const label = recFilter.allMonths ? "全部月份" : monthLabel(recFilter.month);
  const el = $("recordsMonthLabel");
  if (el) el.textContent = label;
  const allBtn = $("recordsMonthAll");
  if (allBtn) allBtn.textContent = recFilter.allMonths ? "只看本月" : "显示全部月份";
  $$("#filterTypeChips .seg-chip").forEach(b => b.classList.toggle("active", b.dataset.ft === recFilter.type));

  const sel = $("filterAccount");
  if (sel) {
    const keep = recFilter.account;
    sel.innerHTML = `<option value="all">全部账户</option>` + state.accounts.map(a => `<option value="${safe(a.id)}">${safe(a.name)}</option>`).join("");
    sel.value = state.accounts.some(a => a.id === keep) ? keep : "all";
    recFilter.account = sel.value;
  }
}
function renderRecords() {
  renderRecordFilters();
  const q = recFilter.q.trim().toLowerCase();
  const rows = sortRecordsDesc(state.records.filter(r => {
    if (!recFilter.allMonths && r.date.slice(0, 7) !== recFilter.month) return false;
    if (recFilter.type !== "all" && r.type !== recFilter.type) return false;
    if (recFilter.account !== "all" && r.accountId !== recFilter.account && r.toAccountId !== recFilter.account) return false;
    if (q) {
      const hay = [r.note, r.category, acctName(r.accountId), r.toAccountId ? acctName(r.toAccountId) : "", r.amount].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }));

  let inc = 0, exp = 0;
  rows.forEach(r => { if (r.type === "income") inc += r.amount; if (r.type === "expense") exp += r.amount; });
  $("recordsSummary").innerHTML = rows.length
    ? `<span>共 <strong>${rows.length}</strong> 笔 · 支出 <strong>${money(exp)}</strong> · 收入 <strong>${money(inc)}</strong></span><span>结余 ${money(inc - exp)}</span>`
    : `<span>没有符合条件的账单</span>`;

  if (!rows.length) {
    $("allRecords").innerHTML = emptyHtml("search", "没有找到账单，试试换个关键词或月份");
    return;
  }
  const shown = rows.slice(0, 400);
  $("allRecords").innerHTML = groupByDate(shown).map(([date, list]) => dateDivider(date, list) + list.map(recordRow).join("")).join("")
    + (rows.length > shown.length ? `<p class="muted small" style="text-align:center;padding:12px">仅显示最近 400 条，请用筛选缩小范围</p>` : "");
}

/* =========================================================
   统计
   ========================================================= */
const PALETTE = ["#4f7cf0", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899", "#64748b"];

const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const statsSpan = () => daysBetween(statsRange.start, statsRange.end) + 1;
const pctText = p => (p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)) + "%";

/* 自然周期：周 = 周一到周日；月 = 自然月；3 个月 / 半年 = 连续完整自然月 */
function startOfWeek(ds) {
  const d = parseDate(ds);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return fmtDate(d);
}
function endOfMonthOf(m) { return `${m}-${pad2(daysInMonth(m))}`; }
function periodRange(preset, offset) {
  const t = today(), cm = monthNow();
  if (preset === "week") {
    const s = shiftDateStr(startOfWeek(t), -7 * offset);
    return { start: s, end: offset === 0 ? t : shiftDateStr(s, 6) };
  }
  if (preset === "month") {
    const m = shiftMonth(cm, -offset);
    return { start: `${m}-01`, end: offset === 0 ? t : endOfMonthOf(m) };
  }
  if (preset === "quarter") {
    const sM = shiftMonth(cm, -2 - 3 * offset);
    const eM = shiftMonth(cm, -3 * offset);
    return { start: `${sM}-01`, end: offset === 0 ? t : endOfMonthOf(eM) };
  }
  const sM = shiftMonth(cm, -5 - 6 * offset);
  const eM = shiftMonth(cm, -6 * offset);
  return { start: `${sM}-01`, end: offset === 0 ? t : endOfMonthOf(eM) };
}
let statsRange = Object.assign({ preset: "month", offset: 0 }, periodRange("month", 0));

function deltaBadge(cur, prev, badWhenUp) {
  if (!prev) return `<span class="delta">上期无数据</span>`;
  const d = (cur - prev) / prev * 100;
  if (!Number.isFinite(d)) return `<span class="delta">—</span>`;
  if (Math.abs(d) < 0.05) return `<span class="delta">与上期持平</span>`;
  const up = d >= 0;
  const cls = Math.abs(d) < 0.5 ? "" : (up === badWhenUp ? "up" : "down");
  return `<span class="delta ${cls}">${up ? "↑" : "↓"}${Math.abs(d).toFixed(1)}% 较上期</span>`;
}

function aggRange(start, end) {
  const out = { inc: 0, exp: 0, count: 0, byCat: {}, incCat: {}, byDay: {}, rows: [] };
  for (const r of state.records) {
    if (r.date < start || r.date > end) continue;
    out.rows.push(r);
    out.count++;
    const a = Number(r.amount) || 0;
    if (r.type === "income") {
      out.inc += a;
      out.incCat[r.category] = (out.incCat[r.category] || 0) + a;
    } else if (r.type === "expense") {
      out.exp += a;
      out.byCat[r.category] = (out.byCat[r.category] || 0) + a;
      out.byDay[r.date] = (out.byDay[r.date] || 0) + a;
    }
  }
  out.inc = round2(out.inc);
  out.exp = round2(out.exp);
  return out;
}
function rangeLabel(s, e) {
  const crossYear = s.slice(0, 4) !== e.slice(0, 4);
  const f = d => `${crossYear ? d.slice(0, 4) + "/" : ""}${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${f(s)} – ${f(e)}`;
}
function setStatsPreset(id) {
  if (id === "custom") {
    statsRange = { preset: "custom", offset: 0, start: statsRange.start, end: statsRange.end };
  } else {
    statsRange = Object.assign({ preset: id, offset: 0 }, periodRange(id, 0));
  }
  renderStats();
}
function shiftStatsRange(dir) {
  if (statsRange.preset !== "custom") {
    const next = Math.max(0, statsRange.offset - dir);
    if (next === statsRange.offset) return;
    statsRange = Object.assign({ preset: statsRange.preset, offset: next }, periodRange(statsRange.preset, next));
    renderStats();
    return;
  }
  const span = statsSpan();
  let end = shiftDateStr(statsRange.end, dir * span);
  if (end > today()) end = today();
  statsRange = { preset: "custom", offset: 0, start: shiftDateStr(end, -(span - 1)), end };
  renderStats();
}
function bucketKind() {
  const p = statsRange.preset;
  if (p === "week" || p === "month") return "day";
  if (p === "quarter") return "week";
  if (p === "half") return "month";
  return null;
}
function buildBuckets(start, end, forceUnit) {
  const span = daysBetween(start, end) + 1;
  const unit = forceUnit || (span <= 35 ? "day" : span <= 120 ? "week" : "month");
  if (unit === "day") {
    const items = [];
    for (let d = start; d <= end; d = shiftDateStr(d, 1)) {
      items.push({ from: d, to: d, label: String(Number(d.slice(8, 10))), day: Number(d.slice(8, 10)) });
    }
    return { unit: "日", kind: "day", items };
  }
  if (unit === "week") {
    const items = [];
    let d = start;
    while (d <= end) {
      const to = shiftDateStr(d, 6);
      const last = to > end ? end : to;
      items.push({ from: d, to: last, label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` });
      d = shiftDateStr(last, 1);
    }
    return { unit: "周", kind: "week", items };
  }
  const items = [];
  let cursor = start;
  while (cursor <= end) {
    const m = cursor.slice(0, 7);
    const mEnd = `${m}-${pad2(daysInMonth(m))}`;
    const to = mEnd > end ? end : mEnd;
    items.push({ from: cursor, to, label: `${Number(m.slice(5, 7))}月` });
    cursor = shiftDateStr(to, 1);
  }
  return { unit: "月", kind: "month", items };
}
function bucketSum(b, byDay) {
  let s = 0;
  for (let d = b.from; d <= b.to; d = shiftDateStr(d, 1)) s += byDay[d] || 0;
  return round2(s);
}

function renderStats() {
  const { start, end } = statsRange;
  const span = statsSpan();
  const cur = aggRange(start, end);
  const prevRange = statsRange.preset === "custom"
    ? { start: shiftDateStr(shiftDateStr(start, -1), -(span - 1)), end: shiftDateStr(start, -1) }
    : periodRange(statsRange.preset, statsRange.offset + 1);
  const prev = aggRange(prevRange.start, prevRange.end);

  $$("#statsRangeChips .seg-chip").forEach(b => b.classList.toggle("active", b.dataset.range === statsRange.preset));
  $("statsRangeLabel").textContent = rangeLabel(start, end);
  $("statsStart").value = start;
  $("statsEnd").value = end;
  $("statsCustomRow").classList.toggle("hidden", statsRange.preset !== "custom");
  $("statsPeriodHint").textContent = `共 ${span} 天`;
  const atLatest = statsRange.preset === "custom" ? end >= today() : statsRange.offset === 0;
  $("statsNext").disabled = atLatest;
  $("statsNext").style.opacity = atLatest ? ".35" : "";

  $("statsCards").innerHTML = `
    <div class="kpi"><span>总支出</span><strong class="expense">${money(cur.exp)}</strong>${deltaBadge(cur.exp, prev.exp, true)}</div>
    <div class="kpi"><span>总收入</span><strong class="income">${money(cur.inc)}</strong>${deltaBadge(cur.inc, prev.inc, false)}</div>
    <div class="kpi"><span>结余</span><strong>${money(cur.inc - cur.exp)}</strong><span class="delta">日均支出 ${money(cur.exp / span)}</span></div>
    <div class="kpi"><span>记账笔数</span><strong>${cur.count}</strong><span class="delta">日均 ${(cur.count / span).toFixed(1)} 笔</span></div>`;

  /* 支出构成 */
  const cats = Object.entries(cur.byCat).sort((x, y) => y[1] - x[1]);
  const top = cats.slice(0, 6);
  const rest = cats.slice(6).reduce((s, [, v]) => s + v, 0);
  const donutItems = top.map(([name, val], i) => ({ name, value: val, color: PALETTE[i % PALETTE.length] }));
  if (rest > 0) donutItems.push({ name: "其他分类", value: rest, color: "#94a3b8" });
  $("donutHint").textContent = cats.length ? `${cats.length} 个分类` : "";
  paintDonut(donutItems, cur.exp);

  $("categoryStats").innerHTML = cats.length ? cats.map(([name, val], i) => {
    const p = cur.exp ? val / cur.exp * 100 : 0;
    return `<div class="cat-row">
      <span class="nm"><span class="ico-badge" style="--h:${catHue(name)}">${getIcon(name)}</span><b>${safe(name)}</b></span>
      <span class="val">${money(val)} · ${pctText(p)}</span>
      <span class="bar"><i style="width:${Math.max(2, p)}%;background:${PALETTE[i % PALETTE.length]}"></i></span>
    </div>`;
  }).join("") : emptyHtml("chart", "该区间没有支出记录");

  /* 收入构成 */
  const incCats = Object.entries(cur.incCat).sort((x, y) => y[1] - x[1]);
  $("incomeStats").innerHTML = incCats.length ? incCats.map(([name, val], i) => {
    const p = cur.inc ? val / cur.inc * 100 : 0;
    return `<div class="cat-row">
      <span class="nm"><span class="ico-badge" style="--h:${catHue(name)}">${getIcon(name)}</span><b>${safe(name)}</b></span>
      <span class="val">${money(val)} · ${pctText(p)}</span>
      <span class="bar"><i style="width:${Math.max(2, p)}%;background:${PALETTE[(i + 1) % PALETTE.length]}"></i></span>
    </div>`;
  }).join("") : emptyHtml("income", "该区间没有收入记录");

  /* 近 6 个月 */
  const endMonth = end.slice(0, 7);
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(endMonth, -i));
  const series = months.map(m => {
    const st = `${m}-01`, en = `${m}-${pad2(daysInMonth(m))}`;
    const g = aggRange(st, en);
    return { m, inc: g.inc, exp: g.exp, start: st, end: en };
  });
  const maxV = Math.max(1, ...series.flatMap(s => [s.inc, s.exp]));
  $("trendChart").innerHTML = `
    <div class="trend">${series.map(s => `
      <button type="button" class="trend-col" data-range-start="${s.start}" data-range-end="${s.end}" aria-label="${monthLabel(s.m)}">
        <span class="trend-bars">
          <span class="trend-bar inc" style="height:${Math.max(s.inc ? 4 : 2, s.inc / maxV * 100)}%"></span>
          <span class="trend-bar exp" style="height:${Math.max(s.exp ? 4 : 2, s.exp / maxV * 100)}%"></span>
        </span>
        <span class="trend-label"${s.m === endMonth ? ' style="color:var(--c-primary);font-weight:800"' : ""}>${Number(s.m.slice(5))}月</span>
      </button>`).join("")}
    </div>
    <div class="trend-legend"><span><i style="background:var(--green)"></i>收入</span><span><i style="background:var(--c-primary)"></i>支出</span><span style="margin-left:auto">最高 ${money(maxV === 1 ? 0 : maxV)}</span></div>`;

  /* 按区间分桶的支出柱状图 */
  const buckets = buildBuckets(start, end, bucketKind());
  const vals = buckets.items.map(b => bucketSum(b, cur.byDay));
  const maxBucket = Math.max(...vals, 1);
  const peak = vals.indexOf(Math.max(...vals));
  const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const fmtMD = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  $("dailyTitle").textContent = buckets.kind === "day" ? "每日支出" : buckets.kind === "week" ? "每周支出" : "每月支出";
  $("dailyStats").innerHTML = buckets.items.map((b, i) => {
    const v = vals[i];
    const h = v ? Math.max(7, Math.sqrt(v / maxBucket) * 100) : 2;
    const cls = v ? (i === peak ? "peak" : "") : "zero";
    let label = "";
    if (buckets.kind === "day") {
      label = statsRange.preset === "week" ? weekLabels[parseDate(b.from).getDay()] : (b.day % 5 === 0 || i === 0 ? b.label : "");
    } else if (buckets.kind === "week") {
      label = i % 2 === 0 ? b.label : "";
    } else {
      label = b.label;
    }
    return `<span class="day-col" title="${b.from === b.to ? b.from : b.from + " ~ " + b.to} ${money(v)}">
      <span class="day-bar ${cls}" style="height:${h}%"></span>
      <span class="day-label">${label}</span>
    </span>`;
  }).join("");
  const active = vals.filter(v => v > 0).length;
  $("dailyHintTop").textContent = active ? `有支出 ${active} ${buckets.unit}` : "";
  $("dailyHint").innerHTML = `<span>日均 ${money(cur.exp / span)}</span><span>最高 ${money(Math.max(...vals))}${Math.max(...vals) > 0 ? " · " + fmtMD(buckets.items[peak].from) : ""}</span>`;

  renderCalendar();
}

/* ---------------- 支出日历 ---------------- */
function renderCalendar() {
  const month = statsRange.end.slice(0, 7);
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7));
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const dim = daysInMonth(month);
  const g = aggMonth(month);
  const max = Math.max(1, ...Object.values(g.byDay));
  const t = today();

  $("calDow").innerHTML = ["一", "二", "三", "四", "五", "六", "日"].map(d => `<span>${d}</span>`).join("");
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="cal-cell empty"></span>`;
  for (let d = 1; d <= dim; d++) {
    const ds = `${month}-${pad2(d)}`;
    const v = g.byDay[d] || 0;
    const ratio = v / max;
    const lv = !v ? "" : ratio <= 0.25 ? "lv1" : ratio <= 0.5 ? "lv2" : ratio <= 0.75 ? "lv3" : "lv4";
    cells += `<button type="button" class="cal-cell ${lv}${ds === t ? " today" : ""}${ds > t ? " future" : ""}" data-cal-day="${ds}" aria-label="${ds} ${money(v)}"><i class="fill"></i><span class="d">${d}</span></button>`;
  }
  $("calGrid").innerHTML = cells;
  $("calHint").textContent = `${y}年${mo}月 · ${money(g.exp)}`;
}
function openDay(ds) {
  const rows = sortRecordsDesc(state.records.filter(r => r.date === ds));
  let inc = 0, exp = 0;
  rows.forEach(r => { if (r.type === "income") inc += Number(r.amount) || 0; if (r.type === "expense") exp += Number(r.amount) || 0; });
  $("dayTitle").textContent = `${Number(ds.slice(5, 7))} 月 ${Number(ds.slice(8, 10))} 日 · ${weekdayCN(ds)}`;
  $("daySub").textContent = rows.length ? `支出 ${money(exp)} · 收入 ${money(inc)} · ${rows.length} 笔` : "这天没有账单";
  $("dayList").innerHTML = rows.length ? rows.map(r => {
    const cls = r.type === "income" ? "in" : r.type === "expense" ? "out" : "";
    const sign = r.type === "income" ? "+" : r.type === "expense" ? "−" : "";
    return `<div class="manage-item">
      <span class="ico-badge" style="--h:${r.type === "transfer" ? 222 : catHue(r.category)}">${r.type === "transfer" ? "↔️" : getIcon(r.category)}</span>
      <span class="nm">${safe(r.type === "transfer" ? "转账" : r.category)}${r.note ? `<br><span class="muted small">${safe(r.note)}</span>` : ""}<br><span class="muted small">${safe(acctName(r.accountId))}</span></span>
      <span class="bal record-amount ${cls}" style="font-size:12.5px">${sign}${money(r.amount)}</span>
    </div>`;
  }).join("") : emptyHtml("receipt", "这天还没有记录");
  openOverlay("dayOverlay");
}
function paintDonut(items, total) {
  const ring = $("donutRing");
  if (!total || !items.length) {
    ring.style.background = "var(--surface-3)";
    $("donutTotal").textContent = "¥0";
    $("donutLegend").innerHTML = `<span class="muted small">本月暂无支出</span>`;
    return;
  }
  let acc = 0;
  const stops = [];
  items.forEach((it, i) => {
    const from = acc;
    const to = acc + it.value / total * 100;
    const gap = items.length > 1 ? Math.min(0.7, (to - from) * 0.25) : 0;
    stops.push(`${it.color} ${from.toFixed(2)}% ${(to - gap).toFixed(2)}%`);
    if (i < items.length - 1) stops.push(`var(--surface) ${(to - gap).toFixed(2)}% ${to.toFixed(2)}%`);
    acc = to;
  });
  ring.style.background = `conic-gradient(from -90deg, ${stops.join(", ")})`;
  $("donutTotal").textContent = moneyShort(total);
  $("donutLegend").innerHTML = items.map(it => {
    const p = total ? it.value / total * 100 : 0;
    return `<span class="legend-row"><span class="dot" style="background:${it.color}"></span><span class="nm">${safe(it.name)}</span><span class="pct">${pctText(p)}</span></span>`;
  }).join("");
}

/* =========================================================
   预算
   ========================================================= */
let budgetMonth = monthNow();
function renderBudget() {
  if (budgetMonth > monthNow()) budgetMonth = monthNow();
  $("budgetMonthLabel").textContent = monthLabel(budgetMonth);
  $("budgetNext").disabled = budgetMonth >= monthNow();
  $("budgetNext").style.opacity = budgetMonth >= monthNow() ? ".35" : "";

  const spent = aggMonth(budgetMonth).exp;
  const budget = Number(state.budget[budgetMonth] || 0);
  $("budgetSpent").textContent = money(spent);
  $("budgetTotalText").textContent = budget ? money(budget) : "未设置";
  $("budgetAmount").value = budget ? String(budget) : "";
  $("budgetAmount").placeholder = budget ? "修改本月预算" : "输入本月预算";

  const pct = budget ? spent / budget * 100 : 0;
  const fill = $("budgetBarLgFill");
  fill.style.width = budget ? Math.min(100, pct) + "%" : "0%";
  fill.className = pct >= 100 ? "over" : pct >= 80 ? "warn" : "";
  $("budgetRemaining").textContent = budget ? money(budget - spent) : "—";
  $("budgetPercent").textContent = budget ? pct.toFixed(0) + "%" : "—";

  const dim = daysInMonth(budgetMonth);
  let leftDays;
  if (budgetMonth === monthNow()) leftDays = dim - new Date().getDate() + 1;
  else if (budgetMonth > monthNow()) leftDays = dim;
  else leftDays = 0;
  $("budgetDaily").textContent = budget && leftDays > 0 ? money(Math.max(0, budget - spent) / leftDays) : "—";

  const cb = state.catBudget[budgetMonth] || {};
  const names = Object.keys(cb).filter(n => Number(cb[n]) > 0);
  const catSpent = {};
  aggMonth(budgetMonth).rows.forEach(r => {
    if (r.type === "expense") catSpent[r.category] = (catSpent[r.category] || 0) + r.amount;
  });
  $("catBudgetList").innerHTML = names.length ? names.sort((x, y) => (catSpent[y] || 0) - (catSpent[x] || 0)).map(n => {
    const lim = Number(cb[n]) || 0;
    const used = catSpent[n] || 0;
    const p = lim ? used / lim * 100 : 0;
    return `<div class="cat-budget-row">
      <span class="nm">${getIcon(n)} ${safe(n)}</span>
      <span class="val">${money(used)} / ${money(lim)}${p >= 100 ? " · 已超支" : ""}</span>
      <span class="bar"><i class="${p >= 100 ? "over" : ""}" style="width:${Math.min(100, p)}%"></i></span>
    </div>`;
  }).join("") : `<p class="muted small" style="padding:4px 0 8px">还没有设置分类预算</p>`;
}

/* =========================================================
   记账面板
   ========================================================= */
const entry = { mode: "add", id: null, type: "expense", expr: "", cat: null, acct: "", toAcct: "", date: today(), note: "", freq: "none" };

function shiftDateByFreq(dateStr, freq) {
  const d = parseDate(dateStr);
  if (freq === "daily") d.setDate(d.getDate() + 1);
  else if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, daysInMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)));
  }
  return fmtDate(d);
}

function openEntry(opts) {
  opts = opts || {};
  const editing = opts.id ? state.records.find(r => r.id === opts.id) : null;
  entry.mode = editing ? "edit" : "add";
  entry.id = editing ? editing.id : null;
  entry.type = editing ? editing.type : "expense";
  entry.expr = editing ? String(editing.amount) : "";
  entry.cat = editing ? editing.category : null;
  entry.acct = editing ? editing.accountId : defaultAccountId();
  entry.toAcct = editing ? (editing.toAccountId || null) : null;
  entry.date = editing ? editing.date : today();
  entry.note = editing ? (editing.note || "") : "";
  entry.freq = "none";

  if (entry.type === "transfer") { entry.cat = "转账"; if (!entry.toAcct) entry.toAcct = state.accounts.find(a => a.id !== entry.acct)?.id || ""; }
  if (!entry.cat) entry.cat = (state.categories[entry.type === "income" ? "income" : "expense"][0] || {}).name || "其他";

  $("entryTitle").textContent = editing ? "编辑账单" : "记一笔";
  $("entrySave").textContent = editing ? "保存修改" : "保存";
  showEntryStep(editing || opts.detail ? "detail" : "amount");
  renderEntry();
  openOverlay("entryOverlay");
  setTimeout(() => { const n = $("entryNote"); if (editing && n) n.blur(); }, 50);
}
function showEntryStep(step) {
  $("entryStepAmount").classList.toggle("hidden", step !== "amount");
  $("entryStepDetail").classList.toggle("hidden", step !== "detail");
  if (step === "amount") {
    setTimeout(() => { try { $("entryNextBtn").focus({ preventScroll: true }); } catch { } }, 30);
  }
}
function evalExpr(raw) {
  const tokens = String(raw || "").replace(/×/g, "*").replace(/÷/g, "/").match(/(\d*\.?\d+)|[+\-*/]/g);
  if (!tokens || !tokens.length) return null;
  let pos = 0;
  const num = () => { const t = tokens[pos]; if (t === undefined || /[+\-*/]/.test(t)) return null; pos++; const v = Number(t); return Number.isFinite(v) ? v : null; };
  const term = () => {
    let v = num(); if (v === null) return null;
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos++]; const r = num(); if (r === null) return null;
      if (op === "/" && r === 0) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const exprFn = () => {
    let v = term(); if (v === null) return null;
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos++]; const r = term(); if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const out = exprFn();
  if (out === null || pos !== tokens.length || !Number.isFinite(out)) return null;
  return round2(out);
}
const entryValue = () => { const v = evalExpr(entry.expr); return v === null ? 0 : Math.abs(v); };

function renderEntry() {
  $$("#entryTypeSwitch button").forEach(b => b.classList.toggle("active", b.dataset.type === entry.type));
  const display = entry.expr === "" ? "0.00" : entry.expr.replace(/\*/g, "×").replace(/\//g, "÷").replace(/\+/g, " + ").replace(/-/g, " − ");
  const dispEl = $("entryAmountDisplay");
  dispEl.textContent = display;
  dispEl.style.fontSize = display.length > 16 ? "26px" : display.length > 12 ? "32px" : "";
  const val = entryValue();
  const hasOp = /[+\-*/]/.test(entry.expr);
  $("entryAmountPreview").textContent = hasOp && val ? "= " + money(val) : "";
  $("entryAmountSmall").innerHTML = `${money(val)}<small>${entry.type === "income" ? "收入" : entry.type === "transfer" ? "转账" : "支出"}</small>`;
  $("entryNextBtn").disabled = !(val > 0);

  const isTransfer = entry.type === "transfer";
  $("entryCatLabel").classList.toggle("hidden", isTransfer);
  $("entryCatGrid").classList.toggle("hidden", isTransfer);
  $("entryAccountLabel").textContent = isTransfer ? "转出账户" : "账户";
  $("entryTransferBox").classList.toggle("hidden", !isTransfer);

  if (!isTransfer) {
    const cats = state.categories[entry.type === "income" ? "income" : "expense"];
    if (!cats.some(c => c.name === entry.cat)) entry.cat = cats[0] ? cats[0].name : "其他";
    $("entryCatGrid").innerHTML = cats.map(c =>
      `<button type="button" class="cat-btn${c.name === entry.cat ? " active" : ""}" data-cat="${safe(c.name)}" style="--h:${catHue(c.name)}"><span class="ico">${c.icon}</span><span class="nm">${safe(c.name)}</span></button>`
    ).join("") + `<button type="button" class="cat-btn more" data-cat-edit="1"><span class="ico">＋</span><span class="nm">管理</span></button>`;
  }

  const accountChip = a => `<button type="button" class="chip${a.id === entry.acct ? " active" : ""}" data-acct="${safe(a.id)}">${safe(a.name)}</button>`;
  $("entryAccountChips").innerHTML = state.accounts.map(accountChip).join("");
  if (isTransfer) {
    if (!entry.toAcct || entry.toAcct === entry.acct) entry.toAcct = (state.accounts.find(a => a.id !== entry.acct) || {}).id || "";
    $("entryToAccountChips").innerHTML = state.accounts.filter(a => a.id !== entry.acct).map(a =>
      `<button type="button" class="chip${a.id === entry.toAcct ? " active" : ""}" data-toacct="${safe(a.id)}">${safe(a.name)}</button>`
    ).join("");
  }

  const t = today();
  const quick = [["今天", t], ["昨天", shiftDateStr(t, -1)], ["前天", shiftDateStr(t, -2)]];
  if (!quick.some(q => q[1] === entry.date)) quick.push([entry.date.slice(5).replace("-", "/"), entry.date]);
  $("entryDateChips").innerHTML = quick.map(([label, val]) =>
    `<button type="button" class="chip${val === entry.date ? " active" : ""}" data-date="${val}">${label}</button>`
  ).join("") + `<button type="button" class="chip" data-date="__pick">选择日期</button>`;
  $("entryDate").value = entry.date;

  const recentNotes = [];
  state.records.forEach(r => {
    if (!r.note || r.note.startsWith("自动") || r.note.includes("·自动")) return;
    if (entry.type !== "transfer" && r.type === entry.type && r.category !== entry.cat) return;
    if (entry.type === "transfer" && r.type !== "transfer") return;
    if (r.note !== entry.note && !recentNotes.includes(r.note)) recentNotes.push(r.note);
  });
  if (!recentNotes.length) {
    state.records.forEach(r => {
      if (r.note && r.note !== entry.note && !recentNotes.includes(r.note)) recentNotes.push(r.note);
    });
  }
  const pick = recentNotes.slice(-6).reverse();
  $("entryNoteChips").innerHTML = pick.length ? pick.map(n => `<button type="button" class="chip" data-note="${safe(n)}">${safe(n)}</button>`).join("") : "";
  $("entryNote").value = entry.note;
  $$("#entryFreqChips .chip").forEach(b => b.classList.toggle("active", b.dataset.freq === entry.freq));
}

function pressEntryKey(k) {
  if (k === "del") entry.expr = entry.expr.slice(0, -1);
  else if (k === "clear") entry.expr = "";
  else if (k === "=") {
    const v = evalExpr(entry.expr);
    if (v === null) { toast("算式不完整"); return; }
    entry.expr = String(v);
  } else if ("+-*/".includes(k)) {
    if (!entry.expr) { if (k !== "-") return; entry.expr = "-"; }
    else if ("+-*/".includes(entry.expr.slice(-1))) entry.expr = entry.expr.slice(0, -1) + k;
    else entry.expr += k;
  } else if (k === ".") {
    const seg = entry.expr.split(/[+\-*/]/).pop();
    if (seg.includes(".")) return;
    entry.expr += seg === "" ? "0." : ".";
  } else {
    const seg = entry.expr.split(/[+\-*/]/).pop();
    if (seg === "0") entry.expr = entry.expr.slice(0, -1) + k;
    else entry.expr += k;
  }
  if (entry.expr.length > 18) entry.expr = entry.expr.slice(0, 18);
  renderEntry();
}

function nextEntryStep() {
  const v = evalExpr(entry.expr);
  if (v === null || v <= 0) { toast("请输入大于 0 的金额"); return; }
  entry.expr = String(v);
  showEntryStep("detail");
  renderEntry();
}

function saveEntry() {
  const amount = entryValue();
  if (!(amount > 0)) { toast("请输入金额"); showEntryStep("amount"); return; }
  if (entry.type === "transfer") {
    if (!entry.toAcct || entry.toAcct === entry.acct) { toast("请选择不同的转出和转入账户"); return; }
  }
  const payload = {
    type: entry.type,
    amount: round2(amount),
    category: entry.type === "transfer" ? "转账" : (entry.cat || "其他"),
    accountId: entry.acct || defaultAccountId(),
    toAccountId: entry.type === "transfer" ? entry.toAcct : "",
    date: entry.date || today(),
    note: (entry.note || "").trim()
  };

  if (entry.mode === "edit" && entry.id) {
    const r = state.records.find(x => x.id === entry.id);
    if (r) Object.assign(r, payload);
    save(); closeOverlay("entryOverlay"); renderAll();
    toast("已更新");
    return;
  }

  const rec = { id: uid(), ...payload, created: Date.now() };
  state.records.push(rec);
  if (entry.freq && entry.freq !== "none") {
    state.recurring.push({
      id: uid(), type: rec.type, amount: rec.amount, category: rec.category,
      accountId: rec.accountId, note: rec.note, freq: entry.freq,
      nextDate: shiftDateByFreq(rec.date, entry.freq), enabled: true
    });
  }
  save(); closeOverlay("entryOverlay"); renderAll();
  toast(entry.freq !== "none" ? "已保存，并加入周期记账" : "已保存");
}

/* =========================================================
   账单操作
   ========================================================= */
function recordActions(id) {
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  openActions(`${r.type === "transfer" ? "转账" : r.category} · ${money(r.amount)}`, [
    { label: "编辑", onClick: () => openEntry({ id }) },
    {
      label: "复制到另一笔", onClick: () => {
        const copy = { ...r, id: uid(), date: today(), created: Date.now() };
        state.records.push(copy); save(); renderAll(); toast("已复制一笔到今天");
      }
    },
    {
      label: "删除", danger: true, onClick: () => {
        if (!confirm(`确定删除这笔 ${money(r.amount)} 的账单吗？`)) return;
        snapshot("删除账单");
        state.records = state.records.filter(x => x.id !== id);
        save(); renderAll(); toast("已删除");
      }
    }
  ]);
}

/* =========================================================
   活动
   ========================================================= */
function activityCalc(a) {
  const total = Number(a.total) || 0, people = Math.max(0, Number(a.people) || 0), extra = Number(a.extra) || 0;
  const per = people > 0 ? total / people : 0;
  const due = total + extra;
  return { total, people, extra, per: round2(per), due: round2(due), perExtra: people > 0 ? round2(due / people) : 0 };
}
function renderActivities() {
  const rows = [...state.activities].sort((x, y) => (y.date || "").localeCompare(x.date || "") || (y.created || 0) - (x.created || 0));
  let unpaid = 0, dueSum = 0, active = 0;
  rows.forEach(a => {
    const c = activityCalc(a);
    const remain = Math.max(0, c.due - (Number(a.received) || 0));
    dueSum += c.due; unpaid += remain;
    if (remain > 0.001) active++;
  });
  $("activitySummary").innerHTML = `
    <div><span>进行中</span><strong>${active} 个</strong></div>
    <div><span>未收合计</span><strong style="color:var(--amber)">${money(unpaid)}</strong></div>
    <div><span>累计应收</span><strong>${money(dueSum)}</strong></div>`;
  $("activityCount").textContent = rows.length ? `共 ${rows.length} 个` : "";

  $("activityList").innerHTML = rows.length ? rows.map(a => {
    const c = activityCalc(a);
    const received = Number(a.received) || 0;
    const remain = Math.max(0, c.due - received);
    const settled = remain <= 0.001;
    const p = c.due ? Math.min(100, received / c.due * 100) : 0;
    const hist = (a.history || []).slice(-3);
    return `<button type="button" class="record" data-activity="${safe(a.id)}">
      <span class="record-icon">🎯</span>
      <span class="record-main">
        <span class="record-name">${safe(a.name)}${settled ? '<span class="tag done">已收齐</span>' : remain > 0 ? '<span class="tag warn">待收</span>' : ""}</span>
        <span class="record-meta">${safe(a.date)} · ${c.people} 人 · 人均 ${money(c.per)}${c.extra ? " · 额外 " + money(c.extra) : ""}</span>
        <span class="record-meta">应收 ${money(c.due)} · 已收 ${money(received)} · 未收 ${money(remain)}</span>
        <span class="progress-line"><i style="width:${p}%"></i></span>
        ${hist.length ? `<span class="hist">${hist.map(h => `<span>${safe(h.date)} ${money(h.amount)}</span>`).join("")}</span>` : ""}
      </span>
      <span class="record-right">
        <span class="record-amount">${money(c.total)}</span>
        <span class="record-sub">${settled ? "已结清" : "点此收款"}</span>
      </span>
    </button>`;
  }).join("") : emptyHtml("activity", "还没有活动记录，聚餐、出游都可以记");
}
function activityActions(id) {
  const a = state.activities.find(x => x.id === id);
  if (!a) return;
  const c = activityCalc(a);
  const remain = Math.max(0, c.due - (Number(a.received) || 0));
  const items = [];
  if (remain > 0.001) items.push({ label: `登记收款（未收 ${money(remain)}）`, onClick: () => openQuick("activity", id) });
  items.push({ label: "编辑活动", onClick: () => openActivityEditor(id) });
  if ((a.history || []).length) items.push({ label: "撤销上一次收款", onClick: () => undoActivityReceive(id) });
  items.push({ label: "删除活动", danger: true, onClick: () => {
    if (!confirm(`删除活动「${a.name}」？`)) return;
    snapshot("删除活动");
    state.activities = state.activities.filter(x => x.id !== id);
    save(); renderActivities(); renderHome(); toast("已删除");
  }});
  openActions(a.name, items);
}
function undoActivityReceive(id) {
  const a = state.activities.find(x => x.id === id);
  if (!a || !(a.history || []).length) return;
  const last = a.history[a.history.length - 1];
  if (!confirm(`撤销 ${last.date} 的收款 ${money(last.amount)}？`)) return;
  a.history.pop();
  a.received = round2(Math.max(0, (Number(a.received) || 0) - (Number(last.amount) || 0)));
  if (last.recordId) state.records = state.records.filter(r => r.id !== last.recordId);
  save(); renderActivities(); renderHome(); toast("已撤销");
}
function openActivityEditor(id) {
  const a = state.activities.find(x => x.id === id);
  if (!a) return;
  $("actTitle").textContent = "编辑活动";
  $("actEditName").value = a.name;
  $("actEditDate").value = a.date;
  $("actEditTotal").value = a.total;
  $("actEditPeople").value = a.people;
  $("actEditExtra").value = a.extra || 0;
  $("actEditNote").value = a.note || "";
  $("actOverlay").dataset.id = id;
  openOverlay("actOverlay");
}

/* =========================================================
   借还
   ========================================================= */
function renderLoans() {
  const rows = [...state.loans].sort((x, y) => (y.date || "").localeCompare(x.date || "") || (y.created || 0) - (x.created || 0));
  const { lent, borrowed } = loanTotals();
  $("loanSummary").innerHTML = `
    <div><span>待收（借出）</span><strong style="color:var(--green)">${money(lent)}</strong></div>
    <div><span>待还（借入）</span><strong style="color:var(--red)">${money(borrowed)}</strong></div>
    <div><span>净额（借出−借入）</span><strong>${money(lent - borrowed)}</strong></div>`;
  $("loanCount").textContent = rows.length ? `共 ${rows.length} 条` : "";

  $("loanList").innerHTML = rows.length ? rows.map(l => {
    const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
    const done = remain <= 0.001;
    const p = Number(l.amount) ? Math.min(100, (Number(l.repaid) || 0) / Number(l.amount) * 100) : 0;
    const hist = (l.history || []).slice(-3);
    return `<button type="button" class="record" data-loan="${safe(l.id)}">
      <span class="record-icon ${l.type === "lent" ? "income" : "expense"}">${l.type === "lent" ? "↗️" : "↙️"}</span>
      <span class="record-main">
        <span class="record-name">${l.type === "lent" ? "借给" : "向"} ${safe(l.person)}${done ? '<span class="tag done">已结清</span>' : ""}</span>
        <span class="record-meta">${safe(l.date)}${l.note ? " · " + safe(l.note) : ""}</span>
        <span class="record-meta">已还 ${money(l.repaid || 0)} · 剩余 ${money(remain)}</span>
        <span class="progress-line"><i style="width:${p}%"></i></span>
        ${hist.length ? `<span class="hist">${hist.map(h => `<span>${safe(h.date)} ${money(h.amount)}</span>`).join("")}</span>` : ""}
      </span>
      <span class="record-right">
        <span class="record-amount">${money(l.amount)}</span>
        <span class="record-sub">${done ? "已结清" : l.type === "lent" ? "点此收款" : "点此还款"}</span>
      </span>
    </button>`;
  }).join("") : emptyHtml("loan", "还没有借还记录");
}
function loanActions(id) {
  const l = state.loans.find(x => x.id === id);
  if (!l) return;
  const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
  const items = [];
  if (remain > 0.001) items.push({ label: l.type === "lent" ? "登记收回" : "登记还款", onClick: () => openQuick("loan", id) });
  items.push({ label: "编辑", onClick: () => openLoanEditor(id) });
  if ((l.history || []).length) items.push({ label: "撤销上一次还款", onClick: () => undoLoanRepay(id) });
  items.push({ label: "删除", danger: true, onClick: () => {
    if (!confirm("删除这条借还记录？")) return;
    snapshot("删除借还");
    state.loans = state.loans.filter(x => x.id !== id);
    save(); renderLoans(); renderHome(); toast("已删除");
  }});
  openActions(`${l.type === "lent" ? "借给" : "向"} ${l.person} · 剩余 ${money(remain)}`, items);
}
function undoLoanRepay(id) {
  const l = state.loans.find(x => x.id === id);
  if (!l || !(l.history || []).length) return;
  const last = l.history[l.history.length - 1];
  if (!confirm(`撤销 ${last.date} 的还款 ${money(last.amount)}？`)) return;
  l.history.pop();
  l.repaid = round2(Math.max(0, (Number(l.repaid) || 0) - (Number(last.amount) || 0)));
  if (last.recordId) state.records = state.records.filter(r => r.id !== last.recordId);
  save(); renderLoans(); renderHome(); toast("已撤销");
}
function openLoanEditor(id) {
  const l = state.loans.find(x => x.id === id);
  if (!l) return;
  $("loanTitle").textContent = "编辑借还";
  $("loanEditType").value = l.type;
  $("loanEditPerson").value = l.person;
  $("loanEditAmount").value = l.amount;
  $("loanEditDate").value = l.date;
  $("loanEditNote").value = l.note || "";
  $("loanOverlay").dataset.id = id;
  openOverlay("loanOverlay");
}

/* ---------------- 快捷收款 / 还款 ---------------- */
const quickCtx = { mode: "", id: "" };
function openQuick(mode, id) {
  quickCtx.mode = mode; quickCtx.id = id;
  $("quickDate").value = today();
  $("quickAutoRecord").checked = mode === "activity";
  if (mode === "loan") {
    const l = state.loans.find(x => x.id === id);
    if (!l) return;
    const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
    $("quickTitle").textContent = l.type === "lent" ? `收回 ${l.person} 的欠款` : `还给 ${l.person}`;
    $("quickSub").textContent = `原始金额 ${money(l.amount)}，剩余 ${money(remain)}`;
    $("quickAmount").value = remain ? remain.toFixed(2) : "";
    $("quickAutoLabel").textContent = l.type === "lent" ? "同时记一笔收入（钱已收回）" : "同时记一笔支出（钱已还出）";
    const chips = [];
    if (remain > 0) chips.push(`<button type="button" class="chip" data-amt="${remain.toFixed(2)}">全部 ${money(remain)}</button>`);
    if (remain > 0.02) chips.push(`<button type="button" class="chip" data-amt="${(remain / 2).toFixed(2)}">还一半</button>`);
    $("quickChips").innerHTML = chips.join("");
  } else {
    const a = state.activities.find(x => x.id === id);
    if (!a) return;
    const c = activityCalc(a);
    const remain = Math.max(0, c.due - (Number(a.received) || 0));
    $("quickTitle").textContent = `收款 · ${a.name}`;
    $("quickSub").textContent = `应收 ${money(c.due)}，已收 ${money(a.received || 0)}，未收 ${money(remain)}`;
    $("quickAmount").value = remain ? remain.toFixed(2) : "";
    $("quickAutoLabel").textContent = "同时记一笔收入账单";
    $("quickChips").innerHTML = remain > 0 ? `<button type="button" class="chip" data-amt="${remain.toFixed(2)}">全部收齐 ${money(remain)}</button>` : "";
  }
  openOverlay("quickOverlay");
}
function saveQuick() {
  const amt = round2($("quickAmount").value);
  const date = $("quickDate").value || today();
  const auto = $("quickAutoRecord").checked;
  if (!(amt > 0)) { toast("请输入有效金额"); return; }
  const accountId = defaultAccountId();

  if (quickCtx.mode === "loan") {
    const l = state.loans.find(x => x.id === quickCtx.id);
    if (!l) return;
    const remain = Math.max(0, Number(l.amount) - Number(l.repaid || 0));
    if (amt > remain + 0.001) { toast("金额超过未还金额"); return; }
    l.repaid = round2(Number(l.repaid || 0) + amt);
    const h = { date, amount: amt, ts: Date.now() };
    if (auto) {
      const rec = {
        id: uid(), type: l.type === "lent" ? "income" : "expense", amount: amt,
        category: l.type === "lent" ? "其他收入" : "其他", accountId, date,
        note: `${l.type === "lent" ? "收回" : "还款"} · ${l.person}`, created: Date.now()
      };
      state.records.push(rec); h.recordId = rec.id;
    }
    (l.history = l.history || []).push(h);
    save(); closeOverlay("quickOverlay"); renderAll(); toast("已登记");
  } else {
    const a = state.activities.find(x => x.id === quickCtx.id);
    if (!a) return;
    const c = activityCalc(a);
    const remain = Math.max(0, c.due - (Number(a.received) || 0));
    if (amt > remain + 0.001) { toast("金额超过未收金额"); return; }
    a.received = round2(Number(a.received || 0) + amt);
    const h = { date, amount: amt, ts: Date.now() };
    if (auto) {
      const rec = {
        id: uid(), type: "income", amount: amt, category: "活动", accountId, date,
        note: `收款 · ${a.name}`, created: Date.now()
      };
      state.records.push(rec); h.recordId = rec.id;
    }
    (a.history = a.history || []).push(h);
    save(); closeOverlay("quickOverlay"); renderAll(); toast("已收款");
  }
}

/* =========================================================
   周期记账
   ========================================================= */
const FREQ_LABEL = { daily: "每天", weekly: "每周", monthly: "每月" };
function checkRecurring() {
  const t = today();
  let changed = false;
  state.recurring.forEach(rule => {
    if (rule.enabled === false) return;
    let guard = 0;
    while (rule.nextDate && rule.nextDate <= t && guard++ < 200) {
      state.records.push({
        id: uid(), type: rule.type, amount: rule.amount, category: rule.category,
        accountId: rule.accountId || defaultAccountId(), toAccountId: "",
        date: rule.nextDate, note: rule.note ? rule.note + "·自动" : "自动记账", created: Date.now()
      });
      rule.nextDate = shiftDateByFreq(rule.nextDate, rule.freq);
      changed = true;
    }
  });
  if (changed) save();
}
function renderRecurring() {
  const list = state.recurring;
  $("recurringList").innerHTML = list.length ? list.map(r => `
    <div class="manage-item">
      <span class="nm">${getIcon(r.category)} ${safe(r.category)} ${money(r.amount)}<br>
        <span class="muted small">${FREQ_LABEL[r.freq]} · 下次 ${r.nextDate}${r.enabled === false ? " · 已暂停" : ""}</span>
      </span>
      <button type="button" class="switch ${r.enabled !== false ? "on" : ""}" data-rrec="${safe(r.id)}" aria-label="启用"></button>
      <button type="button" class="mini-btn danger" data-rdel="${safe(r.id)}">删除</button>
    </div>`).join("") : `<p class="muted small" style="padding:8px 2px">还没有周期规则。记账时在「重复」里设置一次即可。</p>`;
}

/* =========================================================
   设置
   ========================================================= */
function renderThemeSwatches() {
  $("themeSwatches").innerHTML = THEMES.map(t =>
    `<button type="button" class="swatch${state.settings.themeColor === t.id ? " active" : ""}" data-id="${t.id}" style="background:${t.hex}" aria-label="${t.name}"></button>`
  ).join("");
  $("inkSwatches").innerHTML = INKS.map(i =>
    `<button type="button" class="swatch${state.settings.fontColor === i.id ? " active" : ""}" data-id="${i.id}" style="background:${i.hex}" aria-label="${i.name}"></button>`
  ).join("");
  applyTheme();
}
function renderFontSelect() {
  $("fontSelect").innerHTML = FONTS.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
  $("fontSelect").value = state.settings.fontFamily;
}
const BGS = [
  { id: "auto", name: "默认", css: "linear-gradient(135deg,#eef2ff,#e6f0ff 48%,#f6ecff)" },
  { id: "plain", name: "纯色", css: "linear-gradient(135deg,#f7f8fb,#eef1f8)" },
  { id: "paper", name: "纸纹", css: "linear-gradient(135deg,#fbf9f3,#efe9dd)" },
  { id: "mint", name: "薄荷", css: "linear-gradient(135deg,#e2fbf1,#e2f2ff)" },
  { id: "sunset", name: "日落", css: "linear-gradient(135deg,#ffefe3,#ffe4ee)" },
  { id: "night", name: "夜蓝", css: "linear-gradient(135deg,#e6eaff,#efe4ff)" }
];
function renderBgSwatches() {
  const el = $("bgSwatches");
  if (!el) return;
  el.innerHTML = BGS.map(b =>
    `<button type="button" class="bg-swatch${state.settings.bg === b.id ? " active" : ""}" data-bg-id="${b.id}" style="background:${b.css}"><b>${b.name}</b></button>`
  ).join("");
}
function renderSettings() {
  renderThemeSwatches();
  renderFontSelect();
  renderBgSwatches();
  applySurface();
  $$("#modeSeg button").forEach(b => b.classList.toggle("active", b.dataset.mode === state.settings.mode));
  $("hideSwitch").classList.toggle("on", !!state.settings.hideAmounts);
  $("oledSwitch").classList.toggle("on", !!state.settings.oled);
  $("autoLockSelect").value = String(state.settings.autoLock);
  $("pinSwitch").classList.toggle("on", hasPin());
  $("defaultAccount").innerHTML = state.accounts.map(a => `<option value="${safe(a.id)}">${safe(a.name)}</option>`).join("");
  $("defaultAccount").value = defaultAccountId();
  renderStorageInfo();
}
function renderStorageInfo() {
  let size = 0;
  try { size = new Blob([JSON.stringify(state)]).size; } catch { size = (localStorage.getItem(KEY) || "").length; }
  const kb = size / 1024;
  $("storageInfo").textContent = `${state.records.length} 笔账单 · 数据约 ${kb < 1024 ? kb.toFixed(1) + " KB" : (kb / 1024).toFixed(2) + " MB"}`;
  const snaps = readSnaps();
  const last = snaps[0] ? new Date(snaps[0].ts) : null;
  $("storageBar").style.width = clamp(kb / 5120 * 100, 1, 100) + "%";
  $("storageInfo").title = last ? `最近快照：${last.toLocaleString("zh-CN")}` : "";
}

/* ---------------- 账户管理 ---------------- */
function renderAccountManage() {
  $("accountList").innerHTML = state.accounts.map(a => `
    <div class="manage-item">
      <span class="nm">${safe(a.name)}</span>
      <span class="bal">${money(acctBalance(a.id))}</span>
      <button type="button" class="mini-btn" data-editacc="${safe(a.id)}">初始</button>
      <button type="button" class="mini-btn danger" data-delacc="${safe(a.id)}">删除</button>
    </div>`).join("");
}
function renderAssets() {
  const { lent, borrowed } = loanTotals();
  const cash = state.accounts.reduce((s, a) => s + acctBalance(a.id), 0);
  $("assetsSub").textContent = `共 ${state.accounts.length} 个账户 · 数据只在本机`;
  $("assetsSummary").innerHTML = `
    <div><span>账户余额</span><strong>${money(cash)}</strong></div>
    <div><span>借出待收</span><strong style="color:var(--green)">${money(lent)}</strong></div>
    <div><span>借入待还</span><strong style="color:var(--red)">${money(borrowed)}</strong></div>`;
  $("assetsList").innerHTML = state.accounts.map(a => `
    <div class="manage-item">
      <span class="nm">${safe(a.name)}</span>
      <span class="bal">${money(acctBalance(a.id))}</span>
    </div>`).join("");
  $("assetsNet").innerHTML = `<span>净资产</span><span>${money(cash + lent - borrowed)}</span>`;
}

/* ---------------- 分类管理 ---------------- */
let catType = "expense";
const EMOJIS = {
  food: ["🍜", "🍚", "🍔", "🍕", "🍣", "🍰", "🍺", "☕", "🍎", "🍉", "🥩", "🍤", "🥗", "🍦", "🍩", "🧋", "🥘", "🍛", "🍝", "🥟"],
  traffic: ["🚗", "🚕", "🚌", "🚇", "🚄", "✈️", "🚢", "🚲", "🛵", "⛽", "🅿️", "🚦", "🛞", "🎫"],
  shopping: ["🛍️", "👗", "👟", "💄", "💍", "👜", "🧸", "📱", "💻", "⌚", "🎁", "🧴", "📦", "🪥"],
  life: ["🏠", "💡", "🚰", "🛋️", "🧹", "🧺", "💊", "🏥", "🏫", "💈", "🛁", "🔑", "🪴", "🐱"],
  fun: ["🎮", "🎬", "🎤", "🎧", "🎳", "🎯", "🎲", "🎸", "🎨", "⚽", "🏀", "🏋️", "🏕️", "🏖️"],
  work: ["💼", "💰", "💳", "📈", "🏦", "🧑‍💻", "📚", "✏️", "📁", "⏰", "📅", "🧾"],
  other: ["📌", "❤️", "🔥", "✨", "🎉", "🧧", "↩️", "💸", "🤝", "↔️", "🔔", "⭐"]
};
function renderCatManage() {
  const list = state.categories[catType];
  $("catList").innerHTML = list.length ? list.map((c, i) => `
    <div class="manage-item"><span class="nm">${c.icon} ${safe(c.name)}</span>
      <button type="button" class="mini-btn danger" data-delcat="${i}">删除</button></div>`).join("")
    : `<p class="muted small">暂无分类</p>`;
  $$("#catTypeSeg button").forEach(b => b.classList.toggle("active", b.dataset.cattype === catType));
}
function renderEmojiGrid(type) {
  $("emojiGrid").innerHTML = (EMOJIS[type] || EMOJIS.food).map(e =>
    `<span${e === $("newCatIcon").value.trim() ? ' class="sel"' : ""}>${e}</span>`).join("");
}

/* ---------------- 分类预算 ---------------- */
function renderCatBudgetForm() {
  const cur = state.catBudget[budgetMonth] || {};
  $("catBudgetSub").textContent = `月份：${monthLabel(budgetMonth)}，留空表示不限制`;
  $("catBudgetForm").innerHTML = `<div class="form-grid">` + state.categories.expense.map(c => `
    <label class="field"><span>${c.icon} ${safe(c.name)}</span>
      <input type="text" inputmode="decimal" data-cb="${safe(c.name)}" value="${cur[c.name] ? Number(cur[c.name]) : ""}" placeholder="不限">
    </label>`).join("") + `</div>`;
}

/* ---------------- 密码锁 ---------------- */
let pinBuffer = "", pinFails = 0, pinLockUntil = 0, pinPurpose = "set";
const hasPin = () => !!(state.settings.pinHash || state.settings.pin);

async function hashPin(pin) {
  try {
    if (crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("my-ledger|" + pin));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { }
  return "plain:" + pin;
}
async function verifyPin(pin) {
  if (state.settings.pinHash) return (await hashPin(pin)) === state.settings.pinHash;
  return state.settings.pin ? pin === state.settings.pin : false;
}
function renderPinDots() {
  $$("#pinDots span").forEach((s, i) => s.classList.toggle("filled", i < pinBuffer.length));
}
function lockApp() {
  if (!hasPin()) return;
  pinBuffer = "";
  renderPinDots();
  $("lockScreen").classList.remove("hidden");
  $("lockSub").textContent = pinLockUntil > Date.now()
    ? "尝试次数过多，请稍后再试" : "请输入 4 位数字密码";
}
function unlockApp() {
  $("lockScreen").classList.add("hidden");
  pinBuffer = ""; pinFails = 0; pinLockUntil = 0;
  renderPinDots();
}
async function tryPin() {
  if (pinLockUntil > Date.now()) { toast("请稍后再试"); pinBuffer = ""; renderPinDots(); return; }
  if (await verifyPin(pinBuffer)) {
    if (state.settings.pin && !state.settings.pinHash) {
      state.settings.pinHash = await hashPin(state.settings.pin);
      state.settings.pin = "";
      save();
    }
    unlockApp();
  } else {
    pinFails++;
    pinBuffer = ""; renderPinDots();
    if (pinFails >= 5) { pinLockUntil = Date.now() + 30000; $("lockSub").textContent = "尝试次数过多，30 秒后再试"; }
    toast("密码错误");
  }
}

/* ---------------- 导出 / 导入 ---------------- */
function download(name, content, type, bom) {
  const parts = bom ? ["\ufeff", content] : [content];
  const blob = new Blob(parts, { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportJson() {
  snapshot("导出前");
  state.meta.lastBackupAt = Date.now();
  save();
  download(`我的账本备份-${today()}.json`, JSON.stringify({ app: "my-ledger", version: 3, exportedAt: new Date().toISOString(), state }, null, 2), "application/json;charset=utf-8");
  renderStorageInfo();
  toast("备份已导出");
}
function exportCsv() {
  const header = ["日期", "类型", "分类", "金额", "账户", "转入账户", "备注"];
  const rows = sortRecordsDesc(state.records).reverse().map(r => [
    r.date, { expense: "支出", income: "收入", transfer: "转账" }[r.type] || r.type,
    r.category, r.amount, acctName(r.accountId), r.toAccountId ? acctName(r.toAccountId) : "", r.note || ""
  ]);
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  download(`我的账单-${today()}.csv`, csv, "text/csv;charset=utf-8", true);
  toast("CSV 已导出");
}
function exportExcel() {
  let html = '<html><head><meta charset="utf-8"></head><body><table border="1"><tr><th>日期</th><th>类型</th><th>分类</th><th>金额</th><th>账户</th><th>转入账户</th><th>备注</th></tr>';
  sortRecordsDesc(state.records).reverse().forEach(r => {
    html += `<tr><td>${r.date}</td><td>${{ expense: "支出", income: "收入", transfer: "转账" }[r.type] || r.type}</td><td>${safe(r.category)}</td><td>${r.amount}</td><td>${safe(acctName(r.accountId))}</td><td>${r.toAccountId ? safe(acctName(r.toAccountId)) : ""}</td><td>${safe(r.note || "")}</td></tr>`;
  });
  html += '</table></body></html>';
  download(`我的账单-${today()}.xls`, html, "application/vnd.ms-excel;charset=utf-8", true);
  toast("Excel 已导出");
}
function exportActivitiesCsv() {
  const header = ["日期", "活动名称", "总金额", "人数", "每人AA", "额外收取", "应收合计", "已收", "未收", "含额外人均", "备注"];
  const rows = [...state.activities].sort((a, b) => a.date.localeCompare(b.date)).map(a => {
    const c = activityCalc(a);
    const remain = Math.max(0, c.due - (Number(a.received) || 0));
    return [a.date, a.name, c.total, c.people, c.per, c.extra, c.due, round2(a.received || 0), round2(remain), c.perExtra, a.note || ""];
  });
  download(`我的活动-${today()}.csv`, [header, ...rows].map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n"), "text/csv;charset=utf-8", true);
  toast("活动 CSV 已导出");
}

function importPayload(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.state && Array.isArray(obj.state.records)) return obj.state;
  if (Array.isArray(obj.records)) return obj;
  return null;
}
function doImportReplace(raw) {
  snapshot("导入覆盖前");
  const keepSettings = state.settings;
  state = normalize(raw);
  state.settings = { ...state.settings, ...keepSettings };
  save(); applyAllVisual(); renderAll();
  toast("已覆盖导入");
}
function doImportMerge(raw) {
  snapshot("导入合并前");
  const incoming = normalize(raw);
  const seen = new Set(state.records.map(r => r.id));
  incoming.records.forEach(r => { if (!seen.has(r.id)) { state.records.push(r); seen.add(r.id); } });

  incoming.accounts.forEach(a => {
    if (!state.accounts.some(x => x.id === a.id || x.name === a.name)) state.accounts.push(a);
  });
  ["expense", "income"].forEach(t => {
    incoming.categories[t].forEach(c => {
      if (!state.categories[t].some(x => x.name === c.name)) state.categories[t].push(c);
    });
  });
  Object.entries(incoming.budget).forEach(([m, v]) => { if (!state.budget[m]) state.budget[m] = v; });
  Object.entries(incoming.catBudget).forEach(([m, map]) => {
    state.catBudget[m] = state.catBudget[m] || {};
    Object.entries(map).forEach(([k, v]) => { if (!state.catBudget[m][k]) state.catBudget[m][k] = v; });
  });
  const loanIds = new Set(state.loans.map(l => l.id));
  incoming.loans.forEach(l => { if (!loanIds.has(l.id)) state.loans.push(l); });
  const actIds = new Set(state.activities.map(a => a.id));
  incoming.activities.forEach(a => { if (!actIds.has(a.id)) state.activities.push(a); });
  const recIds = new Set(state.recurring.map(r => r.id));
  incoming.recurring.forEach(r => { if (!recIds.has(r.id)) state.recurring.push(r); });

  save(); renderAll();
  toast("已合并导入");
}
async function handleImportFile(file) {
  if (!file) return;
  let raw = null;
  try {
    const text = (await file.text()).replace(/^\ufeff/, "");
    raw = JSON.parse(text);
  } catch { toast("文件不是有效的 JSON"); return; }
  const payload = importPayload(raw);
  if (!payload) { toast("备份格式不正确"); return; }
  const count = Array.isArray(payload.records) ? payload.records.length : 0;
  openActions(`备份含 ${count} 笔账单，选择导入方式`, [
    { label: "合并到现有数据（推荐）", onClick: () => doImportMerge(payload) },
    { label: "覆盖现有数据", danger: true, onClick: () => { if (confirm("将清空当前数据并恢复备份，确定吗？")) doImportReplace(payload); } }
  ]);
}

/* ---------------- 快照 ---------------- */
function renderSnapshots() {
  const list = readSnaps();
  $("snapshotList").innerHTML = list.length ? list.map((s, i) => {
    let count = 0;
    try { count = (JSON.parse(s.data).records || []).length; } catch { }
    const d = new Date(s.ts);
    return `<div class="manage-item">
      <span class="nm">${d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${safe(s.tag || "快照")}<br><span class="muted small">${count} 笔账单</span></span>
      <button type="button" class="mini-btn" data-restore="${i}">恢复</button>
    </div>`;
  }).join("") : `<p class="muted small" style="padding:8px 2px">还没有快照，首次修改后会自动生成</p>`;
}

/* =========================================================
   渲染总入口
   ========================================================= */
function renderAll() {
  renderHome(); renderRecords(); renderStats(); renderBudget();
  renderActivities(); renderLoans();
  renderAccountManage(); renderSettings();
  if (state.settings.pin && !state.settings.pinHash) {
    hashPin(state.settings.pin).then(h => { if (h) { state.settings.pinHash = h; state.settings.pin = ""; save(); } });
  }
}

/* =========================================================
   事件绑定
   ========================================================= */
function bindEvents() {
  /* 全局点击 */
  document.addEventListener("click", e => {
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) { go(goBtn.dataset.go); return; }
    const tab = e.target.closest(".tab[data-page]");
    if (tab) { go(tab.dataset.page); return; }

    const rec = e.target.closest("[data-record]");
    if (rec) { recordActions(rec.dataset.record); return; }
    const loan = e.target.closest("[data-loan]");
    if (loan) { loanActions(loan.dataset.loan); return; }
    const act = e.target.closest("[data-activity]");
    if (act) { activityActions(act.dataset.activity); return; }

    const actItem = e.target.closest("[data-action-index]");
    if (actItem) {
      const fn = actionHandlers[Number(actItem.dataset.actionIndex)];
      closeOverlay("actionOverlay");
      if (fn) setTimeout(fn, 60);
      return;
    }
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) {
      const ov = closeBtn.closest(".overlay");
      if (ov) closeOverlay(ov.id);
      return;
    }
    if (e.target.classList && e.target.classList.contains("overlay")) {
      closeOverlay(e.target.id);
      return;
    }
    const calCell = e.target.closest("[data-cal-day]");
    if (calCell) { openDay(calCell.dataset.calDay); return; }
    const trendCol = e.target.closest("[data-range-start]");
    if (trendCol) {
      statsRange = { preset: "custom", start: trendCol.dataset.rangeStart, end: trendCol.dataset.rangeEnd };
      renderStats();
      return;
    }
  });

  /* 顶栏 / FAB */
  $("privacyBtn").addEventListener("click", () => {
    state.settings.hideAmounts = !state.settings.hideAmounts;
    save(); applyPrivacy(); toast(state.settings.hideAmounts ? "金额已隐藏" : "金额已显示");
  });
  $("settingsBtn").addEventListener("click", () => go("settings"));
  $("fabBtn").addEventListener("click", () => openEntry());
  $("btnAssets").addEventListener("click", () => { renderAssets(); openOverlay("assetsOverlay"); });

  /* 记账面板 */
  $("entryCancel").addEventListener("click", () => closeOverlay("entryOverlay"));
  $("entryOverlay").addEventListener("click", e => { if (e.target.id === "entryOverlay") closeOverlay("entryOverlay"); });
  $$("#entryTypeSwitch button").forEach(b => b.addEventListener("click", () => {
    entry.type = b.dataset.type;
    if (entry.type === "transfer") { entry.cat = "转账"; if (!entry.toAcct || entry.toAcct === entry.acct) entry.toAcct = (state.accounts.find(a => a.id !== entry.acct) || {}).id || ""; }
    else entry.cat = (state.categories[entry.type === "income" ? "income" : "expense"][0] || {}).name || "其他";
    renderEntry();
  }));
  $("entryKeypad").addEventListener("click", e => {
    const btn = e.target.closest("[data-k]");
    if (btn) pressEntryKey(btn.dataset.k);
  });
  $("entryNextBtn").addEventListener("click", nextEntryStep);
  $("entryBack").addEventListener("click", () => { showEntryStep("amount"); renderEntry(); });
  $("entrySave").addEventListener("click", saveEntry);
  $("entryCatGrid").addEventListener("click", e => {
    const manage = e.target.closest("[data-cat-edit]");
    if (manage) { openCatManager(); return; }
    const btn = e.target.closest("[data-cat]");
    if (btn) { entry.cat = btn.dataset.cat; renderEntry(); }
  });
  $("entryAccountChips").addEventListener("click", e => {
    const btn = e.target.closest("[data-acct]");
    if (btn) { entry.acct = btn.dataset.acct; renderEntry(); }
  });
  $("entryToAccountChips").addEventListener("click", e => {
    const btn = e.target.closest("[data-toacct]");
    if (btn) { entry.toAcct = btn.dataset.toacct; renderEntry(); }
  });
  $("entryDateChips").addEventListener("click", e => {
    const btn = e.target.closest("[data-date]");
    if (!btn) return;
    if (btn.dataset.date === "__pick") { $("entryDatePickerRow").classList.remove("hidden"); setTimeout(() => { try { $("entryDate").showPicker?.(); } catch { } }, 20); return; }
    entry.date = btn.dataset.date;
    $("entryDatePickerRow").classList.add("hidden");
    renderEntry();
  });
  $("entryDate").addEventListener("change", e => {
    if (e.target.value) { entry.date = e.target.value; renderEntry(); }
  });
  $("entryNote").addEventListener("input", e => { entry.note = e.target.value; });
  $("entryNoteChips").addEventListener("click", e => {
    const btn = e.target.closest("[data-note]");
    if (btn) { entry.note = btn.dataset.note; $("entryNote").value = entry.note; }
  });
  $("entryFreqChips").addEventListener("click", e => {
    const btn = e.target.closest("[data-freq]");
    if (btn) { entry.freq = btn.dataset.freq; renderEntry(); }
  });
  $("entryManageCats").addEventListener("click", openCatManager);

  /* 明细筛选 */
  $("searchRecords").addEventListener("input", e => { recFilter.q = e.target.value; renderRecords(); });
  $$("#filterTypeChips .seg-chip").forEach(b => b.addEventListener("click", () => {
    recFilter.type = b.dataset.ft; renderRecords();
  }));
  $("filterAccount").addEventListener("change", e => { recFilter.account = e.target.value; renderRecords(); });
  $("recordsPrev").addEventListener("click", () => {
    recFilter.allMonths = false;
    recFilter.month = shiftMonth(recFilter.month, -1);
    renderRecords();
  });
  $("recordsNext").addEventListener("click", () => {
    recFilter.allMonths = false;
    const next = shiftMonth(recFilter.month, 1);
    recFilter.month = next > monthNow() ? monthNow() : next;
    renderRecords();
  });
  $("recordsMonthAll").addEventListener("click", () => {
    recFilter.allMonths = !recFilter.allMonths;
    if (!recFilter.allMonths) recFilter.month = monthNow();
    renderRecords();
  });

  /* 统计：区间切换 */
  $("statsRangeChips").addEventListener("click", e => {
    const b = e.target.closest("[data-range]");
    if (b) setStatsPreset(b.dataset.range);
  });
  $("statsPrev").addEventListener("click", () => shiftStatsRange(-1));
  $("statsNext").addEventListener("click", () => { if (statsRange.end < today()) shiftStatsRange(1); });
  ["statsStart", "statsEnd"].forEach(id => {
    $(id).addEventListener("change", () => {
      let s = $("statsStart").value || statsRange.start;
      let e2 = $("statsEnd").value || statsRange.end;
      if (s > e2) { const t = s; s = e2; e2 = t; }
      statsRange = { preset: "custom", start: s, end: e2 };
      renderStats();
    });
  });

  /* 预算 */
  $("budgetPrev").addEventListener("click", () => { budgetMonth = shiftMonth(budgetMonth, -1); renderBudget(); });
  $("budgetNext").addEventListener("click", () => {
    const next = shiftMonth(budgetMonth, 1);
    if (next > monthNow()) return;
    budgetMonth = next; renderBudget();
  });
  $("budgetForm").addEventListener("submit", e => {
    e.preventDefault();
    const v = Number($("budgetAmount").value);
    if (!Number.isFinite(v) || v < 0) { toast("请输入有效预算"); return; }
    if (v === 0) delete state.budget[budgetMonth]; else state.budget[budgetMonth] = round2(v);
    save(); renderBudget(); renderHome(); toast("预算已保存");
  });
  $("copyBudgetBtn").addEventListener("click", () => {
    const prev = shiftMonth(budgetMonth, -1);
    const v = Number(state.budget[prev] || 0);
    if (!v) { toast("上个月没有设置预算"); return; }
    state.budget[budgetMonth] = v;
    save(); renderBudget(); renderHome(); toast(`已沿用上月预算 ${money(v)}`);
  });
  ["btnCatBudget", "btnCatBudget2", "btnCatBudget3"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("click", () => { renderCatBudgetForm(); openOverlay("catBudgetOverlay"); });
  });
  $("catBudgetSave").addEventListener("click", () => {
    const map = {};
    $$("#catBudgetForm input[data-cb]").forEach(inp => {
      const v = Number(String(inp.value).replace(/[^\d.]/g, ""));
      if (v > 0) map[inp.dataset.cb] = round2(v);
    });
    if (Object.keys(map).length) state.catBudget[budgetMonth] = map;
    else delete state.catBudget[budgetMonth];
    save(); closeOverlay("catBudgetOverlay"); renderBudget(); toast("分类预算已保存");
  });

  /* 活动表单 */
  ["activityTotal", "activityPeople", "activityExtra"].forEach(id => {
    $(id).addEventListener("input", () => {
      const c = activityCalc({
        total: $("activityTotal").value, people: $("activityPeople").value, extra: $("activityExtra").value
      });
      $("activityPerPerson").textContent = money(c.per);
      $("activityDue").textContent = money(c.due);
      $("activityPerWithExtra").textContent = money(c.perExtra);
    });
  });
  $("activityForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("activityName").value.trim();
    const total = round2($("activityTotal").value);
    const people = Math.floor(Number($("activityPeople").value));
    const extra = round2($("activityExtra").value || 0);
    const date = $("activityDate").value || today();
    if (!name) { toast("请填写活动名称"); return; }
    if (!(total > 0)) { toast("请输入大于 0 的总金额"); return; }
    if (!(people >= 1)) { toast("人数需为正整数"); return; }
    const due = round2(total + extra);
    const act = { id: uid(), name, date, total, people, extra, note: $("activityNote").value.trim(), created: Date.now(), received: 0, history: [] };
    state.activities.push(act);
    if ($("activityAutoRecord").checked) {
      state.records.push({
        id: uid(), type: "income", amount: due, category: "活动", accountId: defaultAccountId(),
        toAccountId: "", date, note: `活动 · ${name}`, created: Date.now()
      });
    }
    save();
    $("activityName").value = ""; $("activityTotal").value = ""; $("activityPeople").value = "";
    $("activityExtra").value = "0"; $("activityNote").value = ""; $("activityDate").value = today();
    renderActivities(); renderHome();
    toast("活动已添加");
  });
  $("exportActivities").addEventListener("click", exportActivitiesCsv);
  $("actSave").addEventListener("click", () => {
    const id = $("actOverlay").dataset.id;
    const a = state.activities.find(x => x.id === id);
    if (!a) return;
    const name = $("actEditName").value.trim();
    const total = round2($("actEditTotal").value);
    const people = Math.floor(Number($("actEditPeople").value));
    if (!name) { toast("请填写名称"); return; }
    if (!(total > 0)) { toast("请输入有效金额"); return; }
    if (!(people >= 1)) { toast("人数需为正整数"); return; }
    a.name = name; a.total = total; a.people = people;
    a.extra = round2($("actEditExtra").value || 0);
    a.date = $("actEditDate").value || a.date;
    a.note = $("actEditNote").value.trim();
    save(); closeOverlay("actOverlay"); renderActivities(); renderHome(); toast("已更新");
  });

  /* 借还表单 */
  $("loanForm").addEventListener("submit", e => {
    e.preventDefault();
    const amount = round2($("loanAmount").value);
    const person = $("loanPerson").value.trim();
    const type = $("loanType").value;
    const date = $("loanDate").value || today();
    if (!(amount > 0)) { toast("请输入有效金额"); return; }
    if (!person) { toast("请填写对象"); return; }
    state.loans.push({ id: uid(), type, person, amount, date, note: $("loanNote").value.trim(), created: Date.now(), repaid: 0, history: [] });
    if ($("loanAutoRecord").checked) {
      state.records.push({
        id: uid(), type: type === "lent" ? "expense" : "income", amount,
        category: type === "lent" ? "借出" : "借入", accountId: defaultAccountId(),
        toAccountId: "", date, note: `借还 · ${person}`, created: Date.now()
      });
    }
    save();
    $("loanPerson").value = ""; $("loanAmount").value = ""; $("loanNote").value = "";
    renderLoans(); renderHome(); toast("已添加");
  });
  $("loanSave").addEventListener("click", () => {
    const id = $("loanOverlay").dataset.id;
    const l = state.loans.find(x => x.id === id);
    if (!l) return;
    const amount = round2($("loanEditAmount").value);
    const person = $("loanEditPerson").value.trim();
    if (!(amount > 0)) { toast("请输入有效金额"); return; }
    if (!person) { toast("请填写对象"); return; }
    if (round2(l.repaid || 0) > amount) { toast("金额不能小于已还金额"); return; }
    l.amount = amount; l.person = person; l.type = $("loanEditType").value;
    l.date = $("loanEditDate").value || l.date;
    l.note = $("loanEditNote").value.trim();
    save(); closeOverlay("loanOverlay"); renderLoans(); renderHome(); toast("已更新");
  });

  /* 快捷收款 / 还款 */
  $("quickChips").addEventListener("click", e => {
    const chip = e.target.closest("[data-amt]");
    if (chip) $("quickAmount").value = chip.dataset.amt;
  });
  $("quickSave").addEventListener("click", saveQuick);

  /* 导出 / 导入 */
  $("exportCsv").addEventListener("click", exportCsv);
  $("exportExcel").addEventListener("click", exportExcel);
  $("exportJson").addEventListener("click", exportJson);
  $("btnExportCsv").addEventListener("click", exportCsv);
  $("btnExportExcel").addEventListener("click", exportExcel);
  $("btnExportJson").addEventListener("click", exportJson);
  ["importJson", "importJson2"].forEach(id => {
    $(id).addEventListener("change", async e => {
      const f = e.target.files && e.target.files[0];
      await handleImportFile(f);
      e.target.value = "";
    });
  });

  /* 快照 */
  $("btnSnapshots").addEventListener("click", () => { renderSnapshots(); openOverlay("snapshotOverlay"); });
  $("snapshotList").addEventListener("click", e => {
    const btn = e.target.closest("[data-restore]");
    if (!btn) return;
    const list = readSnaps();
    const snap = list[Number(btn.dataset.restore)];
    if (!snap) return;
    if (!confirm("恢复这份快照会覆盖当前数据，确定吗？")) return;
    snapshot("恢复前");
    try {
      state = normalize(JSON.parse(snap.data));
      save(); applyAllVisual(); renderAll(); closeOverlay("snapshotOverlay");
      toast("已恢复快照");
    } catch { toast("快照数据损坏"); }
  });

  /* 清空 */
  $("clearAll").addEventListener("click", () => {
    if (!confirm("确定清空所有账单、预算、活动与借还记录吗？")) return;
    if (!confirm("此操作不可撤销，建议先导出备份。仍要继续吗？")) return;
    snapshot("清空前");
    const keepSettings = state.settings;
    const keepMeta = state.meta;
    state = defaultState();
    state.settings = { ...state.settings, ...keepSettings };
    state.meta = keepMeta;
    save(); applyAllVisual(); renderAll(); go("home");
    toast("已清空");
  });

  /* 设置：外观 */
  $$("#modeSeg button").forEach(b => b.addEventListener("click", () => {
    state.settings.mode = b.dataset.mode; save(); applyMode();
  }));
  $("themeSwatches").addEventListener("click", e => {
    const b = e.target.closest("[data-id]");
    if (!b) return;
    state.settings.themeColor = b.dataset.id;
    save(); applyTheme();
  });
  $("themePicker").addEventListener("input", e => {
    state.settings.themeColor = "custom";
    state.settings.customTheme = e.target.value;
    applyTheme();
  });
  $("themePicker").addEventListener("change", () => save());
  $("fontSelect").addEventListener("change", e => {
    state.settings.fontFamily = e.target.value; save(); applyFont();
  });
  $("inkSwatches").addEventListener("click", e => {
    const b = e.target.closest("[data-id]");
    if (!b) return;
    state.settings.fontColor = b.dataset.id;
    save(); applyInk(); applyTheme();
  });
  $("inkPicker").addEventListener("input", e => {
    state.settings.fontColor = "custom";
    state.settings.customText = e.target.value;
    applyInk(); applyTheme();
  });
  $("inkPicker").addEventListener("change", () => save());
  $("hideSwitch").addEventListener("click", () => {
    state.settings.hideAmounts = !state.settings.hideAmounts;
    save(); applyPrivacy();
  });
  $("oledSwitch").addEventListener("click", () => {
    state.settings.oled = !state.settings.oled;
    save(); applySurface();
    $("oledSwitch").classList.toggle("on", !!state.settings.oled);
  });
  $("bgSwatches").addEventListener("click", e => {
    const b = e.target.closest("[data-bg-id]");
    if (!b) return;
    state.settings.bg = b.dataset.bgId;
    save(); applySurface(); renderBgSwatches();
  });

  /* 设置：记账偏好 */
  $("defaultAccount").addEventListener("change", e => {
    state.settings.defaultAccount = e.target.value; save(); toast("已设置默认账户");
  });
  $("btnAccounts").addEventListener("click", () => { renderAccountManage(); openOverlay("accountOverlay"); });
  $("assetsManage").addEventListener("click", () => { closeOverlay("assetsOverlay"); renderAccountManage(); openOverlay("accountOverlay"); });
  $("btnCats").addEventListener("click", openCatManager);
  $("btnRecurring").addEventListener("click", () => { renderRecurring(); openOverlay("recurringOverlay"); });

  /* 账户管理 */
  $("addAccountBtn").addEventListener("click", () => {
    const name = $("newAccountName").value.trim();
    const initial = round2($("newAccountInitial").value || 0);
    if (!name) { toast("请输入账户名称"); return; }
    if (state.accounts.some(a => a.name === name)) { toast("该账户已存在"); return; }
    state.accounts.push({ id: "acc-" + Date.now(), name, initial });
    save(); renderAccountManage(); renderAll();
    $("newAccountName").value = ""; $("newAccountInitial").value = "";
    toast("账户已添加");
  });
  $("accountList").addEventListener("click", e => {
    const del = e.target.closest("[data-delacc]");
    if (del) {
      const id = del.dataset.delacc;
      if (state.accounts.length <= 1) { toast("至少保留一个账户"); return; }
      const used = state.records.some(r => r.accountId === id || r.toAccountId === id);
      if (used) { toast("该账户下已有账单，无法删除"); return; }
      const a = acct(id);
      if (!confirm(`删除账户「${a.name}」？`)) return;
      state.accounts = state.accounts.filter(x => x.id !== id);
      save(); renderAccountManage(); renderAll(); toast("已删除账户");
      return;
    }
    const edit = e.target.closest("[data-editacc]");
    if (edit) {
      const a = acct(edit.dataset.editacc);
      if (!a) return;
      const v = prompt(`「${a.name}」的初始余额（当前 ${money(a.initial)}）`, String(a.initial || 0));
      if (v === null) return;
      const n = Number(v);
      if (!Number.isFinite(n)) { toast("请输入数字"); return; }
      a.initial = round2(n);
      save(); renderAccountManage(); renderAll(); toast("已更新初始余额");
    }
  });

  /* 分类管理 */
  $$("#catTypeSeg button").forEach(b => b.addEventListener("click", () => {
    catType = b.dataset.cattype; renderCatManage();
  }));
  $("emojiTabs").addEventListener("click", e => {
    const tab = e.target.closest(".emoji-tab");
    if (!tab) return;
    $$("#emojiTabs .emoji-tab").forEach(t => t.classList.toggle("active", t === tab));
    renderEmojiGrid(tab.dataset.etype);
  });
  $("emojiGrid").addEventListener("click", e => {
    if (e.target.tagName !== "SPAN") return;
    $("newCatIcon").value = e.target.textContent;
    $$("#emojiGrid span").forEach(s => s.classList.toggle("sel", s === e.target));
  });
  $("addCatBtn").addEventListener("click", () => {
    const name = $("newCatName").value.trim();
    const icon = $("newCatIcon").value.trim() || "📌";
    if (!name) { toast("请输入名称"); return; }
    if (state.categories[catType].some(c => c.name === name)) { toast("该分类已存在"); return; }
    state.categories[catType].push({ name, icon });
    save(); renderCatManage(); renderAll();
    $("newCatName").value = ""; $("newCatIcon").value = "";
    toast("分类已添加");
  });
  $("catList").addEventListener("click", e => {
    const btn = e.target.closest("[data-delcat]");
    if (!btn) return;
    if (!confirm("删除后已有账单不受影响，但不能再用这个分类记账。确定吗？")) return;
    state.categories[catType].splice(Number(btn.dataset.delcat), 1);
    save(); renderCatManage(); renderAll();
  });
  $("recurringList").addEventListener("click", e => {
    const toggle = e.target.closest("[data-rrec]");
    if (toggle) {
      const r = state.recurring.find(x => x.id === toggle.dataset.rrec);
      if (r) { r.enabled = r.enabled === false; save(); renderRecurring(); toast(r.enabled ? "已启用" : "已暂停"); }
      return;
    }
    const del = e.target.closest("[data-rdel]");
    if (del && confirm("删除这条周期规则？")) {
      state.recurring = state.recurring.filter(x => x.id !== del.dataset.rdel);
      save(); renderRecurring(); toast("已删除");
    }
  });

  /* 安全 */
  $("pinSwitch").addEventListener("click", () => {
    if (hasPin()) {
      if (!confirm("关闭密码锁？")) return;
      state.settings.pinHash = ""; state.settings.pin = "";
      save(); renderSettings(); toast("密码锁已关闭");
    } else {
      pinPurpose = "set";
      $("pinTitle").textContent = "设置密码";
      $("pinInput").value = "";
      openOverlay("pinOverlay");
      setTimeout(() => $("pinInput").focus(), 120);
    }
  });
  $("btnChangePin").addEventListener("click", () => {
    if (!hasPin()) { toast("请先打开密码锁"); return; }
    if (!confirm("验证后设置新密码，继续吗？")) return;
    pinPurpose = "change";
    $("pinTitle").textContent = "设置新密码";
    $("pinInput").value = "";
    openOverlay("pinOverlay");
    setTimeout(() => $("pinInput").focus(), 120);
  });
  $("pinSave").addEventListener("click", async () => {
    const v = $("pinInput").value.trim();
    if (!/^\d{4}$/.test(v)) { toast("请输入 4 位数字"); return; }
    state.settings.pinHash = await hashPin(v);
    state.settings.pin = "";
    save(); closeOverlay("pinOverlay"); renderSettings();
    toast(pinPurpose === "change" ? "密码已修改" : "密码锁已开启");
  });
  $("autoLockSelect").addEventListener("change", e => {
    state.settings.autoLock = Number(e.target.value) || 0;
    save(); toast(state.settings.autoLock ? `${state.settings.autoLock} 分钟后自动锁定` : "已关闭自动锁定");
  });

  /* 密码键盘 */
  $("pinPad").addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const k = btn.dataset.num;
    if (k === "del") { pinBuffer = pinBuffer.slice(0, -1); renderPinDots(); return; }
    if (k === "ok") { if (pinBuffer.length === 4) tryPin(); return; }
    if (pinBuffer.length < 4) {
      pinBuffer += k;
      renderPinDots();
      if (pinBuffer.length === 4) setTimeout(tryPin, 120);
    }
  });

  /* 自动锁定 */
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    const mins = Number(state.settings.autoLock) || 0;
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (mins > 0 && hiddenAt && Date.now() - hiddenAt > mins * 60000) lockApp();
    hiddenAt = 0;
  });
  window.addEventListener("focus", () => {
    const mins = Number(state.settings.autoLock) || 0;
    if (mins > 0 && hiddenAt && Date.now() - hiddenAt > mins * 60000) lockApp();
    hiddenAt = 0;
  });

  /* 系统深色模式变化 */
  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (state.settings.mode === "auto") applyMode();
      });
    } catch { }
  }

  window.addEventListener("resize", moveNavPill);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => moveNavPill()).catch(() => { });
  }

  /* 双击缩放抑制 */
  document.addEventListener("dblclick", e => e.preventDefault(), { passive: false });

  /* 支持 #stats / #add 等深链接与前进后退 */
  window.addEventListener("hashchange", handleHash);
}

/* ---------------- 分类管理入口 ---------------- */
function openCatManager() {
  catType = "expense";
  renderCatManage();
  renderEmojiGrid("food");
  $$("#emojiTabs .emoji-tab").forEach(t => t.classList.toggle("active", t.dataset.etype === "food"));
  const entryOpen = openStack.includes("entryOverlay");
  openOverlay("catOverlay", entryOpen);
}

/* =========================================================
   启动
   ========================================================= */
function handleHash() {
  const h = (location.hash || "").replace("#", "");
  if (h === "add") { go("home"); setTimeout(() => openEntry(), 120); return; }
  if (PAGES.includes(h)) { go(h); return; }
  go("home");
}
function init() {
  loadState();
  checkRecurring();
  bindEvents();
  renderThemeSwatches();
  renderFontSelect();
  applyAllVisual();
  renderAll();
  $("activityDate").value = today();
  $("loanDate").value = today();
  $("quickDate").value = today();
  handleHash();
  checkPinLock();
  moveNavPill();
  setTimeout(moveNavPill, 80);
  setTimeout(moveNavPill, 500);
  // 每日自动快照
  const snaps = readSnaps();
  const lastDay = snaps[0] ? new Date(snaps[0].ts).toDateString() : "";
  if (lastDay !== new Date().toDateString()) snapshot("每日自动");
  registerSW();
}
function checkPinLock() {
  if (hasPin()) lockApp(); else $("lockScreen").classList.add("hidden");
}
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  navigator.serviceWorker.register("sw.js").catch(() => { });
}

init();
})();
