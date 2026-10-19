// The Home screen stays short and calm; nothing that used to be on it is lost (it moved to "All tools").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const home = fs.readFileSync(path.join(root, 'app/(tabs)/dashboard.tsx'), 'utf8');
const all = fs.readFileSync(path.join(root, 'app/tools/all.tsx'), 'utf8');
const before = fs.readFileSync(path.join(root, '..', 'docs/audit/baseline/sdk-upgrade/dashboard.tsx.before-calm'), 'utf8');
const routesIn = (src: string) => new Set([...src.matchAll(/(?:open|router\.(?:push|navigate))\(\s*'([^']+)'/g)].map(m => m[1]));

test('Home has a handful of sections, not a dozen', () => {
  const sections = [...home.matchAll(/styles\.sectionTitle\}>([^<]+)</g)].map(m => m[1]);
  assert.ok(sections.length <= 3, `Home sections: ${sections.join(', ')}`);
  assert.doesNotMatch(home, /Money Tools|Retirement & Protection|Recurring Costs|Plan, Learn/);
  const tiles = (home.match(/<(?:MetricCard|ToolRow|StatRow)\b/g) ?? []).length;
  assert.ok(tiles <= 10, `Home shows ${tiles} tiles/rows`);
});

test('every destination the old Home linked to is still reachable from Home or All tools', () => {
  const now = new Set([...routesIn(home), ...routesIn(all)]);
  const tabs = new Set(['/(tabs)/arya', '/(tabs)/markets', '/(tabs)/portfolio', '/(tabs)/track']);   // the tab bar already holds these
  const lost = [...routesIn(before)].filter(r => !now.has(r) && !tabs.has(r));
  assert.deepEqual(lost, []);
});

test('Home links to All tools, and All tools offers search', () => {
  assert.match(home, /open\('\/tools\/all'\)/);
  assert.match(all, /open\('\/search'\)/);
});
