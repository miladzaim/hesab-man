const KEY='hesab-man-full-v2';
const OLD_KEY='hesab-man-v1';
const CLOUD_KEY='hesab-man-cloud-config-v1';
const SESSION_KEY='hesab-man-cloud-session-v1';
const DEFAULT_URL='https://clvwnkpphjrrywdiefoe.supabase.co';

const $=id=>document.getElementById(id);
const els={};
document.querySelectorAll('[id]').forEach(e=>els[e.id]=e);

function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toLatinDigits(v){return String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))}
function digits(v){return Number(toLatinDigits(v).replace(/[^0-9]/g,''))||0}
function money(v){return new Intl.NumberFormat('en-US').format(Number(v||0))+' تومان'}
function formatAmount(v){const n=toLatinDigits(v).replace(/\D/g,'');return n?Number(n).toLocaleString('en-US').replace(/,/g,'/'):''}
function formatDate(v){let n=toLatinDigits(v).replace(/\D/g,'').slice(0,8);if(n.length>4)n=n.slice(0,4)+'/'+n.slice(4);if(n.length>7)n=n.slice(0,7)+'/'+n.slice(7);return n}
function today(){return toLatinDigits(new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())).replace(/[^0-9/]/g,'')}
function loadJSON(k,f=null){try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}}
function defaultState(){return {version:2.6,updatedAt:new Date().toISOString(),accounts:[],vehicles:[],drivers:[],transactions:[],categories:{vehicle:['لاستیک','روغن و سرویس','تعمیرات','سرویس دوره‌ای','خرید قطعات','سوخت','بیمه','عوارض','جریمه','پرداخت حقوق','اقساط','کارواش','پارکینگ','متفرقه'],personal:['خرید خانه','رستوران','سفر','درمان','قبوض','پوشاک','تفریح','هدیه','اقساط','متفرقه']}}}

function uniqueBy(arr,keyFn){
  const m=new Map();
  for(const x of arr||[]){const k=keyFn(x);if(k&&!m.has(k))m.set(k,x)}
  return [...m.values()];
}

function isLegacyV4(raw){
  return raw && (
    String(raw.version||'').startsWith('4.') ||
    (Array.isArray(raw.vehicles)&&raw.vehicles.some(v=>typeof v==='string')) ||
    (Array.isArray(raw.accounts)&&raw.accounts.some(a=>typeof a==='string')) ||
    (Array.isArray(raw.transactions)&&raw.transactions.some(t=>t&&('vehicle'in t||'account'in t)))
  );
}

