/* Arya / Ollama AI Service — mirrors arya-ai.js transport layer */
// Requests go through Vite's dev-server proxy → avoids browser CORS blocks
const OLLAMA_URL   = '/ollama/api/generate';
const OLLAMA_TAGS  = '/ollama/api/tags';
const OLLAMA_MODEL = 'qwen3:14b';
const TIMEOUT_MS   = 45_000;

const BASE_SYSTEM = `You are Arya, FIN·OS's AI financial coach embedded in the Expense Tracker.
Persona: Brilliant IIM-educated friend who explains finance like a real person over chai.
Language: English with natural Hinglish tone (bhai, yaar, ek second).
Rules:
• Be concise — 3-5 sentences unless asked to elaborate
• Always use Indian context (INR, Indian markets, SEBI, RBI, SIPs, FDs)
• Use ₹ symbol, Indian numbering (L = lakh, Cr = crore, K = thousand)
• End with ONE actionable tip or next step
• NEVER give wrong numbers — if uncertain, say so honestly
• No markdown formatting — plain conversational text only`;

function stripThinking(text) {
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openIdx = s.indexOf('<think>');
  if (openIdx !== -1) s = s.slice(0, openIdx);
  return s.trim();
}

function buildFinancialContext(financialData) {
  const { INCOME = 0, needs = 0, wants = 0, saves = 0, total = 0, savings = 0, health = 0, transactions = [] } = financialData;
  const savingsRate = INCOME > 0 ? Math.round((savings / INCOME) * 100) : 0;
  const recurring = transactions.filter(t => t.isRecurring);
  const recurringTotal = recurring.reduce((a, t) => a + t.amount, 0);
  const topTx = [...transactions]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map(t => `${t.name} (${t.category}, ₹${t.amount}${t.isRecurring ? ', recurring' : ''})`)
    .join('; ');

  // ── Enrich with FINOS_USER_CONTEXT (identity, DNA, goals) if available ──
  let userProfile = '';
  try {
    const ctx = window.FINOS_USER_CONTEXT;
    const id  = ctx?.identity || {};
    const get = (k, fb = '') => localStorage.getItem(k) || fb;
    const name = id.name || get('finos_display_name', 'Investor');
    const dna  = id.financial_dna || get('finos_financial_dna', 'Explorer');
    const stage = id.life_stage || get('finos_stage', 'unknown');
    const mindset = id.mindset || get('finos_mindset', 'unknown');
    const profileLines = [
      `Name: ${name} | DNA archetype: ${dna} | Life stage: ${stage} | Mindset: ${mindset}`,
    ];
    const dnaData = ctx?.dna || (() => { try { return JSON.parse(localStorage.getItem('FINOS_CORE_DNA') || 'null'); } catch { return null; } })();
    if (dnaData?.scores?.length >= 5) {
      profileLines.push(`Psychographic → Risk:${dnaData.scores[0]} Discipline:${dnaData.scores[3]} Growth:${dnaData.scores[4]} (out of 100)`);
    }
    const goals = ctx?.financial?.goals || (() => { try { return JSON.parse(localStorage.getItem('finos_goals') || '[]'); } catch { return []; } })();
    if (goals.length) {
      profileLines.push(`Goals: ${goals.slice(0,4).map(g => `${g.name || g.goal_name} (target ₹${(g.target_amount || g.target || 0).toLocaleString('en-IN')})`).join(' · ')}`);
    }
    if (profileLines.length) userProfile = '\n\nUSER PROFILE:\n' + profileLines.map(l => `• ${l}`).join('\n');
  } catch {}

  return `${BASE_SYSTEM}${userProfile}

USER'S FINANCIAL DATA (this month):
• Monthly Income: ₹${INCOME.toLocaleString('en-IN')}
• Total Spend: ₹${total.toLocaleString('en-IN')} (${INCOME > 0 ? Math.round((total / INCOME) * 100) : 0}% of income)
• Needs: ₹${needs.toLocaleString('en-IN')} | Wants: ₹${wants.toLocaleString('en-IN')} | Investments: ₹${saves.toLocaleString('en-IN')}
• Liquid Savings (unspent): ₹${savings.toLocaleString('en-IN')} | Savings Rate: ${savingsRate}%
• Financial Health Score: ${health}%
• Ghost Tax (recurring): ₹${recurringTotal.toLocaleString('en-IN')}/mo (${recurring.length} subscriptions)
• Top transactions: ${topTx || 'None logged yet'}`;
}

/** Stream Ollama response — calls onToken(displayText) on each chunk, returns full clean text */
export async function streamAskArya(prompt, financialData, onToken) {
  const system = buildFinancialContext(financialData);
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let full = '';

  try {
    const res = await fetch(OLLAMA_URL, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  OLLAMA_MODEL,
        system: system,
        prompt: prompt,
        stream: true,
        options: { temperature: 0.7, num_predict: 512, think: false }
      }),
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status} — is Ollama running?`);

    const reader = res.body.getReader();
    const dec    = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.response) {
            full += obj.response;
            const clean = stripThinking(full);
            if (onToken && clean) onToken(clean);
          }
        } catch {}
      }
    }
    return stripThinking(full);
  } finally {
    clearTimeout(tid);
  }
}

/** Non-streaming version — resolves with full clean text */
export async function askArya(prompt, financialData) {
  return streamAskArya(prompt, financialData, null);
}

/** Suggest category + type for a transaction name */
export async function suggestCategory(transactionName, BEHAVIOR_TYPES, TRANSACTION_TYPES) {
  const flatBehaviors = BEHAVIOR_TYPES.flatMap(o => o.options || [o]).map(o => o.value);
  const flatTypes = TRANSACTION_TYPES.flatMap(o => o.options || [o]).map(o => o.value);

  const prompt = `Classify this Indian expense transaction.
Transaction name: "${transactionName}"
Available categories: ${flatBehaviors.join(', ')}
Available types: ${flatTypes.join(', ')}

Reply with ONLY a JSON object, nothing else. Example: {"category":"need_essential","type":"Food & Dining"}`;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10_000);

  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: 'You are a transaction classifier. Reply ONLY with valid JSON, no explanation, no markdown.',
        prompt: prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 60, think: false }
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = stripThinking(data.response || '');
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    // Validate both fields exist in allowed lists
    if (flatBehaviors.includes(parsed.category) && flatTypes.includes(parsed.type)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

export async function isOllamaOnline() {
  try {
    const r = await fetch(OLLAMA_TAGS, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}
