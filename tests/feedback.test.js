// FinosFeedback — redaction, sanitising, usage counters, consent-gated sending, and the team-side summary.
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/finos-feedback.js');

const NOW = new Date(2026, 9, 4);                      // 4 Oct 2026

/* ── redact ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('redact: amounts in every common Indian form disappear', () => {
  for (const [input, expected] of [
    ['it said ₹1,50,000', 'it said [amount]'], ['₹ 100 only', '[amount] only'], ['Rs. 5000 a month', '[amount] a month'], ['rs 5,000', '[amount]'],
    ['INR 12,000', '[amount]'], ['about ₹5 lakh', 'about [amount]'], ['12 lakh income', '[amount] income'], ['2.5 cr', '[amount]'],
    ['5k per month', '[amount] per month'], ['₹3 crore', '[amount]'], ['1.2 lacs', '[amount]'],
  ]) assert.strictEqual(F.redact(input), expected, input);
});

test('redact: long digit runs, emails, links and IDs disappear; no 4-digit run can survive', () => {
  assert.strictEqual(F.redact('mail a.b+c@x-y.co.in now'), 'mail [email] now');
  assert.strictEqual(F.redact('see https://example.com/a?b=1 and www.foo.bar/x'), 'see [link] and [link]');
  assert.strictEqual(F.redact('PAN ABCDE1234F ok'), 'PAN [id] ok');
  assert.strictEqual(F.redact('aadhaar 1234 5678 9012'), 'aadhaar [id]');
  assert.strictEqual(F.redact('balance 100000 and 12,34,567'), 'balance [number] and [number]');
  for (const s of ['call +91 98765 43210', 'acct 123456789012', 'ref 2026-10-04 9999', 'x1234y']) assert.doesNotMatch(F.redact(s), /\d{4}/, s);
});

test('redact: ordinary feedback is left exactly as written, including small numbers', () => {
  for (const ok of ['The score felt right', 'I tried it 3 times', 'top 5 moves were useful', '2 of 3 sliders worked', 'rate 8.75 looked off', 'दो चीज़ें अच्छी लगीं']) assert.strictEqual(F.redact(ok), ok);
});

test('redact: tidies whitespace, caps at 500 characters, is idempotent, and tolerates junk', () => {
  assert.strictEqual(F.redact('  a \n\n  b\t c  '), 'a b c');
  assert.strictEqual(F.redact('x'.repeat(900)).length, 500);
  for (const s of ['₹1,50,000 and a@b.com and 9876543210', 'plain text', '']) assert.strictEqual(F.redact(F.redact(s)), F.redact(s));
  for (const junk of [null, undefined, 5, {}, []]) assert.strictEqual(typeof F.redact(junk), 'string');
  assert.strictEqual(F.redact(null), '');
});

test('redact: never leaves a digit run or @ in what it returns, for random text', () => {
  let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const bits = ['₹', 'Rs ', ' lakh', '12', '345', '67890', '@', '.com', ' ', 'a', 'score', ',', '-', 'k', 'https://', 'PAN', 'ABCDE', '1234F'];
  for (let i = 0; i < 400; i++) {
    let t = ''; for (let j = 0; j < 14; j++) t += bits[Math.floor(rnd() * bits.length)];
    const out = F.redact(t);
    assert.doesNotMatch(out, /\d{4}/, JSON.stringify(t) + ' → ' + JSON.stringify(out));
    assert.doesNotMatch(out, /[\w.+-]+@[\w-]+\.[\w-]+/, JSON.stringify(t));
  }
});

/* ── cleanPath / sanitizeEvent ──────────────────────────────────────────────────────────────────────────── */
test('cleanPath: keeps a plain site path, drops query, hash and host, and refuses anything odd', () => {
  const eq = (i, o) => assert.strictEqual(F.cleanPath(i), o, String(i));
  eq('/html/money-score.html?x=1#y', 'html/money-score.html');
  eq('https://finos1.vercel.app/html/tax.html', 'html/tax.html');
  eq('/calculators/loans%2C%20debt%20%26%20emi/emi.html', 'calculators/loans, debt & emi/emi.html');
  eq('/HTML/Tax.HTML', 'html/tax.html');
  eq('/', 'index.html'); eq('', 'index.html'); eq('index.html', 'index.html'); eq('/login.html', 'login.html');
  for (const stray of ['/x.html', 'evil.io/x.html', '/other/page.html']) eq(stray, 'unknown');
  for (const bad of ['/html/../secret.html', '/html/<script>.html', '/html/x.js', 'javascript:alert(1)', '/html/%E0%A4%A.html', null, undefined, '/' + 'a'.repeat(300) + '.html']) eq(bad, 'unknown');
});