function importLegacyV4(raw){
  const out=defaultState();
  const vehicleNames=uniqueBy((raw.vehicles||[]).map(v=>typeof v==='string'?v:v?.name).filter(Boolean),x=>x.trim().toLowerCase());
  const accountNames=uniqueBy((raw.accounts||[]).map(a=>typeof a==='string'?a:a?.name).filter(Boolean),x=>x.trim().toLowerCase());

  out.vehicles=vehicleNames.map(name=>({id:uid(),name:String(name).trim()}));
  out.accounts=accountNames.map(name=>({id:uid(),name:String(name).trim(),openingBalance:0}));

  const vehicleMap=Object.fromEntries(out.vehicles.map(v=>[v.name,v.id]));
  const accountMap=Object.fromEntries(out.accounts.map(a=>[a.name,a.id]));

  out.drivers=(raw.drivers||[]).filter(d=>d&&d.name).map(d=>({
    id:d.id||uid(),
    name:String(d.name).trim(),
    phone:d.phone||'',
    card:d.card||'',
    active:d.active!==false,
    vehicleId:vehicleMap[d.vehicle]||'',
    baseSalary:Number(d.baseSalary||0)
  }));

  out.transactions=(raw.transactions||[]).filter(Boolean).map(t=>({
    id:t.id||uid(),
    type:t.type==='income'?'income':'expense',
    accountId:accountMap[t.account]||'',
    scope:['Home','Other','Save part','خانه / شخصی'].includes(t.vehicle)?'personal':'vehicle',
    vehicleId:vehicleMap[t.vehicle]||'',
    legacyVehicle:t.vehicle||'',
    category:t.category||'متفرقه',
    amount:Number(t.amount||0),
    date:formatDate(t.date||''),
    title:t.subject||t.description||'',
    description:t.description||'',
    mechanic:t.party||'',
    reason:t.subject||'',
    workDone:'',
    parts:'',
    createdAt:t.createdAt||new Date().toISOString(),
    updatedAt:t.updatedAt||''
  }));

  // Enrich matching repair transactions without duplicating them.
  for(const r of raw.repairs||[]){
    const vid=vehicleMap[r.vehicle]||'';
    const match=out.transactions.find(t=>
      t.type==='expense' &&
      t.vehicleId===vid &&
      t.date===formatDate(r.date||'') &&
      Number(t.amount)===Number(r.total||0)
    );
    if(match){
      match.category='تعمیرات';
      match.workDone=r.work||'';
      match.reason=r.fault||match.reason||'';
      match.mechanic=r.vendor||match.mechanic||'';
      match.parts=Number(r.parts||0)>0?`هزینه قطعات: ${money(r.parts)}`:'';
      match.description=[match.description,r.notes].filter(Boolean).join('\n');
    }
  }

  // Link salary records to existing expense transactions without duplicating them.
  for(const s of raw.salaries||[]){
    const driver=out.drivers.find(d=>d.name===s.driver);
    const vid=vehicleMap[s.vehicle]||driver?.vehicleId||'';
    const aid=accountMap[s.account]||'';
    const match=out.transactions.find(t=>
      t.type==='expense' &&
      t.date===formatDate(s.date||'') &&
      Number(t.amount)===Number(s.net||0) &&
      (t.vehicleId===vid || !vid) &&
      (t.category==='حقوق راننده'||t.category==='پرداخت حقوق')
    );
    if(match){
      match.type='salary';
      match.category='پرداخت حقوق';
      match.driverId=driver?.id||'';
      match.vehicleId=vid;
      match.accountId=aid||match.accountId;
      match.month=s.month||'';
      match.title=s.month||match.title||'پرداخت حقوق';
    }
  }

  out.categories.vehicle=uniqueBy([...(raw.categories||[]).map(x=>x==='حقوق راننده'?'پرداخت حقوق':x),...out.categories.vehicle].filter(Boolean),x=>x);
  out.updatedAt=new Date().toISOString();
  return out;
}

function normalizeModern(raw){
  const d=defaultState();
  const out={...d,...raw,categories:{...d.categories,...(raw.categories||{})}};
  out.accounts=(raw.accounts||[]).filter(Boolean).map(a=>typeof a==='string'?{id:uid(),name:a,openingBalance:0}:{id:a.id||uid(),name:a.name||'',openingBalance:Number(a.openingBalance||0)}).filter(a=>a.name);
  out.vehicles=(raw.vehicles||[]).filter(Boolean).map(v=>typeof v==='string'?{id:uid(),name:v}:{id:v.id||uid(),name:v.name||''}).filter(v=>v.name);
  out.drivers=(raw.drivers||[]).filter(Boolean).map(d=>({id:d.id||uid(),name:d.name||'',phone:d.phone||'',card:d.card||'',active:d.active!==false,vehicleId:d.vehicleId||'',baseSalary:Number(d.baseSalary||0)})).filter(d=>d.name);
  out.transactions=(raw.transactions||[]).filter(Boolean).map(t=>({...t,id:t.id||uid(),amount:Number(t.amount||0),date:formatDate(t.date||''),scope:t.scope||(t.vehicleId?'vehicle':'personal'),title:t.title||t.description||'',category:t.category||'متفرقه'}));
  return out;
}
function normalizeBackup(raw){
  if(raw?.payload&&typeof raw.payload==='object')raw=raw.payload;
  return isLegacyV4(raw)?importLegacyV4(raw):normalizeModern(raw||{});
}
function loadState(){
  const cur=loadJSON(KEY,null);
  if(cur)return normalizeBackup(cur);
  const old=loadJSON(OLD_KEY,null);
  return old?normalizeBackup(old):defaultState();
}
let state=loadState();

let cloudConfig=loadJSON(CLOUD_KEY,{url:DEFAULT_URL,key:''});
let cloudSession=loadJSON(SESSION_KEY,null);
let syncTimer=null;

function toast(msg){els.toast.textContent=msg;els.toast.classList.add('show');setTimeout(()=>els.toast.classList.remove('show'),2200)}
function persist(auto=true){
  state.updatedAt=new Date().toISOString();
  localStorage.setItem(KEY,JSON.stringify(state));
  renderAll();
  if(auto)scheduleCloudSave();
}

