import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card } from '@/components/TrackerUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useTrackers } from '@/hooks/useTrackers';
import { visibleAlerts, unreadCount, type Alert, type AlertState } from '@/lib/alerts';
import { loadAlerts, saveAlertState } from '@/lib/alertsStorage';

const TONE = { critical: Colors.red, warning: Colors.gold, info: Colors.cyan, celebration: Colors.teal } as const;

export default function AlertsScreen() {
  const { data, computed, loaded } = useTrackers();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [state, setState] = useState<AlertState>({});
  const [ready, setReady] = useState(false);

  useEffect(() => { if (loaded) loadAlerts(data, computed).then(r => { setAlerts(r.alerts); setState(r.state); setReady(true); }); }, [loaded, data, computed]);

  const mark = useCallback((id: string, v: 'read' | 'dismissed') => { const next = { ...state, [id]: v }; setState(next); saveAlertState(next).catch(() => {}); }, [state]);
  const readAll = () => { const next = { ...state }; alerts.forEach(a => { if (!next[a.id]) next[a.id] = 'read'; }); setState(next); saveAlertState(next).catch(() => {}); };

  const list = visibleAlerts(alerts, state);
  const unread = unreadCount(list, state);
  if (!ready) return <TrackerScreen title="Alerts" subtitle="What needs your attention."><Card><Text style={Typography.body}>Checking…</Text></Card></TrackerScreen>;

  return (
    <TrackerScreen title="Alerts" subtitle="Things worth your attention, worked out on this phone from what you have recorded.">
      {list.length === 0 ? (
        <Card><Text style={Typography.body}>Nothing needs you right now. Alerts appear here when a limit is passed, something is due, or a goal slips.</Text></Card>
      ) : (
        <>
          <View style={s.head}><Text style={Typography.label}>{unread ? `${unread} NEW` : 'ALL READ'}</Text>{unread > 0 && <TouchableOpacity accessibilityRole="button" onPress={readAll}><Text style={s.link}>Mark all read</Text></TouchableOpacity>}</View>
          {list.map(a => (
            <View key={a.id} style={[s.card, { borderLeftColor: TONE[a.priority] }, state[a.id] && { opacity: 0.7 }]}>
              <Text style={s.icon}>{a.icon}</Text>
              <TouchableOpacity style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.action}`} onPress={() => { mark(a.id, 'read'); router.push(a.route as any); }}>
                <Text style={s.title}>{a.title}</Text>
                <Text style={s.body}>{a.message}</Text>
                <Text style={[s.action, { color: TONE[a.priority] }]}>{a.action} ›</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Dismiss: ${a.title}`} hitSlop={10} onPress={() => mark(a.id, 'dismissed')}><Text style={s.x}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </>
      )}
      <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 17 }]}>A dismissed alert comes back next month if it is still true. Bank-feed alerts (a missed SIP, a salary credit) need a connected account and are not shown here.</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: Colors.cyan, fontWeight: '700', fontSize: 12 },
  card: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, padding: 12, marginBottom: 10 },
  icon: { fontSize: 20, marginTop: 2 },
  title: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  action: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  x: { color: Colors.textDim, fontSize: 14, padding: 4 },
});
