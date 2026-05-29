/**
 * arya.ts — Arya AI service for News1 (React/TypeScript)
 * Mirrors the transport layer from arya-ai.js but typed for the React environment.
 * Streams directly from Ollama — no proxy needed.
 */

const OLLAMA_URL   = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'qwen3:14b';
const TIMEOUT_MS   = 45_000;

export const BASE_SYSTEM = `You are Arya, FIN·OS's AI financial coach for Indian investors.
Persona: Brilliant IIM-educated friend who explains finance like a real person over chai.
Language: Mix of English + Hinglish (natural desi tone).
Rules:
• Be concise — 2-4 sentences max unless asked to elaborate
• Always ground advice in Indian context (INR, Indian markets, SEBI, RBI, BSE/NSE)
• Use ₹ symbol, Indian numbering (L = lakh, Cr = crore, K = thousand)
• End with ONE actionable tip or question
• NEVER give wrong numbers — if uncertain, say so honestly
• No markdown formatting — plain conversational text only`;

/** Strip <think>…</think> blocks emitted by qwen3 reasoning mode */
function stripThinking(text: string): string {
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openIdx = s.indexOf('<think>');
  if (openIdx !== -1) s = s.slice(0, openIdx);
  return s.trim();
}

/**
 * Stream a response from Ollama token by token.
 * @param prompt     — the user prompt
 * @param onToken    — called on each token with the current clean display text
 * @param system     — optional system override (defaults to BASE_SYSTEM)
 * @param maxTokens  — max tokens to generate (default 512; use 768+ for long digests)
 * @returns          — final clean text (think-blocks stripped)
 */
export async function ollamaStream(
  prompt: string,
  onToken?: (display: string) => void,
  system?: string,
  maxTokens = 512
): Promise<string> {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let   full = '';

  try {
    const res = await fetch(OLLAMA_URL, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  OLLAMA_MODEL,
        system: system ?? BASE_SYSTEM,
        prompt,
        stream: true,
        options: { temperature: 0.7, num_predict: maxTokens, think: false },
      }),
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.response) {
            full += obj.response;
            const display = stripThinking(full);
            if (onToken && display) onToken(display);
          }
        } catch { /* partial JSON — skip */ }
      }
    }
    return stripThinking(full);
  } finally {
    clearTimeout(tid);
  }
}

// ── Context helpers ───────────────────────────────────────────────────────────

import type { UserContext } from '../hooks/useUserContext';

const INR = (n: number) => '₹' + Number(n).toLocaleString('en-IN');

/**
 * Build a comprehensive, structured context block from the full UserContext.
 * This is what feeds Arya — the richer this is, the smarter the insights.
 */
