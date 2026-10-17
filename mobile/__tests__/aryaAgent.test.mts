// The tool loop: planning, the off switch, visible steps, failures, and that nothing is assumed or leaked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTurn, runCalls, composeAnswer, splitQuestion, MAX_CALLS, type ToolStep, type AgentEnv } from '../lib/aryaAgent.ts';
import { DEFAULT_PREFS } from '../lib/aryaMemoryStorage.ts';
import { makeFacts } from '../lib/aryaFacts.ts';
import { logSteps, getLog, clearLog } from '../lib/aryaAgentLog.ts';

const facts = makeFacts({ now: new Date(2026, 9, 14, 10, 0), data: { income: 100000, expense: 60000, cash: 200000 } });
let clock = 1000;
const env = (over: Partial<AgentEnv> = {}, seen: ToolStep[][] = []): AgentEnv => ({
  ctx: { facts }, prefs: DEFAULT_PREFS, nowMs: () => (clock += 10),
  callServer: async () => { throw new Error('should not be called'); },
  addMemory: async t => ({ ok: true, message: `Noted: ${t}` }), onSteps: s => seen.push(s), ...over,
});

test('tools off: nothing is planned, whatever the question', () => {
  for (const q of ['what is my net worth', 'price of RELIANCE', 'SIP of 10000 at 12% for 10 years']) assert.deepEqual(planTurn(q, { tools: false }), { kind: 'off' });
});

test('planning: one tool, several tools, advice, ambiguity, a missing symbol', () => {
  assert.deepEqual((planTurn('what is my net worth', DEFAULT_PREFS) as any).calls.map((c: any) => c.tool), ['net_worth']);
  assert.deepEqual((planTurn('what is my net worth and how is the nifty today', DEFAULT_PREFS) as any).calls.map((c: any) => c.tool), ['net_worth', 'market']);
  assert.equal(planTurn('should I buy reliance shares', DEFAULT_PREFS).kind, 'advice');
  assert.equal(planTurn('what is a SIP', DEFAULT_PREFS).kind, 'none');
  assert.match((planTurn('share price', DEFAULT_PREFS) as any).text, /Which share/);
  assert.deepEqual(splitQuestion('net worth and my emergency fund; my goals').length, 3);
  assert.deepEqual(splitQuestion('tax on 1,00,000'), []);
  const many = planTurn('my net worth and my goals and my debt and my emergency fund', DEFAULT_PREFS) as any;
  assert.ok(many.kind !== 'calls' || many.calls.length <= MAX_CALLS);
});

test('every call is reported as running before it finishes, then done, with its time and source', async () => {
  const seen: ToolStep[][] = [];
  const steps = await runCalls([{ tool: 'net_worth', args: {} }, { tool: 'savings_rate', args: {} }], env({}, seen));
  assert.equal(steps.length, 2);
  assert.equal(seen[0][0].status, 'running');
  assert.equal(seen[0].length, 1);
  assert.ok(seen.some(s => s.length === 2 && s[0].status === 'done' && s[1].status === 'running'));
  steps.forEach(s => { assert.equal(s.status, 'done'); assert.ok(s.source && s.asOf && s.endedAt! > s.startedAt); assert.equal(s.where, 'phone'); assert.match(s.sends, /Nothing leaves the phone/); });
  const a = composeAnswer(steps);
  assert.match(a.text, /\*\*Net worth\*\*/);
  assert.match(a.text, /From: Net Worth tracker.*As of 14 Oct, 10:00/s);
});

test('a server tool sends only its public arguments, is labelled with its time, and respects the online switch', async () => {
  const sent: any[] = [];
  const ok = env({ callServer: async c => { sent.push(c); return { result: { symbol: 'RELIANCE', price: 2500, change: 1, change_pct: 0.04 }, ts: 1792175330 }; } });
  const [s] = await runCalls([{ tool: 'quote', args: { symbol: 'RELIANCE' } }], ok);
  assert.deepEqual(sent.map(c => [c.name, c.args]), [['get_quote', { symbol: 'RELIANCE', exchange: 'NSE' }]]);
  assert.equal(s.where, 'server'); assert.equal(s.status, 'done'); assert.equal(s.asOf, 1792175330000);
  assert.match(s.sends, /RELIANCE/);
  const sent2: any[] = [];
  const [off] = await runCalls([{ tool: 'quote', args: { symbol: 'TCS' } }], env({ prefs: { ...DEFAULT_PREFS, online: false }, callServer: async c => { sent2.push(c); return { result: {}, ts: null }; } }));
  assert.equal(off.status, 'skipped'); assert.equal(sent2.length, 0); assert.match(off.note!, /stay on this phone/);
});

test('a server failure is a plain sentence, never a guessed price', async () => {
  const [s] = await runCalls([{ tool: 'quote', args: { symbol: 'TCS' } }], env({ callServer: async () => { throw new Error('network down'); } }));
  assert.equal(s.status, 'failed'); assert.match(s.note!, /I will not guess one/);
  const [bad] = await runCalls([{ tool: 'quote', args: { symbol: 'TCS' } }], env({ callServer: async () => ({ result: { error: 'Could not fetch quote' }, ts: null }) }));
  assert.equal(bad.status, 'failed'); assert.match(bad.note!, /Could not fetch quote/);
  assert.match(composeAnswer([s]).text, /could not be reached/);
});

test('remembering a note goes through the memory store\'s rules and is shown as a call', async () => {
  const [ok] = await runCalls([{ tool: 'memory_add', args: { text: 'i prefer index funds' } }], env());
  assert.equal(ok.status, 'done'); assert.match(ok.args, /index funds/);
  const [no] = await runCalls([{ tool: 'memory_add', args: { text: 'my otp is 123456' } }], env({ addMemory: async () => ({ ok: false, message: 'I do not keep a password, PIN or OTP.' }) }));
  assert.equal(no.status, 'failed');
});

test('a stopped turn runs nothing further', async () => {
  const c = new AbortController(); c.abort();
  const steps = await runCalls([{ tool: 'net_worth', args: {} }], env({ signal: c.signal }));
  assert.equal(steps[0].status, 'skipped');
});

test('the session log updates a step in place and keeps newest first', () => {
  clearLog();
  const a = { id: 'a', tool: 'net_worth', label: 'x', where: 'phone', args: '', sends: '', status: 'running', startedAt: 1, endedAt: null, text: null, source: null, asOf: null, note: null, route: null, routeLabel: null } as ToolStep;
  logSteps([a], 'chat', 'q1'); logSteps([{ ...a, status: 'done' }], 'chat', 'q1'); logSteps([{ ...a, id: 'b' }], 'agent', 'q2');
  assert.deepEqual(getLog().map(e => [e.id, e.status]), [['b', 'running'], ['a', 'done']]);
  clearLog();
});

test('the hook wires the loop: the plan, the switch, the visible steps, and only the allowed fetch targets', async () => {
  const { readFileSync } = await import('node:fs');
  const hook = readFileSync(new URL('../hooks/useAryaChat.ts', import.meta.url), 'utf8');
  assert.match(hook, /planTurn\(q, prefs\)/);
  assert.match(hook, /runCalls\(/);
  assert.match(hook, /onSteps: steps => \{ put\(\{ steps \}\); logSteps/);
  const urls = [...hook.matchAll(/\$\{ENDPOINTS\.aryaAI\}(\/api\/[a-z]+)/g)].map(m => m[1]).sort();
  assert.deepEqual(urls, ['/api/chat', '/api/tool']);
});
