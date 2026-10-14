import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { PlanBadges } from '@/components/FundUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { fundsApi } from '@/lib/fundsApi';
import { clearTray, loadRecent, loadTray, toggleInTray } from '@/lib/fundsStorage';
import { type FundHoldingFact, type FundRecord, compareFunds } from '@/lib/funds';
import { getState, init } from '@/lib/holdingsStore';

interface Loaded { rec: FundRecord; stale: boolean }

export default function FundCompare() {
  const [items, setItems] = useState<Loaded[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [held, setHeld] = useState<Record<string, FundHoldingFact>>({});
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setItems(null);
    const codes = await loadTray();
    const recents = await loadRecent();
    const out: Loaded[] = [];
    const gone: string[] = [];
    await Promise.all(codes.map(async (code, i) => {
      try {
        const r = await fundsApi.get(code);
        if (r) out[i] = { rec: r, stale: false }; else gone.push(code);
      } catch {
        const old = recents.find(x => x.rec.code === code);
        if (old) out[i] = { rec: old.rec, stale: true }; else gone.push(code);
      }
    }));
    setItems(out.filter(Boolean));
    setMissing(gone);
    try {
      await init();
      const m: Record<string, FundHoldingFact> = {};
      for (const h of getState().holdings) if (h.type === 'MF' || h.type === 'ELSS') m[h.symbol] = { units: h.units, avgPrice: h.avgPrice, sipMonthly: h.sipMonthly ?? null };
      setHeld(m);
    } catch { /* holdings are optional */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cmp = useMemo(() => (items && items.length >= 2 ? compareFunds(items.map(i => i.rec), now, held) : null), [items, now, held]);

  return (
    <TrackerScreen title="Compare funds" subtitle="Up to three funds side by side, as facts from the AMFI feed. No score, no ranking.">
      {items === null ? <View style={{ padding: Spacing.xl }}><ActivityIndicator color={Colors.cyan} /></View> : null}

      {items && items.length === 0 ? (
        <Card><Text style={s.body}>Nothing chosen yet. Open a fund and tap "+ Compare" (up to three).</Text>
          <TouchableOpacity style={{ marginTop: Spacing.md }} onPress={() => router.push('/funds' as any)} accessibilityRole="button" accessibilityLabel="Search funds">
            <Text style={s.link}>Search funds →</Text>
          </TouchableOpacity>
        </Card>
      ) : null}
      {items && items.length === 1 ? <Card><Text style={s.body}>One fund chosen. Add one or two more from the search to compare.</Text></Card> : null}
      {missing.length > 0 ? <Card accent={Colors.gold}><Text style={s.body}>No data found for scheme code{missing.length > 1 ? 's' : ''} {missing.join(', ')}. Remove {missing.length > 1 ? 'them' : 'it'} from the list.</Text></Card> : null}

      {items && items.map(({ rec, stale }) => (
        <Card key={rec.code}>
          <Text style={s.name}>{rec.name}</Text>
          <PlanBadges rec={rec} />
          {stale ? <Text style={[Typography.caption, { color: Colors.gold }]}>Backend not reachable: last record this phone saw. NAV is as of its own date.</Text> : null}
          <View style={s.btnRow}>
            <TouchableOpacity onPress={() => router.push(`/funds/${rec.code}` as any)} accessibilityRole="button" accessibilityLabel={`Open ${rec.name}`}><Text style={s.link}>Open</Text></TouchableOpacity>
            <TouchableOpacity style={{ marginLeft: Spacing.lg }} onPress={async () => { await toggleInTray(rec.code); load(); }} accessibilityRole="button" accessibilityLabel={`Remove ${rec.name} from compare`}>
              <Text style={[s.link, { color: Colors.textMuted }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ))}

      {cmp ? (
        <>
          <SectionLabel>SIDE BY SIDE</SectionLabel>
          {cmp.rows.map(r => (
            <Card key={r.key}>
              <Text style={Typography.label}>{r.label}</Text>
              {r.cells.map((cell, i) => (
                <View key={i} style={s.cell}>
                  <Text style={s.cellHead} numberOfLines={2}>{items![i].rec.name}</Text>
                  <Text style={s.body}>{cell}</Text>
                </View>
              ))}
            </Card>
          ))}
          {cmp.warnings.length > 0 ? (
            <Card accent={Colors.gold}>
              <Text style={Typography.label}>READ THIS BEFORE COMPARING</Text>
              {cmp.warnings.map(w => <Text key={w} style={s.warn}>• {w}</Text>)}
            </Card>
          ) : null}
        </>
      ) : null}

      {items && items.length > 0 ? (
        <TouchableOpacity style={{ marginTop: Spacing.md }} onPress={async () => { await clearTray(); load(); }} accessibilityRole="button" accessibilityLabel="Clear the compare list">
          <Text style={[s.link, { color: Colors.textMuted }]}>Clear the list</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 17 }]}>Returns, expense ratios, exit loads and holdings are not in the AMFI NAV feed, so they are not shown here rather than guessed.</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  body: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  name: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  link: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
  btnRow: { flexDirection: 'row', marginTop: Spacing.sm },
  cell: { marginTop: Spacing.sm },
  cellHead: { color: Colors.cyan, fontSize: 11, fontWeight: '700' },
  warn: { color: Colors.textPrimary, fontSize: 12, lineHeight: 18, marginTop: 6 },
});
