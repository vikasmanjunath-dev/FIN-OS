import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-url-polyfill/auto';
import { Colors } from '@/constants/theme';
import { loadSavedHost } from '@/constants/endpoints';
import { AuthProvider } from '@/hooks/useAuth';
import { touchStreak } from '@/lib/trackerStorage';
import { syncRecurring } from '@/lib/recurringStorage';
import { startTrackerSync } from '@/lib/trackerSyncStore';
import { installLanguagePatch } from '@/lib/i18nPatch';
import { loadLang } from '@/lib/i18n';
import { syncReminders } from '@/lib/remindersStorage';
import { installThemePatch, loadTheme, useMode } from '@/lib/theme';

installLanguagePatch();     // every <Text> shows the person's language; no screen needs editing
installThemePatch();        // and every core component follows the light / dark choice the same way

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const mode = useMode();
  useEffect(() => {
    touchStreak();
    syncRecurring();
    startTrackerSync();
    loadLang();
    syncReminders().catch(() => {});
    const sub = AppState.addEventListener('change', st => { if (st === 'active') syncReminders().catch(() => {}); });
    Promise.all([loadSavedHost(), loadTheme()]).finally(() => SplashScreen.hideAsync());
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} backgroundColor={mode === 'light' ? '#F4F6FA' : Colors.bg} />
      <AuthProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="search" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="profile" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="privacy" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="terms" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      </AuthProvider>
    </View>
  );
}
