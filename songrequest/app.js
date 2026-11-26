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
    limited:'Too many requests from this device. Please try again later.',duplicate:'This song has already been requested.',success:'Thank you! Your song request has been received.',
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
  function openModal(s){if(!canRequest)return;selected=s;$('modal-song').textContent=s.title;$('modal-artist').textContent=s.artist;modalFeedback('');$('modal').hidden=false;$('send').focus()}
  function closeModal(){if(sending)return;$('modal').hidden=true;selected=null;modalFeedback('')}
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
  // Random per-browser identifier for abuse protection; no name or login required.
  // Several guests on the same hotel Wi-Fi can request songs independently.
  let sessionVisitorId=null;
  function generateVisitorId(){
    // Some mobile browsers / in-app browsers do not support crypto.randomUUID().
    // UUID format is validated by the Worker, so always return a valid v4 UUID.
    if(typeof crypto!=='undefined' && typeof crypto.randomUUID==='function'){
      return crypto.randomUUID();
    }
    const bytes=new Uint8Array(16);
    if(typeof crypto!=='undefined' && typeof crypto.getRandomValues==='function'){
      crypto.getRandomValues(bytes);
    }else{
      // Last-resort compatibility fallback; this identifier is not a credential.
      for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
    }
    bytes[6]=(bytes[6]&15)|64; // UUID version 4
    bytes[8]=(bytes[8]&63)|128; // UUID variant
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }
  function visitorId(){
    if(sessionVisitorId)return sessionVisitorId;
    const key='marco_request_visitor_id';
    const valid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    try{
      let id=localStorage.getItem(key);
      if(!id||!valid.test(id)){
        id=generateVisitorId();
        localStorage.setItem(key,id);
      }
      sessionVisitorId=id;
    }catch(_){
      // Private browsing can block localStorage; retain the ID for this tab.
      sessionVisitorId=generateVisitorId();
    }
    return sessionVisitorId;
  }
  function modalFeedback(message){
    const node=$('modal-feedback');
    node.textContent=message;
    node.hidden=!message;
  }
  function waitLabel(seconds){
    const minutes=Math.max(1,Math.ceil(Number(seconds||0)/60));
    return minutes+' minute'+(minutes===1?'':'s');
  }
  function readableError(response,result){
    if(result.code==='song_recently_played')
      return 'This song was just played. Please choose another song or try again in '+waitLabel(result.retryAfterSeconds)+'.';
    if(result.code==='guest_cooldown')
      return 'Thank you! You can send another song request in '+waitLabel(result.retryAfterSeconds)+'.';
    if(result.code==='same_song_pending')return text.duplicate;
    if(response.status===429)return text.limited;
    return text.sendError;
  }
  async function sendRequest(){
    if(!selected||!api||sending)return;
    sending=true;$('send').disabled=true;$('send').textContent='Sending…';modalFeedback('');
    let success=false;
    try{
      const response=await fetch(api+'/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({songId:selected.id,visitorId:visitorId()})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok){
        modalFeedback(readableError(response,result));
      }else{
        success=true;
        notice(text.success,'success');
      }
    }catch(error){
      console.error('Song request failed:',error);
      modalFeedback('Could not connect to the request service. Please try Chrome or Safari, or check your internet connection.');
    }
    finally{
      sending=false;$('send').disabled=false;$('send').textContent='Send request';
      if(success)closeModal();
    }
  }
  $('search').addEventListener('input',render);
  $('cancel').addEventListener('click',closeModal);
  $('send').addEventListener('click',sendRequest);
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
  load();
})();
