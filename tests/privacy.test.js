// FinosPrivacy — the registry behind the privacy notice, and the guard that keeps it honest.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/finos-privacy.js');

const ROOT = path.join(__dirname, '..');
const SCAN = [['js', /\.js$/], ['html', /\.html$/], ['css', /\.css$/]];

function sources() {
  const files = [];
  for (const [dir, re] of SCAN) for (const f of fs.readdirSync(path.join(ROOT, dir))) if (re.test(f)) files.push(path.join(dir, f));
  ['index.html', 'login.html', 'sw.js', 'manifest.json'].forEach((f) => fs.existsSync(path.join(ROOT, f)) && files.push(f));
  return files;
}

test('every host the app references is covered by the privacy registry (a new network dependency cannot ship unnoticed)', () => {
  const missing = {};
  for (const file of sources()) {
    for (const host of P.hostsOf(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      if (!P.flowFor(host)) (missing[host] = missing[host] || []).push(file);
    }
  }
  const lines = Object.entries(missing).map(([h, fs_]) => `  ${h}  (${[...new Set(fs_)].slice(0, 3).join(', ')})`);
  assert.deepStrictEqual(lines, [], 'These hosts are referenced in the code but not described in js/finos-privacy.js, so html/privacy.html would be silent about them:\n' + lines.join('\n'));
});

test('the scan itself works: it finds the known hosts, so "nothing missing" is not an empty scan', () => {
  const found = new Set();
  for (const file of sources()) P.hostsOf(fs.readFileSync(path.join(ROOT, file), 'utf8')).forEach((h) => found.add(h));
  assert.ok(found.size >= 20, 'expected 20+ distinct hosts, found ' + found.size);
  for (const known of ['fonts.googleapis.com', 'cdn.jsdelivr.net', 'api.allorigins.win', 'query1.finance.yahoo.com']) assert.ok(found.has(known), known + ' should be found in the source');
  assert.ok([...found].some((h) => /supabase\.co$/.test(h)));
});

test('a host that is not in the registry is reported, so the guard can fail', () => {
  const text = '<script src="https://new-tracker.example.com/t.js"></script> fetch("https://api.allorigins.win/raw")';
  const hosts = P.hostsOf(text);
  assert.deepStrictEqual(hosts.sort(), ['api.allorigins.win', 'new-tracker.example.com']);
  assert.deepStrictEqual(hosts.filter((h) => !P.flowFor(h)), ['new-tracker.example.com']);
});

test('flowFor: exact hosts, subdomains and local addresses match; lookalikes never do', () => {
  assert.strictEqual(P.flowFor('fonts.googleapis.com').id, 'assets');
  assert.strictEqual(P.flowFor('WWW.Fonts.GoogleAPIs.com').id, 'assets');                 // case and www ignored
  assert.strictEqual(P.flowFor('oeapcyucnduhwpgxfknb.supabase.co').id, 'account');         // any project subdomain
  assert.strictEqual(P.flowFor('api.allorigins.win').id, 'proxy');
  assert.strictEqual(P.flowFor('query1.finance.yahoo.com').id, 'market');
  for (const h of ['localhost', '127.0.0.1', '[::1]']) assert.strictEqual(P.flowFor(h).id, 'ai', h);
  for (const bad of ['notsupabase.co', 'supabase.co.evil.com', 'evil-allorigins.win', 'fonts.googleapis.com.attacker.io', '', null, undefined, 'google.com']) {
    assert.strictEqual(P.flowFor(bad), null, String(bad));
  }
});

test('hostsOf: ports, local addresses and noise are handled', () => {
  assert.deepStrictEqual(P.hostsOf('fetch("http://localhost:8001/api"); http://127.0.0.1:11434/x'), ['localhost', '127.0.0.1']);
  assert.deepStrictEqual(P.hostsOf('`https://${host}/path` and https://www.w3.org/2000/svg'), ['www.w3.org']);   // template placeholders skipped
  assert.deepStrictEqual(P.hostsOf('see https://example.com.'), ['example.com']);                                 // trailing sentence dot
  assert.deepStrictEqual(P.hostsOf('no urls here, just ../js/app.js and /html/page.html'), []);
  assert.deepStrictEqual(P.hostsOf(null), []);
});

test('every flow is complete and honest about personal data', () => {
  const ids = new Set();
  for (const f of P.FLOWS) {
    assert.ok(!ids.has(f.id), 'duplicate id ' + f.id); ids.add(f.id);
    assert.ok(typeof f.title === 'string' && f.title.length >= 5, f.id + '.title');
    assert.ok(typeof f.purpose === 'string' && f.purpose.length > 20, f.id + '.purpose');
    for (const k of ['sent', 'control']) assert.ok(typeof f[k] === 'string' && f[k].length >= 8, f.id + '.' + k);     // short answers like "Nothing." are fine
    assert.ok(Array.isArray(f.hosts) && typeof f.personal === 'boolean' && typeof f.optional === 'boolean', f.id);
    assert.ok(['device', 'asset', 'account', 'market', 'proxy', 'local', 'link'].includes(f.kind), f.id);
  }
  // only the flows that carry the user's own data may say so, and a content-delivery host never does
  const personal = P.FLOWS.filter((f) => f.personal).map((f) => f.id).sort();
  assert.deepStrictEqual(personal, ['account', 'ai', 'device']);
  assert.strictEqual(P.FLOWS.find((f) => f.id === 'device').hosts.length, 0);
  assert.match(P.FLOWS.find((f) => f.id === 'device').sent, /Nothing/);
  assert.match(P.FLOWS.find((f) => f.id === 'aa').purpose, /does not connect to them today/);       // no claim of an integration that does not exist
});

test('the notice names no company, address or officer until the business details exist', () => {
  assert.deepStrictEqual(P.ENTITY, { name: null, address: null, grievanceOfficer: null, grievanceEmail: null });
});

/* ── consent records ─────────────────────────────────────────────────────────────────────────────────────── */
function withStorage(fn) {
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  try { return fn(mem); } finally { delete globalThis.localStorage; }
}

test('consent: everything is off by default, and only a recorded yes for a known purpose counts', () => {
  withStorage(() => {
    P.PURPOSES.forEach((p) => assert.strictEqual(P.consent.get(p.id), false, p.id));
    assert.strictEqual(P.consent.get('nonsense'), false);
    assert.strictEqual(P.consent.set('nonsense', true), false);                  // unknown purposes cannot be consented to
    assert.strictEqual(P.consent.set('feedback', true), true);
    assert.strictEqual(P.consent.get('feedback'), true);
    assert.strictEqual(P.consent.get('usage'), false);                            // one yes never implies another
  });
});

test('consent: withdrawing is as easy as giving, and the record keeps when it changed', () => {
  withStorage((mem) => {
    P.consent.set('usage', true);
    const rec = JSON.parse(mem.finos_consents).usage;
    assert.ok(rec.granted === true && !Number.isNaN(Date.parse(rec.at)) && rec.v === P.VERSION);
    P.consent.set('usage', false);
    assert.strictEqual(P.consent.get('usage'), false);
    assert.strictEqual(JSON.parse(mem.finos_consents).usage.granted, false);
    P.consent.set('feedback', true); P.consent.set('usage', true);
    P.consent.withdrawAll();
    assert.ok(P.PURPOSES.every((p) => P.consent.get(p.id) === false));
  });
});

test('consent: only a literal true counts, and an old wording version never inherits a yes', () => {
  withStorage((mem) => {
    mem.finos_consents = JSON.stringify({ feedback: { granted: 'yes', at: '2026-01-01', v: P.VERSION }, usage: { granted: true, at: '2026-01-01', v: P.VERSION - 1 } });
    assert.strictEqual(P.consent.get('feedback'), false);                         // truthy but not true
    assert.strictEqual(P.consent.get('usage'), false);                            // recorded for an older version of the wording
    assert.strictEqual(P.consent.set('feedback', 'yes'), true);
    assert.strictEqual(P.consent.get('feedback'), false);                         // set() records a yes only for literal true
  });
});

test('consent: corrupt or missing storage reads as "no" and never throws', () => {
  withStorage((mem) => {
    for (const junk of ['{not json', '[]', '"str"', 'null', '5']) { mem.finos_consents = junk; assert.strictEqual(P.consent.get('feedback'), false, junk); }
  });
  assert.strictEqual(P.consent.get('feedback'), false);                           // no localStorage at all
  assert.strictEqual(P.consent.set('feedback', true), false);                     // cannot record without storage, and says so
});

test('consent: all() lists every purpose with its state for the settings page', () => {
  withStorage(() => {
    P.consent.set('feedback', true);
    const all = P.consent.all();
    assert.deepStrictEqual(all.map((c) => c.id), P.PURPOSES.map((p) => p.id));
    assert.strictEqual(all.find((c) => c.id === 'feedback').granted, true);
    assert.ok(Date.parse(all.find((c) => c.id === 'feedback').at) > 0 && all.find((c) => c.id === 'usage').at === null);
  });
});

/* ── the Account Aggregator claim must stay true ──────────────────────────────────────────────────────────── */
test('the registry says FIN-OS does not connect to Account Aggregator providers only while the code really does not', () => {
  const aa = fs.readFileSync(path.join(ROOT, 'js', 'finos-aa.js'), 'utf8');
  const live = /const LIVE_ENABLED = (true|false);/.exec(aa);
  assert.ok(live, 'js/finos-aa.js must declare LIVE_ENABLED so this check can read it');
  const claim = /does not connect to them today/.test(P.FLOWS.find((f) => f.id === 'aa').purpose);
  assert.strictEqual(claim, live[1] === 'false',
    'LIVE_ENABLED is ' + live[1] + ' but the privacy registry ' + (claim ? 'still says FIN-OS does not connect to providers' : 'no longer says that') + '. Update the "aa" flow in js/finos-privacy.js (and the notice) when you change the flag.');
});

test('the statement importer makes no network call: its source contains no fetch, XHR, beacon, WebSocket or script injection', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'finos-statement-import.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const banned of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /\bimportScripts\b/, /createElement\(\s*['"]script/, /\.src\s*=(?!=)/, /https?:\/\//]) {                // .src = (an assignment), not t.src === 'import' (a provenance field)
    assert.doesNotMatch(src, banned, String(banned));
  }
  const page = fs.readFileSync(path.join(ROOT, 'html', 'import-statement.html'), 'utf8');
  const inline = (page.match(/<script>([\s\S]*?)<\/script>/g) || []).filter((x) => x.includes('FinosStatement')).join('\n');
  for (const banned of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/]) assert.doesNotMatch(inline, banned, 'page script: ' + String(banned));
});
