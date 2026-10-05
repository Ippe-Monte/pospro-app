// =====================================================================
// menu.js — menu management: products (with photos), categories, option groups
// Owner / manager only (RLS enforces the same rule in the database).
// =====================================================================
const MENU_UI={tab:'items',cat:'all',data:null};

async function loadMenuData(){
  const sid=S.shopId;
  const [cats,prods,stations,groups]=await Promise.all([
    sb.from('categories').select('*').eq('shop_id',sid).order('sort').order('name'),
    sb.from('products').select('*').eq('shop_id',sid).order('sort').order('name'),
    sb.from('stations').select('*').eq('shop_id',sid).order('sort').order('name'),
    sb.from('option_groups').select('*').eq('shop_id',sid).order('sort').order('name'),
  ]);
  MENU_UI.data={cats:must(cats),prods:must(prods),stations:must(stations),groups:must(groups)};
  return MENU_UI.data;
}

// "เพิ่มหมู +10", "เพิ่มหมู (+10)", "ไม่ใส่ผัก" -> {name, price}
function parseChoiceLine(line){
  const s=String(line).trim();if(!s)return null;
  const m=s.match(/^(.*?)\s*\(?\s*\+\s*(\d+(?:\.\d+)?)\s*(?:บาท|฿)?\s*\)?\s*$/);
  if(m&&m[1].trim())return {name:m[1].trim().slice(0,40),price:Number(m[2])};
  return {name:s.slice(0,40),price:0};
}
function choiceLine(c){return c.price?`${c.name} +${c.price}`:c.name}

definePage('menu',{title:'เมนูและสินค้า',roles:['owner','manager'],sub:true,navAs:'menu',
  actions(){return MENU_UI.tab==='cats'
    ?`<button type="button" class="btn sm" id="actAddCat">${ic('plus')}หมวด</button>`
    :`<button type="button" class="btn sm" id="actAddProd">${ic('plus')}เมนู</button>`},
  async render(){
    const d=await loadMenuData();
    const tabs=`<div class="segtabs" role="tablist"><button type="button" role="tab" data-tab="items" class="${MENU_UI.tab==='items'?'active':''}">เมนู ${d.prods.length}</button><button type="button" role="tab" data-tab="cats" class="${MENU_UI.tab==='cats'?'active':''}">หมวดหมู่และตัวเลือก</button></div>`;
    return tabs+(MENU_UI.tab==='cats'?renderCatsTab(d):renderItemsTab(d));
  },
  bind(v){
    v.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{MENU_UI.tab=b.dataset.tab;refresh()});
    const ap=v.querySelector('#actAddProd');if(ap)ap.onclick=()=>editProduct(null);
    const ac=v.querySelector('#actAddCat');if(ac)ac.onclick=()=>editCategory(null);
    v.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{MENU_UI.cat=b.dataset.cat;refresh()});
    v.querySelectorAll('[data-prod]').forEach(b=>b.onclick=()=>editProduct(MENU_UI.data.prods.find(p=>p.id===b.dataset.prod)));
    v.querySelectorAll('[data-editcat]').forEach(b=>b.onclick=()=>editCategory(MENU_UI.data.cats.find(c=>c.id===b.dataset.editcat)));
    v.querySelectorAll('[data-addgroup]').forEach(b=>b.onclick=()=>editGroup(null,b.dataset.addgroup));
    v.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>editGroup(MENU_UI.data.groups.find(g=>g.id===b.dataset.group)));
    const e1=v.querySelector('#emptyAddProd');if(e1)e1.onclick=()=>editProduct(null);
    const e2=v.querySelector('#emptyAddCat');if(e2)e2.onclick=()=>editCategory(null);
  }
});

function productTile(p,cats){
  const url=imgUrl(p.image_path);
  return `<button type="button" class="ptile${p.is_available?'':' off'}" data-prod="${p.id}">
    <span class="ph"${url?` style="background-image:url('${esc(url)}')"`:''}>${url?'':ic('bowl')}${p.is_available?'':'<span class="pill bad">หมด</span>'}</span>
    <span class="bd"><span class="nm" style="display:block">${esc(p.name)}</span><span class="pr">${baht(p.price)}</span></span></button>`;
}

