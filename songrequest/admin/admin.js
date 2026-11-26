(()=>{'use strict';
 const $=id=>document.getElementById(id);const C=window.MARCO_CONFIG||{};const API=String(C.apiBase||'').replace(/\/+$/,'');
 let pass=sessionStorage.getItem('marco_admin_password')||'',timer=null,allRequests=[],refreshPromise=null;
 const REFRESH_MS=10000;
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
 async function refresh(){
   // Prevent multiple simultaneous refreshes (e.g. a timer and a focus event).
   if(refreshPromise)return refreshPromise;
   refreshPromise=(async()=>{
     try{
       const [st,v]=await Promise.all([call('/admin/status'),call('/admin/requests')]);
       $('enabled').checked=!!st.requestsEnabled;
       allRequests=v.requests||[];
       render(allRequests);
       $('poll').textContent='Auto alle 10 s · Aktualisiert: '+new Date().toLocaleTimeString('de-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
       notify('');
     }catch(err){
       $('poll').textContent='Auto alle 10 s · Verbindung prüfen';
       notify(err.message,true);
       if(err.message.includes('Passwort'))logout();
     }
   })();
   try{return await refreshPromise;}finally{refreshPromise=null;}
 }
 async function login(){pass=$('password').value.trim();if(!pass)return;try{await call('/admin/status');sessionStorage.setItem('marco_admin_password',pass);show(false);await refresh();startPoll();}catch(e){notify(e.message,true)}}
 function refreshIfVisible(){
   if(pass&&!document.hidden&&!$('dashboard').classList.contains('hidden'))void refresh();
 }
 function startPoll(){
   clearInterval(timer);
   timer=setInterval(refreshIfVisible,REFRESH_MS);
 }
 // Android may pause background tabs. Load the newest wishes immediately on return.
 document.addEventListener('visibilitychange',refreshIfVisible);
 window.addEventListener('focus',refreshIfVisible);
 function logout(){pass='';sessionStorage.removeItem('marco_admin_password');clearInterval(timer);show(true)}
 $('login-button').addEventListener('click',login);$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('logout').addEventListener('click',logout);$('refresh').addEventListener('click',refresh);
 $('enabled').addEventListener('change',async e=>{const checked=e.target.checked;try{await call('/admin/status','PUT',{requestsEnabled:checked});notify(checked?'Musikwünsche sind jetzt aktiviert.':'Musikwünsche sind pausiert.')}catch(err){e.target.checked=!checked;notify(err.message,true)}});
 if(pass){show(false);refresh().then(()=>startPoll())}else show(true);
})();
