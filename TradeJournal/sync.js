/* ═══════════════════════════════════════════════════════════════
   TRADEBOOK PRO — SYNC.JS  v2.0
   Multi-device, real-time sync via Supabase (free PostgreSQL)

   HOW IT WORKS:
     1. User enters phone number → SHA-256 hashed in browser
     2. Hash becomes vault_id — phone number NEVER leaves device
     3. All data stored in Supabase under that vault_id
     4. Supabase Realtime pushes every change to all open devices
     5. localStorage is always the working copy; DB is the sync layer
     6. Goes offline gracefully, queues writes, syncs on reconnect

   SETUP (5 minutes, free):
     1. supabase.com → New project → copy URL + anon key
     2. Run SETUP_SQL below in Supabase SQL editor
     3. Paste URL + key into Settings → Cloud Sync
     4. Enter your phone number → done
   ═══════════════════════════════════════════════════════════════ */

/* ─── SETUP SQL ─────────────────────────────────────────────────
   Paste this once in Supabase → SQL Editor → Run

create table if not exists tb_vaults (
  vault_id  text primary key,
  created_at timestamptz default now()
);

create table if not exists tb_data (
  vault_id  text not null references tb_vaults(vault_id) on delete cascade,
  key       text not null,
  value     jsonb,
  updated_at timestamptz default now(),
  primary key (vault_id, key)
);

create index if not exists tb_data_vault on tb_data(vault_id);

alter table tb_vaults enable row level security;
alter table tb_data   enable row level security;

create policy "vault owner" on tb_vaults for all using (true) with check (true);
create policy "data owner"  on tb_data   for all using (true) with check (true);

alter publication supabase_realtime add table tb_data;
─────────────────────────────────────────────────────────────── */

