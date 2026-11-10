import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { Tap } from '@/components/ui/Tap';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';

type Tone = 'success' | 'info' | 'warning' | 'error';
export interface ToastOptions { text: string; tone?: Tone; actionLabel?: string; onAction?: () => void; duration?: number }

const TONE: Record<Tone, { color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  success: { color: Colors.teal, icon: 'checkmark-circle' },
  info: { color: Colors.cyan, icon: 'information-circle' },
  warning: { color: Colors.gold, icon: 'warning' },
  error: { color: Colors.red, icon: 'alert-circle' },
};

const Ctx = createContext<{ show: (o: ToastOptions) => void }>({ show: () => {} });
/** `useToast().show({ text, tone, actionLabel, onAction })`: a brief confirmation that slides in, settles, and goes away on its own. */
export const useToast = () => useContext(Ctx);

/** One toast at a time (a new one replaces the old). Announced to screen readers, a tap dismisses it, a longer stay when it carries an action
 *  (Undo), and a fade instead of movement under Reduce Motion. Sits above the tab bar. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => { if (timer.current) clearTimeout(timer.current); setT(null); }, []);
  const show = useCallback((o: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setT({ ...o, id });
    if (o.tone === 'warning' || o.tone === 'error') hapticWarning(); else hapticSuccess();
    AccessibilityInfo.announceForAccessibility?.(o.text);
    timer.current = setTimeout(() => setT(c => (c && c.id === id ? null : c)), o.duration ?? (o.actionLabel ? 6000 : 3500));
  }, []);

  const tone = TONE[t?.tone ?? 'success'];
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {t ? (
        <Animated.View key={t.id} pointerEvents="box-none" style={[s.wrap, { bottom: insets.bottom + 84 }]}
          entering={reduce ? FadeIn.duration(150) : FadeInDown.springify().damping(18).stiffness(220)} exiting={reduce ? FadeOut.duration(120) : FadeOutDown.duration(180)}>
          <View accessibilityRole="alert" style={[s.toast, { borderColor: tone.color + '66' }]}>
            <Tap onPress={dismiss} pressScale={0.98} accessibilityLabel={`${t.text}. Dismiss`} style={s.body}>
              <Ionicons name={tone.icon} size={20} color={tone.color} />
              <Text style={s.text} numberOfLines={3} maxFontSizeMultiplier={1.3}>{t.text}</Text>
            </Tap>
            {t.actionLabel && t.onAction ? (
              <Tap accessibilityRole="button" haptic="selection" onPress={() => { const a = t.onAction; dismiss(); a?.(); }} style={s.action}>
                <Text style={[s.actionTxt, { color: tone.color }]}>{t.actionLabel.toUpperCase()}</Text>
              </Tap>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.md, right: Spacing.md, alignItems: 'center', zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', maxWidth: 520, width: '100%', backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderRadius: Radii.lg, paddingLeft: Spacing.md, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  text: { ...Type.callout, flex: 1, fontWeight: '600' },
  action: { paddingHorizontal: Spacing.md, alignSelf: 'stretch', justifyContent: 'center' },
  actionTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
});
