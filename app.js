const KEY='hesab-man-v1';
const CLOUD_KEY='hesab-man-cloud-config-v1';
const SESSION_KEY='hesab-man-cloud-session-v1';
const DEFAULT_SUPABASE_URL='https://clvwnkpphjrrywdiefoe.supabase.co';
const emptyState=()=>({accounts:[],vehicles:[],transactions:[]});
let state=load();
let cloudConfig=loadJSON(CLOUD_KEY,{url:DEFAULT_SUPABASE_URL,key:''});
let cloudSession=loadJSON(SESSION_KEY,null);
let syncTimer=null;

function loadJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
function load(){try{return {...emptyState(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return emptyState()}}
function saveLocal(){localStorage.setItem(KEY,JSON.stringify(state));renderAll();scheduleCloudSave()}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(16).slice(2)}
function money(v){return new Intl.NumberFormat('fa-IR').format(Number(v||0))+' تومان'}
function digits(v){return Number(String(v).replace(/[^0-9]/g,''))||0}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function todayJalali(){return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\u200e/g,'')}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function accountBalance(id){
  const a=state.accounts.find(x=>x.id===id); let b=Number(a?.openingBalance||0);
  for(const t of state.transactions){
    if(t.type==='income'&&t.accountId===id)b+=t.amount;
    if(t.type==='expense'&&t.accountId===id)b-=t.amount;
    if(t.type==='transfer'){if(t.fromAccountId===id)b-=t.amount;if(t.toAccountId===id)b+=t.amount;}
  }return b;
}

function renderAll(){renderSelects();renderAccounts();renderVehicles();renderDashboard();renderReports();renderCloudStatus();}
function renderSelects(){
  const accountOptions=state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
  ['txAccount','transferFrom','transferTo'].forEach(id=>document.getElementById(id).innerHTML=accountOptions||'<option value="">ابتدا حساب بسازید</option>');
  const vehicleOptions=state.vehicles.map(v=>`<option value="${v.id}">${esc(v.name)}</option>`).join('');
  document.getElementById('txVehicle').innerHTML='<option value="">بدون خودرو / شخصی</option>'+vehicleOptions;
  document.getElementById('reportVehicle').innerHTML='<option value="all">همه</option><option value="">بدون خودرو / شخصی</option>'+vehicleOptions;
}
function renderAccounts(){
  const el=document.getElementById('accountList');
  if(!state.accounts.length){el.className='list empty';el.textContent='هنوز حسابی ثبت نشده است.';return}
  el.className='list';el.innerHTML=state.accounts.map(a=>`<div class="item"><div class="item-main"><div class="item-title">${esc(a.name)}</div><div class="item-meta">موجودی فعلی: ${money(accountBalance(a.id))}</div></div><div class="item-actions"><button onclick="removeAccount('${a.id}')">حذف</button></div></div>`).join('');
}
function renderVehicles(){
  const el=document.getElementById('vehicleList');
  if(!state.vehicles.length){el.className='list empty';el.textContent='هنوز خودرویی ثبت نشده است.';return}
  el.className='list';el.innerHTML=state.vehicles.map(v=>`<div class="item"><div class="item-title">${esc(v.name)}</div><div class="item-actions"><button onclick="renameVehicle('${v.id}')">تغییر نام</button><button onclick="removeVehicle('${v.id}')">حذف</button></div></div>`).join('');
}
function txTitle(t){if(t.type==='income')return 'واریزی';if(t.type==='expense')return 'هزینه';return 'انتقال بین حساب‌ها'}
function txMeta(t){
  const vehicle=state.vehicles.find(v=>v.id===t.vehicleId)?.name||'شخصی/عمومی';
  if(t.type==='transfer')return `${esc(state.accounts.find(a=>a.id===t.fromAccountId)?.name||'-')} ← ${esc(state.accounts.find(a=>a.id===t.toAccountId)?.name||'-')} | ${esc(t.date)}`;
  return `${esc(state.accounts.find(a=>a.id===t.accountId)?.name||'-')} | ${esc(vehicle)} | ${esc(t.date)}`;
}
function txHtml(t){return `<div class="item"><div class="item-main"><div class="item-title">${txTitle(t)}${t.description?' — '+esc(t.description):''}</div><div class="item-meta">${txMeta(t)}</div></div><strong class="amount ${t.type==='income'?'income':'expense'}">${t.type==='expense'?'-':t.type==='income'?'+':''}${money(t.amount)}</strong></div>`}
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
function renderCloudStatus(){
  const status=document.getElementById('cloudStatus');
  const authBox=document.getElementById('cloudAuthBox');
  const signedBox=document.getElementById('cloudSignedBox');
  document.getElementById('cloudUrl').value=cloudConfig.url||DEFAULT_SUPABASE_URL;
  document.getElementById('cloudKey').value=cloudConfig.key||'';
  if(cloudSession?.access_token){
    status.textContent=`متصل به فضای ابری — ${cloudSession.user?.email||'کاربر'}`;
    status.className='cloud-status online';
    authBox.hidden=true;signedBox.hidden=false;
    document.getElementById('cloudUser').textContent=cloudSession.user?.email||'';
  }else{
    status.textContent=cloudConfig.key?'تنظیم شده؛ وارد حساب شوید':'فضای ابری هنوز تنظیم نشده است';
    status.className='cloud-status';
    authBox.hidden=false;signedBox.hidden=true;
  }
}

