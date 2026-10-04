import { useState, useRef, useCallback } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';
import { useFinosContext } from '@/hooks/useFinosContext';

export interface ChatMessage {
  id: string;
  role: 'user' | 'arya';
  text: string;
  timestamp: Date;
  streaming?: boolean;
}

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
  const { ctx } = useFinosContext();

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    const aryaId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aryaId, role: 'arya', text: '', timestamp: new Date(), streaming: true }]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${ENDPOINTS.aryaAI}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context: {
            name: ctx.name !== 'Friend' ? ctx.name : undefined,
            monthlyIncome: ctx.monthlyIncome,
            monthlyExpense: ctx.monthlyExpense,
            netWorth: ctx.netWorth,
            portfolioValue: ctx.portfolioValue,
            monthlySIP: ctx.sipTotal,
            healthScore: ctx.healthScore,
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
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
            setMessages(prev =>
              prev.map(m => m.id === aryaId ? { ...m, text: accumulated } : m)
            );
          } catch {}
        }
      }

      // Mark complete
      setMessages(prev =>
        prev.map(m => m.id === aryaId ? { ...m, streaming: false } : m)
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      // Fallback: show a graceful error message
      setMessages(prev =>
        prev.map(m =>
          m.id === aryaId
            ? { ...m, text: 'I\'m having trouble reaching the backend. Make sure the arya-ai server is running (port 7475) and the host in Settings is correct.', streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, ctx]);

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
