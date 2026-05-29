/**
 * AryaDigest.tsx
 * Arya Intel Digest for News1 — uses the FULL live news feed + market tickers
 * + complete user profile as context so every insight is grounded in real data.
 */
import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ollamaStream, buildRichContext, buildUserProfile, timeAgo } from '../services/arya';
import { IntelItem, MarketItem } from '../hooks/useIntelFeed';
import type { UserContext } from '../hooks/useUserContext';

interface AryaDigestProps {
  items:    IntelItem[];
  markets:  MarketItem[];
  userCtx:  UserContext;
}

// Cache key includes a hash of today's headlines so it auto-invalidates when new articles arrive
function cacheKey(items: IntelItem[]): string {
  const headlineHash = items
    .slice(0, 10)
    .map(i => i.id)
    .join(':');
  return `arya_news1_digest_v2_${new Date().toDateString()}_${headlineHash.slice(0, 20)}`;
}

// ── Prompt builder — maximum context ─────────────────────────────────────────
function buildDigestPrompt(items: IntelItem[], markets: MarketItem[], userCtx: UserContext): string {
  const now  = new Date();
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const stocks     = items.filter(i => i.type === 'stocks');
  const crypto     = items.filter(i => i.type === 'crypto');
  const macro      = items.filter(i => i.type === 'macro');
  const highImpact = items.filter(i => i.high_impact);

  const fmt = (list: IntelItem[]) =>
    list.slice(0, 12).map(i =>
      `  ${i.high_impact ? '🔥' : '•'} "${i.title}" [${i.source} · ${i.region} · ${timeAgo(i.timestamp)}]`
    ).join('\n') || '  (none in feed)';

  const mktLine = markets.length
    ? markets.map(m => `${m.name} ${m.value} (${m.trend})`).join(' | ')
    : 'Market data unavailable';

  // Full DB-sourced user context
  const richCtx = buildRichContext(userCtx);
  const name      = userCtx.profile.fullName;
  const interests = Array.isArray(userCtx.profile.interests)
    ? userCtx.profile.interests.join(', ')
    : userCtx.profile.interests;

  // Build portfolio alert if holdings exist and market news matches their stocks
  let portfolioAlert = '';
  if (userCtx.portfolio?.holdings.length) {
    const heldSymbols = userCtx.portfolio.holdings.map(h => h.symbol.toUpperCase());
    const relevantNews = items.filter(i =>
      heldSymbols.some(sym => i.title.toUpperCase().includes(sym))
    );
    if (relevantNews.length) {
      portfolioAlert = `\n⚡ PORTFOLIO ALERT — News directly mentions stocks ${name} holds:\n` +
        relevantNews.map(i => `  • "${i.title}" (${i.source})`).join('\n');
    }
  }

  return `
════════════════════════════════════════════════════════
LIVE NEWS FEED — ${date}, ${time} IST
${items.length} articles | ${highImpact.length} HIGH IMPACT
════════════════════════════════════════════════════════

📈 EQUITY / STOCKS (${stocks.length}):
${fmt(stocks)}

₿ CRYPTO / WEB3 (${crypto.length}):
${fmt(crypto)}

🌐 MACRO / ECONOMY (${macro.length}):
${fmt(macro)}
${portfolioAlert}
════════════════════════════════════════════════════════
LIVE MARKET TICKERS:
${mktLine}
════════════════════════════════════════════════════════

COMPLETE USER PROFILE (from database):
${richCtx}
════════════════════════════════════════════════════════

TASK — 5 personalised intel bullets for ${name.toUpperCase()}:

• LEAD STORY: The single most critical headline from today's feed for Indian investors. Name the title and source. Why does it matter right now?

• CROSS-THEME: A pattern connecting 2 or more of today's headlines. Name both articles and explain the link.

• PERSONAL SIGNAL: The story most relevant to ${name}'s specific situation (interests: ${interests}, portfolio: ${userCtx.portfolio ? userCtx.portfolio.holdings.slice(0,3).map(h=>h.symbol).join(', ') : 'not set'}, goals: ${userCtx.goals.slice(0,2).map(g=>g.name).join(', ') || 'not set'}). What should they do?

• HIDDEN RISK: A risk in today's news most retail investors will miss. Name the headline.

• ACTION FOR TODAY: One concrete, time-sensitive action ${name} should take based on today's news + their profile. Name a specific instrument, sector, or decision — not generic advice.

Rules: Each bullet = 1-2 sentences. Cite real headlines. Sharp intel-analyst tone. No preamble.
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────

const AryaDigest: React.FC<AryaDigestProps> = ({ items, markets, userCtx }) => {
  const [text,      setText]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const abortRef  = useRef<AbortController | null>(null);
  const lastKey   = useRef('');

  const generate = async (force = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const key = cacheKey(items);

    // Skip if already have the right result cached (same headlines, same day)
    if (!force) {
      const cached = sessionStorage.getItem(key);
      if (cached && cached.length > 80 && !cached.includes('<think>')) {
        setText(cached);
        setItemCount(items.length);
        return;
      }
    } else {
      // Clear old cache entries for today when force-refreshing
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('arya_news1_digest_v2_' + new Date().toDateString()))
        .forEach(k => sessionStorage.removeItem(k));
    }

    if (items.length === 0) return; // Wait for feed to load

    setLoading(true);
    setError(false);
    setText('');
    lastKey.current = key;

    const prompt = buildDigestPrompt(items, markets, userCtx);

    try {
      let displayText = '';
      const result = await ollamaStream(
        prompt,
        (display) => {
          if (ctrl.signal.aborted) return;
          displayText = display;
          setText(display);
        },
        undefined,
        768  // More tokens for a comprehensive 5-point digest
      );

      if (!ctrl.signal.aborted) {
        const final = result || displayText;
        if (final && final.length > 60) {
          sessionStorage.setItem(key, final);
          setText(final);
          setItemCount(items.length);
        } else if (!final) {
          setError(true);
        }
      }
    } catch {
      if (!ctrl.signal.aborted) setError(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  // Auto-generate when items first arrive (or change meaningfully)
  useEffect(() => {
    if (items.length === 0) return;
    const key = cacheKey(items);
    if (key === lastKey.current && text) return; // Already have result for this set
    generate(false);
    return () => abortRef.current?.abort();
  }, [items.length > 0 ? items[0]?.id : '']); // Re-trigger when first item changes (new feed)

  const name = localStorage.getItem('finos_display_name') || 'YOU';

  return (
    <div
      className="mb-8 rounded-[18px] border overflow-hidden"
      style={{
        background:  'linear-gradient(135deg, rgba(0,243,255,.07), rgba(77,124,255,.04))',
        borderColor: 'rgba(0,243,255,.2)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b flex-wrap gap-2"
        style={{ borderColor: 'rgba(0,243,255,.12)', background: 'rgba(0,243,255,.04)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#00f3ff,#4d7cff)' }}
          >
            🧠
          </div>
          <div>
            <div className="font-bold text-[11px] tracking-[2px] text-[#00f3ff] font-mono">
              ARYA • INTEL DIGEST
            </div>
            <div className="text-[10px] font-mono mt-0.5 flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,.35)' }}>
              {items.length > 0
                ? <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] inline-block animate-pulse" />
                    {items.length} articles · {items.filter(i => i.high_impact).length} high-impact
                    <span
                      className="ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold"
                      style={{
                        background: userCtx.isLoggedIn ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.1)',
                        color:      userCtx.isLoggedIn ? '#22c55e'             : '#94a3b8',
                        border:     `1px solid ${userCtx.isLoggedIn ? 'rgba(34,197,94,.25)' : 'rgba(148,163,184,.2)'}`,
                      }}
                    >
                      {userCtx.isLoggedIn ? '🔒 DB SYNCED' : '📁 LOCAL ONLY'}
                    </span>
                  </>
                : 'Waiting for feed…'
              }
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Article count badge */}
          {itemCount > 0 && !loading && (
            <span
              className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,243,255,.1)', color: 'rgba(0,243,255,.7)', border: '1px solid rgba(0,243,255,.2)' }}
            >
              {itemCount} ARTICLES
            </span>
          )}
          <button
            onClick={() => generate(true)}
            disabled={loading || items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-[11px] font-bold tracking-[.5px] font-mono transition-all hover:bg-[#00f3ff]/15 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderColor: 'rgba(0,243,255,.3)', background: 'rgba(0,243,255,.06)', color: '#00f3ff' }}
            title="Re-analyse with latest feed"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            {loading ? 'ANALYSING…' : '↺ RE-ANALYSE'}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-5 py-4">
        {/* Loading state */}
        {loading && !text && (
          <div className="flex items-center gap-3" style={{ color: 'rgba(0,243,255,.5)' }}>
            <ThinkingDots />
            <span className="text-[12px] font-mono">
              Reading {items.length} articles for {userCtx.profile.fullName.toUpperCase()}…
            </span>
          </div>
        )}

        {/* Error state */}
        {error && !text && (
          <div className="text-[12px] font-mono" style={{ color: 'rgba(255,255,255,.3)' }}>
            ⚠️ Arya offline — run <code className="text-[#00f3ff]">ollama serve</code> to enable AI analysis
          </div>
        )}

        {/* Result text — render with bullet formatting */}
        {text && (
          <DigestText text={text} isStreaming={loading} />
        )}
      </div>
    </div>
  );
};

// ── Render digest text with styled bullet points ──────────────────────────────
const DigestText: React.FC<{ text: string; isStreaming: boolean }> = ({ text, isStreaming }) => {
  const lines = text.split('\n').filter(l => l.trim());

  return (
    <div className="flex flex-col gap-2.5">
      {lines.map((line, i) => {
        const isBullet = line.trimStart().startsWith('•');
        const isHighImpact = line.includes('🔥');
        const label = line.match(/^•\s*(LEAD STORY|CROSS-THEME|PERSONAL SIGNAL|HIDDEN RISK|ACTION FOR TODAY|ACTION):/i)?.[1];

        if (isBullet && label) {
          const rest = line.replace(/^•\s*[^:]+:\s*/i, '');
          return (
            <div key={i} className="flex gap-2.5 items-start">
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 tracking-wider"
                style={{
                  background: isHighImpact ? 'rgba(255,71,87,.15)' : 'rgba(0,243,255,.1)',
                  color:      isHighImpact ? '#ff4757'             : '#00f3ff',
                  border:     `1px solid ${isHighImpact ? 'rgba(255,71,87,.3)' : 'rgba(0,243,255,.25)'}`,
                }}
              >
                {label.toUpperCase()}
              </span>
              <span className="text-[13px] leading-[1.75]" style={{ color: 'rgba(255,255,255,.82)' }}>
                {rest}
              </span>
            </div>
          );
        }

        if (isBullet) {
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-[#00f3ff] mt-1 flex-shrink-0">•</span>
              <span className="text-[13px] leading-[1.75]" style={{ color: 'rgba(255,255,255,.82)' }}>
                {line.replace(/^•\s*/, '')}
              </span>
            </div>
          );
        }

        return (
          <p key={i} className="text-[13px] leading-[1.75]" style={{ color: 'rgba(255,255,255,.65)' }}>
            {line}
          </p>
        );
      })}
      {isStreaming && (
        <span className="animate-blink text-[#00f3ff] text-sm">▌</span>
      )}
    </div>
  );
};

// ── Three pulsing dots ────────────────────────────────────────────────────────
const ThinkingDots: React.FC = () => (
  <span className="flex gap-1 items-center">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] inline-block"
        style={{ animation: `pulse 1.2s infinite ${i * 0.2}s` }}
      />
    ))}
  </span>
);

export default AryaDigest;
