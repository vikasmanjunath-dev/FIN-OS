import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTrackers } from '@/hooks/useTrackers';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { Chip } from '@/components/InsuranceUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { POLICY_META } from '@/lib/retirement';
import { COVER_TYPES, MAX_COMPARE, compareCoverTypes, comparePolicies, coverTypeById, policiesByCoverType } from '@/lib/insuranceHub';

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : list.length >= MAX_COMPARE ? list : [...list, id]);

export default function InsuranceCompare() {
  const { data } = useTrackers();
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [policyIds, setPolicyIds] = useState<string[]>([]);
  const now = useMemo(() => new Date(), []);
  const byType = useMemo(() => policiesByCoverType(data.policies).byType, [data.policies]);

  const rows = useMemo(() => (typeIds.length >= 2 ? compareCoverTypes(typeIds, byType) : []), [typeIds, byType]);
  const chosen = data.policies.filter(p => policyIds.includes(p.id));
  const pc = useMemo(() => (chosen.length >= 2 ? comparePolicies(chosen, now) : null), [chosen, now]);

  return (
    <TrackerScreen title="Compare" subtitle="Side by side descriptions of cover types, and your own recorded policies next to each other. Nothing is scored or ranked.">
      <SectionLabel>COVER TYPES (PICK 2 OR 3)</SectionLabel>
      <View style={s.chips}>
        {COVER_TYPES.map(c => <Chip key={c.id} label={c.label} on={typeIds.includes(c.id)} onPress={() => setTypeIds(t => toggle(t, c.id))} a11y={`Compare ${c.label}`} />)}
      </View>
      {typeIds.length === MAX_COMPARE ? <Text style={Typography.caption}>Three is the most that fit on a phone screen. Tap one to swap it.</Text> : null}

      {typeIds.length < 2 ? (
        <Card><Text style={s.body}>Pick at least two cover types.</Text></Card>
      ) : (
        rows.map(r => (
          <Card key={r.key}>
            <Text style={Typography.label}>{r.label}</Text>
            {r.cells.map((cell, i) => (
              <View key={i} style={s.cell}>
                <Text style={s.cellHead}>{coverTypeById(typeIds[i])?.label}</Text>
                {cell.lines.length === 0 ? <Text style={[s.body, { color: Colors.textMuted }]}>Nothing listed</Text> : null}
                {cell.lines.map((l, j) => <Text key={j} style={[s.body, cell.kind === 'none' && { color: Colors.textMuted }]}>{cell.lines.length > 1 ? '• ' : ''}{l}</Text>)}
                {cell.kind === 'website' && cell.source ? <Text style={s.src}>Website: {cell.source}</Text> : null}
                {cell.kind === 'app' ? <Text style={s.src}>Written for this app</Text> : null}
              </View>
            ))}
          </Card>
        ))
      )}

      <SectionLabel>YOUR POLICIES (PICK 2 OR 3)</SectionLabel>
      {data.policies.length < 2 ? (
        <Card><Text style={s.body}>Record at least two policies in the insurance tracker to compare them.</Text></Card>
      ) : (
        <View style={s.chips}>
          {data.policies.map(p => {
            const label = `${POLICY_META[p.type as keyof typeof POLICY_META]?.label ?? String(p.type)} · ${p.provider || 'Insurer not recorded'}`;
            return <Chip key={p.id} label={label} on={policyIds.includes(p.id)} onPress={() => setPolicyIds(t => toggle(t, p.id))} a11y={`Compare policy ${label}`} color={Colors.teal} />;
          })}
        </View>
      )}
      {pc ? (
        <Card>
          {pc.columns.map(col => (
            <View key={col.id} style={s.cell}>
              <Text style={s.cellHead}>{POLICY_META[col.policyType as keyof typeof POLICY_META]?.label ?? col.policyType} · {col.provider || 'Insurer not recorded'}</Text>
              <Text style={s.body}>Cover: {col.sumAssured > 0 ? inr(col.sumAssured) : 'Not recorded'}</Text>
              <Text style={s.body}>Premium: {col.annualPremium !== null ? `${inr(col.annualPremium)} a year` : 'Not recorded'}</Text>
              <Text style={s.body}>Premium per ₹1 lakh of cover: {col.premiumPerLakh !== null ? `₹${col.premiumPerLakh.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a year` : 'Not shown (needs both numbers)'}</Text>
              <Text style={s.body}>Renewal: {col.renewalDate ? `${col.renewalDate}${col.renewalDays !== null ? (col.renewalDays < 0 ? ' (passed)' : ` (in ${col.renewalDays} days)`) : ''}` : 'Not recorded'}</Text>
            </View>
          ))}
          {pc.notes.map(n => <Text key={n} style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>{n}</Text>)}
        </Card>
      ) : null}

      <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 17 }]}>
        A lower premium per lakh is not a better policy: waiting periods, exclusions, sub-limits and claim handling are what differ, and none of that is in a number.
      </Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.sm },
  body: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  cell: { marginTop: Spacing.md },
  cellHead: { color: Colors.cyan, fontSize: 12, fontWeight: '700' },
  src: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
});
