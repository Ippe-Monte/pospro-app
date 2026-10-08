// =====================================================================
// pos.js — the selling screen ("ขาย"): catalogue, cart, options sheet, send to kitchen / take payment
// Tablet (>=900px): product grid + cart panel side by side. Phone: grid + sticky cart bar -> cart sheet.
// Prices shown here are for the cashier's eyes only; the database recomputes every price (staff_add_items).
// =====================================================================
const CHANNELS=['หน้าร้าน','Grab','LINE MAN','ShopeeFood','Robinhood','Online'];
const CAT={data:null,at:0};
const POS={q:'',cat:'all'};

async function loadCatalog(force){
  if(!force&&CAT.data&&CAT.shop===S.shopId&&Date.now()-CAT.at<60000)return CAT.data;
  const sid=S.shopId;
  const [cats,prods,groups,tables]=await Promise.all([
    sb.from('categories').select('*').eq('shop_id',sid).order('sort').order('name'),
    sb.from('products').select('*').eq('shop_id',sid).order('sort').order('name'),
    sb.from('option_groups').select('*').eq('shop_id',sid).order('sort').order('name'),
    sb.from('dining_tables').select('id,name,sort,qr_enabled').eq('shop_id',sid).order('sort').order('name')]);
  CAT.data={cats:must(cats),prods:must(prods),groups:must(groups),tables:must(tables)};
  CAT.at=Date.now();CAT.shop=sid;
  return CAT.data;
}
function invalidateCatalog(){CAT.at=0}

// ---------- cart (kept per shop in browser storage so a refresh does not lose an unsent order) ----------
function cartKey(){return 'pospro_cart_'+S.shopId}
function getCart(){
  if(S.cart&&S.cart.shop===S.shopId)return S.cart;
  let c=null;try{c=JSON.parse(LS.get(cartKey())||'null')}catch(e){}
  S.cart=c&&c.shop===S.shopId?c:{shop:S.shopId,tableId:null,channel:'หน้าร้าน',items:[]};
  return S.cart;
}
function saveCart(){LS.set(cartKey(),JSON.stringify(S.cart))}
function clearCartItems(){getCart().items=[];saveCart()}
function lineKey(l){return l.product_id+'|'+(l.choices||[]).map(c=>c.group_id+':'+c.name).sort().join(',')+'|'+(l.note||'')}
function cartCount(){return getCart().items.reduce((a,l)=>a+l.qty,0)}
function cartTotal(){return getCart().items.reduce((a,l)=>a+l.unit_price*l.qty,0)}
function addToCart(line){
  const c=getCart();line.key=lineKey(line);
  const ex=c.items.find(x=>x.key===line.key);
  if(ex)ex.qty=Math.min(99,ex.qty+line.qty);else c.items.push(line);
  saveCart();
}
function cartContextLabel(){
  const c=getCart();
  if(c.tableId){const t=CAT.data&&CAT.data.tables.find(x=>x.id===c.tableId);return t?t.name:'โต๊ะ'}
  return c.channel==='หน้าร้าน'?'กลับบ้าน / ไม่ระบุโต๊ะ':c.channel;
}

