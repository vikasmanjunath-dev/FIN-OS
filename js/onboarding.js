/**
 * FIN-OS AI Onboarding  v2
 * ──────────────────────────────────────────────────────────────────────────
 * Intelligence Interview — replaces the static 5-step wizard with a
 * conversational AI-guided flow:
 *
 *  Step 0: Free-text "why do you want money?" → AI classifies archetype
 *  Step 1: Life stage (age/profession)
 *  Step 2: Income + behavioral scenario (DISC profile)
 *  Step 3: Market scenario → risk profile computed
 *  Step 4: AI-suggested top 3 goals — user ranks them
 *  Step 5: AI-generated "Your Financial OS" summary + Arya speaks it
 *
 * Archetype → stored in localStorage + Supabase user_context table.
 * All AI calls go to local Ollama (qwen3:14b) — zero cloud cost.
 */

(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────────────────── */
  const OLLAMA_URL   = 'https://127.0.0.1:8766/api/generate';
  const OLLAMA_MODEL = 'qwen3:14b';
  const SUPABASE_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  /* ── 12 Financial Archetypes ─────────────────────────────────────────────── */
  const ARCHETYPES = {
    'Security Seeker':     { emoji: '🛡️', focus: 'stability, FD, insurance first' },
    'Growth Optimizer':    { emoji: '📈', focus: 'equity, SIP, long-term compounding' },
    'FIRE Chaser':         { emoji: '🔥', focus: 'aggressive saving, early retirement' },
    'Debt Escaper':        { emoji: '⛓️', focus: 'debt paydown, cash flow freedom' },
    'Family Protector':    { emoji: '👨‍👩‍👧', focus: 'insurance, education fund, term plan' },
    'Wealth Builder':      { emoji: '🏗️', focus: 'net worth growth, real estate, equity' },
    'Experience Seeker':   { emoji: '✈️', focus: 'balanced — enjoy now, save for later' },
    'Status Climber':      { emoji: '🏆', focus: 'visible wealth — car, house, lifestyle' },
    'Entrepreneur':        { emoji: '🚀', focus: 'business capital, high risk, high return' },
    'Conservative Saver':  { emoji: '🏦', focus: 'PPF, EPF, safe instruments' },
    'Tax Optimizer':       { emoji: '📋', focus: 'deductions, HRA, 80C maxed first' },
    'Impact Investor':     { emoji: '🌱', focus: 'ESG, socially responsible investing' },
  };

  /* ── DISC Behavioral Profiles ────────────────────────────────────────────── */
  const DISC = {
    D: { name: 'Decisive Driver',    desc: 'Acts fast, takes calculated risks, hates bureaucracy' },
    I: { name: 'Inspiring Influencer', desc: 'Optimistic, social, prone to FOMO investing' },
    S: { name: 'Steady Supporter',   desc: 'Patient, consistent, needs security before action' },
    C: { name: 'Careful Analyst',    desc: 'Research-first, conservative, data-driven decisions' },
  };

  /* ── State ───────────────────────────────────────────────────────────────── */
  const answers   = {};
  let   archetype = null;
  let   discType  = null;
  let   riskScore = 0;        // 0-100
  let   goalRank  = [];       // ordered array of goal names
  let   currentStep = 0;
  const TOTAL_STEPS = 6;

  /* ── DOM refs — lazy, resolved inside DOMContentLoaded ──────────────────── */
  let qEl, optEl, btn, orb, aryaBox, aryaText, freeWrap, freeInput;
  let goalWrap, goalList, summaryCard, summaryText, summaryGoals, stepLabel, stepIndicator;

  function _bindDom() {
    qEl           = document.getElementById('question');
    optEl         = document.getElementById('options');
    btn           = document.getElementById('nextBtn');
    orb           = document.getElementById('coreOrb');
    aryaBox       = document.getElementById('aryaResponse');
    aryaText      = document.getElementById('aryaResponseText');
    freeWrap      = document.getElementById('freeInputWrap');
    freeInput     = document.getElementById('freeInput');
    goalWrap      = document.getElementById('goalRankWrap');
    goalList      = document.getElementById('goalRankList');
    summaryCard   = document.getElementById('summaryCard');
    summaryText   = document.getElementById('summaryText');
    summaryGoals  = document.getElementById('summaryGoals');
    stepLabel     = document.getElementById('stepLabel');
    stepIndicator = document.getElementById('stepIndicator');
  }

  /* ── Utility: call Ollama streaming ─────────────────────────────────────── */
  async function ollamaStream(prompt, system, onToken) {
    try {
      const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:  OLLAMA_MODEL,
          prompt,
          system: system || 'You are Arya, a warm, concise Indian finance AI. Reply in 1-2 sentences max. No markdown. No preamble.',
          stream: true,
          options: { temperature: 0.65, num_predict: 120, num_ctx: 4096 },
        }),
      });
      if (!res.ok || !res.body) return '';
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        dec.decode(value).split('\n').forEach(line => {
          if (!line.trim()) return;
          try {
            const d = JSON.parse(line);
            // Strip think tokens
            let tok = (d.response || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
            if (tok) { full += tok; onToken && onToken(tok, full); }
          } catch {}
        });
      }
      return full.trim();
    } catch { return ''; }
  }

  /* ── Utility: classify archetype via LLM ───────────────────────────────── */
  async function classifyArchetype(freeText) {
    const list = Object.keys(ARCHETYPES).join(', ');
    const prompt = (
      `User answered "Why do you want money?": "${freeText}"\n\n` +
      `Based ONLY on this answer, pick exactly ONE archetype from this list:\n${list}\n\n` +
      `Reply with ONLY the archetype name — nothing else.`
    );
    const result = await ollamaStream(prompt, 'You are a financial psychologist. Reply with ONLY one archetype name from the given list. No explanation.', null);
    // Match to known archetype
    for (const key of Object.keys(ARCHETYPES)) {
      if (result.toLowerCase().includes(key.toLowerCase())) return key;
    }
    // Default based on keywords
    const tl = freeText.toLowerCase();
    if (/retire|fire|early/i.test(tl))          return 'FIRE Chaser';
    if (/family|child|kids|depend/i.test(tl))   return 'Family Protector';
    if (/debt|loan|free/i.test(tl))             return 'Debt Escaper';
    if (/business|startup/i.test(tl))           return 'Entrepreneur';
    if (/safe|secure|fixed|fd/i.test(tl))       return 'Security Seeker';
    return 'Growth Optimizer';
  }

  /* ── Utility: compute DISC from scenario answer ─────────────────────────── */
  function computeDisc(marketAnswer, lifePOV, risk) {
    let scores = { D: 0, I: 0, S: 0, C: 0 };

    // Market scenario
    if (/buy more|opportunity|dip/i.test(marketAnswer))  scores.D += 2;
    if (/excited|let.*ride|long.term/i.test(marketAnswer)) scores.I += 2;
    if (/wait.*see|hold|nothing/i.test(marketAnswer))    scores.S += 2;
    if (/research|analyse|check/i.test(marketAnswer))    scores.C += 2;

    // Life POV
    if (/enjoy.*plan|both/i.test(lifePOV))   { scores.I += 1; scores.D += 1; }
    if (/future.*more/i.test(lifePOV))       { scores.C += 1; scores.S += 1; }
    if (/present/i.test(lifePOV))            scores.I += 2;

    // Risk
    if (/avoid/i.test(risk))                 scores.S += 2;
    if (/calculated/i.test(risk))            scores.C += 2;
    if (/comfortable|volatil/i.test(risk))   scores.D += 2;

    return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  }

  /* ── Utility: compute risk score 0-100 ─────────────────────────────────── */
  function computeRiskScore(marketAnswer, risk, age) {
    let score = 50;
    if (/buy more|opportunity/i.test(marketAnswer))   score += 20;
    if (/hold|wait|nothing/i.test(marketAnswer))      score -= 10;
    if (/sell|out|panic/i.test(marketAnswer))         score -= 25;
    if (/comfortable|volatil/i.test(risk))            score += 20;
    if (/calculated/i.test(risk))                     score += 5;
    if (/avoid/i.test(risk))                          score -= 20;
    // Age adjustment (younger = can take more risk)
    const ageNum = parseInt(age) || 30;
    if (ageNum < 25) score += 10;
    if (ageNum > 45) score -= 10;
    if (ageNum > 55) score -= 10;
    return Math.max(10, Math.min(95, score));
  }

  /* ── Utility: suggest goals from archetype + answers ───────────────────── */
  function suggestGoals() {
    const goalPool = [
      { id: 'emergency_fund',  label: '🛡️ Emergency Fund',    desc: '6 months of expenses in liquid fund' },
      { id: 'retirement',      label: '🏖️ Retirement Corpus', desc: 'Freedom from work by your target age' },
      { id: 'house',           label: '🏠 Own a Home',         desc: 'Down payment or full purchase' },
      { id: 'child_education', label: '🎓 Child Education',    desc: 'College fund for your child' },
      { id: 'fire',            label: '🔥 FIRE',               desc: 'Financial independence in 10-15 years' },
      { id: 'business',        label: '🚀 Business Capital',   desc: 'Fund to start or scale a venture' },
      { id: 'travel',          label: '✈️ Travel Fund',        desc: 'Annual dream vacation' },
      { id: 'car',             label: '🚗 Vehicle',             desc: 'Buy car without EMI stress' },
      { id: 'wedding',         label: '💍 Wedding / Big Event', desc: 'Save for a major life event' },
      { id: 'invest',          label: '📈 Wealth Building',    desc: 'Grow net worth systematically' },
    ];

    // Priority map by archetype
    const archetypePriority = {
      'Security Seeker':    ['emergency_fund', 'retirement', 'house'],
      'Growth Optimizer':   ['invest', 'retirement', 'house'],
      'FIRE Chaser':        ['fire', 'invest', 'emergency_fund'],
      'Debt Escaper':       ['emergency_fund', 'invest', 'retirement'],
      'Family Protector':   ['child_education', 'emergency_fund', 'retirement'],
      'Wealth Builder':     ['invest', 'house', 'retirement'],
      'Experience Seeker':  ['travel', 'emergency_fund', 'invest'],
      'Status Climber':     ['house', 'car', 'invest'],
      'Entrepreneur':       ['business', 'emergency_fund', 'invest'],
      'Conservative Saver': ['retirement', 'emergency_fund', 'house'],
      'Tax Optimizer':      ['invest', 'retirement', 'emergency_fund'],
      'Impact Investor':    ['invest', 'retirement', 'emergency_fund'],
    };

    const priorities = archetypePriority[archetype] || ['emergency_fund', 'invest', 'retirement'];
    return priorities.map(id => goalPool.find(g => g.id === id)).filter(Boolean);
  }

  /* ── Utility: show Arya response with streaming animation ──────────────── */
  async function showAryaResponse(prompt, system) {
    aryaBox.style.display  = 'block';
    aryaBox.style.opacity  = '0';
    aryaText.textContent   = '…';

    // Fade in
    requestAnimationFrame(() => { aryaBox.style.opacity = '1'; });

    let displayed = false;
    await ollamaStream(prompt, system, (tok, full) => {
      aryaText.textContent = full;
      displayed = true;
    });

    if (!displayed) {
      aryaBox.style.display = 'none';
    }
  }

  /* ── Utility: hide Arya box ─────────────────────────────────────────────── */
  function hideArya() {
    aryaBox.style.opacity = '0';
    setTimeout(() => { aryaBox.style.display = 'none'; }, 300);
  }

  /* ── Step indicator ─────────────────────────────────────────────────────── */
  function updateStepIndicator(step) {
    stepIndicator.innerHTML = '';
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `width:${i === step ? 20 : 6}px;height:6px;border-radius:3px;
        background:${i < step ? '#00ff88' : i === step ? '#00ff88' : 'rgba(255,255,255,.15)'};
        transition:all .3s;`;
      stepIndicator.appendChild(dot);
    }
    stepIndicator.style.opacity = '1';
  }

  /* ── Orb color ──────────────────────────────────────────────────────────── */
  function orbColor(color) {
    orb.style.boxShadow = `0 0 60px ${color}, 0 0 140px ${color}`;
  }

  /* ── Render option chips ─────────────────────────────────────────────────── */
  function renderOptions(opts, onSelect) {
    optEl.innerHTML = '';
    opts.forEach(opt => {
      const div = document.createElement('div');
      div.className   = 'option';
      div.textContent = opt;
      div.onclick = () => {
        document.querySelectorAll('.option').forEach(o => o.classList.remove('active'));
        div.classList.add('active');
        onSelect(opt);
      };
      optEl.appendChild(div);
    });
  }

  /* ── Save archetype to Supabase ─────────────────────────────────────────── */
  async function saveArchetypeToSupabase() {
    try {
      if (!window.supabase) return;
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const payload = {
        archetype,
        disc_type:  discType,
        risk_score: riskScore,
        goal_rank:  goalRank,
        onboarding_answers: answers,
        onboarded_at: new Date().toISOString(),
      };

      // Try user_context table first, fallback to profiles
      const { error } = await client
        .from('user_context')
        .upsert({ user_id: session.user.id, archetype_profile: payload })
        .select();

      if (error) {
        await client
          .from('profiles')
          .update({ financial_dna: archetype })
          .eq('id', session.user.id);
      }

      // Always update profiles.financial_dna
      await client
        .from('profiles')
        .update({ financial_dna: archetype, onboarding_done: true })
        .eq('id', session.user.id);

    } catch (e) {
      console.debug('[Onboarding] Supabase save skipped:', e.message);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     STEP DEFINITIONS
  ══════════════════════════════════════════════════════════════════════════ */

  /* ── Step 0: Open question → archetype ─────────────────────────────────── */
  async function step0() {
    updateStepIndicator(0);
    stepLabel.textContent = 'Step 1 of 6 — Your Money Story';
    qEl.textContent       = 'Ek sawaal se shuru karte hain — tujhe paisa kyu chahiye?';
    optEl.innerHTML       = '';
    goalWrap.style.display = 'none';
    summaryCard.style.display = 'none';
    freeWrap.style.display = 'block';
    freeInput.value       = '';
    btn.disabled          = true;

    freeInput.oninput = () => {
      btn.disabled = freeInput.value.trim().length < 8;
      if (!btn.disabled) btn.classList.add('enabled');
      else btn.classList.remove('enabled');
    };

    orbColor('#4f7cff');
    hideArya();

    let _classifying = false;
    btn.onclick = async () => {
      const text = freeInput.value.trim();
      if (!text || _classifying) return;
      _classifying = true;
      answers.whyMoney = text;
      btn.disabled = true;
      btn.textContent = 'Arya soch rahi hai…';

      // Classify archetype (with safe default if LLM fails)
      archetype = await classifyArchetype(text);
      const meta = ARCHETYPES[archetype] || {};
      localStorage.setItem('finos_financial_dna', archetype);

      // Show Arya's reaction
      await showAryaResponse(
        `User just said their financial goal is: "${text}". Their archetype is: "${archetype}".
         Give ONE warm, insightful Hinglish sentence acknowledging their goal and what it says about them.
         Then say you'll ask 5 quick questions to build their Financial OS. Keep it natural.`,
        'You are Arya, an AI finance advisor. Respond in warm Hinglish — 2 short sentences max. No markdown.'
      );

      _classifying = false;
      btn.textContent = 'Continue';
      btn.disabled    = false;
      btn.classList.add('enabled');
      btn.onclick = () => goTo(1);
    };
  }

  /* ── Step 1: Life stage + profession ────────────────────────────────────── */
  function step1() {
    updateStepIndicator(1);
    stepLabel.textContent  = 'Step 2 of 6 — Life Phase';
    freeWrap.style.display = 'none';
    goalWrap.style.display = 'none';
    summaryCard.style.display = 'none';
    orbColor('#c7f000');

    let sel = null;
    qEl.textContent = 'Where are you in life right now?';

    const opts = ['Just starting out (< 25)', 'Building my life (25-35)', 'Protecting my future (35-45)', 'Peak earning phase (45+)'];
    renderOptions(opts, chosen => {
      sel = chosen;
      answers.age = chosen;
      // Show Arya's brief personality insight
      showAryaResponse(
        `Person is in life stage: "${chosen}". Archetype: "${archetype}".
         In ONE Hinglish sentence, tell them what this life stage means financially — one key priority.`,
        'Arya AI: 1 sentence, warm Hinglish, no markdown, no preamble.'
      );
      btn.disabled = false;
      btn.classList.add('enabled');
    });

    btn.onclick = () => {
      if (!sel) return;
      goTo(2);
    };
  }

  /* ── Step 2: Income + behavioral scenario ───────────────────────────────── */
  function step2() {
    updateStepIndicator(2);
    stepLabel.textContent  = 'Step 3 of 6 — Income & Behavior';
    freeWrap.style.display = 'none';
    goalWrap.style.display = 'none';
    summaryCard.style.display = 'none';
    orbColor('#ffb703');

    let sel = null;
    qEl.textContent = 'How do you earn?';

    const opts = ['Fixed salary (salaried)', 'Business / freelance (variable)', 'Multiple income sources', 'Currently not earning / studying'];
    renderOptions(opts, chosen => {
      sel = chosen;
      answers.profession = chosen;
      const isVariable = /business|freelance|variable|multiple/i.test(chosen);
      showAryaResponse(
        `Person earns via: "${chosen}". Archetype: "${archetype}".
         ${isVariable ? 'They have variable income — mention one specific planning tip for this.' : 'They have fixed salary — mention one habit that matters most.'}
         ONE Hinglish sentence only.`,
        'Arya AI: 1 sentence, warm Hinglish, no markdown.'
      );
      btn.disabled = false;
      btn.classList.add('enabled');
    });

    btn.onclick = () => {
      if (!sel) return;
      goTo(3);
    };
  }

  /* ── Step 3: Market scenario → DISC + Risk ───────────────────────────────── */
  function step3() {
    updateStepIndicator(3);
    stepLabel.textContent  = 'Step 4 of 6 — Behavioral DNA';
    freeWrap.style.display = 'none';
    goalWrap.style.display = 'none';
    summaryCard.style.display = 'none';
    orbColor('#ff006e');

    let sel = null;
    qEl.textContent = 'Market 20% gir gaya. Tu kya karega?';

    const opts = [
      'Buy more — dip is an opportunity',
      'Hold and wait — long-term it recovers',
      'Check what changed — research before acting',
      'Sell some — protect capital',
    ];
    renderOptions(opts, chosen => {
      sel = chosen;
      answers.market = chosen;

      // Compute DISC + risk from all signals so far
      discType  = computeDisc(chosen, answers.lifePOV || '', answers.risk || '');
      riskScore = computeRiskScore(chosen, answers.risk || '', answers.age || '30');

      const disc = DISC[discType];
      showAryaResponse(
        `Based on their market response ("${chosen}"), their DISC profile is: ${discType} — ${disc?.name}.
         Risk score: ${riskScore}/100.
         In ONE warm Hinglish sentence, tell them what this says about their financial personality and name one investment that fits them.`,
        'Arya AI: 1 sentence, warm Hinglish, no markdown. Mention specific product (like SIP, FD, NPS).'
      );
      btn.disabled = false;
      btn.classList.add('enabled');
    });

    btn.onclick = () => {
      if (!sel) return;
      goTo(4);
    };
  }

  /* ── Step 4: Goal prioritization ────────────────────────────────────────── */
  function step4() {
    updateStepIndicator(4);
    stepLabel.textContent  = 'Step 5 of 6 — Your Goals';
    freeWrap.style.display = 'none';
    optEl.innerHTML        = '';
    summaryCard.style.display = 'none';
    orbColor('#8338ec');

    const goals = suggestGoals();
    goalRank    = goals.map(g => g.id);

    qEl.textContent = 'Arya ne tere liye 3 goals suggest kiye hain — rank kar inhe (drag or tap to reorder):';

    goalWrap.style.display = 'block';
    goalList.innerHTML = '';

    goals.forEach((g, i) => {
      const row = document.createElement('div');
      row.dataset.goalId = g.id;
      row.style.cssText = `
        display:flex;align-items:center;gap:12px;
        padding:12px 16px;border-radius:14px;cursor:pointer;
        background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
        transition:background .2s,border-color .2s;
      `;

      const rankBadge = document.createElement('div');
      rankBadge.style.cssText = `
        width:28px;height:28px;border-radius:50%;
        background:rgba(131,56,236,.3);border:1px solid rgba(131,56,236,.5);
        display:flex;align-items:center;justify-content:center;
        font-size:13px;font-weight:700;color:#c084fc;flex-shrink:0;`;
      rankBadge.textContent = i + 1;

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;';
      info.innerHTML = `
        <div style="font-size:14px;font-weight:600;">${g.label}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:2px;">${g.desc}</div>
      `;

      const arrow = document.createElement('div');
      arrow.style.cssText = 'color:rgba(255,255,255,.25);font-size:18px;';
      arrow.textContent = '⇅';

      row.appendChild(rankBadge); row.appendChild(info); row.appendChild(arrow);
      goalList.appendChild(row);

      // Simple tap-to-promote: click promotes goal to top
      row.onclick = () => {
        const id = row.dataset.goalId;
        goalRank = [id, ...goalRank.filter(x => x !== id)];
        // Re-order DOM
        const rows = [...goalList.querySelectorAll('[data-goal-id]')];
        const sorted = goalRank.map(gid => rows.find(r => r.dataset.goalId === gid)).filter(Boolean);
        sorted.forEach((r, idx) => {
          r.querySelector('div').textContent = idx + 1;
          goalList.appendChild(r);
        });
        rows.forEach(r => r.style.background = 'rgba(255,255,255,.04)');
        row.style.background = 'rgba(131,56,236,.12)';
        row.style.borderColor = 'rgba(131,56,236,.4)';
      };
    });

    // Show Arya suggestion
    const goalNames = goals.map(g => g.label).join(', ');
    showAryaResponse(
      `Based on archetype "${archetype}", suggested goals: ${goalNames}.
       ONE Hinglish sentence explaining why these 3 goals match their profile. End with: "Change karna ho toh tap any goal."`,
      'Arya AI: 1 sentence, warm Hinglish, no markdown.'
    );

    btn.disabled = false;
    btn.classList.add('enabled');
    btn.onclick = () => {
      answers.goalRank = goalRank;
      goTo(5);
    };
  }

  /* ── Step 5: AI-generated Financial OS summary ──────────────────────────── */
  async function step5() {
    updateStepIndicator(5);
    stepLabel.textContent  = 'Step 6 of 6 — Your Financial OS';
    freeWrap.style.display = 'none';
    optEl.innerHTML        = '';
    goalWrap.style.display = 'none';
    summaryCard.style.display = 'block';
    hideArya();
    orbColor('#00f5d4');

    qEl.textContent = 'Arya tera plan bana rahi hai…';
    btn.disabled    = true;
    btn.classList.remove('enabled');
    summaryText.textContent = '';
    summaryGoals.innerHTML  = '';

    const disc   = DISC[discType] || { name: discType, desc: '' };
    const riskLabel = riskScore >= 70 ? 'Aggressive' : riskScore >= 45 ? 'Moderate' : 'Conservative';
    const topGoal = goalRank[0] || 'wealth building';

    const systemPrompt = (
      `You are Arya, FIN·OS's AI finance advisor. Write in warm Hinglish — like an IIM-educated dost.
       Be specific, personal, and inspiring. 3 sentences max. No markdown. No bullets.
       End with "Ab shuru karte hain — pehla step hai…" and name ONE concrete first action.`
    );

    const briefPrompt = (
      `Build a "Your Financial OS" summary for this user:
       • Archetype: ${archetype} (${ARCHETYPES[archetype]?.focus || ''})
       • Life stage: ${answers.age || 'unknown'}
       • Profession: ${answers.profession || 'unknown'}
       • Behavioral DNA: ${disc.name} — ${disc.desc}
       • Risk profile: ${riskLabel} (${riskScore}/100)
       • Top goal: ${topGoal}
       • Why money matters to them: "${answers.whyMoney || ''}"

       Write a personalised 3-sentence Hinglish summary of their financial personality and 3-year plan.
       End with ONE specific first action step.`
    );

    qEl.textContent = 'Tera Financial OS teyaar hai!';

    // Stream the summary into the card
    let displayed = false;
    await ollamaStream(briefPrompt, systemPrompt, (tok, full) => {
      summaryText.textContent = full;
      displayed = true;
    });

    if (!displayed) {
      summaryText.textContent = (
        `${archetype} — ${ARCHETYPES[archetype]?.emoji || ''} ` +
        `Tujhe ${riskLabel.toLowerCase()} risk approach suit karta hai. ` +
        `Pehla step: emergency fund build karo — 3 months of expenses in liquid fund. ` +
        `Uske baad SIP shuru karo — ₹500 bhi kaafi hai shuru karne ke liye.`
      );
    }

    // Goal chips
    const goalMeta = {
      emergency_fund:  { label: '🛡️ Emergency Fund',    color: '#00ff88' },
      retirement:      { label: '🏖️ Retirement',        color: '#4f7cff' },
      house:           { label: '🏠 Own a Home',         color: '#ffb703' },
      child_education: { label: '🎓 Child Education',    color: '#c7f000' },
      fire:            { label: '🔥 FIRE',               color: '#ff6b35' },
      business:        { label: '🚀 Business',           color: '#8338ec' },
      invest:          { label: '📈 Wealth Building',    color: '#00d4ff' },
      travel:          { label: '✈️ Travel Fund',        color: '#f72585' },
      car:             { label: '🚗 Vehicle',             color: '#4cc9f0' },
      wedding:         { label: '💍 Big Event',          color: '#c77dff' },
    };

    goalRank.slice(0, 3).forEach((gid, i) => {
      const meta = goalMeta[gid] || { label: gid, color: '#00ff88' };
      const chip = document.createElement('span');
      chip.style.cssText = `
        padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;
        background:${meta.color}18;border:1px solid ${meta.color}40;color:${meta.color};`;
      chip.textContent = `${i + 1}. ${meta.label}`;
      summaryGoals.appendChild(chip);
    });

    // Save everything
    const profile = {
      archetype, discType, riskScore,
      goalRank, answers,
      riskLabel,
      financialDNA: archetype,
    };
    localStorage.setItem('finos_profile',       JSON.stringify(answers));
    localStorage.setItem('finos_financial_dna', archetype);
    localStorage.setItem('finos_risk_score',    riskScore);
    localStorage.setItem('finos_disc_type',     discType);
    localStorage.setItem('finos_goal_rank',     JSON.stringify(goalRank));
    localStorage.setItem('FINOS_ARCHETYPE',     JSON.stringify(profile));

    await saveArchetypeToSupabase();

    // Try to speak via Arya voice agent
    speakSummaryViaArya(summaryText.textContent);

    btn.disabled  = false;
    btn.classList.add('enabled');
    btn.textContent = "Let's go! →";
    btn.onclick = () => { window.location.href = 'home.html'; };
  }

  /* ── Speak via Arya voice agent (WS) ─────────────────────────────────────── */
  function speakSummaryViaArya(text) {
    try {
      const ws = new WebSocket('wss://127.0.0.1:8765');
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'text_input',
          text: `[ONBOARDING SUMMARY — speak this warmly to the user]: ${text}`,
          context_flag: 'onboarding',
        }));
        // Close after a short delay so the pipeline can run
        setTimeout(() => { try { ws.close(); } catch {} }, 15000);
      };
      ws.onerror = () => {};  // agent may not be running — silent fail
    } catch {}
  }

  /* ── Step router ─────────────────────────────────────────────────────────── */
  function goTo(step) {
    currentStep = step;
    hideArya();
    btn.textContent = step < TOTAL_STEPS - 1 ? 'Continue' : "Let's go!";
    btn.classList.remove('enabled');
    btn.disabled = true;

    if (step === 0) step0();
    else if (step === 1) step1();
    else if (step === 2) step2();
    else if (step === 3) step3();
    else if (step === 4) step4();
    else if (step === 5) step5();
  }

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    _bindDom();
    if (!btn || !qEl) {
      console.error('[Onboarding] Critical DOM elements missing — check onboarding.html');
      return;
    }
    goTo(0);
  });

})();
