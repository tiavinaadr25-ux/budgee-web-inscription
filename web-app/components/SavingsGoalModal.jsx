import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createClientUuid } from '../lib/ids';
import { formatEuros } from '../lib/currency';
import { colors } from '../theme/tokens';
import { parseMoney, applyDeposit, notify } from '../lib/money';

export function SavingsGoalModal({ goal, visible, onClose, onSave, onDelete }) {
  const [name,setName]=useState(''),[emoji,setEmoji]=useState('💰'),[target,setTarget]=useState(''),[current,setCurrent]=useState(''),[deposit,setDeposit]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const locked=useRef(false),input=useRef(null),draftId=useRef(null),depositOnly=Boolean(goal?.depositOnly);
  useEffect(()=>{if(visible){setName(goal?.name||'');setEmoji(goal?.emoji||'💰');setTarget(goal?String(goal.targetAmount):'');setCurrent(goal?String(goal.currentAmount):'');setDeposit('');setError('');const t=setTimeout(()=>input.current?.focus(),180);return()=>clearTimeout(t)}},[goal,visible]);
  const add=deposit.trim()?parseMoney(deposit):0,base=current.trim()?parseMoney(current):0,cible=parseMoney(target);
  const total=base!==null&&add!==null?Math.round((base+add)*100)/100:null;
  function close(){if(!locked.current){Keyboard.dismiss();onClose()}}
  async function save(){
    if(locked.current)return;
    if(!name.trim()||cible===null||cible<=0||base===null||add===null||(depositOnly&&add<=0)){setError(depositOnly?'Entre le montant à ajouter, par exemple 10.':'Vérifie le nom, la cible et les montants. Les centimes peuvent être séparés par une virgule.');return}
    const existing={id:goal?.id||(draftId.current??=createClientUuid()),emoji:emoji||'💰',name:name.trim(),targetAmount:cible,currentAmount:base,monthlyContribution:goal?.monthlyContribution||0};
    const updated=add>0?applyDeposit(existing,add):existing;
    locked.current=true;setBusy(true);setError('');
    try{const saved=await onSave(updated);if(saved===false){setError('Épargne non enregistrée. Ta saisie est conservée, réessaie.');return}draftId.current=null;Keyboard.dismiss();notify(add>0?`${formatEuros(add)} ajoutés à ${updated.name} · Total : ${formatEuros(updated.currentAmount)}`:'Objectif enregistré.');}
    catch{setError('Impossible d’enregistrer ton épargne. Vérifie ta connexion puis réessaie.');}
    finally{locked.current=false;setBusy(false)}
  }
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={close}><View style={s.root}><Pressable accessibilityLabel="Fermer" style={s.backdrop} onPress={close}/><View style={s.sheet} accessibilityViewIsModal>
    <View style={s.header}><Text style={s.title}>{depositOnly?'Ajouter de l’épargne':goal?'Modifier l’objectif':'Nouvel objectif'}</Text><Pressable accessibilityLabel="Fermer" disabled={busy} onPress={close} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:12}}>
      {depositOnly?<><Text style={s.goal}>{goal.emoji} {goal.name}</Text><Text style={s.hint}>Déjà épargné : {formatEuros(goal.currentAmount)}</Text></>:<>
        <Text style={s.label}>Nom de l’objectif</Text><TextInput ref={input} accessibilityLabel="Nom de l’objectif" value={name} onChangeText={setName} placeholder="Ex. Voyage, fonds de secours…" style={s.input} editable={!busy}/>
        <Text style={s.label}>Emoji <Text style={s.hint}>(facultatif)</Text></Text><TextInput accessibilityLabel="Emoji" value={emoji} onChangeText={setEmoji} style={[s.input,{maxWidth:90}]} editable={!busy}/>
        <Text style={s.label}>Montant à atteindre</Text><TextInput accessibilityLabel="Montant cible" inputMode="decimal" keyboardType="decimal-pad" value={target} onChangeText={setTarget} placeholder="Ex. 500" style={s.input} editable={!busy}/>
        <Text style={s.label}>{goal?'Total déjà épargné':'Épargne de départ'} <Text style={s.hint}>({goal?'corriger le solde':'facultatif'})</Text></Text><TextInput accessibilityLabel="Épargne déjà enregistrée" inputMode="decimal" keyboardType="decimal-pad" value={current} onChangeText={setCurrent} placeholder="0" style={s.input} editable={!busy}/>
      </>}
      <Text style={[s.label,{marginTop:depositOnly?22:4}]}>{depositOnly?'Combien veux-tu ajouter ?':'Ajouter maintenant (facultatif)'}</Text>
      <TextInput ref={depositOnly?input:undefined} accessibilityLabel="Montant à ajouter à l’épargne" inputMode="decimal" keyboardType="decimal-pad" value={deposit} onChangeText={v=>{setDeposit(v);setError('')}} placeholder="0,00" style={[s.input,depositOnly&&s.bigInput]} editable={!busy} onSubmitEditing={save} returnKeyType="done"/>
      <View style={s.summary}><Text style={s.label}>Total après enregistrement</Text><Text style={s.total}>{total===null?'—':formatEuros(total)}</Text><Text style={s.hint}>Un ajout de 10 augmente immédiatement ton épargne de 10. Ce suivi ne réalise aucun virement bancaire.</Text></View>
      {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
      {!depositOnly&&goal&&onDelete?<Pressable disabled={busy} style={{paddingVertical:14}} onPress={()=>onDelete(goal.id)}><Text style={{color:'#ad3434'}}>Supprimer cet objectif</Text></Pressable>:null}
    </ScrollView>
    <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[s.save,busy&&{opacity:.6}]}><Text style={s.saveText}>{busy?'Enregistrement…':add>0?`Ajouter ${formatEuros(add)} à l’épargne`:'Enregistrer l’objectif'}</Text></Pressable>
  </View></View></Modal>;
}
const s=StyleSheet.create({root:{flex:1,justifyContent:'flex-end'},backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(22,28,39,.4)'},sheet:{width:'100%',maxWidth:560,alignSelf:'center',maxHeight:'92%',backgroundColor:'#fff',padding:22,paddingBottom:28,borderTopLeftRadius:24,borderTopRightRadius:24},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:18},title:{fontSize:22,fontWeight:'600',color:colors.text},close:{padding:8,minWidth:44,alignItems:'center'},closeText:{fontSize:28,color:colors.textSoft},goal:{fontSize:20,fontWeight:'600',color:colors.text},label:{fontSize:14,fontWeight:'600',color:colors.text,marginBottom:8},hint:{fontSize:12,lineHeight:19,fontWeight:'400',color:colors.textSoft},input:{padding:14,fontSize:16,color:colors.text,borderWidth:1,borderColor:colors.border,borderRadius:12,marginBottom:18},bigInput:{fontSize:34},summary:{padding:16,borderRadius:14,backgroundColor:'#fff6e6',marginBottom:16},total:{fontSize:30,fontWeight:'600',color:'#9a5f08',marginBottom:6},error:{fontSize:14,lineHeight:20,color:'#ad3434',marginBottom:14},save:{padding:16,minHeight:52,borderRadius:14,backgroundColor:colors.amber,alignItems:'center',marginTop:12},saveText:{fontSize:16,fontWeight:'600',color:'#fff'}});
