const KEY='hesab-man-full-v2',OLD_KEY='hesab-man-v1',CLOUD_KEY='hesab-man-cloud-config-v1',SESSION_KEY='hesab-man-cloud-session-v1';
const DEFAULT_URL='https://clvwnkpphjrrywdiefoe.supabase.co';
const defaultState=()=>({version:2,updatedAt:new Date().toISOString(),accounts:[],vehicles:[],drivers:[],transactions:[],categories:{vehicle:['لاستیک','روغن','تعمیرات','سرویس دوره‌ای','قطعات','سوخت','بیمه','کارواش','سایر'],personal:['خرید خانه','رستوران','سفر','درمان','قبوض','پوشاک','تفریح','هدیه','سایر']}});
let state=loadState(),cloudConfig=loadJSON(CLOUD_KEY,{url:DEFAULT_URL,key:''}),cloudSession=loadJSON(SESSION_KEY,null),syncTimer=null,syncing=false;
function loadJSON(k,f){try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}}
function migrate(s){const n={...defaultState(),...s,categories:{...defaultState().categories,...(s.categories||{})}};n.accounts=n.accounts||[];n.vehicles=n.vehicles||[];n.drivers=n.drivers||[];n.transactions=(n.transactions||[]).map(t=>({...t,scope:t.scope||(t.vehicleId?'vehicle':'personal'),title:t.title||t.description||'',category:t.category||'سایر'}));return n}
function loadState(){const cur=loadJSON(KEY,null);if(cur)return migrate(cur);const old=loadJSON(OLD_KEY,null);return old?migrate(old):defaultState()}
function persist(auto=true){state.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(state));renderAll();if(auto)scheduleCloudSave()}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(16).slice(2)}
function digits(v){return Number(String(v||'').replace(/[^0-9]/g,''))||0}
function formatInput(v){const n=String(v||'').replace(/\D/g,'');return n?Number(n).toLocaleString('en-US').replace(/,/g,'/'):''}
function toLatinDigits(v){return String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))}
function formatDateValue(v,monthOnly=false){let n=toLatinDigits(v).replace(/[^0-9]/g,'').slice(0,monthOnly?6:8);if(n.length>4)n=n.slice(0,4)+'/'+n.slice(4);if(n.length>7&&!monthOnly)n=n.slice(0,7)+'/'+n.slice(7);return n}
function money(v){return new Intl.NumberFormat('en-US').format(Number(v||0))+' تومان'}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function today(){return toLatinDigits(new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\u200e/g,'')).replace(/[^0-9/]/g,'')}
function currentMonth(){return today().slice(0,7)}function currentYear(){return today().slice(0,4)}
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');setTimeout(()=>toastEl.classList.remove('show'),2200)}
const toastEl=document.getElementById('toast');
function accountBalance(id){const a=state.accounts.find(x=>x.id===id);let b=Number(a?.openingBalance||0);for(const t of state.transactions){if(t.type==='income'&&t.accountId===id)b+=t.amount;if((t.type==='expense'||t.type==='salary')&&t.accountId===id)b-=t.amount;if(t.type==='transfer'){if(t.fromAccountId===id)b-=t.amount;if(t.toAccountId===id)b+=t.amount}}return b}
function opt(arr,empty='انتخاب کنید'){return `<option value="">${empty}</option>`+arr.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}
function updateSelects(){
  const saved={};
  ['txAccount','transferFrom','transferTo','txVehicle','driverVehicle','txSalaryDriver'].forEach(id=>{
    const el=document.getElementById(id);if(el)saved[id]=el.value
  });
  const acc=opt(state.accounts,'ابتدا حساب بسازید');
  ['txAccount','transferFrom','transferTo'].forEach(id=>{
    const el=document.getElementById(id);if(el){el.innerHTML=acc;if(saved[id]&&[...el.options].some(o=>o.value===saved[id]))el.value=saved[id]}
  });
  const veh=opt(state.vehicles,'انتخاب خودرو');
  [txVehicle,driverVehicle].forEach(el=>{if(el){el.innerHTML=veh;const id=el.id;if(saved[id]&&[...el.options].some(o=>o.value===saved[id]))el.value=saved[id]}});
  if(typeof txSalaryDriver!=='undefined'&&txSalaryDriver){
    txSalaryDriver.innerHTML=opt(state.drivers,'انتخاب راننده');
    if(saved.txSalaryDriver&&[...txSalaryDriver.options].some(o=>o.value===saved.txSalaryDriver))txSalaryDriver.value=saved.txSalaryDriver
  }
  updateCategoryOptions();
  refreshCustomPickers();
}
function vehicleAnalytics(rows){
  const by={};
  for(const v of state.vehicles)by[v.id]={name:v.name,income:0,expense:0,failures:0};
  rows.forEach(t=>{
    if(t.scope!=='vehicle'||!t.vehicleId||!by[t.vehicleId])return;
    if(t.type==='income')by[t.vehicleId].income+=Number(t.amount||0);
    if(['expense','salary'].includes(t.type)){
      by[t.vehicleId].expense+=Number(t.amount||0);
      if(t.type==='expense'&&t.category!=='پرداخت حقوق')by[t.vehicleId].failures+=1;
    }
  });
  const arr=Object.values(by);
  const best=[...arr].sort((a,b)=>(b.income-b.expense)-(a.income-a.expense))[0];
  const costly=[...arr].sort((a,b)=>b.expense-a.expense)[0];
  const failures=[...arr].sort((a,b)=>b.failures-a.failures)[0];
  const topInc=[...arr].sort((a,b)=>b.income-a.income)[0];

  bestVehicle.textContent=best&&best.income+best.expense?best.name:'—';
  bestVehicleMeta.textContent=best&&best.income+best.expense?`خالص: ${money(best.income-best.expense)}`:'بدون داده';
  costliestVehicle.textContent=costly&&costly.expense?costly.name:'—';
  costliestVehicleMeta.textContent=costly&&costly.expense?`هزینه: ${money(costly.expense)}`:'بدون داده';
  mostFailureVehicle.textContent=failures&&failures.failures?failures.name:'—';
  mostFailureVehicleMeta.textContent=failures&&failures.failures?`${failures.failures} مراجعه / خرابی`:'بدون داده';
  topIncomeVehicle.textContent=topInc&&topInc.income?topInc.name:'—';
  topIncomeVehicleMeta.textContent=topInc&&topInc.income?`واریزی: ${money(topInc.income)}`:'بدون داده';

  const ex={},inc={};
  arr.forEach(v=>{if(v.expense)ex[v.name]=v.expense;if(v.income)inc[v.name]=v.income});
  vehicleExpenseChart.innerHTML=chartHtml(ex,'expense');
  vehicleIncomeChart.innerHTML=chartHtml(inc,'income');
}

