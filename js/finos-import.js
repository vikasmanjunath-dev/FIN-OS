/**
 * FIN-OS holdings import — broker / platform CSV → normalized holdings.   (v1.0)
 *
 *   const res = FinosImport.parseHoldings(csvText);
 *   res → { rows:[{name,isin,kind,qty,avg,price,invested,value,pnl}], totals:{equity,mf,invested,count},
 *           format:'zerodha'|'groww'|'generic', warnings:[…] }
 *   FinosImport.apply(res)          writes finos_portfolio_value / finos_mf_import_value / finos_holdings
 *   FinosImport.openDialog()        file picker + preview + confirm (DOM)
 *
 * Works with the CSVs people can actually download without an API key:
 *   • Zerodha Console → Portfolio → Holdings → CSV
 *   • Groww → Holdings statement (CSV / XLSX saved as CSV)
 *   • Anything with recognisable column names (Symbol/Instrument/Scheme, Qty/Units, Avg price, LTP/NAV/Closing price…)
 *
 * Parsing is deliberately forgiving (BOM, preamble lines, `, ; tab` delimiters, quoted fields, ₹ and
 * thousands separators, (negative) numbers) and strict about output: rows without a name or a positive
 * quantity are dropped, and everything dropped is reported in `warnings`.
 * Pure parsing is separate from storage so it can be unit-tested without a DOM.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosImport = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  /* ── CSV ─────────────────────────────────────────────────────────────── */
  function detectDelimiter(text) {
    const head = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).join('\n');
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (const ch of head) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const d = detectDelimiter(text);
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows.map((r) => r.map((c) => c.trim()));
  }

  function toNumber(v) {
    if (v === undefined || v === null) return NaN;
    let s = String(v).trim();
    if (!s || s === '-' || /^n\/?a$/i.test(s)) return NaN;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[()₹$,\s%]|^rs\.?/gi, '').replace(/^-/, '');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : neg ? -n : n;
  }

  /* ── column mapping ──────────────────────────────────────────────────── */
  const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const ALIASES = {
    name:     ['symbol', 'instrument', 'stock name', 'scheme name', 'fund name', 'security name', 'security', 'scrip name', 'company name', 'name', 'scheme'],
    isin:     ['isin', 'isin code'],
    qty:      ['quantity available', 'qty', 'quantity', 'units', 'balance units', 'closing balance', 'closing units', 'net qty', 'shares'],
    avg:      ['average price', 'avg cost', 'avg price', 'average buy price', 'average cost', 'avg buy price', 'buy avg', 'purchase price', 'average nav'],
    price:    ['ltp', 'previous closing price', 'closing price', 'cmp', 'current price', 'nav', 'last price', 'market price', 'current nav', 'close price'],
    invested: ['invested', 'buy value', 'invested value', 'cost value', 'purchase value', 'total cost', 'cost', 'invested amount'],
    value:    ['cur val', 'closing value', 'current value', 'market value', 'valuation', 'value', 'present value', 'current amount'],
    pnl:      ['unrealized p l', 'unrealised p l', 'p l', 'pnl', 'unrealised pnl', 'unrealized pnl', 'returns'],
  };

  function mapColumns(header) {
    const idx = {}; const h = header.map(norm);
    Object.keys(ALIASES).forEach((field) => {
      for (const alias of ALIASES[field]) {              // earlier alias = higher priority
        const i = h.indexOf(alias);
        if (i >= 0 && !Object.values(idx).includes(i)) { idx[field] = i; break; }
      }
    });
    return idx;
  }

  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const m = mapColumns(rows[i]);
      if (m.name !== undefined && m.qty !== undefined) return { index: i, map: m };
    }
    return null;
  }

  function detectFormat(header) {
    const h = header.map(norm).join('|');
    if (h.includes('quantity available') && h.includes('average price')) return 'zerodha';
    if (h.includes('average buy price') && h.includes('closing value')) return 'groww';
    return 'generic';
  }

  function classify(name, isin, header) {
    const i = String(isin || '').toUpperCase();
    if (i.startsWith('INF')) return /\b(etf|bees|liquid ?bees)\b/i.test(name) || /BEES$/i.test(name) ? 'equity' : 'mf';
    if (i.startsWith('INE') || i.startsWith('IN9') || i.startsWith('INA')) return 'equity';
    const h = header.map(norm).join('|');
    if (/scheme|fund name|nav/.test(h) && !/ltp/.test(h)) return 'mf';
    if (/\b(fund|scheme|direct plan|growth plan|idcw)\b/i.test(name)) return 'mf';
    return 'equity';
  }

  /* ── main parser ─────────────────────────────────────────────────────── */
  function parseHoldings(text) {
    const warnings = [];
    const rows = parseCSV(text);
    if (!rows.length) return { rows: [], totals: { equity: 0, mf: 0, invested: 0, count: 0 }, format: 'unknown', warnings: ['The file is empty.'] };
    const hdr = findHeader(rows);
    if (!hdr) return { rows: [], totals: { equity: 0, mf: 0, invested: 0, count: 0 }, format: 'unknown', warnings: ['Could not find a header row with a name/symbol column and a quantity/units column.'] };

    const header = rows[hdr.index]; const m = hdr.map;
    const out = []; let dropped = 0;
    for (const r of rows.slice(hdr.index + 1)) {
      const name = (r[m.name] || '').trim();
      if (!name || /^(total|grand total|sub ?total|portfolio)\b/i.test(name)) { if (name) dropped += 0; continue; }
      const qty = toNumber(r[m.qty]);
      if (!(qty > 0)) { dropped++; continue; }
      const price = toNumber(r[m.price]);
      const avg = toNumber(r[m.avg]);
      let invested = toNumber(r[m.invested]);
      let value = toNumber(r[m.value]);
      if (isNaN(invested) && !isNaN(avg)) invested = qty * avg;
      if (isNaN(value) && !isNaN(price)) value = qty * price;
      if (isNaN(value) || value < 0) { dropped++; continue; }          // can't value it (or nonsense value) → can't use it
      const isin = (r[m.isin] || '').trim().toUpperCase();
      const kind = classify(name, isin, header);
      const pnl = !isNaN(invested) ? value - invested : toNumber(r[m.pnl]);
      out.push({
        name, isin: isin || undefined, kind, qty,
        avg: !isNaN(avg) ? avg : (!isNaN(invested) ? invested / qty : undefined),
        price: !isNaN(price) ? price : value / qty,
        invested: !isNaN(invested) ? Math.round(invested * 100) / 100 : undefined,
        value: Math.round(value * 100) / 100,
        pnl: isNaN(pnl) ? undefined : Math.round(pnl * 100) / 100,
      });
    }
    if (dropped) warnings.push(`${dropped} row(s) skipped (no quantity or no value).`);
    if (hdr.map.price === undefined && hdr.map.value === undefined) warnings.push('No price or value column found — values could not be computed.');

    const sum = (f) => out.filter(f).reduce((s, x) => s + x.value, 0);
    const totals = {
      equity: Math.round(sum((x) => x.kind === 'equity')),
      mf: Math.round(sum((x) => x.kind === 'mf')),
      invested: Math.round(out.reduce((s, x) => s + (x.invested || 0), 0)),
      count: out.length,
    };
    return { rows: out, totals, format: detectFormat(header), warnings };
  }

  /* ── CAS statement PDFs (CAMS / KFintech / NSDL / CDSL) ──────────────── */
  const sumBy = (rows, kind) => Math.round(rows.filter((x) => x.kind === kind).reduce((s, x) => s + x.value, 0));
  /** Server result ({rows, as_of, source, warnings}) → the same shape parseHoldings() returns. Totals are recomputed here. */
  function fromCas(server) {
    const rows = (server && server.rows ? server.rows : []).filter((r) => r && r.value >= 0 && r.qty > 0);
    return {
      rows,
      totals: { equity: sumBy(rows, 'equity'), mf: sumBy(rows, 'mf'), invested: Math.round(rows.filter((x) => x.kind === 'equity' || x.kind === 'mf').reduce((s, x) => s + (x.invested || 0), 0)), count: rows.length },
      format: 'cas-' + (server && server.source ? server.source : 'statement'),
      asOf: server && server.as_of || null,
      warnings: (server && server.warnings ? server.warnings.slice() : []).concat(rows.length ? [] : ['No holdings were found in this statement.']),
    };
  }
  function casErrorMessage(e) {
    const raw = String((e && e.message) || e || '');
    const m = raw.match(/"detail"\s*:\s*"([^"]+)"/);                    // FastAPI {"detail": "..."} inside the client's error text
    if (m) return m[1];
    if (e && e.code === 'unavailable') return 'Statement import needs the FIN-OS backend (document-ai service), which isn\'t reachable here.';
    if (e && (e.code === 'offline' || e.code === 'timeout')) return 'Could not reach the statement service. Is the document-ai backend running?';
    return 'Could not read that statement.';
  }
  /** Upload a CAS PDF + its password to the user's own document-ai service and return a parseHoldings-style result. */
  async function readCasPdf(file, password) {
    const body = new root.FormData();
    body.append('file', file, file.name || 'cas.pdf');
    body.append('password', password || '');
    try {
      let data;
      if (root.FinosAPI) data = await root.FinosAPI.request('docs', '/parse/cas', { method: 'POST', body, timeout: 90000, retries: 0 });
      else { const r = await fetch('http://localhost:8004/parse/cas', { method: 'POST', body }); if (!r.ok) throw new Error(await r.text()); data = await r.json(); }
      return fromCas(data);
    } catch (e) { throw new Error(casErrorMessage(e)); }
  }

  /* ── storage ─────────────────────────────────────────────────────────── */
  function store() { return root.FinosStore; }
  function put(k, v) {
    if (store()) store().set(k, v);
    else { try { root.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (_) { /* quota/private */ } }
  }

  /**
   * Persist an import. Equity → finos_portfolio_value (what net worth, health score and retirement already read);
   * mutual funds → finos_mf_import_value. Importing again replaces the previous import (never double counts).
   */
  function apply(res) {
    if (!res || !res.rows || !res.rows.length) throw new Error('Nothing to import');
    put('finos_portfolio_value', String(res.totals.equity));
    put('finos_mf_import_value', String(res.totals.mf));
    put('finos_holdings', res.rows);
    put('finos_holdings_meta', { importedAt: new Date().toISOString(), format: res.format, count: res.totals.count, invested: res.totals.invested, asOf: res.asOf || undefined });
    try { if (root.FinosContext && root.FinosContext.update) root.FinosContext.update({ portfolioValue: res.totals.equity }); } catch (_) { /* optional */ }
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('finos:holdings-imported', { detail: res.totals }));
    return res.totals;
  }

  /* ── dialog (DOM) ────────────────────────────────────────────────────── */
  function openDialog() {
    const doc = root.document;
    if (!doc || doc.getElementById('finos-import-dlg')) return;
    const fmt = root.FinosFmt ? root.FinosFmt.inr : (n) => '₹' + Math.round(n).toLocaleString('en-IN');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const wrap = doc.createElement('div');
    wrap.id = 'finos-import-dlg';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Import holdings');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = `
      <div style="background:var(--bg-surface,#14182a);color:var(--text-primary,#F0F2F8);border:1px solid var(--border-soft,rgba(255,255,255,.1));border-radius:18px;max-width:640px;width:100%;max-height:88vh;overflow:auto;padding:22px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;font-size:18px;">Import holdings</h3>
          <button data-x aria-label="Close" style="background:none;border:none;color:inherit;font-size:22px;cursor:pointer;">×</button>
        </div>
        <p style="font-size:13px;opacity:.7;line-height:1.6;margin:0 0 14px;">Upload either the <b>Holdings CSV</b> (Zerodha Console, Groww, any broker — read in your browser, never uploaded) or a <b>CAS PDF</b> (CAMS / KFintech / NSDL / CDSL consolidated statement — sent only to your own FIN•OS statement service to be read, not stored). Importing again replaces the last import.</p>
        <label style="display:block;border:2px dashed var(--border-soft,rgba(255,255,255,.2));border-radius:14px;padding:22px;text-align:center;cursor:pointer;font-size:13px;">
          <input type="file" accept=".csv,text/csv,text/plain,.pdf,application/pdf" hidden id="finos-import-file">
          <span id="finos-import-hint">Choose a CSV or CAS PDF, or drop it here</span>
        </label>
        <div id="finos-import-out" style="margin-top:14px;"></div>
      </div>`;
    doc.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.hasAttribute('data-x')) close(); });
    doc.addEventListener('keydown', function esc1(e) { if (e.key === 'Escape') { close(); doc.removeEventListener('keydown', esc1); } });

    const showPreview = (res, out) => {
      if (!res.rows.length) { out.innerHTML = `<p style="color:#EF4444;font-size:13px;">${esc(res.warnings.join(' '))}</p>`; return; }
      const fmtKind = (k) => ({ mf: 'MF', equity: 'Equity', bond: 'Bond', nps: 'NPS' }[k] || k);
      const body = res.rows.slice(0, 8).map((r) => `<tr><td style="padding:5px 8px;">${esc(r.name)}</td><td style="padding:5px 8px;opacity:.6;">${fmtKind(r.kind)}</td><td style="padding:5px 8px;text-align:right;">${r.qty}</td><td style="padding:5px 8px;text-align:right;">${fmt(r.value)}</td></tr>`).join('');
      out.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;">
          <span style="padding:6px 10px;border-radius:10px;background:rgba(34,211,166,.12);">${res.totals.count} holdings</span>
          <span style="padding:6px 10px;border-radius:10px;background:rgba(0,212,255,.12);">Equity ${fmt(res.totals.equity)}</span>
          <span style="padding:6px 10px;border-radius:10px;background:rgba(255,179,71,.14);">Mutual funds ${fmt(res.totals.mf)}</span>
          <span style="padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.07);">Detected: ${esc(res.format)}${res.asOf ? ' · as of ' + esc(res.asOf) : ''}</span>
        </div>
        <table style="width:100%;font-size:12px;border-collapse:collapse;"><tbody>${body}</tbody></table>
        ${res.rows.length > 8 ? `<p style="font-size:11px;opacity:.5;">… and ${res.rows.length - 8} more</p>` : ''}
        ${res.warnings.map((w) => `<p style="font-size:12px;color:#FFB347;margin:6px 0;">⚠ ${esc(w)}</p>`).join('')}
        <button id="finos-import-apply" style="margin-top:12px;padding:11px 18px;border-radius:12px;border:none;background:#22D3A6;color:#06201a;font-weight:800;cursor:pointer;">Import ${res.totals.count} holdings</button>`;
      out.querySelector('#finos-import-apply').addEventListener('click', () => {
        apply(res);
        out.innerHTML = '<p style="color:#22D3A6;font-weight:700;">✓ Imported. Refreshing your numbers…</p>';
        setTimeout(() => { close(); root.location.reload(); }, 700);
      });
    };

    const handlePdf = (file) => {
      const out = wrap.querySelector('#finos-import-out');
      wrap.querySelector('#finos-import-hint').textContent = file.name;
      out.innerHTML = `<form id="finos-cas-form">
        <label for="finos-cas-pw" style="display:block;font-size:12px;opacity:.7;margin-bottom:4px;">PDF password — usually your PAN in capital letters (some statements: PAN + date of birth)</label>
        <input id="finos-cas-pw" type="password" autocomplete="off" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--border-soft,rgba(255,255,255,.2));background:transparent;color:inherit;font-size:15px;">
        <div id="finos-cas-err" role="alert" style="min-height:18px;color:#EF4444;font-size:13px;margin:8px 0;"></div>
        <button type="submit" style="padding:11px 18px;border-radius:12px;border:none;background:#4f7cff;color:#fff;font-weight:800;cursor:pointer;">Read statement</button>
        <p style="font-size:11.5px;opacity:.55;margin:10px 0 0;">The password and file are used once to read the statement and are not saved. Your PAN, address and e-mail are never returned.</p></form>`;
      const pw = out.querySelector('#finos-cas-pw'); pw.focus();
      out.querySelector('#finos-cas-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = out.querySelector('button[type=submit]'), err = out.querySelector('#finos-cas-err');
        btn.disabled = true; btn.textContent = 'Reading…'; err.textContent = '';
        try { showPreview(await readCasPdf(file, pw.value), out); }
        catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Read statement'; pw.select(); }
      });
    };

    const handle = (file) => {
      if (!file) return;
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        if (file.size > 10 * 1024 * 1024) { wrap.querySelector('#finos-import-out').innerHTML = '<p style="color:#EF4444;">That PDF is over 10 MB.</p>'; return; }
        return handlePdf(file);
      }
      if (file.size > 5 * 1024 * 1024) { wrap.querySelector('#finos-import-out').innerHTML = '<p style="color:#EF4444;">That file is over 5 MB — this looks like the wrong file.</p>'; return; }
      const reader = new root.FileReader();
      reader.onload = () => {
        const res = parseHoldings(reader.result);
        const out = wrap.querySelector('#finos-import-out');
        wrap.querySelector('#finos-import-hint').textContent = file.name;
        showPreview(res, out);
      };
      reader.readAsText(file);
    };
    wrap.querySelector('#finos-import-file').addEventListener('change', (e) => handle(e.target.files[0]));
    wrap.addEventListener('dragover', (e) => e.preventDefault());
    wrap.addEventListener('drop', (e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); });
  }

  return { parseCSV, parseHoldings, fromCas, readCasPdf, casErrorMessage, apply, openDialog, toNumber };
});
