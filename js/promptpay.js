// =====================================================================
// promptpay.js — Thai PromptPay QR payload (EMVCo merchant-presented) + QR rendering
// Payload logic follows dtinth/promptpay-qr (MIT); tests/promptpay.test.js compares the two.
// =====================================================================
function ppField(id,value){return id+('00'+value.length).slice(-2)+value}
function ppCrc16(str){                     // CRC-16/CCITT-FALSE (xmodem poly 0x1021, init 0xFFFF)
  let crc=0xFFFF;
  for(let i=0;i<str.length;i++){crc^=str.charCodeAt(i)<<8;for(let b=0;b<8;b++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xFFFF:(crc<<1)&0xFFFF}
  return ('0000'+crc.toString(16).toUpperCase()).slice(-4);
}
// target: mobile number (10 digits), national / tax id (13) or e-wallet id (15). amount optional.
function promptPayPayload(target,amount){
  const t=String(target||'').replace(/[^0-9]/g,'');
  if(!/^(\d{10}|\d{13}|\d{15})$/.test(t))throw new Error('เลขพร้อมเพย์ไม่ถูกต้อง');
  const type=t.length>=15?'03':t.length>=13?'02':'01';
  const acct=t.length>=13?t:('0000000000000'+t.replace(/^0/,'66')).slice(-13);
  const amt=Number(amount);
  const parts=[ppField('00','01'),ppField('01',amt?'12':'11'),
    ppField('29',ppField('00','A000000677010111')+ppField(type,acct)),
    ppField('58','TH'),ppField('53','764')];
  if(amt)parts.push(ppField('54',amt.toFixed(2)));
  const data=parts.join('')+'6304';
  return data+ppCrc16(data);
}
// any text -> crisp SVG QR (qrcode-generator, error level M)
function qrSvg(text,px){
  const q=qrcode(0,'M');q.addData(text);q.make();
  const n=q.getModuleCount(),m=4,size=n+m*2;let d='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c+m} ${r+m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px||220}" height="${px||220}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
if(typeof module!=='undefined')module.exports={promptPayPayload,ppCrc16};