function renderItemsTab(d){
  if(!d.prods.length)return `<div class="card empty">ยังไม่มีเมนู<br><button type="button" class="btn" style="margin-top:12px" id="emptyAddProd">${ic('plus')}เพิ่มเมนูแรก</button></div>`;
  const uncats=d.prods.filter(p=>!p.category_id);
  const chips=[['all','ทั้งหมด'],...d.cats.map(c=>[c.id,c.name]),...(uncats.length?[['none','ไม่มีหมวด']]:[])];
  if(!chips.some(c=>c[0]===MENU_UI.cat))MENU_UI.cat='all';
  const sel=MENU_UI.cat;
  const groups=sel==='all'?[...d.cats.map(c=>({c,items:d.prods.filter(p=>p.category_id===c.id)})),{c:{name:'ไม่มีหมวด'},items:uncats}]
              :sel==='none'?[{c:{name:'ไม่มีหมวด'},items:uncats}]
              :[{c:d.cats.find(c=>c.id===sel),items:d.prods.filter(p=>p.category_id===sel)}];
  return `<div class="chips">${chips.map(([id,n])=>`<button type="button" data-cat="${id}" class="${sel===id?'active':''}">${esc(n)}</button>`).join('')}</div>`+
    groups.filter(g=>g.items.length).map(g=>`<div class="section"><h3>${esc(g.c.name)}</h3><span class="muted mini">${g.items.length} เมนู</span></div><div class="pgrid">${g.items.map(p=>productTile(p,d.cats)).join('')}</div>`).join('')||
    `<div class="card empty">หมวดนี้ยังไม่มีเมนู</div>`;
}

function renderCatsTab(d){
  if(!d.cats.length)return `<div class="card empty">ยังไม่มีหมวดหมู่<br><button type="button" class="btn" style="margin-top:12px" id="emptyAddCat">${ic('plus')}เพิ่มหมวดแรก</button></div>`;
  return d.cats.map(c=>{
    const gs=d.groups.filter(g=>g.category_id===c.id);
    const n=d.prods.filter(p=>p.category_id===c.id).length;
    return `<div class="list"><button type="button" class="row tap" style="width:100%;text-align:left" data-editcat="${c.id}"><span class="ichip">${ic('book')}</span><span class="grow"><span class="t">${esc(c.name)}</span><span class="s">${n} เมนู · ตัวเลือก ${gs.length} กลุ่ม</span></span>${ic('edit')}</button>
      ${gs.map(g=>`<button type="button" class="row tap" style="width:100%;text-align:left;padding-left:64px" data-group="${g.id}"><span class="grow"><span class="t">${esc(g.name)} ${g.required?'<span class="pill warn">ต้องเลือก</span>':''} ${g.multi?'<span class="pill">เลือกได้หลายอย่าง</span>':''}</span><span class="s">${esc((g.choices||[]).map(choiceLine).join(' · ')||'ยังไม่มีตัวเลือก')}</span></span>${ic('chevr')}</button>`).join('')}
      <button type="button" class="row tap" style="width:100%;text-align:left;padding-left:64px;color:var(--brand-d);font-weight:700" data-addgroup="${c.id}">${ic('plus')}เพิ่มกลุ่มตัวเลือก (เช่น เส้น ขนาด เพิ่มเติม)</button></div>`;
  }).join('');
}

