// =====================================================================
// core.js — version, config, Supabase client, shared state and small helpers
// =====================================================================
const APP_VERSION='2.0.0';
const CFG=window.POSPRO_CONFIG||{};
let sb=null;

// one place for app state; pages read from here instead of globals scattered around
const S={
  user:null,            // Supabase auth user
  memberships:[],       // rows of shop_members for this user (+ shops embedded when active)
  shopId:null, shop:null, role:null, me:null,   // current shop, my role, my membership row
  page:'home', stack:[],
};

const ROLE_LABEL={owner:'เจ้าของร้าน',manager:'ผู้จัดการ',cashier:'แคชเชียร์',kitchen:'ครัว'};
const STATUS_LABEL={pending:'รออนุมัติ',active:'ใช้งาน',disabled:'ปิดการใช้งาน'};

function initSupabase(){
  if(!CFG.SUPABASE_URL||!CFG.SUPABASE_ANON_KEY||!window.supabase) return false;
  sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  return true;
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function baht(n){n=Number(n||0);return '฿'+n.toLocaleString('th-TH',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})}
function can(...roles){return roles.includes(S.role)}
function initial(name){return (String(name||'?').trim()[0]||'?').toUpperCase()}
const LANG='th';                 // TH/EN arrives in phase 5 (skill-thai-english-i18n)
function translateDOM(){}        // placeholder so shared components can call it

// browser storage is only a convenience (last shop picked); every read/write may throw in private mode
const LS={
  get(k){try{return localStorage.getItem(k)}catch(e){return null}},
  set(k,v){try{localStorage.setItem(k,v)}catch(e){}},
  del(k){try{localStorage.removeItem(k)}catch(e){}}
};

function must(res){if(res.error)throw res.error;return res.data}

function friendlyError(e){
  const m=String((e&&(e.message||e.error_description||e.msg))||e||'');
  const map=[
    [/Invalid login credentials/i,'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
    [/Email not confirmed/i,'ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ในอีเมลที่ระบบส่งไปก่อน'],
    [/already registered|already exists.*user/i,'อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบหรือกดลืมรหัสผ่าน'],
    [/Password should be|weak password/i,'รหัสผ่านสั้นหรือง่ายเกินไป (อย่างน้อย 8 ตัวอักษร)'],
    [/rate limit|too many requests/i,'ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'],
    [/Failed to fetch|NetworkError|Load failed/i,'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจสอบสัญญาณแล้วลองใหม่'],
    [/row-level security|permission denied|not allowed/i,'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้'],
    [/duplicate key.*(name|code)/i,'ชื่อนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น'],
    [/exceeded the maximum allowed size|Payload too large|too large/i,'รูปใหญ่เกินไป ระบบย่อรูปไม่สำเร็จ ลองเลือกรูปอื่น'],
    [/mime type|invalid.*type/i,'ไฟล์นี้ไม่ใช่รูป JPG / PNG / WebP'],
    [/Bucket not found/i,'ยังไม่ได้สร้างที่เก็บรูป (รันไฟล์ SQL ให้ครบก่อน)'],
    [/JWT|session/i,'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'],
  ];
  for(const [re,txt] of map) if(re.test(m)) return txt;
  return m||'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

function toast(msg,isErr){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast'+(isErr?' err':'');el.textContent=msg;el.setAttribute('role','status');
  document.body.appendChild(el);setTimeout(()=>el.remove(),isErr?4200:2400);
}
function toastErr(e){console.error(e);toast(friendlyError(e),true)}

async function audit(action){
  if(!S.shopId||!S.user)return;
  try{await sb.from('audit_log').insert({shop_id:S.shopId,user_id:S.user.id,action:String(action).slice(0,300)})}catch(e){}
}
