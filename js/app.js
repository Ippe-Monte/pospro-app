// =====================================================================
// app.js — boot: config -> session -> shop. Loaded last.
// =====================================================================
async function boot(){
  if(!initSupabase())return renderConfigMissing();
  const isRecovery=/type=recovery/.test(location.hash)||location.hash==='#reset';
  sb.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY')renderSetNewPassword();
    if(event==='SIGNED_OUT'&&S.user){S.user=null;renderLogin()}
  });
  const {data}=await sb.auth.getSession();
  if(isRecovery&&data.session)return renderSetNewPassword();
  if(!data.session)return renderLogin();
  await afterLogin();
}

if('serviceWorker' in navigator&&location.protocol!=='file:'){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.warn('sw',e)));
}
boot().catch(e=>{console.error(e);renderLogin(friendlyError(e))});
