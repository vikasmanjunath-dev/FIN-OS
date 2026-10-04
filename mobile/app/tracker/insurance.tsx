import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useTrackers } from '@/hooks/useTrackers';
import { POLICY_META, PolicyType, Policy, renewalDays, validDate } from '@/lib/retirement';
import { TrackerScreen, Card, SectionLabel, Bar, Stat, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const TYPES = Object.keys(POLICY_META) as PolicyType[];
const SEVERITY = { critical: Colors.red, high: Colors.orange, medium: Colors.gold, low: Colors.textMuted } as const;

export default function InsuranceScreen() {
  const { data, computed, save } = useTrackers();
  const cov = computed.retirement.coverage;
  const policies = data.policies;

  const [type, setType] = useState<PolicyType>('health');
  const [provider, setProvider] = useState('');
  const [sum, setSum] = useState('');
  const [premium, setPremium] = useState('');
  const [renewal, setRenewal] = useState('');
  const [number, setNumber] = useState('');
  const [editing, setEditing] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setProvider(''); setSum(''); setPremium(''); setRenewal(''); setNumber(''); setEditing(null); setError(null); setType('health'); };

  const submit = () => {
    const s = parseFloat(sum.replace(/,/g, '')), p = premium ? parseFloat(premium.replace(/,/g, '')) : 0;
    if (!provider.trim()) return setError('Enter the insurance company name.');
    if (!(s > 0)) return setError('Enter the sum assured (cover amount).');
    if (!(p >= 0)) return setError('Premium cannot be negative.');
    if (!validDate(renewal, { optional: true, allowFuture: true })) return setError('Renewal date should look like 2027-03-15 (or leave it blank).');
    setError(null);
    const base = { type, provider: provider.trim().slice(0, 60), sum_assured: s, annual_premium: p, renewal_date: renewal.trim(), policy_number: number.trim().slice(0, 40) };
    if (editing) save({ policies: policies.map(x => (x.id === editing.id ? { ...x, ...base } : x)) });
    else save({ policies: [...policies, { id: `p_${Date.now().toString(36)}`, notes: '', added_at: new Date().toISOString(), ...base }] });
    reset();
  };

  const startEdit = (p: Policy) => {
    setEditing(p); setType(p.type); setProvider(p.provider); setSum(String(p.sum_assured)); setPremium(p.annual_premium ? String(p.annual_premium) : '');
    setRenewal(p.renewal_date); setNumber(p.policy_number); setError(null);
  };

  const remove = (p: Policy) => {
    const go = () => { save({ policies: policies.filter(x => x.id !== p.id) }); if (editing?.id === p.id) reset(); };
    const what = `${POLICY_META[p.type]?.label ?? p.type} — ${p.provider || 'policy'}`;
    if (Platform.OS === 'web') { if (window.confirm(`Delete ${what}?`)) go(); return; }
    Alert.alert('Delete policy', `Delete ${what}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  const bars = [
    { label: 'Health', have: cov.totalHealth, rec: cov.recHealth, color: Colors.teal },
    { label: 'Term life', have: cov.totalLife, rec: cov.recLife, color: Colors.cyan },
    { label: 'Critical illness', have: cov.totalCritical, rec: cov.recCritical, color: Colors.red },
  ];

  return (
    <TrackerScreen title="Insurance" subtitle="Your policies, whether your cover is enough, and when each one renews. Having life and health cover also lifts your Health Score.">
      <Card accent={cov.gaps.some(g => g.severity === 'critical') ? Colors.red : Colors.teal}>
        <Text style={Typography.label}>YOUR COVER VS WHAT'S RECOMMENDED</Text>
        {bars.map(b => (
          <View key={b.label} style={{ marginTop: Spacing.md }}>
            <View style={s.barHead}>
              <Text style={s.barLabel}>{b.label}</Text>
              <Text style={Typography.caption}>{inrShort(b.have)} of {inrShort(b.rec)}</Text>
            </View>
            <Bar pct={(b.have / b.rec) * 100} color={b.have >= b.rec ? Colors.teal : b.color} height={8} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', marginTop: Spacing.md }}>
          <Stat label="Policies" value={String(policies.length)} />
          <Stat label="Premiums / year" value={inr(cov.annualPremium)} color={Colors.gold} />
        </View>
        <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 16 }]}>
          Rules of thumb: health 2×, term life 15× and critical illness 5× your annual income{computed.budget.income > 0 ? '' : ' (using ₹50,000/month until you add your income in Budget)'}.
        </Text>
      </Card>

      {cov.gaps.length === 0 && policies.length > 0 && <Card><Text style={[Typography.body, { color: Colors.teal }]}>🎉 No gaps found — your cover looks solid.</Text></Card>}
      {cov.gaps.map(g => (
        <View key={g.title} style={[s.gap, { borderColor: SEVERITY[g.severity] + '55', backgroundColor: SEVERITY[g.severity] + '10' }]}>
          <Text style={s.gapIcon}>{g.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.gapTitle, { color: SEVERITY[g.severity] }]}>{g.title}</Text>
            <Text style={[Typography.caption, { lineHeight: 17, color: Colors.textPrimary }]}>{g.msg}</Text>
          </View>
        </View>
      ))}

      <SectionLabel>{editing ? 'EDIT POLICY' : 'ADD A POLICY'}</SectionLabel>
      <Card accent={editing ? Colors.cyan : undefined}>
        <View style={s.chips}>
          {TYPES.map(t => (
            <TouchableOpacity key={t} style={[s.chip, type === t && { borderColor: POLICY_META[t].color + 'BB', backgroundColor: POLICY_META[t].color + '22' }]} onPress={() => setType(t)} accessibilityRole="button" accessibilityState={{ selected: type === t }}>
              <Text style={[s.chipTxt, type === t && { color: POLICY_META[t].color, fontWeight: '800' }]}>{POLICY_META[t].icon} {POLICY_META[t].label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.lbl}>INSURANCE COMPANY</Text>
        <TextInput style={s.input} value={provider} onChangeText={setProvider} placeholder="e.g. HDFC Life, Star Health" placeholderTextColor={Colors.textDim} maxLength={60} accessibilityLabel="Insurance company" />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>SUM ASSURED (₹)</Text>
            <TextInput style={s.input} value={sum} onChangeText={setSum} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} accessibilityLabel="Sum assured" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>PREMIUM / YEAR (₹)</Text>
            <TextInput style={s.input} value={premium} onChangeText={setPremium} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} accessibilityLabel="Annual premium" />
          </View>
        </View>
        <Text style={s.lbl}>RENEWAL DATE (OPTIONAL)</Text>
        <TextInput style={s.input} value={renewal} onChangeText={setRenewal} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textDim} autoCapitalize="none" accessibilityLabel="Renewal date" />
        <Text style={s.lbl}>POLICY NUMBER (OPTIONAL)</Text>
        <TextInput style={s.input} value={number} onChangeText={setNumber} placeholder="For your own reference" placeholderTextColor={Colors.textDim} maxLength={40} />
        {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
        <TouchableOpacity style={s.addBtn} onPress={submit} accessibilityRole="button"><Text style={s.addTxt}>{editing ? 'Save changes' : 'Add policy'}</Text></TouchableOpacity>
        {editing && <TouchableOpacity onPress={reset} style={{ paddingTop: Spacing.md, alignItems: 'center' }}><Text style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>}
      </Card>

      <SectionLabel>{`YOUR POLICIES · ${policies.length}`}</SectionLabel>
      {policies.length === 0 && <Card><Text style={[Typography.caption, { lineHeight: 18 }]}>No policies yet. Add your health, term life and vehicle policies above to see your gaps and renewal dates.</Text></Card>}
      {policies.map(p => {
        const meta = POLICY_META[p.type] ?? { icon: '📄', label: String(p.type), color: Colors.cyan };
        const days = renewalDays(p);
        const dColor = days == null ? Colors.textDim : days <= 30 ? Colors.red : days <= 90 ? Colors.orange : Colors.teal;
        return (
          <Card key={p.id} accent={meta.color}>
            <TouchableOpacity style={s.row} onPress={() => startEdit(p)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${meta.label} ${p.provider}. Tap to edit`}>
              <Text style={s.icon}>{meta.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{meta.label}</Text>
                <Text style={Typography.caption}>{p.provider || '—'}{p.policy_number ? ` · ${p.policy_number}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.sum}>{inrShort(p.sum_assured)}</Text>
                <Text style={Typography.caption}>{p.annual_premium ? `${inr(p.annual_premium)}/yr` : 'premium —'}</Text>
              </View>
            </TouchableOpacity>
            {days != null && (
              <Text style={[s.renew, { color: dColor }]}>
                {days < 0 ? `Expired ${-days} day${days === -1 ? '' : 's'} ago — renew now` : days === 0 ? 'Renews today' : `Renews in ${days} day${days === 1 ? '' : 's'} (${p.renewal_date})`}
              </Text>
            )}
            <TouchableOpacity onPress={() => remove(p)} style={{ paddingTop: Spacing.sm }}><Text style={s.del}>Delete</Text></TouchableOpacity>
          </Card>
        );
      })}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barLabel: { ...Typography.body, fontWeight: '700' },
  gap: { flexDirection: 'row', gap: Spacing.sm, borderWidth: 1, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  gapIcon: { fontSize: 20 },
  gapTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: Colors.bg },
  chipTxt: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  lbl: { ...Typography.label, marginTop: Spacing.md, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
  error: { color: Colors.red, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
  addBtn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md },
  addTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { fontSize: 24, width: 38 },
  name: { ...Typography.body, fontWeight: '700' },
  sum: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  renew: { fontSize: 12, fontWeight: '700', marginTop: Spacing.sm },
  del: { color: Colors.red, fontSize: 12, fontWeight: '700' },
});
