const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),ts=require('typescript');
function load(config={}){
 const updates=[];class ApiRouteError extends Error{constructor(message,status){super(message);this.status=status}}
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/api/_lib/update-card.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require(name){if(name==='./security')return {ApiRouteError};throw Error(name)}});
 const stripe={setupIntents:{retrieve:async()=>({customer:config.wrongCustomer?'cus_other':'cus_1',status:config.pending?'processing':'succeeded',payment_method:'pm_new'})},subscriptions:{retrieve:async()=>({id:'sub_1',customer:'cus_1',status:'active',metadata:{user_id:config.foreignSub?'other':'user1'}}),update:async(id,p)=>updates.push({id,p})},customers:{update:async(id,p)=>updates.push({id,p})}};
 const admin={from(){return {select(){return this},eq(){return this},then(resolve){return Promise.resolve({data:config.noRows?[]:[{provider_subscription_id:'sub_1'}],error:null}).then(resolve)}}}};
 const session={mode:'setup',metadata:{purpose:'kloo-card-update',user_id:config.foreign?'other':'user1'},status:config.open?'open':'complete',customer:'cus_1',setup_intent:'seti_1'};
 return {updates,run:()=>module.exports.applyCardUpdate(stripe,admin,session,'user1')};
}
(async()=>{
 for(const c of [{foreign:true},{open:true},{wrongCustomer:true},{pending:true},{foreignSub:true},{noRows:true}]){const x=load(c);await assert.rejects(x.run());assert.equal(x.updates.length,0)}
 console.log('PASS foreign, unfinished and unverified replacement cards never change billing');
 const x=load();await x.run();assert.equal(x.updates.length,2);assert.equal(x.updates[0].id,'sub_1');assert.equal(x.updates[0].p.default_payment_method,'pm_new');assert.equal(x.updates[1].p.invoice_settings.default_payment_method,'pm_new');
 await x.run();assert.ok(x.updates.every(u=>Object.keys(u.p).length===1));
 console.log('PASS validated card updates subscription and customer defaults; replay creates no charge or new subscription');
})().catch(e=>{console.error(e);process.exitCode=1});
