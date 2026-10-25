const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function compile(file){return ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,allowJs:true}}).outputText}
const moneyModule={exports:{}};vm.runInNewContext(compile(path.join(root,'web-app/lib/money.js')),{module:moneyModule,exports:moneyModule.exports});const money=moneyModule.exports;
function mount(name,props){
 const slots=[],effects=[];let cursor=0,tree;
 const hooks={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value]},useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]},useEffect(fn,deps){const index=cursor++;if(!slots[index]||deps.some((d,i)=>d!==slots[index][i])){slots[index]=deps;effects.push(fn)}}};
 const native=Object.fromEntries(['Modal','Pressable','ScrollView','Text','TextInput','View'].map(k=>[k,k]));native.Keyboard={dismiss(){}};native.StyleSheet={create:v=>v,absoluteFillObject:{}};
 const exports={};let ids=0;vm.runInNewContext(compile(path.join(root,'web-app/components',name+'.jsx')),{exports,setTimeout:()=>0,clearTimeout(){},require(module){if(module==='react')return hooks;if(module==='react-native')return native;if(module==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(module.endsWith('/AutoAmount'))return {AutoAmount:'AutoAmount'};if(module.endsWith('/money'))return money;if(module.endsWith('/currency'))return {formatEuros:n=>n.toFixed(2)+' EUR'};if(module.endsWith('/recurringExpenses'))return {getRecurringExpenseMonthKey:()=> '2026-10'};if(module.endsWith('/ids'))return {createClientUuid:()=> 'uuid-'+(++ids)};if(module.endsWith('/tokens'))return {colors:{}};throw Error(module)}});
 function render(){cursor=0;tree=exports[name](props);while(effects.length)effects.shift()();cursor=0;tree=exports[name](props);return tree}
 function all(node){return Array.isArray(node)?node.flatMap(x=>all(x)):node&&typeof node==='object'?[node,...all(node.props?.children)]:[]}
 render();return {render,find:predicate=>all(tree).find(predicate),field:label=>all(tree).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label).props,save:()=>all(tree).find(n=>n.type==='Pressable'&&n.props.accessibilityRole==='button').props.onPress(),text:()=>JSON.stringify(tree)};
}
(async()=>{
 for(const [input,expected] of [['10',10],['12,50',12.5],['1 234,56',1234.56],['0.10',.1],['0',0],['',null],['-5',null],['1e3',null],['12,5,0',null],['Infinity',null],['10.999',null]])assert.equal(money.parseMoney(input),expected,input);
 const original={currentAmount:50,monthlyContribution:0};const result=money.applyDeposit(original,10);assert.equal(result.currentAmount,60);assert.equal(result.monthlyContribution,10);assert.equal(original.currentAmount,50);assert.equal(money.applyDeposit({currentAmount:.1,monthlyContribution:0},.2).currentAmount,.3);
 console.log('PASS decimal commas, spaces, cent precision and invalid values; a 10 deposit raises 50 to 60 without mutating the original');
 let calls=0,resolve;const saved=[];const expense=mount('AddExpenseModal',{visible:true,categories:[{id:'courses',label:'Courses'}],onClose(){},onSave:data=>{calls++;saved.push(data);return new Promise(r=>resolve=r)}});
 expense.field('Montant de la dépense').onChangeText('12,50');expense.render();expense.field('Description facultative').onChangeText('Café');expense.render();
 const pending=expense.save();await expense.save();assert.equal(calls,1);resolve(false);await pending;expense.render();assert.equal(expense.field('Montant de la dépense').value,'12,50');assert.equal(expense.field('Description facultative').value,'Café');assert.ok(expense.text().includes('Ta saisie est conservée'));
 const retry=expense.save();resolve(true);await retry;expense.render();assert.equal(expense.field('Montant de la dépense').value,'');assert.equal(saved[0].amount,12.5);
 console.log('PASS expense double-click creates one pending save; failure keeps fields and successful retry clears them');
 const goals=[];const goal=mount('SavingsGoalModal',{visible:true,goal:{id:'g1',name:'Voyage',emoji:'x',targetAmount:100,currentAmount:50,monthlyContribution:0,depositOnly:true},onSave:async data=>{goals.push(data);return true}});
 goal.field('Montant à ajouter à l’épargne').onChangeText('10');goal.render();assert.ok(goal.text().includes('60.00 EUR'));await goal.save();assert.equal(goals[0].currentAmount,60);assert.equal(goals[0].monthlyContribution,10);assert.equal(goals[0].depositOnly,undefined);
 console.log('PASS savings preview, persisted balance and monthly total all include the new deposit exactly once');
 const newGoals=[];const fresh=mount('SavingsGoalModal',{visible:true,goal:null,onSave:async data=>{newGoals.push(data);return newGoals.length>1}});
 fresh.field('Nom de l’objectif').onChangeText('Projet');fresh.field('Montant cible').onChangeText('100');fresh.render();await fresh.save();fresh.render();await fresh.save();assert.equal(newGoals[0].id,newGoals[1].id);assert.equal(newGoals[0].currentAmount,0);
 console.log('PASS zero-balance goals can be created and failed new-goal retries reuse the same identifier');
 const budgets=[];let focused='';const budget=mount('BudgetConfigModal',{visible:true,categories:[{id:'courses',label:'Courses',planned:10},{id:'loyer',label:'Loyer',planned:20}],onSave:async rows=>{budgets.push(rows);return false}});
 budget.field('Budget Loyer').ref({focus(){focused='loyer'}});budget.field('Budget Courses').onSubmitEditing();assert.equal(focused,'loyer');
 budget.field('Budget Courses').onChangeText('123456,78');budget.render();await budget.save();budget.render();assert.equal(budgets[0][0].planned,123456.78);assert.equal(budget.field('Budget Courses').value,'123456,78');
 assert.equal(budget.find(n=>n.type==='ScrollView').props.keyboardShouldPersistTaps,'always');assert.equal(budget.find(n=>n.type==='ScrollView').props.keyboardDismissMode,'none');
 assert.ok(money.inputAmountFontSize('123456')<money.inputAmountFontSize('123'));assert.ok(money.inputAmountFontSize('123456789012345')>=16);
 console.log('PASS budget fields preserve taps, support next-field focus and decimal commas; long input amounts shrink without dropping below 16px');
})().catch(e=>{console.error(e);process.exitCode=1});
