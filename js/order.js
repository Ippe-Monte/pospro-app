// =====================================================================
// order.js — customer QR ordering page (order.html?t=<table token>). No login.
// Reads the menu with get_table_menu, sends with place_qr_order (the shop confirms before the kitchen sees it),
// shows each order's status with get_qr_order, and lets the customer call staff or ask for the bill.
// =====================================================================
const C={token:null,menu:null,cat:'all',cart:[],orders:[],view:'menu',timer:null};
const cApp=()=>document.getElementById('app');

function cKey(){return 'pospro_qr_'+C.token}
function cLoad(){try{const d=JSON.parse(LS.get(cKey())||'{}');C.cart=d.cart||[];C.orders=(d.orders||[]).filter(o=>Date.now()-o.at<12*3600e3)}catch(e){}}
function cSave(){LS.set(cKey(),JSON.stringify({cart:C.cart,orders:C.orders}))}
const cCount=()=>C.cart.reduce((a,l)=>a+l.qty,0);
const cTotal=()=>C.cart.reduce((a,l)=>a+l.unit_price*l.qty,0);

async function cBoot(){
  C.token=new URLSearchParams(location.search).get('t');
  if(!initSupabase())return cError('ร้านยังไม่ได้ตั้งค่าระบบ');
  if(!C.token)return cError('ไม่พบรหัสโต๊ะ กรุณาสแกน QR ที่โต๊ะอีกครั้ง');
  cLoad();
  try{C.menu=must(await sb.rpc('get_table_menu',{p_token:C.token}))}catch(e){return cError(friendlyError(e))}
  document.title=C.menu.shop.name+' · '+C.menu.table.name;
  if(C.orders.length&&!C.cart.length)C.view='status';
  cRender();
  C.timer=setInterval(()=>{if(C.view==='status'&&document.visibilityState==='visible')cPaintStatus()},8000);
}

function cError(msg){
  cApp().innerHTML=`<div class="auth"><div class="box" style="text-align:center"><div class="ichip" style="margin:0 auto 12px;width:56px;height:56px;border-radius:50%">${ic('qr')}</div><h1 style="font-size:20px">สั่งอาหารไม่ได้</h1><p class="muted" style="margin-top:8px">${esc(msg)}</p><p class="mini muted" style="margin-top:12px">กรุณาเรียกพนักงาน</p></div></div>`;
}

function cHeader(){
  const n=C.orders.length;
  return `<header class="chead"><div class="clogo">${ic('bowl')}</div><div class="grow"><div class="cshop">${esc(C.menu.shop.name)}</div><div class="mini muted">${esc(C.menu.table.name)} · สั่งได้เลย ไม่ต้องสมัคร</div></div>
    ${n?`<button type="button" class="btn soft sm" id="cToStatus">${ic('clock')}ออเดอร์ (${n})</button>`:''}</header>`;
}

function cRender(){
  if(C.view==='status')return cRenderStatus();
  const m=C.menu;
  const cats=m.categories.filter(c=>m.products.some(p=>p.category_id===c.id));
  const chips=[['all','ทั้งหมด'],...cats.map(c=>[c.id,stripEmoji(c.name)||c.name])];
  const groups=C.cat==='all'?[...cats.map(c=>({c,items:m.products.filter(p=>p.category_id===c.id)})),{c:{name:'อื่นๆ'},items:m.products.filter(p=>!cats.some(c=>c.id===p.category_id))}]
                           :[{c:cats.find(c=>c.id===C.cat),items:m.products.filter(p=>p.category_id===C.cat)}];
  cApp().innerHTML=`<div class="cpage">${cHeader()}
    <div class="chelp"><button type="button" class="btn secondary sm" data-svc="call">${ic('hand')}เรียกพนักงาน</button><button type="button" class="btn secondary sm" data-svc="bill">${ic('pos')}ขอเช็คบิล</button></div>
    <div class="chips cchips">${chips.map(([id,n])=>`<button type="button" data-ccat="${id}" class="${C.cat===id?'active':''}">${esc(n)}</button>`).join('')}</div>
    <main class="clist">${groups.filter(g=>g.items.length).map(g=>`<h2 class="csec">${g.c.id?catChip(g.c,28):''}${esc(stripEmoji(g.c.name)||g.c.name)}</h2>${g.items.map(cItem).join('')}`).join('')}</main>
    <div class="cfootsp"></div>
    ${cCount()?`<button type="button" class="cartbar show" id="cCart"><span class="cnt">${cCount()}</span><span class="grow">ดูตะกร้า</span><b>${baht(cTotal())}</b></button>`:''}</div>`;
  cApp().querySelectorAll('[data-ccat]').forEach(b=>b.onclick=()=>{C.cat=b.dataset.ccat;cRender()});
  cApp().querySelectorAll('[data-cadd]').forEach(b=>b.onclick=()=>cAdd(b.dataset.cadd));
  cApp().querySelectorAll('[data-svc]').forEach(b=>b.onclick=()=>cService(b.dataset.svc,b));
  const cart=document.getElementById('cCart');if(cart)cart.onclick=cOpenCart;
  const st=document.getElementById('cToStatus');if(st)st.onclick=()=>{C.view='status';cRender()};
}

