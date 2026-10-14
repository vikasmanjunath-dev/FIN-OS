// What Arya remembers about you, on this phone. Port of the website's long-term memory model (js/arya-memory.js and the
// AryaMemoryDB inside js/arya-sidebar-panel.js), with the parts that were not fit for a phone left out on purpose:
//
//   website                                           phone
//   ------------------------------------------------  -------------------------------------------------------------
//   facts / goals / preferences you state, deduped    same: "notes you gave" (kinds fact, preference, goal, event, plan)
//   on the first 60 characters                        same dedupe rule, a repeat only raises "seen"
//   episodes ("visited page X"), capped at 200        topics only: "Asked about tax saving", from a fixed vocabulary, never
//                                                     your words. Capped, and expire after 90 days of not coming up again
//   45-day half-life relevance, top 3 episodes +      same half-life and the same 3 + 4 limits
//   top 4 facts go into the prompt                    (the one place anything leaves this module is buildBlock())
//   emotion guessed from keywords ("stressed")        NOT kept. It was a keyword guess about how you feel, stored without
//                                                     you asking. A preference you type ("keep it simple") does the job.
//   synced to the cloud when signed in                NOT synced (the storage keys are on the sync deny-list), and each
//                                                     note has a "keep on this phone only" switch on top of that
//
// Pure: no storage, no React, "now" is a parameter. Everything the person can see or change is in here so it can be tested.

export const KINDS = ['fact', 'preference', 'goal', 'event', 'plan', 'topic'] as const;
export type MemoryKind = typeof KINDS[number];

export const KIND_LABEL: Record<MemoryKind, string> = {
  fact: 'Fact', preference: 'Preference', goal: 'Goal', event: 'Life event', plan: 'Plan', topic: 'Topic you asked about',
};

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  /** What is remembered. For a note you gave this is your own text; for a topic it is a fixed label. */
  text: string;
  /** 'you' typed or said it; 'auto' was noted from a question (topics only). */
  source: 'you' | 'auto';
  createdAt: number;
  updatedAt: number;
  /** How many times it came up (the website's "seen Nx"). */
  seen: number;
  /** null = kept until you delete it. Topics carry a date. */
  expiresAt: number | null;
  /** true: never put in anything sent to the Arya backend, whatever the switches say. */
  local: boolean;
}

export const LIMITS = {
  maxItems: 200,            // the website's MAX_EPISODES
  maxText: 200,             // the website cut summaries at 200 characters
  autoTtlDays: 90,          // a topic that has not come up again for this long is forgotten
  halfLifeDays: 45,         // the website's relevance half-life
  promptTopics: 3,          // "MEMORY:" lines
  promptFacts: 4,           // "KNOWN:" lines
  promptLineChars: 120,
} as const;

const DAY = 86400000;

/* ── topics ────────────────────────────────────────────────────────────────────────────────────────────────── */
export const TOPICS: { id: string; label: string; re: RegExp }[] = [
  { id: 'tax', label: 'tax saving', re: /\b(tax|itr|80c|80d|regime|tds|advance tax|deduction)\b/i },
  { id: 'sip', label: 'SIP and investing', re: /\b(sip|invest(ing|ment|ments)?|lumpsum|step[- ]?up)\b/i },
  { id: 'mf', label: 'mutual funds', re: /\b(mutual funds?|elss|nav|index fund|etf)\b/i },
  { id: 'emergency', label: 'the emergency fund', re: /\b(emergency|rainy day|safety net)\b/i },
  { id: 'insurance', label: 'insurance', re: /\b(insurance|term (plan|cover|policy)|health cover|premium|bima)\b/i },
  { id: 'loan', label: 'loans and EMI', re: /\b(emi|loan|mortgage|credit card dues?|debt|prepay)\b/i },
  { id: 'retirement', label: 'retirement', re: /\b(retire|retirement|pension|fire|nps|epf|ppf)\b/i },
  { id: 'goals', label: 'goals', re: /\b(goals?|target|down ?payment|education fund)\b/i },
  { id: 'budget', label: 'budget and spending', re: /\b(budget|spend(ing)?|expenses?|savings? rate|kharcha)\b/i },
  { id: 'networth', label: 'net worth', re: /\b(net ?worth|assets?|liabilit(y|ies))\b/i },
  { id: 'markets', label: 'markets and stocks', re: /\b(nifty|sensex|stocks?|shares?|market|quote|price)\b/i },
  { id: 'gold', label: 'gold', re: /\b(gold|sgb|sovereign gold)\b/i },
  { id: 'credit', label: 'credit score', re: /\b(cibil|credit score)\b/i },
  { id: 'subs', label: 'subscriptions', re: /\b(subscriptions?|netflix|renewals?)\b/i },
];

