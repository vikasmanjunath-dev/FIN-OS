import { useState, useRef, useCallback } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';

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
      const res = await fetch(`${ENDPOINTS.aryaAI}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Parse SSE lines: "data: {text}\n\n"
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            const token = parsed.text || parsed.content || '';
            accumulated += token;
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
            ? { ...m, text: 'I\'m having trouble reaching the backend. Make sure the arya-ai server is running on port 7475.', streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
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
