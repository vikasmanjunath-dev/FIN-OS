// Arya's tool loop: decide which tools a question needs, run them one after another, and record every call so the person can see it.
//
//   planTurn(question, prefs)   what to do with a question: nothing (tools off), ask back, or a list of tool calls (at most MAX_CALLS)
//   runCalls(calls, env)        run them in order. Before a call runs it is reported as `running`; after, as `done`, `failed` or `skipped`.
//   composeAnswer(steps)        the reply text: each result with the place it came from and the time, no extra words added
//
// Why a plan-and-run loop and not a model-driven loop: the server's chat endpoint streams plain text and has no tool calling, so a
// model-driven loop would have to send the person's tool RESULTS (their own figures) back to the model after every call, whatever the
// "figures" switch says. Choosing tools on the phone, from the question's words, keeps the records on the phone, makes the choice
// repeatable, and lets every call be shown before it runs. The cost is honest: a question the matcher does not recognise goes to the
// model as plain chat, without tools.
//
// Pure apart from the callbacks in `AgentEnv`: no storage, no network, no React. Tested in __tests__/aryaAgent.test.mts.
import { matchIntent, isAdviceRequest, TOOL_LABEL, type ToolId, type Args } from '@/lib/aryaIntent';
import { TOOL_SPECS, runDeviceTool, withSource, type ToolCtx, type ToolResult, type ToolWhere } from '@/lib/aryaToolbox';
import { serverCallFor, formatServer, missingFor, type ServerCall } from '@/lib/aryaServerTools';
import type { AryaPrefs } from '@/lib/aryaMemoryStorage';

export const MAX_CALLS = 3;

export type StepStatus = 'running' | 'done' | 'failed' | 'skipped';
export interface ToolStep {
  id: string;
  tool: ToolId;
  label: string;
  where: ToolWhere;
  /** what the tool was given, in words ("symbol RELIANCE", "₹10,000 a month at 12% for 15 years", "your records") */
  args: string;
  /** what left the phone for this call, in words ("Nothing leaves the phone.") */
  sends: string;
  status: StepStatus;
  startedAt: number;
  endedAt: number | null;
  /** the result, once there is one */
  text: string | null;
  source: string | null;
  asOf: number | null;
  /** why it failed or was skipped, in plain words */
  note: string | null;
  route: string | null;
  routeLabel: string | null;
}

export interface PlannedCall { tool: ToolId; args: Args }

export type TurnPlan =
  | { kind: 'off' }
  | { kind: 'none' }
  | { kind: 'advice' }
  | { kind: 'ask'; text: string; options: { label: string; ask: string }[] }
  | { kind: 'calls'; calls: PlannedCall[] };

const spec = (t: ToolId) => TOOL_SPECS.find(s => s.id === t);

/** "A and B" -> two sub-questions, only on a question mark, a semicolon or the words and / also / plus (never on a comma: "1,00,000"). */
export function splitQuestion(q: string): string[] {
  const parts = q.split(/\?\s+|;\s*|\s+(?:and|also|plus|&)\s+/i).map(s => s.replace(/[?\s]+$/, '').trim()).filter(s => s.split(/\s+/).filter(Boolean).length >= 2);
  return parts.length >= 2 ? parts.slice(0, MAX_CALLS + 1) : [];
}

const sameCall = (a: PlannedCall, b: PlannedCall) => a.tool === b.tool && JSON.stringify(a.args) === JSON.stringify(b.args);

