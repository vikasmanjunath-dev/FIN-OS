// Quick-log suggestions: the entries you repeat most, ready to log again in one tap. Pure functions.
import { IndexedTxn, Kind } from '@/lib/budget';

export interface QuickChip {
  key: string;
  kind: Kind;
  category: string;
  label: string;
  /** the amount you logged most recently for this entry */
  amount: number;
  count: number;
  lastDate: string;
  /** true for the single "repeat my last entry" chip */
  isLast?: boolean;
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const norm = (s: string) => tidy(s).toLowerCase();

/** Auto-created entries (recurring) and imported duplicates shouldn't crowd the shortcuts. */
const isAuto = (t: IndexedTxn) => t.id.startsWith('rec_');

/**
 * Ranking: how often you've logged it, then how recently. An entry needs 2+ repeats to earn a
 * chip — except "Repeat last", which is always offered so a one-off can be repeated too.
 * Entries without a label are only grouped when category AND amount match (₹40 "Other" ≠ ₹4,000 "Other").
 */
export function buildQuickChips(txns: IndexedTxn[], limit = 6): QuickChip[] {
  const groups = new Map<string, QuickChip & { lastI: number }>();
  for (const t of txns) {
    if (isAuto(t)) continue;
    const labelKey = norm(t.label);
    const key = `${t.kind}|${t.category}|${labelKey || `#${t.amount}`}`;
    const g = groups.get(key);
    const newer = !g || t.date > g.lastDate || (t.date === g.lastDate && t.i > g.lastI);
    if (!g) groups.set(key, { key, kind: t.kind, category: t.category, label: tidy(t.label), amount: t.amount, count: 1, lastDate: t.date, lastI: t.i });
    else {
      g.count++;
      if (newer) { g.amount = t.amount; g.lastDate = t.date; g.lastI = t.i; g.label = tidy(t.label) || g.label; }
    }
  }
  const all = [...groups.values()];
  if (!all.length) return [];

  const last = all.reduce((a, b) => (b.lastDate > a.lastDate || (b.lastDate === a.lastDate && b.lastI > a.lastI) ? b : a));
  const frequent = all
    .filter(g => g.count >= 2 && g.key !== last.key)
    .sort((a, b) => b.count - a.count || (b.lastDate < a.lastDate ? -1 : b.lastDate > a.lastDate ? 1 : b.lastI - a.lastI));

  const strip = ({ lastI, ...c }: QuickChip & { lastI: number }): QuickChip => c;
  return [{ ...strip(last), isLast: true }, ...frequent.map(strip)].slice(0, limit);
}
