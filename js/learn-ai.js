/**
 * FIN-OS Learning Intelligence Engine  v1
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal script loaded on every learn-*.html page.
 * Auto-injects AI callout boxes, post-module quiz, and
 * "Explain this differently" buttons — personalised to the user's archetype,
 * knowledge gaps, and learning style from onboarding.
 *
 * No backend required in offline mode — Ollama handles AI locally.
 * Full mode: sends personalize_content to Arya WebSocket agent.
 */

(function LearnAI() {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────────────────── */
  const OLLAMA_URL   = 'https://127.0.0.1:8766/api/generate';
  const OLLAMA_MODEL = 'qwen3:14b';
  const WS_URL       = 'wss://127.0.0.1:8765';
  const QUIZ_STORAGE = 'finos_learn_quiz_scores';    // localStorage key
  const MOD_STORAGE  = 'finos_learned_modules';      // localStorage key

  /* ── Read user profile from localStorage ────────────────────────────────── */
  function _profile() {
    try {
      const archetype = localStorage.getItem('finos_financial_dna') || 'Growth Optimizer';
      const riskScore = parseInt(localStorage.getItem('finos_risk_score') || '50');
      const disc      = localStorage.getItem('finos_disc_type') || 'C';
      const goalRank  = JSON.parse(localStorage.getItem('finos_goal_rank') || '[]');
      const profile   = JSON.parse(localStorage.getItem('finos_profile') || '{}');

      // Infer learning style from DISC
      const styleMap = {
        D: 'examples > theory, direct, no fluff',
        I: 'stories, analogies, relatable scenarios',
        S: 'step-by-step, patient, reassurance',
        C: 'data, logic, depth, research-backed',
      };
      return {
        archetype,
        riskScore,
        disc,
        learningStyle: styleMap[disc] || styleMap.C,
        topGoal: goalRank[0] || 'wealth building',
        profession: profile.profession || 'unknown',
        age: profile.age || 'unknown',
      };
    } catch { return { archetype: 'Explorer', disc: 'C', learningStyle: 'examples > theory' }; }
  }

  /* ── Detect which module this page is ──────────────────────────────────────*/
  function _moduleFromPath() {
    const p = window.location.pathname.toLowerCase();
    const map = {
      'equity': 'equity', 'debt': 'debt', 'mf': 'mutual_funds',
      'etf': 'etf', 'fno': 'fno', 'forex': 'forex',
      'insurance': 'insurance', 'tax': 'tax', 'fundamental': 'fundamental',
      'technical': 'technical', 'indicators': 'indicators', 'analysis': 'analysis',
      'crypto': 'crypto', 'commodity': 'commodity', 'money-market': 'money_market',
      'metrics': 'metrics',
    };
    for (const [key, val] of Object.entries(map)) {
      if (p.includes(key)) return val;
    }
    return 'unknown';
  }

  /* ── Mark module as completed ────────────────────────────────────────────── */
  function _markCompleted(moduleId) {
    try {
      const mods = JSON.parse(localStorage.getItem(MOD_STORAGE) || '{}');
      if (!mods[moduleId]) {
        mods[moduleId] = { completed_at: new Date().toISOString(), attempts: 0 };
      }
      mods[moduleId].last_visited = new Date().toISOString();
      localStorage.setItem(MOD_STORAGE, JSON.stringify(mods));
    } catch {}
  }

  /* ── Ollama streaming helper ─────────────────────────────────────────────── */
  async function _stream(prompt, system, onTok) {
    try {
      const resp = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL, prompt, system,
          stream: true, options: { temperature: 0.65, num_predict: 200, num_ctx: 4096 },
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

  /* ── Inject shared CSS once ──────────────────────────────────────────────── */
  function _css() {
    if (document.getElementById('learn-ai-css')) return;
    const s = document.createElement('style');
    s.id = 'learn-ai-css';
    s.textContent = `
      .arya-callout {
        background: linear-gradient(135deg,rgba(0,255,136,.06),rgba(79,124,255,.04));
        border: 1px solid rgba(0,255,136,.2); border-radius: 14px;
        padding: 16px 20px; margin: 20px 0; font-family: -apple-system, sans-serif;
      }
      .arya-callout-head {
        font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase;
        color: #00ff88; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;
      }
      .arya-callout-body { font-size: 14px; color: rgba(255,255,255,.82); line-height: 1.7; }
      .arya-callout-body .streaming { animation: arya-pulse .8s infinite; }
      @keyframes arya-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }

      .arya-explain-btn {
        display: inline-flex; align-items: center; gap: 6px; margin: 10px 0;
        padding: 7px 14px; border-radius: 10px;
        border: 1px solid rgba(79,124,255,.3); background: rgba(79,124,255,.07);
        color: #7ca4ff; font-size: 12px; font-weight: 600; cursor: pointer;
        transition: all .2s; font-family: -apple-system, sans-serif;
      }
      .arya-explain-btn:hover { background: rgba(79,124,255,.15); transform: translateY(-1px); }

      .arya-quiz-section {
        border-top: 1px solid rgba(255,255,255,.08); margin-top: 40px; padding-top: 32px;
      }
      .arya-quiz-title {
        font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 6px;
      }
      .arya-quiz-sub { font-size: 13px; color: rgba(255,255,255,.4); margin-bottom: 24px; }

      /* ── Light mode: Arya callout ── */
      [data-theme="light"] .arya-callout {
        background: linear-gradient(135deg,rgba(0,180,100,.07),rgba(59,130,246,.05));
        border: 1px solid rgba(0,160,90,.25);
      }
      [data-theme="light"] .arya-callout-head { color: #15803d; }
      [data-theme="light"] .arya-callout-head span { color: rgba(0,0,0,.35) !important; }
      [data-theme="light"] .arya-callout-body { color: #1e293b; }

      /* ── Light mode: explain button ── */
      [data-theme="light"] .arya-explain-btn {
        color: #3B82F6;
        border-color: rgba(59,130,246,.35);
        background: rgba(59,130,246,.08);
      }

      /* ── Light mode: quiz section ── */
      [data-theme="light"] .arya-quiz-section { border-top-color: rgba(0,0,0,.10); }
      [data-theme="light"] .arya-quiz-title   { color: #0A0C10; }
      [data-theme="light"] .arya-quiz-sub     { color: rgba(0,0,0,.50); }
      [data-theme="light"] .arya-quiz-q-text  { color: #1e293b; }
      [data-theme="light"] .arya-quiz-option  {
        background: rgba(0,0,0,.03);
        border-color: rgba(0,0,0,.10);
        color: #1e293b;
      }
      [data-theme="light"] .arya-quiz-submit  {
        background: rgba(59,130,246,.12);
        border-color: rgba(59,130,246,.30);
        color: #1d4ed8;
      }
      [data-theme="light"] .arya-quiz-result  { color: #1e293b; }
      .arya-quiz-q { margin-bottom: 20px; }
      .arya-quiz-q-text { font-size: 14px; color: rgba(255,255,255,.85); margin-bottom: 10px; font-weight: 600; }
      .arya-quiz-opt {
        display: flex; align-items: center; gap: 10px; padding: 10px 14px;
        border-radius: 10px; border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.03); margin-bottom: 6px;
        cursor: pointer; font-size: 13px; color: rgba(255,255,255,.7);
        transition: all .15s; font-family: -apple-system, sans-serif;
      }
      .arya-quiz-opt:hover { border-color: rgba(0,255,136,.3); background: rgba(0,255,136,.04); }
      .arya-quiz-opt.selected { border-color: rgba(0,255,136,.4) !important; background: rgba(0,255,136,.06) !important; }
      .arya-quiz-opt.correct { border-color: #00ff88 !important; background: rgba(0,255,136,.1) !important; color: #00ff88 !important; }
      .arya-quiz-opt.wrong   { border-color: #ff6b6b !important; background: rgba(255,107,107,.08) !important; color: #ff6b6b !important; }

      /* Light mode: quiz options */
      [data-theme="light"] .arya-quiz-opt {
        color: #1e293b !important;
        border-color: rgba(0,0,0,.12) !important;
        background: #ffffff !important;
        box-shadow: 0 1px 4px rgba(0,0,0,.06);
      }
      [data-theme="light"] .arya-quiz-opt:hover {
        border-color: rgba(59,130,246,.4) !important;
        background: rgba(59,130,246,.05) !important;
      }
      [data-theme="light"] .arya-quiz-opt.selected {
        border-color: rgba(59,130,246,.6) !important;
        background: rgba(59,130,246,.08) !important;
      }
      [data-theme="light"] .arya-quiz-opt .arya-opt-letter {
        border-color: rgba(0,0,0,.25) !important;
        color: #1e293b !important;
      }
      [data-theme="light"] .arya-quiz-opt.correct {
        border-color: #15803d !important;
        background: rgba(21,128,61,.08) !important;
        color: #15803d !important;
      }
      [data-theme="light"] .arya-quiz-opt.wrong {
        border-color: #dc2626 !important;
        background: rgba(220,38,38,.06) !important;
        color: #dc2626 !important;
      }

      .arya-quiz-submit {
        margin-top: 16px; padding: 12px 28px; border-radius: 12px;
        background: rgba(0,255,136,.1); border: 1px solid rgba(0,255,136,.25);
        color: #00ff88; font-weight: 700; font-size: 14px; cursor: pointer;
        transition: all .2s; font-family: -apple-system, sans-serif;
      }
      .arya-quiz-submit:hover { background: rgba(0,255,136,.18); }
      .arya-quiz-result {
        margin-top: 16px; padding: 16px; border-radius: 12px;
        font-size: 14px; line-height: 1.7; display: none;
      }
      .arya-score-badge {
        display: inline-block; padding: 4px 14px; border-radius: 20px;
        font-size: 13px; font-weight: 700; margin-bottom: 10px;
      }
      .arya-knowledge-bar {
        position: fixed; top: 0; right: 0; width: 280px; z-index: 9999;
        background: rgba(9,13,18,.95); border-left: 1px solid rgba(255,255,255,.08);
        padding: 16px; font-family: -apple-system, sans-serif; display: none;
        flex-direction: column; gap: 8px; max-height: 100vh; overflow-y: auto;
      }
      @media (min-width: 1200px) { .arya-knowledge-bar { display: flex; } }
      .kb-title { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,.3); margin-bottom: 4px; }
      .kb-module { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.04); font-size: 12px; }
      .kb-name { color: rgba(255,255,255,.6); }
      .kb-status { font-size: 11px; }
      .kb-done { color: #00ff88; } .kb-todo { color: rgba(255,255,255,.25); }

      /* Light mode overrides */
      [data-theme="light"] .arya-knowledge-bar {
        background: rgba(248,250,252,0.97); border-left: 1px solid rgba(0,0,0,0.10);
      }
      [data-theme="light"] .kb-title  { color: rgba(0,0,0,0.45); }
      [data-theme="light"] .kb-module { border-bottom-color: rgba(0,0,0,0.07); }
      [data-theme="light"] .kb-name   { color: rgba(0,0,0,0.78); }
      [data-theme="light"] .kb-todo   { color: rgba(0,0,0,0.30); }
      [data-theme="light"] .kb-done   { color: #15803d; }
    `;
    document.head.appendChild(s);
  }

  /* ── Build AI callout for a section ────────────────────────────────────────*/
  function _buildCallout(sectionEl, moduleId, sectionTitle, prof) {
    if (sectionEl.querySelector('.arya-callout')) return; // already injected

    const box = document.createElement('div');
    box.className = 'arya-callout';
    box.innerHTML = `
      <div class="arya-callout-head">
        🧠 Arya says — personalised for ${prof.archetype}
        <span style="margin-left:auto;font-size:10px;color:rgba(255,255,255,.25);">Based on your profile</span>
      </div>
      <div class="arya-callout-body">
        <span class="streaming">Thinking…</span>
      </div>
    `;

    // Insert at top of section
    sectionEl.insertBefore(box, sectionEl.firstChild);

    const bodyEl = box.querySelector('.arya-callout-body');

    // Build personalised prompt
    const prompt = `
User profile: Archetype="${prof.archetype}", Learning style="${prof.learningStyle}", Top goal="${prof.topGoal}", Risk=${prof.riskScore}/100.

Learning module: "${moduleId}" — section: "${sectionTitle}"

Write ONE concise personalised insight (2 sentences max) that:
1. Connects this section specifically to their archetype and top goal
2. Gives a direct, actionable "so what" for them personally

Format: Warm Hinglish, direct, NO preamble like "Sure!" or "Great!".
Example start: "Tere liye specifically..." or "As a ${prof.archetype}..." or "Given tu [goal] target kar raha hai..."
`.trim();

    const system = 'You are Arya, FIN-OS AI. Write ONE personalised 2-sentence Hinglish insight. No markdown. Direct.';

    bodyEl.textContent = '';
    let started = false;
    _stream(prompt, system, (tok, full) => {
      bodyEl.textContent = full;
      started = true;
    }).then(result => {
      if (!started) bodyEl.textContent = `This section is especially relevant for your "${prof.archetype}" profile — focus on the practical application, not just the theory.`;
    });

    return box;
  }

  /* ── Add "Explain this differently" buttons ─────────────────────────────── */
  function _addExplainButtons(prof) {
    const targets = document.querySelectorAll(
      '.concept-box, .chapter h2, .section-content, .learn-card, .concept, .pillar, .info-card'
    );

    targets.forEach(el => {
      if (el.querySelector('.arya-explain-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'arya-explain-btn';
      btn.innerHTML = '💬 Arya se samjhao';
      btn.title = 'Explain this section differently';

      btn.onclick = async () => {
        btn.textContent = '…'; btn.disabled = true;

        // Get surrounding text content
        const text = el.textContent.slice(0, 400).trim();
        const prompt = `
This financial concept (from FIN-OS learn page):
"${text}"

Re-explain this in ${prof.learningStyle} style for a ${prof.archetype} profile person.
Use a real Indian example. Max 3 sentences. Hinglish. No preamble.
`.trim();

        // Show popup below button
        const popup = document.createElement('div');
        popup.style.cssText = 'margin-top:10px;padding:14px;border-radius:12px;background:rgba(9,13,18,.97);border:1px solid rgba(79,124,255,.2);font-size:13px;color:rgba(255,255,255,.85);line-height:1.7;font-family:-apple-system,sans-serif;';
        popup.textContent = 'Arya soch rahi hai…';
        btn.parentNode.insertBefore(popup, btn.nextSibling);

        let first = true;
        await _stream(
          prompt,
          'You are Arya, FIN-OS AI. Re-explain financial concepts in simple Hinglish with real Indian examples. 3 sentences max. No markdown.',
          (tok, full) => { popup.textContent = full; first = false; }
        );

        if (first) popup.textContent = 'AI offline — start Ollama to enable explanations.';
        btn.innerHTML = '💬 Arya se samjhao'; btn.disabled = false;

        // Auto-remove after 30s
        setTimeout(() => popup.remove(), 30000);
      };

      el.appendChild(btn);
    });
  }

  /* ── Generate quiz questions for this module ─────────────────────────────── */
  const MODULE_QUIZZES = {
    equity: [
      { q: "P/E ratio 50 matlab kya hota hai stock ke liye?", opts: ["Stock cheap hai", "Stock expensive hai relative to earnings", "Company loss mein hai", "Dividend nahi deti"], ans: 1 },
      { q: "Kaunsa investment inflation se zyada return deta hai long-term mein?", opts: ["FD", "Savings account", "Equity mutual funds (historical)", "PPF"], ans: 2 },
      { q: "Delivery trading aur intraday mein main difference kya hai?", opts: ["Profit alag hota hai", "Tax rate same hai", "Delivery mein shares actually purchase hote hain; intraday mein same-day close hota hai", "Intraday safe hai"], ans: 2 },
    ],
    mutual_funds: [
      { q: "Direct plan aur Regular plan ka main difference?", opts: ["Returns same hain", "Direct mein koi commission nahi — higher returns", "Regular mein tax benefit hai", "Direct risky hai"], ans: 1 },
      { q: "ELSS ka lock-in period kitna hai?", opts: ["1 year", "3 years", "5 years", "7 years"], ans: 1 },
      { q: "SIP ka sabse bada advantage kya hai?", opts: ["Guaranteed returns", "Rupee cost averaging — market dips mein zyada units milte hain", "Tax-free hota hai", "FD se better guaranteed returns"], ans: 1 },
    ],
    fno: [
      { q: "SEBI data ke according, F&O traders mein kitne percent paise kho dete hain?", opts: ["30%", "60%", "90%", "50%"], ans: 2 },
      { q: "Theta (θ) option trading mein kya represent karta hai?", opts: ["Price movement", "Time decay — option value roz ghatta hai expiry ke paas", "Volatility", "Interest rate"], ans: 1 },
      { q: "Naked PUT selling ka maximum loss kya ho sakta hai?", opts: ["Premium tak limited", "Theoretically unlimited", "Strike price minus premium", "Zero"], ans: 0 },
    ],
    tax: [
      { q: "Section 80C mein maximum kitna deduction milta hai?", opts: ["₹50,000", "₹1,00,000", "₹1,50,000", "₹2,00,000"], ans: 2 },
      { q: "LTCG tax equity pe ₹1.25L se upar kitne percent lagta hai (FY 2024-25)?", opts: ["10%", "12.5%", "15%", "20%"], ans: 1 },
      { q: "NPS Tier-1 mein invest karne se additional kitni deduction milti hai 80C ke upar?", opts: ["₹25,000", "₹50,000", "₹75,000", "₹1,00,000"], ans: 1 },
    ],
    fundamental: [
      { q: "ROE (Return on Equity) kya measure karta hai?", opts: ["Company ki total value", "Shareholders ke paise pe company kitna profit kamaati hai", "Total debt", "Revenue growth"], ans: 1 },
      { q: "D/E ratio 0.5 matlab?", opts: ["Company debt-free hai", "Company mein ₹1 equity ke liye 50 paise debt hai — healthy", "Company bankrupt hone wali hai", "Too much debt"], ans: 1 },
      { q: "Value investing mein kya dhundte hain?", opts: ["High P/E stocks", "Stocks jo intrinsic value se neeche trade kar rahe hain", "Only IT stocks", "IPOs"], ans: 1 },
    ],
    insurance: [
      { q: "Term insurance aur ULIP mein main difference?", opts: ["Term mein investment hota hai", "Term sirf life cover hai — cheap and pure; ULIP mein investment + insurance mixed hain", "ULIP better returns deta hai", "Koi difference nahi"], ans: 1 },
      { q: "Kitni life cover ideal hai — thumb rule kya hai?", opts: ["5× annual income", "10× annual income", "2× annual income", "Same as home loan outstanding"], ans: 1 },
      { q: "Health insurance mein copay ka matlab?", opts: ["Insurance claim hone ka wait time", "Claim ka jo hissa tumhein khud bhar na padta hai", "Premium hota hai", "Room rent limit"], ans: 1 },
    ],
  };

  function _getQuiz(moduleId) {
    return MODULE_QUIZZES[moduleId] || MODULE_QUIZZES.equity;
  }

  /* ── Inject quiz at bottom of page ─────────────────────────────────────────*/
  function _injectQuiz(container, moduleId, prof) {
    const qs = _getQuiz(moduleId);

    const section = document.createElement('div');
    section.className = 'arya-quiz-section';
    section.innerHTML = `
      <div class="arya-quiz-title">📝 Quick Knowledge Check</div>
      <div class="arya-quiz-sub">3 sawaal — 1 minute — score stored in profile</div>
    `;

    const selections = {};

    qs.forEach((q, qi) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'arya-quiz-q';
      qDiv.innerHTML = `<div class="arya-quiz-q-text">${qi + 1}. ${q.q}</div>`;

      q.opts.forEach((opt, oi) => {
        const optDiv = document.createElement('div');
        optDiv.className = 'arya-quiz-opt';
        optDiv.innerHTML = `<span class="arya-opt-letter" style="width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;">${String.fromCharCode(65 + oi)}</span> ${opt}`;
        optDiv.onclick = () => {
          qDiv.querySelectorAll('.arya-quiz-opt').forEach(o => {
            o.classList.remove('selected');
            o.style.borderColor = '';
            o.style.background = '';
          });
          optDiv.classList.add('selected');
          selections[qi] = oi;
        };
        qDiv.appendChild(optDiv);
      });
      section.appendChild(qDiv);
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'arya-quiz-submit';
    submitBtn.textContent = '✓ Submit Answers';

    const resultDiv = document.createElement('div');
    resultDiv.className = 'arya-quiz-result';

    submitBtn.onclick = async () => {
      if (Object.keys(selections).length < qs.length) {
        submitBtn.textContent = 'Pehle sab jawab do!';
        setTimeout(() => { submitBtn.textContent = '✓ Submit Answers'; }, 1500);
        return;
      }

      let score = 0;
      qs.forEach((q, qi) => {
        const optEls = section.querySelectorAll(`.arya-quiz-q:nth-child(${qi + 3}) .arya-quiz-opt`);
        optEls.forEach((el, oi) => {
          if (oi === q.ans)   el.classList.add('correct');
          if (oi === selections[qi] && oi !== q.ans) el.classList.add('wrong');
        });
        if (selections[qi] === q.ans) score++;
      });

      const pct = Math.round(score / qs.length * 100);
      const color = pct >= 67 ? '#00ff88' : pct >= 33 ? '#ffb703' : '#ff6b6b';
      const emoji = pct >= 67 ? '🎉' : pct >= 33 ? '📚' : '💪';

      // Save score
      try {
        const scores = JSON.parse(localStorage.getItem(QUIZ_STORAGE) || '{}');
        scores[moduleId] = { score: pct, taken_at: new Date().toISOString(), attempts: (scores[moduleId]?.attempts || 0) + 1 };
        localStorage.setItem(QUIZ_STORAGE, JSON.stringify(scores));
      } catch {}

      resultDiv.style.display = 'block';
      resultDiv.style.background = `${color}10`;
      resultDiv.style.border = `1px solid ${color}30`;
      resultDiv.innerHTML = `
        <span class="arya-score-badge" style="background:${color}18;border:1px solid ${color}40;color:${color};">
          ${emoji} ${score}/${qs.length} correct (${pct}%)
        </span>
        <div id="arya-quiz-feedback" style="color:rgba(255,255,255,.75);font-size:13px;">Arya feedback likh rahi hai…</div>
      `;

      const feedEl = resultDiv.querySelector('#arya-quiz-feedback');
      const feedPrompt = `Student scored ${pct}% on ${moduleId} module quiz (${score}/${qs.length} correct).
Their archetype: ${prof.archetype}. Give one warm Hinglish sentence of feedback — celebrate if good, encourage if low — and one specific next step.`;

      await _stream(feedPrompt, 'You are Arya, FIN-OS AI. Give 1-sentence warm Hinglish feedback on quiz result. Then 1 sentence specific next step.', (tok, full) => {
        feedEl.textContent = full;
      });

      submitBtn.disabled = true;
      submitBtn.textContent = '✓ Submitted';

      // Mark module as completed if score >= 67%
      if (pct >= 67) _markCompleted(moduleId);
    };

    section.appendChild(submitBtn);
    section.appendChild(resultDiv);
    container.appendChild(section);
  }

  /* ── Knowledge graph sidebar ────────────────────────────────────────────── */
  function _injectKnowledgeBar() {
    const bar = document.createElement('div');
    bar.className = 'arya-knowledge-bar';
    bar.innerHTML = '<div class="kb-title">Your Knowledge Map</div>';

    const allModules = [
      ['equity', 'Equity'], ['mutual_funds', 'Mutual Funds'], ['etf', 'ETFs'],
      ['debt', 'Debt Instruments'], ['fno', 'F&O'], ['fundamental', 'Fundamental Analysis'],
      ['technical', 'Technical Analysis'], ['insurance', 'Insurance'],
      ['tax', 'Tax Planning'], ['crypto', 'Crypto'], ['commodity', 'Commodities'],
      ['forex', 'Forex'], ['analysis', 'Analysis'], ['indicators', 'Indicators'],
      ['money_market', 'Money Market'], ['metrics', 'Metrics'],
    ];

    try {
      const scores  = JSON.parse(localStorage.getItem(QUIZ_STORAGE) || '{}');
      const learned = JSON.parse(localStorage.getItem(MOD_STORAGE) || '{}');
      const current = _moduleFromPath();

      allModules.forEach(([id, label]) => {
        const quizScore = scores[id]?.score;
        const visited   = !!learned[id];
        const isCurrent = id === current;

        const row = document.createElement('div');
        row.className = 'kb-module';
        row.innerHTML = `
          <span class="kb-name" style="${isCurrent ? 'color:#fff;font-weight:600;' : ''}">${label}</span>
          <span class="kb-status ${visited || quizScore >= 67 ? 'kb-done' : 'kb-todo'}">
            ${quizScore !== undefined ? `${quizScore}%` : visited ? '👁' : '–'}
          </span>`;
        bar.appendChild(row);
      });
    } catch {}

    document.body.appendChild(bar);
  }

  /* ── Main: inject everything ─────────────────────────────────────────────── */
  function _boot() {
    _css();
    const prof     = _profile();
    const moduleId = _moduleFromPath();

    // Track this visit
    _markCompleted(moduleId);

    // Find main scrollable content area
    const mainContent = (
      document.getElementById('scrollContainer') ||
      document.querySelector('.deep-content') ||
      document.querySelector('main') ||
      document.body
    );

    // Inject AI callouts into key sections
    const sections = mainContent.querySelectorAll('.chapter, [id^="lvl"], [id^="sec"], .section-block');
    sections.forEach((sec, i) => {
      if (i > 4) return; // max 5 callouts per page
      const heading = sec.querySelector('h1,h2,h3')?.textContent?.slice(0, 60) || `Section ${i + 1}`;
      _buildCallout(sec, moduleId, heading, prof);
    });

    // If no .chapter sections found, inject a top-level callout
    if (!sections.length) {
      const top = document.createElement('div');
      top.className = 'arya-callout';
      top.style.marginBottom = '20px';
      top.innerHTML = `
        <div class="arya-callout-head">🧠 Arya says</div>
        <div class="arya-callout-body"><span class="streaming">Personalised insight likh rahi hai…</span></div>
      `;
      mainContent.insertBefore(top, mainContent.firstChild);
      const bodyEl = top.querySelector('.arya-callout-body');
      _stream(
        `User archetype: ${prof.archetype}. Module: ${moduleId}. Write a 2-sentence Hinglish insight connecting this topic to their goals. Direct, no preamble.`,
        'Arya FIN-OS AI. 2-sentence warm Hinglish. No markdown.',
        (tok, full) => { bodyEl.textContent = full; }
      ).then(r => { if (!r) bodyEl.textContent = `This module is especially useful for your "${prof.archetype}" archetype — focus on how each concept applies to your specific situation.`; });
    }

    // Add explain buttons
    setTimeout(() => _addExplainButtons(prof), 500);

    // Inject quiz at bottom
    _injectQuiz(mainContent, moduleId, prof);

    // Inject knowledge graph sidebar
    _injectKnowledgeBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    // Small delay so page's own scripts run first
    setTimeout(_boot, 300);
  }

})();
