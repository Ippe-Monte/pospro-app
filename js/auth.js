// =====================================================================
// auth.js — login / sign-up / forgot password (Supabase Auth), then pick or create a shop
// Passwords never touch our tables; Supabase Auth stores them hashed.
// =====================================================================
const app=()=>document.getElementById('app');

function authFrame(inner){
  document.body.classList.remove('subpage');
  app().className='';
  app().innerHTML=`<div class="auth"><div class="box"><img class="logo" src="icons/logo.png" alt=""><h1>POSPRO</h1><div class="tag">Smart POS · Better Business</div>${inner}<p class="appver-line">เวอร์ชัน <span class="appver">${APP_VERSION}</span></p></div></div>`;
}

function renderConfigMissing(){
  authFrame(`<div class="card"><h3 style="margin-bottom:6px">ยังไม่ได้ตั้งค่าการเชื่อมต่อ</h3>
  <p class="muted mini">สร้างไฟล์ <b>assets/js/config.js</b> จาก <b>config.example.js</b> แล้วใส่ Supabase URL และ anon key ของร้าน (ดูขั้นตอนใน README)</p></div>`);
}

function renderLogin(err,info){
  authFrame(`<form class="card" id="fLogin" novalidate>
    ${err?`<div class="err" role="alert">${esc(err)}</div>`:''}${info?`<div class="notice info">${ic('info')}<span>${esc(info)}</span></div>`:''}
    <div class="field"><label for="liEmail">อีเมล</label><input id="liEmail" type="email" autocomplete="email" inputmode="email" required></div>
    <div class="field"><label for="liPass">รหัสผ่าน</label><input id="liPass" type="password" autocomplete="current-password" required></div>
    <button class="btn block" type="submit">เข้าสู่ระบบ</button>
    <div class="alt"><a href="#" class="link" id="toForgot">ลืมรหัสผ่าน</a></div>
  </form>
  <div class="alt">ยังไม่มีบัญชี? <a href="#" class="link" id="toSignup">สมัครใช้งาน</a></div>`);
  const f=document.getElementById('fLogin');
  f.onsubmit=async e=>{e.preventDefault();
    const email=val(f,'#liEmail'),password=document.getElementById('liPass').value;
    if(!email||!password)return renderLogin('กรุณากรอกอีเมลและรหัสผ่าน');
    await withBusy(f.querySelector('button[type=submit]'),'กำลังเข้าสู่ระบบ...',async()=>{
      const {error}=await sb.auth.signInWithPassword({email,password});
      if(error)return renderLogin(friendlyError(error));
      await afterLogin();
    });
  };
  document.getElementById('toSignup').onclick=e=>{e.preventDefault();renderSignup()};
  document.getElementById('toForgot').onclick=e=>{e.preventDefault();renderForgot()};
}

