import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { recordCrash } from '@/lib/diagnosticsStorage';

interface Props { children: React.ReactNode }
interface State { failed: boolean; key: number }

/**
 * Catches a screen that fails to draw, writes a redacted note of it on this phone (Diagnostics) and shows a plain message instead
 * of a blank screen. It sits INSIDE the app lock, so a crash can never show the app without the PIN. It shows nothing from the
 * error itself: the person reads what was stored on the Diagnostics screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, key: 0 };

  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    // Only component names from the React stack are kept, never props or values.
    const names = String(info?.componentStack ?? '').split('\n').map(l => l.trim().match(/^at\s+([A-Z][A-Za-z0-9_$]{0,40})/)?.[1]).filter(Boolean).slice(0, 6);
    const e: any = error;
    const wrapped = { name: e?.name, message: e?.message, stack: `${e?.stack ?? ''}\n${names.map(n => `at ${n} (component:0:0)`).join('\n')}` };
    recordCrash(wrapped, { kind: 'render' });
  }

  private retry = () => this.setState(s => ({ failed: false, key: s.key + 1 }));

  render() {
    if (!this.state.failed) return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
    return (
      <View style={s.root} accessibilityRole="alert">
        <Text style={s.logo}>⬡</Text>
        <Text style={Typography.h2}>Something went wrong on this screen</Text>
        <Text style={s.body}>The rest of FIN·OS is fine and your data is safe on this phone. A short note about the problem, with numbers and personal details removed, was kept on this phone only. Nothing was sent anywhere.</Text>
        <TouchableOpacity style={s.primary} accessibilityRole="button" onPress={this.retry}><Text style={s.primaryTxt}>Try again</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} accessibilityRole="button" onPress={() => { this.retry(); try { router.replace('/dashboard'); } catch { /* router not ready */ } }}><Text style={s.secondaryTxt}>Go to Home</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => { this.retry(); try { router.push('/diagnostics' as any); } catch { /* router not ready */ } }}><Text style={s.link}>See what was kept</Text></TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  logo: { fontSize: 40, color: Colors.cyan, marginBottom: Spacing.sm },
  body: { ...Typography.caption, textAlign: 'center', lineHeight: 18, marginTop: Spacing.sm, marginBottom: Spacing.lg, maxWidth: 340 },
  primary: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.xl, marginTop: Spacing.sm },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  secondary: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: Spacing.xl, marginTop: Spacing.sm },
  secondaryTxt: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  link: { color: Colors.cyan, fontWeight: '700', fontSize: 13, marginTop: Spacing.lg },
});