function cItem(p){
  const url=imgUrl(p.image_path);
  const cat=C.menu.categories.find(c=>c.id===p.category_id)||{name:p.name};const tint=catColorOf(cat);
  const inCart=C.cart.filter(l=>l.product_id===p.id).reduce((a,l)=>a+l.qty,0);
  return `<div class="citem${p.is_available?'':' off'}"><div class="cph"${url?` style="background-image:url('${esc(url)}')"`:` style="background:color-mix(in srgb, ${tint} 14%, #fff);color:${tint}"`}>${url?'':ic(catIconOf(cat))}</div>
    <div class="grow"><div class="t">${esc(p.name)}</div><div class="pr">${baht(p.price)}</div></div>
    ${p.is_available?`<button type="button" class="cadd${inCart?' has':''}" data-cadd="${p.id}" aria-label="เพิ่ม ${esc(p.name)}">${inCart?`<b>${inCart}</b>`:ic('plus')}</button>`:'<span class="pill bad">หมด</span>'}</div>`;
}

function cAdd(pid){
  const p=C.menu.products.find(x=>x.id===pid);
  const groups=C.menu.option_groups.filter(g=>g.category_id===p.category_id);
  const push=line=>{line.key=line.product_id+'|'+line.choices.map(c=>c.group_id+':'+c.name).sort().join(',')+'|'+(line.note||'');
    const ex=C.cart.find(l=>l.key===line.key);if(ex)ex.qty=Math.min(20,ex.qty+line.qty);else C.cart.push(line);cSave();cRender();toast('เพิ่มลงตะกร้าแล้ว')};
  if(groups.length)openOptionsSheet(p,groups,push,{maxQty:20});
  else push({product_id:p.id,name:p.name,unit_price:Number(p.price),qty:1,choices:[],note:''});
}

function cOpenCart(){
  const s=openSheet('ตะกร้าของฉัน',`<div id="cCartBody"></div>`,`<button type="button" class="btn" id="cSend">${ic('send')}สั่งอาหาร</button>`);
  const body=s.el.querySelector('#cCartBody');
  const paint=()=>{
    if(!C.cart.length){s.close();cRender();return}
    body.innerHTML=C.cart.map((l,i)=>`<div class="cline"><div class="grow"><div class="t">${esc(l.name)}</div>${l.choices.length||l.note?`<div class="s">${esc([optText(l.choices),l.note?'“'+l.note+'”':''].filter(Boolean).join(' · '))}</div>`:''}</div>
      <div class="qty"><button type="button" class="qbtn" data-d="${i}" aria-label="ลด">${ic(l.qty>1?'minus':'trash')}</button><b>${l.qty}</b><button type="button" class="qbtn add" data-i="${i}" aria-label="เพิ่ม">${ic('plus')}</button></div><div class="amt">${baht(l.unit_price*l.qty)}</div></div>`).join('')+
      `<div class="sumrow big"><span>รวม</span><b>${baht(cTotal())}</b></div><p class="mini muted">ราคาสุดท้ายเป็นไปตามที่ร้านยืนยัน · ชำระเงินกับพนักงานหรือสแกนพร้อมเพย์ตอนเช็คบิล</p>`;
    body.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const l=C.cart[+b.dataset.i];l.qty=Math.min(20,l.qty+1);cSave();paint()});
    body.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const l=C.cart[+b.dataset.d];l.qty--;if(l.qty<1)C.cart.splice(+b.dataset.d,1);cSave();paint()});
    s.el.querySelector('#cSend').innerHTML=`${ic('send')}สั่งอาหาร ${baht(cTotal())}`;
  };
  paint();
  s.el.querySelector('#cSend').onclick=e=>withBusy(e.currentTarget,'กำลังส่ง...',async()=>{
    const items=C.cart.map(l=>({product_id:l.product_id,qty:l.qty,note:l.note||null,choices:l.choices.map(c=>({group_id:c.group_id,name:c.name}))}));
    const r=must(await sb.rpc('place_qr_order',{p_token:C.token,p_items:items}));
    C.orders.unshift({id:r.order_id,no:r.order_no,at:Date.now()});C.cart=[];cSave();
    s.close();C.view='status';cRender();toast('ส่งออเดอร์แล้ว รอร้านยืนยัน');
  });
}

