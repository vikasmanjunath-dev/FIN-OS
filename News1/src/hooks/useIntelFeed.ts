import { useState, useEffect, useRef, useCallback } from 'react';

export interface IntelItem {
  id: string;
  title: string;
  link: string;
  source: string;
  type: 'crypto' | 'stocks' | 'macro';
  high_impact: boolean;
  region: string;
  timestamp: number;
}

export interface MarketItem {
  name: string;
  value: string;
  trend: 'up' | 'down';
}

type FeedStatus = 'ESTABLISHING UPLINK...' | 'LIVE UPLINK SECURE' | 'UPLINK INTERRUPTED. RETRYING...' | 'SYNCING DATA...';

// Ghost data shown when the server is unreachable on first load
const GHOST_DATA: IntelItem[] = (() => {
  const now = Date.now() / 1000;
  return [
    { id: 'g1', title: "Nifty hits record high amid strong global cues and FII inflows",      type: "stocks", source: "Mint",          link: "https://www.livemint.com/market",                        timestamp: now - 3600,   high_impact: true,  region: 'India'  },
    { id: 'g2', title: "RBI maintains repo rate, signals strict focus on inflation control",  type: "macro",  source: "MoneyControl",  link: "https://www.moneycontrol.com/news/business/markets/",    timestamp: now - 7200,   high_impact: true,  region: 'India'  },
    { id: 'g3', title: "Bitcoin surges past key resistance level amid institutional demand",   type: "crypto", source: "Reuters",       link: "https://www.reuters.com/technology/crypto/",             timestamp: now - 18000,  high_impact: true,  region: 'Global' },
    { id: 'g4', title: "Tech stocks lead rally as US inflation data cools significantly",      type: "stocks", source: "Bloomberg",     link: "https://www.bloomberg.com/markets",                      timestamp: now - 36000,  high_impact: false, region: 'Global' },
    { id: 'g5', title: "Ethereum gas fees drop to yearly lows amid network upgrades",          type: "crypto", source: "CryptoNews",    link: "https://cryptonews.com/",                               timestamp: now - 54000,  high_impact: false, region: 'Global' },
    { id: 'g6', title: "SEBI tightens F&O norms to curb excessive retail speculation",        type: "stocks", source: "Economic Times", link: "https://economictimes.indiatimes.com/markets",           timestamp: now - 72000,  high_impact: true,  region: 'India'  },
    { id: 'g7', title: "Gold prices stabilize as bond yields fluctuate on Fed signals",        type: "macro",  source: "FT",            link: "https://www.ft.com/markets",                            timestamp: now - 90000,  high_impact: false, region: 'Global' },
    { id: 'g8', title: "New IPOs pipeline builds momentum in Indian primary markets",          type: "stocks", source: "CNBC TV18",     link: "https://www.cnbctv18.com/market/ipo/",                   timestamp: now - 108000, high_impact: false, region: 'India'  },
  ];
})();

const SERVER_URL = 'http://localhost:3000';
const POLL_INTERVAL = 30_000;   // 30s auto-poll
const MAX_SEEN_SIZE = 500;       // cap seenItems to prevent memory leak
const ALERT_COOLDOWN = 10_000;  // 10s between alert sounds
const FETCH_TIMEOUT = 8_000;    // 8s before aborting

export const useIntelFeed = () => {
  const [items,           setItems]           = useState<IntelItem[]>([]);
  const [markets,         setMarkets]         = useState<MarketItem[]>([]);
  const [status,          setStatus]          = useState<FeedStatus>('ESTABLISHING UPLINK...');
  const [loading,         setLoading]         = useState(true);
  const [newImpactAlerts, setNewImpactAlerts] = useState<IntelItem[]>([]);

  const seenItems      = useRef(new Set<string>());
  const lastAlertTime  = useRef(0);
  const retryDelay     = useRef(5_000);   // starts at 5s, grows exponentially on error
  const retryTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playAlertSound = useCallback(() => {
    const now = Date.now();
    if (now - lastAlertTime.current < ALERT_COOLDOWN) return;
    lastAlertTime.current = now;
    try {
      const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx   = new AudioCtx();
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch { /* AudioContext blocked by browser policy — safe to ignore */ }
  }, []);

  const fetchIntel = useCallback(async (isInitial = false) => {
    if (!isInitial) setStatus('SYNCING DATA...');

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch(`${SERVER_URL}/api/intel`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.status === 'online' && Array.isArray(data.items)) {
        const fetchedItems = data.items as IntelItem[];
        setItems(fetchedItems);

        // Alert only on background refreshes when genuinely new high-impact items appear
        if (!isInitial && fetchedItems.length > 0) {
          const newAlerts = fetchedItems.filter(
            item => item.high_impact && !seenItems.current.has(item.id)
          );
          if (newAlerts.length > 0) {
            playAlertSound();
            setNewImpactAlerts(prev => [...prev, ...newAlerts]);
          }
        }

        // Cap seenItems to prevent unbounded memory growth
        if (seenItems.current.size > MAX_SEEN_SIZE) {
          const arr = [...seenItems.current];
          seenItems.current = new Set(arr.slice(-MAX_SEEN_SIZE / 2));
        }
        fetchedItems.forEach(item => seenItems.current.add(item.id));

        if (Array.isArray(data.markets)) setMarkets(data.markets);
        setStatus('LIVE UPLINK SECURE');
        retryDelay.current = 5_000;  // reset backoff on success
      } else {
        throw new Error('Server returned offline/empty');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      setStatus('UPLINK INTERRUPTED. RETRYING...');

      if (isInitial) {
        // First load failed — show ghost data so the UI isn't blank
        setItems(GHOST_DATA);
      }

      // Exponential back-off: 5s → 10s → 20s → max 120s
      retryDelay.current = Math.min(retryDelay.current * 2, 120_000);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => fetchIntel(false), retryDelay.current);

      console.warn(`[News1] Fetch failed, retrying in ${retryDelay.current / 1000}s:`, (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [playAlertSound]);

  useEffect(() => {
    fetchIntel(true);
    const interval = setInterval(() => fetchIntel(false), POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [fetchIntel]);

  const removeAlert    = useCallback((id: string) => {
    setNewImpactAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const manualRefresh  = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryDelay.current = 5_000;
    fetchIntel(false);
  }, [fetchIntel]);

  return { items, markets, status, loading, newImpactAlerts, removeAlert, manualRefresh };
};
