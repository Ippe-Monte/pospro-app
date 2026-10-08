// =====================================================================
// live.js — pages that change while you watch: tables (status, QR orders, service calls)
// and the kitchen display. Supabase Realtime pushes changes; a 20 s poll is the fallback.
// =====================================================================
const LIVE={ch:null,timer:null,poll:null,seen:new Set(),first:true};

function startLive(){
  stopLive();
  if(sb.channel){
    try{
      LIVE.ch=sb.channel('shop-'+S.shopId)
        .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:'shop_id=eq.'+S.shopId},onLiveChange)
        .on('postgres_changes',{event:'*',schema:'public',table:'order_items',filter:'shop_id=eq.'+S.shopId},onLiveChange)
        .on('postgres_changes',{event:'*',schema:'public',table:'service_requests',filter:'shop_id=eq.'+S.shopId},onLiveChange)
        .subscribe();
    }catch(e){console.warn('realtime',e)}
  }
  LIVE.poll=setInterval(()=>{if(document.visibilityState==='visible')liveTick()},20000);
  LIVE.first=true;liveTick();
}
function stopLive(){
  if(LIVE.ch&&sb.removeChannel){try{sb.removeChannel(LIVE.ch)}catch(e){}}
  LIVE.ch=null;clearInterval(LIVE.poll);LIVE.poll=null;
}
function onLiveChange(){clearTimeout(LIVE.timer);LIVE.timer=setTimeout(liveTick,400)}

// refreshes the open page if it is a live one, and announces new QR orders / service calls
async function liveTick(){
  if(!S.shopId||S.role==='kitchen'&&S.page!=='kitchen'){}
  try{
    const [p,r]=await Promise.all([
      sb.from('orders').select('id,order_no,table_id').eq('shop_id',S.shopId).eq('status','pending'),
      sb.from('service_requests').select('id,kind,table_id').eq('shop_id',S.shopId).is('done_at',null)]);
    const fresh=[...(p.data||[]).map(o=>['o'+o.id,`มีออเดอร์ QR ใหม่ #${o.order_no}`]),...(r.data||[]).map(x=>['s'+x.id,x.kind==='bill'?'ลูกค้าขอเช็คบิล':'ลูกค้าเรียกพนักงาน'])];
    if(!LIVE.first&&S.role!=='kitchen'){const n=fresh.filter(([k])=>!LIVE.seen.has(k));if(n.length)toast(n.length===1?n[0][1]:`มีรายการใหม่ ${n.length} รายการ (QR / เรียกพนักงาน)`)}
    fresh.forEach(([k])=>LIVE.seen.add(k));LIVE.first=false;
    const badge=(p.data||[]).length+(r.data||[]).length;
    document.querySelectorAll('[data-nav="tables"]').forEach(b=>{let d=b.querySelector('.navdot');if(!badge){d&&d.remove();return}if(!d){d=document.createElement('span');d.className='navdot';b.appendChild(d)}d.textContent=badge});
  }catch(e){console.warn('live',e)}
  const p=PAGES[S.page];
  if(p&&p.live&&!document.querySelector('.sheetback')&&!document.querySelector('.cropper'))refresh();
}

function minsSince(ts){return Math.max(0,Math.floor((Date.now()-new Date(ts).getTime())/60000))}
function agoText(ts){const m=minsSince(ts);return m<1?'เพิ่งสั่ง':m<60?`${m} นาที`:`${Math.floor(m/60)} ชม. ${m%60} นาที`}
function agoAgo(ts){const m=minsSince(ts);return m<1?'เมื่อสักครู่':m<60?`${m} นาทีที่แล้ว`:`${Math.floor(m/60)} ชม. ${m%60} นาทีที่แล้ว`}

