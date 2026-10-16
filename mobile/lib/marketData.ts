// Market data from the Arya backend: pure normalisers, helpers and the screener rules. No React, no storage, no network:
// "now" and the raw JSON are parameters, so every function here is testable with a fixture.
//
// The rule for every figure on a market screen: a number the backend did not send is `null` (shown as "Not available"),
// never 0 and never a default. An error shape ({"error": ...}) is not data. A list that comes back empty stays empty.

// ── small helpers ────────────────────────────────────────────────────────────

/** A finite number, or null. Numeric strings are accepted ("19.41"); NaN, Infinity, "", booleans and objects are not. */
export function num(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;       // booleans, null, arrays ([] would be 0) and objects are not figures
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
export const pos = (v: unknown): number | null => { const n = num(v); return n !== null && n > 0 ? n : null; };
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Feeds send "&amp;" and friends inside titles. Decodes the handful that appear; leaves anything else alone. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => { const c = Number(d); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : _; })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : _; })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[n]);
}

/** NSE ticker as the backend wants it: upper case letters, digits, & and -, up to 20. Null if it is not one. */
export function cleanTicker(raw: string): string | null {
  const s = (raw ?? '').trim().toUpperCase().replace(/^NSE:/, '').replace(/\.NS$/, '');
  return /^[A-Z0-9&-]{1,20}$/.test(s) ? s : null;
}
export const yahooSymbol = (ticker: string) => `${ticker}.NS`;

/** A mutual fund scheme code: digits only. */
export const cleanSchemeCode = (raw: string): string | null => (/^\d{3,8}$/.test((raw ?? '').trim()) ? raw.trim() : null);

/** Only web links open in the in-app browser (a feed is untrusted data). */
export function safeWebUrl(raw: unknown): string | null {
  const s = str(raw);
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return null;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}

// ── quotes ───────────────────────────────────────────────────────────────────

export interface Quote {
  symbol: string; name: string; exchange: string; price: number;
  change: number | null; changePct: number | null;
  open: number | null; high: number | null; low: number | null; prevClose: number | null;
  volume: number | null; marketCap: number | null;
  week52High: number | null; week52Low: number | null;
  /** Only set when the backend sends one under this name; the quote endpoint does not carry P/E (see Fundamentals). */
  peRatio: number | null; priceToBook: number | null;
  source: string;
}

/** One quote object -> Quote, or null for an error shape / a quote without a usable price. */
export function normaliseQuote(raw: unknown): Quote | null {
  if (!isObj(raw) || raw.error) return null;
  const price = pos(raw.price);
  const symbol = str(raw.symbol).toUpperCase();
  if (price === null || !symbol) return null;
  return {
    symbol, name: str(raw.name) || symbol, exchange: str(raw.exchange) || 'NSE', price,
    change: num(raw.change), changePct: num(raw.change_pct),
    open: pos(raw.open), high: pos(raw.high), low: pos(raw.low), prevClose: pos(raw.prev_close),
    volume: pos(raw.volume), marketCap: pos(raw.market_cap),
    week52High: pos(raw.week52_high), week52Low: pos(raw.week52_low),
    peRatio: pos(raw.pe_ratio), priceToBook: pos(raw.price_to_book),
    source: str(raw.source),
  };
}

/** The bulk /api/quotes answer: the quotes that came back, and the symbols that did not. */
export function normaliseQuotes(raw: unknown, asked: string[] = []): { quotes: Quote[]; failed: string[]; truncated: boolean } {
  const list = isObj(raw) && Array.isArray(raw.quotes) ? raw.quotes : [];
  const quotes: Quote[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const q = normaliseQuote(r);
    if (q && !seen.has(q.symbol)) { quotes.push(q); seen.add(q.symbol); }
  }
  const failed = asked.map(s => s.toUpperCase()).filter(s => !seen.has(s));
  return { quotes, failed, truncated: isObj(raw) && raw.truncated === true };
}

