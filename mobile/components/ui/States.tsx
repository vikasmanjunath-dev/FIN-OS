import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Type } from '@/constants/theme';
import { Button } from '@/components/Button';

type Icon = React.ComponentProps<typeof Ionicons>['name'];

/** Nothing here yet: one icon, one sentence on why, and the one thing to do about it. */
export function EmptyState({ icon = 'sparkles-outline', title, body, actionLabel, onAction }: { icon?: Icon; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View accessible accessibilityRole="summary" style={{ alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,212,255,0.10)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs }}>
        <Ionicons name={icon} size={26} color={Colors.cyan} />
      </View>
      <Text style={[Type.headline, { textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[Type.callout, { textAlign: 'center', color: Colors.textMuted }]}>{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: Spacing.sm }} /> : null}
    </View>
  );
}

/** Something went wrong: plain words, no blame, and a way out. */
export function ErrorState({ title = "That didn't work", body = 'Check your connection and try again. Your data on this phone is safe.', onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
      <Ionicons name="cloud-offline-outline" size={30} color={Colors.gold} />
      <Text style={[Type.headline, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[Type.callout, { textAlign: 'center', color: Colors.textMuted }]}>{body}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} style={{ alignSelf: 'stretch', marginTop: Spacing.sm }} /> : null}
    </View>
  );
}
