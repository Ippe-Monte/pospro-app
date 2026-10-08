// =====================================================================
// extras.js — promotions, members (customers) and stock. Needed by the bill (promo codes, member points)
// and by pay_order (stock is deducted from each menu's recipe when a bill is paid).
// =====================================================================

// ---------- promotions ----------
definePage('promo',{title:'โปรโมชัน',roles:['owner','manager'],sub:true,
  actions(){return `<button type="button" class="btn sm" id="actAddPromo">${ic('plus')}โปร</button>`},
  async render(){
    const rows=must(await sb.from('promotions').select('*').eq('shop_id',S.shopId).order('created_at'));
    EXTRA.promos=rows;
    if(!rows.length)return `<div class="card empty">ยังไม่มีโปรโมชัน<br><span class="mini">สร้างโค้ดส่วนลด แล้วแคชเชียร์เลือกใช้ได้ตอนเช็คบิล</span></div>`;
    return `<div class="list">${rows.map(p=>`<button type="button" class="row tap" style="width:100%;text-align:left" data-promo="${p.id}"><span class="ichip">${ic('tag')}</span>
      <span class="grow"><span class="t">${esc(p.name)}</span><span class="s">โค้ด <b>${esc(p.code)}</b> · ลด ${p.kind==='percent'?Number(p.value)+'%':baht(p.value)}</span></span>${p.active?'<span class="pill ok">ใช้งาน</span>':'<span class="pill">ปิด</span>'}${ic('chevr')}</button>`).join('')}</div>`;
  },
  bind(v){
    v.querySelector('#actAddPromo').onclick=()=>editPromo(null);
    v.querySelectorAll('[data-promo]').forEach(b=>b.onclick=()=>editPromo(EXTRA.promos.find(p=>p.id===b.dataset.promo)));
  }
});
const EXTRA={promos:[],members:[],stock:[]};
function editPromo(p){
  const isNew=!p;p=p||{name:'',code:'',kind:'percent',value:'',active:true};
  const s=openSheet(isNew?'เพิ่มโปรโมชัน':'แก้ไขโปรโมชัน',`
    <div class="field"><label for="prName">ชื่อโปร</label><input id="prName" maxlength="80" value="${esc(p.name)}" placeholder="เช่น ลด 10% ทุกเมนู"></div>
    <div class="grid2 keep2"><div class="field"><label for="prCode">โค้ด</label><input id="prCode" maxlength="20" value="${esc(p.code)}" placeholder="SAVE10" style="text-transform:uppercase"></div>
    <div class="field"><label for="prKind">แบบส่วนลด</label><select id="prKind"><option value="percent"${p.kind==='percent'?' selected':''}>เปอร์เซ็นต์ (%)</option><option value="amount"${p.kind==='amount'?' selected':''}>จำนวนบาท</option></select></div></div>
    <div class="field"><label for="prVal">ลดเท่าไร</label><input id="prVal" inputmode="decimal" value="${esc(p.value)}"></div>
    <label class="switch"><span>เปิดใช้งาน</span><input type="checkbox" id="prOn"${p.active?' checked':''}></label>`,
    `${isNew?'':`<button type="button" class="btn danger" id="prDel" style="flex:0 0 auto" aria-label="ลบ">${ic('trash')}</button>`}<button type="button" class="btn" id="prSave">บันทึก</button>`);
  s.el.querySelector('#prSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const row={name:val(s.el,'#prName'),code:val(s.el,'#prCode').toUpperCase().replace(/\s/g,''),kind:val(s.el,'#prKind'),value:num(s.el,'#prVal'),active:s.el.querySelector('#prOn').checked};
    if(!row.name)return toast('ใส่ชื่อโปร',true);
    if(!/^[A-Z0-9_-]{2,20}$/.test(row.code))return toast('โค้ดใช้ได้เฉพาะ A–Z ตัวเลข - _ ยาว 2–20 ตัว',true);
    if(!(row.value>0)||(row.kind==='percent'&&row.value>100))return toast('ส่วนลดไม่ถูกต้อง',true);
    if(isNew)must(await sb.from('promotions').insert({...row,shop_id:S.shopId}));else must(await sb.from('promotions').update(row).eq('id',p.id));
    s.close();toast('บันทึกแล้ว');refresh();
  });
  const d=s.el.querySelector('#prDel');if(d)d.onclick=async()=>{if(!await confirmSheet('ลบโปรนี้?',`โค้ด ${p.code} จะใช้ไม่ได้อีก บิลเก่าไม่เปลี่ยน`,'ลบ',true))return;try{must(await sb.from('promotions').delete().eq('id',p.id));s.close();refresh()}catch(e){toastErr(e)}};
}

