const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = require('node:path').resolve(__dirname, '..') + '/';
const trial = {id:'sub_trial',status:'trialing',created:100,customer:'cus_trial',currency:'eur',trial_end:Math.floor(Date.now()/1000)+604800,cancel_at_period_end:false,items:{data:[{price:{unit_amount:199},current_period_end:Math.floor(Date.now()/1000)+604800}]}};
function load(route, config={}) {
 const calls = {customers:[],trials:[],checkout:[],saved:[]};
 let saveMode=false;
 const query={select(){return this},eq(){return this},not(){return this},order(){return this},limit(){return this},upsert(row){calls.saved.push(row);saveMode=true;return this},async maybeSingle(){if(saveMode)return {data:config.saveError?null:{id:'row',...calls.saved.at(-1)},error:config.saveError?new Error('save failed'):null};return {data:config.existing??null,error:config.readError?new Error('read failed'):null}}};
 const asyncList = data => ({async *[Symbol.asyncIterator](){yield* data}});
 class Stripe { constructor(){this.prices={retrieve:async()=>({active:true,unit_amount:config.badPrice?500:199,currency:'eur',recurring:{interval:'month',interval_count:1}})};this.customers={list:()=>asyncList(config.customers??[]),create:async (args,opts)=>{calls.customers.push([args,opts]);return {id:'cus_trial'}}};this.subscriptions={list:()=>asyncList(config.previous??[]),create:async(args,opts)=>{calls.trials.push([args,opts]);return trial}};this.checkout={sessions:{create:async(args)=>{calls.checkout.push(args);return {url:'https://checkout.stripe.com/test'}}}}} }
 class ApiRouteError extends Error {constructor(message,status){super(message);this.status=status}}
 const security={ApiRouteError,ensureAllowedOrigin(){if(config.badOrigin)throw new ApiRouteError('origin',403)},async requireAuthenticatedUser(){if(config.unauthorized)throw new ApiRouteError('auth',401);return {id:'user1',email:'test@example.com',email_confirmed_at:config.unconfirmed?null:'2026-01-01',user_metadata:{name:'Test'}}},assertAuthenticatedUser(user,id){if(user.id!==id)throw new ApiRouteError('wrong user',403)},jsonResponse(request,body,init){return {status:init?.status??200,body}},optionsResponse(){return {status:200}}};
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(root+route,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports:module.exports,module,require(name){if(name==='stripe')return Stripe;if(name==='@supabase/supabase-js')return {createClient:()=>({from:()=>query})};if(name==='next/server')return {};if(name.endsWith('/security'))return security;throw new Error(name)},process:{env:{SITE_URL:'https://example.com',STRIPE_SECRET_KEY:'test',STRIPE_PRICE_ID:'price_test',SUPABASE_URL:'https://example.com',SUPABASE_SERVICE_ROLE_KEY:'test'}},Date,console});
 return {post:()=>module.exports.POST({headers:{get:()=>null},json:async()=>({userId:'user1',returnPath:'/paiement'})}),calls};
}
(async()=>{
 let x=load('app/api/start-trial/route.ts');let r=await x.post();assert.equal(r.status,200);assert.equal(x.calls.trials.length,1);assert.equal(x.calls.trials[0][0].trial_period_days,7);assert.equal(x.calls.trials[0][0].trial_settings.end_behavior.missing_payment_method,'cancel');assert.equal(x.calls.trials[0][1].idempotencyKey,'kloo-free-trial-user1');assert.equal(x.calls.trials[0][0].default_payment_method,undefined);assert.equal(x.calls.saved[0].price_amount,1.99);
 console.log('PASS new trial: seven days, no card, cancels without payment, idempotent keys');
 for(const existing of [{id:'trial',status:'trialing',trial_ends_at:'2099-01-01'},{id:'expired',status:'canceled',trial_ends_at:'2020-01-01'},{id:'paid',status:'active'}]){x=load('app/api/start-trial/route.ts',{existing});r=await x.post();assert.equal(r.body.subscription.id,existing.id);assert.equal(x.calls.trials.length,0)}
 console.log('PASS existing, expired and paid accounts: no new trial');
 for(const [config,status] of [[{unauthorized:true},401],[{unconfirmed:true},403],[{badOrigin:true},403],[{readError:true},500]]){x=load('app/api/start-trial/route.ts',config);assert.equal((await x.post()).status,status);assert.equal(x.calls.trials.length,0)}
 console.log('PASS authentication, confirmed email, origin and failed access check');
 x=load('app/api/start-trial/route.ts',{customers:[{id:'cus_trial',metadata:{user_id:'user1'}}],previous:[trial]});r=await x.post();assert.equal(r.status,200);assert.equal(x.calls.trials.length,0);assert.equal(x.calls.saved[0].provider_subscription_id,'sub_trial');
 console.log('PASS Stripe recovery after missing database row: same trial, no restart');
 x=load('app/api/start-trial/route.ts',{saveError:true});assert.equal((await x.post()).status,500);
 console.log('PASS failed trial persistence does not report success');
 for(const existing of [null,{id:'trial',status:'trialing',trial_ends_at:'2099-01-01'},{id:'paid',status:'active'}]){x=load('app/api/create-checkout-session/route.ts',{existing});assert.equal((await x.post()).status,409);assert.equal(x.calls.checkout.length,0)}
 console.log('PASS paid checkout blocked before trial or while access remains active');
 x=load('app/api/create-checkout-session/route.ts',{existing:{id:'expired',status:'canceled',trial_ends_at:'2020-01-01'}});r=await x.post();assert.equal(r.status,200);assert.equal(x.calls.checkout[0].subscription_data.trial_period_days,undefined);assert.equal(x.calls.checkout[0].payment_method_collection,'always');
 console.log('PASS expired trial: card checkout, no second free trial');
 x=load('app/api/start-trial/route.ts',{badPrice:true});assert.equal((await x.post()).status,503);assert.equal(x.calls.trials.length,0);
 x=load('app/api/create-checkout-session/route.ts',{badPrice:true,existing:{id:'expired',status:'canceled',trial_ends_at:'2020-01-01'}});assert.equal((await x.post()).status,503);assert.equal(x.calls.checkout.length,0);
 console.log('PASS price mismatch blocks trial creation and checkout before any Stripe mutation');
})().catch(error=>{console.error(error);process.exitCode=1});
