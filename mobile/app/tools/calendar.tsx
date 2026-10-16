import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr } from '@/components/TrackerUI';
import { Collapsible, Bullet } from '@/components/CalcUI';
import { collectEvents, byDate, monthCells, upcoming, monthSummary, isoDate, EVENT_META, type CalEvent, type Sources } from '@/lib/calendar';
import { loadCalendarSources } from '@/lib/calendarStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarScreen() {
  const [data, setData] = useState<{ sources: Sources; emis: { home: number; car: number; personal: number } } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [ym, setYm] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [picked, setPicked] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { setNow(new Date()); loadCalendarSources().then(setData); }, []));

  const events = useMemo(() => (data ? collectEvents(data.sources, now, 14) : []), [data, now]);
  const map = useMemo(() => byDate(events), [events]);
  const soon = useMemo(() => upcoming(events, now, 45), [events, now]);
  const sum = useMemo(() => (data ? monthSummary(collectEvents(data.sources, now, 2), now, data.emis) : null), [data, now]);
  const todayStr = isoDate(now);
  const cells = useMemo(() => monthCells(ym.y, ym.m), [ym]);
  const go = (delta: number) => { setPicked(null); setYm(({ y, m }) => { const t = m + delta; return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; }); };

  if (!data || !sum) return <TrackerScreen title="Financial calendar" subtitle="SIPs, renewals, maturities and tax dates in one place."><Card><Text style={Typography.body}>Reading your dates…</Text></Card></TrackerScreen>;

  const dayEvents = picked ? map[picked] || [] : [];
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', opts);
  let lastBucket = '';

  return (
    <TrackerScreen title="Financial calendar" subtitle="SIP debits, deposit maturities, insurance renewals, goal dates, subscriptions and income-tax deadlines.">
      <View style={s.sumGrid}>
        <Sum icon="📈" label="SIP this month" value={sum.sipTotal > 0 ? inr(sum.sipTotal) : '—'} color={EVENT_META.sip.color} />
        <Sum icon="🏠" label="EMIs a month" value={sum.emiTotal > 0 ? inr(sum.emiTotal) : '—'} color={Colors.red} />
        <Sum icon="🛡️" label="Insurance due" value={sum.insuranceDue > 0 ? inr(sum.insuranceDue) : '—'} color={EVENT_META.insurance.color} />
        <Sum icon="🧾" label="Next tax date" value={sum.nextTax ? fmt(sum.nextTax.date, { day: 'numeric', month: 'short' }) : '—'} color={EVENT_META.tax.color} />
      </View>

      <Card>
        <View style={s.monthHead}>
          <TouchableOpacity onPress={() => go(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month"><Text style={s.nav}>‹</Text></TouchableOpacity>
          <Text style={s.month}>{`${MONTHS[ym.m]} ${ym.y}`}</Text>
          <TouchableOpacity onPress={() => go(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month"><Text style={s.nav}>›</Text></TouchableOpacity>
        </View>
        <View style={s.grid}>
          {DOW.map(d => <Text key={d} style={s.dow}>{d}</Text>)}
          {cells.map((c, i) => {
            if (!c) return <View key={i} style={s.cell} />;
            const evs = map[c.date] || [];
            const isToday = c.date === todayStr, isPicked = c.date === picked;
            return (
              <TouchableOpacity key={i} style={[s.cell, isToday && s.today, isPicked && s.picked]} disabled={!evs.length} onPress={() => setPicked(isPicked ? null : c.date)}
                accessibilityRole="button" accessibilityLabel={`${c.day} ${MONTHS[ym.m]}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}`}>
                <Text style={[s.dayNum, c.date < todayStr && { color: Colors.textDim }, isToday && { color: Colors.cyan, fontWeight: '900' }]}>{c.day}</Text>
                <View style={s.dots}>
                  {evs.slice(0, 4).map((e, k) => <View key={k} style={[s.dot, { backgroundColor: EVENT_META[e.type].color }]} />)}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {picked && dayEvents.length > 0 && (
          <View style={s.detail}>
            <Text style={s.detailTitle}>{`📅 ${fmt(picked, { weekday: 'long', day: 'numeric', month: 'long' })}`}</Text>
            {dayEvents.map((e, i) => <EventLine key={i} e={e} />)}
          </View>
        )}
      </Card>

      <SectionLabel>COMING UP · NEXT 45 DAYS</SectionLabel>
      {soon.length === 0 ? (
        <Card><Text style={Typography.body}>Nothing due in the next 45 days. Add SIPs, policies, goals with a date or subscriptions and they appear here.</Text></Card>
      ) : (
        <Card>
          {soon.map((e, i) => {
            const head = e.bucket !== lastBucket ? e.bucket : '';
            lastBucket = e.bucket;
            return (
              <View key={i}>
                {head ? <Text style={[s.bucket, i > 0 && { marginTop: Spacing.md }]}>{head.toUpperCase()}</Text> : null}
                <View style={[s.row, e.urgency === 'urgent' && { borderLeftColor: Colors.red }, e.urgency === 'soon' && { borderLeftColor: Colors.gold }]}>
                  <Text style={s.when}>{fmt(e.date, { day: 'numeric', month: 'short' })}</Text>
                  <EventLine e={e} flat />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add your own dates or export the calendar" onPress={() => router.push('/plan/mydates' as any)}
        style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }}>
        <Text style={{ color: Colors.cyan, fontWeight: '700', fontSize: 13 }}>Add your own dates, or export this calendar →</Text>
      </TouchableOpacity>

      <Collapsible title="What is included, and what is not">
        <Bullet>Dates you add yourself on Your dates and export (a fee, a cheque, an EMI day), once or repeating. They show with a pin and are your own words; the app does not check them.</Bullet>
        <Bullet>SIPs you track (the Portfolio tab's monthly SIP amounts sit on the 1st unless a debit day is saved), deposit maturities, insurance renewal dates, goal dates, subscription renewals and trial endings, and the income-tax calendar.</Bullet>
        <Bullet>Tax dates are the statutory defaults for individuals without an audit. The government sometimes extends them, so check the Income Tax portal before relying on a date.</Bullet>
        <Bullet>Loan EMIs are shown as a monthly total; they are not placed on a day because the app does not know your debit date.</Bullet>
        <Bullet>Reminders are optional and off by default. Turn them on in Settings to get a notice on this phone before things are due. They are scheduled on the device and nothing is sent to a server.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function EventLine({ e, flat }: { e: CalEvent; flat?: boolean }) {
  const m = EVENT_META[e.type];
  return (
    <View style={[{ flex: flat ? 1 : undefined, marginTop: flat ? 0 : Spacing.sm }]}>
      <Text style={s.evTitle}>{`${m.icon} ${e.title}`}</Text>
      {e.sub ? <Text style={[Typography.caption, { lineHeight: 16 }]}>{e.sub}</Text> : null}
    </View>
  );
}

function Sum({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={s.sum}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted, marginTop: 2 }]}>{label.toUpperCase()}</Text>
      <Text style={[s.sumVal, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  sumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  sum: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.sm, backgroundColor: Colors.surface },
  sumVal: { fontSize: 17, fontWeight: '900', marginTop: 2 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  month: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  nav: { fontSize: 28, color: Colors.cyan, paddingHorizontal: Spacing.md, minWidth: 44, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10, color: Colors.textMuted, fontWeight: '700', paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  today: { borderWidth: 1, borderColor: Colors.cyan },
  picked: { backgroundColor: 'rgba(0,212,255,0.14)' },
  dayNum: { fontSize: 13, color: Colors.textPrimary },
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  detail: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  detailTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  bucket: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  row: { flexDirection: 'row', gap: Spacing.md, paddingVertical: 8, paddingLeft: Spacing.sm, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  when: { width: 56, fontSize: 12, fontWeight: '800', color: Colors.cyan },
  evTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
});
