import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatEuros } from '../lib/currency';
import { colors } from '../theme/tokens';

export function SavingsScreen({savingsBudget,savingsGoals,savingsTotal,onAddGoal,onEditGoal}) {
  const monthTotal=savingsGoals.reduce((sum,g)=>sum+g.monthlyContribution,0);
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <View style={s.row}><Text style={s.title}>Épargne</Text><Pressable onPress={onAddGoal} style={s.newButton}><Text style={s.newText}>+ Objectif</Text></Pressable></View>
    <View style={s.banner}><Text style={s.hint}>TOTAL ÉPARGNÉ</Text><Text style={s.total}>{formatEuros(savingsTotal)}</Text><Text style={s.muted}>{formatEuros(monthTotal)} ajoutés ce mois · {savingsGoals.length} objectif{savingsGoals.length>1?'s':''}</Text></View>
    <Text style={s.section}>Mes objectifs</Text>
    {!savingsGoals.length?<View style={s.card}><Text style={s.name}>Un projet à financer ?</Text><Text style={s.muted}>Crée ton objectif, même si tu pars de zéro. Chaque ajout fera progresser ton épargne.</Text><Pressable onPress={onAddGoal} style={s.add}><Text style={s.addText}>Créer mon premier objectif</Text></Pressable></View>:null}
    {savingsGoals.map(g=>{const pct=g.targetAmount>0?Math.min(Math.round(g.currentAmount/g.targetAmount*100),100):0;const remaining=Math.max(g.targetAmount-g.currentAmount,0);return <View key={g.id} style={s.card}>
      <View style={s.row}><Text style={s.name}>{g.emoji} {g.name}</Text><Pressable onPress={()=>onEditGoal(g)} accessibilityLabel={`Modifier ${g.name}`} style={s.edit}><Text style={s.editText}>Modifier</Text></Pressable></View>
      <Text style={s.balance}>{formatEuros(g.currentAmount)} <Text style={s.target}>sur {formatEuros(g.targetAmount)}</Text></Text>
      <View accessibilityRole="progressbar" accessibilityLabel={`Progression de ${g.name}`} accessibilityValue={{min:0,max:g.targetAmount,now:Math.min(g.currentAmount,g.targetAmount),text:`${pct} %`}} style={s.track}><View style={[s.fill,{width:`${pct}%`}]}/></View>
      <Text style={s.muted}>{remaining>0?`Encore ${formatEuros(remaining)} pour atteindre ton objectif`:'Objectif atteint !'}</Text>
      <Pressable onPress={()=>onEditGoal({...g,depositOnly:true})} accessibilityLabel={`Ajouter de l’épargne à ${g.name}`} style={s.add}><Text style={s.addText}>+ Ajouter de l’épargne</Text></Pressable>
    </View>})}
    <Text style={s.footnote}>Les montants reflètent tes saisies. Kloo ne déplace pas d’argent sur tes comptes.</Text>
  </ScrollView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.bg},content:{paddingTop:54,paddingHorizontal:18,paddingBottom:140},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{fontSize:24,fontWeight:'600',color:colors.text},newButton:{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12},newText:{fontSize:14,fontWeight:'600',color:colors.accent},banner:{padding:24,backgroundColor:'#fff6e6',borderRadius:22,marginTop:22,marginBottom:28},hint:{fontSize:12,color:'#9a5f08'},total:{fontSize:40,fontWeight:'600',color:'#9a5f08',marginVertical:8},muted:{fontSize:13,lineHeight:20,color:colors.textSoft},section:{fontSize:17,fontWeight:'600',color:colors.text,marginBottom:12},card:{padding:20,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,borderRadius:18,marginBottom:14},name:{fontSize:18,fontWeight:'600',color:colors.text,flexShrink:1},edit:{padding:10,minHeight:44},editText:{fontSize:13,color:colors.accent},balance:{fontSize:26,fontWeight:'600',color:colors.text,marginVertical:12},target:{fontSize:14,fontWeight:'400',color:colors.textSoft},track:{height:7,borderRadius:8,backgroundColor:'#f0e7d7',overflow:'hidden',marginBottom:12},fill:{height:'100%',backgroundColor:colors.amber},add:{padding:14,minHeight:48,borderRadius:12,backgroundColor:'#fff6e6',alignItems:'center',marginTop:18},addText:{fontSize:15,fontWeight:'600',color:'#9a5f08'},footnote:{fontSize:12,lineHeight:19,color:colors.textSoft,marginTop:12}});
