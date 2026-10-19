// Release configuration guards: identifiers, wiring of the brand assets, permissions that the stores will see, the
// update policy, and that no secret is committed. Complements privacy.test.mts (which owns the permission LIST).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const pkg = JSON.parse(read('package.json'));
const pluginName = (p: any) => (Array.isArray(p) ? p[0] : p) as string;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(root, dir))) {
    if (['node_modules', '.expo', '__tests__', 'dist', 'android', 'ios'].includes(name)) continue;
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) sources(rel, out);
    else if (/\.(tsx?|js)$/.test(name)) out.push(rel);
  }
  return out;
}

test('identifiers: one reverse-DNS id for both stores, a semantic version, a scheme', () => {
  assert.equal(app.ios.bundleIdentifier, app.android.package);
  assert.match(app.android.package, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
  assert.match(app.version, /^\d+\.\d+\.\d+$/);
  assert.equal(app.scheme, 'finos');
  assert.equal(app.slug, 'finos-mobile');
});

test('version strategy: the build number / version code is owned by EAS, never hand-edited here', () => {
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(app.ios.buildNumber, undefined, 'a hard-coded ios.buildNumber would fight EAS remote versioning');
  assert.equal(app.android.versionCode, undefined, 'a hard-coded android.versionCode would fight EAS remote versioning');
});

test('update policy: no over-the-air updates are configured, so every change reaches users through a store review', () => {
  assert.equal(app.updates, undefined);
  assert.equal(app.runtimeVersion, undefined);
  assert.equal(pkg.dependencies['expo-updates'], undefined, 'adding expo-updates needs a runtimeVersion policy and an update-channel decision');
  for (const [name, profile] of Object.entries<any>(eas.build)) assert.equal(profile.channel, undefined, `${name} sets an update channel`);
});

test('production is an Android App Bundle (Play requires .aab), preview an installable APK', () => {
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.production.distribution, undefined, 'production must use the default (store) distribution');
});

test('every build profile reads its variables from an EAS environment, so no value is committed', () => {
  for (const name of ['development', 'preview', 'production']) assert.equal(eas.build[name].environment, name);
  const text = read('eas.json') + read('app.json');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(text), 'a JWT-looking value is committed');
  assert.ok(!/service_role|sk_live|sk_test|AIza[0-9A-Za-z_-]{20,}|BEGIN (RSA )?PRIVATE KEY/.test(text));
  assert.equal(eas.submit.production.android.releaseStatus, 'draft', 'first submissions stay drafts until the owner promotes them');
});

test('.env.example documents every EXPO_PUBLIC variable the code reads, and holds no real value', () => {
  const example = read('.env.example');
  const used = new Set<string>();
  for (const f of [...sources('app'), ...sources('lib'), ...sources('hooks'), ...sources('components'), ...sources('constants')]) {
    for (const m of read(f).matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) used.add(m[1]);
  }
  assert.ok(used.has('EXPO_PUBLIC_SUPABASE_URL') && used.has('EXPO_PUBLIC_SUPABASE_ANON_KEY'));
  const optional = new Set(['EXPO_PUBLIC_GOOGLE_SIGNIN']);   // off unless the owner has allow-listed the redirect URL in Supabase
  for (const v of used) assert.ok(example.includes(v) || optional.has(v), `${v} is read by the code but not documented in .env.example`);
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(example), '.env.example contains a real-looking key');
  assert.match(example, /anon/i);
});

test('icon, splash, adaptive icon and notification icon files exist and are the ones app.json points at', () => {
  const refs: string[] = [app.icon, app.android.adaptiveIcon.foregroundImage, app.android.adaptiveIcon.backgroundImage,
    app.android.adaptiveIcon.monochromeImage, app.web.favicon];
  const plug = (app.plugins as any[]).find(p => pluginName(p) === 'expo-notifications');
  refs.push(plug[1].icon);
  const splashPlug = (app.plugins as any[]).find(p => pluginName(p) === 'expo-splash-screen');
  refs.push(splashPlug[1].image);
  for (const r of refs) {
    assert.ok(r && existsSync(path.join(root, r)), `${r} is missing`);
    assert.match(r, /^\.\/assets\//);
  }
  // Expo SDK 54+ rejects a top-level `splash`: the expo-splash-screen plugin is the only place it is set, so two splash colours cannot exist.
  assert.equal((app as any).splash, undefined, 'a top-level splash would be a second, possibly different, splash definition');
  assert.equal(app.android.adaptiveIcon.backgroundColor, splashPlug[1].backgroundColor, 'the launch screen and the icon background must be the same colour');
  assert.equal(plug[1].color, '#00D4FF');
});

test('permissions as the stores will see them: dangerous ones are blocked explicitly, iOS asks for no capability beyond Face ID', () => {
  const blocked: string[] = app.android.blockedPermissions;
  for (const p of ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW']) {
    assert.ok(blocked.includes(`android.permission.${p}`), `${p} should be blocked (a library manifest adds it otherwise)`);
  }
  for (const p of app.android.permissions) assert.ok(!blocked.includes(p), `${p} is both requested and blocked`);
  assert.equal(app.android.allowBackup, false, 'Android auto-backup would copy the app storage to Google Drive outside the encrypted backup feature');
  assert.deepEqual(Object.keys(app.ios.infoPlist ?? {}), []);
  const lac = (app.plugins as any[]).find(p => pluginName(p) === 'expo-local-authentication');
  assert.match(lac[1].faceIDPermission, /only to unlock/);
  const av = (app.plugins as any[]).find(p => pluginName(p) === 'expo-av');
  if (av) assert.equal(av[1].microphonePermission, false);
});

test('the local-notifications-only plugin exists and runs AFTER expo-notifications (it is listed first: Expo runs the last plugin\'s mods first)', () => {
  const names = (app.plugins as any[]).map(pluginName);
  const mine = names.indexOf('./plugins/withLocalNotificationsOnly');
  assert.ok(mine >= 0, 'plugin is not registered');
  assert.ok(mine < names.indexOf('expo-notifications'), 'it must be listed before expo-notifications');
  assert.ok(existsSync(path.join(root, 'plugins/withLocalNotificationsOnly.js')));
  assert.match(read('plugins/withLocalNotificationsOnly.js'), /delete c\.modResults\['aps-environment'\]/);
});

test('every config plugin that is a package is a dependency (EAS would fail the build otherwise)', () => {
  for (const n of (app.plugins as any[]).map(pluginName)) {
    if (n.startsWith('.')) continue;
    assert.ok(pkg.dependencies[n], `${n} is a plugin but not in package.json dependencies`);
  }
});

test('no push token is requested and no remote-push capability is declared', () => {
  assert.ok(!('aps-environment' in (app.ios.entitlements ?? {})));
});