// ---------- page ----------
definePage('home',{title:'ขายหน้าร้าน',roles:['owner','manager','cashier'],
  actions(){return `<button type="button" class="btn soft sm" id="actCtx">${ic('table')}<span id="ctxLabel">…</span>${ic('chevd')}</button>`},
  async render(){
    const d=await loadCatalog();
    const [openRes,pendRes]=await Promise.all([
      getCart().tableId?sb.from('orders').select('id,order_no,total').eq('table_id',getCart().tableId).eq('status','open').limit(1):Promise.resolve({data:[]}),
      sb.from('orders').select('id',{count:'exact',head:true}).eq('shop_id',S.shopId).eq('status','pending')]);
    POS.openBill=(openRes.data||[])[0]||null;
    const pending=pendRes.count||0;
    if(!d.prods.length)return `<div class="card empty">ยังไม่มีเมนูให้ขาย${can('owner','manager')?`<br><button type="button" class="btn" style="margin-top:12px" data-go="setup">${ic('check')}ตั้งค่าร้านให้พร้อมขาย</button>`:'<br><span class="mini">รอเจ้าของร้านเพิ่มเมนู</span>'}</div>`;
    const cats=d.cats.filter(c=>d.prods.some(p=>p.category_id===c.id));
    const chips=[['all','ทั้งหมด'],...cats.map(c=>[c.id,stripEmoji(c.name)||c.name])];
    if(!chips.some(x=>x[0]===POS.cat))POS.cat='all';
    return `${pending?`<button type="button" class="notice tapnotice" data-go="tables">${ic('qr')}<span>ลูกค้าสั่งผ่าน QR รอยืนยัน <b>${pending}</b> ออเดอร์ — แตะเพื่อดู</span></button>`:''}
    <div class="poswrap">
      <section class="poscat">
        <div class="searchbox">${ic('search')}<input id="posQ" type="search" placeholder="ค้นหาเมนู" value="${esc(POS.q)}" aria-label="ค้นหาเมนู"></div>
        <div class="chips" id="posChips">${chips.map(([id,n])=>`<button type="button" data-pcat="${id}" class="${POS.cat===id?'active':''}">${esc(n)}</button>`).join('')}</div>
        <div class="pgrid" id="posGrid"></div>
      </section>
      <aside class="cartpanel" id="cartPanel" aria-label="ตะกร้า"></aside>
    </div>
    <button type="button" class="cartbar" id="cartBar" aria-label="ดูตะกร้า"></button>`;
  },
  bind(v){
    paintCtx();paintGrid();paintCart();
    v.querySelector('#actCtx')&&(v.querySelector('#actCtx').onclick=openContextSheet);
    const q=v.querySelector('#posQ');if(q)q.oninput=()=>{POS.q=q.value;paintGrid()};
    v.querySelectorAll('[data-pcat]').forEach(b=>b.onclick=()=>{POS.cat=b.dataset.pcat;v.querySelectorAll('[data-pcat]').forEach(x=>x.classList.toggle('active',x===b));paintGrid()});
    v.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
    const bar=v.querySelector('#cartBar');if(bar)bar.onclick=openCartSheet;
  },
  live:true,
});

function paintCtx(){const el=document.getElementById('ctxLabel');if(el)el.textContent=cartContextLabel()}

function productCard(p,cats){
  const cat=cats.find(c=>c.id===p.category_id);
  const url=imgUrl(p.image_path);
  const tint=catColorOf(cat||{name:''});
  return `<button type="button" class="ptile${p.is_available?'':' off'}" data-sell="${p.id}" ${p.is_available?'':'aria-disabled="true"'}>
    <span class="ph"${url?` style="background-image:url('${esc(url)}')"`:` style="background:color-mix(in srgb, ${tint} 14%, #fff);color:${tint}"`}>${url?'':ic(catIconOf(cat||{name:p.name}))}${p.is_available?'':'<span class="pill bad">หมด</span>'}</span>
    <span class="bd"><span class="nm" style="display:block">${esc(p.name)}</span><span class="pr">${baht(p.price)}</span></span></button>`;
}

