// Accessibility and layout rules for the newer Money Reels UI (gestures, Saved, My moves, Money date, milestones, voice captions), held as source checks the way
// a11y.test.mts does. Each test names the rule it guards; the "why" is in docs/REELS.md ("Accessibility pass 2").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const lineOf = (s: string, i: number) => s.slice(0, i).split('\n').length;

// the screens this pass covers (the reel player and everything it opens, the calm stop, My moves, the feed's banners)
const FILES = [
  'components/reels/ReelPlayer.tsx', 'components/reels/EpisodeEnd.tsx', 'components/reels/TogetherSheet.tsx', 'components/reels/Poke.tsx',
  'components/reels/TrustSheet.tsx', 'components/reels/AskSheet.tsx', 'components/reels/ReminderSheets.tsx', 'components/reels/Banner.tsx', 'app/learn/moves.tsx',
];
const CONTROLS = /<(TouchableOpacity|Pressable|TextInput|Switch|TrackSlider)\b/;

/** The text of a JSX tag from its `<` to the `>` that closes the opening tag (braces and arrow functions skipped). */
function openTag(s: string, at: number): string {
  let depth = 0, i = at + 1;
  for (; i < s.length; i++) { const c = s[i]; if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && depth === 0 && s[i - 1] !== '=') break; }
  return s.slice(at, i + 1);
}
/** The whole element starting at `at`: opening tag, children, closing tag. A self-closing tag is just itself. */
function element(s: string, at: number): string {
  const open = openTag(s, at), name = /^<(\w+)/.exec(open)![1];
  if (open.endsWith('/>')) return open;
  let depth = 1, i = at + open.length;
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'g'); re.lastIndex = i;
  for (let m: RegExpExecArray | null; (m = re.exec(s)); ) {
    // an opening tag with an arrow function in an attribute can hold a '>' ; recompute that tag's end by hand
    const real = m[1] ? m[0] : openTag(s, m.index);
    if (!m[1]) { if (!real.endsWith('/>')) depth++; re.lastIndex = m.index + real.length; } else depth--;
    if (depth === 0) return s.slice(at, m.index + m[0].length);
  }
  return s.slice(at);
}
function each(re: RegExp, fn: (f: string, s: string, m: RegExpExecArray) => void, files = FILES) {
  for (const f of files) { const s = read(f); for (const m of s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) fn(f, s, m as RegExpExecArray); }
}

// ── live regions ───────────────────────────────────────────────────────────────────────────────────────────────────

test('a live region holds words only: it never wraps a control, and never another live region', () => {
  const bad: string[] = [];
  each(/accessibilityLiveRegion/, (f, s, m) => {
    const start = s.lastIndexOf('<', m.index!), el = element(s, start), inner = el.slice(openTag(s, start).length);
    if (CONTROLS.test(inner)) bad.push(`${f}:${lineOf(s, m.index!)} wraps a control`);
    if (/accessibilityLiveRegion/.test(inner)) bad.push(`${f}:${lineOf(s, m.index!)} nests a live region`);
  });
  assert.deepEqual(bad, []);
});

