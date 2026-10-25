const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
let size=36,resize,measured='';const node={clientWidth:120,parentElement:null};const cleanups=[];
const fixtureModule={exports:{}};
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../web-app/components/AutoAmount.jsx'),'utf8'),{fileName:'AutoAmount.jsx',compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,allowJs:true}}).outputText;
const effects=[];
vm.runInNewContext(source,{exports:fixtureModule.exports,module:fixtureModule,window:{getComputedStyle:()=>({fontWeight:'600',fontFamily:'Arial',letterSpacing:'0'}),addEventListener(type,fn){resize=fn},removeEventListener(){}},document:{createElement:()=>({getContext:()=>({measureText(text){measured=text;return {width:240}}})})},require(name){if(name==='react')return {useRef:()=>({current:node}),useState:()=>[size,n=>size=n],useEffect:fn=>effects.push(fn)};if(name==='react-native')return {Text:'Text'};if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props})};throw Error(name)}});
let tree=fixtureModule.exports.AutoAmount({children:['-','123456,78 €'],maxFontSize:36,minFontSize:12});cleanups.push(effects.shift()());assert.equal(measured,'-123456,78 €');assert.ok(size<36&&size>=12);
tree=fixtureModule.exports.AutoAmount({children:'123456,78 €',maxFontSize:36,minFontSize:12});assert.ok(tree.props.style.at(-1).fontSize<36);assert.equal(tree.props.numberOfLines,1);
node.clientWidth=500;resize();assert.equal(size,36);cleanups.forEach(fn=>fn());
console.log('PASS amount shrinks to its real container, preserves full text and returns to normal size when space grows');
for(const base of ['public/_expo/static/js/web','public/app/_expo/static/js/web']){const bundle=fs.readFileSync(path.join(__dirname,'..',base,'index-51b57ea0a19a6bf49f360ef6f56c6ba9.js'),'utf8');assert.ok(!/onTouchStart:[A-Za-z_$][\w$]*\.default\.dismiss,/.test(bundle));assert.ok(bundle.includes('/* KLOO_WEB_FLOW:1957 */'));assert.ok(bundle.includes('/* KLOO_WEB_FLOW:2193 */'))}
console.log('PASS both web apps contain the new budget/dashboard and no form-wide touch-to-dismiss handlers');
