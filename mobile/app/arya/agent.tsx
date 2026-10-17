import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { AryaTabs } from '@/components/AryaTabs';
import { AryaToolCalls } from '@/components/AryaToolCalls';
import { Collapsible } from '@/components/CalcUI';
import { loadPrefs, savePrefs, type AryaPrefs, DEFAULT_PREFS } from '@/lib/aryaMemoryStorage';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import { loadMemory, addMemoryNote } from '@/lib/aryaMemoryStorage';
import { loadLifeEvents } from '@/lib/lifeEventsStorage';
import { planTurn, runCalls, composeAnswer, type ToolStep } from '@/lib/aryaAgent';
import { TOOL_SPECS, NOT_ON_PHONE } from '@/lib/aryaToolbox';
import { getLog, subscribeLog, logSteps, clearLog } from '@/lib/aryaAgentLog';
import { postTool } from '@/hooks/useAryaChat';
import { Colors, Spacing, Radii } from '@/constants/theme';

const GROUPS = [['records', 'Your records (on this phone)'], ['calculators', 'Calculators (on this phone)'], ['tax', 'Tax (on this phone)'], ['memory', 'Memory (on this phone)'], ['navigate', 'Help and screens'], ['market', 'Public market data (through your Arya server)']] as const;

export default function AryaAgent() {
  const [prefs, setPrefs] = useState<AryaPrefs>(DEFAULT_PREFS);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; steps: ToolStep[] } | null>(null);
  const log = useSyncExternalStore(subscribeLog, getLog, getLog);
  useFocusEffect(useCallback(() => { loadPrefs().then(setPrefs).catch(() => {}); }, []));
  const set = async (patch: Partial<AryaPrefs>) => setPrefs(await savePrefs(patch));

  const run = async () => {
    const text = q.trim(); if (!text || busy) return;
    setBusy(true); setOut(null);
    try {
      const plan = planTurn(text, prefs);
      if (plan.kind === 'off') { setOut({ text: 'Tools are switched off. Switch them on above to run one.', steps: [] }); return; }
      if (plan.kind !== 'calls') { setOut({ text: plan.kind === 'ask' ? plan.text : plan.kind === 'advice' ? 'That asks what to buy or sell. No tool answers that, and I do not give that advice.' : 'No tool matches that. Ask it in Chat instead, or try one of the examples below.', steps: [] }); return; }
      const [facts, memory, events] = await Promise.all([loadArFacts(new Date()), loadMemory().catch(() => []), loadLifeEvents().catch(() => [])]);
      const steps = await runCalls(plan.calls, {
        ctx: { facts, events, memory }, prefs, nowMs: () => Date.now(),
        callServer: postTool,
        addMemory: async note => { const r = await addMemoryNote({ text: note }); return r.status === 'rejected' ? { ok: false, message: r.reason ?? 'Not kept.' } : { ok: true, message: `Noted: "${r.item?.text ?? note}". Kept on this phone.` }; },
        onSteps: st => logSteps(st, 'agent', text),
      });
      setOut({ text: composeAnswer(steps).text, steps });
    } finally { setBusy(false); }
  };

  return (
    <TrackerScreen title="Agent" subtitle="Arya can use tools: read your records on this phone, run a calculator, or look up a public price. Every call is listed here and under the answer, with what it was given, what left the phone, and when.">
      <AryaTabs current="agent" />
      <Card accent={prefs.tools ? Colors.teal : Colors.gold}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: prefs.tools }} accessibilityLabel="Allow Arya to use tools" onPress={() => set({ tools: !prefs.tools })} style={s.sw}>
          <Text style={s.t}>Tools {prefs.tools ? 'are on' : 'are off'}</Text><Text style={s.link}>{prefs.tools ? 'Turn off' : 'Turn on'}</Text>
        </Pressable>
        <Text style={s.body}>{prefs.tools ? 'Arya may call the tools below. Off means Arya answers in words only and never reads your records or looks anything up.' : 'Arya will not read your records or look anything up. Questions go to the online model (if allowed) as plain chat.'}</Text>
        <Text style={s.body}>Public price lookups also need the online switch ({prefs.online ? 'on' : 'off'}) in What Arya remembers.</Text>
      </Card>

      <SectionLabel>TRY A TOOL</SectionLabel>
      <Card>
        <TextInput accessibilityLabel="Ask a tool question" style={s.input} value={q} onChangeText={setQ} placeholder="e.g. What is my net worth? or Price of RELIANCE" placeholderTextColor={Colors.textDim} returnKeyType="go" onSubmitEditing={run} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Run" onPress={run} disabled={busy || !q.trim()} style={[s.btn, (busy || !q.trim()) && { opacity: 0.5 }]}><Text style={s.btnT}>{busy ? 'Running…' : 'Run'}</Text></TouchableOpacity>
        {out ? (<><Text style={s.out}>{out.text}</Text><AryaToolCalls steps={out.steps} /></>) : null}
      </Card>

      <SectionLabel>CALLS THIS SESSION</SectionLabel>
      <Card>
        {log.length === 0 ? <Text style={s.body}>No tool has been called since the app opened. The list is kept in memory only and is gone when the app closes.</Text> : (
          <>
            {log.slice(0, 15).map(e => <View key={e.id} style={{ marginBottom: 6 }}><Text style={s.q}>{e.via === 'chat' ? 'Chat' : 'Agent'}: "{e.question}"</Text><AryaToolCalls steps={[e]} compact /></View>)}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear the list of calls" onPress={clearLog} style={s.btn}><Text style={s.btnT}>Clear list</Text></TouchableOpacity>
          </>
        )}
      </Card>

      <SectionLabel>EVERY TOOL</SectionLabel>
      {GROUPS.map(([id, title]) => (
        <Collapsible key={id} title={title}>
          {TOOL_SPECS.filter(t => t.group === id).map(t => (
            <View key={t.id} style={{ marginBottom: Spacing.sm }}>
              <Text style={s.t}>{t.label}</Text>
              <Text style={s.body}>Reads: {t.reads}. {t.sends}</Text>
              <Text style={s.body}>Try: "{t.example}"</Text>
            </View>
          ))}
        </Collapsible>
      ))}
      <Collapsible title="Not on the phone, and why">
        {NOT_ON_PHONE.map(n => <View key={n.name} style={{ marginBottom: Spacing.sm }}><Text style={s.t}>{n.name}</Text><Text style={s.body}>{n.why}</Text></View>)}
      </Collapsible>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="What Arya remembers and will be told" onPress={() => router.push('/pulse/memory' as any)} style={s.btn}><Text style={s.btnT}>What Arya remembers ›</Text></TouchableOpacity>
    </TrackerScreen>
  );
}
const s = StyleSheet.create({
  sw: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  t: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  link: { color: Colors.purpleInk, fontWeight: '700', fontSize: 13 },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  q: { color: Colors.textDim, fontSize: 11 },
  out: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: Spacing.sm },
  input: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, color: Colors.textPrimary, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13 },
  btn: { marginTop: Spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 14 },
  btnT: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
});