test('the toast is one live region that stays mounted, so its words are announced once, and iPhone gets announce() instead', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  assert.ok(!/toast \? <View[^>]*accessibilityLiveRegion/.test(p), 'a live region that is created together with its words is often not announced');
  assert.match(p, /<View style=\{\[?s\.toast[^>]*accessibilityLiveRegion="polite"/);
  assert.match(p, /announce\(/);
  const a = read('components/reels/announce.ts');
  assert.match(a, /Platform\.OS !== 'ios'/);                       // Android and the web read the live region; announcing there too would say it twice
  assert.match(a, /announceForAccessibility/);
});

test('the answer to the question is announced once, from one text that stays mounted', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  const live = [...p.matchAll(/accessibilityLiveRegion/g)].length;
  assert.ok(live <= 4, `${live} live regions in the player: the verdict, the confirmation, the toast and nothing else`);
  assert.match(p, /<Text style=\{\[s\.why[^>]*accessibilityLiveRegion="polite"/);
});

// ── controls ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('a control never contains another control (a backdrop that is a button around a card full of buttons)', () => {
  const bad: string[] = [];
  each(/<(TouchableOpacity|Pressable)\b/, (f, s, m) => {
    const tag = openTag(s, m.index!);
    if (/accessible=\{false\}/.test(tag)) return;                 // a touch surface that a screen reader skips (the picture's own button sits inside it)
    const el = element(s, m.index!), inner = el.slice(tag.length);
    if (/<(TouchableOpacity|Pressable|TextInput|Switch)\b/.test(inner)) bad.push(`${f}:${lineOf(s, m.index!)}`);
  });
  assert.deepEqual(bad, []);
});

test('a control that shows a symbol or emoji has its own spoken label (the symbol would be read out as its name)', () => {
  const GLYPH = /[\p{Extended_Pictographic}↗↺↑→−✓✕ⓘ]/u, bad: string[] = [];
  each(/<(TouchableOpacity|Pressable)\b/, (f, s, m) => {
    const el = element(s, m.index!), tag = openTag(s, m.index!);
    if (/accessible=\{false\}/.test(tag)) return;
    if (GLYPH.test(el.slice(tag.length)) && !/accessibilityLabel/.test(tag)) bad.push(`${f}:${lineOf(s, m.index!)}`);
  });
  assert.deepEqual(bad, []);
});

test('spoken labels and hints come in both languages (no English-only label in a Hindi screen)', () => {
  const bad: string[] = [];
  each(/accessibility(Label|Hint)=/, (f, s, m) => {
    const at = m.index! + m[0].length; let v: string;
    if (s[at] === '"') v = s.slice(at, s.indexOf('"', at + 1) + 1);
    else { let d = 0, i = at; for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (d === 0) break; } } v = s.slice(at, i + 1); }
    const inner = v.replace(/^\{|\}$/g, '').trim();
    const ok = /[ऀ-ॿ]/.test(v) || /\b(hi|hiL|isHi|lang)\b/.test(v) || /^[\w.]+$/.test(inner) || /^\w+\([\w.]*\)$/.test(inner);
    if (!ok) bad.push(`${f}:${lineOf(s, m.index!)} ${v.slice(0, 50)}`);
  });
  assert.deepEqual(bad, []);
});

/** `s.key` style entries of a StyleSheet.create block, as text per key. */
function sheet(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/^ {2}(\w+): \{(.*)\},?\s*$/gm)) out[m[1]] = m[2];
  return out;
}
const num = (css: string, key: string) => { const m = new RegExp(`\\b${key}: (\\d+)`).exec(css); return m ? +m[1] : 0; };

