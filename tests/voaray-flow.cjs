const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
let configured = true, rpcCalls = [], currentOrder = {id:'9c244f25-47a4-4561-a0b4-fd16c035a335',amount:9000,currency:'MGA',environment:'production'};
class ApiRouteError extends Error { constructor(message,status){super(message);this.status=status} }
const admin={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:currentOrder,error:null}}}},async rpc(name,args){rpcCalls.push([name,args]);return {data:'completed',error:null}}};
const env={VOARAY_API_KEY:'fake-api-key',VOARAY_MERCHANT_KEY:'fake-merchant',VOARAY_API_SECRET:'fake-secret',VOARAY_ENVIRONMENT:'production',VOARAY_PRICE_AMOUNT:'9000',VOARAY_CURRENCY:'MGA',SITE_URL:'https://example.com',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake'};
const security={ApiRouteError,jsonResponse(request,body,init){return {body,status:init?.status??200}}};
function load(file,extra){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{exports:module.exports,module,process:{env},Buffer,URL,AbortSignal,Date,fetch:async()=>({ok:true,json:async()=>({payment_url:'https://checkout.voaray.com/kloo/test'})}),require(name){if(name==='node:crypto')return crypto;if(name==='@supabase/supabase-js')return {createClient:()=>admin};if(name.endsWith('/security')||name==='./security')return security;if(name.endsWith('/voaray'))return extra;if(name==='next/server')return {};throw new Error(name)}});return module.exports}
const helper=load('app/api/_lib/voaray.ts');
const webhook=load('app/api/voaray/webhook/route.ts',helper);
function body(overrides={}){return JSON.stringify({status:'completed',data:{ref_trx:currentOrder.id,amount:9000,currency_code:'MGA',environment:'production',...overrides}})}
function request(text,signature=helper.signature(text,'fake-secret')){return {text:async()=>text,headers:{get(name){return name==='x-signature'?signature:name==='x-environment'?'production':null}}}}
(async()=>{
 assert.equal(helper.voarayConfig().ready,true);env.VOARAY_API_SECRET='';assert.equal(helper.voarayConfig().ready,false);env.VOARAY_API_SECRET='fake-secret';console.log('PASS incomplete configuration fails closed');
 const raw='{"amount":9000}';const signed=helper.signature(raw,'fake-secret');assert.equal(helper.validSignature(raw,signed,'fake-secret'),true);assert.equal(helper.validSignature('{ "amount":9000}',signed,'fake-secret'),false);assert.equal(helper.validSignature(raw,'invalid','fake-secret'),false);console.log('PASS exact-byte HMAC verification and malformed signature');
 rpcCalls=[];assert.equal((await webhook.POST(request(body()))).status,200);assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0][0],'fulfill_voaray_order');console.log('PASS signed completion delegates to atomic fulfillment');
 for(const [payload,sig,status] of [[body(),'0'.repeat(64),401],[body({amount:1}),undefined,400],[body({currency_code:'EUR'}),undefined,400],[body({environment:'sandbox'}),undefined,400]]){rpcCalls=[];const text=payload;assert.equal((await webhook.POST(request(text,sig))).status,status);assert.equal(rpcCalls.length,0)}console.log('PASS invalid signature, amount, currency and environment never grant access');
 rpcCalls=[];const pending=JSON.stringify({status:'pending',data:JSON.parse(body()).data});assert.equal((await webhook.POST(request(pending))).status,200);assert.equal(rpcCalls.length,0);console.log('PASS pending payment never grants access');
 rpcCalls=[];const refund=JSON.stringify({status:'refunded',data:JSON.parse(body()).data});assert.equal((await webhook.POST(request(refund))).status,200);assert.equal(rpcCalls[0][0],'refund_voaray_order');console.log('PASS signed refund uses revocation path');
 assert.equal(await helper.initiateVoarayPayment({payment_amount:9000}),'https://checkout.voaray.com/kloo/test');console.log('PASS official hosted checkout URL');
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/202610210001_voaray.sql'),'utf8');assert.match(sql,/for update/i);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/Never grant production access/);assert.match(sql,/revoke all on function/);console.log('PASS migration includes locking, sandbox isolation and service-role-only fulfillment (SQL execution still required)');
})().catch(error=>{console.error(error);process.exitCode=1});
