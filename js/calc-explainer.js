/**
 * FIN-OS Calculator AI Explainer  v1
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-hooks into any FIN-OS calculator page after results render.
 * Shows an "Arya Explains" panel with:
 *   • Plain-language result interpretation in Hinglish
 *   • Inflation-adjusted real value
 *   • Step-up / what-if scenario suggestion
 *   • Personalised next action based on archetype
 *
 * Usage: Add <script src="../../js/calc-explainer.js"></script> to any
 * calculator HTML page. Works automatically.
 */

(function CalcExplainer() {
  'use strict';

  const OLLAMA_URL   = 'https://127.0.0.1:8767/api/generate';
  const OLLAMA_MODEL = 'qwen3:14b';
  const WS_URL       = 'wss://127.0.0.1:8765';

  /* ── User profile ─────────────────────────────────────────────────────────*/
  function _prof() {
    try {
      return {
        archetype:  localStorage.getItem('finos_financial_dna') || 'Investor',
        riskScore:  parseInt(localStorage.getItem('finos_risk_score') || '50'),
        income:     localStorage.getItem('finos_monthly_income') || 'unknown',
      };
    } catch { return { archetype: 'Investor' }; }
  }

  /* ── Detect calculator type from page URL ────────────────────────────────*/
  function _calcType() {
    const p = window.location.pathname.toLowerCase();
    if (p.includes('sip'))          return 'sip';
    if (p.includes('emi') || p.includes('loan')) return 'emi';
    if (p.includes('lump'))         return 'lumpsum';
    if (p.includes('tax'))          return 'tax';
    if (p.includes('fd') || p.includes('fixed')) return 'fd';
    if (p.includes('ppf'))          return 'ppf';
    if (p.includes('retirement'))   return 'retirement';
    if (p.includes('goal'))         return 'goal';
    if (p.includes('rd') || p.includes('recurring')) return 'rd';
    if (p.includes('net-worth') || p.includes('networth')) return 'networth';
    if (p.includes('inflation'))    return 'inflation';
    if (p.includes('step'))         return 'step_up_sip';
    if (p.includes('cagr'))         return 'cagr';
    if (p.includes('swp'))          return 'swp';
    if (p.includes('hra'))          return 'hra';
    if (p.includes('gratuity'))     return 'gratuity';
    if (p.includes('salary'))       return 'salary';
    if (p.includes('option'))       return 'options';
    if (p.includes('position') || p.includes('margin')) return 'trading';
    return 'generic';
  }

  /* ── Read result values from DOM ─────────────────────────────────────────*/
  function _readResults() {
    // Try common result element IDs used across FIN-OS calculators
    const ids = [
      'totalVal', 'maturityVal', 'result', 'resultAmt', 'total', 'corpusVal',
      'investedVal', 'returnsVal', 'emiVal', 'emiResult', 'monthlyEmi',
      'taxOld', 'taxNew', 'savings', 'netSalary', 'inHandSalary',
      'retirementCorpus', 'goalAmount', 'futureValue', 'ppfMaturity',
      'fdMaturity', 'rdMaturity', 'swpAmount', 'cgrResult', 'hraExemption',
    ];

    const results = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.textContent.trim()) {
        results[id] = el.textContent.trim();
      }
    });

    // Also grab output of elements with class .result-value, .output-val
    document.querySelectorAll('.result-value, .output-val, .calc-result').forEach(el => {
      const label = el.closest('[data-label]')?.dataset.label
                 || el.previousElementSibling?.textContent?.trim()
                 || el.className;
      if (label && el.textContent.trim()) {
        results[label] = el.textContent.trim();
      }
    });

    return results;
  }

  /* ── Build prompt from calc type + results ───────────────────────────────*/
  function _buildPrompt(calcType, results, inputs, prof) {
    const resultsStr = Object.entries(results)
      .filter(([k, v]) => v && v !== '₹0' && v !== '0')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    const inputsStr = Object.entries(inputs)
      .filter(([k, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    const calcLabels = {
      sip: 'SIP (Systematic Investment Plan)',
      emi: 'Loan EMI',
      lumpsum: 'Lump Sum Investment',
      tax: 'Income Tax Calculator',
      fd: 'Fixed Deposit',
      ppf: 'PPF (Public Provident Fund)',
      retirement: 'Retirement Corpus',
      goal: 'Goal-Based SIP',
      rd: 'Recurring Deposit',
      inflation: 'Inflation Impact',
      step_up_sip: 'Step-Up SIP',
      generic: 'Financial Calculator',
    };

    return `
Calculator type: ${calcLabels[calcType] || calcType}
User inputs: ${inputsStr || 'not captured'}
Results shown to user:
${resultsStr || '(read from page context)'}

User archetype: ${prof.archetype}, Risk score: ${prof.riskScore}/100

Write a 3-sentence Hinglish explanation for this calculator result:
1. Sentence 1: What this number ACTUALLY means in real life (not just the number)
2. Sentence 2: One important insight they might miss (inflation-adjusted value, total interest paid, opportunity cost, etc.)
3. Sentence 3: One specific improvement or "pro tip" relevant to their ${prof.archetype} archetype

Format: Direct Hinglish, no preamble, no "Sure!", use ₹ amounts. Lead with the insight, not the number.
`.trim();
  }

  /* ── Inject CSS once ─────────────────────────────────────────────────────*/
  function _css() {
    if (document.getElementById('calc-explainer-css')) return;
    const s = document.createElement('style');
    s.id = 'calc-explainer-css';
    s.textContent = `
      #arya-calc-panel {
        margin: 20px 0; border-radius: 16px; overflow: hidden;
        border: 1px solid rgba(0,255,136,.18);
        background: linear-gradient(135deg,rgba(0,255,136,.04),rgba(79,124,255,.03));
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #arya-calc-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(0,255,136,.1);
      }
      #arya-calc-header-left {
        display: flex; align-items: center; gap: 10px;
      }
      #arya-calc-header-icon { font-size: 20px; }
      #arya-calc-header-title {
        font-size: 13px; font-weight: 700; color: #00ff88; letter-spacing: .3px;
      }
      #arya-calc-header-sub {
        font-size: 11px; color: rgba(255,255,255,.35); margin-top: 1px;
      }
      #arya-calc-refresh-btn {
        padding: 5px 12px; border-radius: 8px; cursor: pointer;
        border: 1px solid rgba(0,255,136,.2); background: rgba(0,255,136,.06);
        color: #00ff88; font-size: 11px; font-weight: 700;
        font-family: -apple-system, sans-serif; transition: all .2s;
      }
      #arya-calc-refresh-btn:hover { background: rgba(0,255,136,.14); }
      #arya-calc-body {
        padding: 16px 18px; font-size: 14px; color: rgba(255,255,255,.85);
        line-height: 1.75; min-height: 60px;
      }
      #arya-calc-footer {
        padding: 10px 18px; border-top: 1px solid rgba(255,255,255,.04);
        display: flex; gap: 8px; flex-wrap: wrap;
      }
      .arya-calc-pill {
        padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;
        cursor: pointer; font-family: -apple-system, sans-serif; transition: all .2s;
      }
      .arya-calc-pill-blue {
        border: 1px solid rgba(79,124,255,.3); background: rgba(79,124,255,.07); color: #7ca4ff;
      }
      .arya-calc-pill-blue:hover { background: rgba(79,124,255,.15); }
      .arya-calc-pill-orange {
        border: 1px solid rgba(255,183,3,.3); background: rgba(255,183,3,.06); color: #ffb703;
      }
      .arya-calc-pill-orange:hover { background: rgba(255,183,3,.14); }
      .arya-calc-thinking {
        display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,.4);
      }
      .arya-calc-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #00ff88;
        animation: arya-bounce .8s infinite;
      }
      .arya-calc-dot:nth-child(2) { animation-delay: .15s; }
      .arya-calc-dot:nth-child(3) { animation-delay: .3s; }
      @keyframes arya-bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
    `;
    document.head.appendChild(s);
  }

  /* ── Render the panel ────────────────────────────────────────────────────*/
  function _createPanel() {
    let panel = document.getElementById('arya-calc-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'arya-calc-panel';
    panel.innerHTML = `
      <div id="arya-calc-header">
        <div id="arya-calc-header-left">
          <div id="arya-calc-header-icon">🧠</div>
          <div>
            <div id="arya-calc-header-title">Arya Explains</div>
            <div id="arya-calc-header-sub">What this result really means for you</div>
          </div>
        </div>
        <button id="arya-calc-refresh-btn" onclick="window._aryaCalcExplain(true)">↺ Refresh</button>
      </div>
      <div id="arya-calc-body">
        <div class="arya-calc-thinking">
          <div class="arya-calc-dot"></div>
          <div class="arya-calc-dot"></div>
          <div class="arya-calc-dot"></div>
          <span>Arya result analyse kar rahi hai…</span>
        </div>
      </div>
      <div id="arya-calc-footer">
        <button class="arya-calc-pill arya-calc-pill-blue" onclick="window._aryaWhatIf()">📊 What-If Scenarios</button>
        <button class="arya-calc-pill arya-calc-pill-orange" onclick="window._aryaVoiceExplain()">🎙 Arya se poocho</button>
      </div>
    `;
    return panel;
  }

  /* ── Ollama stream helper ─────────────────────────────────────────────────*/
  async function _stream(prompt, system, onTok) {
    try {
      const resp = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL, prompt, system,
          stream: true, options: { temperature: 0.6, num_predict: 250, num_ctx: 4096 },
        }),
      });
      if (!resp.ok || !resp.body) return '';
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        dec.decode(value).split('\n').forEach(line => {
          if (!line.trim()) return;
          try {
            const d = JSON.parse(line);
            const tok = (d.response || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
            if (tok) { full += tok; onTok && onTok(tok, full); }
          } catch {}
        });
      }
      return full.trim();
    } catch { return ''; }
  }

  /* ── Read slider/input values from calculator ───────────────────────────*/
  function _readInputs() {
    const inputs = {};
    const sliders = document.querySelectorAll('input[type="range"], input[type="number"]');
    sliders.forEach(el => {
      if (el.id && el.value) {
        inputs[el.id] = el.value + (el.dataset.unit || '');
      }
    });
    return inputs;
  }

  /* ── Main explain function ───────────────────────────────────────────────*/
  window._aryaCalcExplain = async function(force = false) {
    const bodyEl = document.getElementById('arya-calc-body');
    if (!bodyEl) return;

    const calcType = _calcType();
    const results  = _readResults();
    const inputs   = _readInputs();
    const prof     = _prof();

    if (!Object.keys(results).length && !force) return; // no results yet

    bodyEl.innerHTML = `<div class="arya-calc-thinking"><div class="arya-calc-dot"></div><div class="arya-calc-dot"></div><div class="arya-calc-dot"></div><span>Arya result analyse kar rahi hai…</span></div>`;

    const prompt  = _buildPrompt(calcType, results, inputs, prof);
    const system  = `You are Arya, FIN-OS's AI financial explainer for Indian retail investors.
Explain calculator results in plain Hinglish — like a smart IIM-educated dost.
Be direct, use ₹ amounts, Indian context. 3 sentences max. No markdown. No preamble.
Always give one pro tip specific to the user's archetype.`;

    let started = false;
    const result = await _stream(prompt, system, (tok, full) => {
      bodyEl.textContent = full;
      started = true;
    });

    if (!started) {
      bodyEl.textContent = 'Arya offline — Ollama start karo. Tab tak: apne numbers check karo aur inflation-adjusted value calculate karo (real value = nominal / 1.06^years).';
    }
  };

  /* ── What-if scenario popup ──────────────────────────────────────────────*/
  window._aryaWhatIf = async function() {
    const bodyEl = document.getElementById('arya-calc-body');
    if (!bodyEl) return;

    const calcType = _calcType();
    const results  = _readResults();
    const inputs   = _readInputs();
    const prof     = _prof();

    bodyEl.innerHTML = `<div class="arya-calc-thinking"><div class="arya-calc-dot"></div><div class="arya-calc-dot"></div><div class="arya-calc-dot"></div><span>What-if scenarios bana raha hai…</span></div>`;

    const prompt = `
Calculator: ${calcType}
Current inputs: ${JSON.stringify(inputs)}
Current result: ${JSON.stringify(results)}
User archetype: ${prof.archetype}

Generate 2 "What-if" scenarios for this calculator result:
1. An OPTIMISTIC improvement (e.g. step-up, longer horizon, higher rate) with specific ₹ difference
2. A RISK scenario (what if rate drops, or you stop early) with specific ₹ impact

Format: 2 bullet points, each 1 sentence. Hinglish. Use exact ₹ numbers from calculations.
`.trim();

    await _stream(prompt, 'Arya FIN-OS AI. Generate 2 what-if scenarios. Hinglish. Specific ₹ numbers. No preamble.', (tok, full) => {
      bodyEl.textContent = full;
    });
  };

  /* ── Voice explain via Arya WS ───────────────────────────────────────────*/
  window._aryaVoiceExplain = function() {
    const results = _readResults();
    const text    = Object.entries(results).map(([k, v]) => `${k}: ${v}`).join(', ');

    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'text_input',
          text: `[CALC EXPLANATION REQUEST]: ${_calcType()} calculator result — ${text}. Explain this to me in plain Hinglish — what it means in real life, one thing I'm missing, and one improvement tip.`,
        }));
        setTimeout(() => { try { ws.close(); } catch {} }, 20000);
      };
      ws.onerror = () => alert('Voice agent offline — Ollama + voiceagent/agent.py start karo.');
    } catch { alert('WebSocket not available.'); }
  };

  /* ── Find best injection point ───────────────────────────────────────────*/
  function _findInjectionPoint() {
    // Priority: after results display, before buttons, inside result-section
    const candidates = [
      document.getElementById('resultSection'),
      document.getElementById('results'),
      document.getElementById('result-card'),
      document.querySelector('.result-card'),
      document.querySelector('.result-section'),
      document.querySelector('.output-section'),
      document.querySelector('.calc-result'),
      // Fallback: after the last output element
      (() => {
        const el = document.getElementById('totalVal') || document.getElementById('result') || document.getElementById('emiVal');
        return el?.closest('div, section, .card') || null;
      })(),
    ];

    for (const c of candidates) {
      if (c && document.contains(c)) return { el: c, mode: 'after' };
    }
    return null;
  }

  /* ── Hook into calculate() to trigger explain after each calculation ─────*/
  function _hookCalculate() {
    const origCalc = window.calculate;
    if (typeof origCalc !== 'function') return false;

    window.calculate = function(...args) {
      const ret = origCalc.apply(this, args);
      // Delay so DOM updates first
      setTimeout(() => window._aryaCalcExplain(false), 100);
      return ret;
    };
    return true;
  }

  /* ── Boot ────────────────────────────────────────────────────────────────*/
  function _boot() {
    _css();

    // Don't run on non-calculator pages
    const isCalcPage = window.location.pathname.toLowerCase().includes('calculators') ||
                       window.location.pathname.toLowerCase().includes('calc') ||
                       document.title.toLowerCase().includes('calculator') ||
                       !!document.querySelector('input[type="range"]');
    if (!isCalcPage) return;

    const panel = _createPanel();
    let injected = false;

    // Try to find injection point
    const target = _findInjectionPoint();
    if (target) {
      target.el.insertAdjacentElement('afterend', panel);
      injected = true;
    }

    // Fallback: append to main content area
    if (!injected) {
      const main = document.querySelector('.calc-body, .calculator-body, main, .content-wrapper, .container, body');
      if (main) { main.appendChild(panel); injected = true; }
    }

    // Hook calculate() to auto-explain
    const hooked = _hookCalculate();

    // Also handle event-driven calculators (listen for result changes)
    const resultEls = ['totalVal','emiVal','result','maturityVal','corpusVal','fdMaturity']
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (resultEls.length) {
      const obs = new MutationObserver(() => {
        clearTimeout(window._calcExplainTimer);
        window._calcExplainTimer = setTimeout(() => window._aryaCalcExplain(false), 800);
      });
      resultEls.forEach(el => obs.observe(el, { childList: true, characterData: true, subtree: true }));
    }

    // Also hook on input events as a catch-all
    document.querySelectorAll('input[type="range"], input[type="number"]').forEach(el => {
      el.addEventListener('change', () => {
        clearTimeout(window._calcExplainTimer);
        window._calcExplainTimer = setTimeout(() => window._aryaCalcExplain(false), 1200);
      });
    });

    // Run once for any pre-rendered result
    setTimeout(() => window._aryaCalcExplain(false), 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    setTimeout(_boot, 200);
  }

})();
