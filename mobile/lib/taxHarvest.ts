// Tax-loss and gain harvesting for listed equity / equity funds (FY 2025-26 rates).
// Port of the arithmetic in js/finos-tax-harvest.js (_analysePositions); __tests__/taxHarvest.parity.test.mts runs the
// website's file against this one. Same localStorage keys, so the website and phone share the data.
//
// What it does NOT do: it does not know the buyer's slab, surcharge (capped at 15% on these gains) or carried-forward
// losses, and debt funds / gold / property are out of scope. The figures are estimates for planning.

export const LTCG_EXEMPT = 125000;
export const LTCG_RATE = 0.125;
export const STCG_RATE = 0.2;
export const CESS = 0.04;
export const POSITIONS_KEY = 'finos_harvest_positions';

export type Position = { id: string; name: string; type: string; qty: number; buyPrice: number; cmp: number; purchaseDate?: string; holdMonths?: number };
export type Enriched = Position & {
  costBasis: number; currentVal: number; gain: number; isLong: boolean; gainType: 'ltcg' | 'stcg'; isLoss: boolean; absoluteGain: number; gainPct: string;
};
export type Candidate = Enriched & { canHarvest: number; harvestQty: number };
export type Analysis = {
  enriched: Enriched[]; losses: Enriched[]; gains: Enriched[]; gainHarvestCandidates: Candidate[];
  totalLTCGLoss: number; totalSTCGLoss: number; netLTCG: number; netSTCG: number; usedLTCG: number; headroom: number;
  taxSaved: number; gainHarvestAmount: number; ltcgTaxBefore: number; ltcgTaxAfter: number; stcgTaxBefore: number; stcgTaxAfter: number;
};

const pos = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };

/** Tax year starts in April: 2026-27 is "2026_27". */
export function taxYearStart(now: Date = new Date()): number { return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; }
export function taxYearSuffix(now: Date = new Date()): string { const y = taxYearStart(now); return `${y}_${String(y + 1).slice(-2)}`; }
export const bookedKeys = (now: Date = new Date()) => ({ ltcg: `finos_th_ltcg_${taxYearSuffix(now)}`, stcg: `finos_th_stcg_${taxYearSuffix(now)}` });

/** Keeps only holdings with a name and positive quantity, buy price and current price (the website's filter). */
export function normalisePositions(raw: unknown): Position[] {
  if (!Array.isArray(raw)) return [];
  const out: Position[] = [];
  raw.forEach((p: any, i) => {
    if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) return;
    const qty = pos(p.qty), buyPrice = pos(p.buyPrice), cmp = pos(p.cmp);
    if (!qty || !buyPrice || !cmp) return;
    const o: Position = { id: String(p.id ?? `h_${i}`), name: p.name, type: typeof p.type === 'string' ? p.type : 'equity', qty, buyPrice, cmp };
    if (typeof p.purchaseDate === 'string') o.purchaseDate = p.purchaseDate;
    if (p.holdMonths !== undefined) o.holdMonths = Number(p.holdMonths) || 0;
    out.push(o);
  });
  return out;
}

/** Whole months between the acquisition date and today (a month counts once its day-of-month has come round). */
export function monthsHeld(p: Pick<Position, 'purchaseDate' | 'holdMonths'>, now: Date = new Date()): number {
  if (!p.purchaseDate) return Number(p.holdMonths) || 0;
  const [y, m, d] = p.purchaseDate.split('-').map(Number);
  let elapsed = (now.getFullYear() - y) * 12 + now.getMonth() - (m - 1);
  if (now.getDate() < d) elapsed--;
  return Math.max(0, elapsed);
}

/** Tax on a gain for the year. LTCG is exempt up to ₹1.25 L; cess is added to both. */
export function taxOnGain(kind: 'ltcg' | 'stcg', gain: number): number {
  if (kind === 'ltcg') return Math.round(Math.max(0, gain - LTCG_EXEMPT) * LTCG_RATE * (1 + CESS));
  return Math.round(Math.max(0, gain) * STCG_RATE * (1 + CESS));
}