function accountBalance(id){
  const a=state.accounts.find(x=>x.id===id);
  let b=Number(a?.openingBalance||0);
  for(const t of state.transactions){
    if(t.type==='income'&&t.accountId===id)b+=Number(t.amount||0);
    if((t.type==='expense'||t.type==='salary')&&t.accountId===id)b-=Number(t.amount||0);
  }
  return b;
}
function vehicleName(id){return state.vehicles.find(v=>v.id===id)?.name||''}
function accountName(id){return state.accounts.find(a=>a.id===id)?.name||''}
function driverName(id){return state.drivers.find(d=>d.id===id)?.name||''}
function txKind(t){return t.type==='income'?'واریزی':t.type==='salary'?'حقوق راننده':'هزینه'}

function setPage(name){
  if(window.__hesabActivatePage) window.__hesabActivatePage(name);
  else {
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
    $('page-'+name)?.classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  if(name==='transactions')renderTransactions();
  if(name==='fleet')renderFleet();
  if(name==='reports')renderReports();
}
document.querySelectorAll('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));

let pickerResolve=null;
function openPicker(title,items,current=''){
  return new Promise(resolve=>{
    pickerResolve=resolve;
    els.pickerTitle.textContent=title;
    els.pickerSearch.value='';
    els.pickerModal.hidden=false;
    renderPickerItems(items,current,'');
    setTimeout(()=>els.pickerSearch.focus(),100);
  });
}
function renderPickerItems(items,current,q){
  const query=String(q||'').trim().toLowerCase();
  const clean=items.filter(x=>x&&x.label&&String(x.label).trim());
  const filtered=clean.filter(x=>!query||String(x.label).toLowerCase().includes(query));
  // Selected item first, then all remaining items. No blank placeholders.
  filtered.sort((a,b)=>(a.value===current?-1:b.value===current?1:String(a.label).localeCompare(String(b.label),'fa')));
  els.pickerList.innerHTML=filtered.length?filtered.map(x=>`<button class="picker-option ${x.value===current?'selected':''}" data-value="${esc(x.value)}">${esc(x.label)}</button>`).join(''):'<div class="hint">موردی پیدا نشد.</div>';
  els.pickerList.querySelectorAll('.picker-option').forEach(btn=>btn.onclick=()=>{
    const val=btn.dataset.value;
    els.pickerModal.hidden=true;
    pickerResolve?.(val);
    pickerResolve=null;
  });
}
let pickerContext=null;
els.pickerSearch.oninput=()=>{
  if(!pickerContext)return;
  renderPickerItems(pickerContext.items,pickerContext.current,els.pickerSearch.value);
};
els.pickerClose.onclick=()=>{els.pickerModal.hidden=true;pickerResolve?.('');pickerResolve=null};
els.pickerModal.onclick=e=>{if(e.target===els.pickerModal)els.pickerClose.click()};

async function choose(title,items,current){
  pickerContext={items,current};
  const v=await openPicker(title,items,current);
  pickerContext=null;
  return v;
}
const accountItems=()=>state.accounts.map(a=>({value:a.id,label:a.name}));
const vehicleItems=()=>state.vehicles.map(v=>({value:v.id,label:v.name}));
const driverItems=()=>state.drivers.map(d=>({value:d.id,label:`${d.name}${vehicleName(d.vehicleId)?' — '+vehicleName(d.vehicleId):''}`}));

function setSelectButton(btn,value,label,placeholder){
  btn.textContent=value?(label||placeholder):placeholder;
}
els.txAccountBtn.onclick=async()=>{
  const v=await choose('انتخاب حساب',accountItems(),els.txAccount.value);
  if(v){els.txAccount.value=v;setSelectButton(els.txAccountBtn,v,accountName(v),'انتخاب حساب')}
};
els.txVehicleBtn.onclick=async()=>{
  const v=await choose('انتخاب خودرو',vehicleItems(),els.txVehicle.value);
  if(v){els.txVehicle.value=v;setSelectButton(els.txVehicleBtn,v,vehicleName(v),'انتخاب خودرو')}
};
els.driverVehicleBtn.onclick=async()=>{
  const v=await choose('انتخاب خودرو',vehicleItems(),els.driverVehicle.value);
  if(v){els.driverVehicle.value=v;setSelectButton(els.driverVehicleBtn,v,vehicleName(v),'انتخاب خودرو')}
};
els.txDriverBtn.onclick=async()=>{
  const v=await choose('انتخاب راننده',driverItems(),els.txDriver.value);
  if(v){
    els.txDriver.value=v;
    setSelectButton(els.txDriverBtn,v,driverName(v),'انتخاب راننده');
    const d=state.drivers.find(x=>x.id===v);
    if(d?.vehicleId){els.txVehicle.value=d.vehicleId;setSelectButton(els.txVehicleBtn,d.vehicleId,vehicleName(d.vehicleId),'انتخاب خودرو')}
  }
};
els.txCategoryBtn.onclick=async()=>{
  const list=(els.txScope.value==='vehicle'?state.categories.vehicle:state.categories.personal).map(x=>({value:x,label:x}));
  const v=await choose('انتخاب دسته‌بندی',list,els.txCategory.value);
  if(v){els.txCategory.value=v;setSelectButton(els.txCategoryBtn,v,v,'انتخاب دسته‌بندی');updateDynamicFields()}
};

function resetTxForm(){
  els.transactionForm.reset();
  els.txEditId.value='';
  els.txType.value='expense';
  els.txScope.value='vehicle';
  els.txAccount.value='';
  els.txVehicle.value='';
  els.txCategory.value='';
  els.txDriver.value='';
  els.txDate.value=today();
  els.txSubmit.textContent='ثبت تراکنش';
  els.txCancelEdit.hidden=true;
  document.querySelectorAll('#typeTabs button').forEach(b=>b.classList.toggle('active',b.dataset.type==='expense'));
  els.scopeVehicleBtn.classList.add('active');els.scopePersonalBtn.classList.remove('active');
  refreshSelectLabels();
  updateDynamicFields();
}
function refreshSelectLabels(){
  setSelectButton(els.txAccountBtn,els.txAccount.value,accountName(els.txAccount.value),'انتخاب حساب');
  setSelectButton(els.txVehicleBtn,els.txVehicle.value,vehicleName(els.txVehicle.value),'انتخاب خودرو');
  setSelectButton(els.txDriverBtn,els.txDriver.value,driverName(els.txDriver.value),'انتخاب راننده');
  setSelectButton(els.txCategoryBtn,els.txCategory.value,els.txCategory.value,'انتخاب دسته‌بندی');
  setSelectButton(els.driverVehicleBtn,els.driverVehicle.value,vehicleName(els.driverVehicle.value),'انتخاب خودرو');
}
function updateDynamicFields(){
  const isVehicle=els.txScope.value==='vehicle';
  const isExpense=els.txType.value==='expense';
  const isSalary=isVehicle&&isExpense&&els.txCategory.value==='پرداخت حقوق';
  els.vehicleWrap.hidden=!isVehicle;
  els.salaryFields.hidden=!isSalary;
  els.vehicleExpenseDetails.hidden=!(isVehicle&&isExpense&&!isSalary);
}
document.querySelectorAll('#typeTabs button').forEach(b=>b.onclick=()=>{
  els.txType.value=b.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(x=>x.classList.toggle('active',x===b));
  if(els.txType.value==='income'&&els.txCategory.value==='پرداخت حقوق')els.txCategory.value='';
  refreshSelectLabels();updateDynamicFields();
});
els.scopeVehicleBtn.onclick=()=>{els.txScope.value='vehicle';els.scopeVehicleBtn.classList.add('active');els.scopePersonalBtn.classList.remove('active');els.txCategory.value='';refreshSelectLabels();updateDynamicFields()};
els.scopePersonalBtn.onclick=()=>{els.txScope.value='personal';els.scopePersonalBtn.classList.add('active');els.scopeVehicleBtn.classList.remove('active');els.txVehicle.value='';els.txCategory.value='';refreshSelectLabels();updateDynamicFields()};

els.txAmount.oninput=e=>e.target.value=formatAmount(e.target.value);
els.driverBaseSalary.oninput=e=>e.target.value=formatAmount(e.target.value);
els.accountOpening.oninput=e=>e.target.value=formatAmount(e.target.value);
els.txDate.oninput=e=>e.target.value=formatDate(e.target.value);

els.transactionForm.onsubmit=e=>{
  e.preventDefault();
  if(!els.txAccount.value)return toast('حساب را انتخاب کنید');
  if(els.txScope.value==='vehicle'&&!els.txVehicle.value&&els.txCategory.value!=='پرداخت حقوق')return toast('خودرو را انتخاب کنید');
  if(!els.txCategory.value)return toast('دسته‌بندی را انتخاب کنید');
  if(!digits(els.txAmount.value))return toast('مبلغ را وارد کنید');

  const isSalary=els.txType.value==='expense'&&els.txScope.value==='vehicle'&&els.txCategory.value==='پرداخت حقوق';
  if(isSalary&&!els.txDriver.value)return toast('راننده را انتخاب کنید');

  const id=els.txEditId.value;
  const obj={
    id:id||uid(),
    type:isSalary?'salary':els.txType.value,
    accountId:els.txAccount.value,
    scope:els.txScope.value,
    vehicleId:els.txScope.value==='vehicle'?els.txVehicle.value:'',
    category:isSalary?'پرداخت حقوق':els.txCategory.value,
    driverId:isSalary?els.txDriver.value:'',
    month:isSalary?els.txSalaryMonth.value.trim():'',
    amount:digits(els.txAmount.value),
    date:formatDate(els.txDate.value),
    title:els.txTitle.value.trim()||(isSalary?els.txSalaryMonth.value.trim():''),
    workDone:isSalary?'':els.txWorkDone.value.trim(),
    parts:isSalary?'':els.txParts.value.trim(),
    mechanic:isSalary?'':els.txMechanic.value.trim(),
    reason:isSalary?'':els.txReason.value.trim(),
    description:els.txDescription.value.trim(),
    createdAt:id?(state.transactions.find(t=>t.id===id)?.createdAt||new Date().toISOString()):new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  if(id){
    const i=state.transactions.findIndex(t=>t.id===id);
    if(i>=0)state.transactions[i]=obj;
  }else state.transactions.push(obj);
  persist();
  toast(id?'تراکنش ویرایش شد':'تراکنش ثبت شد');
  resetTxForm();
  setPage('transactions');
};
els.txCancelEdit.onclick=resetTxForm;

function txCard(t){
  const cls=t.type==='income'?'income':t.type==='salary'?'salary':'expense';
  const entity=t.scope==='vehicle'?(vehicleName(t.vehicleId)||t.legacyVehicle||'بدون خودرو'):'خانه و شخصی';
  return `<div class="item clickable ${cls}" data-id="${esc(t.id)}">
    <div class="item-title">${esc(t.title||t.category||txKind(t))}</div>
    <div class="item-meta">${esc(txKind(t))} | ${esc(t.category||'')} | ${esc(entity)} | ${esc(t.date||'')}</div>
    <div class="amount ${t.type==='income'?'income':'expense'}">${t.type==='income'?'+':'-'}${money(t.amount)}</div>
  </div>`;
}
function filteredTransactions(){
  let arr=[...state.transactions].sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date)));
  const q=els.filterSearch.value.trim().toLowerCase();
  const type=els.filterType.value;
  if(type)arr=arr.filter(t=>t.type===type);
  if(q)arr=arr.filter(t=>JSON.stringify(t).toLowerCase().includes(q)||vehicleName(t.vehicleId).toLowerCase().includes(q)||accountName(t.accountId).toLowerCase().includes(q));
  return arr;
}
function renderTransactions(){
  const arr=filteredTransactions();
  els.txCount.textContent=arr.length;
  els.transactionList.innerHTML=arr.length?arr.map(txCard).join(''):'<div class="card hint">هنوز تراکنشی ثبت نشده است.</div>';
  els.transactionList.querySelectorAll('.item[data-id]').forEach(x=>x.onclick=()=>showTransaction(x.dataset.id));
}
els.filterSearch.oninput=renderTransactions;
els.filterType.onchange=renderTransactions;

