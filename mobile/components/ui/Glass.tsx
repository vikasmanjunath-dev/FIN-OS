import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/theme';
import { useReduceTransparency } from '@/hooks/useReduceMotion';
import { useMode } from '@/lib/theme';

/** (In light mode the blur's own light tint is the material: a hand-made near-white rgba would be flipped to dark by the theme patch.)
 *  A translucent, blurred material (nav bars, tab bar, sheets). Becomes a solid surface when the person asks for Reduce Transparency,
 *  and on Android where blur is only approximate (the tint alone is then opaque enough to read). */
export function Glass({ intensity = 50, tintAlpha = 0.55, style, children }: { intensity?: number; tintAlpha?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const solid = useReduceTransparency();
  const light = useMode() === 'light';
  // Android: blur is only approximate. Web + light: expo-blur paints its own white tint through a plain View, which the light-theme patch
  // would flip to dark, so a solid page-coloured bar (the hairline still marks the edge) is the reliable material there.
  if (solid || Platform.OS === 'android' || (Platform.OS === 'web' && light)) return <View style={[{ backgroundColor: light ? Colors.bg : Colors.surface }, style]}>{children}</View>;
  return (
    <BlurView intensity={intensity} tint={light ? 'light' : 'dark'} style={[light ? null : { backgroundColor: `rgba(8,11,20,${tintAlpha})` }, style]}>{children}</BlurView>
  );
}
