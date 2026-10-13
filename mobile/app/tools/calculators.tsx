import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CALCS, GROUPS } from '@/lib/calcs';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

/** The larger tools the app already has: shown first so a person is not sent to a simpler version by mistake. */
const DEDICATED: { label: string; sub: string; route: string }[] = [
  { label: 'Home loan', sub: 'schedule, prepayment, affordability', route: '/tools/homeloan' },
  { label: 'SIP step-up', sub: 'yearly increase planner', route: '/tools/stepup' },
  { label: 'Retirement planner', sub: 'corpus and Monte Carlo', route: '/tools/retirement' },
  { label: 'Tax (both regimes)', sub: 'old vs new with surcharge', route: '/tools/taxplanner' },
  { label: 'Salary structure', sub: 'CTC to take-home', route: '/tools/salary' },
  { label: 'Prepay or invest', sub: 'loan vs market', route: '/tools/prepay' },
];

export default function CalculatorsHub() {
  const [q, setQ] = useState('');
  const match = (t: string) => t.toLowerCase().includes(q.trim().toLowerCase());
  const groups = useMemo(() => GROUPS.map(g => ({ ...g, items: CALCS.filter(c => c.group === g.id && (!q.trim() || match(c.title) || match(c.blurb))) })).filter(g => g.items.length), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TrackerScreen title="Calculators" subtitle={`${CALCS.length} quick calculators, the same formulas as the FIN·OS website. Change a number and the answer updates.`}>
      <View style={s.search}>
        <TextInput style={s.searchInput} value={q} onChangeText={setQ} placeholder="Search: SIP, EMI, HRA, gratuity…" placeholderTextColor={Colors.textDim} accessibilityLabel="Search calculators" autoCorrect={false} />
      </View>
      {!q.trim() && (
        <>
          <SectionLabel>MORE DETAILED TOOLS</SectionLabel>
          <Card>
            {DEDICATED.map(d => (
              <TouchableOpacity key={d.route} style={s.row} accessibilityRole="button" accessibilityLabel={`${d.label}: ${d.sub}`} onPress={() => router.push(d.route as any)}>
                <View style={{ flex: 1 }}><Text style={s.name}>{d.label}</Text><Text style={Typography.caption}>{d.sub}</Text></View>
                <Text style={s.chev}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      )}
      {groups.map(g => (
        <View key={g.id}>
          <SectionLabel>{`${g.icon}  ${g.label.toUpperCase()}`}</SectionLabel>
          <Card>
            {g.items.map(c => (
              <TouchableOpacity key={c.id} style={s.row} accessibilityRole="button" accessibilityLabel={`${c.title}: ${c.blurb}`} onPress={() => router.push(`/tools/calc/${c.id}` as any)}>
                <View style={{ flex: 1 }}><Text style={s.name}>{c.title}</Text><Text style={Typography.caption}>{c.blurb}</Text></View>
                <Text style={s.chev}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </View>
      ))}
      {groups.length === 0 && <Card><Text style={Typography.body}>No calculator matches that. Try "loan", "tax" or "SIP".</Text></Card>}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  search: { marginBottom: Spacing.sm },
  searchInput: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.lg, color: Colors.textPrimary, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: Spacing.sm },
  name: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  chev: { color: Colors.textMuted, fontSize: 22 },
});
