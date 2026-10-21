const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const name = 'index-51b57ea0a19a6bf49f360ef6f56c6ba9.js';
const patches = [
 ["function Z(e){return e?","function Z(e){if(e&&'voaray'===e.provider)return e.currentPeriodEndAt&&new Date(e.currentPeriodEndAt).getTime()>Date.now()?'Accès Mobile Money actif':'Accès Mobile Money terminé';return e?"],
 ['function Vt(){nt(!0)}','function Vt(){if(globalThis.KlooGuide){globalThis.KlooGuide.open(Et);return}nt(!0)}'],
 ["st(!ne(Et))},[ce,Et,Ot])", "st(!ne(Et)),globalThis.KlooGuide&&globalThis.KlooGuide.welcome(Et)},[ce,Et,Ot])"],
];
for(const base of ['public/_expo/static/js/web','public/app/_expo/static/js/web']){
 const file=path.join(root,base,name);let source=fs.readFileSync(file,'utf8');
 for(const [before,after] of patches){if(source.includes(after))continue;if(source.split(before).length!==2)throw new Error('Expo guide hook changed: '+before);source=source.replace(before,after)}
 fs.writeFileSync(file,source);
}
const index=path.join(root,'public/app/index.html');let html=fs.readFileSync(index,'utf8');
if(!html.includes('/app/kloo-guide.js'))html=html.replace('<script src="/_expo/', '<script src="/app/kloo-guide.js" defer></script>\n  <script src="/_expo/');
fs.writeFileSync(index,html);console.log('Guide hooks applied to the web export.');
