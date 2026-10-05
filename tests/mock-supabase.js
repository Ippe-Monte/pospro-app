// Browser-side fake Supabase for UI tests (replaces js/vendor/supabase-*.js when the test runs).
// Stateful; persists to localStorage so a page reload keeps the data (used to prove photos survive refresh).
(function(){
const KEY='__mockdb';
const seed=()=>({
  users:[{id:'u-owner',email:'owner@shop.test',password:'secret123',user_metadata:{full_name:'สมชาย'}},
         {id:'u-cash',email:'cash@shop.test',password:'secret123',user_metadata:{full_name:'สมหญิง'}}],
  session:null,
  shops:[],shop_members:[],stations:[],categories:[],option_groups:[],products:[],dining_tables:[],audit_log:[],
  objects:{}, uploads:[]
});
let db;try{db=JSON.parse(localStorage.getItem(KEY))||seed()}catch(e){db=seed()}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){console.warn('mock save',e)}};
window.__DB=db;window.__mockSave=save;window.__mockReset=()=>{localStorage.removeItem(KEY)};
const uid=()=>db.session&&db.session.user.id;
const id=()=>'id-'+Math.random().toString(36).slice(2,10);
const role=(shop)=>{const m=db.shop_members.find(m=>m.shop_id===shop&&m.user_id===uid()&&m.status==='active');return m&&m.role};
const err=m=>({data:null,error:{message:m}});
const WRITE_ROLES={products:['owner','manager'],categories:['owner','manager'],option_groups:['owner','manager'],stations:['owner','manager'],dining_tables:['owner','manager'],shops:['owner','manager'],audit_log:['owner','manager','cashier','kitchen']};

function q(table){
  let filters=[],ord=[],op='select',payload=null,single=false,maybe=false,head=false,count=null,sel='*';
  const api={
    select(s,o){sel=s||'*';if(o&&o.head)head=true;if(o&&o.count)count=o.count;return api},
    eq(c,v){filters.push(r=>r[c]===v);return api},
    not(c,o,v){filters.push(r=>o==='is'&&v===null?r[c]!=null:true);return api},
    order(c,o){ord.push([c,!o||o.ascending!==false]);return api},
    single(){single=true;return api},maybeSingle(){maybe=true;return api},
    insert(p){op='insert';payload=p;return api},update(p){op='update';payload=p;return api},delete(){op='delete';return api},
    then(res,rej){Promise.resolve().then(()=>new Promise(r=>setTimeout(r,15))).then(()=>{try{res(run())}catch(e){rej(e)}})}
  };
  function visible(r){
    if(table==='shop_members')return r.user_id===uid()||!!role(r.shop_id);
    if(table==='shops')return !!role(r.id);
    return !!role(r.shop_id);
  }
  function run(){
    if(!uid())return err('JWT expired');
    const T=db[table]=db[table]||[];
    if(op==='insert'){
      const rows=(Array.isArray(payload)?payload:[payload]).map(x=>({id:id(),created_at:new Date().toISOString(),sort:0,...x}));
      for(const r of rows){if(!(WRITE_ROLES[table]||[]).includes(role(r.shop_id)))return err('new row violates row-level security policy');
        if(table==='categories'&&T.some(c=>c.shop_id===r.shop_id&&c.name===r.name))return err('duplicate key value violates unique constraint "categories_shop_id_name_key"');}
      rows.forEach(r=>T.push(r));save();return {data:single?rows[0]:rows,error:null};
    }
    let rows=T.filter(visible).filter(r=>filters.every(f=>f(r)));
    if(op==='update'){
      for(const r of rows){const sh=table==='shops'?r.id:r.shop_id;if(!(WRITE_ROLES[table]||[]).includes(role(sh)))return {data:[],error:null}}
      rows.forEach(r=>Object.assign(r,payload,{updated_at:new Date().toISOString()}));save();return {data:rows,error:null};
    }
    if(op==='delete'){
      for(const r of rows){if(!(WRITE_ROLES[table]||[]).includes(role(r.shop_id)))return {data:null,error:null}}
      db[table]=T.filter(r=>!rows.includes(r));
      if(table==='categories'){const ids=rows.map(r=>r.id);db.products.forEach(p=>{if(ids.includes(p.category_id))p.category_id=null});db.option_groups=db.option_groups.filter(g=>!ids.includes(g.category_id))}
      save();return {data:null,error:null};
    }
    for(const [c,asc] of ord.slice().reverse())rows=rows.slice().sort((a,b)=>(a[c]>b[c]?1:a[c]<b[c]?-1:0)*(asc?1:-1));
    if(table==='shop_members'&&/shops\(/.test(sel))rows=rows.map(m=>({...m,shops:m.status==='active'?db.shops.find(s=>s.id===m.shop_id)||null:null}));
    if(head)return {data:null,count:rows.length,error:null};
    if(single){if(rows.length!==1)return err('JSON object requested, multiple (or no) rows returned');return {data:rows[0],error:null}}
    if(maybe)return {data:rows[0]||null,error:null};
    return {data:JSON.parse(JSON.stringify(rows)),error:null};
  }
  return api;
}

const rpcs={
  create_shop({p_name,p_display_name}){const s={id:id(),name:p_name,join_code:'7F3A9C21',footer_note:'ขอบคุณที่ใช้บริการ',created_by:uid()};db.shops.push(s);
    db.shop_members.push({shop_id:s.id,user_id:uid(),role:'owner',status:'active',display_name:p_display_name,created_at:new Date().toISOString()});
    db.stations.push({id:id(),shop_id:s.id,name:'ครัว',sort:0});for(let i=1;i<=6;i++)db.dining_tables.push({id:id(),shop_id:s.id,name:'โต๊ะ '+i,sort:i,qr_enabled:true});return s.id},
  join_shop({p_code,p_display_name}){const s=db.shops.find(s=>s.join_code===p_code);if(!s)throw new Error('ไม่พบร้านจากรหัสนี้');
    if(!db.shop_members.some(m=>m.shop_id===s.id&&m.user_id===uid()))db.shop_members.push({shop_id:s.id,user_id:uid(),role:'cashier',status:'pending',display_name:p_display_name,created_at:new Date().toISOString()});
    return {shop_id:s.id,shop_name:s.name,status:'pending'}},
  set_member({p_shop,p_user,p_role,p_status,p_station}){if(role(p_shop)!=='owner')throw new Error('เฉพาะเจ้าของร้าน');
    const m=db.shop_members.find(m=>m.shop_id===p_shop&&m.user_id===p_user);Object.assign(m,{role:p_role,status:p_status,station_id:p_station});return null},
};

function storageFrom(bucket){return {
  async upload(path,blob,opts){
    const shop=path.split('/')[0];if(!['owner','manager'].includes(role(shop)))return err('new row violates row-level security policy');
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
    rpc:async(n,a)=>{await new Promise(r=>setTimeout(r,15));if(!uid())return err('JWT expired');try{const d=rpcs[n](a||{});save();return {data:d,error:null}}catch(e){return err(e.message)}},
    storage:{from:storageFrom},
    auth:{
      async getSession(){return {data:{session:db.session},error:null}},
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
