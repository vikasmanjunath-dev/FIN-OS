// @ts-nocheck
// Broker holdings CSV parser (Zerodha Console, Groww, any broker with recognisable columns).
// Machine-assisted port: lines are sliced from js/finos-import.js ('use strict' to just before the CAS-PDF section) and left unchanged,
// so __tests__/holdingsImport.parity.test.mts can prove the phone reads every file exactly as the website does.
// The CAS PDF path (needs the document-ai backend) is not part of this file.


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

export { parseHoldings, parseCSV, toNumber, mapColumns, findHeader, detectFormat, classify };
