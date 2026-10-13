import React from 'react';
import { LinearGradient as ExpoGradient } from 'expo-linear-gradient';
import { themedColors, useMode } from '@/lib/theme';

/** expo-linear-gradient with its colours mapped for the current appearance. */
export function LinearGradient(props: React.ComponentProps<typeof ExpoGradient>) {
  const mode = useMode();
  const colors = themedColors(props.colors as readonly string[], mode) as unknown as typeof props.colors;
  return <ExpoGradient {...props} colors={colors} />;
}
