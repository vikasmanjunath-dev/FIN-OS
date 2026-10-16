import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { MAX_COMMENT, OUTCOME, TOPICS, TOPIC_LABELS, type Topic } from '@/lib/feedback';
import { saveFeedback, sendLatest } from '@/lib/feedbackStorage';

/**
 * "Was this useful?" card. Same promise as the website's prompt: saved on this phone first, redacted before it is stored,
 * and sent nowhere unless consent is on AND an inbox exists (neither is true today). Other screens can drop it in:
 *   <FeedbackPrompt topic="money-score" page="/tools/score" question="Did your Money Score feel right?" />
 * Leave `topic` out to let the person choose one.
 */
export function FeedbackPrompt({ topic, page, question = 'Was this useful?', onSaved }: { topic?: Topic; page?: string; question?: string; onSaved?: () => void }) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [chosen, setChosen] = useState<Topic>(topic ?? 'other');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await saveFeedback({ rating, comment, topic: topic ?? chosen, page });
      if (!saved) { setMsg(rating || comment.trim() ? 'Could not save that on this phone.' : 'Pick Yes or Not really, or write a line, then save.'); return; }
      const res = await sendLatest();
      setMsg(res.ok ? OUTCOME.ok : OUTCOME[res.reason ?? 'other']);
      setComment(''); setRating(null);
      onSaved?.();
    } finally { setBusy(false); }
  };

  return (
    <View style={s.card} accessibilityRole="none">
      <Text style={s.q}>{question}</Text>
      {!topic && (
        <View style={s.chips}>
          {TOPICS.map(t => (
            <TouchableOpacity key={t} accessibilityRole="button" accessibilityLabel={`Topic: ${TOPIC_LABELS[t]}`} accessibilityState={{ selected: chosen === t }}
              style={[s.chip, chosen === t && s.chipOn]} onPress={() => setChosen(t)}>
              <Text style={[s.chipTxt, chosen === t && { color: Colors.cyan }]}>{TOPIC_LABELS[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={s.rate}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Yes, it was useful" accessibilityState={{ selected: rating === 'up' }}
          style={[s.btn, rating === 'up' && s.btnOn]} onPress={() => setRating(r => (r === 'up' ? null : 'up'))}><Text style={[s.btnTxt, rating === 'up' && { color: Colors.bg }]}>👍 Yes</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Not really useful" accessibilityState={{ selected: rating === 'down' }}
          style={[s.btn, rating === 'down' && s.btnOn]} onPress={() => setRating(r => (r === 'down' ? null : 'down'))}><Text style={[s.btnTxt, rating === 'down' && { color: Colors.bg }]}>👎 Not really</Text></TouchableOpacity>
      </View>
      <Text style={s.label}>Anything to add?</Text>
      <Text style={[Typography.caption, { marginBottom: 6, lineHeight: 16 }]}>Please leave out amounts and personal details. Numbers, e-mails and links are removed before saving. Names and addresses cannot be recognised, so leave them out.</Text>
      <TextInput style={s.input} value={comment} onChangeText={setComment} multiline maxLength={MAX_COMMENT} accessibilityLabel="Your feedback"
        placeholderTextColor={Colors.textDim} placeholder="Optional" autoCorrect={false} />
      <TouchableOpacity accessibilityRole="button" style={[s.save, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}><Text style={s.saveTxt}>Save feedback</Text></TouchableOpacity>
      {msg ? <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17, color: Colors.textPrimary }]} accessibilityLiveRegion="polite">{msg}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md },
  q: { ...Typography.h3, marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { borderColor: Colors.cyan, backgroundColor: 'rgba(0,212,255,0.12)' },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  rate: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
  btn: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: Spacing.md },
  btnOn: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  btnTxt: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  label: { ...Typography.body, fontWeight: '700', marginBottom: 2 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, padding: Spacing.sm, color: Colors.textPrimary, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  save: { borderWidth: 1, borderColor: Colors.cyan + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.md },
  saveTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
});
