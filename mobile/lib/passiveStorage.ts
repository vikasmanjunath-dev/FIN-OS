// Passive-income streams on the device (the website's finos_passive_streams) and the two totals other trackers read.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import { STREAM_KEY, normalise, seed, summarize, type Stream } from '@/lib/passive';
import { calcSGBAnnualCoupon } from '@/lib/gold';

const n = (v: string | null | undefined) => { const x = parseFloat(v ?? ''); return Number.isFinite(x) && x > 0 ? x : 0; };

export async function loadPassive(): Promise<{ streams: Stream[]; monthlyExp: number; seeded: boolean }> {
  const g = await getMany([STREAM_KEY, 'finos_monthly_expense', 'finos_budget_expenses', 'finos_fd_value', 'finos_gold_portfolio']);
  const monthlyExp = n(g.finos_monthly_expense) || n(g.finos_budget_expenses);
  let saved: Stream[] | null = null;
  try { saved = normalise(JSON.parse(g[STREAM_KEY] ?? 'null')); } catch { /* corrupt: reseed */ }
  if (saved) return { streams: saved, monthlyExp, seeded: false };
  let coupon = 0;
  try { (JSON.parse(g.finos_gold_portfolio ?? '[]') as any[]).forEach(h => { if (h?.type === 'sgb') coupon += calcSGBAnnualCoupon(Number(h.units) || 0, Number(h.faceValue) || 0); }); } catch { /* none */ }
  return { streams: seed(n(g.finos_fd_value), coupon), monthlyExp, seeded: true };
}

export async function savePassive(streams: Stream[], monthlyExp: number) {
  const s = summarize(streams, monthlyExp);
  await AsyncStorage.multiSet([
    [STREAM_KEY, JSON.stringify(streams)],
    ['finos_passive_total_mo', String(s.total)],
    ['finos_passive_coverage', s.coverage.toFixed(1)],
  ]);
}
