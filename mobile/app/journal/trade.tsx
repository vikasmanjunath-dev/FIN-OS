import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CalcField, Collapsible } from '@/components/CalcUI';
import { Chips, Notice, profitColor, useJournal, s } from '@/components/JournalUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import {
  CHARGE_FIELDS, CHARGE_LABELS, DISCIPLINE, EMOTIONS, ENERGY, INSTRUMENT_TYPES, PLAN_ADHERENCE, PRE_EMOTIONS, REGIMES, SETUP_GRADES, SETUP_SUGGESTIONS, SIDES,
  buildTrade, emptyForm, formFromTrade, pnlText, previewForm, todayISO, type TradeForm,
} from '@/lib/tradeJournal';
import { deleteTrade, newTradeId, saveTrade } from '@/lib/tradeJournalStorage';

const opts = (a: readonly string[]) => a.map(x => ({ id: x, label: x }));
const YN = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];

export default function TradeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data } = useJournal();
  const now = new Date();
  const [f, setF] = useState<TradeForm>(() => emptyForm(todayISO(now)));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => (id && data ? data.trades.find(t => t.id === id) : undefined), [id, data]);
  useEffect(() => { if (base && loadedFor !== base.id) { setF(formFromTrade(base)); setLoadedFor(base.id); } }, [base, loadedFor]);
  const up = (patch: Partial<TradeForm>) => { setF(p => ({ ...p, ...patch })); setError(''); };
  const view = useMemo(() => previewForm(f), [f]);
  const past = useMemo(() => [...new Set([...(data?.trades.map(t => t.strategy).filter((x): x is string => !!x) ?? []), ...SETUP_SUGGESTIONS])].slice(0, 14), [data]);

  if (id && !data) return <TrackerScreen title="Edit trade"><Card><Text style={Typography.body}>Reading your journal…</Text></Card></TrackerScreen>;
  if (id && data && !base) return <TrackerScreen title="Edit trade"><Notice tone="warn">That trade is no longer in the journal.</Notice><TouchableOpacity style={s.secondary} onPress={() => router.replace('/journal' as any)} accessibilityRole="button"><Text style={s.secondaryTxt}>Back to the journal</Text></TouchableOpacity></TrackerScreen>;

  const submit = async () => {
    const r = buildTrade(f, { id: base?.id ?? newTradeId(), today: todayISO(new Date()), now: new Date(), base });
    if (!r.ok) return setError(r.error);
    setBusy(true);
    const w = await saveTrade(r.trade);
    setBusy(false);
    if (!w.ok) return setError(w.error);
    if (router.canGoBack()) router.back(); else router.replace('/journal' as any);
  };
  const remove = () => {
    if (!base) return;
    const go = async () => { await deleteTrade(base.id); if (router.canGoBack()) router.back(); else router.replace('/journal' as any); };
    if (Platform.OS === 'web') { if (window.confirm(`Delete this ${base.symbol} trade?`)) go(); return; }
    Alert.alert('Delete trade', `Delete this ${base.symbol} trade? This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };
  const tagOpts = (data?.tags ?? []).map(t => ({ id: t.id, label: t.name }));

  return (
    <TrackerScreen title={base ? 'Edit trade' : 'Add a trade'} subtitle="Fill in what you know. A box left empty is saved as not recorded, never as zero.">
      <Card>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <CalcField label="Date (YYYY-MM-DD)" value={f.date} onChange={v => up({ date: v })} text placeholder="2026-10-14" />
          <CalcField label="Instrument" value={f.symbol} onChange={v => up({ symbol: v.toUpperCase() })} text placeholder="NIFTY, RELIANCE" />
        </View>
        <Chips label="Side" options={SIDES.map(x => ({ id: x, label: x }))} value={f.direction} onChange={(v: any) => up({ direction: v })} />
        <Chips label="Instrument type" options={INSTRUMENT_TYPES} value={f.instrumentType} onChange={(v: string) => up({ instrumentType: v })} />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <CalcField label="Entry price" value={f.entry} onChange={v => up({ entry: v })} prefix="₹" />
          <CalcField label="Exit price" value={f.exit} onChange={v => up({ exit: v })} prefix="₹" sub="0 is allowed (expired worthless)" />
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <CalcField label="Quantity" value={f.qty} onChange={v => up({ qty: v })} sub="units, or lots if you fill lot size" />
          <CalcField label="Lot size" value={f.lotSize} onChange={v => up({ lotSize: v })} sub="leave empty for shares" />
        </View>
      </Card>

      <Card accent={profitColor(view.net)}>
        <Text style={Typography.label}>PROFIT ON THIS TRADE</Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: profitColor(view.net) }} accessibilityLiveRegion="polite">{view.net === null ? 'Not worked out yet' : pnlText(view.net, { sign: true, full: true })}</Text>
        <Text style={[Typography.caption, { lineHeight: 17 }]}>
          {view.gross === null ? 'Needs side, entry, exit and quantity, or type the gross profit below.' : `Gross ${pnlText(view.gross, { sign: true, full: true })} ${view.grossSource === 'typed' ? '(as you typed it)' : '(from the prices)'}, charges ${pnlText(view.charges, { full: true })}.`}
          {view.gross !== null && !view.chargesKnown ? ' No charges recorded yet, so this is before charges.' : ''}
        </Text>
        <View style={{ height: Spacing.sm }} />
        <CalcField label="Gross profit, if you know it" value={f.grossOverride} onChange={v => up({ grossOverride: v })} text prefix="₹" sub="Optional. Overrides the prices. A loss is negative, e.g. -2500." />
        <Collapsible title="Charges (brokerage, taxes and fees)">
          {CHARGE_FIELDS.map(k => <CalcField key={k} label={CHARGE_LABELS[k]} value={f[k]} onChange={v => up({ [k]: v } as any)} prefix="₹" />)}
          <CalcField label="Or just the total of all charges" value={f.chargesTotal} onChange={v => up({ chargesTotal: v })} prefix="₹" sub="Used only when none of the boxes above is filled. Slippage counts only if your prices are the planned ones, not the real fills." />
        </Collapsible>
      </Card>

      <SectionLabel>SETUP</SectionLabel>
      <Card>
        <CalcField label="Setup / strategy" value={f.strategy} onChange={v => up({ strategy: v })} text placeholder="Type your own, or pick one below" maxLength={60} />
        <Chips label="Suggestions" options={past.map(x => ({ id: x, label: x }))} value={f.strategy} onChange={(v: string) => up({ strategy: v })} />
        <Chips label="Setup grade" options={SETUP_GRADES} value={f.setupGrade} onChange={(v: string) => up({ setupGrade: v })} />
        <Chips label="Market regime" options={opts(REGIMES)} value={f.regime} onChange={(v: string) => up({ regime: v })} />
        {tagOpts.length > 0 ? <Chips label="Tags" multi options={tagOpts} value={f.tags} onChange={(v: string[]) => up({ tags: v })} /> : <Text style={Typography.caption}>No tags yet. Make some under Tags on the journal home.</Text>}
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
          <CalcField label="Entry time (HH:MM)" value={f.entryTime} onChange={v => up({ entryTime: v })} text placeholder="09:20" />
          <CalcField label="Exit time (HH:MM)" value={f.exitTime} onChange={v => up({ exitTime: v })} text placeholder="09:50" />
        </View>
      </Card>

      <SectionLabel>HOW YOU FELT (OPTIONAL)</SectionLabel>
      <Card>
        <Chips label="Feeling before the trade" options={opts(PRE_EMOTIONS)} value={f.preEmotion} onChange={(v: string) => up({ preEmotion: v })} />
        <Chips label="Feeling during the trade" options={opts(EMOTIONS)} value={f.emotion} onChange={(v: string) => up({ emotion: v })} />
        <Chips label="Was it a revenge trade?" options={YN} value={f.isRevenge} onChange={(v: any) => up({ isRevenge: v })} />
        <Chips label="Was it an impulsive trade?" options={YN} value={f.isImpulsive} onChange={(v: any) => up({ isImpulsive: v })} />
        <Chips label="Your rules" options={DISCIPLINE} value={f.discipline} onChange={(v: string) => up({ discipline: v })} />
        <Chips label="The plan" options={PLAN_ADHERENCE} value={f.planAdherence} onChange={(v: string) => up({ planAdherence: v })} />
        <Chips label="Energy" options={opts(ENERGY)} value={f.energy} onChange={(v: string) => up({ energy: v })} />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <CalcField label="Confidence (1 to 10)" value={f.confidence} onChange={v => up({ confidence: v.replace(/[^0-9]/g, '') })} maxLength={2} />
          <CalcField label="Stress (1 to 10)" value={f.stress} onChange={v => up({ stress: v.replace(/[^0-9]/g, '') })} maxLength={2} />
        </View>
      </Card>

      <SectionLabel>NOTES (OPTIONAL)</SectionLabel>
      <Card>
        <CalcField label="Why you took it" value={f.reason} onChange={v => up({ reason: v })} text maxLength={2000} />
        <CalcField label="What went wrong" value={f.mistakes} onChange={v => up({ mistakes: v })} text maxLength={2000} />
        <CalcField label="What you learned" value={f.lesson} onChange={v => up({ lesson: v })} text maxLength={2000} />
        <CalcField label="Anything else" value={f.notes} onChange={v => up({ notes: v })} text maxLength={2000} />
      </Card>

      {error ? <Text style={{ color: Colors.red, fontSize: 13, marginBottom: Spacing.md, lineHeight: 18 }} accessibilityLiveRegion="polite">{error}</Text> : null}
      <TouchableOpacity style={[s.primary, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit} accessibilityRole="button" accessibilityLabel={base ? 'Save changes' : 'Save trade'}><Text style={s.primaryTxt}>{busy ? 'Saving…' : base ? 'Save changes' : 'Save trade'}</Text></TouchableOpacity>
      {base && <TouchableOpacity style={s.secondary} onPress={remove} accessibilityRole="button" accessibilityLabel="Delete this trade"><Text style={[s.secondaryTxt, { color: Colors.red }]}>Delete this trade</Text></TouchableOpacity>}
    </TrackerScreen>
  );
}
