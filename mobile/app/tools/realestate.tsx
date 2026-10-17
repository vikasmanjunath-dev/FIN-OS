import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, CheckRow, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { buyVsRent, trueCost, rentalYield, STAMP_STATES, BVR_DEFAULTS } from '@/lib/realEstate';
import { Colors, Spacing, Typography } from '@/constants/theme';

type Tab = 'bvr' | 'tco' | 'yield';
const D = {
  price: '8000000', down: '20', rate: '8.5', tenure: '20', app: '6', maint: '5000', buyCost: '7', sellCost: '2', saleTax: '12.5',
  rent: '25000', rentInc: '7', invest: '12', bracket: '20', claim: false,
  tcoPrice: '8000000', state: 'MH', gst: '0', loan: '6400000', proc: '0.5', society: '60000', furnish: '500000',
  yPrice: '5000000', yRent: '18000', yCosts: '40000', yEmi: '0', yApp: '6', yYears: '10', yEq: '13',
};

export default function RealEstateScreen() {
  const [tab, setTab] = useState<Tab>('bvr');
  const { value: v, setValue } = usePersisted<Record<string, string | boolean>>('finos_realestate_mobile', D);
  const set = (k: string) => (t: string) => setValue(p => ({ ...p, [k]: t }));
  const s = (k: string) => String(v[k] ?? '');
  const n = (k: string) => toNum(s(k));

  const bvr = useMemo(() => buyVsRent({
    price: n('price'), downPct: n('down'), loanRate: n('rate'), tenure: n('tenure'), appreciation: n('app'), maintenance: n('maint'), rent: n('rent'), rentInc: n('rentInc'),
    investRet: n('invest'), buyCostPct: n('buyCost'), sellCostPct: n('sellCost'), saleTaxPct: n('saleTax'), claimTax: v.claim === true, bracketPct: n('bracket'), years: BVR_DEFAULTS.years,
  }), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const stamp = STAMP_STATES.find(x => x.id === s('state')) ?? STAMP_STATES[0];
  const tco = useMemo(() => trueCost({ price: n('tcoPrice'), stampPct: stamp.pct, regPct: 1, gstPct: n('gst'), loan: n('loan'), procPct: n('proc'), maintYear: n('society'), furnish: n('furnish'), years: 20 }), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const yld = useMemo(() => rentalYield({ price: n('yPrice'), rent: n('yRent'), costsYear: n('yCosts'), emi: n('yEmi'), appreciation: n('yApp'), years: n('yYears'), equity: n('yEq') }), [v]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (x: number) => (Number.isFinite(x) ? inr(x) : '—');
  return (
    <TrackerScreen title="Real estate" subtitle="Buy or rent, what a home really costs, and what a rental property earns.">
      <Segmented<Tab> label="WHAT DO YOU WANT TO WORK OUT?" value={tab} onChange={setTab}
        options={[{ id: 'bvr', label: 'Buy vs rent' }, { id: 'tco', label: 'True cost' }, { id: 'yield', label: 'Rental yield' }]} />

      {tab === 'bvr' && (
        <>
          <Card accent={bvr.buyWins ? Colors.teal : Colors.gold}>
            <Text style={Typography.label}>{`AFTER ${bvr.years} YEARS`}</Text>
            <Text style={[s0.hero, { color: bvr.buyWins ? Colors.teal : Colors.gold }]}>{bvr.buyWins ? 'Buying wins' : 'Renting and investing wins'}</Text>
            <Text style={Typography.body}>{`by ${money(bvr.difference)}`}</Text>
            <View style={s0.cols}>
              <Kpi label="IF YOU BUY" value={inrShort(bvr.buyNetWorth)} sub="net worth after selling" color={Colors.teal} />
              <Kpi label="IF YOU RENT" value={inrShort(bvr.rentCorpus)} sub="investments" color={Colors.gold} />
            </View>
            <Bar pct={Math.min(100, (Math.max(0, bvr.buyNetWorth) / Math.max(1, Math.max(bvr.buyNetWorth, bvr.rentCorpus))) * 100)} color={Colors.teal} height={8} />
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
              {bvr.breakEven ? `Buying stays ahead from about year ${bvr.breakEven}.` : `Buying does not catch up with renting and investing within ${bvr.years} years in this scenario.`}
            </Text>
          </Card>
          <SectionLabel>BUY</SectionLabel>
          <Card>
            <CalcField label="PROPERTY PRICE" prefix="₹" value={s('price')} onChange={set('price')} />
            <CalcField label="DOWN PAYMENT" suffix="%" value={s('down')} onChange={set('down')} />
            <CalcField label="HOME LOAN RATE (P.A.)" suffix="%" value={s('rate')} onChange={set('rate')} />
            <CalcField label="LOAN TENURE" suffix="yrs" value={s('tenure')} onChange={set('tenure')} />
            <CalcField label="PROPERTY APPRECIATION (P.A.)" suffix="%" value={s('app')} onChange={set('app')} />
            <CalcField label="MONTHLY MAINTENANCE" prefix="₹" value={s('maint')} onChange={set('maint')} />
            <CalcField label="STAMP DUTY, REGISTRATION AND OTHER BUYING COSTS" suffix="%" value={s('buyCost')} onChange={set('buyCost')} />
            <CalcField label="SELLING COSTS" suffix="%" value={s('sellCost')} onChange={set('sellCost')} />
            <CalcField label="CAPITAL GAINS TAX ON SALE" suffix="%" value={s('saleTax')} onChange={set('saleTax')} />
          </Card>
          <SectionLabel>RENT</SectionLabel>
          <Card>
            <CalcField label="CURRENT MONTHLY RENT" prefix="₹" value={s('rent')} onChange={set('rent')} />
            <CalcField label="ANNUAL RENT INCREASE" suffix="%" value={s('rentInc')} onChange={set('rentInc')} />
            <CalcField label="RETURN ON SAVINGS (P.A.)" suffix="%" value={s('invest')} onChange={set('invest')} />
            <CheckRow label="I claim home-loan interest (up to ₹2 L) and principal (within ₹1.5 L) as deductions: old tax regime only" value={v.claim === true} onChange={b => setValue(p => ({ ...p, claim: b }))} />
            {v.claim === true && <CalcField label="YOUR TAX BRACKET" suffix="%" value={s('bracket')} onChange={set('bracket')} />}
          </Card>
          <Card>
            <Text style={Typography.label}>THE DETAIL</Text>
            <Line k="Monthly EMI" v={money(bvr.emi)} />
            <Line k="Property value" v={money(bvr.propertyValue)} />
            <Line k="Total EMIs paid" v={money(bvr.totalEmi)} />
            <Line k="Of which interest" v={money(bvr.totalInterest)} />
            <Line k="Maintenance" v={money(bvr.totalMaintenance)} />
            {v.claim === true && <Line k="Tax saved on the loan" v={money(bvr.taxBenefits)} />}
            <Line k="Invested at the start if you rent" v={money(bvr.upfront)} />
          </Card>
          <Collapsible title="What this assumes">
            <Bullet>Both sides spend the same cash each month. Whoever pays less (EMI plus upkeep, or rent) invests the difference at your return rate.</Bullet>
            <Bullet>The buyer pays stamp duty and registration up front (the renter invests that money) and pays selling costs and capital-gains tax at the end.</Bullet>
            <Bullet>Rates are constant. Property tax, vacancy, a change in the loan rate and the comfort of owning are not included.</Bullet>
          </Collapsible>
        </>
      )}

      {tab === 'tco' && (
        <>
          <Card accent={Colors.gold}>
            <Text style={Typography.label}>ALL-IN AT PURCHASE</Text>
            <Text style={[s0.hero, { color: Colors.gold }]}>{money(tco.total)}</Text>
            <Text style={Typography.body}>{`${tco.premiumPct.toFixed(1)}% above the base price. With 20 years of maintenance: ${inrShort(tco.totalWithMaintenance)} (loan interest not included).`}</Text>
          </Card>
          <Card>
            <CalcField label="PROPERTY PRICE" prefix="₹" value={s('tcoPrice')} onChange={set('tcoPrice')} />
            <Segmented label="STATE (STAMP DUTY)" value={s('state')} onChange={t => setValue(p => ({ ...p, state: t }))}
              options={STAMP_STATES.map(x => ({ id: x.id, label: `${x.label} ${x.pct}%` }))} />
            <Segmented label="GST (UNDER-CONSTRUCTION ONLY)" value={s('gst')} onChange={t => setValue(p => ({ ...p, gst: t }))}
              options={[{ id: '0', label: 'None' }, { id: '5', label: 'Affordable 5%' }, { id: '12', label: 'Other 12%' }]} />
            <CalcField label="LOAN AMOUNT" prefix="₹" value={s('loan')} onChange={set('loan')} />
            <CalcField label="PROCESSING FEE" suffix="%" value={s('proc')} onChange={set('proc')} />
            <CalcField label="SOCIETY / MAINTENANCE (A YEAR)" prefix="₹" value={s('society')} onChange={set('society')} />
            <CalcField label="FURNISHING" prefix="₹" value={s('furnish')} onChange={set('furnish')} />
          </Card>
          <Card>
            <Text style={Typography.label}>WHERE IT GOES</Text>
            <Line k="Base price" v={money(tco.price)} />
            <Line k="Stamp duty" v={money(tco.stamp)} />
            <Line k="Registration (1%)" v={money(tco.reg)} />
            {tco.gst > 0 && <Line k="GST" v={money(tco.gst)} />}
            <Line k="Loan processing" v={money(tco.proc)} />
            <Line k="Furnishing" v={money(tco.furnish)} />
            <Line k="Maintenance, 20 years" v={money(tco.maintenance)} />
          </Card>
          <Text style={[Typography.caption, { lineHeight: 17 }]}>{`The property has to rise to about ${inrShort(tco.total)} just to recover what you paid to acquire it, before any capital-gains tax.`}</Text>
        </>
      )}

      {tab === 'yield' && (
        <>
          <Card accent={yld.propertyWins ? Colors.teal : Colors.gold}>
            <Text style={Typography.label}>NET RENTAL YIELD</Text>
            <Text style={[s0.hero, { color: yld.netYield >= 3 ? Colors.teal : Colors.gold }]}>{`${yld.netYield.toFixed(2)}%`}</Text>
            <Text style={Typography.body}>{`Gross ${yld.grossYield.toFixed(2)}%. Monthly cash flow ${yld.cashflow >= 0 ? '+' : '−'}${money(Math.abs(yld.cashflow))}.`}</Text>
            <View style={s0.cols}>
              <Kpi label="PROPERTY" value={inrShort(yld.propertyTotal)} sub="value + rent kept" color={Colors.teal} />
              <Kpi label="EQUITY" value={inrShort(yld.equityValue)} sub={`at ${s('yEq')}% a year`} color={Colors.cyan} />
            </View>
            <Text style={[Typography.caption, { lineHeight: 17, marginTop: Spacing.sm }]}>
              {yld.propertyWins ? `Property comes out ahead by ${money(yld.gap)} over ${s('yYears')} years in this scenario.` : `Equity comes out ahead by ${money(yld.gap)} over ${s('yYears')} years in this scenario, before counting that property is illiquid and the EMI is a commitment.`}
            </Text>
          </Card>
          <Card>
            <CalcField label="PROPERTY PRICE" prefix="₹" value={s('yPrice')} onChange={set('yPrice')} />
            <CalcField label="MONTHLY RENTAL INCOME" prefix="₹" value={s('yRent')} onChange={set('yRent')} />
            <CalcField label="ANNUAL MAINTENANCE + PROPERTY TAX" prefix="₹" value={s('yCosts')} onChange={set('yCosts')} />
            <CalcField label="MONTHLY LOAN EMI, IF ANY" prefix="₹" value={s('yEmi')} onChange={set('yEmi')} />
            <CalcField label="EXPECTED APPRECIATION (P.A.)" suffix="%" value={s('yApp')} onChange={set('yApp')} />
            <CalcField label="HOLDING PERIOD" suffix="yrs" value={s('yYears')} onChange={set('yYears')} />
            <CalcField label="EQUITY ALTERNATIVE (P.A.)" suffix="%" value={s('yEq')} onChange={set('yEq')} />
          </Card>
          <Collapsible title="What this assumes">
            <Bullet>Property side: the price grown at the appreciation rate, plus the rent you keep after yearly costs (not reinvested, not growing). Equity side: the same money grown at the equity rate.</Bullet>
            <Bullet>Vacancy, tenant changes, loan interest, and tax on rent and on the sale are not included.</Bullet>
          </Collapsible>
        </>
      )}
      <Text style={[Typography.caption, { textAlign: 'center', marginTop: Spacing.md }]}>Estimates for planning, not advice. Your inputs stay on this phone.</Text>
    </TrackerScreen>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ flexBasis: '45%', flexGrow: 1 }}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[s0.kpi, color ? { color } : null]}>{value}</Text>
      {sub ? <Text style={[Typography.caption, { fontSize: 10 }]}>{sub}</Text> : null}
    </View>
  );
}
function Line({ k, v }: { k: string; v: string }) {
  return (<View style={s0.line}><Text style={[Typography.body, { flexGrow: 1, flexShrink: 1 }]}>{k}</Text><Text style={s0.val}>{v}</Text></View>);
}

const s0 = StyleSheet.create({
  hero: { fontSize: 24, fontWeight: '900', marginVertical: 4 },
  cols: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.md },
  kpi: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  line: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, paddingVertical: 5 },   // a long value drops under its label instead of running off the screen
  val: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginLeft: 'auto' },
});
