// What the growth simulator starts from: the person's own holdings (finos_holdings_v1, valued at the last price fetched, or at cost
// where no price was ever fetched) and their monthly SIPs. The website's SIP tracker (finos_sip_portfolio) is listed separately and
// is not added unless the person chooses to, because the same fund can be in both. Nothing is written except the person's draft.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany, asList, finite } from '@/lib/safeStore';
import { toView, type Holding } from '@/lib/holdings';

export const DRAFT_KEY = 'finos_growth_sim_v1';

export interface SimSources {
  holdingsCount: number; holdingsValue: number; unpriced: number;       // unpriced: valued at cost because no price was fetched
  holdingsSip: number; sipCount: number;
  trackerSip: number; trackerCount: number;                              // the website's SIP tracker entries
}
export interface SimDraft { corpus: string; sip: string; stepUp: string; years: string; ret: string; infl: string; useTracker: boolean }
export const EMPTY_DRAFT: SimDraft = { corpus: '', sip: '', stepUp: '', years: '', ret: '', infl: '', useTracker: false };

const parse = (raw: string | null | undefined): any[] => asList(raw).filter(x => x && typeof x === 'object' && !Array.isArray(x));

export function summariseSources(holdingsRaw: string | null | undefined, sipRaw: string | null | undefined): SimSources {
  const hs = parse(holdingsRaw).filter(h => finite(h.units) > 0 && finite(h.avgPrice, -1) >= 0)
    .map(h => ({ ...h, units: finite(h.units), avgPrice: finite(h.avgPrice), lastPrice: h.lastPrice == null ? undefined : (finite(h.lastPrice, NaN) >= 0 ? finite(h.lastPrice) : undefined) })) as Holding[];
  let value = 0, unpriced = 0, sip = 0, sipCount = 0;
  hs.forEach(h => {
    const v = toView(h);
    if (Number.isFinite(v.current)) value += v.current;
    if (!v.priced) unpriced++;
    const s = finite(h.sipMonthly);
    if (s > 0) { sip += s; sipCount++; }
  });
  const tr = parse(sipRaw).map(e => finite(e.monthlyAmount ?? e.amount)).filter(x => x > 0);
  return { holdingsCount: hs.length, holdingsValue: Math.round(value), unpriced, holdingsSip: sip, sipCount, trackerSip: tr.reduce((a, b) => a + b, 0), trackerCount: tr.length };
}

export async function loadSimSources(): Promise<{ sources: SimSources; draft: SimDraft | null }> {
  let got: Record<string, string | null> = {};
  try { got = await getMany(['finos_holdings_v1', 'finos_sip_portfolio', DRAFT_KEY]); } catch { /* blank */ }
  let draft: SimDraft | null = null;
  try {
    const d = JSON.parse(got[DRAFT_KEY] ?? 'null');
    if (d && typeof d === 'object') { const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 20) : ''); draft = { corpus: s(d.corpus), sip: s(d.sip), stepUp: s(d.stepUp), years: s(d.years), ret: s(d.ret), infl: s(d.infl), useTracker: d.useTracker === true }; }
  } catch { draft = null; }
  return { sources: summariseSources(got.finos_holdings_v1, got.finos_sip_portfolio), draft };
}

export const saveSimDraft = (d: SimDraft) => AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(d)).catch(() => {});
