import { OFFLINE_ACTIONS } from '@/lib/aryaOffline';
import { useState, useRef, useCallback } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';
import { apply as applyGuardrails, applyFigures } from '@/lib/aryaGuardrails';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import { loadPrefs, loadMemory, noteQuestionTopics, addMemoryNote } from '@/lib/aryaMemoryStorage';
import { loadLifeEvents } from '@/lib/lifeEventsStorage';
import { buildChatContext } from '@/lib/aryaContext';
import { knownFigureSet, localOnlyReply } from '@/lib/aryaTools';
import { planTurn, runCalls, composeAnswer, type ToolStep, type PlannedCall, type AgentEnv } from '@/lib/aryaAgent';
import { TOOL_SPECS } from '@/lib/aryaToolbox';
import type { ServerCall } from '@/lib/aryaServerTools';
import { logSteps } from '@/lib/aryaAgentLog';
import type { ArFacts } from '@/lib/aryaFacts';

export interface ChatMessage {
  id: string;
  role: 'user' | 'arya';
  text: string;
  timestamp: Date;
  streaming?: boolean;
  /** shown as tappable chips under the message: a screen to open, or a question to ask (an "ask" chip sends that question) */
  actions?: { label: string; route?: string; ask?: string }[];
  /** the tool calls behind this answer, shown under it: which tool, what it was given, what left the phone, when */
  steps?: ToolStep[];
}

