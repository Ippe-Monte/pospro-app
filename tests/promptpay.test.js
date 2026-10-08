// node tests/promptpay.test.js <path to promptpay-qr package dir>   — compares our payload with the reference library
const ours=require('../js/promptpay.js');
const ref=require(process.argv[2]+'/index.js');
let fail=0;const cases=[['0812345678',0],['0812345678',4.22],['081-234-5678',150],['1234567890123',1000],['123456789012345',99.5],['0899999999',1234567.89]];
for(const [t,a] of cases){const r=ref(t,a?{amount:a}:{});const o=ours.promptPayPayload(t,a);const ok=r===o;if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+t+' '+a+(ok?'':'\n  ref '+r+'\n  our '+o))}
try{ours.promptPayPayload('123',1);console.log('FAIL bad id accepted');fail++}catch(e){console.log('PASS bad id rejected')}
process.exit(fail?1:0);
