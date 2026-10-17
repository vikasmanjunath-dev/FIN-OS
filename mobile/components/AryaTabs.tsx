import React from 'react';
import { ScrollView, Text, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radii } from '@/constants/theme';

/** The Arya tab strip, as on the website's Arya panel: Chat, Plan, Map, Life, Pulse, Cal, India, Agent. */
export const ARYA_TABS = [
  { id: 'chat', icon: '💬', label: 'Chat', route: '/(tabs)/arya' },
  { id: 'plan', icon: '🗺️', label: 'Plan', route: '/arya/plan' },
  { id: 'map', icon: '🧠', label: 'Map', route: '/arya/map' },
  { id: 'life', icon: '🌅', label: 'Life', route: '/arya/life' },
  { id: 'pulse', icon: '📊', label: 'Pulse', route: '/pulse' },
  { id: 'cal', icon: '📅', label: 'Cal', route: '/arya/cal' },
  { id: 'india', icon: '🇮🇳', label: 'India', route: '/arya/india' },
  { id: 'agent', icon: '🤖', label: 'Agent', route: '/arya/agent' },
] as const;
export type AryaTabId = typeof ARYA_TABS[number]['id'];

export function AryaTabs({ current }: { current: AryaTabId }) {
  return (
    <View accessibilityRole="tablist" style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {ARYA_TABS.map(t => {
          const on = t.id === current;
          return (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`Arya ${t.label}`}
              onPress={() => { if (!on) router.replace(t.route as any); }} style={[s.tab, on && s.tabOn]}>
              <Text style={s.icon}>{t.icon}</Text>
              <Text style={[s.label, on && s.labelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  row: { gap: 6, paddingRight: Spacing.md },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 11, borderRadius: Radii.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.overlay },
  tabOn: { borderColor: Colors.purple, backgroundColor: 'rgba(123,47,247,0.15)' },
  icon: { fontSize: 13 },
  label: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  labelOn: { color: Colors.purpleInk },
});
