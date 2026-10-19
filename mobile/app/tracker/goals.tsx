import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTrackers } from '@/hooks/useTrackers';
import { Goal } from '@/lib/trackers';
import { TrackerScreen, Card, SectionLabel, Bar, MoneyField, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography, Btn } from '@/constants/theme';
import { MAX_TRACKER_RUPEES, parseTrackerMoney } from '@/lib/trackerInput';

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
    const targetResult = parseTrackerMoney(target);
    const savedResult = parseTrackerMoney(saved);
    const t = targetResult.ok ? targetResult.value : NaN;
    const c = savedResult.ok ? savedResult.value : NaN;
    const d = parseMonth(when);
    if (!name.trim()) return setError('Give the goal a name.');
    if (!targetResult.ok || !(t > 0) || t > MAX_TRACKER_RUPEES) return setError('Enter a valid target amount greater than zero.');
    if (!savedResult.ok || c > MAX_TRACKER_RUPEES) return setError('Enter a valid saved amount (zero or more).');
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
              <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                <Text style={s.name}>{g.name}</Text>
                <Text style={Typography.caption}>
                  {done ? 'Goal reached 🎉' : g.monthsLeft != null
                    ? g.monthsLeft > 0 ? `${g.monthsLeft} month${g.monthsLeft === 1 ? '' : 's'} left` : g.monthsLeft === 0 ? 'Target month is this month' : 'Target date has passed'
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
            <TouchableOpacity accessibilityRole="button" onPress={() => remove(g)} style={{ paddingTop: Spacing.sm }}>
              <Text style={s.del}>Delete goal</Text>
            </TouchableOpacity>
          </Card>
        );
      })}

      <SectionLabel>ADD A GOAL</SectionLabel>
      <Card>
        <Text style={s.lbl}>NAME</Text>
        <TextInput accessibilityLabel="Goal name" style={s.input} value={name} onChangeText={setName} placeholder="e.g. House down payment" placeholderTextColor={Colors.textDim} />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>TARGET (₹)</Text>
            <TextInput accessibilityLabel="Target amount" style={s.input} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.lbl}>SAVED (₹)</Text>
            <TextInput accessibilityLabel="Saved so far" style={s.input} value={saved} onChangeText={setSaved} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} />
          </View>
        </View>
        <Text style={s.lbl}>TARGET MONTH (OPTIONAL)</Text>
        <TextInput accessibilityLabel="Target month" style={s.input} value={when} onChangeText={setWhen} placeholder="YYYY-MM, e.g. 2028-03" placeholderTextColor={Colors.textDim} autoCapitalize="none" />
        {error && <Text style={s.error}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button" style={s.addBtn} onPress={add}><Text style={s.addTxt}>Add goal</Text></TouchableOpacity>
      </Card>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the goal optimizer" onPress={() => router.push('/tools/goalopt')}
        style={{ borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, padding: Spacing.md, marginTop: Spacing.md }}>
        <Text style={{ color: Colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Which goal first? →</Text>
        <Text style={Typography.caption}>Inflation-adjusted SIP for each goal, ranked by urgency, and whether you can afford them all.</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the life goals planner" onPress={() => router.push('/plan/lifegoals' as any)}
        style={{ borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, padding: Spacing.md, marginTop: Spacing.md }}>
        <Text style={{ color: Colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Plan your life goals →</Text>
        <Text style={Typography.caption}>Plan several goals together from the amounts and years you enter, with what you have recorded filled in.</Text>
      </TouchableOpacity>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 34, fontWeight: '900', color: Colors.cyan, marginVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  icon: { fontSize: 24, marginRight: Spacing.sm },
  name: { ...Typography.body, fontWeight: '700' },
  pct: { fontSize: 18, fontWeight: '900' },
  del: { color: Colors.red, fontSize: 12, fontWeight: '700', minHeight: 44, minWidth: 44, textAlignVertical: 'center', lineHeight: 44 },
  lbl: { ...Typography.label, marginTop: Spacing.md, marginBottom: 6 },
  input: { minHeight: 44, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
  error: { color: Colors.gold, fontSize: 12, marginTop: Spacing.sm },
  addBtn: { ...Btn.base, backgroundColor: Colors.cyan, marginTop: Spacing.md },
  addTxt: { ...Btn.text, color: Colors.bg },
});
