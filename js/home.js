// =====================================================================
// home.js — shop set-up checklist (owner / manager). Opened from the profile menu and from an empty sell screen.
// =====================================================================
async function countRows(table,filter){
  let q=sb.from(table).select('*',{count:'exact',head:true}).eq('shop_id',S.shopId);
  if(filter)q=filter(q);
  const {count,error}=await q;if(error)throw error;return count||0;
}

definePage('setup',{title:'ตั้งค่าร้านให้พร้อมขาย',roles:['owner','manager'],sub:true,
  async render(){
    const [prod,photo,cats,tables,pending,staff]=await Promise.all([
      countRows('products'),countRows('products',q=>q.not('image_path','is',null)),countRows('categories'),
      countRows('dining_tables'),countRows('shop_members',q=>q.eq('status','pending')),countRows('shop_members',q=>q.eq('status','active'))]);
    const pp=!!(S.shop&&S.shop.promptpay_id);
    const steps=[
      {done:cats>0,  t:'สร้างหมวดหมู่เมนู',    s:cats?`${cats} หมวด`:'เช่น ก๋วยเตี๋ยว เครื่องดื่ม', go:'menu',tab:'cats'},
      {done:prod>0,  t:'เพิ่มเมนูและราคา',      s:prod?`${prod} เมนู · มีรูป ${photo}`:'ใส่รูปจากมือถือได้ ระบบย่อขนาดให้เอง', go:'menu'},
      {done:tables>0,t:'ตั้งชื่อโต๊ะและพิมพ์ QR',  s:`${tables} โต๊ะ`, go:'tables'},
      {done:staff>1, t:'ชวนพนักงานเข้าร่วมร้าน', s:pending?`มีคำขอรออนุมัติ ${pending} คน`:`รหัสร้าน ${S.shop.join_code||''}`, go:'staff'},
      {done:pp,      t:'ใส่เลขพร้อมเพย์ของร้าน',  s:pp?'พร้อมรับเงินผ่าน QR':'ใช้สร้าง QR รับเงินตอนเช็คบิล', go:'settings'},
    ];
    const n=steps.filter(x=>x.done).length;
    return `<div class="section" style="margin-top:4px"><h3>${n===steps.length?'ร้านพร้อมขายแล้ว':'ทำให้ครบเพื่อเริ่มขาย'}</h3><span class="pill ${n===steps.length?'ok':'info'}">${n}/${steps.length}</span></div>
      <div class="list steps">${steps.map((x,i)=>`<button type="button" class="row tap${x.done?' done':''}" style="width:100%;text-align:left" data-go="${x.go}" data-tab="${x.tab||''}">
        <span class="num">${x.done?ic('check'):i+1}</span><span class="grow"><span class="t">${esc(x.t)}</span><span class="s">${esc(x.s)}</span></span>${ic('chevr')}</button>`).join('')}</div>`;
  },
  bind(v){v.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{if(b.dataset.tab)MENU_UI.tab=b.dataset.tab;go(b.dataset.go)})}
});
