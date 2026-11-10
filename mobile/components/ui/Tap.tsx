import React, { useCallback } from 'react';
import { Platform, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Hit } from '@/constants/theme';
import { Motion } from '@/constants/motion';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { installWebFocusRing } from '@/lib/webFocus';

installWebFocusRing();

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TapProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  /** dim level while pressed (kept for TouchableOpacity compatibility) */
  activeOpacity?: number;
  /** scale while pressed; 1 turns the squash off (e.g. for full-width rows) */
  pressScale?: number;
  /** a tick on touch-down: 'selection' for choices and tabs, 'light' for primary actions */
  haptic?: 'none' | 'selection' | 'light';
  children?: React.ReactNode;
}

function tick(kind: TapProps['haptic']) {
  if (!kind || kind === 'none' || Platform.OS === 'web') return;
  try { (kind === 'selection' ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))?.catch?.(() => {}); } catch { /* haptics are a nicety */ }
}

/**
 * The app's one pressable. A drop-in for TouchableOpacity (same props) that answers a touch at once with a spring squash and a dim,
 * releases with a soft rebound, can be interrupted at any moment, and falls back to a plain dim under Reduce Motion.
 * Layout is untouched: the style lands on the pressable itself, exactly as TouchableOpacity did.
 */
export function Tap({ style, activeOpacity = 0.85, pressScale = Motion.press.scale, haptic = 'none', onPressIn, onPressOut, hitSlop, disabled, children, ...rest }: TapProps) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const dim = useSharedValue(1);
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const baseOpacity = typeof flat?.opacity === 'number' ? flat.opacity : 1;        // e.g. a disabled look set by the caller
  const baseTransform = Array.isArray(flat?.transform) ? flat!.transform : [];

  const anim = useAnimatedStyle(() => ({ opacity: baseOpacity * dim.value, transform: [...(baseTransform as any[]), { scale: scale.value }] }));

  const down = useCallback((e: any) => {
    if (!reduce) scale.value = withSpring(pressScale, Motion.press.in);
    dim.value = withTiming(activeOpacity, { duration: 80 });
    tick(haptic);
    onPressIn?.(e);
  }, [reduce, pressScale, activeOpacity, haptic, onPressIn, scale, dim]);

  const up = useCallback((e: any) => {
    scale.value = reduce ? 1 : withSpring(1, Motion.press.out);
    dim.value = withTiming(1, { duration: 160 });
    onPressOut?.(e);
  }, [reduce, onPressOut, scale, dim]);

  return (
    <AnimatedPressable {...rest} disabled={disabled} hitSlop={hitSlop ?? Hit.slop} onPressIn={down} onPressOut={up} style={[style, anim]}>
      {children}
    </AnimatedPressable>
  );
}

/** Same name as React Native's, so screens can adopt the new feel by changing one import. */
export { Tap as TouchableOpacity };
