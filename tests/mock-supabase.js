// Browser-side fake Supabase for UI tests (replaces js/vendor/supabase-*.js when the test runs).
// Stateful; persists to localStorage so a page reload keeps the data. Mirrors the SQL functions'
// behaviour closely enough to drive the UI (prices computed here, never from the page).
(function(){
const KEY='__mockdb';
const seed=()=>({
  users:[{id:'u-owner',email:'owner@shop.test',password:'secret123',user_metadata:{full_name:'สมชาย'}},
         {id:'u-cash',email:'cash@shop.test',password:'secret123',user_metadata:{full_name:'สมหญิง'}},
         {id:'u-kit',email:'kitchen@shop.test',password:'secret123',user_metadata:{full_name:'ครัว'}}],
  session:null,
  shops:[],shop_members:[],stations:[],categories:[],option_groups:[],products:[],dining_tables:[],audit_log:[],
  orders:[],order_items:[],service_requests:[],promotions:[],customers:[],stock_items:[],recipes:[],cash_sessions:[],
  objects:{}, uploads:[], rpcLog:[]
});
let db;try{db=JSON.parse(localStorage.getItem(KEY))||seed()}catch(e){db=seed()}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){console.warn('mock save',e)}};
const load=()=>{try{const d=JSON.parse(localStorage.getItem(KEY));if(d)db=d}catch(e){}window.__DB=db};
window.__DB=db;window.__mockSave=save;window.__mockLoad=load;window.__mockReset=()=>{localStorage.removeItem(KEY)};
const uid=()=>db.session&&db.session.user.id;
const id=()=>'id-'+Math.random().toString(36).slice(2,10);
const now=()=>new Date().toISOString();
const role=(shop)=>{const m=db.shop_members.find(m=>m.shop_id===shop&&m.user_id===uid()&&m.status==='active');return m&&m.role};
const has=(shop,roles)=>roles.includes(role(shop));
const err=m=>({data:null,error:{message:m}});
const OMC=['owner','manager','cashier'],OM=['owner','manager'];
const WRITE_ROLES={products:OM,categories:OM,option_groups:OM,stations:OM,dining_tables:OM,shops:OM,promotions:OM,stock_items:OM,recipes:OM,
  customers:OMC,cash_sessions:OMC,service_requests:OMC,orders:OM,order_items:OM,audit_log:['owner','manager','cashier','kitchen']};
const READ_ONLY_OM=['expenses','audit_log'];

function recalc(o){const items=db.order_items.filter(i=>i.order_id===o.id&&i.kitchen_status!=='void');o.subtotal=Math.round(items.reduce((a,i)=>a+i.unit_price*i.qty,0)*100)/100;o.discount=Math.min(o.discount||0,o.subtotal);o.total=Math.round((o.subtotal-o.discount)*100)/100;o.updated_at=now()}
function newOrder(shop,fields){const s=db.shops.find(x=>x.id===shop);s.next_order_no=s.next_order_no||1001;const o={id:id(),shop_id:shop,order_no:s.next_order_no++,table_id:null,channel:'หน้าร้าน',source:'staff',status:'open',subtotal:0,discount:0,total:0,created_at:now(),updated_at:now(),...fields};db.orders.push(o);return o}

