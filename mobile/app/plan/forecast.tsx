import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr } from '@/components/TrackerUI';
import { Collapsible, Bullet } from '@/components/CalcUI';
import { compute, compareToBudget, EVENT_IDS, EVENT_LABELS, EVENT_MULTIPLIERS, forecastMonth, type ForecastResult } from '@/lib/forecast';
import { loadForecastInputs, saveForecastTotal, type ForecastInputs } from '@/lib/forecastStorage';
import { monthSpend } from '@/lib/budget';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { LinkButton } from '@/components/LinkButton';

const WINDOWS = [3, 6, 12] as const;
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const monthShort = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });
const TREND = { up: '↑ Rising', down: '↓ Falling', stable: '→ Steady' } as const;

export default function ForecastScreen() {
  const [inputs, setInputs] = useState<ForecastInputs | null>(null);
  const [monthsBack, setMonthsBack] = useState<number>(6);
  const [events, setEvents] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(useCallback(() => { setNow(new Date()); loadForecastInputs().then(setInputs); }, []));

  const base = useMemo<ForecastResult | null>(() => (inputs ? compute(inputs.txns, { monthsBack, now }) : null), [inputs, monthsBack, now]);
  const r = useMemo<ForecastResult | null>(() => (inputs ? compute(inputs.txns, { monthsBack, events, now }) : null), [inputs, monthsBack, events, now]);
  // The stored value is the baseline (no events), so toggling a chip never changes what other screens see.
  React.useEffect(() => { if (base && base.total > 0) saveForecastTotal(base.total).catch(() => {}); }, [base]);

  const cmp = useMemo(() => (r && inputs ? compareToBudget(r.byCategory, inputs.limits) : null), [r, inputs]);
  const target = forecastMonth(now);
  const soFar = useMemo(() => (inputs ? monthSpend(inputs.txns, target).total : 0), [inputs, target]);
  const toggle = (id: string) => setEvents(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]));

  const sub = 'What you are likely to spend this month, category by category, from your own logged spending.';
  if (!inputs || !r || !base) return <TrackerScreen title="Spending forecast" subtitle={sub}><Card><Text style={Typography.body}>Reading your spending…</Text></Card></TrackerScreen>;

  if (r.total <= 0) {
    const any = inputs.txns.length > 0;
    return (
      <TrackerScreen title="Spending forecast" subtitle={sub}>
        <Card>
          <Text style={[Typography.body, { fontWeight: '800' }]}>{any ? 'Not enough spending history yet' : 'No spending logged yet'}</Text>
          <Text style={[Typography.caption, { marginTop: 6, lineHeight: 18 }]}>
            {any
              ? `There are no logged expenses in the ${monthsBack} complete months before this one. Income and investments are never counted as spending. Log a few weeks of expenses, or pick a longer history above.`
              : 'The forecast is worked out from the expenses you log. Log expenses (or import a statement) and it appears here. Nothing is assumed in the meantime.'}
          </Text>
          <LinkButton onPress={() => router.push('/tracker/transactions')} textStyle={s.link}>Log or import expenses</LinkButton>
        </Card>
        <WindowPicker value={monthsBack} onChange={setMonthsBack} />
      </TrackerScreen>
    );
  }

  const low = r.confidence === 'low';
  const cats = Object.keys(r.byCategory).sort((a, b) => r.byCategory[b] - r.byCategory[a]);
  const lastKey = r.months[r.months.length - 1];
  const pctIncome = inputs.income > 0 ? Math.round((r.total / inputs.income) * 100) : null;

  return (
    <TrackerScreen title="Spending forecast" subtitle={sub}>
      <Card accent={low ? Colors.gold : Colors.cyan}>
        <Text style={Typography.label}>{`EXPECTED SPEND · ${monthName(target).toUpperCase()}`}</Text>
        <Text style={s.big}>{inr(r.total)}</Text>
        <Text style={[Typography.caption, { lineHeight: 17 }]}>
          {`Based on ${r.monthsWithData} month${r.monthsWithData === 1 ? '' : 's'} of logged spending (${r.monthsWithData === 1 ? monthName(lastKey) : `${monthShort(r.months[r.months.length - r.monthsWithData])} to ${monthShort(lastKey)}`}).`}
          {pctIncome !== null ? ` About ${pctIncome}% of your recorded monthly income.` : ' Add your monthly income in your profile to see this as a share of income.'}
        </Text>
        {events.length > 0 && r.total !== base.total ? (
          <Text style={[Typography.caption, { marginTop: 4 }]}>{`Without the events you chose: ${inr(base.total)}.`}</Text>
        ) : null}
        {soFar > 0 ? <Text style={[Typography.caption, { marginTop: 4 }]}>{`Logged so far this month: ${inr(soFar)}.`}</Text> : null}
        {soFar > r.total ? (
          <Text style={[Typography.caption, { marginTop: 4, color: Colors.gold, lineHeight: 17 }]} accessibilityRole="alert">
            {`You have already logged more than this forecast (${inr(soFar - r.total)} more). The forecast is built from earlier months, so this month is running above them; read it as a typical month, not as a limit for the rest of this one.`}
          </Text>
        ) : null}
      </Card>

      {low ? (
        <Card accent={Colors.gold}>
          <Text style={[Typography.body, { fontWeight: '800' }]}>Rough guide only</Text>
          <Text style={[Typography.caption, { marginTop: 4, lineHeight: 18 }]}>
            {`Only ${r.monthsWithData} month${r.monthsWithData === 1 ? '' : 's'} of spending ${r.monthsWithData === 1 ? 'is' : 'are'} logged. With under 3 months this is close to last month's figures repeated, and no trend or risk is read from it. Months before your first logged expense are treated as not recorded, not as zero.`}
          </Text>
        </Card>
      ) : null}

      <WindowPicker value={monthsBack} onChange={setMonthsBack} />

      <SectionLabel>UPCOMING EVENTS (OPTIONAL)</SectionLabel>
      <Card>
        <View style={s.chips}>
          {EVENT_IDS.map(id => {
            const on = events.includes(id);
            return (
              <TouchableOpacity key={id} style={[s.chip, on && s.chipOn]} onPress={() => toggle(id)} accessibilityRole="button"
                accessibilityLabel={`${EVENT_LABELS[id]} event`} accessibilityState={{ selected: on }}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{EVENT_LABELS[id]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
          Event adjustments are fixed rules of thumb, the same for everyone. They are not learned from your history and they are not a prediction of what an event will cost you. Use them as a prompt to plan, and switch them off if they do not fit.
        </Text>
        {events.map(ev => (
          <Text key={ev} style={[Typography.caption, { marginTop: 6, lineHeight: 17, color: Colors.textPrimary }]}>
            {`${EVENT_LABELS[ev]}: ${Object.entries(EVENT_MULTIPLIERS[ev]).map(([c, m]) => `${c} × ${m}`).join(', ')}`}
            {r.eventNotes.some(n => n.event === ev) ? '' : ' (none of your spending categories match, so nothing changes)'}
          </Text>
        ))}
      </Card>

      <SectionLabel>BY CATEGORY</SectionLabel>
      <Card>
        {cats.map((c, i) => {
          const risk = r.riskCats.includes(c);
          const ev = r.eventNotes.filter(n => n.category === c);
          const lim = inputs.limits[c];
          const trend = r.trends[c];
          return (
            <View key={c} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.cat}>{c}</Text>
                <Text style={Typography.caption}>
                  {`Last month ${inr(r.lastMonth[c])}${low ? '' : ' · ' + TREND[trend]}`}
                </Text>
                {ev.length > 0 ? <Text style={[Typography.caption, { color: Colors.gold }]}>{ev.map(n => `${EVENT_LABELS[n.event]} × ${n.factor}`).join(', ')}</Text> : null}
                {risk ? <Text style={[Typography.caption, { color: Colors.red }]}>Expected well above your recent average</Text> : null}
                {lim > 0 ? <Text style={Typography.caption}>{`Budget limit ${inr(lim)}`}</Text> : null}
              </View>
              <Text style={[s.amt, lim > 0 && r.byCategory[c] > lim ? { color: Colors.red } : null]}>{inr(r.byCategory[c])}</Text>
            </View>
          );
        })}
      </Card>

      <SectionLabel>AGAINST YOUR BUDGET LIMITS</SectionLabel>
      {cmp && cmp.rows.length > 0 ? (
        <Card accent={cmp.over.length ? Colors.red : Colors.teal}>
          <Text style={Typography.body}>
            {cmp.over.length
              ? `${cmp.over.length} of ${cmp.rows.length} budgeted categor${cmp.rows.length === 1 ? 'y is' : 'ies are'} forecast to go over: ${cmp.over.map(o => `${o.category} by ${inr(o.diff)}`).join(', ')}.`
              : `All ${cmp.rows.length} budgeted categor${cmp.rows.length === 1 ? 'y is' : 'ies are'} forecast to stay within limit${cmp.rows.some(x => x.state === 'close') ? ', some of them close to it' : ''}.`}
          </Text>
          {cmp.rows.map(row => (
            <View key={row.category} style={{ marginTop: Spacing.md }}>
              <View style={s.rowHead}>
                <Text style={s.cat}>{row.category}</Text>
                <Text style={Typography.caption}>{`${inr(row.predicted)} of ${inr(row.limit)}`}</Text>
              </View>
              <Bar pct={Math.min(100, row.pct)} color={row.state === 'over' ? Colors.red : row.state === 'close' ? Colors.gold : Colors.teal} />
            </View>
          ))}
          <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 17 }]}>
            {`Only categories with a limit are compared (${inr(cmp.totalPredicted)} forecast against ${inr(cmp.totalLimit)} of limits).${cmp.noLimit.length ? ` No limit set for: ${cmp.noLimit.join(', ')}.` : ''}`}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={Typography.body}>You have not set any category limits, so there is nothing to compare the forecast with.</Text>
          <LinkButton onPress={() => router.push('/tracker/budget')} textStyle={s.link}>Set limits in Budget</LinkButton>
        </Card>
      )}

      {r.buffer20 > 0 ? (
        <Card>
          <Text style={[Typography.caption, { lineHeight: 18 }]}>
            {r.topRiskLock
              ? `${r.topRiskLock.category} is the category most likely to spike with the events you chose. Keeping about ${inr(r.topRiskLock.amount)} aside for it (30% of its forecast) is one way to prepare.`
              : `If you want a cushion, 20% on top of the forecast is ${inr(r.buffer20)}. That is a convention, not something your data says.`}
          </Text>
        </Card>
      ) : null}

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>Each category is smoothed separately (Holt's double exponential smoothing, which follows the level and the direction of recent months) over the complete months before this one. It is the same method as the website's Budget Forecast.</Bullet>
        <Bullet>Only expenses count. Income, savings and investing entries are left out, and months before your first logged expense are not treated as zero.</Bullet>
        <Bullet>A trend or a risk flag is only shown once there are at least 3 months of logged spending.</Bullet>
        <Bullet>It cannot know about one-off bills, a new job, a move or a price rise. The more months you log, the better it is.</Bullet>
        <Bullet>The forecast is stored as its own figure and never replaces your recorded monthly spend, savings rate or income.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function WindowPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={Typography.label}>HISTORY TO USE</Text>
      <View style={[s.chips, { marginTop: Spacing.sm }]}>
        {WINDOWS.map(w => (
          <TouchableOpacity key={w} style={[s.chip, value === w && s.chipOn]} onPress={() => onChange(w)} accessibilityRole="button"
            accessibilityLabel={`History to use: last ${w} months`} accessibilityState={{ selected: value === w }}>
            <Text style={[s.chipTxt, value === w && s.chipTxtOn]}>{`Last ${w} months`}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 32, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg },
  chipOn: { borderColor: Colors.cyan, backgroundColor: Colors.surfaceAlt },
  chipTxt: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTxtOn: { color: Colors.cyan },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cat: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  amt: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  link: { color: Colors.cyan, fontWeight: '800', marginTop: Spacing.md },
});
