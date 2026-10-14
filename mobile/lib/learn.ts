// Learn: pure core (no React, no storage, "now" is a parameter).
// Lesson content is extracted from the website's pages by scripts/extract-learn.py into content/learn/*.json.
// Progress uses the website's own key and shape so a lesson read on either side counts on both:
//   finos_learned_modules = { "<lessonId>": { completed_at: ISO, attempts: number, last_visited: ISO } }
// (written by js/learn-ai.js _markCompleted). The Health Score "Knowledge" points follow js/finos-health-score.js.

export const LEARNED_KEY = 'finos_learned_modules';
/** Text scale cap of the reader (200% like the rest of the app's accessibility rule). */
export const MAX_FONT_SCALE = 2;

export type Block =
  | { t: 'p'; text: string; needsReview?: boolean; reviewReasons?: string[] }
  | { t: 'h'; level: number; text: string; needsReview?: boolean; reviewReasons?: string[] }
  | { t: 'ul' | 'ol'; items: string[]; needsReview?: boolean; reviewReasons?: string[] }
  | { t: 'table'; rows: string[][]; needsReview?: boolean; reviewReasons?: string[] }
  | { t: 'callout'; kind: 'tip' | 'warning' | 'fact' | 'note'; title: string; text: string; needsReview?: boolean; reviewReasons?: string[] };

export interface Section { heading: string; kicker?: string; blocks: Block[]; needsReview?: boolean }

export interface Lesson {
  id: string; title: string; summary: string; category: string; source: string; tool: string | null;
  sections: Section[]; needsReview: boolean; reviewReasons: string[];
}

export interface ManifestEntry {
  id: string; title: string; summary: string; category: string; order: number; kind: 'lesson' | 'interactive';
  source: string; tool: string | null; minutes: number; words: number; hasInteractive: boolean;
  needsReview?: boolean; reviewReasons?: string[];
}

export interface Manifest { version: number; categories: { id: string; title: string }[]; lessons: ManifestEntry[]; excluded: Record<string, string> }
export interface ReviewItem { id: string; lesson: string; quote: string; why: string; current: string; confidence: 'high' | 'medium' | 'low' }

export type Learned = Record<string, { completed_at: string | null; attempts: number; last_visited?: string }>;

// ── progress (website shape) ────────────────────────────────────────────────

/** Parses the stored value. The website writes an object; an array of ids (what its health score expects) is also accepted. */
export function parseLearned(raw: string | null | undefined): Learned {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (Array.isArray(v)) {
      const out: Learned = {};
      for (const id of v) if (typeof id === 'string' && id) out[id] = { completed_at: null, attempts: 0 };
      return out;
    }
    if (v && typeof v === 'object') {
      const out: Learned = {};
      for (const [id, e] of Object.entries(v as Record<string, any>)) {
        if (!e) continue;
        out[id] = { ...(typeof e === 'object' ? e : {}), completed_at: typeof e?.completed_at === 'string' ? e.completed_at : null, attempts: Number(e?.attempts) || 0 };
      }
      return out;
    }
  } catch { /* fall through */ }
  return {};
}

/**
 * Number of modules learned. Array form: its length, exactly as the website's health score reads it.
 * Object form (what js/learn-ai.js writes): the number of entries. The website's health score returns 0 for that
 * shape (it only accepts arrays) so, on the website, learning never earns Knowledge points; see docs/agent-notes/learn.md.
 */
export function learnedCount(raw: string | null | undefined): number {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (Array.isArray(v)) return v.length;
  } catch { /* ignore */ }
  return Object.keys(parseLearned(raw)).length;
}

/** Knowledge half of the website's Knowledge & Engagement pillar: min(6, floor(count * 0.43)). */
export function knowledgePoints(moduleCount: number): number {
  const n = Number.isFinite(moduleCount) && moduleCount > 0 ? moduleCount : 0;
  return Math.min(6, Math.floor(n * 0.43));
}

/** Marks a lesson read: keeps an earlier completed_at / attempts, always refreshes last_visited (as js/learn-ai.js does). */
export function markLearned(learned: Learned, id: string, now: Date): Learned {
  const iso = now.toISOString();
  const prev = learned[id];
  return { ...learned, [id]: { ...prev, completed_at: prev?.completed_at || iso, attempts: prev?.attempts ?? 0, last_visited: iso } };
}