export function buildRichContext(ctx: UserContext): string {
  const p = ctx.profile;
  const lines: string[] = [];

  // ── Identity ──────────────────────────────────────────────────────────────
  lines.push('▸ IDENTITY');
  lines.push(`  Name: ${p.fullName}${p.city ? ` · ${p.city}` : ''}${p.email ? ` · ${p.email}` : ''}`);
  lines.push(`  Member since: ${p.memberSince || 'unknown'} | Auth: ${ctx.isLoggedIn ? 'Logged in (DB data)' : 'Guest (localStorage only)'}`);

  // ── Financial Profile ─────────────────────────────────────────────────────
  lines.push('');
  lines.push('▸ FINANCIAL PROFILE');
  lines.push(`  DNA archetype: ${p.financialDna}`);
  lines.push(`  Life stage: ${p.lifeStage} | Income bracket: ₹${p.incomeRange}/month`);
  lines.push(`  Interests: ${Array.isArray(p.interests) ? p.interests.join(', ') : p.interests}`);
  lines.push(`  Money mindset: ${p.mindset}`);
  if (p.curiosityQuery) lines.push(`  Currently curious about: "${p.curiosityQuery}"`);

  // ── Financial Health Metrics ──────────────────────────────────────────────
  lines.push('');
  lines.push('▸ FINANCIAL HEALTH METRICS');
  lines.push(`  Net worth: ${INR(p.netWorth)}`);
  lines.push(`  Savings rate: ${p.savingsRate}%`);
  lines.push(`  Health score: ${p.healthScore}/100`);

  // Psych/DNA scores if available
  if (p.psychProfile) {
    try {
      const dna = JSON.parse(p.psychProfile);
      if (dna.scores?.length >= 5) {
        lines.push(`  Psychographic DNA scores (out of 100):`);
        lines.push(`    Risk appetite: ${dna.scores[0]} | Security need: ${dna.scores[1]} | Status drive: ${dna.scores[2]}`);
        lines.push(`    Discipline:    ${dna.scores[3]} | Growth focus: ${dna.scores[4]}`);
      }
    } catch {}
  }

  // X-Ray data
  try {
    const raw = localStorage.getItem('FINOS_XRAY_DATA');
    if (raw) {
      const d = JSON.parse(raw);
      lines.push(`  X-Ray data → Monthly income: ₹${d.income}, Invest rate: ${d.investRate}%, FIRE corpus target: ₹${d.fireTarget}Cr`);
    }
  } catch {}

  // ── Transaction Analysis ──────────────────────────────────────────────────
  if (ctx.transactions) {
    const tx = ctx.transactions;
    lines.push('');
    lines.push('▸ TRANSACTION ANALYSIS (last 100 transactions)');
    lines.push(`  Total income logged:  ${INR(tx.totalIncome)}`);
    lines.push(`  Total expenses:       ${INR(tx.totalExpense)}`);
    lines.push(`  Net cashflow:         ${INR(tx.netCashflow)} (${tx.netCashflow >= 0 ? 'surplus' : 'deficit'})`);
    lines.push(`  Has SIP/investments:  ${tx.hasSIP ? 'YES' : 'NO — no SIP detected'}`);
    if (tx.topCategories.length) {
      lines.push(`  Top spending categories:`);
      tx.topCategories.forEach(c =>
        lines.push(`    • ${c.cat}: ${INR(c.amt)} (${c.pct}% of expenses)`)
      );
    }
    if (tx.recent.length) {
      lines.push(`  8 most recent transactions:`);
      tx.recent.forEach(r =>
        lines.push(`    [${r.date}] ${r.type.toUpperCase()} ${INR(r.amount)} — ${r.category}`)
      );
    }
    if (tx.anomalies.length) {
      lines.push(`  ⚠ Detected anomalies:`);
      tx.anomalies.forEach(a => lines.push(`    ${a}`));
    }
  }

  // ── Financial Goals ───────────────────────────────────────────────────────
  if (ctx.goals.length) {
    lines.push('');
    lines.push(`▸ FINANCIAL GOALS (${ctx.goals.length} goals)`);
    ctx.goals.forEach(g => {
      const status = g.progressPct >= 100 ? '✅ COMPLETE'
                   : g.onTrack         ? '🟢 On track'
                   : '🔴 Behind';
      lines.push(`  • ${g.name}`);
      lines.push(`    Target: ${INR(g.target)} | Saved: ${INR(g.saved)} | Progress: ${g.progressPct}% | ${status}`);
      if (g.deadline) lines.push(`    Deadline: ${g.deadline}`);
    });
  }

  // ── Portfolio / Holdings ──────────────────────────────────────────────────
  if (ctx.portfolio) {
    const pf = ctx.portfolio;
    lines.push('');
    lines.push(`▸ STOCK PORTFOLIO (${pf.holdings.length} holdings)`);
    lines.push(`  Total value:  ${INR(pf.totalValue)}`);
    lines.push(`  Total cost:   ${INR(pf.totalCost)}`);
    lines.push(`  Overall P&L:  ${INR(pf.pnl)} (${pf.pnlPct > 0 ? '+' : ''}${pf.pnlPct}%)`);
    if (pf.topGainer) lines.push(`  Top gainer:   ${pf.topGainer.symbol} +${pf.topGainer.gainLossPct}% (${INR(pf.topGainer.gainLoss)})`);
    if (pf.topLoser)  lines.push(`  Top loser:    ${pf.topLoser.symbol} ${pf.topLoser.gainLossPct}% (${INR(pf.topLoser.gainLoss)})`);
    lines.push(`  Holdings breakdown:`);
    pf.holdings.slice(0, 10).forEach(h =>
      lines.push(`    • ${h.symbol}: ${h.quantity} units @ avg ${INR(h.avgPrice)} → now ${INR(h.currentPrice)} | P&L: ${h.gainLoss >= 0 ? '+' : ''}${INR(h.gainLoss)} (${h.gainLossPct > 0 ? '+' : ''}${h.gainLossPct}%)`)
    );
  }

  return lines.join('\n');
}

/**
 * Lightweight fallback — only localStorage, no DB.
 * Used as the baseline before DB data loads.
 */
export function buildUserProfile(): string {
  const get = (k: string, fb = '') => localStorage.getItem(k) || fb;
  const lines = [
    `Name: ${get('finos_display_name', 'Investor')}`,
    `DNA: ${get('finos_financial_dna', 'Explorer')} | Stage: ${get('finos_stage', 'Rookie')} | Income: ₹${get('finos_income', 'not set')}`,
    `Interests: ${get('finos_interests', 'stocks')} | Mindset: ${get('finos_mindset', 'freedom')}`,
    `Net worth: ${INR(parseFloat(get('finos_net_worth', '0')))} | Savings rate: ${get('finos_savings_rate', '0')}% | Health: ${get('finos_health_score', '0')}/100`,
  ];
  try {
    const raw = localStorage.getItem('FINOS_CORE_DNA');
    if (raw) {
      const d = JSON.parse(raw);
      if (d.scores?.length >= 5)
        lines.push(`DNA scores → Risk:${d.scores[0]} Security:${d.scores[1]} Discipline:${d.scores[3]} Growth:${d.scores[4]}`);
    }
  } catch {}
  try {
    const raw = localStorage.getItem('FINOS_XRAY_DATA');
    if (raw) {
      const d = JSON.parse(raw);
      lines.push(`X-Ray → Income:₹${d.income}/mo, InvestRate:${d.investRate}%, FIRE:₹${d.fireTarget}Cr`);
    }
  } catch {}
  return lines.join('\n  ');
}

/** Human-readable relative time */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60)           return 'Just now';
  const mins = Math.floor(seconds / 60);
  if (mins  < 60)             return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs   < 24)             return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Quick check if Ollama is reachable */
export async function isOllamaOnline(): Promise<boolean> {
  try {
    const r = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
