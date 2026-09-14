import React, { useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAryaChat } from '@/hooks/useAryaChat';
import { AryaBubble } from '@/components/AryaBubble';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const SUGGESTED = [
  'How much should I invest in SIP?',
  'Explain ELSS vs PPF for tax saving',
  'What is my ideal emergency fund?',
  'Show Nifty 50 analysis',
  'How do I start investing in MFs?',
];

export default function AryaScreen() {
  const { messages, isStreaming, send, stop, clear } = useAryaChat();
  const [input, setInput] = React.useState('');
  const listRef = useRef<FlatList>(null);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    Haptics.selectionAsync();
    send(text);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [input, isStreaming, send]);

  const handleSuggest = useCallback((text: string) => {
    Haptics.selectionAsync();
    send(text);
  }, [send]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarGlyph}>✦</Text>
          </View>
          <View>
            <Text style={styles.headerName}>Arya</Text>
            <Text style={styles.headerSub}>FIN·OS Financial AI</Text>
          </View>
        </View>
        <Pressable onPress={() => { Haptics.selectionAsync(); clear(); }} hitSlop={12}>
          <Text style={styles.clearBtn}>Clear</Text>
        </Pressable>
      </View>

      {/* ── Messages ── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <AryaBubble message={item} />}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          messages.length <= 1 ? (
            <View style={styles.suggestContainer}>
              <Text style={styles.suggestLabel}>Try asking</Text>
              {SUGGESTED.map(s => (
                <TouchableOpacity key={s} style={styles.suggestBtn} onPress={() => handleSuggest(s)} activeOpacity={0.7}>
                  <Text style={styles.suggestText}>{s}</Text>
                  <Text style={{ color: Colors.purple }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
      />

      {/* ── Input ── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask Arya anything…"
          placeholderTextColor={Colors.textDim}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline
          maxLength={500}
        />
        {isStreaming ? (
          <TouchableOpacity style={[styles.sendBtn, styles.stopBtn]} onPress={stop}>
            <Text style={styles.sendIcon}>■</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Streaming indicator ── */}
      {isStreaming && (
        <View style={styles.streamingBadge}>
          <Text style={styles.streamingText}>✦ Arya is thinking…</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatarRing: {
    width: 40, height: 40, borderRadius: Radii.full,
    backgroundColor: 'rgba(123,47,247,0.15)', borderWidth: 1.5, borderColor: Colors.purple,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarGlyph: { fontSize: 18, color: Colors.purple },
  headerName: { ...Typography.h3, fontSize: 16 },
  headerSub: { ...Typography.caption },
  clearBtn: { ...Typography.caption, color: Colors.textMuted },

  messageList: { paddingTop: Spacing.md, paddingBottom: Spacing.lg },

  suggestContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  suggestLabel: { ...Typography.label, marginBottom: Spacing.xs },
  suggestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.overlay, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radii.md, padding: Spacing.sm + 2, paddingHorizontal: Spacing.md,
  },
  suggestText: { ...Typography.body, flex: 1, color: Colors.textMuted },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: Colors.overlay, borderWidth: 1, borderColor: Colors.borderMed,
    borderRadius: Radii.xl, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.textPrimary, fontSize: 14,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: Radii.full,
    backgroundColor: Colors.purple, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(123,47,247,0.25)' },
  stopBtn: { backgroundColor: Colors.red },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },

  streamingBadge: {
    position: 'absolute', bottom: 80, alignSelf: 'center',
    backgroundColor: 'rgba(123,47,247,0.15)', borderWidth: 1, borderColor: 'rgba(123,47,247,0.3)',
    borderRadius: Radii.full, paddingHorizontal: Spacing.md, paddingVertical: 6,
  },
  streamingText: { ...Typography.caption, color: Colors.purple, fontWeight: '700' },
});
