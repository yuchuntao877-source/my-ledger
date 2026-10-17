(() => {
"use strict";
const KEY = "my-ledger-v1";
const expenseCats = ["餐饮","交通","购物","居家","住房","医疗","娱乐","学习","人情","旅行","通讯","其他"];
const incomeCats = ["工资","奖金","兼职","投资收益","红包","退款","其他收入"];
const icons = {"餐饮":"🍜","交通":"🚇","购物":"🛍️","居家":"🏠","住房":"🏡","医疗":"💊","娱乐":"🎮","学习":"📚","人情":"🎁","旅行":"✈️","通讯":"📱","其他":"🧾","工资":"💼","奖金":"🎉","兼职":"🧑‍💻","投资收益":"📈","红包":"🧧","退款":"↩️","其他收入":"💰","转账":"↔️","现金":"💵","微信":"🟢","支付宝":"🔵","银行卡":"💳"};
const $ = id => document.getElementById(id);
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthNow = () => today().slice(0,7);
const money = n => "¥" + Number(n||0).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaultState = () => ({
 records:[], loans:[], activities:[], budget:{}, accounts:[
 {id:"cash",name:"现金",initial:0},{id:"wechat",name:"微信",initial:0},{id:"alipay",name:"支付宝",initial:0},{id:"bank",name:"银行卡",initial:0}
 ]
});
let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || defaultState(); } catch { state=defaultState(); }
if (!Array.isArray(state.records)) state.records = [];
if (!Array.isArray(state.loans)) state.loans = [];
if (!Array.isArray(state.activities)) state.activities = [];
if (!state.budget || typeof state.budget !== "object") state.budget = {};
if (!Array.isArray(state.accounts) || !state.accounts.length) state.accounts = defaultState().accounts;

function save(){ try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){toast("保存失败：浏览器存储空间可能不足");} }
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2300);}
function monthRecords(m){return state.records.filter(r=>r.date.startsWith(m));}
function sum(rows,type){return rows.filter(r=>r.type===type).reduce((a,r)=>a+Number(r.amount),0);}
function accountName(id){return state.accounts.find(a=>a.id===id)?.name||"已删除账户";}
function renderAccountsSelect(){
 const options=state.accounts.map(a=>`<option value="${safe(a.id)}">${safe(a.name)}</option>`).join("");
 $("account").innerHTML=options;$("toAccount").innerHTML=options;
}
function renderCategories(){
 const type=document.querySelector(".type-btn.active")?.dataset.type||"expense";
 const cats=type==="income"?incomeCats:type==="transfer"?["转账"]:expenseCats;
 $("category").innerHTML=cats.map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join("");
 $("transferFields").classList.toggle("hidden",type!=="transfer");
 $("category").disabled=type==="transfer";
 $("saveRecord").textContent=type==="transfer"?"保存转账":type==="income"?"保存收入":"保存支出";
}
function go(page){
 document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
 document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
 if(page==="budget") renderBudgetPage();
 if(page==="activities") renderActivities();
 if(page==="loans") renderLoans();
 window.scrollTo({top:0,behavior:"smooth"});
}
function renderHome(){
 const m=monthNow(), rows=monthRecords(m), inc=sum(rows,"income"), exp=sum(rows,"expense"), budget=Number(state.budget[m]||0);
 $("monthLabel").textContent=`${m.replace("-","年")}月概览`;
 $("monthBalance").textContent=money(inc-exp);$("monthIncome").textContent=money(inc);$("monthExpense").textContent=money(exp);
 $("budgetText").textContent=budget?`已用 ${money(exp)} / ${money(budget)}（${Math.round(exp/budget*100)}%）`:"尚未设置本月预算";
 $("budgetBar").style.width=budget?`${Math.min(100,exp/budget*100)}%`:"0%";
 const recent=[...state.records].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created)).slice(0,5);
 $("recentRecords").innerHTML=recent.length?recent.map(recordHtml).join(""):empty("还没有账单，记下第一笔吧");
}
function recordHtml(r){
 const isInc=r.type==="income", isTransfer=r.type==="transfer";
 const sign=isTransfer?"↔":isInc?"+":"−";
 const amountClass=isTransfer?"":isInc?"income":"expense";
 const details=isTransfer?`${accountName(r.accountId)} → ${accountName(r.toAccountId)}`:`${r.date} · ${accountName(r.accountId)}${r.note?" · "+safe(r.note):""}`;
 return `<article class="record-item"><div class="record-icon">${icons[r.category]||"🧾"}</div><div class="record-main"><div class="record-name">${safe(r.category)}${r.note?` · ${safe(r.note)}`:""}</div><div class="record-meta">${safe(details)}</div></div><div class="record-right"><div class="record-amount ${amountClass}">${sign}${money(r.amount)}</div><div class="record-actions"><button class="mini-action" data-edit="${safe(r.id)}">编辑</button><button class="mini-action delete" data-delete="${safe(r.id)}">删除</button></div></div></article>`;
}
function empty(msg){return `<div class="empty-state">${safe(msg)}</div>`;}
function renderRecords(){
 const q=$("searchRecords").value.trim().toLowerCase(), m=$("filterMonth").value, type=$("filterType").value;
 const rows=[...state.records].filter(r=>(!m||r.date.startsWith(m))&&(type==="all"||r.type===type)&&(!q||[r.note,r.category,accountName(r.accountId)].join(" ").toLowerCase().includes(q))).sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
 $("allRecords").innerHTML=rows.length?rows.map(recordHtml).join(""):empty("没有找到符合条件的账单");
}
function renderStats(){
 const m=$("statsMonth").value||monthNow(), rows=monthRecords(m), inc=sum(rows,"income"), exp=sum(rows,"expense");
 $("statsIncome").textContent=money(inc);$("statsExpense").textContent=money(exp);$("statsBalance").textContent=money(inc-exp);$("statsCount").textContent=rows.length;
 const cats={};rows.filter(r=>r.type==="expense").forEach(r=>cats[r.category]=(cats[r.category]||0)+Number(r.amount));
 const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]), max=sorted[0]?.[1]||1;
 $("categoryStats").innerHTML=sorted.length?sorted.map(([name,val])=>`<div class="cat-row"><span>${icons[name]||"🧾"} ${safe(name)}</span><div class="cat-bar"><span style="width:${val/max*100}%"></span></div><span class="cat-value">${money(val)}</span></div>`).join(""):empty("本月暂无支出记录");
 const days=new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate();
 const daily=Array.from({length:days},(_,i)=>({day:i+1,val:rows.filter(r=>r.type==="expense"&&Number(r.date.slice(8,10))===i+1).reduce((a,r)=>a+Number(r.amount),0)}));
 const maxDay=Math.max(...daily.map(d=>d.val),1);
 $("dailyStats").innerHTML=daily.map(d=>`<div class="day-column" title="${d.day}日 ${money(d.val)}"><div class="day-bar" style="height:${Math.max(d.val?4:2,d.val/maxDay*100)}%"></div><span class="day-label">${d.day%5===1||d.day===days?d.day:""}</span></div>`).join("");
}
function renderBudgetPage(){
 const m=monthNow(), b=Number(state.budget[m]||0), spent=sum(monthRecords(m),"expense");
 $("budgetAmount").value=b||"";$("budgetSpent").textContent=money(spent);$("budgetRemaining").textContent=b?money(b-spent):"尚未设置";
}
function renderActivityCalc(){
 const total=Number($("activityTotal").value||0);
 const people=Number($("activityPeople").value||0);
 const extra=Number($("activityExtra").value||0);
 const per=people>0?total/people:0;
 const due=total+extra;
 const perWithExtra=people>0?due/people:0;
 $("activityPerPerson").textContent=money(per);
 $("activityDue").textContent=money(due);
 $("activityPerWithExtra").textContent=money(perWithExtra);
}
function activityHtml(a){
 const total=Number(a.total)||0;
 const people=Number(a.people)||0;
 const extra=Number(a.extra)||0;
 const per=people>0?total/people:0;
 const due=total+extra;
 const perWithExtra=people>0?due/people:0;
 return `<article class="record-item"><div class="record-icon">🎯</div><div class="record-main"><div class="record-name">${safe(a.name)}</div><div class="record-meta">${safe(a.date)} · ${people} 人 · 每人 AA ${money(per)} · 额外收取 ${money(extra)}<br>应收合计 ${money(due)} · 含额外人均 ${money(perWithExtra)}${a.note?` · ${safe(a.note)}`:""}</div></div><div class="record-right"><div class="record-amount">${money(total)}</div><div class="record-actions"><button class="mini-action delete" data-activity-delete="${safe(a.id)}">删除</button></div></div></article>`;
}
function renderActivities(){
 const rows=[...state.activities].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
 $("activityList").innerHTML=rows.length?rows.map(activityHtml).join(""):empty("还没有活动费用记录");
}
function renderLoans(){
 const rows=[...state.loans].sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created));
 $("loanList").innerHTML=rows.length?rows.map(l=>`<article class="record-item"><div class="record-icon">${l.type==="lent"?"↗️":"↙️"}</div><div class="record-main"><div class="record-name">${l.type==="lent"?"借给":"向"} ${safe(l.person)}</div><div class="record-meta">${safe(l.date)}${l.note?" · "+safe(l.note):""}<br>已还 ${money(l.repaid||0)} · 剩余 ${money(Math.max(0,l.amount-(l.repaid||0)))}</div></div><div class="record-right"><div class="record-amount">${money(l.amount)}</div><div class="record-actions"><button class="mini-action" data-loan-repay="${safe(l.id)}">登记还款</button><button class="mini-action delete" data-loan-delete="${safe(l.id)}">删除</button></div></div></article>`).join(""):empty("还没有借款或还款记录");
}
function renderAll(){
 renderAccountsSelect();
 renderCategories();
 renderHome();
 renderRecords();
 renderStats();
 renderBudgetPage();
 renderActivities();
 renderLoans();
}
function download(name,content,type){
 const blob=new Blob(["\ufeff",content],{type});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function exportJson(){download(`我的账本备份-${today()}.json`,JSON.stringify({version:1,exportedAt:new Date().toISOString(),state},null,2),"application/json;charset=utf-8");}
function csvCell(v){return '"'+String(v??"").replace(/"/g,'""')+'"';}
function exportCsv(){
 const header=["日期","类型","分类","金额","账户","转入账户","备注"];
 const rows=state.records.map(r=>[r.date,{expense:"支出",income:"收入",transfer:"转账"}[r.type]||r.type,r.category,r.amount,accountName(r.accountId),r.toAccountId?accountName(r.toAccountId):"",r.note||""]);
 download(`我的账单-${today()}.csv`,[header,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n"),"text/csv;charset=utf-8");
}
function exportActivitiesCsv(){
 const header=["日期","活动名称","总金额","人数","每人AA","额外收取","应收合计","含额外人均","备注"];
 const rows=state.activities.map(a=>{
  const total=Number(a.total)||0;
  const people=Number(a.people)||0;
  const extra=Number(a.extra)||0;
  const per=people>0?total/people:0;
  const due=total+extra;
  const perWithExtra=people>0?due/people:0;
  return [a.date,a.name,total,people,Math.round(per*100)/100,extra,Math.round(due*100)/100,Math.round(perWithExtra*100)/100,a.note||""];
 });
 download(`我的活动-${today()}.csv`,[header,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n"),"text/csv;charset=utf-8");
}

document.querySelectorAll(".tab,[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
document.querySelectorAll(".type-btn").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".type-btn").forEach(x=>x.classList.toggle("active",x===b));renderCategories();}));
$("recordDate").value=today();
$("loanDate").value=today();
$("activityDate").value=today();
$("filterMonth").value=monthNow();
$("statsMonth").value=monthNow();

$("recordForm").addEventListener("submit",e=>{
 e.preventDefault();const type=document.querySelector(".type-btn.active").dataset.type,amount=Number($("amount").value);
 if(!Number.isFinite(amount)||amount<=0)return toast("请输入大于 0 的金额");
 const accountId=$("account").value,toAccountId=$("toAccount").value;
 if(type==="transfer"&&(!toAccountId||toAccountId===accountId))return toast("请选择不同的转出和转入账户");
 const r={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),type,amount:Math.round(amount*100)/100,category:type==="transfer"?"转账":$("category").value,accountId,date:$("recordDate").value,note:$("note").value.trim(),created:Date.now()};
 if(type==="transfer")r.toAccountId=toAccountId;
 state.records.push(r);save();$("amount").value="";$("note").value="";$("recordDate").value=today();renderAll();toast("已保存");
});
$("searchRecords").addEventListener("input",renderRecords);
$("filterMonth").addEventListener("change",renderRecords);
$("filterType").addEventListener("change",renderRecords);
$("statsMonth").addEventListener("change",renderStats);
$("budgetForm").addEventListener("submit",e=>{e.preventDefault();const v=Number($("budgetAmount").value);if(v<0||!Number.isFinite(v))return toast("请输入有效预算");state.budget[monthNow()]=Math.round(v*100)/100;save();renderAll();toast("预算已保存");});

["activityTotal","activityPeople","activityExtra"].forEach(id=>$(id).addEventListener("input",renderActivityCalc));
renderActivityCalc();
$("activityForm").addEventListener("submit",e=>{
 e.preventDefault();
 const name=$("activityName").value.trim();
 const total=Number($("activityTotal").value);
 const people=Number($("activityPeople").value);
 const extra=Number($("activityExtra").value||0);
 if(!name)return toast("请填写活动名称");
 if(!Number.isFinite(total)||total<=0)return toast("请输入大于 0 的活动总金额");
 if(!Number.isInteger(people)||people<1)return toast("参与人数需为大于 0 的整数");
 if(!Number.isFinite(extra)||extra<0)return toast("额外收取金额无效");
 state.activities.push({
  id:"act-"+Date.now(),
  name,
  date:$("activityDate").value,
  total:Math.round(total*100)/100,
  people,
  extra:Math.round(extra*100)/100,
  note:$("activityNote").value.trim(),
  created:Date.now()
 });
 save();
 $("activityName").value="";
 $("activityTotal").value="";
 $("activityPeople").value="";
 $("activityExtra").value="0";
 $("activityNote").value="";
 $("activityDate").value=today();
 renderActivities();
 renderActivityCalc();
 toast("活动记录已添加");
});

$("loanForm").addEventListener("submit",e=>{
 e.preventDefault();
 const amount=Number($("loanAmount").value);
 if(amount<=0)return toast("请输入有效金额");
 state.loans.push({id:"l-"+Date.now(),type:$("loanType").value,person:$("loanPerson").value.trim(),amount:Math.round(amount*100)/100,date:$("loanDate").value,note:$("loanNote").value.trim(),created:Date.now(),repaid:0});
 save();$("loanPerson").value="";$("loanAmount").value="";$("loanNote").value="";renderLoans();toast("已添加借还记录");
});

document.addEventListener("click",e=>{
 const del=e.target.closest("[data-delete]");
 if(del){const r=state.records.find(x=>x.id===del.dataset.delete);if(r&&confirm(`确定删除这笔${r.type==="income"?"收入":r.type==="transfer"?"转账":"支出"} ${money(r.amount)} 吗？`)){state.records=state.records.filter(x=>x.id!==r.id);save();renderAll();toast("已删除");}return;}
 const edit=e.target.closest("[data-edit]");
 if(edit){const r=state.records.find(x=>x.id===edit.dataset.edit);if(!r)return;const amt=prompt("修改金额",r.amount);if(amt===null)return;const n=Number(amt);if(!Number.isFinite(n)||n<=0)return toast("金额无效");const note=prompt("修改备注",r.note||"");if(note===null)return;r.amount=Math.round(n*100)/100;r.note=note.trim();save();renderAll();toast("已更新");return;}
 const actDel=e.target.closest("[data-activity-delete]");
 if(actDel){const a=state.activities.find(x=>x.id===actDel.dataset.activityDelete);if(a&&confirm(`确定删除活动“${a.name}”吗？`)){state.activities=state.activities.filter(x=>x.id!==a.id);save();renderActivities();toast("已删除");}return;}
 const ld=e.target.closest("[data-loan-delete]");
 if(ld){if(confirm("确定删除这条借还记录吗？")){state.loans=state.loans.filter(l=>l.id!==ld.dataset.loanDelete);save();renderLoans();toast("已删除");}return;}
 const repay=e.target.closest("[data-loan-repay]");
 if(repay){const l=state.loans.find(x=>x.id===repay.dataset.loanRepay);if(!l)return;const v=prompt("输入本次还款金额（仅登记，不自动记入收支）",Math.max(0,l.amount-(l.repaid||0)).toFixed(2));if(v===null)return;const n=Number(v);if(!Number.isFinite(n)||n<=0||n>l.amount-(l.repaid||0)+0.001)return toast("还款金额超出剩余金额或无效");l.repaid=(l.repaid||0)+n;l.lastRepayDate=today();l.repayments=l.repayments||[];l.repayments.push({date:today(),amount:n});save();renderLoans();toast("已登记还款");return;}
});

$("exportCsv").addEventListener("click",exportCsv);
$("exportJson").addEventListener("click",exportJson);
$("settingsExport").addEventListener("click",exportJson);
$("exportActivities").addEventListener("click",exportActivitiesCsv);

$("importJson").addEventListener("change",async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  const obj=JSON.parse(await f.text());
  if(!obj.state||!Array.isArray(obj.state.records)||!Array.isArray(obj.state.accounts))throw new Error("格式不正确");
  if(!confirm("恢复备份会覆盖当前账本数据，建议先导出当前备份。确定继续吗？"))return;
  state=obj.state;
  state.activities=Array.isArray(state.activities)?state.activities:[];
  state.loans=Array.isArray(state.loans)?state.loans:[];
  state.budget=state.budget&&typeof state.budget==="object"?state.budget:{};
  save();renderAll();toast("备份恢复成功");
 }catch(err){
  toast("恢复失败：请确认选择的是本账本 JSON 备份");
 }finally{
  e.target.value="";
 }
});
$("settingsBtn").addEventListener("click",()=>go("settings"));
$("clearAll").addEventListener("click",()=>{
 if(confirm("确定清空全部账单、预算、借还记录、活动记录，并恢复默认账户吗？此操作不可撤销！")){
  if(confirm("最后确认：建议先导出 JSON 备份。仍要彻底清空吗？")){
   state=defaultState();save();renderAll();go("home");toast("已清空");
  }
 }
});
renderAll();
})();