export interface Fundamentals {
  symbol: string; name: string | null; sector: string | null; industry: string | null;
  peRatio: number | null; peNote: string | null; peCrossChecked: boolean | null;
  priceToBook: number | null; epsTtm: number | null; marketCap: number | null; source: string;
}
export function normaliseFundamentals(raw: unknown): Fundamentals | null {
  if (!isObj(raw) || raw.error) return null;
  const symbol = str(raw.symbol).toUpperCase();
  if (!symbol) return null;
  const eps = num(raw.eps_ttm);
  return {
    symbol, name: str(raw.name) || null, sector: str(raw.sector) || null, industry: str(raw.industry) || null,
    peRatio: pos(raw.pe_ratio), peNote: str(raw.pe_note) || null, peCrossChecked: typeof raw.pe_cross_checked === 'boolean' ? raw.pe_cross_checked : null,
    priceToBook: pos(raw.price_to_book), epsTtm: eps, marketCap: pos(raw.market_cap), source: str(raw.source),
  };
}

// ── indices ──────────────────────────────────────────────────────────────────

export interface IndexRow {
  name: string; price: number; change: number | null; changePct: number | null;
  high: number | null; low: number | null; yearHigh: number | null; yearLow: number | null;
  pe: number | null; pb: number | null; dividendYield: number | null; source: string;
}
/** /api/market/overview -> rows by index name. An index without a price is left out. */
export function normaliseOverview(raw: unknown): { indices: Record<string, IndexRow>; asOf: number | null } {
  const out: Record<string, IndexRow> = {};
  const src = isObj(raw) && isObj(raw.indices) ? raw.indices : {};
  for (const [name, v] of Object.entries<any>(src)) {
    if (!isObj(v)) continue;
    const price = pos(v.price);
    if (price === null) continue;
    out[name] = {
      name, price, change: num(v.change), changePct: num(v.change_pct),
      high: pos(v.high), low: pos(v.low), yearHigh: pos(v.year_high), yearLow: pos(v.year_low),
      pe: pos(v.pe), pb: pos(v.pb), dividendYield: pos(v.dividend_yield), source: str(v.source),
    };
  }
  return { indices: out, asOf: isObj(raw) ? num(raw.as_of) : null };
}

// ── news ─────────────────────────────────────────────────────────────────────

export type Sentiment = 'bullish' | 'bearish' | 'neutral';
export interface NewsArticle {
  id: string; title: string; summary: string; url: string | null; source: string;
  sentiment: Sentiment | null; score: number | null; tags: string[]; publishedMs: number | null;
}
export interface NewsFeed {
  articles: NewsArticle[];
  overall: { label: Sentiment; score: number; bullish: number; bearish: number; neutral: number; total: number } | null;
  method: string | null;
  sources: { ok: number; failed: number; total: number } | null;
  asOf: number | null;
}

const SENTIMENTS: Sentiment[] = ['bullish', 'bearish', 'neutral'];

export function normaliseNews(raw: unknown): NewsFeed {
  const empty: NewsFeed = { articles: [], overall: null, method: null, sources: null, asOf: null };
  if (!isObj(raw) || raw.error) return empty;
  const articles: NewsArticle[] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(raw.articles) ? raw.articles : []) {
    if (!isObj(a)) continue;
    const title = decodeEntities(str(a.title));
    if (!title) continue;
    const url = safeWebUrl(a.url);
    const id = str(a.id) || url || title;
    if (seen.has(id)) continue;
    seen.add(id);
    const s = str(a.sentiment).toLowerCase() as Sentiment;
    const ts = num(a.published_ts);
    articles.push({
      id, title, summary: decodeEntities(str(a.summary)), url, source: str(a.source) || 'Unknown source',
      sentiment: SENTIMENTS.includes(s) ? s : null, score: num(a.sentiment_score),
      tags: Array.isArray(a.tags) ? a.tags.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim().toUpperCase()).slice(0, 8) : [],
      publishedMs: ts !== null && ts > 0 ? ts * 1000 : null,
    });
  }
  // newest first; an article with no readable time goes last
  articles.sort((x, y) => (y.publishedMs ?? 0) - (x.publishedMs ?? 0));
  const o = isObj(raw.sentiment) ? raw.sentiment : null;
  const label = o ? (str(o.label) as Sentiment) : null;
  const src = isObj(raw.sources) ? raw.sources : null;
  const total = src ? num(src.feeds_total) : null;
  return {
    articles,
    overall: o && label && SENTIMENTS.includes(label) && num(o.score) !== null
      ? { label, score: num(o.score)!, bullish: num(o.bullish) ?? 0, bearish: num(o.bearish) ?? 0, neutral: num(o.neutral) ?? 0, total: num(o.total) ?? articles.length }
      : null,
    method: str(raw.sentiment_method) || null,
    sources: src && total !== null && total > 0 ? { ok: num(src.feeds_ok) ?? 0, failed: num(src.feeds_failed) ?? 0, total } : null,
    asOf: num(raw.as_of),
  };
}

