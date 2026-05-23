/* ═══════════════════════════════════════════════════════════════════
   TRADEBOOK — SCREENSHOT SCAN ENGINE v2.0
   Reads broker screenshots (Zerodha, Groww, Upstox, Angel One, generic)
   via Tesseract.js OCR and auto-fills the trade log form.

   Pipeline:
     pick file → thumbnail → "Analyse" → canvas pre-process → Tesseract OCR
     → broker-specific regex parser → editable preview table
     → "Fill Trade Form" → populate form fields → updateFormCalc()
═══════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

  /* ── Words that look like stock symbols but are UI labels ─────── */
  const SYMBOL_BLOCKLIST = new Set([
    'THE','AND','FOR','MIS','CNC','NRML','EQ','FUT','NSE','BSE','MCX',
    'NFO','BFO','NET','PNL','STT','GST','BUY','SELL','LTP','QTY','AVG',
    'NRI','OPT','FNO','ALL','TAX','TAT','TOTAL','BROKERAGE','STAMP',
    'SEBI','EXCHANGE','TURNOVER','VIRTUAL','CONTRACT','NOTE','POSITIONS',
    'HOLDINGS','GROUP','ANALYTICS','ORDERS','PORTFOLIO','WATCHLIST','BIDS',
    'NIFTY','SENSEX','BANKNIFTY','FINNIFTY','MIDCPNIFTY',
  ]);

  /* ── State ───────────────────────────────────────────────────────── */
  let _file       = null;
  let _extracted  = {};
  let _rawOCRText = '';
  let _rawVisible = false;

  /* ════════════════════════════════════════════════════════════════════
     IMAGE PRE-PROCESSING
     Broker apps use dark themes (white text on black).
     Tesseract works best on black text on white.
     Invert + binarise so OCR accuracy improves significantly.
  ════════════════════════════════════════════════════════════════════ */
  function preprocessImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        // Scale up mobile screenshots (Zerodha, GPay, etc.) for much better OCR accuracy
        const scale  = Math.min(3, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.naturalWidth  * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx    = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = 255 - d[i];
          const g = 255 - d[i + 1];
          const b = 255 - d[i + 2];
          const gray  = 0.299 * r + 0.587 * g + 0.114 * b;
          const sharp = gray > 140 ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = sharp;
        }
        ctx.putImageData(imgData, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => resolve(blob), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
      img.src = url;
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     OCR PIPELINE
  ════════════════════════════════════════════════════════════════════ */
  async function runOCR() {
    if (!_file) return;

    const runBtn = document.getElementById('scan-run-btn');
    if (runBtn) { runBtn.disabled = true; runBtn.innerHTML = '<span>⏳</span> Scanning…'; }

    hideResults();
    setProgress(3, 'Loading image…', 3);

    try {
      setProgress(8, 'Loading OCR engine…', 8);

      /* Tesseract is loaded via <script> tag in index.html */
      if (!window.Tesseract) throw new Error('Tesseract.js not loaded — check your connection');

      setProgress(12, 'Pre-processing image…', 12);
      let ocrTarget;
      try { ocrTarget = await preprocessImage(_file); }
      catch { ocrTarget = _file; }

      setProgress(15, 'Running OCR…', 15);
      const { data: { text } } = await window.Tesseract.recognize(
        ocrTarget,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              const pct = 15 + Math.round(m.progress * 55);
              setProgress(`OCR: ${Math.round(m.progress * 100)}%`, 'Recognising text…', pct);
            }
          },
        }
      );

      _rawOCRText = text;
      setProgress('Parsing…', 'Parsing broker data…', 72);

      const result = parseAll(text);
      _extracted   = result;

      setProgress('Building preview…', 'Building preview…', 95);
      renderPreview(result);

      setProgress('100%', 'Done', 100);
      showStatus('✅ Scan complete — review values and fill the form', 'ok');
      if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '<span>🔄</span> Re-scan'; }

    } catch (err) {
      console.error('[ScanTrade]', err);
      setProgress('0%', '', 0);
      showStatus('❌ ' + (err.message || 'OCR failed — try a clearer screenshot'), 'err');
      if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '<span>🔍</span> Analyse Screenshot'; }
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     MULTI-BROKER PARSERS
  ════════════════════════════════════════════════════════════════════ */
  function parseAll(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const flat  = lines.join('\n');

    for (const fn of [parseZerodha, parseGroww, parseUpstox, parseAngelOne]) {
      try {
        const r = fn(lines, flat);
        // Accept result if it found a symbol OR any meaningful trading data
        if (r && (r.symbol || r.net != null || r.pnl != null || r.gross != null)) return r;
      } catch { /* try next */ }
    }
    return parseGeneric(lines, flat);
  }

  /* ── Zerodha Kite ──────────────────────────────────────────────── */
  function parseZerodha(lines, flat) {
    const isContract  = /Virtual contract note|contract note/i.test(flat);
    const isPositions = /Total\s+P.{0,3}L|Positions|MIS|CNC/i.test(flat);
    if (!isContract && !isPositions) return null;

    const out = { _broker: 'Zerodha' };

    /* ── Symbol extraction ────────────────────────────────────────
       Zerodha Positions shows "SHADOWFAX +625.00" on one line.
       Pass 1: standalone symbol.  Pass 2: symbol + value on same line. */
    out.symbol = extractSymbol(lines);

    const instM = flat.match(/\b(EQ|FUT|CE|PE)\b/);
    if (instM) out.instrumentType = instM[1];

    const typeM = flat.match(/\b(MIS|CNC|NRML)\b/);
    if (typeM) out.tradeType = typeM[1];

    /* ── Contract note parsing ────────────────────────────────── */
    if (isContract) {
      /* ── Trade line matching ─────────────────────────────────────────
         Three OCR layouts for Zerodha virtual contract notes:

         FORMAT A – table data row (no "Qty."/"Avg." labels):
           "SELL  500  192.25  96,125.00  10:58:06  NSE"
           "BUY   500  191.00  95,500.00  09:17:02  NSE"

         FORMAT B – inline labels, direction at start:
           "SELL Qty. 500  Avg. 192.25  ⊙ 10:58:06  NSE"

         FORMAT C – inline labels, direction at end:
           "Qty. 500  Avg. 192.25  ⊙ 10:58:06  NSE  SELL"

         For format A the pattern is:
           (BUY|SELL)  qty  price  [turnover]  HH:MM:SS  exchange
         The turnover (e.g. 96,125.00) sits between price and time but is
         optional — handled by (?:[\d,]+\.\d{2}\s+)?
      ────────────────────────────────────────────────────────────────── */

      /* ── FORMAT A: labeled table data row (highest priority) ───────── */
      const DATA_LBL = /(?:^|\n)(BUY|SELL)\s+(\d{1,6})\s+([\d.,]+\.\d{2})\s+(?:[\d,]+\.\d{2}\s+)?(\d{2}:\d{2}:\d{2})\s+(NSE|BSE|MCX|NFO)/gi;
      /* FORMAT A no-label: same but without BUY/SELL (use price compare) */
      const DATA_NOLBL = /(?:^|\n)(\d{1,6})\s+([\d.,]+\.\d{2})\s+(?:[\d,]+\.\d{2}\s+)?(\d{2}:\d{2}:\d{2})\s+(NSE|BSE|MCX|NFO)/gi;

      /* ── FORMATS B & C: lines that have "Qty." and "Avg." labels ───── */
      const QA_BODY    = String.raw`Qty\.?\s+(\d+)\s+Avg\.?\s+([\d.]+)\s*(?:\S+\s+)?[^\d\n]*?(\d{2}:\d{2}(?::\d{2})?)\s+(NSE|BSE|MCX|NFO)`;
      const TRADE_END  = new RegExp(QA_BODY + String.raw`\s+(BUY|SELL)`, 'gi');
      const TRADE_START= new RegExp(String.raw`(BUY|SELL)\s+` + QA_BODY,  'gi');
      const TRADE_QA   = new RegExp(QA_BODY, 'gi');

      /* Normalise a regex match to {dir, qty, avg, time, exchange} */
      const norm = (m, dir, qi, ai, ti, ei) =>
        ({ dir, qty: +m[qi], avg: parseFloat(String(m[ai]).replace(/,/g,'')), time: m[ti], exchange: m[ei] });

      /* Collect all hits from each pattern */
      const rowLbl  = [...flat.matchAll(DATA_LBL   )].map(m => norm(m, m[1].toUpperCase(), 2, 3, 4, 5));
      const rowNolbl= [...flat.matchAll(DATA_NOLBL  )].map(m => norm(m, '',                1, 2, 3, 4));
      const endHits = [...flat.matchAll(TRADE_END   )].map(m => norm(m, m[5].toUpperCase(), 1, 2, 3, 4));
      const stHits  = [...flat.matchAll(TRADE_START )].map(m => norm(m, m[1].toUpperCase(), 2, 3, 4, 5));
      const qaHits  = [...flat.matchAll(TRADE_QA    )].map(m => norm(m, '',                1, 2, 3, 4));

      /* Labeled: FORMAT A rows first, then B/C */
      const labeled = [...rowLbl, ...endHits, ...stHits];
      const buyHit  = labeled.find(t => t.dir === 'BUY');
      const sellHit = labeled.find(t => t.dir === 'SELL');

      /* Unlabeled fallback: dedupe by time, sort by avg price */
      const allNolbl = [...rowNolbl, ...qaHits]
        .filter((h, i, arr) => arr.findIndex(x => x.time === h.time) === i); // dedupe by time
      const sorted2  = [...allNolbl].sort((a, b) => a.avg - b.avg);
      const entryFb  = sorted2[0] || null;
      const exitFb   = sorted2.length >= 2 ? sorted2[sorted2.length - 1] : null;

      /* ── Populate entry ──────────────────────────────────────────────── */
      const eSource = buyHit  || entryFb;
      if (eSource) {
        out.qty       = eSource.qty;
        out.entry     = eSource.avg;
        out.entryTime = eSource.time;
        out.exchange  = eSource.exchange;
      }

      /* ── Populate exit ───────────────────────────────────────────────── */
      const xSource = sellHit || exitFb;
      if (xSource) {
        if (!out.qty) out.qty = xSource.qty;
        out.exit     = xSource.avg;
        out.exitTime = xSource.time;
        if (!out.exchange) out.exchange = xSource.exchange;
      }

      /* ── Cross-validate: if labeled price is ≥5× from no-label fallback,
            the labeled line was misread — prefer the unlabeled value ─── */
      const crossCheck = (hit, fb, setFn) => {
        if (hit && fb && fb.avg > 0) {
          const r = hit.avg / fb.avg;
          if (r >= 5 || r <= 0.2) setFn(fb.avg, fb.time);
        }
      };
      crossCheck(buyHit,  entryFb, (v,t) => { out.entry = v; out.entryTime = t; });
      crossCheck(sellHit, exitFb,  (v,t) => { out.exit  = v; out.exitTime  = t; });

      /* ── TURNOVER-DERIVED PRICE OVERRIDE ────────────────────────────────
         Zerodha contract notes show a "Trade Value" (turnover) column:
           e.g.  BUY  500  191.00  95,500.00  09:17:02  NSE
                              ↑                 ↑
                          avg price          turnover = qty × price

         Problem: OCR reliably misreads small 3-digit prices like "191.00"
         as "1900" (decimal dropped / digit inserted), but NEVER misreads
         large 5-digit numbers like "95,500.00".

         Solution: find every HH:MM:SS timestamp in the doc, look backward
         for the nearest large turnover, divide by qty → get exact price.

         Only overrides when both prices are found AND they differ
         (same value = no useful information, don't override). ────────── */
      const allTimesInDoc = [...flat.matchAll(/\b(\d{2}:\d{2}:\d{2})\b/g)];
      if (out.qty && out.qty > 0 && allTimesInDoc.length >= 1) {
        const derived = allTimesInDoc.map(tm => {
          const pre = flat.slice(Math.max(0, tm.index - 400), tm.index);
          /* Turnover: last large number (≥5 digits before decimal) before this time */
          const bigNums = [...pre.matchAll(/([\d,]{5,}\.\d{2})/g)]
            .map(m => parseFloat(m[1].replace(/,/g, '')))
            .filter(v => v > 1000);
          if (!bigNums.length) return null;
          const price = round2(bigNums[bigNums.length - 1] / out.qty);
          if (price < 0.5 || price > 999999) return null;
          return { time: tm[1], price };
        }).filter(Boolean);

        /* Remove duplicates (same time appearing twice in OCR) */
        const uniq = derived.filter((d, i, a) => a.findIndex(x => x.time === d.time) === i);
        uniq.sort((a, b) => a.price - b.price);

        if (uniq.length >= 2 && uniq[uniq.length - 1].price > uniq[0].price) {
          /* Two distinct prices found — lower = BUY/entry, higher = SELL/exit */
          out.entry     = uniq[0].price;
          out.entryTime = uniq[0].time;
          out.exit      = uniq[uniq.length - 1].price;
          out.exitTime  = uniq[uniq.length - 1].time;
        } else if (uniq.length === 1) {
          /* Only one timestamp found — use its derived price for whichever is missing */
          if (out.entry == null || Math.abs(out.entry - uniq[0].price) > 1)
            { out.entry = uniq[0].price; out.entryTime = uniq[0].time; }
        }
      }

      /* ── Charges — handle ₹ misread as ¥, % or the digit 3 by OCR ──
         Tesseract frequently OCR-reads the ₹ glyph as:
           ¥  (yen)     → handled by [₹¥%]
           %  (percent) → handled by [₹¥%]
           3  (digit)   → "₹40.00" becomes "340.00"
                          Treat leading "3" as a currency prefix ONLY when
                          it is followed by a digit 1-9 (so genuine "3.00"
                          isn't accidentally stripped). ─────────────────── */
      const CUR = '(?:[₹¥%]|3(?=[1-9]))';   // currency prefix (optional via ?)

      /* Helper: try multiple label variants, return first non-null match */
      const tryCharge = (...patterns) => {
        for (const p of patterns) {
          const v = extractCharge(flat, p);
          if (v != null) return v;
        }
        return null;
      };

      out.charges = {
        brokerage: tryCharge(
          new RegExp(`Brokerage\\s+${CUR}?([\\d,]+\\.\\d{2})`),
        ),
        stt: tryCharge(
          // Zerodha labels: "STT", "STT/CTT", "Securities Transaction Tax"
          new RegExp(`\\bSTT\\b[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`),
          new RegExp(`Securities\\s+Transaction\\s+Tax[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
        stampDuty: tryCharge(
          new RegExp(`Stamp\\s*(?:duty|charges?)[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
        exchangeCharge: tryCharge(
          new RegExp(`Exchange\\s+(?:turnover|transaction)\\s+charge[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`Exchange\\s+charge[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
        sebiCharge: tryCharge(
          new RegExp(`SEBI\\s+(?:turnover|transaction)?\\s*charge[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`\\bSEBI\\b[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`),
        ),
        gst: tryCharge(
          new RegExp(`\\bGST\\b[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`),
          new RegExp(`Goods\\s+and\\s+Services\\s+Tax[^\\d\\n]*?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
      };

      /* Total charges line — also handle ₹ misread (including ₹→3) */
      const totM = flat.match(new RegExp(`\\bTotal\\b\\s+${CUR}?([\\d,]+\\.\\d{2})`));
      out.charges.totalCharges = totM
        ? parseMoney(totM[1])
        : Object.values(out.charges).reduce((a, b) => a + (b || 0), 0);

      out.tax = out.charges.totalCharges || undefined;
    }

    /* ── Positions page: "Total P&L\n+625.00" or "Total P&L +625.00" ──
       Use [\s\S]{0,30}? so OCR noise between label and value is tolerated.
       Explicitly exclude NIFTY/SENSEX index lines to avoid picking up
       index changes like "-76.15" as the trade P&L. */
    const flatNoIndex = flat
      .split('\n')
      .filter(l => !/\b(NIFTY|SENSEX|BANKNIFTY|FINNIFTY|MIDCPNIFTY)\b/i.test(l))
      .join('\n');

    const pnlM = flatNoIndex.match(/Total\s+P.{0,3}L[\s\S]{0,30}?([+-][\d,]+\.\d{2})/i)
              || flatNoIndex.match(/([+-][\d,]+\.\d{2})\s*\n[^\n]*(?:EQ|FUT|CE|PE|MIS|CNC)/i);
    if (pnlM) out.pnl = parseMoney(pnlM[1]);

    /* ── Positions page: "Qty. N  Avg. X.XX  MIS/CNC" ─────────── */
    const posQtyM = flatNoIndex.match(/Qty\.?\s+(\d+)\s+Avg\.?\s+[\d.,]+\s+(MIS|CNC|NRML)/i);
    if (posQtyM) {
      out.qty = parseInt(posQtyM[1], 10);
      if (!out.tradeType) out.tradeType = posQtyM[2];
    }

    /* ── Final gross/net calculation ──────────────────────────── */
    if (out.entry != null && out.exit != null && out.qty) {
      out.gross = round2((out.exit - out.entry) * out.qty);
    }
    if (out.gross != null && out.tax != null) {
      out.net = round2(out.gross - out.tax);
    } else if (out.pnl != null) {
      out.net   = out.pnl;
      out.gross = out.tax != null ? round2(out.pnl + out.tax) : out.pnl;
    }

    out.date = today();
    return out;
  }

  /* ── Groww ─────────────────────────────────────────────────────── */
  function parseGroww(lines, flat) {
    if (!/Groww|Order Details/i.test(flat)) return null;
    const out   = { _broker: 'Groww' };
    out.symbol  = extractSymbol(lines);

    const pnlM  = flat.match(/(?:P&?L|Profit|Return)\s*[:\s]*([+-]?[₹]?[\d,]+\.\d{2})/i);
    if (pnlM)  out.net = parseMoney(pnlM[1]);

    const qtyM  = flat.match(/(?:Qty|Quantity)\s*[:\s]*(\d+)/i);
    if (qtyM)  out.qty = parseInt(qtyM[1], 10);

    const buyM  = flat.match(/(?:Buy|Bought)\s*(?:Avg|Price)?\s*[:\s]*[₹]?([\d,]+\.\d{2})/i);
    const sellM = flat.match(/(?:Sell|Sold)\s*(?:Avg|Price)?\s*[:\s]*[₹]?([\d,]+\.\d{2})/i);
    if (buyM)  out.entry = parseMoney(buyM[1]);
    if (sellM) out.exit  = parseMoney(sellM[1]);

    out.date = today();
    return out;
  }

  /* ── Upstox ────────────────────────────────────────────────────── */
  function parseUpstox(lines, flat) {
    if (!/Upstox|Pro\s+Web/i.test(flat)) return null;
    const out   = { _broker: 'Upstox' };
    out.symbol  = extractSymbol(lines);

    const pnlM  = flat.match(/(?:Net\s+P&?L|Realised\s+P&?L)\s*[:\s]*([+-]?[₹]?[\d,]+\.?\d*)/i);
    if (pnlM) out.net = parseMoney(pnlM[1]);

    const qtyM  = flat.match(/Qty\s*[:\s]*(\d+)/i);
    if (qtyM)  out.qty = parseInt(qtyM[1], 10);

    const buyM  = flat.match(/Buy\s+(?:Price|Avg)?\s*[:\s]*[₹]?([\d,]+\.\d{2})/i);
    const sellM = flat.match(/Sell\s+(?:Price|Avg)?\s*[:\s]*[₹]?([\d,]+\.\d{2})/i);
    if (buyM)  out.entry = parseMoney(buyM[1]);
    if (sellM) out.exit  = parseMoney(sellM[1]);

    out.date = today();
    return out;
  }

  /* ── Angel One ─────────────────────────────────────────────────── */
  function parseAngelOne(lines, flat) {
    if (!/Angel|AngelOne|SmartAPI/i.test(flat)) return null;
    const out   = { _broker: 'Angel One' };
    out.symbol  = extractSymbol(lines);

    const pnlM  = flat.match(/(?:P&?L|Net\s+Profit|Realised)\s*[:\s]*([+-]?[₹]?[\d,]+\.?\d*)/i);
    if (pnlM) out.net = parseMoney(pnlM[1]);

    const qtyM  = flat.match(/Qty\s*[:\s]*(\d+)/i);
    if (qtyM)  out.qty = parseInt(qtyM[1], 10);

    out.date = today();
    return out;
  }

  /* ── Generic fallback ──────────────────────────────────────────── */
  function parseGeneric(lines, flat) {
    const out   = { _broker: 'Auto-detected' };
    out.symbol  = extractSymbol(lines);

    const pnlM  = flat.match(/([+-][\d,]+\.\d{2})/);
    if (pnlM) out.pnl = parseMoney(pnlM[1]);

    const qtyM  = flat.match(/(?:Qty|Quantity)[.\s:]*(\d+)/i);
    if (qtyM)  out.qty = parseInt(qtyM[1], 10);

    const prices = [...flat.matchAll(/\b(\d{2,5}\.\d{2})\b/g)]
      .map(m => parseFloat(m[1]))
      .filter((v, i, a) => a.indexOf(v) === i && v > 1);

    if (prices.length >= 2) {
      prices.sort((a, b) => a - b);
      out.entry = prices[0];
      out.exit  = prices[prices.length - 1];
    }

    const totM = flat.match(/Total\s+[₹]?([\d,]+\.\d{2})/);
    if (totM) out.tax = parseMoney(totM[1]);

    if (out.pnl != null) {
      out.net   = out.pnl;
      out.gross = out.tax != null ? round2(out.pnl + out.tax) : out.pnl;
    }

    out.date = today();
    return out;
  }

  /* ════════════════════════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════════════════════════ */
  function extractSymbol(lines) {
    // Pass 1: standalone symbol on its own line
    for (const line of lines) {
      if (/^[A-Z][A-Z0-9&\-]{1,19}$/.test(line) && !SYMBOL_BLOCKLIST.has(line)) {
        return line;
      }
    }
    // Pass 2: symbol at the START of a line followed by a price or instrument tag.
    // Handles "SHADOWFAX +625.00" (positions) and "SHADOWFAX ₹51.23" (contract note).
    for (const line of lines) {
      const m = line.match(/^([A-Z][A-Z0-9&\-]{2,19})\s+(?:[+\-₹¥%]?\d|EQ\b|FUT\b|CE\b|PE\b)/);
      if (m && !SYMBOL_BLOCKLIST.has(m[1])) return m[1];
    }
    return undefined;
  }

  function extractCharge(text, regex) {
    const m = text.match(regex);
    return m ? parseMoney(m[1]) : 0;
  }

  function parseMoney(str) {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[₹,\s+]/g, '')) || 0;
  }

  function round2(n)  { return Math.round(n * 100) / 100; }
  function today()    { return new Date().toISOString().split('T')[0]; }
  function fmtMoney(n, sign) {
    const abs = Math.abs(n).toFixed(2);
    if (sign) return (n >= 0 ? '+₹' : '-₹') + abs;
    return '₹' + abs;
  }

  /* ════════════════════════════════════════════════════════════════════
     UI — PROGRESS
  ════════════════════════════════════════════════════════════════════ */
  function setProgress(pctLabel, statusLabel, pct) {
    const wrap   = document.getElementById('scan-progress-wrap');
    const bar    = document.getElementById('scan-progress-bar');
    const status = document.getElementById('scan-progress-status');
    const pctEl  = document.getElementById('scan-progress-pct');

    if (pct > 0 && pct < 100) {
      if (wrap)   wrap.classList.add('visible');
      if (bar)    bar.style.width = pct + '%';
      if (status) status.textContent = statusLabel || '';
      if (pctEl)  pctEl.textContent  = pct + '%';
    } else if (pct >= 100) {
      if (bar)    bar.style.width = '100%';
      if (pctEl)  pctEl.textContent = '100%';
      if (status) status.textContent = 'Done';
      setTimeout(() => { if (wrap) wrap.classList.remove('visible'); }, 800);
    } else {
      if (wrap)   wrap.classList.remove('visible');
      if (bar)    bar.style.width = '0%';
      if (pctEl)  pctEl.textContent = '0%';
    }
  }

  function showStatus(msg, type) {
    const el = document.getElementById('scan-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className   = 'scan-status' + (type ? ' ' + type : '');
  }

  /* ════════════════════════════════════════════════════════════════════
     UI — PREVIEW TABLE
  ════════════════════════════════════════════════════════════════════ */
  const PREVIEW_ROWS = [
    { label: 'Symbol',        key: 'symbol',         editable: true  },
    { label: 'Instrument',    key: 'instrumentType', editable: true  },
    { label: 'Trade Type',    key: 'tradeType',      editable: true  },
    { label: 'Exchange',      key: 'exchange',       editable: true  },
    { label: 'Qty',           key: 'qty',            editable: true  },
    { label: 'Entry Price',   key: 'entry',          editable: true  },
    { label: 'Exit Price',    key: 'exit',           editable: true  },
    { label: 'Entry Time',    key: 'entryTime',      editable: true  },
    { label: 'Exit Time',     key: 'exitTime',       editable: true  },
    { label: 'Gross P&L',     key: 'gross',          editable: true  },
    { label: 'Total Charges', key: 'tax',            editable: true  },
    { label: 'Net P&L',       key: 'net',            editable: true  },
  ];

  const CHARGE_SUB_ROWS = [
    { label: '↳ Brokerage',    ckey: 'brokerage'      },
    { label: '↳ STT',          ckey: 'stt'            },
    { label: '↳ Stamp Duty',   ckey: 'stampDuty'      },
    { label: '↳ Exch. Charge', ckey: 'exchangeCharge' },
    { label: '↳ SEBI Charge',  ckey: 'sebiCharge'     },
    { label: '↳ GST',          ckey: 'gst'            },
  ];

  function renderPreview(data) {
    const tbody  = document.getElementById('scan-preview-body');
    const badge  = document.getElementById('scan-broker-badge');
    const results = document.getElementById('scan-results');
    const footer  = document.getElementById('scan-footer');
    if (!tbody) return;

    if (badge)  badge.textContent = data._broker || 'Unknown';

    const rows = [];

    for (const row of PREVIEW_ROWS) {
      const val = data[row.key];

      /* Format display value */
      let display = '';
      let valClass = 'scan-value';
      if (val !== undefined && val !== null && val !== 0) {
        if (row.key === 'entry' || row.key === 'exit' || row.key === 'tax') {
          display = fmtMoney(val, false);
        } else if (row.key === 'gross' || row.key === 'net' || row.key === 'pnl') {
          display = fmtMoney(val, true);
          valClass += val >= 0 ? ' pos' : ' neg';
        } else {
          display = String(val);
        }
      }

      const edAttr = row.editable ? 'contenteditable="true" spellcheck="false"' : '';
      const emptyClass = display === '' ? ' empty' : '';

      rows.push(`
        <tr>
          <td class="scan-field-label">${row.label}</td>
          <td class="${valClass}${emptyClass}" data-key="${row.key}" ${edAttr}>${
            display || '<span style="opacity:.4;font-family:var(--font-body);font-weight:400;font-size:11px">not found</span>'
          }</td>
        </tr>`);

      /* Inject charge sub-rows after "Total Charges" */
      if (row.key === 'tax' && data.charges) {
        rows.push(`<tr class="scan-section-row"><td colspan="2">Charge Breakdown</td></tr>`);
        for (const cr of CHARGE_SUB_ROWS) {
          const cv = data.charges[cr.ckey];
          if (!cv) continue;
          rows.push(`
            <tr>
              <td class="scan-field-label" style="color:var(--text3);font-size:11px">${cr.label}</td>
              <td class="scan-value" style="font-size:11px;color:var(--text2)" data-key="charges.${cr.ckey}">${fmtMoney(cv, false)}</td>
            </tr>`);
        }
      }
    }

    tbody.innerHTML = rows.join('');

    if (results) results.classList.add('visible');
    if (footer)  footer.classList.add('visible');

    /* Populate raw OCR area */
    const rawEl = document.getElementById('scan-raw-text');
    if (rawEl)  rawEl.textContent = _rawOCRText.slice(0, 4000);
  }

  function hideResults() {
    const results = document.getElementById('scan-results');
    const footer  = document.getElementById('scan-footer');
    const rawEl   = document.getElementById('scan-raw-text');
    if (results)  results.classList.remove('visible');
    if (footer)   footer.classList.remove('visible');
    if (rawEl)    { rawEl.classList.remove('visible'); _rawVisible = false; }
    const tbody   = document.getElementById('scan-preview-body');
    if (tbody)    tbody.innerHTML = '';
  }

  /* ════════════════════════════════════════════════════════════════════
     FILL FORM
     f-tax and f-net are readonly — auto-computed by updateFormCalc()
     from individual charge inputs. Populate those instead.
  ════════════════════════════════════════════════════════════════════ */
  function fillForm() {
    /* Read back any user edits from the contenteditable cells */
    document.querySelectorAll('#scan-preview-body .scan-value[data-key]').forEach(el => {
      const key = el.dataset.key;
      if (!key || key.startsWith('charges.')) return;
      const raw = el.textContent.replace(/[₹+,\s]/g, '').trim();
      const num = parseFloat(raw);
      if (!isNaN(num) && ['entry','exit','qty','gross','pnl'].includes(key)) {
        _extracted[key] = num;
      } else if (['symbol','instrumentType','tradeType','exchange','entryTime','exitTime'].includes(key)) {
        _extracted[key] = el.textContent.trim();
      }
    });

    const d = _extracted;

    /* Set field value without dispatching per-field events.
       We'll fire one updateFormCalc() at the end so the form
       computes f-tax and f-net cleanly from all values at once. */
    function setField(id, val) {
      if (val === undefined || val === null || val === '' || val === 0) return;
      const el = document.getElementById(id);
      if (!el || el.readOnly) return;   /* never touch readonly computed fields */
      el.value = String(val);
    }

    setField('f-date',       d.date || today());
    setField('f-symbol',     d.symbol);
    setField('f-qty',        d.qty);
    setField('f-entry',      d.entry);
    setField('f-exit',       d.exit);
    setField('f-entry-time', d.entryTime);
    setField('f-exit-time',  d.exitTime);

    /* Uppercase the symbol */
    const symEl = document.getElementById('f-symbol');
    if (symEl && symEl.value) symEl.value = symEl.value.toUpperCase();

    /* Populate individual charge fields so updateFormCalc sums them correctly.
       f-tax and f-net are readonly — updateFormCalc writes them automatically. */
    if (d.charges) {
      setField('f-brokerage',        d.charges.brokerage);
      setField('f-stt',              d.charges.stt);
      setField('f-exchange-charges', d.charges.exchangeCharge);
      setField('f-sebi',             d.charges.sebiCharge);
      setField('f-gst',              d.charges.gst);
      /* Stamp duty has no dedicated field — fold into other-charges */
      if (d.charges.stampDuty) setField('f-other-charges', d.charges.stampDuty);
    }

    /* Trade-type select */
    if (d.tradeType) {
      const sel = document.getElementById('f-trade-type');
      if (sel) sel.value = d.tradeType.toLowerCase();
    }

    /* Append charge breakdown to notes */
    if (d.charges) {
      const chargeMap = {
        brokerage: 'Brokerage', stt: 'STT', stampDuty: 'Stamp',
        exchangeCharge: 'Exch', sebiCharge: 'SEBI', gst: 'GST',
      };
      const parts = Object.entries(chargeMap)
        .filter(([k]) => d.charges[k])
        .map(([k, label]) => `${label} ₹${d.charges[k].toFixed(2)}`);
      if (parts.length) {
        const notesEl = document.getElementById('f-notes');
        if (notesEl && !notesEl.value) {
          notesEl.value = `[${d._broker}] Charges: ${parts.join(' · ')}`;
        }
      }
    }

    closeScanModal();
    if (window.navigateTo) window.navigateTo('add-trade');

    /* Single updateFormCalc fires AFTER navigate so all fields are in DOM.
       This computes f-gross from entry/exit/qty, f-tax from charge fields,
       f-net from gross - tax, and updates all ticker values. */
    setTimeout(() => { if (window.updateFormCalc) window.updateFormCalc(); }, 80);

    if (window.showToast) window.showToast('Trade imported! Review and save.', 'success');
  }

  /* ════════════════════════════════════════════════════════════════════
     FILE HANDLING
  ════════════════════════════════════════════════════════════════════ */
  function setFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showStatus('Only image files are supported (PNG, JPG, WebP)', 'err');
      return;
    }
    _file = file;

    /* Show thumbnail */
    const wrap = document.getElementById('scan-thumb-wrap');
    const thumb = document.getElementById('scan-thumb');
    const name  = document.getElementById('scan-thumb-name');
    const size  = document.getElementById('scan-thumb-size');
    if (thumb) thumb.src = URL.createObjectURL(file);
    if (name)  name.textContent = file.name;
    if (size)  size.textContent = (file.size / 1024).toFixed(0) + ' KB';
    if (wrap)  wrap.classList.add('visible');

    /* Hide dropzone text, enable run button */
    const runBtn = document.getElementById('scan-run-btn');
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = '<span>🔍</span> Analyse Screenshot';
    }

    hideResults();
    showStatus('', '');
  }

  function removeFile() {
    _file = null;
    const wrap   = document.getElementById('scan-thumb-wrap');
    const thumb  = document.getElementById('scan-thumb');
    const fi     = document.getElementById('scan-file-input');
    const runBtn = document.getElementById('scan-run-btn');
    if (wrap)   wrap.classList.remove('visible');
    if (thumb)  { URL.revokeObjectURL(thumb.src); thumb.src = ''; }
    if (fi)     fi.value = '';
    if (runBtn) runBtn.disabled = true;
    hideResults();
    showStatus('', '');
  }

  /* ════════════════════════════════════════════════════════════════════
     MODAL LIFECYCLE
  ════════════════════════════════════════════════════════════════════ */
  function openScanModal() {
    const m = document.getElementById('scan-trade-modal');
    if (!m) return;
    resetScanner();
    m.classList.add('scan-open');
    document.body.style.overflow = 'hidden';
  }

  function closeScanModal() {
    const m = document.getElementById('scan-trade-modal');
    if (!m) return;
    m.classList.remove('scan-open');
    document.body.style.overflow = '';
  }

  function resetScanner() {
    _file       = null;
    _extracted  = {};
    _rawOCRText = '';
    _rawVisible = false;

    const fi     = document.getElementById('scan-file-input');
    const wrap   = document.getElementById('scan-thumb-wrap');
    const thumb  = document.getElementById('scan-thumb');
    const runBtn = document.getElementById('scan-run-btn');
    const dz     = document.getElementById('scan-dropzone');

    if (fi)     fi.value = '';
    if (wrap)   wrap.classList.remove('visible');
    if (thumb)  thumb.src = '';
    if (runBtn) { runBtn.disabled = true; runBtn.innerHTML = '<span>🔍</span> Analyse Screenshot'; }
    if (dz)     dz.classList.remove('drag-over');

    setProgress('0%', '', 0);
    showStatus('', '');
    hideResults();
  }

  function toggleRaw() {
    _rawVisible = !_rawVisible;
    const el     = document.getElementById('scan-raw-text');
    const toggle = document.getElementById('scan-raw-toggle');
    if (el)     el.classList.toggle('visible', _rawVisible);
    if (toggle) toggle.textContent = _rawVisible ? 'Hide raw OCR' : 'Show raw OCR';
  }

  /* ════════════════════════════════════════════════════════════════════
     INIT — drag, drop, file input, paste, keyboard
  ════════════════════════════════════════════════════════════════════ */
  function initDropzone() {
    const dz = document.getElementById('scan-dropzone');
    const fi = document.getElementById('scan-file-input');

    if (dz) {
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
      dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) setFile(file);
      });
    }

    if (fi) {
      fi.addEventListener('change', () => {
        if (fi.files[0]) setFile(fi.files[0]);
      });
    }

    document.addEventListener('paste', e => {
      const m = document.getElementById('scan-trade-modal');
      if (!m || !m.classList.contains('scan-open')) return;
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
      if (item) setFile(item.getAsFile());
    });

    document.addEventListener('keydown', e => {
      const m = document.getElementById('scan-trade-modal');
      if (e.key === 'Escape' && m?.classList.contains('scan-open')) closeScanModal();
    });

    const backdrop = document.getElementById('scan-trade-modal');
    if (backdrop) {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) closeScanModal();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initDropzone);

  /* ════════════════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════════════════ */
  window.ScanTrade = {
    open:        openScanModal,
    close:       closeScanModal,
    fill:        fillForm,
    showRaw:     toggleRaw,
    _run:        runOCR,
    _removeFile: removeFile,
  };

})();
