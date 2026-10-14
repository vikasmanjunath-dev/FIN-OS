import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii } from '@/constants/theme';
import { type FundRecord, navStatus, optionKind, planKind, OPTION_LABEL, PLAN_LABEL, planConflict } from '@/lib/funds';

const PLAN_COLOR = { direct: Colors.teal, regular: Colors.gold, unknown: Colors.textMuted } as const;

/** Direct / Regular and Growth / IDCW, always both, always stated (or "not stated"): a NAV means nothing without them. */
export function PlanBadges({ rec }: { rec: FundRecord }) {
  const p = planKind(rec), o = optionKind(rec);
  return (
    <View style={s.badges}>
      <Text style={[s.badge, { color: PLAN_COLOR[p], borderColor: PLAN_COLOR[p] }]}>{PLAN_LABEL[p]}</Text>
      <Text style={[s.badge, { color: o === 'unknown' ? Colors.textMuted : Colors.cyan, borderColor: o === 'unknown' ? Colors.textMuted : Colors.cyan }]}>
        {o === 'other' ? rec.option || OPTION_LABEL.other : OPTION_LABEL[o]}
      </Text>
      {planConflict(rec) ? <Text style={[s.badge, { color: Colors.orange, borderColor: Colors.orange }]}>Labels disagree</Text> : null}
    </View>
  );
}

export function navLine(rec: FundRecord, now: Date): { text: string; old: boolean } {
  if (rec.nav === null) return { text: 'NAV not available', old: false };
  const st = navStatus(rec, now);
  const when = !rec.date ? 'date not stated' : st.state === 'old' ? `${rec.date} (${st.days} days old)` : rec.date;
  return { text: `NAV ₹${rec.nav.toFixed(4)} · ${when}`, old: st.state === 'old' };
}

const s = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  badge: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6, marginBottom: 4, overflow: 'hidden' },
});
