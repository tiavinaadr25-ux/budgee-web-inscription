import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatEuros } from '../lib/currency';
import { colors } from '../theme/tokens';
import { parseMoney, inputAmountFontSize, notify } from '../lib/money';
import { AutoAmount } from './AutoAmount';

export function BudgetConfigModal({ categories, visible, onClose, onSave }) {
  const [values,setValues]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const inputs=useRef({}),locked=useRef(false);
  useEffect(()=>{if(visible){setValues(Object.fromEntries(categories.map(c=>[c.id,String(c.planned)])));setError('')}},[categories,visible]);
  const total=categories.reduce((sum,c)=>sum+(parseMoney(values[c.id]??c.planned)||0),0);
  function close(){if(!locked.current){Keyboard.dismiss();onClose()}}
  async function save(){
    if(locked.current)return;
    if(categories.some(c=>parseMoney(values[c.id]??c.planned)===null)){setError('Vérifie les montants. Tu peux utiliser une virgule pour les centimes.');return}
    locked.current=true;setBusy(true);setError('');
    try{const result=await onSave(categories.map(c=>({...c,planned:parseMoney(values[c.id]??c.planned)})));if(result===false){setError('Budget non enregistré. Tes montants sont conservés, réessaie.');return}Keyboard.dismiss();notify('Budget enregistré.');}
    catch{setError('Impossible d’enregistrer le budget. Tes montants sont conservés.');}
    finally{locked.current=false;setBusy(false)}
  }
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={close}><View style={s.root}>
    <Pressable accessibilityLabel="Fermer le budget" style={s.backdrop} onPress={close}/><View testID="budget-sheet" style={s.sheet}>
      <View style={s.header}><Text style={s.title}>Modifier le budget</Text><Pressable disabled={busy} onPress={close} accessibilityLabel="Fermer" style={s.close}><Text style={s.cross}>×</Text></Pressable></View>
      <Text style={s.subtitle}>Touche un montant pour le modifier, puis passe directement à la ligne suivante.</Text>
      <ScrollView keyboardShouldPersistTaps="always" keyboardDismissMode="none" contentContainerStyle={s.form}>
        {categories.map((c,index)=><View key={c.id} style={s.row}>
          <Pressable disabled={busy} onPress={()=>inputs.current[c.id]?.focus()} accessibilityLabel={`Modifier le budget ${c.label}`} style={s.rowLeft}><Text style={s.emoji}>{c.emoji}</Text><Text style={s.label}>{c.label}</Text></Pressable>
          <TextInput ref={node=>{inputs.current[c.id]=node}} accessibilityLabel={`Budget ${c.label}`} value={values[c.id]??''} editable={!busy} onChangeText={value=>{setValues(old=>({...old,[c.id]:value}));setError('')}} keyboardType="decimal-pad" inputMode="decimal" returnKeyType={index<categories.length-1?'next':'done'} blurOnSubmit={false} onSubmitEditing={()=>{if(index<categories.length-1)inputs.current[categories[index+1].id]?.focus();else save()}} style={[s.input,{fontSize:inputAmountFontSize(values[c.id]??'',24)}]}/>
        </View>)}
        <View style={[s.row,s.totalRow]}><Text style={s.totalLabel}>Budget total</Text><View style={s.totalValue}><AutoAmount maxFontSize={24} minFontSize={14} style={{fontWeight:'600',color:colors.accent,textAlign:'right'}}>{formatEuros(total)}</AutoAmount></View></View>
        {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
      </ScrollView>
      <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[s.save,busy&&{opacity:.6}]}><Text style={s.saveText}>{busy?'Enregistrement…':'Enregistrer le budget'}</Text></Pressable>
    </View>
  </View></Modal>;
}
const s=StyleSheet.create({root:{flex:1,justifyContent:'flex-end'},backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(22,28,39,.4)'},sheet:{maxHeight:'92%',width:'100%',maxWidth:560,alignSelf:'center',padding:20,paddingBottom:28,borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:'#fff'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},title:{fontSize:22,fontWeight:'600',color:colors.text},close:{padding:8,minWidth:44,alignItems:'center'},cross:{fontSize:28,color:colors.textSoft},subtitle:{fontSize:13,lineHeight:20,color:colors.textSoft,marginBottom:18},form:{gap:10,paddingBottom:12},row:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.bg,minWidth:0},rowLeft:{flexDirection:'row',alignItems:'center',gap:8,flex:1,minWidth:0,paddingVertical:10},emoji:{fontSize:20},label:{fontSize:14,fontWeight:'500',color:colors.text,flexShrink:1},input:{width:'44%',maxWidth:170,minWidth:0,paddingVertical:12,paddingHorizontal:10,borderRadius:10,borderWidth:1,borderColor:colors.border,backgroundColor:'#fff',fontWeight:'500',color:colors.text,textAlign:'right'},totalRow:{backgroundColor:colors.accentSoft},totalLabel:{fontSize:14,fontWeight:'600',color:colors.text,flex:1,minWidth:0},totalValue:{width:'56%',minWidth:0},error:{fontSize:14,lineHeight:20,color:'#ad3434'},save:{padding:16,minHeight:52,alignItems:'center',backgroundColor:colors.accent,borderRadius:14,marginTop:14},saveText:{fontSize:16,fontWeight:'600',color:'#fff'}});
