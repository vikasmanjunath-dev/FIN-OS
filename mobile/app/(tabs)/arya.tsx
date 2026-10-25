import React, { useRef, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAryaChat } from '@/hooks/useAryaChat';
import { AryaBubble } from '@/components/AryaBubble';
import { AryaTabs } from '@/components/AryaTabs';
import { loadPrefs, savePrefs } from '@/lib/aryaMemoryStorage';
import { useLang } from '@/lib/i18n';
import { contextBase } from '@/lib/reels/ask';
import { aryaPrefill, parseAryaParams, PREFILL_NOTE, PREFILL_NOTE_MINE } from '@/lib/reels/aryaLink';
import { loadMine } from '@/lib/reels/mine';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

// The first four are answered on the phone from your own records (no connection needed); the rest go to Arya online.
const SUGGESTED = [
  'What is my net worth?',
  'How many months does my emergency fund cover?',
  'What is due this month?',
  'SIP of 10000 at 12% for 15 years',
  'How is the Nifty today?',
  'Explain ELSS vs PPF for tax saving',
];

export default function AryaScreen() {
  const insets = useSafeAreaInsets();
  const { messages, isStreaming, send, stop, clear } = useAryaChat();
  const [input, setInput] = React.useState('');
  const listRef = useRef<FlatList>(null);
  const [toolsOn, setToolsOn] = useState(true);
  // Opened from a reel's "Ask Arya more": the route carries only a library reel id (and "mine=1" if the person asked for their own numbers). Anything else is ignored.
  const lang = useLang();
  const params = useLocalSearchParams<{ reel?: string; mine?: string }>();
  const [fromReel, setFromReel] = useState<{ mine: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    const p = parseAryaParams(params);
    if (!p) return;
    let live = true;
    (async () => {
      const mineBase = p.mine ? contextBase({ ...p.reel, mine: true }, await loadMine().catch(() => ({}))) : null;
      if (!live) return;
      setInput(aryaPrefill(p.reel, lang, mineBase)); setFromReel({ mine: !!mineBase });
      router.setParams({ reel: undefined, mine: undefined } as never);
    })();
    return () => { live = false; };
  }, [params, lang]));
  useFocusEffect(useCallback(() => { loadPrefs().then(p => setToolsOn(p.tools)).catch(() => {}); }, []));
  const toggleTools = useCallback(() => {
    Haptics.selectionAsync();
    setToolsOn(v => { savePrefs({ tools: !v }).catch(() => {}); return !v; });
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput(''); setFromReel(null);
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}   // where this view starts below the top of the screen (the old 88 was a guess)
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
        <View style={{ flexDirection: 'row', gap: Spacing.md }}>
          <Pressable accessibilityRole="button" accessibilityLabel="What Arya remembers and what it will be told" onPress={() => router.push('/pulse/memory' as any)} hitSlop={12}>
            <Text style={styles.clearBtn}>Memory</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear the conversation" onPress={() => { Haptics.selectionAsync(); clear(); }} hitSlop={12}>
            <Text style={styles.clearBtn}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabsWrap}>
        <AryaTabs current="chat" />
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: toolsOn }} accessibilityLabel={toolsOn ? 'Arya tools are on. Switch them off' : 'Arya tools are off. Switch them on'} onPress={toggleTools} style={styles.toolsRow}>
          <Text style={styles.toolsTxt}>{toolsOn ? '🔧 Tools on: Arya may read your records or look up public prices, and shows every call.' : '🔧 Tools off: Arya answers in words only and reads nothing.'}</Text>
          <Text style={styles.toolsLink}>{toolsOn ? 'Turn off' : 'Turn on'}</Text>
        </Pressable>
      </View>

      {/* ── Messages ── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item, index }) => <AryaBubble message={item} onAsk={handleSuggest} question={messages[index - 1]?.role === 'user' ? messages[index - 1].text : undefined} />}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => { if (messages.length > 1) listRef.current?.scrollToEnd({ animated: true }); }}   // the greeting plus the suggestions stay at the top: scrolling to the end cut the greeting under the header
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          messages.length <= 1 ? (
            <View style={styles.suggestContainer}>
              <Text style={styles.suggestLabel}>Try asking</Text>
              {SUGGESTED.map(s => (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ask: ${s}`} key={s} style={styles.suggestBtn} onPress={() => handleSuggest(s)} activeOpacity={0.7}>
                  <Text style={styles.suggestText}>{s}</Text>
                  <Text style={{ color: Colors.purpleInk }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
      />

      {fromReel ? <Text style={styles.fromReel}>{(fromReel.mine ? PREFILL_NOTE_MINE : PREFILL_NOTE)[lang]}</Text> : null}
      {/* ── Input ── */}
      <View style={styles.inputBar}>
        <TextInput accessibilityLabel="Message to Arya"
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
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop the answer" style={[styles.sendBtn, styles.stopBtn]} onPress={stop}>
            <Text style={styles.sendIcon}>■</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message"
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Text style={[styles.sendIcon, !input.trim() && styles.sendIconDisabled]}>↑</Text>
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
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: Spacing.md, rowGap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.md,   // one 16 px gutter for header, chips, messages and input
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1 },
  avatarRing: {
    width: 40, height: 40, borderRadius: Radii.full,
    backgroundColor: 'rgba(123,47,247,0.15)', borderWidth: 1.5, borderColor: Colors.purple,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarGlyph: { fontSize: 18, color: Colors.purpleInk },
  headerName: { ...Typography.h3, fontSize: 16 },
  headerSub: { ...Typography.caption },
  clearBtn: { ...Typography.caption, color: Colors.textMuted },
  tabsWrap: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  toolsTxt: { ...Typography.caption, flex: 1, lineHeight: 16 },
  toolsLink: { ...Typography.caption, color: Colors.purpleInk, fontWeight: '700' },

  fromReel: { ...Typography.caption, color: Colors.textMuted, paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },
  messageList: { paddingTop: Spacing.md, paddingBottom: Spacing.lg },

  suggestContainer: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, gap: Spacing.sm },
  suggestLabel: { ...Typography.label, marginBottom: Spacing.xs },
  suggestBtn: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
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
    flex: 1, minHeight: 44, maxHeight: 120, textAlignVertical: 'center',
    backgroundColor: Colors.overlay, borderWidth: 1, borderColor: Colors.borderMed,
    borderRadius: Radii.xl, paddingHorizontal: Spacing.md, paddingTop: 11, paddingBottom: 11,
    color: Colors.textPrimary, fontSize: 15,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: Radii.full,
    backgroundColor: Colors.purple, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(123,47,247,0.25)' },
  stopBtn: { backgroundColor: Colors.red },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sendIconDisabled: { color: Colors.textMuted },

  streamingBadge: {
    position: 'absolute', bottom: 80, alignSelf: 'center',
    backgroundColor: 'rgba(123,47,247,0.15)', borderWidth: 1, borderColor: 'rgba(123,47,247,0.3)',
    borderRadius: Radii.full, paddingHorizontal: Spacing.md, paddingVertical: 6,
  },
  streamingText: { ...Typography.caption, color: Colors.purpleInk, fontWeight: '700' },
});
