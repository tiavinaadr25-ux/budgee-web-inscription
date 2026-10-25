// Rebuild the editable web-only forms against the React Native modules already in the Expo export.
// The app's data layer, authentication and payment integrations remain in that export.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const bundleName = 'index-51b57ea0a19a6bf49f360ef6f56c6ba9.js';
const components = [[190, 'AddExpenseModal'], [1957, 'BudgetConfigModal'], [1973, 'SavingsGoalModal'], [2200, 'SavingsScreen'], [2193, 'DashboardScreen']];
const native = { Alert:157, Keyboard:191, KeyboardAvoidingView:194, Modal:195, Platform:97, Pressable:200, ScrollView:207, StyleSheet:44, Text:159, TextInput:212, View:189 };
const dependencies = [36,147,157,191,194,195,97,200,207,44,159,212,189,213,214,1956,1974,1959,2194,2195];
function compile(file) {
  return ts.transpileModule(fs.readFileSync(file,'utf8'), { fileName:file, compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,allowJs:true} }).outputText;
}
const money = compile(path.join(root,'web-app/lib/money.js'));
const autoAmount = compile(path.join(root,'web-app/components/AutoAmount.jsx'));
for (const base of ['public/_expo/static/js/web','public/app/_expo/static/js/web']) {
  const file = path.join(root,base,bundleName); let source=fs.readFileSync(file,'utf8');
  for (const [id,name] of components) {
    const startMarker=`/* KLOO_WEB_FLOW:${id} */`, endMarker=`/* END_KLOO_WEB_FLOW:${id} */`;
    let start=source.indexOf(startMarker), end;
    if(start>=0) end=source.indexOf(endMarker,start)+endMarker.length;
    else {
      const token=`,${id},[`; const idAt=source.indexOf(token);
      if(idAt<0 || source.indexOf(token,idAt+1)>=0) throw Error('Expo component id changed: '+name);
      start=source.lastIndexOf('__d(',idAt); end=source.indexOf('\n__d(',idAt);
      if(start<0||end<0||!source.slice(start,idAt).includes('_e.'+name+'=')) throw Error('Expo component changed: '+name);
    }
    const code=compile(path.join(root,'web-app/components',name+'.jsx'));
    const wrapper=`${startMarker}\n__d(function(global,metroRequire,importDefault,importAll,module,exports,dependencyMap){
      function load(id){return metroRequire(dependencyMap[${JSON.stringify(dependencies)}.indexOf(id)])}
      function unwrap(id){const value=load(id);return value.default??value}
      const native=Object.fromEntries(Object.entries(${JSON.stringify(native)}).map(([name,id])=>[name,unwrap(id)]));
      const money=(()=>{const exports={};${money}\nreturn exports})();
      const autoAmount=(()=>{const exports={};${autoAmount}\nreturn exports})();
      function require(name){switch(name){
        case 'react':return load(36);case 'react/jsx-runtime':return load(147);case 'react-native':return native;
        case '../lib/recurringExpenses':return load(213);case '../lib/ids':return load(1974);
        case '../theme/tokens':return load(214);case '../lib/currency':return load(1956);case '../lib/money':return money;
        case './AutoAmount':case '../components/AutoAmount':return autoAmount;
        case '../components/SourceBadge':return load(1959);case '../components/TransactionActionsMenu':return load(2194);
        case '../lib/transactions':return load(2195);
        default:throw Error('Unmapped web import: '+name);
      }}
      ${code}
    },${id},${JSON.stringify(dependencies)});\n${endMarker}`;
    source=source.slice(0,start)+wrapper+source.slice(end);
  }
  // Old forms dismissed the keyboard even when the user tapped a different input.
  source=source.replace(/onTouchStart:[A-Za-z_$][\w$]*\.default\.dismiss,/g,'');
  fs.writeFileSync(file,source);
}
console.log('Expense and savings web flows rebuilt from editable sources.');