function showTransaction(id){
  const t=state.transactions.find(x=>x.id===id);if(!t)return;
  const rows=[
    ['نوع',txKind(t)],['مبلغ',money(t.amount)],['تاریخ',t.date],['حساب',accountName(t.accountId)],
    ['بخش',t.scope==='vehicle'?(vehicleName(t.vehicleId)||t.legacyVehicle||'—'):'خانه و شخصی'],
    ['دسته‌بندی',t.category],['راننده',driverName(t.driverId)],['ماه حقوق',t.month],['عنوان',t.title],
    ['کار انجام‌شده',t.workDone],['قطعات',t.parts],['تعمیرکار',t.mechanic],['علت',t.reason],['توضیحات',t.description]
  ].filter(([,v])=>v);
  els.detailBody.innerHTML=rows.map(([k,v])=>`<div class="detail-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  els.detailActions.innerHTML=`<button class="primary" id="modalEdit">ویرایش</button><button class="danger" id="modalDelete">حذف</button>`;
  els.detailModal.hidden=false;
  $('modalEdit').onclick=()=>{els.detailModal.hidden=true;editTransaction(id)};
  $('modalDelete').onclick=()=>{els.detailModal.hidden=true;deleteTransaction(id)};
}
function editTransaction(id){
  const t=state.transactions.find(x=>x.id===id);if(!t)return;
  els.txEditId.value=t.id;
  els.txType.value=t.type==='income'?'income':'expense';
  els.txScope.value=t.scope||'vehicle';
  els.txAccount.value=t.accountId||'';
  els.txVehicle.value=t.vehicleId||'';
  els.txCategory.value=t.type==='salary'?'پرداخت حقوق':(t.category||'');
  els.txDriver.value=t.driverId||'';
  els.txSalaryMonth.value=t.month||'';
  els.txAmount.value=formatAmount(t.amount);
  els.txDate.value=t.date||today();
  els.txTitle.value=t.title||'';
  els.txWorkDone.value=t.workDone||'';
  els.txParts.value=t.parts||'';
  els.txMechanic.value=t.mechanic||'';
  els.txReason.value=t.reason||'';
  els.txDescription.value=t.description||'';
  document.querySelectorAll('#typeTabs button').forEach(b=>b.classList.toggle('active',b.dataset.type===els.txType.value));
  els.scopeVehicleBtn.classList.toggle('active',els.txScope.value==='vehicle');
  els.scopePersonalBtn.classList.toggle('active',els.txScope.value==='personal');
  els.txSubmit.textContent='ذخیره ویرایش';
  els.txCancelEdit.hidden=false;
  refreshSelectLabels();updateDynamicFields();setPage('new');
}
function deleteTransaction(id){
  if(!confirm('آیا مطمئن هستید که می‌خواهید این تراکنش حذف شود؟'))return;
  state.transactions=state.transactions.filter(t=>t.id!==id);persist();toast('تراکنش حذف شد');
}
els.detailClose.onclick=()=>els.detailModal.hidden=true;
els.detailModal.onclick=e=>{if(e.target===els.detailModal)els.detailModal.hidden=true};

function renderFleet(){
  els.vehicleList.innerHTML=state.vehicles.length?state.vehicles.map(v=>`<div class="item"><div class="item-title">${esc(v.name)}</div><div class="item-meta">${state.transactions.filter(t=>t.vehicleId===v.id).length} تراکنش</div><div class="item-actions"><button onclick="editVehicle('${v.id}')">ویرایش</button><button onclick="deleteVehicle('${v.id}')">حذف</button></div></div>`).join(''):'<div class="hint">خودرویی تعریف نشده.</div>';
  els.driverList.innerHTML=state.drivers.length?state.drivers.map(d=>`<div class="item"><div class="item-title">${esc(d.name)}</div><div class="item-meta">${esc(vehicleName(d.vehicleId)||'بدون خودرو')} ${d.phone?'| '+esc(d.phone):''}</div><div class="item-actions"><button onclick="editDriver('${d.id}')">ویرایش</button><button onclick="deleteDriver('${d.id}')">حذف</button></div></div>`).join(''):'<div class="hint">راننده‌ای تعریف نشده.</div>';
  els.accountList.innerHTML=state.accounts.length?state.accounts.map(a=>`<div class="item"><div class="item-title">${esc(a.name)}</div><div class="item-meta">موجودی: ${money(accountBalance(a.id))}</div><div class="item-actions"><button onclick="editAccount('${a.id}')">ویرایش</button><button onclick="deleteAccount('${a.id}')">حذف</button></div></div>`).join(''):'<div class="hint">حسابی تعریف نشده.</div>';
  refreshSelectLabels();
}
els.vehicleForm.onsubmit=e=>{
  e.preventDefault();const name=els.vehicleName.value.trim();if(!name)return;
  const id=els.vehicleEditId.value;
  if(id){const v=state.vehicles.find(x=>x.id===id);if(v)v.name=name}else state.vehicles.push({id:uid(),name});
  els.vehicleForm.reset();els.vehicleEditId.value='';els.vehicleCancel.hidden=true;persist();toast('خودرو ذخیره شد');
};
window.editVehicle=id=>{const v=state.vehicles.find(x=>x.id===id);if(!v)return;els.vehicleEditId.value=id;els.vehicleName.value=v.name;els.vehicleCancel.hidden=false};
window.deleteVehicle=id=>{
  if(state.transactions.some(t=>t.vehicleId===id)||state.drivers.some(d=>d.vehicleId===id))return alert('این خودرو سابقه تراکنش یا راننده دارد و قابل حذف نیست.');
  if(confirm('آیا مطمئن هستید این خودرو حذف شود؟')){state.vehicles=state.vehicles.filter(v=>v.id!==id);persist()}
};
els.vehicleCancel.onclick=()=>{els.vehicleForm.reset();els.vehicleEditId.value='';els.vehicleCancel.hidden=true};

els.driverForm.onsubmit=e=>{
  e.preventDefault();if(!els.driverName.value.trim())return;
  const obj={name:els.driverName.value.trim(),phone:els.driverPhone.value.trim(),vehicleId:els.driverVehicle.value,baseSalary:digits(els.driverBaseSalary.value),active:true};
  const id=els.driverEditId.value;
  if(id){const d=state.drivers.find(x=>x.id===id);if(d)Object.assign(d,obj)}else state.drivers.push({id:uid(),...obj});
  els.driverForm.reset();els.driverEditId.value='';els.driverVehicle.value='';els.driverCancel.hidden=true;persist();toast('راننده ذخیره شد');
};
window.editDriver=id=>{const d=state.drivers.find(x=>x.id===id);if(!d)return;els.driverEditId.value=id;els.driverName.value=d.name;els.driverPhone.value=d.phone||'';els.driverVehicle.value=d.vehicleId||'';els.driverBaseSalary.value=formatAmount(d.baseSalary);els.driverCancel.hidden=false;refreshSelectLabels()};
window.deleteDriver=id=>{
  if(state.transactions.some(t=>t.driverId===id))return alert('این راننده سابقه پرداخت حقوق دارد و قابل حذف نیست.');
  if(confirm('آیا مطمئن هستید این راننده حذف شود؟')){state.drivers=state.drivers.filter(d=>d.id!==id);persist()}
};
els.driverCancel.onclick=()=>{els.driverForm.reset();els.driverEditId.value='';els.driverVehicle.value='';els.driverCancel.hidden=true;refreshSelectLabels()};

els.accountForm.onsubmit=e=>{
  e.preventDefault();const obj={name:els.accountName.value.trim(),openingBalance:digits(els.accountOpening.value)};if(!obj.name)return;
  const id=els.accountEditId.value;
  if(id){const a=state.accounts.find(x=>x.id===id);if(a)Object.assign(a,obj)}else state.accounts.push({id:uid(),...obj});
  els.accountForm.reset();els.accountOpening.value='0';els.accountEditId.value='';els.accountCancel.hidden=true;persist();toast('حساب ذخیره شد');
};
window.editAccount=id=>{const a=state.accounts.find(x=>x.id===id);if(!a)return;els.accountEditId.value=id;els.accountName.value=a.name;els.accountOpening.value=formatAmount(a.openingBalance);els.accountCancel.hidden=false};
window.deleteAccount=id=>{
  if(state.transactions.some(t=>t.accountId===id))return alert('این حساب سابقه تراکنش دارد و قابل حذف نیست.');
  if(confirm('آیا مطمئن هستید این حساب حذف شود؟')){state.accounts=state.accounts.filter(a=>a.id!==id);persist()}
};
els.accountCancel.onclick=()=>{els.accountForm.reset();els.accountOpening.value='0';els.accountEditId.value='';els.accountCancel.hidden=true};

function renderBars(el,map,kind){
  const arr=Object.entries(map).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const max=arr[0]?.[1]||1;
  el.innerHTML=arr.length?arr.map(([k,v])=>`<div class="bar-row"><div class="bar-label">${esc(k)}</div><div class="bar-track"><div class="bar-fill ${kind==='expense'?'expense':''}" style="width:${Math.max(7,v/max*100)}%">${money(v)}</div></div></div>`).join(''):'<div class="hint">داده‌ای وجود ندارد.</div>';
}
function renderReports(){
  const income=state.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
  const expense=state.transactions.filter(t=>t.type==='expense'||t.type==='salary').reduce((s,t)=>s+Number(t.amount||0),0);
  els.totalBalance.textContent=money(state.accounts.reduce((s,a)=>s+accountBalance(a.id),0));
  els.totalIncome.textContent=money(income);els.totalExpense.textContent=money(expense);els.netTotal.textContent=money(income-expense);
  const vex={},vin={},cat={};
  for(const t of state.transactions){
    const vn=vehicleName(t.vehicleId)||t.legacyVehicle||'';
    if(t.scope==='vehicle'&&vn){
      if(t.type==='income')vin[vn]=(vin[vn]||0)+Number(t.amount||0);
      if(t.type==='expense'||t.type==='salary')vex[vn]=(vex[vn]||0)+Number(t.amount||0);
    }
    if(t.type==='expense'||t.type==='salary')cat[t.category||'متفرقه']=(cat[t.category||'متفرقه']||0)+Number(t.amount||0);
  }
  renderBars(els.vehicleExpenseChart,vex,'expense');renderBars(els.vehicleIncomeChart,vin,'income');renderBars(els.categoryExpenseChart,cat,'expense');
}
function showFilteredReport(predicate,title){
  const arr=state.transactions.filter(predicate);
  els.detailBody.innerHTML=`<h3>${esc(title)}</h3>`+(arr.length?arr.map(txCard).join(''):'<div class="hint">رکوردی وجود ندارد.</div>');
  els.detailActions.innerHTML='';
  els.detailModal.hidden=false;
  els.detailBody.querySelectorAll('.item[data-id]').forEach(x=>x.onclick=()=>showTransaction(x.dataset.id));
}
els.vehicleExpenseCard.onclick=()=>showFilteredReport(t=>t.scope==='vehicle'&&(t.type==='expense'||t.type==='salary'),'هزینه خودروها');
els.vehicleIncomeCard.onclick=()=>showFilteredReport(t=>t.scope==='vehicle'&&t.type==='income','واریزی خودروها');
els.categoryExpenseCard.onclick=()=>showFilteredReport(t=>t.type==='expense'||t.type==='salary','بیشترین هزینه‌ها');

els.exportBackup.onclick=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  a.download=`hesab-man-backup-${today().replaceAll('/','-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
els.importBackup.onchange=async e=>{
  try{
    const file=e.target.files[0];if(!file)return;
    const parsed=JSON.parse(await file.text());
    const imported=normalizeBackup(parsed);
    const ok=confirm(`فایل پشتیبان خوانده شد:\n${imported.vehicles.length} خودرو\n${imported.accounts.length} حساب\n${imported.drivers.length} راننده\n${imported.transactions.length} تراکنش\n\nاطلاعات فعلی با این فایل جایگزین شود؟`);
    if(!ok)return;
    state=imported;persist(false);renderAll();toast('پشتیبان با موفقیت بازیابی شد');scheduleCloudSave(1000);
  }catch(err){console.error(err);alert('فایل پشتیبان قابل خواندن نیست.')}
  finally{e.target.value=''}
};
els.resetApp.onclick=()=>{
  if(!confirm('آیا مطمئن هستید می‌خواهید همه اطلاعات حذف شود؟'))return;
  const phrase=prompt('برای تأیید نهایی عبارت «حذف اطلاعات» را وارد کنید:');
  if(phrase!=='حذف اطلاعات')return alert('حذف لغو شد.');
  state=defaultState();persist();toast('همه اطلاعات حذف شد');
};

function normalizeUrl(u){return String(u||'').trim().replace(/\/rest\/v1\/?$/,'').replace(/\/$/,'')}
async function cloudFetch(path,opt={}){
  if(!cloudConfig.url||!cloudConfig.key)throw Error('تنظیمات Supabase کامل نیست');
  const headers={'apikey':cloudConfig.key,'Content-Type':'application/json',...(opt.headers||{})};
  if(cloudSession?.access_token)headers.Authorization='Bearer '+cloudSession.access_token;
  const r=await fetch(normalizeUrl(cloudConfig.url)+path,{...opt,headers});
  const text=await r.text();
  if(!r.ok)throw Error(text||`HTTP ${r.status}`);
  return text?JSON.parse(text):null;
}
function setCloudBadge(text,cls=''){
  els.cloudBadge.textContent=text;els.cloudBadge.className='cloud-badge '+cls;
}
async function cloudPush(){
  if(!cloudSession?.user?.id)return setCloudBadge('ذخیره محلی','offline');
  try{
    setCloudBadge('در حال ذخیره...','syncing');
    await cloudFetch('/rest/v1/cloud_states?on_conflict=user_id',{
      method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({user_id:cloudSession.user.id,payload:state,updated_at:new Date().toISOString()})
    });
    setCloudBadge('ذخیره شد ✓','online');
  }catch(e){console.error(e);setCloudBadge('ذخیره محلی','offline')}
}
function scheduleCloudSave(ms=700){clearTimeout(syncTimer);syncTimer=setTimeout(cloudPush,ms)}

function renderAll(){renderTransactions();renderFleet();renderReports();refreshSelectLabels();updateDynamicFields()}
resetTxForm();renderAll();
if(cloudSession?.user?.id)setCloudBadge('متصل به فضای ابری','online');
else setCloudBadge('ذخیره محلی','offline');