/** Distinct tags across the articles, most frequent first (for the filter chips). */
export function tagCounts(articles: NewsArticle[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of articles) for (const t of a.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
export const filterNews = (articles: NewsArticle[], tag: string | null) => (tag ? articles.filter(a => a.tags.includes(tag)) : articles);

// ── commodities, FX, crypto ───────────────────────────────────────────────────

export interface Commodity {
  key: string; label: string; price: number; unit: string; changePct: number | null;
  note: string | null; priceUsd: number | null; usdUnit: string | null; usdInr: number | null; priceDate: string | null;
  /** True when the rupee figure is a global price converted at the USD/INR rate (gold, silver): not an Indian market quote. */
  converted: boolean;
}
export interface CommodityUnavailable { key: string; label: string; reason: string; priceUsd: number | null; usdUnit: string | null; changePct: number | null; priceDate: string | null }

const tidyLabel = (k: string) => k.replace(/\s*\(([^)]*)\)\s*$/, '').replace(/\s+/g, ' ').trim()
  .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export function normaliseCommodities(raw: unknown): { items: Commodity[]; unavailable: CommodityUnavailable[]; asOf: number | null } {
  const out = { items: [] as Commodity[], unavailable: [] as CommodityUnavailable[], asOf: null as number | null };
  if (!isObj(raw) || raw.error) return out;
  out.asOf = num(raw.as_of);
  for (const [key, v] of Object.entries<any>(isObj(raw.commodities) ? raw.commodities : {})) {
    const price = pos(v?.price);
    if (!isObj(v) || price === null) continue;
    out.items.push({
      key, label: tidyLabel(key), price, unit: str(v.unit), changePct: num(v.change_pct), note: str(v.note) || null,
      priceUsd: pos(v.price_usd), usdUnit: str(v.usd_unit) || null, usdInr: pos(v.usd_inr), priceDate: str(v.price_date) || null,
      converted: !!str(v.note) && /converted/i.test(str(v.note)),
    });
  }
  for (const [key, v] of Object.entries<any>(isObj(raw.unavailable) ? raw.unavailable : {})) {
    if (!isObj(v)) continue;
    out.unavailable.push({
      key, label: tidyLabel(key), reason: str(v.reason) || 'Not available right now', priceUsd: pos(v.price_usd),
      usdUnit: str(v.usd_unit) || null, changePct: num(v.change_pct), priceDate: str(v.price_date) || null,
    });
  }
  return out;
}

export interface FxRate { pair: string; base: string; quote: string; rate: number }
const FX_ORDER = ['USD', 'EUR', 'GBP', 'AED', 'JPY'];
export function normaliseFx(raw: unknown): { rates: FxRate[]; error: string | null } {
  if (!isObj(raw)) return { rates: [], error: 'No exchange-rate data.' };
  const rates: FxRate[] = [];
  for (const [pair, v] of Object.entries(raw)) {
    const m = /^([A-Z]{3})_([A-Z]{3})$/.exec(pair);
    const rate = pos(v);
    if (!m || rate === null) continue;
    rates.push({ pair, base: m[1], quote: m[2], rate });
  }
  rates.sort((a, b) => FX_ORDER.indexOf(a.base) - FX_ORDER.indexOf(b.base));
  return { rates, error: rates.length ? null : str(raw.error) || 'No exchange-rate data.' };
}

export interface Coin { id: string; name: string; priceInr: number | null; priceUsd: number | null; change24h: number | null; marketCapInr: number | null; updatedMs: number | null }
export function normaliseCrypto(raw: unknown): { coins: Coin[]; error: string | null; asOf: number | null } {
  if (!isObj(raw)) return { coins: [], error: 'No crypto data.', asOf: null };
  const coins: Coin[] = [];
  for (const [id, v] of Object.entries<any>(isObj(raw.crypto) ? raw.crypto : {})) {
    if (!isObj(v)) continue;
    const priceInr = pos(v.price_inr), priceUsd = pos(v.price_usd);
    if (priceInr === null && priceUsd === null) continue;
    const upd = pos(v.last_updated);
    coins.push({ id, name: str(v.name) || id, priceInr, priceUsd, change24h: num(v.change_24h), marketCapInr: pos(v.market_cap_inr), updatedMs: upd !== null ? upd * 1000 : null });
  }
  return { coins, error: coins.length ? null : str(raw.error) || 'No crypto data.', asOf: num(raw.as_of) };
}

// ── charts ───────────────────────────────────────────────────────────────────

export interface Chart { closes: number[]; highs: number[]; lows: number[]; volumes: number[]; dates: string[]; currentPrice: number | null }
/** /api/chart arrays -> aligned series. A row whose close is unusable is dropped from every array together. */
export function normaliseChart(raw: unknown): Chart | null {
  if (!isObj(raw) || raw.error || !Array.isArray(raw.closes)) return null;
  const closes = raw.closes as unknown[];
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : []);
  const highs = arr('highs'), lows = arr('lows'), vols = arr('volumes'), dates = arr('dates');
  const out: Chart = { closes: [], highs: [], lows: [], volumes: [], dates: [], currentPrice: pos(raw.currentPrice) };
  for (let i = 0; i < closes.length; i++) {
    const c = pos(closes[i]);
    if (c === null) continue;
    out.closes.push(c);
    out.highs.push(pos(highs[i]) ?? c);          // a missing high / low falls back to the close of that day
    out.lows.push(pos(lows[i]) ?? c);
    out.volumes.push(Math.max(0, num(vols[i]) ?? 0));
    out.dates.push(typeof dates[i] === 'string' ? (dates[i] as string).slice(0, 10) : '');
  }
  return out.closes.length >= 2 ? out : null;
}