export function unmarkLearned(learned: Learned, id: string): Learned {
  const { [id]: _drop, ...rest } = learned;
  return rest;
}

// Reading state that is NOT part of the website's shape (which only has completed lessons):
// finos_learn_opened = { "<lessonId>": ISO of last open }, used for the "continue" card only.
export const OPENED_KEY = 'finos_learn_opened';
export type Opened = Record<string, string>;

export function parseOpened(raw: string | null | undefined): Opened {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, t]) => typeof t === 'string' && !Number.isNaN(Date.parse(t as string)))) as Opened;
  } catch { return {}; }
}

export function markOpened(opened: Opened, id: string, now: Date): Opened {
  return { ...opened, [id]: now.toISOString() };
}

// ── catalogue ───────────────────────────────────────────────────────────────

export function lessonsOf(m: Manifest, category?: string): ManifestEntry[] {
  return m.lessons.filter(l => !category || l.category === category).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export interface CategoryProgress { id: string; title: string; total: number; learned: number; minutes: number }

/** Interactive-only pages are linked, not read, so they are not part of the "x of y learned" counts. */
export function categoryProgress(m: Manifest, learned: Learned): CategoryProgress[] {
  return m.categories.map(c => {
    const ls = m.lessons.filter(l => l.category === c.id && l.kind === 'lesson');
    return { id: c.id, title: c.title, total: ls.length, learned: ls.filter(l => !!learned[l.id]).length, minutes: ls.reduce((s, l) => s + l.minutes, 0) };
  }).filter(c => m.lessons.some(l => l.category === c.id));
}

export function overallProgress(m: Manifest, learned: Learned) {
  const ls = m.lessons.filter(l => l.kind === 'lesson');
  const done = ls.filter(l => !!learned[l.id]).length;
  return { total: ls.length, done, pct: ls.length ? Math.round((done / ls.length) * 100) : 0 };
}

/** The most recently opened lesson that is not yet learned (a "continue" card); null when none. */
export function continueLesson(m: Manifest, learned: Learned, opened: Opened): ManifestEntry | null {
  let best: { e: ManifestEntry; t: string } | null = null;
  for (const e of m.lessons) {
    const t = opened[e.id];
    if (e.kind !== 'lesson' || !t || learned[e.id]) continue;
    if (!best || t > best.t) best = { e, t };
  }
  return best?.e ?? null;
}

/** The next lesson not yet learned, in category order then lesson order. */
export function nextLesson(m: Manifest, learned: Learned): ManifestEntry | null {
  for (const c of m.categories) {
    const hit = lessonsOf(m, c.id).find(l => l.kind === 'lesson' && !learned[l.id]);
    if (hit) return hit;
  }
  return null;
}

// ── search ──────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Search title, summary and section headings of every lesson (lessonText optional: full-text when the bodies are given). */
export function searchLessons(m: Manifest, query: string, bodies?: Record<string, string>): ManifestEntry[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored: { e: ManifestEntry; s: number }[] = [];
  for (const e of m.lessons) {
    const title = ' ' + norm(e.title), sum = ' ' + norm(e.summary), body = ' ' + (bodies?.[e.id] ?? '');
    let s = 0, ok = true;
    for (const w of words) {
      const p = ' ' + w;   // word-prefix match: "rsi" must not hit "diversification"
      if (title.includes(p)) s += 5;
      else if (sum.includes(p)) s += 2;
      else if (body.includes(p)) s += 1;
      else { ok = false; break; }
    }
    if (ok) scored.push({ e, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.order - b.e.order).map(x => x.e);
}

export function lessonBodyText(l: Lesson): string {
  const out: string[] = [];
  for (const s of l.sections) {
    out.push(s.heading);
    for (const b of s.blocks) {
      if (b.t === 'p' || b.t === 'h') out.push(b.text);
      else if (b.t === 'ul' || b.t === 'ol') out.push(...b.items);
      else if (b.t === 'callout') out.push(b.title, b.text);
      else if (b.t === 'table') out.push(...b.rows.map(r => r.join(' ')));
    }
  }
  return norm(out.join(' '));
}

export function reviewBlockCount(l: Lesson): number {
  return l.sections.reduce((n, s) => n + s.blocks.filter(b => b.needsReview).length, 0);
}