// ---------- members ----------
definePage('customers',{title:'สมาชิก',roles:['owner','manager','cashier'],sub:true,
  actions(){return `<button type="button" class="btn sm" id="actAddMem">${ic('plus')}สมาชิก</button>`},
  async render(){
    const rows=must(await sb.from('customers').select('*').eq('shop_id',S.shopId).order('spend',{ascending:false}));
    EXTRA.members=rows;
    return `<div class="searchbox">${ic('search')}<input id="memQ" type="search" placeholder="ค้นหาชื่อหรือเบอร์โทร" aria-label="ค้นหาสมาชิก"></div>
      <p class="mini muted" style="margin:0 4px 8px">ได้ 1 แต้มทุก 100 บาท · ค้นหาด้วยเบอร์โทรตอนเช็คบิล</p><div class="list" id="memList"></div>`;
  },
  bind(v){
    const paint=()=>{const q=val(v,'#memQ').toLowerCase();const list=EXTRA.members.filter(m=>!q||m.name.toLowerCase().includes(q)||String(m.phone||'').includes(q));
      v.querySelector('#memList').innerHTML=list.map(m=>`<button type="button" class="row tap" style="width:100%;text-align:left" data-mem="${m.id}"><span class="avatar" style="width:38px;height:38px;font-size:15px">${esc(initial(m.name))}</span><span class="grow"><span class="t">${esc(m.name)}</span><span class="s">${esc(m.phone||'-')} · มา ${m.visits} ครั้ง · ${baht(m.spend)}</span></span><span class="pill info">${m.points} แต้ม</span></button>`).join('')||'<div class="empty">ยังไม่มีสมาชิก</div>';
      v.querySelectorAll('[data-mem]').forEach(b=>b.onclick=()=>editMember2(EXTRA.members.find(m=>m.id===b.dataset.mem)))};
    v.querySelector('#memQ').oninput=paint;paint();
    v.querySelector('#actAddMem').onclick=()=>editMember2(null);
  }
});
function editMember2(m){
  const isNew=!m;m=m||{name:'',phone:'',birthday:''};
  const s=openSheet(isNew?'เพิ่มสมาชิก':m.name,`
    <div class="field"><label for="cmName">ชื่อ</label><input id="cmName" maxlength="80" value="${esc(m.name)}"></div>
    <div class="grid2 keep2"><div class="field"><label for="cmPhone">เบอร์โทร</label><input id="cmPhone" inputmode="tel" maxlength="30" value="${esc(m.phone||'')}"></div>
    <div class="field"><label for="cmBd">วันเกิด</label><input id="cmBd" type="date" value="${esc(m.birthday||'')}"></div></div>
    ${isNew?'':`<p class="mini muted">มา ${m.visits} ครั้ง · ใช้จ่ายรวม ${baht(m.spend)} · ${m.points} แต้ม</p>`}`,
    `${!isNew&&can('owner','manager')?`<button type="button" class="btn danger" id="cmDel" style="flex:0 0 auto" aria-label="ลบ">${ic('trash')}</button>`:''}<button type="button" class="btn" id="cmSave">บันทึก</button>`);
  s.el.querySelector('#cmSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const row={name:val(s.el,'#cmName'),phone:val(s.el,'#cmPhone')||null,birthday:val(s.el,'#cmBd')||null};
    if(!row.name)return toast('ใส่ชื่อสมาชิก',true);
    if(row.phone&&EXTRA.members.some(x=>x.id!==m.id&&String(x.phone||'').replace(/\D/g,'')===row.phone.replace(/\D/g,'')))return toast('เบอร์นี้มีสมาชิกแล้ว',true);
    if(isNew)must(await sb.from('customers').insert({...row,shop_id:S.shopId}));else must(await sb.from('customers').update(row).eq('id',m.id));
    s.close();toast('บันทึกแล้ว');refresh();
  });
  const d=s.el.querySelector('#cmDel');if(d)d.onclick=async()=>{if(!await confirmSheet('ลบสมาชิกนี้?','แต้มสะสมจะหายไป บิลเก่ายังอยู่','ลบ',true))return;try{must(await sb.from('customers').delete().eq('id',m.id));s.close();refresh()}catch(e){toastErr(e)}};
}

