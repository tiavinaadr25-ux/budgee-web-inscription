const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(config={}){
 const writes=[];const subscription={id:'sub_test',status:config.subscriptionStatus??'active',customer:'cus_test',currency:'eur',trial_end:null,latest_invoice:'in_test',cancel_at_period_end:false,items:{data:[{price:{unit_amount:199},current_period_start:1700000000,current_period_end:1900000000}]}};
 const session={mode:'subscription',status:config.sessionStatus??'complete',payment_status:config.paymentStatus??'paid',subscription:'sub_test',customer:'cus_test',metadata:{user_id:config.otherUser?'other':'user1'}};
 const client={from(table){let row;return {select(){return this},eq(){return this},order(){return this},limit(){return this},upsert(value,options){row=value;writes.push({table,row,options});return this},async maybeSingle(){return {data:{id:'row1',...row},error:null}},then(resolve){return Promise.resolve({error:null}).then(resolve)}}}};
 class Stripe {constructor(){this.checkout={sessions:{retrieve:async()=>session}};this.subscriptions={retrieve:async()=>subscription};this.invoices={retrieve:async()=>({id:'in_test',amount_paid:199,amount_due:199,currency:'eur',status:'paid',created:1700000000,status_transitions:{paid_at:1700000001}})}}}
 class ApiRouteError extends Error{constructor(message,status){super(message);this.status=status}}
 const security={ApiRouteError,ensureAllowedOrigin(){},async requireAuthenticatedUser(){if(config.unauthorized)throw new ApiRouteError('auth',401);return {id:'user1'}},jsonResponse(request,body,init){return {status:init?.status??200,body}}};
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/stripe/confirm-checkout/route.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports:module.exports,module,Date,process:{env:{STRIPE_SECRET_KEY:'fake',SUPABASE_URL:'https://example.com',SUPABASE_SERVICE_ROLE_KEY:'fake'}},require(name){if(name==='stripe')return Stripe;if(name==='next/server')return {};if(name==='@supabase/supabase-js')return {createClient:()=>client};if(name.endsWith('/security'))return security;throw new Error(name)}});
 return {writes,post:()=>module.exports.POST({json:async()=>({sessionId:'cs_test'})})};
}
(async()=>{
 for(const [config,status] of [[{unauthorized:true},401],[{otherUser:true},403],[{sessionStatus:'open'},409],[{paymentStatus:'unpaid'},409],[{subscriptionStatus:'incomplete'},409]]){const x=load(config);assert.equal((await x.post()).status,status);assert.equal(x.writes.length,0)}
 console.log('PASS unpaid, unfinished, inactive and foreign sessions cannot activate access');
 const x=load();assert.equal((await x.post()).status,200);const sub=x.writes.find(w=>w.table==='subscriptions');assert.equal(sub.row.current_period_end_at,new Date(1900000000*1000).toISOString());assert.equal(sub.row.price_amount,1.99);
 console.log('PASS current Stripe item billing period is stored correctly');
 const bill=x.writes.find(w=>w.table==='billing_records');assert.equal(bill.options.onConflict,'provider_invoice_id');assert.equal(bill.row.provider_invoice_id,'in_test');assert.equal(bill.row.status,'paid');assert.equal(bill.row.amount,1.99);assert.equal((await x.post()).status,200);assert.ok(x.writes.filter(w=>w.table==='billing_records').every(w=>w.row.provider_invoice_id==='in_test'&&w.options.onConflict==='provider_invoice_id'));
 console.log('PASS repeated confirmation upserts the same real invoice instead of adding duplicates');
})().catch(e=>{console.error(e);process.exitCode=1});