// ---------- tables ----------
const TABLE_STATE={
  free:   {label:'ว่าง',       cls:'ok',  dot:'#12b76a'},
  ordered:{label:'สั่งแล้ว',    cls:'warn',dot:'#f79009'},
  eating: {label:'กำลังทาน',   cls:'bad', dot:'#d93025'},
  bill:   {label:'รอเช็คบิล',   cls:'info',dot:'#1677ff'},
};
async function loadFloor(){
  const sid=S.shopId;
  const [t,o,r]=await Promise.all([
    sb.from('dining_tables').select('id,name,sort,qr_enabled,qr_token').eq('shop_id',sid).order('sort').order('name'),
    sb.from('orders').select('id,order_no,table_id,channel,status,total,created_at,source,order_items(id,name,qty,unit_price,options,note,kitchen_status,created_at)').eq('shop_id',sid).in('status',['open','pending']).order('created_at'),
    sb.from('service_requests').select('id,kind,table_id,created_at').eq('shop_id',sid).is('done_at',null)]);
  const tables=must(t),orders=must(o),reqs=must(r);
  const floor=tables.map(tb=>{
    const open=orders.find(x=>x.table_id===tb.id&&x.status==='open')||null;
    const pending=orders.filter(x=>x.table_id===tb.id&&x.status==='pending');
    const rq=reqs.filter(x=>x.table_id===tb.id);
    const items=open?(open.order_items||[]).filter(i=>i.kitchen_status!=='void'):[];
    let state='free';
    if(open)state=items.some(i=>i.kitchen_status==='waiting'||i.kitchen_status==='cooking')?'ordered':'eating';
    if(rq.some(x=>x.kind==='bill'))state='bill';
    return {...tb,open,pending,reqs:rq,items,state};
  });
  const takeaway=orders.filter(x=>!x.table_id&&x.status==='open');
  return {floor,takeaway};
}

definePage('tables',{title:'โต๊ะ',roles:['owner','manager','cashier'],live:true,
  actions(){return can('owner','manager')?`<button type="button" class="btn soft sm" id="actQrAll">${ic('qr')}QR</button><button type="button" class="btn sm" id="actAddTable">${ic('plus')}โต๊ะ</button>`:''},
  async render(){
    const {floor,takeaway}=await loadFloor();LIVE.floor=floor;LIVE.takeaway=takeaway;
    const busy=floor.filter(f=>f.state!=='free').length;
    const pend=floor.filter(f=>f.pending.length),calls=floor.filter(f=>f.reqs.length);
    let html='';
    if(pend.length||calls.length)html+=`<div class="list alerts">${pend.map(f=>`<button type="button" class="row tap" style="width:100%;text-align:left" data-table="${f.id}"><span class="ichip warnchip">${ic('qr')}</span><span class="grow"><span class="t">${esc(f.name)} สั่งผ่าน QR ${f.pending.reduce((a,o)=>a+(o.order_items||[]).length,0)} รายการ</span><span class="s">ตรวจแล้วกดยืนยันเพื่อส่งเข้าครัว</span></span><span class="btn sm">ดู</span></button>`).join('')}
      ${calls.map(f=>f.reqs.map(x=>`<button type="button" class="row tap" style="width:100%;text-align:left" data-table="${f.id}"><span class="ichip ${x.kind==='bill'?'':'warnchip'}">${ic(x.kind==='bill'?'pos':'hand')}</span><span class="grow"><span class="t">${esc(f.name)} ${x.kind==='bill'?'ขอเช็คบิล':'เรียกพนักงาน'}</span><span class="s">${agoAgo(x.created_at)}</span></span>${ic('chevr')}</button>`).join('')).join('')}</div>`;
    html+=`<div class="legend">${Object.values(TABLE_STATE).map(s=>`<span><i style="background:${s.dot}"></i>${s.label}</span>`).join('')}<span class="muted">มีลูกค้า ${busy} จาก ${floor.length} โต๊ะ</span></div>`;
    html+=floor.length?`<div class="tgrid">${floor.map(tableCard).join('')}</div>`:`<div class="card empty">ยังไม่มีโต๊ะ</div>`;
    if(takeaway.length)html+=`<div class="section"><h3>กลับบ้าน / เดลิเวอรี ที่ยังไม่ชำระ</h3></div><div class="list">${takeaway.map(o=>`<button type="button" class="row tap" style="width:100%;text-align:left" data-bill="${o.id}"><span class="ichip">${ic('bag')}</span><span class="grow"><span class="t">#${o.order_no} · ${esc(o.channel==='หน้าร้าน'?'กลับบ้าน':o.channel)}</span><span class="s">${agoText(o.created_at)}</span></span><b class="nowrap">${baht(o.total)}</b>${ic('chevr')}</button>`).join('')}</div>`;
    return html;
  },
  bind(v){
    v.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>openTableSheet(b.dataset.table));
    v.querySelectorAll('[data-bill]').forEach(b=>b.onclick=()=>openBill(b.dataset.bill));
    const a=v.querySelector('#actAddTable');if(a)a.onclick=()=>editTable(null);
    const q=v.querySelector('#actQrAll');if(q)q.onclick=printAllTableQr;
  }
});

