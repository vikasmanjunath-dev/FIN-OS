import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import type { HoldingView } from '@/lib/holdings';
import { holdingKey } from '@/lib/holdings';
import { loadDates, saveDates, type DateMap } from '@/lib/holdingDates';
import { parseBoughtOn, portfolioXirr } from '@/lib/xirr';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pct = (x: number | null) => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}% a year`);

/** Annualised return (XIRR) from the purchase dates the person enters. A holding without a date is left out, never assumed. */
export function XirrCard({ holdings }: { holdings: HoldingView[] }) {
  const [dates, setDates] = useState<DateMap>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const today = ymd(new Date());

  useEffect(() => { loadDates().then(setDates); }, []);

  const r = useMemo(() => portfolioXirr(holdings.filter(h => h.priced).map(h => ({ key: holdingKey(h), invested: h.invested, current: h.current, boughtOn: dates[holdingKey(h)] ?? '' })), today), [holdings, dates, today]);

  const save = async (h: HoldingView) => {
    const k = holdingKey(h);
    const iso = parseBoughtOn(draft[k] ?? '', today);
    if (!iso) { setErr(p => ({ ...p, [k]: 'Use YYYY-MM-DD, a real day that is not in the future.' })); return; }
    const next = { ...dates, [k]: iso };
    try {
      await saveDates(next);
      setDates(next); setErr(p => ({ ...p, [k]: '' })); setDraft(p => ({ ...p, [k]: '' }));
    } catch {
      setErr(p => ({ ...p, [k]: 'Could not save this date on the device. Check available storage and try again.' }));
    }
  };
  const clear = async (h: HoldingView) => {
    const k = holdingKey(h), next = { ...dates }; delete next[k];
    try { await saveDates(next); setDates(next); setErr(p => ({ ...p, [k]: '' })); }
    catch { setErr(p => ({ ...p, [k]: 'Could not clear this date on the device. Check available storage and try again.' })); }
  };

  const priced = holdings.filter(h => h.priced);
  if (!holdings.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>Annualised return (XIRR)</Text>
      {r.counted > 0 ? (
        <>
          <Text style={[s.big, { color: (r.overall ?? 0) >= 0 ? Colors.teal : Colors.red }]}>{pct(r.overall)}</Text>
          <Text style={Typography.caption}>{`Across ${r.counted} holding${r.counted === 1 ? '' : 's'} with a purchase date. Each is treated as bought in one go on that date.`}</Text>
        </>
      ) : (
        <Text style={Typography.caption}>Add when you bought a holding and this works out how fast it has grown each year. Without a date there is no honest answer, so none is guessed.</Text>
      )}
      {priced.length < holdings.length && <Text style={[Typography.caption, { marginTop: 6 }]}>{`${holdings.length - priced.length} holding${holdings.length - priced.length === 1 ? ' has' : 's have'} no saved market price yet and are left out.`}</Text>}
      {priced.map(h => {
        const k = holdingKey(h);
        const has = dates[k];
        return (
          <View key={k} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{h.name}</Text>
              {has ? <Text style={Typography.caption}>{`Bought ${has} · ${pct(r.perHolding[k] ?? null)}`}</Text>
                : <TextInput accessibilityLabel={`Purchase date for ${h.name}`} style={s.input} value={draft[k] ?? ''} onChangeText={t => setDraft(p => ({ ...p, [k]: t }))}
                    placeholder="Bought on YYYY-MM-DD" placeholderTextColor={Colors.textDim} autoCorrect={false} maxLength={10} />}
              {err[k] ? <Text style={[Typography.caption, { color: Colors.red }]}>{err[k]}</Text> : null}
            </View>
            {has
              ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Clear the purchase date for ${h.name}`} onPress={() => clear(h)} hitSlop={8}><Text style={s.link}>Clear</Text></TouchableOpacity>
              : <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Save the purchase date for ${h.name}`} onPress={() => save(h)} hitSlop={8}><Text style={s.link}>Save</Text></TouchableOpacity>}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  title: { ...Typography.body, fontWeight: '700', marginBottom: Spacing.xs },
  big: { fontSize: 26, fontWeight: '900', marginVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, marginTop: 8 },
  name: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: Colors.textPrimary, fontSize: 13, marginTop: 4 },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
});
