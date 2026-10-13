import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Share, Platform, StyleSheet } from 'react-native';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CheckRow, Collapsible, Bullet } from '@/components/CalcUI';
import { useTrackers } from '@/hooks/useTrackers';
import { buildReport, toText } from '@/lib/report';
import { collectEvents } from '@/lib/calendar';
import { loadCalendarSources } from '@/lib/calendarStorage';
import { loadSavedScore } from '@/lib/moneyScoreStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function ReportScreen() {
  const { data, computed, loaded } = useTrackers();
  const [amounts, setAmounts] = useState(true);
  const [score, setScore] = useState<{ score: number; band?: string } | null>(null);
  const [due, setDue] = useState<{ date: string; title: string }[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    loadSavedScore().then((s: any) => setScore(s && typeof s.score === 'number' ? { score: s.score, band: s.band?.label ?? s.bandLabel } : null)).catch(() => setScore(null));
    loadCalendarSources().then(c => {
      const now = new Date(), to = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
      setDue(collectEvents(c.sources, now, 2).filter(e => e.date >= ymd(now) && e.date <= to).slice(0, 8).map(e => ({ date: e.date, title: e.title })));
    }).catch(() => setDue([]));
  }, []);

  const report = useMemo(() => buildReport({ name: data.name, now: new Date(), data, computed, moneyScore: score, due, includeAmounts: amounts }), [data, computed, score, due, amounts]);
  const text = useMemo(() => toText(report), [report]);

  const share = async () => {
    setNote('');
    try {
      if (Platform.OS === 'web') {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) await nav.share({ title: report.title, text });
        else if (nav?.clipboard) { await nav.clipboard.writeText(text); setNote('Copied to the clipboard.'); }
        else setNote('Sharing is not available in this browser.');
      } else await Share.share({ title: report.title, message: text });
    } catch { /* the person closed the share sheet */ }
  };

  if (!loaded) return <TrackerScreen title="Financial report" subtitle="A one-page summary you can share."><Card><Text style={Typography.body}>Reading your figures…</Text></Card></TrackerScreen>;

  return (
    <TrackerScreen title="Financial report" subtitle="A one-page summary of what you have recorded, as text you can send to an advisor, a partner or yourself.">
      <Card>
        <CheckRow label="Include amounts (turn off to share only percentages and months)" value={amounts} onChange={setAmounts} />
        <TouchableOpacity style={s.btn} accessibilityRole="button" accessibilityLabel="Share the report" onPress={share}><Text style={s.btnTxt}>Share report…</Text></TouchableOpacity>
        {note ? <Text style={[Typography.caption, { marginTop: Spacing.sm }]} accessibilityRole="alert">{note}</Text> : null}
        <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
          This opens your phone's share sheet. The text leaves FIN·OS to wherever you send it, so check the preview first.
        </Text>
      </Card>
      <SectionLabel>PREVIEW</SectionLabel>
      <Card>
        <Text style={s.title}>{report.title}</Text>
        <Text style={Typography.caption}>{`As of ${report.generatedOn}`}</Text>
        {report.sections.map(sec => (
          <View key={sec.title} style={{ marginTop: Spacing.md }}>
            <Text style={Typography.label}>{sec.title.toUpperCase()}</Text>
            {sec.lines.map((l, i) => <Text key={i} style={[Typography.body, { marginTop: 3, lineHeight: 19 }]}>{l}</Text>)}
          </View>
        ))}
      </Card>
      <Collapsible title="What is in it, and what is not">
        <Bullet>Only figures you recorded in the app. An unrecorded figure reads "Not recorded", never a default.</Bullet>
        <Bullet>No phone number, e-mail, account numbers or policy numbers: the app does not store them.</Bullet>
        <Bullet>Estimates for planning, not advice. Check the numbers before you rely on them.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm },
  btnTxt: { color: '#000', fontWeight: '900', fontSize: 14 },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
});