// ---------- stock ----------
definePage('stock',{title:'สต๊อกวัตถุดิบ',roles:['owner','manager'],sub:true,
  actions(){return `<button type="button" class="btn sm" id="actAddStock">${ic('plus')}วัตถุดิบ</button>`},
  async render(){
    const rows=must(await sb.from('stock_items').select('*').eq('shop_id',S.shopId).order('name'));
    EXTRA.stock=rows;
    const low=rows.filter(r=>Number(r.qty)<=Number(r.threshold));
    if(!rows.length)return `<div class="card empty">ยังไม่มีวัตถุดิบ<br><span class="mini">เพิ่มวัตถุดิบ แล้วกำหนดสูตรในแต่ละเมนู ระบบจะตัดสต๊อกให้เมื่อชำระเงิน</span></div>`;
    return `${low.length?`<div class="notice">${ic('info')}<span>ใกล้หมด ${low.length} รายการ: ${esc(low.map(r=>r.name).join(', '))}</span></div>`:''}
      <div class="list">${rows.map(r=>{const isLow=Number(r.qty)<=Number(r.threshold);return `<button type="button" class="row tap" style="width:100%;text-align:left" data-stock="${r.id}">
        <span class="ichip">${ic('box')}</span><span class="grow"><span class="t">${esc(r.name)}</span><span class="s">แจ้งเตือนเมื่อเหลือ ${fmtQty(r.threshold)} ${esc(r.unit)}</span></span>
        <b class="nowrap" style="color:${isLow?'var(--danger)':'inherit'}">${fmtQty(r.qty)} ${esc(r.unit)}</b>${ic('chevr')}</button>`}).join('')}</div>`;
  },
  bind(v){
    v.querySelector('#actAddStock').onclick=()=>editStock(null);
    v.querySelectorAll('[data-stock]').forEach(b=>b.onclick=()=>editStock(EXTRA.stock.find(r=>r.id===b.dataset.stock)));
  }
});
function fmtQty(n){n=Number(n||0);return n.toLocaleString('th-TH',{maximumFractionDigits:3})}
function editStock(r){
  const isNew=!r;r=r||{name:'',qty:0,unit:'',threshold:0,std_price:0};
  const s=openSheet(isNew?'เพิ่มวัตถุดิบ':r.name,`
    <div class="field"><label for="skName">ชื่อวัตถุดิบ</label><input id="skName" maxlength="80" value="${esc(r.name)}"></div>
    <div class="grid2 keep2"><div class="field"><label for="skQty">คงเหลือ</label><input id="skQty" inputmode="decimal" value="${esc(r.qty)}"></div>
    <div class="field"><label for="skUnit">หน่วย</label><input id="skUnit" maxlength="20" value="${esc(r.unit)}" placeholder="g, ลูก, ขวด"></div></div>
    ${isNew?'':`<div class="mgroup" style="margin-top:0">รับของเข้า / ปรับยอด</div><div class="searchrow"><input id="skAdd" inputmode="decimal" placeholder="+ จำนวนที่รับเข้า (ใส่ - เพื่อหัก)" aria-label="ปรับยอด"><button type="button" class="btn secondary sm" id="skAddBtn">ปรับ</button></div>`}
    <div class="grid2 keep2"><div class="field"><label for="skTh">แจ้งเตือนเมื่อเหลือ</label><input id="skTh" inputmode="decimal" value="${esc(r.threshold)}"></div>
    <div class="field"><label for="skPrice">ต้นทุนต่อหน่วย (บาท)</label><input id="skPrice" inputmode="decimal" value="${esc(r.std_price)}"></div></div>`,
    `${isNew?'':`<button type="button" class="btn danger" id="skDel" style="flex:0 0 auto" aria-label="ลบ">${ic('trash')}</button>`}<button type="button" class="btn" id="skSave">บันทึก</button>`);
  const el=s.el;
  const ab=el.querySelector('#skAddBtn');if(ab)ab.onclick=()=>{const a=num(el,'#skAdd');if(!a)return;el.querySelector('#skQty').value=Math.round((Number(el.querySelector('#skQty').value)+a)*1000)/1000;el.querySelector('#skAdd').value=''};
  el.querySelector('#skSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const row={name:val(el,'#skName'),qty:num(el,'#skQty')||0,unit:val(el,'#skUnit'),threshold:Math.max(0,num(el,'#skTh')||0),std_price:Math.max(0,num(el,'#skPrice')||0)};
    if(!row.name)return toast('ใส่ชื่อวัตถุดิบ',true);
    if(isNew)must(await sb.from('stock_items').insert({...row,shop_id:S.shopId}));else must(await sb.from('stock_items').update(row).eq('id',r.id));
    audit((isNew?'เพิ่มวัตถุดิบ ':'ปรับสต๊อก ')+row.name+' = '+row.qty+' '+row.unit);
    s.close();toast('บันทึกแล้ว');refresh();
  });
  const d=el.querySelector('#skDel');if(d)d.onclick=async()=>{if(!await confirmSheet('ลบวัตถุดิบนี้?','จะถูกลบออกจากสูตรของทุกเมนูด้วย','ลบ',true))return;try{must(await sb.from('stock_items').delete().eq('id',r.id));s.close();refresh()}catch(e){toastErr(e)}};
}

