/**
 * finos-net-worth.js — Net Worth Aggregator  v1.0  (Phase 28)
 * ─────────────────────────────────────────────────────────────
 * Reads from every asset tracker and merges into one authoritative
 * net worth figure, then writes it back to `finos_net_worth` so the
 * dashboard KPI and finos-context both see the computed value.
 *
 * Asset sources (all localStorage):
 *   finos_portfolio_value  — Zerodha Kite equity holdings (Phase 19)
 *   finos_sip_value        — SIP / MF portfolio (Phase 26)
 *   finos_fd_value         — FD / PPF / NSC / bonds (Phase 27)
 *   finos_gold_value       — gold (manual entry)
 *   finos_property_value   — real estate (manual entry)
 *   finos_crypto_value     — crypto (manual entry)
 *   finos_cash_value       — savings account / cash (manual entry)
 *   finos_other_value      — any other asset (manual)
 *
 * Liability sources:
 *   finos_home_loan        — home loan outstanding
 *   finos_car_loan         — car loan outstanding
 *   finos_personal_loan    — personal loan outstanding
 *   finos_credit_card_debt — credit card dues
 *   finos_other_liability  — other liabilities
 *
 * Public API:
 *   FinosNetWorth.compute()               → { assets, liabilities, netWorth, breakdown }
 *   FinosNetWorth.renderOverview(el)      — hero card + allocation bars
 *   FinosNetWorth.renderBreakdown(el)     — full asset/liability table
 *   FinosNetWorth.renderFireProgress(el)  — FIRE corpus tracker
 *   FinosNetWorth.renderTimeline(el)      — monthly snapshot sparkline
 *   FinosNetWorth.snapshotToday()         — save today's net worth to history
 */
