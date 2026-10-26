const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const vapid=crypto.createECDH('prime256v1');vapid.generateKeys();const receiver=crypto.createECDH('prime256v1');receiver.generateKeys();
const env={WEB_PUSH_PUBLIC_KEY:vapid.getPublicKey().toString('base64url'),WEB_PUSH_PRIVATE_KEY:vapid.getPrivateKey().toString('base64url'),WEB_PUSH_SUBJECT:'mailto:hello@example.com'};
const browser={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
function database(){
 const state={web_push_subscriptions:[],web_push_deliveries:[]},claims=new Set();let next=0;
 function query(table){const filters=[];let action='select',payload,head=false;
  const q={select(columns,options){head=!!options?.head;return q},eq(key,value){filters.push([key,value]);return q},limit(){return q},upsert(value){action='upsert';payload=value;return q},update(value){action='update';payload=value;return q},delete(){action='delete';return q},async maybeSingle(){const r=run();return {...r,data:r.data?.[0]??null}},then(resolve,reject){return Promise.resolve(run()).then(resolve,reject)}};
  function run(){const rows=state[table].filter(row=>filters.every(([k,v])=>row[k]===v));
   if(action==='upsert'){let row=state[table].find(r=>r.endpoint_hash===payload.endpoint_hash);if(row)Object.assign(row,payload);else state[table].push({id:'device-'+(++next),...payload});return {error:null}}
   if(action==='delete'){state[table]=state[table].filter(r=>!rows.includes(r));return {error:null}}
   if(action==='update'){rows.forEach(r=>Object.assign(r,payload));return {error:null}}
   return {data:head?null:rows,error:null,count:rows.length};
  }return q;
 }
 return {state,from:query,async rpc(name,args){const key=args.p_subscription_id+':'+args.p_event_key;if(claims.has(key))return {data:false,error:null};claims.add(key);return {data:true,error:null}}};
}
let transportCalls=[];const library={sendNotification:async(...args)=>{transportCalls.push(args)}};
const fixture={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'server/web-push.cjs'),'utf8'),{module:fixture,exports:fixture.exports,process:{env},Buffer,URL,Date,Intl,Map,Promise,require(name){if(name==='node:crypto')return crypto;if(name==='@supabase/supabase-js')return {createClient:database};if(name==='web-push')return library;throw Error(name)}});
const push=fixture.exports;
(async()=>{
 assert.equal(push.configuration().ready,true);assert.equal(push.localClock(new Date('2026-10-25T20:05:00Z'),'Europe/Paris').hour,21);assert.equal(push.localClock(new Date('2026-07-25T19:05:00Z'),'Europe/Paris').hour,21);assert.equal(push.localClock(new Date('2026-10-25T18:05:00Z'),'Indian/Antananarivo').hour,21);
 for(const endpoint of ['http://fcm.googleapis.com/test','https://127.0.0.1/test','https://fcm.googleapis.com.evil.test/x','https://user:secret@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://example.com/'])assert.throws(()=>push.validateEndpoint(endpoint));
 assert.throws(()=>push.validateSubscription({...browser,keys:{p256dh:'bad',auth:'bad'}}));assert.throws(()=>push.deviceSettings({timezone:'Not/A/Zone'}));assert.throws(()=>push.deviceSettings({reminderHour:24}));
 console.log('PASS VAPID pair, timezone/DST handling, trusted push endpoints, key validation and invalid settings');
 const db=database();await push.subscriptionAction('user1',{action:'subscribe',subscription:browser,userId:'user2',preferences:{eveningReminder:false},timezone:'Europe/Paris',reminderHour:21},db);
 assert.equal(db.state.web_push_subscriptions[0].user_id,'user1');
 const other=await push.subscriptionAction('user2',{action:'status',endpoint:browser.endpoint},db);assert.equal(other.subscribed,false);
 await assert.rejects(push.subscriptionAction('user2',{action:'preferences',endpoint:browser.endpoint,preferences:{}},db));
 await push.subscriptionAction('user2',{action:'unsubscribe',endpoint:browser.endpoint},db);assert.equal(db.state.web_push_subscriptions.length,1);
 await push.subscriptionAction('user1',{action:'preferences',endpoint:browser.endpoint,preferences:{eveningReminder:false,budgetAlerts:false,goalReached:false,monthlyReport:false},timezone:'Indian/Antananarivo',reminderHour:20},db);
 const status=await push.subscriptionAction('user1',{action:'status',endpoint:browser.endpoint},db);assert.equal(status.preferences.budgetAlerts,false);assert.ok(!('endpoint'in status));
 console.log('PASS account ownership for settings/removal, explicit opt-out and no private endpoint returned in status');
 const row=db.state.web_push_subscriptions[0];const data={envelopes:[{category_id:'courses',planned_amount:100}],transactions:[{category_id:'courses',amount:100}],goals:[{id:'g',target_amount:50,current_amount:50}]};
 const events=push.eventsFor({...row,preferences:{eveningReminder:true,budgetAlerts:true,goalReached:true,monthlyReport:true},timezone:'Europe/Paris',reminder_hour:21},data,new Date('2026-10-25T20:10:00Z'));
 assert.equal(events.filter(e=>e.key.startsWith('budget:')).length,1);assert.ok(events.some(e=>e.key.endsWith(':100')));assert.ok(events.some(e=>e.key==='evening:2026-10-25'));assert.ok(events.some(e=>e.key==='goal:g:50'));
 assert.ok(!JSON.stringify(events.map(e=>[e.title,e.body])).includes('courses'));assert.equal(push.eventsFor({...row,preferences:{eveningReminder:false,budgetAlerts:false,goalReached:false,monthlyReport:false}},data,new Date()).length,0);
 console.log('PASS daily reminders, threshold/goal events, privacy-preserving payloads and all reminders disabled');
 assert.equal(await push.deliver(db,row,events[0]),true);assert.equal(await push.deliver(db,row,events[0]),false);assert.equal(transportCalls.length,1);assert.equal(transportCalls[0][2].TTL,3600);assert.ok(transportCalls[0][2].vapidDetails.privateKey);
 await push.deliver(db,row,{key:'expired',title:'Kloo',body:'test'},async()=>{const e=Error();e.statusCode=410;throw e});assert.equal(db.state.web_push_subscriptions.length,0);
 console.log('PASS durable event claims prevent duplicate sends; expired subscriptions are removed');
 // Test the real library's encryption and VAPID signing without making a network request.
 const actual=require('web-push');const request=actual.generateRequestDetails(browser,'{"title":"Kloo"}',{vapidDetails:{subject:env.WEB_PUSH_SUBJECT,publicKey:env.WEB_PUSH_PUBLIC_KEY,privateKey:env.WEB_PUSH_PRIVATE_KEY}});assert.ok(Buffer.isBuffer(request.body));assert.ok(!request.body.includes(Buffer.from('"title"')));assert.ok(request.headers.Authorization||request.headers.authorization);
 console.log('PASS actual Web Push payload encryption and VAPID signing (offline, no notification sent)');
 const apiCode=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/push/route.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 for(const config of [{auth:false,origin:true,status:401},{auth:true,origin:false,status:403},{auth:true,origin:true,confirmed:false,status:403},{auth:true,origin:true,confirmed:true,status:200}]){
  let calls=0;class ApiRouteError extends Error{constructor(message,status){super(message);this.status=status}}
  const m={exports:{}};vm.runInNewContext(apiCode,{exports:m.exports,module:m,require(name){if(name.includes('web-push.cjs'))return {subscriptionAction:async uid=>{calls++;assert.equal(uid,'owner');return {subscribed:true}}};if(name==='next/server')return {};if(name.endsWith('/security'))return {ApiRouteError,ensureAllowedOrigin(){if(!config.origin)throw new ApiRouteError('origin',403)},async requireAuthenticatedUser(){if(!config.auth)throw new ApiRouteError('auth',401);return {id:'owner',email_confirmed_at:config.confirmed?'yes':null}},jsonResponse:(r,body,init)=>({body,status:init?.status??200})};throw Error(name)}});
  const response=await m.exports.POST({text:async()=>JSON.stringify({action:'subscribe',userId:'attacker'})});assert.equal(response.status,config.status);assert.equal(calls,config.status===200?1:0);
 }
 console.log('PASS API enforces authentication, email confirmation, origin and server-selected user identity');
})().catch(e=>{console.error(e);process.exitCode=1});
