// The phone's side of the fund data: three calls to the user's own FIN·OS backend (arya-ai), with the network injected so this can be
// tested without React Native. fundsApi.ts wires it to the real fetch and host.
//
//   GET /api/mf/search?q=...&limit=...   -> { results: [{ scheme_code, scheme_name, nav, date, fund_house, plan, option }] }   (exists)
//   GET /api/mf/nav/{scheme_code}        -> one such record, or { error }                                                  (exists)
//   GET /api/mf/history/{scheme_code}    -> { points: [{ date, nav }], as_of, source }                                     (REQUESTED, not built yet)
import { type FundRecord, backendQuery, normaliseFund, rankResults, sameScheme } from './funds.ts';
import { type History, parseHistory } from './fundsHistory.ts';

export interface FundsDeps {
  fetchJSON(url: string, timeoutMs?: number): Promise<any>;
  base(): string;
}

export const SEARCH_LIMIT = 300;

export type HistoryOutcome =
  | { status: 'ok'; history: History }
  | { status: 'unavailable'; reason: 'not-provided' | 'empty' | 'offline' };

export function makeFundsApi(deps: FundsDeps) {
  const url = (p: string) => `${deps.base()}${p}`;
  return {
    /** Ranked matches. Throws when the backend cannot be reached (the screen then says so). `truncated` = the backend hit its limit, so more may exist. */
    async search(query: string): Promise<{ results: FundRecord[]; truncated: boolean; tooShort: boolean }> {
      const q = backendQuery(query);
      if (!q) return { results: [], truncated: false, tooShort: true };
      const j = await deps.fetchJSON(url(`/api/mf/search?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`), 20_000);
      const raw: any[] = Array.isArray(j?.results) ? j.results : [];
      const recs = raw.map(normaliseFund).filter((r): r is FundRecord => !!r);
      return { results: rankResults(recs, query), truncated: raw.length >= SEARCH_LIMIT, tooShort: false };
    },

    /** The latest record for a scheme code; null when AMFI has no such code. Throws when the backend cannot be reached. */
    async get(code: string): Promise<FundRecord | null> {
      if (!/^\d{3,8}$/.test(code)) return null;
      const j = await deps.fetchJSON(url(`/api/mf/nav/${code}`), 20_000);
      return normaliseFund(j);
    },

    /** The other plan / option variants of the same scheme (same name and fund house), including `rec` itself. */
    async variants(rec: FundRecord): Promise<FundRecord[]> {
      const j = await deps.fetchJSON(url(`/api/mf/search?q=${encodeURIComponent(rec.name)}&limit=60`), 20_000);
      const raw: any[] = Array.isArray(j?.results) ? j.results : [];
      const same = raw.map(normaliseFund).filter((r): r is FundRecord => !!r && sameScheme(r, rec));
      return same.some(r => r.code === rec.code) ? same : [rec, ...same];
    },

    /** NAV history, when the backend provides it. Never throws: a missing endpoint and a dead connection are both outcomes. */
    async history(code: string): Promise<HistoryOutcome> {
      if (!/^\d{3,8}$/.test(code)) return { status: 'unavailable', reason: 'empty' };
      try {
        const j = await deps.fetchJSON(url(`/api/mf/history/${code}`), 25_000);
        const h = parseHistory(j);
        return h ? { status: 'ok', history: h } : { status: 'unavailable', reason: 'empty' };
      } catch (e: any) {
        // fetchJSON throws "HTTP 404" when the route is missing and a network / abort error when it cannot connect
        return { status: 'unavailable', reason: /^HTTP \d+/.test(String(e?.message)) ? 'not-provided' : 'offline' };
      }
    },
  };
}
