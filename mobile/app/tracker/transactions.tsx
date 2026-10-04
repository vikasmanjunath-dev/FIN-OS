import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useTransactions } from '@/hooks/useTransactions';
import { useQuickLog } from '@/hooks/useQuickLog';
import { useRecurring } from '@/hooks/useRecurring';
import { QuickLogChips, CAT_ICON } from '@/components/QuickLogChips';
import { QuickChip } from '@/lib/quicklog';
import { describeSchedule, ordinal } from '@/lib/recurring';
import { useTrackers } from '@/hooks/useTrackers';
import {
  CATEGORIES, IndexedTxn, Kind, SAVINGS_CATEGORY, INCOME_CATEGORY, canonicalCategory, monthTotals, monthSpend, validateEntry, ymd,
} from '@/lib/budget';
import { TrackerScreen, Card, SectionLabel, Bar, Stat, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const KINDS: { kind: Kind; label: string; color: string; verb: string }[] = [
  { kind: 'expense', label: 'Expense', color: Colors.gold, verb: 'Add expense' },
  { kind: 'income', label: 'Income', color: Colors.teal, verb: 'Add income' },
  { kind: 'saving', label: 'Invested', color: Colors.purple, verb: 'Add investment' },
];


const monthLabel = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const shiftMonth = (m: string, by: number) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + by, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dayLabel = (iso: string, today: string, yesterday: string) =>
  iso === today ? 'Today' : iso === yesterday ? 'Yesterday'
  : new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export default function TransactionsScreen() {
  const { txns, loaded, add, update, remove } = useTransactions();
  const quick = useQuickLog(6);
  const { items: recurring, add: addRecurring } = useRecurring();
  const { data: td } = useTrackers();

  const now = new Date();
  const today = ymd(now);
  const yd = new Date(now); yd.setDate(yd.getDate() - 1);
  const yesterday = ymd(yd);
  const thisMonth = today.slice(0, 7);

  const [month, setMonth] = useState(thisMonth);

  // form state
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<string>('Other');
  const [catTouched, setCatTouched] = useState(false);
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<IndexedTxn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const onLabel = (v: string) => {
    setLabel(v);
    if (!catTouched && kind === 'expense') setCategory(canonicalCategory(v)); // follow the label until the user picks one
  };

  const reset = () => {
    setAmount(''); setLabel(''); setCategory('Other'); setCatTouched(false); setEditing(null); setError(null); setRepeat(false);
  };

  const submit = async () => {
    if (busy) return;
    const v = validateEntry({ amount, date, label }, new Date());
    if (!v.ok) return setError(v.error);
    setError(null); setBusy(true);
    try {
      const entry = { date: v.date, amount: v.amount, kind, category: kind === 'expense' ? category : kind === 'saving' ? SAVINGS_CATEGORY : INCOME_CATEGORY, label: v.label };
      if (editing) {
        const ok = await update(editing.id, entry);
        setNotice(ok ? 'Changes saved' : 'That entry no longer exists');
      } else {
        await add(entry);
        let extra = '';
        if (repeat && canRepeat) {
          const day = +v.date.slice(8, 10);
          const dup = recurring.some(r => r.active && r.kind === kind && r.category === entry.category && r.label === entry.label && r.amount === entry.amount && r.day === day);
          if (dup) extra = ' · already repeats monthly';
          else {
            // the entry just logged IS this month's occurrence, so the schedule starts next month
            await addRecurring({ kind, amount: v.amount, category: entry.category, label: entry.label, day, startDate: v.date, lastRun: v.date.slice(0, 7) });
            extra = ` · repeats on the ${ordinal(day)}${day > 28 ? ' (or last day)' : ''} each month`;
          }
        }
        setNotice(`Added ${inr(v.amount)}${kind === 'expense' ? ` · ${category}` : kind === 'income' ? ' income' : ' invested'}${extra}`);
        setMonth(v.date.slice(0, 7)); // jump to where the new entry lives
      }
      reset();
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setError("Couldn't save — storage may be full or unavailable.");
    } finally {
      setBusy(false);
    }
  };

  const prefill = (c: QuickChip) => {
    reset(); setKind(c.kind); setAmount(String(c.amount)); setLabel(c.label); setDate(today);
    setCategory(c.kind === 'expense' ? c.category : 'Other'); setCatTouched(true);
    scroller.current?.scrollTo?.({ y: 0, animated: true });
  };

  const startEdit = (t: IndexedTxn) => {
    setEditing(t); setKind(t.kind); setAmount(String(t.amount)); setLabel(t.label); setDate(t.date); setError(null);
    setCategory(t.kind === 'expense' ? t.category : 'Other'); setCatTouched(true);
    scroller.current?.scrollTo?.({ y: 0, animated: true });
  };

  const confirmDelete = (t: IndexedTxn) => {
    const go = async () => { await remove(t.id); if (editing?.id === t.id) reset(); };
    const what = `${inr(t.amount)} ${t.label || t.category}`;
    if (Platform.OS === 'web') { if (window.confirm(`Delete ${what}?`)) go(); return; }
    Alert.alert('Delete entry', `Delete ${what}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  const inMonth = useMemo(() => txns.filter(t => t.date.slice(0, 7) === month), [txns, month]);
  const totals = useMemo(() => monthTotals(txns, month), [txns, month]);
  const byCat = useMemo(() => {
    const { byCat: c, total } = monthSpend(txns, month);
    return { rows: Object.entries(c).sort((a, b) => b[1] - a[1]), total };
  }, [txns, month]);
  const groups = useMemo(() => {
    const m = new Map<string, IndexedTxn[]>();
    inMonth.forEach(t => m.set(t.date, [...(m.get(t.date) ?? []), t]));
    return [...m.entries()];
  }, [inMonth]);

  const k = KINDS.find(x => x.kind === kind)!;
  // "repeat monthly" only makes sense for a new entry dated this month (the schedule starts next month — no back-filling)
  const canRepeat = !editing && date.slice(0, 7) === thisMonth && validateEntry({ amount: '1', date, label: '' }).ok;
  const limits = td.budgetLimits;

  return (
    <TrackerScreen scrollRef={scroller} title="Transactions" subtitle="Log what you spend, earn and invest. It powers your category budgets and the Spending Awareness part of your Health Score.">
      {/* ── Quick log ── */}
      {quick.chips.length > 0 && (
        <>
          <SectionLabel>QUICK LOG · ONE TAP, DATED TODAY</SectionLabel>
          <Card>
            <QuickLogChips chips={quick.chips} onLog={quick.log} onEdit={prefill} undo={quick.undo} onUndo={quick.undoLast} hint="Long-press a shortcut to change the amount first." />
          </Card>
        </>
      )}

      {/* ── Entry form ── */}
      <Card accent={editing ? Colors.cyan : k.color}>
        {editing && (
          <View style={s.editBanner}>
            <Text style={s.editTxt}>Editing an entry</Text>
            <TouchableOpacity onPress={reset} hitSlop={10}><Text style={s.cancel}>Cancel</Text></TouchableOpacity>
          </View>
        )}
        <View style={s.seg}>
          {KINDS.map(x => (
            <TouchableOpacity key={x.kind} style={[s.segBtn, kind === x.kind && { backgroundColor: x.color + '22', borderColor: x.color + '66' }]}
              onPress={() => { setKind(x.kind); if (x.kind !== 'expense') setError(null); }} accessibilityRole="button" accessibilityState={{ selected: kind === x.kind }}>
              <Text style={[s.segTxt, kind === x.kind && { color: x.color, fontWeight: '800' }]}>{x.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.lbl}>AMOUNT</Text>
        <View style={s.amountWrap}>
          <Text style={s.rupee}>₹</Text>
          <TextInput style={s.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0"
            placeholderTextColor={Colors.textDim} accessibilityLabel="Amount" onSubmitEditing={submit} />
        </View>

        <Text style={s.lbl}>{kind === 'expense' ? 'WHAT FOR (OPTIONAL)' : kind === 'income' ? 'SOURCE (OPTIONAL)' : 'INVESTED IN (OPTIONAL)'}</Text>
        <TextInput style={s.input} value={label} onChangeText={onLabel} placeholder={kind === 'expense' ? 'e.g. Zomato dinner' : kind === 'income' ? 'e.g. Salary' : 'e.g. SIP — Parag Parikh'}
          placeholderTextColor={Colors.textDim} maxLength={60} onSubmitEditing={submit} accessibilityLabel="Description" />

        {kind === 'expense' && (
          <>
            <Text style={s.lbl}>CATEGORY</Text>
            <View style={s.chips}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, category === c && s.chipOn]} onPress={() => { setCategory(c); setCatTouched(true); }}
                  accessibilityRole="button" accessibilityState={{ selected: category === c }}>
                  <Text style={[s.chipTxt, category === c && s.chipTxtOn]}>{CAT_ICON[c]} {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={s.lbl}>DATE</Text>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
          {[{ l: 'Today', v: today }, { l: 'Yesterday', v: yesterday }].map(x => (
            <TouchableOpacity key={x.l} style={[s.chip, date === x.v && s.chipOn]} onPress={() => setDate(x.v)}>
              <Text style={[s.chipTxt, date === x.v && s.chipTxtOn]}>{x.l}</Text>
            </TouchableOpacity>
          ))}
          <TextInput style={[s.input, { flex: 1, paddingVertical: 7 }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textDim} autoCapitalize="none" accessibilityLabel="Date" />
        </View>

        {canRepeat && (
          <TouchableOpacity style={s.repeatRow} onPress={() => setRepeat(r => !r)} accessibilityRole="switch" accessibilityState={{ checked: repeat }}>
            <Text style={[s.repeatBox, repeat && { color: Colors.cyan }]}>{repeat ? '☑' : '☐'}</Text>
            <Text style={s.repeatTxt}>Repeat every month on the {ordinal(+date.slice(8, 10))}{+date.slice(8, 10) > 28 ? ' (or last day)' : ''}</Text>
          </TouchableOpacity>
        )}

        {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
        {notice && <Text style={s.notice} accessibilityLiveRegion="polite">✓ {notice}</Text>}

        <TouchableOpacity style={[s.submit, { backgroundColor: editing ? Colors.cyan : k.color }, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button">
          <Text style={s.submitTxt}>{editing ? 'Save changes' : k.verb}</Text>
        </TouchableOpacity>
        {editing && (
          <TouchableOpacity onPress={() => confirmDelete(editing)} style={{ paddingTop: Spacing.md, alignItems: 'center' }}>
            <Text style={s.delete}>Delete this entry</Text>
          </TouchableOpacity>
        )}
      </Card>

      <TouchableOpacity style={s.recLink} onPress={() => router.push('/tracker/recurring')} activeOpacity={0.8} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={s.recTitle}>🔁 Recurring entries</Text>
          <Text style={Typography.caption}>
            {recurring.filter(r => r.active).length > 0
              ? `${recurring.filter(r => r.active).length} active — ${recurring.filter(r => r.active).slice(0, 2).map(r => `${r.label || r.category} (${describeSchedule(r).replace('Every month on the ', '').replace(' (or the last day)', '')})`).join(', ')}`
              : 'Rent, SIPs, subscriptions, salary — logged for you every month'}
          </Text>
        </View>
        <Text style={{ color: Colors.cyan, fontSize: 20 }}>›</Text>
      </TouchableOpacity>

      {/* ── Month ── */}
      <View style={s.monthRow}>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={12} accessibilityLabel="Previous month"><Text style={s.arrow}>‹</Text></TouchableOpacity>
        <Text style={s.monthTxt}>{monthLabel(month)}</Text>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} hitSlop={12} accessibilityLabel="Next month">
          <Text style={[s.arrow, month >= thisMonth && { opacity: 0.25 }]}>›</Text>
        </TouchableOpacity>
      </View>

      <Card>
        <View style={{ flexDirection: 'row' }}>
          <Stat label="Spent" value={inrShort(totals.spent)} color={Colors.gold} />
          <Stat label="Income" value={inrShort(totals.income)} color={Colors.teal} />
          <Stat label="Invested" value={inrShort(totals.saved)} color={Colors.purple} />
        </View>
        {byCat.rows.length > 0 && (
          <View style={{ marginTop: Spacing.md }}>
            <Text style={Typography.label}>WHERE IT WENT</Text>
            {byCat.rows.slice(0, 6).map(([c, v]) => (
              <View key={c} style={{ marginTop: Spacing.sm }}>
                <View style={s.catRow}>
                  <Text style={s.catName}>{CAT_ICON[c] ?? '📦'} {c}</Text>
                  <Text style={s.catAmt}>{inr(v)}{limits[c] ? ` / ${inrShort(limits[c])}` : ''}</Text>
                </View>
                <Bar pct={limits[c] ? (v / limits[c]) * 100 : (v / byCat.total) * 100} color={limits[c] && v >= limits[c] ? Colors.red : Colors.gold} height={6} />
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* ── List ── */}
      <SectionLabel>{`ENTRIES · ${inMonth.length}`}</SectionLabel>
      {loaded && groups.length === 0 && (
        <Card><Text style={[Typography.caption, { lineHeight: 18 }]}>
          Nothing logged for {monthLabel(month)}. Add your first entry above — even a chai counts. Logging 5 or more entries a month starts earning Spending Awareness points.
        </Text></Card>
      )}
      {groups.map(([day, list]) => (
        <View key={day} style={{ marginBottom: Spacing.sm }}>
          <Text style={s.dayLabel}>{dayLabel(day, today, yesterday)}</Text>
          <Card style={{ paddingVertical: 4 }}>
            {list.map((t, idx) => {
              const sign = t.kind === 'income' ? '+' : t.kind === 'saving' ? '→' : '−';
              const color = t.kind === 'income' ? Colors.teal : t.kind === 'saving' ? Colors.purple : Colors.textPrimary;
              return (
                <TouchableOpacity key={`${t.id}-${t.i}`} style={[s.txnRow, idx < list.length - 1 && s.txnBorder]} onPress={() => startEdit(t)} onLongPress={() => confirmDelete(t)}
                  accessibilityRole="button" accessibilityLabel={`${t.kind} ${inr(t.amount)} ${t.label || t.category}. Tap to edit`}>
                  <Text style={s.txnIcon}>{CAT_ICON[t.category] ?? '📦'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.txnLabel} numberOfLines={1}>{t.label || t.category}</Text>
                    <Text style={Typography.caption}>{t.category}</Text>
                  </View>
                  <Text style={[s.txnAmt, { color }]}>{sign}{inr(t.amount)}</Text>
                </TouchableOpacity>
              );
            })}
          </Card>
        </View>
      ))}
      {groups.length > 0 && <Text style={[Typography.caption, { textAlign: 'center' }]}>Tap an entry to edit · long-press to delete</Text>}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
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
  notice: { color: Colors.teal, fontSize: 12, fontWeight: '700', marginTop: Spacing.md },
  submit: { borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md },
  submitTxt: { color: Colors.bg, fontWeight: '800', fontSize: 15 },
  delete: { color: Colors.red, fontSize: 12, fontWeight: '700' },
  repeatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
  repeatBox: { fontSize: 18, color: Colors.textMuted },
  repeatTxt: { ...Typography.caption, color: Colors.textPrimary, flex: 1 },
  recLink: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,212,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  recTitle: { ...Typography.body, fontWeight: '700', marginBottom: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: Spacing.sm },
  arrow: { color: Colors.cyan, fontSize: 30, paddingHorizontal: Spacing.md },
  monthTxt: { ...Typography.h3 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catName: { ...Typography.caption, color: Colors.textPrimary },
  catAmt: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary },
  dayLabel: { ...Typography.label, marginBottom: 6, marginTop: 4 },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  txnBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  txnIcon: { fontSize: 20, width: 34 },
  txnLabel: { ...Typography.body, fontWeight: '600' },
  txnAmt: { fontSize: 14, fontWeight: '800', marginLeft: Spacing.sm },
});
