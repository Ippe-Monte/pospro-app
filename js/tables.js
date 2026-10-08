// =====================================================================
// tables.js — editors for dining tables (name, order, QR on/off, new QR) and kitchen stations
// The live tables page and the kitchen display are in live.js.
// =====================================================================
async function editTable(t){
  const isNew=!t;
  if(isNew){const {count}=await sb.from('dining_tables').select('*',{count:'exact',head:true}).eq('shop_id',S.shopId);t={name:'โต๊ะ '+((count||0)+1),sort:(count||0)+1,qr_enabled:true}}
  const s=openSheet(isNew?'เพิ่มโต๊ะ':'แก้ไขโต๊ะ',`
    <div class="grid2 keep2"><div class="field"><label for="teName">ชื่อโต๊ะ</label><input id="teName" maxlength="40" value="${esc(t.name)}"></div>
    <div class="field"><label for="teSort">ลำดับ</label><input id="teSort" inputmode="numeric" value="${esc(t.sort)}"></div></div>
    <label class="switch"><span>เปิดให้ลูกค้าสแกน QR สั่งเอง</span><input type="checkbox" id="teQr"${t.qr_enabled?' checked':''}></label>
    ${isNew?'':`<p class="mini muted">ถ้า QR ของโต๊ะนี้หลุดออกไป กด “สร้าง QR ใหม่” เพื่อให้ QR เดิมใช้ไม่ได้</p><button type="button" class="btn secondary sm" id="teNewQr" style="margin-top:8px">${ic('refresh')}สร้าง QR ใหม่</button>`}`,
    `${isNew?'':`<button type="button" class="btn danger" id="teDel" style="flex:0 0 auto" aria-label="ลบโต๊ะ">${ic('trash')}</button>`}<button type="button" class="btn" id="teSave">บันทึก</button>`);
  s.el.querySelector('#teSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const name=val(s.el,'#teName'),sort=parseInt(val(s.el,'#teSort'))||0,qr_enabled=s.el.querySelector('#teQr').checked;
    if(!name)return toast('กรุณาใส่ชื่อโต๊ะ',true);
    if(isNew)must(await sb.from('dining_tables').insert({shop_id:S.shopId,name,sort,qr_enabled}));
    else must(await sb.from('dining_tables').update({name,sort,qr_enabled}).eq('id',t.id));
    s.close();toast('บันทึกแล้ว');refresh();
  });
  const nq=s.el.querySelector('#teNewQr');
  if(nq)nq.onclick=e=>withBusy(e.currentTarget,'กำลังสร้าง...',async()=>{
    must(await sb.from('dining_tables').update({qr_token:crypto.randomUUID()}).eq('id',t.id));toast('สร้าง QR ใหม่แล้ว QR เดิมใช้ไม่ได้อีก');audit('สร้าง QR ใหม่ '+t.name)});
  const del=s.el.querySelector('#teDel');
  if(del)del.onclick=async()=>{
    if(!await confirmSheet('ลบโต๊ะนี้?',`“${t.name}” จะถูกลบ บิลเก่ายังอยู่แต่จะไม่ระบุโต๊ะ`,'ลบโต๊ะ',true))return;
    try{must(await sb.from('dining_tables').delete().eq('id',t.id));s.close();toast('ลบแล้ว');refresh()}catch(e){toastErr(e)}
  };
}

// stations list in a sheet (opened from the kitchen page by owner / manager)
async function openStationsSheet(){
  const rows=must(await sb.from('stations').select('*').eq('shop_id',S.shopId).order('sort').order('name'));
  const s=openSheet('สถานีครัว',`<p class="mini muted" style="margin-bottom:8px">แต่ละเมนูเลือกได้ว่าส่งไปสถานีไหน จอครัวแต่ละจอจะเห็นเฉพาะสถานีของตัวเอง</p>
    <div class="list">${rows.map(st=>`<button type="button" class="row tap" style="width:100%;text-align:left" data-st="${st.id}"><span class="ichip">${ic('flame')}</span><span class="grow"><span class="t">${esc(st.name)}</span></span>${ic('edit')}</button>`).join('')||'<div class="empty">ยังไม่มีสถานี</div>'}</div>`,
    `<button type="button" class="btn" id="stAdd">${ic('plus')}เพิ่มสถานี</button>`);
  s.el.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{s.close();editStation(rows.find(x=>x.id===b.dataset.st))});
  s.el.querySelector('#stAdd').onclick=()=>{s.close();editStation(null)};
}

function editStation(st){
  const isNew=!st;st=st||{name:'',sort:0};
  const s=openSheet(isNew?'เพิ่มสถานีครัว':'แก้ไขสถานีครัว',`<div class="field"><label for="seName">ชื่อสถานี</label><input id="seName" maxlength="60" value="${esc(st.name)}" placeholder="เช่น ครัวก๋วยเตี๋ยว / ครัวงานทอด / บาร์น้ำ"></div>`,
    `${isNew?'':`<button type="button" class="btn danger" id="seDel" style="flex:0 0 auto" aria-label="ลบสถานี">${ic('trash')}</button>`}<button type="button" class="btn" id="seSave">บันทึก</button>`);
  s.el.querySelector('#seSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const name=val(s.el,'#seName');if(!name)return toast('กรุณาใส่ชื่อสถานี',true);
    if(isNew)must(await sb.from('stations').insert({shop_id:S.shopId,name}));else must(await sb.from('stations').update({name}).eq('id',st.id));
    s.close();toast('บันทึกแล้ว');refresh();
  });
  const del=s.el.querySelector('#seDel');
  if(del)del.onclick=async()=>{
    if(!await confirmSheet('ลบสถานีนี้?',`เมนูที่ส่งไป “${st.name}” จะกลายเป็น “ไม่ส่งครัว” จนกว่าจะเลือกสถานีใหม่`,'ลบสถานี',true))return;
    try{must(await sb.from('stations').delete().eq('id',st.id));s.close();toast('ลบแล้ว');refresh()}catch(e){toastErr(e)}
  };
}
