import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Platform } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { CalcField, CheckRow, Collapsible, Bullet } from '@/components/CalcUI';
import { collectEvents, isoDate } from '@/lib/calendar';
import { loadCalendarSources } from '@/lib/calendarStorage';
import { validateCustom, customToEvents, toIcs, type CustomEvent, type Repeat } from '@/lib/financialCalendar';
import { loadCustomEvents, addCustomEvent, updateCustomEvent, removeCustomEvent } from '@/lib/financialCalendarStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const REPEATS: { id: Repeat; label: string }[] = [{ id: 'none', label: 'Once' }, { id: 'monthly', label: 'Every month' }, { id: 'yearly', label: 'Every year' }];
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MyDatesScreen() {
  const [list, setList] = useState<CustomEvent[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [amounts, setAmounts] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => loadCustomEvents().then(setList), []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const reset = () => { setEditing(null); setTitle(''); setDate(''); setAmount(''); setRepeat('none'); setNote(''); };
  const save = async () => {
    const v = validateCustom({ title, date, amount });
    if (!v.ok) { setMsg(v.error); return; }
    const rec = { title: v.title, date: v.date, amount: v.amount, repeat, note: note.trim().slice(0, 140) };
    const r = editing ? { ok: await updateCustomEvent(editing, rec) } : await addCustomEvent(rec);
    if (!r.ok) { setMsg((r as any).error ?? 'That date could not be saved.'); return; }
    setMsg(editing ? 'Updated.' : 'Added.'); reset(); reload();
  };
  const edit = (e: CustomEvent) => { setEditing(e.id); setTitle(e.title); setDate(e.date); setAmount(e.amount ? String(e.amount) : ''); setRepeat(e.repeat); setNote(e.note); setMsg(''); };

  const exportIcs = async () => {
    setBusy(true); setMsg('');
    try {
      const now = new Date();
      const { sources } = await loadCalendarSources();
      // collectEvents already carries the person's own dates (sources.custom), so they are not appended a second time
      const text = toIcs(collectEvents(sources, now, 12), { now, includeAmounts: amounts });
      const name = `finos-calendar-${isoDate(now)}.ics`;
      if (Platform.OS === 'web') {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' })); a.download = name; a.click();
      } else {
        const FS = require('expo-file-system'); const Sharing = require('expo-sharing');
        const uri = `${FS.cacheDirectory}${name}`;
        await FS.writeAsStringAsync(uri, text);
        try {
          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/calendar', UTI: 'public.calendar-event', dialogTitle: 'Add to your calendar' });
          else await Share.share({ message: text, title: name });
        } finally {
          try { if (Platform.OS === 'ios') await FS.deleteAsync(uri, { idempotent: true }); } catch { /* removed at the next clean-up */ }
        }
      }
      setMsg('Calendar file made. It leaves FIN·OS to wherever you send it.');
    } catch { setMsg('Could not make the calendar file.'); }
    setBusy(false);
  };

  const soon = useMemo(() => {
    if (!list) return [];
    const now = new Date(); const to = new Date(now); to.setFullYear(to.getFullYear() + 1);
    return customToEvents(list, isoDate(now), isoDate(to)).slice(0, 30);
  }, [list]);

  const sub = 'Add your own dates, and take the whole calendar into your phone\'s calendar app.';
  if (!list) return <TrackerScreen title="Your dates and export" subtitle={sub}><Card><Text style={Typography.body}>Reading your dates…</Text></Card></TrackerScreen>;

  return (
    <TrackerScreen title="Your dates and export" subtitle={sub}>
      <SectionLabel>{editing ? 'EDIT THE DATE' : 'ADD A DATE'}</SectionLabel>
      <Card>
        <CalcField label="WHAT IS IT" text value={title} onChange={setTitle} placeholder="e.g. School fee, car service" maxLength={60} />
        <CalcField label="DATE (YYYY-MM-DD)" text value={date} onChange={setDate} placeholder="2026-11-15" maxLength={10} />
        <CalcField label="AMOUNT (OPTIONAL)" prefix="₹" value={amount} onChange={setAmount} />
        <Text style={Typography.label}>REPEATS</Text>
        <View style={s.chips}>
          {REPEATS.map(r => (
            <TouchableOpacity key={r.id} style={[s.chip, repeat === r.id && s.chipOn]} onPress={() => setRepeat(r.id)} accessibilityRole="button"
              accessibilityLabel={`Repeats: ${r.label}`} accessibilityState={{ selected: repeat === r.id }}>
              <Text style={[s.chipTxt, repeat === r.id && s.chipTxtOn]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <CalcField label="NOTE (OPTIONAL)" text value={note} onChange={setNote} maxLength={140} />
        <TouchableOpacity style={s.save} onPress={save} accessibilityRole="button" accessibilityLabel={editing ? 'Save changes to this date' : 'Add this date'}>
          <Text style={s.saveTxt}>{editing ? 'Save changes' : 'Add date'}</Text>
        </TouchableOpacity>
        {editing ? <Text style={[s.link, { marginTop: Spacing.sm }]} accessibilityRole="button" onPress={reset}>Cancel the edit</Text> : null}
        {msg ? <Text style={[Typography.caption, { marginTop: Spacing.sm, color: Colors.textPrimary }]}>{msg}</Text> : null}
      </Card>

      <SectionLabel>YOUR DATES</SectionLabel>
      {list.length === 0 ? (
        <Card><Text style={Typography.body}>No dates of your own yet. Add one above and it appears here. The Financial calendar's SIPs, renewals and tax dates come from your trackers and are not listed here.</Text></Card>
      ) : (
        <Card>
          {list.map((e, i) => (
            <View key={e.id} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{e.title}</Text>
                <Text style={Typography.caption}>
                  {`${fmtDay(e.date)}${e.repeat === 'monthly' ? ' · every month' : e.repeat === 'yearly' ? ' · every year' : ''}${e.amount ? ` · ${inr(e.amount)}` : ''}`}
                </Text>
                {e.note ? <Text style={Typography.caption}>{e.note}</Text> : null}
              </View>
              <Text style={s.link} accessibilityRole="button" onPress={() => edit(e)}>Edit</Text>
              <Text style={s.del} accessibilityRole="button" onPress={() => { removeCustomEvent(e.id).then(reload); if (editing === e.id) reset(); }}>Remove</Text>
            </View>
          ))}
        </Card>
      )}

      {soon.length > 0 ? (
        <>
          <SectionLabel>NEXT 12 MONTHS</SectionLabel>
          <Card>
            {soon.map((e, i) => (
              <View key={`${e.date}${i}`} style={s.row}>
                <Text style={s.when}>{fmtDay(e.date)}</Text>
                <Text style={[Typography.body, { flex: 1 }]}>{e.title}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionLabel>EXPORT TO YOUR CALENDAR APP</SectionLabel>
      <Card>
        <Text style={[Typography.caption, { lineHeight: 18 }]}>
          Makes one .ics file with every date on the Financial calendar for the next 12 months (SIPs, maturities, renewals, goal dates, subscriptions, tax deadlines and your own dates). Open it in Google Calendar, Apple Calendar or Outlook.
        </Text>
        <View style={{ marginTop: Spacing.sm }}>
          <CheckRow label="Include rupee amounts (off: the file names each date but not what it costs)" value={amounts} onChange={setAmounts} />
        </View>
        <TouchableOpacity style={[s.save, busy && { opacity: 0.6 }]} disabled={busy} onPress={exportIcs} accessibilityRole="button" accessibilityLabel="Export calendar as an ics file">
          <Text style={s.saveTxt}>{busy ? 'Making the file…' : 'Export calendar (.ics)'}</Text>
        </TouchableOpacity>
        <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>Tax dates are statutory defaults and are sometimes extended, so check the Income Tax portal. The file is a snapshot: it does not update when your trackers change.</Text>
      </Card>
      <Text style={s.link} accessibilityRole="button" onPress={() => router.push('/tools/calendar')}>Open the Financial calendar</Text>

      <Collapsible title="What is stored, and where">
        <Bullet>Your dates are kept on this phone under their own key and are never sent anywhere by FIN·OS.</Bullet>
        <Bullet>They do not appear on the Financial calendar's grid or in its reminders yet. The export includes them.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginVertical: Spacing.sm },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg },
  chipOn: { borderColor: Colors.cyan, backgroundColor: Colors.surfaceAlt },
  chipTxt: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTxtOn: { color: Colors.cyan },
  save: { marginTop: Spacing.md, backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveTxt: { color: Colors.bg, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  name: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  when: { width: 96, fontSize: 12, fontWeight: '800', color: Colors.cyan },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 12 },
  del: { color: Colors.red, fontWeight: '800', fontSize: 12 },
});