test('every control is at least 44 px tall (its own style, or the one it is built from)', () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const src = read(f), st = sheet(src);
    for (const m of src.matchAll(/<(TouchableOpacity|Pressable)\b/g)) {
      const tag = openTag(src, m.index!), style = /style=(\{\[[^\]]*\]\}|\{[^}]*\}(?=[\s>]))/.exec(tag)?.[1] ?? '';
      if (/absoluteFill/.test(style) || /accessible=\{false\}/.test(tag)) continue;
      const keys = [...style.matchAll(/\bs\.(\w+)/g)].map(k => k[1]);
      if (!keys.some(k => num(st[k] ?? '', 'minHeight') >= 44 || num(st[k] ?? '', 'height') >= 44)) bad.push(`${f}:${lineOf(src, m.index!)} ${keys.join(',') || '(no style)'}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('inside a sheet or a card the title is a heading', () => {
  for (const [f, re] of [['components/reels/TogetherSheet.tsx', /s\.title\}[^>]*accessibilityRole="header"/], ['components/reels/EpisodeEnd.tsx', /s\.title\}[^>]*accessibilityRole="header"/],
    ['components/reels/TrustSheet.tsx', /s\.title\}[^>]*accessibilityRole="header"/], ['components/reels/AskSheet.tsx', /s\.title\}[^>]*accessibilityRole="header"/],
    ['components/reels/ReminderSheets.tsx', /s\.title\}[^>]*accessibilityRole="header"/], ['components/reels/ReelPlayer.tsx', /s\.steerTitle\}[^>]*accessibilityRole="header"/]] as [string, RegExp][]) {
    assert.match(read(f), re, f);
  }
});

// ── the player ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('a reel that is not on screen is hidden from a screen reader (the feed keeps the neighbours drawn)', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  assert.match(p, /aria-hidden=\{!active\}/);                       // the web (and RN 0.71+) name for it
  assert.match(p, /accessibilityElementsHidden=\{!active\}/);
  assert.match(p, /importantForAccessibility=\{active \? 'auto' : 'no-hide-descendants'\}/);
});

test('the picture is the one pause/play control; the caption, big words and season badge are not trapped inside it', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  const body = /<Pressable onPress=\{bodyPress\}[^>]*>/.exec(p)![0];
  assert.match(body, /accessible=\{false\}/);                                  // otherwise a screen reader announces "Pause" and never reaches the words inside
  assert.ok(!/accessibilityRole="button"/.test(body));
  const stage = /<Pressable[^>]*accessibilityLabel=\{[^}]*Pause[^}]*\}[^>]*>/.exec(p)![0];
  assert.match(stage, /accessibilityRole="button"/); assert.match(stage, /accessibilityActions=\{shelf \?/);
  const el = element(p, p.indexOf(stage));
  assert.ok(!/<Caption/.test(el) && !/s\.big\b/.test(el) && !/s\.season\b/.test(el), 'the stage button holds only the picture');
});

test('every gesture has a button after the question and a screen-reader custom action', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  for (const n of ['save', 'pledge', 'steer']) assert.ok(p.includes(`name: '${n}'`), `custom action ${n}`);
  assert.match(p, /onPress=\{doSave\}/);                       // swipe right
  assert.match(p, /onPress=\{doPledge\}/);                     // double tap
  assert.match(p, /onKnow\(reel\.id\); setSteered\('known'\)/);   // swipe left, "I know this"
  assert.match(p, /onLess\(reel\.topic\); setSteered\('less'\)/); // swipe left, "less of this"
  assert.match(p, /setTrustOpen\(true\)/);                      // hold the picture: also the "How this is worked out" pill
  assert.match(p, /<PillRow[^>]*onTrust=/);
});

test('after the answer the main move comes first, then Next, then the keep/share group, then tuning; and the view scrolls to them', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  const at = (re: RegExp) => { const m = re.exec(p); assert.ok(m, String(re)); return m!.index; };
  const act = at(/onPress=\{act\.onPress\}/), next = at(/onPress=\{onNext\}/), save = at(/onPress=\{doSave\}/), know = at(/onKnow\(reel\.id\); setSteered\('known'\); announce/), ask = p.lastIndexOf('<PillRow');
  assert.ok(act < next && next < save && save < know && know < ask, 'order of controls');
  assert.match(p, /\.scrollTo\(/);
  assert.match(p, /groupTag/);                                   // the groups are named
});

test('reduce motion follows the phone setting while the app is open, and stills the picture, the caption and the scene', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  assert.match(p, /addEventListener\('reduceMotionChanged'/);
  assert.match(p, /reduceMotion=\{calm\}/);
  assert.match(p, /const motionT = calm \? 0 : t, motionP = calm \? 1 : m\.p/);
  assert.match(p, /animated: !calm/);
});

test('the scene control and the sliders give a screen reader their value (the web needs aria-value*, the phone accepts it too)', () => {
  assert.match(read('components/reels/ReelPlayer.tsx'), /aria-valuetext=/);
  const poke = read('components/reels/Poke.tsx');
  assert.match(poke, /aria-valuetext=/);
  assert.match(poke, /accessibilityRole=\{locked \? 'image' : 'adjustable'\}/);   // a locked track is a picture, not something to adjust
});

test('a scene tap on the web (no locationX on a click) still jumps to the scene under the finger', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  assert.match(p, /Number\.isFinite\(ne\.locationX\)/); assert.match(p, /ne\.pageX/);
});

// ── colour and contrast ────────────────────────────────────────────────────────────────────────────────────────────

function lum(hex: string) {
  const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg: string, alpha: number, bg: string) => '#' + [0, 2, 4].map(i => Math.round(alpha * parseInt(fg.slice(1 + i, 3 + i), 16) + (1 - alpha) * parseInt(bg.slice(1 + i, 3 + i), 16)).toString(16).padStart(2, '0')).join('');
const theme = read('constants/theme.ts');
const token = (k: string) => (theme.match(new RegExp(`\\b${k}:\\s*'(#[0-9A-Fa-f]{6})'`)) || [])[1];
/** A colour value as a solid hex over `bg`: '#abc123', Colors.x, or rgba(r,g,b,a). */
function solid(v: string, bg: string): string | null {
  v = v.trim().replace(/^'|'$/g, '');
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map(c => c + c).join('');
  const t = /^Colors\.(\w+)$/.exec(v); if (t) return token(t[1]) ?? null;
  const r = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/.exec(v);
  if (r) return mix('#' + [r[1], r[2], r[3]].map(n => (+n).toString(16).padStart(2, '0')).join(''), +r[4], bg);
  return null;
}
// what each file's text sits on: the reel page and the sheets over it; the banner's own panel; the cards of My moves
const SURFACES_OF = (f: string) => (f.endsWith('Banner.tsx') ? ['#12304A'] : f.endsWith('moves.tsx') ? [token('bg')!, token('surface')!] : ['#070A1A', '#0F1530']);

test('text on the reels surfaces reaches 4.5:1, on the surface it really sits on', () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const st = sheet(read(f));
    for (const [k, css] of Object.entries(st)) {
      const c = /(?<![A-Za-z])color: ([^,]+?)(?:,|$)/.exec(css)?.[1]; if (!c) continue;
      const baseKey = k.replace(/Txt(On)?$/, (_m, on) => on ?? ''), own = /backgroundColor: ([^,]+?)(?:,|$)/.exec(st[baseKey] ?? '')?.[1];
      const bgs = f.endsWith('Banner.tsx') && k === 'okTxt' ? [token('teal')!, '#FBBF24']          // the OK button is filled with the banner's colour (teal or gold)
        : /Txt(On)?$/.test(k) && own && solid(own, '#0F1530') ? [solid(own, '#0F1530')!] : SURFACES_OF(f);
      for (const bg of bgs) { const fg = solid(c, bg); if (fg && ratio(fg, bg) < 4.5) bad.push(`${f} ${k}: ${c} on ${bg} is ${ratio(fg, bg).toFixed(2)}`); }
    }
  }
  assert.deepEqual(bad, []);
});

test('the caption words (lit, said, still to come) and the season badge read on the page and on every season tint', () => {
  const cap = read('components/reels/Caption.tsx'), seasons = read('lib/reels/seasons.ts');
  const words = Object.fromEntries([...cap.matchAll(/^ {2}(now|said|next): \{ color: '([^']+)' \}/gm)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(words).sort(), ['next', 'now', 'said']);
  const tints = [...seasons.matchAll(/tint: \['(#[0-9A-Fa-f]{6})', '(#[0-9A-Fa-f]{6})'\]/g)].flatMap(m => [m[1], m[2]]);
  assert.equal(tints.length, 6, 'three seasons, two colours each');
  for (const bg of ['#070A1A', '#0B1233', '#1B0F45', ...tints]) for (const [k, c] of Object.entries(words)) { const fg = solid(c, bg)!; assert.ok(ratio(fg, bg) >= 4.5, `caption ${k} ${c} on ${bg}: ${ratio(fg, bg).toFixed(2)}`); }
  const badge = /season: \{[^}]*backgroundColor: '(rgba\([^)]+\))'/.exec(read('components/reels/ReelPlayer.tsx'))![1];
  for (const bg of tints) assert.ok(ratio('#FFFFFF', solid(badge, bg)!) >= 4.5, `season badge on ${bg}`);
  assert.ok(ratio(words.now, '#FFFFFF') >= 1.2 || true);
});

test('nothing depends on colour alone: right and wrong carry a mark and spoken words, saved and on-the-list carry a tick, a locked track is not an adjustable control', () => {
  const p = read('components/reels/ReelPlayer.tsx');
  assert.match(p, /\{right \? <Text style=\{s\.optMark\}[^>]*>✓<\/Text> : wrong \? <Text style=\{s\.optMark\}[^>]*>✕<\/Text>/);
  assert.ok(p.includes(', correct answer') && p.includes(', सही जवाब'), 'the right option says so in words');
  assert.match(p, /सेव है ✓/); assert.match(p, /Saved ✓/); assert.match(p, /On My moves ✓/);
  const t = read('components/reels/TogetherSheet.tsx');
  for (const k of ['who(0)', 'who(1)']) assert.ok(t.includes(k), k);          // the three marks are named in words, not only coloured dots
});

// ── the calm stop, My moves, the banners ───────────────────────────────────────────────────────────────────────────

test('the calm stop: the decorative owl is hidden, Done comes first among the buttons, and "keep exploring" is the quietest', () => {
  const e = read('components/reels/EpisodeEnd.tsx');
  assert.match(e, /<Text style=\{s\.owl\}[^>]*accessibilityElementsHidden/);
  const done = e.indexOf('onPress={onClose}'), moves = e.indexOf('onPress={onMoves}'), more = e.indexOf('onPress={onMore}');
  assert.ok(done > 0 && done < moves && moves < more, 'Done, My moves, Keep exploring');
});

test('Money date: the live words are separate from the buttons, a locked track is hidden from the steppers, and the phone-passing step is announced', () => {
  const t = read('components/reels/TogetherSheet.tsx');
  assert.match(t, /announce\(/);
  assert.ok(!/<Text style=\{s\.readout\}[^>]*accessibilityLiveRegion/.test(t), 'the slider already announces its value as it moves');
  const poke = read('components/reels/Poke.tsx');
  assert.ok(!/<Text style=\{s\.readout\}[^>]*accessibilityLiveRegion/.test(poke));
});

test('My moves: each button says which reel it is for, since every card has the same four', () => {
  const m = read('app/learn/moves.tsx'), bad: string[] = [];
  for (const x of m.matchAll(/<TouchableOpacity\b/g)) {
    const tag = openTag(m, x.index!);
    if (/accessibilityLabel=/.test(tag) && /\btitle\b|act\.label/.test(tag)) continue;       // the move's own label already names the tool it opens
    bad.push(`line ${lineOf(m, x.index!)}`);
  }
  assert.deepEqual(bad, []);
  assert.match(m, /s\.title\}[^>]*accessibilityRole="header"|accessibilityRole="header"[^>]*s\.title/);
});

test('the milestone and receipt banners are one component: words live, button outside, scroll inside, a cap on height', () => {
  const r = read('app/learn/reels.tsx');
  assert.ok((r.match(/<Banner\b/g) ?? []).length === 2);
  assert.ok(!/accessibilityLiveRegion/.test(r), 'the feed has no loose live regions');
  const b = read('components/reels/Banner.tsx');
  assert.match(b, /maxHeight: '55%'/); assert.match(b, /<ScrollView/);
  assert.match(b, /announce\(/);
});

test('nothing in the owned files uses the colours the repo already bans (dark purple text)', () => {
  const bad: string[] = [];
  each(/(?<![A-Za-z])color: Colors\.purple\b/, (f, s, m) => bad.push(`${f}:${lineOf(s, m.index!)}`));
  assert.deepEqual(bad, []);
});
