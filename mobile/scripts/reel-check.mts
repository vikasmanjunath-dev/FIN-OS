// The author's checklist for Money Reels: for one reel, or the whole library, everything that has to be true before a reel ships, with what to do about
// each thing that is not. Exit code 1 when anything blocks (an error that is not in lib/reels/qa-allowlist.ts); warnings never block.
//   npm run reels:check -- <reel-id>      the checklist for one reel (live library, then the drafts)
//   npm run reels:check -- --all          every reel, one line each, with what to fix; then library-wide problems
//   npm run reels:check -- --summary      coverage: topic x ladder level, formats, pillars, tools, reachability, gaps
//   add --drafts to check the 50 draft reels (waiting for review) instead of the live library
// Related: scripts/review-sheet.mts (the sheet a Hindi and a compliance reader sign), scripts/verify-numbers.mts (phone calculators, checked by a
// second method), scripts/voice-brief.mts (the recording brief). This script does not repeat them: it tells you when to run them.
import fs from 'node:fs';
import path from 'node:path';
import { BUDGET, checkLibrary, checkReel, coverage, answerSkew, draftContext, liveContext, notInAnySeries, sortFindings, type QaContext, type ReelReport } from '../lib/reels/qa.ts';
import { QA_ALLOWLIST } from '../lib/reels/qa-allowlist.ts';
import { LEVELS } from '../lib/reels/meta.ts';
import { TOPIC_ORDER, TOPIC_NAME, LEVEL_NAME } from '../lib/reels/map.ts';
import { PILLAR_NAME, type PillarId } from '../lib/reels/journey.ts';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const positional = args.filter(a => !a.startsWith('--'));

const root = path.join(import.meta.dirname, '..');
const lessons = new Set((JSON.parse(fs.readFileSync(path.join(root, 'content/learn/manifest.json'), 'utf8')) as { lessons: { id: string }[] }).lessons.map(l => l.id));
const live = liveContext(lessons), drafts = draftContext(lessons);
const ctx: QaContext = flag('--drafts') ? drafts : live;

const MARK = { ok: '✓', todo: '·', known: '~', warn: '!', fail: '✗' } as const;
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

function printReel(rep: ReelReport) {
  console.log(`\n${rep.id}  (${rep.topic})  ${rep.title}`);
  for (const it of rep.items) {
    console.log(`  ${MARK[it.status]} ${pad(it.label, 50)} ${it.detail}`);
    for (const x of it.findings) {
      const known = rep.known.find(k => k.code === x.code && k.message === x.message);
      console.log(`      ${x.severity === 'error' ? (known ? 'KNOWN' : 'ERROR') : 'warn '}  ${x.message}${x.fix ? `\n             → ${x.fix}` : ''}${known ? `\n             allowlisted: ${known.reason}` : ''}`);
    }
  }
  console.log(`  ${rep.blocking.length} blocking, ${rep.warnings.length} warning${rep.warnings.length === 1 ? '' : 's'}${rep.known.length ? `, ${rep.known.length} known` : ''}`);
}

function runAll(): number {
  const reps = ctx.reels.map(r => checkReel(r, ctx));
  let blocking = 0, warnings = 0, known = 0, clean = 0;
  for (const rep of reps) {
    blocking += rep.blocking.length; warnings += rep.warnings.length; known += rep.known.length;
    if (!rep.blocking.length && !rep.warnings.length && !rep.known.length) { clean++; continue; }
    const state = rep.blocking.length ? 'FAIL' : rep.warnings.length ? 'warn' : 'known';
    console.log(`${pad(state, 5)} ${pad(rep.id, 34)} ${rep.blocking.length} blocking, ${rep.warnings.length} warnings${rep.known.length ? `, ${rep.known.length} known` : ''}`);
    for (const x of rep.blocking) console.log(`        ERROR ${x.message}${x.fix ? `  → ${x.fix}` : ''}`);
    for (const x of rep.warnings) console.log(`        warn  ${x.message}`);
    for (const x of rep.known) console.log(`        KNOWN ${x.message}  (${x.reason})`);
  }
  const lib = checkLibrary(ctx).map(x => ({ x, ...sortFindings(x.id, [x]) }));
  const libBlocking = lib.filter(l => l.blocking.length), libKnown = lib.filter(l => l.known.length);
  if (lib.length) console.log('\nLibrary-wide');
  for (const l of lib) console.log(`  ${l.blocking.length ? 'ERROR' : l.known.length ? 'KNOWN' : 'warn '} ${l.x.id}: ${l.x.message}`);
  const used = new Set(reps.flatMap(r => r.known.map(k => `${r.id}/${k.code}`)).concat(libKnown.map(l => `${l.x.id}/${l.x.code}`)));
  const stale = QA_ALLOWLIST.filter(e => !used.has(`${e.id}/${e.code}`) && ctx.reels.some(r => r.id === e.id));
  if (stale.length) { console.log('\nStale allowlist entries (the finding is gone; delete the line in lib/reels/qa-allowlist.ts)'); for (const e of stale) console.log(`  ${e.id} / ${e.code}`); }
  const total = blocking + libBlocking.length;
  console.log(`\n${ctx.reels.length} reels${flag('--drafts') ? ' (drafts)' : ''}: ${clean} clean, ${total} blocking, ${warnings} warnings, ${known + libKnown.length} known (allowlisted).`);
  console.log(total ? 'BLOCKED: fix the ERROR lines (or, for a finding the content session will fix later, add a reasoned line to lib/reels/qa-allowlist.ts).' : 'OK: nothing blocks. Warnings are judgement calls for the author.');
  return total ? 1 : 0;
}

