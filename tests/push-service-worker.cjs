const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const handlers={},shown=[],opened=[];let focused=0,clients=[],pending;
 const self={location:{origin:'https://kloo.site'},addEventListener:(event,fn)=>handlers[event]=fn,registration:{scope:'https://kloo.site/app/',showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/app/sw.js'),'utf8'),{self,URL});
 handlers.push({data:{json:()=>({title:'Rappel Kloo',body:'Pense à tes dépenses',url:'https://evil.example',tag:'daily'})},waitUntil:p=>pending=p});await pending;
 assert.equal(shown[0].options.data.url,'/app/');assert.equal(shown[0].options.renotify,false);assert.equal(shown[0].options.icon,'/app/icon-192.png');
 handlers.push({data:{json(){throw Error('bad json')}},waitUntil:p=>pending=p});await pending;assert.equal(shown[1].title,'Kloo');
 let closed=false;handlers.notificationclick({notification:{close(){closed=true},data:{url:'https://evil.example/'}},waitUntil:p=>pending=p});await pending;assert.equal(closed,true);assert.equal(opened[0],'https://kloo.site/app/');
 clients=[{url:'https://kloo.site/app',focus:async()=>focused++}];handlers.notificationclick({notification:{close(){},data:{url:'/app/'}},waitUntil:p=>pending=p});await pending;assert.equal(focused,1);assert.equal(opened.length,1);
 console.log('PASS received push displays a real service-worker notification; malformed data falls back safely; clicks cannot leave Kloo and reuse an open app');
 const index=fs.readFileSync(path.join(__dirname,'../public/app/index.html'),'utf8');assert.ok(index.includes("register('/app/sw.js', { scope: '/app/' })"));assert.ok(index.includes('/app/kloo-push.js'));
 for(const base of ['public/_expo/static/js/web','public/app/_expo/static/js/web']){const bundle=fs.readFileSync(path.join(__dirname,'..',base,'index-51b57ea0a19a6bf49f360ef6f56c6ba9.js'),'utf8');assert.ok(bundle.includes('KlooPush.open(Et,(0,k.requireSupabase)())'));assert.ok(bundle.includes('KlooPush.detach(Et,e)'));assert.ok(bundle.includes('KlooPush.syncAccount(Et,(0,k.requireSupabase)())'))}
 console.log('PASS service worker uses an absolute scope; app settings, account changes and logout are wired in both exports');
})().catch(e=>{console.error(e);process.exitCode=1});