export interface ChartStats { first: number; last: number; changePct: number; min: number; max: number; startDate: string; endDate: string }
export function chartStats(c: Chart): ChartStats | null {
  const n = c.closes.length;
  if (n < 2) return null;
  const first = c.closes[0], last = c.closes[n - 1];
  return {
    first, last, changePct: ((last - first) / first) * 100,
    min: Math.min(...c.lows), max: Math.max(...c.highs), startDate: c.dates[0] ?? '', endDate: c.dates[n - 1] ?? '',
  };
}

export const CHART_RANGES = [
  { id: '1M', range: '1mo', label: '1M' },
  { id: '3M', range: '3mo', label: '3M' },
  { id: '6M', range: '6mo', label: '6M' },
  { id: '1Y', range: '1y', label: '1Y' },
] as const;
export type ChartRangeId = (typeof CHART_RANGES)[number]['id'];

// ── price position ───────────────────────────────────────────────────────────

/** Where the price sits between a low and a high, 0..1; null when either end is missing or they are not a range. */
export function rangePosition(low: number | null, high: number | null, price: number | null): number | null {
  if (low === null || high === null || price === null || high <= low) return null;
  return Math.max(0, Math.min(1, (price - low) / (high - low)));
}
/** % the price is below (negative) or above (positive) a reference level. */
export function pctFrom(price: number | null, ref: number | null): number | null {
  if (price === null || ref === null || ref <= 0) return null;
  return ((price - ref) / ref) * 100;
}

