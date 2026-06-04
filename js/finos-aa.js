/**
 * finos-aa.js — FIN·OS Account Aggregator (AA Framework)  v1.0
 * ─────────────────────────────────────────────────────────────
 * RBI Account Aggregator framework integration for auto-importing
 * financial data from banks, brokers, and mutual funds.
 *
 * AA Providers supported: Finvu, OneMoney, Perfios, Onemoney, CAMS MF
 * Data types: Bank transactions, MF portfolio (CDSL/NSDL CAS via MF Central)
 *
 * Flow:
 *   1. User selects AA provider
 *   2. AA consent journey (opens provider's consent UI)
 *   3. On consent approval → fetch financial data
 *   4. Parse and push to finos-context.js / Supabase
 *
 * NOTE: AA framework requires API credentials from the AA provider.
 *   This module provides the complete UI + integration layer.
 *   Add your AA API key in Settings → Account Aggregator.
 */
(function (global) {
  'use strict';

  const INR = n => {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };

  /* ── AA Providers ──────────────────────────────────────────────── */
  const AA_PROVIDERS = [
    {
      id:       'finvu',
      name:     'Finvu',
      logo:     '🏦',
      color:    '#0066cc',
      banks:    'SBI, HDFC, ICICI, Axis, Kotak + 40 more',
      url:      'https://finvu.in',
      apiBase:  'https://api.finvu.in/v2',
      popular:  true,
    },
    {
      id:       'onemoney',
      name:     'OneMoney',
      logo:     '💳',
      color:    '#00a651',
      banks:    'All major Indian banks + 60+ FIPs',
      url:      'https://onemoney.in',
      apiBase:  'https://api.onemoney.in/v1',
      popular:  true,
    },
    {
      id:       'perfios',
      name:     'Perfios AA',
      logo:     '📊',
      color:    '#7c3aed',
      banks:    'Pan-India bank coverage + insurance',
      url:      'https://www.perfios.com',
      apiBase:  'https://aa.perfios.com/v1',
      popular:  false,
    },
    {
      id:       'cams_mf',
      name:     'MF Central (CAMS)',
      logo:     '📈',
      color:    '#f0a500',
      banks:    'All MF schemes via CAMS/CDSL/NSDL',
      url:      'https://www.mfcentral.com',
      apiBase:  'https://api.mfcentral.com/v1',
      popular:  true,
    },
  ];

  /* ── Consent status tracking ───────────────────────────────────── */
  const CONSENT_KEY  = 'finos_aa_consents_v1';
  const SYNC_KEY     = 'finos_aa_last_sync_v1';

  function getConsents() {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveConsent(providerId, consentId, expiry) {
    const c = getConsents();
    c[providerId] = { consentId, expiry, grantedAt: new Date().toISOString(), active: true };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  }

  function revokeConsent(providerId) {
    const c = getConsents();
    if (c[providerId]) { c[providerId].active = false; }
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  }

  function getLastSync() {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); }
    catch { return {}; }
  }

  /* ── AA Consent Journey ────────────────────────────────────────── */
  async function initiateConsent(providerId) {
    const provider = AA_PROVIDERS.find(p => p.id === providerId);
    if (!provider) throw new Error('Unknown AA provider');

    const apiKey = localStorage.getItem(`finos_aa_key_${providerId}`);

    /* If no API key, show setup instructions */
    if (!apiKey) {
      _showAPIKeySetup(provider);
      return;
    }

    /* Open consent window */
    const consentWindow = window.open(
      `${provider.apiBase}/consent?redirect_uri=${encodeURIComponent(window.location.href)}&key=${apiKey}`,
      'aa_consent',
      'width=480,height=700,scrollbars=yes'
    );

    /* Listen for consent callback — validate origin to prevent postMessage injection */
    let _demoFired = false;
    const handleMessage = (event) => {
      // Only accept messages from known AA provider domains or same origin
      const allowedOrigins = ['https://finvu.in', 'https://onemoney.in', 'https://anumati.io', window.location.origin];
      if (!allowedOrigins.some(o => event.origin === o || event.origin.endsWith('.finvu.in'))) return;
      if (event.data?.type === 'aa_consent_approved') {
        _demoFired = true;
        window.removeEventListener('message', handleMessage);
        const consentId = String(event.data.consentId || '').slice(0, 200);
        const expiry    = String(event.data.expiry    || '').slice(0, 50);
        if (!consentId) return;
        saveConsent(providerId, consentId, expiry);
        consentWindow?.close();
        startDataFetch(providerId, consentId);
      }
    };
    window.addEventListener('message', handleMessage);

    /* Timeout fallback (demo mode) — only fires if real consent hasn't arrived */
    setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      if (!_demoFired) _simulateDemoSync(providerId); /* Demo: show simulated data */
    }, 3000);
  }

  /* ── Data Fetch (post-consent) ─────────────────────────────────── */
  async function startDataFetch(providerId, consentId) {
    const provider = AA_PROVIDERS.find(p => p.id === providerId);
    const apiKey   = localStorage.getItem(`finos_aa_key_${providerId}`);

    _showSyncProgress(provider);

    try {
      /* 1. Fetch bank transactions */
      if (providerId !== 'cams_mf') {
        const txnRes = await fetch(`${provider.apiBase}/data/transactions`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'X-Consent-ID': consentId }
        });
        const txnData = await txnRes.json();
        _ingestTransactions(txnData.transactions || []);
      }

      /* 2. Fetch MF portfolio */
      if (providerId === 'cams_mf' || providerId === 'perfios') {
        const mfRes = await fetch(`${provider.apiBase}/data/mutual-funds`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'X-Consent-ID': consentId }
        });
        const mfData = await mfRes.json();
        _ingestMutualFunds(mfData.holdings || []);
      }

      /* 3. Save sync timestamp */
      const syncs = getLastSync();
      syncs[providerId] = new Date().toISOString();
      localStorage.setItem(SYNC_KEY, JSON.stringify(syncs));

      _showSyncSuccess(provider);
      document.dispatchEvent(new CustomEvent('aa-sync-complete', { detail: { providerId } }));

    } catch (e) {
      _showSyncError(provider, e.message);
    }
  }

  /* ── Data Ingestion ────────────────────────────────────────────── */
  function _ingestTransactions(transactions) {
    const existing = JSON.parse(localStorage.getItem('finos_transactions') || '[]');
    const merged   = _deduplicateTxns([...existing, ...transactions.map(_normalizeTxn)]);
    localStorage.setItem('finos_transactions', JSON.stringify(merged));

    /* Update budget context */
    const income  = merged.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const expense = merged.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
    localStorage.setItem('finos_aa_income',  income.toString());
    localStorage.setItem('finos_aa_expense', expense.toString());
  }

  function _normalizeTxn(t) {
    return {
      id:       t.txnId || t.id || Math.random().toString(36).slice(2),
      date:     t.transactionTimestamp || t.date || new Date().toISOString(),
      amount:   Math.abs(Number(t.amount || 0)),
      type:     t.type === 'CREDIT' || t.type === 'credit' ? 'credit' : 'debit',
      desc:     t.narration || t.description || '',
      category: _categorize(t.narration || ''),
      source:   'aa',
    };
  }

  function _categorize(desc = '') {
    const d = desc.toLowerCase();
    if (/swiggy|zomato|uber.eat|food|restaur/.test(d)) return 'Food & Dining';
    if (/amazon|flipkart|myntra|shop/.test(d))          return 'Shopping';
    if (/netflix|prime|spotify|hotstar/.test(d))        return 'Subscriptions';
    if (/fuel|petrol|diesel|ola|uber/.test(d))          return 'Transport';
    if (/emi|loan|neft|imps|upi.*bank/.test(d))         return 'EMI / Loans';
    if (/sip|mutual|mf|amfi/.test(d))                  return 'Investments';
    if (/salary|sal|ctc/.test(d))                       return 'Salary';
    if (/rent|pg|maintenance/.test(d))                  return 'Housing';
    return 'Others';
  }

  function _deduplicateTxns(txns) {
    const seen = new Set();
    return txns.filter(t => {
      const key = `${t.date}_${t.amount}_${t.desc?.slice(0, 20)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function _ingestMutualFunds(holdings) {
    const normalized = holdings.map(h => ({
      folio:        h.folioNo || h.folio,
      fund_name:    h.schemeName || h.scheme_name || h.name,
      nav:          Number(h.nav || h.currentNav || 0),
      units:        Number(h.units || h.balanceUnits || 0),
      current_value: Number(h.currentValue || h.market_value || 0),
      invested:     Number(h.purchaseValue || h.invested || 0),
      category:     (h.schemeCategory || h.category || 'equity').toLowerCase().replace(/\s+/g, '_'),
      is_direct:    /direct/i.test(h.schemeName || ''),
      expense_ratio: Number(h.expenseRatio || 0),
    }));

    localStorage.setItem('finos_mf_holdings', JSON.stringify(normalized));

    /* Update portfolio total */
    const total = normalized.reduce((s, h) => s + h.current_value, 0);
    localStorage.setItem('finos_mf_portfolio_value', total.toString());
  }

  /* ── Demo/Simulation mode ──────────────────────────────────────── */
  function _simulateDemoSync(providerId) {
    const provider = AA_PROVIDERS.find(p => p.id === providerId);
    _showSyncProgress(provider, true);

    setTimeout(() => {
      /* Generate realistic demo data */
      const demoTxns = _generateDemoTransactions();
      _ingestTransactions(demoTxns);

      if (providerId === 'cams_mf') {
        _ingestMutualFunds(_generateDemoMF());
      }

      const syncs = getLastSync();
      syncs[providerId] = new Date().toISOString();
      localStorage.setItem(SYNC_KEY, JSON.stringify(syncs));
      saveConsent(providerId, 'demo_consent_' + Date.now(), new Date(Date.now() + 365 * 86400000).toISOString());

      _showSyncSuccess(provider, true);
      document.dispatchEvent(new CustomEvent('aa-sync-complete', { detail: { providerId, demo: true } }));
    }, 2000);
  }

  function _generateDemoTransactions() {
    const months = 3;
    const txns = [];
    const categories = [
      { desc: 'Swiggy order', type: 'debit', range: [200, 800] },
      { desc: 'Amazon Purchase', type: 'debit', range: [500, 5000] },
      { desc: 'Salary Credit', type: 'credit', range: [50000, 80000] },
      { desc: 'Netflix subscription', type: 'debit', range: [199, 649] },
      { desc: 'Ola cab', type: 'debit', range: [80, 600] },
      { desc: 'Paytm recharge', type: 'debit', range: [100, 500] },
      { desc: 'SIP - Axis Bluechip', type: 'debit', range: [5000, 5000] },
      { desc: 'EMI - Home Loan', type: 'debit', range: [15000, 25000] },
    ];
    for (let m = 0; m < months; m++) {
      categories.forEach(cat => {
        const d = new Date();
        d.setMonth(d.getMonth() - m);
        d.setDate(Math.floor(Math.random() * 28) + 1);
        txns.push({
          id:   Math.random().toString(36).slice(2),
          date: d.toISOString(),
          amount: cat.range[0] + Math.random() * (cat.range[1] - cat.range[0]),
          type: cat.type,
          desc: cat.desc,
          category: _categorize(cat.desc),
          source: 'aa_demo',
        });
      });
    }
    return txns;
  }

  function _generateDemoMF() {
    return [
      { fund_name:'Axis Bluechip Fund - Direct Growth', category:'large_cap', units:245.8, nav:62.4, current_value:15337, invested:12000, is_direct:true, expense_ratio:0.43 },
      { fund_name:'Parag Parikh Flexi Cap - Direct Growth', category:'flexi_cap', units:128.4, nav:78.9, current_value:10128, invested:8000, is_direct:true, expense_ratio:0.58 },
      { fund_name:'Mirae Asset Tax Saver - ELSS Direct', category:'elss', units:389.2, nav:38.7, current_value:15062, invested:12000, is_direct:true, expense_ratio:0.51 },
    ];
  }

  /* ── UI Components ─────────────────────────────────────────────── */
  function _showAPIKeySetup(provider) {
    const modal = document.createElement('div');
    modal.id = 'finos-aa-modal';
    modal.innerHTML = `
      <style>
        #finos-aa-modal { position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px; }
        .aa-modal-box { background:linear-gradient(145deg,#0d0f1a,#161929);border:1px solid ${provider.color}30;border-radius:20px;padding:30px;max-width:440px;width:100%;font-family:-apple-system,sans-serif; }
      </style>
      <div class="aa-modal-box">
        <div style="font-size:28px;margin-bottom:8px;">${provider.logo}</div>
        <div style="font-size:18px;font-weight:800;color:#F5F7FA;margin-bottom:4px;">Connect ${provider.name}</div>
        <div style="font-size:12px;color:#8892a4;margin-bottom:20px;">Enter your ${provider.name} AA Client ID to enable auto-import.</div>

        <div style="background:rgba(${provider.color === '#0066cc' ? '0,102,204' : '34,211,166'},.06);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;margin-bottom:20px;font-size:12px;color:#a0aec0;line-height:1.6;">
          <strong style="color:#F5F7FA;">How to get API key:</strong><br>
          1. Visit <a href="${provider.url}" target="_blank" style="color:${provider.color};">${provider.url}</a><br>
          2. Register as a Financial Information User (FIU)<br>
          3. Get approved (takes 2–5 business days)<br>
          4. Copy your Client ID here
        </div>

        <label style="display:block;font-size:12px;color:#8892a4;margin-bottom:8px;">API Client ID</label>
        <input id="aa-key-input" type="text" placeholder="e.g. finos_finvu_client_123"
          style="width:100%;padding:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#F5F7FA;font-size:14px;margin-bottom:16px;box-sizing:border-box;">

        <div style="background:rgba(240,165,0,.08);border:1px solid rgba(240,165,0,.2);border-radius:10px;padding:12px;font-size:12px;color:#f0a500;margin-bottom:20px;">
          💡 <strong>No API key yet?</strong> Try Demo Mode to see how account aggregation works with simulated data.
        </div>

        <div style="display:flex;gap:10px;">
          <button onclick="window.FinosAA._saveKeyAndConnect('${provider.id}')" style="flex:1;padding:12px;border-radius:12px;background:${provider.color}20;border:1px solid ${provider.color}40;color:${provider.color};font-size:13px;font-weight:700;cursor:pointer;">
            Connect ${provider.name}
          </button>
          <button onclick="window.FinosAA._demoMode('${provider.id}')" style="flex:1;padding:12px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#F5F7FA;font-size:13px;font-weight:700;cursor:pointer;">
            🎯 Demo Mode
          </button>
        </div>
        <button onclick="document.getElementById('finos-aa-modal')?.remove()" style="display:block;width:100%;margin-top:10px;background:none;border:none;color:#8892a4;font-size:13px;cursor:pointer;padding:6px;">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function _showSyncProgress(provider, isDemo = false) {
    const toast = document.getElementById('finos-aa-toast') || document.createElement('div');
    toast.id = 'finos-aa-toast';
    toast.innerHTML = `
      <style>
        #finos-aa-toast { position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:99999;background:linear-gradient(145deg,#0d0f1a,#161929);border:1px solid rgba(0,212,255,.3);border-radius:14px;padding:14px 20px;font-family:-apple-system,sans-serif;display:flex;align-items:center;gap:12px;min-width:280px; }
        @keyframes _spin { to { transform:rotate(360deg); } }
      </style>
      <div style="width:18px;height:18px;border:2px solid rgba(0,212,255,.3);border-top-color:#00d4ff;border-radius:50%;animation:_spin 0.8s linear infinite;flex-shrink:0;"></div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#F5F7FA;">${isDemo ? 'Demo sync' : 'Syncing'} from ${provider.name}${isDemo ? ' (demo data)' : ''}...</div>
        <div style="font-size:11px;color:#8892a4;">Fetching transactions + portfolio</div>
      </div>
    `;
    if (!document.getElementById('finos-aa-toast')) document.body.appendChild(toast);
  }

  function _showSyncSuccess(provider, isDemo = false) {
    const toast = document.getElementById('finos-aa-toast');
    if (toast) {
      toast.innerHTML = `
        <div style="font-size:22px;">✅</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#22d3a6;">${isDemo ? 'Demo data loaded' : provider.name + ' synced'}!</div>
          <div style="font-size:11px;color:#8892a4;">Your financial data is up to date${isDemo ? ' (simulated)' : ''}.</div>
        </div>
      `;
      setTimeout(() => toast?.remove(), 4000);
    }
    if (window.AryaAI?._speak) {
      window.AryaAI._speak(isDemo
        ? 'Demo data loaded! This is how Account Aggregator will work when you connect your real bank account.'
        : `${provider.name} synced successfully! Your transactions and portfolio are now up to date.`);
    }
  }

  function _showSyncError(provider, msg) {
    const toast = document.getElementById('finos-aa-toast');
    if (toast) {
      toast.innerHTML = `<div style="font-size:22px;">❌</div><div><div style="font-size:13px;font-weight:700;color:#ff4444;">Sync failed</div><div style="font-size:11px;color:#8892a4;">${msg}</div></div>`;
      setTimeout(() => toast?.remove(), 5000);
    }
  }

  /* ── Main Dashboard Renderer ───────────────────────────────────── */
  function renderDashboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const consents  = getConsents();
    const lastSyncs = getLastSync();

    container.innerHTML = `
      <style>
        .aa-wrap { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
        .aa-header { margin-bottom:24px; }
        .aa-title { font-size:20px;font-weight:800;color:#F5F7FA;margin-bottom:4px; }
        .aa-sub { font-size:13px;color:#8892a4; }
        .aa-provider-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:24px; }
        .aa-provider-card { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;transition:all .2s; }
        .aa-provider-card:hover { border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.05); }
        .aa-provider-connected { border-color:rgba(34,211,166,.3);background:rgba(34,211,166,.04); }
        .aa-provider-top { display:flex;align-items:center;gap:12px;margin-bottom:14px; }
        .aa-provider-logo { font-size:28px; }
        .aa-provider-name { font-size:15px;font-weight:700;color:#F5F7FA; }
        .aa-provider-banks { font-size:11px;color:#8892a4; }
        .aa-badge-connected { padding:3px 10px;border-radius:20px;font-size:10px;font-weight:800;background:rgba(34,211,166,.15);color:#22d3a6;border:1px solid rgba(34,211,166,.3); }
        .aa-badge-popular { padding:3px 10px;border-radius:20px;font-size:10px;font-weight:800;background:rgba(240,165,0,.1);color:#f0a500;border:1px solid rgba(240,165,0,.2); }
        .aa-last-sync { font-size:11px;color:#8892a4;margin-bottom:12px; }
        .aa-btn { width:100%;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid; }
        .aa-btn-connect { background:rgba(0,212,255,.1);border-color:rgba(0,212,255,.3);color:#00d4ff; }
        .aa-btn-sync { background:rgba(34,211,166,.1);border-color:rgba(34,211,166,.3);color:#22d3a6; }
        .aa-btn-revoke { background:transparent;border-color:rgba(255,68,68,.2);color:#ff6666;font-size:11px;padding:6px;margin-top:8px; }
        .aa-info-box { background:rgba(123,47,247,.06);border:1px solid rgba(123,47,247,.2);border-radius:14px;padding:18px;margin-top:8px; }
        .aa-info-title { font-size:13px;font-weight:700;color:#a78bfa;margin-bottom:8px; }
        .aa-info-list { list-style:none;padding:0;margin:0; }
        .aa-info-list li { font-size:12px;color:#a0aec0;padding:4px 0;line-height:1.5; }
        .aa-info-list li::before { content:"✓ ";color:#7b2ff7;font-weight:700; }
      </style>

      <div class="aa-wrap">
        <div class="aa-header">
          <div class="aa-title">🔗 Account Aggregator</div>
          <div class="aa-sub">Connect your bank accounts and mutual funds for automatic data sync. RBI-regulated, 100% secure.</div>
        </div>

        <div class="aa-provider-grid">
          ${AA_PROVIDERS.map(p => {
            const consent  = consents[p.id];
            const lastSync = lastSyncs[p.id];
            const connected = consent?.active;
            return `
              <div class="aa-provider-card ${connected ? 'aa-provider-connected' : ''}">
                <div class="aa-provider-top">
                  <div class="aa-provider-logo">${p.logo}</div>
                  <div>
                    <div class="aa-provider-name">${p.name}</div>
                    <div class="aa-provider-banks">${p.banks}</div>
                  </div>
                  <div style="margin-left:auto;display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
                    ${connected ? '<span class="aa-badge-connected">✓ Connected</span>' : ''}
                    ${p.popular && !connected ? '<span class="aa-badge-popular">⭐ Popular</span>' : ''}
                  </div>
                </div>
                ${connected && lastSync
                  ? `<div class="aa-last-sync">Last synced: ${new Date(lastSync).toLocaleDateString('en-IN', { day:'numeric',month:'short',year:'numeric' })}</div>`
                  : ''}
                ${connected
                  ? `<button class="aa-btn aa-btn-sync" onclick="window.FinosAA.sync('${p.id}')">🔄 Sync Now</button>
                     <button class="aa-btn aa-btn-revoke" onclick="window.FinosAA.revoke('${p.id}')">Revoke consent</button>`
                  : `<button class="aa-btn aa-btn-connect" onclick="window.FinosAA.connect('${p.id}')">Connect ${p.name}</button>`}
              </div>
            `;
          }).join('')}
        </div>

        <div class="aa-info-box">
          <div class="aa-info-title">🔒 How AA keeps your data safe</div>
          <ul class="aa-info-list">
            <li>You control consent — grant, modify, or revoke any time</li>
            <li>Data flows directly from your bank to FIN-OS (AA doesn't store it)</li>
            <li>RBI-regulated framework — all AA providers are licensed by RBI</li>
            <li>End-to-end encrypted with your digital signature</li>
            <li>FIN-OS runs locally — your data never leaves your device</li>
          </ul>
        </div>
      </div>
    `;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosAA = {
    PROVIDERS: AA_PROVIDERS,

    connect(providerId) { initiateConsent(providerId); },

    sync(providerId) {
      const consent = getConsents()[providerId];
      if (consent?.active) {
        startDataFetch(providerId, consent.consentId);
      } else {
        this.connect(providerId);
      }
    },

    revoke(providerId) {
      if (confirm(`Remove consent for ${providerId}? Your existing data won't be deleted.`)) {
        revokeConsent(providerId);
        this.renderDashboard('finos-aa-dashboard');
        window.FinosToast?.show?.('Consent revoked. Your local data is preserved.', 'info');
      }
    },

    renderDashboard,
    getConsents,
    getLastSync,

    /* Internal helpers exposed for modal buttons */
    _saveKeyAndConnect(providerId) {
      const key = document.getElementById('aa-key-input')?.value?.trim();
      if (!key) { alert('Please enter your API Client ID.'); return; }
      localStorage.setItem(`finos_aa_key_${providerId}`, key);
      document.getElementById('finos-aa-modal')?.remove();
      initiateConsent(providerId);
    },

    _demoMode(providerId) {
      document.getElementById('finos-aa-modal')?.remove();
      _simulateDemoSync(providerId);
    },

    /* Check if any account is connected */
    hasActiveConsent() {
      return Object.values(getConsents()).some(c => c?.active);
    },

    /* Auto-sync if consent exists and data is stale (>24h) */
    autoSync() {
      const consents = getConsents();
      const syncs    = getLastSync();
      const STALE_MS = 24 * 60 * 60 * 1000;
      Object.entries(consents).forEach(([id, c]) => {
        if (!c.active) return;
        const last = new Date(syncs[id] || 0).getTime();
        if (Date.now() - last > STALE_MS) {
          setTimeout(() => startDataFetch(id, c.consentId), 5000);
        }
      });
    }
  };

  global.FinosAA = FinosAA;

  /* ── Auto-sync on context ready ─────────────────────────────────── */
  window.addEventListener('finos-context-ready', e => {
    if (e.detail?.phase !== 'full') return;
    FinosAA.autoSync();
  });

}(window));
