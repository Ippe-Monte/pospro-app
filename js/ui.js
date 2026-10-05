// =====================================================================
// ui.js — bottom sheets, confirm dialog, busy buttons
// =====================================================================

// opens a bottom sheet (centred dialog on wide screens). Returns {el, close}.
function openSheet(title,bodyHtml,footHtml,opts){
  opts=opts||{};
  const back=document.createElement('div');back.className='sheetback';
  back.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div>
    <div class="shead"><h3>${esc(title)}</h3><button type="button" class="iconbtn" data-close aria-label="ปิด">${ic('x')}</button></div>
    <div class="sbody">${bodyHtml}</div>${footHtml?`<div class="sfoot">${footHtml}</div>`:''}</div>`;
  let closed=false;
  const close=()=>{if(closed)return;closed=true;back.remove();document.removeEventListener('keydown',onKey);opts.onClose&&opts.onClose()};
  const onKey=e=>{if(e.key==='Escape'&&!document.querySelector('.cropper'))close()};
  back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-close]'))close()});
  document.addEventListener('keydown',onKey);
  document.body.appendChild(back);
  const first=back.querySelector('input,select,textarea');if(first&&opts.focus!==false&&window.innerWidth>=900)first.focus();
  return {el:back.querySelector('.sheet'),close};
}

function confirmSheet(title,message,okLabel,danger){
  return new Promise(res=>{
    let ok=false;
    const s=openSheet(title,`<p class="muted" style="margin-bottom:6px">${esc(message)}</p>`,
      `<button type="button" class="btn secondary" data-close>ยกเลิก</button><button type="button" class="btn${danger?' danger':''}" data-ok>${esc(okLabel||'ยืนยัน')}</button>`,
      {onClose:()=>res(ok)});
    s.el.querySelector('[data-ok]').onclick=()=>{ok=true;s.close()};
  });
}

// runs fn while the button shows a busy label; errors become a toast
async function withBusy(btn,label,fn){
  const old=btn.innerHTML;btn.disabled=true;btn.textContent=label||'กำลังบันทึก...';
  try{return await fn()}catch(e){toastErr(e);return undefined}finally{if(btn.isConnected){btn.disabled=false;btn.innerHTML=old}}
}

function val(root,sel){const el=root.querySelector(sel);return el?el.value.trim():''}
function num(root,sel){const v=val(root,sel).replace(/,/g,'');return v===''?NaN:Number(v)}
