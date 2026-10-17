// Arya's tools that need the Arya server (the person's own backend, Settings → address): public market data only.
//
//   serverCallFor(tool, args)           the exact request to POST to /api/tool: tool name and arguments, plus a plain sentence saying what is sent
//   formatServer(call, result, ts, now) the server's answer worded the same way every time, or null when its shape is not recognised
//
// What leaves the phone for these tools is a public share symbol, a coin name, or the fund-name words typed. Never a figure about the
// person, and never the rest of the question. Tool names are the ones the website's agent uses (arya-ai/server.py `_TOOL_MAP`).
// Pure: the network call itself is made by hooks/useAryaChat.ts (the only allowed fetch caller for Arya).
import type { ToolId, Args } from '@/lib/aryaIntent';
import { stamp } from '@/lib/aryaToolbox';

export type ServerName = 'get_quote' | 'get_market' | 'get_commodities' | 'get_crypto' | 'get_fx' | 'analyze_stock' | 'search_mf' | 'get_mf_nav' | 'get_news' | 'get_announcements';
export interface ServerCall {
  tool: ToolId;
  name: ServerName;
  args: Record<string, unknown>;
  /** what leaves the phone, in words, shown to the person next to the call */
  sends: string;
}

const SYMBOL = /^[A-Z][A-Z0-9&-]{0,19}$/;

/** The request for a market tool, or null when the tool is not a server tool or lacks what it needs (a symbol). */
export function serverCallFor(tool: ToolId, a: Args): ServerCall | null {
  switch (tool) {
    case 'quote': return a.symbol && SYMBOL.test(a.symbol) ? { tool, name: 'get_quote', args: { symbol: a.symbol, exchange: 'NSE' }, sends: `The share symbol ${a.symbol}.` } : null;
    case 'technical': return a.symbol && SYMBOL.test(a.symbol) ? { tool, name: 'analyze_stock', args: { symbol: a.symbol, exchange: 'NSE' }, sends: `The share symbol ${a.symbol}.` } : null;
    case 'announcements': return a.symbol && SYMBOL.test(a.symbol) ? { tool, name: 'get_announcements', args: { symbol: a.symbol, limit: 5 }, sends: `The share symbol ${a.symbol}.` } : null;
    case 'market': return { tool, name: 'get_market', args: {}, sends: 'Nothing about you (the request names nothing).' };
    case 'commodities': return { tool, name: 'get_commodities', args: {}, sends: 'Nothing about you (the request names nothing).' };
    case 'fx': return { tool, name: 'get_fx', args: {}, sends: 'Nothing about you (the request names nothing).' };
    case 'news': return { tool, name: 'get_news', args: { limit: 5 }, sends: 'Nothing about you (the request names nothing).' };
    case 'crypto': {
      const id = a.query && /^[a-z0-9-]{2,40}$/.test(a.query) ? a.query : null;
      return id ? { tool, name: 'get_crypto', args: { coins: [id] }, sends: `The coin name ${id}.` } : { tool, name: 'get_crypto', args: {}, sends: 'Nothing about you (the request names nothing).' };
    }
    case 'mf_nav': {
      const q = String(a.query ?? '').trim();
      if (!q || q.length > 80) return null;
      if (/^\d{3,8}$/.test(q)) return { tool, name: 'get_mf_nav', args: { scheme_code: q }, sends: `The fund scheme code ${q}.` };
      return { tool, name: 'search_mf', args: { query: q, limit: 3 }, sends: `The fund-name words "${q}".` };
    }
    default: return null;
  }
}

/** A server tool the intent matcher cannot fill in (a price asked for with no share named) needs this question back. */
export function missingFor(tool: ToolId, a: Args): string | null {
  if ((tool === 'quote' || tool === 'technical' || tool === 'announcements') && !(a.symbol && SYMBOL.test(a.symbol))) return 'Which share? Give the NSE symbol or company name, for example "price of RELIANCE".';
  if (tool === 'mf_nav' && !String(a.query ?? '').trim()) return 'Which fund? Give the scheme name or its AMFI scheme code.';
  return null;
}

