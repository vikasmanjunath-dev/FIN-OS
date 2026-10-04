import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const { configured, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/dashboard'));

  const submit = async () => {
    setError(null); setNotice(null);
    const e = email.trim();
    if (!e || !password) return setError('Please fill in both email and password.');
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Enter a valid email address.');
    if (mode === 'signup') {
      if (!name.trim()) return setError('Please enter your name.');
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(e, password);
        close();
      } else {
        const result = await signUp(name, e, password);
        if (result === 'signed-in') close();
        else {
          setNotice('Account created. Check your email and tap the confirmation link, then sign in here.');
          setMode('signin'); setPassword(''); setConfirm('');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={close} hitSlop={12}><Text style={styles.back}>✕ Close</Text></TouchableOpacity>

        <Text style={styles.logo}>⬡</Text>
        <Text style={Typography.h1}>{mode === 'signin' ? 'Welcome back' : 'Create account'}</Text>
        <Text style={[Typography.caption, { marginTop: 4, marginBottom: Spacing.lg }]}>
          Sign in to sync your portfolio across the FIN·OS app and website. You can always use FIN·OS without an account.
        </Text>

        {!configured ? (
          <View style={styles.warn}>
            <Text style={styles.warnTitle}>Cloud sync isn't set up</Text>
            <Text style={styles.warnText}>
              This build has no Supabase credentials. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile/.env and restart Expo. Everything else works offline on this device.
            </Text>
          </View>
        ) : (
          <>
            {mode === 'signup' && (
              <Field label="NAME" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
            )}
            <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com"
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field label="PASSWORD" value={password} onChangeText={setPassword}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} secureTextEntry
              onSubmitEditing={mode === 'signin' ? submit : undefined} />
            {mode === 'signup' && (
              <Field label="CONFIRM PASSWORD" value={confirm} onChangeText={setConfirm} placeholder="Repeat password"
                secureTextEntry onSubmitEditing={submit} />
            )}

            {notice && <Text style={styles.notice}>{notice}</Text>}
            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity style={[styles.primary, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryTxt}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }}>
              <Text style={styles.switch}>
                {mode === 'signin' ? "New to FIN·OS? Create an account" : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.guest} onPress={close}>
          <Text style={styles.guestTxt}>Continue as guest</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={Colors.textDim} autoCorrect={false} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 60 },
  back: { color: Colors.textMuted, fontSize: 14, marginBottom: Spacing.lg },
  logo: { fontSize: 40, color: Colors.cyan, marginBottom: Spacing.sm },
  label: { ...Typography.label, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, color: Colors.textPrimary, fontSize: 15,
  },
  error: { color: Colors.red, fontSize: 13, marginBottom: Spacing.md, lineHeight: 18 },
  notice: { color: Colors.teal, fontSize: 13, marginBottom: Spacing.md, lineHeight: 18 },
  primary: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 15 },
  switch: { color: Colors.cyan, textAlign: 'center', fontSize: 13, fontWeight: '600', marginTop: Spacing.lg },
  guest: { marginTop: Spacing.xl, alignItems: 'center' },
  guestTxt: { color: Colors.textMuted, fontSize: 13 },
  warn: { backgroundColor: 'rgba(240,165,0,0.08)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.3)', borderRadius: Radii.lg, padding: Spacing.md },
  warnTitle: { color: Colors.gold, fontWeight: '700', marginBottom: 4 },
  warnText: { ...Typography.caption, lineHeight: 18 },
});
