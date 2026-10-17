import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { Segmented } from '@/components/CalcUI';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import { makeFacts, type ArFacts } from '@/lib/aryaFacts';
import { type DeclaredEvent, type LifeEventType, EVENT_TYPES, DEFS, phaseOf, suggestionsFor } from '@/lib/lifeEvents';
import { loadLifeEvents, declareLifeEvent, deleteLifeEvent } from '@/lib/lifeEventsStorage';
import { loadPrefs } from '@/lib/aryaMemoryStorage';
import { Colors, Spacing, Radii } from '@/constants/theme';

const PHASE_TEXT = { later: 'Later: not raising prompts yet', active: 'Active: raising prompts now', past: 'Past: no longer raising prompts' } as const;

export default function LifeEventsScreen() {
  const [events, setEvents] = useState<DeclaredEvent[]>([]);
  const [facts, setFacts] = useState<ArFacts | null>(null);
  const [sharing, setSharing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [type, setType] = useState<LifeEventType>('marriage');
  const [date, setDate] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setEvents(await loadLifeEvents());
    setSharing((await loadPrefs()).lifeEvents);
    setNow(new Date());                       // phases and prompts are judged against the moment of the reload
    try { setFacts(await loadArFacts(new Date())); } catch { setFacts(makeFacts()); }
  }, []);
  useFocusEffect(useCallback(() => { reload().catch(() => {}); }, [reload]));

  const prompts = useMemo(() => (facts ? suggestionsFor(events, facts, now) : []), [events, facts, now]);

  const add = async () => {
    const r = await declareLifeEvent(type, date.trim());
    if (r.error) { setErr(r.error); return; }
    setErr(null); setDate(''); setEvents(await loadLifeEvents());
  };

  return (
    <TrackerScreen title="Life events" subtitle="Tell Arya what is happening in your life, with a date. Fixed rules then turn what you have recorded into specific things to check. Nothing here is a guess, and nothing leaves the phone unless you switch it on.">
      <SectionLabel>YOUR EVENTS</SectionLabel>
      <Card>
        {events.length === 0 ? <Text style={s.lead}>None declared.</Text> : null}
        {events.map(e => {
          const d = DEFS[e.type];
          const ph = phaseOf(e, now);
          return (
            <View key={e.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{d.icon} {d.label}</Text>
                <Text style={s.sub}>{e.date} · {PHASE_TEXT[ph]}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${d.label} on ${e.date}`} onPress={async () => setEvents(await deleteLifeEvent(e.id))} style={s.del}>
                <Text style={s.delTxt}>Delete</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <Text style={[s.sub, { marginTop: Spacing.sm }]}>{sharing ? 'Switched on: the type and month of each current event go with your questions to the online model.' : 'Kept on this phone. Not sent with your questions (you can switch that on in What Arya remembers).'}</Text>
      </Card>

      <SectionLabel>ADD ONE</SectionLabel>
      <Card>
        <Segmented label="What happened or is coming" options={EVENT_TYPES.map(t => ({ id: t, label: DEFS[t].label }))} value={type} onChange={setType} />
        <Text style={s.sub}>{DEFS[type].dateHint}</Text>
        <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD or YYYY-MM" placeholderTextColor={Colors.textDim}
          accessibilityLabel="Date of the event" autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save the life event" onPress={add} style={s.btn}><Text style={s.btnTxt}>Save event</Text></TouchableOpacity>
        {err ? <Text style={s.err}>{err}</Text> : null}
      </Card>

      <SectionLabel>WORTH CHECKING NOW</SectionLabel>
      {prompts.length === 0 ? (
        <Card><Text style={s.lead}>{events.length ? 'No declared event is in its active window, so nothing is raised today.' : 'Declare an event above to see what it raises.'}</Text></Card>
      ) : prompts.map(p => (
        <Card key={p.id}>
          <Text style={s.kind}>{DEFS[p.type].icon} {DEFS[p.type].label.toUpperCase()} · {p.kind.toUpperCase()}</Text>
          <Text style={s.title}>{p.title}</Text>
          <Text style={s.body}>{p.body}</Text>
          {p.because.length ? <Text style={s.because}>Because: {p.because.join('; ')}</Text> : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${p.routeLabel}: ${p.title}`} onPress={() => router.push(p.route as any)} style={s.link}>
            <Text style={s.linkTxt}>{p.routeLabel} ›</Text>
          </TouchableOpacity>
        </Card>
      ))}
      <Text style={s.fine}>These are prompts to check, from rules of thumb and from what you recorded. Not financial advice.</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  lead: { color: Colors.textPrimary, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  title: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  sub: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  del: { borderWidth: 1, borderColor: Colors.red, borderRadius: Radii.md, paddingVertical: 7, paddingHorizontal: 10 },
  delTxt: { color: Colors.red, fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, color: Colors.textPrimary, padding: 10, fontSize: 14, marginVertical: Spacing.sm },
  btn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 9, paddingHorizontal: 14, alignSelf: 'flex-start' },
  btnTxt: { color: '#001018', fontWeight: '800', fontSize: 13 },
  err: { color: Colors.red, fontSize: 12, marginTop: Spacing.sm },
  kind: { color: Colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 4 },
  body: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  because: { color: Colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 6 },
  link: { marginTop: Spacing.sm, alignSelf: 'flex-start' },
  linkTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
  fine: { color: Colors.textDim, fontSize: 11, lineHeight: 16, marginTop: Spacing.sm },
});
