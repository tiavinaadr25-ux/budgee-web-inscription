const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
const esbuild=require('esbuild-wasm'),root=path.resolve(__dirname,'..');
(async()=>{
 // Keep the artifact inside the project so external packages resolve as on Netlify.
 const scratch=path.join(root,'work');fs.mkdirSync(scratch,{recursive:true});
 const directory=fs.mkdtempSync(path.join(scratch,'netlify-reconcile-smoke-'));
 const outfile=path.join(directory,'voaray-reconcile.mjs');
 try {
  const built=await esbuild.build({entryPoints:[path.join(root,'netlify/functions/voaray-reconcile.mts')],outfile,
   bundle:true,platform:'node',target:'node20',format:'esm',packages:'external',metafile:true,logLevel:'silent'});
  const imports=Object.values(built.metafile.outputs).flatMap(x=>x.imports.map(i=>i.path));
  assert.ok(!imports.some(x=>x==='next'||x.startsWith('next/')),'standalone scheduled function must not import Next.js');
  const env={...process.env};for(const name of ['VOARAY_API_KEY','VOARAY_API_SECRET','VOARAY_WEBHOOK_SECRET','VOARAY_MERCHANT_KEY'])env[name]='';
  const result=spawnSync(process.execPath,['--input-type=module','-e',
   `const m=await import(${JSON.stringify(pathToFileURL(outfile).href)});if(m.config.schedule!=='*/5 * * * *')throw Error('Missing schedule');await m.default();`],{env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/configured: false/);
  const configuredEnv={...env,SITE_URL:'https://kloo.example.test',VOARAY_ENVIRONMENT:'production',VOARAY_PRICE_AMOUNT:'9000',VOARAY_CURRENCY:'MGA',
   VOARAY_API_KEY:'fixture',VOARAY_API_SECRET:'fixture',VOARAY_WEBHOOK_SECRET:'fixture',VOARAY_MERCHANT_KEY:'fixture',
   SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
  const configured=spawnSync(process.execPath,['--input-type=module','-e',
   `let reads=0;globalThis.fetch=async input=>{const u=new URL(String(input));if(u.origin!=='https://fixture.supabase.co'||u.pathname!=='/rest/v1/voaray_orders')throw Error('Unexpected network call');reads++;return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}})};const m=await import(${JSON.stringify(pathToFileURL(outfile).href)});await m.default();if(reads!==1)throw Error('Expected one storage read');`],{env:configuredEnv,encoding:'utf8',timeout:15000});
  assert.equal(configured.status,0,configured.stderr||configured.error?.message);assert.match(configured.stdout,/configured: true/);assert.match(configured.stdout,/checked: 0/);
  console.log('PASS real ESM Netlify bundle starts and invokes in Node without Next.js or any live payment/database call');
 } finally {
  if(fs.existsSync(outfile))fs.unlinkSync(outfile);fs.rmdirSync(directory);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
