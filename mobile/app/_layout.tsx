import React, { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { LockGate } from '@/components/LockGate';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { installCrashHandlers, setCurrentScreen } from '@/lib/diagnosticsStorage';
import { countScreen, loadConsents } from '@/lib/feedbackStorage';
import { useEraseEpoch } from '@/lib/eraseEpoch';
import { sweepTempFiles } from '@/lib/tempFiles';

installLanguagePatch();     // every <Text> shows the person's language; no screen needs editing
installThemePatch();        // and every core component follows the light / dark choice the same way
installCrashHandlers();     // uncaught errors are noted on this phone (redacted, readable and deletable in Diagnostics); nothing is sent

SplashScreen.preventAutoHideAsync();

/** Keeps every screen below the status bar / notch / Dynamic Island (and Android's edge-to-edge bar). The bottom inset is handled by the tab bar
 *  and by the scrolling screens, so it is not applied here (it would be counted twice). Modal sheets on iOS are placed by the system. */
function Shell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>{children}</View>;
}

export default function RootLayout() {
  const mode = useMode();
  const epoch = useEraseEpoch();          // bumps after "delete everything": the navigator below is rebuilt from empty storage
  const pathname = usePathname();
  useEffect(() => {
    setCurrentScreen(pathname);
    countScreen(pathname);                // counts only while the person switched screen counts on (default off)
  }, [pathname]);
  useEffect(() => {
    loadConsents().catch(() => {});
    sweepTempFiles().catch(() => {});     // a backup file or picked file left in the cache by an earlier run
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
    <SafeAreaProvider>
    <Shell>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <LockGate>
      <AuthProvider>
      <ErrorBoundary>
      <Stack key={epoch} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="search" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="profile" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="privacy" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="terms" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="feedback" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="diagnostics" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="onboarding/welcome" options={{ headerShown: false }} />
      </Stack>
      </ErrorBoundary>
      </AuthProvider>
      </LockGate>
    </Shell>
    </SafeAreaProvider>
  );
}
