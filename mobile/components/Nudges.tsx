import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radii } from '@/constants/theme';
import { computeNudges, dismiss, visible, type Dismissed, type Nudge, type NudgeFacts } from '@/lib/nudges';
import { loadDismissed, loadFacts, saveDismissed } from '@/lib/nudgesStorage';

const TONE = { alert: Colors.red, warn: Colors.gold, good: Colors.cyan } as const;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Up to three dismissible prompts on the home screen, built only from what has been recorded. */
export function Nudges(props: { incomeMonthly: number; savingsRate: number | null; topCategory: NudgeFacts['topCategory']; spentThisMonth: number; monthlySip: number }) {
  const [list, setList] = useState<Nudge[]>([]);
  const [dismissed, setDismissed] = useState<Dismissed>({});
  const [ready, setReady] = useState(false);
  const [more, setMore] = useState(false);          // one idea at a time; the rest are one tap away
  const key = `${props.incomeMonthly}|${props.savingsRate}|${props.topCategory?.name}|${props.topCategory?.spent}|${props.monthlySip}`;

  const refresh = useCallback(() => {
    let alive = true;
    Promise.all([loadFacts(props), loadDismissed()]).then(([facts, d]) => { if (!alive) return; setList(computeNudges(facts)); setDismissed(d); setReady(true); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useFocusEffect(refresh);
  useEffect(() => refresh(), [refresh]);

  const shown = ready ? visible(list, dismissed, ymd(new Date())) : [];
  if (!shown.length) return null;
  const hide = (id: string) => { const next = dismiss(dismissed, id, ymd(new Date())); setDismissed(next); saveDismissed(next).catch(() => {}); };

  return (
    <View style={s.wrap}>
      <Text style={s.label}>WORTH A LOOK</Text>
      {(more ? shown : shown.slice(0, 1)).map(n => (
        <View key={n.id} style={[s.card, { borderLeftColor: TONE[n.tone] }]}>
          <Text style={s.icon}>{n.icon}</Text>
          <TouchableOpacity style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${n.title}. ${n.action}`} onPress={() => router.push(n.route as any)}>
            <Text style={s.title}>{n.title}</Text>
            <Text style={s.body}>{n.body}</Text>
            <Text style={[s.action, { color: TONE[n.tone] }]}>{n.action} ›</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Hide for a week: ${n.title}`} hitSlop={10} onPress={() => hide(n.id)}>
            <Text style={s.x}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      {shown.length > 1 ? (
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(m => !m)} style={s.more}>
          <Text style={s.moreTxt}>{more ? 'Show fewer ideas' : `${shown.length - 1} more idea${shown.length - 1 === 1 ? '' : 's'}`}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: Spacing.md, marginHorizontal: Spacing.lg },
  label: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  card: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, padding: 12, marginBottom: 8 },
  icon: { fontSize: 20, marginTop: 2 },
  title: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  action: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  x: { color: Colors.textDim, fontSize: 14, padding: 4 },
  more: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  moreTxt: { color: Colors.cyan, fontSize: 13, fontWeight: '700' },
});