function runSummary(): number {
  const c = coverage(ctx);
  console.log(`# Library coverage${flag('--drafts') ? ' (drafts)' : ''}: ${c.count} reels\n`);
  console.log('Topic x ladder level (the Money Map). A "." is an empty cell.');
  console.log(`  ${pad('', 12)}${LEVELS.map(l => pad(LEVEL_NAME[l].en, 9)).join('')} total`);
  for (const t of TOPIC_ORDER) console.log(`  ${pad(TOPIC_NAME[t].en, 12)}${LEVELS.map(l => pad(c.grid[t][l] ? String(c.grid[t][l]) : '.', 9)).join('')} ${c.byTopic[t] ?? 0}`);
  console.log(`  ${pad('Total', 12)}${LEVELS.map(l => pad(String(c.byLevel[l] ?? 0), 9)).join('')} ${c.count}`);
  console.log(`\nGaps (empty topic x level cells): ${c.gaps.length ? c.gaps.map(g => `${TOPIC_NAME[g.topic as keyof typeof TOPIC_NAME].en}/${LEVEL_NAME[g.level].en}`).join(', ') : 'none'}`);
  console.log('\nFormats');
  for (const [k, n] of Object.entries(c.byFormat).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(k, 10)} ${n}`);
  console.log('\nMoney Score pillars (reels that name the pillar; total weight)');
  for (const [p, v] of Object.entries(c.byPillar).sort((a, b) => b[1].reels - a[1].reels)) console.log(`  ${pad(PILLAR_NAME[p as PillarId]?.en ?? p, 22)} ${pad(String(v.reels), 4)} ${v.weight.toFixed(1)}`);
  const sk = answerSkew(c);
  console.log(`\nQuiz answers by position: ${c.answerPositions.map((n, i) => `${i + 1}: ${n ?? 0}`).join(', ')} (most common ${Math.round(sk.share * 100)}% at position ${sk.position + 1})`);
  console.log(`\nNo tool link (not a scam reel): ${c.noAct.length ? c.noAct.join(', ') : 'none'}`);
  if (c.noScamToolExempt.length) console.log(`Scam reels that point at a tool: ${c.noScamToolExempt.join(', ')}`);
  const noSeries = notInAnySeries(ctx);
  console.log(`In no series: ${noSeries.length} of ${c.count}`);
  console.log(`Never reachable (no series and no Money Map row): ${c.unreachable.length ? c.unreachable.join(', ') : 'none'}`);
  console.log(`Quote figures but have no trust note: ${c.noTrustButFigures.length}${c.noTrustButFigures.length ? ` (${c.noTrustButFigures.join(', ')})` : ''}`);
  console.log(`\nReview: ${c.review.signed} signed off, ${c.review.draftWaiting} drafts waiting, ${c.review.preGate} built before the gate (no sign-off record)`);
  console.log(`Size: ${(c.totalBytes / 1024).toFixed(0)} KB as JSON in all; largest ${c.largest.id} at ${(c.largest.bytes / 1024).toFixed(1)} KB (budget ${BUDGET.reelBytes / 1024} KB a reel)`);
  return 0;
}

function runOne(id: string): number {
  const inLive = live.reels.find(r => r.id === id), inDraft = drafts.reels.find(r => r.id === id);
  const reel = inLive ?? inDraft;
  if (!reel) { console.error(`No reel "${id}" in the live library or the drafts. Ids look like start-early.`); return 2; }
  const rep = checkReel(reel, inLive ? live : drafts);
  printReel(rep);
  if (!inLive) console.log('  (a draft: not in the app until signed off in lib/reels/review.ts)');
  console.log('\nAlso, by hand: look at it (npx expo start --web, /learn/reels?id=' + id + ') and, for a new figure, add a known-answer test.');
  return rep.blocking.length ? 1 : 0;
}

let code: number;
if (flag('--summary')) code = runSummary();
else if (flag('--all')) code = runAll();
else if (positional[0]) code = runOne(positional[0]);
else {
  console.log('Usage: npm run reels:check -- <reel-id> | --all | --summary   [--drafts]\n  <reel-id>   the checklist for one reel\n  --all       every reel, with what to fix; non-zero exit when anything blocks\n  --summary   coverage by topic, ladder level, format and pillar, and the gaps\n  --drafts    check the 50 draft reels instead of the live library');
  code = 0;
}
process.exitCode = code;