// ---------- product editor ----------
function editProduct(p){
  const d=MENU_UI.data,isNew=!p;
  p=p||{name:'',price:'',cost:0,category_id:(MENU_UI.cat!=='all'&&MENU_UI.cat!=='none')?MENU_UI.cat:(d.cats[0]&&d.cats[0].id)||null,station_id:d.stations[0]&&d.stations[0].id||null,is_available:true,image_path:null};
  const photo={blob:null,preview:null,remove:false};
  const opt=(list,selId,empty)=>`<option value="">${empty}</option>`+list.map(x=>`<option value="${x.id}"${x.id===selId?' selected':''}>${esc(x.name)}</option>`).join('');
  const s=openSheet(isNew?'เพิ่มเมนู':'แก้ไขเมนู',`
    <button type="button" class="photo-pick" id="pePhoto" aria-label="เลือกรูปเมนู"></button>
    <div class="photo-tools"><span id="peInfo">แตะเพื่อถ่ายหรือเลือกรูป · รูปใหญ่แค่ไหนก็ได้ ระบบย่อให้เอง</span><button type="button" class="btn danger sm hide" id="peDelPhoto">${ic('trash')}ลบรูป</button></div>
    <div class="field"><label for="peName">ชื่อเมนู</label><input id="peName" maxlength="80" value="${esc(p.name)}"></div>
    <div class="grid2 keep2"><div class="field"><label for="pePrice">ราคาขาย (บาท)</label><input id="pePrice" inputmode="decimal" value="${p.price===''?'':esc(p.price)}"></div>
      <div class="field"><label for="peCost">ต้นทุน (บาท)</label><input id="peCost" inputmode="decimal" value="${esc(p.cost||0)}"></div></div>
    <div class="grid2"><div class="field"><label for="peCat">หมวดหมู่</label><select id="peCat">${opt(d.cats,p.category_id,'— ไม่มีหมวด —')}</select></div>
      <div class="field"><label for="peSt">ส่งไปที่ครัว</label><select id="peSt">${opt(d.stations,p.station_id,'— ไม่ส่งครัว —')}</select></div></div>
    <label class="switch"><span>เปิดขาย (ปิด = แสดงว่าหมด)</span><input type="checkbox" id="peAvail"${p.is_available?' checked':''}></label>`,
    `${isNew?'':`<button type="button" class="btn danger" id="peDel" style="flex:0 0 auto" aria-label="ลบเมนู">${ic('trash')}</button>`}<button type="button" class="btn" id="peSave">บันทึก</button>`);
  const el=s.el,box=el.querySelector('#pePhoto'),info=el.querySelector('#peInfo'),delBtn=el.querySelector('#peDelPhoto');

  function paintPhoto(){
    const url=photo.preview||(!photo.remove&&imgUrl(p.image_path));
    box.classList.toggle('has',!!url);
    box.style.backgroundImage=url?`url('${url}')`:'';
    box.innerHTML=`<span class="ov">${ic('camera')}<span>${url?'เปลี่ยนรูป':'เพิ่มรูปเมนู'}</span></span>`;
    delBtn.classList.toggle('hide',!url);
  }
  paintPhoto();

  box.onclick=async()=>{
    const file=await pickImageFile();if(!file)return;
    box.insertAdjacentHTML('beforeend','<span class="busy">กำลังเตรียมรูป...</span>');
    try{
      const blob=await prepareProductPhoto(file);
      if(blob){
        if(photo.preview)URL.revokeObjectURL(photo.preview);
        photo.blob=blob;photo.preview=URL.createObjectURL(blob);photo.remove=false;
        const kb=Math.max(1,Math.round(blob.size/1024));
        info.textContent=`รูปพร้อมแล้ว ${IMG.W}×${IMG.H} · ${kb} KB (จากไฟล์เดิม ${(file.size/1048576).toFixed(1)} MB) — จะอัปโหลดเมื่อกดบันทึก`;
      }
    }catch(e){toastErr(e)}
    paintPhoto();
  };
  delBtn.onclick=()=>{if(photo.preview)URL.revokeObjectURL(photo.preview);photo.blob=null;photo.preview=null;photo.remove=true;info.textContent='จะลบรูปเมื่อกดบันทึก';paintPhoto()};

  el.querySelector('#peSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const name=val(el,'#peName'),price=num(el,'#pePrice'),cost=num(el,'#peCost');
    if(!name)return toast('กรุณาใส่ชื่อเมนู',true);
    if(!(price>=0))return toast('กรุณาใส่ราคาเป็นตัวเลข',true);
    const row={shop_id:S.shopId,name,price:Math.round(price*100)/100,cost:cost>=0?Math.round(cost*100)/100:0,
      category_id:val(el,'#peCat')||null,station_id:val(el,'#peSt')||null,is_available:el.querySelector('#peAvail').checked};
    let id=p.id;
    if(isNew){id=must(await sb.from('products').insert(row).select('id').single()).id}
    else must(await sb.from('products').update(row).eq('id',id));
    const oldPath=p.image_path;
    if(photo.blob){
      el.querySelector('#peSave').textContent='กำลังอัปโหลดรูป...';
      try{
        const path=await uploadShopImage(S.shopId,'products',id,photo.blob);
        must(await sb.from('products').update({image_path:path}).eq('id',id));
        if(oldPath)await removeShopImage(oldPath);
      }catch(err){
        s.close();toast('บันทึกเมนูแล้ว แต่อัปโหลดรูปไม่สำเร็จ: '+friendlyError(err),true);return refresh();
      }
    }else if(photo.remove&&oldPath){
      must(await sb.from('products').update({image_path:null}).eq('id',id));
      await removeShopImage(oldPath);
    }
    audit((isNew?'เพิ่มเมนู ':'แก้ไขเมนู ')+name);
    if(photo.preview)URL.revokeObjectURL(photo.preview);
    s.close();toast(isNew?'เพิ่มเมนูแล้ว':'บันทึกแล้ว');refresh();
  });
  const del=el.querySelector('#peDel');
  if(del)del.onclick=async()=>{
    if(!await confirmSheet('ลบเมนูนี้?',`“${p.name}” จะถูกลบออกจากเมนู บิลเก่าที่เคยขายยังเก็บชื่อและราคาไว้เหมือนเดิม`,'ลบเมนู',true))return;
    try{must(await sb.from('products').delete().eq('id',p.id));await removeShopImage(p.image_path);audit('ลบเมนู '+p.name);s.close();toast('ลบแล้ว');refresh()}catch(e){toastErr(e)}
  };
}

