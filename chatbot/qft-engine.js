/**
 * @fileoverview FIN-OS QFT Engine v5.0 — GOD MODE
 * @architecture
 *   Intent Classification → Context Extraction → Backend Router →
 *   Stream Rendering + Tool Panel (SIP / EMI / Portfolio / Ratios)
 *
 * @backend  brain.py v2  (FastAPI + Ollama)
 * @deps     marked.js, DOMPurify  (loaded before this file)
 *
 * NEW in v5:
 *  • Routes to brain.py v2 backend (session memory, SSE stream)
 *  • Tool Panel: SIP Calculator, EMI Danger Meter, Financial Ratios,
 *    Portfolio Analyser — all live-wired to /api/tools/* + /api/portfolio/analyse
 *  • Backend health check with live status badge
 *  • Session persistence across page reloads (sessionStorage)
 *  • Keyboard shortcut map (Cmd/Ctrl+K toggle, Esc close, / focus)
 *  • Favourites: star any AI message → saved to localStorage
 *  • Export conversation as .md or .txt
 *  • Dark/Light theme toggle
 *  • Sound feedback (Web Audio API — no external asset needed)
 *  • Fully accessible: ARIA roles, focus management, reduced-motion respect
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const QFT_CONFIG = {
    API_BASE:          'http://127.0.0.1:8000',   // brain.py v2
    OLLAMA_URL:        'http://127.0.0.1:11434/api/chat', // fallback direct
    USE_BACKEND:       true,   // set false to hit Ollama directly (v4 compat)
    MODEL:             'llama3.1',
    MEMORY_LIMIT:      20,
    TEMPERATURE:       0.15,
    NUM_CTX:           8192,
    STREAM_DEBOUNCE:   16,
    MAX_CONTEXT_CHARS: 400,
    HEALTH_POLL_MS:    30_000,
    SESSION_KEY:       'qft_session_id',
    FAV_KEY:           'qft_favourites',
    THEME_KEY:         'qft_theme',
    SOUND_KEY:         'qft_sound',
};

// ─── INTENT CLASSIFIER ────────────────────────────────────────────────────────
const INTENT_PATTERNS = {
    CALCULATION: /(\d[\d,.]*\s*(lakh|cr|k|rs|₹|%|emi|sip|salary|income|loan|rent|invest|return|profit|loss|tax|ctc|inhand|savings|corpus|fd|rd|ppf|nps|epf))/i,
    COMPARISON:  /(vs|versus|better|compare|difference|should i|which one|option)/i,
    MISTAKE:     /(mistake|wrong|bad|trap|scam|avoid|don't|dont|never|worst|loss|regret)/i,
    EMERGENCY:   /(urgent|emergency|job loss|fired|laid off|debt|broke|bankrupt|crisis)/i,
    BEGINNER:    /(start|begin|new|first time|don't know|confused|lost|what is|explain|how does)/i,
    PSYCHOLOGY:  /(feel|emotion|fear|fomo|pressure|society|parents|wife|husband|friend|sharmaji|jealous|anxious|stress)/i,
    GOAL:        /(goal|dream|target|retire|house|car|wedding|abroad|freedom|fire|financial independence)/i,
    AUDIT:       /(portfolio|review|check|audit|look at|what do you think|is this good|advice on)/i,
    SIP_TOOL:    /\b(sip calculator|calculate sip|how much sip|sip for|monthly sip)\b/i,
    EMI_TOOL:    /\b(emi calculator|check emi|emi danger|debt score|loan danger)\b/i,
    RATIO_TOOL:  /\b(health score|financial health|net worth check|ratio check)\b/i,
};

function classifyIntent(text) {
    for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
        if (pattern.test(text)) return intent;
    }
    return 'GENERAL';
}

// ─── SMART SUGGESTIONS ────────────────────────────────────────────────────────
function getSmartSuggestions() {
    const path  = window.location.pathname.toLowerCase();
    const title = document.title.toLowerCase();
    const map = {
        investing:  ["Should I start with Nifty50 or midcap funds?", "I have ₹5L in FD. What should I do?", "SIP vs lump sum — which beats the other?"],
        debt:       ["I have a ₹30L home loan at 8.5%. Prepay or invest?", "My EMI is ₹35K and salary ₹90K. Is this okay?", "How do I get out of credit card debt fast?"],
        tax:        ["I'm in the 30% bracket. How do I legally pay less?", "New regime vs old — which saves me more?", "What's the smartest way to use my 80C limit?"],
        insurance:  ["How much term insurance do I actually need?", "LIC policy vs ELSS for tax saving — compare.", "My company gives health insurance. Do I need more?"],
        default:    ["I earn ₹80K/month and spend ₹70K. Fix me.", "LIC or term insurance — what should I pick?", "I want to retire at 45. What's my number?"],
    };
    for (const [key, items] of Object.entries(map)) {
        if (key !== 'default' && (path.includes(key) || title.includes(key))) return items;
    }
    return map.default;
}

// ─── PAGE CONTEXT ─────────────────────────────────────────────────────────────
function extractFinancialDataFromPage() {
    const data = {};
    const allText = document.body.innerText;
    const salaryMatch = allText.match(/(?:salary|income|ctc|in.?hand)[:\s₹]*(\d[\d,.]+\s*(?:lakh|k|L)?)/i);
    if (salaryMatch) data.salary = salaryMatch[1];
    const emiMatch = allText.match(/(?:emi|loan)[:\s₹]*(\d[\d,.]+)/i);
    if (emiMatch) data.emi = emiMatch[1];
    const sipMatch = allText.match(/(?:sip|invest|mutual fund)[:\s₹]*(\d[\d,.]+)/i);
    if (sipMatch) data.sip = sipMatch[1];
    const scoreEl = document.querySelector('[data-score], .score, .progress-value, .wealth-score');
    if (scoreEl) data.score = scoreEl.textContent?.trim();
    const moduleTitle = document.querySelector('.module-title, .lesson-title, [data-module]');
    if (moduleTitle) data.currentLesson = moduleTitle.textContent?.trim();
    return data;
}

function extractPageContext() {
    let ctx = `Page: ${document.title}\nURL: ${window.location.pathname}\n`;
    const active = document.querySelector('section.active, [data-active="true"], .tab-content.active, article:not([hidden])');
    if (active) {
        const h = active.querySelector('h1,h2,h3');
        if (h) ctx += `Section: "${h.innerText.trim()}"\n`;
        const p = active.querySelector('p');
        if (p) ctx += `Content: "${p.innerText.substring(0, QFT_CONFIG.MAX_CONTEXT_CHARS)}"\n`;
    }
    const fin = extractFinancialDataFromPage();
    if (Object.keys(fin).length) {
        ctx += `\nUser data visible:\n`;
        for (const [k, v] of Object.entries(fin)) ctx += `  ${k}: ${v}\n`;
    }
    return ctx.trim();
}

// ─── MARKDOWN POST-PROCESSOR ──────────────────────────────────────────────────
function postProcessMarkdown(raw) {
    let t = raw;
    t = t.replace(/([^\n])(###)/g, '$1\n\n$2');
    t = t.replace(/(₹\d[\d,.]+(?:L|Cr|K|lakh|crore)?)/g, '**$1**');
    t = t.replace(/(\d+\.?\d*%)/g, '**$1**');
    ['DANGER ZONE','CRITICAL','IMMEDIATELY','NEVER','ALWAYS','STOP','WARNING','TRAP','DEBT TRAP']
        .forEach(w => { t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), `**${w}**`); });
    return t;
}

// ─── MARKDOWN RENDERER CONFIG ─────────────────────────────────────────────────
function configureMarkdown() {
    if (typeof marked === 'undefined') return;
    marked.use({ breaks: true, gfm: true });

    const SECTION_MAP = {
        '🔢': 'math',    '🚨': 'danger',  '⚠️': 'danger',  '🪤': 'danger',
        '🧠': 'psychology','💸': 'cost',  '✅': 'success',  '🏆': 'success',
        '🚀': 'action',  '🛠️': 'action',  '🔧': 'action',  '⚙️': 'action',
        '🎯': 'goal',    '📅': 'goal',    '🗺️': 'info',    '📐': 'info',
        '⚔️': 'compare', '🆘': 'emergency','🔍': 'info',   '📊': 'math',
        '💰': 'cost',    '🔑': 'action',
    };

    marked.use({
        renderer: {
            heading({ tokens, depth }) {
                const raw  = tokens.map(t => t.raw || '').join('');
                const text = raw.replace(/^#+\s*/, '').trim();
                for (const [emoji, type] of Object.entries(SECTION_MAP)) {
                    if (text.includes(emoji)) {
                        return `<div class="qft-section qft-section-${type}" role="heading" aria-level="${depth}">` +
                               `<span class="qft-section-icon" aria-hidden="true">${emoji}</span>` +
                               `<span class="qft-section-title">${text.replace(emoji, '').trim()}</span></div>`;
                    }
                }
                return `<h${depth} class="qft-h qft-h-${depth}">${text}</h${depth}>`;
            },
            list({ ordered, items }) {
                const tag  = ordered ? 'ol' : 'ul';
                const inner = items.map(item => {
                    const text = item.tokens?.map(t => t.raw || '').join('') || '';
                    return `<li class="qft-li">${text}</li>`;
                }).join('');
                return `<${tag} class="qft-list">${inner}</${tag}>`;
            },
            strong({ tokens }) {
                return `<strong class="qft-strong">${tokens.map(t => t.raw||'').join('')}</strong>`;
            },
            codespan({ text }) {
                return `<code class="qft-code">${text}</code>`;
            },
            table(token) {
                const header = token.header.map(c =>
                    `<th>${c.tokens?.map(t=>t.raw||'').join('')||''}</th>`).join('');
                const rows = token.rows.map(row =>
                    `<tr>${row.map(c => `<td>${c.tokens?.map(t=>t.raw||'').join('')||''}</td>`).join('')}</tr>`
                ).join('');
                return `<div class="qft-table-wrap"><table class="qft-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
            },
        }
    });
}

// ─── AUDIO FEEDBACK ──────────────────────────────────────────────────────────
function playTick(freq = 880, dur = 0.06) {
    try {
        if (localStorage.getItem(QFT_CONFIG.SOUND_KEY) === 'off') return;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.start(); osc.stop(ctx.currentTime + dur);
    } catch {}
}

// ─── TYPING INDICATOR ────────────────────────────────────────────────────────
function createTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'qft-msg qft-msg-ai qft-typing-indicator';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'QFT is analysing...');
    el.innerHTML = `
        <div class="qft-typing-dots">
            <span></span><span></span><span></span>
        </div>
        <span class="qft-typing-label">Analysing&hellip;</span>
    `;
    return el;
}

// ─── TOOL PANEL RENDERERS ─────────────────────────────────────────────────────
const ToolPanels = {
    sip: `
        <div class="qft-tool-panel" id="qft-tool-sip">
            <div class="qft-tool-title">📈 SIP Goal Calculator</div>
            <div class="qft-tool-grid">
                <label>Goal Amount (₹)<input type="number" id="sip-goal" placeholder="5000000" min="1000"></label>
                <label>Years<input type="number" id="sip-years" placeholder="10" min="1" max="50"></label>
                <label>Expected Return %<input type="number" id="sip-return" placeholder="12" min="1" max="50" step="0.1"></label>
                <label>Inflation %<input type="number" id="sip-inflation" placeholder="6" min="0" max="20" step="0.1"></label>
                <label>Existing Corpus (₹)<input type="number" id="sip-existing" placeholder="0" min="0"></label>
            </div>
            <button class="qft-tool-btn" onclick="window.FINOS_QFT.runSIP()">Calculate SIP →</button>
            <div class="qft-tool-result" id="sip-result" hidden></div>
        </div>`,

    emi: `
        <div class="qft-tool-panel" id="qft-tool-emi">
            <div class="qft-tool-title">⚠️ EMI Danger Meter</div>
            <div class="qft-tool-grid">
                <label>Monthly Income (₹)<input type="number" id="emi-income" placeholder="90000" min="1"></label>
                <label>Existing EMIs (₹)<input type="number" id="emi-existing" placeholder="0" min="0"></label>
                <label>New EMI (₹)<input type="number" id="emi-new" placeholder="20000" min="1"></label>
                <label>Loan Amount (₹)<input type="number" id="emi-loan" placeholder="1500000" min="1"></label>
                <label>Interest Rate %<input type="number" id="emi-rate" placeholder="8.5" min="0.1" max="50" step="0.1"></label>
                <label>Tenure (months)<input type="number" id="emi-tenure" placeholder="180" min="1"></label>
            </div>
            <button class="qft-tool-btn" onclick="window.FINOS_QFT.runEMI()">Check Danger Score →</button>
            <div class="qft-tool-result" id="emi-result" hidden></div>
        </div>`,

    ratios: `
        <div class="qft-tool-panel" id="qft-tool-ratios">
            <div class="qft-tool-title">🩺 Financial Health Check</div>
            <div class="qft-tool-grid">
                <label>Monthly Income (₹)<input type="number" id="r-income" placeholder="100000" min="1"></label>
                <label>Monthly Expenses (₹)<input type="number" id="r-expenses" placeholder="65000" min="1"></label>
                <label>Monthly Savings (₹)<input type="number" id="r-savings" placeholder="20000" min="0"></label>
                <label>Total Assets (₹)<input type="number" id="r-assets" placeholder="500000" min="0"></label>
                <label>Total Liabilities (₹)<input type="number" id="r-liab" placeholder="200000" min="0"></label>
                <label>Your Age<input type="number" id="r-age" placeholder="30" min="18" max="80"></label>
            </div>
            <button class="qft-tool-btn" onclick="window.FINOS_QFT.runRatios()">Run Health Check →</button>
            <div class="qft-tool-result" id="ratios-result" hidden></div>
        </div>`,
};

// ─── MAIN ENGINE ──────────────────────────────────────────────────────────────
class QFTEngine {
    constructor() {
        this.state = {
            isOpen:           false,
            isTyping:         false,
            history:          [],
            messageCount:     0,
            sessionId:        sessionStorage.getItem(QFT_CONFIG.SESSION_KEY) || null,
            sessionStartTime: Date.now(),
            activePanel:      'chat',      // 'chat' | 'sip' | 'emi' | 'ratios' | 'favourites'
            backendOnline:    null,        // null = unknown, true, false
            theme:            localStorage.getItem(QFT_CONFIG.THEME_KEY) || 'dark',
        };

        this._renderBuffer    = '';
        this._renderScheduled = false;
        this.favourites       = JSON.parse(localStorage.getItem(QFT_CONFIG.FAV_KEY) || '[]');

        this._injectHTML();
        this.cacheDOM();
        this.bindEvents();
        configureMarkdown();
        this.populateSuggestions();
        this._applyTheme();
        this._startSessionTimer();
        this._pollHealth();

        console.log('[QFT v5.0] 🚀 GOD MODE online. Mental OS loading...');
    }

    // ── HTML Injection ──────────────────────────────────────────────────────
    _injectHTML() {
        if (document.getElementById('qft-system')) return;

        const tpl = document.createElement('div');
        tpl.id = 'qft-system';
        tpl.setAttribute('role', 'complementary');
        tpl.setAttribute('aria-label', 'FIN-OS QFT Financial Mentor');
        tpl.innerHTML = `
            <!-- FAB -->
            <button id="qft-fab" aria-label="Open QFT Financial Mentor" aria-haspopup="dialog" aria-expanded="false" title="Open QFT (Ctrl+K)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span class="qft-fab-label">QFT</span>
                <span class="qft-status-dot" id="qft-status-dot" title="Checking backend…"></span>
            </button>

            <!-- DRAWER -->
            <div id="qft-drawer" role="dialog" aria-modal="true" aria-label="QFT Financial Mentor" tabindex="-1">

                <!-- Header -->
                <div class="qft-header">
                    <div class="qft-header-left">
                        <span class="qft-logo">QFT<span class="qft-logo-ver">v5</span></span>
                        <div class="qft-header-meta">
                            <span class="qft-session-timer" id="qft-session-timer">00:00</span>
                            <span class="qft-msg-counter" id="qft-msg-counter">0 msgs</span>
                        </div>
                    </div>
                    <div class="qft-header-right">
                        <button class="qft-icon-btn" id="qft-theme-btn" title="Toggle theme" aria-label="Toggle light/dark theme">☀</button>
                        <button class="qft-icon-btn" id="qft-sound-btn" title="Toggle sound" aria-label="Toggle sound feedback">🔔</button>
                        <button class="qft-icon-btn" id="qft-export-btn" title="Export chat" aria-label="Export conversation">⤓</button>
                        <button class="qft-icon-btn" id="qft-clear-btn" title="Clear session" aria-label="Clear conversation">⌫</button>
                        <button class="qft-close-btn" id="qft-close" aria-label="Close QFT">×</button>
                    </div>
                </div>

                <!-- Nav tabs -->
                <nav class="qft-nav" aria-label="QFT panels" role="tablist">
                    <button class="qft-nav-tab active" data-panel="chat"       role="tab" aria-selected="true">Chat</button>
                    <button class="qft-nav-tab"         data-panel="sip"       role="tab" aria-selected="false">SIP Calc</button>
                    <button class="qft-nav-tab"         data-panel="emi"       role="tab" aria-selected="false">EMI Meter</button>
                    <button class="qft-nav-tab"         data-panel="ratios"    role="tab" aria-selected="false">Health</button>
                    <button class="qft-nav-tab"         data-panel="favourites"role="tab" aria-selected="false">★ Stars</button>
                </nav>

                <!-- Panel: Chat -->
                <div class="qft-panel" id="qft-panel-chat" role="tabpanel">
                    <div id="qft-chat-area" aria-live="polite" aria-label="Conversation">
                        <div class="qft-empty-state" id="qft-empty">
                            <div class="qft-empty-icon">⚡</div>
                            <p>Ask anything about your money. No judgement. Pure signal.</p>
                            <div class="qft-suggestions" id="qft-suggestions"></div>
                        </div>
                    </div>
                    <form id="qft-form" novalidate>
                        <div class="qft-input-wrapper">
                            <div class="qft-input-meta">
                                <span class="qft-intent-badge" id="qft-intent-badge" aria-live="polite"></span>
                                <span class="qft-char-count"  id="qft-char-count"></span>
                            </div>
                            <textarea id="qft-input" rows="1"
                                placeholder="Ask about SIP, EMI, taxes, portfolio…"
                                aria-label="Your question"
                                maxlength="4000"
                                autocomplete="off"
                                spellcheck="false"></textarea>
                            <button id="qft-submit-btn" type="button" disabled aria-label="Send message">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <line x1="22" y1="2" x2="11" y2="13"/>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                            </button>
                        </div>
                        <div class="qft-form-footer">
                            <span class="qft-hint">⏎ send · ⇧⏎ newline · ⌘K toggle</span>
                            <span class="qft-backend-label" id="qft-backend-label">Connecting…</span>
                        </div>
                    </form>
                </div>

                <!-- Panel: SIP -->
                <div class="qft-panel qft-panel-hidden" id="qft-panel-sip" role="tabpanel">${ToolPanels.sip}</div>

                <!-- Panel: EMI -->
                <div class="qft-panel qft-panel-hidden" id="qft-panel-emi" role="tabpanel">${ToolPanels.emi}</div>

                <!-- Panel: Ratios -->
                <div class="qft-panel qft-panel-hidden" id="qft-panel-ratios" role="tabpanel">${ToolPanels.ratios}</div>

                <!-- Panel: Favourites -->
                <div class="qft-panel qft-panel-hidden" id="qft-panel-favourites" role="tabpanel">
                    <div class="qft-favs-header">Starred responses</div>
                    <div id="qft-favs-list"></div>
                </div>

            </div>
        `;
        document.body.appendChild(tpl);
    }

    // ── DOM Cache ───────────────────────────────────────────────────────────
    cacheDOM() {
        this.dom = {
            drawer:       document.getElementById('qft-drawer'),
            fab:          document.getElementById('qft-fab'),
            chatArea:     document.getElementById('qft-chat-area'),
            inputField:   document.getElementById('qft-input'),
            submitBtn:    document.getElementById('qft-submit-btn'),
            form:         document.getElementById('qft-form'),
            emptyState:   document.getElementById('qft-empty'),
            suggestions:  document.getElementById('qft-suggestions'),
            charCount:    document.getElementById('qft-char-count'),
            intentBadge:  document.getElementById('qft-intent-badge'),
            sessionTimer: document.getElementById('qft-session-timer'),
            msgCounter:   document.getElementById('qft-msg-counter'),
            statusDot:    document.getElementById('qft-status-dot'),
            backendLabel: document.getElementById('qft-backend-label'),
            themeBtn:     document.getElementById('qft-theme-btn'),
            soundBtn:     document.getElementById('qft-sound-btn'),
            exportBtn:    document.getElementById('qft-export-btn'),
            clearBtn:     document.getElementById('qft-clear-btn'),
        };
    }

    // ── Events ──────────────────────────────────────────────────────────────
    bindEvents() {
        this.dom.fab.addEventListener('click', () => this.toggleDrawer());
        document.getElementById('qft-close').addEventListener('click', () => this.toggleDrawer(false));

        // Global keyboard shortcuts
        document.addEventListener('keydown', e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.toggleDrawer(); }
            if (e.key === 'Escape' && this.state.isOpen) this.toggleDrawer(false);
            if (e.key === '/' && !this.state.isOpen && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault(); this.toggleDrawer(true);
            }
        });

        // Input auto-resize + live intent
        this.dom.inputField.addEventListener('input', e => {
            const val = e.target.value;
            this.dom.submitBtn.disabled = !val.trim();
            this.dom.charCount.textContent = val.length > 0 ? `${val.length}/4000` : '';
            // Auto-resize textarea
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            // Live intent badge
            if (val.trim().length > 10) {
                const intent = classifyIntent(val);
                if (intent !== 'GENERAL') {
                    this.dom.intentBadge.textContent = intent;
                    this.dom.intentBadge.dataset.intent = intent;
                    this.dom.intentBadge.style.opacity = '1';
                } else {
                    this.dom.intentBadge.style.opacity = '0';
                }
            } else {
                this.dom.intentBadge.style.opacity = '0';
            }
        });

        // Enter to send
        this.dom.inputField.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._doSend();
            }
        });

        // Send button click
        this.dom.submitBtn.addEventListener('click', () => this._doSend());

        // Prevent accidental form submit (e.g. mobile keyboard "Go")
        this.dom.form.addEventListener('submit', e => e.preventDefault());

        // Suggestion chips
        document.addEventListener('click', e => {
            const chip = e.target.closest('.qft-suggestion-chip');
            if (chip) {
                this.dom.inputField.value = chip.textContent.trim();
                this.dom.submitBtn.disabled = false;
                this.dom.inputField.dispatchEvent(new Event('input'));
                this.dom.inputField.focus();
                setTimeout(() => this._doSend(), 80);
            }
        });

        // Nav tabs
        document.querySelectorAll('.qft-nav-tab').forEach(btn => {
            btn.addEventListener('click', () => this.switchPanel(btn.dataset.panel));
        });

        // Header controls
        this.dom.themeBtn.addEventListener('click',  () => this._toggleTheme());
        this.dom.soundBtn.addEventListener('click',  () => this._toggleSound());
        this.dom.exportBtn.addEventListener('click', () => this._exportChat());
        this.dom.clearBtn.addEventListener('click',  () => this._clearSession());
    }

    // ── Send dispatcher ─────────────────────────────────────────────────────
    _doSend() {
        const userText = this.dom.inputField.value.trim();
        if (!userText || this.state.isTyping) return;
        this.handleSubmit(userText);
    }

    // ── Panel Switcher ──────────────────────────────────────────────────────
    switchPanel(name) {
        this.state.activePanel = name;
        document.querySelectorAll('.qft-panel').forEach(p => p.classList.add('qft-panel-hidden'));
        document.querySelectorAll('.qft-nav-tab').forEach(t => {
            const active = t.dataset.panel === name;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active);
        });
        const panel = document.getElementById(`qft-panel-${name}`);
        if (panel) panel.classList.remove('qft-panel-hidden');
        if (name === 'favourites') this._renderFavourites();
    }

    // ── Drawer Toggle ───────────────────────────────────────────────────────
    toggleDrawer(forceState) {
        const open = forceState !== undefined ? forceState : !this.state.isOpen;
        this.state.isOpen = open;
        this.dom.drawer.classList.toggle('active', open);
        this.dom.fab.setAttribute('aria-expanded', open);
        if (open) {
            this.dom.fab.querySelector('.qft-fab-label').textContent = '✕';
            requestAnimationFrame(() => {
                setTimeout(() => this.dom.inputField.focus(), 350);
            });
        } else {
            this.dom.fab.querySelector('.qft-fab-label').textContent = 'QFT';
        }
    }

    // ── Session Timer ───────────────────────────────────────────────────────
    _startSessionTimer() {
        setInterval(() => {
            const s = Math.floor((Date.now() - this.state.sessionStartTime) / 1000);
            const m = Math.floor(s / 60).toString().padStart(2, '0');
            this.dom.sessionTimer.textContent = `${m}:${(s % 60).toString().padStart(2, '0')}`;
        }, 1000);
    }

    // ── Health Polling ──────────────────────────────────────────────────────
    async _pollHealth() {
        const check = async () => {
            try {
                const r = await fetch(`${QFT_CONFIG.API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
                const j = await r.json();
                this.state.backendOnline = j.ollama_reachable;
                this.dom.statusDot.className    = 'qft-status-dot ' + (this.state.backendOnline ? 'online' : 'degraded');
                this.dom.backendLabel.textContent = this.state.backendOnline
                    ? `✓ ${j.active_model}`
                    : '⚡ Ollama offline';
                this.dom.statusDot.title = this.state.backendOnline
                    ? `Online · ${j.active_model} · ${j.active_sessions} sessions`
                    : 'Backend degraded — run: ollama serve';
            } catch {
                this.state.backendOnline = false;
                this.dom.statusDot.className    = 'qft-status-dot offline';
                this.dom.backendLabel.textContent = '✗ Backend offline';
                this.dom.statusDot.title = 'Cannot reach brain.py — is it running?';
            }
        };
        await check();
        setInterval(check, QFT_CONFIG.HEALTH_POLL_MS);
    }

    // ── Theme ───────────────────────────────────────────────────────────────
    _applyTheme() {
        document.getElementById('qft-system').dataset.theme = this.state.theme;
        this.dom.themeBtn.textContent = this.state.theme === 'dark' ? '☀' : '🌙';
    }
    _toggleTheme() {
        this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(QFT_CONFIG.THEME_KEY, this.state.theme);
        this._applyTheme();
    }

    // ── Sound ────────────────────────────────────────────────────────────────
    _toggleSound() {
        const off = localStorage.getItem(QFT_CONFIG.SOUND_KEY) === 'off';
        localStorage.setItem(QFT_CONFIG.SOUND_KEY, off ? 'on' : 'off');
        this.dom.soundBtn.textContent = off ? '🔔' : '🔕';
        if (off) playTick(880, 0.1);
    }

    // ── Export ───────────────────────────────────────────────────────────────
    _exportChat() {
        const lines = ['# FIN-OS QFT Conversation Export', `Date: ${new Date().toLocaleString('en-IN')}`, '---', ''];
        this.state.history.forEach(m => {
            lines.push(`### ${m.role === 'user' ? '👤 You' : '🤖 QFT'}`);
            lines.push(m.content);
            lines.push('');
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `qft-chat-${Date.now()}.md`,
        });
        a.click();
        playTick(660, 0.08);
    }

    // ── Clear Session ─────────────────────────────────────────────────────────
    async _clearSession() {
        if (!confirm('Clear this conversation?')) return;
        if (this.state.sessionId) {
            try {
                await fetch(`${QFT_CONFIG.API_BASE}/api/session/${this.state.sessionId}`, { method: 'DELETE' });
            } catch {}
            this.state.sessionId = null;
            sessionStorage.removeItem(QFT_CONFIG.SESSION_KEY);
        }
        this.state.history = [];
        this.state.messageCount = 0;
        this.dom.chatArea.innerHTML = '';
        this.dom.emptyState.style.display = '';
        this.dom.msgCounter.textContent = '0 msgs';
        this.populateSuggestions();
        playTick(440, 0.06);
    }

    // ── Favourites ───────────────────────────────────────────────────────────
    _saveFavourite(rawText) {
        const entry = { text: rawText, ts: new Date().toLocaleString('en-IN'), id: Date.now() };
        this.favourites.push(entry);
        localStorage.setItem(QFT_CONFIG.FAV_KEY, JSON.stringify(this.favourites));
        playTick(1200, 0.07);
    }

    _renderFavourites() {
        const list = document.getElementById('qft-favs-list');
        if (!list) return;
        if (!this.favourites.length) {
            list.innerHTML = '<div class="qft-fav-empty">No starred responses yet. Click ★ on any AI message.</div>';
            return;
        }
        list.innerHTML = this.favourites.slice().reverse().map(f => `
            <div class="qft-fav-item">
                <div class="qft-fav-ts">${f.ts}</div>
                <div class="qft-fav-body">${f.text.substring(0, 400).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}…</div>
                <button class="qft-fav-del" data-id="${f.id}" title="Remove">✕</button>
            </div>
        `).join('');
        list.querySelectorAll('.qft-fav-del').forEach(btn => {
            btn.addEventListener('click', () => {
                this.favourites = this.favourites.filter(f => f.id !== +btn.dataset.id);
                localStorage.setItem(QFT_CONFIG.FAV_KEY, JSON.stringify(this.favourites));
                this._renderFavourites();
            });
        });
    }

    // ── Suggestions ──────────────────────────────────────────────────────────
    populateSuggestions() {
        if (!this.dom.suggestions) return;
        const chips = getSmartSuggestions();
        this.dom.suggestions.innerHTML = chips
            .map(c => `<button class="qft-suggestion-chip" type="button">${c}</button>`)
            .join('');
    }

    // ── Message Helpers ───────────────────────────────────────────────────────
    appendMessage(content, role, extraClass = '') {
        if (this.dom.emptyState) this.dom.emptyState.style.display = 'none';
        const msgDiv = document.createElement('div');
        msgDiv.className = `qft-msg qft-msg-${role} ${extraClass}`.trim();

        if (role === 'user') {
            msgDiv.innerHTML = `<span class="qft-msg-text">${this._escape(content)}</span>`;
        } else {
            try {
                msgDiv.innerHTML = DOMPurify.sanitize(marked.parse(content || ''));
            } catch { msgDiv.textContent = content; }
        }

        const ts = document.createElement('span');
        ts.className = 'qft-msg-time';
        ts.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        msgDiv.appendChild(ts);

        this.dom.chatArea.appendChild(msgDiv);
        this.scrollToBottom();
        return msgDiv;
    }

    _escape(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    scrollToBottom() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.dom.chatArea.scrollTop = this.dom.chatArea.scrollHeight;
        } else {
            requestAnimationFrame(() => this.dom.chatArea.scrollTo({ top: this.dom.chatArea.scrollHeight, behavior: 'smooth' }));
        }
    }

    _scheduleRender(msgDiv) {
        if (this._renderScheduled) return;
        this._renderScheduled = true;
        setTimeout(() => {
            try {
                msgDiv.innerHTML = DOMPurify.sanitize(marked.parse(postProcessMarkdown(this._renderBuffer)));
            } catch { msgDiv.textContent = this._renderBuffer; }
            this._renderScheduled = false;
            this.scrollToBottom();
        }, QFT_CONFIG.STREAM_DEBOUNCE);
    }

    // ── Submit Handler ────────────────────────────────────────────────────────
    async handleSubmit(userText) {
        this.dom.inputField.value = '';
        this.dom.inputField.style.height = 'auto';
        this.dom.submitBtn.disabled  = true;
        this.dom.inputField.disabled = true;
        this.state.isTyping          = true;
        this.state.messageCount++;
        this.dom.intentBadge.style.opacity = '0';
        this.dom.charCount.textContent     = '';
        this.dom.msgCounter.textContent    = `${this.state.messageCount} msg${this.state.messageCount !== 1 ? 's' : ''}`;

        this.appendMessage(userText, 'user');
        playTick(660, 0.05);

        const typingEl = createTypingIndicator();
        this.dom.chatArea.appendChild(typingEl);
        this.scrollToBottom();

        const intent      = classifyIntent(userText);
        const pageContext = extractPageContext();

        this.state.history.push({ role: 'user', content: userText });
        if (this.state.history.length > QFT_CONFIG.MEMORY_LIMIT) {
            this.state.history = [this.state.history[0], ...this.state.history.slice(2)];
        }

        if (QFT_CONFIG.USE_BACKEND) {
            await this._streamFromBackend(userText, pageContext, intent, typingEl);
        } else {
            await this._streamFromOllama(intent, pageContext, typingEl);
        }
    }

    // ── Backend Stream (brain.py v2 SSE) ──────────────────────────────────────
    async _streamFromBackend(message, context, intent, typingEl) {
        try {
            const resp = await fetch(`${QFT_CONFIG.API_BASE}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    context: `[INTENT: ${intent}]\n${context}`,
                    session_id: this.state.sessionId || undefined,
                }),
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            typingEl.remove();
            const msgDiv = this._createAIMsgDiv(intent);
            this._renderBuffer = '';

            const reader  = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const json = JSON.parse(line.slice(6));
                        if (json.session_id && !this.state.sessionId) {
                            this.state.sessionId = json.session_id;
                            sessionStorage.setItem(QFT_CONFIG.SESSION_KEY, json.session_id);
                        }
                        if (json.token) {
                            if (this._renderBuffer === '') msgDiv.innerHTML = '';
                            this._renderBuffer += json.token;
                            this._scheduleRender(msgDiv);
                        }
                        if (json.done) {
                            this._finaliseAIMessage(msgDiv);
                        }
                    } catch {}
                }
            }

            if (this._renderBuffer) this._finaliseAIMessage(msgDiv);

        } catch (err) {
            console.warn('[QFT] Backend stream failed, falling back to Ollama direct:', err.message);
            await this._streamFromOllama(intent, extractPageContext(), typingEl);
            return; // _unlockInput already called inside _streamFromOllama's finally
        } finally {
            this._unlockInput();
        }
    }

    // ── Direct Ollama Stream (fallback) ────────────────────────────────────────
    async _streamFromOllama(intent, pageContext, typingEl) {
        const systemMessages = [
            { role: 'system', content: this._buildSystemPrompt() },
            { role: 'system', content: `[INTENT: ${intent}] Apply the ${intent} framework.` },
            { role: 'system', content: `[PAGE CONTEXT]\n${pageContext}` },
        ];

        try {
            const resp = await fetch(QFT_CONFIG.OLLAMA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: QFT_CONFIG.MODEL,
                    messages: [...systemMessages, ...this.state.history],
                    stream: true,
                    options: {
                        temperature:   QFT_CONFIG.TEMPERATURE,
                        num_ctx:       QFT_CONFIG.NUM_CTX,
                        repeat_penalty: 1.1,
                        top_p: 0.9,
                    },
                }),
            });

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            typingEl.remove();
            const msgDiv = this._createAIMsgDiv(intent);
            this._renderBuffer = '';

            const reader  = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        const chunk  = parsed.message?.content;
                        if (chunk) {
                            if (this._renderBuffer === '') msgDiv.innerHTML = '';
                            this._renderBuffer += chunk;
                            this._scheduleRender(msgDiv);
                        }
                    } catch {}
                }
            }

            this._finaliseAIMessage(msgDiv);

        } catch (err) {
            typingEl.remove();
            const errDiv = document.createElement('div');
            errDiv.className = 'qft-msg qft-msg-ai qft-msg-error';
            errDiv.innerHTML = `
                <div class="qft-error-content">
                    <span class="qft-error-icon">⚠️</span>
                    <div>
                        <strong>QFT Offline</strong>
                        <p>Backend: <code>uvicorn brain:app</code></p>
                        <p>Ollama: <code>ollama serve</code> then <code>ollama pull ${QFT_CONFIG.MODEL}</code></p>
                        <small>${err.message}</small>
                    </div>
                </div>`;
            this.dom.chatArea.appendChild(errDiv);
            this.state.history.pop();
            this.scrollToBottom();
        } finally {
            this._unlockInput();
        }
    }

    _createAIMsgDiv(intent) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'qft-msg qft-msg-ai qft-msg-streaming';
        if (intent && intent !== 'GENERAL') {
            const badge = document.createElement('span');
            badge.className     = 'qft-intent-tag';
            badge.dataset.intent = intent;
            badge.textContent   = intent;
            msgDiv.appendChild(badge);
        }
        this.dom.chatArea.appendChild(msgDiv);
        this.scrollToBottom();
        return msgDiv;
    }

    _finaliseAIMessage(msgDiv) {
        const raw = this._renderBuffer;
        try {
            msgDiv.innerHTML = DOMPurify.sanitize(marked.parse(postProcessMarkdown(raw)));
        } catch { msgDiv.textContent = raw; }

        msgDiv.classList.remove('qft-msg-streaming');

        const ts = document.createElement('span');
        ts.className = 'qft-msg-time';
        ts.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        msgDiv.appendChild(ts);

        // Action buttons row
        const actions = document.createElement('div');
        actions.className = 'qft-msg-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'qft-copy-btn'; copyBtn.innerHTML = '⎘ Copy';
        copyBtn.addEventListener('click', async () => {
            const clean = raw.replace(/#{1,6}\s*/g, '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
            try {
                await navigator.clipboard.writeText(clean);
                copyBtn.innerHTML = '✓ Copied'; copyBtn.classList.add('copied');
                setTimeout(() => { copyBtn.innerHTML = '⎘ Copy'; copyBtn.classList.remove('copied'); }, 2000);
            } catch { copyBtn.innerHTML = '✗ Failed'; }
        });

        const starBtn = document.createElement('button');
        starBtn.className = 'qft-star-btn'; starBtn.innerHTML = '☆ Star';
        starBtn.addEventListener('click', () => {
            this._saveFavourite(raw);
            starBtn.innerHTML = '★ Starred'; starBtn.classList.add('starred');
            starBtn.disabled = true;
        });

        actions.appendChild(copyBtn);
        actions.appendChild(starBtn);
        msgDiv.appendChild(actions);

        this.state.history.push({ role: 'assistant', content: raw });
        this._renderBuffer = '';
        this.scrollToBottom();
        playTick(880, 0.08);
    }

    _unlockInput() {
        this.state.isTyping          = false;
        this.dom.inputField.disabled = false;
        this.dom.submitBtn.disabled  = !this.dom.inputField.value.trim();
        this.dom.inputField.focus();
    }

    _buildSystemPrompt() {
        return `You are QFT (Quantum Financial Thinking Engine) — the unfiltered, data-driven financial brain of FIN-OS, built for Indian professionals aged 22-45.
RULES: ZERO FLUFF. BULLET-FIRST. ALWAYS QUANTIFY in ₹ (lakhs/crores). NAME THE TRAP. INDIAN CONTEXT MANDATORY (SIP, EMI, Nifty, ELSS, PPF, NPS, FD, LIC, ULIP, ITR, 80C, HRA). END WITH AN ACTION TASK.
NEVER invent stock prices, NAVs, or index levels. If you don't have live data, say so and direct to moneycontrol.com or NSE India.
Tax rules (AY 2025-26): Equity LTCG 12.5% above ₹1.25L. STCG 20%. Debt funds at slab rate. 80C limit ₹1.5L. NPS extra ₹50K under 80CCD(1B).
Benchmarks for projections: Nifty 50 ~12% CAGR (15yr), FD ~6.5-7%, PPF 7.1%, Inflation ~5-6%.
Structure every response with: 🔍 Reality Check, 📐 The Math, 🧠 Psychology Trap, ⚠️ Where People Fail, ✅ The FIN-OS Fix.`;
    }

    // ── Tool: SIP Calculator ──────────────────────────────────────────────────
    async runSIP() {
        const goal       = parseFloat(document.getElementById('sip-goal').value);
        const years      = parseInt(document.getElementById('sip-years').value);
        const ret        = parseFloat(document.getElementById('sip-return').value) || 12;
        const inflation  = parseFloat(document.getElementById('sip-inflation').value) || 6;
        const existing   = parseFloat(document.getElementById('sip-existing').value) || 0;
        const result     = document.getElementById('sip-result');

        if (!goal || !years) { alert('Enter goal amount and years.'); return; }
        result.hidden = false;
        result.innerHTML = '<span class="qft-tool-loading">Calculating…</span>';

        try {
            const r = await fetch(`${QFT_CONFIG.API_BASE}/api/tools/sip`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal_amount: goal, years, expected_return: ret, inflation_rate: inflation, existing_corpus: existing }),
            });
            const d = await r.json();
            const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
            result.innerHTML = `
                <div class="qft-tool-kpi-grid">
                    <div class="qft-kpi"><span class="qft-kpi-val">${fmtINR(d.monthly_sip_inr)}</span><span class="qft-kpi-label">Monthly SIP</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${fmtINR(d.total_invested_inr)}</span><span class="qft-kpi-label">Total Invested</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${d.wealth_multiple}×</span><span class="qft-kpi-label">Wealth Multiple</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${fmtINR(d.real_goal_inr)}</span><span class="qft-kpi-label">Inflation-adjusted Goal</span></div>
                </div>
                <div class="qft-tool-instruments">
                    <strong>Recommended:</strong> ${d.recommended_instruments.join(' · ')}
                </div>
                <div class="qft-tool-verdict ${d.finos_verdict.startsWith('✅') ? 'ok' : 'warn'}">${d.finos_verdict}</div>
                <button class="qft-tool-ask-btn" onclick="window.FINOS_QFT._askAboutResult('sip', ${JSON.stringify(d).replace(/"/g,'&quot;')})">Ask QFT about this →</button>`;
            playTick(880, 0.08);
        } catch (e) {
            result.innerHTML = `<span class="qft-tool-error">Error: ${e.message}</span>`;
        }
    }

    // ── Tool: EMI Danger ──────────────────────────────────────────────────────
    async runEMI() {
        const income   = parseFloat(document.getElementById('emi-income').value);
        const existing = parseFloat(document.getElementById('emi-existing').value) || 0;
        const newEMI   = parseFloat(document.getElementById('emi-new').value);
        const loan     = parseFloat(document.getElementById('emi-loan').value);
        const rate     = parseFloat(document.getElementById('emi-rate').value);
        const tenure   = parseInt(document.getElementById('emi-tenure').value);
        const result   = document.getElementById('emi-result');

        if (!income || !newEMI || !loan || !rate || !tenure) { alert('Fill all fields.'); return; }
        result.hidden = false;
        result.innerHTML = '<span class="qft-tool-loading">Analysing…</span>';

        try {
            const r = await fetch(`${QFT_CONFIG.API_BASE}/api/tools/emi`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthly_income: income, existing_emis: existing, proposed_emi: newEMI, loan_amount: loan, interest_rate: rate, tenure_months: tenure }),
            });
            const d = await r.json();
            const score = d.danger_score;
            const pct   = score + '%';
            const col   = score < 30 ? '#34d399' : score < 55 ? '#fbbf24' : score < 75 ? '#f97316' : '#ef4444';
            const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
            result.innerHTML = `
                <div class="qft-danger-meter">
                    <div class="qft-danger-label">${d.danger_level}</div>
                    <div class="qft-danger-bar-wrap"><div class="qft-danger-bar" style="width:${pct};background:${col}"></div></div>
                    <div class="qft-danger-score" style="color:${col}">${score}/100</div>
                </div>
                <div class="qft-tool-kpi-grid">
                    <div class="qft-kpi"><span class="qft-kpi-val">${d.foir_percent}%</span><span class="qft-kpi-label">FOIR (safe ≤ 35%)</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${fmtINR(d.total_interest_inr)}</span><span class="qft-kpi-label">Total Interest Paid</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${d.interest_percent_of_principal}%</span><span class="qft-kpi-label">Interest / Principal</span></div>
                </div>
                <div class="qft-tool-verdict ${score < 55 ? 'ok' : 'warn'}">${d.advice}</div>
                <div class="qft-tool-prepay">${d.prepayment_tip}</div>
                <button class="qft-tool-ask-btn" onclick="window.FINOS_QFT._askAboutResult('emi', ${JSON.stringify(d).replace(/"/g,'&quot;')})">Ask QFT about this →</button>`;
            playTick(score > 70 ? 220 : 880, 0.1);
        } catch (e) {
            result.innerHTML = `<span class="qft-tool-error">Error: ${e.message}</span>`;
        }
    }

    // ── Tool: Financial Ratios ────────────────────────────────────────────────
    async runRatios() {
        const income   = parseFloat(document.getElementById('r-income').value);
        const expenses = parseFloat(document.getElementById('r-expenses').value);
        const savings  = parseFloat(document.getElementById('r-savings').value) || 0;
        const assets   = parseFloat(document.getElementById('r-assets').value)  || 0;
        const liab     = parseFloat(document.getElementById('r-liab').value)    || 0;
        const age      = parseInt(document.getElementById('r-age').value);
        const result   = document.getElementById('ratios-result');

        if (!income || !expenses || !age) { alert('Fill income, expenses and age.'); return; }
        result.hidden = false;
        result.innerHTML = '<span class="qft-tool-loading">Running check…</span>';

        try {
            const r = await fetch(`${QFT_CONFIG.API_BASE}/api/tools/ratios`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monthly_income: income, monthly_expenses: expenses, monthly_savings: savings, total_assets: assets, total_liabilities: liab, age }),
            });
            const d = await r.json();
            const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
            result.innerHTML = `
                <div class="qft-tool-kpi-grid">
                    <div class="qft-kpi"><span class="qft-kpi-val">${d.savings_rate_percent}%</span><span class="qft-kpi-label">Savings Rate ${d.savings_rate_grade}</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${fmtINR(d.net_worth_inr)}</span><span class="qft-kpi-label">Net Worth ${d.net_worth_grade}</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${d.debt_to_asset_ratio}%</span><span class="qft-kpi-label">Debt/Asset ${d.debt_ratio_grade}</span></div>
                    <div class="qft-kpi"><span class="qft-kpi-val">${fmtINR(d.finos_target_savings_inr)}</span><span class="qft-kpi-label">Target Savings/mo</span></div>
                </div>
                <div class="qft-tool-verdict ok">Expected net worth for age ${age}: ${fmtINR(d.expected_net_worth_inr)}</div>
                <button class="qft-tool-ask-btn" onclick="window.FINOS_QFT._askAboutResult('ratios', ${JSON.stringify(d).replace(/"/g,'&quot;')})">Ask QFT to fix this →</button>`;
            playTick(880, 0.08);
        } catch (e) {
            result.innerHTML = `<span class="qft-tool-error">Error: ${e.message}</span>`;
        }
    }

    // ── Ask QFT about a tool result ───────────────────────────────────────────
    _askAboutResult(tool, data) {
        const msgs = {
            sip:    `I just ran the SIP calculator. Results: monthly SIP needed = ₹${Math.round(data.monthly_sip_inr).toLocaleString('en-IN')}, total invested = ₹${Math.round(data.total_invested_inr).toLocaleString('en-IN')}, wealth multiple = ${data.wealth_multiple}×. Recommended instruments: ${data.recommended_instruments?.join(', ')}. Is this realistic? What should I do next?`,
            emi:    `I ran the EMI danger check. My danger score is ${data.danger_score}/100 (${data.danger_level}). FOIR is ${data.foir_percent}%. Total interest = ₹${Math.round(data.total_interest_inr).toLocaleString('en-IN')}. Should I take this loan?`,
            ratios: `My financial health check: savings rate ${data.savings_rate_percent}% (${data.savings_rate_grade}), net worth ₹${Math.round(data.net_worth_inr).toLocaleString('en-IN')} (${data.net_worth_grade}). Give me a brutally honest assessment and exact fix.`,
        };
        this.switchPanel('chat');
        this.dom.inputField.value = msgs[tool] || 'Analyse my financial data above.';
        this.dom.submitBtn.disabled = false;
        this.dom.inputField.dispatchEvent(new Event('input'));
        this.dom.inputField.focus();
        setTimeout(() => this._doSend(), 200);
    }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
        console.error('[QFT] Missing deps. Add marked.js and DOMPurify before qft-engine.js');
        return;
    }
    window.FINOS_QFT = new QFTEngine();
    console.log('[QFT v5.0] 🚀 GOD MODE online.');
});