export function analyse(positions: Position[], bookedLTCG: number, bookedSTCG: number, now: Date = new Date()): Analysis {
  const enriched: Enriched[] = positions.map(p => {
    const costBasis = p.buyPrice * p.qty;
    const currentVal = p.cmp * p.qty;
    const gain = currentVal - costBasis;
    const months = monthsHeld(p, now);
    const isLong = months >= 12;
    return {
      ...p, holdMonths: months, costBasis, currentVal, gain, isLong, gainType: isLong ? 'ltcg' : 'stcg', isLoss: gain < 0, absoluteGain: Math.abs(gain),
      gainPct: costBasis > 0 ? ((gain / costBasis) * 100).toFixed(1) : '0.0',
    };
  });
  const losses = enriched.filter(p => p.isLoss);
  const gains = enriched.filter(p => !p.isLoss);
  const totalLTCGLoss = losses.filter(p => p.isLong).reduce((s, p) => s + p.absoluteGain, 0);
  const totalSTCGLoss = losses.filter(p => !p.isLong).reduce((s, p) => s + p.absoluteGain, 0);

  const usedLTCG = bookedLTCG || 0;
  const usedSTCG = bookedSTCG || 0;
  const headroom = Math.max(0, LTCG_EXEMPT - usedLTCG);

  let budget = headroom;
  const gainHarvestCandidates: Candidate[] = gains
    .filter(p => p.isLong && p.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .map(p => {
      const canHarvest = Math.min(p.gain, budget);
      budget = Math.max(0, budget - canHarvest);
      const harvestQty = canHarvest > 0 ? Math.floor(canHarvest / (p.cmp - p.buyPrice)) : 0;
      return { ...p, canHarvest, harvestQty };
    })
    .filter(p => p.canHarvest > 0);

  // Short-term losses offset short-term gains first, then long-term gains; long-term losses offset only long-term gains.
  const netSTCG = Math.max(0, usedSTCG - totalSTCGLoss);
  const stclLeft = Math.max(0, totalSTCGLoss - Math.max(0, usedSTCG));
  const netLTCG = Math.max(0, usedLTCG - totalLTCGLoss - stclLeft);

  const ltcgTaxBefore = taxOnGain('ltcg', usedLTCG), ltcgTaxAfter = taxOnGain('ltcg', netLTCG);
  const stcgTaxBefore = taxOnGain('stcg', usedSTCG), stcgTaxAfter = taxOnGain('stcg', netSTCG);
  return {
    enriched, losses, gains, gainHarvestCandidates, totalLTCGLoss, totalSTCGLoss, netLTCG, netSTCG, usedLTCG, headroom,
    taxSaved: (ltcgTaxBefore - ltcgTaxAfter) + (stcgTaxBefore - stcgTaxAfter),
    gainHarvestAmount: gainHarvestCandidates.reduce((s, p) => s + p.canHarvest, 0),
    ltcgTaxBefore, ltcgTaxAfter, stcgTaxBefore, stcgTaxAfter,
  };
}

/** What booking a loss is worth at most (the saving only appears on gains above the exemption). */
export const lossWorth = (p: Pick<Enriched, 'isLong' | 'absoluteGain'>) => Math.round(p.absoluteGain * (p.isLong ? LTCG_RATE : STCG_RATE) * (1 + CESS));

/** Validates the add-holding form; returns an error message or the clean position. */
export function parseNewPosition(f: { name: string; qty: string; buy: string; cmp: string; date: string }, now: Date = new Date()): { error: string } | { position: Position } {
  const name = f.name.trim();
  const qty = Number(f.qty), buyPrice = Number(f.buy), cmp = Number(f.cmp);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.date.trim());
  const when = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  const dateOk = !!when && when.getFullYear() === Number(m![1]) && when.getMonth() === Number(m![2]) - 1 && when.getDate() === Number(m![3]) && when <= now;
  if (!name || !(qty > 0) || !(buyPrice > 0) || !(cmp > 0) || !dateOk) {
    return { error: 'Enter a holding name, a positive quantity and prices, and the acquisition date as YYYY-MM-DD (not in the future).' };
  }
  return { position: { id: `h_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`, name, type: 'equity', qty, buyPrice, cmp, purchaseDate: f.date.trim() } };
}
