import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ToolStep } from '@/lib/aryaAgent';
import { stamp } from '@/lib/aryaToolbox';
import { Colors, Radii } from '@/constants/theme';

const MARK = { running: '…', done: '✓', failed: '✕', skipped: '–' } as const;
const WORD = { running: 'running', done: 'done', failed: 'failed', skipped: 'not run' } as const;

/** Every tool call behind an answer: which tool, where it ran, what it was given, what left the phone, when, and how it ended. */
export function AryaToolCalls({ steps, compact = false }: { steps: ToolStep[]; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!steps.length) return null;
  return (
    <View style={s.box} accessibilityLabel="Tool calls behind this answer">
      <Text style={s.head}>{steps.length === 1 ? 'TOOL USED' : `${steps.length} TOOLS USED`}</Text>
      {steps.map(st => {
        const on = open === st.id;
        return (
          <View key={st.id} style={s.item}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${st.label}, ${WORD[st.status]}, ${st.where === 'phone' ? 'on this phone' : 'through the Arya server'}. ${on ? 'Hide' : 'Show'} details`}
              onPress={() => setOpen(on ? null : st.id)} style={s.row}>
              <Text style={[s.mark, st.status === 'failed' && { color: Colors.red }, st.status === 'done' && { color: Colors.teal }]}>{MARK[st.status]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{st.label} <Text style={s.where}>{st.where === 'phone' ? 'on this phone' : 'via the Arya server'}</Text></Text>
                <Text style={s.args}>{st.args}</Text>
              </View>
              <Text style={s.time}>{stamp(st.endedAt ?? st.startedAt).split(', ')[1]}</Text>
            </Pressable>
            {on || compact === false && st.status !== 'done' && st.note ? (
              <View style={s.detail}>
                <Text style={s.dline}>Status: {WORD[st.status]}{st.endedAt ? `, ${Math.max(0, st.endedAt - st.startedAt)} ms` : ''}</Text>
                <Text style={s.dline}>Left the phone: {st.sends}</Text>
                {st.source ? <Text style={s.dline}>Source: {st.source}</Text> : null}
                {st.note ? <Text style={s.dline}>{st.note}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  box: { marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6 },
  head: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 2 },
  item: { marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3 },
  mark: { width: 14, color: Colors.textMuted, fontWeight: '800', fontSize: 13 },
  name: { color: Colors.textPrimary, fontSize: 12, fontWeight: '700' },
  where: { color: Colors.textDim, fontWeight: '400' },
  args: { color: Colors.textMuted, fontSize: 11, lineHeight: 15 },
  time: { color: Colors.textDim, fontSize: 10 },
  detail: { marginLeft: 20, marginBottom: 4, padding: 6, borderRadius: Radii.sm, backgroundColor: Colors.overlay },
  dline: { color: Colors.textMuted, fontSize: 11, lineHeight: 15 },
});
