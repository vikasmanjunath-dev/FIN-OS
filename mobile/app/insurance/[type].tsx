import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTrackers } from '@/hooks/useTrackers';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { Collapsible } from '@/components/CalcUI';
import { FactCard, Notice, Pill, SourceLine } from '@/components/InsuranceUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { POLICY_META, renewalDays } from '@/lib/retirement';
import { loadAnswers, saveAnswer } from '@/lib/insuranceHubStorage';
import { type Answer, type Answers, checksFor, coverTypeById, factsFor, policiesByCoverType, progressFor, sourceLabel } from '@/lib/insuranceHub';

export default function CoverTypeScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { data } = useTrackers();
  const [answers, setAnswers] = useState<Answers>({});
  useFocusEffect(useCallback(() => { loadAnswers().then(setAnswers); }, []));

  const c = coverTypeById(String(type));
  if (!c) {
    return (
      <TrackerScreen title="Insurance hub">
        <Card><Text style={s.body}>There is no cover type called "{String(type)}" in the hub.</Text></Card>
        <TouchableOpacity onPress={() => router.replace('/insurance' as any)} accessibilityRole="button"><Text style={s.linkTxt}>Back to the hub →</Text></TouchableOpacity>
      </TrackerScreen>
    );
  }

  const mine = policiesByCoverType(data.policies).byType[c.id] ?? [];
  const checks = checksFor(c.id);
  const facts = factsFor(c.id);
  const set = (policyId: string, checkId: string, a: Answer | null) => saveAnswer(policyId, checkId, a).then(setAnswers);
  const now = new Date();

  return (
    <TrackerScreen title={`${c.hub?.icon ?? '🛡️'} ${c.label}`} subtitle={c.summary}>
      <Card>
        <Text style={Typography.label}>PAYS FOR</Text>
        {c.pays.map(t => <Text key={t} style={s.bullet}>• {t}</Text>)}
        <Text style={[Typography.label, { marginTop: Spacing.md }]}>DOES NOT PAY FOR</Text>
        {c.doesNotPay.map(t => <Text key={t} style={s.bullet}>• {t}</Text>)}
        <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Written for this app in plain words. The policy wording of your own insurer is what counts.</Text>
      </Card>

      {c.layer ? (
        <>
          <SectionLabel>WHAT THE WEBSITE SAYS</SectionLabel>
          <Card>
            <Text style={s.title}>{c.layer.heading}</Text>
            <Text style={s.body}>{c.layer.tagline}</Text>
            <SourceLine sources={[c.layer.headingSource, c.layer.taglineSource]} />
            {c.layer.features.map(f => (
              <View key={f.name} style={s.feature}>
                <Text style={s.featureName}>{f.name}</Text>
                <Text style={s.body}>{f.text}</Text>
                <SourceLine sources={[f.source]} />
              </View>
            ))}
            <Collapsible title="The website's example story">
              <Text style={s.body}>{c.layer.story.text}</Text>
              <Text style={[Typography.caption, { marginTop: 6 }]}>
                {c.layer.story.fictional ? 'A made-up illustration on the website, not a real case or statistic. ' : ''}Website: {sourceLabel(c.layer.story.source)}
              </Text>
            </Collapsible>
          </Card>
        </>
      ) : (
        <Card><Text style={s.body}>The website does not describe this type beyond its name, so there is nothing more to quote here.</Text></Card>
      )}

      {facts.length > 0 ? (
        <>
          <SectionLabel>FIGURES THE WEBSITE STATES</SectionLabel>
          <Card>
            {facts.map(f => <FactCard key={f.id} fact={f} />)}
            <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>No figure here is dated or sourced on the website. Treat each as a statement to check, not as current data.</Text>
          </Card>
        </>
      ) : null}

      <SectionLabel>QUESTIONS TO ASK</SectionLabel>
      <Card>
        {checks.length === 0 ? <Text style={s.body}>No questions written for this type.</Text> : null}
        {checks.map(k => (
          <View key={k.id} style={s.feature}>
            <Text style={s.featureName}>{k.question}</Text>
            <Text style={Typography.caption}>{k.why}</Text>
          </View>
        ))}
      </Card>

      <SectionLabel>YOUR POLICIES OF THIS TYPE</SectionLabel>
      {mine.length === 0 ? (
        <Card>
          <Text style={s.body}>{c.policyTypes.length ? 'None recorded.' : 'The insurance tracker has no policy type for this cover, so nothing can be recorded against it yet.'}</Text>
          {c.policyTypes.length ? (
            <TouchableOpacity style={{ marginTop: Spacing.md }} onPress={() => router.push('/tracker/insurance')} accessibilityRole="button" accessibilityLabel="Record a policy in the tracker">
              <Text style={s.linkTxt}>Record a policy →</Text>
            </TouchableOpacity>
          ) : null}
        </Card>
      ) : null}
      {mine.map(p => {
        const pr = progressFor(p, answers);
        const days = renewalDays(p, now);
        return (
          <Card key={p.id} accent={pr.concerns ? Colors.orange : undefined}>
            <Text style={s.title}>{POLICY_META[p.type as keyof typeof POLICY_META]?.icon} {p.provider || 'Insurer not recorded'}</Text>
            <Text style={Typography.caption}>
              Cover {p.sum_assured > 0 ? inr(p.sum_assured) : 'not recorded'} · Premium {p.annual_premium > 0 ? `${inr(p.annual_premium)} a year` : 'not recorded'} · Renewal {p.renewal_date ? (days === null ? p.renewal_date : days < 0 ? `${p.renewal_date} (passed)` : `${p.renewal_date} (in ${days} days)`) : 'not recorded'}
            </Text>
            <Text style={[Typography.caption, { marginTop: 4 }]}>{pr.checked} of {pr.total} questions looked at. Unchecked is not the same as fine.</Text>
            {checks.map(k => {
              const a = answers[p.id]?.[k.id];
              return (
                <View key={k.id} style={s.feature}>
                  <Text style={s.featureName}>{k.question}</Text>
                  <View style={s.btnRow}>
                    <TouchableOpacity style={[s.btn, a === 'ok' && { borderColor: Colors.teal }]} onPress={() => set(p.id, k.id, a === 'ok' ? null : 'ok')}
                      accessibilityRole="button" accessibilityLabel={`Looks fine: ${k.question}`} accessibilityState={{ selected: a === 'ok' }}>
                      <Text style={[s.btnTxt, a === 'ok' && { color: Colors.teal }]}>{a === 'ok' ? '✓ Looks fine' : 'Looks fine'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, a === 'concern' && { borderColor: Colors.orange }]} onPress={() => set(p.id, k.id, a === 'concern' ? null : 'concern')}
                      accessibilityRole="button" accessibilityLabel={`Needs a look: ${k.question}`} accessibilityState={{ selected: a === 'concern' }}>
                      <Text style={[s.btnTxt, a === 'concern' && { color: Colors.orange }]}>{a === 'concern' ? '! Needs a look' : 'Needs a look'}</Text>
                    </TouchableOpacity>
                    {a ? <Pill text="saved on this phone" /> : null}
                  </View>
                </View>
              );
            })}
          </Card>
        );
      })}

      <Notice title="WHAT THIS PAGE DOES NOT HAVE" accent={Colors.border as string}>
        <Text style={s.body}>No insurer names, plans, premiums, claim-settlement ratios or regulatory limits: the website holds none, and the app will not make them up. Your answers above stay on this phone.</Text>
      </Notice>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  body: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  bullet: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  title: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  feature: { marginTop: Spacing.md },
  featureName: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  linkTxt: { color: Colors.cyan, fontSize: 13, fontWeight: '700' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  btn: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 4 },
  btnTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
});
