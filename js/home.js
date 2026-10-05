// =====================================================================
// home.js — "ขาย" tab. In V2.0.0 it is the shop set-up checklist; the selling screen arrives in V2.1.
// =====================================================================
async function countRows(table,filter){
  let q=sb.from(table).select('*',{count:'exact',head:true}).eq('shop_id',S.shopId);
  if(filter)q=filter(q);
  const {count,error}=await q;if(error)throw error;return count||0;
}

definePage('home',{title:'ขายหน้าร้าน',roles:['owner','manager','cashier'],
  async render(){
    const intro=`<div class="notice info">${ic('info')}<span>หน้าขาย ตะกร้า และเช็คบิล จะเปิดใช้ใน <b>V2.1</b></span></div>`;
    if(!can('owner','manager'))return intro+`<div class="card"><p class="muted">ระหว่างนี้ เจ้าของร้านกำลังตั้งค่าเมนูและโต๊ะ เมื่อหน้าขายเปิดใช้ คุณจะเริ่มขายได้จากหน้านี้</p></div>`;
    const [prod,photo,cats,tables,pending]=await Promise.all([
      countRows('products'),countRows('products',q=>q.not('image_path','is',null)),countRows('categories'),
      countRows('dining_tables'),countRows('shop_members',q=>q.eq('status','pending'))]);
    const staff=await countRows('shop_members',q=>q.eq('status','active'));
    const pp=!!(S.shop&&S.shop.promptpay_id);
    const steps=[
      {done:cats>0,  t:'สร้างหมวดหมู่เมนู',    s:cats?`${cats} หมวด`:'เช่น ก๋วยเตี๋ยว เครื่องดื่ม', go:'menu',tab:'cats'},
      {done:prod>0,  t:'เพิ่มเมนูและราคา',      s:prod?`${prod} เมนู · มีรูป ${photo}`:'ใส่รูปจากมือถือได้ ระบบย่อขนาดให้เอง', go:'menu'},
      {done:tables>0,t:'ตั้งชื่อโต๊ะ',          s:`${tables} โต๊ะ`, go:'tables'},
      {done:staff>1, t:'ชวนพนักงานเข้าร่วมร้าน', s:pending?`มีคำขอรออนุมัติ ${pending} คน`:`รหัสร้าน ${S.shop.join_code||''}`, go:'staff'},
      {done:pp,      t:'ใส่เลขพร้อมเพย์ของร้าน',  s:pp?'พร้อมรับเงินผ่าน QR':'ใช้สร้าง QR รับเงินตอนเช็คบิล', go:'settings'},
    ];
    const n=steps.filter(x=>x.done).length;
    return intro+`<div class="section"><h3>ตั้งค่าร้านให้พร้อมขาย</h3><span class="pill ${n===steps.length?'ok':'info'}">${n}/${steps.length}</span></div>
      <div class="list steps">${steps.map((x,i)=>`<button type="button" class="row tap${x.done?' done':''}" style="width:100%;text-align:left" data-go="${x.go}" data-tab="${x.tab||''}">
        <span class="num">${x.done?ic('check'):i+1}</span><span class="grow"><span class="t">${esc(x.t)}</span><span class="s">${esc(x.s)}</span></span>${ic('chevr')}</button>`).join('')}</div>`;
  },
  bind(v){v.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{if(b.dataset.tab)MENU_UI.tab=b.dataset.tab;go(b.dataset.go)})}
});

definePage('summary',{title:'สรุปวันนี้',roles:['owner','manager','cashier'],
  async render(){return comingSoon('สรุปยอดขายรายวัน','V2.2',['ยอดขายวันนี้ แยกเงินสด / พร้อมเพย์ / โอน','เมนูขายดี','จำนวนบิลและยอดเฉลี่ยต่อบิล'])}
});