function tableCard(f){
  const st=TABLE_STATE[f.state];
  const badge=f.pending.length?`<span class="tbadge" title="QR รอยืนยัน">${ic('qr')}</span>`:f.reqs.some(x=>x.kind==='call')?`<span class="tbadge" title="เรียกพนักงาน">${ic('hand')}</span>`:'';
  const info=f.open?`<div class="tamt">${baht(f.open.total)}</div><div class="tsub">${ic('clock')}${agoText(f.open.created_at)} · ${f.items.reduce((a,i)=>a+i.qty,0)} ชิ้น</div>`:`<div class="tsub muted">แตะเพื่อเปิดโต๊ะ</div>`;
  return `<button type="button" class="tcard" data-table="${f.id}" style="--st:${st.dot}">${badge}<div class="tname">${esc(f.name)}</div><span class="pill ${st.cls}">${st.label}</span>${info}</button>`;
}

function itemStatusPill(s){return s==='served'?'<span class="pill ok">เสิร์ฟแล้ว</span>':s==='cooking'?'<span class="pill info">กำลังทำ</span>':s==='void'?'<span class="pill bad">ยกเลิก</span>':'<span class="pill">รอทำ</span>'}
function itemLine(i,opts){
  opts=opts||{};
  const o=(i.options||[]).map(x=>x.name).join(' · ');
  return `<div class="iline${i.kitchen_status==='void'?' void':''}"><span class="q">${i.qty}×</span><div class="grow"><div class="t">${esc(i.name)}</div>${o||i.note?`<div class="s">${esc([o,i.note?'“'+i.note+'”':''].filter(Boolean).join(' · '))}</div>`:''}</div>
    ${opts.status?itemStatusPill(i.kitchen_status):''}<b class="nowrap">${baht(i.unit_price*i.qty)}</b>${opts.void&&i.kitchen_status!=='void'?`<button type="button" class="iconbtn sm" data-void="${i.id}" aria-label="ยกเลิกรายการ">${ic('x')}</button>`:''}</div>`;
}

async function openTableSheet(tableId){
  const {floor}=await loadFloor();const f=floor.find(x=>x.id===tableId);if(!f)return;
  const st=TABLE_STATE[f.state];
  let body=`<div style="display:flex;gap:8px;align-items:center;margin:-4px 0 10px"><span class="pill ${st.cls}">${st.label}</span>${f.open?`<span class="mini muted">บิล #${f.open.order_no} · ${agoText(f.open.created_at)}</span>`:''}</div>`;
  for(const q of f.pending){
    body+=`<div class="card qrcard"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">${ic('qr')}<b style="flex:1">ลูกค้าสั่งผ่าน QR #${q.order_no}</b><span class="mini muted">${agoText(q.created_at)}</span></div>
      ${(q.order_items||[]).map(i=>itemLine(i)).join('')}
      <div class="grid2 keep2" style="margin-top:10px"><button type="button" class="btn danger" data-reject="${q.id}">ไม่รับ</button><button type="button" class="btn" data-confirm="${q.id}">${ic('check')}ยืนยัน ส่งเข้าครัว</button></div></div>`;
  }
  for(const r of f.reqs)body+=`<div class="notice ${r.kind==='bill'?'info':''}">${ic(r.kind==='bill'?'pos':'hand')}<span style="flex:1">${r.kind==='bill'?'ลูกค้าขอเช็คบิล':'ลูกค้าเรียกพนักงาน'} · ${agoAgo(r.created_at)}</span><button type="button" class="btn sm secondary" data-done="${r.id}">รับทราบ</button></div>`;
  if(f.open)body+=`<div class="list" style="padding:4px 14px">${f.open.order_items.map(i=>itemLine(i,{status:true,void:true})).join('')}</div><div class="sumrow big"><span>รวม</span><b>${baht(f.open.total)}</b></div>`;
  else if(!f.pending.length)body+=`<div class="empty">โต๊ะว่าง</div>`;
  body+=`<div class="tabletools">${f.qr_enabled?`<button type="button" class="btn secondary sm" data-qr>${ic('qr')}QR ให้ลูกค้าสั่งเอง</button>`:''}${can('owner','manager')?`<button type="button" class="btn secondary sm" data-edit>${ic('edit')}แก้ไขโต๊ะ</button>`:''}</div>`;
  const s=openSheet(f.name,body,`<button type="button" class="btn secondary" data-add>${ic('plus')}${f.open?'สั่งเพิ่ม':'เปิดโต๊ะ / สั่งอาหาร'}</button>${f.open?`<button type="button" class="btn" data-pay>${ic('cash')}เช็คบิล</button>`:''}`);
  const el=s.el,again=()=>{s.close();openTableSheet(tableId);refresh()};
  el.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=e=>withBusy(e.currentTarget,'กำลังยืนยัน...',async()=>{const r=must(await sb.rpc('confirm_qr_order',{p_order:b.dataset.confirm}));toast(`ยืนยันแล้ว · บิล #${r.order_no}`);again()}));
  el.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{if(!await confirmSheet('ไม่รับออเดอร์นี้?','รายการทั้งหมดในออเดอร์ QR นี้จะถูกยกเลิก ลูกค้าจะเห็นว่าร้านยกเลิก','ไม่รับออเดอร์',true))return;try{must(await sb.rpc('reject_qr_order',{p_order:b.dataset.reject}));again()}catch(e){toastErr(e)}});
  el.querySelectorAll('[data-done]').forEach(b=>b.onclick=e=>withBusy(e.currentTarget,'...',async()=>{must(await sb.from('service_requests').update({done_at:new Date().toISOString(),done_by:S.user.id}).eq('id',b.dataset.done));again()}));
  el.querySelectorAll('[data-void]').forEach(b=>b.onclick=async()=>{if(!await confirmSheet('ยกเลิกรายการนี้?','รายการจะถูกตัดออกจากบิลและแจ้งไปที่ครัว','ยกเลิกรายการ',true))return;try{must(await sb.rpc('void_item',{p_item:b.dataset.void}));again()}catch(e){toastErr(e)}});
  el.querySelector('[data-add]').onclick=()=>{s.close();startSaleFor(tableId)};
  const pay=el.querySelector('[data-pay]');if(pay)pay.onclick=()=>{s.close();openBill(f.open.id)};
  const qr=el.querySelector('[data-qr]');if(qr)qr.onclick=()=>{s.close();showTableQr(f)};
  const ed=el.querySelector('[data-edit]');if(ed)ed.onclick=async()=>{s.close();editTable(must(await sb.from('dining_tables').select('*').eq('id',tableId).single()))};
}

