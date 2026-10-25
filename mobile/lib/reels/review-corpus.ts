// The set of reels the two release gates (native Hindi reader, compliance reader) have to cover, with each reel's gate state read from
// lib/reels/review.ts. Read-only: nothing here signs anything off. Shared by scripts/hindi-sheet.mts, scripts/compliance-sheet.mts and the tests.
import { LIBRARY } from '@/lib/reels/library';
import { DRAFT_REELS, DRAFT_IDS } from '@/lib/reels/drafts';
import { TRUST } from '@/lib/reels/trust';
import { FACTS } from '@/lib/reels/facts';
import { REVIEWED, type SignOff } from '@/lib/reels/review';
import { reelTexts, trustTexts, factTexts, type ReviewText } from '@/lib/reels/review-texts';
import type { Reel } from '@/lib/reels/types';

export interface CorpusItem {
  /** Reel id, or `fact:<id>` for a money fact. */
  id: string;
  /** A reel topic, or 'facts'. */
  topic: string;
  title: string;
  /** 'live' is in the app today; 'draft' is written but held behind the review gate; 'fact' is a calm-stop money fact. */
  release: 'live' | 'draft' | 'fact';
  /** The sign-off record in review.ts, if there is one. A reel is cleared only when both names are present. */
  signOff: SignOff | null;
  reel?: Reel;
  texts: ReviewText[];
}

/** What the gate says about an item: both names present is "signed off"; anything else is "not signed off". */
export function gateState(item: Pick<CorpusItem, 'signOff'>): { hindi: string; compliance: string; on: string; signed: boolean } {
  const s = item.signOff;
  return { hindi: s?.hindi ?? '', compliance: s?.compliance ?? '', on: s?.on ?? '', signed: Boolean(s?.hindi && s?.compliance) };
}

/** Every live reel, then every draft reel not already live, then the money facts. Trust notes ride with their reel. */
export function reviewCorpus(): CorpusItem[] {
  const out: CorpusItem[] = [];
  const liveIds = new Set(LIBRARY.map(r => r.id));
  const add = (r: Reel, release: 'live' | 'draft') => {
    const texts = [...reelTexts(r), ...(TRUST[r.id] ? trustTexts(TRUST[r.id]) : [])];
    out.push({ id: r.id, topic: r.topic, title: r.title.en, release, signOff: REVIEWED[r.id] ?? null, reel: r, texts });
  };
  for (const r of LIBRARY) add(r, DRAFT_IDS.has(r.id) && !liveIds.has(r.id) ? 'draft' : 'live');
  for (const r of DRAFT_REELS) if (!liveIds.has(r.id)) add(r, 'draft');
  for (const f of FACTS) out.push({ id: `fact:${f.id}`, topic: 'facts', title: f.id, release: 'fact', signOff: null, texts: factTexts(f.text) });
  return out;
}

/** A CSV cell. Quotes, commas and line breaks are escaped; the file itself starts with a byte-order mark so that Excel reads Devanagari correctly. */
export const csvCell = (v: string | number): string => { const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: (string | number)[][]): string => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