/** What a question needs. Tools switched off beats everything; advice requests never become tool calls. */
export function planTurn(question: string, prefs: Pick<AryaPrefs, 'tools'>): TurnPlan {
  const q = String(question ?? '').trim();
  if (!q) return { kind: 'none' };
  if (!prefs.tools) return { kind: 'off' };

  // Several questions in one: each part must be a tool question of its own, else the whole thing is matched as one.
  const parts = splitQuestion(q);
  if (parts.length) {
    const calls: PlannedCall[] = [];
    let all = true;
    for (const p of parts) {
      const m = matchIntent(p);
      if (m.kind !== 'tool') { all = false; break; }
      const c = { tool: m.tool, args: m.args };
      if (!calls.some(x => sameCall(x, c))) calls.push(c);
    }
    if (all && calls.length >= 2 && calls.length <= MAX_CALLS && !isAdviceRequest(q)) return { kind: 'calls', calls };
  }

  const m = matchIntent(q);
  if (m.kind === 'none') return { kind: 'none' };
  if (m.kind === 'advice') return { kind: 'advice' };
  if (m.kind === 'ambiguous') {
    return { kind: 'ask', text: 'I can read that two ways. Which did you mean?',
      options: m.options.map(o => ({ label: o.label, ask: spec(o.tool)?.example ?? o.label })) };
  }
  const gap = missingFor(m.tool, m.args);
  if (gap) return { kind: 'ask', text: gap, options: [] };
  return { kind: 'calls', calls: [{ tool: m.tool, args: m.args }] };
}

/* ── describing a call ─────────────────────────────────────────────────────────────────────────────────────── */
const rupees = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function describeArgs(tool: ToolId, a: Args): string {
  const bits: string[] = [];
  if (a.amount !== undefined) bits.push(rupees(a.amount));
  if (a.rate !== undefined) bits.push(`${a.rate}%`);
  if (a.years !== undefined) bits.push(`${Math.round(a.years * 100) / 100} years`);
  if (a.income !== undefined) bits.push(`income ${rupees(a.income)}`);
  if (a.days !== undefined) bits.push(`${a.days} days`);
  if (a.symbol) bits.push(`symbol ${a.symbol}`);
  if (a.query && tool !== 'memory_forget') bits.push(`"${a.query}"`);
  if (tool === 'memory_add' && a.text) return `the note "${a.text.length > 60 ? a.text.slice(0, 57) + '...' : a.text}"`;
  if (tool === 'open_screen' && a.text) return a.text;
  return bits.length ? bits.join(', ') : spec(tool)?.where === 'server' ? 'nothing specific' : 'your records on this phone';
}

/* ── running ───────────────────────────────────────────────────────────────────────────────────────────────── */
export interface AgentEnv {
  ctx: ToolCtx;
  prefs: AryaPrefs;
  nowMs: () => number;
  /** one call to the server's tool gateway; throws on any failure. `ts` is the gateway's own time (epoch seconds) when it gave one. */
  callServer: (call: ServerCall, signal?: AbortSignal) => Promise<{ result: unknown; ts: number | null }>;
  /** save a note on the phone (the memory store's own rules apply: secrets are refused) */
  addMemory: (text: string) => Promise<{ ok: boolean; message: string }>;
  /** told after every change, with all steps so far */
  onSteps?: (steps: ToolStep[]) => void;
  signal?: AbortSignal;
}

let seq = 0;
const newId = (t: number) => `s${t.toString(36)}${(++seq).toString(36)}`;

