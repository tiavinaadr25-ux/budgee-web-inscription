/* Web Push settings. Requests for permission are made only after an explicit click. */
(() => {
 'use strict';
 if(window.KlooPush)return;
 const defaults={eveningReminder:true,budgetAlerts:true,goalReached:true,monthlyReport:false};
 let user=null,client=null,config=null,subscription=null,active=false,busy=false,prefs={...defaults},hour=21,trigger=null,inertRoot=null,previousInert=false;
 const ownerKey='kloo-web-push-owner';
 const timezone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const supported=()=>window.isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
 const encode=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
 const host=document.createElement('div');host.id='kloo-push-settings';const shadow=host.attachShadow({mode:'open'});
 shadow.innerHTML=`<style>
 :host{font:15px/1.55 system-ui,sans-serif;color:#18202d}*{box-sizing:border-box}.overlay{position:fixed;inset:0;background:#16202d66;z-index:2147483646;display:none;padding:20px;align-items:center;justify-content:center}.overlay.open{display:flex}.dialog{width:min(100%,500px);max-height:90dvh;overflow:auto;background:#fff;border-radius:22px;padding:24px;box-shadow:0 20px 70px #16202d33}h2{font-size:23px;line-height:1.2;margin:0}p{margin:10px 0;color:#566174}header{display:flex;justify-content:space-between;align-items:center;gap:12px}.close{font-size:26px;padding:6px 12px;background:#fff;color:#566174;border:0}.status{padding:13px 15px;border-radius:12px;background:#eef4fc;margin:18px 0;color:#244e82}.row{display:flex;align-items:center;gap:14px;padding:16px 0;border-bottom:1px solid #e7ebf0}.row label{flex:1;cursor:pointer}.row strong{display:block;font-weight:600}.row small{display:block;color:#647084;font-size:12px;margin-top:3px}.row input{width:23px;height:23px;accent-color:#2558a0;flex-shrink:0}.time{display:flex;align-items:center;gap:12px;margin:18px 0;flex-wrap:wrap}select{font:inherit;padding:9px;border:1px solid #cdd7e5;border-radius:9px;background:white}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}button{font:inherit;cursor:pointer;border:0;border-radius:11px;padding:13px 16px}.primary{background:#2558a0;color:white;flex:1}.secondary{background:#eef2f7;color:#254c7c}.danger{background:transparent;color:#9c3030;padding-left:0}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #c97b0a;outline-offset:3px}.privacy{font-size:12px;line-height:1.65;margin-top:18px}#error{color:#a82e2e;margin-top:12px}
 </style><div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="push-title" tabindex="-1"><header><h2 id="push-title">Notifications</h2><button class="close" aria-label="Fermer">×</button></header><p>Reçois les rappels Kloo même quand l’app est fermée.</p><div class="status" role="status" aria-live="polite">Vérification de cet appareil…</div><div id="preferences">
 <div class="row"><label for="eveningReminder"><strong>Rappel du soir</strong><small>Un petit rappel pour noter tes dépenses.</small></label><input id="eveningReminder" type="checkbox"></div>
 <div class="row"><label for="budgetAlerts"><strong>Alertes budget</strong><small>Lorsqu’une enveloppe atteint 80 % ou 100 %.</small></label><input id="budgetAlerts" type="checkbox"></div>
 <div class="row"><label for="goalReached"><strong>Objectif d’épargne atteint</strong><small>Un encouragement quand tu atteins ta cible.</small></label><input id="goalReached" type="checkbox"></div>
 <div class="row"><label for="monthlyReport"><strong>Point mensuel</strong><small>Le premier du mois, vers 9 h, pour préparer ton budget.</small></label><input id="monthlyReport" type="checkbox"></div>
 <div class="time"><label for="hour">Rappel du soir vers</label><select id="hour" aria-label="Heure du rappel du soir"></select></div><p id="zone" class="privacy"></p></div>
 <div id="error" role="alert"></div><div class="actions"><button id="enable" class="primary">Activer sur cet appareil</button><button id="save" class="primary">Enregistrer les réglages</button><button id="test" class="secondary">Envoyer un test</button></div><button id="disable" class="danger">Désactiver sur cet appareil</button><p class="privacy">Ces réglages s’appliquent à cet appareil. Aucun montant ni nom de dépense n’est affiché sur l’écran verrouillé. Les horaires sont indicatifs : la connexion et les réglages du téléphone peuvent retarder les notifications.</p></section></div>`;
 document.body.appendChild(host);
 const $=selector=>shadow.querySelector(selector),overlay=$('.overlay'),dialog=$('.dialog');
 for(let h=0;h<24;h++){const option=document.createElement('option');option.value=String(h);option.textContent=String(h).padStart(2,'0')+' h';$('#hour').appendChild(option)}
 for(const key of Object.keys(defaults))$('#'+key).onchange=e=>{prefs[key]=e.target.checked};
 $('#hour').onchange=e=>{hour=Number(e.target.value)};
 function status(message){$('.status').textContent=message}
 function error(message){$('#error').textContent=message}
 function draw(){
  for(const key of Object.keys(defaults)){$('#'+key).checked=!!prefs[key];$('#'+key).disabled=busy}
  $('#hour').value=String(hour);$('#hour').disabled=busy;
  $('#zone').textContent='Heure locale : '+timezone()+'. Les alertes sont vérifiées environ toutes les cinq minutes.';
  $('#enable').hidden=active;$('#enable').disabled=busy||!config?.available||!supported()||(ios()&&!standalone())||Notification.permission==='denied';
  $('#save').hidden=!active;$('#test').hidden=!active;$('#disable').hidden=!active;
  $('#save').disabled=busy;$('#test').disabled=busy;$('#disable').disabled=busy;
 }
 async function request(action,extra={},c=client,uid=user,timeout=12000){
  const session=(await c.auth.getSession()).data.session;
  if(!session?.access_token||session.user.id!==uid)throw Error('Reconnecte-toi à Kloo pour gérer les notifications de ce compte.');
  const response=await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(timeout)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Les notifications sont temporairement indisponibles.');return result;
 }
 async function registration(){
  const reg=await navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'});
  if(reg.active)return reg;
  await new Promise((resolve,reject)=>{const worker=reg.installing||reg.waiting;if(!worker){reject(Error('Le service de notifications démarre. Actualise Kloo puis réessaie.'));return}
   const timer=setTimeout(()=>reject(Error('Le service de notifications met trop de temps à démarrer. Réessaie.')),10000);
   worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve()}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Actualise Kloo puis réessaie.'))}});
  });return reg;
 }
 function writeOwner(value){try{if(value)localStorage.setItem(ownerKey,value);else localStorage.removeItem(ownerKey)}catch{}}
 function close(){if(busy)return;overlay.classList.remove('open');if(inertRoot){inertRoot.inert=previousInert;inertRoot=null}trigger?.focus?.()}
 $('.close').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};
 shadow.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){
  const nodes=Array.from(shadow.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')).filter(n=>!n.hidden&&n.offsetParent!==null);
  const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&shadow.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&shadow.activeElement===last){e.preventDefault();first?.focus()}
 }});
 async function operate(fn){if(busy)return;busy=true;error('');draw();try{await fn()}catch(e){error(e.message||'Impossible de modifier les notifications. Réessaie.')}finally{busy=false;draw()}}
 $('#enable').onclick=()=>{
  // Keep this permission request synchronous with the user's action (required on iOS).
  const permission=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
  operate(async()=>{
   if(await permission!=='granted'){status('Notifications non autorisées. Tu pourras changer ce choix dans les réglages de ton navigateur ou de ton téléphone.');return}
   const reg=await registration();subscription=await reg.pushManager.getSubscription();
   if(subscription?.options.applicationServerKey&&encode(subscription.options.applicationServerKey)!==config.publicKey){await subscription.unsubscribe();subscription=null}
   if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.publicKey)});
   try{await request('subscribe',{subscription:subscription.toJSON(),preferences:prefs,reminderHour:hour,timezone:timezone()})}
   catch(e){await subscription.unsubscribe();subscription=null;throw e}
   active=true;writeOwner(user);status('Notifications activées sur cet appareil. Tu peux envoyer un test pour vérifier leur réception.');
  });
 };
 $('#save').onclick=()=>operate(async()=>{await request('preferences',{endpoint:subscription.endpoint,preferences:prefs,reminderHour:hour,timezone:timezone()});status('Tes réglages ont été enregistrés pour cet appareil.')});
 $('#test').onclick=()=>operate(async()=>{await request('test',{endpoint:subscription.endpoint});status('Le test a été envoyé au service de notifications. Vérifie les notifications de ton appareil.')});
 $('#disable').onclick=()=>operate(async()=>{await request('unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();subscription=null;active=false;writeOwner(null);status('Notifications désactivées sur cet appareil.')});
 async function syncAccount(uid,c){
  if(!supported())return;let owner;try{owner=localStorage.getItem(ownerKey)}catch{return}
  if(!owner)return;
  if(owner!==uid||Notification.permission==='denied'){
   const reg=await navigator.serviceWorker.getRegistration('/app/'),sub=await reg?.pushManager.getSubscription();
   if(sub){if(owner===uid)await request('unsubscribe',{endpoint:sub.endpoint},c,uid,2000).catch(()=>{});await sub.unsubscribe()}
   writeOwner(null);
  }
 }
 async function detach(uid,c){
  close();if(!('serviceWorker'in navigator))return;
  const reg=await navigator.serviceWorker.getRegistration('/app/'),sub=await reg?.pushManager.getSubscription();
  if(sub){await request('unsubscribe',{endpoint:sub.endpoint},c,uid,2000).catch(()=>{});await sub.unsubscribe()}
  writeOwner(null);active=false;subscription=null;
 }
 async function open(uid,c){
  user=uid;client=c;config=null;active=false;subscription=null;prefs={...defaults};hour=21;error('');status('Vérification de cet appareil…');
  trigger=document.activeElement;inertRoot=document.getElementById('root');if(inertRoot){previousInert=inertRoot.inert;inertRoot.inert=true}
  overlay.classList.add('open');dialog.focus();draw();
  try{
   if(ios()&&!standalone()){status('Sur iPhone ou iPad, ajoute d’abord Kloo à l’écran d’accueil depuis le menu Partager, puis ouvre Kloo depuis son icône pour activer les notifications.');return}
   if(!supported()){status('Ce navigateur ne permet pas les notifications Web Push. Ouvre Kloo dans un navigateur compatible, puis réessaie.');return}
   config=await(await fetch('/api/push',{cache:'no-store'})).json();
   if(!config.available){status('Les notifications ne sont pas encore disponibles. Réessaie après la mise à jour du service.');return}
   await syncAccount(uid,c);
   const reg=await registration();subscription=await reg.pushManager.getSubscription();
   if(subscription&&Notification.permission==='granted'){
    const saved=await request('status',{endpoint:subscription.endpoint});
    if(saved.subscribed&&(!subscription.options.applicationServerKey||encode(subscription.options.applicationServerKey)===config.publicKey)){active=true;prefs={...defaults,...saved.preferences};hour=saved.reminderHour;writeOwner(user)}
   }
   status(active?'Notifications actives sur cet appareil. Choisis les rappels qui te sont utiles.':Notification.permission==='denied'?'Les notifications sont bloquées. Autorise-les dans les réglages du navigateur ou du téléphone, puis rouvre Kloo.':'Les notifications sont désactivées. Active-les uniquement si tu souhaites recevoir les rappels Kloo.');
  }catch(e){error(e.message||'Impossible de vérifier les notifications. Réessaie.')}finally{draw()}
 }
 window.KlooPush={open,syncAccount,detach};
})();
