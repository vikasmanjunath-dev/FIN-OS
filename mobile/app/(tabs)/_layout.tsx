import { Tabs } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { Colors, Radii } from '@/constants/theme';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Text style={[styles.tabEmoji, focused && styles.tabEmojiActive]}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="⬡" label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="markets"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📈" label="Markets" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="arya"
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.aryaBtn, focused && styles.aryaBtnActive]}>
              <Text style={styles.aryaBtnText}>✦</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="💳" label="Track" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" label="Portfolio" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0D1117',
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 72,
    paddingBottom: 12,
    paddingTop: 8,
  },
  tabItem: { alignItems: 'center', gap: 2 },
  tabEmoji: { fontSize: 20, opacity: 0.4 },
  tabEmojiActive: { opacity: 1 },
  tabLabel: { fontSize: 9, color: Colors.textDim, fontWeight: '600' },
  tabLabelActive: { color: Colors.cyan },
  aryaBtn: {
    width: 48,
    height: 48,
    borderRadius: Radii.full,
    backgroundColor: 'rgba(123,47,247,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(123,47,247,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  aryaBtnActive: {
    backgroundColor: 'rgba(123,47,247,0.30)',
    borderColor: Colors.purple,
    shadowColor: Colors.purple,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  aryaBtnText: { fontSize: 22, color: Colors.purple },
});