test('sanitizeEvent: keeps only a rating, a topic, a clean page, a day and a redacted comment', () => {
  const e = F.sanitizeEvent({ rating: 'up', comment: 'great, ₹50,000 felt right', topic: 'tax', page: 'https://x.io/html/money-score.html?u=1', userId: 'abc', email: 'a@b.com', extra: { x: 1 } }, NOW);
  assert.deepStrictEqual(e, { day: '2026-10-04', page: 'html/money-score.html', topic: 'tax', rating: 'up', comment: 'great, [amount] felt right' });
});

test('sanitizeEvent: rejects empty and malformed events, and falls back on bad topics and ratings', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, { rating: 'meh' }, { comment: '   ' }, { comment: 5 }]) assert.strictEqual(F.sanitizeEvent(bad, NOW), null, JSON.stringify(bad));
  assert.strictEqual(F.sanitizeEvent({ rating: 'down', topic: 'hacking' }, NOW).topic, 'other');
  assert.strictEqual(F.sanitizeEvent({ comment: 'just words', rating: 'sideways' }, NOW).rating, null);
  assert.strictEqual(F.sanitizeEvent({ comment: 'x'.repeat(2000) }, NOW).comment.length, 500);
  assert.deepStrictEqual(F.sanitizeEvent({ rating: 'up' }, NOW), { day: '2026-10-04', page: 'unknown', topic: 'other', rating: 'up', comment: '' });
  for (const t of F.TOPICS) assert.strictEqual(F.sanitizeEvent({ rating: 'up', topic: t }, NOW).topic, t);
});

/* ── usage counters ─────────────────────────────────────────────────────────────────────────────────────── */
test('Usage.add: counts opens per page per day, immutably, with clean paths only', () => {
  let u = { days: {} };
  const before = JSON.stringify(u);
  u = F.Usage.add(u, '/html/money-score.html?x=1', NOW);
  u = F.Usage.add(u, '/html/money-score.html', NOW);
  u = F.Usage.add(u, '/html/tax.html', NOW);
  u = F.Usage.add(u, '/html/../etc.html', NOW);
  assert.deepStrictEqual(u.days['2026-10-04'], { 'html/money-score.html': 2, 'html/tax.html': 1, unknown: 1 });
  assert.strictEqual(JSON.stringify({ days: {} }), before);
  const next = F.Usage.add(u, '/html/tax.html', new Date(2026, 9, 5));
  assert.deepStrictEqual(next.days['2026-10-05'], { 'html/tax.html': 1 });
  assert.deepStrictEqual(u.days['2026-10-04'], { 'html/money-score.html': 2, 'html/tax.html': 1, unknown: 1 });      // the old object was not changed
  assert.deepStrictEqual(F.Usage.totals(next), { 'html/money-score.html': 2, 'html/tax.html': 2, unknown: 1 });
});

test('Usage.add: keeps only the latest 90 days and survives junk input', () => {
  let u = { days: {} };
  for (let d = 0; d < 120; d++) u = F.Usage.add(u, '/html/tax.html', new Date(2026, 0, 1 + d));
  const days = Object.keys(u.days).sort();
  assert.strictEqual(days.length, 90);
  assert.strictEqual(days[89], F.dayOf(new Date(2026, 0, 120)));
  for (const junk of [null, undefined, 5, 'x', { days: null }, { days: [] }, { days: { '2026-01-01': null } }]) assert.doesNotThrow(() => F.Usage.add(junk, '/html/tax.html', NOW));
});

/* ── buildReport ────────────────────────────────────────────────────────────────────────────────────────── */
const EV = (o) => Object.assign({ day: '2026-10-03', page: 'html/money-score.html', topic: 'money-score', rating: 'up', comment: 'ok' }, o);

