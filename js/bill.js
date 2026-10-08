// =====================================================================
// bill.js — check bill: discount / promo code, member, cash with change, PromptPay QR, transfer/card;
// payment goes through pay_order (database checks the amount, deducts stock, gives member points).
// Also the receipt and the shared print helper.
// =====================================================================
async function openBill(orderId){
  let o;
  try{o=must(await sb.from('orders').select('*,dining_tables(name),order_items(id,name,qty,unit_price,options,note,kitchen_status)').eq('id',orderId).single())}
  catch(e){return toastErr(e)}
  if(o.status!=='open')return toast(o.status==='paid'?'บิลนี้ชำระแล้ว':'บิลนี้ไม่ได้เปิดอยู่',true);
  const items=o.order_items.filter(i=>i.kitchen_status!=='void');
  const sub=Number(o.subtotal);
  const where=o.dining_tables?o.dining_tables.name:(o.channel==='หน้าร้าน'?'กลับบ้าน':o.channel);
  const st={method:'cash',disc:'none',discVal:'',code:'',promo:null,cash:'',member:null};
  const {data:promos}=await sb.from('promotions').select('id,name,code,kind,value').eq('shop_id',S.shopId).eq('active',true);
  const s=openSheet(`เช็คบิล · ${where}`,`
    <div class="mini muted" style="margin:-6px 0 8px">บิล #${o.order_no}</div>
    <div class="list" style="padding:4px 14px">${items.map(i=>itemLine(i)).join('')}</div>
    <div class="billsum"><div class="sumrow"><span>ยอดรวม</span><span>${baht(sub)}</span></div><div class="sumrow" id="bDiscRow"><span>ส่วนลด</span><span id="bDisc">฿0</span></div>
      <div class="sumrow big"><span>ยอดสุทธิ</span><b id="bTotal">${baht(sub)}</b></div></div>
    <div class="mgroup">ส่วนลด</div>
    <div class="chips" id="bDiscTabs">${[['none','ไม่มี'],['code','โค้ด / โปร'],['amount','ลดเป็นบาท'],['percent','ลดเป็น %']].map(([k,n])=>`<button type="button" data-disc="${k}" class="${k==='none'?'active':''}">${n}</button>`).join('')}</div>
    <div id="bDiscBox"></div>
    <div class="mgroup">สมาชิก (ไม่บังคับ)</div>
    <div class="searchrow"><input id="bPhone" inputmode="tel" placeholder="เบอร์โทรสมาชิก" maxlength="20" aria-label="เบอร์โทรสมาชิก"><button type="button" class="btn secondary sm" id="bFind">${ic('search')}ค้นหา</button></div>
    <div id="bMember" class="mini muted" style="margin:4px 2px 0"></div>
    <div class="mgroup">วิธีชำระ</div>
    <div class="paytiles">${[['cash','cash','เงินสด'],['promptpay','qr','พร้อมเพย์'],['transfer','bank','โอน'],['card','card','บัตร']].map(([k,i,n])=>`<button type="button" data-method="${k}" class="${k==='cash'?'on':''}">${ic(i)}<span>${n}</span></button>`).join('')}</div>
    <div id="bPayBox"></div>`,
    `<button type="button" class="btn" id="bConfirm">${ic('check')}ยืนยันรับเงิน</button>`);
  const el=s.el;
  const discount=()=>{
    if(st.disc==='code'&&st.promo)return Math.min(sub,st.promo.kind==='percent'?Math.round(sub*st.promo.value)/100:Number(st.promo.value));
    const v=Number(String(st.discVal).replace(/,/g,''))||0;
    if(st.disc==='amount')return Math.min(sub,Math.max(0,v));
    if(st.disc==='percent')return Math.min(sub,Math.round(sub*Math.min(100,Math.max(0,v)))/100);
    return 0;
  };
  const total=()=>Math.round((sub-discount())*100)/100;
  function paintTotals(){
    el.querySelector('#bDisc').textContent=discount()?'-'+baht(discount()):'฿0';
    el.querySelector('#bTotal').textContent=baht(total());
    el.querySelector('#bConfirm').innerHTML=`${ic('check')}ยืนยันรับเงิน ${baht(total())}`;
    paintChange();
  }
  function paintDiscBox(){
    const box=el.querySelector('#bDiscBox');
    if(st.disc==='none'){box.innerHTML='';return}
    if(st.disc==='code'){
      box.innerHTML=`${(promos||[]).length?`<div class="chips" style="flex-wrap:wrap">${promos.map(p=>`<button type="button" data-promo="${p.id}" class="${st.promo&&st.promo.id===p.id?'active':''}">${esc(p.code)} · ${esc(p.name)}</button>`).join('')}</div>`:''}
        <div class="searchrow"><input id="bCode" placeholder="พิมพ์โค้ด เช่น SAVE10" value="${esc(st.code)}" style="text-transform:uppercase" aria-label="โค้ดส่วนลด"><button type="button" class="btn secondary sm" id="bUse">ใช้โค้ด</button></div>`;
      box.querySelectorAll('[data-promo]').forEach(b=>b.onclick=()=>{st.promo=promos.find(p=>p.id===b.dataset.promo);st.code=st.promo.code;paintDiscBox();paintTotals()});
      box.querySelector('#bUse').onclick=()=>{const c=val(box,'#bCode').toUpperCase();const p=(promos||[]).find(x=>x.code===c);if(!p)return toast('ไม่พบโค้ดนี้ หรือปิดใช้งานแล้ว',true);st.promo=p;st.code=c;paintDiscBox();paintTotals()};
      return;
    }
    box.innerHTML=`<div class="field" style="margin:0"><input id="bDiscVal" inputmode="decimal" placeholder="${st.disc==='amount'?'จำนวนบาท':'เปอร์เซ็นต์'}" value="${esc(st.discVal)}" aria-label="ส่วนลด"></div>`;
    box.querySelector('#bDiscVal').oninput=e=>{st.discVal=e.target.value;paintTotals()};
  }
  function quickCash(t){const set=new Set([t]);for(const step of [20,50,100,500,1000]){const v=Math.ceil(t/step)*step;if(v>t)set.add(v)}return [...set].sort((a,b)=>a-b).slice(0,5)}
  function paintChange(){
    const box=el.querySelector('#bChange');if(!box)return;
    const got=Number(String(st.cash).replace(/,/g,''));
    if(!st.cash){box.className='changebox';box.innerHTML='';return}
    const diff=Math.round((got-total())*100)/100;
    box.className='changebox '+(diff>=0?'ok':'short');
    box.innerHTML=`<div class="lbl">${diff>=0?'เงินทอน':'ยังขาดอีก'}</div><div class="amt">${baht(Math.abs(diff))}</div>`;
  }
  function paintPayBox(){
    const box=el.querySelector('#bPayBox');
    el.querySelectorAll('[data-method]').forEach(b=>b.classList.toggle('on',b.dataset.method===st.method));
    if(st.method==='cash'){
      box.innerHTML=`<div class="chips" style="flex-wrap:wrap;margin-top:10px" id="bQuick">${quickCash(total()).map(v=>`<button type="button" data-cash="${v}">${v===total()?'พอดี':baht(v).replace('฿','')}</button>`).join('')}</div>
        <div class="field" style="margin:0"><label for="bCash">รับเงินมา (บาท)</label><input id="bCash" inputmode="decimal" value="${esc(st.cash)}"></div><div id="bChange" class="changebox"></div>`;
      box.querySelectorAll('[data-cash]').forEach(b=>b.onclick=()=>{st.cash=b.dataset.cash;box.querySelector('#bCash').value=st.cash;paintChange()});
      box.querySelector('#bCash').oninput=e=>{st.cash=e.target.value;paintChange()};
      paintChange();
    }else if(st.method==='promptpay'){
      const id=S.shop&&S.shop.promptpay_id;
      if(!id){box.innerHTML=`<div class="notice" style="margin-top:10px">${ic('info')}<span>ยังไม่ได้ใส่เลขพร้อมเพย์ของร้าน${can('owner','manager')?' — ตั้งค่าได้ที่ โปรไฟล์ → ตั้งค่าร้าน':''}</span></div>`;return}
      let svg='';try{svg=qrSvg(promptPayPayload(id,total()),230)}catch(e){svg=`<p class="muted">${esc(e.message)}</p>`}
      box.innerHTML=`<div class="ppbox"><div class="pphead">PromptPay</div><div class="qrbox">${svg}</div><div class="ppamt">${baht(total())}</div>
        <div class="mini muted">${esc(S.shop.promptpay_name||'')} · ${esc(maskPP(id))}</div>
        <div class="mini muted" style="margin-top:4px">ระบบยังไม่ตรวจยอดเข้าอัตโนมัติ — ตรวจในแอปธนาคารก่อนกดยืนยัน</div></div>`;
    }else{
      box.innerHTML=`<div class="notice info" style="margin-top:10px">${ic('info')}<span>ตรวจยอด${st.method==='card'?'จากเครื่องรูดบัตร':'โอนในแอปธนาคาร'}ให้ครบ ${baht(total())} แล้วกดยืนยัน</span></div>`;
    }
  }
  el.querySelectorAll('[data-disc]').forEach(b=>b.onclick=()=>{st.disc=b.dataset.disc;if(st.disc!=='code')st.promo=null;el.querySelectorAll('[data-disc]').forEach(x=>x.classList.toggle('active',x===b));paintDiscBox();paintTotals();paintPayBox()});
  el.querySelectorAll('[data-method]').forEach(b=>b.onclick=()=>{st.method=b.dataset.method;paintPayBox()});
  el.querySelector('#bFind').onclick=async()=>{
    const ph=val(el,'#bPhone').replace(/\D/g,'');if(ph.length<4)return toast('ใส่เบอร์อย่างน้อย 4 หลัก',true);
    const {data}=await sb.from('customers').select('id,name,phone,points').eq('shop_id',S.shopId);
    const m=(data||[]).find(c=>String(c.phone||'').replace(/\D/g,'').endsWith(ph));
    st.member=m||null;
    el.querySelector('#bMember').innerHTML=m?`${ic('check','emo')} ${esc(m.name)} · แต้มสะสม ${m.points} (บิลนี้ได้เพิ่ม ${Math.floor(total()/100)} แต้ม)`:'ไม่พบสมาชิกเบอร์นี้';
  };
  el.querySelector('#bConfirm').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
    if(st.method==='cash'){const got=Number(String(st.cash).replace(/,/g,''));if(!st.cash||got<total())return toast('ใส่จำนวนเงินที่รับมาให้ครบก่อน',true)}
    const args={p_order:o.id,p_method:st.method,p_cash_received:st.method==='cash'?Number(String(st.cash).replace(/,/g,'')):null,
      p_discount:st.disc==='code'?0:discount(),p_promo_code:st.disc==='code'&&st.promo?st.promo.code:null,p_customer:st.member?st.member.id:null};
    const r=must(await sb.rpc('pay_order',args));
    s.close();
    if(getCart().tableId&&o.table_id===getCart().tableId){const c=getCart();c.tableId=null;c.channel='หน้าร้าน';saveCart()}
    paidSheet({...o,items,where,method:st.method,cash:args.p_cash_received,member:st.member},r);
    refresh();
  });
  paintDiscBox();paintPayBox();paintTotals();
}
function maskPP(id){const t=String(id).replace(/\D/g,'');return t.length>6?t.slice(0,3)+'-xxx-'+t.slice(-4):t}