(function (global) {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function gs(key, fallback = 0) { return parseFloat(localStorage.getItem(key) || fallback) || 0; }
  function ls(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }

  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function pct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

  /* ── Asset catalogue ─────────────────────────────────────────────── */
  const ASSETS = [
    { key: 'finos_portfolio_value', label: 'Equity (Zerodha)',   icon: '📈', color: '#00D4FF', source: 'kite',     editable: false },
    { key: 'finos_sip_value',       label: 'Mutual Funds (SIP)', icon: '🏦', color: '#22D3A6', source: 'sip',      editable: false },
    { key: 'finos_fd_value',        label: 'Fixed Income',       icon: '💰', color: '#7B2FF7', source: 'fd',       editable: false },
    { key: 'finos_gold_value',      label: 'Gold / SGB',         icon: '🥇', color: '#F0A500', source: 'manual',   editable: true  },
    { key: 'finos_property_value',  label: 'Real Estate',        icon: '🏠', color: '#34D399', source: 'manual',   editable: true  },
    { key: 'finos_crypto_value',    label: 'Crypto',             icon: '₿',  color: '#F97316', source: 'manual',   editable: true  },
    { key: 'finos_cash_value',      label: 'Savings / Cash',     icon: '🏧', color: '#60A5FA', source: 'manual',   editable: true  },
    { key: 'finos_other_value',     label: 'Other Assets',       icon: '📦', color: '#A78BFA', source: 'manual',   editable: true  },
  ];

  const LIABILITIES = [
    { key: 'finos_home_loan',        label: 'Home Loan',         icon: '🏠', color: '#FF4444' },
    { key: 'finos_car_loan',         label: 'Car Loan',          icon: '🚗', color: '#FF6B6B' },
    { key: 'finos_personal_loan',    label: 'Personal Loan',     icon: '👤', color: '#FF8C42' },
    { key: 'finos_credit_card_debt', label: 'Credit Card',       icon: '💳', color: '#FF4444' },
    { key: 'finos_other_liability',  label: 'Other Liabilities', icon: '📄', color: '#FF6B6B' },
  ];

  /* ── Core compute ────────────────────────────────────────────────── */
  function compute() {
    const breakdown = ASSETS.map(a => ({ ...a, value: gs(a.key) })).filter(a => a.value > 0);
    const liabilities = LIABILITIES.map(l => ({ ...l, value: gs(l.key) })).filter(l => l.value > 0);

    const totalAssets      = breakdown.reduce((s, a) => s + a.value, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0);
    const netWorth         = totalAssets - totalLiabilities;

    // Add allocation % to each asset
    breakdown.forEach(a => { a.pct = totalAssets > 0 ? (a.value / totalAssets) * 100 : 0; });

    // Write computed net worth back → dashboard + context pick it up
    localStorage.setItem('finos_net_worth', netWorth.toString());
    // Write FIRE % — dashboard kpi-fire reads this key (was never written by any module before v1.1)
    const _mExp = gs('finos_monthly_expense') || gs('finos_aa_expense') || (gs('finos_monthly_income') * 0.6) || 50000;
    const _fireCorpus = _mExp * 12 * 25;
    const _firePct = _fireCorpus > 0 ? Math.min(100, (netWorth / _fireCorpus) * 100) : 0;
    localStorage.setItem('finos_fire_percent', _firePct.toFixed(1));
    if (window.FinosContext?.update) {
      window.FinosContext.update({ netWorth, totalAssets, totalLiabilities, firePercent: _firePct });
    }
    document.dispatchEvent(new CustomEvent('finos-networth-updated', { detail: { netWorth, totalAssets, totalLiabilities } }));

    return { breakdown, liabilities, totalAssets, totalLiabilities, netWorth, firePercent: _firePct };
  }

  /* ── Monthly snapshot ────────────────────────────────────────────── */
  const HISTORY_KEY = 'finos_networth_history';
  function snapshotToday() {
    const { netWorth } = compute();
    const today  = new Date().toISOString().slice(0, 7); // YYYY-MM
    const history = ls(HISTORY_KEY) || [];
    const existing = history.findIndex(h => h.month === today);
    if (existing >= 0) history[existing].value = netWorth;
    else history.push({ month: today, value: netWorth });
    const trimmed = history.slice(-24); // keep 24 months
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
  }

  /* ══════════════════════════════════════════════════════════════════
     OVERVIEW RENDERER
  ══════════════════════════════════════════════════════════════════ */
  function renderOverview(container) {
    if (!container) return;
    const { breakdown, liabilities, totalAssets, totalLiabilities, netWorth } = compute();
    const nwColor = netWorth >= 0 ? '#22D3A6' : '#FF4444';

    // Linked sources status
    const kiteLinked = gs('finos_portfolio_value') > 0;
    const sipLinked  = gs('finos_sip_value') > 0;
    const fdLinked   = gs('finos_fd_value') > 0;

    container.innerHTML = `
      <style>
        .nw-hero { background:linear-gradient(135deg,rgba(0,212,255,.06),rgba(34,211,166,.04));border:1px solid rgba(0,212,255,.15);border-radius:20px;padding:28px;margin-bottom:20px;display:flex;align-items:center;gap:28px;flex-wrap:wrap; }
        .nw-hero-left { flex:1;min-width:200px; }
        .nw-hero-label { font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px; }
        .nw-hero-value { font-size:48px;font-weight:900;letter-spacing:-1px;line-height:1; }
        .nw-hero-sub { font-size:13px;color:#8892A4;margin-top:8px; }
        .nw-split { display:flex;gap:20px;margin-top:16px;flex-wrap:wrap; }
        .nw-split-pill { padding:10px 16px;border-radius:12px;border:1px solid;flex:1;min-width:130px; }
        .nw-alloc-bars { flex:1;min-width:240px; }
        .nw-alloc-row { display:flex;align-items:center;gap:10px;margin-bottom:8px; }
        .nw-alloc-label { font-size:12px;color:#8892A4;width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .nw-alloc-track { flex:1;height:6px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden; }
        .nw-alloc-fill  { height:100%;border-radius:3px;transition:width .6s ease; }
        .nw-alloc-pct   { font-size:11px;color:#8892A4;width:36px;text-align:right; }
        .nw-sources { display:flex;gap:8px;flex-wrap:wrap;margin-top:16px; }
        .nw-source-badge { padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid;display:flex;align-items:center;gap:5px; }
        .nw-source-linked   { background:rgba(34,211,166,.08);border-color:rgba(34,211,166,.3);color:#22D3A6; }
        .nw-source-unlinked { background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.4); }
      </style>

      <div class="nw-hero">
        <div class="nw-hero-left">
          <div class="nw-hero-label">Total Net Worth</div>
          <div class="nw-hero-value" style="color:${nwColor};">${INR(netWorth)}</div>
          <div class="nw-hero-sub">
            Assets ${INR(totalAssets)} &nbsp;–&nbsp; Liabilities ${INR(totalLiabilities)}
          </div>
          <div class="nw-split">
            <div class="nw-split-pill" style="background:rgba(0,212,255,.06);border-color:rgba(0,212,255,.2);">
              <div style="font-size:10px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Total Assets</div>
              <div style="font-size:20px;font-weight:800;color:#F5F7FA;">${INR(totalAssets)}</div>
            </div>
            <div class="nw-split-pill" style="background:rgba(255,68,68,.05);border-color:rgba(255,68,68,.2);">
              <div style="font-size:10px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Total Liabilities</div>
              <div style="font-size:20px;font-weight:800;color:#FF6666;">${totalLiabilities > 0 ? INR(totalLiabilities) : '—'}</div>
            </div>
          </div>
          <div class="nw-sources">
            <div class="nw-source-badge ${kiteLinked?'nw-source-linked':'nw-source-unlinked'}">
              ${kiteLinked?'✓':'○'} Zerodha
            </div>
            <div class="nw-source-badge ${sipLinked?'nw-source-linked':'nw-source-unlinked'}">
              ${sipLinked?'✓':'○'} SIP Tracker
            </div>
            <div class="nw-source-badge ${fdLinked?'nw-source-linked':'nw-source-unlinked'}">
              ${fdLinked?'✓':'○'} FD Tracker
            </div>
          </div>
        </div>

        <!-- Allocation bars -->
        <div class="nw-alloc-bars">
          <div style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;">Asset Allocation</div>
          ${breakdown.length === 0
            ? '<div style="color:#8892A4;font-size:13px;">No assets tracked yet — add data below</div>'
            : breakdown.map(a => `
              <div class="nw-alloc-row">
                <div class="nw-alloc-label">${a.icon} ${a.label}</div>
                <div class="nw-alloc-track"><div class="nw-alloc-fill" style="width:${a.pct.toFixed(1)}%;background:${a.color};"></div></div>
                <div class="nw-alloc-pct">${a.pct.toFixed(0)}%</div>
              </div>`).join('')
          }
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     BREAKDOWN TABLE
  ══════════════════════════════════════════════════════════════════ */
  function renderBreakdown(container) {
    if (!container) return;
    const { breakdown, liabilities, totalAssets, totalLiabilities, netWorth } = compute();

    const assetRows = breakdown.map(a => `
      <tr>
        <td style="padding:11px 10px;">
          <span style="margin-right:8px;">${a.icon}</span>
          <span style="font-weight:700;color:#F5F7FA;">${a.label}</span>
          ${a.source !== 'manual' ? `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);color:#00D4FF;margin-left:8px;font-weight:700;">Live</span>` : ''}
        </td>
        <td style="padding:11px 10px;text-align:right;font-weight:700;color:#F5F7FA;">${INR(a.value)}</td>
        <td style="padding:11px 10px;text-align:right;color:#8892A4;">${a.pct.toFixed(1)}%</td>
        <td style="padding:11px 10px;text-align:right;">
          ${a.editable ? `
            <button onclick="FinosNetWorth._editAsset('${a.key}','${a.label}','${a.icon}')"
              style="padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#8892A4;font-size:11px;cursor:pointer;">
              Edit
            </button>` : `<span style="font-size:11px;color:rgba(255,255,255,.2);">Auto</span>`}
        </td>
      </tr>`).join('');

    const liabRows = liabilities.map(l => `
      <tr>
        <td style="padding:11px 10px;">
          <span style="margin-right:8px;">${l.icon}</span>
          <span style="font-weight:700;color:#F5F7FA;">${l.label}</span>
        </td>
        <td style="padding:11px 10px;text-align:right;font-weight:700;color:#FF6666;">${INR(l.value)}</td>
        <td style="padding:11px 10px;text-align:right;color:#8892A4;">—</td>
        <td style="padding:11px 10px;text-align:right;">
          <button onclick="FinosNetWorth._editLiability('${l.key}','${l.label}','${l.icon}')"
            style="padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#8892A4;font-size:11px;cursor:pointer;">
            Edit
          </button>
        </td>
      </tr>`).join('');

    const addableAssets = ASSETS.filter(a => a.editable && gs(a.key) === 0);
    const addableLiabs  = LIABILITIES.filter(l => gs(l.key) === 0);

    container.innerHTML = `
      <style>
        .nw-table { width:100%;border-collapse:collapse;font-size:13px;font-family:-apple-system,sans-serif; }
        .nw-table th { font-size:10px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.07); }
        .nw-table tr:hover td { background:rgba(255,255,255,.02); }
        .nw-table tr td { border-bottom:1px solid rgba(255,255,255,.04); }
        .nw-section-head { font-size:11px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.8px;padding:14px 0 6px;display:block; }
        .nw-add-row { display:flex;gap:8px;flex-wrap:wrap;margin-top:12px; }
        .nw-add-chip { padding:6px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:rgba(255,255,255,.5);font-size:12px;font-weight:700;cursor:pointer;transition:.15s; }
        .nw-add-chip:hover { background:rgba(255,255,255,.07);color:#F5F7FA; }
      </style>

      <span class="nw-section-head">Assets</span>
      ${breakdown.length === 0
        ? '<div style="padding:20px;text-align:center;color:#8892A4;font-size:13px;">No assets tracked yet.</div>'
        : `<table class="nw-table">
            <thead><tr>
              <th style="text-align:left;">Asset</th>
              <th style="text-align:right;">Value</th>
              <th style="text-align:right;">Allocation</th>
              <th style="text-align:right;"></th>
            </tr></thead>
            <tbody>${assetRows}</tbody>
            <tfoot><tr style="border-top:1px solid rgba(255,255,255,.1);">
              <td style="padding:11px 10px;font-weight:800;color:#F5F7FA;">Total Assets</td>
              <td style="padding:11px 10px;text-align:right;font-weight:800;color:#22D3A6;">${INR(totalAssets)}</td>
              <td colspan="2"></td>
            </tr></tfoot>
          </table>`
      }

      ${addableAssets.length > 0 ? `
        <div class="nw-add-row">
          ${addableAssets.map(a => `
            <button class="nw-add-chip" onclick="FinosNetWorth._editAsset('${a.key}','${a.label}','${a.icon}')">
              ${a.icon} + ${a.label}
            </button>`).join('')}
        </div>` : ''}

      ${liabilities.length > 0 || addableLiabs.length > 0 ? `
        <span class="nw-section-head" style="margin-top:20px;">Liabilities</span>
        ${liabilities.length > 0 ? `
          <table class="nw-table">
            <thead><tr>
              <th style="text-align:left;">Liability</th>
              <th style="text-align:right;">Outstanding</th>
              <th colspan="2"></th>
            </tr></thead>
            <tbody>${liabRows}</tbody>
            <tfoot><tr style="border-top:1px solid rgba(255,255,255,.1);">
              <td style="padding:11px 10px;font-weight:800;color:#F5F7FA;">Total Liabilities</td>
              <td style="padding:11px 10px;text-align:right;font-weight:800;color:#FF6666;">${INR(totalLiabilities)}</td>
              <td colspan="2"></td>
            </tr></tfoot>
          </table>` : ''}

        ${addableLiabs.length > 0 ? `
          <div class="nw-add-row">
            ${addableLiabs.map(l => `
              <button class="nw-add-chip" onclick="FinosNetWorth._editLiability('${l.key}','${l.label}','${l.icon}')">
                ${l.icon} + ${l.label}
              </button>`).join('')}
          </div>` : ''}` : ''}`;
  }

  /* ══════════════════════════════════════════════════════════════════
     FIRE PROGRESS
  ══════════════════════════════════════════════════════════════════ */
  function renderFireProgress(container) {
    if (!container) return;
    const { netWorth } = compute();

    const monthlyExpense = gs('finos_monthly_expense') || gs('finos_aa_expense') || gs('finos_monthly_income') * 0.6 || 50000;
    const annualExpense  = monthlyExpense * 12;
    const fireCorpus     = annualExpense * 25; // 4% SWR rule
    const fireProgress   = fireCorpus > 0 ? Math.min((netWorth / fireCorpus) * 100, 100) : 0;
    const remaining      = Math.max(0, fireCorpus - netWorth);

    const fireColor = fireProgress >= 80 ? '#22D3A6' : fireProgress >= 50 ? '#00D4FF' : fireProgress >= 25 ? '#F0A500' : '#FF6666';

    container.innerHTML = `
      <style>
        .fire-hero { background:linear-gradient(135deg,rgba(240,165,0,.06),rgba(255,100,50,.04));border:1px solid rgba(240,165,0,.15);border-radius:18px;padding:24px;margin-bottom:16px; }
        .fire-bar-track { height:12px;background:rgba(255,255,255,.07);border-radius:6px;overflow:hidden;margin:16px 0 8px; }
        .fire-bar-fill  { height:100%;border-radius:6px;transition:width .8s ease; }
        .fire-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:16px; }
        .fire-cell-label { font-size:10px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px; }
        .fire-cell-value { font-size:16px;font-weight:800;color:#F5F7FA; }
      </style>

      <div class="fire-hero">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
          <span style="font-size:24px;">🔥</span>
          <div>
            <div style="font-size:16px;font-weight:800;color:#F5F7FA;">FIRE Progress</div>
            <div style="font-size:12px;color:#8892A4;">Financial Independence / Retire Early — 25× annual expenses</div>
          </div>
          <div style="margin-left:auto;font-size:36px;font-weight:900;color:${fireColor};">${fireProgress.toFixed(1)}%</div>
        </div>

        <div class="fire-bar-track">
          <div class="fire-bar-fill" style="width:${fireProgress}%;background:linear-gradient(90deg,${fireColor},${fireColor}88);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#8892A4;">
          <span>₹0</span>
          <span>Target: ${INR(fireCorpus)}</span>
        </div>

        <div class="fire-grid">
          <div>
            <div class="fire-cell-label">Current Net Worth</div>
            <div class="fire-cell-value">${INR(netWorth)}</div>
          </div>
          <div>
            <div class="fire-cell-label">FIRE Corpus Needed</div>
            <div class="fire-cell-value" style="color:#F0A500;">${INR(fireCorpus)}</div>
          </div>
          <div>
            <div class="fire-cell-label">Still Needed</div>
            <div class="fire-cell-value" style="color:#FF6666;">${INR(remaining)}</div>
          </div>
          <div>
            <div class="fire-cell-label">Annual Expenses (est.)</div>
            <div class="fire-cell-value">${INR(annualExpense)}</div>
          </div>
        </div>

        <div style="margin-top:16px;font-size:12px;color:#8892A4;background:rgba(255,255,255,.03);border-radius:10px;padding:10px 14px;line-height:1.6;">
          💡 At ₹${INR(monthlyExpense)}/month expenses, you need <strong style="color:#F0A500;">${INR(fireCorpus)}</strong> invested to withdraw 4% annually and never run out.
          Grow your net worth by ${INR(remaining)} more to reach FIRE.
          ${gs('finos_monthly_income') > 0 ? ` Saving ${Math.round((1 - monthlyExpense/gs('finos_monthly_income'))*100)}% of income.` : ''}
        </div>
      </div>

      <div style="font-size:11px;color:rgba(255,255,255,.2);margin-top:8px;">
        Monthly expense estimated from AA data or income × 60%. Update in Settings for accurate FIRE date.
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     TIMELINE SPARKLINE
  ══════════════════════════════════════════════════════════════════ */
  function renderTimeline(container) {
    if (!container) return;
    const history = ls(HISTORY_KEY) || [];

    if (history.length < 2) {
      container.innerHTML = `
        <div style="text-align:center;padding:32px;color:#8892A4;font-size:13px;">
          <div style="font-size:28px;margin-bottom:10px;">📅</div>
          Net worth history builds up over time. Visit monthly to track your growth.
          <br><br>
          <button onclick="FinosNetWorth.snapshotToday();FinosNetWorth.renderTimeline(document.getElementById('nw-timeline'));"
            style="padding:8px 16px;border-radius:10px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);color:#00D4FF;font-size:12px;font-weight:700;cursor:pointer;">
            📸 Save Today's Snapshot
          </button>
        </div>`;
      return;
    }

    const max = Math.max(...history.map(h => h.value));
    const min = Math.min(...history.map(h => h.value));
    const range = max - min || 1;

    const bars = history.map((h, i) => {
      const heightPct = ((h.value - min) / range) * 100;
      const isLast    = i === history.length - 1;
      const color     = isLast ? '#00D4FF' : '#22D3A6';
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:28px;" title="${h.month}: ${INR(h.value)}">
          <div style="font-size:9px;color:#8892A4;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;">
            ${h.month.slice(2)}
          </div>
          <div style="flex:1;width:100%;display:flex;align-items:flex-end;">
            <div style="width:100%;height:${Math.max(heightPct, 4)}%;background:${color};border-radius:3px 3px 0 0;transition:.5s;"></div>
          </div>
        </div>`;
    }).join('');

    const latest = history[history.length - 1];
    const prev   = history[history.length - 2];
    const change = latest.value - prev.value;
    const changeColor = change >= 0 ? '#22D3A6' : '#FF4444';

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;color:#F5F7FA;">Net Worth History (${history.length} months)</div>
        <div>
          <span style="font-size:13px;font-weight:800;color:${changeColor};">${change>=0?'+':''}${INR(Math.abs(change))}</span>
          <span style="font-size:11px;color:#8892A4;"> vs last month</span>
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:120px;background:rgba(255,255,255,.02);border-radius:12px;padding:12px;overflow-x:auto;">
        ${bars}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#8892A4;margin-top:6px;">
        <span>${history[0].month}</span>
        <span>${INR(min)} – ${INR(max)}</span>
        <span>${history[history.length-1].month}</span>
      </div>
      <div style="margin-top:12px;text-align:right;">
        <button onclick="FinosNetWorth.snapshotToday();FinosNetWorth.renderTimeline(document.getElementById('nw-timeline'));"
          style="padding:7px 14px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.5);font-size:12px;cursor:pointer;">
          📸 Update Snapshot
        </button>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     EDIT MODALS
  ══════════════════════════════════════════════════════════════════ */
  function _editModal(key, label, icon, current, onSave) {
    const modal = document.createElement('div');
    modal.id = 'nw-edit-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:#0d0f1a;border:1px solid rgba(0,212,255,.2);border-radius:20px;padding:28px;max-width:400px;width:100%;font-family:-apple-system,sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div style="font-size:17px;font-weight:800;color:#F5F7FA;">${icon} ${label}</div>
          <button onclick="document.getElementById('nw-edit-modal').remove()" style="background:none;border:none;color:#8892A4;font-size:22px;cursor:pointer;">×</button>
        </div>
        <label style="font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:8px;">Current Value (₹)</label>
        <input id="nw-edit-input" type="number" min="0" step="10000" value="${current || ''}" placeholder="Enter current value"
          style="width:100%;padding:12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:16px;box-sizing:border-box;outline:none;margin-bottom:8px;">
        <div style="font-size:11px;color:#8892A4;margin-bottom:20px;">Enter 0 to remove from net worth.</div>
        <div style="display:flex;gap:8px;">
          <button onclick="${onSave}"
            style="flex:1;padding:12px;border-radius:12px;background:rgba(0,212,255,.15);border:1px solid rgba(0,212,255,.3);color:#00D4FF;font-size:14px;font-weight:800;cursor:pointer;">
            Save
          </button>
          <button onclick="document.getElementById('nw-edit-modal').remove()"
            style="padding:12px 20px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);color:#8892A4;font-size:14px;cursor:pointer;">
            Cancel
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('nw-edit-input')?.focus(), 50);
  }

  function _editAsset(key, label, icon) {
    _editModal(key, label, icon, gs(key),
      `FinosNetWorth._saveAndRefresh('${key}')`);
  }

  function _editLiability(key, label, icon) {
    _editModal(key, label, icon, gs(key),
      `FinosNetWorth._saveAndRefresh('${key}')`);
  }

  function _saveAndRefresh(key) {
    const val = parseFloat(document.getElementById('nw-edit-input')?.value || '0') || 0;
    localStorage.setItem(key, val.toString());
    document.getElementById('nw-edit-modal')?.remove();
    // Refresh all rendered panels
    const overview   = document.getElementById('nw-overview');
    const breakdown  = document.getElementById('nw-breakdown');
    const fire       = document.getElementById('nw-fire');
    const timeline   = document.getElementById('nw-timeline');
    if (overview)  renderOverview(overview);
    if (breakdown) renderBreakdown(breakdown);
    if (fire)      renderFireProgress(fire);
    if (timeline)  renderTimeline(timeline);
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosNetWorth = {
    compute,
    snapshotToday,
    renderOverview,
    renderBreakdown,
    renderFireProgress,
    renderTimeline,
    _editAsset,
    _editLiability,
    _saveAndRefresh,
  };

  global.FinosNetWorth = FinosNetWorth;

  // Auto-compute on context-ready → feeds dashboard KPI
  document.addEventListener('finos-context-ready', () => {
    try { compute(); } catch {}
  });

}(window));
