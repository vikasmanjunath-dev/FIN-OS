/**
 * AryaCardInsight.tsx
 * Per-card AI analysis button for News1.
 * Passes the full article metadata + all other headlines in the feed
 * as context so Arya can give cross-referenced, grounded insights.
 */
import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { ollamaStream, buildRichContext, timeAgo } from '../services/arya';
import { IntelItem } from '../hooks/useIntelFeed';
import type { UserContext } from '../hooks/useUserContext';

interface AryaCardInsightProps {
  item:     IntelItem;       // the article this card is about
  allItems: IntelItem[];     // full feed for cross-reference context
  userCtx:  UserContext;     // complete user profile from DB
}

// ── Prompt builder — maximum context ─────────────────────────────────────────
function buildCardPrompt(item: IntelItem, allItems: IntelItem[], userCtx: UserContext): string {
  const name      = userCtx.profile.fullName;
  const interests = Array.isArray(userCtx.profile.interests)
    ? userCtx.profile.interests.join(', ')
    : userCtx.profile.interests;

  // Full DB-sourced context
  const richCtx = buildRichContext(userCtx);

  // Related articles: same type first, then others
  const related = [
    ...allItems.filter(i => i.id !== item.id && i.type === item.type),
    ...allItems.filter(i => i.id !== item.id && i.type !== item.type),
  ].slice(0, 14);

  const relatedLines = related
    .map(i => `  ${i.high_impact ? '🔥' : '•'} [${i.type.toUpperCase()} · ${i.region}] "${i.title}" (${i.source}, ${timeAgo(i.timestamp)})`)
    .join('\n');

  // Check if user's portfolio directly mentions this article's subject
  let portfolioRelevance = '';
  if (userCtx.portfolio?.holdings.length) {
    const match = userCtx.portfolio.holdings.find(h =>
      item.title.toUpperCase().includes(h.symbol.toUpperCase())
    );
    if (match) {
      portfolioRelevance = `\n⚡ PORTFOLIO ALERT: ${name} holds ${match.quantity} units of ${match.symbol} (avg ₹${match.avgPrice}, current ₹${match.currentPrice}, P&L: ${match.gainLossPct}%). This news is DIRECTLY about their portfolio.`;
    }
  }

  // Check if any goals relate to this article's topic
  let goalRelevance = '';
  if (userCtx.goals.length) {
    const relGoal = userCtx.goals.find(g =>
      item.title.toLowerCase().includes(g.name.toLowerCase().split(' ')[0])
    );
    if (relGoal) {
      goalRelevance = `\n🎯 GOAL RELEVANCE: ${name} has a goal "${relGoal.name}" — ₹${relGoal.saved} saved of ₹${relGoal.target} target (${relGoal.progressPct}% done). This news may affect this goal.`;
    }
  }

  return `
════════════════════════════════════════════════
FOCUSED ARTICLE:
  Title:   "${item.title}"
  Source:  ${item.source}
  Type:    ${item.type.toUpperCase()}
  Region:  ${item.region}
  Impact:  ${item.high_impact ? '🔥 HIGH IMPACT' : 'Standard'}
  Age:     ${timeAgo(item.timestamp)}
${portfolioRelevance}${goalRelevance}
════════════════════════════════════════════════
TODAY'S FULL NEWS FEED (${allItems.length} articles for cross-reference):
${relatedLines || '  (no other articles)'}
════════════════════════════════════════════════
COMPLETE USER PROFILE (from database):
${richCtx}
════════════════════════════════════════════════

ANALYSIS TASK for ${name}:

1. DIRECT IMPACT: What does "${item.title}" specifically mean for ${name}'s financial situation RIGHT NOW? Reference their actual net worth (₹${userCtx.profile.netWorth.toLocaleString('en-IN')}), portfolio, or goals where relevant. Be concrete.

2. FEED CONNECTION: Does this headline confirm, contradict, or amplify any other article in today's feed? Name the related headline and the link.

3. ACTION SIGNAL: Given ${name}'s interests (${interests}) and real financial data above — say BUY/SELL/HOLD/WATCH/AVOID and exactly what instrument or action. Be specific.

Total: 3 sentences. No preamble. No "Great question!". Sharp and direct.
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────

const AryaCardInsight: React.FC<AryaCardInsightProps> = ({ item, allItems, userCtx }) => {
  const [open,    setOpen]    = useState(false);
  const [text,    setText]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (open) { closePopup(e); return; }

    setOpen(true);
    setLoading(true);
    setError(false);
    setText('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const prompt = buildCardPrompt(item, allItems, userCtx);

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
        300   // Card insights: concise but rich
      );
      if (!ctrl.signal.aborted) {
        setText(result || displayText || 'No analysis available.');
      }
    } catch {
      if (!ctrl.signal.aborted) setError(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const closePopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    abortRef.current?.abort();
    setOpen(false);
    setText('');
    setLoading(false);
    setError(false);
  };

  return (
    <div className="relative" onClick={e => { e.stopPropagation(); e.preventDefault(); }}>
      {/* ── Trigger button ── */}
      <button
        onClick={handleClick}
        className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[9px] font-bold tracking-[.5px] font-mono transition-all whitespace-nowrap ${
          open
            ? 'border-[#00f3ff]/60 text-[#00f3ff]'
            : 'border-[#00f3ff]/25 text-[#00f3ff] hover:border-[#00f3ff]/50'
        }`}
        style={{ background: open ? 'rgba(0,243,255,.12)' : 'rgba(0,243,255,.06)' }}
        title={`Ask Arya — cross-references ${allItems.length} articles`}
      >
        <Sparkles size={9} />
        AI
        {loading && <span className="ml-0.5 animate-spin inline-block text-[7px]">⟳</span>}
      </button>

      {/* ── Analysis popup ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.93 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: 10, scale: 0.93 }}
            transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute bottom-8 left-0 z-[200] rounded-xl shadow-2xl overflow-hidden"
            style={{
              width:        '310px',
              background:   'rgba(7,11,20,.98)',
              border:       '1px solid rgba(0,243,255,.28)',
              backdropFilter: 'blur(16px)',
            }}
            onClick={e => { e.stopPropagation(); e.preventDefault(); }}
          >
            {/* Popup header */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b"
              style={{ borderColor: 'rgba(0,243,255,.12)', background: 'rgba(0,243,255,.05)' }}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles size={10} color="#00f3ff" />
                <span className="text-[9px] font-bold text-[#00f3ff] tracking-[1.5px] font-mono">
                  ARYA ANALYSIS
                </span>
                <span
                  className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                  style={{ color: 'rgba(0,243,255,.5)', background: 'rgba(0,243,255,.08)' }}
                >
                  {allItems.length} ARTICLES
                </span>
              </div>
              <button
                onClick={closePopup}
                className="transition-colors p-0.5 rounded"
                style={{ color: 'rgba(255,255,255,.3)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,.8)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.3)')}
              >
                <X size={12} />
              </button>
            </div>

            {/* Content */}
            <div className="px-3 py-3 min-h-[60px]">
              {/* Loading */}
              {loading && !text && (
                <div className="flex items-center gap-2" style={{ color: 'rgba(0,243,255,.5)' }}>
                  <ThinkingDots />
                  <span className="text-[11px] font-mono">Cross-referencing {allItems.length} articles…</span>
                </div>
              )}

              {/* Error */}
              {error && !text && (
                <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,.3)' }}>
                  ⚠️ Arya offline — run <code className="text-[#00f3ff]">ollama serve</code>
                </span>
              )}

              {/* Result */}
              {text && <InsightText text={text} isStreaming={loading} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Render with labelled sections ─────────────────────────────────────────────
const InsightText: React.FC<{ text: string; isStreaming: boolean }> = ({ text, isStreaming }) => {
  const lines = text.split('\n').filter(l => l.trim());

  const LABELS: Record<string, { color: string; bg: string; border: string }> = {
    'DIRECT IMPACT':    { color: '#22c55e', bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.25)'  },
    'FEED CONNECTION':  { color: '#00f3ff', bg: 'rgba(0,243,255,.08)',  border: 'rgba(0,243,255,.2)'   },
    'ACTION SIGNAL':    { color: '#eab308', bg: 'rgba(234,179,8,.12)',  border: 'rgba(234,179,8,.3)'   },
    'BUY':   { color: '#22c55e', bg: 'rgba(34,197,94,.12)',  border: 'rgba(34,197,94,.3)'  },
    'SELL':  { color: '#ef4444', bg: 'rgba(239,68,68,.12)',  border: 'rgba(239,68,68,.3)'  },
    'WATCH': { color: '#eab308', bg: 'rgba(234,179,8,.12)',  border: 'rgba(234,179,8,.3)'  },
    'HOLD':  { color: '#94a3b8', bg: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.2)'},
  };

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => {
        const label = line.match(/^\d+\.\s*(DIRECT IMPACT|FEED CONNECTION|ACTION SIGNAL):/i)?.[1]?.toUpperCase();
        const style = label ? LABELS[label] : null;

        if (style) {
          const rest = line.replace(/^\d+\.\s*[^:]+:\s*/i, '');
          return (
            <div key={i} className="flex gap-2 items-start">
              <span
                className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 tracking-wider"
                style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
              >
                {label}
              </span>
              <span className="text-[11px] leading-[1.7] font-sans" style={{ color: 'rgba(255,255,255,.85)' }}>
                {rest}
              </span>
            </div>
          );
        }

        // Highlight BUY / SELL / HOLD / WATCH / AVOID tokens inline
        const actionMatch = line.match(/\b(BUY|SELL|HOLD|WATCH|AVOID)\b/);
        if (actionMatch) {
          const s = LABELS[actionMatch[1]] ?? LABELS['WATCH'];
          return (
            <p key={i} className="text-[11px] leading-[1.7] font-sans" style={{ color: 'rgba(255,255,255,.8)' }}>
              {line.split(/(BUY|SELL|HOLD|WATCH|AVOID)/g).map((part, j) =>
                LABELS[part]
                  ? <span key={j} className="font-bold px-1 rounded text-[10px]"
                      style={{ color: (LABELS[part] ?? LABELS['WATCH']).color, background: (LABELS[part] ?? LABELS['WATCH']).bg }}>
                      {part}
                    </span>
                  : part
              )}
            </p>
          );
        }

        return (
          <p key={i} className="text-[11px] leading-[1.7] font-sans" style={{ color: 'rgba(255,255,255,.75)' }}>
            {line}
          </p>
        );
      })}
      {isStreaming && <span className="animate-blink text-[#00f3ff] text-xs">▌</span>}
    </div>
  );
};

const ThinkingDots: React.FC = () => (
  <span className="flex gap-1 items-center">
    {[0, 1, 2].map(i => (
      <span key={i} className="w-1 h-1 rounded-full bg-[#00f3ff] inline-block"
        style={{ animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
    ))}
  </span>
);

export default AryaCardInsight;