const METHOD_LABEL={cash:'เงินสด',promptpay:'พร้อมเพย์',transfer:'โอน',card:'บัตร'};
function paidSheet(o,r){
  const s=openSheet('รับเงินเรียบร้อย',`<div class="paiddone">${ic('check','big')}<div class="amt">${baht(r.total)}</div><div class="muted">บิล #${r.order_no} · ${esc(o.where)} · ${METHOD_LABEL[o.method]}</div>
    ${o.method==='cash'?`<div class="changebox ok" style="margin-top:12px"><div class="lbl">เงินทอน</div><div class="amt">${baht(r.change)}</div></div>`:''}</div>`,
    `<button type="button" class="btn secondary" id="pdPrint">${ic('printer')}พิมพ์ใบเสร็จ</button><button type="button" class="btn" data-close>เสร็จ</button>`);
  s.el.querySelector('#pdPrint').onclick=()=>printReceipt(o,r);
}

function printReceipt(o,r){
  const sh=S.shop||{};const d=new Date();
  const lines=o.items.map(i=>`<tr><td>${i.qty}× ${esc(i.name)}${(i.options||[]).length?`<div class="op">${esc(i.options.map(x=>x.name).join(', '))}</div>`:''}</td><td class="r">${Number(i.unit_price*i.qty).toFixed(2)}</td></tr>`).join('');
  printHtml(`<div class="receipt"><div class="c b big">${esc(sh.name||'')}</div>${sh.address?`<div class="c">${esc(sh.address)}</div>`:''}${sh.phone?`<div class="c">โทร ${esc(sh.phone)}</div>`:''}${sh.tax_id?`<div class="c">เลขผู้เสียภาษี ${esc(sh.tax_id)}</div>`:''}
    <hr><div>บิล #${r.order_no} · ${esc(o.where)}</div><div>${d.toLocaleDateString('th-TH')} ${d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</div><hr>
    <table>${lines}</table><hr>
    <table><tr><td>รวม</td><td class="r">${Number(r.subtotal).toFixed(2)}</td></tr>${Number(r.discount)?`<tr><td>ส่วนลด</td><td class="r">-${Number(r.discount).toFixed(2)}</td></tr>`:''}
    <tr class="b big"><td>สุทธิ</td><td class="r">${Number(r.total).toFixed(2)}</td></tr><tr><td>${METHOD_LABEL[o.method]}</td><td class="r">${o.method==='cash'?Number(o.cash).toFixed(2):Number(r.total).toFixed(2)}</td></tr>
    ${o.method==='cash'?`<tr><td>เงินทอน</td><td class="r">${Number(r.change).toFixed(2)}</td></tr>`:''}</table>
    ${o.member?`<hr><div>สมาชิก ${esc(o.member.name)}</div>`:''}<hr><div class="c">${esc(sh.footer_note||'ขอบคุณที่ใช้บริการ')}</div></div>`,'receipt');
}

// prints a fragment without leaving the page (receipts, table QR cards)
function printHtml(html,kind){
  let area=document.getElementById('printArea');
  if(!area){area=document.createElement('div');area.id='printArea';document.body.appendChild(area)}
  area.className='print-'+(kind||'doc');area.innerHTML=html;
  setTimeout(()=>window.print(),50);
}
