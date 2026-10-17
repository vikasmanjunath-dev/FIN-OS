// The top-level JSON shape each structured key must have. Used where data ARRIVES from outside the app's own writers (a restored
// backup, a tracker-sync pull from the cloud): a value of the wrong kind under one of these keys would be read as "nothing" by the
// app and then replaced by the next save, so it is refused at the door instead. Keys not listed here are not checked (numbers,
// names and flags are plain text and every reader validates them itself). Pure.
import { parseJSON } from '@/lib/safeStore';

export const ARRAY_KEYS: ReadonlySet<string> = new Set([
  'finos_transactions', 'finos_fd_portfolio', 'finos_crypto_portfolio', 'finos_gold_portfolio', 'finos_subscriptions', 'finos_recurring_v1',
  'finos_goals', 'finos_insurance_policies', 'finos_ppf_portfolio', 'finos_sip_portfolio', 'finos_passive_streams', 'finos_money_score_history',
  'finos_calendar_custom_events', 'finos_watchlist', 'finos_funds_recent_v1', 'finos_funds_compare_v1', 'finos_holdings_v1',
  'finos_session_arya_life_v1', 'finos_session_arya_memory_v1', 'finos_harvest_positions',
  'finos_sync_never_trade_journal_v1', 'finos_sync_never_trade_journal_tags_v1',
]);
export const OBJECT_KEYS: ReadonlySet<string> = new Set([
  'finos_budgets', 'finos_crypto_prices', 'finos_money_score', 'finos_streak', 'finos_target_alloc', 'finos_holding_dates', 'finos_nudges_dismissed',
  'finos_pulse_snapshot', 'finos_insurance_checks_v1', 'FINOS_CORE_DNA', 'finos_sync_never_couple_v1', 'finos_learn_opened',
  'finos_session_arya_prefs_v1', 'finos_alerts_state', 'finos_tax_planner_inputs_v1', 'finos_growth_sim_v1',
]);

/** Longest value accepted from outside for one key (characters). Real data is far smaller; this stops a hostile file filling the phone. */
export const MAX_VALUE_CHARS = 5_000_000;

/** null when the value is acceptable for the key, otherwise a short plain reason. `value` is the text that would be stored. */
export function shapeProblem(key: string, value: string): string | null {
  if (value.length > MAX_VALUE_CHARS) return `${key} is too large`;
  const wantArray = ARRAY_KEYS.has(key), wantObject = OBJECT_KEYS.has(key);
  if (!wantArray && !wantObject) return null;
  const p = parseJSON(value);
  if (!p.ok) return `${key} is not readable data`;
  if (wantArray && !Array.isArray(p.value)) return `${key} should be a list`;
  if (wantObject && (p.value === null || typeof p.value !== 'object' || Array.isArray(p.value))) return `${key} should be a set of fields`;
  return null;
}
