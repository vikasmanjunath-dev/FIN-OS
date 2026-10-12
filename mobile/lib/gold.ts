// Gold tracker maths: physical gold, Sovereign Gold Bonds, gold ETFs and gold mutual funds.
// A typed port of the calculation half of js/finos-gold-tracker.js, with one deliberate difference shared with the fixed website:
// grams are valued only with a price the person typed. There is no built-in MCX rate to fall back on, so a missing price leaves
// physical gold and SGBs out of the total instead of valuing them with a made-up number. __tests__/gold.parity.test.mts compares them.

export const GOLD_KEYS = { portfolio: 'finos_gold_portfolio', price: 'finos_gold_price_per_g', value: 'finos_gold_value' } as const;
export const SGB_COUPON_RATE = 0.025;                      // 2.5% a year on the issue price, paid half-yearly

export type GoldType = 'physical' | 'sgb' | 'etf' | 'goldmf';
export interface Holding {
  id: string; type: GoldType; name?: string; series?: string; fundName?: string;
  grams?: number; units?: number; faceValue?: number; nav?: number; currentValue?: number; invested?: number;
  issueDate?: string; purchaseDate?: string;
}

export const calcPhysicalValue = (grams: number, pricePerG: number) => Math.round(grams * pricePerG);
export const calcSGBCurrentValue = (units: number, pricePerG: number) => Math.round(units * pricePerG);
export const calcSGBAnnualCoupon = (units: number, faceValue: number) => Math.round(units * faceValue * SGB_COUPON_RATE);

export interface GoldSummary {
  total: number; physical: number; sgb: number; etf: number; mf: number; grams: number; annualCoupon: number;
  /** True when there is physical gold or an SGB but no price yet, so the total leaves them out. */
  needsPrice: boolean;
}

/** `pricePerG` is the price the person entered (0 or missing = none). */
export function summarize(holdings: Holding[], pricePerG: number): GoldSummary {
  const price = Number.isFinite(pricePerG) && pricePerG > 0 ? pricePerG : 0;
  let physical = 0, sgb = 0, etf = 0, mf = 0, grams = 0, annualCoupon = 0, hasGrams = false;
  holdings.forEach(h => {
    if (h.type === 'physical') { physical += calcPhysicalValue(h.grams || 0, price); grams += h.grams || 0; hasGrams = true; }
    else if (h.type === 'sgb') { sgb += calcSGBCurrentValue(h.units || 0, price); grams += h.units || 0; annualCoupon += calcSGBAnnualCoupon(h.units || 0, h.faceValue || 0); hasGrams = true; }
    else if (h.type === 'etf') etf += Math.round((h.units || 0) * (h.nav || 0));
    else if (h.type === 'goldmf') mf += h.currentValue || 0;
  });
  return { total: physical + sgb + etf + mf, physical, sgb, etf, mf, grams, annualCoupon, needsPrice: hasGrams && price === 0 };
}

export function addYears(iso: string | undefined, years: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export interface HoldingForm {
  type: GoldType; name: string; grams: number; units: number; faceValue: number; nav: number; currentValue: number; invested: number;
  issueDate: string; purchaseDate: string;
}

/** The website's _addHolding checks and shape. */
export function buildHolding(f: HoldingForm, id: string): { ok: true; holding: Holding } | { ok: false; error: string } {
  const h: Holding = { id, type: f.type };
  if (f.type === 'physical') {
    if (!(f.grams > 0)) return { ok: false, error: 'Enter the weight in grams.' };
    Object.assign(h, { name: f.name.trim() || 'Physical gold', grams: f.grams, purchaseDate: f.purchaseDate || '' });
  } else if (f.type === 'sgb') {
    if (!(f.units > 0)) return { ok: false, error: 'Enter the number of units.' };
    if (!(f.faceValue > 0)) return { ok: false, error: 'Enter the issue price per gram.' };
    if (!f.issueDate || !f.purchaseDate) return { ok: false, error: 'Enter both the original issue date and your purchase date.' };
    if (new Date(f.issueDate) > new Date(f.purchaseDate)) return { ok: false, error: 'The purchase date cannot be before the original issue date.' };
    Object.assign(h, { series: f.name.trim() || 'SGB', units: f.units, faceValue: f.faceValue, issueDate: f.issueDate, purchaseDate: f.purchaseDate });
  } else if (f.type === 'etf') {
    if (!(f.units > 0)) return { ok: false, error: 'Enter the number of units.' };
    if (!(f.nav > 0)) return { ok: false, error: 'Enter the current NAV.' };
    Object.assign(h, { name: f.name.trim() || 'Gold ETF', units: f.units, nav: f.nav, purchaseDate: f.purchaseDate || '' });
  } else {
    if (!(f.currentValue > 0)) return { ok: false, error: 'Enter the current value.' };
    Object.assign(h, { fundName: f.name.trim() || 'Gold MF', currentValue: f.currentValue, invested: f.invested || 0 });
  }
  return { ok: true, holding: h };
}
