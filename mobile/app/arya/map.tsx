import React, { useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { AryaTabs } from '@/components/AryaTabs';
import { useAryaFacts } from '@/components/AryaFacts';
import { allocation, branches } from '@/lib/aryaMap';
import { inrShort } from '@/lib/aryaFacts';
import { Colors, Spacing, Radii } from '@/constants/theme';

export default function AryaMap() {
  const { facts, failed } = useAryaFacts();
  const [open, setOpen] = useState<string | null>(null);
  const slices = facts ? allocation(facts) : [];
  const bs = facts ? branches(facts) : [];
  return (
    <TrackerScreen title="Map" subtitle="Where your money sits, and eight areas of your finances, from your own records. Nothing here is compared with an ideal mix or with other people.">
      <AryaTabs current="map" />
      {!facts && !failed ? <ActivityIndicator color={Colors.cyan} /> : null}
      {failed ? <Card><Text style={s.body}>I could not read your records just now.</Text></Card> : null}
      {facts ? (
        <>
          <SectionLabel>WHERE YOUR MONEY SITS</SectionLabel>
          <Card>
            {slices.length === 0 ? <Text style={s.body}>No assets are recorded yet. Add what you own in the Net Worth tracker.</Text> : (
              <>
                <View style={s.bar} accessibilityLabel={`Assets split into ${slices.length} places`}>{slices.map(x => <View key={x.label} style={{ flex: x.value, backgroundColor: x.color }} />)}</View>
                {slices.map(x => (
                  <View key={x.label} style={s.row}><View style={[s.dot, { backgroundColor: x.color }]} /><Text style={s.lbl}>{x.label}</Text><Text style={s.val}>{inrShort(x.value)} · {Math.round(x.pct)}%</Text></View>
                ))}
                <Text style={s.src}>From: Net Worth tracker (assets you recorded). Only recorded assets are counted; how much of "Stocks & mutual funds" is equity is not known here.</Text>
              </>
            )}
          </Card>
          <SectionLabel>EIGHT AREAS</SectionLabel>
          {bs.map(b => (
            <Card key={b.id}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === b.id }} accessibilityLabel={`${b.label}: ${b.headline}`} onPress={() => setOpen(open === b.id ? null : b.id)}>
                <View style={s.top}><Text style={s.t}>{b.icon} {b.label}</Text><Text style={s.head}>{b.headline}</Text></View>
              </Pressable>
              {open === b.id ? (
                <View>
                  {b.rows.length === 0 ? <Text style={s.body}>Nothing recorded.</Text> : b.rows.map(r => <View key={r.label} style={s.row}><Text style={s.lbl}>{r.label}</Text><Text style={s.val}>{r.value}</Text></View>)}
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${b.label}`} onPress={() => router.push(b.route as any)} style={s.btn}><Text style={s.btnT}>Open ›</Text></TouchableOpacity>
                </View>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}
    </TrackerScreen>
  );
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: Spacing.sm, backgroundColor: Colors.overlay },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  lbl: { color: Colors.textMuted, fontSize: 12, flex: 1 },
  val: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600' },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  src: { color: Colors.textDim, fontSize: 11, marginTop: 8, lineHeight: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  t: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  head: { color: Colors.textMuted, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  btn: { marginTop: Spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnT: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
});