// embedded selects used by the app: orders(order_items, dining_tables), shop_members(shops)
function embed(table,rows,sel){
  if(table==='shop_members'&&/shops\(/.test(sel))return rows.map(m=>({...m,shops:m.status==='active'?db.shops.find(s=>s.id===m.shop_id)||null:null}));
  if(table==='orders'){
    return rows.map(o=>{const r={...o};
      if(/order_items\(/.test(sel))r.order_items=db.order_items.filter(i=>i.order_id===o.id).sort((a,b)=>a.created_at<b.created_at?-1:1).map(i=>({...i}));
      if(/dining_tables\(/.test(sel))r.dining_tables=o.table_id?{name:(db.dining_tables.find(t=>t.id===o.table_id)||{}).name}:null;
      return r});
  }
  return rows;
}

function q(table){
  let filters=[],ord=[],op='select',payload=null,single=false,maybe=false,head=false,sel='*',lim=null;
  const api={
    select(s,o){if(op==='select'||!op)sel=s||'*';else sel=s||'*';if(o&&o.head)head=true;return api},
    eq(c,v){filters.push(r=>r[c]===v);return api},
    in(c,v){filters.push(r=>v.includes(r[c]));return api},
    is(c,v){filters.push(r=>(r[c]??null)===v);return api},
    not(c,o,v){filters.push(r=>o==='is'&&v===null?r[c]!=null:true);return api},
    order(c,o){ord.push([c,!o||o.ascending!==false]);return api},
    limit(n){lim=n;return api},
    single(){single=true;return api},maybeSingle(){maybe=true;return api},
    insert(p){op='insert';payload=p;return api},update(p){op='update';payload=p;return api},delete(){op='delete';return api},
    then(res,rej){Promise.resolve().then(()=>new Promise(r=>setTimeout(r,12))).then(()=>{try{res(run())}catch(e){rej(e)}})}
  };
  function visible(r){
    if(!uid())return false;
    if(table==='shop_members')return r.user_id===uid()||!!role(r.shop_id);
    if(table==='shops')return !!role(r.id);
    if(READ_ONLY_OM.includes(table))return has(r.shop_id,OM);
    return !!role(r.shop_id);
  }
  function run(){
    load();
    if(!uid())return err('JWT expired');
    const T=db[table]=db[table]||[];
    if(op==='insert'){
      if(table==='orders'||table==='order_items')return err('new row violates row-level security policy');
      const rows=(Array.isArray(payload)?payload:[payload]).map(x=>({id:id(),created_at:now(),sort:0,...x}));
      for(const r of rows){if(!(WRITE_ROLES[table]||[]).includes(role(r.shop_id)))return err('new row violates row-level security policy');
        if(table==='categories'&&T.some(c=>c.shop_id===r.shop_id&&c.name===r.name))return err('duplicate key value violates unique constraint "categories_shop_id_name_key"');
        if(table==='promotions'&&T.some(c=>c.shop_id===r.shop_id&&c.code===r.code))return err('duplicate key value violates unique constraint "promotions_shop_id_code_key"');
        if(table==='customers'){r.points=0;r.visits=0;r.spend=0}}
      rows.forEach(r=>T.push(r));save();return {data:single?rows[0]:rows,error:null};
    }
    let rows=T.filter(visible).filter(r=>filters.every(f=>f(r)));
    if(op==='update'){
      for(const r of rows){const sh=table==='shops'?r.id:r.shop_id;if(!(WRITE_ROLES[table]||[]).includes(role(sh)))return {data:[],error:null}}
      rows.forEach(r=>Object.assign(r,payload,{updated_at:now()}));save();return {data:rows,error:null};
    }
    if(op==='delete'){
      for(const r of rows){if(!(WRITE_ROLES[table]||[]).includes(role(r.shop_id)))return {data:null,error:null}}
      db[table]=T.filter(r=>!rows.includes(r));
      if(table==='categories'){const ids=rows.map(r=>r.id);db.products.forEach(p=>{if(ids.includes(p.category_id))p.category_id=null});db.option_groups=db.option_groups.filter(g=>!ids.includes(g.category_id))}
      if(table==='stock_items'){const ids=rows.map(r=>r.id);db.recipes=db.recipes.filter(x=>!ids.includes(x.stock_id))}
      save();return {data:null,error:null};
    }
    for(const [c,asc] of ord.slice().reverse())rows=rows.slice().sort((a,b)=>(a[c]>b[c]?1:a[c]<b[c]?-1:0)*(asc?1:-1));
    if(lim)rows=rows.slice(0,lim);
    if(head)return {data:null,count:rows.length,error:null};
    rows=embed(table,JSON.parse(JSON.stringify(rows)),sel);
    if(single){if(rows.length!==1)return err('JSON object requested, multiple (or no) rows returned');return {data:rows[0],error:null}}
    if(maybe)return {data:rows[0]||null,error:null};
    return {data:rows,error:null};
  }
  return api;
}

function priceItems(shop,items,onlyAvail){
  if(!Array.isArray(items)||!items.length)throw new Error('ตะกร้าว่าง');
  return items.map(it=>{
    const p=db.products.find(x=>x.id===it.product_id&&x.shop_id===shop);if(!p)throw new Error('มีเมนูที่ไม่มีในร้าน');
    if(onlyAvail&&!p.is_available)throw new Error(`เมนู “${p.name}” หมดแล้ว`);
    const qty=+it.qty;if(!(qty>=1&&qty<=99))throw new Error('จำนวนต้องอยู่ระหว่าง 1–99');
    let price=Number(p.price);const options=[];
    for(const ch of it.choices||[]){const g=db.option_groups.find(x=>x.id===ch.group_id&&x.category_id===p.category_id);if(!g)throw new Error('ตัวเลือกไม่ถูกต้อง');
      const c=(g.choices||[]).find(x=>x.name===ch.name);if(!c)throw new Error('ตัวเลือกไม่ถูกต้อง');price+=Number(c.price||0);options.push({group:g.name,name:c.name,price:Number(c.price||0)})}
    return {product_id:p.id,station_id:p.station_id||null,name:p.name,unit_price:price,qty,options,note:it.note||null};
  });
}
function addItems(o,rows){rows.forEach(r=>db.order_items.push({id:id(),order_id:o.id,shop_id:o.shop_id,kitchen_status:'waiting',created_at:now(),updated_at:now(),...r}));recalc(o)}
const tableByToken=t=>db.dining_tables.find(x=>x.qr_token===t&&x.qr_enabled!==false);
const ANON_RPC=['get_table_menu','place_qr_order','get_qr_order','request_service'];

const rpcs={
  create_shop({p_name,p_display_name}){const s={id:id(),name:p_name,join_code:'7F3A9C21',footer_note:'ขอบคุณที่ใช้บริการ',created_by:uid(),next_order_no:1001};db.shops.push(s);
    db.shop_members.push({shop_id:s.id,user_id:uid(),role:'owner',status:'active',display_name:p_display_name,created_at:now()});
    db.stations.push({id:id(),shop_id:s.id,name:'ครัว',sort:0});for(let i=1;i<=6;i++)db.dining_tables.push({id:id(),shop_id:s.id,name:'โต๊ะ '+i,sort:i,qr_enabled:true,qr_token:'tok-'+i+'-'+id()});return s.id},
  join_shop({p_code,p_display_name}){const s=db.shops.find(s=>s.join_code===p_code);if(!s)throw new Error('ไม่พบร้านจากรหัสนี้');
    if(!db.shop_members.some(m=>m.shop_id===s.id&&m.user_id===uid()))db.shop_members.push({shop_id:s.id,user_id:uid(),role:'cashier',status:'pending',display_name:p_display_name,created_at:now()});
    return {shop_id:s.id,shop_name:s.name,status:'pending'}},
  set_member({p_shop,p_user,p_role,p_status,p_station}){if(role(p_shop)!=='owner')throw new Error('เฉพาะเจ้าของร้าน');
    const m=db.shop_members.find(m=>m.shop_id===p_shop&&m.user_id===p_user);Object.assign(m,{role:p_role,status:p_status,station_id:p_station});return null},
  staff_add_items({p_shop,p_items,p_table,p_order,p_channel}){
    if(!has(p_shop,OMC))throw new Error('not allowed');
    let o=null;
    if(p_order){o=db.orders.find(x=>x.id===p_order);if(!o||o.status!=='open')throw new Error('บิลนี้ปิดไปแล้ว')}
    else if(p_table)o=db.orders.find(x=>x.table_id===p_table&&x.status==='open');
    const rows=priceItems(p_shop,p_items,false);
    if(!o)o=newOrder(p_shop,{table_id:p_table||null,channel:p_channel||'หน้าร้าน',created_by:uid()});
    addItems(o,rows);return {order_id:o.id,order_no:o.order_no,items:rows.length,total:o.total}},
  confirm_qr_order({p_order}){const q=db.orders.find(x=>x.id===p_order);if(!q||!has(q.shop_id,OMC))throw new Error('not allowed');if(q.status!=='pending')throw new Error('ออเดอร์นี้ยืนยันหรือยกเลิกไปแล้ว');
    let t=db.orders.find(x=>x.table_id===q.table_id&&x.status==='open'&&x.id!==q.id);
    if(!t){q.status='open';t=q}else{db.order_items.forEach(i=>{if(i.order_id===q.id)i.order_id=t.id});q.status='void';q.merged_into=t.id;recalc(q);recalc(t)}
    return {order_id:t.id,order_no:t.order_no,total:t.total}},
  reject_qr_order({p_order}){const q=db.orders.find(x=>x.id===p_order);if(!q||!has(q.shop_id,OMC))throw new Error('not allowed');q.status='void';db.order_items.forEach(i=>{if(i.order_id===q.id)i.kitchen_status='void'});recalc(q);return null},
  void_item({p_item}){const i=db.order_items.find(x=>x.id===p_item);if(!i||!has(i.shop_id,OMC))throw new Error('not allowed');i.kitchen_status='void';recalc(db.orders.find(o=>o.id===i.order_id));return null},
  set_item_status({p_item,p_status}){const i=db.order_items.find(x=>x.id===p_item);if(!i||!has(i.shop_id,['owner','manager','cashier','kitchen']))throw new Error('not allowed');i.kitchen_status=p_status;i.updated_at=now();return null},
  pay_order({p_order,p_method,p_cash_received,p_discount,p_promo_code,p_customer}){
    const o=db.orders.find(x=>x.id===p_order);if(!o||!has(o.shop_id,OMC))throw new Error('not allowed');if(o.status!=='open')throw new Error('บิลนี้ชำระแล้วหรือถูกยกเลิก');
    recalc(o);let d=0;
    if(p_promo_code){const pr=db.promotions.find(x=>x.shop_id===o.shop_id&&x.code===p_promo_code.toUpperCase()&&x.active);if(!pr)throw new Error('ไม่พบโค้ดส่วนลดนี้ หรือปิดใช้งานแล้ว');d=pr.kind==='percent'?Math.round(o.subtotal*pr.value)/100:Number(pr.value);o.promotion_id=pr.id}
    else d=Math.max(0,Number(p_discount||0));
    d=Math.min(d,o.subtotal);
    const total=Math.round((o.subtotal-d)*100)/100;let change=0;
    if(p_method==='cash'){if(p_cash_received==null||p_cash_received<total)throw new Error('รับเงินมาไม่พอ');change=Math.round((p_cash_received-total)*100)/100}
    Object.assign(o,{discount:d,total,payment_method:p_method,cash_received:p_method==='cash'?p_cash_received:null,status:'paid',paid_at:now(),paid_by:uid(),customer_id:p_customer||o.customer_id||null});
    db.order_items.filter(i=>i.order_id===o.id&&i.kitchen_status!=='void').forEach(i=>db.recipes.filter(r=>r.product_id===i.product_id).forEach(r=>{const s=db.stock_items.find(x=>x.id===r.stock_id);if(s)s.qty=Math.round((Number(s.qty)-r.qty*i.qty)*1000)/1000}));
    if(o.customer_id){const c=db.customers.find(x=>x.id===o.customer_id);if(c){c.visits++;c.spend+=total;c.points+=Math.floor(total/100)}}
    if(o.table_id)db.service_requests.forEach(r=>{if(r.table_id===o.table_id&&!r.done_at)r.done_at=now()});
    return {order_no:o.order_no,subtotal:o.subtotal,discount:d,total,change}},
  day_summary({p_shop}){if(!has(p_shop,OMC))throw new Error('not allowed');
    const o=db.orders.filter(x=>x.shop_id===p_shop&&x.status==='paid');const by={},hr={},items={};
    o.forEach(x=>{by[x.payment_method]=(by[x.payment_method]||0)+x.total;const h=new Date(new Date(x.paid_at).getTime()+7*3600e3).getUTCHours();hr[h]=(hr[h]||0)+x.total});
    db.order_items.filter(i=>o.some(x=>x.id===i.order_id)&&i.kitchen_status!=='void').forEach(i=>{const t=items[i.name]=items[i.name]||{name:i.name,qty:0,amount:0};t.qty+=i.qty;t.amount+=i.qty*i.unit_price});
    return {day:new Date().toISOString().slice(0,10),bills:o.length,total:o.reduce((a,x)=>a+x.total,0),discount:o.reduce((a,x)=>a+x.discount,0),by_method:by,by_hour:hr,
      top_items:Object.values(items).sort((a,b)=>b.qty-a.qty).slice(0,8),open_bills:db.orders.filter(x=>x.shop_id===p_shop&&x.status==='open').length,pending_qr:db.orders.filter(x=>x.shop_id===p_shop&&x.status==='pending').length}},
  drawer_summary({p_shop}){if(!has(p_shop,OMC))throw new Error('not allowed');const s=db.cash_sessions.find(x=>x.shop_id===p_shop&&!x.closed_at);if(!s)return {open:false};
    const cash=db.orders.filter(o=>o.shop_id===p_shop&&o.status==='paid'&&o.payment_method==='cash'&&o.paid_at>=s.opened_at).reduce((a,o)=>a+o.total,0);
    return {open:true,id:s.id,opened_at:s.opened_at,float:s.float_open,cash_sales:cash,expected:s.float_open+cash,opened_by:'สมชาย'}},
  open_drawer({p_shop,p_float}){if(db.cash_sessions.some(x=>x.shop_id===p_shop&&!x.closed_at))throw new Error('ลิ้นชักเปิดอยู่แล้ว');db.cash_sessions.push({id:id(),shop_id:p_shop,opened_by:uid(),opened_at:now(),float_open:p_float});return null},
  close_drawer({p_shop,p_counted,p_note}){const d=rpcs.drawer_summary({p_shop});if(!d.open)throw new Error('ลิ้นชักยังไม่ได้เปิด');const s=db.cash_sessions.find(x=>x.id===d.id);Object.assign(s,{closed_at:now(),closed_by:uid(),cash_counted:p_counted,note:p_note});return {...d,counted:p_counted,diff:p_counted-d.expected}},
  get_table_menu({p_token}){const t=tableByToken(p_token);if(!t)throw new Error('QR นี้ใช้ไม่ได้แล้ว');const s=db.shops.find(x=>x.id===t.shop_id);
    return {shop:{name:s.name},table:{name:t.name},categories:db.categories.filter(c=>c.shop_id===s.id).map(c=>({id:c.id,name:c.name,icon:c.icon||null})),
      option_groups:db.option_groups.filter(g=>g.shop_id===s.id),products:db.products.filter(p=>p.shop_id===s.id).map(p=>({id:p.id,category_id:p.category_id,name:p.name,price:p.price,image_path:p.image_path,is_available:p.is_available}))}},
  place_qr_order({p_token,p_items}){const t=tableByToken(p_token);if(!t)throw new Error('QR นี้ใช้ไม่ได้แล้ว');
    if(db.orders.filter(o=>o.table_id===t.id&&o.status==='pending').length>=3)throw new Error('มีออเดอร์รอร้านยืนยันอยู่แล้ว กรุณารอสักครู่');
    const rows=priceItems(t.shop_id,p_items,true);const o=newOrder(t.shop_id,{table_id:t.id,source:'qr',status:'pending'});addItems(o,rows);return {order_id:o.id,order_no:o.order_no,items:rows.length}},
  get_qr_order({p_token,p_order}){const t=tableByToken(p_token);if(!t)return null;const o=db.orders.find(x=>x.id===p_order&&x.table_id===t.id);if(!o)return null;
    const shown=o.merged_into?db.orders.find(x=>x.id===o.merged_into):o;
    return {order_no:o.order_no,status:o.merged_into?shown.status:o.status,merged:!!o.merged_into,bill_no:shown.order_no,total:shown.total,items:db.order_items.filter(i=>i.order_id===shown.id)}},
  request_service({p_token,p_kind}){const t=tableByToken(p_token);if(!t)throw new Error('QR นี้ใช้ไม่ได้แล้ว');if(!db.service_requests.some(r=>r.table_id===t.id&&r.kind===p_kind&&!r.done_at))db.service_requests.push({id:id(),shop_id:t.shop_id,table_id:t.id,kind:p_kind,created_at:now(),done_at:null});return null},
};

function storageFrom(bucket){return {
  async upload(path,blob,opts){
    load();
    const shop=path.split('/')[0];if(!OM.includes(role(shop)))return err('new row violates row-level security policy');
    if(blob.size>2097152)return err('The object exceeded the maximum allowed size');
    const buf=new Uint8Array(await blob.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=8192)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+8192));
    db.objects[path]='data:'+(opts&&opts.contentType||blob.type)+';base64,'+btoa(bin);
    db.uploads.push({path,size:blob.size,type:opts&&opts.contentType});save();return {data:{path},error:null}},
  getPublicUrl(path){return {data:{publicUrl:db.objects[path]||('https://mock.storage/'+bucket+'/'+path)}}},
  async remove(paths){paths.forEach(p=>delete db.objects[p]);save();return {data:null,error:null}},
}}

window.supabase={createClient(){
  const listeners=[];
  return {
    from:q,
    rpc:async(n,a)=>{await new Promise(r=>setTimeout(r,12));load();db.rpcLog.push(n);if(!uid()&&!ANON_RPC.includes(n))return err('JWT expired');if(!rpcs[n])return err('no rpc '+n);try{const d=rpcs[n](a||{});save();return {data:d,error:null}}catch(e){return err(e.message)}},
    storage:{from:storageFrom},
    channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){},
    auth:{
      async getSession(){load();return {data:{session:db.session},error:null}},
      async getUser(){return {data:{user:db.session&&db.session.user},error:null}},
      async signInWithPassword({email,password}){const u=db.users.find(u=>u.email===email&&u.password===password);if(!u)return err('Invalid login credentials');
        db.session={user:{id:u.id,email:u.email,user_metadata:u.user_metadata}};save();return {data:{session:db.session},error:null}},
      async signUp({email,password,options}){if(db.users.some(u=>u.email===email))return err('User already registered');
        const u={id:id(),email,password,user_metadata:(options&&options.data)||{}};db.users.push(u);db.session={user:{id:u.id,email,user_metadata:u.user_metadata}};save();return {data:{session:db.session,user:db.session.user},error:null}},
      async signOut(){db.session=null;save();listeners.forEach(f=>f('SIGNED_OUT',null));return {error:null}},
      async resetPasswordForEmail(){return {data:{},error:null}},
      async updateUser(){return {data:{},error:null}},
      onAuthStateChange(f){listeners.push(f);return {data:{subscription:{unsubscribe(){}}}}},
    }
  };
}};
})();