/* ── wording ───────────────────────────────────────────────────────────────────────────────────────────────── */
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const px = (n: number) => '₹' + n.toLocaleString('en-IN', n >= 1e5 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chg = (c: number | null, p: number | null) => (c === null ? '' : ` (${c >= 0 ? '+' : ''}${c.toFixed(2)}${p !== null ? `, ${p >= 0 ? '+' : ''}${p.toFixed(2)}%` : ''})`);
const sec = (v: unknown): number | null => { const n = num(v); return n !== null && n > 1e9 ? n * 1000 : null; };   // epoch seconds -> ms (rejects 0 and tiny values)

/** Removes the server's own buy/sell wording from an indicator reading: "OVERSOLD (BUY)" -> "oversold". */
export const plainSignal = (s: unknown) => String(s ?? '').replace(/\s*\((?:BUY|SELL|HOLD)\)\s*/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export interface ServerAnswer { text: string; source: string; asOf: number }

export function formatServer(call: ServerCall, result: any, ts: number | null, nowMs: number): ServerAnswer | null {
  if (!result || typeof result !== 'object' || result.error) return null;
  const fetched = sec(ts) ?? nowMs;
  const base = 'The Arya server\'s public market data. It can lag and is indicative.';
  switch (call.name) {
    case 'get_quote': {
      const price = num(result.price);
      if (price === null || typeof result.symbol !== 'string') return null;
      const range = num(result.week52_low) !== null && num(result.week52_high) !== null ? ` 52-week range ${px(result.week52_low)} to ${px(result.week52_high)}.` : '';
      return { text: `${result.symbol}${result.name && result.name !== result.symbol ? ` (${result.name})` : ''} last traded at ${px(price)}${chg(num(result.change), num(result.change_pct))}.${range}`, source: base, asOf: fetched };
    }
    case 'get_market': {
      const idx = result.indices;
      if (!idx || typeof idx !== 'object') return null;
      const rows = Object.entries(idx as Record<string, any>).map(([k, v]) => ({ k, p: num(v?.price), c: num(v?.change), pc: num(v?.change_pct) })).filter(r => r.p !== null);
      if (!rows.length) return null;
      return { text: rows.map(r => `${r.k}: ${r.p!.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${chg(r.c, r.pc)}`).join('\n'), source: base, asOf: sec(result.as_of) ?? fetched };
    }
    case 'get_commodities': {
      const items = result.commodities;
      if (!items || typeof items !== 'object') return null;
      const rows = Object.entries(items as Record<string, any>).map(([k, v]) => ({ k, p: num(v?.price), u: String(v?.unit ?? ''), c: num(v?.change_pct), d: typeof v?.price_date === 'string' ? v.price_date : null, n: typeof v?.note === 'string' ? v.note : '' })).filter(r => r.p !== null);
      const un = Object.entries((result.unavailable ?? {}) as Record<string, any>).map(([k, v]) => `${k}: ${String(v?.reason ?? 'not available')}`);
      if (!rows.length && !un.length) return null;
      const lines = rows.map(r => `${r.k}: ${r.u.startsWith('₹') ? '₹' + r.p!.toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' ' + r.u.slice(1) : r.p!.toLocaleString('en-IN') + ' ' + r.u}${r.c !== null ? ` (${r.c >= 0 ? '+' : ''}${r.c.toFixed(2)}%)` : ''}${r.d ? `, price of ${r.d}` : ''}`);
      const note = rows.find(r => r.n)?.n;
      return { text: [...lines, ...un].join('\n') + (note ? `\nNote: ${note}.` : ''), source: base, asOf: sec(result.as_of) ?? fetched };
    }
    case 'get_crypto': {
      const c = result.crypto;
      if (!c || typeof c !== 'object') return null;
      const rows = Object.values(c as Record<string, any>).map(v => ({ n: String(v?.name ?? ''), p: num(v?.price_inr), c: num(v?.change_24h) })).filter(r => r.n && r.p !== null);
      if (!rows.length) return null;
      return { text: rows.slice(0, 5).map(r => `${r.n}: ${px(r.p!)}${r.c !== null ? ` (${r.c >= 0 ? '+' : ''}${r.c.toFixed(1)}% in 24h)` : ''}`).join('\n'), source: base, asOf: fetched };
    }
    case 'get_fx': {
      const rows = Object.entries(result as Record<string, unknown>).map(([k, v]) => ({ k: k.replace('_', ' to '), v: num(v) })).filter(r => r.v !== null);
      if (!rows.length) return null;
      return { text: rows.map(r => `${r.k}: ${r.v!.toFixed(2)}`).join('\n') + '\nMarket rates, not the RBI reference rate.', source: base, asOf: fetched };
    }
    case 'analyze_stock': {
      const sig = result.signals;
      if (!sig || typeof sig !== 'object' || typeof result.symbol !== 'string') return null;
      const lines: string[] = [];
      const S = sig as Record<string, any>;
      if (S.RSI && num(S.RSI.value) !== null) lines.push(`RSI ${S.RSI.value.toFixed(1)}: ${plainSignal(S.RSI.signal)}`);
      if (S.MACD && typeof S.MACD.crossover === 'string') lines.push(`MACD: ${S.MACD.crossover.toLowerCase()}`);
      if (S['Bollinger Bands']) lines.push(`Bollinger bands: ${plainSignal(S['Bollinger Bands'].signal)}`);
      if (S['EMA Cross']) lines.push(`20 and 50 day averages: ${plainSignal(S['EMA Cross'].signal)}`);
      if (S['SMA 200']) lines.push(`200 day average: ${plainSignal(S['SMA 200'].signal)}`);
      if (S.ADX && num(S.ADX.value) !== null) lines.push(`ADX ${S.ADX.value.toFixed(1)}: ${plainSignal(S.ADX.signal)}`);
      if (S.Supertrend) lines.push(`Supertrend: ${plainSignal(S.Supertrend.signal)}`);
      if (S.Volume) lines.push(`Volume: ${plainSignal(S.Volume.signal)}`);
      if (!lines.length) return null;
      return { text: `${result.symbol} (${result.exchange || 'NSE'}) chart indicators, read from about six months of daily prices:\n${lines.map(l => `- ${l}`).join('\n')}\nThese describe what the price has done. They do not predict anything and are not a recommendation.`, source: base, asOf: sec(result.as_of) ?? fetched };
    }
    case 'search_mf': {
      const list = Array.isArray(result.results) ? result.results : null;
      if (!list) return null;
      if (!list.length) return { text: `No fund matched "${String(call.args.query)}". Try fewer words, for example the fund house and the scheme name.`, source: 'AMFI\'s published NAV list, through the Arya server.', asOf: fetched };
      const rows = list.slice(0, 3).filter((v: any) => v && typeof v.scheme_name === 'string' && num(v.nav) !== null).map((v: any) => `${v.scheme_name}: NAV ₹${(v.nav as number).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}${v.date ? ` on ${v.date}` : ''}`);
      if (!rows.length) return null;
      return { text: `${rows.join('\n')}${list.length >= 3 ? '\nShowing the first matches. Add the plan and option (Direct or Regular, Growth or IDCW) to narrow it down.' : ''}`, source: 'AMFI\'s published NAV list, through the Arya server. NAV is the fund\'s own end-of-day value for the date shown.', asOf: fetched };
    }
    case 'get_mf_nav': {
      if (typeof result.scheme_name !== 'string' || num(result.nav) === null) return null;
      return { text: `${result.scheme_name}: NAV ₹${(result.nav as number).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}${result.date ? ` on ${result.date}` : ''}.`, source: 'AMFI\'s published NAV list, through the Arya server.', asOf: fetched };
    }
    case 'get_news': {
      const arts = Array.isArray(result.articles) ? result.articles : null;
      if (!arts) return null;
      const rows = arts.slice(0, 5).filter((x: any) => x && typeof x.title === 'string').map((x: any) => {
        const t = sec(x.published_ts);
        return `${x.title}${x.source || t ? ` (${[x.source, t ? stamp(t) : ''].filter(Boolean).join(', ')})` : ''}`;
      });
      if (!rows.length) return null;
      return { text: `${rows.map((r: string) => `- ${r}`).join('\n')}\nHeadlines are the publishers' own words, not Arya's view.`, source: 'Public news feeds read by the Arya server.', asOf: sec(result.as_of) ?? fetched };
    }
    case 'get_announcements': {
      const list = Array.isArray(result.announcements) ? result.announcements : null;
      if (!list) return null;
      if (!list.length) return { text: `No recent announcement was found for ${String(call.args.symbol)}.`, source: 'NSE corporate announcements, through the Arya server.', asOf: fetched };
      const rows = list.slice(0, 5).filter((x: any) => x && typeof x.subject === 'string').map((x: any) => `${x.symbol ? x.symbol + ': ' : ''}${x.subject}${x.date ? ` (${x.date})` : ''}`);
      if (!rows.length) return null;
      return { text: rows.map((r: string) => `- ${r}`).join('\n'), source: 'NSE corporate announcements, through the Arya server.', asOf: fetched };
    }
    default: return null;
  }
}
