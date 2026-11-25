(()=>{'use strict';
  // Public visitor page. Backend integration remains optional until configured.
  const config=window.MARCO_CONFIG||{};
  const api=String(config.apiBase||'').replace(/\/+$/,'');
  const $=id=>document.getElementById(id);
  const text={
    live:'Requests open',closed:'Requests paused',setup:'Requests not yet active',offline:'Service unavailable',
    loading:'Loading songs…',none:'No matching songs found.',browse:'Song requests will be available here soon. Feel free to browse the repertoire.',
    stale:'The live list is temporarily unavailable. Showing the saved repertoire.',
    failed:'The song list could not be loaded. Please reload the page.',
    limited:'Please wait a little before your next request.',success:'Thank you! Your song request has been received.',
    sendError:'Could not send your request. Please try again.'
  };
  let songs=[],canRequest=false,selected=null,sending=false,statusCode='setup';
  document.documentElement.lang='en';
  function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en').replace(/[’‘]/g,"'")}
  function notice(message,kind=''){
    const el=$('notice');if(!el)return;el.textContent=message;el.className='notice'+(kind?' '+kind:'');el.hidden=!message;
  }
  function status(code){statusCode=code;$('status').textContent=text[code]||text.offline;$('status-dot').classList.toggle('live',code==='live')}
  function render(){
    const query=normalize($('search').value.trim());
    const shown=songs.filter(s=>s.available!==false&&(!query||normalize(s.title+' '+s.artist).includes(query)))
      .sort((a,b)=>a.title.localeCompare(b.title,'en',{sensitivity:'base',numeric:true}));
    $('count').textContent=shown.length+' songs';const list=$('songs');list.replaceChildren();
    if(!shown.length){const empty=document.createElement('li');empty.className='no-results';empty.textContent=songs.length?text.none:text.loading;list.appendChild(empty);return}
    for(const s of shown){
      const li=document.createElement('li');li.className='song';
      const details=document.createElement('div');const title=document.createElement('div');title.className='song-title';title.textContent=s.title;
      const artist=document.createElement('div');artist.className='song-artist';artist.textContent=s.artist;details.append(title,artist);
      const button=document.createElement('button');button.type='button';button.className='wish';button.textContent='Request';
      button.disabled=!canRequest;button.setAttribute('aria-label','Request: '+s.title+' – '+s.artist);
      button.addEventListener('click',()=>openModal(s));li.append(details,button);list.appendChild(li);
    }
  }
  function openModal(s){if(!canRequest)return;selected=s;$('modal-song').textContent=s.title;$('modal-artist').textContent=s.artist;$('modal').hidden=false;$('send').focus()}
  function closeModal(){if(sending)return;$('modal').hidden=true;selected=null}
  async function getJson(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);return response.json()}
  async function load(){
    let liveFailure=false;
    if(api){
      try{
        const values=await getJson(api+'/songs');songs=Array.isArray(values)?values:(values.songs||[]);
        const current=await getJson(api+'/status');canRequest=Boolean(current.requestsEnabled);status(canRequest?'live':'closed');
      }catch(error){liveFailure=true;canRequest=false;status('offline')}
    }else{canRequest=false;status('setup')}
    if(!api||liveFailure){
      try{songs=await getJson('./songs.json?v=20261125-fix3');}
      catch(error){songs=[];notice(text.failed,'error');$('count').textContent='Song list unavailable';return}
    }
    if(liveFailure)notice(text.stale,'error');
    else if(!api)notice(text.browse);
    else notice('');
    render();
  }
  function getLastRequest(){try{return Number(localStorage.getItem('marco_last_wish')||0)}catch(_){return 0}}
  function saveLastRequest(){try{localStorage.setItem('marco_last_wish',String(Date.now()))}catch(_){}}
  async function sendRequest(){
    if(!selected||!api||sending)return;
    if(Date.now()-getLastRequest()<90000){notice(text.limited,'error');closeModal();return}
    sending=true;$('send').disabled=true;$('send').textContent='Sending…';
    try{
      const response=await fetch(api+'/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({songId:selected.id})});
      const result=await response.json().catch(()=>({}));
      if(response.status===429)throw Error('rate');if(!response.ok||!result.ok)throw Error('failed');
      saveLastRequest();notice(text.success,'success');
    }catch(error){notice(error.message==='rate'?text.limited:text.sendError,'error')}
    finally{sending=false;$('send').disabled=false;$('send').textContent='Send request';closeModal()}
  }
  $('search').addEventListener('input',render);
  $('cancel').addEventListener('click',closeModal);
  $('send').addEventListener('click',sendRequest);
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
  load();
})();
