const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const events=[],blobs=[],notices=[];
function element(tag){return {tag,style:{},children:[],appendChild(e){this.children.push(e)},setAttribute(k,v){this[k]=v},remove(){},click(){events.push({href:this.href,download:this.download})}}}
const document={body:{appendChild(e){if(e.tag==='aside')notices.push(e)}},createElement:element,getElementById(){return null}};
const context={document,window:null,Blob:class{constructor(parts,options){blobs.push({parts,options})}},URL:{createObjectURL(){return 'blob:test-'+blobs.length},revokeObjectURL(url){events.push({revoked:url})}}};context.window=context;
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'public/app/kloo-export.js'),'utf8'),context);
const data={monthKey:'2026-10',totalBudget:500,envelopes:[{categoryId:'courses',plannedAmount:150}],transactions:[{categoryId:'courses',name:'Café; "amis"\nsoir',amount:12.5,dayLabel:'21 octobre'},{categoryId:'divers',name:'=HYPERLINK("https://example.com")',amount:1,dayLabel:'22 octobre'}],recurringExpenses:[{categoryId:'loyer',name:'Loyer',amount:200,dayOfMonth:1,isActive:true}],savingsGoals:[{name:'Voyage',currentAmount:50,targetAmount:100}]};
context.KlooExport(data,'MGA');
assert.equal(events[0].download,'kloo-export-2026-10.csv');assert.match(events[0].href,/^blob:/);
const csv=blobs[0].parts.join('');assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('Montant (MGA)'));assert.ok(csv.includes('"12,50"'));assert.ok(csv.includes('Café; ""amis""\nsoir'));assert.ok(csv.includes("'="));assert.ok(csv.includes('Budget total du mois'));assert.ok(csv.includes('Enveloppe'));assert.ok(csv.includes('Dépense fixe'));assert.ok(csv.includes('Épargne'));assert.equal(blobs[0].options.type,'text/csv;charset=utf-8');
assert.equal(notices[0].role,'status');assert.ok(notices[0].children.some(e=>e.tag==='a'&&e.download===events[0].download));
console.log('PASS UTF-8 CSV downloads with displayed month, budget, expenses, recurring expenses and savings; accents, quotes, multiline labels and formula protection');
context.KlooExport({...data,monthKey:'../../unsafe',transactions:[]},'EUR');assert.ok(events.some(e=>e.revoked==='blob:test-1'));assert.equal(events.at(-1).download,'kloo-export-budget.csv');
context.URL.createObjectURL=()=>{throw Error('not available')};context.KlooExport(data,'EUR');assert.equal(notices.at(-1).role,'alert');
console.log('PASS fallback download link, safe filenames, blob cleanup and visible error');
for(const base of ['public/_expo/static/js/web','public/app/_expo/static/js/web']){
 const source=fs.readFileSync(path.join(root,base,'index-51b57ea0a19a6bf49f360ef6f56c6ba9.js'),'utf8');
 const start=source.lastIndexOf('__d(',source.indexOf('_e.exportDataAsCsv='));const end=source.indexOf('\n__d(',start+4);
 let exports,called=0;
 const ctx={document:{},KlooExport(value,currency){called++;assert.equal(value.monthKey,'2026-10');assert.equal(currency,'MGA')},__d(factory,id,deps){exports={};factory({},index=>index===deps[3]?{getActiveCurrency:()=> 'MGA'}:{File:class{constructor(){throw Error('native filesystem used')}},Paths:{}},null,null,{exports},exports,deps)}};
 vm.runInNewContext(source.slice(start,end),ctx);
 exports.exportDataAsCsv(data);assert.equal(called,1);
}
console.log('PASS both compiled web apps call browser download instead of native filesystem');
