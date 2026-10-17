import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ChatMessage } from '@/hooks/useAryaChat';
import { AryaToolCalls } from '@/components/AryaToolCalls';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

// Minimal markdown: headings, **bold**, and -/*/1. list items. No dependency needed for chat-sized text.
function renderInline(line: string, keyPrefix: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <Text key={`${keyPrefix}-${i}`} style={styles.bold}>{part.slice(2, -2)}</Text>
      : part,
  );
}

function renderMarkdown(text: string) {
  return text.split('\n').map((raw, i) => {
    const line = raw.trimEnd();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) return <Text key={i} style={styles.heading}>{renderInline(heading[1], `h${i}`)}{'\n'}</Text>;
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) return <Text key={i}>{'  •  '}{renderInline(bullet[1], `b${i}`)}{'\n'}</Text>;
    return <Text key={i}>{renderInline(line, `p${i}`)}{'\n'}</Text>;
  });
}

interface AryaBubbleProps {
  message: ChatMessage;
  /** a chip that carries a question ("Which did you mean?") sends it through this */
  onAsk?: (question: string) => void;
}

export function AryaBubble({ message, onAsk }: AryaBubbleProps) {
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
          {isArya ? renderMarkdown(message.text.trimEnd()) : message.text}
          {message.streaming && <Text style={styles.cursor}>▋</Text>}
        </Text>
        {isArya && message.steps?.length ? <AryaToolCalls steps={message.steps} /> : null}
        {isArya && message.actions?.length ? (
          <View style={styles.actions}>
            {message.actions.map(a => (
              <TouchableOpacity key={a.route ?? a.ask ?? a.label} accessibilityRole="button" accessibilityLabel={a.ask ? `Ask: ${a.ask}` : `Open ${a.label}`} style={styles.chip}
                onPress={() => { if (a.ask) onAsk?.(a.ask); else if (a.route) router.push(a.route as any); }}>
                <Text style={styles.chipTxt}>{a.label} ›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
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
  avatarText: { fontSize: 12, color: Colors.purpleInk },

  bubble: {
    maxWidth: '80%',
    borderRadius: Radii.lg,
    padding: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: 'rgba(123,47,247,0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipTxt: { color: Colors.purpleInk, fontSize: 12, fontWeight: '700' },
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

  bold: { fontWeight: '700', color: Colors.textPrimary },
  heading: { fontWeight: '700', color: Colors.cyan },

  cursor: { color: Colors.purpleInk, fontWeight: '100' },

  time: {
    ...Typography.caption,
    color: Colors.textDim,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});
