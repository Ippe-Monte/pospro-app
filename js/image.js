// =====================================================================
// image.js — product photos: pick -> crop (4:3) -> shrink -> upload to Supabase Storage
//
// Why: in V1 a big photo was refused (limit ~1.2 MB) and, worse, photos were stripped out
// before saving to Google Sheets, so they vanished after a refresh. Now any phone photo is
// cropped to 800x600 and re-encoded as JPEG (usually 60-200 KB), stored as a real file in
// the "pospro" bucket, and only its path is saved on the product row.
// =====================================================================
const IMG={W:800,H:600,MAX_BYTES:400*1024,MAX_INPUT:40*1024*1024,BUCKET:'pospro'};

// returns an error message, or null when the file can be tried
function checkPickedImage(file){
  if(!file)return 'ไม่ได้เลือกรูป';
  const isImg=/^image\//.test(file.type)||/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name||'');
  if(!isImg)return 'ไฟล์นี้ไม่ใช่รูปภาพ';
  if(file.size>IMG.MAX_INPUT)return `รูปใหญ่เกิน ${Math.round(IMG.MAX_INPUT/1048576)} MB กรุณาเลือกรูปอื่น`;
  return null;
}

// opens the phone's photo picker / camera; resolves to a File or null
function pickImageFile(){
  return new Promise(res=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
    inp.style.cssText='position:fixed;left:-9999px;opacity:0';
    let done=false;const fin=v=>{if(done)return;done=true;inp.remove();res(v)};
    inp.onchange=()=>fin(inp.files&&inp.files[0]||null);
    window.addEventListener('focus',()=>setTimeout(()=>{if(!inp.files||!inp.files.length)fin(null)},800),{once:true});
    document.body.appendChild(inp);inp.click();
  });
}

function blobToImage(blob){
  return new Promise((res,rej)=>{const u=URL.createObjectURL(blob);const im=new Image();
    im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('เปิดรูปนี้ไม่ได้'))};im.src=u});
}
function canvasToBlob(c,q){return new Promise(res=>c.toBlob(res,'image/jpeg',q))}

// re-encode until the JPEG is at most maxBytes: lower quality first, then smaller size
async function shrinkJpeg(blob,maxBytes){
  maxBytes=maxBytes||IMG.MAX_BYTES;
  if(blob.size<=maxBytes&&blob.type==='image/jpeg')return blob;
  const im=await blobToImage(blob);
  let w=im.naturalWidth,h=im.naturalHeight,best=blob;
  const longest=Math.max(w,h);if(longest>1600){const k=1600/longest;w=Math.round(w*k);h=Math.round(h*k)}
  for(let pass=0;pass<4;pass++){
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingQuality='high';x.drawImage(im,0,0,w,h);
    for(const q of [.86,.78,.7,.6]){
      const b=await canvasToBlob(c,q);if(!b)continue;
      if(b.size<best.size||best.type!=='image/jpeg')best=b;
      if(b.size<=maxBytes)return b;
    }
    w=Math.round(w*.8);h=Math.round(h*.8);
  }
  return best;
}

// full flow for a product photo. Resolves to a JPEG Blob (<= 400 KB) or null if cancelled.
async function prepareProductPhoto(file){
  const err=checkPickedImage(file);if(err){toast(err,true);return null}
  const cropped=await openCropper(file,{w:IMG.W,h:IMG.H,guide:'none',title:'เลือกส่วนของรูปที่จะแสดงในเมนู'});
  if(!cropped)return null;
  return await shrinkJpeg(cropped,IMG.MAX_BYTES);
}

function imgUrl(path){
  if(!path)return '';
  if(/^(https?:|data:|blob:)/.test(path))return path;
  return sb.storage.from(IMG.BUCKET).getPublicUrl(path).data.publicUrl;
}

// uploads under <shop>/<folder>/<id>-<time>.jpg (a new name each time, so phones never show a cached old photo)
async function uploadShopImage(shopId,folder,id,blob){
  const path=`${shopId}/${folder}/${id}-${Date.now()}.jpg`;
  const {error}=await sb.storage.from(IMG.BUCKET).upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
  if(error)throw error;
  return path;
}

async function removeShopImage(path){
  if(!path||/^(https?:|data:|blob:)/.test(path))return;
  try{await sb.storage.from(IMG.BUCKET).remove([path])}catch(e){console.warn('old photo not removed',e)}
}