// recipe editor used by the product sheet (menu.js): rows of {stock_id, qty}
async function recipeEditor(container,productId){
  const [stock,rec]=await Promise.all([sb.from('stock_items').select('id,name,unit').eq('shop_id',S.shopId).order('name'),
    productId?sb.from('recipes').select('stock_id,qty').eq('product_id',productId):Promise.resolve({data:[]})]);
  const items=must(stock),rows=(rec.data||[]).map(x=>({stock_id:x.stock_id,qty:Number(x.qty)}));
  const paint=()=>{
    if(!items.length){container.innerHTML=`<p class="mini muted">ยังไม่มีวัตถุดิบในสต๊อก — เพิ่มได้ที่ โปรไฟล์ → สต๊อกวัตถุดิบ</p>`;return}
    container.innerHTML=rows.map((r,i)=>{const it=items.find(x=>x.id===r.stock_id);return `<div class="recrow"><span class="grow">${esc(it?it.name:'?')}</span><input inputmode="decimal" value="${r.qty}" data-rq="${i}" aria-label="ปริมาณ"><span class="mini muted">${esc(it?it.unit:'')}</span><button type="button" class="iconbtn sm" data-rx="${i}" aria-label="ลบ">${ic('x')}</button></div>`}).join('')+
      `<div class="searchrow"><select id="recSel" aria-label="วัตถุดิบ"><option value="">+ เพิ่มวัตถุดิบในสูตร</option>${items.filter(x=>!rows.some(r=>r.stock_id===x.id)).map(x=>`<option value="${x.id}">${esc(x.name)} (${esc(x.unit)})</option>`).join('')}</select></div>`;
    container.querySelectorAll('[data-rq]').forEach(inp=>inp.oninput=()=>{rows[+inp.dataset.rq].qty=Number(inp.value)||0});
    container.querySelectorAll('[data-rx]').forEach(b=>b.onclick=()=>{rows.splice(+b.dataset.rx,1);paint()});
    container.querySelector('#recSel').onchange=e=>{if(e.target.value){rows.push({stock_id:e.target.value,qty:1});paint()}};
  };
  paint();
  return {async save(pid){
    const valid=rows.filter(r=>r.qty>0);
    must(await sb.from('recipes').delete().eq('product_id',pid));
    if(valid.length)must(await sb.from('recipes').insert(valid.map(r=>({product_id:pid,stock_id:r.stock_id,qty:r.qty,shop_id:S.shopId}))));
  }};
}
