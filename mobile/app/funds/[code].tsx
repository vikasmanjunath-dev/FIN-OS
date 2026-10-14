import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { CalcField, Collapsible, toNum } from '@/components/CalcUI';
import { PlanBadges, navLine } from '@/components/FundUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { fundsApi } from '@/lib/fundsApi';
import { type HistoryOutcome } from '@/lib/fundsClient';
import { loadRecent, loadTray, rememberFund, toggleInTray } from '@/lib/fundsStorage';
import { type FundRecord, MAX_FUNDS, optionKind, planKind, sameScheme, typeHint, variantLabel } from '@/lib/funds';
import { type PeriodResult, MAX_GAP_DAYS, MIN_ROLLING_OBSERVATIONS, MIN_SIP_INSTALMENTS, periodReturn, rollingReturns, sipReturn } from '@/lib/fundsHistory';
import { getState, init } from '@/lib/holdingsStore';

const PERIODS = [{ m: 1, l: '1 month' }, { m: 3, l: '3 months' }, { m: 6, l: '6 months' }, { m: 12, l: '1 year' }, { m: 36, l: '3 years' }, { m: 60, l: '5 years' }];
const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;

export default function FundDetail() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const c = String(code);
  const now = useMemo(() => new Date(), []);
  const [rec, setRec] = useState<FundRecord | null>(null);
  const [cachedFrom, setCachedFrom] = useState<string | null>(null);     // set when the record is a remembered one, not a fresh one
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'offline'>('loading');
  const [variants, setVariants] = useState<FundRecord[]>([]);
  const [history, setHistory] = useState<HistoryOutcome | null>(null);
  const [tray, setTray] = useState<string[]>([]);
  const [held, setHeld] = useState<{ units: number; avgPrice: number; sip?: number } | null>(null);
  const [trayMsg, setTrayMsg] = useState('');

  const tok = useRef(0);
  const load = useCallback(async () => {
    const mine = ++tok.current;                  // a late answer for a previous code must never land on this one
    const live = () => mine === tok.current;
    setState('loading'); setHistory(null); setVariants([]); setHeld(null); setTrayMsg('');
    loadTray().then(setTray);
    init().then(() => {
      if (!live()) return;
      const h = getState().holdings.find(x => (x.type === 'MF' || x.type === 'ELSS') && x.symbol === c);
      setHeld(h ? { units: h.units, avgPrice: h.avgPrice, sip: h.sipMonthly } : null);
    }).catch(() => {});
    try {
      const r = await fundsApi.get(c);
      if (!live()) return;
      if (!r) { setState('missing'); return; }
      setRec(r); setCachedFrom(null); setState('ok');
      rememberFund(r, new Date());
      fundsApi.variants(r).then(v => { if (live()) setVariants(v); }).catch(() => { if (live()) setVariants([r]); });
      fundsApi.history(c).then(h => { if (live()) setHistory(h); });
    } catch {
      const old = (await loadRecent()).find(x => x.rec.code === c);
      if (!live()) return;
      if (old) { setRec(old.rec); setCachedFrom(old.seenAt); setState('ok'); setHistory({ status: 'unavailable', reason: 'offline' }); }
      else setState('offline');
    }
  }, [c]);

  useEffect(() => { load(); }, [load]);

  const inTray = tray.includes(c);
  const onTray = async () => {
    const r = await toggleInTray(c);
    setTray(r.codes);
    setTrayMsg(r.full ? `The compare list holds ${MAX_FUNDS} funds. Remove one first.` : r.codes.includes(c) ? 'Added to the compare list.' : 'Removed from the compare list.');
  };

  if (state === 'loading') return <TrackerScreen title="Fund"><View style={{ padding: Spacing.xl }}><ActivityIndicator color={Colors.cyan} /></View></TrackerScreen>;
  if (state === 'missing') return <TrackerScreen title="Fund"><Card><Text style={s.body}>AMFI data has no scheme with code {c}. Some schemes are closed or merged and drop out of the daily file.</Text></Card></TrackerScreen>;
  if (state === 'offline' || !rec) {
    return (
      <TrackerScreen title="Fund">
        <Card accent={Colors.gold}>
          <Text style={s.body}>Could not reach your FIN·OS backend, and this fund has not been opened on this phone before, so there is nothing to show yet.</Text>
          <TouchableOpacity style={{ marginTop: Spacing.md }} onPress={load} accessibilityRole="button" accessibilityLabel="Try again"><Text style={s.link}>Try again</Text></TouchableOpacity>
        </Card>
      </TrackerScreen>
    );
  }

  const nl = navLine(rec, now);
  const hint = typeHint(rec.name);
  const siblings = variants.filter(v => sameScheme(v, rec) && v.code !== rec.code);

  return (
    <TrackerScreen title={rec.name} subtitle={rec.house || 'Fund house not stated'}>
      {cachedFrom ? (
        <Card accent={Colors.gold}>
          <Text style={s.body}>Backend not reachable. This is the last record this phone saw, on {cachedFrom.slice(0, 10) || 'an unknown date'}. The NAV below is as of its own date, not today.</Text>
          <TouchableOpacity style={{ marginTop: Spacing.sm }} onPress={load} accessibilityRole="button" accessibilityLabel="Try again"><Text style={s.link}>Try again</Text></TouchableOpacity>
        </Card>
      ) : null}

      <Card>
        <PlanBadges rec={rec} />
        <Text style={s.big}>{rec.nav === null ? 'NAV not available' : `₹${rec.nav.toFixed(4)}`}</Text>
        <Text style={[s.body, nl.old && { color: Colors.orange }]}>
          {rec.date ? `NAV of ${rec.date}${nl.old ? ' (more than a week old: the scheme may be closed or matured)' : ''}` : 'NAV date not stated by the feed'}
        </Text>
        <Text style={Typography.caption}>Plan: {variantLabel(rec)} · Scheme code {rec.code}{hint ? ` · name suggests: ${hint}` : ''}</Text>
        <Text style={[Typography.caption, { marginTop: 4 }]}>"Name suggests" is read from the scheme name only. The feed carries no official SEBI category.</Text>
        {planKind(rec) === 'unknown' || optionKind(rec) === 'unknown' ? (
          <Text style={[Typography.caption, { color: Colors.gold, marginTop: 4 }]}>The feed does not say the {planKind(rec) === 'unknown' ? 'plan' : 'option'} for this code. Check it with the fund house before relying on it.</Text>
        ) : null}
      </Card>

      {held ? (
        <Card accent={Colors.teal}>
          <Text style={Typography.label}>YOU HOLD THIS</Text>
          <Text style={s.body}>{held.units} units at an average cost of {inr(held.avgPrice)}{held.sip ? ` · SIP ${inr(held.sip)} a month` : ''}. As recorded in your portfolio.</Text>
          {rec.nav !== null && held.units > 0 ? <Text style={Typography.caption}>At this NAV: about {inr(held.units * rec.nav)} (NAV of {rec.date || 'a date not stated'}).</Text> : null}
        </Card>
      ) : null}

      <View style={s.btnRow}>
        <TouchableOpacity style={[s.btn, inTray && { borderColor: Colors.teal }]} onPress={onTray} accessibilityRole="button"
          accessibilityLabel={inTray ? 'Remove from compare list' : 'Add to compare list'}>
          <Text style={[s.btnTxt, inTray && { color: Colors.teal }]}>{inTray ? '✓ In compare list' : '+ Compare'}</Text>
        </TouchableOpacity>
        {tray.length > 0 ? (
          <TouchableOpacity style={s.btn} onPress={() => router.push('/funds/compare' as any)} accessibilityRole="button" accessibilityLabel={`Open compare, ${tray.length} funds`}>
            <Text style={s.btnTxt}>Open compare ({tray.length})</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {trayMsg ? <Text style={Typography.caption}>{trayMsg}</Text> : null}

      <SectionLabel>OTHER VERSIONS OF THIS SCHEME</SectionLabel>
      <Card>
        {siblings.length === 0 ? (
          <Text style={s.body}>{variants.length === 0 ? 'Looking for the other plans and options…' : 'No other plan or option with exactly this name was found.'}</Text>
        ) : siblings.map(v => (
          <TouchableOpacity key={v.code} style={s.sib} onPress={() => router.push(`/funds/${v.code}` as any)} accessibilityRole="button" accessibilityLabel={`Open ${variantLabel(v)}, code ${v.code}`}>
            <PlanBadges rec={v} />
            <Text style={Typography.caption}>{navLine(v, now).text} · code {v.code}</Text>
          </TouchableOpacity>
        ))}
        <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Direct and Regular plans hold the same portfolio but charge different expenses, so their NAVs differ. Growth and IDCW also differ: IDCW pays part of the NAV out.</Text>
      </Card>

      <SectionLabel>RETURNS</SectionLabel>
      <Returns rec={rec} history={history} />

      <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 17 }]}>
        Data: AMFI, through your FIN·OS backend. Past returns do not predict future returns. Estimates for planning, not advice.
      </Text>
    </TrackerScreen>
  );
}