test('buildReport: honours include flags, and nothing but the report fields appears', () => {
  const usage = { days: { '2026-10-03': { 'html/tax.html': 4 } } };
  const both = F.buildReport({ feedback: [EV()], usage, now: NOW, include: { feedback: true, usage: true } });
  assert.deepStrictEqual(Object.keys(both).sort(), ['app', 'feedback', 'generatedAt', 'kind', 'usage', 'v']);
  assert.deepStrictEqual([both.app, both.kind, both.v, both.generatedAt], ['FIN-OS', 'feedback-report', 1, '2026-10-04']);
  assert.strictEqual(both.feedback.length, 1);
  assert.deepStrictEqual(both.usage.days, { '2026-10-03': { 'html/tax.html': 4 } });
  assert.strictEqual(F.buildReport({ feedback: [EV()], usage, now: NOW, include: { feedback: true, usage: false } }).usage, null);
  assert.deepStrictEqual(F.buildReport({ feedback: [EV()], usage, now: NOW, include: { feedback: false, usage: true } }).feedback, []);
});

test('buildReport: re-sanitises, so an old stored comment with an amount can never leave', () => {
  const r = F.buildReport({ feedback: [EV({ comment: 'my salary is ₹1,20,000, mail me a@b.com' }), EV({ rating: 'meh', comment: '' })], now: NOW, include: { feedback: true } });
  assert.strictEqual(r.feedback.length, 1);
  assert.strictEqual(r.feedback[0].comment, 'my salary is [amount], mail me [email]');
  assert.doesNotMatch(JSON.stringify(r), /1,20,000|a@b\.com/);
});

test('buildReport: drops bad usage days and paths, caps absurd counts, and trims the feedback list', () => {
  const r = F.buildReport({ now: NOW, include: { feedback: true, usage: true }, feedback: Array.from({ length: 80 }, (_, i) => EV({ comment: 'c' + i })),
    usage: { days: { 'not-a-day': { 'html/tax.html': 1 }, '2026-10-02': { 'html/tax.html': 5, '/etc/passwd': 9, 'html/<x>.html': 3, 'html/a.html': -4, 'html/b.html': 9999999 } } } });
  assert.strictEqual(r.feedback.length, F.MAX_LOG);
  assert.deepStrictEqual(r.usage.days, { '2026-10-02': { 'html/tax.html': 5, 'html/b.html': 100000 } });
});

/* ── send: the only way anything could leave ────────────────────────────────────────────────────────────── */
function spy(ok = true) { const calls = []; const fn = async (url, init) => { calls.push({ url, init }); return { ok }; }; fn.calls = calls; return fn; }
const REPORT = { feedback: [EV()], usage: { days: { '2026-10-03': { 'html/tax.html': 4 } } } };
const yes = (...ids) => (id) => ids.includes(id);

test('send: with no consent, nothing is sent, ever, and fetch is never called', async () => {
  const f = spy();
  assert.deepStrictEqual(await F.send(REPORT, { consent: yes(), fetch: f, endpoint: 'https://inbox.example/x' }), { ok: false, reason: 'no-consent' });
  assert.deepStrictEqual(await F.send(REPORT, { consent: undefined, fetch: f, endpoint: 'https://inbox.example/x' }), { ok: false, reason: 'no-consent' });
  assert.deepStrictEqual(await F.send(REPORT, undefined), { ok: false, reason: 'no-consent' });
  assert.strictEqual(f.calls.length, 0);
});

test('send: with consent but no endpoint (today\'s reality), nothing is sent', async () => {
  const f = spy();
  assert.strictEqual(F.CONFIG.endpoint, null);                                              // the default: nothing can leave
  assert.deepStrictEqual(await F.send(REPORT, { consent: yes('feedback', 'usage'), fetch: f, endpoint: F.CONFIG.endpoint }), { ok: false, reason: 'no-endpoint' });
  for (const bad of ['', 'http://insecure.example/x', 'ftp://x', 'javascript:1', '//x.y']) assert.strictEqual((await F.send(REPORT, { consent: yes('feedback'), fetch: f, endpoint: bad })).reason, 'no-endpoint', bad);
  assert.strictEqual(f.calls.length, 0);
});

