import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-url-polyfill/auto';
import { Colors } from '@/constants/theme';
import { loadSavedHost } from '@/constants/endpoints';
import { AuthProvider } from '@/hooks/useAuth';
import { touchStreak } from '@/lib/trackerStorage';
import { syncRecurring } from '@/lib/recurringStorage';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    touchStreak();
    syncRecurring();
    loadSavedHost().finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <AuthProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      </AuthProvider>
    </View>
  );
}
