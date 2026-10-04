import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import { useRecurring } from '@/hooks/useRecurring';
import { Recurring, describeSchedule, nextDueDate } from '@/lib/recurring';
import { CATEGORIES, Kind, SAVINGS_CATEGORY, INCOME_CATEGORY, canonicalCategory, MAX_AMOUNT, ymd } from '@/lib/budget';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { CAT_ICON } from '@/components/QuickLogChips';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const KINDS: { kind: Kind; label: string; color: string }[] = [
  { kind: 'expense', label: 'Expense', color: Colors.gold },
  { kind: 'income', label: 'Income', color: Colors.teal },
  { kind: 'saving', label: 'Invested', color: Colors.purple },
];

const niceDate = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function RecurringScreen() {
  const { items, loaded, add, update, remove } = useRecurring();
  const now = new Date();

  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<string>('Other');
  const [catTouched, setCatTouched] = useState(false);
  const [day, setDay] = useState(String(now.getDate()));
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = React.useRef<ScrollView>(null);

  const reset = () => { setAmount(''); setLabel(''); setCategory('Other'); setCatTouched(false); setDay(String(new Date().getDate())); setEditing(null); setError(null); };

  const submit = async () => {
    if (busy) return;
    const a = parseFloat(amount.replace(/[₹,\s]/g, ''));
    const d = parseInt(day, 10);
    if (!(a > 0)) return setError('Enter an amount greater than zero.');
    if (a > MAX_AMOUNT) return setError('That amount looks too large — check for an extra zero.');
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError('Day of the month must be between 1 and 31.');
    setError(null); setBusy(true);
    const cat = kind === 'expense' ? category : kind === 'saving' ? SAVINGS_CATEGORY : INCOME_CATEGORY;
    try {
      if (editing) {
        await update(editing.id, { kind, amount: Math.round(a * 100) / 100, category: cat, label: label.trim().slice(0, 60), day: d });
      } else {
        await add({ kind, amount: Math.round(a * 100) / 100, category: cat, label: label.trim().slice(0, 60), day: d, startDate: ymd(new Date()) });
      }
      reset();
    } catch {
      setError("Couldn't save — storage may be full or unavailable.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (r: Recurring) => {
    setEditing(r); setKind(r.kind); setAmount(String(r.amount)); setLabel(r.label); setDay(String(r.day)); setError(null);
    setCategory(r.kind === 'expense' ? r.category : 'Other'); setCatTouched(true);
    scroller.current?.scrollTo?.({ y: 0, animated: true });
  };

  const confirmDelete = (r: Recurring) => {
    const go = async () => { await remove(r.id); if (editing?.id === r.id) reset(); };
    const what = `${r.label || r.category} (${inr(r.amount)}/month)`;
    const msg = `Stop and delete ${what}? Entries already logged stay.`;
    if (Platform.OS === 'web') { if (window.confirm(msg)) go(); return; }
    Alert.alert('Delete recurring entry', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  const active = items.filter(i => i.active);
  const monthly = useMemo(() => ({
    out: active.filter(i => i.kind === 'expense').reduce((s, i) => s + i.amount, 0),
    invest: active.filter(i => i.kind === 'saving').reduce((s, i) => s + i.amount, 0),
    inc: active.filter(i => i.kind === 'income').reduce((s, i) => s + i.amount, 0),
  }), [active]);
  const k = KINDS.find(x => x.kind === kind)!;

  return (
    <TrackerScreen scrollRef={scroller} title="Recurring entries" subtitle="Rent, SIPs, subscriptions, salary. FIN·OS logs them for you each month on the day you pick — you can edit or delete any entry it creates.">
      {active.length > 0 && (
        <Card>
          <Text style={Typography.label}>EVERY MONTH</Text>
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            <View style={{ flex: 1 }}><Text style={Typography.caption}>Going out</Text><Text style={[s.sum, { color: Colors.gold }]}>{inr(monthly.out)}</Text></View>
            <View style={{ flex: 1 }}><Text style={Typography.caption}>Invested</Text><Text style={[s.sum, { color: Colors.purple }]}>{inr(monthly.invest)}</Text></View>
            <View style={{ flex: 1 }}><Text style={Typography.caption}>Coming in</Text><Text style={[s.sum, { color: Colors.teal }]}>{inr(monthly.inc)}</Text></View>
          </View>
        </Card>
      )}

      <Card accent={editing ? Colors.cyan : k.color}>
        {editing && (
          <View style={s.editBanner}>
            <Text style={s.editTxt}>Editing a recurring entry</Text>
            <TouchableOpacity onPress={reset} hitSlop={10}><Text style={s.cancel}>Cancel</Text></TouchableOpacity>
          </View>
        )}
        <View style={s.seg}>
          {KINDS.map(x => (
            <TouchableOpacity key={x.kind} style={[s.segBtn, kind === x.kind && { backgroundColor: x.color + '22', borderColor: x.color + '66' }]} onPress={() => setKind(x.kind)}
              accessibilityRole="button" accessibilityState={{ selected: kind === x.kind }}>
              <Text style={[s.segTxt, kind === x.kind && { color: x.color, fontWeight: '800' }]}>{x.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.lbl}>AMOUNT EACH MONTH</Text>
        <View style={s.amountWrap}>
          <Text style={s.rupee}>₹</Text>
          <TextInput style={s.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} accessibilityLabel="Amount each month" />
        </View>

        <Text style={s.lbl}>WHAT IS IT</Text>
        <TextInput style={s.input} value={label}
          onChangeText={v => { setLabel(v); if (!catTouched && kind === 'expense') setCategory(canonicalCategory(v)); }}
          placeholder={kind === 'expense' ? 'e.g. Rent' : kind === 'income' ? 'e.g. Salary' : 'e.g. SIP — Parag Parikh'} placeholderTextColor={Colors.textDim} maxLength={60} accessibilityLabel="Description" />

        {kind === 'expense' && (
          <>
            <Text style={s.lbl}>CATEGORY</Text>
            <View style={s.chips}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, category === c && s.chipOn]} onPress={() => { setCategory(c); setCatTouched(true); }} accessibilityRole="button" accessibilityState={{ selected: category === c }}>
                  <Text style={[s.chipTxt, category === c && s.chipTxtOn]}>{CAT_ICON[c]} {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={s.lbl}>DAY OF THE MONTH</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <TextInput style={[s.input, { width: 80, textAlign: 'center' }]} value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} accessibilityLabel="Day of the month" />
          <Text style={[Typography.caption, { flex: 1 }]}>{/^\d{1,2}$/.test(day) && +day >= 1 && +day <= 31 ? describeSchedule({ day: +day }) : 'Pick a day from 1 to 31'}</Text>
        </View>
        {!editing && <Text style={[Typography.caption, { marginTop: 6, lineHeight: 16 }]}>Starts from the next time that day comes around — nothing is back-filled.</Text>}

        {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
        <TouchableOpacity style={[s.submit, { backgroundColor: editing ? Colors.cyan : k.color }, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button">
          <Text style={s.submitTxt}>{editing ? 'Save changes' : 'Add recurring entry'}</Text>
        </TouchableOpacity>
      </Card>

      <SectionLabel>{`YOUR RECURRING ENTRIES · ${items.length}`}</SectionLabel>
      {loaded && items.length === 0 && (
        <Card><Text style={[Typography.caption, { lineHeight: 18 }]}>None yet. Add rent, your SIP or a subscription above — or tick "Repeat every month" when you log an entry.</Text></Card>
      )}
      {items.map(r => {
        const next = nextDueDate(r, now);
        const color = KINDS.find(x => x.kind === r.kind)!.color;
        return (
          <Card key={r.id} style={!r.active ? { opacity: 0.55 } : undefined}>
            <TouchableOpacity style={s.row} onPress={() => startEdit(r)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${r.label || r.category}, ${inr(r.amount)} per month. Tap to edit`}>
              <Text style={s.icon}>{CAT_ICON[r.category] ?? '📦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{r.label || r.category}</Text>
                <Text style={Typography.caption}>{describeSchedule(r)}</Text>
                <Text style={[Typography.caption, { color: Colors.textDim }]}>{r.active ? (next ? `Next: ${niceDate(next)}` : '') : 'Paused'}</Text>
              </View>
              <Text style={[s.amt, { color }]}>{r.kind === 'income' ? '+' : ''}{inr(r.amount)}</Text>
            </TouchableOpacity>
            <View style={s.actions}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Switch value={r.active} onValueChange={v => { void update(r.id, { active: v }); }} trackColor={{ true: Colors.cyan, false: Colors.borderMed }} accessibilityLabel={`${r.label || r.category} active`} />
                <Text style={Typography.caption}>{r.active ? 'Active' : 'Paused'}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(r)} hitSlop={10}><Text style={s.delete}>Delete</Text></TouchableOpacity>
            </View>
          </Card>
        );
      })}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  sum: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  editBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 8, marginBottom: Spacing.md },
  editTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 12 },
  cancel: { color: Colors.textMuted, fontWeight: '700', fontSize: 12 },
  seg: { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: Radii.md, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radii.sm, borderWidth: 1, borderColor: 'transparent' },
  segTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  lbl: { ...Typography.label, marginTop: Spacing.md, marginBottom: 6 },
  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md },
  rupee: { color: Colors.textMuted, fontSize: 22, marginRight: 6 },
  amountInput: { flex: 1, color: Colors.textPrimary, fontSize: 26, fontWeight: '800', paddingVertical: 10 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: Colors.bg },
  chipOn: { borderColor: 'rgba(240,165,0,0.7)', backgroundColor: 'rgba(240,165,0,0.12)' },
  chipTxt: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  chipTxtOn: { color: Colors.gold, fontWeight: '800' },
  error: { color: Colors.red, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
  submit: { borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md },
  submitTxt: { color: Colors.bg, fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { fontSize: 22, width: 36 },
  name: { ...Typography.body, fontWeight: '700' },
  amt: { fontSize: 15, fontWeight: '900', marginLeft: Spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  delete: { color: Colors.red, fontSize: 12, fontWeight: '700' },
});