// ---------- category editor ----------
function editCategory(c){
  const isNew=!c;c=c||{name:'',sort:(MENU_UI.data.cats.length+1)};
  const s=openSheet(isNew?'เพิ่มหมวดหมู่':'แก้ไขหมวดหมู่',`
    <div class="field"><label for="ceName">ชื่อหมวด</label><input id="ceName" maxlength="60" value="${esc(c.name)}" placeholder="เช่น ก๋วยเตี๋ยว"></div>
    <div class="field"><label for="ceSort">ลำดับการแสดง</label><input id="ceSort" inputmode="numeric" value="${esc(c.sort||0)}"><div class="hint">เลขน้อยแสดงก่อน</div></div>`,
    `${isNew?'':`<button type="button" class="btn danger" id="ceDel" style="flex:0 0 auto" aria-label="ลบหมวด">${ic('trash')}</button>`}<button type="button" class="btn" id="ceSave">บันทึก</button>`);
  s.el.querySelector('#ceSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const name=val(s.el,'#ceName'),sort=parseInt(val(s.el,'#ceSort'))||0;
    if(!name)return toast('กรุณาใส่ชื่อหมวด',true);
    if(isNew)must(await sb.from('categories').insert({shop_id:S.shopId,name,sort}));
    else must(await sb.from('categories').update({name,sort}).eq('id',c.id));
    s.close();toast('บันทึกแล้ว');refresh();
  });
  const del=s.el.querySelector('#ceDel');
  if(del)del.onclick=async()=>{
    if(!await confirmSheet('ลบหมวดนี้?',`เมนูในหมวด “${c.name}” จะย้ายไปอยู่ “ไม่มีหมวด” และกลุ่มตัวเลือกของหมวดนี้จะถูกลบ`,'ลบหมวด',true))return;
    try{must(await sb.from('categories').delete().eq('id',c.id));s.close();toast('ลบแล้ว');refresh()}catch(e){toastErr(e)}
  };
}

// ---------- option group editor ----------
function editGroup(g,catId){
  const isNew=!g;g=g||{name:'',required:false,multi:false,choices:[],category_id:catId,sort:0};
  const cat=MENU_UI.data.cats.find(c=>c.id===g.category_id);
  const s=openSheet(isNew?'เพิ่มกลุ่มตัวเลือก':'แก้ไขกลุ่มตัวเลือก',`
    <p class="mini muted" style="margin-bottom:10px">หมวด: <b>${esc(cat?cat.name:'')}</b> — ทุกเมนูในหมวดนี้จะมีตัวเลือกกลุ่มนี้</p>
    <div class="field"><label for="geName">ชื่อกลุ่ม</label><input id="geName" maxlength="60" value="${esc(g.name)}" placeholder="เช่น เส้น / ขนาด / เพิ่มเติม"></div>
    <div class="field"><label for="geChoices">ตัวเลือก (บรรทัดละ 1 อย่าง · ถ้ามีราคาเพิ่มให้ใส่ +ราคา)</label>
      <textarea id="geChoices" rows="5" placeholder="เส้นเล็ก&#10;เส้นใหญ่&#10;เพิ่มหมู +10">${esc((g.choices||[]).map(choiceLine).join('\n'))}</textarea></div>
    <label class="switch"><span>ลูกค้าต้องเลือก</span><input type="checkbox" id="geReq"${g.required?' checked':''}></label>
    <label class="switch"><span>เลือกได้หลายอย่าง</span><input type="checkbox" id="geMulti"${g.multi?' checked':''}></label>`,
    `${isNew?'':`<button type="button" class="btn danger" id="geDel" style="flex:0 0 auto" aria-label="ลบกลุ่ม">${ic('trash')}</button>`}<button type="button" class="btn" id="geSave">บันทึก</button>`);
  s.el.querySelector('#geSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    const name=val(s.el,'#geName');
    const choices=s.el.querySelector('#geChoices').value.split('\n').map(parseChoiceLine).filter(Boolean);
    if(!name)return toast('กรุณาใส่ชื่อกลุ่ม',true);
    if(!choices.length)return toast('กรุณาใส่ตัวเลือกอย่างน้อย 1 อย่าง',true);
    if(choices.length>30)return toast('ใส่ได้ไม่เกิน 30 ตัวเลือก',true);
    const row={name,choices,required:s.el.querySelector('#geReq').checked,multi:s.el.querySelector('#geMulti').checked};
    if(isNew)must(await sb.from('option_groups').insert({...row,shop_id:S.shopId,category_id:g.category_id}));
    else must(await sb.from('option_groups').update(row).eq('id',g.id));
    s.close();toast('บันทึกแล้ว');refresh();
  });
  const del=s.el.querySelector('#geDel');
  if(del)del.onclick=async()=>{
    if(!await confirmSheet('ลบกลุ่มตัวเลือกนี้?',`“${g.name}” จะไม่แสดงตอนสั่งอาหารอีก`,'ลบ',true))return;
    try{must(await sb.from('option_groups').delete().eq('id',g.id));s.close();toast('ลบแล้ว');refresh()}catch(e){toastErr(e)}
  };
}
