// =====================================================================
// staff.js — staff list, join code, approve / change role (owner only; set_member RPC enforces it)
// =====================================================================
definePage('staff',{title:'พนักงานและสิทธิ์',roles:['owner','manager'],sub:true,
  async render(){
    const [members,stations]=await Promise.all([
      sb.from('shop_members').select('user_id,role,status,display_name,station_id,created_at').eq('shop_id',S.shopId).order('created_at'),
      sb.from('stations').select('id,name').eq('shop_id',S.shopId).order('sort')]);
    STAFF_UI.members=must(members);STAFF_UI.stations=must(stations);
    const by=st=>STAFF_UI.members.filter(m=>m.status===st);
    const row=m=>{
      const st=STAFF_UI.stations.find(x=>x.id===m.station_id);
      const pill=m.status==='pending'?'<span class="pill warn">รออนุมัติ</span>':m.status==='disabled'?'<span class="pill bad">ปิดใช้งาน</span>':`<span class="pill info">${ROLE_LABEL[m.role]}</span>`;
      return `<button type="button" class="row${can('owner')?' tap':''}" style="width:100%;text-align:left" data-user="${m.user_id}">
        <span class="avatar" style="width:38px;height:38px;font-size:15px">${esc(initial(m.display_name))}</span>
        <span class="grow"><span class="t">${esc(m.display_name)}${m.user_id===S.user.id?' (คุณ)':''}</span><span class="s">${pill}${st?' · '+esc(st.name):''}</span></span>${can('owner')?ic('chevr'):''}</button>`};
    const code=S.shop.join_code||'';
    let html=`<div class="card"><div class="mini muted">รหัสร้านสำหรับให้พนักงานเข้าร่วม</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:4px"><span class="code-big">${esc(code)}</span><button type="button" class="btn soft sm" id="copyCode">${ic('copy')}คัดลอก</button></div>
      <p class="mini muted" style="margin-top:6px">พนักงานสมัครใช้งาน → เลือก “เข้าร่วมร้าน” → ใส่รหัสนี้ จากนั้นเจ้าของร้านอนุมัติและเลือกหน้าที่</p></div>`;
    if(by('pending').length)html+=`<div class="section"><h3>รออนุมัติ</h3><span class="pill warn">${by('pending').length}</span></div><div class="list">${by('pending').map(row).join('')}</div>`;
    html+=`<div class="section"><h3>พนักงานในร้าน</h3></div><div class="list">${by('active').map(row).join('')||'<div class="empty">ยังไม่มี</div>'}</div>`;
    if(by('disabled').length)html+=`<div class="section"><h3>ปิดการใช้งาน</h3></div><div class="list">${by('disabled').map(row).join('')}</div>`;
    if(!can('owner'))html+=`<p class="mini muted" style="margin:4px">เฉพาะเจ้าของร้านเท่านั้นที่อนุมัติหรือเปลี่ยนหน้าที่พนักงานได้</p>`;
    return html;
  },
  bind(v){
    v.querySelector('#copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(S.shop.join_code);toast('คัดลอกรหัสร้านแล้ว')}catch(e){toast('คัดลอกไม่ได้ กรุณาจดรหัสไว้',true)}};
    if(can('owner'))v.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>editMember(STAFF_UI.members.find(m=>m.user_id===b.dataset.user)));
  }
});
const STAFF_UI={members:[],stations:[]};

function editMember(m){
  const roles=['owner','manager','cashier','kitchen'];
  const roleHelp={owner:'ทำได้ทุกอย่าง รวมถึงอนุมัติพนักงาน',manager:'จัดการเมนู โต๊ะ ตั้งค่าร้าน รายงาน',cashier:'ขาย เช็คบิล ดูครัว',kitchen:'เห็นเฉพาะจอครัวของสถานีที่เลือก'};
  const s=openSheet(m.display_name,`
    <div class="field"><label>หน้าที่</label><div class="list" style="box-shadow:none;border:1.5px solid var(--line)">${roles.map(r=>`<label class="row tap" style="cursor:pointer"><input type="radio" name="mRole" value="${r}"${(m.status==='pending'?'cashier':m.role)===r?' checked':''} style="width:20px;height:20px;accent-color:var(--brand)"><span class="grow"><span class="t">${ROLE_LABEL[r]}</span><span class="s">${roleHelp[r]}</span></span></label>`).join('')}</div></div>
    <div class="field" id="mStWrap"><label for="mSt">สถานีครัว</label><select id="mSt">${STAFF_UI.stations.map(x=>`<option value="${x.id}"${x.id===m.station_id?' selected':''}>${esc(x.name)}</option>`).join('')}</select></div>`,
    m.status==='active'
      ?`<button type="button" class="btn danger" id="mOff">ปิดการใช้งาน</button><button type="button" class="btn" id="mSave">บันทึก</button>`
      :m.status==='pending'
        ?`<button type="button" class="btn danger" id="mOff">ไม่อนุมัติ</button><button type="button" class="btn" id="mSave">อนุมัติ</button>`
        :`<button type="button" class="btn" id="mSave">เปิดใช้งานอีกครั้ง</button>`);
  const el=s.el;
  const syncSt=()=>{el.querySelector('#mStWrap').classList.toggle('hide',el.querySelector('input[name=mRole]:checked').value!=='kitchen')};
  el.querySelectorAll('input[name=mRole]').forEach(r=>r.onchange=syncSt);syncSt();
  const call=async(status)=>{
    const role=el.querySelector('input[name=mRole]:checked').value;
    must(await sb.rpc('set_member',{p_shop:S.shopId,p_user:m.user_id,p_role:role,p_status:status,p_station:role==='kitchen'?(val(el,'#mSt')||null):null}));
    s.close();toast('บันทึกแล้ว');
    if(m.user_id===S.user.id){await loadMemberships();const me=S.memberships.find(x=>x.shop_id===S.shopId&&x.status==='active');if(me)return enterShop(me);return afterLogin()}
    refresh();
  };
  el.querySelector('#mSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',()=>call('active'));
  const off=el.querySelector('#mOff');
  if(off)off.onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',()=>call('disabled'));
}
