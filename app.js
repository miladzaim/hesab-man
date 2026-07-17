const KEY='hesab-man-v1';
const emptyState=()=>({accounts:[],vehicles:[],transactions:[]});
let state=load();

function load(){try{return {...emptyState(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return emptyState()}}
function save(){localStorage.setItem(KEY,JSON.stringify(state));renderAll()}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(16).slice(2)}
function money(v){return new Intl.NumberFormat('fa-IR').format(Number(v||0))+' تومان'}
function digits(v){return Number(String(v).replace(/[^0-9]/g,''))||0}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
function todayJalali(){return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\u200e/g,'')}

function accountBalance(id){
  const a=state.accounts.find(x=>x.id===id); let b=Number(a?.openingBalance||0);
  for(const t of state.transactions){
    if(t.type==='income'&&t.accountId===id)b+=t.amount;
    if(t.type==='expense'&&t.accountId===id)b-=t.amount;
    if(t.type==='transfer'){if(t.fromAccountId===id)b-=t.amount;if(t.toAccountId===id)b+=t.amount;}
  }return b;
}

function renderAll(){renderSelects();renderAccounts();renderVehicles();renderDashboard();renderReports();}
function renderSelects(){
  const accountOptions=state.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  ['txAccount','transferFrom','transferTo'].forEach(id=>document.getElementById(id).innerHTML=accountOptions||'<option value="">ابتدا حساب بسازید</option>');
  const vehicleOptions=state.vehicles.map(v=>`<option value="${v.id}">${v.name}</option>`).join('');
  document.getElementById('txVehicle').innerHTML='<option value="">بدون خودرو / شخصی</option>'+vehicleOptions;
  document.getElementById('reportVehicle').innerHTML='<option value="all">همه</option><option value="">بدون خودرو / شخصی</option>'+vehicleOptions;
}
function renderAccounts(){
  const el=document.getElementById('accountList');
  if(!state.accounts.length){el.className='list empty';el.textContent='هنوز حسابی ثبت نشده است.';return}
  el.className='list';el.innerHTML=state.accounts.map(a=>`<div class="item"><div class="item-main"><div class="item-title">${a.name}</div><div class="item-meta">موجودی فعلی: ${money(accountBalance(a.id))}</div></div><div class="item-actions"><button onclick="removeAccount('${a.id}')">حذف</button></div></div>`).join('');
}
function renderVehicles(){
  const el=document.getElementById('vehicleList');
  if(!state.vehicles.length){el.className='list empty';el.textContent='هنوز خودرویی ثبت نشده است.';return}
  el.className='list';el.innerHTML=state.vehicles.map(v=>`<div class="item"><div class="item-title">${v.name}</div><div class="item-actions"><button onclick="renameVehicle('${v.id}')">تغییر نام</button><button onclick="removeVehicle('${v.id}')">حذف</button></div></div>`).join('');
}
function txTitle(t){if(t.type==='income')return 'واریزی';if(t.type==='expense')return 'هزینه';return 'انتقال بین حساب‌ها'}
function txMeta(t){
  const vehicle=state.vehicles.find(v=>v.id===t.vehicleId)?.name||'شخصی/عمومی';
  if(t.type==='transfer')return `${state.accounts.find(a=>a.id===t.fromAccountId)?.name||'-'} ← ${state.accounts.find(a=>a.id===t.toAccountId)?.name||'-'} | ${t.date}`;
  return `${state.accounts.find(a=>a.id===t.accountId)?.name||'-'} | ${vehicle} | ${t.date}`;
}
function txHtml(t){return `<div class="item"><div class="item-main"><div class="item-title">${txTitle(t)}${t.description?' — '+t.description:''}</div><div class="item-meta">${txMeta(t)}</div></div><strong class="amount ${t.type==='income'?'income':'expense'}">${t.type==='expense'?'-':t.type==='income'?'+':''}${money(t.amount)}</strong></div>`}
function renderDashboard(){
  const income=state.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense=state.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const totalBalance=state.accounts.reduce((s,a)=>s+accountBalance(a.id),0);
  document.getElementById('totalBalance').textContent=money(totalBalance);
  document.getElementById('totalIncome').textContent=money(income);
  document.getElementById('totalExpense').textContent=money(expense);
  document.getElementById('netBalance').textContent=money(income-expense);
  const el=document.getElementById('recentTransactions');const rows=[...state.transactions].slice(-5).reverse();
  if(!rows.length){el.className='list empty';el.textContent='هنوز تراکنشی ثبت نشده است.'}else{el.className='list';el.innerHTML=rows.map(txHtml).join('')}
}
function renderReports(){
  const type=document.getElementById('reportType').value;const vehicle=document.getElementById('reportVehicle').value;
  let rows=[...state.transactions].reverse();
  if(type!=='all')rows=rows.filter(t=>t.type===type);
  if(vehicle!=='all')rows=rows.filter(t=>(t.vehicleId||'')===vehicle);
  const el=document.getElementById('reportList');
  if(!rows.length){el.className='list empty';el.textContent='رکوردی وجود ندارد.'}else{el.className='list';el.innerHTML=rows.map(txHtml).join('')}
}

