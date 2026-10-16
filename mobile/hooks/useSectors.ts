import { useState, useEffect, useCallback } from 'react';
import { ENDPOINTS } from '@/constants/endpoints';

export interface Sector { name: string; label: string; changePct: number; price: number | null }

const ORDER = ['IT', 'BANK', 'FMCG', 'PHARMA', 'AUTO', 'METAL', 'ENERGY', 'REALTY'];

/** Live NSE sector index moves from the Arya backend. A sector the backend couldn't fetch is simply absent. */
export function useSectors(refreshMs = 60_000) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await Promise.race([
        fetch(`${ENDPOINTS.aryaAI}/api/market/sectors`),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]) as Response;
      if (res.status === 404) throw new Error('old-backend');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const raw = body && typeof body === 'object' && body.sectors && typeof body.sectors === 'object' && !Array.isArray(body.sectors) ? body.sectors : {};
      const list: Sector[] = Object.entries<any>(raw)
        .filter(([, v]) => v && typeof v === 'object' && typeof v.change_pct === 'number' && Number.isFinite(v.change_pct))
        .map(([name, v]) => ({ name, label: typeof v.label === 'string' && v.label ? v.label : name, changePct: v.change_pct,
          price: typeof v.price === 'number' && Number.isFinite(v.price) && v.price > 0 ? v.price : null }))
        .sort((a, b) => (ORDER.indexOf(a.label) + 100) % 100 - (ORDER.indexOf(b.label) + 100) % 100);
      setSectors(list);
      setError(list.length ? null : 'No sector data right now.');
    } catch (e: any) {
      setError(e?.message === 'old-backend'
        ? 'Your Arya backend is an older version without sector data — restart it (arya-ai/start.sh).'
        : "Couldn't load sector data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  return { sectors, error, loading, refresh: load };
}
