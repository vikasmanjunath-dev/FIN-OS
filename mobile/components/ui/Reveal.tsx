import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Motion } from '@/constants/motion';
import { useReduceMotion } from '@/hooks/useReduceMotion';

/** Content that arrives with a short, staggered spring reveal (transform + opacity only). The 9th item onwards appear together so a
 *  long screen never makes anyone wait. Under Reduce Motion it is a quick cross-fade with no movement. Plays once, when it mounts. */
export function Reveal({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  // A page opened in a background tab never starts its entrance animation, which would leave the content hidden: show it plainly instead.
  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden') return <View style={style}>{children}</View>;
  const delay = Math.min(index, Motion.maxStaggerItems) * Motion.stagger;
  const entering = reduce ? FadeIn.duration(Motion.dur.micro) : FadeInDown.delay(delay).duration(Motion.dur.transition).springify().damping(20).stiffness(190);
  return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}
