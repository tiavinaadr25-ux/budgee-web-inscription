const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const name = 'index-51b57ea0a19a6bf49f360ef6f56c6ba9.js';
const patches = [
 ["subscription:pe,onOpenWebsite:en,onLogout:un","subscription:pe,onOpenWebsite:()=>globalThis.location.assign(\"/paiement\"),onLogout:un"],
 ["visible:Ne,onClose:()=>Fe(!1),onOpenWebsite:en,onSetPrimary:","visible:Ne,onClose:()=>Fe(!1),onOpenWebsite:()=>globalThis.location.assign(\"/paiement/gestion\"),onSetPrimary:"],
 ["_e.exportDataAsCsv=async function(t){const n=r(t.monthKey)","_e.exportDataAsCsv=async function(t){if(typeof document!==\"undefined\"){if(typeof globalThis.KlooExport!==\"function\"){globalThis.alert(\"Actualise Kloo pour activer le téléchargement CSV.\");return}return globalThis.KlooExport(t,(0,a.getActiveCurrency)())}const n=r(t.monthKey)"],
 ["(0,x.jsx)(b,{Icon:f.CircleHelp,label:\"Aide & FAQ\",onPress:L})","(0,x.jsx)(b,{Icon:f.CreditCard,label:\"Mode de paiement\",onPress:()=>globalThis.location.assign(\"/paiement/gestion\")}),(0,x.jsx)(b,{Icon:f.CircleHelp,label:\"Aide & FAQ\",onPress:L})"],
 ["function Z(e){return e?","function Z(e){if(e&&'voaray'===e.provider)return e.currentPeriodEndAt&&new Date(e.currentPeriodEndAt).getTime()>Date.now()?'Accès Mobile Money actif':'Accès Mobile Money terminé';return e?"],
 ['function Vt(){nt(!0)}','function Vt(){if(globalThis.KlooGuide){globalThis.KlooGuide.open(Et);return}nt(!0)}'],
 ["st(!ne(Et))},[ce,Et,Ot])", "st(!ne(Et)),globalThis.KlooGuide&&globalThis.KlooGuide.welcome(Et)},[ce,Et,Ot])"],
];
for(const base of ['public/_expo/static/js/web','public/app/_expo/static/js/web']){
 const file=path.join(root,base,name);let source=fs.readFileSync(file,'utf8');
 for(const [before,after] of patches){if(source.includes(after))continue;if(source.split(before).length!==2)throw new Error('Expo guide hook changed: '+before);source=source.replace(before,after)}
 source=source.replace("(0,x.jsx)(b,{Icon:f.FileText,label:\"Rapport mensuel PDF\",onPress:D}),", '');
 fs.writeFileSync(file,source);
}
const index=path.join(root,'public/app/index.html');let html=fs.readFileSync(index,'utf8');
if(!html.includes('/app/kloo-guide.js'))html=html.replace('<script src="/_expo/', '<script src="/app/kloo-guide.js" defer></script>\n  <script src="/_expo/');
if(!html.includes('/app/kloo-export.js'))html=html.replace('<script src="/app/kloo-guide.js"', '<script src="/app/kloo-export.js" defer></script>\n  <script src="/app/kloo-guide.js"');
fs.writeFileSync(index,html);console.log('Guide hooks applied to the web export.');
