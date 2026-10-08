// =====================================================================
// options.js — options sheet for a menu item (noodle type, size, extras, note, quantity).
// Shared by the staff selling screen and the customer QR page.
// =====================================================================
function optText(choices){return (choices||[]).map(c=>c.name+(c.price?` (+${c.price})`:'')).join(' · ')}

// onAdd(line) receives {product_id,name,unit_price,qty,choices:[{group_id,group,name,price}],note}
function openOptionsSheet(p,groups,onAdd,opts){
  opts=opts||{};
  groups=groups.slice().sort((a,b)=>(b.required-a.required)||((a.sort||0)-(b.sort||0)));   // required choices first
  const sel={};groups.forEach(g=>{sel[g.id]=[]});
  let qty=1;
  const url=imgUrl(p.image_path);
  const s=openSheet(p.name,`${url?`<div class="optphoto" style="background-image:url('${esc(url)}')"></div>`:''}
    <div class="pr" style="font-weight:800;color:var(--brand-d);margin-bottom:10px">เริ่มต้น ${baht(p.price)}</div>
    ${groups.map(g=>`<div class="optgroup"><div class="oghead"><b>${esc(g.name)}</b>${g.required?'<span class="pill warn">ต้องเลือก</span>':g.multi?'<span class="mini muted">เลือกได้หลายอย่าง</span>':'<span class="mini muted">ไม่บังคับ</span>'}</div>
      <div class="optchoices">${(g.choices||[]).map((c,i)=>`<button type="button" class="optc" data-g="${g.id}" data-i="${i}" aria-pressed="false">${ic('check','ck')}${esc(c.name)}${c.price?` <span class="muted">+${c.price}</span>`:''}</button>`).join('')}</div></div>`).join('')}
    <div class="field" style="margin-top:6px"><label for="optNote">หมายเหตุถึงครัว</label><input id="optNote" maxlength="200" placeholder="เช่น ไม่เผ็ด แยกน้ำ"></div>`,
    `<div class="qty big"><button type="button" class="qbtn" id="oMinus" aria-label="ลด">${ic('minus')}</button><b id="oQty">1</b><button type="button" class="qbtn add" id="oPlus" aria-label="เพิ่ม">${ic('plus')}</button></div><button type="button" class="btn" id="oAdd">${opts.addLabel||'ใส่ตะกร้า'}</button>`);
  const el=s.el;
  const price=()=>Number(p.price)+groups.reduce((a,g)=>a+sel[g.id].reduce((b,i)=>b+Number(g.choices[i].price||0),0),0);
  const paint=()=>{el.querySelector('#oQty').textContent=qty;el.querySelector('#oAdd').textContent=`${opts.addLabel||'ใส่ตะกร้า'} ${baht(price()*qty)}`;
    el.querySelectorAll('.optc').forEach(b=>{const on=sel[b.dataset.g].includes(+b.dataset.i);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)})};
  el.querySelectorAll('.optc').forEach(b=>b.onclick=()=>{
    const g=groups.find(x=>x.id===b.dataset.g),i=+b.dataset.i,arr=sel[g.id];
    if(g.multi){const k=arr.indexOf(i);k>=0?arr.splice(k,1):arr.push(i)}else sel[g.id]=arr[0]===i&&!g.required?[]:[i];
    paint()});
  el.querySelector('#oMinus').onclick=()=>{qty=Math.max(1,qty-1);paint()};
  el.querySelector('#oPlus').onclick=()=>{qty=Math.min(opts.maxQty||99,qty+1);paint()};
  el.querySelector('#oAdd').onclick=()=>{
    const miss=groups.find(g=>g.required&&!sel[g.id].length);
    if(miss)return toast(`กรุณาเลือก “${miss.name}”`,true);
    const choices=[];groups.forEach(g=>sel[g.id].forEach(i=>choices.push({group_id:g.id,group:g.name,name:g.choices[i].name,price:Number(g.choices[i].price||0)})));
    onAdd({product_id:p.id,name:p.name,unit_price:price(),qty,choices,note:val(el,'#optNote')});
    s.close();
  };
  paint();
}
