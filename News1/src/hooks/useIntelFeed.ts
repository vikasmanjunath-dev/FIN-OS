import { useState, useEffect, useRef } from 'react';

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

export const useIntelFeed = () => {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [status, setStatus] = useState<'ESTABLISHING UPLINK...' | 'LIVE UPLINK SECURE' | 'UPLINK INTERRUPTED. RETRYING...' | 'SYNCING DATA...'>('ESTABLISHING UPLINK...');
  const [loading, setLoading] = useState(true);
  const [newImpactAlerts, setNewImpactAlerts] = useState<IntelItem[]>([]);
  
  const seenItems = useRef(new Set<string>());
  const lastAlertTime = useRef(0);
  const ALERT_COOLDOWN = 10000; // 10s cooldown

  const playAlertSound = () => {
    const now = Date.now();
    if (now - lastAlertTime.current < ALERT_COOLDOWN) return;
    lastAlertTime.current = now;

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5); 

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch(e) {
      console.warn("AudioContext not supported or allowed yet");
    }
  };

  const fetchIntel = async (isInitial = false) => {
    if (!isInitial) setStatus('SYNCING DATA...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch('http://localhost:3000/api/intel', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();

      if (data.status === 'online') {
        if (data.items) {
          const fetchedItems = data.items as IntelItem[];
          setItems(fetchedItems);
          
          if (!isInitial) {
            const newAlerts = fetchedItems.filter(item => !seenItems.current.has(item.id) && item.high_impact);
            if (newAlerts.length > 0) {
              playAlertSound();
              setNewImpactAlerts(prev => [...prev, ...newAlerts]);
            }
          }

          fetchedItems.forEach(item => seenItems.current.add(item.id));
        }

        if (data.markets) {
          setMarkets(data.markets);
        }
        
        setStatus('LIVE UPLINK SECURE');
      } else {
        throw new Error('Offline');
      }
    } catch (err) {
      clearTimeout(timeout);
      setStatus('UPLINK INTERRUPTED. RETRYING...');
      if (isInitial) {
        // Deploy ghost protocol (mock data) if initial fails
        const now = Date.now() / 1000;
        setItems([
          { id: '1', title: "Nifty hits record high amid strong global cues and FII inflows", type: "stocks", source: "Mint", link: "https://www.livemint.com/market", timestamp: now - 3600, high_impact: true, region: 'India' },
          { id: '2', title: "RBI maintains repo rate, signals strict focus on inflation control", type: "macro", source: "MoneyControl", link: "https://www.moneycontrol.com/news/business/markets/", timestamp: now - 7200, high_impact: true, region: 'India' },
          { id: '3', title: "Bitcoin surges past key resistance level ahead of structural halving", type: "crypto", source: "Reuters", link: "https://www.reuters.com/technology/crypto/", timestamp: now - 18000, high_impact: false, region: 'Global' },
          { id: '4', title: "Tech stocks lead rally as US inflation data cools significantly", type: "stocks", source: "Bloomberg", link: "https://www.bloomberg.com/markets", timestamp: now - 50000, high_impact: false, region: 'Global' }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel(true);
    const interval = setInterval(() => {
      fetchIntel(false);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const removeAlert = (id: string) => {
    setNewImpactAlerts(prev => prev.filter(a => a.id !== id));
  };

  const manualRefresh = () => fetchIntel(false);

  return { items, markets, status, loading, newImpactAlerts, removeAlert, manualRefresh };
};
