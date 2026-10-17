// Which market headlines mention the person's holdings, and how the feed's own keyword rules classed them.
// The sentiment is NOT computed here: it is whatever /api/news says for each article (whole-word keyword rules on the headline and
// summary, see the feed's `sentiment_method`), and this module only counts those labels. A headline is matched to a holding when the
// company's name (or its ticker, written in capitals) appears in the headline or summary. That is a text match, so it can miss a
// story that uses another name and can match an unrelated one: the screen lists the headlines so the person can judge.
import type { NewsArticle, Sentiment } from '@/lib/marketData';

export interface NewsHolding { key: string; symbol: string; name: string }

// words too common to identify a company on their own
const GENERIC = new Set(['india', 'indian', 'bank', 'finance', 'financial', 'industries', 'industry', 'limited', 'ltd', 'corporation', 'corp', 'company', 'co', 'power', 'steel',
  'motors', 'energy', 'global', 'tata', 'bajaj', 'hdfc', 'icici', 'adani', 'bharat', 'state', 'national', 'services', 'technologies', 'technology', 'enterprises', 'holdings', 'group',
  'international', 'infra', 'infrastructure', 'life', 'general', 'insurance', 'capital', 'pharma', 'foods', 'chemicals', 'cement', 'auto', 'fund', 'nifty', 'sensex', 'market']);
const SUFFIX = /\b(ltd|limited|inc|corp|corporation|plc|pvt|private|co|company)\b\.?/gi;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The phrases that identify a holding in text: its cleaned name (two or more words, or one distinctive word of 5+ letters). */
export function namePhrases(name: string): string[] {
  const cleaned = (name ?? '').replace(SUFFIX, ' ').replace(/[^A-Za-z0-9&\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const words = cleaned.split(' ');
  if (words.length >= 2) return [cleaned.toLowerCase()];
  const w = words[0].toLowerCase();
  return w.length >= 5 && !GENERIC.has(w) ? [w] : [];
}

/** True when the holding's name appears (case-insensitive, whole words) or its ticker appears in capitals (3+ characters), in the text. */
export function mentions(text: string, h: NewsHolding): boolean {
  if (!text) return false;
  for (const p of namePhrases(h.name)) if (new RegExp(`(^|[^A-Za-z0-9])${esc(p).replace(/\s+/g, '\\s+')}($|[^A-Za-z0-9])`, 'i').test(text)) return true;
  const sym = h.symbol.trim();
  if (/^[A-Z0-9&-]{3,20}$/.test(sym) && new RegExp(`(^|[^A-Za-z0-9&-])${esc(sym)}($|[^A-Za-z0-9&-])`).test(text)) return true;
  return false;
}

export interface SentimentCounts { bullish: number; bearish: number; neutral: number; unrated: number; total: number }
const zero = (): SentimentCounts => ({ bullish: 0, bearish: 0, neutral: 0, unrated: 0, total: 0 });
export function countSentiment(articles: Pick<NewsArticle, 'sentiment'>[]): SentimentCounts {
  const c = zero();
  for (const a of articles) {
    const s: Sentiment | null = a.sentiment;
    if (s === 'bullish') c.bullish++; else if (s === 'bearish') c.bearish++; else if (s === 'neutral') c.neutral++; else c.unrated++;
    c.total++;
  }
  return c;
}

export interface HoldingNews { holding: NewsHolding; articles: NewsArticle[]; counts: SentimentCounts }
export interface PortfolioNews {
  rows: HoldingNews[];                      // holdings with at least one matched headline, most headlines first
  quiet: NewsHolding[];                     // holdings with none in this feed
  matchedArticles: number;                  // distinct headlines matched to any holding
  totalArticles: number;
  overall: SentimentCounts;                 // over distinct matched headlines
}

export function newsByHolding(articles: NewsArticle[], holdings: NewsHolding[]): PortfolioNews {
  const rows: HoldingNews[] = [], quiet: NewsHolding[] = [];
  const seen = new Set<string>(), distinct: NewsArticle[] = [];
  for (const h of holdings) {
    const hit = articles.filter(a => mentions(`${a.title}. ${a.summary}`, h));
    if (!hit.length) { quiet.push(h); continue; }
    rows.push({ holding: h, articles: hit, counts: countSentiment(hit) });
    for (const a of hit) if (!seen.has(a.id)) { seen.add(a.id); distinct.push(a); }
  }
  rows.sort((a, b) => b.articles.length - a.articles.length || a.holding.symbol.localeCompare(b.holding.symbol));
  return { rows, quiet, matchedArticles: distinct.length, totalArticles: articles.length, overall: countSentiment(distinct) };
}
