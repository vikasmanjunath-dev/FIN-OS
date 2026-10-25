// Builds the files a native Hindi reader works from (docs/hindi-review/): one sheet per topic with every text side by side and what the lint noticed,
// the glossary, and the variant reports. Pure: the same corpus gives the same bytes (no dates, no clock), so a regenerated sheet only changes when a reel does.
// scripts/hindi-sheet.mts writes the result to disk.
import { LINT_CODES, LINT_INFO, lintLibrary, type Flag, type LibraryLint, type LintEntry } from '@/lib/reels/hindi-lint';
import { gateState, toCsv, type CorpusItem } from '@/lib/reels/review-corpus';

export const TOPIC_FILES = ['basics', 'invest', 'loans', 'credit', 'protect', 'tax', 'retire', 'goals', 'safety', 'facts'] as const;

export interface Issue { key: string; code: string; label: string; texts: number; reels: number; example: string }

export interface HindiSheets {
  files: Record<string, string>;
  lint: LibraryLint;
  /** Most common individual issues first (a term written three ways counts once per term, not once per message). */
  issues: Issue[];
  counts: { reels: number; live: number; draft: number; facts: number; texts: number; textsFlagged: number; signed: number };
}

export const entriesOf = (corpus: CorpusItem[]): LintEntry[] =>
  corpus.flatMap(c => c.texts.map(t => ({ id: c.id, where: t.where, en: t.en, hi: t.hi, ...(t.tpl ? { tpl: t.tpl } : {}) })));

const mark = (f: Flag) => `${f.severity === 'likely' ? '!' : '?'} ${f.code}: ${f.msg}`;

function issuesOf(lint: LibraryLint): Issue[] {
  const m = new Map<string, Issue & { r: Set<string> }>();
  for (const [id, rows] of lint.byReel) for (const row of rows) for (const f of row.flags) {
    const e = m.get(f.key) ?? { key: f.key, code: f.code, label: LINT_INFO[f.code].label, texts: 0, reels: 0, example: f.msg, r: new Set<string>() };
    e.texts++; e.r.add(id); m.set(f.key, e);
  }
  return [...m.values()].map(({ r, ...x }) => ({ ...x, reels: r.size })).sort((a, b) => b.texts - a.texts || a.key.localeCompare(b.key));
}

export function buildHindiSheets(corpus: CorpusItem[], ui: string[] = []): HindiSheets {
  const lint = lintLibrary(entriesOf(corpus), { ui });
  const files: Record<string, string> = {};
  const issues = issuesOf(lint);

  // one sheet per topic
  for (const topic of TOPIC_FILES) {
    const rows: (string | number)[][] = [['Reel ID', 'Release', 'Gate', 'Where', 'English', 'Hindi', 'Lint flags (! likely a problem, ? worth a look)', 'Reviewer fix', 'OK']];
    for (const c of corpus.filter(x => x.topic === topic)) {
      const g = gateState(c).signed ? 'signed off' : 'not signed off';
      const linted = lint.byReel.get(c.id) ?? [];
      c.texts.forEach((t, i) => rows.push([c.id, c.release, g, t.where, t.en, t.hi, (linted[i]?.flags ?? []).map(mark).join('\n'), '', '']));
    }
    if (rows.length > 1) files[`topic-${topic}.csv`] = toCsv(rows);
  }

  // which reels are cleared and which still need the Hindi read
  const idx: (string | number)[][] = [['Reel ID', 'Topic', 'Title', 'Release', 'Hindi sign-off (review.ts)', 'Compliance sign-off (review.ts)', 'Signed on', 'Texts', 'Texts flagged', 'Likely problems', 'Worth a look', 'Hindi reviewed by (fill in)']];
  for (const c of corpus) {
    const g = gateState(c), flags = (lint.byReel.get(c.id) ?? []).flatMap(r => r.flags);
    idx.push([c.id, c.topic, c.title, c.release, g.hindi || 'none', g.compliance || 'none', g.on, c.texts.length, (lint.byReel.get(c.id) ?? []).filter(r => r.flags.length).length, flags.filter(f => f.severity === 'likely').length, flags.filter(f => f.severity === 'check').length, '']);
  }
  files['reels-index.csv'] = toCsv(idx);

  // glossary
  const gl: (string | number)[][] = [['Term', 'Kind', 'English', 'Proposed Hindi', 'Other forms that are fine', 'Forms to replace', 'Stands for', 'Why / what the app does', 'Texts using the proposed form', 'Texts using other forms', 'Reviewer decision (agree / change to)']];
  for (const v of lint.stats.variants) {
    const t = v.term, own = v.forms.find(f => f.kind === 'hi')?.count ?? 0;
    gl.push([t.id, t.kind, t.en, t.hi, (t.allowed ?? []).join(' / '), (t.avoid ?? []).join(' / '), t.full ?? '', t.note ?? '', own, v.forms.filter(f => f.kind !== 'hi' && f.count > 0).map(f => `${f.form} (${f.count})`).join(', '), '']);
  }
  files['glossary.csv'] = toCsv(gl);

  // terms written in more than one way, with how often each way is used here and in the app's own screens
  const vr: (string | number)[][] = [['Term', 'English', 'Form', 'Role', 'Texts in reels', 'Reels', 'App screen strings', 'Reviewer pick (mark one per term)']];
  const role = { hi: 'proposed', allowed: 'also fine', avoid: 'replace' } as const;
  for (const v of lint.stats.variants) {
    const live = v.forms.filter(f => f.count > 0 || f.ui > 0);
    if (live.length < 2) continue;
    for (const f of live) vr.push([v.term.id, v.term.en, f.form, role[f.kind], f.count, f.reels, f.ui, '']);
  }
  files['variants.csv'] = toCsv(vr);

  // one word spelled two ways
  const sp: (string | number)[][] = [['Spelling', 'Uses', 'Same word as', 'Reviewer pick (mark one per word)']];
  for (const row of lint.stats.spelling) for (const f of row.forms) sp.push([f.form, f.count, row.forms.filter(x => x !== f).map(x => x.form).join(' / '), '']);
  files['spelling.csv'] = toCsv(sp);

  const counts = {
    reels: corpus.filter(c => c.release !== 'fact').length, live: corpus.filter(c => c.release === 'live').length, draft: corpus.filter(c => c.release === 'draft').length,
    facts: corpus.filter(c => c.release === 'fact').length, texts: lint.textsChecked, textsFlagged: lint.textsFlagged,
    signed: corpus.filter(c => c.release !== 'fact' && gateState(c).signed).length,
  };
  files['README.md'] = readme(lint, issues, counts);
  return { files, lint, issues, counts };
}

