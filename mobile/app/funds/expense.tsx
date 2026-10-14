import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrackerScreen, Card, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, toNum } from '@/components/CalcUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { expenseImpact } from '@/lib/funds';

/** Direct vs Regular. The expense ratios are the person's to enter (from the scheme's factsheet): the AMFI NAV feed does not carry them. */
export default function ExpenseImpact() {
  const [sip, setSip] = useState('');
  const [years, setYears] = useState('');
  const [reg, setReg] = useState('');
  const [dir, setDir] = useState('');
  const [gross, setGross] = useState('12');

  const v = { sip: toNum(sip), years: toNum(years), reg: toNum(reg), dir: toNum(dir), gross: toNum(gross) };
  const ready = v.sip > 0 && v.years >= 1 && v.years <= 60 && v.reg > 0 && v.dir > 0 && v.gross > 0 && v.reg < 10 && v.dir < 10 && v.gross > Math.max(v.reg, v.dir);
  const r = ready ? expenseImpact({ monthlySip: v.sip, years: Math.round(v.years), regularEr: v.reg, directEr: v.dir, grossReturn: v.gross }) : null;
  const directCostsMore = r !== null && v.dir >= v.reg;

  return (
    <TrackerScreen title="Direct vs Regular" subtitle="The same instalments, the same gross return, two different expense ratios. Shows what the difference in cost does over your years.">
      <Card>
        <View style={s.row}>
          <CalcField label="Monthly SIP" prefix="₹" value={sip} onChange={setSip} placeholder="e.g. 10000" />
          <View style={{ width: Spacing.md }} />
          <CalcField label="Years" value={years} onChange={setYears} placeholder="1 to 60" />
        </View>
        <View style={s.row}>
          <CalcField label="Regular plan expense ratio" suffix="%" value={reg} onChange={setReg} placeholder="from factsheet" sub="Total expense ratio, % a year" />
          <View style={{ width: Spacing.md }} />
          <CalcField label="Direct plan expense ratio" suffix="%" value={dir} onChange={setDir} placeholder="from factsheet" sub="Total expense ratio, % a year" />
        </View>
        <CalcField label="Assumed return before expenses" suffix="%" value={gross} onChange={setGross} sub="An assumption, not a forecast. The website fixes it at 12%." />
      </Card>

      {!r ? (
        <Card><Text style={s.body}>Enter your monthly SIP, the years, and the two expense ratios (each from the scheme's own factsheet; the NAV feed does not carry them). The assumed return must be higher than both.</Text></Card>
      ) : (
        <>
          <Card>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.label, { color: Colors.gold }]}>REGULAR ({v.reg}%)</Text>
                <Text style={s.big}>{inrShort(r.regularCorpus)}</Text>
                <Text style={Typography.caption}>{inr(r.regularCorpus)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.label, { color: Colors.teal }]}>DIRECT ({v.dir}%)</Text>
                <Text style={s.big}>{inrShort(r.directCorpus)}</Text>
                <Text style={Typography.caption}>{inr(r.directCorpus)}</Text>
              </View>
            </View>
          </Card>
          <Card accent={directCostsMore ? Colors.gold : Colors.teal}>
            <Text style={Typography.label}>DIFFERENCE AFTER {Math.round(v.years)} YEARS</Text>
            <Text style={s.big}>{inr(Math.abs(r.difference))}</Text>
            <Text style={s.body}>
              {directCostsMore
                ? 'The Direct expense ratio you entered is not lower than the Regular one, so Direct does not come out ahead here. Check both figures.'
                : `Direct comes out ahead by this much, about ${Math.round(Math.abs(r.differencePctOfInvested))}% of the ${inr(r.invested)} you would put in.`}
            </Text>
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
              Same method as the website: each instalment at the start of the month, compounded monthly at (return − expense ratio). Real funds charge expenses inside the NAV day by day and returns are not steady, so treat this as an illustration of the size of the effect. Direct plans are bought without a distributor; if you value the advice you get with a Regular plan, that is a separate decision this number does not capture.
            </Text>
          </Card>
        </>
      )}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row' },
  body: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  big: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 4 },
});
