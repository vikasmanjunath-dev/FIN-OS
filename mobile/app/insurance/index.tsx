import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTrackers } from '@/hooks/useTrackers';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { Collapsible } from '@/components/CalcUI';
import { Chip, FactCard, Notice, Pill } from '@/components/InsuranceUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { POLICY_META } from '@/lib/retirement';
import { loadAnswers } from '@/lib/insuranceHubStorage';
import { type Answers, FACTS, GROUPS, INSURER_DATA, filterCoverTypes, followUps, policiesByCoverType, progressFor } from '@/lib/insuranceHub';

const SEVERITY = { critical: Colors.red, high: Colors.orange, medium: Colors.gold, low: Colors.textMuted } as const;

export default function InsuranceHub() {
  const { data, computed } = useTrackers();
  const policies = data.policies;
  const [answers, setAnswers] = useState<Answers>({});
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [recordedOnly, setRecordedOnly] = useState(false);

  useFocusEffect(useCallback(() => { loadAnswers().then(setAnswers); }, []));

  const { byType, other } = useMemo(() => policiesByCoverType(policies), [policies]);
  const recorded = useMemo(() => new Set(Object.keys(byType)), [byType]);
  const list = useMemo(() => filterCoverTypes({ group, query, recordedOnly }, recorded), [group, query, recordedOnly, recorded]);
  const concerns = useMemo(() => followUps(policies, answers), [policies, answers]);
  const gaps = computed.retirement.coverage.gaps;

  return (
    <TrackerScreen title="Insurance hub" subtitle="What each kind of cover is for, what to ask about it, and how it sits next to the policies you recorded. Descriptions only: nothing here ranks or recommends a product.">
      <Card accent={policies.length ? Colors.teal : Colors.gold}>
        <Text style={Typography.label}>YOUR RECORDED POLICIES</Text>
        {policies.length === 0 ? (
          <>
            <Text style={s.body}>No policies recorded yet. Record the ones you have in the insurance tracker and they will appear against the cover types below.</Text>
            <TouchableOpacity style={s.link} onPress={() => router.push('/tracker/insurance')} accessibilityRole="button" accessibilityLabel="Open the insurance tracker">
              <Text style={s.linkTxt}>Open the insurance tracker →</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.body}>{policies.length} polic{policies.length === 1 ? 'y' : 'ies'} recorded. Cover and premium are what you entered.</Text>
            {policies.map(p => {
              const pr = progressFor(p, answers);
              const meta = POLICY_META[p.type as keyof typeof POLICY_META];
              return (
                <View key={p.id} style={s.polRow}>
                  <Text style={s.polName}>{meta?.icon ?? '📄'} {meta?.label ?? String(p.type)} · {p.provider || 'Insurer not recorded'}</Text>
                  <Text style={Typography.caption}>
                    {pr.total ? `${pr.checked} of ${pr.total} questions looked at${pr.concerns ? ` · ${pr.concerns} need a look` : ''}` : 'No questions for this type'}
                  </Text>
                </View>
              );
            })}
            {other.length ? <Text style={[Typography.caption, { marginTop: 6 }]}>{other.length} of these are of a type the hub has no description for; they are still yours and still in the tracker.</Text> : null}
            <TouchableOpacity style={s.link} onPress={() => router.push('/tracker/insurance')} accessibilityRole="button" accessibilityLabel="Open the insurance tracker">
              <Text style={s.linkTxt}>Edit policies in the tracker →</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>

      {gaps.length > 0 ? (
        <>
          <SectionLabel>GAPS YOUR TRACKER SHOWS</SectionLabel>
          <Card>
            {gaps.map((g, i) => (
              <View key={i} style={[s.polRow, i === 0 && { borderTopWidth: 0 }]}>
                <Text style={[s.polName, { color: SEVERITY[g.severity] }]}>{g.icon} {g.title}</Text>
                <Text style={Typography.caption}>{g.msg}</Text>
              </View>
            ))}
            <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>These use the website's rules of thumb on your recorded income and age, not a personal recommendation.</Text>
          </Card>
        </>
      ) : null}

      {concerns.length > 0 ? (
        <>
          <SectionLabel>YOU FLAGGED</SectionLabel>
          <Card accent={Colors.orange}>
            {concerns.map((c, i) => (
              <TouchableOpacity key={`${c.policy.id}-${c.check.id}`} style={[s.polRow, i === 0 && { borderTopWidth: 0 }]}
                onPress={() => router.push(`/insurance/${c.check.coverType}` as any)}
                accessibilityRole="button" accessibilityLabel={`${c.check.question} for ${c.policy.provider || 'your policy'}`}>
                <Text style={s.polName}>{c.check.question}</Text>
                <Text style={Typography.caption}>{POLICY_META[c.policy.type as keyof typeof POLICY_META]?.label ?? String(c.policy.type)} · {c.policy.provider || 'Insurer not recorded'}</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      ) : null}

      <SectionLabel>COVER TYPES</SectionLabel>
      <TextInput
        style={s.search} value={query} onChangeText={setQuery} placeholder="Search cover types or questions"
        placeholderTextColor={Colors.textDim} accessibilityLabel="Search cover types" autoCorrect={false}
      />
      <View style={s.chips}>
        <Chip label="All" on={group === null && !recordedOnly} onPress={() => { setGroup(null); setRecordedOnly(false); }} />
        {GROUPS.map(g => <Chip key={g.id} label={g.label} on={group === g.id} onPress={() => setGroup(group === g.id ? null : g.id)} />)}
        <Chip label="Recorded by me" on={recordedOnly} onPress={() => setRecordedOnly(v => !v)} color={Colors.teal} />
      </View>

      {list.length === 0 ? <Card><Text style={s.body}>No cover type matches. Clear the search or the filters.</Text></Card> : null}
      {list.map(c => {
        const n = byType[c.id]?.length ?? 0;
        return (
          <TouchableOpacity key={c.id} activeOpacity={0.8} onPress={() => router.push(`/insurance/${c.id}` as any)}
            accessibilityRole="button" accessibilityLabel={`${c.label}, ${n ? `${n} recorded` : 'none recorded'}`}>
            <Card>
              <View style={s.rowHead}>
                <Text style={s.title}>{c.hub?.icon ?? '🛡️'} {c.label}</Text>
                <Pill text={n ? `${n} recorded` : 'None recorded'} color={n ? Colors.teal : Colors.textMuted} />
              </View>
              <Text style={s.body}>{c.summary}</Text>
              <Text style={[Typography.caption, { marginTop: 6 }]}>
                {c.detail === 'full' ? 'The website has a section on this.' : 'The website only names this type.'}
              </Text>
            </Card>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={s.cta} onPress={() => router.push('/insurance/compare' as any)} accessibilityRole="button" accessibilityLabel="Compare cover types or your own policies">
        <Text style={s.ctaTxt}>Compare cover types or your own policies →</Text>
      </TouchableOpacity>

      <Notice title={INSURER_DATA.headline.toUpperCase()}>
        <Text style={s.body}>{INSURER_DATA.body}</Text>
        <Collapsible title="What would be needed">
          {INSURER_DATA.wanted.map(w => <Text key={w} style={[Typography.caption, { lineHeight: 18, marginBottom: 4 }]}>• {w}</Text>)}
        </Collapsible>
      </Notice>

      <Collapsible title={`All ${FACTS.length} figures the website states`}>
        <Text style={[Typography.caption, { marginBottom: Spacing.sm }]}>None of these carries a date or a source on the website. They are shown for what they are: statements, not verified data.</Text>
        {FACTS.map(f => <FactCard key={f.id} fact={f} />)}
      </Collapsible>

      <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 17 }]}>Estimates and descriptions for planning, not advice. Read the policy wording and ask the insurer before you buy or switch.</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  body: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: Spacing.sm },
  title: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 8 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  polRow: { paddingVertical: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  polName: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  link: { marginTop: Spacing.md },
  linkTxt: { color: Colors.cyan, fontSize: 13, fontWeight: '700' },
  search: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, padding: 12, color: Colors.textPrimary, fontSize: 14, marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.sm },
  cta: { borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, padding: 14, alignItems: 'center', marginVertical: Spacing.md },
  ctaTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 14 },
});