const C_STATUS={pending:['รอร้านยืนยัน','warn'],open:['ร้านรับออเดอร์แล้ว','info'],paid:['ชำระเงินแล้ว','ok'],void:['ร้านยกเลิกออเดอร์นี้','bad']};
const C_STEPS=[['ส่งออเดอร์แล้ว'],['ร้านยืนยันแล้ว'],['กำลังทำ'],['เสิร์ฟแล้ว']];
function cRenderStatus(){
  cApp().innerHTML=`<div class="cpage">${cHeader()}<main class="clist" id="cStatus"><div class="empty">กำลังโหลด...</div></main>
    <div class="cfootsp"></div><div class="cactions" style="bottom:16px"><button type="button" class="btn secondary sm" data-svc="call">${ic('hand')}เรียกพนักงาน</button><button type="button" class="btn secondary sm" data-svc="bill">${ic('pos')}ขอเช็คบิล</button><button type="button" class="btn sm" id="cMore">${ic('plus')}สั่งเพิ่ม</button></div></div>`;
  cApp().querySelectorAll('[data-svc]').forEach(b=>b.onclick=()=>cService(b.dataset.svc,b));
  document.getElementById('cMore').onclick=()=>{C.view='menu';cRender()};
  const st=document.getElementById('cToStatus');if(st)st.remove();
  cPaintStatus();
}
async function cPaintStatus(){
  const box=document.getElementById('cStatus');if(!box)return;
  const res=await Promise.all(C.orders.map(o=>sb.rpc('get_qr_order',{p_token:C.token,p_order:o.id}).then(r=>({o,d:r.data})).catch(()=>({o,d:null}))));
  const seenBills=new Set();
  box.innerHTML=res.filter(x=>x.d).map(({o,d})=>{
    const items=(d.items||[]).filter(i=>i.kitchen_status!=='void');
    const allServed=items.length&&items.every(i=>i.kitchen_status==='served'),cooking=items.some(i=>i.kitchen_status==='cooking'||i.kitchen_status==='served');
    const step=d.status==='pending'?1:d.status==='open'||d.status==='paid'?(allServed?4:cooking?3:2):0;
    const [lbl,cls]=C_STATUS[d.status]||['',''];
    const dup=d.merged&&seenBills.has(d.bill_no);seenBills.add(d.bill_no);
    return `<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px"><b>ออเดอร์ #${o.no}</b><span class="pill ${cls}">${lbl}</span></div>
      ${d.status!=='void'?`<div class="steps2">${C_STEPS.map(([t],i)=>`<div class="st ${i<step?'done':i===step?'now':''}"><span class="dot">${i<step?ic('check'):''}</span><span>${t}</span></div>`).join('')}</div>`:''}
      ${d.merged&&!dup?`<div class="mini muted" style="margin:8px 0 4px">รวมอยู่ในบิลโต๊ะ #${d.bill_no}</div>`:''}
      ${dup?'<div class="mini muted">อยู่ในบิลเดียวกับด้านบน</div>':items.map(i=>`<div class="iline"><span class="q">${i.qty}×</span><div class="grow"><div class="t">${esc(i.name)}</div>${(i.options||[]).length?`<div class="s">${esc(i.options.map(x=>x.name).join(' · '))}</div>`:''}</div>${itemStatusChip(i.kitchen_status)}</div>`).join('')}
      ${dup?'':`<div class="sumrow big"><span>${d.merged?'รวมทั้งบิลโต๊ะ':'รวม'}</span><b>${baht(d.total)}</b></div>`}</div>`;
  }).join('')||`<div class="card empty">ยังไม่มีออเดอร์</div>`;
}
function itemStatusChip(s){return s==='served'?'<span class="pill ok">เสิร์ฟแล้ว</span>':s==='cooking'?'<span class="pill info">กำลังทำ</span>':'<span class="pill">รอทำ</span>'}

async function cService(kind,btn){
  await withBusy(btn,'กำลังแจ้ง...',async()=>{must(await sb.rpc('request_service',{p_token:C.token,p_kind:kind}));toast(kind==='bill'?'แจ้งขอเช็คบิลแล้ว พนักงานกำลังมา':'แจ้งพนักงานแล้ว')});
}

startEmojiConverter();
cBoot().catch(e=>cError(friendlyError(e)));
