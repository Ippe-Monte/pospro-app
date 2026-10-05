// =====================================================================
// shell.js — header, left rail (tablet) / bottom nav (phone), page router go()/goBack()
// Main destinations are few; everything else lives behind the avatar -> profile menu.
// =====================================================================

// main destinations, filtered by role. 'rail' = shown only on the tablet rail (phones reach them from the profile)
const NAV=[
  {id:'home',    icon:'pos',     label:'ขาย',       roles:['owner','manager','cashier']},
  {id:'tables',  icon:'table',   label:'โต๊ะ',      roles:['owner','manager','cashier']},
  {id:'kitchen', icon:'flame',   label:'ครัว',      roles:['owner','manager','cashier','kitchen']},
  {id:'summary', icon:'summary', label:'สรุปวันนี้', roles:['owner','manager','cashier']},
  {id:'menu',    icon:'book',    label:'เมนู',      roles:['owner','manager'], rail:true},
  {id:'staff',   icon:'users',   label:'พนักงาน',   roles:['owner','manager'], rail:true},
  {id:'profile', icon:'more',    label:'เพิ่มเติม', roles:['owner','manager','cashier','kitchen'], rail:true},
];

// every page: title, who may open it, sub = reached from the profile (shows Back instead of the shop switcher)
const PAGES={};
function definePage(id,def){PAGES[id]=Object.assign({roles:['owner','manager','cashier','kitchen'],sub:false},def)}

function defaultPage(){return S.role==='kitchen'?'kitchen':'home'}

function renderShell(){
  const name=S.me&&S.me.display_name||'';
  app().className='shell';
  const navItems=NAV.filter(n=>n.roles.includes(S.role));
  app().innerHTML=`
  <nav class="rail" aria-label="เมนูหลัก"><img class="brand" src="icons/logo.png" alt="POSPRO">
    ${navItems.map(n=>`<button type="button" data-nav="${n.id}">${ic(n.icon)}<span>${n.label}</span></button>`).join('')}
  </nav>
  <div class="main">
    <header class="top">
      <button type="button" class="iconbtn backbtn" id="btnBack" aria-label="กลับ">${ic('chevl')}</button><div class="spacer"></div>
      <button type="button" class="shopchip" id="btnShop" aria-label="เปลี่ยนร้าน"><span class="live"></span><span class="nm">${esc(S.shop.name)}</span>${S.memberships.filter(m=>m.status==='active').length>1?ic('chevd'):''}</button>
      <button type="button" class="avatar" id="btnMe" aria-label="โปรไฟล์และเมนูทั้งหมด">${esc(initial(name))}</button>
    </header>
    <main class="content" id="view"></main>
  </div>
  <nav class="bottomnav" aria-label="เมนูหลัก">
    ${navItems.filter(n=>!n.rail).map(n=>`<button type="button" data-nav="${n.id}">${ic(n.icon)}<span>${n.label}</span></button>`).join('')}
  </nav>`;
  app().querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>go(b.dataset.nav,{reset:true}));
  document.getElementById('btnBack').onclick=goBack;
  document.getElementById('btnMe').onclick=()=>go('profile',{reset:true});
  document.getElementById('btnShop').onclick=openShopSwitcher;
}

function openShopSwitcher(){
  const act=S.memberships.filter(m=>m.status==='active'&&m.shops);
  if(act.length<2)return;
  const s=openSheet('เลือกร้าน',`<div class="list">${act.map(m=>`<button type="button" class="row tap" style="width:100%;text-align:left" data-shop="${m.shop_id}"><span class="ichip">${ic('store')}</span><span class="grow"><span class="t">${esc(m.shops.name)}</span><span class="s">${ROLE_LABEL[m.role]}</span></span>${m.shop_id===S.shopId?ic('check'):''}</button>`).join('')}</div>`);
  s.el.querySelectorAll('[data-shop]').forEach(b=>b.onclick=()=>{s.close();enterShop(act.find(m=>m.shop_id===b.dataset.shop))});
}

let renderSeq=0;
async function go(id,opts){
  opts=opts||{};
  let p=PAGES[id];
  if(!p||!p.roles.includes(S.role)){id=defaultPage();p=PAGES[id]}
  if(opts.reset)S.stack=[];
  else if(S.page&&S.page!==id&&!opts.back)S.stack.push(S.page);
  S.page=id;
  const navId=p.navAs||id;
  // a profile sub-page that also sits on the tablet rail behaves like a main page there (no Back button)
  const onRail=window.matchMedia('(min-width:900px)').matches&&NAV.some(n=>n.id===navId&&n.roles.includes(S.role));
  document.body.classList.toggle('subpage',!!p.sub&&!onRail);
  app().querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===navId));
  const view=document.getElementById('view');
  const actions=p.actions?p.actions():'';
  view.innerHTML=`<div class="pagehead"><h1>${esc(p.title)}</h1><div class="pageactions">${actions}</div></div><div id="pbody"><div class="empty">กำลังโหลด...</div></div>`;
  window.scrollTo(0,0);
  const seq=++renderSeq;
  try{
    const html=await p.render();
    if(seq!==renderSeq)return;                       // user moved on while this page was loading
    document.getElementById('pbody').innerHTML=html;
    p.bind&&p.bind(document.getElementById('view'));
  }catch(e){
    if(seq!==renderSeq)return;
    console.error(e);
    document.getElementById('pbody').innerHTML=`<div class="card empty">${ic('info')}<p style="margin-top:6px">${esc(friendlyError(e))}</p><button type="button" class="btn soft sm" style="margin-top:10px" id="retry">ลองใหม่</button></div>`;
    document.getElementById('retry').onclick=()=>go(id,{back:true});
  }
}
function refresh(){return go(S.page,{back:true})}
function goBack(){const prev=S.stack.pop();go(prev||(PAGES[S.page]&&PAGES[S.page].sub?'profile':defaultPage()),{back:true})}

// pages that are planned but not built yet say so plainly instead of looking broken
function comingSoon(what,when,points){
  return `<div class="card"><div class="notice info">${ic('info')}<span>${esc(what)} จะเปิดใช้ใน <b>${esc(when)}</b></span></div>
  ${points&&points.length?`<ul class="muted" style="margin:4px 0 0;padding-left:20px;font-size:14px;line-height:1.8">${points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}</div>`;
}
