(()=>{'use strict';
 const $=id=>document.getElementById(id);const C=window.MARCO_CONFIG||{};const API=String(C.apiBase||'').replace(/\/+$/,'');
 let pass=sessionStorage.getItem('marco_admin_password')||'',timer=null,onesignal=null,loadingPush=false,allRequests=[];
 const notify=(v,err=false)=>{const n=$('message');n.textContent=v;n.className='notice '+(err?'error':'success');n.hidden=!v};
 async function call(path,method='GET',body){if(!API)throw Error('Die API-Adresse fehlt in songrequest/config.js.');let r=await fetch(API+path,{method,headers:{'Content-Type':'application/json','X-Admin-Pin':pass},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});if(r.status===401)throw Error('Passwort ist nicht richtig.');let data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Serverfehler');return data}
 function show(login){$('login').classList.toggle('hidden',!login);$('dashboard').classList.toggle('hidden',login)}
 function datetime(epoch){return new Date(epoch*1000).toLocaleString('de-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
 function render(list){
   const ul=$('requests');
   ul.replaceChildren();
   // Only show unplayed requests. Finished requests stay in the database.
   const open=list.filter(req=>req.status==='new');
   if(!open.length){
     const li=document.createElement('li');
     li.className='hint';
     li.textContent='Keine offenen Musikwünsche.';
     ul.append(li);
     return;
   }
   for(const req of open){
     const li=document.createElement('li');
     li.className='request';
     const h=document.createElement('strong');
     h.textContent=req.title;
     const meta=document.createElement('div');
     meta.className='meta';
     meta.textContent=req.artist+' · '+datetime(req.created_at);
     li.append(h,meta);
     const actions=document.createElement('div');
     actions.className='actions';
     const b=document.createElement('button');
     b.type='button';
     b.className='played-button';
     b.textContent='✓ Gespielt';
     b.setAttribute('aria-label',req.title+' als gespielt markieren');
     b.addEventListener('click',async()=>{
       if(req.status!=='new')return;
       // Remove immediately; restore if the server update fails.
       req.status='played';
       render(allRequests);
       try{
         await call('/admin/requests/'+req.id,'PATCH',{status:'played'});
       }catch(e){
         req.status='new';
         render(allRequests);
         notify('Konnte den Wunsch nicht abhaken: '+e.message,true);
       }
     });
     actions.append(b);
     li.append(actions);
     ul.append(li);
   }
 }
 async function refresh(){try{const [st,v]=await Promise.all([call('/admin/status'),call('/admin/requests')]);$('enabled').checked=!!st.requestsEnabled;allRequests=v.requests||[];render(allRequests);$('poll').textContent='Aktualisiert: '+new Date().toLocaleTimeString('de-IT',{hour:'2-digit',minute:'2-digit'});notify('');}
 catch(err){notify(err.message,true);if(err.message.includes('Passwort'))logout()}}
 async function login(){pass=$('password').value.trim();if(!pass)return;try{await call('/admin/status');sessionStorage.setItem('marco_admin_password',pass);show(false);await refresh();startPoll();if(C.oneSignalAppId)initPush();}catch(e){notify(e.message,true)}}
 function startPoll(){clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)refresh()},15000)}
 function logout(){if(onesignal){onesignal.logout().catch(()=>{});onesignal=null}$('push').disabled=true;pass='';sessionStorage.removeItem('marco_admin_password');clearInterval(timer);show(true)}
 async function initPush(){
   if(onesignal||loadingPush||!C.oneSignalAppId||!pass)return;
   loadingPush=true;
   try {
     // Only the authenticated performer receives the private external ID.
     const {pushId}=await call('/admin/push-id');
     window.OneSignalDeferred=window.OneSignalDeferred||[];
     window.OneSignalDeferred.push(async (OS)=>{
       try {
         await OS.init({appId:C.oneSignalAppId,serviceWorkerPath:'/songrequest/OneSignalSDKWorker.js',serviceWorkerParam:{scope:'/songrequest/'},notifyButton:{enable:false}});
         await OS.login(pushId);
         onesignal=OS;
         $('push').disabled=false;
         $('push-hint').textContent='Aktiviere Push auf deinem Tablet. Die Benachrichtigungen werden nur an dein registriertes Gerät gesendet.';
       } catch(e) {$('push-hint').textContent='Push konnte nicht initialisiert werden: '+e.message}
     });
     if(!document.querySelector('script[data-onesignal]')){
       const script=document.createElement('script');script.src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';script.defer=true;script.dataset.onesignal='1';document.head.append(script);
     }
   } catch(e) {$('push-hint').textContent='Push-Konfiguration fehlt: '+e.message}
   finally {loadingPush=false}
 }
 $('login-button').addEventListener('click',login);$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('logout').addEventListener('click',logout);$('refresh').addEventListener('click',refresh);
 $('enabled').addEventListener('change',async e=>{const checked=e.target.checked;try{await call('/admin/status','PUT',{requestsEnabled:checked});notify(checked?'Musikwünsche sind jetzt aktiviert.':'Musikwünsche sind pausiert.')}catch(err){e.target.checked=!checked;notify(err.message,true)}});
 $('push').addEventListener('click',async()=>{try{if(!onesignal)throw Error('OneSignal ist noch nicht verbunden.');await onesignal.Notifications.requestPermission();notify('Benachrichtigungseinstellungen geprüft.')}catch(e){notify(e.message,true)}});
 if(pass){show(false);refresh().then(()=>startPoll());if(C.oneSignalAppId)initPush()}else show(true);
})();
