import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getRecurringExpenseMonthKey } from '../lib/recurringExpenses';
import { formatEuros } from '../lib/currency';
import { colors } from '../theme/tokens';
import { parseMoney, notify } from '../lib/money';

export function AddExpenseModal({ visible, categories, onClose, onSave }) {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('courses');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false), amountInput = useRef(null);
  const value = parseMoney(amount);
  const selected = categories.find(c => c.id === categoryId) || categories[0];
  useEffect(() => { if (visible) { setError(''); const t = setTimeout(() => amountInput.current?.focus(), 180); return () => clearTimeout(t); } }, [visible]);
  function close() { if (!locked.current) { Keyboard.dismiss(); onClose(); } }
  async function save() {
    if (locked.current) return;
    if (value === null || value <= 0 || !selected) { setError('Entre un montant positif, par exemple 12,50.'); amountInput.current?.focus(); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      const saved = await onSave({ name: name.trim() || selected.label, amount: value, categoryId: selected.id,
        source: 'manual', dayLabel: "Aujourd’hui", monthKey: getRecurringExpenseMonthKey(new Date()) });
      if (saved === false) { setError('La dépense n’a pas été enregistrée. Ta saisie est conservée : réessaie.'); return; }
      Keyboard.dismiss(); setAmount(''); setName(''); notify(`${formatEuros(value)} ajoutés · ${selected.label}`);
    } catch { setError('Enregistrement impossible. Vérifie ta connexion puis réessaie, ta saisie est conservée.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={close}>
    <View style={s.root}><Pressable accessibilityLabel="Fermer la saisie" style={s.backdrop} onPress={close} />
      <View style={s.sheet} accessibilityViewIsModal>
        <View style={s.header}><Text style={s.title}>Nouvelle dépense</Text><Pressable disabled={busy} onPress={close} accessibilityLabel="Fermer" style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <Text style={s.label}>Combien as-tu dépensé ?</Text>
          <TextInput ref={amountInput} accessibilityLabel="Montant de la dépense" keyboardType="decimal-pad" inputMode="decimal" placeholder="0,00" placeholderTextColor={colors.textSoft} value={amount} editable={!busy} onChangeText={v => {setAmount(v);setError('');}} onSubmitEditing={save} returnKeyType="done" style={s.amount} />
          <Text style={s.label}>Dans quelle catégorie ?</Text><View style={s.categories}>{categories.map(c => <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{checked:selected?.id === c.id}} disabled={busy} onPress={() => setCategoryId(c.id)} style={[s.category, selected?.id === c.id && s.selected]}><Text style={s.emoji}>{c.emoji}</Text><Text style={s.categoryText}>{c.label}</Text>{selected?.id === c.id && <Text style={s.check}>✓</Text>}</Pressable>)}</View>
          <Text style={s.label}>Description <Text style={s.optional}>(facultatif)</Text></Text>
          <TextInput accessibilityLabel="Description facultative" placeholder={`Ex. ${selected?.label || 'Courses'}, café…`} placeholderTextColor={colors.textSoft} value={name} editable={!busy} onChangeText={setName} onSubmitEditing={save} returnKeyType="done" style={s.input} />
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : <Text style={s.hint}>Aujourd’hui · Le budget sera mis à jour dès l’enregistrement.</Text>}
        </ScrollView>
        <View style={s.footer}><Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[s.save, busy && s.disabled]}><Text style={s.saveText}>{busy ? 'Enregistrement…' : value > 0 ? `Ajouter ${formatEuros(value)}` : 'Ajouter la dépense'}</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  root:{flex:1,justifyContent:'flex-end'},backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(22,28,39,.4)'},
  sheet:{maxHeight:'92%',width:'100%',maxWidth:560,alignSelf:'center',backgroundColor:'#fff',borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,paddingBottom:28},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:18},title:{fontSize:22,fontWeight:'600',color:colors.text},close:{padding:8,minWidth:44,alignItems:'center'},closeText:{fontSize:28,color:colors.textSoft},content:{paddingBottom:12},label:{fontSize:14,fontWeight:'600',color:colors.text,marginBottom:10},
  amount:{fontSize:38,color:colors.text,padding:14,borderWidth:1,borderColor:colors.border,borderRadius:14,marginBottom:22,backgroundColor:colors.bg},
  categories:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:22},category:{flexDirection:'row',alignItems:'center',gap:7,paddingVertical:12,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:12,minHeight:46,backgroundColor:'#fff'},selected:{borderColor:colors.accent,backgroundColor:colors.accentSoft},emoji:{fontSize:18},categoryText:{fontSize:14,color:colors.text},check:{color:colors.accent,fontWeight:'700'},optional:{fontWeight:'400',color:colors.textSoft},
  input:{fontSize:16,padding:14,borderWidth:1,borderColor:colors.border,borderRadius:12,color:colors.text,marginBottom:12},hint:{fontSize:12,lineHeight:18,color:colors.textSoft},error:{fontSize:14,lineHeight:20,color:'#ad3434'},footer:{paddingTop:14},save:{padding:16,minHeight:52,borderRadius:14,backgroundColor:colors.accent,alignItems:'center'},saveText:{fontSize:16,fontWeight:'600',color:'#fff'},disabled:{opacity:.6}
});
