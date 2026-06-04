/**
 * arya-memory.js — FIN·OS Episodic + Semantic + Emotional Memory  v1.0
 * ──────────────────────────────────────────────────────────────────────
 * Gives Arya true long-term memory across sessions.
 *
 * Three memory types:
 *   episodic  — "Last Tuesday you asked about index funds"
 *   semantic  — "You always ask about tax-saving in March"
 *   emotional — "You were stressed when talking about your EMI"
 *
 * Storage: Supabase agent_memories.episodes / semantic_facts / emotional_states
 * Fallback: localStorage (for offline / logged-out users)
 */
(function (global) {
  'use strict';

  const SB_URL = (window.FINOS_SB?.url) || 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SB_KEY = window.FINOS_SB?.key || '';

  const LOCAL_KEY_PREFIX = 'finos_arya_memory_v2';
  const MAX_EPISODES = 200;
  const MAX_EMOTIONAL = 60;

  /* ══════════════════════════════════════════════════════════════════
     MEMORY ENGINE
  ══════════════════════════════════════════════════════════════════ */
  class MemoryEngine {
    constructor() {
      this.userId    = null;
      this.episodes  = [];        // [{ts, topic, summary, tags, sentiment, page}]
      this.semantic  = {};        // {key: {value, count, updated}}
      this.emotional = [];        // [{ts, trigger, state, snippet}]
      this.loaded    = false;
      this._saveTimer = null;
      this._saving   = false;    // prevent concurrent saves
    }

    get _localKey() {
      // Per-user key to prevent data collision across accounts on shared devices
      return this.userId ? `${LOCAL_KEY_PREFIX}_${this.userId}` : LOCAL_KEY_PREFIX;
    }

    /* ── Init ─────────────────────────────────────────────────────── */
    async init(userId) {
      this.userId = userId;
      await this._load();
      this.loaded = true;
      console.debug('[AryaMemory] loaded —', this.episodes.length, 'episodes');
    }

    /* ── Record an episode ────────────────────────────────────────── */
    async record(topic, summary, tags = [], sentiment = 'neutral') {
      this.episodes.unshift({
        ts: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        topic,
        summary: summary.slice(0, 200),
        tags,
        sentiment,
        page: window.location.pathname.split('/').pop().replace('.html', '')
      });
      if (this.episodes.length > MAX_EPISODES) this.episodes.length = MAX_EPISODES;
      this._debounceSave();
    }

    /* ── Record a semantic fact (updates count each time seen) ────── */
    async learnFact(key, value) {
      const existing = this.semantic[key];
      this.semantic[key] = {
        value,
        count: (existing?.count || 0) + 1,
        updated: new Date().toISOString()
      };
      this._debounceSave();
    }

    /* ── Record emotional state ───────────────────────────────────── */
    async recordEmotion(trigger, state, snippet = '') {
      // states: stressed · excited · confused · confident · anxious · frustrated
      this.emotional.unshift({ ts: Date.now(), trigger, state, snippet: snippet.slice(0, 120) });
      if (this.emotional.length > MAX_EMOTIONAL) this.emotional.length = MAX_EMOTIONAL;
      this._debounceSave();
    }

    /* ── Auto-detect emotion from Arya's response text ───────────── */
    detectAndRecordEmotion(userMessage, topic) {
      const msg = (userMessage || '').toLowerCase();
      let state = null;
      if (/panic|scared|worried|stressed|tension|dar|takleef|mushkil/.test(msg)) state = 'stressed';
      else if (/confused|samajh|kyun|what is|explain|matlab/.test(msg)) state = 'confused';
      else if (/excited|great|awesome|badiya|mast|profit|gain/.test(msg)) state = 'excited';
      else if (/angry|frustrated|loss|nuksaan|baad|wrong/.test(msg)) state = 'frustrated';
      else if (/will it|should i|safe|risky|guarantee/.test(msg)) state = 'anxious';
      if (state) this.recordEmotion(topic, state, userMessage.slice(0, 120));
    }

    /* ── Get relevant episodes for a topic ───────────────────────── */
    getRelevant(topic, limit = 4) {
      return this.episodes
        .map(ep => ({ ...ep, score: this._score(ep, topic) }))
        .filter(ep => ep.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    /* ── Get dominant emotional pattern for topic ─────────────────── */
    getEmotion(topic) {
      const related = this.emotional
        .filter(e => e.trigger.toLowerCase().includes(topic.toLowerCase()))
        .slice(0, 10);
      if (!related.length) return null;
      const counts = {};
      related.forEach(e => counts[e.state] = (counts[e.state] || 0) + 1);
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    /* ── Get semantic fact ────────────────────────────────────────── */
    getFact(key) { return this.semantic[key]?.value || null; }

    /* ── Build memory block for LLM prompt ───────────────────────── */
    buildBlock(topic) {
      const lines = [];

      const eps = this.getRelevant(topic, 3);
      if (eps.length) {
        lines.push('MEMORY:');
        eps.forEach(ep => {
          const d = Math.floor((Date.now() - ep.ts) / 86400000);
          const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
          lines.push(`  [${when}/${ep.topic}] ${ep.summary}`);
        });
      }

      const facts = Object.entries(this.semantic).slice(0, 4);
      if (facts.length) {
        lines.push('KNOWN:');
        facts.forEach(([k, v]) => lines.push(`  ${k}: ${v.value} (seen ${v.count}x)`));
      }

      const emo = this.getEmotion(topic);
      if (emo) {
        const tone = {
          stressed:    'User tends to feel stressed on this topic — be extra reassuring, keep it simple.',
          confused:    'User often confused here — use analogies, avoid jargon.',
          excited:     'User gets excited about this — match their energy!',
          frustrated:  'Past frustration here — acknowledge it, stay solution-focused.',
          anxious:     'User anxious about this — give concrete numbers, not vague reassurance.',
          confident:   'User confident here — can go deeper without hand-holding.'
        }[emo] || '';
        if (tone) lines.push(`TONE: ${tone}`);
      }

      return lines.length ? lines.join('\n') : '';
    }

    /* ── Recent page visits for proactive suggestions ─────────────── */
    getPageVisits(page, minCount = 3) {
      const count = this.episodes.filter(ep => ep.page === page).length;
      return count >= minCount ? count : 0;
    }

    /* ── Private: relevance scoring ───────────────────────────────── */
    _score(ep, topic) {
      let s = 0;
      const t = topic.toLowerCase();
      if (ep.topic.toLowerCase().includes(t)) s += 30;
      if (ep.page.toLowerCase().includes(t)) s += 15;
      (ep.tags || []).forEach(tag => { if (tag.toLowerCase().includes(t)) s += 10; });
      if (ep.summary.toLowerCase().includes(t)) s += 5;
      const daysSince = (Date.now() - ep.ts) / 86400000;
      return s * Math.exp(-daysSince / 45); // 45-day half-life
    }

    /* ── Debounced save ───────────────────────────────────────────── */
    _debounceSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._save(), 2000);
    }

    /* ── Persist to localStorage + Supabase ───────────────────────── */
    async _save() {
      if (this._saving) return;
      this._saving = true;
      const payload = {
        episodes:  this.episodes.slice(0, MAX_EPISODES),
        semantic:  this.semantic,
        emotional: this.emotional.slice(0, MAX_EMOTIONAL)
      };
      try { localStorage.setItem(this._localKey, JSON.stringify(payload)); } catch (_) {}
      // Then sync to Supabase if logged in
      if (!this.userId || !SB_KEY) return;
      try {
        await fetch(`${SB_URL}/rest/v1/agent_memories?user_id=eq.${this.userId}`, {
          method: 'PATCH',
          headers: {
            apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            episodes:         this.episodes.slice(0, 100),
            semantic_facts:   this.semantic,
            emotional_states: this.emotional
          })
        });
      } catch (_) {}
      finally { this._saving = false; }
    }

    /* ── Load from Supabase, fallback to localStorage ─────────────── */
    async _load() {
      // Try Supabase first
      if (this.userId && SB_KEY) {
        try {
          const r = await fetch(
            `${SB_URL}/rest/v1/agent_memories?user_id=eq.${this.userId}&select=episodes,semantic_facts,emotional_states`,
            { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
          );
          const data = await r.json();
          if (data?.[0]) {
            this.episodes  = (data[0].episodes         || []).slice(0, MAX_EPISODES);
            this.semantic  = data[0].semantic_facts   || {};
            this.emotional = (data[0].emotional_states || []).slice(0, MAX_EMOTIONAL);
            return;
          }
        } catch (_) {}
      }
      // Fallback to localStorage
      try {
        const local = JSON.parse(localStorage.getItem(this._localKey) || 'null');
        if (local) {
          this.episodes  = local.episodes  || [];
          this.semantic  = local.semantic  || {};
          this.emotional = local.emotional || [];
        }
      } catch (_) {}
    }
  }

  /* ── Singleton ──────────────────────────────────────────────────── */
  const Memory = new MemoryEngine();
  global.AryaMemory = Memory;

  /* ── Auto-init when user is known ───────────────────────────────── */
  window.addEventListener('finos-context-ready', async e => {
    if (e.detail?.phase !== 'full') return;
    const uid = window.FINOS_USER_CONTEXT?._user_id;
    if (uid && !Memory.loaded) {
      await Memory.init(uid);

      // Proactive suggestion: if user visited a page 3+ times, suggest action
      const suggestions = [
        { page: 'learn-mf',    msg: 'Tune Mutual Funds 3+ baar padha — SIP set up karte hain?', link: '../calculators/sip.html' },
        { page: 'learn-fno',   msg: 'F&O 3 baar explore kiya — "Am I ready for F&O?" quiz lo?', link: '../html/dna.html' },
        { page: 'calculators', msg: 'Tune 3+ calculators use kiye — ek consolidated financial plan banate hain?', link: '../html/diagnostics.html' }
      ];
      for (const s of suggestions) {
        if (Memory.getPageVisits(s.page, 3)) {
          document.dispatchEvent(new CustomEvent('arya-memory-suggestion', { detail: s }));
          break;
        }
      }
    }
  });

  /* ── Record current page visit ───────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    const page = window.location.pathname.split('/').pop().replace('.html', '') || 'home';
    const topic = page.replace(/-/g, ' ').replace('learn ', '');
    // Record after context loads (may not have userId yet)
    setTimeout(async () => {
      if (!Memory.loaded) return;
      await Memory.record(
        topic,
        `Visited ${page} page`,
        [topic],
        'neutral'
      );
      // Learn semantic facts from repeated visits
      const visits = Memory.episodes.filter(ep => ep.page === page).length;
      if (visits >= 2) {
        await Memory.learnFact(`interested_in_${topic.replace(/\s+/g, '_')}`, `true (${visits} visits)`);
      }
    }, 5000);
  });

}(window));