document.querySelectorAll('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(b.dataset.page).classList.add('active')}));

document.getElementById('accountForm').addEventListener('submit',e=>{e.preventDefault();state.accounts.push({id:uid(),name:accountName.value.trim(),openingBalance:digits(accountBalance.value)});e.target.reset();accountBalance.value='0';save();toast('حساب ثبت شد')});
document.getElementById('vehicleForm').addEventListener('submit',e=>{e.preventDefault();state.vehicles.push({id:uid(),name:vehicleName.value.trim()});e.target.reset();save();toast('خودرو اضافه شد')});
document.getElementById('transactionForm').addEventListener('submit',e=>{e.preventDefault();if(!txAccount.value)return toast('ابتدا یک حساب بسازید');state.transactions.push({id:uid(),type:txType.value,accountId:txAccount.value,vehicleId:txVehicle.value,amount:digits(txAmount.value),date:txDate.value,description:txDescription.value.trim()});e.target.reset();txDate.value=todayJalali();save();toast('تراکنش ثبت شد')});
document.getElementById('transferForm').addEventListener('submit',e=>{e.preventDefault();if(!transferFrom.value||!transferTo.value)return toast('ابتدا دو حساب بسازید');if(transferFrom.value===transferTo.value)return toast('حساب مبدا و مقصد یکسان است');state.transactions.push({id:uid(),type:'transfer',fromAccountId:transferFrom.value,toAccountId:transferTo.value,amount:digits(transferAmount.value),date:transferDate.value,description:transferDescription.value.trim()});e.target.reset();transferDate.value=todayJalali();save();toast('انتقال ثبت شد')});
document.getElementById('applyReport').addEventListener('click',renderReports);

document.getElementById('exportBackup').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hesab-man-backup.json';a.click();URL.revokeObjectURL(a.href)});
document.getElementById('importBackup').addEventListener('change',async e=>{try{state={...emptyState(),...JSON.parse(await e.target.files[0].text())};save();toast('پشتیبان بازیابی شد')}catch{toast('فایل پشتیبان معتبر نیست')}});
document.getElementById('resetApp').addEventListener('click',()=>{if(confirm('همه اطلاعات پاک شود؟')){state=emptyState();save();toast('اطلاعات پاک شد')}});

window.removeAccount=id=>{if(state.transactions.some(t=>t.accountId===id||t.fromAccountId===id||t.toAccountId===id))return toast('این حساب سابقه تراکنش دارد');if(confirm('حساب حذف شود؟')){state.accounts=state.accounts.filter(a=>a.id!==id);save()}};
window.removeVehicle=id=>{if(state.transactions.some(t=>t.vehicleId===id))return toast('این خودرو سابقه تراکنش دارد');if(confirm('خودرو حذف شود؟')){state.vehicles=state.vehicles.filter(v=>v.id!==id);save()}};
window.renameVehicle=id=>{const v=state.vehicles.find(x=>x.id===id);const name=prompt('نام جدید خودرو',v.name);if(name?.trim()){v.name=name.trim();save()}};

txDate.value=transferDate.value=todayJalali();renderAll();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