function tableOrderUrl(token){return new URL('order.html?t='+encodeURIComponent(token),location.href).href}
function showTableQr(f){
  const url=tableOrderUrl(f.qr_token);
  const s=openSheet('QR '+f.name,`<div style="text-align:center"><div class="qrbox">${qrSvg(url,240)}</div>
    <p class="mini muted" style="margin:8px 0">ลูกค้าสแกนด้วยกล้องมือถือเพื่อสั่งอาหารเอง ไม่ต้องลงแอป ออเดอร์จะรอพนักงานยืนยันก่อนเข้าครัว</p>
    <a class="mini" href="${esc(url)}" target="_blank" rel="noopener">เปิดหน้าสั่งอาหารของโต๊ะนี้</a></div>`,
    `<button type="button" class="btn" id="qrPrint">${ic('printer')}พิมพ์ QR</button>`);
  s.el.querySelector('#qrPrint').onclick=()=>printQrCards([f]);
}
async function printAllTableQr(){
  const {floor}=await loadFloor();
  const list=floor.filter(f=>f.qr_enabled);
  if(!list.length)return toast('ยังไม่มีโต๊ะที่เปิด QR',true);
  printQrCards(list);
}
function printQrCards(list){
  printHtml(`<div class="qrsheet">${list.map(f=>`<div class="qrcardp"><div class="shop">${esc(S.shop.name)}</div><div class="tb">${esc(f.name)}</div>${qrSvg(tableOrderUrl(f.qr_token),220)}<div class="hint">สแกนเพื่อดูเมนูและสั่งอาหาร</div></div>`).join('')}</div>`,'qr');
}

