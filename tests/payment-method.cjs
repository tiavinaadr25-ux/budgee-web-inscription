const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(config={}){
 const writes=[],updates=[],sessions=[];
 const subs=config.subs??[{id:'sub_1',status:'active',customer:'cus_1',metadata:{user_id:'user1'},cancel_at_period_end:false,items:{data:[{current_period_end:1900000000}]},trial_end:null}];
 const rows=subs.map(s=>({provider:'stripe',provider_subscription_id:s.id,provider_customer_id:s.customer,status:s.status}));
 const client={from(){return {select(){return this},eq(k,v){writes.push(['filter',k,v]);return this},order(){return this},limit(){return this},update(v){writes.push(['update',v]);return this},then(resolve){return Promise.resolve({data:rows,error:config.dbError?{}:null}).then(resolve)}}}};
 class Stripe{constructor(){this.subscriptions={retrieve:async id=>subs.find(s=>s.id===id),update:async(id,params)=>{updates.push({id,params});return {...subs.find(s=>s.id===id),...params}}};this.checkout={sessions:{create:async params=>{sessions.push(params);return {url:'https://checkout.stripe.com/test'}}}}}}
 class ApiRouteError extends Error{constructor(message,status){super(message);this.status=status}}
 const security={ApiRouteError,ensureAllowedOrigin(){if(config.badOrigin)throw new ApiRouteError('origin',403)},async requireAuthenticatedUser(){if(config.unauthorized)throw new ApiRouteError('auth',401);return {id:'user1'}},jsonResponse(request,body,init){return {status:init?.status??200,body}},optionsResponse(){}};
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/payment-method/route.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,URL,Set,Date,process:{env:{STRIPE_SECRET_KEY:'fake',SUPABASE_URL:'https://example.com',SUPABASE_SERVICE_ROLE_KEY:'fake',SITE_URL:'https://kloo.site'}},require(name){if(name==='stripe')return Stripe;if(name==='next/server')return {};if(name==='@supabase/supabase-js')return {createClient:()=>client};if(name.endsWith('/security'))return security;if(name.endsWith('/update-card'))return {applyCardUpdate(){throw Error('Not used')}};throw Error(name)}});
 return {writes,updates,sessions,get:()=>module.exports.GET({}),post:action=>module.exports.POST({json:async()=>({action}),nextUrl:new URL('https://kloo.site/api/payment-method')})};
}
(async()=>{
 for(const config of [{unauthorized:true},{badOrigin:true},{dbError:true}]){const x=load(config);assert.ok((await x.post('switch-mobile')).status>=400);assert.equal(x.updates.length,0)}
 console.log('PASS authentication, origin and unavailable database prevent mutations');
 const foreign=load({subs:[{id:'sub_other',customer:'cus_other',metadata:{user_id:'other'}}]});assert.equal((await foreign.get()).status,403);assert.equal(foreign.updates.length,0);
 const x=load();const before=await x.get();assert.equal(before.body.cardRenews,true);assert.equal(before.body.cardEndsAt,new Date(1900000000*1000).toISOString());assert.equal(x.updates.length,0);
 assert.equal((await x.post('unknown')).status,400);assert.equal(x.updates.length,0);
 assert.equal((await x.post('switch-mobile')).status,200);assert.equal(x.updates.length,1);assert.equal(x.updates[0].params.cancel_at_period_end,true);assert.ok(x.writes.some(w=>w[0]==='filter'&&w[1]==='user_id'&&w[2]==='user1'));
 console.log('PASS switching stops future renewals and preserves paid-through date, scoped to owner');
 const already=load({subs:[{id:'sub_1',status:'active',customer:'cus_1',metadata:{user_id:'user1'},cancel_at_period_end:true,items:{data:[{current_period_end:1900000000}]}}]});assert.equal((await already.post('switch-mobile')).status,200);assert.equal(already.updates.length,0);
 const portal=load();assert.equal((await portal.post('portal')).status,200);assert.equal(portal.sessions[0].mode,'setup');assert.equal(portal.sessions[0].customer,'cus_1');assert.equal(portal.sessions[0].metadata.user_id,'user1');assert.equal(portal.updates.length,0);
 console.log('PASS card setup creates no charge, subscription or renewal mutation; repeat cancellation is idempotent');
 const empty=load({subs:[]});assert.equal((await empty.post('portal')).status,409);assert.equal((await empty.get()).body.canUpdateCard,false);
 console.log('PASS prepaid/absent card subscription cannot open replacement-card checkout');
})().catch(e=>{console.error(e);process.exitCode=1});
