import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { PlanBadges, navLine } from '@/components/FundUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { fundsApi } from '@/lib/fundsApi';
import { loadRawTransactions, loadRecent, loadTray } from '@/lib/fundsStorage';
import { type FundRecord, type RecentFund, groupSchemes, sipConsistency, sipMonthsFromTransactions, typeHint } from '@/lib/funds';

const MAX_SHOWN = 40;

export default function FundsHome() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FundRecord[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentFund[]>([]);
  const [tray, setTray] = useState<string[]>([]);
  const [sip, setSip] = useState<ReturnType<typeof sipConsistency> | null>(null);
  const [sipEntries, setSipEntries] = useState(0);
  const token = useRef(0);
  const now = useMemo(() => new Date(), []);

  useFocusEffect(useCallback(() => {
    loadRecent().then(setRecent);
    loadTray().then(setTray);
    loadRawTransactions().then(raw => {
      const months = sipMonthsFromTransactions(raw);
      setSipEntries(months.length);
      setSip(sipConsistency(months, new Date()));
    });
  }, []));

  const run = async () => {
    const mine = ++token.current;
    setBusy(true); setMessage(null);
    try {
      const r = await fundsApi.search(q);
      if (mine !== token.current) return;
      if (r.tooShort) { setResults(null); setMessage('Type at least three letters of the fund name or the fund house.'); return; }
      setResults(r.results); setTruncated(r.truncated);
      if (!r.results.length) setMessage('No fund matches every word you typed. Try fewer or shorter words (for example "parag flexi").');
    } catch {
      if (mine !== token.current) return;
      setResults(null);
      setMessage('Could not reach your FIN·OS backend, so search is not available right now. Funds you opened before, if any, are listed below with their last NAV and its date.');
    } finally {
      if (mine === token.current) setBusy(false);
    }
  };

  const schemes = useMemo(() => groupSchemes(results ?? []), [results]);

  return (
    <TrackerScreen title="Mutual fund search" subtitle="Find a fund by name, see its latest NAV and whether it is the Direct or Regular, Growth or IDCW version. NAV data is AMFI's, through your FIN·OS backend.">
      <View style={s.searchRow}>
        <TextInput
          style={s.input} value={q} onChangeText={setQ} placeholder="e.g. parag parikh flexi, nifty 50 index" placeholderTextColor={Colors.textDim}
          onSubmitEditing={run} returnKeyType="search" autoCorrect={false} accessibilityLabel="Search mutual funds"
        />
        <TouchableOpacity style={s.go} onPress={run} accessibilityRole="button" accessibilityLabel="Search funds">
          <Text style={s.goTxt}>Search</Text>
        </TouchableOpacity>
      </View>

      {busy ? <View style={{ padding: Spacing.lg }}><ActivityIndicator color={Colors.cyan} /></View> : null}
      {message ? <Card accent={Colors.gold}><Text style={s.body}>{message}</Text></Card> : null}

      {results && results.length > 0 ? (
        <>
          <SectionLabel>{`${results.length} MATCH${results.length === 1 ? '' : 'ES'}`}</SectionLabel>
          {truncated ? <Text style={[Typography.caption, { marginBottom: Spacing.sm }]}>The backend stopped at its limit, so more funds may match. Add a word to narrow it.</Text> : null}
          {schemes.slice(0, MAX_SHOWN).map(sc => (
            <Card key={sc.key}>
              <Text style={s.name}>{sc.name}</Text>
              <Text style={Typography.caption}>{sc.house || 'Fund house not stated'}{typeHint(sc.name) ? ` · name suggests: ${typeHint(sc.name)}` : ''}</Text>
              {sc.variants.map(v => {
                const nl = navLine(v, now);
                return (
                  <TouchableOpacity key={v.code} style={s.variant} onPress={() => router.push(`/funds/${v.code}` as any)}
                    accessibilityRole="button" accessibilityLabel={`Open ${v.name}, code ${v.code}`}>
                    <PlanBadges rec={v} />
                    <Text style={[s.nav, nl.old && { color: Colors.orange }]}>{nl.text}</Text>
                    <Text style={Typography.caption}>Scheme code {v.code}</Text>
                  </TouchableOpacity>
                );
              })}
            </Card>
          ))}
          {schemes.length > MAX_SHOWN ? <Text style={Typography.caption}>Showing the first {MAX_SHOWN} schemes of {schemes.length}. Add a word to narrow it.</Text> : null}
        </>
      ) : null}

      {tray.length > 0 ? (
        <TouchableOpacity style={s.cta} onPress={() => router.push('/funds/compare' as any)} accessibilityRole="button" accessibilityLabel={`Compare ${tray.length} chosen funds`}>
          <Text style={s.ctaTxt}>Compare {tray.length} chosen fund{tray.length === 1 ? '' : 's'} →</Text>
        </TouchableOpacity>
      ) : null}

      {recent.length > 0 ? (
        <>
          <SectionLabel>FUNDS YOU OPENED</SectionLabel>
          {recent.slice(0, 8).map(({ rec }) => {
            const nl = navLine(rec, now);
            return (
              <TouchableOpacity key={rec.code} onPress={() => router.push(`/funds/${rec.code}` as any)} accessibilityRole="button" accessibilityLabel={`Open ${rec.name}`}>
                <Card>
                  <Text style={s.name}>{rec.name}</Text>
                  <PlanBadges rec={rec} />
                  <Text style={[s.nav, nl.old && { color: Colors.orange }]}>Last seen: {nl.text}</Text>
                </Card>
              </TouchableOpacity>
            );
          })}
        </>
      ) : null}

      <SectionLabel>TOOLS</SectionLabel>
      <TouchableOpacity onPress={() => router.push('/funds/expense' as any)} accessibilityRole="button" accessibilityLabel="Direct versus Regular expense ratio impact">
        <Card>
          <Text style={s.name}>Direct vs Regular: what the expense ratio costs</Text>
          <Text style={Typography.caption}>Your SIP, your years, the two expense ratios you type in. An illustration at an assumed return.</Text>
        </Card>
      </TouchableOpacity>

      <Card>
        <Text style={Typography.label}>YOUR SIP CONSISTENCY, LAST 12 MONTHS</Text>
        {sip && sipEntries > 0 ? (
          <>
            <Text style={s.big}>{sip.consistency}%</Text>
            <Text style={s.body}>{sip.paidCount} of 12 months have an entry that mentions SIP, investment, MF or mutual fund. Current streak: {sip.streak} month{sip.streak === 1 ? '' : 's'}{sip.streak === 0 && sip.streakThroughLastMonth > 0 ? ` (${sip.streakThroughLastMonth} up to last month; this month has no entry yet)` : ''}.</Text>
            <View style={s.cal}>
              {sip.months.map(m => (
                <View key={m.month} style={[s.cell, m.paid ? { backgroundColor: 'rgba(34,211,166,0.45)' } : { backgroundColor: 'rgba(255,255,255,0.06)' }]} accessible accessibilityLabel={`${m.month}: ${m.paid ? 'entry found' : 'no entry'}`}>
                  <Text style={s.cellTxt}>{m.month.slice(5)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={s.body}>No transactions mention SIP, investment, MF or mutual fund yet, so there is nothing to measure. Log your SIP instalments as transactions and this fills in.</Text>
        )}
        <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Counts months with an entry, from what you recorded. It does not know whether the instalment really left your bank.</Text>
      </Card>

      <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 17 }]}>
        Fund data is AMFI's, relayed by your own backend. Past NAV movement does not predict future returns. Estimates for planning, not advice.
      </Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  searchRow: { flexDirection: 'row', marginBottom: Spacing.md },
  input: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, padding: 12, color: Colors.textPrimary, fontSize: 14 },
  go: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingHorizontal: 16, justifyContent: 'center', marginLeft: 8 },
  goTxt: { color: '#001018', fontWeight: '800', fontSize: 13 },
  body: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  name: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  variant: { marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  nav: { color: Colors.textPrimary, fontSize: 12, marginTop: 2 },
  cta: { borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, padding: 14, alignItems: 'center', marginVertical: Spacing.md },
  ctaTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 14 },
  big: { color: Colors.textPrimary, fontSize: 28, fontWeight: '800', marginTop: 6 },
  cal: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.sm },
  cell: { width: 36, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 4, marginBottom: 4 },
  cellTxt: { color: Colors.textPrimary, fontSize: 10 },
});
