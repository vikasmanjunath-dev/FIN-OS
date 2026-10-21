import React from 'react';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii } from '@/constants/theme';
import { useReelsTab } from '@/hooks/useReelsTab';

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

/** The Reels tab's icon: a play badge, with a small mark beside it (a check once today's reel is done, the streak while it waits, a dot otherwise). */
function ReelsIcon({ focused, badge, streak }: { focused: boolean; badge: 'check' | 'streak' | 'dot'; streak: number }) {
  return (
    <View style={styles.tabItem}>
      <View style={styles.iconSlot}>
        <View style={[styles.reelsBtn, focused && styles.reelsBtnActive]}><Ionicons name="play" size={16} color={Colors.gold} /></View>
        <View style={[styles.reelsBadge, badge === 'check' && styles.reelsBadgeDone, badge === 'dot' && styles.reelsDot]}>
          {badge === 'check' ? <Ionicons name="checkmark" size={10} color="#000" /> : badge === 'streak' ? <Text style={styles.reelsBadgeTxt}>{streak > 99 ? '99+' : String(streak)}</Text> : null}
        </View>
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.tabLabel, focused && styles.tabLabelActive, focused && { color: Colors.gold }]}>Reels</Text>
    </View>
  );
}

const BAR = 64;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();      // the home indicator / gesture bar: the bar grows by it instead of drawing labels underneath
  const bottom = Math.max(insets.bottom, 8);
  const reels = useReelsTab();
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
      <Tabs.Screen
        name="reels"
        listeners={{ tabPress: e => { e.preventDefault(); router.push('/learn/reels' as never); } }}      // opens the full-screen feed; the tab bar stays where the person was
        options={{ tabBarAccessibilityLabel: reels.label, tabBarIcon: ({ focused }) => <ReelsIcon focused={focused} badge={reels.badge} streak={reels.streak} /> }}
      />
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
  reelsBtn: { width: 30, height: 30, borderRadius: Radii.full, backgroundColor: 'rgba(240,165,0,0.16)', borderWidth: 1.5, borderColor: 'rgba(240,165,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  reelsBtnActive: { backgroundColor: 'rgba(240,165,0,0.3)', borderColor: Colors.gold },
  reelsBadge: { position: 'absolute', top: -2, right: 2, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  reelsBadgeDone: { backgroundColor: Colors.teal },
  reelsDot: { minWidth: 10, height: 10, borderRadius: 5, paddingHorizontal: 0, top: 0, right: 6, backgroundColor: Colors.cyan },
  reelsBadgeTxt: { color: '#000', fontSize: 10, fontWeight: '900', lineHeight: 12 },
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
