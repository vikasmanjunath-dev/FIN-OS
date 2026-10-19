import React from 'react';
import { StyleProp, Text, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';
import { Btn } from '@/constants/theme';

/** A text link that is a real button: 44 px tall, announced as a button, with press feedback. (A <Text onPress> link is only as tall as its
 *  line, which is why "Reset", "Edit" and "Remove" were hard to hit.) */
export function LinkButton({ children, onPress, textStyle, style, accessibilityLabel }: {
  children: React.ReactNode; onPress: () => void; textStyle?: StyleProp<TextStyle>; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={[Btn.link, { alignSelf: 'flex-start' }, style]}>
      <Text style={textStyle}>{children}</Text>
    </TouchableOpacity>
  );
}
