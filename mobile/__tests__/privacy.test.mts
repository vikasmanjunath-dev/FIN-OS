// The privacy notice must stay true: the app may only talk to hosts, and ask for permissions, that the notice describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as privacy from '@/lib/privacy';
import { isSyncKey } from '@/lib/trackerSync';
import { isBackupKey } from '@/lib/backup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    if (['node_modules', '.expo', '__tests__'].includes(name)) continue;
    const st = statSync(path.join(root, rel));
    if (st.isDirectory()) sources(rel, out);
    else if (/\.(tsx?|json)$/.test(name) && !/package(-lock)?\.json$/.test(name)) out.push(rel);
  }
  return out;
}

test('every flow is complete and says what is sent, when, and how to control it', () => {
  assert.ok(privacy.FLOWS.length >= 4);
  const ids = new Set<string>();
  for (const f of privacy.FLOWS) {
    assert.ok(!ids.has(f.id), `duplicate flow ${f.id}`);
    ids.add(f.id);
    for (const k of ['title', 'when', 'sent', 'control'] as const) assert.ok(f[k].trim().length > 10, `${f.id}.${k} is empty`);
  }
  assert.equal(privacy.FLOWS.find(f => f.id === 'device')?.optional, false);
  assert.equal(privacy.FLOWS.find(f => f.id === 'account')?.optional, true);
});

