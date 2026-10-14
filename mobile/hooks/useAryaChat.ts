import { OFFLINE_ACTIONS } from '@/lib/aryaOffline';
import { useState, useRef, useCallback } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';
import { apply as applyGuardrails, applyFigures } from '@/lib/aryaGuardrails';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import { loadPrefs, loadMemory, noteQuestionTopics } from '@/lib/aryaMemoryStorage';
import { loadLifeEvents } from '@/lib/lifeEventsStorage';
import { buildChatContext } from '@/lib/aryaContext';
import { answerLocally, backendCallFor, formatBackend, withSource, knownFigureSet, localOnlyReply, BACKEND_SOURCE, type ToolReply, type BackendCall } from '@/lib/aryaTools';
import type { ArFacts } from '@/lib/aryaFacts';

export interface ChatMessage {
  id: string;
  role: 'user' | 'arya';
  text: string;
  timestamp: Date;
  streaming?: boolean;
  /** shown as tappable chips under the message (the offline reply, and the screen a local answer came from) */
  actions?: { label: string; route: string }[];
}

/** One public-market call to the Arya server's tool gateway (same endpoint and tool names as the website). Nothing about the person is sent. */
async function postTool(call: BackendCall, signal: AbortSignal): Promise<any> {
  const res = await fetch(`${ENDPOINTS.aryaAI}/api/tool`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: call.name, args: call.args }), signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return j.result ?? j;
}

const DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const actionFor = (r: ToolReply) => (r.route && r.routeLabel ? [{ label: r.routeLabel, route: r.route }] : undefined);

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
    let marketAsked = false;

    try {
      // What the phone holds, and the person's switches. Any of these can be missing; the chat still answers.
      const [prefs, memory, events] = await Promise.all([
        loadPrefs(), loadMemory().catch(() => []), loadLifeEvents().catch(() => []),
      ]);
      try { facts = await loadArFacts(new Date()); } catch { facts = null; }
      noteQuestionTopics(q).catch(() => {});

      // 1. Questions about the person's own money, and plain SIP / EMI sums: answered here, from the same cores as the screens.
      const local = facts ? answerLocally(q, facts) : null;
      const short = q.split(/\s+/).length <= 12;
      if (local && (short || !prefs.online)) {
        put({ text: withSource(local), actions: actionFor(local), streaming: false });
        return;
      }

      // 2. Public market data through the Arya server's tool gateway (only when online is allowed).
      const call = prefs.online ? backendCallFor(q) : null;
      if (call) {
        marketAsked = true;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 12000);
          signal.addEventListener('abort', () => ctrl.abort());
          let result: any;
          try { result = await postTool(call, ctrl.signal); } finally { clearTimeout(timer); }
          const line = formatBackend(call.name, result);
          if (line) {
            put({ text: `${line}\n\nFrom: ${BACKEND_SOURCE} Fetched ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Not advice.`, streaming: false });
            return;
          }
        } catch (e: any) {
          if (e?.name === 'AbortError' && signal.aborted) { put({ streaming: false }); return; }
          // fall through to the model, then to the offline reply
        }
      }

      // 3. The model. What is sent is built in lib/aryaContext.ts, the same function the "What Arya will be told" screen shows.
      const built = facts ? buildChatContext(facts, prefs, memory, events, q) : null;
      if (!prefs.online || !built || !built.body) {
        const why = !prefs.online ? 'Arya is set to stay on this phone, so I did not send this question anywhere.' : null;
        put({ text: localOnlyReply(local, why, DEV), actions: local ? actionFor(local) : OFFLINE_ACTIONS, streaming: false });
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
            accumulated += parsed.text || parsed.content || '';
            put({ text: accumulated });
          } catch {}
        }
      }
      finishAnswer();
    } catch (err: any) {
      if (err?.name === 'AbortError') { finishAnswer(); return; }
      // The server cannot be reached. If the question was one the phone can answer, answer it; otherwise say what still works.
      const local = facts ? answerLocally(q, facts) : null;
      const why = marketAsked && !local ? 'Live prices need a connection to Arya, and I cannot reach it right now.' : null;
      put({ text: localOnlyReply(local, why, DEV), actions: local ? actionFor(local) : OFFLINE_ACTIONS, streaming: false });
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
