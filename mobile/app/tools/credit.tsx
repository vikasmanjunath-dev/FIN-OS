import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet } from '@/components/CalcUI';
import { BANDS } from '@/lib/creditScoreData';
import { compute, fromFields } from '@/lib/creditScore';
import { EMPTY, loadCredit, saveCredit, type CreditFields } from '@/lib/creditScoreStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const PRIORITY = { HIGH: Colors.red, MED: Colors.gold, LOW: Colors.teal } as const;

export default function CreditScreen() {
  const [f, setF] = useState<CreditFields>(EMPTY);
  useFocusEffect(useCallback(() => { loadCredit().then(setF); }, []));
  const parsed = useMemo(() => fromFields(f), [f]);
  const r = useMemo(() => (parsed ? compute(parsed.inputs) : null), [parsed]);

  const set = (patch: Partial<CreditFields>) => {
    const next = { ...f, ...patch };
    setF(next);
    const p = fromFields(next);
    saveCredit(next, p ? compute(p.inputs) : null).catch(() => {});
  };

  return (
    <TrackerScreen title="Credit score" subtitle="Where your CIBIL score stands, what it costs you on a home loan, and what would lift it.">
      <Card accent={r ? r.band.color : undefined}>
        {!r || !parsed ? (
          <>
            <Text style={s.big}>—</Text>
            <Text style={[Typography.caption, { lineHeight: 18, color: Colors.textPrimary }]}>Type the score from your free CIBIL report below. Nothing is assumed until you do.</Text>
          </>
        ) : (
          <>
            <Text style={[s.big, { color: r.band.color }]}>{parsed.inputs.score}</Text>
            <Text style={[s.bandName, { color: r.band.color }]}>{`${r.band.icon} ${r.band.label}`}</Text>
            <Text style={[Typography.caption, { lineHeight: 18, marginTop: 4 }]}>{r.band.desc}</Text>
            {r.scoreProjection > parsed.inputs.score && (
              <Text style={s.proj}>{`With the top fixes → ${r.scoreProjection} possible`}</Text>
            )}
          </>
        )}
      </Card>

      <SectionLabel>YOUR NUMBERS</SectionLabel>
      <Card>
        <CalcField label="CIBIL SCORE" sub="300 to 900. Free at CIBIL.com, BankBazaar, Paisabazaar or your bank app" value={f.score} onChange={v => set({ score: v.replace(/[^0-9]/g, '').slice(0, 3) })} />
        <CalcField label="CREDIT UTILISATION" sub="Total outstanding / total credit limit across your cards" suffix="%" value={f.util} onChange={v => set({ util: v })} />
        <CalcField label="LATE PAYMENTS IN THE LAST 2 YEARS" sub="0 means all on time" value={f.late} onChange={v => set({ late: v.replace(/[^0-9]/g, '') })} />
        <CalcField label="HARD INQUIRIES IN THE LAST 12 MONTHS" sub="New loan or card applications" value={f.inquiries} onChange={v => set({ inquiries: v.replace(/[^0-9]/g, '') })} />
      </Card>

      {r && (
        <>
          <SectionLabel>HOME LOAN RATE IMPACT (₹50L, 20 YEARS)</SectionLabel>
          <Card>
            <View style={s.three}>
              <View style={s.col}><Text style={Typography.label}>YOUR RATE (EST.)</Text><Text style={s.val}>{r.band.hlRate > 0 ? `${r.band.hlRate.toFixed(2)}%` : 'N/A'}</Text></View>
              <View style={s.col}><Text style={Typography.label}>VS BEST RATE</Text><Text style={[s.val, { color: parseFloat(r.rateSpread) > 0 ? Colors.red : Colors.teal }]}>{parseFloat(r.rateSpread) > 0 ? `+${r.rateSpread}%` : 'Best ✓'}</Text></View>
              <View style={s.col}><Text style={Typography.label}>EXTRA INTEREST</Text><Text style={[s.val, { color: r.extraInterestCost > 0 ? Colors.red : Colors.teal }]}>{r.extraInterestCost > 0 ? inr(r.extraInterestCost) : '₹0'}</Text></View>
            </View>
            <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Typical lender pricing by band; each bank sets its own. An illustration, not a quote.</Text>
          </Card>

          <SectionLabel>WHAT WOULD HELP MOST</SectionLabel>
          {r.activeTips.slice(0, 6).map(t => (
            <Card key={t.tip}>
              <View style={s.tipHead}>
                <Text style={[s.tip, { flex: 1 }]}>{t.tip}</Text>
                <Text style={[s.pri, { color: PRIORITY[t.priority] }]}>{t.priority}</Text>
              </View>
              <Text style={[Typography.caption, { lineHeight: 17 }]}>{t.detail}</Text>
              <Text style={s.impact}>{`Expected impact: ${t.impact}`}</Text>
            </Card>
          ))}
        </>
      )}

      <SectionLabel>SCORE BANDS</SectionLabel>
      <Card>
        {BANDS.map(b => {
          const active = !!parsed && parsed.inputs.score >= b.min && parsed.inputs.score <= b.max;
          return (
            <View key={b.label} style={[s.band, active && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Text style={{ fontSize: 14 }}>{b.icon}</Text>
              <Text style={[s.bandRow, { color: active ? b.color : Colors.textMuted, fontWeight: active ? '900' : '600' }]}>{b.label}</Text>
              <Text style={Typography.caption}>{`${b.min}–${b.max}`}</Text>
            </View>
          );
        })}
      </Card>

      <Collapsible title="About this estimate">
        <Bullet>Your score comes from a credit bureau, not from FIN-OS. This page only helps you read it. It cannot see your report.</Bullet>
        <Bullet>The CIBIL factors are roughly payment history 35%, utilisation 30%, credit age 15%, credit mix 10%, enquiries 5% and new accounts 5%. The point gains shown are typical ranges, not promises.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 44, fontWeight: '900', color: Colors.textMuted },
  bandName: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  proj: { color: Colors.teal, fontSize: 12, fontWeight: '800', marginTop: Spacing.sm },
  three: { flexDirection: 'row', gap: Spacing.sm },
  col: { flex: 1 },
  val: { fontSize: 20, fontWeight: '900', color: Colors.cyan, marginTop: 4 },
  tipHead: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 6 },
  tip: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  pri: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  impact: { color: Colors.cyan, fontSize: 12, fontWeight: '800', marginTop: 6 },
  band: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  bandRow: { flex: 1, fontSize: 13 },
});