test('send: each section needs its own consent, and only consented sections are in the body', async () => {
  let f = spy();
  assert.deepStrictEqual(await F.send(REPORT, { consent: yes('feedback'), fetch: f, endpoint: 'https://inbox.example/x' }), { ok: true });
  let body = JSON.parse(f.calls[0].init.body);
  assert.strictEqual(body.feedback.length, 1); assert.strictEqual(body.usage, null);          // usage was in the report but was not consented to
  f = spy();
  await F.send(REPORT, { consent: yes('usage'), fetch: f, endpoint: 'https://inbox.example/x' });
  body = JSON.parse(f.calls[0].init.body);
  assert.deepStrictEqual(body.feedback, []); assert.ok(body.usage && body.usage.days['2026-10-03']);
  f = spy();
  await F.send(REPORT, { consent: yes('feedback', 'usage'), fetch: f, endpoint: 'https://inbox.example/x' });
  body = JSON.parse(f.calls[0].init.body);
  assert.ok(body.feedback.length === 1 && body.usage);
});

test('send: the request carries no cookies, no referrer, and nothing but the report', async () => {
  const f = spy();
  await F.send(REPORT, { consent: yes('feedback'), fetch: f, endpoint: 'https://inbox.example/x' });
  const { url, init } = f.calls[0];
  assert.strictEqual(url, 'https://inbox.example/x');
  assert.deepStrictEqual([init.method, init.credentials, init.referrerPolicy, init.keepalive], ['POST', 'omit', 'no-referrer', true]);
  assert.deepStrictEqual(Object.keys(JSON.parse(init.body)).sort(), ['app', 'feedback', 'generatedAt', 'kind', 'usage', 'v']);
});

test('send: failures are reported honestly, and an empty report sends nothing', async () => {
  assert.deepStrictEqual(await F.send(REPORT, { consent: yes('feedback'), fetch: spy(false), endpoint: 'https://i.example/x' }), { ok: false, reason: 'rejected' });
  assert.deepStrictEqual(await F.send(REPORT, { consent: yes('feedback'), fetch: async () => { throw new Error('offline'); }, endpoint: 'https://i.example/x' }), { ok: false, reason: 'network' });
  assert.deepStrictEqual(await F.send(REPORT, { consent: yes('feedback'), fetch: undefined, endpoint: 'https://i.example/x' }), { ok: false, reason: 'no-network' });
  const f = spy();
  assert.deepStrictEqual(await F.send({ feedback: [], usage: null }, { consent: yes('feedback'), fetch: f, endpoint: 'https://i.example/x' }), { ok: false, reason: 'nothing-to-send' });
  assert.deepStrictEqual(await F.send({ feedback: [{ rating: 'meh' }] }, { consent: yes('feedback'), fetch: f, endpoint: 'https://i.example/x' }), { ok: false, reason: 'nothing-to-send' });
  assert.strictEqual(f.calls.length, 0);
});

/* ── summarize: what the team sees ──────────────────────────────────────────────────────────────────────── */
test('summarize: counts ratings by topic and page, dedupes comments, totals usage, skips malformed reports', () => {
  const a = F.buildReport({ now: NOW, include: { feedback: true, usage: true }, feedback: [EV({ rating: 'up', topic: 'tax', comment: 'clear' }), EV({ rating: 'down', topic: 'tax', comment: 'confusing slab note' }), EV({ rating: 'up', topic: 'money-score', comment: '' })],
    usage: { days: { '2026-10-02': { 'html/tax.html': 3 }, '2026-10-03': { 'html/tax.html': 2, 'html/money-score.html': 5 } } } });
  const b = F.buildReport({ now: NOW, include: { feedback: true, usage: true }, feedback: [EV({ rating: 'down', topic: 'tax', comment: 'confusing slab note' })], usage: { days: { '2026-10-03': { 'html/tax.html': 1 } } } });
  const s = F.summarize([a, b, null, {}, { app: 'other', kind: 'feedback-report', v: 1, feedback: [] }, { app: 'FIN-OS', kind: 'feedback-report', v: 2, feedback: [] }, 'x']);
  assert.deepStrictEqual([s.reports, s.skipped], [2, 5]);
  assert.deepStrictEqual([s.feedback.total, s.feedback.up, s.feedback.down], [4, 2, 2]);
  assert.deepStrictEqual(s.feedback.byTopic.tax, { up: 1, down: 2, comments: 3 });
  assert.deepStrictEqual(s.feedback.byTopic['money-score'], { up: 1, down: 0, comments: 0 });
  assert.strictEqual(s.comments.filter((c) => c.comment === 'confusing slab note').length, 1);   // the same note from two people counts once
  assert.deepStrictEqual(s.usage.byPage, { 'html/tax.html': 6, 'html/money-score.html': 5 });
  assert.strictEqual(s.usage.days, 2);
});

