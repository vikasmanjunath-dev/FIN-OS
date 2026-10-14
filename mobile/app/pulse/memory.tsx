import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CheckRow, Segmented } from '@/components/CalcUI';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import { makeFacts, type ArFacts } from '@/lib/aryaFacts';
import { buildChatContext } from '@/lib/aryaContext';
import { type MemoryItem, type MemoryKind, KIND_LABEL, LIMITS } from '@/lib/aryaMemory';
import {
  type AryaPrefs, DEFAULT_PREFS, loadPrefs, savePrefs, loadMemory, addMemoryNote, editMemoryNote, deleteMemoryNote, clearAutoMemory, clearMemory,
} from '@/lib/aryaMemoryStorage';
import { type DeclaredEvent } from '@/lib/lifeEvents';
import { loadLifeEvents } from '@/lib/lifeEventsStorage';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const KINDS: { id: Exclude<MemoryKind, 'topic'>; label: string }[] = [
  { id: 'fact', label: 'Fact' }, { id: 'preference', label: 'Preference' }, { id: 'goal', label: 'Goal' }, { id: 'plan', label: 'Plan' }, { id: 'event', label: 'Event' },
];
const KEEP: { id: string; label: string }[] = [{ id: 'forever', label: 'Until I delete it' }, { id: '30', label: '30 days' }, { id: '365', label: '1 year' }];
const dayText = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function ArYaMemoryScreen() {
  const [prefs, setPrefs] = useState<AryaPrefs>(DEFAULT_PREFS);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [events, setEvents] = useState<DeclaredEvent[]>([]);
  const [facts, setFacts] = useState<ArFacts | null>(null);
  const [sample, setSample] = useState('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Exclude<MemoryKind, 'topic'>>('fact');
  const [keep, setKeep] = useState('forever');
  const [localOnly, setLocalOnly] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState<'topics' | 'all' | null>(null);

  const reload = useCallback(async () => {
    const [p, m, e] = await Promise.all([loadPrefs(), loadMemory(), loadLifeEvents()]);
    setPrefs(p); setItems(m); setEvents(e);
    try { setFacts(await loadArFacts(new Date())); } catch { setFacts(makeFacts()); }
  }, []);
  useFocusEffect(useCallback(() => { reload().catch(() => {}); }, [reload]));

  const built = useMemo(() => (facts ? buildChatContext(facts, prefs, items, events, sample, Date.now()) : null), [facts, prefs, items, events, sample]);
  const flip = async (patch: Partial<AryaPrefs>) => { setPrefs(await savePrefs(patch)); };

  const add = async () => {
    const r = await addMemoryNote({ text, kind, expiresInDays: keep === 'forever' ? null : Number(keep), local: localOnly });
    if (r.status === 'rejected') { setMsg(r.reason ?? 'That could not be saved.'); return; }
    setItems(await loadMemory());
    setText(''); setMsg(r.status === 'updated' ? 'You already had this note; it is updated.' : 'Saved on this phone.');
  };
  const saveEdit = async () => {
    if (!editing) return;
    const r = await editMemoryNote(editing.id, { text: editing.text });
    if (r.status === 'rejected') { setMsg(r.reason ?? 'That could not be saved.'); return; }
    setEditing(null); setMsg('Changed.'); setItems(await loadMemory());
  };
  const toggleLocal = async (it: MemoryItem) => { await editMemoryNote(it.id, { local: !it.local }); setItems(await loadMemory()); };
  const remove = async (id: string) => { setItems(await deleteMemoryNote(id)); setMsg('Deleted.'); };

  const notes = items.filter(i => i.source === 'you');
  const topics = items.filter(i => i.source === 'auto');

  return (
    <TrackerScreen title="What Arya remembers" subtitle="Everything below lives on this phone. You can read, change or delete all of it, and see exactly what would be sent with your next question before you ask it.">
      <SectionLabel>WHAT ARYA WILL BE TOLD</SectionLabel>
      <Card accent={built?.leaves ? Colors.gold : Colors.teal}>
        <Text style={s.lead}>{!prefs.online
          ? 'Arya is set to stay on this phone. Nothing is sent anywhere. Questions about your own money are still answered here.'
          : 'When Arya answers with its online model, only the items marked "Sent" below go with your question. Questions about your own money, and SIP or EMI sums, are answered on the phone and send nothing.'}</Text>
        <Text style={s.fieldLabel}>Try a question to preview what would go with it</Text>
        <TextInput style={s.input} value={sample} onChangeText={setSample} placeholder="e.g. How should I plan for tax this year?" placeholderTextColor={Colors.textDim}
          accessibilityLabel="A sample question to preview" maxLength={300} />
        {built?.disclosures.map(d => (
          <View key={d.id} style={s.discRow}>
            <View style={[s.badge, { borderColor: d.sent ? Colors.gold : Colors.borderMed }]}><Text style={[s.badgeTxt, { color: d.sent ? Colors.gold : Colors.textMuted }]}>{d.sent ? 'Sent' : 'Not sent'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.discLabel}>{d.label}</Text>
              <Text style={s.discValue}>{d.value}</Text>
              {d.why ? <Text style={s.why}>{d.why}</Text> : null}
            </View>
          </View>
        ))}
      </Card>

      <SectionLabel>YOUR SWITCHES</SectionLabel>
      <Card>
        <CheckRow label="Let Arya use the online model. Off: nothing ever leaves this phone." value={prefs.online} onChange={v => flip({ online: v })} />
        <CheckRow label="Send my name and the figures I recorded (income, spending, net worth, SIPs) as context" value={prefs.figures} onChange={v => flip({ figures: v })} />
        <CheckRow label="Send up to 3 topics and 4 notes from memory as context" value={prefs.memory} onChange={v => flip({ memory: v })} />
        <CheckRow label="Send the life events I declared (type and month only) as context" value={prefs.lifeEvents} onChange={v => flip({ lifeEvents: v })} />
        <CheckRow label={'Note the topic of my questions ("Asked about tax saving"), never the words'} value={prefs.record} onChange={v => flip({ record: v })} />
      </Card>

      <SectionLabel>NOTES YOU GAVE ARYA</SectionLabel>
      <Card>
        {notes.length === 0 ? <Text style={s.lead}>No notes yet. Add one below, for example "I am saving for a house in 2028" or "Keep answers short".</Text> : null}
        {notes.map(it => (
          <View key={it.id} style={s.note}>
            {editing?.id === it.id ? (
              <>
                <TextInput style={s.input} value={editing.text} onChangeText={t => setEditing({ id: it.id, text: t })} maxLength={LIMITS.maxText} accessibilityLabel="Edit the note" multiline />
                <View style={s.actions}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save the change" onPress={saveEdit} style={s.btn}><Text style={s.btnTxt}>Save</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel the change" onPress={() => setEditing(null)} style={s.btnGhost}><Text style={s.btnGhostTxt}>Cancel</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.noteKind}>{KIND_LABEL[it.kind].toUpperCase()}{it.local ? ' · KEPT ON THIS PHONE ONLY' : ''}{it.seen > 1 ? ` · SAID ${it.seen}X` : ''}</Text>
                <Text style={s.noteText}>{it.text}</Text>
                <Text style={s.when}>{it.expiresAt ? `Forgotten on ${dayText(it.expiresAt)}` : 'Kept until you delete it'}</Text>
                <View style={s.actions}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit: ${it.text}`} onPress={() => setEditing({ id: it.id, text: it.text })} style={s.btnGhost}><Text style={s.btnGhostTxt}>Edit</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={it.local ? `Allow sending: ${it.text}` : `Never send: ${it.text}`} onPress={() => toggleLocal(it)} style={s.btnGhost}>
                    <Text style={s.btnGhostTxt}>{it.local ? 'Allow sending' : 'Never send'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete: ${it.text}`} onPress={() => remove(it.id)} style={s.btnDanger}><Text style={s.btnDangerTxt}>Delete</Text></TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ))}

        <Text style={[s.fieldLabel, { marginTop: Spacing.md }]}>Add a note</Text>
        <TextInput style={s.input} value={text} onChangeText={setText} placeholder="What should Arya remember?" placeholderTextColor={Colors.textDim}
          accessibilityLabel="A new note for Arya" maxLength={LIMITS.maxText} multiline />
        <Segmented label="Kind" options={KINDS} value={kind} onChange={setKind} />
        <Segmented label="Keep it" options={KEEP} value={keep} onChange={setKeep} />
        <CheckRow label="Keep this one on this phone only (never sent, whatever the switches say)" value={localOnly} onChange={setLocalOnly} />
        <Text style={s.hint}>Card, PAN, Aadhaar, account numbers, passwords, PINs and OTPs are refused. Do not put them here.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save the note on this phone" onPress={add} style={[s.btn, { alignSelf: 'flex-start', marginTop: Spacing.sm }]}><Text style={s.btnTxt}>Save note</Text></TouchableOpacity>
        {msg ? <Text style={s.msg}>{msg}</Text> : null}
      </Card>

      <SectionLabel>TOPICS NOTED FROM YOUR QUESTIONS</SectionLabel>
      <Card>
        {topics.length === 0 ? <Text style={s.lead}>None. Only a fixed label such as "Asked about tax saving" is ever kept, and it fades after {LIMITS.autoTtlDays} days.</Text> : null}
        {topics.map(it => (
          <View key={it.id} style={s.topic}>
            <View style={{ flex: 1 }}>
              <Text style={s.noteText}>{it.text}</Text>
              <Text style={s.when}>{it.seen}x, last {dayText(it.updatedAt)}; forgotten on {it.expiresAt ? dayText(it.expiresAt) : 'never'}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete: ${it.text}`} onPress={() => remove(it.id)} style={s.btnDanger}><Text style={s.btnDangerTxt}>Delete</Text></TouchableOpacity>
          </View>
        ))}
        {topics.length ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Forget all topics" onPress={async () => { if (confirm !== 'topics') { setConfirm('topics'); return; } setItems(await clearAutoMemory()); setConfirm(null); setMsg('Topics cleared.'); }} style={[s.btnDanger, { alignSelf: 'flex-start', marginTop: Spacing.sm }]}>
            <Text style={s.btnDangerTxt}>{confirm === 'topics' ? 'Tap again to forget all topics' : 'Forget all topics'}</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      <SectionLabel>EVERYTHING</SectionLabel>
      <Card>
        <Text style={s.lead}>{items.length} item{items.length === 1 ? '' : 's'} in memory and {events.length} life event{events.length === 1 ? '' : 's'} on this phone.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open life events" onPress={() => router.push('/pulse/life' as any)} style={s.btnGhost}><Text style={s.btnGhostTxt}>Life events ›</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Forget everything Arya remembers"
          onPress={async () => { if (confirm !== 'all') { setConfirm('all'); return; } await clearMemory(); setItems([]); setConfirm(null); setMsg('All memory cleared.'); }}
          style={[s.btnDanger, { alignSelf: 'flex-start', marginTop: Spacing.sm }]}>
          <Text style={s.btnDangerTxt}>{confirm === 'all' ? 'Tap again to forget everything' : 'Forget everything'}</Text>
        </TouchableOpacity>
        <Text style={s.hint}>These items are not uploaded by sync. They are included when you export or back up your data, and removed when you erase it.</Text>
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  lead: { ...Typography.caption, lineHeight: 18, color: Colors.textPrimary, marginBottom: Spacing.sm },
  fieldLabel: { color: Colors.textMuted, fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, color: Colors.textPrimary, padding: 10, fontSize: 14, marginBottom: Spacing.sm },
  discRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', minWidth: 64, alignItems: 'center' },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  discLabel: { color: Colors.textMuted, fontSize: 11 },
  discValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  why: { color: Colors.textDim, fontSize: 11, marginTop: 2, lineHeight: 15 },
  note: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  noteKind: { color: Colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  noteText: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20, marginTop: 2 },
  when: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  btn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 9, paddingHorizontal: 14 },
  btnTxt: { color: '#001018', fontWeight: '800', fontSize: 13 },
  btnGhost: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start' },
  btnGhostTxt: { color: Colors.textPrimary, fontWeight: '700', fontSize: 13 },
  btnDanger: { borderWidth: 1, borderColor: Colors.red, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnDangerTxt: { color: Colors.red, fontWeight: '700', fontSize: 13 },
  hint: { color: Colors.textDim, fontSize: 11, lineHeight: 16, marginTop: Spacing.sm },
  msg: { color: Colors.teal, fontSize: 12, marginTop: Spacing.sm },
});
