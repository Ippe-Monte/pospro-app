// =====================================================================
// profile.js — profile card + menu groups (data-driven, skill-profile-menu-app),
// shop settings, and the "coming soon" pages that keep the menu structure final from day one.
// =====================================================================

// menu items are data: icon, label, page, optional sub caption, roles, when()
const PROFILE_MENU=[
  {group:'ร้าน',items:[
    {icon:'book',  label:'เมนูและสินค้า',  go:'menu',     roles:['owner','manager']},
    {icon:'box',   label:'สต๊อกวัตถุดิบ',  go:'stock',    roles:['owner','manager'], sub:'V2.2'},
    {icon:'tag',   label:'โปรโมชัน',       go:'promo',    roles:['owner','manager'], sub:'V2.2'},
    {icon:'card',  label:'สมาชิก',         go:'customers',roles:['owner','manager','cashier'], sub:'V2.2'},
  ]},
  {group:'เงิน',items:[
    {icon:'expense',label:'รายจ่าย',          go:'expenses',roles:['owner','manager'], sub:'V2.2'},
    {icon:'drawer', label:'ลิ้นชักเงินสด',      go:'drawer',  roles:['owner','manager','cashier'], sub:'V2.1'},
    {icon:'lock',   label:'ปิดยอดประจำวัน',    go:'closing', roles:['owner','manager'], sub:'V2.2'},
  ]},
  {group:'ระบบ',items:[
    {icon:'users',   label:'พนักงานและสิทธิ์',             go:'staff',   roles:['owner','manager'], badge:()=>PROFILE_UI.pending},
    {icon:'settings',label:'ตั้งค่าร้าน · พร้อมเพย์ · ใบเสร็จ', go:'settings',roles:['owner','manager']},
    {icon:'store',   label:'เปลี่ยนร้าน',                  run:'openShopSwitcher()', when:()=>S.memberships.filter(m=>m.status==='active').length>1},
  ]},
];
const PROFILE_UI={pending:0};

definePage('profile',{title:'โปรไฟล์',sub:true,navAs:'profile',
  async render(){
    if(can('owner','manager')){
      const {count}=await sb.from('shop_members').select('*',{count:'exact',head:true}).eq('shop_id',S.shopId).eq('status','pending');
      PROFILE_UI.pending=count||0;
    }
    const me=S.me||{};
    let html=`<div class="card" style="padding:0"><div class="pcard"><span class="avatar">${esc(initial(me.display_name))}</span>
      <div style="flex:1;min-width:0"><div style="font-weight:800;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(me.display_name||'')}</div>
      <div class="muted mini">${ROLE_LABEL[S.role]||''} · ${esc(S.shop.name)}</div><div class="muted mini" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.user.email||'')}</div></div></div></div>`;
    for(const g of PROFILE_MENU){
      const items=g.items.filter(i=>(!i.roles||i.roles.includes(S.role))&&(!i.when||i.when()));
      if(!items.length)continue;
      html+=`<div class="mgroup">${g.group}</div><div class="list">${items.map((i,k)=>{
        const b=i.badge&&i.badge();
        return `<button type="button" class="row tap" style="width:100%;text-align:left" data-mi="${PROFILE_MENU.indexOf(g)}.${g.items.indexOf(i)}"><span class="ichip">${ic(i.icon)}</span>
          <span class="grow"><span class="t">${esc(i.label)}</span>${i.sub?`<span class="s">เปิดใช้ใน ${esc(i.sub)}</span>`:''}</span>${b?`<span class="pill warn">${b}</span>`:''}${ic('chevr')}</button>`}).join('')}</div>`;
    }
    html+=`<button type="button" class="btn danger block" id="btnOut" style="margin-top:6px">${ic('logout')}ออกจากระบบ</button>
      <p class="appver-line">POSPRO เวอร์ชัน <span class="appver">${APP_VERSION}</span></p>`;
    return html;
  },
  bind(v){
    v.querySelectorAll('[data-mi]').forEach(b=>b.onclick=()=>{
      const [gi,ii]=b.dataset.mi.split('.').map(Number);const it=PROFILE_MENU[gi].items[ii];
      if(it.go)go(it.go);else if(it.run==='openShopSwitcher()')openShopSwitcher();
    });
    v.querySelector('#btnOut').onclick=async()=>{if(await confirmSheet('ออกจากระบบ?','เครื่องนี้จะต้องเข้าสู่ระบบใหม่ในครั้งต่อไป','ออกจากระบบ'))signOut()};
  }
});