test('the app code references no external host the notice does not cover', () => {
  // Hosts the notice names: the Supabase project (from env), the user's own Arya backend (Settings), and the public
  // market-data providers that backend talks to. Anything else appearing in app source is a new data flow.
  const covered = /supabase\.co|localhost|127\.0\.0\.1|10\.0\.2\.2|finos1\.vercel\.app|expo\.dev|reactnative\.dev|github\.com|w3\.org|schemas\.android\.com/;
  const offenders: string[] = [];
  for (const f of [...sources('app'), ...sources('components'), ...sources('hooks'), ...sources('lib'), ...sources('constants')]) {
    if (f.endsWith('privacy.ts') || f.endsWith('statementImport.ts')) continue;   // the notice itself; sample text in the importer's comments
    for (const m of read(f).matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
      const line = read(f).slice(0, m.index).split('\n').length;
      if (!covered.test(m[1])) offenders.push(`${f}:${line} ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'new hosts need a flow in lib/privacy.ts');
});

test('app.json asks only for the network and local notifications (no mic, camera, speech, location or push token)', () => {
  const app = JSON.parse(read('app.json')).expo;
  assert.deepEqual(app.android.permissions, ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS', 'android.permission.USE_BIOMETRIC']);
  assert.deepEqual(Object.keys(app.ios.infoPlist ?? {}), []);
  const plugins = (app.plugins as any[]).map(p => (Array.isArray(p) ? p[0] : p));
  // expo-av was installed but unused and has been removed. If it ever comes back, Expo applies its config plugin on its own: that adds
  // RECORD_AUDIO (Android) and NSMicrophoneUsageDescription (iOS), so it may only be listed with the microphone switched off, and
  // Android blocks the permission in the merged manifest too (verified with `expo prebuild`, see docs/RELEASE_RUNBOOK.md).
  const av = (app.plugins as any[]).find(p => (Array.isArray(p) ? p[0] : p) === 'expo-av');
  if (av) assert.equal(Array.isArray(av) ? av[1]?.microphonePermission : undefined, false, 'expo-av adds a microphone permission unless it is switched off');
  assert.ok((app.android.blockedPermissions ?? []).includes('android.permission.RECORD_AUDIO'), 'RECORD_AUDIO must be blocked in the merged manifest');
  // app.json lists what this app asks for itself. The built app also carries what the libraries' own Android manifests add, and the
  // notice must name those too: USE_FINGERPRINT (expo-local-authentication), VIBRATE (expo-haptics), RECEIVE_BOOT_COMPLETED (expo-notifications).
  assert.deepEqual(privacy.PERMISSIONS, [
    'Internet access',
    'Notifications (only if you turn reminders on)',
    'Fingerprint or face (only if you turn on app lock with it)',
    'Vibration (haptic feedback)',
    'Run at start-up (to keep reminders after a restart)',
  ]);
  for (const [lib, perm] of [['expo-local-authentication', 'USE_FINGERPRINT'], ['expo-haptics', 'VIBRATE'], ['expo-notifications', 'RECEIVE_BOOT_COMPLETED']] as const) {
    assert.match(read(`node_modules/${lib}/android/src/main/AndroidManifest.xml`), new RegExp(perm), `${lib} no longer declares ${perm}: update PERMISSIONS`);
  }
  // Reminders are scheduled on the device. Requesting a push token would send an identifier to a push service.
  for (const f of [...sources('app'), ...sources('components'), ...sources('hooks'), ...sources('lib')]) {
    assert.ok(!/getExpoPushTokenAsync|getDevicePushTokenAsync|addPushTokenListener/.test(read(f)), `${f} requests a push token`);
  }
});

test('no analytics, advertising or crash-reporting SDK is a dependency', () => {
  const deps = Object.keys({ ...JSON.parse(read('package.json')).dependencies });
  const banned = deps.filter(d => /analytics|sentry|firebase|amplitude|mixpanel|segment|crashlytics|posthog|bugsnag|appsflyer|adjust|facebook|admob/i.test(d));
  assert.deepEqual(banned, []);
});

test('the importer, tools and sync never contact a server: only these modules may call fetch', () => {
  const callers = sources('lib').concat(sources('hooks'), sources('app'), sources('components'))
    .filter(f => /(?:await\s+|return\s+|=\s*|\(\s*|\[\s*|,\s*)fetch\(/.test(read(f)))   // calls of the global fetch(); a method named fetch is not a network call
    .map(f => f.replace(/\\/g, '/'))
    .sort();
  // Anything new that calls fetch() must be described by a flow (backend host or file read) — update the notice, then this list.
  assert.deepEqual(callers, [
    'app/tracker/holdings-import.tsx',   // reads the chosen local file (file:// or blob:) — not a network call
    'app/tracker/import.tsx',            // same: the chosen statement file
    'hooks/useAryaChat.ts',
    'hooks/useMarketData.ts',
    'hooks/useSectors.ts',
    'lib/holdingsStore.ts',
  ]);
});

test('the data inventory tells the truth about sync: "never synced" items are not sync keys, "syncs" items are', () => {
  for (const d of privacy.DATA_ITEMS) {
    if (/never (uploaded or )?synced/.test(d.label)) assert.equal(isSyncKey(d.key), false, `${d.key} says it is never synced but tracker sync would upload it`);
    if (/syncs (like|with)/.test(d.label)) assert.equal(isSyncKey(d.key), true, `${d.key} says it syncs but sync excludes it`);
    if (/not exported or backed up/.test(d.label)) assert.equal(isBackupKey(d.key), false, `${d.key} would be in a backup`);
  }
  const keys = privacy.DATA_ITEMS.map(d => d.key);
  assert.equal(new Set(keys).size, keys.length, 'a key is listed twice');
});

test('every flow that opens another party\'s site or file is described: news links open the publisher in the in-app browser', () => {
  assert.ok(privacy.FLOWS.some(f => f.id === 'news-links'));
  assert.match(read('app/market/news.tsx'), /WebBrowser\.openBrowserAsync/);
  // the only places that open a web page outside the app
  const openers = [...sources('app'), ...sources('components'), ...sources('hooks'), ...sources('lib')]
    .filter(f => /openBrowserAsync|Linking\.openURL/.test(read(f))).map(f => f.replace(/\\/g, '/')).sort();
  assert.deepEqual(openers, ['app/market/news.tsx']);
});

test('the Arya flow names what goes with a question, what is off by default, and the fund search term', () => {
  const a = privacy.FLOWS.find(f => f.id === 'arya')!;
  assert.match(a.sent, /question as you typed it/);
  assert.match(a.sent, /off until you do/);
  assert.match(a.sent, /fund-name search words/);
  assert.match(a.control, /mfapi\.in/);
});

test('describeStored: counts list entries, says "saved" for values, and hides empty ones', () => {
  assert.equal(privacy.describeStored('[{"a":1},{"a":2}]', 'list'), '2');
  assert.equal(privacy.describeStored('[]', 'list'), null);
  assert.equal(privacy.describeStored(null, 'value'), null);
  assert.equal(privacy.describeStored('{"limits":{}}', 'value'), 'saved');
  assert.equal(privacy.describeStored('not json', 'list'), 'saved');
});

test('terms: operator details are not invented, and the draft status is stated', () => {
  assert.equal(privacy.ENTITY.name, null);
  assert.match(privacy.TERMS_STATUS, /Draft for legal review/);
  assert.ok(privacy.TERMS.some(s => /not SEBI registered/.test(s.body.join(' '))));
  assert.ok(privacy.TERMS.some(s => /Operator: not set yet/.test(s.body.join(' '))));
});