function Returns({ rec, history }: { rec: FundRecord; history: HistoryOutcome | null }) {
  const [amount, setAmount] = useState('5000');
  const [months, setMonths] = useState('36');
  if (!history) return <Card><ActivityIndicator color={Colors.cyan} /></Card>;
  if (history.status !== 'ok') {
    return (
      <Card accent={Colors.gold}>
        <Text style={s.body}>No return is shown for this fund.</Text>
        <Text style={[s.body, { color: Colors.textMuted }]}>
          {history.reason === 'offline'
            ? 'The backend could not be reached, and a return needs the fund\'s NAV history.'
            : history.reason === 'not-provided'
              ? 'A return needs the fund\'s NAV history, and your FIN·OS backend only serves the latest NAV so far. The phone will not work a return out of one NAV, and it will not borrow figures from another source.'
              : 'The backend returned no NAV history for this fund.'}
        </Text>
        <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Latest NAV: {rec.nav === null ? 'not available' : `₹${rec.nav.toFixed(4)} of ${rec.date || 'a date not stated'}`}.</Text>
      </Card>
    );
  }
  const h = history.history;
  const first = h.points[0].date, last = h.points[h.points.length - 1].date;
  const sipRes = sipReturn(h, toNum(amount), Math.floor(toNum(months)), 1);
  return (
    <>
      <Card>
        <Text style={Typography.label}>NAV HISTORY</Text>
        <Text style={s.body}>{h.points.length} NAVs from {first} to {last}{h.source ? ` · source: ${h.source}` : ''}{h.asOf ? ` · as of ${h.asOf}` : ''}.</Text>
        <Text style={[Typography.caption, { marginTop: 4 }]}>A return is shown only when a NAV exists within {MAX_GAP_DAYS} days before the start date it names. Otherwise the line says why.</Text>
        {PERIODS.map(p => <PeriodRow key={p.m} label={p.l} r={periodReturn(h, p.m)} />)}
        <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>One year and longer are per year (compounded, over the real number of days). Shorter periods are the plain change. These are for this plan and option only; they ignore any IDCW payouts you may have received.</Text>
      </Card>

      <Collapsible title="Rolling returns (how much it has varied)">
        {[12, 36].map(m => {
          const r = rollingReturns(h, m);
          return r.ok ? (
            <View key={m} style={{ marginBottom: Spacing.md }}>
              <Text style={s.rowTitle}>{m / 12}-year windows, {r.observations} month-end observations</Text>
              <Text style={s.body}>Lowest {pct(r.minPct)} · median {pct(r.medianPct)} · highest {pct(r.maxPct)} per year</Text>
              <Text style={Typography.caption}>Positive in {Math.round(r.positiveShare * 100)}% of windows, window ends {r.firstEnd} to {r.lastEnd}. Overlapping windows are not independent.</Text>
            </View>
          ) : (
            <View key={m} style={{ marginBottom: Spacing.md }}>
              <Text style={s.rowTitle}>{m / 12}-year windows</Text>
              <Text style={[s.body, { color: Colors.gold }]}>Not shown: {r.reason}</Text>
            </View>
          );
        })}
        <Text style={Typography.caption}>Needs at least {MIN_ROLLING_OBSERVATIONS} observations.</Text>
      </Collapsible>

      <Card>
        <Text style={Typography.label}>WHAT A SIP WOULD HAVE DONE (HYPOTHETICAL)</Text>
        <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
          <CalcField label="Monthly amount" prefix="₹" value={amount} onChange={setAmount} />
          <View style={{ width: Spacing.md }} />
          <CalcField label="Months" value={months} onChange={setMonths} sub={`at least ${MIN_SIP_INSTALMENTS}`} />
        </View>
        {sipRes.ok ? (
          <>
            <Text style={s.body}>{sipRes.instalments} instalments of {inr(sipRes.monthlyAmount)} from {sipRes.firstDate} to {sipRes.lastDate}, valued at the NAV of {sipRes.endDate}.</Text>
            <Text style={s.body}>Put in {inr(sipRes.invested)} · worth {inr(sipRes.value)} · change {pct(sipRes.gainPct)}{sipRes.xirrPct !== null ? ` · XIRR ${pct(sipRes.xirrPct)} a year` : ''}</Text>
            <Text style={[Typography.caption, { marginTop: 4 }]}>Each instalment is bought at the first NAV on or after the 1st of the month. No exit load, taxes or stamp duty are deducted. This is what the past would have given, not a forecast, and not your actual SIP.</Text>
          </>
        ) : (
          <Text style={[s.body, { color: Colors.gold }]}>Not shown: {sipRes.reason}</Text>
        )}
      </Card>
    </>
  );
}

function PeriodRow({ label, r }: { label: string; r: PeriodResult }) {
  return (
    <View style={s.period}>
      <Text style={s.rowLabel}>{label}</Text>
      {r.ok ? (
        <View style={{ alignItems: 'flex-end', flex: 1 }}>
          <Text style={[s.pct, { color: (r.annualisedPct ?? r.absolutePct) >= 0 ? Colors.teal : Colors.red }]}>
            {pct(r.annualisedPct ?? r.absolutePct)}{r.kind === 'annualised' ? ' a year' : ''}
          </Text>
          <Text style={Typography.caption}>{r.startDate} to {r.endDate} · {r.points} NAVs{r.kind === 'annualised' ? ` · total ${pct(r.absolutePct)}` : ''}</Text>
        </View>
      ) : (
        <Text style={[Typography.caption, { color: Colors.gold, flex: 1, textAlign: 'right' }]}>Not enough history: {r.reason}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  body: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  big: { color: Colors.textPrimary, fontSize: 28, fontWeight: '800', marginTop: 6 },
  link: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: Spacing.sm },
  btn: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  btnTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 12 },
  sib: { paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  period: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowLabel: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', width: 90 },
  rowTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  pct: { fontSize: 15, fontWeight: '800' },
});
