// Arya "Cal" tab: dated items coming up (from lib/calendar via the facts) and a heatmap of the spending the person logged.
// The website's heatmap measures each day against `finos_expenses / 30 || 50000`, an invented ₹50,000 when nothing is recorded, and marks
// festivals on fixed dates. Here the reference is the recorded monthly spending ÷ 30, else the person's own average over logged days
// (and the screen says which); festivals are not marked (their dates move every year).
import type { ArFacts } from '@/lib/aryaFacts';
import { isoDate, type CalEvent } from '@/lib/calendar';
import { expenseMonthly } from '@/lib/aryaFacts';

const dayDiff = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

export interface Window { id: string; label: string; items: (CalEvent & { inDays: number })[]; outflow: number }
const OUT = new Set(['sip', 'insurance', 'sub']);
export function upcomingWindows(f: ArFacts): Window[] {
  const today = isoDate(f.now);
  const defs = [['today', 'Today', 0, 0], ['week', 'Next 7 days', 1, 7], ['month', '8 to 30 days', 8, 30], ['quarter', '31 to 90 days', 31, 90], ['later', 'Later this year', 91, 400]] as const;
  return defs.map(([id, label, lo, hi]) => {
    const items = f.events.filter(e => { const d = dayDiff(today, e.date); return d >= lo && d <= hi; }).map(e => ({ ...e, inDays: dayDiff(today, e.date) }));
    return { id, label, items, outflow: items.filter(e => OUT.has(e.type)).reduce((s, e) => s + (e.amount || 0), 0) };
  }).filter(w => w.items.length);
}

export interface Heat { weeks: { date: string; spend: number; level: 0 | 1 | 2 | 3 | 4 | 5; future: boolean }[][]; reference: number; basis: 'recorded' | 'own-average' | 'none'; daysTracked: number; total: number; avgDay: number; over: number; top: { date: string; spend: number }[] }
export function heatmap(f: ArFacts, weeks = 26): Heat {
  const byDay: Record<string, number> = {};
  for (const t of f.data.transactions) if (t.kind === 'expense' && t.amount > 0) byDay[t.date] = (byDay[t.date] || 0) + t.amount;
  const days = Object.keys(byDay);
  const total = days.reduce((s, d) => s + byDay[d], 0);
  const avgDay = days.length ? total / days.length : 0;
  const rec = expenseMonthly(f);
  const reference = rec > 0 ? rec / 30 : avgDay;
  const basis: Heat['basis'] = rec > 0 ? 'recorded' : avgDay > 0 ? 'own-average' : 'none';
  const lvl = (s: number): 0 | 1 | 2 | 3 | 4 | 5 => { if (!s || !reference) return 0; const p = (s / reference) * 100; return p < 60 ? 1 : p < 90 ? 2 : p < 120 ? 3 : p < 160 ? 4 : 5; };
  const today = new Date(f.now.getFullYear(), f.now.getMonth(), f.now.getDate());
  const start = new Date(today); start.setDate(today.getDate() - (weeks - 1) * 7 - today.getDay());
  const grid: Heat['weeks'] = [];
  const cur = new Date(start);
  for (let w = 0; w < weeks; w++) { const col: Heat['weeks'][number] = []; for (let d = 0; d < 7; d++) { const iso = isoDate(cur); const spend = byDay[iso] || 0; col.push({ date: iso, spend, level: lvl(spend), future: cur > today }); cur.setDate(cur.getDate() + 1); } grid.push(col); }
  const inRange = grid.flat().filter(c => !c.future && c.spend > 0);
  return { weeks: grid, reference, basis, daysTracked: inRange.length, total: inRange.reduce((s, c) => s + c.spend, 0), avgDay,
    over: reference ? inRange.filter(c => c.spend / reference > 1.2).length : 0, top: inRange.slice().sort((a, b) => b.spend - a.spend).slice(0, 5).map(c => ({ date: c.date, spend: c.spend })) };
}