/** Up to two topic ids a message touches. The words themselves are never kept, only these labels. */
export function detectTopics(text: string): string[] {
  const t = String(text || '');
  return TOPICS.filter(x => x.re.test(t)).slice(0, 2).map(x => x.id);
}

/* ── what must never be stored, and what must never be passed on as an instruction ──────────────────────────── */

/** Why a text is refused, or null when it is fine to keep. Card, PAN, Aadhaar, passwords, OTPs, PINs and CVVs are never kept. */
export function sensitiveReason(text: string): string | null {
  const t = String(text || '');
  if (/\b[A-Z]{5}[0-9]{4}[A-Z]\b/i.test(t)) return 'a PAN';
  // 4-4-4(-4) groups: a card or an Aadhaar number. Three years in a row ("2023 2024 2025") is not one.
  for (const m of t.matchAll(/(?<![\d])(\d{4})[ -](\d{4})[ -](\d{4})(?:[ -](\d{1,7}))?(?![\d])/g)) {
    const yearLike = [m[1], m[2], m[3]].every(g => +g >= 1900 && +g <= 2100);
    if (!yearLike || m[4]) return m[4] ? 'a card or account number' : 'an Aadhaar number';
  }
  if (/(?<![\d])\d{12}(?![\d])/.test(t)) return 'an Aadhaar or account number';
  if (/(?<![\d])\d{13,19}(?![\d])/.test(t)) return 'a card or account number';
  if (/\b(password|passcode|passwd|otp|cvv|cvc|upi ?pin|atm ?pin|net ?banking|login)\b/i.test(t) && /\d{3,}|\bis\b|:|=/.test(t)) return 'a password, PIN or OTP';
  if (/\bpin\b\s*(is|=|:)?\s*\d{4,6}\b/i.test(t)) return 'a password, PIN or OTP';
  return null;
}

/**
 * Text that reads like an instruction to a model rather than a fact about you. It may be kept (it is your phone) but is never
 * passed to the backend, so a stored line cannot steer the model. Deliberately broad: a false positive only means one note stays local.
 */
