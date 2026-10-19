import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii } from '@/constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** One icon family for every tab (the old mix of a dark text glyph and four emoji made Home nearly invisible and the labels sit at
 *  different heights). Labels are 11 px, active/inactive differ by colour AND weight, never colour alone. */
function TabIcon({ icon, iconActive, label, focused }: { icon: IconName; iconActive: IconName; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <View style={styles.iconSlot}><Ionicons name={focused ? iconActive : icon} size={24} color={focused ? Colors.cyan : Colors.textMuted} /></View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

const BAR = 64;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();      // the home indicator / gesture bar: the bar grows by it instead of drawing labels underneath
  const bottom = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: BAR + bottom, paddingBottom: bottom }],
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ tabBarAccessibilityLabel: 'Home', tabBarIcon: ({ focused }) => <TabIcon icon="home-outline" iconActive="home" label="Home" focused={focused} /> }} />
      <Tabs.Screen name="markets" options={{ tabBarAccessibilityLabel: 'Markets', tabBarIcon: ({ focused }) => <TabIcon icon="trending-up-outline" iconActive="trending-up" label="Markets" focused={focused} /> }} />
      <Tabs.Screen
        name="arya"
        options={{
          tabBarAccessibilityLabel: 'Arya, your AI assistant',
          tabBarIcon: ({ focused }) => (
            <View style={styles.tabItem}>
              <View style={styles.iconSlot}>
                <View style={[styles.aryaBtn, focused && styles.aryaBtnActive]}>
                  <Ionicons name="sparkles" size={18} color={Colors.purpleInk} />
                </View>
              </View>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.tabLabel, focused && styles.tabLabelActive, focused && { color: Colors.purpleInk }]}>Arya</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="track" options={{ tabBarAccessibilityLabel: 'Track', tabBarIcon: ({ focused }) => <TabIcon icon="wallet-outline" iconActive="wallet" label="Track" focused={focused} /> }} />
      <Tabs.Screen name="portfolio" options={{ tabBarAccessibilityLabel: 'Portfolio', tabBarIcon: ({ focused }) => <TabIcon icon="pie-chart-outline" iconActive="pie-chart" label="Portfolio" focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0D1117',
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tabBarItem: { minHeight: 52, justifyContent: 'center' },
  tabItem: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 56 },
  iconSlot: { height: 30, alignItems: 'center', justifyContent: 'center' },   // every tab's icon sits in the same 30 px slot, so the labels line up
  tabLabel: { fontSize: 11, lineHeight: 14, color: Colors.textMuted, fontWeight: '600' },
  tabLabelActive: { color: Colors.cyan, fontWeight: '800' },
  aryaBtn: {
    width: 30, height: 30, borderRadius: Radii.full,
    backgroundColor: 'rgba(123,47,247,0.18)', borderWidth: 1.5, borderColor: 'rgba(123,47,247,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  aryaBtnActive: {
    backgroundColor: 'rgba(123,47,247,0.32)', borderColor: Colors.purple,
    shadowColor: Colors.purple, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
});
