import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { MarketScreen, KV, Freshness, changeColor } from '@/components/MarketUI';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { CalcField, toNum } from '@/components/CalcUI';
import { EmptyPortfolio, NotAdvice, usePortfolioViews, usePortfolioHistory } from '@/components/PortfolioUI';
import { buildRetro, riskMetrics, perHoldingRisk } from '@/lib/portfolioHistory';
import { expectancy, breakEvenWinRate, profitFactor, recoveryNeededPct } from '@/lib/portfolioStats';
import { fmtPct } from '@/lib/marketData';
import { Colors, Spacing, Typography } from '@/constants/theme';

const f2 = (n: number | null, d = 2) => (n === null || !Number.isFinite(n) ? 'Not available' : n.toFixed(d));

export default function PortfolioRisk() {
  const { views, loaded } = usePortfolioViews();
  const hist = usePortfolioHistory(views, views.length > 0);
  const [rfText, setRfText] = useState('6.5');
  const rf = toNum(rfText);
  const retro = useMemo(() => (hist.data?.bench ? buildRetro(hist.data.series, hist.data.bench) : null), [hist.data]);
  const m = useMemo(() => (retro ? riskMetrics(retro, rf) : null), [retro, rf]);
  const per = useMemo(() => (retro && hist.data?.bench ? perHoldingRisk(hist.data.series, hist.data.bench, retro.included) : []), [retro, hist.data]);

  // trade-statistics calculators
  const [wr, setWr] = useState(''), [aw, setAw] = useState(''), [al, setAl] = useState(''), [gp, setGp] = useState(''), [gl, setGl] = useState(''), [loss, setLoss] = useState('');
  const E = wr.trim() && aw.trim() && al.trim() ? expectancy(toNum(wr) / 100, toNum(aw), toNum(al)) : null;
  const be = aw.trim() && al.trim() ? breakEvenWinRate(toNum(aw), toNum(al)) : null;
  const pf = gp.trim() && gl.trim() ? profitFactor(toNum(gp), toNum(gl)) : null;
  const rec = loss.trim() ? recoveryNeededPct(toNum(loss)) : null;

  return (
    <MarketScreen title="Risk and market sensitivity" subtitle="How your current holdings behaved over the last year, set against Nifty 50." refreshing={hist.status === 'loading'} onRefresh={hist.reload}>
      {!views.length ? <EmptyPortfolio loaded={loaded} /> : (
        <>
          <Card accent={Colors.gold}>
            <Text style={Typography.label}>WHAT THIS IS, AND IS NOT</Text>
            <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
              A look back: the last year's price moves of the holdings you have TODAY, combined at today's weights. It is not your actual return. It ignores when you bought, your SIPs, anything you sold, dividends and tax, and covers only holdings whose history could be fetched. One year is a short sample; numbers like beta change from year to year.
            </Text>
          </Card>

          {hist.status === 'loading' ? <Text style={Typography.caption} accessibilityRole="alert">{`Loading price history… ${Math.round(hist.progress * 100)}%`}</Text> : null}
          {hist.data ? <Freshness savedAt={hist.data.oldestAt} fromCache={hist.data.anyFromCache} error={hist.data.benchError} freshMs={24 * 3600_000} /> : null}

          {hist.status === 'done' && !m ? (
            <Card><Text style={Typography.body}>{hist.data?.benchError ?? 'Not enough price history came back for these holdings to work anything out.'}</Text>
              <Text style={Typography.caption}>Pull down to try again when your Arya backend is reachable.</Text></Card>
          ) : null}

          {m && retro ? (
            <>
              <Card>
                <Text style={Typography.caption}>{`${m.days} trading days, ${m.startDate} to ${m.endDate}. Covers ${retro.coveragePct.toFixed(0)}% of your portfolio's value; average included-holding coverage on retained days was ${retro.avgDayCoveragePct.toFixed(0)}%${retro.droppedDays ? `; ${retro.droppedDays} day(s) left out for lack of prices` : ''}.`}</Text>
                {retro.excluded.length ? <Text style={[Typography.caption, { color: Colors.gold, marginTop: 4 }]}>{`Left out: ${retro.excluded.map(e => `${e.label} (${e.reason})`).join('; ')}.`}</Text> : null}
              </Card>

              <SectionLabel>RETURN AND SWING</SectionLabel>
              <Card>
                <KV label="Price return, your mix" value={fmtPct(m.totalReturnPct, 1)} color={changeColor(m.totalReturnPct)} sub={m.annualisedReturnPct === null ? 'Under 3 months: not annualised' : `About ${fmtPct(m.annualisedReturnPct, 1)} a year`} />
                <KV label="Price return, Nifty 50" value={fmtPct(m.benchTotalReturnPct, 1)} color={changeColor(m.benchTotalReturnPct)} />
                <KV label="Volatility, your mix" value={`${m.volPct.toFixed(1)}% a year`} sub="Standard deviation of daily moves × √252" />
                <KV label="Volatility, Nifty 50" value={`${m.benchVolPct.toFixed(1)}% a year`} />
                <KV label="Best and worst day" value={`${fmtPct(m.bestDayPct, 1)} / ${fmtPct(m.worstDayPct, 1)}`} />
                <KV label="Days down" value={`${m.downDaysPct.toFixed(0)}%`} />
              </Card>

              <SectionLabel>DRAWDOWN</SectionLabel>
              <Card>
                <KV label="Worst fall from a peak" value={fmtPct(m.maxDdPct, 1)} color={changeColor(m.maxDdPct)}
                  sub={m.maxDdPct < 0 ? `Peak ${m.ddPeakDate ?? 'at the start of the window'}, low ${m.ddTroughDate}; ${m.ddRecovered ? 'back at the old peak by the end' : 'not back at the old peak by the end'}` : 'No fall in this window'} />
                {m.maxDdPct < 0 ? <KV label="Gain needed to get back" value={`${f2(recoveryNeededPct(-m.maxDdPct))}%`} sub="A 10% fall needs 11.1%; 50% needs 100%" /> : null}
                <KV label="Ulcer index" value={f2(m.ulcer, 1)} sub="Root-mean-square fall from the running peak: counts how deep AND how long, in % points" />
                <KV label="Return per unit of worst fall (Calmar)" value={f2(m.calmar)} sub="Annualised return ÷ worst fall. Needs at least 3 months." />
              </Card>

              <SectionLabel>AGAINST NIFTY 50 (ONE-FACTOR REGRESSION)</SectionLabel>
              <Card>
                <KV label="Beta" value={f2(m.beta)} sub="Historical slope of your daily returns on Nifty's. 1.0 matched its sensitivity in this sample; it does not predict future moves." />
                <KV label="CAPM alpha estimate, annualised" value={m.alphaAnnPct === null ? 'Not available' : `${m.alphaAnnPct >= 0 ? '+' : '−'}${Math.abs(m.alphaAnnPct).toFixed(1)}%`} sub="Daily portfolio excess return minus beta × Nifty excess return, ×252. Very noisy over one year; not a measure of skill." />
                <KV label="R²" value={m.r2 === null ? 'Not available' : `${(m.r2 * 100).toFixed(0)}%`} sub="Share of your day-to-day moves that Nifty's moves explain; not defined if either series is flat" />
                <KV label="Tracking error" value={`${m.trackingErrorPct.toFixed(1)}% a year`} sub="Volatility of your daily return minus Nifty's" />
                <KV label="Information ratio" value={f2(m.infoRatio)} sub="Average daily gap to Nifty ÷ its volatility, annualised" />
                <Text style={[Typography.caption, { marginTop: 6, lineHeight: 17 }]}>Multi-factor models need dated, published India factor returns (such as size, value, profitability and investment); this app has no validated source for them. Only the market factor (Nifty 50) is used, and nothing is inferred from sector labels.</Text>
              </Card>

              <SectionLabel>RISK-ADJUSTED RETURN</SectionLabel>
              <Card>
                <CalcField label="Risk-free rate (% a year)" sub="6.5% is an editable illustrative default, not a live rate. Use a current rate in the same currency and period as your returns." value={rfText} onChange={setRfText} />
                <KV label="Sharpe ratio" value={f2(m.sharpe)} sub="Average daily return above the risk-free rate ÷ its volatility, annualised" />
                <KV label="Sortino ratio" value={f2(m.sortino)} sub="Like Sharpe but only falls below the risk-free rate count as risk (the usual definition)" />
                <Text style={[Typography.caption, { marginTop: 4 }]}>A year of data makes these ratios very uncertain; compare them with Nifty's over the same window before reading anything into them.</Text>
              </Card>

              {per.length ? (
                <>
                  <SectionLabel>EACH HOLDING</SectionLabel>
                  <Card>
                    {per.map(p => (
                      <View key={p.key} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }} accessible accessibilityLabel={`${p.label}, ${p.weightPct.toFixed(0)} percent of the portfolio, price change ${fmtPct(p.returnPct, 1)}, volatility ${p.volPct.toFixed(0)} percent, beta ${f2(p.beta)}`}>
                        <Text style={[Typography.body, { fontWeight: '700' }]} numberOfLines={1}>{`${p.label}  ·  ${p.weightPct.toFixed(1)}%`}</Text>
                        <Text style={Typography.caption}>{`${fmtPct(p.returnPct, 1)} over the window · volatility ${p.volPct.toFixed(0)}% · beta ${f2(p.beta)} · ${p.days} days`}</Text>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}
            </>
          ) : null}

          <SectionLabel>CHECK YOUR OWN TRADE NUMBERS</SectionLabel>
          <Card>
            <Text style={Typography.caption}>These use only the numbers you type. They say nothing about whether to trade. Small samples mislead: a few dozen trades can show an edge by luck.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: Spacing.sm }}>
              <CalcField label="Win rate (%)" value={wr} onChange={setWr} placeholder="e.g. 40" />
              <CalcField label="Average win (₹)" value={aw} onChange={setAw} placeholder="e.g. 4000" />
              <CalcField label="Average loss (₹)" value={al} onChange={setAl} placeholder="e.g. 900" />
            </View>
            {E !== null ? <KV label="Expectancy per trade" value={`${E < 0 ? '−' : ''}₹${Math.abs(Math.round(E)).toLocaleString('en-IN')}`} sub="Win rate × average win − loss rate × average loss, before charges and tax" color={changeColor(E)} /> : <Text style={Typography.caption}>Enter win rate, average win and average loss.</Text>}
            {be !== null ? <KV label="Win rate needed to break even" value={`${(be * 100).toFixed(1)}%`} sub="At these average win and loss sizes" /> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: Spacing.sm }}>
              <CalcField label="Total of winning trades (₹)" value={gp} onChange={setGp} />
              <CalcField label="Total of losing trades (₹)" value={gl} onChange={setGl} />
            </View>
            {pf !== null ? <KV label="Profit factor" value={pf.toFixed(2)} sub="Total wins ÷ total losses, as positive amounts" /> : null}
            <CalcField label="A fall of (%)" value={loss} onChange={setLoss} placeholder="e.g. 30" />
            {rec !== null ? <KV label="Gain needed to recover" value={`${rec.toFixed(1)}%`} sub="Losses hurt more than the same gain helps" /> : null}
          </Card>
          <Text style={Typography.caption}>Not built from the hedge-fund page: its "your trading DNA", override-cost and bias meters are invented example figures, and there is no trade journal on the phone to measure them from.</Text>
          <NotAdvice />
        </>
      )}
    </MarketScreen>
  );
}
