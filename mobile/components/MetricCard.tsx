import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: string;
  style?: ViewStyle;
  gradient?: readonly [string, string];
}

export function MetricCard({ label, value, sub, accent = Colors.cyan, icon, style, gradient }: MetricCardProps) {
  return (
    <LinearGradient
      colors={gradient ?? ['#0D1117', '#111827']}
      style={[styles.card, style]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      {sub && <Text style={styles.sub}>{sub}</Text>}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 90,
    justifyContent: 'flex-end',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    opacity: 0.8,
  },
  icon: {
    fontSize: 22,
    marginBottom: Spacing.xs,
  },
  label: {
    ...Typography.label,
    marginBottom: 2,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  sub: {
    ...Typography.caption,
    color: Colors.textDim,
  },
});
