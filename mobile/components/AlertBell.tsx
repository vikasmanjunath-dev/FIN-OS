import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { unreadCount, visibleAlerts } from '@/lib/alerts';
import { loadAlerts } from '@/lib/alertsStorage';
import type { TrackerData, computeAll } from '@/lib/trackers';

/** The bell on Home, with the number of alerts not yet read. Opens the alerts screen. */
export function AlertBell({ data, computed, style }: { data: TrackerData; computed: ReturnType<typeof computeAll>; style?: object }) {
  const [n, setN] = useState(0);
  useEffect(() => { loadAlerts(data, computed).then(r => setN(unreadCount(visibleAlerts(r.alerts, r.state), r.state))).catch(() => setN(0)); }, [data, computed]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={n > 0 ? `Alerts, ${n} new` : 'Alerts'} onPress={() => router.push('/alerts' as any)} hitSlop={12}>
      <View style={style}>
        <Text style={{ fontSize: 18 }}>🔔</Text>
        {n > 0 && <View style={s.badge}><Text style={s.badgeTxt}>{n > 9 ? '9+' : n}</Text></View>}
      </View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
