// =====================================================================
// money.js — "สรุปวันนี้" (day summary) and the cash drawer shift
// Charts are single-series bars in one hue with values in ink and a hover title (dataviz rules).
// =====================================================================
const SUM={day:null};
function todayTH(){return new Date(Date.now()+7*3600e3).toISOString().slice(0,10)}
function thDate(d){return new Date(d+'T00:00:00+07:00').toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}

definePage('summary',{title:'สรุปวันนี้',roles:['owner','manager','cashier'],live:true,
  actions(){return can('owner','manager')?`<input type="date" id="sumDay" class="datein" value="${SUM.day||todayTH()}" max="${todayTH()}" aria-label="เลือกวันที่">`:''},
  async render(){
    const day=SUM.day||todayTH();
    const r=must(await sb.rpc('day_summary',{p_shop:S.shopId,p_day:day}));
    const total=Number(r.total),bills=Number(r.bills);
    const tiles=[['ยอดขาย',baht(total),'cash'],['จำนวนบิล',bills.toLocaleString('th-TH'),'pos'],['เฉลี่ยต่อบิล',bills?baht(Math.round(total/bills)):'฿0','summary'],['ส่วนลดรวม',baht(r.discount),'tag']];
    const methods=[['cash','เงินสด'],['promptpay','พร้อมเพย์'],['transfer','โอน'],['card','บัตร']].map(([k,n])=>[n,Number(r.by_method[k]||0)]);
    const mMax=Math.max(1,...methods.map(m=>m[1]));
    const hours=[];for(let h=6;h<=23;h++)hours.push([h,Number(r.by_hour[h]||0)]);
    const hMax=Math.max(1,...hours.map(x=>x[1]));
    const top=r.top_items||[];const tMax=Math.max(1,...top.map(t=>Number(t.qty)));
    return `<div class="mini muted" style="margin:-2px 2px 10px">${thDate(day)}${r.open_bills||r.pending_qr?` · ยังไม่ชำระ ${r.open_bills} บิล${r.pending_qr?` · QR รอยืนยัน ${r.pending_qr}`:''}`:''}</div>
      <div class="kpis">${tiles.map(([l,v,i])=>`<div class="kpi"><div class="kl">${ic(i)}${l}</div><div class="kv">${v}</div></div>`).join('')}</div>
      <div class="card"><h3>ยอดตามวิธีชำระ</h3><div class="hbars">${methods.map(([n,v])=>`<div class="hbar" title="${n} ${baht(v)}"><span class="hl">${n}</span><span class="ht"><i style="width:${v?Math.max(2,v/mMax*100):0}%"></i></span><b>${baht(v)}</b></div>`).join('')}</div></div>
      <div class="card"><h3>ยอดขายรายชั่วโมง</h3>${total?`<div class="vbars" role="img" aria-label="ยอดขายรายชั่วโมง">${hours.map(([h,v])=>`<div class="vb" title="${h}:00–${h}:59 · ${baht(v)}"><i style="height:${v?Math.max(3,v/hMax*100):0}%"></i><span>${h}</span></div>`).join('')}</div>`:'<div class="empty">ยังไม่มียอดขาย</div>'}</div>
      <div class="card"><h3>เมนูขายดี</h3>${top.length?`<div class="hbars">${top.map((t,i)=>`<div class="hbar" title="${esc(t.name)} ${t.qty} ชิ้น · ${baht(t.amount)}"><span class="hl"><span class="rank">${i+1}</span>${esc(t.name)}</span><span class="ht"><i style="width:${Math.max(2,t.qty/tMax*100)}%"></i></span><b>${t.qty} ชิ้น</b></div>`).join('')}</div>`:'<div class="empty">ยังไม่มีรายการขาย</div>'}</div>`;
  },
  bind(v){const d=v.querySelector('#sumDay');if(d)d.onchange=()=>{SUM.day=d.value||null;refresh()}}
});

// ---------- cash drawer ----------
definePage('drawer',{title:'ลิ้นชักเงินสด',roles:['owner','manager','cashier'],sub:true,
  async render(){
    const d=must(await sb.rpc('drawer_summary',{p_shop:S.shopId}));
    const {data:hist}=await sb.from('cash_sessions').select('*').eq('shop_id',S.shopId).not('closed_at','is',null).order('closed_at',{ascending:false}).limit(7);
    DRAWER.d=d;
    let html;
    if(!d.open){
      html=`<div class="card"><div class="notice">${ic('drawer')}<span>ลิ้นชักยังไม่เปิด — เปิดกะพร้อมใส่เงินทอนตั้งต้นก่อนเริ่มขายเงินสด</span></div>
        <div class="field"><label for="drFloat">เงินทอนตั้งต้น (บาท)</label><input id="drFloat" inputmode="decimal" value="2000"></div>
        <button type="button" class="btn block" id="drOpen">${ic('drawer')}เปิดลิ้นชัก</button></div>`;
    }else{
      html=`<div class="card"><div class="mini muted">เปิดโดย ${esc(d.opened_by||'')} · ${new Date(d.opened_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}</div>
        <div class="kpis" style="margin-top:10px"><div class="kpi"><div class="kl">เงินทอนตั้งต้น</div><div class="kv">${baht(d.float)}</div></div><div class="kpi"><div class="kl">ขายเงินสด</div><div class="kv">${baht(d.cash_sales)}</div></div><div class="kpi"><div class="kl">ควรมีในลิ้นชัก</div><div class="kv">${baht(d.expected)}</div></div></div>
        <div class="field" style="margin-top:6px"><label for="drCount">นับเงินได้จริง (บาท)</label><input id="drCount" inputmode="decimal" placeholder="นับแล้วใส่ยอด"></div>
        <div class="field"><label for="drNote">หมายเหตุ</label><input id="drNote" maxlength="300"></div>
        <button type="button" class="btn block" id="drClose">${ic('lock')}ปิดกะ</button></div>`;
    }
    if((hist||[]).length)html+=`<div class="section"><h3>กะที่ผ่านมา</h3></div><div class="list">${hist.map(h=>`<div class="row"><span class="ichip">${ic('drawer')}</span><span class="grow"><span class="t">${new Date(h.closed_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}</span><span class="s">ตั้งต้น ${baht(h.float_open)} · นับได้ ${baht(h.cash_counted)}${h.note?' · '+esc(h.note):''}</span></span></div>`).join('')}</div>`;
    return html;
  },
  bind(v){
    const o=v.querySelector('#drOpen');if(o)o.onclick=e=>withBusy(e.currentTarget,'กำลังเปิด...',async()=>{must(await sb.rpc('open_drawer',{p_shop:S.shopId,p_float:num(v,'#drFloat')||0}));toast('เปิดลิ้นชักแล้ว');refresh()});
    const c=v.querySelector('#drClose');if(c)c.onclick=e=>withBusy(e.currentTarget,'กำลังปิด...',async()=>{
      const n=num(v,'#drCount');if(!(n>=0))return toast('ใส่ยอดเงินที่นับได้',true);
      const r=must(await sb.rpc('close_drawer',{p_shop:S.shopId,p_counted:n,p_note:val(v,'#drNote')||null}));
      const diff=Number(r.diff);
      await confirmSheet('ปิดกะแล้ว',`ควรมี ${baht(r.expected)} · นับได้ ${baht(r.counted)} · ${diff===0?'ตรงพอดี':diff>0?'เกิน '+baht(diff):'ขาด '+baht(-diff)}`,'ตกลง');
      refresh()});
  }
});
const DRAWER={d:null};