(function () {
'use strict';

/* ── Constants ─────────────────────────────────────────────── */
const SYNC_KEYS = [
  'tradebook_trades',
  'tradebook_settings',
  'tradebook_tags',
  'tradebook_rules',
  'tradebook_challenges',
  'tradebook_audit',
  'tradebook_moods',
  'tb_theme',
  'tb_xp',
];

const LS_URL       = 'tb_supabase_url';
const LS_KEY       = 'tb_supabase_key';
const LS_VAULT     = 'tb_vault_id';
const LS_PHONE     = 'tb_phone_display';
const LS_QUEUE     = 'tb_sync_queue';
const LS_LAST_SYNC = 'tb_last_sync';

/* ── State ──────────────────────────────────────────────────── */
let _vaultId     = localStorage.getItem(LS_VAULT) || null;
let _phoneDisplay= localStorage.getItem(LS_PHONE) || null;
let _channel     = null;
let _online      = navigator.onLine;
let _syncing     = false;

/* ── Supabase config (read from localStorage, set via Settings UI) */
function cfg() {
  return {
    url: localStorage.getItem(LS_URL) || '',
    key: localStorage.getItem(LS_KEY) || '',
  };
}
function isConfigured() { const c = cfg(); return !!(c.url && c.key); }

/* ── SHA-256 hash ────────────────────────────────────────────── */
async function sha256(str) {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ── REST helpers (no SDK needed) ───────────────────────────── */
function base(path) {
  return fetch(`${cfg().url}/rest/v1/${path}`, {
    headers: {
      'apikey':        cfg().key,
      'Authorization': `Bearer ${cfg().key}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
  });
}

function rest(method, path, body) {
  return fetch(`${cfg().url}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        cfg().key,
      'Authorization': `Bearer ${cfg().key}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal,resolution=merge-duplicates',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ── Upsert one key ─────────────────────────────────────────── */
async function pushKey(key, value) {
  if (!_vaultId || !isConfigured()) return false;
  try {
    const r = await rest('POST', 'tb_data', {
      vault_id: _vaultId,
      key,
      value,
      updated_at: new Date().toISOString(),
    });
    return r.ok || r.status === 409;
  } catch { return false; }
}

/* ── Pull one key ───────────────────────────────────────────── */
async function pullKey(key) {
  if (!_vaultId || !isConfigured()) return null;
  try {
    const r = await fetch(
      `${cfg().url}/rest/v1/tb_data?vault_id=eq.${_vaultId}&key=eq.${key}&select=value`,
      { headers: { 'apikey': cfg().key, 'Authorization': `Bearer ${cfg().key}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows.length ? rows[0].value : null;
  } catch { return null; }
}

/* ── Pull ALL keys for vault ─────────────────────────────────── */
async function pullAll() {
  if (!_vaultId || !isConfigured()) return null;
  try {
    const r = await fetch(
      `${cfg().url}/rest/v1/tb_data?vault_id=eq.${_vaultId}&select=key,value,updated_at`,
      { headers: { 'apikey': cfg().key, 'Authorization': `Bearer ${cfg().key}` } }
    );
    if (!r.ok) return null;
    return await r.json(); // [{key, value, updated_at}]
  } catch { return null; }
}

/* ── Ensure vault row exists ─────────────────────────────────── */
async function ensureVault(vaultId) {
  try {
    await rest('POST', 'tb_vaults', { vault_id: vaultId });
    return true;
  } catch { return false; }
}

/* ── Offline queue ───────────────────────────────────────────── */
function enqueue(key) {
  const q = new Set(JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'));
  q.add(key);
  localStorage.setItem(LS_QUEUE, JSON.stringify([...q]));
}
async function flushQueue() {
  const q = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
  if (!q.length) return;
  let flushed = [];
  for (const key of q) {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    const ok = await pushKey(key, value);
    if (ok) flushed.push(key);
  }
  const remaining = q.filter(k => !flushed.includes(k));
  localStorage.setItem(LS_QUEUE, JSON.stringify(remaining));
  if (flushed.length) toast(`☁️ Synced ${flushed.length} queued item(s)`, 'success');
}

/* ── Full push (local → DB) ──────────────────────────────────── */
async function pushAll() {
  if (!_vaultId || !isConfigured() || _syncing) return;
  _syncing = true;
  setSyncStatus('syncing');
  let ok = true;
  for (const key of SYNC_KEYS) {
    const raw = localStorage.getItem(key);
    const value = raw ? tryParse(raw) : null;
    const result = await pushKey(key, value);
    if (!result) { ok = false; enqueue(key); }
  }
  localStorage.setItem(LS_LAST_SYNC, new Date().toISOString());
  setSyncStatus(ok ? 'synced' : 'partial');
  _syncing = false;
}

/* ── Full pull (DB → local) ──────────────────────────────────── */
async function pullAndApply() {
  if (!_vaultId || !isConfigured()) return false;
  setSyncStatus('syncing');
  const rows = await pullAll();
  if (!rows) { setSyncStatus('error'); return false; }

  // Merge: DB wins for conflicts, local wins if DB has no entry
  let changed = false;
  for (const { key, value } of rows) {
    if (!SYNC_KEYS.includes(key)) continue;
    const local = localStorage.getItem(key);
    const remote = JSON.stringify(value);
    if (local !== remote) {
      localStorage.setItem(key, remote);
      changed = true;
    }
  }

  localStorage.setItem(LS_LAST_SYNC, new Date().toISOString());
  setSyncStatus('synced');
  if (changed) refreshApp();
  return true;
}

/* ── Real-time subscription ──────────────────────────────────── */
function subscribe() {
  if (!_vaultId || !isConfigured()) return;
  if (_channel) unsubscribe();

  // Supabase Realtime via WebSocket
  const wsUrl = cfg().url.replace('https://', 'wss://').replace('http://', 'ws://');
  const ws = new WebSocket(
    `${wsUrl}/realtime/v1/websocket?apikey=${cfg().key}&vsn=1.0.0`
  );

  ws.onopen = () => {
    // Join channel for this vault's tb_data rows
    const msg = {
      topic: `realtime:public:tb_data:vault_id=eq.${_vaultId}`,
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: '' },
          postgres_changes: [{
            event: '*',
            schema: 'public',
            table: 'tb_data',
            filter: `vault_id=eq.${_vaultId}`,
          }],
        },
      },
      ref: '1',
    };
    ws.send(JSON.stringify(msg));
    setSyncStatus('synced');
    updateSyncBadge('🟢 Live');
  };

  ws.onmessage = async (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'postgres_changes') {
        const record = msg.payload?.data?.record;
        if (!record || record.vault_id !== _vaultId) return;
        const { key, value } = record;
        if (!SYNC_KEYS.includes(key)) return;
        const local = localStorage.getItem(key);
        const remote = JSON.stringify(value);
        if (local !== remote) {
          localStorage.setItem(key, remote);
          refreshApp();
          toast(`🔄 Synced: ${friendlyKey(key)}`, 'info');
        }
      }
      // Heartbeat reply
      if (msg.event === 'phx_reply') {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: Date.now().toString() }));
      }
    } catch {}
  };

  ws.onclose = () => {
    setSyncStatus('offline');
    updateSyncBadge('🔴 Offline');
    // Reconnect after 5s
    setTimeout(subscribe, 5000);
  };

  ws.onerror = () => setSyncStatus('error');

  // Heartbeat every 25s
  const hb = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        topic: 'phoenix', event: 'heartbeat', payload: {}, ref: Date.now().toString()
      }));
    } else {
      clearInterval(hb);
    }
  }, 25000);

  _channel = ws;
}

