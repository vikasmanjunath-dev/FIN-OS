import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '@/hooks/useAryaChat';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface AryaBubbleProps {
  message: ChatMessage;
}

export function AryaBubble({ message }: AryaBubbleProps) {
  const isArya = message.role === 'arya';

  return (
    <View style={[styles.row, isArya ? styles.rowArya : styles.rowUser]}>
      {isArya && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>✦</Text>
        </View>
      )}
      <View style={[styles.bubble, isArya ? styles.bubbleArya : styles.bubbleUser]}>
        <Text style={[styles.text, isArya ? styles.textArya : styles.textUser]}>
          {message.text}
          {message.streaming && <Text style={styles.cursor}>▋</Text>}
        </Text>
        <Text style={styles.time}>
          {message.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  rowArya: { alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end', alignItems: 'flex-end' },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    backgroundColor: 'rgba(123,47,247,0.2)',
    borderWidth: 1,
    borderColor: Colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
    marginBottom: 4,
  },
  avatarText: { fontSize: 12, color: Colors.purple },

  bubble: {
    maxWidth: '80%',
    borderRadius: Radii.lg,
    padding: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  bubbleArya: {
    backgroundColor: 'rgba(123,47,247,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(123,47,247,0.2)',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.25)',
    borderBottomRightRadius: 4,
  },

  text: { ...Typography.body, lineHeight: 20 },
  textArya: { color: Colors.textPrimary },
  textUser: { color: Colors.cyan },

  cursor: { color: Colors.purple, fontWeight: '100' },

  time: {
    ...Typography.caption,
    color: Colors.textDim,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});