export function looksLikeInstruction(text: string): boolean {
  const t = String(text || '').toLowerCase();
  return /(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the|these|those)\b[^.\n]{0,30}\b(instruction|instructions|rule|rules|prompt|guideline|guidelines|restriction|restrictions|polic(y|ies)|safeguard|guardrails?)/.test(t)
    || /\b(you are now|from now on you|act as|pretend (to be|you)|roleplay|role-play|jailbreak|developer mode|dan mode)\b/.test(t)
    || /\b(system prompt|system message|reveal (your|the) (prompt|instructions)|show (your|the) (prompt|instructions))\b/.test(t)
    || /(^|\n|\s)(system|assistant|developer|user)\s*:/i.test(String(text || ''))
    || /<\/?\s*(system|assistant|instructions?|prompt|tool|function)\b|\[\/?(inst|system)\]|```/i.test(String(text || ''))
    || /\b(you|arya)\s+(must|should|shall|have to|need to|will always|always|never|are to)\b/.test(t)
    || /\b(always|never)\s+(say|answer|reply|respond|recommend|suggest|tell me to|advise)\b/.test(t)
    || /\b(do not|don't|never)\b[^.\n]{0,25}\b(mention|warn|add|include)\b[^.\n]{0,30}\b(disclaimer|risk|sebi|warning|note)\b/.test(t);
}

/* ── the store ─────────────────────────────────────────────────────────────────────────────────────────────── */
export type AddStatus = 'added' | 'updated' | 'rejected';
export interface AddResult { items: MemoryItem[]; item: MemoryItem | null; status: AddStatus; reason?: string }

let seq = 0;
const newId = (now: number) => `m${now.toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** The website's dedupe rule: the first 60 characters, ignoring case, spacing and punctuation. */
export function dedupeKey(text: string): string {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 60);
}

/** One line, no control characters, no markup brackets: what may sit inside a prompt without being able to start a new line of it. */
export function flatten(text: string, max: number = LIMITS.promptLineChars): string {
  const s = String(text || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

const isKind = (k: unknown): k is MemoryKind => typeof k === 'string' && (KINDS as readonly string[]).includes(k);
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Reads whatever is in storage, tolerating any corruption: bad entries are dropped, odd values are repaired, never thrown on. */
export function normaliseStore(raw: unknown, now: number = Date.now()): MemoryItem[] {
  let list: unknown = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: MemoryItem[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxText) : '';
    if (!text) continue;
    const id = typeof o.id === 'string' && o.id && !seen.has(o.id) ? o.id : newId(now);
    seen.add(id);
    const kind: MemoryKind = isKind(o.kind) ? o.kind : 'fact';
    const source: 'you' | 'auto' = o.source === 'auto' && kind === 'topic' ? 'auto' : 'you';
    const createdAt = finite(o.createdAt, now);
    const updatedAt = finite(o.updatedAt, createdAt);
    let expiresAt: number | null = typeof o.expiresAt === 'number' && Number.isFinite(o.expiresAt) && o.expiresAt > 0 ? o.expiresAt : null;
    if (source === 'auto' && expiresAt === null) expiresAt = updatedAt + LIMITS.autoTtlDays * DAY;   // a topic always has a date
    out.push({
      id, kind, text, source, createdAt, updatedAt,
      seen: Math.max(1, Math.round(finite(o.seen, 1))),
      expiresAt,
      local: o.local === true,
    });
  }
  return out;
}

/** Drops what has expired. A note you gave has no date unless you set one, so it is never dropped here. */
export function prune(items: MemoryItem[], now: number): MemoryItem[] {
  return items.filter(i => i.expiresAt === null || i.expiresAt > now);
}

function room(items: MemoryItem[]): MemoryItem[] | null {
  if (items.length < LIMITS.maxItems) return items;
  // make space from the automatic notes first (oldest first); a note you wrote yourself is never pushed out
  const autos = items.filter(i => i.source === 'auto').sort((a, b) => a.updatedAt - b.updatedAt);
  if (!autos.length) return null;
  const drop = autos[0].id;
  return items.filter(i => i.id !== drop);
}

export interface AddInput { text: string; kind?: MemoryKind; expiresInDays?: number | null; local?: boolean }

/** A note you give Arya ("remember that I am saving for a house"). Refuses secrets; a repeat only raises `seen`. */
export function addNote(items: MemoryItem[], input: AddInput, now: number): AddResult {
  const text = String(input.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { items, item: null, status: 'rejected', reason: 'There is nothing to remember in that.' };
  if (text.length > LIMITS.maxText) return { items, item: null, status: 'rejected', reason: `Keep it under ${LIMITS.maxText} characters.` };
  const secret = sensitiveReason(text);
  if (secret) return { items, item: null, status: 'rejected', reason: `I do not keep ${secret}. Remove it and try again.` };
  const kind: MemoryKind = input.kind && isKind(input.kind) && input.kind !== 'topic' ? input.kind : 'fact';
  const key = dedupeKey(text);
  const hit = items.find(i => i.source === 'you' && dedupeKey(i.text) === key);
  if (hit) {
    const item: MemoryItem = { ...hit, seen: hit.seen + 1, updatedAt: now, text, kind, local: input.local ?? hit.local };
    return { items: items.map(i => (i.id === hit.id ? item : i)), item, status: 'updated' };
  }
  const base = room(items);
  if (!base) return { items, item: null, status: 'rejected', reason: `Arya's memory is full (${LIMITS.maxItems} notes). Delete one first.` };
  const days = typeof input.expiresInDays === 'number' && input.expiresInDays > 0 ? Math.min(3650, Math.round(input.expiresInDays)) : null;
  const item: MemoryItem = {
    id: newId(now), kind, text, source: 'you', createdAt: now, updatedAt: now, seen: 1,
    expiresAt: days === null ? null : now + days * DAY, local: input.local === true,
  };
  return { items: [item, ...base], item, status: 'added' };
}

/** Notes that the person asked a question about a topic. Only a fixed label is kept (never the message). */
export function noteTopic(items: MemoryItem[], topicId: string, now: number): MemoryItem[] {
  const t = TOPICS.find(x => x.id === topicId);
  if (!t) return items;
  const text = `Asked about ${t.label}`;
  const hit = items.find(i => i.source === 'auto' && i.text === text);
  if (hit) return items.map(i => (i.id === hit.id ? { ...i, seen: i.seen + 1, updatedAt: now, expiresAt: now + LIMITS.autoTtlDays * DAY } : i));
  const base = room(items);
  if (!base) return items;
  return [{ id: newId(now), kind: 'topic', text, source: 'auto', createdAt: now, updatedAt: now, seen: 1, expiresAt: now + LIMITS.autoTtlDays * DAY, local: false }, ...base];
}

export interface EditPatch { text?: string; kind?: MemoryKind; local?: boolean; expiresInDays?: number | null }
/** Edits one note. Topics keep their label (delete them instead). Same refusals as adding. */
export function editNote(items: MemoryItem[], id: string, patch: EditPatch, now: number): AddResult {
  const cur = items.find(i => i.id === id);
  if (!cur) return { items, item: null, status: 'rejected', reason: 'That note is no longer there.' };
  let text = cur.text;
  if (patch.text !== undefined && cur.source === 'you') {
    text = String(patch.text).replace(/\s+/g, ' ').trim();
    if (!text) return { items, item: null, status: 'rejected', reason: 'A note cannot be empty. Delete it instead.' };
    if (text.length > LIMITS.maxText) return { items, item: null, status: 'rejected', reason: `Keep it under ${LIMITS.maxText} characters.` };
    const secret = sensitiveReason(text);
    if (secret) return { items, item: null, status: 'rejected', reason: `I do not keep ${secret}. Remove it and try again.` };
    const key = dedupeKey(text);
    if (items.some(i => i.id !== id && i.source === 'you' && dedupeKey(i.text) === key)) return { items, item: null, status: 'rejected', reason: 'You already have a note that says this.' };
  }
  const kind: MemoryKind = patch.kind && isKind(patch.kind) && patch.kind !== 'topic' && cur.source === 'you' ? patch.kind : cur.kind;
  let expiresAt = cur.expiresAt;
  if (patch.expiresInDays !== undefined && cur.source === 'you') {
    expiresAt = typeof patch.expiresInDays === 'number' && patch.expiresInDays > 0 ? now + Math.min(3650, Math.round(patch.expiresInDays)) * DAY : null;
  }
  const item: MemoryItem = { ...cur, text, kind, expiresAt, local: patch.local ?? cur.local, updatedAt: now };
  return { items: items.map(i => (i.id === id ? item : i)), item, status: 'updated' };
}

export const removeNote = (items: MemoryItem[], id: string): MemoryItem[] => items.filter(i => i.id !== id);
export const clearAuto = (items: MemoryItem[]): MemoryItem[] => items.filter(i => i.source !== 'auto');

/* ── relevance and the prompt block ───────────────────────────────────────────────────────────────────────── */

/** The website's _score: topic 30, tag-like 10, text 5, then a 45-day half-life on topics. Standing notes do not fade. */
export function relevance(item: MemoryItem, query: string, now: number): number {
  const q = String(query || '').toLowerCase().trim();
  const text = item.text.toLowerCase();
  let s = 0;
  if (q) {
    const words = q.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);
    s += words.filter(w => text.includes(w)).length * 10;
    if (item.kind === 'topic') {
      const topics = detectTopics(q);
      if (topics.some(id => item.text === `Asked about ${TOPICS.find(t => t.id === id)?.label}`)) s += 30;
    }
  }
  if (item.kind !== 'topic') s += 5 + Math.min(item.seen, 5);       // a standing note is always a little relevant
  const days = Math.max(0, (now - item.updatedAt) / DAY);
  return item.kind === 'topic' ? s * Math.exp(-days / LIMITS.halfLifeDays) : s;
}

export interface Selection {
  topics: MemoryItem[];
  facts: MemoryItem[];
  /** Notes that exist but are not passed on, with the reason (shown to the person). */
  withheld: { item: MemoryItem; reason: 'local' | 'instruction' | 'expired' | 'not-relevant' }[];
}

/** What would go to the backend: at most 3 topics and 4 standing notes; nothing marked local; nothing that reads like an instruction. */
export function selectForPrompt(items: MemoryItem[], query: string, now: number): Selection {
  const withheld: Selection['withheld'] = [];
  const live: MemoryItem[] = [];
  for (const i of items) {
    if (i.expiresAt !== null && i.expiresAt <= now) { withheld.push({ item: i, reason: 'expired' }); continue; }
    if (i.local) { withheld.push({ item: i, reason: 'local' }); continue; }
    if (looksLikeInstruction(i.text) || sensitiveReason(i.text)) { withheld.push({ item: i, reason: 'instruction' }); continue; }
    live.push(i);
  }
  const score = (i: MemoryItem) => relevance(i, query, now);
  const topics = live.filter(i => i.kind === 'topic').map(i => ({ i, s: score(i) })).filter(x => x.s > 0.5)
    .sort((a, b) => b.s - a.s || b.i.updatedAt - a.i.updatedAt).slice(0, LIMITS.promptTopics).map(x => x.i);
  const facts = live.filter(i => i.kind !== 'topic')
    .sort((a, b) => score(b) - score(a) || b.updatedAt - a.updatedAt).slice(0, LIMITS.promptFacts);
  const chosen = new Set([...topics, ...facts].map(i => i.id));
  live.filter(i => !chosen.has(i.id)).forEach(i => withheld.push({ item: i, reason: 'not-relevant' }));
  return { topics, facts, withheld };
}

/** The lines that go into the prompt. One line each, flattened and capped, marked as the person's own notes (data, not orders). */
export function buildBlock(sel: Selection, now: number): string[] {
  const lines: string[] = [];
  sel.topics.forEach(i => {
    const d = Math.floor((now - i.updatedAt) / DAY);
    const when = d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
    lines.push(`[${when}] ${flatten(i.text)}`);
  });
  sel.facts.forEach(i => lines.push(`${flatten(i.text)}${i.seen > 1 ? ` (said ${i.seen}x)` : ''}`));
  return lines;
}

/** One string for the backend, or '' when there is nothing to pass on. Entries are separated by " | " so it stays on one line. */
export function summarise(items: MemoryItem[], query: string, now: number): string {
  const lines = buildBlock(selectForPrompt(prune(items, now), query, now), now);
  return lines.join(' | ');
}