// ── freshness ────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. Never negative (a clock a little ahead reads "just now"). */
export function relativeTime(thenMs: number | null, nowMs: number): string {
  if (thenMs === null || !Number.isFinite(thenMs)) return 'time not given';
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  const d = new Date(thenMs);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "3:42 pm" today, otherwise "13 Oct, 3:42 pm" (device local time). */
export function formatAsOf(ms: number, nowMs: number): string {
  const d = new Date(ms), n = new Date(nowMs);
  const h12 = d.getHours() % 12 || 12;
  const t = `${h12}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'am' : 'pm'}`;
  const same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return same ? t : `${d.getDate()} ${MONTHS[d.getMonth()]}, ${t}`;
}

export interface Staleness { ageMs: number; stale: boolean; label: string }
/** How old a saved answer is. `freshMs` is how long it counts as current for that kind of data. */
export function staleness(savedAt: number | null, nowMs: number, freshMs: number): Staleness | null {
  if (savedAt === null || !Number.isFinite(savedAt)) return null;
  const ageMs = Math.max(0, nowMs - savedAt);
  return { ageMs, stale: ageMs > freshMs, label: `as of ${formatAsOf(savedAt, nowMs)}` };
}

/** How long each kind of answer counts as current. News moves slower than a quote; a fund NAV is once a day. */
export const FRESH_MS = { quote: 2 * 60_000, quotes: 2 * 60_000, news: 15 * 60_000, commodities: 10 * 60_000, fx: 10 * 60_000, crypto: 3 * 60_000, chart: 15 * 60_000, fund: 12 * 3600_000, fundHistory: 12 * 3600_000, fundamentals: 6 * 3600_000, overview: 2 * 60_000 } as const;

// ── numbers for display ───────────────────────────────────────────────────────

export const fmtPrice = (n: number | null) => (n === null ? 'Not available' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fmtInr = (n: number | null) => (n === null ? 'Not available' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: n >= 100 ? 0 : 2 }));
export function fmtPct(n: number | null, digits = 2): string {
  if (n === null) return 'Not available';
  const s = Math.abs(n).toFixed(digits);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}%`;
}
/** 1,23,45,678 -> "1.23 Cr", 4,56,789 -> "4.57 L", 98,765 -> "98,765". Share counts. */
export function fmtVolume(n: number | null): string {
  if (n === null) return 'Not available';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return Math.round(n).toLocaleString('en-IN');
}
/** Market cap in rupees -> "₹15.89 lakh Cr", "₹43,802 Cr". */
export function fmtMarketCap(n: number | null): string {
  if (n === null) return 'Not available';
  if (n >= 1e12) return `₹${(n / 1e12).toFixed(2)} lakh Cr`;
  if (n >= 1e7) return `₹${Math.round(n / 1e7).toLocaleString('en-IN')} Cr`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// ── mutual funds ─────────────────────────────────────────────────────────────

export interface FundNav { code: string; name: string; fundHouse: string; category: string; plan: string; option: string; nav: number | null; date: string | null }
const AMFI_DATE = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
/** '13-Oct-2026' or '2026-10-13' or '13-10-2026' -> '2026-10-13', else null. */
export function isoDate(raw: unknown): string | null {
  const s = str(raw);
  let y: number, m: number, d: number;
  let mt: RegExpExecArray | null;
  if ((mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = AMFI_DATE.exec(s))) { const mi = MONTHS.findIndex(x => x.toLowerCase() === mt![2].toLowerCase()); if (mi < 0) return null; y = +mt[3]; m = mi + 1; d = +mt[1]; }
  else if ((mt = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s))) { y = +mt[3]; m = +mt[2]; d = +mt[1]; }
  else return null;
  const t = Date.UTC(y, m - 1, d);
  const chk = new Date(t);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== m - 1 || chk.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function normaliseFundNav(raw: unknown): FundNav | null {
  if (!isObj(raw) || raw.error) return null;
  const code = str(raw.scheme_code);
  const name = str(raw.scheme_name);
  if (!code || !name) return null;
  return {
    code, name, fundHouse: str(raw.fund_house), category: str(raw.category), plan: str(raw.plan), option: str(raw.option),
    nav: pos(raw.nav), date: isoDate(raw.date),
  };
}
export function normaliseFundSearch(raw: unknown): FundNav[] {
  const list = isObj(raw) && Array.isArray(raw.results) ? raw.results : [];
  const out: FundNav[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const f = normaliseFundNav(r);
    if (f && !seen.has(f.code)) { seen.add(f.code); out.push(f); }
  }
  return out;
}

export interface FundHistory {
  code: string; name: string; fundHouse: string; category: string;
  points: { date: string; nav: number }[];       // oldest first
  earliestAvailable: string | null; source: string;
  amfiCheck: { checked: boolean; matches: boolean | null };
}
export function normaliseFundHistory(raw: unknown): FundHistory | null {
  if (!isObj(raw) || raw.error || !Array.isArray(raw.history)) return null;
  const byDate = new Map<string, number>();
  for (const p of raw.history) {
    if (!Array.isArray(p)) continue;
    const d = isoDate(p[0]), n = pos(p[1]);
    if (d && n !== null) byDate.set(d, n);
  }
  if (byDate.size < 2) return null;
  const points = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, nav]) => ({ date, nav }));
  const chk = isObj(raw.amfi_check) ? raw.amfi_check : {};
  return {
    code: str(raw.scheme_code), name: str(raw.scheme_name), fundHouse: str(raw.fund_house), category: str(raw.scheme_category),
    points, earliestAvailable: isoDate(raw.earliest_available), source: str(raw.source),
    amfiCheck: { checked: chk.checked === true, matches: typeof chk.matches === 'boolean' ? chk.matches : null },
  };
}

export interface FundReturn {
  id: '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y'; label: string;
  /** null when the history does not reach back far enough (young fund, or the history was cut) */
  pct: number | null; annualised: boolean;
  from: { date: string; nav: number } | null; to: { date: string; nav: number };
  reason: string | null;
}
const PERIODS: { id: FundReturn['id']; months: number }[] = [
  { id: '1M', months: 1 }, { id: '3M', months: 3 }, { id: '6M', months: 6 }, { id: '1Y', months: 12 }, { id: '3Y', months: 36 }, { id: '5Y', months: 60 },
];
const MAX_GAP_DAYS = 7;       // the NAV used for the start must be within a week of the target date (holidays), else not computed

function minusMonths(isoDay: string, months: number): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Point-to-point NAV returns from a NAV history: the latest NAV against the NAV a calendar month / year earlier.
 * Up to a year it is the plain change; for 3 and 5 years it is the annualised (CAGR) figure. Not an official factsheet number,
 * and not adjusted for IDCW payouts or exit load, so for IDCW options it understates what an investor received.
 * Missing history gives pct: null with the reason, never a guess.
 */
export function fundReturns(points: { date: string; nav: number }[]): FundReturn[] {
  if (points.length < 2) return [];
  const to = points[points.length - 1];
  return PERIODS.map(({ id, months }) => {
    const target = minusMonths(to.date, months);
    let start: { date: string; nav: number } | null = null;
    for (let i = points.length - 1; i >= 0; i--) if (points[i].date <= target) { start = points[i]; break; }
    const base: FundReturn = { id, label: id, pct: null, annualised: months > 12, from: null, to, reason: null };
    if (!start) return { ...base, reason: 'The fund is newer than this, or the history here does not go back this far' };
    if (dayDiff(start.date, target) > MAX_GAP_DAYS) return { ...base, reason: 'No NAV near the start date' };
    const days = dayDiff(start.date, to.date);
    if (days <= 0) return { ...base, reason: 'Not enough history' };
    const growth = to.nav / start.nav;
    const pct = months > 12 ? (Math.pow(growth, 365 / days) - 1) * 100 : (growth - 1) * 100;
    return { ...base, pct, from: start };
  });
}

/** Is this scheme's option a payout (IDCW / dividend) one? NAV falls when it pays out, so NAV-to-NAV returns understate. */
export const isPayoutOption = (f: { name: string; option: string }) => /idcw|dividend|payout/i.test(`${f.name} ${f.option}`) && !/growth/i.test(f.option || f.name);

// ── screener ─────────────────────────────────────────────────────────────────

/** A starting list of 50 large NSE companies, based on Nifty 50 membership in late 2025. Index membership is reviewed twice a year
 *  and some companies have since been renamed or demerged (Tata Motors became TMPV / TMCV), so this is a list of tickers that
 *  could be quoted when it was last checked, not NSE's current constituent list. */
export const LARGE_CAP_LIST: string[] = [
  'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BHARTIARTL',
  'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HINDALCO',
  'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M',
  'MARUTI', 'MAXHEALTH', 'NESTLEIND', 'NTPC', 'ONGC', 'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN', 'SHRIRAMFIN',
  'SUNPHARMA', 'TATACONSUM', 'TMPV', 'TATASTEEL', 'TCS', 'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO',
];

export interface ScreenRow {
  symbol: string; price: number; dayChangePct: number | null; volume: number | null;
  week52High: number | null; week52Low: number | null;
  fromHighPct: number | null;      // <= 0: how far below the 52-week high
  fromLowPct: number | null;       // >= 0: how far above the 52-week low
  rangePos: number | null;         // 0 = at the 52-week low, 1 = at the high
}
export function screenRows(quotes: Quote[]): ScreenRow[] {
  return quotes.map(q => {
    // the day change as the backend states it; derive it from the previous close only if it did not send one
    const day = q.changePct ?? (q.prevClose !== null ? pctFrom(q.price, q.prevClose) : null);
    return {
      symbol: q.symbol, price: q.price, dayChangePct: day, volume: q.volume, week52High: q.week52High, week52Low: q.week52Low,
      fromHighPct: pctFrom(q.price, q.week52High), fromLowPct: pctFrom(q.price, q.week52Low), rangePos: rangePosition(q.week52Low, q.week52High, q.price),
    };
  });
}

export type ScreenFilter = 'all' | 'gainers' | 'losers' | 'nearHigh' | 'nearLow';
export type ScreenSort = 'symbol' | 'change' | 'fromHigh' | 'fromLow' | 'price' | 'volume';
export const NEAR_HIGH_PCT = 5;      // within 5% of the 52-week high
export const NEAR_LOW_PCT = 10;      // within 10% of the 52-week low

export interface ScreenOptions { query?: string; filter?: ScreenFilter; sort?: ScreenSort; desc?: boolean }

export function applyScreen(rows: ScreenRow[], o: ScreenOptions = {}): ScreenRow[] {
  const q = (o.query ?? '').trim().toUpperCase();
  let out = rows.filter(r => !q || r.symbol.includes(q));
  switch (o.filter ?? 'all') {
    case 'gainers': out = out.filter(r => r.dayChangePct !== null && r.dayChangePct > 0); break;
    case 'losers': out = out.filter(r => r.dayChangePct !== null && r.dayChangePct < 0); break;
    case 'nearHigh': out = out.filter(r => r.fromHighPct !== null && r.fromHighPct >= -NEAR_HIGH_PCT); break;
    case 'nearLow': out = out.filter(r => r.fromLowPct !== null && r.fromLowPct <= NEAR_LOW_PCT); break;
  }
  const key = (r: ScreenRow): number | string | null => {
    switch (o.sort ?? 'symbol') {
      case 'change': return r.dayChangePct;
      case 'fromHigh': return r.fromHighPct;
      case 'fromLow': return r.fromLowPct;
      case 'price': return r.price;
      case 'volume': return r.volume;
      default: return r.symbol;
    }
  };
  const dir = o.desc ? -1 : 1;
  // rows with no value for the sort field always go last, in either direction
  return [...out].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x === null && y === null) return a.symbol.localeCompare(b.symbol);
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'string' || typeof y === 'string') return dir * String(x).localeCompare(String(y));
    return x === y ? a.symbol.localeCompare(b.symbol) : dir * (x - y);
  });
}

/** Summary line for the screener header: how many rose / fell on the day among the rows. */
export function breadth(rows: ScreenRow[]): { up: number; down: number; flat: number; unknown: number } {
  let up = 0, down = 0, flat = 0, unknown = 0;
  for (const r of rows) {
    if (r.dayChangePct === null) unknown++;
    else if (r.dayChangePct > 0) up++;
    else if (r.dayChangePct < 0) down++;
    else flat++;
  }
  return { up, down, flat, unknown };
}

/** Splits symbols into batches (a long list is fetched a batch at a time so one slow symbol does not hold up the rest). */
export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