/** One public-market call to the Arya server's tool gateway (same endpoint and tool names as the website). Only what the call lists is sent. */
export async function postTool(call: ServerCall, signal?: AbortSignal): Promise<{ result: unknown; ts: number | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${ENDPOINTS.aryaAI}/api/tool`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: call.name, args: call.args }), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j: any = await res.json();
    if (j && typeof j === 'object' && 'result' in j) return { result: j.result, ts: typeof j.ts === 'number' ? j.ts : null };
    if (j && typeof j === 'object' && typeof j.error === 'string') return { result: { error: j.error }, ts: typeof j.ts === 'number' ? j.ts : null };
    return { result: j, ts: null };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

const DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const isServerTool = (t: PlannedCall['tool']) => TOOL_SPECS.find(s => s.id === t)?.where === 'server';

export function useAryaChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'arya',
      text: 'Namaste! I\'m Arya, your FIN·OS financial advisor. Ask me anything — SIP planning, tax saving, market insights, or your portfolio.',
      timestamp: new Date(),
    },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || isStreaming) return;

    const stamp = Date.now();
    setMessages(prev => [...prev, { id: stamp.toString(), role: 'user', text: q, timestamp: new Date() }]);
    const say = (m: Partial<ChatMessage> & { text: string }, id = (stamp + 1).toString()) =>
      setMessages(prev => [...prev, { id, role: 'arya', timestamp: new Date(), ...m }]);

    // Requests to evade tax or forge documents are answered here and never leave the phone (same rule and wording as the website).
    const pre = applyGuardrails(q, '');
    if (pre.blocked) { say({ text: pre.text }); return; }

    const aryaId = (stamp + 1).toString();
    setMessages(prev => [...prev, { id: aryaId, role: 'arya', text: '', timestamp: new Date(), streaming: true }]);
    setIsStreaming(true);
    const put = (m: Partial<ChatMessage>) => setMessages(prev => prev.map(x => (x.id === aryaId ? { ...x, ...m } : x)));

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    let accumulated = '';
    let facts: ArFacts | null = null;
    let deferred: PlannedCall[] | null = null;      // phone tools held back because the model gets a long question first
    let toolsOff = false;
    let events: Awaited<ReturnType<typeof loadLifeEvents>> = [];
    let memory: Awaited<ReturnType<typeof loadMemory>> = [];

    // Run tool calls, showing each one while it runs (and in the session log). Returns true when the reply is complete.
    const runTools = async (calls: PlannedCall[], prefs: Awaited<ReturnType<typeof loadPrefs>>): Promise<boolean> => {
      const needsFacts = calls.some(c => !isServerTool(c.tool));
      if (needsFacts && !facts) return false;
      const env: AgentEnv = {
        ctx: { facts: facts as ArFacts, events, memory },
        prefs, nowMs: () => Date.now(), signal,
        callServer: postTool,
        addMemory: async (note: string) => {
          const r = await addMemoryNote({ text: note });
          if (r.status === 'rejected') return { ok: false, message: r.reason ?? 'I could not keep that.' };
          return { ok: true, message: `${r.status === 'updated' ? 'I already had that and have noted it again' : 'Noted'}: "${r.item?.text ?? note}". It is kept on this phone only${prefs.memory ? ', and may be sent with a question because your memory switch is on' : '. Your memory switch is off, so it is not sent to the online model'}.` };
        },
        onSteps: steps => { put({ steps }); logSteps(steps, 'chat', q); },
      };
      const steps = await runCalls(calls, env);
      const a = composeAnswer(steps);
      put({ text: a.text, actions: a.actions.length ? a.actions : undefined, steps, streaming: false });
      logSteps(steps, 'chat', q);
      return true;
    };

    try {
      // What the phone holds, and the person's switches. Any of these can be missing; the chat still answers.
      const [prefs, mem, ev] = await Promise.all([loadPrefs(), loadMemory().catch(() => []), loadLifeEvents().catch(() => [])]);
      memory = mem; events = ev;
      try { facts = await loadArFacts(new Date()); } catch { facts = null; }
      noteQuestionTopics(q).catch(() => {});

      // 1. Tools: the question is matched to tool calls on the phone (words only, no model). Every call is shown while it runs.
      const plan = planTurn(q, prefs);
      toolsOff = plan.kind === 'off';
      if (plan.kind === 'ask') {
        put({ text: plan.text, actions: plan.options.length ? plan.options.map(o => ({ label: o.label, ask: o.ask })) : undefined, streaming: false });
        return;
      }
      if (plan.kind === 'calls') {
        const short = q.split(/\s+/).length <= 12;
        const server = plan.calls.some(c => isServerTool(c.tool));
        // A long question about your own money is better answered by the model, with the tool answer as the fallback if it cannot be reached.
        if (!server && !short && prefs.online) deferred = plan.calls;
        else if (await runTools(plan.calls, prefs)) return;
      }

      // 2. The model. What is sent is built in lib/aryaContext.ts, the same function the "What Arya will be told" screen shows.
      const built = facts ? buildChatContext(facts, prefs, memory, events, q) : null;
      if (!prefs.online || !built || !built.body) {
        const why = !prefs.online ? 'Arya is set to stay on this phone, so I did not send this question anywhere.' : null;
        put({ text: localOnlyReply(null, why, DEV, toolsOff), actions: OFFLINE_ACTIONS, streaming: false });
        return;
      }

      const res = await fetch(`${ENDPOINTS.aryaAI}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.body),
        signal,
      });
      if (!res.ok || !res.body) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line; keep any partial tail for the next chunk.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') { finished = true; break; }
          try {
            const parsed = JSON.parse(payload);
            const piece = typeof parsed?.text === 'string' ? parsed.text : typeof parsed?.content === 'string' ? parsed.content : '';
            accumulated += piece;
            put({ text: accumulated });
          } catch {}
        }
      }
      finishAnswer();
    } catch (err: any) {
      if (err?.name === 'AbortError') { finishAnswer(); return; }
      // The server cannot be reached. If the question was one the phone can answer, answer it; otherwise say what still works.
      const prefs = await loadPrefs();
      if (deferred && (await runTools(deferred, prefs))) return;
      put({ text: localOnlyReply(null, null, DEV, toolsOff), actions: OFFLINE_ACTIONS, streaming: false });
    } finally {
      setIsStreaming(false);
    }

    // Add Arya's plain-language notes to a finished (or stopped) answer. It only ever appends; the model's words are kept as they are.
    function finishAnswer() {
      if (!accumulated) { put({ streaming: false }); return; }
      const g = applyGuardrails(q, accumulated);
      const fig = applyFigures(q, g.text, facts ? knownFigureSet(facts) : []);
      put({ text: fig.text, streaming: false });
    }
  }, [isStreaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages(prev =>
      prev.map(m => m.streaming ? { ...m, streaming: false } : m)
    );
  }, []);

  const clear = useCallback(() => {
    setMessages([{
      id: 'reset',
      role: 'arya',
      text: 'Fresh start! What would you like to explore?',
      timestamp: new Date(),
    }]);
  }, []);

  return { messages, isStreaming, send, stop, clear };
}
