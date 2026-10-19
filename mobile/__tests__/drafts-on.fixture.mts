// Run with EXPO_PUBLIC_REELS_DRAFTS=1 by reels-drafts.test.mts: the whole library, drafts included, must keep every rule.
import { LIBRARY } from '../lib/reels/library.ts';
import { META } from '../lib/reels/meta.ts';
import { ACT_ALL } from '../lib/reels/library.ts';
import { SERIES } from '../lib/reels/series.ts';
import { DRAFT_REELS } from '../lib/reels/drafts.ts';
import { validateReel } from '../lib/reels/validate.ts';
const out: string[] = [];
const ids = new Set(LIBRARY.map(r => r.id));
if (LIBRARY.length !== new Set(LIBRARY.map(r => r.id)).size) out.push('duplicate ids');
for (const r of DRAFT_REELS) { if (!ids.has(r.id)) out.push(`draft ${r.id} is not in the library`); if (!META[r.id]) out.push(`no META for ${r.id}`); if (r.topic !== 'safety' && !ACT_ALL[r.id]) out.push(`no tool link for ${r.id}`); }
for (const r of LIBRARY) for (const m of validateReel(r)) out.push(m);
for (const id of Object.keys(META)) if (!ids.has(id)) out.push(`META names ${id}, which is not a reel`);
for (const s of SERIES) for (const e of s.episodes) if (!ids.has(e.reel)) out.push(`${s.id}: ${e.reel} is not a reel`);
console.log(JSON.stringify({ library: LIBRARY.length, series: SERIES.map(s => s.id), problems: out }));
