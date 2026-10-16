import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { Colors } from '@/constants/theme';
import { decideLaunch } from '@/lib/onboardingStorage';

/**
 * The entry point: opens the first-run welcome the first time (and, if it was left unfinished, once more), otherwise Home.
 * Only this route decides: a direct link or a tap on any other screen never goes through it, so the welcome can never block use.
 */
export default function Index() {
  const [to, setTo] = useState<'/onboarding/welcome' | '/dashboard' | null>(null);
  useEffect(() => {
    let alive = true;
    decideLaunch().then(d => { if (alive) setTo(d === 'onboarding' ? '/onboarding/welcome' : '/dashboard'); }).catch(() => { if (alive) setTo('/dashboard'); });
    return () => { alive = false; };
  }, []);
  if (!to) return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
  return <Redirect href={to as any} />;
}
