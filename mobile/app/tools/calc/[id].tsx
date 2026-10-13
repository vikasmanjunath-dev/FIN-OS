import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TrackerScreen, Card } from '@/components/TrackerUI';
import { CalcField, Segmented, CheckRow, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { byId, type CalcDef, type CalcRow, type NumberInput } from '@/lib/calcs';
import { Colors, Spacing, Typography } from '@/constants/theme';

const TONE: Record<string, string> = { good: Colors.teal, warn: Colors.gold, bad: Colors.red, info: Colors.cyan };
const UNIT_PREFIX: Record<string, string | undefined> = { '₹': '₹' };
const UNIT_SUFFIX: Record<string, string | undefined> = { '%': '%', yrs: 'yrs', months: 'months', days: 'days', '×': '×' };

export default function CalculatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const def = byId(String(id));
  if (!def) return <TrackerScreen title="Calculator" subtitle="Not found."><Card><Text style={Typography.body}>That calculator does not exist.</Text></Card></TrackerScreen>;
  return <Body def={def} />;
}

function Body({ def }: { def: CalcDef }) {
  const defaults = useMemo(() => Object.fromEntries(def.inputs.map(i => [i.key, i.kind === 'toggle' ? i.def : i.kind === 'choice' ? i.def : String(i.def)])), [def]);
  const { value: vals, setValue } = usePersisted<Record<string, string | boolean>>(`finos_calc_${def.id}`, defaults);

  const numeric = useMemo(() => {
    const v: Record<string, number | string | boolean> = {};
    def.inputs.forEach(i => {
      const raw = vals[i.key];
      if (i.kind === 'toggle') v[i.key] = raw === true;
      else if (i.kind === 'choice') v[i.key] = typeof raw === 'string' && i.options.some(o => o.id === raw) ? raw : i.def;
      else v[i.key] = toNum(String(raw ?? ''));
    });
    return v;
  }, [vals, def]);

  const rows: CalcRow[] = useMemo(() => { try { return def.run(numeric); } catch { return []; } }, [def, numeric]);
  const broken = rows.some(r => /NaN|Infinity/.test(r.text));

  return (
    <TrackerScreen title={def.title} subtitle={def.blurb}>
      <Card>
        {def.inputs.map(i => {
          if (i.kind === 'choice') return <Segmented key={i.key} label={i.label} options={i.options} value={String(numeric[i.key])} onChange={v => setValue(p => ({ ...p, [i.key]: v }))} />;
          if (i.kind === 'toggle') return <CheckRow key={i.key} label={i.label} value={numeric[i.key] === true} onChange={v => setValue(p => ({ ...p, [i.key]: v }))} />;
          const n = i as NumberInput;
          return (
            <CalcField key={n.key} label={n.label} prefix={UNIT_PREFIX[n.unit]} suffix={UNIT_SUFFIX[n.unit]} sub={n.hint}
              value={String(vals[n.key] ?? '')} onChange={t => setValue(p => ({ ...p, [n.key]: t }))} />
          );
        })}
      </Card>

      {broken || rows.length === 0 ? (
        <Card accent={Colors.gold}><Text style={Typography.body}>{broken ? 'These numbers do not give an answer. Check that nothing that should be above zero is zero.' : 'Enter the values above to see the answer.'}</Text></Card>
      ) : (
        <Card accent={TONE[rows.find(r => r.hero)?.tone ?? 'info'] ?? Colors.cyan}>
          {rows.map(r => r.lines ? (
            <View key={r.id} style={{ marginTop: Spacing.sm }}>{r.lines.map((l, k) => <Text key={k} style={[Typography.body, { marginBottom: 4 }]}>{l}</Text>)}</View>
          ) : r.hero ? (
            <Text key={r.id} style={[s.hero, r.tone ? { color: TONE[r.tone] } : null]}>{r.text}</Text>
          ) : (
            <View key={r.id} style={s.line}>
              <Text style={[Typography.body, { flex: 1 }]}>{r.label}</Text>
              <Text style={[s.val, r.tone ? { color: TONE[r.tone] } : null]}>{r.text}</Text>
            </View>
          ))}
        </Card>
      )}

      {def.notes?.length ? (
        <Collapsible title="What this assumes">{def.notes.map((n, k) => <Bullet key={k}>{n}</Bullet>)}</Collapsible>
      ) : null}
      <Text style={[Typography.caption, { textAlign: 'center', marginTop: Spacing.md, lineHeight: 17 }]}>Estimates for planning, not advice. Your inputs stay on this phone.</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, marginTop: Spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: Spacing.sm },
  val: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
});
