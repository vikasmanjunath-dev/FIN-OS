import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { Btn, Colors } from '@/constants/theme';

type Props = {
  label: string; onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  color?: string;               // the accent of the feature this button belongs to (defaults to cyan)
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; testID?: string;
};

/** The one button. A loading or disabled button cannot be pressed twice (double-submit protection), keeps its size while it spins,
 *  and tells assistive technology its state. */
export function Button({ label, onPress, variant = 'primary', color = Colors.cyan, loading, disabled, style, accessibilityLabel, testID }: Props) {
  const off = !!(loading || disabled);
  const fill = variant === 'primary' ? { backgroundColor: color } : variant === 'danger' ? { backgroundColor: Colors.red }
    : variant === 'secondary' ? { borderWidth: 1, borderColor: color + '88', backgroundColor: color + '14' } : null;
  const ink = variant === 'primary' || variant === 'danger' ? '#000' : color;
  return (
    <TouchableOpacity
      testID={testID} onPress={off ? undefined : onPress} activeOpacity={0.8} disabled={off}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: off, busy: !!loading }}
      style={[Btn.base, fill, off && s.off, style]}
    >
      {loading ? <ActivityIndicator color={ink} /> : null}
      <Text style={[Btn.text, { color: ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({ off: { opacity: 0.5 } });
