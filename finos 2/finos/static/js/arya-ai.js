/**
 * arya-ai.js  — FIN·OS Universal AI Engine  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this one script on any page to unlock:
 *   • Calculator AI explainer     (AryaAI.explainCalc)
 *   • Dashboard AI brief          (AryaAI.dashboardBrief)
 *   • Portfolio risk check        (AryaAI.portfolioRisk)
 *   • Learn-page "Ask Arya"       (AryaAI.injectLearnButton)
 *   • News sentiment              (AryaAI.newsSentiment)
 *   • Pre-trade clearance         (AryaAI.preTradeClearance)
 *   • General chat                (AryaAI.ask)
 *
 * Transport priority:
 *   1. Arya WebSocket  ws://127.0.0.1:8765  (voiceagent — full TTS + memory)
 *   2. Ollama HTTP API http://localhost:11434  (text-only, fast)
 *   3. Graceful offline fallback
 *
 * Zero cloud cost. Runs 100% locally. Complete privacy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════════════════════ */
  const OLLAMA_URL   = 'http://localhost:11434/api/generate';
  const OLLAMA_MODEL = 'qwen3:14b';          // matches voiceagent
  const WS_URL       = 'ws://127.0.0.1:8765';
  const TIMEOUT_MS   = 45_000;

  /* ══════════════════════════════════════════════════════════════════════════
     SYSTEM PROMPT — Finance AI persona
  ══════════════════════════════════════════════════════════════════════════ */
  const BASE_SYSTEM = `You are Arya, FIN·OS's AI financial coach for Indian investors.
Persona: Brilliant IIM-educated friend who explains finance like a real person over chai.
Language: Mix of English + Hinglish (natural desi tone — "bhai", "yaar", "ek second").
Rules:
• Be concise — 2-4 sentences max unless asked to elaborate
• Always ground advice in Indian context (INR, Indian markets, SEBI, RBI, BSE/NSE)
• Use ₹ symbol, Indian numbering (L = lakh, Cr = crore, K = thousand)
• End with ONE actionable tip or question
• NEVER give wrong numbers — if uncertain, say so honestly
• No markdown formatting — plain conversational text only`;

  /* ══════════════════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════════════════ */
  let _ws        = null;
  let _wsReady   = false;
  let _wsQueue   = [];          // callbacks waiting for WS to open
  let _pendingCbs= {};          // req_id → {resolve, reject, timeout}
  let _reqId     = 0;

  /* ══════════════════════════════════════════════════════════════════════════
     TRANSPORT LAYER
  ══════════════════════════════════════════════════════════════════════════ */

  /** Call Ollama HTTP API — stream tokens into onToken, resolve full text */
  async function _ollamaStream(system, prompt, onToken) {
    const ctrl = new AbortController();
    const tid   = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let   full  = '';
    try {
      const res = await fetch(OLLAMA_URL, {
        method:  'POST',
        signal:  ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:  OLLAMA_MODEL,
          system: system || BASE_SYSTEM,
          prompt: prompt,
          stream: true,
          options: { temperature: 0.7, num_predict: 256 }
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
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
              if (onToken) onToken(obj.response, full);
            }
          } catch {}
        }
      }
      return full;
    } finally {
      clearTimeout(tid);
    }
  }

  /** Check if Ollama is reachable */
  async function _ollamaOnline() {
    try {
      const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     UI HELPERS
  ══════════════════════════════════════════════════════════════════════════ */

  /** Inject shared CSS once */
  function _injectCSS() {
    if (document.getElementById('arya-ai-styles')) return;
    const style = document.createElement('style');
    style.id = 'arya-ai-styles';
    style.textContent = `
      /* ── Arya AI Panel ─────────────────────────────────────── */
      .arya-ai-panel {
        margin-top: 24px;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(0,255,136,.06) 0%, rgba(0,212,255,.04) 100%);
        border: 1px solid rgba(0,255,136,.18);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .arya-ai-panel.hidden { display: none; }
      .arya-ai-header {
        display: flex; align-items: center; gap: 10px;
        padding: 14px 20px;
        background: rgba(0,255,136,.08);
        border-bottom: 1px solid rgba(0,255,136,.12);
        cursor: pointer; user-select: none;
      }
      .arya-ai-header-icon {
        width: 32px; height: 32px; border-radius: 10px;
        background: linear-gradient(135deg,#4d7cff,#00d4ff);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; flex-shrink: 0;
      }
      .arya-ai-header-title { font-weight: 700; font-size: 13px; color: #00ff88; letter-spacing: .4px; }
      .arya-ai-header-sub   { font-size: 11px; color: rgba(255,255,255,.5); margin-top: 1px; }
      .arya-ai-header-chevron { margin-left: auto; font-size: 13px; color: rgba(255,255,255,.4); transition: transform .2s; }
      .arya-ai-panel.collapsed .arya-ai-header-chevron { transform: rotate(-90deg); }
      .arya-ai-body {
        padding: 18px 20px;
        font-size: 14px; line-height: 1.7;
        color: rgba(255,255,255,.82);
        min-height: 52px;
      }
      .arya-ai-panel.collapsed .arya-ai-body { display: none; }
      .arya-ai-streaming { color: rgba(255,255,255,.62); }
      .arya-ai-cursor::after { content: '▌'; animation: aryaBlink .7s infinite; }
      @keyframes aryaBlink { 0%,100%{opacity:1} 50%{opacity:0} }
      .arya-ai-thinking {
        display: flex; align-items: center; gap: 8px;
        color: rgba(0,255,136,.7); font-size: 13px;
      }
      .arya-ai-thinking-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #00ff88;
        animation: aryaPulse 1.2s infinite;
      }
      .arya-ai-thinking-dot:nth-child(2) { animation-delay: .2s; }
      .arya-ai-thinking-dot:nth-child(3) { animation-delay: .4s; }
      @keyframes aryaPulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
      .arya-ai-footer {
        padding: 10px 20px 14px;
        display: flex; gap: 8px; flex-wrap: wrap;
      }
      .arya-ai-btn {
        padding: 6px 14px; border-radius: 20px; border: none; cursor: pointer;
        font-size: 12px; font-weight: 600; transition: all .18s;
      }
      .arya-ai-btn-primary {
        background: linear-gradient(135deg,#4d7cff,#00d4ff);
        color: #fff;
      }
      .arya-ai-btn-primary:hover { opacity: .88; transform: translateY(-1px); }
      .arya-ai-btn-ghost {
        background: rgba(255,255,255,.07);
        color: rgba(255,255,255,.7);
        border: 1px solid rgba(255,255,255,.12);
      }
      .arya-ai-btn-ghost:hover { background: rgba(255,255,255,.12); }
      /* ── Sentiment badge ───────────────────────────────────── */
      .arya-sentiment-badge {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 12px; border-radius: 20px;
        font-size: 12px; font-weight: 700;
      }
      .arya-sentiment-badge.bullish  { background:rgba(34,197,94,.15); color:#22c55e; }
      .arya-sentiment-badge.bearish  { background:rgba(239,68,68,.15);  color:#ef4444; }
      .arya-sentiment-badge.neutral  { background:rgba(148,163,184,.12);color:#94a3b8; }
      /* ── Learn "Ask Arya" floating btn ────────────────────── */
      #arya-learn-fab {
        position: fixed; bottom: 96px; right: 24px; z-index: 998;
        background: linear-gradient(135deg,#4d7cff,#00d4ff);
        border: none; border-radius: 50px; padding: 12px 18px;
        color: #fff; font-size: 13px; font-weight: 700;
        cursor: pointer; box-shadow: 0 6px 24px rgba(0,212,255,.35);
        display: flex; align-items: center; gap: 8px;
        transition: transform .18s, box-shadow .18s;
      }
      #arya-learn-fab:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(0,212,255,.5); }
      /* ── Pre-trade clearance modal ─────────────────────────── */
      #arya-pretrade-modal {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,.75); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
      }
      #arya-pretrade-modal.hidden { display: none; }
      .arya-pretrade-box {
        width: min(500px, 92vw);
        background: linear-gradient(180deg,rgba(9,16,30,.97),rgba(7,11,20,.99));
        border: 1px solid rgba(0,255,136,.22); border-radius: 24px;
        padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .arya-pretrade-score {
        width: 100px; height: 100px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 36px; font-weight: 800; margin: 16px auto;
        border: 4px solid currentColor;
      }
      .arya-pretrade-score.green  { color:#22c55e; background:rgba(34,197,94,.12); }
      .arya-pretrade-score.yellow { color:#eab308; background:rgba(234,179,8,.12); }
      .arya-pretrade-score.red    { color:#ef4444; background:rgba(239,68,68,.12); }
      /* ── Dashboard AI Brief ────────────────────────────────── */
      #arya-dashboard-brief {
        margin-bottom: 24px;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(0,255,136,.06), rgba(0,212,255,.04));
        border: 1px solid rgba(0,255,136,.2);
        padding: 20px 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #arya-dashboard-brief .brief-header {
        display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
      }
      #arya-dashboard-brief .brief-icon {
        width: 36px; height: 36px; border-radius: 12px;
        background: linear-gradient(135deg,#4d7cff,#00d4ff);
        display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      #arya-dashboard-brief .brief-title { font-weight: 700; font-size: 13px; color: #00ff88; }
      #arya-dashboard-brief .brief-time  { font-size: 11px; color: rgba(255,255,255,.4); }
      #arya-dashboard-brief .brief-text  {
        font-size: 14px; line-height: 1.7; color: rgba(255,255,255,.82);
      }
      #arya-dashboard-brief .brief-anomalies {
        margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;
      }
      #arya-dashboard-brief .brief-chip {
        padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
      }
      #arya-dashboard-brief .brief-chip.warn  { background:rgba(234,179,8,.15);  color:#eab308; }
      #arya-dashboard-brief .brief-chip.good  { background:rgba(34,197,94,.12);  color:#22c55e; }
      #arya-dashboard-brief .brief-chip.alert { background:rgba(239,68,68,.12);  color:#ef4444; }
    `;
    document.head.appendChild(style);
  }

  /** Create an AI panel element attached below `anchorEl` */
  function _createPanel(id, title, subtitle) {
    _injectCSS();
    let panel = document.getElementById(id);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id        = id;
    panel.className = 'arya-ai-panel';
    panel.innerHTML = `
      <div class="arya-ai-header" onclick="this.closest('.arya-ai-panel').classList.toggle('collapsed')">
        <div class="arya-ai-header-icon">🧠</div>
        <div>
          <div class="arya-ai-header-title">${title}</div>
          <div class="arya-ai-header-sub">${subtitle}</div>
        </div>
        <span class="arya-ai-header-chevron">▼</span>
      </div>
      <div class="arya-ai-body">
        <div class="arya-ai-thinking">
          <span class="arya-ai-thinking-dot"></span>
          <span class="arya-ai-thinking-dot"></span>
          <span class="arya-ai-thinking-dot"></span>
          <span style="margin-left:4px;font-size:13px;">Arya soch rahi hai…</span>
        </div>
      </div>
    `;
    return panel;
  }

  /** Stream Ollama response into a panel's body */
  async function _streamIntoPanel(panel, system, prompt, footerHTML) {
    const body = panel.querySelector('.arya-ai-body');
    body.innerHTML = '<span class="arya-ai-streaming arya-ai-cursor"></span>';
    const span = body.querySelector('span');

    try {
      const full = await _ollamaStream(system, prompt, (tok, all) => {
        span.textContent = all;
      });
      span.classList.remove('arya-ai-cursor');
      if (footerHTML) {
        const footer = document.createElement('div');
        footer.className = 'arya-ai-footer';
        footer.innerHTML = footerHTML;
        panel.appendChild(footer);
      }
      return full;
    } catch (e) {
      body.innerHTML = `<span style="color:rgba(255,255,255,.4)">
        ${_ollamaOfflineMsg()}
      </span>`;
      return null;
    }
  }

  function _ollamaOfflineMsg() {
    return `⚠️ Arya offline — make sure Ollama is running: <code>ollama serve</code>`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════════════════ */

  const AryaAI = {};

  /* ── Q1: Calculator AI Explainer ────────────────────────────────────────── */
  /**
   * Call this after any calculator's calculate() function.
   *
   * @param {object} opts
   *   calcType   — 'cagr' | 'sip' | 'emi' | 'tax' | etc.
   *   inputs     — { label: value } pairs fed into the calculator
   *   outputs    — { label: value } pairs produced (the results)
   *   anchorEl   — DOM element to attach the AI panel below (default: first .verdict-box)
   */
  AryaAI.explainCalc = function (opts) {
    const { calcType = 'calculator', inputs = {}, outputs = {}, anchorEl } = opts;

    // Debounce — don't call Ollama on every slider tick
    clearTimeout(AryaAI._calcDebounce);
    AryaAI._calcDebounce = setTimeout(async () => {

      // Build anchor
      const anchor = anchorEl
        || document.querySelector('.verdict-box')
        || document.querySelector('.result-grid')
        || document.querySelector('.impact-right')
        || document.querySelector('main');
      if (!anchor) return;

      // Create / reuse panel
      let panel = document.getElementById('arya-calc-panel');
      if (!panel) {
        panel = _createPanel('arya-calc-panel', '🧠 Arya Explains', 'Plain-language breakdown of your result');
        anchor.insertAdjacentElement('afterend', panel);
      }

      // Build prompt
      const inputStr  = Object.entries(inputs).map(([k,v])  => `${k}: ${v}`).join(', ');
      const outputStr = Object.entries(outputs).map(([k,v]) => `${k}: ${v}`).join(', ');
      const prompt = `
Calculator type: ${calcType}
Inputs: ${inputStr}
Results: ${outputStr}

In 2-3 sentences of natural Hinglish, explain:
1. What this result means in practical terms for an Indian investor
2. Whether this result is good/bad/average with Indian context benchmark
3. ONE specific actionable tip based on these numbers

Keep it conversational, use ₹ and Indian numbers (L, Cr, K).
`.trim();

      const panel2 = document.getElementById('arya-calc-panel');
      await _streamIntoPanel(
        panel2,
        BASE_SYSTEM,
        prompt,
        `<button class="arya-ai-btn arya-ai-btn-ghost" onclick="AryaAI.explainCalc({calcType:'${calcType}',inputs:${JSON.stringify(inputs)},outputs:${JSON.stringify(outputs)}})">🔄 Refresh</button>
         <button class="arya-ai-btn arya-ai-btn-primary" onclick="AryaAI._speak(document.querySelector('#arya-calc-panel .arya-ai-body').textContent)">🔊 Speak</button>`
      );
    }, 1200);  // 1.2s debounce — waits for user to stop sliding
  };

  /* ── Q3: Dashboard AI Brief ─────────────────────────────────────────────── */
  /**
   * Inject an AI morning brief above the dashboard content.
   * @param {object} data — { name, netWorth, savingsRate, healthScore, anomalies[] }
   * @param {Element} anchorEl — insert brief before this element
   */
  AryaAI.dashboardBrief = async function (data, anchorEl) {
    _injectCSS();

    const { name = 'Trader', netWorth = 0, savingsRate = 0,
            healthScore = 0, anomalies = [], lastActivity = null } = data;

    // Don't re-generate if cached in last 4 hours
    const cacheKey = 'arya_dash_brief_' + new Date().toDateString();
    const cached   = sessionStorage.getItem(cacheKey);

    let brief = document.getElementById('arya-dashboard-brief');
    if (!brief) {
      brief = document.createElement('div');
      brief.id = 'arya-dashboard-brief';
      brief.innerHTML = `
        <div class="brief-header">
          <div class="brief-icon">🧠</div>
          <div>
            <div class="brief-title">Arya's Morning Brief</div>
            <div class="brief-time">${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} · Personalized for ${name}</div>
          </div>
        </div>
        <div class="brief-text" id="arya-brief-text">
          <div class="arya-ai-thinking">
            <span class="arya-ai-thinking-dot"></span>
            <span class="arya-ai-thinking-dot"></span>
            <span class="arya-ai-thinking-dot"></span>
            <span style="margin-left:4px">Generating your daily brief…</span>
          </div>
        </div>
        <div class="brief-anomalies" id="arya-brief-anomalies"></div>
      `;
      if (anchorEl) anchorEl.insertAdjacentElement('beforebegin', brief);
      else document.querySelector('main, .main, .content-wrapper')?.prepend(brief);
    }

    const textEl = document.getElementById('arya-brief-text');

    if (cached) {
      textEl.textContent = cached;
      return;
    }

    const anomalyStr = anomalies.length
      ? 'Anomalies detected: ' + anomalies.join(', ') + '.'
      : 'No major anomalies.';

    const prompt = `
User: ${name}
Net Worth: ₹${Number(netWorth).toLocaleString('en-IN')}
Savings Rate: ${savingsRate}%
Financial Health Score: ${healthScore}/100
${anomalyStr}

Give a 2-3 sentence personalized morning financial brief in natural Hinglish.
Sound like a caring, smart friend — NOT a bank. Be specific, not generic.
End with ONE question to think about today.
`.trim();

    let full = '';
    textEl.innerHTML = '<span class="arya-ai-cursor"></span>';
    const span = textEl.querySelector('span');

    try {
      full = await _ollamaStream(BASE_SYSTEM, prompt, (tok, all) => {
        span.textContent = all;
      });
      span.classList.remove('arya-ai-cursor');
      sessionStorage.setItem(cacheKey, full);

      // Render anomaly chips
      if (anomalies.length) {
        const chipEl = document.getElementById('arya-brief-anomalies');
        anomalies.forEach(a => {
          const chip = document.createElement('span');
          chip.className = 'brief-chip ' + (a.startsWith('⚠') ? 'warn' : a.startsWith('✅') ? 'good' : 'alert');
          chip.textContent = a;
          chipEl.appendChild(chip);
        });
      }
    } catch {
      textEl.textContent = _ollamaOfflineMsg();
    }
  };

  /* ── Q5: Learn Page "Ask Arya" Button ────────────────────────────────────── */
  /**
   * Inject a floating "Samjha nahi? Ask Arya" button on learn pages.
   * Clicking it sends the currently selected text (or current section heading) to Arya.
   */
  AryaAI.injectLearnButton = function () {
    _injectCSS();
    if (document.getElementById('arya-learn-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'arya-learn-fab';
    fab.innerHTML = '🧠 Samjha nahi?';
    fab.title = 'Ask Arya to explain the selected text';
    document.body.appendChild(fab);

    // Modal for response
    const modal = document.createElement('div');
    modal.id = 'arya-learn-modal';
    modal.style.cssText = `
      display:none; position:fixed; inset:0; z-index:9998;
      background:rgba(0,0,0,.75); backdrop-filter:blur(6px);
      align-items:center; justify-content:center;
    `;
    modal.innerHTML = `
      <div style="width:min(520px,92vw);background:rgba(9,16,30,.97);border:1px solid rgba(0,255,136,.22);border-radius:24px;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#4d7cff,#00d4ff);display:flex;align-items:center;justify-content:center;font-size:18px;">🧠</div>
          <div>
            <div style="font-weight:700;font-size:14px;color:#00ff88;">Arya Explains</div>
            <div id="arya-learn-topic" style="font-size:11px;color:rgba(255,255,255,.4);"></div>
          </div>
          <button onclick="document.getElementById('arya-learn-modal').style.display='none'"
            style="margin-left:auto;background:none;border:none;color:rgba(255,255,255,.5);font-size:22px;cursor:pointer;">×</button>
        </div>
        <div id="arya-learn-response" style="font-size:14px;line-height:1.7;color:rgba(255,255,255,.82);min-height:60px;"></div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button id="arya-learn-more" class="arya-ai-btn arya-ai-btn-ghost" style="display:none">📖 Aur samjhao</button>
          <button class="arya-ai-btn arya-ai-btn-primary" onclick="AryaAI._speak(document.getElementById('arya-learn-response').textContent)">🔊 Bolne do Arya ko</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    fab.addEventListener('click', async () => {
      const sel  = window.getSelection()?.toString().trim();
      // Find current section heading
      const heading = document.querySelector('.chapter.active h2, .chapter.active h3, h2, h3');
      const topic   = sel || heading?.textContent?.trim() || document.title;

      document.getElementById('arya-learn-topic').textContent = topic.slice(0, 80);
      modal.style.display = 'flex';

      const resp = document.getElementById('arya-learn-response');
      resp.innerHTML = '<span class="arya-ai-cursor"></span>';
      const span = resp.querySelector('span');

      const prompt = `
Topic from a financial education page: "${topic}"

Explain this concept in 3-4 sentences using a desi analogy most Indians can relate to.
Then give one real example with actual numbers (₹ in Indian context).
Keep it friendly and conversational — like explaining to a friend at a chai stall.
`.trim();

      try {
        await _ollamaStream(BASE_SYSTEM, prompt, (tok, all) => { span.textContent = all; });
        span.classList.remove('arya-ai-cursor');
        document.getElementById('arya-learn-more').style.display = '';
        document.getElementById('arya-learn-more').onclick = async () => {
          resp.innerHTML += '\n\n';
          const span2 = document.createElement('span');
          resp.appendChild(span2);
          await _ollamaStream(BASE_SYSTEM,
            `Continue elaborating on: "${topic}". Give a more advanced insight or a common mistake to avoid. 2-3 sentences.`,
            (tok, all) => { span2.textContent = all; }
          );
        };
      } catch {
        resp.textContent = _ollamaOfflineMsg();
      }
    });

    // Also trigger on text selection
    document.addEventListener('mouseup', (e) => {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 15 && sel.length < 500) {
        fab.innerHTML = `🧠 "${sel.slice(0,30)}…" — Ask Arya`;
      } else {
        fab.innerHTML = '🧠 Samjha nahi?';
      }
    });
  };

  /* ── Q6: Portfolio Risk Check ────────────────────────────────────────────── */
  /**
   * @param {object[]} holdings — [{ symbol, name, value, weight, gain_pct }]
   * @param {Element}  anchorEl — insert panel here
   */
  AryaAI.portfolioRisk = async function (holdings, anchorEl) {
    const panel = _createPanel('arya-portfolio-panel',
      '🧠 Arya Risk Check', 'AI analysis of concentration, overlap & risk');

    if (anchorEl) anchorEl.insertAdjacentElement('afterend', panel);

    const holdingStr = (holdings || []).slice(0, 15)
      .map(h => `${h.symbol || h.name}: ₹${Number(h.value||0).toLocaleString('en-IN')} (${h.weight||0}% weight, ${h.gain_pct||0}% gain)`)
      .join('\n');

    const prompt = `
Portfolio holdings:
${holdingStr}

Identify the top 3 risks in this portfolio with Indian market context.
For each risk give: the problem, why it matters, and one concrete fix.
Keep it direct and actionable. 4-6 sentences total.
`.trim();

    await _streamIntoPanel(
      panel, BASE_SYSTEM, prompt,
      `<button class="arya-ai-btn arya-ai-btn-ghost" onclick="AryaAI.portfolioRisk(${JSON.stringify(holdings)})">🔄 Re-analyse</button>
       <button class="arya-ai-btn arya-ai-btn-primary" onclick="AryaAI._speak(document.querySelector('#arya-portfolio-panel .arya-ai-body').textContent)">🔊 Speak</button>`
    );
  };

  /* ── Q7: Pre-Trade Clearance Check ──────────────────────────────────────── */
  /**
   * Show a 3-question emotional clearance modal before a trade.
   * @param {object} tradeData — { symbol, side, size, todayPnl, lastTradeResult }
   * @param {function} onApproved — called if score ≥ 40 and user confirms
   * @param {function} onRejected — called if score < 40 or user cancels
   */
  AryaAI.preTradeClearance = function (tradeData, onApproved, onRejected) {
    _injectCSS();

    let modal = document.getElementById('arya-pretrade-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'arya-pretrade-modal';
      modal.className = 'hidden';
      modal.innerHTML = `
        <div class="arya-pretrade-box">
          <div style="text-align:center;margin-bottom:8px;">
            <div style="font-size:24px;">🧠</div>
            <div style="font-weight:800;font-size:18px;color:#fff;margin-top:6px;">Pre-Trade Clearance</div>
            <div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:4px;">3 sawaal — 30 seconds — bachaenge hazar</div>
          </div>

          <div id="ptc-questions" style="margin-top:20px;display:flex;flex-direction:column;gap:14px;">
            <!-- Questions injected dynamically -->
          </div>

          <div id="ptc-score-section" style="display:none;text-align:center;margin-top:20px;">
            <div id="ptc-score" class="arya-pretrade-score">–</div>
            <div id="ptc-verdict" style="font-size:15px;font-weight:700;color:#fff;margin-top:8px;"></div>
            <div id="ptc-advice" style="font-size:13px;color:rgba(255,255,255,.6);margin-top:6px;line-height:1.6;"></div>
          </div>

          <div style="margin-top:20px;display:flex;gap:10px;">
            <button id="ptc-evaluate" class="arya-ai-btn arya-ai-btn-primary" style="flex:1;padding:12px;font-size:14px;">
              Evaluate Karo →
            </button>
            <button id="ptc-cancel" class="arya-ai-btn arya-ai-btn-ghost" style="padding:12px 16px;font-size:14px;">
              Cancel Trade
            </button>
          </div>
          <div style="margin-top:10px;display:none" id="ptc-proceed-row">
            <button id="ptc-proceed" class="arya-ai-btn arya-ai-btn-primary" style="width:100%;padding:12px;font-size:14px;background:linear-gradient(135deg,#22c55e,#16a34a);">
              ✅ Trade Le Lo — Green Light
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const qs = [
      {
        id:   'ptc_q1',
        text: `Last trade kaisa gaya tha? ${tradeData?.lastTradeResult ? `(${tradeData.lastTradeResult})` : ''}`,
        options: [
          { label: '✅ Profitable tha',   score: 30 },
          { label: '↔️ Breakeven tha',    score: 20 },
          { label: '❌ Loss hua tha',      score: 5  },
          { label: '🔥 Bada loss hua tha', score: 0  },
        ]
      },
      {
        id:   'ptc_q2',
        text: `Aaj ka mood kaisa hai?`,
        options: [
          { label: '😎 Calm & focused',          score: 40 },
          { label: '😊 Theek hai, normal hai',    score: 30 },
          { label: '😤 Frustrated / anxious',     score: 10 },
          { label: '😡 Gussa hai / revenge mode', score: 0  },
        ]
      },
      {
        id:   'ptc_q3',
        text: `Aaj pehle se kitne trades le liye?`,
        options: [
          { label: '0 — pehla trade hai',  score: 30 },
          { label: '1-2 trades',           score: 25 },
          { label: '3-4 trades',           score: 10 },
          { label: '5+ trades ho gaye',    score: 0  },
        ]
      }
    ];

    const qContainer = modal.querySelector('#ptc-questions');
    qContainer.innerHTML = '';
    qs.forEach(q => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.8);margin-bottom:8px;">${q.text}</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${q.options.map((o,i) => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);cursor:pointer;transition:background .15s;">
              <input type="radio" name="${q.id}" value="${o.score}" style="accent-color:#00ff88;">
              <span style="font-size:13px;color:rgba(255,255,255,.75);">${o.label}</span>
            </label>
          `).join('')}
        </div>
      `;
      qContainer.appendChild(div);
    });

    modal.classList.remove('hidden');

    modal.querySelector('#ptc-cancel').onclick = () => {
      modal.classList.add('hidden');
      if (onRejected) onRejected('cancelled');
    };

    modal.querySelector('#ptc-evaluate').onclick = async () => {
      const answers = qs.map(q => {
        const checked = modal.querySelector(`input[name="${q.id}"]:checked`);
        return checked ? parseInt(checked.value) : null;
      });

      if (answers.some(a => a === null)) {
        alert('Sabhi sawaalon ka jawab do bhai!');
        return;
      }

      const total = answers.reduce((s, v) => s + v, 0);
      const max   = 100;  // 30+40+30

      const scoreEl   = modal.querySelector('#ptc-score');
      const verdictEl = modal.querySelector('#ptc-verdict');
      const adviceEl  = modal.querySelector('#ptc-advice');

      scoreEl.textContent = total;
      modal.querySelector('#ptc-score-section').style.display = '';
      modal.querySelector('#ptc-evaluate').style.display = 'none';

      let color, verdict, advice;
      if (total >= 70) {
        color = 'green';
        verdict = '🟢 Green Light — Trade le sakte ho';
        advice  = 'Mind clear hai, execution solid rahegi. Plan pe stick raho.';
      } else if (total >= 40) {
        color = 'yellow';
        verdict = '🟡 Caution Mode — Half position lo';
        advice  = `Position size aadha karo. Stop loss pehle set karo, then enter. ${tradeData?.symbol ? tradeData.symbol + ' mein' : ''} tight stop lagana.`;
      } else {
        color = 'red';
        verdict = '🔴 Red Light — Aaj mat lo trade';
        advice  = 'Emotional state optimal nahi hai. Revenge trade ya FOMO pattern detect hua. Kal fresh mind se analyze karo.';
      }

      scoreEl.className = `arya-pretrade-score ${color}`;
      verdictEl.textContent = verdict;

      // Stream personalized advice from Ollama
      const tradeSummary = `Symbol: ${tradeData?.symbol||'unknown'}, Side: ${tradeData?.side||'unknown'}, Today P&L: ${tradeData?.todayPnl||0}`;
      const aiPrompt = `Pre-trade score: ${total}/100. ${tradeSummary}. In ONE sentence of Hinglish, give specific advice for this trader right now.`;

      adviceEl.innerHTML = advice + '<br><span class="arya-ai-cursor"></span>';
      const s = adviceEl.querySelector('span');
      try {
        await _ollamaStream(BASE_SYSTEM, aiPrompt, (tok, all) => { s.textContent = ' — ' + all; });
        s.classList.remove('arya-ai-cursor');
      } catch { s.remove(); }

      if (total >= 40) {
        modal.querySelector('#ptc-proceed-row').style.display = '';
        modal.querySelector('#ptc-proceed').onclick = () => {
          modal.classList.add('hidden');
          if (onApproved) onApproved({ score: total, color });
        };
      } else {
        if (onRejected) setTimeout(() => onRejected('low_score'), 2000);
      }
    };
  };

  /* ── Q4: News Sentiment ──────────────────────────────────────────────────── */
  /**
   * Fetch and display AI sentiment for a symbol on any page.
   * @param {string} symbol  — e.g. "RELIANCE", "NIFTY 50"
   * @param {Element} anchorEl — where to attach the badge
   */
  AryaAI.newsSentiment = async function (symbol, anchorEl) {
    _injectCSS();
    if (!anchorEl) return;

    const existing = anchorEl.querySelector('.arya-news-sentiment');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'arya-news-sentiment';
    wrapper.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:8px;';
    wrapper.innerHTML = `<span class="arya-ai-thinking" style="font-size:12px;">
      <span class="arya-ai-thinking-dot"></span><span class="arya-ai-thinking-dot"></span>
      <span class="arya-ai-thinking-dot"></span>
      <span style="margin-left:4px">Sentiment analyse ho raha hai…</span>
    </span>`;
    anchorEl.appendChild(wrapper);

    const prompt = `
Stock/Index: ${symbol}
Based on your training knowledge of ${symbol}'s recent trends, business model, and Indian market context:
1. Sentiment: BULLISH / BEARISH / NEUTRAL (pick one word first)
2. One-sentence reason
3. Key risk to watch
Keep it to 2-3 sentences total, natural Hinglish.
`.trim();

    try {
      let full = await _ollamaStream(BASE_SYSTEM, prompt, null);

      // Detect sentiment from response
      const upper = full.toUpperCase();
      const sentiment = upper.includes('BULLISH') ? 'bullish'
        : upper.includes('BEARISH') ? 'bearish' : 'neutral';
      const icon = sentiment === 'bullish' ? '📈' : sentiment === 'bearish' ? '📉' : '➡️';
      const label = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);

      wrapper.innerHTML = `
        <span class="arya-sentiment-badge ${sentiment}">${icon} ${label}</span>
        <div style="font-size:13px;line-height:1.6;color:rgba(255,255,255,.7);">${full}</div>
      `;
    } catch {
      wrapper.innerHTML = '<span style="font-size:12px;color:rgba(255,255,255,.4)">Sentiment offline</span>';
    }
  };

  /* ── Speak text via voiceagent (if connected) or speechSynthesis ────────── */
  AryaAI._speak = function (text) {
    if (!text) return;
    // Try voiceagent WS first
    if (window._bvWs && window._bvWs.readyState === 1) {
      window._bvWs.send(JSON.stringify({ type: 'text_input', text: 'Ye padho: ' + text.slice(0,400) }));
      return;
    }
    // Fallback — browser TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text.slice(0, 500));
      utt.lang = 'en-IN';
      utt.rate = 1.0;
      window.speechSynthesis.speak(utt);
    }
  };

  /* ── General ask ─────────────────────────────────────────────────────────── */
  AryaAI.ask = async function (prompt, onToken) {
    return _ollamaStream(BASE_SYSTEM, prompt, onToken);
  };

  /* ── Status check ─────────────────────────────────────────────────────────── */
  AryaAI.isOnline = _ollamaOnline;

  /* ══════════════════════════════════════════════════════════════════════════
     AUTO-INIT — detect page type and self-configure
  ══════════════════════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;

    // Learn pages → inject Ask Arya button
    if (/learn-/.test(path)) {
      AryaAI.injectLearnButton();
    }
  });

  // Export
  global.AryaAI = AryaAI;

}(typeof window !== 'undefined' ? window : global));
