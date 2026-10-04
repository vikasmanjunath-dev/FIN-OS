import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import {
  CATEGORIES, CYCLES, CYCLE_IDS, STATUSES, Cycle, Status, Subscription,
  annualCost, monthlyCost, yourShare, nextRenewal, daysBetween, parseISO, localToday,
} from '@/lib/subscriptions';
import { TrackerScreen, Card, SectionLabel, Bar, Stat, inr } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const STATUS_COLOR: Record<Status, string> = { active: Colors.teal, trial: Colors.gold, paused: Colors.textMuted, cancelled: Colors.red };
const when = (d: number) => (d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);

export default function SubscriptionsScreen() {
  const { items, summary, loaded, add, update, remove } = useSubscriptions();
  const today = localToday();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [nextDate, setNextDate] = useState(today);
  const [category, setCategory] = useState('ott');
  const [split, setSplit] = useState('1');
  const [status, setStatus] = useState<Status>('active');
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName(''); setAmount(''); setCycle('monthly'); setNextDate(today); setCategory('ott');
    setSplit('1'); setStatus('active'); setUsefulness(null); setEditing(null); setError(null);
  };

  const submit = async () => {
    const amt = parseFloat(amount.replace(/[₹,\s]/g, ''));
    const sp = parseInt(split, 10);
    if (!name.trim()) return setError('Enter the name of the subscription.');
    if (!(amt > 0)) return setError('Enter what you pay each cycle (more than ₹0).');
    if (!parseISO(nextDate.trim())) return setError('Next renewal date should look like 2026-11-15.');
    if (!(sp >= 1 && sp <= 20)) return setError('Number of people sharing the plan should be 1 to 20.');
    setError(null);
    const body = { name: name.trim(), amount: amt, cycle, nextDate: nextDate.trim(), category, split: sp, status, usefulness };
    const ok = editing
      ? await update(editing.id, body)
      : !!(await add({ ...body, pay: '', note: '' }));
    if (!ok) return setError('Could not save — check the details and try again.');
    reset();
  };

  const startEdit = (s: Subscription) => {
    setEditing(s); setName(s.name); setAmount(String(s.amount)); setCycle(s.cycle); setNextDate(s.nextDate);
    setCategory(s.category); setSplit(String(s.split)); setStatus(s.status); setUsefulness(s.usefulness); setError(null);
  };

  const confirmRemove = (s: Subscription) => {
    const go = async () => { await remove(s.id); if (editing?.id === s.id) reset(); };
    if (Platform.OS === 'web') { if (window.confirm(`Delete ${s.name}?`)) go(); return; }
    Alert.alert('Delete subscription', `Delete ${s.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  const live = items.filter(s => s.status === 'active' || s.status === 'trial');
  const dormant = items.filter(s => s.status === 'paused' || s.status === 'cancelled');
  const pct = summary.pctOfIncome;

  return (
    <TrackerScreen title="Subscriptions" subtitle="Everything that renews on its own — what it costs you per month, what's coming up, and which ones are worth a second look.">
      <Card accent={summary.review.length ? Colors.orange : Colors.teal}>
        <Text style={Typography.label}>YOU PAY EACH MONTH</Text>
        <Text style={s.big}>{inr(summary.monthly)}</Text>
        <Text style={Typography.caption}>{inr(summary.annual)} a year{pct != null ? ` · ${(pct * 100).toFixed(1)}% of your income` : ''}</Text>
        <View style={{ flexDirection: 'row', marginTop: Spacing.md }}>
          <Stat label="Active" value={String(summary.activeCount)} />
          <Stat label="Due in 7 days" value={inr(summary.dueIn7)} color={summary.dueIn7 > 0 ? Colors.gold : undefined} />
          <Stat label="Trials" value={String(summary.trialCount)} color={summary.trialCount ? Colors.gold : undefined} />
        </View>
        {summary.categories.slice(0, 4).map(c => (
          <View key={c.id} style={{ marginTop: Spacing.md }}>
            <View style={s.barHead}>
              <Text style={s.barLabel}>{c.icon} {c.label}</Text>
              <Text style={Typography.caption}>{inr(c.monthly)}/mo</Text>
            </View>
            <Bar pct={c.share * 100} color={Colors.cyan} />
          </View>
        ))}
      </Card>

      {summary.trialsEnding.length > 0 && (
        <View style={[s.note, { borderColor: Colors.gold + '55', backgroundColor: Colors.gold + '10' }]}>
          <Text style={[s.noteTitle, { color: Colors.gold }]}>Free trial ending</Text>
          {summary.trialsEnding.map(t => (
            <Text key={t.id} style={s.noteTxt}>{t.name}: first charge {when(t.daysAway)} ({t.date}) — cancel before then to avoid it.</Text>
          ))}
        </View>
      )}

      {summary.upcoming.length > 0 && (
        <>
          <SectionLabel>RENEWING IN THE NEXT 30 DAYS</SectionLabel>
          <Card>
            {summary.upcoming.map((u, i) => (
              <View key={u.id} style={[s.upRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{u.name}{u.trial ? ' · trial' : ''}</Text>
                  <Text style={Typography.caption}>{u.date} · {when(u.daysAway)}</Text>
                </View>
                <Text style={s.amt}>{inr(u.cost)}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {summary.review.length > 0 && (
        <>
          <SectionLabel>{`WORTH A SECOND LOOK · SAVE UP TO ${inr(summary.reviewSavings)}/YR`}</SectionLabel>
          {summary.review.map(r => (
            <View key={r.id} style={[s.note, { borderColor: Colors.orange + '55', backgroundColor: Colors.orange + '10' }]}>
              <Text style={[s.noteTitle, { color: Colors.orange }]}>{r.name} · {inr(r.annual)}/yr</Text>
              <Text style={s.noteTxt}>{r.detail}</Text>
            </View>
          ))}
        </>
      )}

      <SectionLabel>{editing ? 'EDIT SUBSCRIPTION' : 'ADD A SUBSCRIPTION'}</SectionLabel>
      <Card accent={editing ? Colors.cyan : undefined}>
        <Text style={s.lbl}>NAME</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. Netflix, Spotify, iCloud" placeholderTextColor={Colors.textDim} maxLength={60} accessibilityLabel="Subscription name" />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>WHAT YOU PAY (₹)</Text>
            <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} accessibilityLabel="Amount per cycle" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>SHARED BY (PEOPLE)</Text>
            <TextInput style={s.input} value={split} onChangeText={setSplit} keyboardType="number-pad" placeholder="1" placeholderTextColor={Colors.textDim} accessibilityLabel="People sharing the plan" />
          </View>
        </View>
        <Text style={s.lbl}>BILLED</Text>
        <View style={s.chips}>
          {CYCLE_IDS.map(c => (
            <TouchableOpacity key={c} style={[s.chip, cycle === c && s.chipOn]} onPress={() => setCycle(c)} accessibilityRole="button" accessibilityLabel={`Billed ${CYCLES[c].label}`} accessibilityState={{ selected: cycle === c }}>
              <Text style={[s.chipTxt, cycle === c && s.chipTxtOn]}>{CYCLES[c].label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.lbl}>NEXT RENEWAL DATE</Text>
        <TextInput style={s.input} value={nextDate} onChangeText={setNextDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textDim} autoCapitalize="none" accessibilityLabel="Next renewal date" />
        <Text style={s.lbl}>CATEGORY</Text>
        <View style={s.chips}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c.id} style={[s.chip, category === c.id && s.chipOn]} onPress={() => setCategory(c.id)} accessibilityRole="button" accessibilityLabel={`Category ${c.label}`} accessibilityState={{ selected: category === c.id }}>
              <Text style={[s.chipTxt, category === c.id && s.chipTxtOn]}>{c.icon} {c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.lbl}>STATUS</Text>
        <View style={s.chips}>
          {STATUSES.map(st => (
            <TouchableOpacity key={st} style={[s.chip, status === st && { borderColor: STATUS_COLOR[st] + 'BB', backgroundColor: STATUS_COLOR[st] + '22' }]} onPress={() => setStatus(st)} accessibilityRole="button" accessibilityLabel={`Status ${st}`} accessibilityState={{ selected: status === st }}>
              <Text style={[s.chipTxt, status === st && { color: STATUS_COLOR[st], fontWeight: '800' }]}>{st[0].toUpperCase() + st.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.lbl}>HOW USEFUL IS IT? (OPTIONAL)</Text>
        <View style={s.chips}>
          {[1, 2, 3, 4, 5].map(n => (
            <TouchableOpacity key={n} style={[s.chip, usefulness === n && s.chipOn]} onPress={() => setUsefulness(usefulness === n ? null : n)} accessibilityRole="button" accessibilityLabel={`Usefulness ${n} of 5`} accessibilityState={{ selected: usefulness === n }}>
              <Text style={[s.chipTxt, usefulness === n && s.chipTxtOn]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
        <TouchableOpacity style={s.addBtn} onPress={submit} accessibilityRole="button" accessibilityLabel={editing ? 'Save changes' : 'Add subscription'}><Text style={s.addTxt}>{editing ? 'Save changes' : 'Add subscription'}</Text></TouchableOpacity>
        {editing && <TouchableOpacity onPress={reset} style={{ paddingTop: Spacing.md, alignItems: 'center' }}><Text style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>}
      </Card>

      <SectionLabel>{`YOUR SUBSCRIPTIONS · ${items.length}`}</SectionLabel>
      {loaded && items.length === 0 && <Card><Text style={[Typography.caption, { lineHeight: 18 }]}>Nothing here yet. Add the streaming, music, cloud and app plans you pay for — you'll see the real monthly total and get a heads-up before each renewal.</Text></Card>}
      {[...live, ...dormant].map(sub => {
        const cat = CAT[sub.category];
        const next = nextRenewal(sub, today);
        const days = next ? daysBetween(today, next) : null;
        return (
          <Card key={sub.id} accent={STATUS_COLOR[sub.status]}>
            <TouchableOpacity style={s.row} onPress={() => startEdit(sub)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${sub.name}, ${sub.status}. Tap to edit`}>
              <Text style={s.icon}>{cat?.icon ?? '📦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{sub.name}</Text>
                <Text style={Typography.caption}>
                  {CYCLES[sub.cycle].label}{sub.split > 1 ? ` · your share of ${sub.split}` : ''} · {sub.status}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.amt}>{inr(yourShare(sub))}</Text>
                <Text style={Typography.caption}>{inr(monthlyCost(sub))}/mo</Text>
              </View>
            </TouchableOpacity>
            {next && days != null && <Text style={[s.renew, { color: days <= 3 ? Colors.red : days <= 14 ? Colors.orange : Colors.textMuted }]}>{sub.status === 'trial' ? 'First charge' : 'Renews'} {when(days)} ({next}) · {inr(annualCost(sub))}/yr</Text>}
            <View style={s.actions}>
              {(sub.status === 'active' || sub.status === 'trial') && <TouchableOpacity onPress={() => update(sub.id, { status: 'paused' })}><Text style={s.act}>Pause</Text></TouchableOpacity>}
              {(sub.status === 'paused' || sub.status === 'cancelled') && <TouchableOpacity onPress={() => update(sub.id, { status: 'active' })}><Text style={s.act}>Resume</Text></TouchableOpacity>}
              {sub.status !== 'cancelled' && <TouchableOpacity onPress={() => update(sub.id, { status: 'cancelled' })}><Text style={s.act}>Mark cancelled</Text></TouchableOpacity>}
              <TouchableOpacity onPress={() => confirmRemove(sub)}><Text style={[s.act, { color: Colors.red }]}>Delete</Text></TouchableOpacity>
            </View>
          </Card>
        );
      })}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 32, fontWeight: '900', color: Colors.textPrimary, marginTop: 4 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barLabel: { ...Typography.body, fontWeight: '700' },
  note: { borderWidth: 1, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  noteTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  noteTxt: { ...Typography.caption, lineHeight: 17, color: Colors.textPrimary },
  upRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: Colors.bg },
  chipOn: { borderColor: Colors.cyan + 'BB', backgroundColor: Colors.cyan + '22' },
  chipTxt: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  chipTxtOn: { color: Colors.cyan, fontWeight: '800' },
  lbl: { ...Typography.label, marginTop: Spacing.md, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
  error: { color: Colors.red, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
  addBtn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md },
  addTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { fontSize: 24, width: 38 },
  name: { ...Typography.body, fontWeight: '700' },
  amt: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  renew: { fontSize: 12, fontWeight: '700', marginTop: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.lg, paddingTop: Spacing.sm },
  act: { color: Colors.cyan, fontSize: 12, fontWeight: '700' },
});