export async function runCalls(calls: PlannedCall[], env: AgentEnv): Promise<ToolStep[]> {
  const steps: ToolStep[] = [];
  const emit = () => env.onSteps?.(steps.map(s => ({ ...s })));

  for (const c of calls.slice(0, MAX_CALLS)) {
    const sp = spec(c.tool);
    const where: ToolWhere = sp?.where ?? 'phone';
    const t0 = env.nowMs();
    const step: ToolStep = {
      id: newId(t0), tool: c.tool, label: sp?.label ?? TOOL_LABEL[c.tool] ?? c.tool, where, args: describeArgs(c.tool, c.args),
      sends: sp?.sends ?? 'Nothing leaves the phone.', status: 'running', startedAt: t0, endedAt: null, text: null, source: null, asOf: null, note: null, route: null, routeLabel: null,
    };
    steps.push(step);
    emit();
    const finish = (patch: Partial<ToolStep>) => { Object.assign(step, patch, { endedAt: env.nowMs() }); emit(); };

    if (env.signal?.aborted) { finish({ status: 'skipped', note: 'Stopped before this call ran.' }); continue; }

    try {
      if (where === 'server') {
        const call = serverCallFor(c.tool, c.args);
        if (!call) { finish({ status: 'skipped', note: 'This needs a name or symbol that the question did not give.' }); continue; }
        step.args = call.sends.replace(/\.$/, '');
        step.sends = call.sends;
        if (!env.prefs.online) { finish({ status: 'skipped', note: 'Arya is set to stay on this phone, so nothing was looked up online. Switch the online model on in What Arya remembers to allow public price lookups.' }); continue; }
        let r: { result: unknown; ts: number | null };
        try { r = await env.callServer(call, env.signal); }
        catch (e: any) {
          if (env.signal?.aborted) { finish({ status: 'skipped', note: 'Stopped.' }); continue; }
          finish({ status: 'failed', note: `The Arya server could not be reached${e?.message && !/abort/i.test(String(e.message)) ? ` (${String(e.message).slice(0, 80)})` : ''}, so I have no live figure to show. I will not guess one.` });
          continue;
        }
        const out = formatServer(call, r.result, r.ts, env.nowMs());
        if (!out) {
          const err = r.result && typeof r.result === 'object' && typeof (r.result as any).error === 'string' ? ` The server said: ${(r.result as any).error}.` : '';
          finish({ status: 'failed', note: `The server did not return a usable answer for this.${err}` });
          continue;
        }
        finish({ status: 'done', text: out.text, source: out.source, asOf: out.asOf });
        continue;
      }

      // phone tools
      if (c.tool === 'memory_add') {
        const text = String(c.args.text ?? '').trim();
        if (!text) { finish({ status: 'skipped', note: 'There was nothing to remember in that sentence.' }); continue; }
        const r = await env.addMemory(text);
        finish({ status: r.ok ? 'done' : 'failed', text: r.message, source: 'Saved on this phone only (What Arya remembers).', asOf: env.nowMs(), note: r.ok ? null : r.message, route: '/pulse/memory', routeLabel: 'Open What Arya remembers' });
        continue;
      }
      const res: ToolResult = runDeviceTool(c.tool, c.args, env.ctx);
      finish({ status: 'done', text: res.text, source: res.source, asOf: res.asOf, route: res.route, routeLabel: res.routeLabel, note: res.complete ? null : 'A figure is missing; the answer says which.' });
    } catch {
      finish({ status: 'failed', note: 'This tool hit a problem and stopped. Nothing was changed.' });
    }
  }
  return steps;
}

/** The reply: each finished result with its source and time. Failed or skipped calls say why, in one line each. */
export function composeAnswer(steps: ToolStep[]): { text: string; actions: { label: string; route: string }[] } {
  const blocks: string[] = [];
  const actions: { label: string; route: string }[] = [];
  const multi = steps.length > 1;
  for (const s of steps) {
    if (s.status === 'done' && s.text) blocks.push((multi ? `**${s.label}**\n` : '') + withSource({ text: s.text, source: s.source ?? 'This phone.', asOf: s.asOf ?? undefined }));
    else if (s.status === 'failed' || s.status === 'skipped') blocks.push((multi ? `**${s.label}**\n` : '') + (s.note ?? 'No answer.'));
    if (s.route && s.routeLabel && !actions.some(a => a.route === s.route)) actions.push({ label: s.routeLabel, route: s.route });
  }
  return { text: blocks.join('\n\n'), actions };
}

/** True when at least one call produced an answer (or a plain statement of why it could not). */
export const hasAnswer = (steps: ToolStep[]) => steps.some(s => (s.status === 'done' && !!s.text) || s.status === 'failed' || s.status === 'skipped');