// ---------- kitchen display ----------
const KDS={station:undefined,showServed:false};
definePage('kitchen',{title:'ครัว',live:true,
  actions(){return can('owner','manager')?`<button type="button" class="btn soft sm" id="actStations">${ic('settings')}สถานี</button>`:''},
  async render(){
    const sid=S.shopId;
    const [st,o]=await Promise.all([
      sb.from('stations').select('id,name').eq('shop_id',sid).order('sort').order('name'),
      sb.from('orders').select('id,order_no,table_id,channel,created_at,dining_tables(name),order_items(id,name,qty,options,note,kitchen_status,station_id,created_at,updated_at)').eq('shop_id',sid).eq('status','open').order('created_at')]);
    const stations=must(st),orders=must(o);
    if(KDS.station===undefined)KDS.station=(S.role==='kitchen'&&S.me&&S.me.station_id)||'all';
    const inStation=i=>!!i.station_id&&(KDS.station==='all'||i.station_id===KDS.station);   // items set to “ไม่ส่งครัว” never show here
    const active=i=>i.kitchen_status==='waiting'||i.kitchen_status==='cooking';
    const count=sidv=>orders.reduce((a,x)=>a+x.order_items.filter(i=>active(i)&&i.station_id&&(sidv==='all'||i.station_id===sidv)).length,0);
    const tabs=[['all','ทุกสถานี'],...stations.map(x=>[x.id,x.name])];
    const tickets=orders.map(x=>({...x,items:x.order_items.filter(i=>inStation(i)&&(active(i)||(KDS.showServed&&i.kitchen_status==='served'&&minsSince(i.updated_at)<30)))}))
      .filter(x=>x.items.length).map(x=>({...x,oldest:x.items.filter(active).reduce((m,i)=>i.created_at<m?i.created_at:m,x.items[0].created_at)}))
      .sort((a,b)=>a.oldest<b.oldest?-1:1);
    return `<div class="chips">${tabs.map(([id,n])=>`<button type="button" data-st="${id}" class="${KDS.station===id?'active':''}">${esc(n)} ${count(id)}</button>`).join('')}</div>
      <label class="switch" style="max-width:340px"><span class="mini">แสดงที่เสิร์ฟแล้ว (30 นาทีล่าสุด)</span><input type="checkbox" id="kdsServed"${KDS.showServed?' checked':''}></label>
      ${tickets.length?`<div class="kds">${tickets.map(ticket).join('')}</div>`:`<div class="card empty">${ic('check')}<p style="margin-top:6px">ไม่มีรายการค้างทำ</p></div>`}`;
  },
  bind(v){
    v.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{KDS.station=b.dataset.st;refresh()});
    const sv=v.querySelector('#kdsServed');if(sv)sv.onchange=()=>{KDS.showServed=sv.checked;refresh()};
    v.querySelectorAll('[data-kst]').forEach(b=>b.onclick=e=>withBusy(e.currentTarget,'...',async()=>{must(await sb.rpc('set_item_status',{p_item:b.dataset.item,p_status:b.dataset.kst}));refresh()}));
    v.querySelectorAll('[data-kall]').forEach(b=>b.onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
      for(const id of b.dataset.kall.split(','))must(await sb.rpc('set_item_status',{p_item:id,p_status:'served'}));refresh()}));
    const a=v.querySelector('#actStations');if(a)a.onclick=openStationsSheet;
  }
});
function ticket(x){
  const m=minsSince(x.oldest),lvl=m>=20?'late':m>=10?'warn':'ok';
  const where=x.dining_tables?x.dining_tables.name:(x.channel==='หน้าร้าน'?'กลับบ้าน':x.channel);
  const pending=x.items.filter(i=>i.kitchen_status!=='served');
  return `<div class="ticket ${lvl}"><div class="thead"><div><b>${esc(where)}</b><div class="mini muted">#${x.order_no}</div></div><span class="pill ${lvl==='late'?'bad':lvl==='warn'?'warn':'ok'}">${ic('clock')}${m} นาที</span></div>
    ${x.items.map(i=>{const o=(i.options||[]).map(z=>z.name).join(' · ');return `<div class="kline ${i.kitchen_status}"><div class="grow"><div class="t">${i.qty} × ${esc(i.name)}</div>${o?`<div class="s">${esc(o)}</div>`:''}${i.note?`<div class="note">“${esc(i.note)}”</div>`:''}</div>
      ${i.kitchen_status==='waiting'?`<button type="button" class="btn soft sm" data-item="${i.id}" data-kst="cooking">เริ่มทำ</button>`:i.kitchen_status==='cooking'?`<button type="button" class="btn sm" data-item="${i.id}" data-kst="served">เสิร์ฟแล้ว</button>`:'<span class="pill ok">เสิร์ฟแล้ว</span>'}</div>`}).join('')}
    ${pending.length>1?`<button type="button" class="btn secondary sm block" style="margin-top:8px" data-kall="${pending.map(i=>i.id).join(',')}">${ic('check')}เสิร์ฟครบทั้งบิล</button>`:''}</div>`;
}