function paintGrid(){
  const g=document.getElementById('posGrid');if(!g)return;
  const d=CAT.data,q=POS.q.trim().toLowerCase();
  let list=d.prods.filter(p=>(POS.cat==='all'||p.category_id===POS.cat)&&(!q||p.name.toLowerCase().includes(q)));
  list.sort((a,b)=>(b.is_available-a.is_available));
  g.innerHTML=list.map(p=>productCard(p,d.cats)).join('')||`<div class="empty" style="grid-column:1/-1">ไม่พบเมนู</div>`;
  g.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>{
    const p=d.prods.find(x=>x.id===b.dataset.sell);
    if(!p.is_available)return toast('เมนูนี้ตั้งเป็น “หมด” อยู่ — เปิดขายได้ที่หน้าเมนู',true);
    const groups=d.groups.filter(x=>x.category_id===p.category_id);
    if(groups.length)openOptionsSheet(p,groups,line=>{addToCart(line);paintCart();toast(`เพิ่ม ${p.name}`)});
    else{addToCart({product_id:p.id,name:p.name,unit_price:Number(p.price),qty:1,choices:[],note:''});paintCart();bump(b)}
  });
}
function bump(el){el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump')}

function cartLinesHtml(){
  const c=getCart();
  if(!c.items.length)return `<div class="empty">ยังไม่มีรายการ<br><span class="mini">แตะเมนูเพื่อเพิ่ม</span></div>`;
  return c.items.map((l,i)=>`<div class="cline">
    <div class="grow"><div class="t">${esc(l.name)}</div>${l.choices.length||l.note?`<div class="s">${esc([optText(l.choices),l.note?'“'+l.note+'”':''].filter(Boolean).join(' · '))}</div>`:''}</div>
    <div class="qty"><button type="button" class="qbtn" data-dec="${i}" aria-label="ลด">${ic(l.qty>1?'minus':'trash')}</button><b>${l.qty}</b><button type="button" class="qbtn add" data-inc="${i}" aria-label="เพิ่ม">${ic('plus')}</button></div>
    <div class="amt">${baht(l.unit_price*l.qty)}</div></div>`).join('');
}

function cartBodyHtml(){
  const c=getCart(),n=cartCount(),ob=POS.openBill;
  return `<div class="cphead"><div><div class="ctx">${esc(cartContextLabel())}</div>${ob?`<button type="button" class="link-btn" data-openbill="${ob.id}">บิลเดิม #${ob.order_no} · ${baht(ob.total)}</button>`:'<div class="mini muted">บิลใหม่</div>'}</div>
      <button type="button" class="btn soft sm" data-ctx>${ic('swap')}เปลี่ยน</button></div>
    <div class="cplines">${cartLinesHtml()}</div>
    <div class="cpfoot">
      <div class="sumrow"><span>ยอดรายการใหม่ ${n} ชิ้น</span><b>${baht(cartTotal())}</b></div>
      ${ob?`<div class="sumrow muted"><span>รวมบิลเดิม</span><span>${baht(Number(ob.total)+cartTotal())}</span></div>`:''}
      <div class="grid2 keep2" style="margin-top:8px">
        <button type="button" class="btn secondary" data-send ${n?'':'disabled'}>${ic('flame')}ส่งเข้าครัว</button>
        <button type="button" class="btn" data-pay ${n||ob?'':'disabled'}>${ic('cash')}ชำระเงิน</button>
      </div></div>`;
}

function bindCartBody(root,onChange){
  const c=getCart();
  root.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{c.items[+b.dataset.inc].qty=Math.min(99,c.items[+b.dataset.inc].qty+1);saveCart();onChange()});
  root.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{const l=c.items[+b.dataset.dec];l.qty--;if(l.qty<1)c.items.splice(+b.dataset.dec,1);saveCart();onChange()});
  const ctx=root.querySelector('[data-ctx]');if(ctx)ctx.onclick=openContextSheet;
  const ob=root.querySelector('[data-openbill]');if(ob)ob.onclick=()=>openBill(ob.dataset.openbill);
  const send=root.querySelector('[data-send]');if(send)send.onclick=e=>withBusy(e.currentTarget,'กำลังส่ง...',()=>sendCart(false));
  const pay=root.querySelector('[data-pay]');if(pay)pay.onclick=e=>withBusy(e.currentTarget,'กำลังเตรียมบิล...',()=>sendCart(true));
}

function paintCart(){
  const panel=document.getElementById('cartPanel');
  if(panel){panel.innerHTML=cartBodyHtml();bindCartBody(panel,paintCart)}
  const bar=document.getElementById('cartBar');
  if(bar){const n=cartCount();bar.classList.toggle('hide',!n&&!POS.openBill);
    bar.innerHTML=`<span class="cnt">${n}</span><span class="grow">${n?'ดูตะกร้า':'บิลเดิม #'+(POS.openBill&&POS.openBill.order_no)} · ${esc(cartContextLabel())}</span><b>${baht(n?cartTotal():(POS.openBill&&POS.openBill.total))}</b>`}
  paintCtx();
}

function openCartSheet(){
  const s=openSheet('ตะกร้า',`<div id="cartSheetBody"></div>`);
  const body=s.el.querySelector('#cartSheetBody');
  const paint=()=>{body.innerHTML=cartBodyHtml();bindCartBody(body,()=>{paint();paintCart()});
    body.querySelectorAll('[data-send],[data-pay],[data-ctx],[data-openbill]').forEach(b=>b.addEventListener('click',()=>s.close(),{capture:false}))};
  paint();
}

// send unsent items (if any); then optionally open the bill
async function sendCart(thenPay){
  const c=getCart();
  let orderId=POS.openBill&&POS.openBill.id;
  if(c.items.length){
    const items=c.items.map(l=>({product_id:l.product_id,qty:l.qty,note:l.note||null,choices:l.choices.map(x=>({group_id:x.group_id,name:x.name}))}));
    const r=must(await sb.rpc('staff_add_items',{p_shop:S.shopId,p_items:items,p_table:c.tableId,p_order:orderId||null,p_channel:c.channel}));
    orderId=r.order_id;
    audit(`ส่งรายการเข้าครัว บิล #${r.order_no} (${cartContextLabel()})`);
    clearCartItems();
    if(!thenPay)toast(`ส่งเข้าครัวแล้ว · บิล #${r.order_no}`);
  }
  if(thenPay&&orderId){await refresh();return openBill(orderId)}
  if(!c.tableId&&!thenPay){/* takeaway: keep the bill reachable from the tables page */}
  await refresh();
}

