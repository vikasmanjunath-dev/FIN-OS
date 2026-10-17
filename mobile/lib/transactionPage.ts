export const TRANSACTION_PAGE_SIZE = 50;

/** Bound the first render for long-running transaction histories; callers can increment by one page. */
export function visibleTransactions<T>(items: readonly T[], count: number): T[] {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return items.slice(0, safeCount);
}
