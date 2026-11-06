// Pass the unpacked Netlify push-reminders artifact directory as the argument.
// This checks the shipped package, without falling back to project dependencies.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
const artifact=path.resolve(process.argv[2]||'');
assert.ok(process.argv[2],'Usage: node tests/netlify-push-artifact.cjs <artifact-directory>');
const flat=path.join(artifact,'push-reminders.mjs');
const entry=fs.existsSync(flat)?flat:path.join(artifact,'netlify/functions/push-reminders.mjs'),load=createRequire(entry);
for(const name of ['@supabase/supabase-js','web-push']){
 const resolved=fs.realpathSync(load.resolve(name));
 assert.ok(resolved.startsWith(fs.realpathSync(artifact)+path.sep),name+' must be shipped inside the artifact');
}
const result=spawnSync(process.execPath,['--input-type=module','-e',`globalThis.fetch=()=>{throw Error('Live requests forbidden')};const m=await import(${JSON.stringify(pathToFileURL(entry).href)});if(m.config.schedule!=='*/5 * * * *')throw Error('Schedule missing');await m.default();`],{encoding:'utf8',timeout:15000,env:{...process.env,NODE_PATH:'',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-not-a-real-key',WEB_PUSH_PUBLIC_KEY:'',WEB_PUSH_PRIVATE_KEY:'',WEB_PUSH_SUBJECT:''}});
assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/configured: false/);
console.log('PASS actual Netlify artifact includes Supabase and Web Push and starts its five-minute handler without live calls');
