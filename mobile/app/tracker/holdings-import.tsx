import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { parseHoldings } from '@/lib/holdingsImport';
import { toHoldings, planImport } from '@/lib/holdingsImportPlan';
import { useHoldings } from '@/hooks/useHoldings';
import { TrackerScreen, Card, SectionLabel, Stat, inr } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

interface Parsed { rows: any[]; totals: { equity: number; mf: number; invested: number; count: number }; format: string; warnings: string[] }

export default function HoldingsImportScreen() {
  const { holdings, loaded, importHoldings } = useHoldings();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; updated: number; unchanged: number } | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const mapped = useMemo(() => (parsed ? toHoldings(parsed.rows, today) : null), [parsed, today]);
  const plan = useMemo(() => (mapped ? planImport(holdings, mapped.holdings) : null), [mapped, holdings]);

  const read = (source = text) => {
    setDone(null); setError(null);
    if (!source.trim()) { setParsed(null); return setError('Choose a file or paste the CSV text first.'); }
    const r = parseHoldings(source) as Parsed;
    if (!r.rows.length) { setParsed(null); return setError(r.warnings[0] ?? 'No holdings were found in that file.'); }
    setParsed(r);
  };

  const pickFile = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const body = await (await fetch(a.uri)).text();
      setFileName(a.name ?? 'holdings.csv'); setText(body); setParsed(null);
      read(body);
    } catch (e: any) {
      setError(`Could not open that file${e?.message ? `: ${e.message}` : ''}. You can paste the CSV text instead.`);
    }
  };

  const commit = async () => {
    if (!mapped || !plan) return;
    setBusy(true);
    try {
      setDone(await importHoldings(mapped.holdings));
      setParsed(null); setText(''); setFileName(null);
    } finally { setBusy(false); }
  };

  const nothing = !!plan && plan.add.length === 0 && plan.update.length === 0;
  const stocks = parsed?.rows.filter(r => r.kind === 'equity').length ?? 0;
  const funds = parsed ? parsed.rows.length - stocks : 0;
  const pnl = parsed ? parsed.rows.reduce((t, r) => t + (r.pnl ?? 0), 0) : 0;

  return (
    <TrackerScreen title="Import holdings" subtitle="Bring in the holdings CSV from Zerodha, Groww or another broker. It is read on this phone and nothing is uploaded; you see a preview first.">
      {done && (
        <Card accent={Colors.teal}>
          <Text style={[Typography.body, { fontWeight: '800', color: Colors.teal }]}>
            {done.added + done.updated === 0 ? 'Nothing changed' : `Added ${done.added}, updated ${done.updated}`}
          </Text>
          <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
            {done.unchanged ? `${done.unchanged} already matched your portfolio. ` : ''}Your Portfolio, net worth and health score now include them.
          </Text>
          <TouchableOpacity onPress={() => router.replace('/portfolio')} style={{ marginTop: Spacing.md }} accessibilityRole="button"><Text style={s.link}>Open Portfolio</Text></TouchableOpacity>
        </Card>
      )}

      <SectionLabel>1 · CHOOSE YOUR FILE</SectionLabel>
      <Card>
        <TouchableOpacity style={s.primary} onPress={pickFile} accessibilityRole="button" accessibilityLabel="Choose a holdings file">
          <Text style={s.primaryTxt}>{fileName ? `Chosen: ${fileName} — choose another` : 'Choose a CSV file'}</Text>
        </TouchableOpacity>
        <Text style={[Typography.label, { marginTop: Spacing.md, marginBottom: 6 }]}>OR PASTE THE TEXT</Text>
        <TextInput style={s.paste} value={text} onChangeText={t => { setText(t); setParsed(null); }} multiline autoCapitalize="none" autoCorrect={false}
          placeholder={'Instrument,Qty.,Avg. cost,LTP,Invested,Cur. val,P&L\nRELIANCE,10,2450.5,2890,24505,28900,4395'} placeholderTextColor={Colors.textDim} accessibilityLabel="Holdings CSV text" />
        <TouchableOpacity style={[s.secondary, !text.trim() && { opacity: 0.5 }]} onPress={() => read()} disabled={!text.trim()} accessibilityRole="button">
          <Text style={s.secondaryTxt}>Read holdings</Text>
        </TouchableOpacity>
        {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
        <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 16 }]}>
          Zerodha: Console → Portfolio → Holdings → download CSV. Groww: Holdings statement as CSV. Other brokers work if the columns are named like symbol / quantity / average price / LTP.
        </Text>
      </Card>

      {parsed && mapped && plan && (
        <>
          <SectionLabel>2 · CHECK THE PREVIEW</SectionLabel>
          <Card accent={Colors.cyan}>
            <View style={{ flexDirection: 'row' }}>
              <Stat label="Holdings" value={String(parsed.totals.count)} />
              <Stat label="Value" value={inr(parsed.totals.equity + parsed.totals.mf)} color={Colors.teal} />
              <Stat label="Invested" value={parsed.totals.invested ? inr(parsed.totals.invested) : '—'} />
            </View>
            <Text style={[Typography.caption, { marginTop: Spacing.md }]}>
              {`${stocks} stock${stocks === 1 ? '' : 's'} · ${funds} fund${funds === 1 ? '' : 's'}${parsed.totals.invested ? ` · P&L ${pnl >= 0 ? '+' : '−'}${inr(Math.abs(pnl))}` : ''} · read as ${parsed.format}`}
            </Text>
            {parsed.warnings.map((w, i) => <Text key={i} style={[Typography.caption, { marginTop: 6, color: Colors.orange, lineHeight: 17 }]}>• {w}</Text>)}
            {mapped.unpriced > 0 && (
              <Text style={[Typography.caption, { marginTop: 6, color: Colors.orange, lineHeight: 17 }]}>
                {`• ${mapped.unpriced} holding${mapped.unpriced === 1 ? ' has' : 's have'} no stock ticker or scheme code in the file, so ${mapped.unpriced === 1 ? 'it keeps' : 'they keep'} the broker's price instead of a live one.`}
              </Text>
            )}
          </Card>

          <Card>
            <Text style={Typography.label}>WHAT WILL CHANGE IN YOUR PORTFOLIO</Text>
            <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
              <Stat label="New" value={String(plan.add.length)} color={Colors.teal} />
              <Stat label="Updated" value={String(plan.update.length)} color={Colors.gold} />
              <Stat label="Same" value={String(plan.unchanged)} />
            </View>
            {mapped.holdings.slice(0, 8).map((h, i) => {
              const cur = holdings.find(x => x.type === h.type && x.symbol === h.symbol);
              const state = !cur ? 'new' : plan.update.some(u => u.id === cur.id) ? `${cur.units} → ${h.units}` : 'same';
              return (
                <View key={i} style={s.row}>
                  <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                    <Text style={Typography.body} numberOfLines={1}>{h.name}</Text>
                    <Text style={Typography.caption}>{`${h.type === 'MF' ? 'Fund' : 'Stock'} · ${h.units} units · avg ${inr(h.avgPrice)}`}</Text>
                  </View>
                  <Text style={[Typography.caption, { fontWeight: '800', color: state === 'new' ? Colors.teal : state === 'same' ? Colors.textMuted : Colors.gold }]}>{state}</Text>
                </View>
              );
            })}
            {mapped.holdings.length > 8 && <Text style={[Typography.caption, { marginTop: 6 }]}>{`…and ${mapped.holdings.length - 8} more`}</Text>}
          </Card>

          <TouchableOpacity style={[s.primary, (busy || nothing || !loaded) && { opacity: 0.5 }]} onPress={commit} disabled={busy || nothing || !loaded} accessibilityRole="button">
            <Text style={s.primaryTxt}>{busy ? 'Saving…' : nothing ? 'Already in your portfolio — nothing to do' : `Import ${plan.add.length + plan.update.length} holding${plan.add.length + plan.update.length === 1 ? '' : 's'}`}</Text>
          </TouchableOpacity>
          <Text style={[Typography.caption, { textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.lg, lineHeight: 16 }]}>
            The file is treated as your full current position: a holding already in your portfolio gets the file's quantity and average cost (not added to it). Holdings that are not in the file are left alone, and importing the same file again changes nothing.
          </Text>
        </>
      )}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  primary: { minHeight: 44, justifyContent: 'center', backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center' },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  secondary: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: Colors.cyan + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm },
  secondaryTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
  paste: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: 12, minHeight: 110, maxHeight: 220, textAlignVertical: 'top',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  error: { color: Colors.red, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
});