function renderSignup(err){
  authFrame(`<form class="card" id="fSign" novalidate>
    <h3 style="margin-bottom:10px">สมัครใช้งาน</h3>
    ${err?`<div class="err" role="alert">${esc(err)}</div>`:''}
    <div class="field"><label for="suName">ชื่อที่แสดงในร้าน</label><input id="suName" autocomplete="name" maxlength="80" required></div>
    <div class="field"><label for="suEmail">อีเมล</label><input id="suEmail" type="email" autocomplete="email" inputmode="email" required></div>
    <div class="field"><label for="suPass">รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</label><input id="suPass" type="password" autocomplete="new-password" minlength="8" required></div>
    <div class="field"><label for="suPass2">ยืนยันรหัสผ่าน</label><input id="suPass2" type="password" autocomplete="new-password" required></div>
    <button class="btn block" type="submit">สมัครใช้งาน</button>
    <p class="mini muted" style="margin-top:10px">สมัครแล้วเลือกได้ว่าจะสร้างร้านใหม่ หรือเข้าร่วมร้านที่มีอยู่ด้วยรหัสร้าน</p>
  </form>
  <div class="alt">มีบัญชีแล้ว? <a href="#" class="link" id="toLogin">เข้าสู่ระบบ</a></div>`);
  const f=document.getElementById('fSign');
  f.onsubmit=async e=>{e.preventDefault();
    const name=val(f,'#suName'),email=val(f,'#suEmail'),p1=document.getElementById('suPass').value,p2=document.getElementById('suPass2').value;
    if(!name||!email||!p1)return renderSignup('กรุณากรอกข้อมูลให้ครบ');
    if(p1.length<8)return renderSignup('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    if(p1!==p2)return renderSignup('รหัสผ่านยืนยันไม่ตรงกัน');
    await withBusy(f.querySelector('button[type=submit]'),'กำลังสมัคร...',async()=>{
      const {data,error}=await sb.auth.signUp({email,password:p1,options:{data:{full_name:name},emailRedirectTo:location.origin+location.pathname}});
      if(error)return renderSignup(friendlyError(error));
      LS.set('pospro_display_name',name);
      if(!data.session)return renderLogin(null,'สมัครสำเร็จ กรุณาเปิดอีเมลแล้วกดลิงก์ยืนยัน จากนั้นกลับมาเข้าสู่ระบบ');
      await afterLogin();
    });
  };
  document.getElementById('toLogin').onclick=e=>{e.preventDefault();renderLogin()};
}

function renderForgot(){
  authFrame(`<form class="card" id="fForgot" novalidate><h3 style="margin-bottom:10px">ลืมรหัสผ่าน</h3>
    <div class="field"><label for="fgEmail">อีเมลที่ใช้สมัคร</label><input id="fgEmail" type="email" autocomplete="email" required></div>
    <button class="btn block" type="submit">ส่งลิงก์ตั้งรหัสผ่านใหม่</button></form>
    <div class="alt"><a href="#" class="link" id="toLogin">กลับไปหน้าเข้าสู่ระบบ</a></div>`);
  const f=document.getElementById('fForgot');
  f.onsubmit=async e=>{e.preventDefault();const email=val(f,'#fgEmail');if(!email)return;
    await withBusy(f.querySelector('button'),'กำลังส่ง...',async()=>{
      must(await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname+'#reset'}));
      renderLogin(null,'ส่งลิงก์ไปที่อีเมลแล้ว เปิดอีเมลเพื่อตั้งรหัสผ่านใหม่');
    });
  };
  document.getElementById('toLogin').onclick=e=>{e.preventDefault();renderLogin()};
}

function renderSetNewPassword(){
  authFrame(`<form class="card" id="fNew" novalidate><h3 style="margin-bottom:10px">ตั้งรหัสผ่านใหม่</h3>
    <div class="field"><label for="npPass">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input id="npPass" type="password" autocomplete="new-password" required></div>
    <button class="btn block" type="submit">บันทึกรหัสผ่าน</button></form>`);
  const f=document.getElementById('fNew');
  f.onsubmit=async e=>{e.preventDefault();const p=document.getElementById('npPass').value;
    if(p.length<8)return toast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',true);
    await withBusy(f.querySelector('button'),'กำลังบันทึก...',async()=>{
      must(await sb.auth.updateUser({password:p}));history.replaceState(null,'',location.pathname);toast('ตั้งรหัสผ่านใหม่แล้ว');await afterLogin();
    });
  };
}

// ---------- after login: memberships -> shop ----------
async function loadMemberships(){
  S.memberships=must(await sb.from('shop_members')
    .select('shop_id,user_id,role,status,display_name,station_id,shops(id,name,join_code,address,phone,tax_id,footer_note,promptpay_id,promptpay_name,logo_path)')
    .eq('user_id',S.user.id));
}

async function afterLogin(){
  const {data}=await sb.auth.getUser();
  S.user=data&&data.user;
  if(!S.user)return renderLogin();
  try{await loadMemberships()}catch(e){return renderLogin(friendlyError(e))}
  const active=S.memberships.filter(m=>m.status==='active'&&m.shops);
  if(!active.length){
    return S.memberships.some(m=>m.status==='pending')?renderPending():renderOnboard();
  }
  const last=LS.get('pospro_shop');
  const pick=active.find(m=>m.shop_id===last)||active[0];
  enterShop(pick);
}

function enterShop(m){
  S.shopId=m.shop_id;S.shop=m.shops;S.role=m.role;S.me=m;
  LS.set('pospro_shop',m.shop_id);
  S.cart=null;
  renderShell();
  go(defaultPage(),{reset:true});
  startLive();
}

function defaultName(){return LS.get('pospro_display_name')||(S.user&&S.user.user_metadata&&S.user.user_metadata.full_name)||''}

