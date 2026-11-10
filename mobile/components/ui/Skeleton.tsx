import React, { useEffect } from 'react';
import { DimensionValue, StyleProp, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Colors, Radii, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/useReduceMotion';

/** A placeholder block with a slow pulse (still under Reduce Motion). Use it where content will land, instead of a spinner. */
export function Skeleton({ width = '100%', height = 14, radius = Radii.sm, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (reduce) { o.value = 0.6; return; }
    o.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1);
  }, [reduce, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.08)' }, style, a]} />;
}

/** A card-shaped skeleton: a title line and a few body lines. Announces itself once as "Loading". */
export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}
      style={[{ backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm }, style]}>
      <Skeleton width="45%" height={16} />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} />)}
    </View>
  );
}

/** Placeholder list rows (icon + two lines), the shape of most lists in the app. */
export function SkeletonRows({ count = 4, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}
      style={[{ backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md }, style]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: Colors.border }}>
          <Skeleton width={40} height={40} radius={Radii.md} />
          <View style={{ flex: 1, gap: 8 }}><Skeleton width="55%" height={14} /><Skeleton width="80%" height={11} /></View>
        </View>
      ))}
    </View>
  );
}

/** Placeholder for a chart: a rounded block where the plot will land. */
export function SkeletonChart({ height = 160, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel="Loading chart" accessibilityState={{ busy: true }}
      style={[{ backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md }, style]}>
      <Skeleton width="100%" height={height} radius={Radii.md} />
    </View>
  );
}