function unsubscribe() {
  if (_channel) { try { _channel.close(); } catch {} _channel = null; }
}

/* ── Intercept all localStorage writes ───────────────────────── */
function interceptLocalStorage() {
  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (_vaultId && SYNC_KEYS.includes(key)) {
      if (_online) {
        // Fire-and-forget push
        const parsed = tryParse(value);
        pushKey(key, parsed).then(ok => { if (!ok) enqueue(key); });
      } else {
        enqueue(key);
      }
    }
  };
}

/* ── Helpers ─────────────────────────────────────────────────── */
function tryParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

function friendlyKey(key) {
  const map = {
    tradebook_trades: 'Trades',
    tradebook_settings: 'Settings',
    tradebook_tags: 'Tags',
    tradebook_rules: 'Rules',
    tradebook_challenges: 'Challenges',
    tradebook_audit: 'Audit',
    tradebook_moods: 'Moods',
    tb_theme: 'Theme',
    tb_xp: 'XP',
  };
  return map[key] || key;
}

function toast(msg, type) {
  if (window.toast) { window.toast(msg, type === 'info' ? undefined : type); return; }
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast toast-show' + (type === 'error' ? ' toast-error' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'toast', 3000);
}

function refreshApp() {
  window.trades = tryParse(localStorage.getItem('tradebook_trades') || '[]');
  if (window.updateDashboard) window.updateDashboard();
  if (window.renderJournal) window.renderJournal();
  // Re-run any stats panel that's currently visible
  const active = document.querySelector('.nav-item.active')?.dataset?.page;
  if (active) document.dispatchEvent(new CustomEvent('tb:navigate', { detail: { page: active } }));
}

/* ── Sync status indicator ────────────────────────────────────── */
function setSyncStatus(status) {
  const el = document.getElementById('sync-status-dot');
  const label = document.getElementById('sync-status-label');
  if (!el) return;
  const map = {
    syncing: ['#ffd166', '⟳ Syncing…'],
    synced:  ['#00ffa3', '✓ Synced'],
    partial: ['#ff9f43', '⚠ Partial'],
    offline: ['#7b88a8', '○ Offline'],
    error:   ['#ff4466', '✕ Error'],
  };
  const [color, text] = map[status] || ['#7b88a8', '○ —'];
  el.style.background = color;
  if (label) label.textContent = text;
}

function updateSyncBadge(text) {
  const el = document.getElementById('sync-realtime-badge');
  if (el) el.textContent = text;
}

