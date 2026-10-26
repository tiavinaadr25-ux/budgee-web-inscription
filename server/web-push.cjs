const { createHash, createECDH } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const defaults = { eveningReminder:true, budgetAlerts:true, goalReached:true, monthlyReport:false };
function fail(message,status=400) { const error=new Error(message);error.status=status;throw error; }
function configuration() {
 const publicKey=process.env.WEB_PUSH_PUBLIC_KEY?.trim(),privateKey=process.env.WEB_PUSH_PRIVATE_KEY?.trim();
 const subject=process.env.WEB_PUSH_SUBJECT?.trim(); let ready=false;
 try { const ecdh=createECDH('prime256v1');ecdh.setPrivateKey(Buffer.from(privateKey||'','base64url'));
  ready=ecdh.getPublicKey().toString('base64url')===publicKey && /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject||'');
 } catch {}
 return {ready,publicKey,privateKey,subject};
}
function database() {
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)fail('Le service de notifications est temporairement indisponible.',503);
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function endpointHash(endpoint) { return createHash('sha256').update(endpoint).digest('hex'); }
function validateEndpoint(value) {
 if(typeof value!=='string'||value.length>2048)fail('Abonnement de notifications invalide.');
 let url;try{url=new URL(value)}catch{fail('Adresse de notifications invalide.')}
 const host=url.hostname;
 const allowed=host==='fcm.googleapis.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host.endsWith('.notify.windows.com');
 if(url.protocol!=='https:'||!allowed||url.username||url.password||url.port||url.hash)fail('Ce service de notifications n’est pas pris en charge sur cet appareil.');
 return url.href;
}
function normalizePreferences(value) {
 return Object.fromEntries(Object.keys(defaults).map(key=>[key,typeof value?.[key]==='boolean'?value[key]:defaults[key]]));
}
function deviceSettings(input={}) {
 const timezone=typeof input.timezone==='string'?input.timezone:'UTC';
 try{new Intl.DateTimeFormat('fr-FR',{timeZone:timezone}).format()}catch{fail('Fuseau horaire invalide.')}
 const hour=input.reminderHour??21;if(!Number.isInteger(hour)||hour<0||hour>23)fail('Heure du rappel invalide.');
 return {preferences:normalizePreferences(input.preferences),timezone,reminder_hour:hour};
}
function validateSubscription(input) {
 const endpoint=validateEndpoint(input?.endpoint),p256dh=input?.keys?.p256dh,auth=input?.keys?.auth;
 if(typeof p256dh!=='string'||typeof auth!=='string'||!/^[\w-]+={0,2}$/.test(p256dh)||!/^[\w-]+={0,2}$/.test(auth)||Buffer.from(p256dh,'base64url').length!==65||Buffer.from(p256dh,'base64url')[0]!==4||Buffer.from(auth,'base64url').length!==16)fail('Clés de notifications invalides.');
 return {endpoint,endpoint_hash:endpointHash(endpoint),p256dh,auth};
}
async function publicConfiguration(admin=database()) {
 const c=configuration();if(!c.ready)return {available:false};
 const check=await admin.from('web_push_subscriptions').select('id',{head:true,count:'exact'}).limit(1);
 return check.error?{available:false}:{available:true,publicKey:c.publicKey};
}
async function subscriptionAction(userId,input,admin=database()) {
 const action=input?.action;
 if(!['status','subscribe','preferences','unsubscribe','test'].includes(action))fail('Action invalide.');
 const endpoint=validateEndpoint(input.subscription?.endpoint||input.endpoint),hash=endpointHash(endpoint);
 if(action==='subscribe') {
  if(!configuration().ready)fail('Les notifications ne sont pas encore disponibles.',503);
  const record=validateSubscription(input.subscription),settings=deviceSettings(input);
  const count=await admin.from('web_push_subscriptions').select('id',{head:true,count:'exact'}).eq('user_id',userId);
  if(count.error)fail('Le stockage des notifications n’est pas encore disponible.',503);
  const existing=await admin.from('web_push_subscriptions').select('id').eq('endpoint_hash',hash).eq('user_id',userId).maybeSingle();
  if(existing.error)fail('Impossible de vérifier cet appareil.',503);
  if((count.count||0)>=10&&!existing.data)fail('Dix appareils sont déjà activés pour ce compte. Désactive un ancien appareil.',409);
  // Endpoints are unguessable capabilities. Rebinding the same browser must not retain another account's preferences or deliveries.
  const old=await admin.from('web_push_subscriptions').select('id,user_id').eq('endpoint_hash',hash).maybeSingle();
  if(old.error)fail('Impossible de vérifier cet appareil.',503);
  if(old.data&&old.data.user_id!==userId){const removed=await admin.from('web_push_subscriptions').delete().eq('id',old.data.id);if(removed.error)fail('Impossible de changer le compte de cet appareil.',503)}
  const saved=await admin.from('web_push_subscriptions').upsert({...record,...settings,user_id:userId,enabled:true,updated_at:new Date().toISOString()},{onConflict:'endpoint_hash'});
  if(saved.error)fail('Impossible d’activer les notifications. Réessaie.',503);
  return {subscribed:true,preferences:settings.preferences,timezone:settings.timezone,reminderHour:settings.reminder_hour};
 }
 const result=await admin.from('web_push_subscriptions').select('*').eq('endpoint_hash',hash).eq('user_id',userId).maybeSingle();
 if(result.error)fail('Impossible de lire tes notifications.',503);
 const row=result.data;
 if(action==='status')return row?{subscribed:row.enabled,preferences:row.preferences,timezone:row.timezone,reminderHour:row.reminder_hour}:{subscribed:false,preferences:defaults,reminderHour:21};
 if(action==='unsubscribe') {const removed=await admin.from('web_push_subscriptions').delete().eq('endpoint_hash',hash).eq('user_id',userId);if(removed.error)fail('Impossible de désactiver les notifications.',503);return {subscribed:false}}
 if(!row)fail('Active d’abord les notifications sur cet appareil.',409);
 if(action==='preferences') {
  const settings=deviceSettings(input);const saved=await admin.from('web_push_subscriptions').update({...settings,updated_at:new Date().toISOString()}).eq('id',row.id).eq('user_id',userId);
  if(saved.error)fail('Impossible d’enregistrer les réglages.',503);
  return {subscribed:true,preferences:settings.preferences,timezone:settings.timezone,reminderHour:settings.reminder_hour};
 }
 const sent=await deliver(admin,row,{key:'test:'+Math.floor(Date.now()/60000),title:'Les notifications Kloo sont activées',body:'Ce message confirme que cet appareil peut recevoir les rappels Kloo.'});
 if(!sent)fail('Un test a déjà été envoyé cette minute, ou cet abonnement a expiré. Attends un instant puis réessaie.',429);
 return {sent:true};
}
async function deliver(admin,row,event,transport=webpush.sendNotification.bind(webpush)) {
 const c=configuration();if(!c.ready)return false;
 validateEndpoint(row.endpoint);
 const claim=await admin.rpc('claim_web_push_delivery',{p_subscription_id:row.id,p_event_key:event.key});
 if(claim.error)throw Error('Push delivery ledger unavailable');if(!claim.data)return false;
 try {
  await transport({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify({title:event.title,body:event.body,url:'/app/',tag:'kloo-'+endpointHash(event.key).slice(0,24)}),
   {vapidDetails:{subject:c.subject,publicKey:c.publicKey,privateKey:c.privateKey},TTL:event.key.startsWith('test:')?300:3600,urgency:'normal',timeout:4000});
  const marked=await admin.from('web_push_deliveries').update({status:'sent'}).eq('subscription_id',row.id).eq('event_key',event.key);if(marked.error)throw Error('Push delivery persistence unavailable');
  return true;
 } catch(error) {
  if([404,410].includes(error.statusCode)){await admin.from('web_push_subscriptions').delete().eq('id',row.id);return false}
  await admin.from('web_push_deliveries').update({status:'failed',next_attempt_at:new Date(Date.now()+5*60000).toISOString()}).eq('subscription_id',row.id).eq('event_key',event.key);
  throw Error('Push delivery failed'); // Do not log capability endpoints, financial data or keys.
 }
}
function localClock(now,timezone) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,month:`${parts.year}-${parts.month}`,day:Number(parts.day),hour:Number(parts.hour)};
}
function accessActive(s,now) {return s&&(s.status==='active'||(s.status==='trialing'?new Date(s.trial_ends_at||0)>now:['canceled','past_due'].includes(s.status)&&new Date(s.current_period_end_at||0)>now))}
function eventsFor(row,data,now) {
 const clock=localClock(now,row.timezone),p=normalizePreferences(row.preferences),events=[];
 if(p.eveningReminder&&clock.hour===row.reminder_hour)events.push({key:'evening:'+clock.date,title:'Un petit point sur ton budget ?',body:'Prends un instant pour noter tes dépenses dans Kloo.'});
 if(p.monthlyReport&&clock.day===1&&clock.hour===9)events.push({key:'monthly:'+clock.month,title:'Un nouveau mois commence',body:'Fais le point sur tes dépenses et prépare ton budget dans Kloo.'});
 if(p.budgetAlerts)for(const envelope of data.envelopes||[]) {
  const planned=Number(envelope.planned_amount),spent=(data.transactions||[]).filter(t=>t.category_id===envelope.category_id).reduce((s,t)=>s+Number(t.amount),0);
  const threshold=planned>0&&spent>=planned?100:planned>0&&spent>=planned*.8?80:0;
  if(threshold)events.push({key:`budget:${clock.month}:${envelope.category_id}:${threshold}`,title:threshold===100?'Une enveloppe a atteint son budget':'Une enveloppe approche de sa limite',body:'Ouvre Kloo pour vérifier tes dépenses et ajuster ton budget.'});
 }
 if(p.goalReached)for(const goal of data.goals||[])if(Number(goal.target_amount)>0&&Number(goal.current_amount)>=Number(goal.target_amount))events.push({key:`goal:${goal.id}:${goal.target_amount}`,title:'Objectif d’épargne atteint 🎉',body:'Bravo ! Retrouve ta progression dans Kloo.'});
 return events;
}
async function financialSnapshot(admin,userId,month) {
 const [subscription,budget,transactions,goals]=await Promise.all([
  admin.from('subscriptions').select('status,trial_ends_at,current_period_end_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  admin.from('monthly_budgets').select('id').eq('user_id',userId).eq('month_key',month).maybeSingle(),
  admin.from('transactions').select('category_id,amount').eq('user_id',userId).eq('month_key',month),
  admin.from('savings_goals').select('id,target_amount,current_amount').eq('user_id',userId),
 ]);
 if([subscription,budget,transactions,goals].some(r=>r.error))throw Error('Push account snapshot unavailable');
 const envelopes=budget.data?await admin.from('budget_envelopes').select('category_id,planned_amount').eq('monthly_budget_id',budget.data.id):{data:[]};
 if(envelopes.error)throw Error('Push budget unavailable');
 return {subscription:subscription.data,transactions:transactions.data,goals:goals.data,envelopes:envelopes.data};
}
async function runScheduledPush({admin=database(),now=new Date(),transport,deadlineMs=22000}={}) {
 if(!configuration().ready)return {configured:false};
 const start=Date.now(),claimed=await admin.rpc('claim_web_push_subscriptions',{batch_size:40});
 if(claimed.error)throw Error('Push storage unavailable: apply the web push migration');
 const rows=claimed.data||[],cache=new Map();let index=0,sent=0,failed=0;
 await Promise.all(Array.from({length:5},async()=>{
  while(index<rows.length&&Date.now()-start<deadlineMs-4500){const row=rows[index++];try{
   const month=localClock(now,row.timezone).month,key=row.user_id+':'+month;
   if(!cache.has(key))cache.set(key,financialSnapshot(admin,row.user_id,month));
   const data=await cache.get(key);if(!accessActive(data.subscription,now))continue;
   // Bound each pass. The next run picks up additional events, with durable deduplication.
   let delivered=0;
   for(const event of eventsFor(row,data,now)){if(Date.now()-start>deadlineMs-4500||delivered>=3)break;if(await deliver(admin,row,event,transport)){sent++;delivered++}}
  }catch{failed++}}
 }));
 return {configured:true,checked:index,sent,failed};
}
module.exports={configuration,database,publicConfiguration,subscriptionAction,deliver,eventsFor,localClock,runScheduledPush,validateEndpoint,validateSubscription,normalizePreferences,deviceSettings,defaults};