function openAnalyticsList(kind,encodedName){
  const name=decodeURIComponent(encodedName||'');
  const rows=state.transactions.filter(t=>{
    if(kind==='expense')return ['expense','salary'].includes(t.type)&&txEntity(t)===name;
    if(kind==='income')return t.type==='income'&&txEntity(t)===name;
    if(kind==='category-expense')return ['expense','salary'].includes(t.type)&&(t.category||'حقوق راننده')===name;
    if(kind==='category-income')return t.type==='income'&&(t.category||t.title||'درآمد')===name;
    return false;
  });
  txModalBody.innerHTML=rows.length?rows.slice().reverse().map(t=>`<div class="item clickable" onclick="viewTx('${t.id}')">
    <div class="item-title">${esc(t.title||t.category||txLabel(t))}</div>
    <div class="item-meta">${esc(t.date||'')} | ${money(t.amount)}</div>
  </div>`).join(''):'رکوردی وجود ندارد.';
  txModalEdit.hidden=true;
  txModalDelete.hidden=true;
  txModal.hidden=false;
}
window.openAnalyticsList=openAnalyticsList;
function renderReports(){const type=reportPeriodType.value,period=reportPeriod.value|| (type==='month'?currentMonth():currentYear()),scope=reportScope.value;reportPeriod.value=period;const rows=periodRows(type,period,scope),inc=rows.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),exp=rows.filter(t=>['expense','salary'].includes(t.type)).reduce((s,t)=>s+t.amount,0);reportIncome.textContent=money(inc);reportExpense.textContent=money(exp);reportNet.textContent=money(inc-exp);reportCount.textContent=rows.length;const em={},im={};rows.filter(t=>['expense','salary'].includes(t.type)).forEach(t=>em[t.category||'حقوق راننده']=(em[t.category||'حقوق راننده']||0)+t.amount);rows.filter(t=>t.type==='income').forEach(t=>im[t.category||t.title||'درآمد']=(im[t.category||t.title||'درآمد']||0)+t.amount);topExpenses.innerHTML=barsHtml(em,'category-expense');topIncomes.innerHTML=barsHtml(im,'category-income');const ym={};state.transactions.forEach(t=>{if(!t.date)return;const m=t.date.slice(0,7);ym[m]??={i:0,e:0};if(t.type==='income')ym[m].i+=t.amount;if(['expense','salary'].includes(t.type))ym[m].e+=t.amount});const months=Object.entries(ym).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12),max=Math.max(1,...months.flatMap(([,v])=>[v.i,v.e]));monthComparison.innerHTML=months.length?months.map(([m,v])=>`<div class="bar-row"><span>${m}</span><div><div class="bar-track"><div class="bar-fill" style="width:${v.i/max*100}%"></div></div><div class="bar-track" style="margin-top:4px"><div class="bar-fill" style="width:${v.e/max*100}%;background:linear-gradient(90deg,#be123c,#fb7185)"></div></div></div><b>${money(v.i-v.e)}</b></div>`).join(''):'داده‌ای وجود ندارد.'}

