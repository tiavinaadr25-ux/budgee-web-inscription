const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/LandingClient.tsx'),'utf8');
const start=source.indexOf('      const installed =');
const end=source.indexOf("window.location.replace('/app/');",start)+"window.location.replace('/app/');".length;
const ts=require('typescript');
const code=ts.transpileModule('(function(){'+source.slice(start,end)+'}})()', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function launch({standalone=false,ios=false,landing=true,auth=null,query='',hash=''}={}){const redirects=[];vm.runInNewContext(code,{isFullLanding:landing,authRedirectPath:auth,searchParams:new URLSearchParams(query),window:{matchMedia:()=>({matches:standalone}),navigator:{standalone:ios},location:{hash,replace:url=>redirects.push(url)}}});return redirects;}
assert.deepEqual(launch({standalone:true}),['/app/']);
assert.deepEqual(launch({ios:true}),['/app/']);
for(const options of [{},{standalone:true,landing:false},{standalone:true,auth:'/auth-callback'},{standalone:true,query:'checkout=success'},{standalone:true,hash:'#access_token=fixture'}])assert.deepEqual(launch(options),[]);
const manifest=fs.readFileSync(require('node:path').join(__dirname,'../app/manifest.ts'),'utf8');assert.ok(manifest.includes("start_url: '/app/'"));assert.ok(manifest.includes("id: '/'"));
console.log('PASS installed launch opens the app; browser, explicit login, payment returns and auth callbacks are preserved');