function renderOnboard(){
  authFrame(`<div class="mini muted" style="text-align:center;margin-bottom:12px">เข้าสู่ระบบเป็น ${esc(S.user.email)}</div>
    <button type="button" class="choice" id="obCreate"><span class="ichip">${ic('store')}</span><span class="grow"><b>สร้างร้านใหม่</b><br><span class="mini muted">สำหรับเจ้าของร้าน คุณจะเป็นเจ้าของร้านนี้</span></span>${ic('chevr')}</button>
    <button type="button" class="choice" id="obJoin"><span class="ichip">${ic('users')}</span><span class="grow"><b>เข้าร่วมร้านที่มีอยู่</b><br><span class="mini muted">สำหรับพนักงาน ใช้รหัสร้าน 8 หลักจากเจ้าของร้าน</span></span>${ic('chevr')}</button>
    <div class="alt"><a href="#" class="link" id="obOut">ออกจากระบบ</a></div>`);
  document.getElementById('obCreate').onclick=()=>{
    const s=openSheet('สร้างร้านใหม่',`<div class="field"><label for="csName">ชื่อร้าน</label><input id="csName" maxlength="120" placeholder="เช่น แก้วหลงกรุง"></div>
      <div class="field"><label for="csMe">ชื่อของคุณที่แสดงในร้าน</label><input id="csMe" maxlength="80" value="${esc(defaultName())}"></div>
      <p class="mini muted">ระบบจะเพิ่มครัว 1 สถานี และโต๊ะ 6 โต๊ะไว้ให้ แก้ไขได้ภายหลัง</p>`,
      `<button type="button" class="btn" id="csGo">สร้างร้าน</button>`);
    s.el.querySelector('#csGo').onclick=e=>withBusy(e.currentTarget,'กำลังสร้าง...',async()=>{
      const name=val(s.el,'#csName'),me=val(s.el,'#csMe');
      if(!name||!me)return toast('กรุณากรอกชื่อร้านและชื่อของคุณ',true);
      must(await sb.rpc('create_shop',{p_name:name,p_display_name:me}));
      s.close();toast('สร้างร้านแล้ว');await afterLogin();
    });
  };
  document.getElementById('obJoin').onclick=()=>{
    const s=openSheet('เข้าร่วมร้าน',`<div class="field"><label for="jsCode">รหัสร้าน</label><input id="jsCode" maxlength="12" autocapitalize="characters" placeholder="เช่น 7F3A9C21" style="text-transform:uppercase;letter-spacing:.1em"></div>
      <div class="field"><label for="jsMe">ชื่อของคุณที่แสดงในร้าน</label><input id="jsMe" maxlength="80" value="${esc(defaultName())}"></div>
      <p class="mini muted">หลังส่งคำขอ เจ้าของร้านต้องอนุมัติและกำหนดหน้าที่ให้ก่อนจึงจะใช้งานได้</p>`,
      `<button type="button" class="btn" id="jsGo">ส่งคำขอเข้าร่วม</button>`);
    s.el.querySelector('#jsGo').onclick=e=>withBusy(e.currentTarget,'กำลังส่ง...',async()=>{
      const code=val(s.el,'#jsCode').toUpperCase(),me=val(s.el,'#jsMe');
      if(!code||!me)return toast('กรุณากรอกรหัสร้านและชื่อของคุณ',true);
      const r=must(await sb.rpc('join_shop',{p_code:code,p_display_name:me}));
      if(r&&r.shop_name)LS.set('pospro_pending_name',r.shop_name);
      s.close();await afterLogin();
    });
  };
  document.getElementById('obOut').onclick=e=>{e.preventDefault();signOut()};
}

function renderPending(){
  const nm=LS.get('pospro_pending_name');
  authFrame(`<div class="card" style="text-align:center"><div class="ichip" style="margin:4px auto 10px;width:52px;height:52px;border-radius:50%;background:var(--warn-p);color:var(--warn)">${ic('clock')}</div>
    <h3>รอเจ้าของร้านอนุมัติ</h3><p class="muted mini" style="margin:6px 0 14px">${nm?`ส่งคำขอเข้าร่วม “${esc(nm)}” แล้ว `:''}เมื่อได้รับอนุมัติ กดปุ่มด้านล่างเพื่อเข้าใช้งาน</p>
    <button type="button" class="btn block" id="pdRe">${ic('refresh')}ตรวจสอบอีกครั้ง</button></div>
    <div class="alt"><a href="#" class="link" id="pdOther">ใช้รหัสร้านอื่น</a> · <a href="#" class="link" id="pdOut">ออกจากระบบ</a></div>`);
  document.getElementById('pdRe').onclick=e=>withBusy(e.currentTarget,'กำลังตรวจสอบ...',afterLogin);
  document.getElementById('pdOther').onclick=e=>{e.preventDefault();renderOnboard()};
  document.getElementById('pdOut').onclick=e=>{e.preventDefault();signOut()};
}

async function signOut(){
  stopLive();
  try{await sb.auth.signOut()}catch(e){}
  Object.assign(S,{user:null,memberships:[],shopId:null,shop:null,role:null,me:null,stack:[]});
  renderLogin();
}