function readme(lint: LibraryLint, issues: Issue[], c: HindiSheets['counts']): string {
  const L: string[] = [];
  L.push('# Hindi review sheets for Money Reels', '');
  L.push('Generated by `npm run reels:hindi` (do not edit by hand; edit `Reviewer fix` in a copy, and send the copy back). Nothing here changes a reel.', '');
  L.push(`**Scope:** ${c.live} live reels and ${c.draft} draft reels waiting behind the review gate, each with its "How this is worked out" note, plus ${c.facts} money facts: ${c.texts} texts in all. ${c.signed} reels have both sign-offs in \`lib/reels/review.ts\`; the rest do not. The Hindi was written by a machine and has not been read by a person.`, '');
  L.push('## What you are asked to do', '');
  L.push('1. Open the sheet for a topic (`topic-*.csv`, UTF-8; in Excel use Data > From Text/CSV if the Hindi looks broken).');
  L.push('2. For every row read the Hindi next to the English. Does it say the same thing, and is it how a person would say it on a phone screen? Write a better line in **Reviewer fix**, or put a tick (or Y) in **OK**.');
  L.push('3. Rows with a flag in the **Lint flags** column were noticed by a program. `!` is probably wrong; `?` is only worth a look. A flag is a pointer, not a verdict: you may decide the Hindi is fine.');
  L.push('4. Settle the words in `glossary.csv` (fill in **Reviewer decision**), then the spellings in `spelling.csv` and the two-ways terms in `variants.csv`. One decision there fixes many rows.');
  L.push('5. Do not mark a reel signed off in a sheet. A sign-off is a line in `lib/reels/review.ts` made by the content owner after both readers are done; `reels-index.csv` shows which reels have one.', '');
  L.push('## Files', '');
  L.push('| File | What it is |', '|---|---|');
  L.push('| `topic-<topic>.csv` | Every text of every reel in that topic: reel, release state, gate state, where on screen, English, Hindi, flags, and two empty columns for you |');
  L.push('| `reels-index.csv` | One row per reel: whether it has the Hindi and compliance sign-offs, how many texts are flagged |');
  L.push('| `glossary.csv` | The Hindi proposed for each recurring term, other forms that are fine, forms to replace, and how often each is used now |');
  L.push('| `variants.csv` | Terms written in more than one way, with counts from the reels and from the app’s own screens |');
  L.push('| `spelling.csv` | Words spelled two ways (nukta or chandrabindu), with counts |');
  L.push('', '## What the first pass found', '');
  L.push(`${c.textsFlagged} of ${c.texts} texts have at least one flag.`, '');
  L.push('| Check | Meaning | Flags | Reels | Of which likely wrong |', '|---|---|---|---|---|');
  for (const code of LINT_CODES) { const p = lint.perCode[code]; L.push(`| \`${code}\` | ${LINT_INFO[code].label} | ${p.flags} | ${p.reels} | ${p.likely} |`); }
  L.push('', '### Ten most common issues', '', '| # | Issue | Texts | Reels | Example |', '|---|---|---|---|---|');
  issues.slice(0, 10).forEach((x, i) => L.push(`| ${i + 1} | \`${x.key}\` ${x.label} | ${x.texts} | ${x.reels} | ${x.example.replace(/\|/g, '/')} |`));
  L.push('', '## What the checks cannot do', '');
  L.push('- They cannot tell whether a sentence sounds natural. That is your job and the reason this review exists.');
  L.push('- They compare the Hindi with the English only for numbers, ₹, % and lakh/crore/thousand. A sentence that says something different in words will not be caught.');
  L.push('- The glossary is a proposal. Where the app’s own screens (`lib/i18nHi.ts`) and the reels disagree (for example आपातकालीन निधि against आपातकालीन फ़ंड), `variants.csv` shows both counts.');
  L.push('- Reels built from a person’s own figures (“Your Number”) fill their sentences at run time from templates in `personal*.ts`; those sentences are not in these sheets.');
  L.push('');
  return L.join('\n');
}
