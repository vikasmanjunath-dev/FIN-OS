import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTrackers } from '@/hooks/useTrackers';
import { EPF, validDate } from '@/lib/retirement';
import { TrackerScreen, Card, SectionLabel, Stat, MoneyField, NumberField, TextField, inr, inrShort } from '@/components/TrackerUI';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function EpfScreen() {
  const { data, computed, save } = useTrackers();
  const e = computed.retirement.epf;
  const c = e.contributions;
  const yrs = Math.floor(e.monthsToRetire / 12), mo = e.monthsToRetire % 12;

  return (
    <TrackerScreen title="EPF / provident fund" subtitle="Your employee provident fund balance, what goes in every month, and what it could grow to by retirement.">
      <Card accent={Colors.teal}>
        <Text style={Typography.label}>EPF BALANCE</Text>
        <Text style={s.hero}>{inr(e.balance)}</Text>
        {e.complete ? (
          <>
            <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
              <Stat label={`At age ${data.epfRetireAge || EPF.RETIRE_AGE_DEFAULT}`} value={inrShort(e.projected)} color={Colors.teal} />
              <Stat label="EPS pension / month" value={inr(e.pension)} color={Colors.cyan} />
            </View>
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
              {e.monthsToRetire > 0 ? `${yrs} year${yrs === 1 ? '' : 's'}${mo ? ` ${mo} month${mo === 1 ? '' : 's'}` : ''} to go` : 'Retirement age reached'} · {e.yearsService} years of service so far · {EPF.INTEREST}% annual rate assumed (FY 2025-26).
            </Text>
          </>
        ) : (
          <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>Add your monthly basic pay, date of birth, and joining date below to see your projected corpus and pension.</Text>
        )}
      </Card>

      {e.basic > 0 && (
        <Card>
          <Text style={Typography.label}>EVERY MONTH, ON ₹{e.basic.toLocaleString('en-IN')} BASIC + DA</Text>
          {[
            { l: 'You (12%)', v: c.empEPF, color: Colors.cyan },
            { l: 'Employer to EPF (3.67%)', v: c.emprEPF, color: Colors.teal },
            { l: `Employer to EPS pension (8.33%${data.epfBasic > EPF.EPS_WAGE_CAP ? `, capped at ₹${EPF.EPS_WAGE_CAP.toLocaleString('en-IN')}` : ''})`, v: c.eps, color: Colors.purpleInk },
          ].map(r => (
            <View key={r.l} style={s.row}>
              <View style={[s.dot, { backgroundColor: r.color }]} />
              <Text style={s.rowLabel}>{r.l}</Text>
              <Text style={s.rowVal}>{inr(r.v)}</Text>
            </View>
          ))}
          <View style={[s.row, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4, paddingTop: 8 }]}>
            <Text style={[s.rowLabel, { fontWeight: '800' }]}>Added to your EPF account</Text>
            <Text style={[s.rowVal, { color: Colors.teal }]}>{inr(c.totalEPF)}</Text>
          </View>
        </Card>
      )}

      <SectionLabel>YOUR DETAILS</SectionLabel>
      <Card>
        <MoneyField icon="🏢" label="EPF balance" sub="From the EPFO passbook or UMANG app" value={data.epf} onCommit={v => save({ epf: v })} />
        <MoneyField icon="💼" label="Monthly basic + DA" sub="Used for contributions and pension" value={data.epfBasic} onCommit={v => save({ epfBasic: v })} />
        <TextField icon="📅" label="Date of joining" sub="First job in the EPF system" value={data.epfDoj} placeholder="YYYY-MM-DD"
          validate={t => !validDate(t, { optional: true }) ? 'Use a real past date like 2016-07-01' : (t && data.epfDob && data.epfDob > t ? 'Joining date must be on or after your date of birth' : null)} onCommit={v => save({ epfDoj: v })} />
        <TextField icon="🎂" label="Date of birth" sub="Used to calculate your retirement date; no joining age is assumed" value={data.epfDob} placeholder="YYYY-MM-DD"
          validate={t => !validDate(t, { optional: true }) ? 'Use a real past date like 1990-05-17' : (t && data.epfDoj && t > data.epfDoj ? 'Date of birth must be on or before your joining date' : null)} onCommit={v => save({ epfDob: v })} />
        <NumberField icon="🎯" label="Retirement age" sub="Use a whole age between 50 and 65; EPS pension normally starts at 58" value={data.epfRetireAge || EPF.RETIRE_AGE_DEFAULT} min={50} max={65} onCommit={v => save({ epfRetireAge: v })} />
      </Card>

      <Text style={[Typography.caption, { lineHeight: 17 }]}>
        Your retirement date uses the date of birth you provide. The {EPF.INTEREST}% rate is an annual assumption based on FY 2025-26 and can change; actual EPFO crediting can differ. Your UAN is never stored here. This is an estimate, not an EPFO statement.
      </Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  rowLabel: { ...Typography.caption, flex: 1, color: Colors.textPrimary, paddingRight: 8 },
  rowVal: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
});