test('summarize: a hostile report cannot smuggle an amount, an odd path or a huge count into the team\'s view', () => {
  const evil = { app: 'FIN-OS', kind: 'feedback-report', v: 1, generatedAt: '2026-10-04',
    feedback: [{ day: '2026-10-03', page: 'https://evil.io/x.html', topic: 'tax', rating: 'down', comment: 'salary ₹9,00,000 pan ABCDE1234F' }],
    usage: { days: { '2026-10-03': { 'html/tax.html': 99999999999, '/etc/passwd': 5 } } } };
  const s = F.summarize([evil]);
  assert.strictEqual(s.comments[0].comment, 'salary [amount] pan [id]');
  assert.strictEqual(s.comments[0].page, 'unknown');
  assert.deepStrictEqual(s.usage.byPage, { 'html/tax.html': 100000 });
  assert.deepStrictEqual(F.summarize(null).reports, 0);
  assert.deepStrictEqual(F.summarize([]).feedback.total, 0);
});

/* ── the team-side script, run as a real process ───────────────────────────────────────────────────────── */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const CLI = path.join(__dirname, '..', 'scripts', 'summarize-feedback.js');

function withReports(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finos-fb-'));
  try {
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
    return fn(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const rep = (events, usage) => F.buildReport({ now: NOW, include: { feedback: true, usage: !!usage }, feedback: events, usage });

test('CLI: summarises a folder of reports into a readable summary and exits 0', () => {
  withReports({
    'a.json': rep([EV({ rating: 'up', topic: 'tax', comment: 'clear' }), EV({ rating: 'down', topic: 'tax', comment: 'slab note confusing' })], { days: { '2026-10-03': { 'html/tax.html': 3 } } }),
    'b.json': rep([EV({ rating: 'down', topic: 'money-score', comment: '' })]),
    'ignore.txt': 'not a report',
  }, (dir) => {
    const r = run(dir);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /Reports read: 2/);
    assert.match(r.stdout, /Feedback: 3 items, 1 positive, 2 negative \(33% positive\)/);
    assert.match(r.stdout, /tax\s+1 \/\s+1 \/\s+2\s+50% positive/);                       // 1 up, 1 down, 2 comments
    assert.match(r.stdout, /\[2026-10-03\] tax - {2}slab note confusing/);
    assert.match(r.stdout, /3 {2}html\/tax\.html/);                                         // usage line
  });
});

test('CLI: --json prints the same numbers as JSON, and individual files work', () => {
  withReports({ 'a.json': rep([EV({ rating: 'up', topic: 'arya', comment: 'nice' })]) }, (dir) => {
    const r = run('--json', path.join(dir, 'a.json'));
    assert.strictEqual(r.status, 0);
    const s = JSON.parse(r.stdout);
    assert.deepStrictEqual([s.reports, s.feedback.total, s.feedback.up], [1, 1, 1]);
  });
});

test('CLI: exits 1 with a message when there is nothing valid, skips a corrupt file, and needs arguments', () => {
  withReports({ 'bad.json': '{ not json', 'wrong.json': { hello: 1 } }, (dir) => {
    const r = run(dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /bad\.json: not valid JSON/);
    assert.match(r.stdout, /Reports read: 0 \(skipped 2/);                                      // the corrupt file and the one that is not a report
  });
  assert.strictEqual(run().status, 1);
  assert.match(run().stderr, /Usage:/);
  assert.match(run('/no/such/file.json').stderr, /Not found/);
});

test('CLI: a tampered report cannot put an amount, an email or an odd path in front of the team', () => {
  const evil = { app: 'FIN-OS', kind: 'feedback-report', v: 1, generatedAt: '2026-10-04',
    feedback: [{ day: '2026-10-03', page: 'https://evil.io/x', topic: 'tax', rating: 'down', comment: 'I earn ₹18,00,000, mail a@b.com or 9876543210' }],
    usage: { days: { '2026-10-03': { '/etc/passwd': 4, 'html/tax.html': 2 } } } };
  withReports({ 'evil.json': evil }, (dir) => {
    const out = run(dir).stdout;
    assert.match(out, /I earn \[amount\], mail \[email\] or \[number\]/);
    assert.doesNotMatch(out, /18,00,000|a@b\.com|9876543210|passwd|evil\.io/);
  });
});