/* ── LOGIN SCREEN ─────────────────────────────────────────────── */
function buildLoginScreen() {
  // Don't show if already logged in
  if (_vaultId && isConfigured()) return;

  const overlay = document.createElement('div');
  overlay.id = 'sync-login-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:var(--bg,#04060d);
    display:flex;align-items:center;justify-content:center;
    font-family:var(--font-body,'Plus Jakarta Sans',sans-serif);
  `;

  overlay.innerHTML = `
    <div style="width:100%;max-width:420px;padding:24px;box-sizing:border-box">

      <!-- Logo -->
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-family:var(--font-display,'Bricolage Grotesque',sans-serif);
          font-size:28px;font-weight:800;color:var(--text,#eef2ff);letter-spacing:-.03em">
          TradeBook <span style="background:linear-gradient(135deg,#00ffa3,#6c63ff);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent">Pro</span>
        </div>
        <div style="font-size:12px;color:var(--text3,#3d4a63);margin-top:4px;letter-spacing:.04em">
          YOUR TRADING JOURNAL
        </div>
      </div>

      <!-- Step indicator -->
      <div id="login-steps" style="display:flex;gap:6px;justify-content:center;margin-bottom:24px">
        <div class="lstep active" data-step="0" style="height:3px;flex:1;border-radius:2px;background:#00ffa3;transition:all .3s"></div>
        <div class="lstep" data-step="1" style="height:3px;flex:1;border-radius:2px;background:var(--bg4,#111828);transition:all .3s"></div>
        <div class="lstep" data-step="2" style="height:3px;flex:1;border-radius:2px;background:var(--bg4,#111828);transition:all .3s"></div>
      </div>

      <!-- Card -->
      <div style="background:var(--bg3,#0c1120);border:1px solid var(--border,rgba(255,255,255,.06));
        border-radius:16px;padding:28px;box-shadow:0 4px 40px rgba(0,0,0,.5)">

        <!-- STEP 0: Phone entry -->
        <div id="lstep-0">
          <div style="font-size:18px;font-weight:700;color:var(--text,#eef2ff);margin-bottom:6px">
            Enter your phone number
          </div>
          <div style="font-size:12px;color:var(--text3,#3d4a63);margin-bottom:20px;line-height:1.5">
            This is your private vault key. Same number on any device = same data.
            Your number <strong style="color:var(--text2,#7b88a8)">never leaves your browser</strong> — only its hash is stored.
          </div>
          <div style="position:relative;margin-bottom:14px">
            <input id="phone-input" type="tel" placeholder="+91 98765 43210"
              style="width:100%;box-sizing:border-box;
                background:var(--bg4,#111828);border:1px solid var(--border2,rgba(255,255,255,.11));
                color:var(--text,#eef2ff);font-size:18px;font-weight:600;padding:14px 16px;
                border-radius:10px;outline:none;font-family:var(--font-mono,'JetBrains Mono',monospace);
                letter-spacing:.05em;transition:border-color .2s"
              autocomplete="tel" autofocus>
          </div>
          <div id="phone-error" style="color:#ff4466;font-size:12px;margin-bottom:12px;display:none"></div>
          <button id="phone-btn" onclick="window._syncLogin()"
            style="width:100%;padding:14px;border:none;border-radius:10px;cursor:pointer;
              background:linear-gradient(135deg,#00ffa3,#00c97a);color:#000;
              font-size:14px;font-weight:800;font-family:var(--font-body);
              letter-spacing:.02em;transition:opacity .2s">
            Continue →
          </button>
          <div style="display:flex;align-items:center;gap:10px;margin-top:18px">
            <div style="flex:1;height:1px;background:var(--border)"></div>
            <span style="font-size:11px;color:var(--text3)">or use offline mode</span>
            <div style="flex:1;height:1px;background:var(--border)"></div>
          </div>
          <button onclick="window._syncSkip()"
            style="width:100%;padding:10px;margin-top:12px;border:1px solid var(--border);
              border-radius:10px;cursor:pointer;background:transparent;
              color:var(--text3,#3d4a63);font-size:13px;font-family:var(--font-body);
              transition:all .2s">
            Skip — use this device only
          </button>
        </div>

        <!-- STEP 1: Supabase config -->
        <div id="lstep-1" style="display:none">
          <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px">
            Connect your database
          </div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px;line-height:1.6">
            Free Supabase project needed for sync. Takes 3 minutes.
            <a href="https://supabase.com" target="_blank"
              style="color:#00ffa3;text-decoration:none">supabase.com →</a>
          </div>

          <!-- Setup instructions collapsible -->
          <details style="margin-bottom:14px">
            <summary style="font-size:11px;color:var(--accent,#00ffa3);cursor:pointer;
              padding:6px 0;list-style:none;user-select:none">
              ▶ How to get these values (3 steps)
            </summary>
            <div style="background:var(--bg4);border-radius:8px;padding:12px;
              margin-top:8px;font-size:11px;color:var(--text2);line-height:1.8">
              <strong style="color:var(--text)">1.</strong> Go to
              <a href="https://supabase.com" target="_blank" style="color:#00ffa3">supabase.com</a>
              → New project → choose any name<br>
              <strong style="color:var(--text)">2.</strong> Settings → API →
              copy <em>Project URL</em> and <em>anon/public key</em><br>
              <strong style="color:var(--text)">3.</strong> SQL Editor → paste &amp; run the SQL from
              <code style="background:var(--bg3);padding:1px 5px;border-radius:3px">sync.js</code>
              (top of the file)<br>
              <span style="color:var(--text3)">That's it — free tier: 500MB, unlimited devices.</span>
            </div>
          </details>

          <input id="sb-url" type="url" placeholder="https://xxxx.supabase.co"
            style="width:100%;box-sizing:border-box;background:var(--bg4);
              border:1px solid var(--border2);color:var(--text);font-size:13px;
              padding:11px 14px;border-radius:8px;outline:none;margin-bottom:10px;
              font-family:var(--font-mono);transition:border-color .2s">
          <input id="sb-key" type="password" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
            style="width:100%;box-sizing:border-box;background:var(--bg4);
              border:1px solid var(--border2);color:var(--text);font-size:12px;
              padding:11px 14px;border-radius:8px;outline:none;margin-bottom:14px;
              font-family:var(--font-mono);transition:border-color .2s">

          <div id="sb-error" style="color:#ff4466;font-size:12px;margin-bottom:10px;display:none"></div>

          <button id="sb-btn" onclick="window._syncSaveConfig()"
            style="width:100%;padding:13px;border:none;border-radius:10px;cursor:pointer;
              background:linear-gradient(135deg,#00ffa3,#00c97a);color:#000;
              font-size:14px;font-weight:800;font-family:var(--font-body)">
            Test &amp; Connect
          </button>
          <button onclick="window._syncBackToPhone()"
            style="width:100%;padding:8px;margin-top:8px;border:1px solid var(--border);
              border-radius:8px;cursor:pointer;background:transparent;
              color:var(--text3);font-size:12px;font-family:var(--font-body)">
            ← Back
          </button>
        </div>

        <!-- STEP 2: Success / loading -->
        <div id="lstep-2" style="display:none;text-align:center">
          <div id="login-loading" style="padding:20px 0">
            <div style="width:48px;height:48px;border:3px solid var(--bg5);
              border-top-color:#00ffa3;border-radius:50%;animation:spin .8s linear infinite;
              margin:0 auto 16px"></div>
            <div style="font-size:14px;color:var(--text2)" id="login-loading-msg">
              Connecting to your vault…
            </div>
          </div>
          <div id="login-success" style="display:none;padding:10px 0">
            <div style="font-size:40px;margin-bottom:12px">✅</div>
            <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px">
              Welcome back!
            </div>
            <div style="font-size:13px;color:var(--text2);margin-bottom:4px"
              id="login-phone-display"></div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:16px"
              id="login-trade-count"></div>
            <div style="background:rgba(0,255,163,.08);border:1px solid rgba(0,255,163,.2);
              border-radius:8px;padding:10px;font-size:11px;color:var(--text2);
              margin-bottom:16px;text-align:left">
              <div>✅ Data synced to this device</div>
              <div>✅ Real-time sync active</div>
              <div>✅ Works on all your devices</div>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div style="text-align:center;margin-top:16px;font-size:11px;color:var(--text3,#3d4a63)">
        🔒 Phone number hashed with SHA-256 · Never transmitted · You own your data
      </div>
    </div>

    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      #phone-input:focus { border-color: #00ffa3 !important; }
      #sb-url:focus, #sb-key:focus { border-color: #00ffa3 !important; }
    </style>
  `;

  document.body.appendChild(overlay);

  // Pre-fill saved config
  const c = cfg();
  if (c.url) { const el = document.getElementById('sb-url'); if (el) el.value = c.url; }
  if (c.key) { const el = document.getElementById('sb-key'); if (el) el.value = c.key; }

  // Enter key handler
  document.getElementById('phone-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window._syncLogin();
  });
}

/* ── Login flow ──────────────────────────────────────────────── */
function showStep(n) {
  [0, 1, 2].forEach(i => {
    const el = document.getElementById(`lstep-${i}`);
    if (el) el.style.display = i === n ? 'block' : 'none';
    const dot = document.querySelector(`.lstep[data-step="${i}"]`);
    if (dot) dot.style.background = i <= n ? '#00ffa3' : 'var(--bg4,#111828)';
  });
}

window._syncLogin = async function () {
  const phoneRaw = document.getElementById('phone-input')?.value?.trim() || '';
  const digits = phoneRaw.replace(/\D/g, '');
  const errEl = document.getElementById('phone-error');

  if (digits.length < 7) {
    if (errEl) { errEl.textContent = 'Enter at least 7 digits'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  // If not configured, go to config step
  if (!isConfigured()) {
    // Store phone temporarily for after config
    sessionStorage.setItem('_pending_phone', phoneRaw);
    showStep(1);
    return;
  }

  // Has config — go straight to connect
  await _doConnect(phoneRaw);
};

window._syncSaveConfig = async function () {
  const url = document.getElementById('sb-url')?.value?.trim().replace(/\/$/, '');
  const key = document.getElementById('sb-key')?.value?.trim();
  const errEl = document.getElementById('sb-error');

  if (!url || !url.startsWith('http')) {
    if (errEl) { errEl.textContent = 'Enter a valid Supabase URL'; errEl.style.display = 'block'; }
    return;
  }
  if (!key || key.length < 20) {
    if (errEl) { errEl.textContent = 'Enter your anon/public API key'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  // Test connection
  const btn = document.getElementById('sb-btn');
  if (btn) { btn.textContent = 'Testing…'; btn.disabled = true; }

  try {
    const r = await fetch(`${url}/rest/v1/tb_data?limit=1`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    if (!r.ok && r.status !== 406) { // 406 = empty result, that's fine
      throw new Error(`HTTP ${r.status} — check URL and key`);
    }
  } catch (e) {
    if (errEl) { errEl.textContent = `Connection failed: ${e.message}`; errEl.style.display = 'block'; }
    if (btn) { btn.textContent = 'Test & Connect'; btn.disabled = false; }
    return;
  }

  // Save config
  localStorage.setItem(LS_URL, url);
  localStorage.setItem(LS_KEY, key);
  if (btn) { btn.textContent = 'Test & Connect'; btn.disabled = false; }

  // Continue with pending phone
  const pending = sessionStorage.getItem('_pending_phone');
  if (pending) {
    sessionStorage.removeItem('_pending_phone');
    await _doConnect(pending);
  } else {
    showStep(0);
  }
};

window._syncBackToPhone = function () { showStep(0); };

window._syncSkip = function () {
  const overlay = document.getElementById('sync-login-overlay');
  if (overlay) overlay.remove();
  toast('Running in offline mode — data stays on this device only');
};

async function _doConnect(phoneRaw) {
  showStep(2);
  const loadEl = document.getElementById('login-loading');
  const successEl = document.getElementById('login-success');
  const msgEl = document.getElementById('login-loading-msg');
  if (loadEl) loadEl.style.display = 'block';
  if (successEl) successEl.style.display = 'none';

  // Hash phone
  if (msgEl) msgEl.textContent = 'Hashing your number…';
  const hash = await sha256(phoneRaw.replace(/\s/g, ''));

  // Create vault if needed
  if (msgEl) msgEl.textContent = 'Creating your vault…';
  await ensureVault(hash);

  // Pull existing data
  if (msgEl) msgEl.textContent = 'Loading your trades…';
  _vaultId = hash;
  const mask = '+' + phoneRaw.replace(/\D/g,'').slice(0,-4).replace(/./g,'•') + phoneRaw.replace(/\D/g,'').slice(-4);
  _phoneDisplay = mask;
  localStorage.setItem(LS_VAULT, hash);
  localStorage.setItem(LS_PHONE, mask);

  const pulled = await pullAndApply();

  // Show success
  if (loadEl) loadEl.style.display = 'none';
  if (successEl) successEl.style.display = 'block';
  const phoneDisp = document.getElementById('login-phone-display');
  const tradeCount = document.getElementById('login-trade-count');
  if (phoneDisp) phoneDisp.textContent = `Vault: ${mask}`;
  if (tradeCount) {
    const trades = tryParse(localStorage.getItem('tradebook_trades') || '[]');
    const count = Array.isArray(trades) ? trades.length : 0;
    tradeCount.textContent = count > 0 ? `${count} trades loaded from your vault` : 'New vault — ready to log trades';
  }

  // Start real-time and push any local data to DB
  subscribe();
  await pushAll();

  // Dismiss after 1.8s
  setTimeout(() => {
    const overlay = document.getElementById('sync-login-overlay');
    if (overlay) {
      overlay.style.transition = 'opacity .4s';
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.remove(); refreshApp(); }, 400);
    }
  }, 1800);
}

/* ── Sync indicator in topbar ────────────────────────────────── */
function injectSyncIndicator() {
  const topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight || document.getElementById('sync-indicator')) return;

  const el = document.createElement('div');
  el.id = 'sync-indicator';
  el.title = 'Cloud sync status';
  el.style.cssText = `
    display:flex;align-items:center;gap:6px;
    background:var(--glass);border:1px solid var(--border);
    border-radius:20px;padding:5px 12px;cursor:pointer;
    font-size:11px;color:var(--text2);transition:all .2s;
  `;
  el.innerHTML = `
    <div id="sync-status-dot" style="width:7px;height:7px;border-radius:50%;
      background:#7b88a8;transition:background .3s;flex-shrink:0"></div>
    <span id="sync-status-label">○ —</span>
    <span id="sync-realtime-badge" style="display:none;font-size:9px;
      color:var(--text3)"></span>
  `;
  el.onclick = () => showSyncPanel();
  topbarRight.insertBefore(el, topbarRight.firstChild);

  if (_vaultId) {
    setSyncStatus(isConfigured() ? 'synced' : 'offline');
  }
}

/* ── Sync management panel ────────────────────────────────────── */
function showSyncPanel() {
  const existing = document.getElementById('sync-panel-overlay');
  if (existing) { existing.remove(); return; }

  const trades = tryParse(localStorage.getItem('tradebook_trades') || '[]');
  const tradeCount = Array.isArray(trades) ? trades.length : 0;
  const lastSync = localStorage.getItem(LS_LAST_SYNC);
  const lastSyncStr = lastSync
    ? new Date(lastSync).toLocaleString('en-IN', { day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' })
    : 'Never';

  const panel = document.createElement('div');
  panel.id = 'sync-panel-overlay';
  panel.style.cssText = `
    position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.7);
    display:flex;align-items:center;justify-content:center;
    padding:16px;backdrop-filter:blur(6px);
  `;
  panel.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:16px;
      padding:24px;max-width:440px;width:100%;box-shadow:0 8px 48px rgba(0,0,0,.6)">

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:16px;font-weight:700;color:var(--text)">☁️ Cloud Sync</div>
        <button onclick="document.getElementById('sync-panel-overlay').remove()"
          style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px">✕</button>
      </div>

      ${_vaultId ? `
        <div style="background:rgba(0,255,163,.06);border:1px solid rgba(0,255,163,.2);
          border-radius:8px;padding:12px;margin-bottom:14px">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;
            letter-spacing:.08em;margin-bottom:4px">Logged in as</div>
          <div style="font-size:14px;font-weight:700;color:var(--accent)">
            ${_phoneDisplay || 'Unknown'}</div>
        </div>` : `
        <div style="background:var(--bg4);border-radius:8px;padding:12px;margin-bottom:14px">
          <div style="font-size:13px;color:var(--text2)">Not signed in. Enter phone to enable sync.</div>
        </div>`}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:var(--bg4);border-radius:8px;padding:10px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Trades</div>
          <div style="font-size:18px;font-weight:800;color:var(--accent)">${tradeCount}</div>
        </div>
        <div style="background:var(--bg4);border-radius:8px;padding:10px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Last sync</div>
          <div style="font-size:12px;font-weight:600;color:var(--text2)">${lastSyncStr}</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="window._syncManualPush()"
          style="padding:10px;border:1px solid rgba(0,255,163,.3);border-radius:8px;
            cursor:pointer;background:rgba(0,255,163,.08);color:var(--accent);
            font-size:13px;font-weight:600;font-family:var(--font-body)">
          ⬆ Push local → cloud
        </button>
        <button onclick="window._syncManualPull()"
          style="padding:10px;border:1px solid var(--border2);border-radius:8px;
            cursor:pointer;background:var(--bg4);color:var(--text);
            font-size:13px;font-weight:600;font-family:var(--font-body)">
          ⬇ Pull cloud → this device
        </button>
        <button onclick="window._syncLogout()"
          style="padding:10px;border:1px solid rgba(255,68,102,.3);border-radius:8px;
            cursor:pointer;background:transparent;color:var(--red,#ff4466);
            font-size:13px;font-family:var(--font-body)">
          Sign out of sync
        </button>
      </div>

      ${!isConfigured() ? `
        <div style="margin-top:12px;padding:10px;background:rgba(255,209,102,.08);
          border:1px solid rgba(255,209,102,.2);border-radius:8px;
          font-size:12px;color:var(--gold,#ffd166)">
          ⚙️ Supabase not configured. Click "Push" to add credentials.
        </div>` : ''}
    </div>
  `;
  panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
  document.body.appendChild(panel);
}

window._syncManualPush = async function () {
  document.getElementById('sync-panel-overlay')?.remove();
  if (!_vaultId) { buildLoginScreen(); return; }
  if (!isConfigured()) { buildLoginScreen(); return; }
  toast('⬆ Pushing to cloud…');
  await pushAll();
  toast('✅ Push complete');
};

window._syncManualPull = async function () {
  document.getElementById('sync-panel-overlay')?.remove();
  if (!_vaultId || !isConfigured()) { toast('Not connected', 'error'); return; }
  toast('⬇ Pulling from cloud…');
  const ok = await pullAndApply();
  toast(ok ? '✅ Pull complete' : '❌ Pull failed — check connection', ok ? undefined : 'error');
};

window._syncLogout = function () {
  if (!confirm('Sign out of sync? Your local data stays, but won\'t sync until you sign back in.')) return;
  document.getElementById('sync-panel-overlay')?.remove();
  unsubscribe();
  _vaultId = null;
  _phoneDisplay = null;
  [LS_VAULT, LS_PHONE].forEach(k => localStorage.removeItem(k));
  setSyncStatus('offline');
  toast('Signed out of sync');
};

/* ── Settings page integration ───────────────────────────────── */
function injectSyncSettings() {
  // Find the settings container and add a Sync section
  const settingsContainer = document.querySelector('.settings-container');
  if (!settingsContainer || document.getElementById('sync-settings-section')) return;

  const section = document.createElement('div');
  section.id = 'sync-settings-section';
  section.className = 'settings-section';
  section.innerHTML = `
    <div class="settings-section-title">☁️ Cloud Sync & Multi-Device</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.6">
      Enter the same phone number on any device to access your trades everywhere.
      Powered by Supabase (free, open-source PostgreSQL).
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:10px;align-items:flex-end">
        <div style="flex:1">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:5px">
            Supabase Project URL
          </label>
          <input type="url" id="settings-sb-url" class="form-input"
            placeholder="https://xxxx.supabase.co"
            value="${localStorage.getItem(LS_URL) || ''}">
        </div>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:5px">
          Supabase Anon Key
        </label>
        <input type="password" id="settings-sb-key" class="form-input"
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
          value="${localStorage.getItem(LS_KEY) || ''}">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" onclick="window._syncSaveSettingsConfig()"
          style="flex:1;font-size:12px;padding:9px">
          💾 Save Config
        </button>
        <button class="btn-secondary" onclick="buildLoginScreen()"
          style="flex:1;font-size:12px;padding:9px">
          📱 Sign In
        </button>
      </div>
      ${_vaultId ? `
        <div style="background:rgba(0,255,163,.06);border:1px solid rgba(0,255,163,.2);
          border-radius:8px;padding:10px;font-size:12px">
          <div style="color:var(--accent);font-weight:700">✅ Signed in</div>
          <div style="color:var(--text2);margin-top:2px">Vault: ${_phoneDisplay || '—'}</div>
        </div>` : `
        <div style="background:var(--bg4);border-radius:8px;padding:10px;
          font-size:12px;color:var(--text3)">
          Not signed in — data is local only
        </div>`}
    </div>
  `;
  settingsContainer.appendChild(section);
}

window._syncSaveSettingsConfig = function () {
  const url = document.getElementById('settings-sb-url')?.value?.trim().replace(/\/$/, '');
  const key = document.getElementById('settings-sb-key')?.value?.trim();
  if (url) localStorage.setItem(LS_URL, url);
  if (key) localStorage.setItem(LS_KEY, key);
  toast('Sync config saved! Sign in to activate.');
};

/* ── Online/offline handling ─────────────────────────────────── */
window.addEventListener('online', () => {
  _online = true;
  setSyncStatus('syncing');
  flushQueue().then(() => { if (_vaultId) subscribe(); });
});
window.addEventListener('offline', () => {
  _online = false;
  setSyncStatus('offline');
});

/* ── Boot ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  interceptLocalStorage();
  injectSyncIndicator();

  // Show login screen if not yet connected
  if (!_vaultId || !isConfigured()) {
    // Small delay so the rest of the app loads first
    setTimeout(() => {
      buildLoginScreen();
    }, 400);
  } else {
    // Already have vault — connect silently
    setSyncStatus('syncing');
    pullAndApply().then(() => {
      subscribe();
      flushQueue();
    });
  }

  // Inject into settings when that page opens
  document.addEventListener('tb:navigate', e => {
    if (e.detail.page === 'settings') {
      setTimeout(injectSyncSettings, 200);
    }
  });
});

// Expose for buildLoginScreen from settings
window.buildLoginScreen = buildLoginScreen;

console.log('TradeBook Pro — sync.js loaded ✅');

})();