definePage('settings',{title:'ตั้งค่าร้าน',roles:['owner','manager'],sub:true,
  async render(){
    const sh=must(await sb.from('shops').select('*').eq('id',S.shopId).single());S.shop=sh;
    const f=(id,label,v,attrs,hint)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(v||'')}" ${attrs||''}>${hint?`<div class="hint">${hint}</div>`:''}</div>`;
    return `<div class="card"><h3 style="margin-bottom:10px">ข้อมูลร้าน (แสดงบนใบเสร็จ)</h3>
      ${f('stName','ชื่อร้าน',sh.name,'maxlength="120"')}
      ${f('stAddr','ที่อยู่',sh.address,'maxlength="400"')}
      <div class="grid2">${f('stPhone','เบอร์โทร',sh.phone,'inputmode="tel" maxlength="40"')}${f('stTax','เลขประจำตัวผู้เสียภาษี',sh.tax_id,'inputmode="numeric" maxlength="40"')}</div>
      ${f('stFoot','ข้อความท้ายใบเสร็จ',sh.footer_note,'maxlength="200"')}</div>
      <div class="card"><h3 style="margin-bottom:10px">รับเงินผ่านพร้อมเพย์</h3>
      <div class="grid2">${f('stPP','เลขพร้อมเพย์',sh.promptpay_id,'inputmode="numeric" maxlength="20" placeholder="เบอร์มือถือ หรือเลขบัตร 13 หลัก"','ใช้สร้าง QR พร้อมยอดเงินตอนเช็คบิล (V2.1)')}${f('stPPName','ชื่อบัญชี',sh.promptpay_name,'maxlength="120"')}</div></div>
      <button type="button" class="btn block" id="stSave">บันทึกการตั้งค่า</button>`;
  },
  bind(v){
    v.querySelector('#stSave').onclick=e=>withBusy(e.currentTarget,'กำลังบันทึก...',async()=>{
      const name=val(v,'#stName');if(!name)return toast('กรุณาใส่ชื่อร้าน',true);
      const pp=val(v,'#stPP').replace(/[\s-]/g,'');
      if(pp&&!/^(\d{10}|\d{13}|\d{15})$/.test(pp))return toast('เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลข 13 หลัก',true);
      const row={name,address:val(v,'#stAddr')||null,phone:val(v,'#stPhone')||null,tax_id:val(v,'#stTax')||null,
        footer_note:val(v,'#stFoot')||'ขอบคุณที่ใช้บริการ',promptpay_id:pp||null,promptpay_name:val(v,'#stPPName')||null};
      must(await sb.from('shops').update(row).eq('id',S.shopId));
      Object.assign(S.shop,row);const m=S.memberships.find(x=>x.shop_id===S.shopId);if(m&&m.shops)Object.assign(m.shops,row);
      const chip=document.querySelector('.shopchip .nm');if(chip)chip.textContent=name;
      audit('แก้ไขตั้งค่าร้าน');toast('บันทึกแล้ว');
    });
  }
});

// planned pages: reachable now so the menu structure is final, honest about when they arrive
[['stock','สต๊อกวัตถุดิบ','V2.2',['ตัดสต๊อกอัตโนมัติจากสูตรของแต่ละเมนูเมื่อชำระเงิน','แจ้งเตือนวัตถุดิบใกล้หมด','รูปวัตถุดิบใช้ระบบย่อรูปอัตโนมัติแบบเดียวกับเมนู'],['owner','manager']],
 ['promo','โปรโมชัน','V2.2',['โค้ดส่วนลดแบบเปอร์เซ็นต์หรือจำนวนเงิน','เปิด/ปิดโปรได้ทันที'],['owner','manager']],
 ['customers','สมาชิก','V2.2',['สะสมแต้มและยอดใช้จ่าย','ค้นหาด้วยเบอร์โทรตอนเช็คบิล'],['owner','manager','cashier']],
 ['expenses','รายจ่าย','V2.2',['บันทึกบิลซื้อของหลายรายการต่อบิล','แนบรูปใบเสร็จ (ย่อรูปอัตโนมัติ เก็บแบบส่วนตัว)','ผู้จำหน่าย'],['owner','manager']],
 ['drawer','ลิ้นชักเงินสด','V2.1',['เปิดกะพร้อมเงินทอนตั้งต้น','ปิดกะ นับเงินจริงเทียบกับยอดขายเงินสด'],['owner','manager','cashier']],
 ['closing','ปิดยอดประจำวัน','V2.2',['สรุปยอดขาย รายจ่าย และกำไรขั้นต้นของวัน','ส่งออกเป็นไฟล์ Excel'],['owner','manager']],
].forEach(([id,title,when,points,roles])=>definePage(id,{title,roles,sub:true,render:async()=>comingSoon(title,when,points)}));