document.querySelectorAll('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(b.dataset.page).classList.add('active')}));

document.getElementById('accountForm').addEventListener('submit',e=>{e.preventDefault();state.accounts.push({id:uid(),name:accountName.value.trim(),openingBalance:digits(accountBalance.value)});e.target.reset();accountBalance.value='0';saveLocal();toast('حساب ثبت شد')});
document.getElementById('vehicleForm').addEventListener('submit',e=>{e.preventDefault();state.vehicles.push({id:uid(),name:vehicleName.value.trim()});e.target.reset();saveLocal();toast('خودرو اضافه شد')});
document.getElementById('transactionForm').addEventListener('submit',e=>{e.preventDefault();if(!txAccount.value)return toast('ابتدا یک حساب بسازید');state.transactions.push({id:uid(),type:txType.value,accountId:txAccount.value,vehicleId:txVehicle.value,amount:digits(txAmount.value),date:txDate.value,description:txDescription.value.trim()});e.target.reset();txDate.value=todayJalali();saveLocal();toast('تراکنش ثبت شد')});
document.getElementById('transferForm').addEventListener('submit',e=>{e.preventDefault();if(!transferFrom.value||!transferTo.value)return toast('ابتدا دو حساب بسازید');if(transferFrom.value===transferTo.value)return toast('حساب مبدا و مقصد یکسان است');state.transactions.push({id:uid(),type:'transfer',fromAccountId:transferFrom.value,toAccountId:transferTo.value,amount:digits(transferAmount.value),date:transferDate.value,description:transferDescription.value.trim()});e.target.reset();transferDate.value=todayJalali();saveLocal();toast('انتقال ثبت شد')});
document.getElementById('applyReport').addEventListener('click',renderReports);

document.getElementById('exportBackup').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hesab-man-backup.json';a.click();URL.revokeObjectURL(a.href)});
document.getElementById('importBackup').addEventListener('change',async e=>{try{state={...emptyState(),...JSON.parse(await e.target.files[0].text())};saveLocal();toast('پشتیبان بازیابی شد')}catch{toast('فایل پشتیبان معتبر نیست')}});
document.getElementById('resetApp').addEventListener('click',()=>{if(confirm('همه اطلاعات محلی پاک شود؟')){state=emptyState();saveLocal();toast('اطلاعات محلی پاک شد')}});

window.removeAccount=id=>{if(state.transactions.some(t=>t.accountId===id||t.fromAccountId===id||t.toAccountId===id))return toast('این حساب سابقه تراکنش دارد');if(confirm('حساب حذف شود؟')){state.accounts=state.accounts.filter(a=>a.id!==id);saveLocal()}};
window.removeVehicle=id=>{if(state.transactions.some(t=>t.vehicleId===id))return toast('این خودرو سابقه تراکنش دارد');if(confirm('خودرو حذف شود؟')){state.vehicles=state.vehicles.filter(v=>v.id!==id);saveLocal()}};
window.renameVehicle=id=>{const v=state.vehicles.find(x=>x.id===id);const name=prompt('نام جدید خودرو',v.name);if(name?.trim()){v.name=name.trim();saveLocal()}};

function normalizeUrl(url){return String(url||'').trim().replace(/\/rest\/v1\/?$/,'').replace(/\/$/,'')}
function cloudHeaders(withAuth=true){
  const h={'apikey':cloudConfig.key,'Content-Type':'application/json'};
  if(withAuth&&cloudSession?.access_token)h.Authorization=`Bearer ${cloudSession.access_token}`;
  return h;
}
async function cloudFetch(path,options={}){
  if(!cloudConfig.url||!cloudConfig.key)throw new Error('ابتدا آدرس و کلید Supabase را ذخیره کنید');
  const res=await fetch(`${normalizeUrl(cloudConfig.url)}${path}`,{...options,headers:{...cloudHeaders(options.auth!==false),...(options.headers||{})}});
  const text=await res.text();let body=null;try{body=text?JSON.parse(text):null}catch{body=text}
  if(!res.ok)throw new Error(body?.msg||body?.message||body?.error_description||body?.error||`خطای ${res.status}`);
  return body;
}
function persistSession(session){cloudSession=session;localStorage.setItem(SESSION_KEY,JSON.stringify(session));renderCloudStatus()}
async function signIn(email,password){
  const data=await cloudFetch('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:JSON.stringify({email,password})});persistSession(data);await cloudPull(true);
}
async function signUp(email,password){
  const data=await cloudFetch('/auth/v1/signup',{method:'POST',auth:false,body:JSON.stringify({email,password})});
  if(data?.access_token){persistSession(data);await cloudPush()}else toast('ثبت‌نام انجام شد؛ ایمیل تأیید را بررسی کنید');
}
async function refreshSession(){
  if(!cloudSession?.refresh_token)return false;
  try{const data=await cloudFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:JSON.stringify({refresh_token:cloudSession.refresh_token})});persistSession(data);return true}catch{return false}
}
async function cloudPush(showToast=false){
  if(!cloudSession?.user?.id)return;
  try{
    await cloudFetch('/rest/v1/cloud_states?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:cloudSession.user.id,payload:state,updated_at:new Date().toISOString()})});
    if(showToast)toast('اطلاعات در فضای ابری ذخیره شد');
  }catch(err){if(String(err.message).includes('JWT')){if(await refreshSession())return cloudPush(showToast)}throw err}
}
async function cloudPull(confirmReplace=false){
  if(!cloudSession?.user?.id)return;
  const rows=await cloudFetch(`/rest/v1/cloud_states?user_id=eq.${encodeURIComponent(cloudSession.user.id)}&select=payload,updated_at&limit=1`);
  if(rows?.length&&rows[0].payload){
    if(!confirmReplace||!state.transactions.length||confirm('اطلاعات ابری جایگزین اطلاعات فعلی شود؟')){
      state={...emptyState(),...rows[0].payload};localStorage.setItem(KEY,JSON.stringify(state));renderAll();toast('اطلاعات ابری دریافت شد');
    }
  }else{await cloudPush();toast('نسخه اولیه در فضای ابری ساخته شد')}
}
function scheduleCloudSave(){clearTimeout(syncTimer);if(cloudSession?.access_token)syncTimer=setTimeout(()=>cloudPush().catch(e=>toast('ذخیره ابری ناموفق: '+e.message)),900)}

document.getElementById('saveCloudConfig').addEventListener('click',()=>{
  const url=normalizeUrl(document.getElementById('cloudUrl').value);const key=document.getElementById('cloudKey').value.trim();
  if(!url||!key)return toast('آدرس و کلید را کامل وارد کنید');
  cloudConfig={url,key};localStorage.setItem(CLOUD_KEY,JSON.stringify(cloudConfig));renderCloudStatus();toast('تنظیمات Supabase ذخیره شد');
});
document.getElementById('cloudLoginForm').addEventListener('submit',async e=>{e.preventDefault();try{toast('در حال ورود...');await signIn(cloudEmail.value.trim(),cloudPassword.value);toast('ورود موفق بود')}catch(err){toast('ورود ناموفق: '+err.message)}});
document.getElementById('cloudSignup').addEventListener('click',async()=>{try{toast('در حال ثبت‌نام...');await signUp(cloudEmail.value.trim(),cloudPassword.value)}catch(err){toast('ثبت‌نام ناموفق: '+err.message)}});
document.getElementById('cloudPush').addEventListener('click',()=>cloudPush(true).catch(e=>toast(e.message)));
document.getElementById('cloudPull').addEventListener('click',()=>cloudPull(true).catch(e=>toast(e.message)));
document.getElementById('cloudLogout').addEventListener('click',()=>{cloudSession=null;localStorage.removeItem(SESSION_KEY);renderCloudStatus();toast('از حساب خارج شدید')});

txDate.value=transferDate.value=todayJalali();renderAll();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
