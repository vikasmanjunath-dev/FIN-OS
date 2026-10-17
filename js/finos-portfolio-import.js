/* Bounded CSV parsing for portfolio uploads. Parsing is local to the browser. */
(function (global) {
  'use strict';
  function parseCSV(text) {
    if (typeof text !== 'string') throw new TypeError('CSV contents must be text.');
    text = text.replace(/^\uFEFF/, '');
    const rows = [], row = [];
    let cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell.length === 0) quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row.splice(0)); cell = '';
        if (rows.length > 50000) throw new Error('This file has more than 50,000 rows. Please upload a smaller export.');
      } else cell += ch;
      if (row.length > 200) throw new Error('This file has more than 200 columns. Please use a standard portfolio export.');
    }
    if (quoted) throw new Error('This CSV has an unclosed quoted field. Please re-export the file and try again.');
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    if (rows.length > 50000) throw new Error('This file has more than 50,000 rows. Please upload a smaller export.');
    return rows;
  }
  function rowsToHoldings(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('File appears empty.');
    if (rows.length > 50000) throw new Error('This file has more than 50,000 rows. Please upload a smaller export.');
    const symbolTerms = ['symbol', 'scrip', 'instrument', 'stock name'];
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      const rowText = row.map(cell => cell == null ? '' : String(cell).toLowerCase().trim()).join(' ');
      if (symbolTerms.some(term => rowText.includes(term))) { headerIndex = i; break; }
    }
    if (headerIndex < 0) throw new Error("Could not find a 'Symbol' column. Check your file headers.");
    const headers = (rows[headerIndex] || []).map(cell => cell == null ? '' : String(cell).toLowerCase().trim());
    const findColumn = terms => {
      for (const term of terms) {
        const index = headers.findIndex(header => header.includes(term));
        if (index >= 0) return index;
      }
      return -1;
    };
    const symbolIndex = findColumn(['symbol', 'scrip', 'instrument', 'stock name']);
    const quantityIndex = findColumn(['quantity available', 'quantity', 'qty', 'units', 'shares']);
    // Never treat average purchase price as a current quote.
    const priceIndex = findColumn(['previous closing', 'closing price', 'ltp', 'current price', 'market price', 'last price']);
    const valueIndex = findColumn(['current value', 'market value', 'present value', 'net value']);
    const parseNumber = value => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (value == null || String(value).trim() === '') return null;
      let text = String(value).trim().replace(/[₹,$\s]/g, '');
      const accountingNegative = /^\(.*\)$/.test(text);
      if (accountingNegative) text = text.slice(1, -1);
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
      const number = Number(text) * (accountingNegative ? -1 : 1);
      return Number.isFinite(number) ? number : null;
    };
    const holdings = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      if (row[symbolIndex] == null || String(row[symbolIndex]).trim() === '') continue;
      let symbol = String(row[symbolIndex]).toUpperCase()
        .replace(/NSE:|BSE:|ISIN:|INE[0-9A-Z]+|"/g, '')
        .replace(/-EQ|-BE|-SM/g, '').trim();
      if (symbol.includes('.')) symbol = symbol.split('.')[0].trim();
      symbol = symbol.replace(/[^A-Z0-9.&_-]/g, '').slice(0, 40);
      if (!symbol) continue;
      let value = null;
      if (valueIndex >= 0 && row[valueIndex] != null && String(row[valueIndex]).trim() !== '') {
        value = parseNumber(row[valueIndex]);
      } else if (quantityIndex >= 0 && priceIndex >= 0) {
        const quantity = parseNumber(row[quantityIndex]), price = parseNumber(row[priceIndex]);
        if (quantity !== null && price !== null && quantity > 0 && price > 0 && Number.isFinite(quantity * price)) value = quantity * price;
      }
      if (value !== null && value > 0) {
        if (holdings.length >= 5000) throw new Error('This export contains more than 5,000 valued positions. Please split the file into smaller snapshots.');
        holdings.push({ symbol, value });
      }
    }
    return holdings;
  }
  global.FinosPortfolioImport = Object.freeze({ parseCSV, rowsToHoldings });
})(window);
