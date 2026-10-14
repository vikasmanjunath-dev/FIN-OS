import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineReply, OFFLINE_ACTIONS } from '../lib/aryaOffline.ts';
import { SCREENS } from '../lib/search.ts';

test('the offline reply is plain language: no ports or developer hints in a production build', () => {
  const t = offlineReply('unreachable', false);
  assert.ok(!/7475|arya-ai|\bserver\b|\bport\b|backend/i.test(t), t);
  assert.match(t, /cannot reach Arya/);
  OFFLINE_ACTIONS.forEach(a => assert.ok(t.includes(a.label)));
});

test('timeout and developer variants', () => {
  assert.match(offlineReply('timeout'), /taking too long/);
  assert.match(offlineReply('unreachable', true), /Developer note.*7475/);
});

test('every offline action points at a real screen', () => {
  const known = new Set(SCREENS.map(s => s.route));
  OFFLINE_ACTIONS.forEach(a => assert.ok(known.has(a.route), a.route));
});

test('the chat hook uses this reply instead of its own string', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../hooks/useAryaChat.ts'), 'utf8');
  assert.ok(!/port 7475/.test(src));
  // the hook goes through localOnlyReply (lib/aryaTools.ts), which wraps offlineReply and adds the questions that work offline
  assert.match(src, /localOnlyReply\(/);
  const tools = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/aryaTools.ts'), 'utf8');
  assert.match(tools, /offlineReply\(/);
});