const PICKER_IDS=['txAccount','txVehicle','txSalaryDriver','driverVehicle','transferFrom','transferTo'];
let activePickerSelect=null;
function pickerLabel(sel){return sel.options[sel.selectedIndex]?.text||'انتخاب کنید'}
function enhanceSelect(id){
  const sel=document.getElementById(id);
  if(!sel||sel.dataset.enhanced==='1')return;
  sel.dataset.enhanced='1';
  sel.classList.add('native-select-hidden');
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='picker-trigger';
  btn.dataset.for=id;
  btn.textContent=pickerLabel(sel);
  sel.insertAdjacentElement('afterend',btn);
  btn.onclick=()=>openPicker(sel);
}
function refreshCustomPickers(){
  PICKER_IDS.forEach(id=>{
    enhanceSelect(id);
    const sel=document.getElementById(id);
    const btn=document.querySelector(`.picker-trigger[data-for="${id}"]`);
    if(btn&&sel)btn.textContent=pickerLabel(sel);
  });
}
function openPicker(sel){
  activePickerSelect=sel;
  pickerTitle.textContent=sel.closest('label')?.childNodes[0]?.textContent?.trim()||'انتخاب';
  pickerSearch.value='';
  renderPickerOptions('');
  pickerModal.hidden=false;
  setTimeout(()=>pickerSearch.focus(),100);
}
function renderPickerOptions(q=''){
  if(!activePickerSelect)return;
  const query=String(q).trim().toLowerCase();
  const opts=[...activePickerSelect.options].filter(o=>!query||o.text.toLowerCase().includes(query));
  pickerList.innerHTML=opts.map(o=>`<button type="button" class="picker-option ${o.value===activePickerSelect.value?'selected':''}" data-value="${esc(o.value)}">${esc(o.text)}</button>`).join('');
  pickerList.querySelectorAll('.picker-option').forEach(b=>b.onclick=()=>{
    activePickerSelect.value=b.dataset.value;
    activePickerSelect.dispatchEvent(new Event('change',{bubbles:true}));
    const trigger=document.querySelector(`.picker-trigger[data-for="${activePickerSelect.id}"]`);
    if(trigger)trigger.textContent=pickerLabel(activePickerSelect);
    pickerModal.hidden=true;
  });
}
pickerSearch.oninput=e=>renderPickerOptions(e.target.value);
pickerClose.onclick=()=>pickerModal.hidden=true;
pickerModal.onclick=e=>{if(e.target===pickerModal)pickerModal.hidden=true};
function renderAll(){updateSelects();renderAccounts();renderVehicles();renderDrivers();renderSalaries();renderCategories();renderTransactions();renderDashboard();renderReports();renderCloudStatus();refreshCustomPickers()}
['txAmount','transferAmount','driverBaseSalary','accountOpening'].forEach(id=>document.getElementById(id).addEventListener('input',e=>{const pos=e.target.selectionStart;e.target.value=formatInput(e.target.value);try{e.target.setSelectionRange(pos,pos)}catch{}}));
['txDate','transferDate'].forEach(id=>document.getElementById(id).addEventListener('input',e=>e.target.value=formatDateValue(e.target.value,false)));
['filterMonth'].forEach(id=>document.getElementById(id).addEventListener('input',e=>e.target.value=formatDateValue(e.target.value,true)));
reportPeriod.addEventListener('input',e=>e.target.value=formatDateValue(e.target.value,reportPeriodType.value==='month'));
document.querySelectorAll('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const page=document.getElementById(b.dataset.page);
  if(page){page.classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}
  renderAll();
vehicleAnalytics(rows);}));
txScope.onchange=updateCategoryOptions;txType.onchange=updateCategoryOptions;txCategory.onchange=updateCategoryOptions;txSalaryDriver.onchange=()=>{const d=state.drivers.find(x=>x.id===txSalaryDriver.value);if(d)txVehicle.value=d.vehicleId};dashPeriod.onchange=renderDashboard;[filterType,filterScope,filterMonth,filterSearch].forEach(x=>x.oninput=renderTransactions);applyReport.onclick=renderReports;reportPeriodType.onchange=()=>{reportPeriod.placeholder=reportPeriodType.value==='month'?'1405/04':'1405'};
accountForm.onsubmit=e=>{e.preventDefault();const id=accountEditId.value,obj={name:accountName.value.trim(),openingBalance:digits(accountOpening.value)};if(id)Object.assign(state.accounts.find(x=>x.id===id),obj);else state.accounts.push({id:uid(),...obj});e.target.reset();accountOpening.value='0';accountEditId.value='';accountCancel.hidden=true;persist();toast('حساب ذخیره شد')};accountCancel.onclick=()=>{accountForm.reset();accountEditId.value='';accountOpening.value='0';accountCancel.hidden=true};
vehicleForm.onsubmit=e=>{e.preventDefault();state.vehicles.push({id:uid(),name:vehicleName.value.trim()});e.target.reset();persist();toast('خودرو اضافه شد')};
driverForm.onsubmit=e=>{e.preventDefault();const id=driverEditId.value,obj={name:driverName.value.trim(),vehicleId:driverVehicle.value,baseSalary:digits(driverBaseSalary.value)};if(id)Object.assign(state.drivers.find(x=>x.id===id),obj);else state.drivers.push({id:uid(),...obj});e.target.reset();driverEditId.value='';driverCancel.hidden=true;persist();toast('راننده ذخیره شد')};driverCancel.onclick=()=>{driverForm.reset();driverEditId.value='';driverCancel.hidden=true};
transactionForm.onsubmit=e=>{e.preventDefault();if(!txAccount.value)return toast('حساب را انتخاب کنید');if(txScope.value==='vehicle'&&!txVehicle.value&&txCategory.value!=='پرداخت حقوق')return toast('خودرو را انتخاب کنید');if(!digits(txAmount.value))return toast('مبلغ را وارد کنید');const id=txEditId.value,isSalary=txType.value==='expense'&&txScope.value==='vehicle'&&txCategory.value==='پرداخت حقوق',d=isSalary?state.drivers.find(x=>x.id===txSalaryDriver.value):null,obj={type:isSalary?'salary':txType.value,accountId:txAccount.value,scope:txScope.value,vehicleId:isSalary?(d?.vehicleId||txVehicle.value):(txScope.value==='vehicle'?txVehicle.value:''),category:isSalary?'پرداخت حقوق':txCategory.value,driverId:isSalary?txSalaryDriver.value:'',month:isSalary?txSalaryMonth.value.trim():'',amount:digits(txAmount.value),date:formatDateValue(txDate.value,false),title:isSalary?(txTitle.value.trim()||txSalaryMonth.value.trim()||`حقوق ${d?.name||''}`):txTitle.value.trim(),workDone:isSalary?'':txWorkDone.value.trim(),parts:isSalary?'':txParts.value.trim(),mechanic:isSalary?'':txMechanic.value.trim(),reason:isSalary?'':txReason.value.trim(),description:txDescription.value.trim()};if(id)Object.assign(state.transactions.find(x=>x.id===id),obj);else state.transactions.push({id:uid(),...obj});resetTxForm();persist();toast(id?'تراکنش ویرایش شد':'تراکنش ثبت شد')};function resetTxForm(){transactionForm.reset();txEditId.value='';txDate.value=today();txScope.value='vehicle';txType.value='expense';txSubmit.textContent='ثبت تراکنش';txCancelEdit.hidden=true;updateCategoryOptions()}txCancelEdit.onclick=resetTxForm;
transferForm.onsubmit=e=>{e.preventDefault();if(transferFrom.value===transferTo.value)return toast('حساب مبدا و مقصد یکسان است');state.transactions.push({id:uid(),type:'transfer',fromAccountId:transferFrom.value,toAccountId:transferTo.value,amount:digits(transferAmount.value),date:formatDateValue(transferDate.value,false),description:transferDescription.value.trim(),title:transferDescription.value.trim()});e.target.reset();transferDate.value=today();persist();toast('انتقال ثبت شد')};
vehicleCategoryForm.onsubmit=e=>{e.preventDefault();const n=vehicleCategoryName.value.trim();if(n&&!state.categories.vehicle.includes(n))state.categories.vehicle.push(n);e.target.reset();persist()};personalCategoryForm.onsubmit=e=>{e.preventDefault();const n=personalCategoryName.value.trim();if(n&&!state.categories.personal.includes(n))state.categories.personal.push(n);e.target.reset();persist()};
window.editAccount=id=>{const a=state.accounts.find(x=>x.id===id);accountEditId.value=id;accountName.value=a.name;accountOpening.value=formatInput(a.openingBalance);accountCancel.hidden=false};window.deleteAccount=id=>{if(state.transactions.some(t=>t.accountId===id||t.fromAccountId===id||t.toAccountId===id))return toast('این حساب سابقه دارد');if(confirm('حذف حساب؟')){state.accounts=state.accounts.filter(x=>x.id!==id);persist()}};window.renameVehicle=id=>{const v=state.vehicles.find(x=>x.id===id),n=prompt('نام جدید',v.name);if(n?.trim()){v.name=n.trim();persist()}};window.deleteVehicle=id=>{if(state.transactions.some(t=>t.vehicleId===id)||state.drivers.some(d=>d.vehicleId===id))return toast('این خودرو سابقه یا راننده دارد');if(confirm('حذف خودرو؟')){state.vehicles=state.vehicles.filter(x=>x.id!==id);persist()}};window.editDriver=id=>{const d=state.drivers.find(x=>x.id===id);driverEditId.value=id;driverName.value=d.name;driverVehicle.value=d.vehicleId;driverBaseSalary.value=formatInput(d.baseSalary);driverCancel.hidden=false};window.deleteDriver=id=>{if(state.transactions.some(t=>t.driverId===id))return toast('این راننده سابقه حقوق دارد');if(confirm('حذف راننده؟')){state.drivers=state.drivers.filter(x=>x.id!==id);persist()}};window.removeCategory=(s,c)=>{c=decodeURIComponent(c);if(state.transactions.some(t=>t.scope===s&&t.category===c))return toast('این دسته‌بندی سابقه دارد');state.categories[s]=state.categories[s].filter(x=>x!==c);persist()};
window.editTx=id=>{const t=state.transactions.find(x=>x.id===id);if(t.type==='salary'){txEditId.value=id;txType.value='expense';txScope.value='vehicle';updateCategoryOptions();txCategory.value='پرداخت حقوق';updateCategoryOptions();txSalaryDriver.value=t.driverId||'';txSalaryMonth.value=t.month||t.title||'';txAccount.value=t.accountId||'';txVehicle.value=t.vehicleId||'';txAmount.value=formatInput(t.amount);txDate.value=t.date||today();txTitle.value=t.title||'';txDescription.value=t.description||'';txSubmit.textContent='ذخیره ویرایش';txCancelEdit.hidden=false;document.querySelector('[data-page=new]').click();return}txEditId.value=id;txType.value=t.type;txAccount.value=t.accountId;txScope.value=t.scope;updateCategoryOptions();txVehicle.value=t.vehicleId||'';txCategory.value=t.category||'';txAmount.value=formatInput(t.amount);txDate.value=t.date;txTitle.value=t.title||'';txWorkDone.value=t.workDone||'';txParts.value=t.parts||'';txMechanic.value=t.mechanic||'';txReason.value=t.reason||'';txDescription.value=t.description||'';txSubmit.textContent='ذخیره ویرایش';txCancelEdit.hidden=false;document.querySelector('[data-page=new]').click()};window.deleteTx=id=>{if(confirm('این رکورد حذف شود؟')){state.transactions=state.transactions.filter(x=>x.id!==id);persist();toast('حذف شد')}};window.viewTx=id=>{const t=state.transactions.find(x=>x.id===id);alert([`نوع: ${txLabel(t)}`,`عنوان: ${t.title||''}`,`مبلغ: ${money(t.amount)}`,`دسته: ${t.category||''}`,`بخش: ${txEntity(t)}`,`تاریخ: ${t.date||''}`,t.workDone&&`کار انجام‌شده: ${t.workDone}`,t.parts&&`قطعات: ${t.parts}`,t.mechanic&&`تعمیرکار: ${t.mechanic}`,t.reason&&`علت: ${t.reason}`,t.description&&`توضیحات: ${t.description}`].filter(Boolean).join('\n'))};
exportBackup.onclick=()=>{const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='hesab-man-backup.json';a.click();URL.revokeObjectURL(a.href)};function importLegacyV9(raw){
  const now=new Date().toISOString();
  const out=defaultState();
  const vehicleNames=Array.isArray(raw.vehicles)?raw.vehicles.map(v=>typeof v==='string'?v:(v.name||v.title||'')).filter(Boolean):[];
  const accountNames=Array.isArray(raw.accounts)?raw.accounts.map(a=>typeof a==='string'?a:(a.name||a.title||'')).filter(Boolean):[];
  out.vehicles=[...new Set(vehicleNames)].map(name=>({id:uid(),name}));
  out.accounts=[...new Set(accountNames)].map(name=>({id:uid(),name,openingBalance:0}));
  const vehicleIdByName=Object.fromEntries(out.vehicles.map(v=>[v.name,v.id]));
  const accountIdByName=Object.fromEntries(out.accounts.map(a=>[a.name,a.id]));
  out.drivers=(Array.isArray(raw.drivers)?raw.drivers:[]).map(d=>({
    id:d.id||uid(),
    name:d.name||d.driverName||'راننده',
    vehicleId:vehicleIdByName[d.vehicle||d.vehicleName]||'',
    baseSalary:Number(d.baseSalary||d.salary||0)
  }));
  const txs=Array.isArray(raw.transactions)?raw.transactions:[];
  out.transactions=txs.map(t=>({
    id:t.id||uid(),
    type:t.type==='income'?'income':'expense',
    accountId:accountIdByName[t.account]||'',
    scope:(t.scope==='home'||t.scope==='personal'||t.vehicle==='خانه / شخصی')?'personal':'vehicle',
    vehicleId:vehicleIdByName[t.vehicle]||'',
    category:t.homeCategory||t.category||t.subject||'سایر',
    amount:Number(t.amount||0),
    date:toLatinDigits(t.date||''),
    title:t.subject||t.title||t.description||'',
    description:t.description||'',
    workDone:t.workDone||'',
    parts:t.parts||'',
    mechanic:t.mechanic||t.party||'',
    reason:t.reason||'',
    createdAt:t.createdAt||now,
    updatedAt:t.updatedAt||''
  }));
  for(const r of (Array.isArray(raw.repairs)?raw.repairs:[])){
    out.transactions.push({
      id:r.id||uid(),type:'expense',accountId:accountIdByName[r.account]||'',scope:'vehicle',
      vehicleId:vehicleIdByName[r.vehicle]||'',category:r.category||'تعمیرات',
      amount:Number(r.amount||r.cost||0),date:toLatinDigits(r.date||''),title:r.subject||r.title||'تعمیرات',
      description:r.description||'',workDone:r.workDone||r.activity||'',parts:r.parts||'',
      mechanic:r.mechanic||r.repairman||'',reason:r.reason||r.fault||''
    });
  }
  for(const s of (Array.isArray(raw.salaries)?raw.salaries:[])){
    const driver=out.drivers.find(d=>d.id===s.driverId||d.name===s.driver);
    out.transactions.push({
      id:s.id||uid(),type:'salary',scope:'vehicle',category:'پرداخت حقوق',
      driverId:driver?.id||'',vehicleId:driver?.vehicleId||vehicleIdByName[s.vehicle]||'',
      accountId:accountIdByName[s.account]||'',month:s.month||s.period||'',
      amount:Number(s.amount||0),date:toLatinDigits(s.date||''),title:s.title||s.month||'پرداخت حقوق',
      description:s.description||''
    });
  }
  out.categories.vehicle=[...new Set([...(raw.categories||[]),...defaultState().categories.vehicle].filter(x=>typeof x==='string'))];
  out.categories.personal=[...new Set([...(raw.homeCategories||[]),...defaultState().categories.personal].filter(x=>typeof x==='string'))];
  out.updatedAt=now;
  return out;
}
function normalizeImportedBackup(raw){
  if(!raw||typeof raw!=='object')throw new Error('invalid');
  if(raw.payload&&typeof raw.payload==='object')raw=raw.payload;
  if(Array.isArray(raw.vehicles)&&raw.vehicles.some(v=>typeof v==='string'))return importLegacyV9(raw);
  if(raw.version&&String(raw.version).startsWith('9.'))return importLegacyV9(raw);
  if(Array.isArray(raw.transactions)||Array.isArray(raw.accounts)||Array.isArray(raw.vehicles))return migrate(raw);
  throw new Error('unsupported');
}
importBackup.onchange=async e=>{
  try{
    const raw=JSON.parse(await e.target.files[0].text());
    state=normalizeImportedBackup(raw);
    persist();
    toast('پشتیبان با موفقیت بازیابی شد');
  }catch(err){
    console.error(err);
    toast('این فایل پشتیبان قابل خواندن نیست');
  }finally{
    e.target.value='';
  }
};resetApp.onclick=()=>{if(confirm('همه اطلاعات پاک شود؟')){state=defaultState();persist();toast('اطلاعات پاک شد')}};
function normalizeUrl(u){return String(u||'').trim().replace(/\/rest\/v1\/?$/,'').replace(/\/$/,'')}
async function cloudFetch(path,opt={}){if(!cloudConfig.url||!cloudConfig.key)throw Error('تنظیمات Supabase کامل نیست');const headers={'apikey':cloudConfig.key,'Content-Type':'application/json',...(opt.headers||{})};if(opt.auth!==false&&cloudSession?.access_token)headers.Authorization='Bearer '+cloudSession.access_token;const r=await fetch(normalizeUrl(cloudConfig.url)+path,{...opt,headers});const text=await r.text();if(!r.ok)throw Error((()=>{try{return JSON.parse(text).message||JSON.parse(text).error_description}catch{return text||`HTTP ${r.status}`}})());return text?JSON.parse(text):null}
function persistSession(s){cloudSession=s;localStorage.setItem(SESSION_KEY,JSON.stringify(s));renderCloudStatus()}
async function signIn(email,password){const s=await cloudFetch('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:JSON.stringify({email,password})});persistSession(s);await autoReconcile();return s}
async function signUp(email,password){const s=await cloudFetch('/auth/v1/signup',{method:'POST',auth:false,body:JSON.stringify({email,password})});if(s.access_token){persistSession(s);await autoReconcile()}else toast('ایمیل تأیید را بررسی کنید')}
async function refreshSession(){if(!cloudSession?.refresh_token)return false;try{persistSession(await cloudFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:JSON.stringify({refresh_token:cloudSession.refresh_token})}));return true}catch{return false}}
async function cloudPush(show=false){if(!cloudSession?.user?.id)return;setCloudStatus('در حال ذخیره خودکار...','syncing','در حال ذخیره ابری...');try{await cloudFetch('/rest/v1/cloud_states?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:cloudSession.user.id,payload:state,updated_at:state.updatedAt})});setCloudStatus('همگام و به‌روز','online','ذخیره ابری شد ✓');if(show)toast('در ابر ذخیره شد')}catch(e){if(String(e.message).includes('JWT')&&await refreshSession())return cloudPush(show);setCloudStatus('ذخیره ابری ناموفق؛ اطلاعات محلی محفوظ است','','آفلاین؛ ذخیره محلی');if(show)toast(e.message);throw e}}
async function getCloud(){const r=await cloudFetch(`/rest/v1/cloud_states?user_id=eq.${encodeURIComponent(cloudSession.user.id)}&select=payload,updated_at&limit=1`);return r?.[0]||null}
async function cloudPull(force=false){const c=await getCloud();if(!c){await cloudPush();return}if(force||new Date(c.updated_at)>new Date(state.updatedAt)){state=migrate(c.payload);localStorage.setItem(KEY,JSON.stringify(state));renderAll();toast('اطلاعات ابری دریافت شد')}}
async function autoReconcile(){if(!cloudSession?.user?.id)return;try{const c=await getCloud();if(!c)return cloudPush();if(new Date(c.updated_at)>new Date(state.updatedAt)){state=migrate(c.payload);localStorage.setItem(KEY,JSON.stringify(state));renderAll()}else if(new Date(state.updatedAt)>new Date(c.updated_at))await cloudPush();setCloudStatus('همگام و به‌روز','online','ذخیره ابری شد ✓')}catch(e){setCloudStatus('فعلاً آفلاین؛ اطلاعات محلی محفوظ است','','آفلاین؛ ذخیره محلی')}}
function scheduleCloudSave(){clearTimeout(syncTimer);if(cloudSession?.access_token)syncTimer=setTimeout(()=>cloudPush().catch(()=>{}),900)}
function setCloudStatus(t,c='',headerText=t){cloudStatus.textContent=t;cloudStatus.className='cloud-status '+c;if(typeof headerCloudStatus!=='undefined'&&headerCloudStatus){headerCloudStatus.textContent=headerText;headerCloudStatus.className='header-cloud-status '+c}}
function renderCloudStatus(){cloudUrl.value=cloudConfig.url||DEFAULT_URL;cloudKey.value=cloudConfig.key||'';if(cloudSession?.access_token){cloudStatus.textContent=`متصل — ${cloudSession.user?.email||''}`;cloudStatus.className='cloud-status online';cloudAuthBox.hidden=true;cloudSignedBox.hidden=false;cloudUser.textContent=cloudSession.user?.email||'';if(headerCloudStatus&&!headerCloudStatus.classList.contains('syncing')){headerCloudStatus.textContent='متصل به فضای ابری';headerCloudStatus.className='header-cloud-status online'}}else{cloudStatus.textContent=cloudConfig.key?'تنظیم شده؛ وارد شوید':'تنظیم نشده';cloudStatus.className='cloud-status';cloudAuthBox.hidden=false;cloudSignedBox.hidden=true;if(headerCloudStatus){headerCloudStatus.textContent=cloudConfig.key?'فضای ابری: نیاز به ورود':'فضای ابری: تنظیم نشده';headerCloudStatus.className='header-cloud-status'}}}
saveCloudConfig.onclick=()=>{const url=normalizeUrl(cloudUrl.value),key=cloudKey.value.trim();if(!url||!key)return toast('آدرس و کلید را کامل کنید');cloudConfig={url,key};localStorage.setItem(CLOUD_KEY,JSON.stringify(cloudConfig));renderCloudStatus();toast('تنظیمات ذخیره شد')};cloudLoginForm.onsubmit=async e=>{e.preventDefault();try{await signIn(cloudEmail.value.trim(),cloudPassword.value);toast('ورود موفق')}catch(err){toast('ورود ناموفق: '+err.message)}};cloudSignup.onclick=async()=>{try{await signUp(cloudEmail.value.trim(),cloudPassword.value)}catch(e){toast('ثبت‌نام ناموفق: '+e.message)}};cloudPush.onclick=()=>window.cloudPush(true).catch(()=>{});cloudPull.onclick=()=>window.cloudPull(true).catch(e=>toast(e.message));cloudLogout.onclick=()=>{cloudSession=null;localStorage.removeItem(SESSION_KEY);renderCloudStatus();toast('خارج شدید')};window.addEventListener('online',()=>autoReconcile());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')autoReconcile()});
txDate.value=transferDate.value=today();filterMonth.value=reportPeriod.value=currentMonth();renderAll();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});setTimeout(()=>autoReconcile(),600);
