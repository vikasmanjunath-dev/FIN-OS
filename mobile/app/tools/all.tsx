import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { TrackerScreen, NavCard, Card, inrShort } from '@/components/TrackerUI';
import { ToolRow } from '@/components/ToolRow';
import { useTrackers } from '@/hooks/useTrackers';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useMoneyScore } from '@/hooks/useMoneyScore';
import { MANIFEST } from '@/lib/learnContent';
import { overallProgress } from '@/lib/learn';
import { loadLearned } from '@/lib/learnStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

/** A titled, collapsible list. Only the trackers group is open to start with, so the screen is a short menu and not a wall. */
function Group({ title, count, startOpen, children }: { title: string; count: number; startOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={s.group}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${count} items`} style={s.groupHead}>
        <Text style={s.groupTitle}>{title}</Text>
        <Text style={s.groupCount}>{count}</Text>
        <Text style={s.chev}>{open ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      {open ? <View>{children}</View> : null}
    </View>
  );
}

/** Everything in FIN·OS in one place. Home keeps the few things you use most; the rest of the trackers, calculators and guides live here. */
export default function AllToolsScreen() {
  const { data: td, computed: tc } = useTrackers();
  const { summary: subs } = useSubscriptions();
  const { saved: moneyScore } = useMoneyScore();
  const [learnSub, setLearnSub] = React.useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    loadLearned().then(l => { const p = overallProgress(MANIFEST, l); if (live) setLearnSub(`${p.done} of ${p.total} lessons`); }).catch(() => {});
    return () => { live = false; };
  }, []));
  const rt = tc.retirement;
  const hasBudget = tc.budget.income > 0;
  const urgentGaps = rt.coverage.gaps.filter(g => g.severity === 'critical' || g.severity === 'high').length;
  const open = (path: string) => { Haptics.selectionAsync(); router.push(path as any); };

  return (
    <TrackerScreen title="All tools" subtitle="Every tracker, calculator and guide. Tap a group to open it.">
      <NavCard title="🔍 Search everything" sub="Find a tool, tracker or calculator by name" onPress={() => open('/search')} style={{ marginBottom: Spacing.lg }} />
      <Card style={{ padding: 0 }}>
      <Group title="Your trackers" count={9} startOpen={true}>
        <ToolRow
            label="Monthly Income"
            value={hasBudget ? inrShort(tc.budget.income) : '—'}
            sub={td.aaIncome > 0 && !td.income ? 'from imported data' : hasBudget ? 'tap to edit' : 'set in Budget'}
            accent={Colors.teal}
            icon="💰"
            onPress={() => open('/tracker/budget')}
          />
        <ToolRow
            label="Monthly Spend"
            value={tc.budget.expense > 0 ? inrShort(tc.budget.expense) : '—'}
            sub={tc.budget.known ? (tc.budget.saving >= 0 ? `saving ${tc.budget.savingsRate}%` : 'spending more than you earn') : 'set in Budget'}
            accent={Colors.gold}
            icon="💳"
            onPress={() => open('/tracker/budget')}
          />
        <ToolRow
            label="EPF"
            value={td.epf > 0 ? inrShort(td.epf) : '—'}
            sub={rt.epf.complete ? `→ ${inrShort(rt.epf.projected)} at retirement` : 'tap to set up'}
            accent={Colors.teal}
            icon="🏢"
            onPress={() => open('/tracker/epf')}
          />
        <ToolRow
            label="NPS"
            value={rt.nps.total > 0 ? inrShort(rt.nps.total) : '—'}
            sub={rt.nps.total <= 0 ? 'tap to set up' : rt.nps.ageNow > 0 ? `→ ${inrShort(rt.nps.projected)} at 60` : 'add date of birth for projection'}
            accent={Colors.cyan}
            icon="🏛️"
            onPress={() => open('/tracker/nps')}
          />
        <ToolRow
            label="PPF & Small Savings"
            value={rt.savings.total > 0 ? inrShort(rt.savings.total) : '—'}
            sub={td.ppfAccounts.length ? `${td.ppfAccounts.length} account${td.ppfAccounts.length === 1 ? '' : 's'} · ${inrShort(Math.min(rt.savings.c80c, 150000))} 80C` : 'tap to set up'}
            accent={Colors.gold}
            icon="📮"
            onPress={() => open('/tracker/ppf')}
          />
        <ToolRow
            label="Insurance"
            value={td.policies.length ? `${td.policies.length} polic${td.policies.length === 1 ? 'y' : 'ies'}` : '—'}
            sub={td.policies.length ? (urgentGaps > 0 ? `${urgentGaps} gap${urgentGaps === 1 ? '' : 's'} to fix` : 'cover looks solid') : 'add your policies'}
            accent={urgentGaps > 0 || !td.policies.length ? Colors.orange : Colors.teal}
            icon="🛡️"
            onPress={() => open('/tracker/insurance')}
          />
        <ToolRow
          label="Subscriptions"
          value={subs.activeCount ? `${formatINR(Math.round(subs.monthly))}/mo` : '—'}
          sub={
            subs.activeCount
              ? subs.review.length
                ? `${subs.review.length} worth a second look · save up to ${inrShort(subs.reviewSavings)}/yr`
                : subs.upcoming[0]
                  ? `next: ${subs.upcoming[0].name} ${subs.upcoming[0].daysAway === 0 ? 'today' : `in ${subs.upcoming[0].daysAway}d`}`
                  : `${inrShort(subs.annual)} a year`
              : 'tap to add your plans'
          }
          accent={subs.review.length ? Colors.orange : Colors.purple}
          icon="🔁"
          onPress={() => open('/tracker/subscriptions')}
      />
        <ToolRow
            label="Passive income"
            value="Freedom meter"
            sub="dividends, rent, interest, SWP"
            accent={Colors.teal}
            icon="🌴"
            onPress={() => open('/tracker/passive')}
          />
        <ToolRow
            label="Trade journal"
            value="Log your trades"
            sub="totals after charges"
            accent={Colors.cyan}
            icon="📒"
            onPress={() => open('/journal')}
          />
        </Group>
        <Group title="Plan and goals" count={12} startOpen={false}>
        <ToolRow
            label="Money Score"
            value={moneyScore ? `${moneyScore.score}/100` : '60 seconds'}
            sub={moneyScore ? (moneyScore.top ? `next: ${moneyScore.top.title}` : 'your whole picture, scored') : 'one number + your next 3 moves'}
            accent={Colors.teal}
            icon="🎯"
            onPress={() => open('/tools/score')}
          />
        <ToolRow
            label="Arya money steps"
            value="Your plan"
            sub="done, open or needs a figure"
            accent={Colors.teal}
            icon="🗺️"
            onPress={() => open('/arya/plan')}
          />
        <ToolRow
            label="Life goals"
            value="Roadmap"
            sub="the SIP each goal needs"
            accent={Colors.teal}
            icon="🗺️"
            onPress={() => open('/plan/lifegoals')}
          />
        <ToolRow
            label="Spending forecast"
            value="This month"
            sub="from your own logged spending"
            accent={Colors.gold}
            icon="🔮"
            onPress={() => open('/plan/forecast')}
          />
        <ToolRow
            label="Growth projection"
            value="At a return you set"
            sub="your holdings and SIPs"
            accent={Colors.teal}
            icon="🌱"
            onPress={() => open('/plan/growth')}
          />
        <ToolRow
            label="Couple finance"
            value="Two incomes"
            sub="shared bills, joint goals"
            accent={Colors.purple}
            icon="👫"
            onPress={() => open('/plan/couple')}
          />
        <ToolRow
            label="Benchmarks"
            value="Rules of thumb"
            sub="not a comparison with others"
            accent={Colors.cyan}
            icon="📏"
            onPress={() => open('/plan/benchmark')}
          />
        <ToolRow
            label="Financial calendar"
            value="What is due"
            sub="SIPs, renewals, tax dates"
            accent={Colors.gold}
            icon="📅"
            onPress={() => open('/tools/calendar')}
          />
        <ToolRow
            label="PULSE"
            value="What matters today"
            sub="ranked from what you recorded"
            accent={Colors.purple}
            icon="🧭"
            onPress={() => open('/pulse')}
          />
        <ToolRow
            label="SIP step-up"
            value="Raise it yearly"
            sub="flat vs stepped-up SIP"
            accent={Colors.teal}
            icon="📈"
            onPress={() => open('/tools/stepup')}
          />
        <ToolRow
            label="Retirement odds"
            value="Will it last?"
            sub="Monte Carlo on what you hold"
            accent={Colors.purple}
            icon="🌅"
            onPress={() => open('/tools/retirement')}
          />
        <ToolRow
            label="Financial DNA"
            value="Your money mindset"
            sub="9 questions, feeds Health Score"
            accent={Colors.purple}
            icon="🧬"
            onPress={() => open('/tools/dna')}
          />
        </Group>
        <Group title="Tax and salary" count={5} startOpen={false}>
        <ToolRow
            label="Tax savings"
            value="Old vs new"
            sub="what deductions could save"
            accent={Colors.teal}
            icon="🧾"
            onPress={() => open('/tools/tax')}
          />
        <ToolRow
            label="Tax harvesting"
            value="Use losses, free gains"
            sub="cut tax before March"
            accent={Colors.gold}
            icon="🍂"
            onPress={() => open('/tracker/harvest')}
          />
        <ToolRow
            label="Salary structure"
            value="Take-home"
            sub="HRA, regime and CTC tips"
            accent={Colors.purple}
            icon="🧮"
            onPress={() => open('/tools/salary')}
          />
        <ToolRow
            label="Job offer comparer"
            value="CTC vs in-hand"
            sub="compare up to 3 offers"
            accent={Colors.gold}
            icon="💼"
            onPress={() => open('/tools/offers')}
          />
        <ToolRow
            label="Windfall allocator"
            value="Bonus, RSU, sale"
            sub="where a lump sum goes first"
            accent={Colors.teal}
            icon="🎁"
            onPress={() => open('/tools/windfall')}
          />
        </Group>
        <Group title="Loans and property" count={6} startOpen={false}>
        <ToolRow
            label="Home loan"
            value="EMI & prepay"
            sub="interest, tax, what prepaying saves"
            accent={Colors.cyan}
            icon="🏠"
            onPress={() => open('/tools/homeloan')}
          />
        <ToolRow
            label="Prepay or invest?"
            value="Home loan"
            sub="which leaves you richer"
            accent={Colors.cyan}
            icon="🏠"
            onPress={() => open('/tools/prepay')}
          />
        <ToolRow
            label="Debt payoff"
            value="Avalanche or snowball"
            sub="clear loans cheapest"
            accent={Colors.orange}
            icon="⛰️"
            onPress={() => open('/tools/debt')}
          />
        <ToolRow
            label="Credit score"
            value="CIBIL"
            sub="rate impact and tips"
            accent={Colors.purple}
            icon="📈"
            onPress={() => open('/tools/credit')}
          />
        <ToolRow
            label="Real estate"
            value="Buy or rent?"
            sub="true cost and rental yield"
            accent={Colors.gold}
            icon="🏠"
            onPress={() => open('/tools/realestate')}
          />
        <ToolRow
            label="Future loss"
            value="Your leak"
            sub="what small spends become"
            accent={Colors.red}
            icon="💧"
            onPress={() => open('/tools/leak')}
          />
        </Group>
        <Group title="Invest and markets" count={7} startOpen={false}>
        <ToolRow
            label="Portfolio analytics"
            value="Sectors and risk"
            sub="from real price history"
            accent={Colors.purple}
            icon="🧮"
            onPress={() => open('/portfolio/analytics')}
          />
        <ToolRow
            label="Rebalancer"
            value="Target mix"
            sub="drift and what to add"
            accent={Colors.cyan}
            icon="⚖️"
            onPress={() => open('/tools/rebalance')}
          />
        <ToolRow
            label="Mutual funds"
            value="Search and compare"
            sub="NAV, Direct vs Regular"
            accent={Colors.gold}
            icon="📈"
            onPress={() => open('/funds')}
          />
        <ToolRow
            label="Market research"
            value="News and prices"
            sub="shares, funds, gold, currency"
            accent={Colors.cyan}
            icon="🔭"
            onPress={() => open('/market')}
          />
        <ToolRow
            label="Calculators"
            value="SIP, EMI, HRA, FD…"
            sub="70+ quick calculators"
            accent={Colors.cyan}
            icon="🧮"
            onPress={() => open('/tools/calculators')}
          />
        <ToolRow
            label="Financial report"
            value="One-page summary"
            sub="share with an advisor"
            accent={Colors.cyan}
            icon="📄"
            onPress={() => open('/tools/report')}
          />
        <ToolRow
            label="Insurance hub"
            value="Cover guide"
            sub="what to ask, compare policies"
            accent={Colors.orange}
            icon="🛡️"
            onPress={() => open('/insurance')}
          />
        </Group>
        <Group title="Learn" count={2} startOpen={false}>
          <ToolRow label="Money reels" sub="short animated lessons with Mitra the owl" accent={Colors.purple} icon="🎬" onPress={() => open('/learn/reels')} />
        <ToolRow
            label="Learn"
            value={learnSub ?? 'Lessons'}
            sub="money, markets and insurance, on this phone"
            accent={Colors.cyan}
            icon="📚"
            onPress={() => open('/learn')}
          />
        </Group>
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  group: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 56, paddingHorizontal: Spacing.md },
  groupTitle: { ...Typography.h3, fontSize: 16, flex: 1 },
  groupCount: { ...Typography.caption },
  chev: { color: Colors.textMuted, fontSize: 18, width: 20, textAlign: 'center' },
});