// ---------- table / takeaway picker ----------
async function openContextSheet(){
  const d=await loadCatalog();const c=getCart();
  const {data:open}=await sb.from('orders').select('table_id,total').eq('shop_id',S.shopId).eq('status','open');
  const busy=new Map((open||[]).filter(o=>o.table_id).map(o=>[o.table_id,o.total]));
  const s=openSheet('ขายให้โต๊ะไหน',`
    <div class="mgroup" style="margin-top:0">โต๊ะ</div>
    <div class="tpick">${d.tables.map(t=>`<button type="button" data-t="${t.id}" class="${c.tableId===t.id?'active':''}${busy.has(t.id)?' busy':''}"><b>${esc(t.name)}</b><span>${busy.has(t.id)?baht(busy.get(t.id)):'ว่าง'}</span></button>`).join('')}</div>
    <div class="mgroup">ไม่ระบุโต๊ะ (กลับบ้าน / เดลิเวอรี)</div>
    <div class="chips" style="flex-wrap:wrap">${CHANNELS.map(ch=>`<button type="button" data-ch="${esc(ch)}" class="${!c.tableId&&c.channel===ch?'active':''}">${esc(ch==='หน้าร้าน'?'กลับบ้าน':ch)}</button>`).join('')}</div>`);
  s.el.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{c.tableId=b.dataset.t;c.channel='หน้าร้าน';saveCart();s.close();refresh()});
  s.el.querySelectorAll('[data-ch]').forEach(b=>b.onclick=()=>{c.tableId=null;c.channel=b.dataset.ch;saveCart();s.close();refresh()});
}
function startSaleFor(tableId){const c=getCart();c.tableId=tableId;c.channel='หน้าร้าน';saveCart();go('home',{reset:true})}

