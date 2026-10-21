const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const base of ['public/_expo/static/js/web','public/app/_expo/static/js/web']){
 const source=fs.readFileSync(path.join(__dirname,'..',base,'index-51b57ea0a19a6bf49f360ef6f56c6ba9.js'),'utf8');
 for(const [anchor,target] of [['visible:Ne,onClose:()=>Fe(!1),onOpenWebsite:','/paiement/gestion'],['subscription:pe,onOpenWebsite:','/paiement']]){
  const start=source.indexOf(anchor);assert.ok(start>=0,'payment button exists');
  const callback=source.slice(start+anchor.length,source.indexOf(',on',start+anchor.length));
  let destination;vm.runInNewContext('('+callback+')()',{location:{assign:url=>destination=url}});
  assert.equal(destination,target);
 }
}
console.log('PASS card management opens payment settings; expired access opens checkout in both web bundles');
const payment=fs.readFileSync(path.join(__dirname,'../app/PaymentClient.tsx'),'utf8');
const management=fs.readFileSync(path.join(__dirname,'../app/paiement/gestion/page.tsx'),'utf8');
assert.ok(!payment.includes('/paiement/simulation'));assert.ok(!management.includes('/paiement/simulation'));
console.log('PASS payment pages contain no demonstration links');
