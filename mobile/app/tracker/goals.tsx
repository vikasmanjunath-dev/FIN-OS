import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useTrackers } from '@/hooks/useTrackers';
import { Goal } from '@/lib/trackers';
import { TrackerScreen, Card, SectionLabel, Bar, MoneyField, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const GOAL_ICONS: [RegExp, string][] = [
  [/house|home|flat|property/i, '🏠'], [/car|bike|vehicle/i, '🚗'], [/educ|school|college|mba|study/i, '🎓'],
  [/wedding|marriage/i, '💍'], [/retire|fire/i, '🌴'], [/travel|trip|vacation|holiday/i, '✈️'], [/emergency/i, '🛡️'],
];
const iconFor = (name: string) => GOAL_ICONS.find(([re]) => re.test(name))?.[1] ?? '🎯';

/** "2028-03" → "2028-03-01"; returns null for blank, undefined for invalid. */
function parseMonth(v: string): string | null | undefined {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (!m || +m[2] < 1 || +m[2] > 12) return undefined;
  return `${m[1]}-${m[2].padStart(2, '0')}-01`;
}

export default function GoalsScreen() {
  const { computed, data, save } = useTrackers();
  const { items, avgProgress } = computed.goals;
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const t = parseFloat(target.replace(/,/g, '')), c = saved ? parseFloat(saved.replace(/,/g, '')) : 0;
    const d = parseMonth(when);
    if (!name.trim()) return setError('Give the goal a name.');
    if (!(t > 0)) return setError('Enter the target amount.');
    if (!(c >= 0)) return setError('Saved amount must be zero or more.');
    if (d === undefined) return setError('Target month should look like 2028-03 (or leave it blank).');
    setError(null);
    const goal: Goal = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), target: t, current: c, target_date: d };
    save({ goals: [...data.goals, goal] });
    setName(''); setTarget(''); setSaved(''); setWhen('');
  };

  const update = (id: string, patch: Partial<Goal>) => save({ goals: data.goals.map(g => (g.id === id ? { ...g, ...patch } : g)) });
  const remove = (g: Goal) => {
    const go = () => save({ goals: data.goals.filter(x => x.id !== g.id) });
    if (Platform.OS === 'web') { if (window.confirm(`Delete "${g.name}"?`)) go(); return; }
    Alert.alert('Delete goal', `Delete "${g.name}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  return (
    <TrackerScreen title="Goals" subtitle="What you're saving for. Progress here feeds your Health Score.">
      {items.length > 0 && (
        <Card accent={Colors.cyan}>
          <Text style={Typography.label}>OVERALL</Text>
          <Text style={s.big}>{Math.round(avgProgress)}%</Text>
          <Bar pct={avgProgress} color={Colors.cyan} height={10} />
          <Text style={[Typography.caption, { marginTop: 6 }]}>{items.length} goal{items.length === 1 ? '' : 's'} · {inrShort(items.reduce((a, g) => a + g.current, 0))} saved of {inrShort(items.reduce((a, g) => a + g.target, 0))}</Text>
        </Card>
      )}

      {items.map(g => {
        const done = g.progress >= 100;
        return (
          <Card key={g.id} accent={done ? Colors.teal : Colors.purple}>
            <View style={s.head}>
              <Text style={s.icon}>{iconFor(g.name)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{g.name}</Text>
                <Text style={Typography.caption}>
                  {done ? 'Goal reached 🎉' : g.monthsLeft != null
                    ? g.monthsLeft > 0 ? `${g.monthsLeft} month${g.monthsLeft === 1 ? '' : 's'} left` : 'Target date has passed'
                    : 'No target date'}
                </Text>
              </View>
              <Text style={[s.pct, { color: done ? Colors.teal : Colors.purple }]}>{Math.round(g.progress)}%</Text>
            </View>
            <Bar pct={g.progress} color={done ? Colors.teal : Colors.purple} />
            <Text style={[Typography.caption, { marginTop: 6 }]}>
              {inr(g.current)} of {inr(g.target)}
              {g.monthlyNeeded != null ? ` · save about ${inr(g.monthlyNeeded)}/month to get there` : ''}
            </Text>
            <MoneyField label="Saved so far" value={g.current} onCommit={v => update(g.id, { current: v })} />
            <TouchableOpacity onPress={() => remove(g)} style={{ paddingTop: Spacing.sm }}>
              <Text style={s.del}>Delete goal</Text>
            </TouchableOpacity>
          </Card>
        );
      })}

      <SectionLabel>ADD A GOAL</SectionLabel>
      <Card>
        <Text style={s.lbl}>NAME</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. House down payment" placeholderTextColor={Colors.textDim} />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>TARGET (₹)</Text>
            <TextInput style={s.input} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>SAVED (₹)</Text>
            <TextInput style={s.input} value={saved} onChangeText={setSaved} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} />
          </View>
        </View>
        <Text style={s.lbl}>TARGET MONTH (OPTIONAL)</Text>
        <TextInput style={s.input} value={when} onChangeText={setWhen} placeholder="YYYY-MM, e.g. 2028-03" placeholderTextColor={Colors.textDim} autoCapitalize="none" />
        {error && <Text style={s.error}>{error}</Text>}
        <TouchableOpacity style={s.addBtn} onPress={add}><Text style={s.addTxt}>Add goal</Text></TouchableOpacity>
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 34, fontWeight: '900', color: Colors.cyan, marginVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  icon: { fontSize: 24, marginRight: Spacing.sm },
  name: { ...Typography.body, fontWeight: '700' },
  pct: { fontSize: 18, fontWeight: '900' },
  del: { color: Colors.red, fontSize: 12, fontWeight: '700' },
  lbl: { ...Typography.label, marginTop: Spacing.md, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
  error: { color: Colors.gold, fontSize: 12, marginTop: Spacing.sm },
  addBtn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md },
  addTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
});
