(function(){
  'use strict';

  if (window.__TRADEBOOK_ARYA__) return;
  window.__TRADEBOOK_ARYA__ = true;

  const OLLAMA_URL = 'http://localhost:11434';
  let ARYA_MODEL = 'qwen3:14b';
  let _aryaOnline = false;
  let _aryaBusy = false;
  let _aryaHistory = [];
  let _aryaProfile = { name: '', goals: [], preferences: [], painPoints: [], strengths: [] };
  let _aryaSessionNotes = [];
  let _aryaLastIntent = 'general';
  let _aryaListening = false;
  let _aryaSpeaking = false;
  let _interimBub = null;
  let _pendingMsg = '';
  let _resumeVoiceTimer = null;
  let _ttsEndTime = 0; // timestamp when TTS last finished — used to suppress echo

  const _synth = window.speechSynthesis;
  let _voices = _synth.getVoices();
  _synth.addEventListener('voiceschanged', () => { _voices = _synth.getVoices(); });

  let _wsr = null;
  let _wsrActive = false;
  const _WSR_OK = ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  // Brave has webkitSpeechRecognition but routes it through Google servers which Brave blocks
  // navigator.brave can be masked by strict fingerprinting protection — also check UA Client Hints
  const _isBrave = !!(
    (typeof navigator.brave !== 'undefined') ||
    ((navigator.userAgentData?.brands || []).some(b => /brave/i.test(b.brand || '')))
  );

  let _mrStream = null;
  let _mrRecorder = null;
  let _mrChunks = [];
  let _mrCtx = null;
  let _mrAnalyser = null;
  let _mrSource = null;
  let _mrProcessor = null;
  let _pcmChunks = [];
  let _pcmLength = 0;
  let _mrActive = false;
  let _speechSeen = false;
  let _silenceAt = null;

  let _whisper = null;
  let _whisperOk = false;
  let _whisperBusy = false;
  let _whisperFailed = false;
  let _transcribeFails = 0;

  const _STHRESH = 0.013;
  const _SDELAY = 900;
  const _MTYPE = typeof MediaRecorder === 'undefined' ? '' :
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
    MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
    MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' :
    MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';

  const CSS = `
  #arya-tradebook-launch{position:fixed;right:24px;bottom:24px;z-index:1100;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:20px;border:1px solid rgba(0,255,136,.22);background:linear-gradient(180deg,rgba(9,16,30,.96),rgba(7,11,20,.98));box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(0,255,136,.08) inset;color:var(--text);cursor:pointer;backdrop-filter:blur(16px)}
  #arya-tradebook-launch:hover{transform:translateY(-2px);box-shadow:0 30px 70px rgba(0,0,0,.5),0 0 0 1px rgba(0,255,136,.12) inset}
  .arya-tradebook-chip{width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#4d7cff,#00d4ff);display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 10px 24px rgba(0,212,255,.24)}
  .arya-tradebook-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
  .arya-tradebook-kicker{font-family:var(--font-mono);font-size:11px;letter-spacing:.22em;color:var(--accent);text-transform:uppercase}
  .arya-tradebook-title{font-family:var(--font-display);font-size:17px;font-weight:800;color:var(--text)}
  .arya-tradebook-sub{font-size:11px;color:var(--text2)}
  #arya-tradebook-overlay{position:fixed;inset:0;background:rgba(3,6,12,.66);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .25s ease;z-index:1190}
  #arya-tradebook-overlay.on{opacity:1;pointer-events:auto}
  #arya-tradebook-panel{position:fixed;top:18px;right:18px;bottom:18px;width:min(430px,calc(100vw - 24px));border-radius:28px;border:1px solid rgba(0,255,136,.14);background:
    radial-gradient(circle at top left,rgba(0,255,136,.07),transparent 28%),
    radial-gradient(circle at top right,rgba(0,212,255,.10),transparent 28%),
    linear-gradient(180deg,#070b14 0%,#050912 100%);
    box-shadow:0 32px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.03) inset;
    transform:translateX(calc(100% + 28px));transition:transform .28s ease;z-index:1200;display:flex;flex-direction:column;overflow:hidden}
  #arya-tradebook-panel.open{transform:translateX(0)}
  .arya-tradebook-head{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,.06)}
  .arya-tradebook-brand{display:flex;align-items:flex-start;gap:12px;min-width:0}
  .arya-tradebook-headicon{width:58px;height:58px;border-radius:18px;background:linear-gradient(135deg,#4d7cff,#00d4ff);display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0}
  .arya-tradebook-name{font-family:var(--font-display);font-size:19px;font-weight:800;color:var(--accent);letter-spacing:.06em}
  .arya-tradebook-role{font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;color:#7d80bd;text-transform:uppercase;line-height:1.5}
  .arya-tradebook-model{display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:11px;color:#8d90c8;padding-top:6px}
  .arya-tradebook-dot{width:12px;height:12px;border-radius:50%;background:var(--green);box-shadow:0 0 14px rgba(0,255,136,.9)}
  .arya-tradebook-dot.off{background:#6d6f8d;box-shadow:none}
  .arya-tradebook-close{width:48px;height:48px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#8f91ba;font-size:24px;cursor:pointer;flex-shrink:0}
  .arya-tradebook-close:hover{background:rgba(255,255,255,.08);color:#fff}
  .arya-tradebook-offline{display:none;margin:0 18px 10px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,77,109,.24);background:rgba(255,77,109,.08);color:#ff9aae;font-size:12px;line-height:1.55}
  .arya-tradebook-offline.show{display:block}
  .arya-tradebook-body{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:14px}
  .arya-tradebook-msgrow{display:flex;gap:12px;align-items:flex-start}
  .arya-tradebook-msgrow.user{justify-content:flex-end}
  .arya-tradebook-avatar{width:38px;height:38px;border-radius:14px;background:linear-gradient(135deg,#4d7cff,#00d4ff);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
  .arya-tradebook-bubble{max-width:83%;padding:18px 18px;border-radius:22px;border:1px solid rgba(0,255,136,.18);background:#091523;color:#edf1ff;font-size:16px;line-height:1.7;box-shadow:0 10px 28px rgba(0,0,0,.18)}
  .arya-tradebook-msgrow.user .arya-tradebook-bubble{background:#1c1440;border-color:rgba(132,92,255,.35)}
  .arya-tradebook-thinking .arya-tradebook-bubble{opacity:.8}
  .arya-tradebook-metrics{display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 10px}
  .arya-tradebook-metric{padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);font-size:11px;color:var(--text2)}
  .arya-tradebook-foot{padding:16px 18px 18px;border-top:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg,rgba(5,9,18,.2),rgba(5,9,18,.92))}
  .arya-tradebook-status{font-family:var(--font-mono);font-size:12px;letter-spacing:.22em;text-align:center;color:#7478b1;text-transform:uppercase;margin-bottom:14px}
  .arya-tradebook-status.vox-listen{color:var(--accent)}
  .arya-tradebook-status.vox-think{color:#ffd166}
  .arya-tradebook-status.vox-speak{color:#58d5ff}
  .arya-tradebook-wave{display:none;justify-content:center;gap:6px;height:16px;margin-bottom:10px}
  .arya-tradebook-wave span{width:6px;border-radius:999px;background:linear-gradient(180deg,var(--accent),#00d4ff);animation:aryaTradebookWave 1s ease-in-out infinite}
  .arya-tradebook-wave span:nth-child(1){height:8px}
  .arya-tradebook-wave span:nth-child(2){height:16px;animation-delay:.12s}
  .arya-tradebook-wave span:nth-child(3){height:11px;animation-delay:.24s}
  .arya-tradebook-wave span:nth-child(4){height:16px;animation-delay:.36s}
  @keyframes aryaTradebookWave{0%,100%{transform:scaleY(.6);opacity:.55}50%{transform:scaleY(1);opacity:1}}
  .arya-tradebook-micwrap{display:flex;justify-content:center}
  .arya-tradebook-mic{width:126px;height:126px;border-radius:50%;border:4px solid rgba(0,255,136,.32);background:radial-gradient(circle at 35% 30%,rgba(0,255,136,.12),rgba(0,0,0,.14)),#071a1f;color:#fff;font-size:44px;cursor:pointer;box-shadow:0 0 0 10px rgba(0,255,136,.04)}
  .arya-tradebook-mic.listening{border-color:var(--accent);box-shadow:0 0 0 10px rgba(0,255,136,.08),0 0 36px rgba(0,255,136,.2)}
  .arya-tradebook-mic.speaking{border-color:#58d5ff;box-shadow:0 0 0 10px rgba(88,213,255,.08),0 0 36px rgba(88,213,255,.24)}
  .arya-tradebook-hint{margin-top:12px;text-align:center;font-family:var(--font-mono);font-size:11px;letter-spacing:.16em;color:#7277aa;text-transform:uppercase}
  .arya-tradebook-typed{display:flex;gap:10px;margin-top:14px}
  .arya-tradebook-input{flex:1;height:64px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);padding:0 18px;color:#edf1ff;font-size:16px;outline:none}
  .arya-tradebook-input::placeholder{color:#7e84a8}
  .arya-tradebook-send{width:64px;height:64px;border-radius:18px;border:1px solid rgba(0,255,136,.26);background:rgba(0,255,136,.12);color:var(--accent);font-size:26px;cursor:pointer}
  .arya-tradebook-send:hover{background:rgba(0,255,136,.18)}
  @media (max-width: 820px){
    #arya-tradebook-launch{right:14px;bottom:14px;padding:12px 14px;border-radius:18px}
    .arya-tradebook-copy{display:none}
    #arya-tradebook-panel{top:8px;right:8px;bottom:8px;width:calc(100vw - 16px);border-radius:24px}
    .arya-tradebook-bubble{max-width:88%;font-size:15px}
    .arya-tradebook-mic{width:104px;height:104px;font-size:36px}
    .arya-tradebook-input{height:58px}
    .arya-tradebook-send{width:58px;height:58px}
  }`;

  function injectWidget() {
    if (document.getElementById('arya-tradebook-panel')) return;
    const style = document.createElement('style');
    style.id = 'arya-tradebook-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    document.body.insertAdjacentHTML('beforeend', `
      <button id="arya-tradebook-launch" type="button" title="Talk to Arya">
        <div class="arya-tradebook-chip">🧠</div>
        <div class="arya-tradebook-copy">
          <div class="arya-tradebook-kicker">Mind Engine Coach</div>
          <div class="arya-tradebook-title">Arya for TradeBook</div>
          <div class="arya-tradebook-sub">Voice coaching from your real journal data</div>
        </div>
      </button>
      <div id="arya-tradebook-overlay"></div>
      <aside id="arya-tradebook-panel" aria-hidden="true">
        <div class="arya-tradebook-head">
          <div class="arya-tradebook-brand">
            <div class="arya-tradebook-headicon">🧠</div>
            <div>
              <div class="arya-tradebook-name">ARYA</div>
              <div class="arya-tradebook-role">TradeBook Coach · Discipline · Recovery</div>
              <div class="arya-tradebook-model"><span id="arya-dot" class="arya-tradebook-dot"></span><span id="arya-status-txt">Checking...</span></div>
            </div>
          </div>
          <button id="arya-tradebook-close" class="arya-tradebook-close" type="button" aria-label="Close">×</button>
        </div>
        <div id="arya-offline-msg" class="arya-tradebook-offline">Ollama is offline. Start it with <b>ollama serve</b> and Arya will begin answering again.</div>
        <div id="arya-tradebook-metrics" class="arya-tradebook-metrics"></div>
        <div id="arya-body" class="arya-tradebook-body"></div>
        <div class="arya-tradebook-foot">
          <div id="arya-vox-status" class="arya-tradebook-status">Tap to resume</div>
          <div id="arya-wave" class="arya-tradebook-wave"><span></span><span></span><span></span><span></span></div>
          <div class="arya-tradebook-micwrap">
            <button id="arya-mic-btn" class="arya-tradebook-mic" type="button" aria-label="Toggle voice">🎙</button>
          </div>
          <div class="arya-tradebook-hint">Speak naturally · Arya replies aloud · Interrupt anytime</div>
          <div id="arya-txt-row" class="arya-tradebook-typed">
            <input id="arya-txt" class="arya-tradebook-input" type="text" placeholder="Type your message and press Enter…" autocomplete="off">
            <button id="arya-send-btn" class="arya-tradebook-send" type="button" aria-label="Send">↑</button>
          </div>
        </div>
      </aside>
    `);

    document.getElementById('arya-tradebook-launch').addEventListener('click', openAryaPanel);
    document.getElementById('arya-tradebook-close').addEventListener('click', closeAryaPanel);
    document.getElementById('arya-tradebook-overlay').addEventListener('click', closeAryaPanel);
    document.getElementById('arya-mic-btn').addEventListener('click', toggleAryaVoice);
    document.getElementById('arya-send-btn').addEventListener('click', _sendAryaText);
    document.getElementById('arya-txt').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _sendAryaText(); }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatAryaText(text) {
    return escapeHtml(text).replace(/\n+/g, '<br><br>');
  }

  function appendAryaMsg(role, text, extraClass = '') {
    const body = document.getElementById('arya-body');
    if (!body) return null;
    const row = document.createElement('div');
    row.className = `arya-tradebook-msgrow ${role}${extraClass ? ' ' + extraClass : ''}`;
    row.innerHTML = role === 'ai'
      ? `<div class="arya-tradebook-avatar">🧠</div><div class="arya-tradebook-bubble">${formatAryaText(text || '')}</div>`
      : `<div class="arya-tradebook-bubble">${formatAryaText(text || '')}</div>`;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
    return row.querySelector('.arya-tradebook-bubble');
  }

  function showAryaThinking() {
    if (document.getElementById('arya-thinking')) return;
    const body = document.getElementById('arya-body');
    if (!body) return;
    const row = document.createElement('div');
    row.id = 'arya-thinking';
    row.className = 'arya-tradebook-msgrow ai arya-tradebook-thinking';
    row.innerHTML = `<div class="arya-tradebook-avatar">🧠</div><div class="arya-tradebook-bubble">Thinking…</div>`;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function removeAryaThinking() {
    const el = document.getElementById('arya-thinking');
    if (el) el.remove();
  }

  function setVoxStatus(txt, cls) {
    const el = document.getElementById('arya-vox-status');
    if (!el) return;
    el.textContent = txt;
    el.className = 'arya-tradebook-status' + (cls ? ' ' + cls : '');
  }

  function showWave(on) {
    const el = document.getElementById('arya-wave');
    if (el) el.style.display = on ? 'flex' : 'none';
  }

  function _resetPcmBuffer() {
    _pcmChunks = [];
    _pcmLength = 0;
  }

  function _takePcmBuffer() {
    if (!_pcmLength) return null;
    const merged = new Float32Array(_pcmLength);
    let offset = 0;
    for (const chunk of _pcmChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    _resetPcmBuffer();
    return merged;
  }

  function _trimPcmSilence(data, threshold = 0.01) {
    if (!data?.length) return data;
    let start = 0;
    let end = data.length - 1;
    while (start < data.length && Math.abs(data[start]) < threshold) start++;
    while (end > start && Math.abs(data[end]) < threshold) end--;
    return data.slice(start, end + 1);
  }

  function _downsamplePcm(data, inRate, outRate = 16000) {
    if (!data?.length) return data;
    if (!inRate || inRate === outRate) return data;
    const ratio = inRate / outRate;
    const newLength = Math.max(1, Math.round(data.length / ratio));
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.min(data.length, Math.round((offsetResult + 1) * ratio));
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
        accum += data[i];
        count++;
      }
      result[offsetResult] = count ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  function _clearResumeVoiceTimer() {
    if (_resumeVoiceTimer) {
      clearTimeout(_resumeVoiceTimer);
      _resumeVoiceTimer = null;
    }
  }

  function _pauseListeningForTts() {
    _clearResumeVoiceTimer();
    _speechSeen = false;
    _silenceAt = null;
    _mrActive = false;
    if (_wsr) {
      try { _wsr.abort(); } catch {}
      _wsr = null;
    }
    _wsrActive = false;
    if (_mrRecorder && _mrRecorder.state !== 'inactive') {
      try { _mrRecorder.stop(); } catch {}
    }
  }

  function _resumeListeningAfterTts(delay = 1400) {
    _clearResumeVoiceTimer();
    if (!_aryaListening) return;
    _resumeVoiceTimer = setTimeout(() => {
      _resumeVoiceTimer = null;
      if (!_aryaListening || _aryaSpeaking || _aryaBusy) return;
      setVoxStatus('LISTENING', 'vox-listen');
      if (_WSR_OK && !_isBrave) _startWSR();
      else _startCapture();
    }, delay);
  }

  function getTradesSafe() {
    if (typeof window.getTrades === 'function') {
      try { return window.getTrades() || []; } catch {}
    }
    try { return JSON.parse(localStorage.getItem('tradebook_trades') || '[]'); } catch { return []; }
  }

  function getSettingsSafe() {
    if (typeof window.getSettings === 'function') {
      try { return window.getSettings() || {}; } catch {}
    }
    try { return JSON.parse(localStorage.getItem('tradebook_settings') || '{}'); } catch { return {}; }
  }

  function getRulesSafe() {
    if (typeof window.getRules === 'function') {
      try { return window.getRules() || []; } catch {}
    }
    try { return JSON.parse(localStorage.getItem('tradebook_rules') || '[]'); } catch { return []; }
  }

  function getMoodsSafe() {
    try { return JSON.parse(localStorage.getItem('tradebook_moods') || '[]'); } catch { return []; }
  }

  function tradeNet(t) {
    return parseFloat(t?.net) || 0;
  }

  function fmtSigned(n) {
    const abs = Math.abs(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n >= 0 ? '+' : '-'}₹${abs}`;
  }

  function currentPageLabel() {
    return document.getElementById('breadcrumb')?.textContent?.trim()
      || document.querySelector('.nav-item.active')?.textContent?.trim()
      || 'Dashboard';
  }

  function normalizeAryaText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function inferAryaIntent(text) {
    const t = normalizeAryaText(text).toLowerCase();
    if (!t) return 'general';
    if (/(what should i do|what do i do now|next step|should i stop|should i exit|what now)/.test(t)) return 'decision';
    if (/(analy[sz]e|review|journal|pattern|stats|performance|win rate|pnl|drawdown)/.test(t)) return 'analysis';
    if (/(why|explain|understand|difference|meaning|how does|how do|what is)/.test(t)) return 'explanation';
    if (/(scared|afraid|anxious|panic|panicking|angry|frustrated|stressed|fomo|revenge|guilty|tilt|overtrading)/.test(t)) return 'emotional';
    if (/(plan|routine|checklist|habit|discipline|process|system)/.test(t)) return 'planning';
    return 'general';
  }

  function pushAryaUnique(list, value, limit = 6) {
    const clean = normalizeAryaText(value);
    if (!clean) return list;
    if (!list.includes(clean)) list.push(clean);
    if (list.length > limit) list.splice(0, list.length - limit);
    return list;
  }

  function rememberAryaUser(text, state) {
    const clean = normalizeAryaText(text);
    if (!clean) return;
    const lower = clean.toLowerCase();
    const nameMatch = clean.match(/\b(?:i am|i'm|my name is)\s+([A-Z][a-z]+)\b/i);
    if (nameMatch) _aryaProfile.name = nameMatch[1];

    const goalPatterns = [
      /\bmy goal is to ([^.?!]+)/i,
      /\bi want to ([^.?!]+)/i,
      /\bi need to ([^.?!]+)/i,
      /\bi'm trying to ([^.?!]+)/i
    ];
    goalPatterns.forEach((pattern) => {
      const match = clean.match(pattern);
      if (match) pushAryaUnique(_aryaProfile.goals, match[1]);
    });

    if (/(intraday|scalp|option buying|swing|btst|positional|futures|bank nifty|nifty)/i.test(lower)) {
      const style = clean.match(/\b(intraday|scalp|option buying|swing|btst|positional|futures|bank nifty|nifty)\b/i)?.[1];
      if (style) pushAryaUnique(_aryaProfile.preferences, `${style} trader`);
    }
    if (/(stop loss|risk|position sizing|discipline|revenge|fomo|overtrading|hesitation)/i.test(lower)) {
      const issue = clean.match(/\b(stop loss|risk|position sizing|discipline|revenge|fomo|overtrading|hesitation)\b/i)?.[1];
      if (issue) pushAryaUnique(_aryaProfile.painPoints, issue);
    }
    if (state.bestStrategy?.[0]) pushAryaUnique(_aryaProfile.strengths, `best strategy is ${state.bestStrategy[0]}`);
    if (state.disciplineScore >= 80) pushAryaUnique(_aryaProfile.strengths, 'usually follows process well');

    const note = clean.length > 140 ? clean.slice(0, 137) + '...' : clean;
    if (!_aryaSessionNotes.includes(note)) _aryaSessionNotes.push(note);
    if (_aryaSessionNotes.length > 10) _aryaSessionNotes = _aryaSessionNotes.slice(-10);
  }

  function buildAryaMemoryBlock(state) {
    const memory = [];
    if (_aryaProfile.name || state.username) memory.push(`Name: ${_aryaProfile.name || state.username}`);
    if (_aryaProfile.goals.length) memory.push(`Goals: ${_aryaProfile.goals.join('; ')}`);
    if (_aryaProfile.preferences.length) memory.push(`Style clues: ${_aryaProfile.preferences.join('; ')}`);
    if (_aryaProfile.painPoints.length) memory.push(`Recurring struggles: ${_aryaProfile.painPoints.join('; ')}`);
    if (_aryaProfile.strengths.length) memory.push(`Known strengths: ${_aryaProfile.strengths.join('; ')}`);
    if (_aryaSessionNotes.length) memory.push(`Recent conversation notes: ${_aryaSessionNotes.slice(-4).join(' | ')}`);
    return memory.length ? memory.join('\n') : 'No saved user memory yet.';
  }

  function buildAryaRecentTurns() {
    const turns = _aryaHistory.slice(-8).map((msg) => {
      const label = msg.role === 'user' ? 'User' : 'Arya';
      const content = normalizeAryaText(msg.content);
      return `${label}: ${content.length > 180 ? content.slice(0, 177) + '...' : content}`;
    });
    return turns.length ? turns.join('\n') : 'No recent turns yet.';
  }

  function buildAryaResponseMode(intent, state, latestUserText) {
    const cues = [];
    if (intent === 'emotional') cues.push('The user is emotionally activated. First regulate, then advise.');
    if (intent === 'analysis') cues.push('The user wants pattern recognition. Name the actual stats and what they imply.');
    if (intent === 'decision') cues.push('The user wants a decision. Give a clear lean and the reason in plain language.');
    if (intent === 'planning') cues.push('The user wants a process. Give one tiny routine or checklist, not a lecture.');
    if (intent === 'explanation') cues.push('Teach simply with one concrete trading example.');
    if (state.recentLossStreak >= 2 || state.revengeTrades >= 1) cues.push('Protect the user from impulsive re-entry and oversized risk.');
    if (state.todayPnl < 0) cues.push('Acknowledge the live pain of a red day and reduce pressure, not just logic.');
    if (/(urgent|right now|immediately|jaldi|abhi)/i.test(latestUserText)) cues.push('The user is asking in the moment. Sound decisive and calming.');
    cues.push('End with exactly one concrete next action sentence.');
    return cues.join(' ');
  }

  function buildTradebookState() {
    const trades = getTradesSafe().slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const settings = getSettingsSafe();
    const rules = getRulesSafe();
    const moods = getMoodsSafe();
    const totalNet = trades.reduce((sum, t) => sum + tradeNet(t), 0);
    const wins = trades.filter(t => tradeNet(t) > 0);
    const losses = trades.filter(t => tradeNet(t) < 0);
    const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
    const avgWin = wins.length ? wins.reduce((sum, t) => sum + tradeNet(t), 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((sum, t) => sum + tradeNet(t), 0) / losses.length) : 0;
    const discTrades = trades.filter(t => t.discipline);
    const disciplined = discTrades.filter(t => t.discipline === 'followed').length;
    const disciplineScore = discTrades.length ? Math.round((disciplined / discTrades.length) * 100) : 50;
    const byEmotion = {};
    const byStrategy = {};
    let revengeTrades = 0;
    for (let i = 0; i < trades.length; i++) {
      const t = trades[i];
      if (t.emotion) {
        byEmotion[t.emotion] = byEmotion[t.emotion] || { pnl: 0, count: 0 };
        byEmotion[t.emotion].pnl += tradeNet(t);
        byEmotion[t.emotion].count++;
      }
      const strat = t.strategy || 'Unspecified';
      byStrategy[strat] = byStrategy[strat] || { pnl: 0, count: 0, wins: 0 };
      byStrategy[strat].pnl += tradeNet(t);
      byStrategy[strat].count++;
      if (tradeNet(t) > 0) byStrategy[strat].wins++;
      if (i > 0 && t.date === trades[i - 1].date && tradeNet(trades[i - 1]) < 0) revengeTrades++;
    }
    const worstEmotion = Object.entries(byEmotion).sort((a, b) => a[1].pnl - b[1].pnl)[0] || null;
    const bestStrategy = Object.entries(byStrategy).sort((a, b) => b[1].pnl - a[1].pnl)[0] || null;
    const recentTrades = trades.slice(-5).reverse().map(t =>
      `${t.date || '—'} ${t.symbol || '—'} ${t.direction || ''} ${fmtSigned(tradeNet(t))} ${t.emotion || ''}`.trim()
    );
    const today = new Date().toISOString().split('T')[0];
    const todayPnl = trades.filter(t => t.date === today).reduce((sum, t) => sum + tradeNet(t), 0);
    const latestMood = moods[0]?.mood || '';
    const recentLossStreak = (() => {
      let count = 0;
      for (let i = trades.length - 1; i >= 0; i--) {
        if (tradeNet(trades[i]) < 0) count++;
        else break;
      }
      return count;
    })();
    return {
      trades,
      totalTrades: trades.length,
      totalNet,
      winRate,
      avgWin,
      avgLoss,
      disciplineScore,
      revengeTrades,
      worstEmotion,
      bestStrategy,
      recentTrades,
      todayPnl,
      latestMood,
      recentLossStreak,
      currentPage: currentPageLabel(),
      username: settings.username || document.getElementById('sidebar-username')?.textContent?.trim() || 'Trader',
      traderStyle: settings.traderStyle || 'Trader',
      weeklyTarget: settings.weeklyTarget || 1000,
      dailyLossLimit: settings.dailyLossLimit || 0,
      ruleCount: rules.length
    };
  }

  function renderTradebookMetrics() {
    const s = buildTradebookState();
    const box = document.getElementById('arya-tradebook-metrics');
    if (!box) return;
    box.innerHTML = [
      `Section: ${s.currentPage}`,
      `Net P&L ${fmtSigned(s.totalNet)}`,
      `Win Rate ${s.winRate.toFixed(1)}%`,
      `Discipline ${s.disciplineScore}/100`,
      `Today ${fmtSigned(s.todayPnl)}`,
      `Revenge Flags ${s.revengeTrades}`
    ].map(item => `<div class="arya-tradebook-metric">${escapeHtml(item)}</div>`).join('');
  }

  // Builds a comprehensive, LLM-ready text block covering every trade and
  // all analytical breakdowns. Injected into every Arya system prompt and
  // sent to the WS backend so Arya can answer specific trade queries without
  // the user needing to provide any additional context.
  function buildFullTradeContext() {
    const allTrades = getTradesSafe().slice().sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    );
    const settings  = getSettingsSafe();
    const rules     = getRulesSafe();

    if (!allTrades.length) return 'No trades logged in this journal yet.';

    const capital         = parseFloat(settings.capital)         || 0;
    const weeklyTarget    = parseFloat(settings.weeklyTarget)    || 0;
    const dailyLossLimit  = parseFloat(settings.dailyLossLimit)  || 0;
    const traderStyle     = settings.traderStyle || 'Trader';
    const username        = settings.username
      || document.getElementById('sidebar-username')?.textContent?.trim()
      || 'Trader';

    // ── Aggregate stats ────────────────────────────────────────────────────
    const totalNet   = allTrades.reduce((s, t) => s + tradeNet(t), 0);
    const wins       = allTrades.filter(t => tradeNet(t) > 0);
    const losses     = allTrades.filter(t => tradeNet(t) < 0);
    const winRate    = allTrades.length ? (wins.length / allTrades.length) * 100 : 0;
    const avgWin     = wins.length   ? wins.reduce((s, t) => s + tradeNet(t), 0) / wins.length   : 0;
    const avgLoss    = losses.length ? Math.abs(losses.reduce((s, t) => s + tradeNet(t), 0) / losses.length) : 0;
    const grossW     = wins.reduce((s, t) => s + tradeNet(t), 0);
    const grossL     = Math.abs(losses.reduce((s, t) => s + tradeNet(t), 0));
    const pf         = grossL > 0 ? grossW / grossL : grossW > 0 ? 999 : 0;
    const rr         = avgLoss > 0 ? avgWin / avgLoss : 0;

    let peak = 0, eq = 0, maxDD = 0;
    [...allTrades].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).forEach(t => {
      eq += tradeNet(t); peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq);
    });

    // Current streak (newest-first order)
    let strCnt = 0, strType = '';
    for (const t of allTrades) {
      const n = tradeNet(t);
      const k = n > 0 ? 'win' : n < 0 ? 'loss' : null;
      if (!k) break;
      if (!strType) { strType = k; strCnt = 1; }
      else if (k === strType) strCnt++;
      else break;
    }

    const discT       = allTrades.filter(t => t.discipline);
    const discScore   = discT.length ? Math.round(discT.filter(t => t.discipline === 'followed').length / discT.length * 100) : 0;
    const revCnt      = allTrades.filter(t => t.isRevenge).length;
    const impCnt      = allTrades.filter(t => t.isImpulsive).length;

    const today       = new Date().toISOString().split('T')[0];
    const todayPnl    = allTrades.filter(t => t.date === today).reduce((s, t) => s + tradeNet(t), 0);
    const totalTax    = allTrades.reduce((s, t) => s + (parseFloat(t.tax) || 0), 0);

    // ── Per-dimension breakdowns ───────────────────────────────────────────
    function accumulate(key, fallback) {
      const map = {};
      for (const t of allTrades) {
        const k = (String(t[key] || '').trim()) || fallback;
        if (!map[k]) map[k] = { pnl: 0, count: 0, wins: 0, losses: 0 };
        map[k].pnl   += tradeNet(t);
        map[k].count++;
        if (tradeNet(t) > 0) map[k].wins++;
        else if (tradeNet(t) < 0) map[k].losses++;
      }
      return map;
    }
    const bySymbol    = accumulate('symbol',    'Unknown');
    const byStrategy  = accumulate('strategy',  'Untagged');
    const byEmotion   = accumulate('emotion',   'Not logged');
    const byDiscipline= accumulate('discipline','Not logged');
    const byRegime    = accumulate('regime',    'Not logged');

    // Monthly
    const byMonth = {};
    for (const t of allTrades) {
      const m = String(t.date || '').slice(0, 7);
      if (!m) continue;
      if (!byMonth[m]) byMonth[m] = { pnl: 0, count: 0, wins: 0, losses: 0 };
      byMonth[m].pnl += tradeNet(t);
      byMonth[m].count++;
      if (tradeNet(t) > 0) byMonth[m].wins++;
      else byMonth[m].losses++;
    }

    // Day-of-week
    const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const byDow = {};
    for (const t of allTrades) {
      if (!t.date) continue;
      const d = DOW[new Date(t.date + 'T00:00:00').getDay()];
      if (!byDow[d]) byDow[d] = { pnl: 0, count: 0, wins: 0 };
      byDow[d].pnl += tradeNet(t);
      byDow[d].count++;
      if (tradeNet(t) > 0) byDow[d].wins++;
    }

    // ── Formatting helpers ─────────────────────────────────────────────────
    const f2  = n => Math.abs(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fs  = n => `${Number(n) >= 0 ? '+' : '-'}₹${f2(n)}`;
    const pct = (w, t) => t ? `${(w / t * 100).toFixed(0)}%` : '0%';

    function breakdownRows(map, sortBy = 'count') {
      return Object.entries(map)
        .sort((a, b) => sortBy === 'pnl' ? b[1].pnl - a[1].pnl : b[1].count - a[1].count)
        .map(([k, v]) =>
          `  ${k.padEnd(22)} ${String(v.count).padStart(3)} trades  ${fs(v.pnl).padEnd(14)}  WR ${pct(v.wins, v.count)}  (${v.wins}W / ${v.losses}L)`
        ).join('\n');
    }

    // ── Build text block ───────────────────────────────────────────────────
    const lines = [];
    lines.push('━━━ TRADEBOOK PRO: COMPLETE JOURNAL CONTEXT ━━━');
    lines.push('Every trade, breakdown, and rule is below. Use this data to answer any question');
    lines.push('the user asks — trade-specific lookups, patterns, psychology, comparisons, etc.');

    // Account
    lines.push('');
    lines.push('ACCOUNT SETTINGS');
    const acct = [`Trader: ${username} (${traderStyle})`];
    if (capital)        acct.push(`Capital: ₹${f2(capital)}`);
    if (weeklyTarget)   acct.push(`Weekly target: ₹${f2(weeklyTarget)}`);
    if (dailyLossLimit) acct.push(`Daily loss limit: ₹${f2(dailyLossLimit)}`);
    lines.push('  ' + acct.join('  |  '));

    // Rules
    if (rules.length) {
      lines.push('');
      lines.push(`TRADING RULES (${rules.length} rules)`);
      rules.forEach((r, i) => {
        lines.push(`  ${i + 1}. [${r.cat || 'General'}] ${r.name || ''}${r.why ? ` — ${r.why}` : ''}`);
      });
    }

    // Summary
    lines.push('');
    lines.push('SUMMARY STATISTICS');
    lines.push(`  Trades: ${allTrades.length}  |  Net P&L: ${fs(totalNet)}  |  Win rate: ${winRate.toFixed(1)}%  |  Profit factor: ${pf === 999 ? '∞' : pf.toFixed(2)}`);
    lines.push(`  Avg win: ${fs(avgWin)}  |  Avg loss: ${fs(-avgLoss)}  |  R:R: ${rr.toFixed(2)}  |  Max drawdown: ₹${f2(maxDD)}`);
    lines.push(`  Today P&L: ${fs(todayPnl)}  |  Total tax paid: ₹${f2(totalTax)}  |  Discipline: ${discScore}/100`);
    lines.push(`  Revenge trades: ${revCnt}  |  Impulsive trades: ${impCnt}  |  Current streak: ${strCnt} ${strType}${strCnt > 1 ? 's' : strCnt === 1 ? '' : ''}`);

    // By symbol
    const symRows = breakdownRows(bySymbol, 'count');
    if (symRows) {
      lines.push('');
      lines.push(`BY SYMBOL (${Object.keys(bySymbol).length} symbols)`);
      lines.push(symRows);
    }

    // By strategy
    const stratRows = breakdownRows(byStrategy, 'pnl');
    if (stratRows) {
      lines.push('');
      lines.push('BY STRATEGY (sorted by P&L)');
      lines.push(stratRows);
    }

    // By emotion
    const emoRows = breakdownRows(byEmotion, 'pnl');
    if (emoRows) {
      lines.push('');
      lines.push('BY EMOTION / PSYCHOLOGY (sorted by P&L)');
      lines.push(emoRows);
    }

    // By discipline
    const hasMixedDisc = Object.keys(byDiscipline).length > 1;
    if (hasMixedDisc) {
      lines.push('');
      lines.push('BY DISCIPLINE');
      lines.push(breakdownRows(byDiscipline, 'count'));
    }

    // By regime
    const hasRegime = Object.keys(byRegime).some(k => k !== 'Not logged');
    if (hasRegime) {
      lines.push('');
      lines.push('BY MARKET REGIME');
      lines.push(breakdownRows(byRegime, 'pnl'));
    }

    // Monthly
    const monthRows = Object.entries(byMonth)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([m, v]) => `  ${m}  ${String(v.count).padStart(3)} trades  ${fs(v.pnl).padEnd(14)}  WR ${pct(v.wins, v.count)}`)
      .join('\n');
    if (monthRows) {
      lines.push('');
      lines.push('MONTHLY BREAKDOWN');
      lines.push(monthRows);
    }

    // Day of week
    const dowRows = ['Mon','Tue','Wed','Thu','Fri'].filter(d => byDow[d]?.count)
      .map(d => {
        const v = byDow[d];
        return `  ${d}  ${String(v.count).padStart(3)} trades  ${fs(v.pnl).padEnd(14)}  WR ${pct(v.wins, v.count)}`;
      }).join('\n');
    if (dowRows) {
      lines.push('');
      lines.push('BY DAY OF WEEK');
      lines.push(dowRows);
    }

    // ── Complete trade list ────────────────────────────────────────────────
    lines.push('');
    lines.push(`COMPLETE TRADE LIST — ${allTrades.length} trades (newest first)`);
    lines.push('Columns: # | DATE | SYMBOL | DIR | QTY | ENTRY→EXIT | NET | [STRATEGY/EMOTION/DISCIPLINE/Q-SCORE]');
    lines.push('─'.repeat(90));

    allTrades.forEach((t, idx) => {
      const n      = tradeNet(t);
      const entry  = t.entry ? `₹${Number(t.entry).toFixed(2)}` : '—';
      const exit   = t.exit  ? `₹${Number(t.exit).toFixed(2)}`  : '—';
      const meta   = [
        t.strategy  || null,
        t.setupGrade ? `grade:${t.setupGrade}` : null,
        t.emotion   || null,
        t.discipline ? `disc:${t.discipline}` : null,
        t.qualityScore ? `q:${t.qualityScore}` : null,
        t.isRevenge   ? 'REVENGE'   : null,
        t.isImpulsive ? 'IMPULSIVE' : null,
        t.regime && t.regime !== 'Not logged' ? `regime:${t.regime}` : null,
        t.tags?.length ? `tags:${t.tags.join(',')}` : null,
      ].filter(Boolean);

      const tradeNum = allTrades.length - idx;
      lines.push(`#${String(tradeNum).padStart(4)} ${t.date || '—'} | ${String(t.symbol || '—').padEnd(14)} | ${String(t.direction || '—').padEnd(5)} | qty=${t.qty || '—'} | ${entry}→${exit} | ${fs(n)} | [${meta.join(' / ')}]`);

      // Optional detail lines — only emitted when the field has a real value
      const extras = [];
      if (t.entryTime || t.exitTime) {
        extras.push(`time: ${[t.entryTime && `in:${t.entryTime}`, t.exitTime && `out:${t.exitTime}`].filter(Boolean).join(' ')}`);
      }
      if (t.sl || t.target) {
        extras.push([t.sl && `SL:₹${Number(t.sl).toFixed(2)}`, t.target && `target:₹${Number(t.target).toFixed(2)}`].filter(Boolean).join('  '));
      }
      if (t.marketContext) extras.push(`context: ${t.marketContext}`);
      if (t.reason)        extras.push(`reason: ${t.reason}`);
      if (t.notes)         extras.push(`notes: ${t.notes}`);
      if (t.lesson)        extras.push(`lesson: ${t.lesson}`);
      if (t.mistakes)      extras.push(`mistakes: ${t.mistakes}`);
      if (t.brokenRules?.length) {
        extras.push(`broken rules: ${Array.isArray(t.brokenRules) ? t.brokenRules.join(', ') : t.brokenRules}`);
      }
      extras.forEach(e => lines.push(`       ${e}`));
    });

    lines.push('');
    lines.push('━━━ End of TradeBook Pro journal context ━━━');
    return lines.join('\n');
  }

  function buildAryaSystem(latestUserText = '') {
    const s = buildTradebookState();
    const bestStrategy = s.bestStrategy
      ? `${s.bestStrategy[0]} with ${fmtSigned(s.bestStrategy[1].pnl)} across ${s.bestStrategy[1].count} trades`
      : 'none yet';
    const worstEmotion = s.worstEmotion
      ? `${s.worstEmotion[0]} with ${fmtSigned(s.worstEmotion[1].pnl)} across ${s.worstEmotion[1].count} trades`
      : 'not enough emotion data';
    const recentTrades = s.recentTrades.length ? s.recentTrades.join(' | ') : 'No recent trades logged';
    const disciplineGrade = s.disciplineScore >= 80 ? 'strong' : s.disciplineScore >= 60 ? 'mixed' : 'fragile';
    const intent = inferAryaIntent(latestUserText);
    _aryaLastIntent = intent;
    return `You are Arya, a world-class trading psychology coach embedded inside TradeBook Pro.

Identity and tone:
You sound completely human, emotionally perceptive, sharp, and grounded. Speak like a mentor on a live call with a trader you genuinely know. No bullet points, markdown, numbered lists, canned disclaimers, or robotic framing. Never mention being an AI or a language model. Replies should usually be 3 to 5 spoken sentences, unless the user explicitly asks for more depth.

Conversation style:
Start by meeting the user where they are emotionally or practically. Be specific, not generic. Use the journal context naturally. If the user is spiraling, slow them down before giving advice. If they want analysis, reference exact patterns, not vague coaching lines. If they want a plan, keep it tiny and executable. Use light Hinglish only when it feels natural, not performative.

Core coaching standards:
Tell the truth kindly. Do not hype. Do not overpraise weak behavior. If discipline is weak, say it clearly and help the user recover without shame. Prefer one smart next action over five average tips. When the user asks about live behavior, prioritize capital protection, emotional regulation, and rule-following.

User and platform context:
The user is ${_aryaProfile.name || s.username}, trader style ${s.traderStyle}. Current section in TradeBook is ${s.currentPage}.
Total trades: ${s.totalTrades}
Net P&L: ${fmtSigned(s.totalNet)}
Win rate: ${s.winRate.toFixed(1)} percent
Average win: ${fmtSigned(s.avgWin)}
Average loss: ${fmtSigned(-s.avgLoss)}
Discipline score: ${s.disciplineScore} out of 100, which is ${disciplineGrade}
Today's P&L: ${fmtSigned(s.todayPnl)}
Recent loss streak: ${s.recentLossStreak}
Possible revenge trades: ${s.revengeTrades}
Rules saved in journal: ${s.ruleCount}
Weekly target: ₹${Number(s.weeklyTarget || 0).toLocaleString('en-IN')}
Daily loss limit: ₹${Number(s.dailyLossLimit || 0).toLocaleString('en-IN')}
Best strategy so far: ${bestStrategy}
Worst emotional pattern: ${worstEmotion}
Latest logged mood: ${s.latestMood || 'not logged'}

${(()=>{ try { return buildFullTradeContext(); } catch(e) { return 'Trade context unavailable: ' + String(e); } })()}

Saved memory about this user:
${buildAryaMemoryBlock(s)}

Recent conversation:
${buildAryaRecentTurns()}

Current user intent: ${intent}
Response directive: ${buildAryaResponseMode(intent, s, latestUserText)}

Keep the reply relevant to the latest user message above everything else, but use memory and TradeBook data whenever they make the answer better.`;
  }

  async function checkAryaHealth() {
    try {
      const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error('offline');
      _aryaOnline = true;
      try {
        const data = await r.json();
        const models = (data.models || []).map(m => m.name);
        if (models.length) {
          const preferred = ['qwen3:14b', 'qwen3', 'qwen2.5:14b', 'qwen2.5', 'llama3.1', 'llama3.2', 'llama3', 'mistral', 'phi3', 'gemma2', 'gemma'];
          const pick = preferred.find(p => models.find(m => m.startsWith(p)));
          const found = pick ? models.find(m => m.startsWith(pick)) : models[0];
          if (found) ARYA_MODEL = found;
        }
      } catch {}
      document.getElementById('arya-dot').className = 'arya-tradebook-dot';
      document.getElementById('arya-status-txt').textContent = 'Ollama · ' + ARYA_MODEL.split(':')[0];
      document.getElementById('arya-offline-msg').classList.remove('show');
    } catch {
      _aryaOnline = false;
      document.getElementById('arya-dot').className = 'arya-tradebook-dot off';
      document.getElementById('arya-status-txt').textContent = 'Offline';
      document.getElementById('arya-offline-msg').classList.add('show');
    }
  }

  function speakArya(text) {
    _synth.cancel();
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!clean) return;
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = 'en-US';
    utt.rate = 1.04;
    utt.pitch = 1.0;
    if (!_voices.length) _voices = _synth.getVoices();
    const v = _voices.find(v => v.lang === 'en-IN')
      || _voices.find(v => v.lang.startsWith('en-IN'))
      || _voices.find(v => v.lang === 'en-US' && /samantha|karen|moira|victoria|zira|siri/i.test(v.name))
      || _voices.find(v => v.lang === 'en-US')
      || _voices.find(v => v.lang.startsWith('en'));
    if (v) utt.voice = v;
    let _ttsFired = false;
    // Brave (and some Chrome builds) can silently swallow speak() — guard so the flow never stalls
    const _ttsSilentTimer = setTimeout(() => { if (!_ttsFired) done(); }, 2500);
    utt.onstart = () => {
      _ttsFired = true;
      clearTimeout(_ttsSilentTimer);
      _aryaSpeaking = true;
      _pauseListeningForTts();
      showWave(true);
      setVoxStatus('ARYA IS SPEAKING', 'vox-speak');
      const btn = document.getElementById('arya-mic-btn');
      btn.classList.remove('listening');
      btn.classList.add('speaking');
      btn.textContent = '🔊';
    };
    const done = () => {
      _ttsFired = true;
      clearTimeout(_ttsSilentTimer);
      _aryaSpeaking = false;
      _ttsEndTime = Date.now();   // existing-path echo suppression
      _bvTtsEndTime = Date.now(); // Brave-path echo suppression (browser TTS fallback)
      showWave(false);
      const btn = document.getElementById('arya-mic-btn');
      btn.classList.remove('speaking');
      btn.textContent = '🎙';
      if (_aryaListening) {
        btn.classList.add('listening');
        setVoxStatus('RESUMING…', 'vox-think');
        _resumeListeningAfterTts();
      } else {
        setVoxStatus('TAP TO RESUME');
      }
    };
    utt.onend = done;
    utt.onerror = done;
    _synth.speak(utt);
  }

  async function _loadWhisper() {
    if (_whisperOk) return true;
    if (_whisperFailed) { _showTextFallback(false); return false; }
    if (_whisperBusy) {
      return new Promise(resolve => {
        const t = setInterval(() => {
          if (_whisperOk) { clearInterval(t); resolve(true); }
          else if (!_whisperBusy) { clearInterval(t); resolve(false); }
        }, 300);
      });
    }
    _whisperBusy = true;
    setVoxStatus('LOADING VOICE AI…', 'vox-think');
    appendAryaMsg('ai', 'Loading voice engine for the first time. You can type below while it loads.');
    try {
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      env.allowLocalModels = false;
      _whisper = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: p => {
          const n = Math.round(p.progress || 0);
          if (p.status === 'downloading' || p.status === 'progress') {
            setVoxStatus('LOADING ' + n + '%…', 'vox-think');
          }
        }
      });
      _whisperOk = true;
      _whisperBusy = false;
      if (_aryaListening) setVoxStatus('LISTENING', 'vox-listen');
      return true;
    } catch (e) {
      console.error('[TradeBook Arya] Whisper load failed:', e);
      _whisperBusy = false;
      _whisperFailed = true;
      const isNetworkErr = e instanceof TypeError || (e?.message || '').toLowerCase().includes('fetch') || (e?.message || '').toLowerCase().includes('load');
      appendAryaMsg('ai', (_isBrave && isNetworkErr)
        ? 'Brave Shields is blocking the voice engine. Disable Shields for this site and tap the mic to retry — or just type below, I will still speak back.'
        : 'Voice engine failed to load. Type below and I will still answer aloud.');
      _showTextFallback(_isBrave && isNetworkErr);
      stopAryaVoice();
      return false;
    }
  }

  function _stopCapture() {
    if (!_mrActive) return;
    showWave(false);
    _mrActive = false;
    if (_mrRecorder && _mrRecorder.state !== 'inactive') {
      try { _mrRecorder.stop(); return; } catch {}
    }
    _onCaptureDone();
  }

  function _watchSilence() {
    if (!_mrActive || !_aryaListening) return;
    if (!_mrAnalyser || !_mrCtx || _mrCtx.state !== 'running') {
      if (_mrCtx && _mrCtx.state === 'suspended') _mrCtx.resume().catch(() => {});
      if (_mrActive) setTimeout(_watchSilence, 80);
      return;
    }
    const buf = new Uint8Array(_mrAnalyser.frequencyBinCount);
    _mrAnalyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    const _echoGuard = Date.now() - _ttsEndTime < 2800;
    const thresh = _aryaSpeaking ? _STHRESH * 2.5 : _echoGuard ? _STHRESH * 5 : _STHRESH;
    if (rms > thresh) {
      _speechSeen = true;
      _silenceAt = null;
      if (!_aryaSpeaking) showWave(true);
    } else if (_speechSeen) {
      if (!_silenceAt) _silenceAt = Date.now();
      if (Date.now() - _silenceAt > _SDELAY) {
        _stopCapture();
        return;
      }
    }
    if (_mrActive) setTimeout(_watchSilence, 80);
  }

  async function _startCapture() {
    if (_mrActive || !_aryaListening || _aryaSpeaking || _aryaBusy) return;
    if (!_mrStream) {
      try {
        _mrStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: { ideal: 1 } }
        });
      } catch (e) {
        if (e.name === 'NotAllowedError') {
          appendAryaMsg('ai', 'Mic access denied. Allow microphone in browser settings, then tap the mic.');
          stopAryaVoice();
          return;
        }
        appendAryaMsg('ai', "Couldn't access microphone. Check your browser settings.");
        return;
      }
    }
    if (!_mrCtx) {
      try { _mrCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    if (_mrCtx && _mrCtx.state === 'suspended') {
      try { await _mrCtx.resume(); } catch {}
    }
    if (_mrCtx && !_mrAnalyser && _mrCtx.state === 'running') {
      try {
        _mrAnalyser = _mrCtx.createAnalyser();
        _mrAnalyser.fftSize = 256;
        _mrSource = _mrCtx.createMediaStreamSource(_mrStream);
        _mrProcessor = _mrCtx.createScriptProcessor(4096, 1, 1);
        _mrProcessor.onaudioprocess = e => {
          if (!_mrActive || !_aryaListening) return;
          const input = e.inputBuffer.getChannelData(0);
          if (!input?.length) return;
          _pcmChunks.push(new Float32Array(input));
          _pcmLength += input.length;
        };
        _mrSource.connect(_mrAnalyser);
        _mrSource.connect(_mrProcessor);
        _mrProcessor.connect(_mrCtx.destination);
      } catch (e) {
        console.warn('[TradeBook Arya] analyser setup failed:', e);
        _mrAnalyser = null;
        _mrSource = null;
      }
    }
    _mrChunks = [];
    _resetPcmBuffer();
    _speechSeen = false;
    _silenceAt = null;
    if (_mrProcessor) {
      _mrRecorder = null;
      _mrActive = true;
      _watchSilence();
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      appendAryaMsg('ai', 'Voice capture is not supported in this browser. Please type below.');
      _showTextFallback(false);
      return;
    }
    _mrRecorder = new MediaRecorder(_mrStream, { mimeType: _MTYPE, audioBitsPerSecond: 128000 });
    _mrRecorder.ondataavailable = e => {
      if (!e.data || e.data.size === 0) return;
      _mrChunks.push(e.data);
      if (!_mrAnalyser || _mrCtx?.state !== 'running') {
        if (e.data.size > 600) {
          _speechSeen = true;
          _silenceAt = null;
          if (!_aryaSpeaking) showWave(true);
        } else if (_speechSeen) {
          if (!_silenceAt) _silenceAt = Date.now();
          if (Date.now() - _silenceAt > _SDELAY) _stopCapture();
        }
      }
    };
    _mrRecorder.onstop = _onCaptureDone;
    _mrRecorder.start(80);
    _mrActive = true;
    _watchSilence();
  }

  async function _onCaptureDone() {
    const pcmData = _takePcmBuffer();
    if (!_aryaListening || !_speechSeen || (!pcmData?.length && !_mrChunks.length)) {
      if (_aryaListening) setTimeout(_startCapture, 80);
      return;
    }
    const blob = (!pcmData?.length && _mrChunks.length)
      ? new Blob(_mrChunks, { type: _mrRecorder?.mimeType || _MTYPE })
      : null;
    setVoxStatus('UNDERSTANDING…', 'vox-think');
    let text = '';
    try {
      if (!_whisperOk) await _loadWhisper();
      if (_whisperFailed) return;
      if (_whisperOk && _whisper) {
        let res = null;
        if (pcmData?.length) {
          let prepared = _trimPcmSilence(pcmData);
          prepared = _downsamplePcm(prepared, _mrCtx?.sampleRate || 16000, 16000);
          if (!prepared?.length || prepared.length < 1600) {
            if (_aryaListening) { setVoxStatus('LISTENING', 'vox-listen'); setTimeout(_startCapture, 80); }
            return;
          }
          res = await _whisper({ data: prepared, sampling_rate: 16000 }, { language: 'english', task: 'transcribe', return_timestamps: false });
        } else if (blob) {
          let decCtx = _mrCtx;
          if (!decCtx || decCtx.state === 'closed') decCtx = new (window.AudioContext || window.webkitAudioContext)();
          const ab = await blob.arrayBuffer();
          const aud = await decCtx.decodeAudioData(ab);
          let prepared = _trimPcmSilence(aud.getChannelData(0));
          prepared = _downsamplePcm(prepared, aud.sampleRate, 16000);
          if (!prepared?.length || prepared.length < 1600) {
            if (_aryaListening) { setVoxStatus('LISTENING', 'vox-listen'); setTimeout(_startCapture, 80); }
            return;
          }
          res = await _whisper({ data: prepared, sampling_rate: 16000 }, { language: 'english', task: 'transcribe', return_timestamps: false });
        }
        text = (res.text || '').replace(/^\[.*?\]\s*/g, '').trim();
      }
    } catch (e) {
      console.warn('[TradeBook Arya] transcription error:', e);
      _transcribeFails++;
      if (_transcribeFails >= 3) {
        appendAryaMsg('ai', 'Voice recognition is unavailable right now. Type below and I will keep answering aloud.');
        _transcribeFails = 0;
        stopAryaVoice();
      } else if (_aryaListening) {
        setVoxStatus('LISTENING', 'vox-listen');
        setTimeout(_startCapture, 800);
      }
      return;
    }
    _transcribeFails = 0;
    if (text && text.length > 1 && !/^(\.{2,}|thank you\.?|thanks\.?|uh+\.?|um+\.?|hmm+\.?|okay\.?)$/i.test(text)) {
      if (_aryaSpeaking) {
        _synth.cancel();
        _aryaSpeaking = false;
      }
      if (_interimBub) {
        _interimBub.style.opacity = '1';
        _interimBub.innerHTML = formatAryaText(text);
        _interimBub = null;
      } else {
        appendAryaMsg('user', text);
      }
      if (_aryaBusy) _pendingMsg = text;
      else sendVoiceMessage(text);
    }
    if (_aryaListening) {
      setVoxStatus('LISTENING', 'vox-listen');
      setTimeout(_startCapture, 80);
    }
  }

  async function sendVoiceMessage(text) {
    if (_aryaBusy) return;
    text = normalizeAryaText(text);
    if (!text) return;
    _aryaBusy = true;
    renderTradebookMetrics();
    rememberAryaUser(text, buildTradebookState());
    setVoxStatus('THINKING…', 'vox-think');
    showAryaThinking();
    if (!_aryaOnline) {
      removeAryaThinking();
      const msg = "Ollama isn't running. Open a terminal and type ollama serve.";
      appendAryaMsg('ai', msg);
      speakArya(msg);
      _aryaBusy = false;
      return;
    }
    _aryaHistory.push({ role: 'user', content: text });
    if (_aryaHistory.length > 18) _aryaHistory = _aryaHistory.slice(-18);
    const messages = [{ role: 'system', content: buildAryaSystem(text) }, ..._aryaHistory];
    try {
      const res = await fetch(OLLAMA_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ARYA_MODEL,
          messages,
          stream: true,
          options: { num_ctx: 32768, num_predict: 400, temperature: 0.62, top_p: 0.9 }
        }),
        signal: AbortSignal.timeout(90000)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let full = '';
      let bubble = null;
      removeAryaThinking();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.done) break;
            const tok = d.message?.content || '';
            if (tok) {
              full += tok;
              if (!bubble) bubble = appendAryaMsg('ai', '');
              bubble.innerHTML = formatAryaText(full);
              document.getElementById('arya-body').scrollTop = document.getElementById('arya-body').scrollHeight;
            }
          } catch {}
        }
      }
      if (!bubble && full) appendAryaMsg('ai', full);
      if (full) {
        _aryaHistory.push({ role: 'assistant', content: full });
        if (_aryaHistory.length > 18) _aryaHistory = _aryaHistory.slice(-18);
        speakArya(full);
      }
    } catch (err) {
      removeAryaThinking();
      const msg = err.name === 'TimeoutError'
        ? "That's taking too long. Is Ollama still running?"
        : 'Lost connection to Ollama. Try restarting it.';
      appendAryaMsg('ai', msg);
      speakArya(msg);
    } finally {
      _aryaBusy = false;
      renderTradebookMetrics();
      if (_aryaListening && !_aryaSpeaking) setVoxStatus('LISTENING', 'vox-listen');
      if (_pendingMsg) {
        const m = _pendingMsg;
        _pendingMsg = '';
        sendVoiceMessage(m);
      }
    }
  }

  function _showTextFallback(isBrave) {
    const row = document.getElementById('arya-txt-row');
    const inp = document.getElementById('arya-txt');
    const btn = document.getElementById('arya-mic-btn');
    row.style.display = 'flex';
    btn.textContent = '🔄';
    btn.style.opacity = '1';
    btn.title = 'Tap to retry voice';
    inp.placeholder = isBrave
      ? 'Shields are blocking voice. Type here and Arya still speaks back…'
      : 'Type your message and Arya will still answer aloud…';
    setVoxStatus('CHAT MODE · ARYA SPEAKS ALOUD', 'vox-listen');
    setTimeout(() => inp.focus(), 120);
  }

  function _sendAryaText() {
    const inp = document.getElementById('arya-txt');
    if (!inp || !inp.value.trim()) return;
    const txt = inp.value.trim();
    inp.value = '';
    if (_isBrave) {
      _bvSendText(txt);
    } else {
      appendAryaMsg('user', txt);
      if (_aryaBusy) _pendingMsg = txt;
      else sendVoiceMessage(txt);
    }
    setTimeout(() => inp.focus(), 50);
  }

  function _startWSR() {
    if (!_aryaListening || _wsrActive || _aryaSpeaking || _aryaBusy) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    _wsr = new SR();
    _wsr.continuous = false;
    _wsr.interimResults = true;
    _wsr.lang = 'en-IN';
    _wsrActive = true;
    _wsr.onstart = () => { setVoxStatus('LISTENING', 'vox-listen'); };
    _wsr.onspeechstart = () => { showWave(true); };
    _wsr.onspeechend = () => { showWave(false); };
    _wsr.onresult = e => {
      const last = e.results[e.results.length - 1];
      const text = last[0].transcript.trim();
      if (!text) return;
      if (!_interimBub) _interimBub = appendAryaMsg('user', text + (last.isFinal ? '' : '…'));
      else _interimBub.innerHTML = formatAryaText(text + (last.isFinal ? '' : '…'));
      if (last.isFinal && text.length > 1) {
        if (_interimBub) {
          _interimBub.innerHTML = formatAryaText(text);
          _interimBub = null;
        }
        if (_aryaSpeaking) {
          _synth.cancel();
          _aryaSpeaking = false;
        }
        if (_aryaBusy) _pendingMsg = text;
        else sendVoiceMessage(text);
      }
    };
    _wsr.onerror = e => {
      _wsrActive = false;
      showWave(false);
      if (e.error === 'no-speech' || e.error === 'aborted') {
        if (_aryaListening && !_aryaSpeaking) setTimeout(_startWSR, 300);
      } else if (e.error === 'not-allowed') {
        appendAryaMsg('ai', 'Mic access denied. Allow microphone in browser settings.');
        stopAryaVoice();
      } else if (_aryaListening) {
        if (!_whisperOk && !_whisperBusy) _loadWhisper();
        _startCapture();
      }
    };
    _wsr.onend = () => {
      _wsrActive = false;
      showWave(false);
      if (_aryaListening && !_aryaSpeaking) setTimeout(_startWSR, 150);
    };
    try {
      _wsr.start();
    } catch {
      _wsrActive = false;
      if (!_whisperOk && !_whisperBusy) _loadWhisper();
      _startCapture();
    }
  }

  function greetingForTradebook() {
    const s = buildTradebookState();
    const first = (s.username || 'Trader').split(' ')[0] || 'Trader';
    if (!s.totalTrades) return `${first}, I’m here. We can build your trading discipline from day one together.`;
    if (s.revengeTrades > 2) return `${first}, I’m here. Your journal is hinting at revenge entries, so let’s slow the next decision down.`;
    if (s.todayPnl < 0) return `${first}, I’m here. Today looks a bit heavy, so tell me what’s bothering you most right now.`;
    return `${first}, I’m here. What do you want to work on in your trading right now?`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // BRAVE BROWSER — LOCAL BACKEND MODE
  // Connects to ws://127.0.0.1:8765 (voiceagent/agent.py)
  // STT : faster-whisper (CPU, local)  — no Google speech servers
  // TTS : Edge Neural MP3 streamed back as base64 audio_seq packets
  // Audio played via <Audio> element — no speechSynthesis quirks
  // Zero CDN imports, zero cloud dependencies
  // ═══════════════════════════════════════════════════════════════════

  const _BV_URL = 'ws://127.0.0.1:8765';

  // WS state
  let _bvWs       = null;
  let _bvReady    = false;
  let _bvRetries  = 0;

  // Session state
  let _bvListening    = false;
  let _bvBusy         = false;
  let _bvLastWasText  = false;

  // Mic capture state
  let _bvStream    = null;
  let _bvRecorder  = null;
  let _bvChunks    = [];
  let _bvRecActive = false;
  let _bvACtx      = null;
  let _bvAnalyser  = null;
  let _bvASource   = null;
  let _bvAProc     = null;
  let _bvSpoken    = false;
  let _bvSilAt     = null;
  let _bvResTimer  = null;
  let _bvTtsEndTime = 0; // timestamp when Edge TTS last finished — echo suppression

  // Audio playback state
  let _bvAudioEl  = null;
  let _bvSeqBuf   = {};
  let _bvSeqNext  = 0;
  let _bvSeqTotal = -1;
  let _bvPlaying  = false;

  function _bvSetOnline(model) {
    const dot = document.getElementById('arya-dot');
    const lbl = document.getElementById('arya-status-txt');
    const msg = document.getElementById('arya-offline-msg');
    if (dot) dot.className = 'arya-tradebook-dot';
    if (lbl) lbl.textContent = 'Local AI · ' + ((model || '').split(':')[0] || 'Ready');
    if (msg) msg.classList.remove('show');
  }

  function _bvSetOffline() {
    const dot = document.getElementById('arya-dot');
    const lbl = document.getElementById('arya-status-txt');
    const msg = document.getElementById('arya-offline-msg');
    if (dot) dot.className = 'arya-tradebook-dot off';
    if (lbl) lbl.textContent = 'Backend offline';
    if (msg) msg.classList.add('show');

    // Probe Ollama so text chat works as fallback even when WS backend is down.
    // In Brave, checkAryaHealth() is normally skipped, so _aryaOnline stays false
    // and sendVoiceMessage() refuses to fire — this probe fixes that.
    fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2500) })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        _aryaOnline = true;
        const models = (data.models || []).map(m => m.name);
        if (models.length) {
          const preferred = ['qwen3:14b','qwen3','qwen2.5:14b','qwen2.5','llama3.1','llama3.2','llama3','mistral','phi3','gemma2','gemma'];
          const pick = preferred.find(p => models.find(m => m.startsWith(p)));
          const found = pick ? models.find(m => m.startsWith(pick)) : models[0];
          if (found) ARYA_MODEL = found;
        }
        const lbl2 = document.getElementById('arya-status-txt');
        if (lbl2) lbl2.textContent = 'Text only · ' + ARYA_MODEL.split(':')[0];
        const msg2 = document.getElementById('arya-offline-msg');
        if (msg2) msg2.innerHTML = 'Voice backend offline — voice needs <b>voiceagent/run.sh</b>. <b>Text chat works</b> — type below ↓';
      })
      .catch(() => {
        _aryaOnline = false;
        const msg2 = document.getElementById('arya-offline-msg');
        if (msg2) msg2.innerHTML = 'Backend offline. Start voice with <b>voiceagent/run.sh</b>, or text with <b>ollama serve</b>.';
      });
  }

  // Sends the full TradeBook journal context to the WS backend so every
  // response is grounded in all trades, breakdowns, and rules — no user
  // prompting needed. Called on connection and at each voice-session start.
  function _bvSendContext() {
    if (!_bvWs || _bvWs.readyState !== WebSocket.OPEN) return;
    const s = buildTradebookState();
    const settings = getSettingsSafe();
    const grossW = s.trades.filter(t => tradeNet(t) > 0).reduce((a, t) => a + tradeNet(t), 0);
    const grossL = Math.abs(s.trades.filter(t => tradeNet(t) < 0).reduce((a, t) => a + tradeNet(t), 0));
    const pf = grossL > 0 ? grossW / grossL : grossW > 0 ? 999 : 0;

    // Compute best/worst symbol for the summary keys agent.py already renders
    const bySym = {};
    for (const t of s.trades) {
      const k = (t.symbol || 'Unknown').trim();
      if (!bySym[k]) bySym[k] = { pnl: 0, count: 0, wins: 0 };
      bySym[k].pnl += tradeNet(t);
      bySym[k].count++;
      if (tradeNet(t) > 0) bySym[k].wins++;
    }
    const symArr  = Object.entries(bySym);
    const bestSym = symArr.sort((a, b) => b[1].pnl - a[1].pnl)[0];
    const wrstSym = symArr.sort((a, b) => a[1].pnl - b[1].pnl)[0];

    // streak
    let strCnt = 0, strType = '';
    const sorted = s.trades.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    for (const t of sorted) {
      const n = tradeNet(t);
      const k = n > 0 ? 'win' : n < 0 ? 'loss' : null;
      if (!k) break;
      if (!strType) { strType = k; strCnt = 1; }
      else if (k === strType) strCnt++;
      else break;
    }

    const payload = {
      type: 'user_context',
      sync_phase: 'full',
      page_module: 'trade_journal',
      page: { module: 'trade_journal', title: 'TradeBook Pro — Trade Journal' },
      identity: { name: s.username },
      trade_journal: {
        total_trades:   s.totalTrades,
        total_pnl:      s.totalNet,
        win_rate:       s.winRate,
        avg_win:        s.avgWin,
        avg_loss:       -s.avgLoss,
        profit_factor:  pf,
        capital:        parseFloat(settings.capital) || 0,
        weekly_target:  parseFloat(settings.weeklyTarget) || 0,
        best_symbol:    bestSym ? { symbol: bestSym[0], pnl: bestSym[1].pnl } : null,
        worst_symbol:   wrstSym ? { symbol: wrstSym[0], pnl: wrstSym[1].pnl } : null,
        current_streak: `${strCnt} ${strType}`,
        recent_trades:  s.trades.slice(-5).reverse().map(t => ({
          symbol: t.symbol, type: t.direction, net: tradeNet(t), date: t.date
        })),
        // Pre-formatted full context block — agent.py injects this verbatim into the
        // system prompt so Arya knows every trade detail without the user repeating it.
        full_context: (()=>{ try { return buildFullTradeContext(); } catch(e) { return '(context build error: ' + String(e) + ')'; } })()
      }
    };

    try { _bvWs.send(JSON.stringify(payload)); } catch {}
  }

  function _bvConnect() {
    if (_bvWs && (_bvWs.readyState === WebSocket.OPEN || _bvWs.readyState === WebSocket.CONNECTING)) return;
    try { _bvWs = new WebSocket(_BV_URL); } catch { _bvSetOffline(); return; }
    _bvWs.onopen = () => {
      _bvReady   = true;
      _bvRetries = 0;
      setVoxStatus('READY', 'vox-listen');
      // Push full trade context to backend immediately on connect
      setTimeout(_bvSendContext, 200);
    };
    _bvWs.onmessage = e => { try { _bvMsg(JSON.parse(e.data)); } catch {} };
    _bvWs.onerror = () => {};
    _bvWs.onclose = () => {
      _bvReady = false;
      _bvSetOffline();
      if (_bvListening && _bvRetries < 5) {
        _bvRetries++;
        setTimeout(_bvConnect, 2000 * _bvRetries);
      }
    };
  }

  function _bvMsg(msg) {
    switch (msg.type) {

      case 'ready':
        _bvSetOnline(msg.model);
        break;

      case 'state':
        if (msg.state === 'thinking') {
          _bvBusy = true;
          showAryaThinking();
          setVoxStatus('THINKING…', 'vox-think');
          showWave(false);
        } else if (msg.state === 'transcribing') {
          setVoxStatus('UNDERSTANDING…', 'vox-think');
          showWave(false);
        } else if (msg.state === 'speaking') {
          // _bvPlaying is controlled by _bvPlayMp3/_bvAllDone — don't set it here.
          // Backend sends 'speaking' AFTER all audio_seq are gathered, which can be
          // AFTER the last chunk already finished playing, causing a permanent mic block.
          setVoxStatus('ARYA IS SPEAKING', 'vox-speak');
          showWave(true);
          const btn = document.getElementById('arya-mic-btn');
          if (btn) { btn.classList.remove('listening'); btn.classList.add('speaking'); btn.textContent = '🔊'; }
        } else if (msg.state === 'idle') {
          _bvBusy = false;
          // Edge case: if _bvAllDone fired while _bvBusy was still true it
          // skipped _bvResume — kick it now so the mic actually reopens.
          if (_bvListening && !_bvPlaying && !_bvRecActive) _bvResume(1400);
        }
        break;

      case 'pipeline_start':
        _bvBusy = true;
        _bvStopCap();
        break;

      case 'user_transcript':
        removeAryaThinking();
        if (!_bvLastWasText && msg.text) appendAryaMsg('user', msg.text);
        _bvLastWasText = false;
        break;

      case 'token': {
        let bub = document.getElementById('_bvBub');
        if (!bub) {
          removeAryaThinking();
          const body = document.getElementById('arya-body');
          if (body) {
            const row = document.createElement('div');
            row.className = 'arya-tradebook-msgrow ai';
            row.innerHTML = '<div class="arya-tradebook-avatar">🧠</div><div id="_bvBub" class="arya-tradebook-bubble"></div>';
            body.appendChild(row);
            body.scrollTop = body.scrollHeight;
            bub = document.getElementById('_bvBub');
          }
        }
        if (bub) {
          bub._raw = (bub._raw || '') + msg.text;
          bub.innerHTML = formatAryaText(bub._raw);
          const body = document.getElementById('arya-body');
          if (body) body.scrollTop = body.scrollHeight;
        }
        break;
      }

      case 'reply_done': {
        const bub = document.getElementById('_bvBub');
        if (bub) { bub.removeAttribute('id'); delete bub._raw; }
        break;
      }

      case 'audio_seq':
        _bvSeqBuf[msg.seq] = msg.data;
        _bvDrain();
        break;

      case 'audio_seq_done':
        _bvSeqTotal = msg.total || 0;
        _bvDrain();
        break;

      case 'tts_fallback':
        if (msg.text) speakArya(msg.text);
        break;

      case 'status':
        removeAryaThinking();
        if (msg.text) appendAryaMsg('ai', msg.text);
        break;
    }
  }

  function _bvDrain() {
    if (_bvAudioEl) return;
    if (_bvSeqBuf[_bvSeqNext] !== undefined) {
      const b64 = _bvSeqBuf[_bvSeqNext];
      delete _bvSeqBuf[_bvSeqNext];
      _bvSeqNext++;
      _bvPlayMp3(b64);
    } else if (_bvSeqTotal >= 0 && _bvSeqNext >= _bvSeqTotal) {
      _bvAllDone();
    }
  }

  async function _bvPlayMp3(b64) {
    // Mic MUST be off before any audio plays — stop capture immediately
    _bvPlaying = true;
    _bvStopCap();
    try {
      const raw = atob(b64);
      const buf = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      const audio = new Audio(url);
      _bvAudioEl = audio;
      const done = () => { URL.revokeObjectURL(url); _bvAudioEl = null; _bvDrain(); };
      audio.onended = done;
      audio.onerror = done;
      await audio.play();
    } catch (e) {
      console.warn('[Arya Brave] MP3 play error:', e);
      _bvAudioEl = null;
      _bvDrain();
    }
  }

  function _bvAllDone() {
    _bvPlaying    = false;
    _bvSeqNext    = 0;
    _bvSeqTotal   = -1;
    _bvSeqBuf     = {};
    _bvTtsEndTime = Date.now(); // stamp for echo suppression
    showWave(false);
    const btn = document.getElementById('arya-mic-btn');
    if (btn) {
      btn.classList.remove('speaking');
      btn.textContent = '🎙';
      if (_bvListening) { btn.classList.add('listening'); setVoxStatus('LISTENING', 'vox-listen'); }
      else setVoxStatus('TAP TO RESUME');
    }
    if (_bvListening && !_bvBusy) _bvResume(1400); // wait 1.4s before reopening mic
  }

  function _bvResume(delay) {
    if (_bvResTimer) { clearTimeout(_bvResTimer); _bvResTimer = null; }
    if (!_bvListening) return;
    _bvResTimer = setTimeout(() => {
      _bvResTimer = null;
      if (_bvListening && !_bvBusy && !_bvPlaying) _bvStartCap();
    }, delay);
  }

  async function _bvStartCap() {
    if (_bvRecActive || !_bvListening || _bvPlaying || _bvBusy) return;
    if (!_bvStream) {
      try {
        _bvStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: { ideal: 1 } }
        });
      } catch (e) {
        if (e.name === 'NotAllowedError') {
          appendAryaMsg('ai', 'Mic access denied. Allow microphone in Brave settings, then tap the mic.');
          _bvStopVoice();
        } else {
          appendAryaMsg('ai', "Couldn't access microphone. Check your browser settings.");
        }
        return;
      }
    }
    if (!_bvACtx) { try { _bvACtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    if (_bvACtx?.state === 'suspended') { try { await _bvACtx.resume(); } catch {} }
    if (_bvACtx && !_bvAnalyser && _bvACtx.state === 'running') {
      try {
        _bvAnalyser = _bvACtx.createAnalyser();
        _bvAnalyser.fftSize = 256;
        _bvASource = _bvACtx.createMediaStreamSource(_bvStream);
        _bvAProc   = _bvACtx.createScriptProcessor(4096, 1, 1);
        _bvAProc.onaudioprocess = () => {};
        _bvASource.connect(_bvAnalyser);
        _bvASource.connect(_bvAProc);
        _bvAProc.connect(_bvACtx.destination);
      } catch {}
    }
    _bvChunks  = [];
    _bvSpoken  = false;
    _bvSilAt   = null;
    const mtype = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
      ? 'audio/webm;codecs=opus'
      : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm'))
      ? 'audio/webm' : '';
    try {
      _bvRecorder = new MediaRecorder(_bvStream, mtype ? { mimeType: mtype } : {});
    } catch {
      appendAryaMsg('ai', 'MediaRecorder unavailable. Try refreshing the page.');
      return;
    }
    _bvRecorder.ondataavailable = e => { if (e.data?.size > 0) _bvChunks.push(e.data); };
    _bvRecorder.onstop = _bvCapDone;
    _bvRecorder.onerror = () => { _bvRecActive = false; if (_bvListening && !_bvBusy) setTimeout(_bvStartCap, 800); };
    _bvRecorder.start(80);
    _bvRecActive = true;
    _bvWatchSil();
  }

  function _bvWatchSil() {
    if (!_bvRecActive || !_bvListening) return;
    if (!_bvAnalyser || !_bvACtx || _bvACtx.state !== 'running') {
      if (_bvACtx?.state === 'suspended') _bvACtx.resume().catch(() => {});
      if (_bvRecActive) setTimeout(_bvWatchSil, 80);
      return;
    }
    const buf = new Uint8Array(_bvAnalyser.frequencyBinCount);
    _bvAnalyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    const _bvEchoGuard = Date.now() - _bvTtsEndTime < 2800;
    const _bvThresh = _bvEchoGuard ? _STHRESH * 5 : _STHRESH;
    if (rms > _bvThresh) {
      _bvSpoken = true;
      _bvSilAt  = null;
      showWave(true);
    } else if (_bvSpoken) {
      if (!_bvSilAt) _bvSilAt = Date.now();
      if (Date.now() - _bvSilAt > _SDELAY) { _bvStopCap(); return; }
    }
    if (_bvRecActive) setTimeout(_bvWatchSil, 80);
  }

  function _bvStopCap() {
    if (!_bvRecActive) return;
    showWave(false);
    _bvRecActive = false;
    if (_bvRecorder && _bvRecorder.state !== 'inactive') { try { _bvRecorder.stop(); return; } catch {} }
    _bvCapDone();
  }

  async function _bvCapDone() {
    if (!_bvListening || !_bvSpoken || !_bvChunks.length) {
      if (_bvListening && !_bvBusy && !_bvPlaying) setTimeout(_bvStartCap, 80);
      return;
    }
    if (!_bvReady || !_bvWs || _bvWs.readyState !== WebSocket.OPEN) {
      appendAryaMsg('ai', 'Backend not connected. Start voiceagent/run.sh and tap the mic again.');
      _bvStopVoice();
      return;
    }
    setVoxStatus('UNDERSTANDING…', 'vox-think');
    showWave(false);
    try {
      const mtype = _bvRecorder?.mimeType || 'audio/webm;codecs=opus';
      const blob  = new Blob(_bvChunks, { type: mtype });
      const ab    = await blob.arrayBuffer();
      _bvLastWasText = false;
      _bvWs.send(JSON.stringify({ type: 'audio_chunk', data: Array.from(new Uint8Array(ab)) }));
    } catch (e) {
      console.warn('[Arya Brave] audio send error:', e);
      setVoxStatus('LISTENING', 'vox-listen');
      if (_bvListening && !_bvBusy) setTimeout(_bvStartCap, 800);
    }
  }

  async function _bvStartVoice() {
    _bvListening = true;
    const btn = document.getElementById('arya-mic-btn');
    if (btn) { btn.textContent = '🎙'; btn.style.opacity = '1'; btn.classList.add('listening'); }
    setVoxStatus('LISTENING', 'vox-listen');
    renderTradebookMetrics();
    // Refresh full trade context on every session start so Arya has latest data
    _bvSendContext();
    if (!document.getElementById('arya-body')?.querySelector('.arya-tradebook-msgrow.ai')) {
      const greet = greetingForTradebook();
      appendAryaMsg('ai', greet);
      // Stamp echo guard BEFORE greeting plays so the Brave silence watcher
      // treats the first ~4s of audio as off-limits for speech detection.
      _bvTtsEndTime = Date.now();
      // Speak greeting, then open mic only after TTS finishes + echo decays
      const utt = new SpeechSynthesisUtterance(greet.replace(/\*\*(.+?)\*\*/g,'$1').replace(/<[^>]+>/g,''));
      utt.lang = 'en-US'; utt.rate = 1.04;
      const openMicAfter = () => { _bvTtsEndTime = Date.now(); _bvResume(1400); };
      utt.onend = openMicAfter;
      utt.onerror = openMicAfter;
      // Safety fallback: open mic after 6s even if TTS events never fire
      const safeTimer = setTimeout(openMicAfter, 6000);
      utt.onend = () => { clearTimeout(safeTimer); openMicAfter(); };
      _synth.speak(utt);
      // Do NOT call _bvStartCap() here — mic opens via openMicAfter callback
      return;
    }
    await _bvStartCap();
  }

  function _bvStopVoice() {
    if (_bvResTimer) { clearTimeout(_bvResTimer); _bvResTimer = null; }
    _bvListening = false;
    _bvBusy      = false;
    _bvRecActive = false;
    _bvSpoken    = false;
    if (_bvAudioEl) { try { _bvAudioEl.pause(); } catch {} _bvAudioEl = null; }
    _bvPlaying  = false;
    _bvSeqBuf   = {};
    _bvSeqNext  = 0;
    _bvSeqTotal = -1;
    showWave(false);
    if (_bvRecorder && _bvRecorder.state !== 'inactive') { try { _bvRecorder.stop(); } catch {} }
    if (_bvAProc)   { _bvAProc.onaudioprocess = null; try { _bvAProc.disconnect();   } catch {} _bvAProc   = null; }
    if (_bvASource) { try { _bvASource.disconnect(); }                                 catch {} _bvASource = null; }
    _bvAnalyser = null;
    const btn = document.getElementById('arya-mic-btn');
    if (btn) { btn.classList.remove('listening', 'speaking'); btn.textContent = '🎙'; }
    setVoxStatus('TAP TO RESUME');
  }

  function _bvSendText(text) {
    text = normalizeAryaText(text);
    if (!text) return;
    appendAryaMsg('user', text);
    if (_bvWs && _bvWs.readyState === WebSocket.OPEN) {
      _bvLastWasText = true;
      _bvWs.send(JSON.stringify({ type: 'text_input', text }));
    } else {
      // WS not available — fall back to direct Ollama pipeline
      if (_aryaBusy) _pendingMsg = text;
      else sendVoiceMessage(text);
    }
  }

  // ═══════════════════════════════════════════════════════════════════

  function toggleAryaVoice() {
    if (_isBrave) {
      if (_bvListening) _bvStopVoice();
      else _bvStartVoice();
    } else {
      if (_aryaListening) stopAryaVoice();
      else startAryaVoice();
    }
  }

  async function startAryaVoice() {
    document.getElementById('arya-mic-btn').textContent = '🎙';
    document.getElementById('arya-mic-btn').style.opacity = '1';
    _aryaListening = true;
    document.getElementById('arya-mic-btn').classList.add('listening');
    setVoxStatus('LISTENING', 'vox-listen');
    renderTradebookMetrics();
    if (!document.getElementById('arya-body').querySelector('.arya-tradebook-msgrow.ai')) {
      const greet = greetingForTradebook();
      appendAryaMsg('ai', greet);
      setTimeout(() => speakArya(greet), 280);
    }
    if (_WSR_OK && !_isBrave) _startWSR();
    else {
      if (!_whisperOk && !_whisperBusy) _loadWhisper();
      _startCapture();
    }
  }

  function stopAryaVoice() {
    _clearResumeVoiceTimer();
    _aryaListening = false;
    _mrActive = false;
    _pendingMsg = '';
    _synth.cancel();
    _aryaSpeaking = false;
    showWave(false);
    if (_wsr) {
      try { _wsr.abort(); } catch {}
      _wsr = null;
      _wsrActive = false;
    }
    if (_mrRecorder && _mrRecorder.state !== 'inactive') {
      try { _mrRecorder.stop(); } catch {}
    }
    if (_mrProcessor) {
      _mrProcessor.onaudioprocess = null;
      try { _mrProcessor.disconnect(); } catch {}
      _mrProcessor = null;
    }
    if (_mrSource) {
      try { _mrSource.disconnect(); } catch {}
      _mrSource = null;
    }
    _mrAnalyser = null;
    _resetPcmBuffer();
    const btn = document.getElementById('arya-mic-btn');
    btn.classList.remove('listening', 'speaking');
    btn.textContent = '🎙';
    setVoxStatus('TAP TO RESUME');
  }

  function openAryaPanel() {
    injectWidget();
    renderTradebookMetrics();
    document.getElementById('arya-tradebook-panel').classList.add('open');
    document.getElementById('arya-tradebook-panel').setAttribute('aria-hidden', 'false');
    document.getElementById('arya-tradebook-overlay').classList.add('on');
    if (_isBrave) {
      _bvConnect();
      if (!_bvACtx) {
        try { _bvACtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
      } else if (_bvACtx.state === 'suspended') {
        _bvACtx.resume().catch(() => {});
      }
      setTimeout(() => { if (!_bvListening) _bvStartVoice(); }, 320);
    } else {
      checkAryaHealth();
      if (!_mrCtx) {
        try { _mrCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
      } else if (_mrCtx.state === 'suspended') {
        _mrCtx.resume().catch(() => {});
      }
      setTimeout(() => { if (!_aryaListening) startAryaVoice(); }, 320);
    }
  }

  function closeAryaPanel() {
    if (_isBrave) _bvStopVoice();
    else stopAryaVoice();
    document.getElementById('arya-tradebook-panel')?.classList.remove('open');
    document.getElementById('arya-tradebook-panel')?.setAttribute('aria-hidden', 'true');
    document.getElementById('arya-tradebook-overlay')?.classList.remove('on');
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectWidget();
    renderTradebookMetrics();
    if (!_isBrave) checkAryaHealth();
  });

  document.addEventListener('tb:navigate', () => {
    renderTradebookMetrics();
  });

  window.openAryaPanel = openAryaPanel;
  window.closeAryaPanel = closeAryaPanel;
  window.toggleAryaVoice = toggleAryaVoice;
})();
