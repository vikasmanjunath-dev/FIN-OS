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
          // Invert ALL pixels, then binarize at threshold 140 using the
          // MINIMUM channel (not weighted-average grayscale).
          //
          // Why min(R,G,B)?
          //   For achromatic (neutral) pixels R=G=B, so min = weighted avg —
          //   behaviour is IDENTICAL to the old approach for the main dark-mode
          //   content (headers, charges, BUY rows, etc.).
          //
          //   For SATURATED coloured pixels the minimum channel is much lower
          //   than the weighted average, so after inversion it clears 140:
          //     • SELL badge ~(255,100,100): min=100 → inverted 155 > 140 → WHITE ✓
          //       (weighted avg ≈147 → inverted 108 < 140 → BLACK — the old bug)
          //     • BUY  badge ~(20, 60, 20):  min=20  → inverted 235 > 140 → WHITE ✓
          //     • main  bg   ~(20, 20, 25):  min=20  → inverted 235 > 140 → WHITE ✓
          //     • white text (255,255,255):  min=255 → inverted   0 < 140 → BLACK ✓
          //
          //   Result: coloured row badges become white background with black text
          //   instead of invisible black-on-black, with zero regression elsewhere.
          const origMin = Math.min(d[i], d[i + 1], d[i + 2]);
          const gray    = 255 - origMin;   // invert the minimum channel
          const sharp   = gray > 140 ? 255 : 0;
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
      /* ═══════════════════════════════════════════════════════════════
         TRADE LINE EXTRACTION — multi-format, multi-pass

         The Zerodha Virtual Contract Note table can be OCR'd in various
         column orderings.  We try formats in priority order and accept
         the first hit for each direction (BUY / SELL).

         FORMAT A  BUY/SELL starts the row (most common):
           "BUY  500  191.00  95,500.00  09:17:02  NSE"
         FORMAT B  Timestamp comes first in the row:
           "09:17:02  SHADOWFAX  BUY  500  191.00  95,500.00  NSE"
         FORMAT C  BUY/SELL anywhere on the line, time also on same line
         FORMAT D  Inline Qty./Avg. labels (positions-style)
         FORMAT E  No BUY/SELL label — use price comparison
         FORMAT F  Line-by-line scan (last resort, any column order)
      ═══════════════════════════════════════════════════════════════ */

      const norm = (m, dir, qi, ai, ti, ei) => ({
        dir,
        qty:      +m[qi],
        avg:      parseFloat(String(m[ai]).replace(/,/g,'')),
        time:     m[ti] || '',
        exchange: m[ei] || '',
      });

      /* FORMAT A: BUY/SELL at/near line-start, price before time */
      const FMT_A = /(BUY|SELL)\s+(\d{1,6})\s+([\d.,]+\.\d{2})\s+(?:[\d,]+\.\d{2}\s+)?(\d{2}:\d{2}:\d{2})\s+(NSE|BSE|MCX|NFO)/gi;

      /* FORMAT B: timestamp first, BUY/SELL follows */
      const FMT_B = /(\d{2}:\d{2}:\d{2})[^\n]{0,60}?(BUY|SELL)\s+(\d{1,6})\s+([\d.,]+\.\d{2})[^\n]{0,60}?(NSE|BSE|MCX|NFO)/gi;

      /* FORMAT C: BUY/SELL anywhere, time follows price */
      const FMT_C = /\b(BUY|SELL)\b[^\n]{0,30}?\b(\d{1,4})\b\s+([\d.,]+\.\d{2})\b[^\n]{0,80}(\d{2}:\d{2}:\d{2})/gi;

      /* FORMAT D: inline Qty./Avg. labels */
      const QA_BODY    = String.raw`Qty\.?\s+(\d+)\s+Avg\.?\s+([\d.]+)\s*(?:\S+\s+)?[^\d\n]*?(\d{2}:\d{2}(?::\d{2})?)\s+(NSE|BSE|MCX|NFO)`;
      const TRADE_END  = new RegExp(QA_BODY + String.raw`\s+(BUY|SELL)`, 'gi');
      const TRADE_START= new RegExp(String.raw`(BUY|SELL)\s+` + QA_BODY, 'gi');
      const TRADE_QA   = new RegExp(QA_BODY, 'gi');

      /* FORMAT E: no BUY/SELL label */
      const FMT_E = /(?:^|\n)(\d{1,6})\s+([\d.,]+\.\d{2})\s+(?:[\d,]+\.\d{2}\s+)?(\d{2}:\d{2}:\d{2})\s+(NSE|BSE|MCX|NFO)/gi;

      const fmtA  = [...flat.matchAll(FMT_A    )].map(m => norm(m, m[1].toUpperCase(), 2, 3, 4, 5));
      const fmtB  = [...flat.matchAll(FMT_B    )].map(m => norm(m, m[2].toUpperCase(), 3, 4, 1, 5));
      const fmtC  = [...flat.matchAll(FMT_C    )].map(m => ({
        dir: m[1].toUpperCase(), qty: +m[2],
        avg: parseFloat(String(m[3]).replace(/,/g,'')), time: m[4], exchange: '',
      }));
      const endH  = [...flat.matchAll(TRADE_END  )].map(m => norm(m, m[5].toUpperCase(), 1, 2, 3, 4));
      const stH   = [...flat.matchAll(TRADE_START)].map(m => norm(m, m[1].toUpperCase(), 2, 3, 4, 5));
      const qaH   = [...flat.matchAll(TRADE_QA   )].map(m => norm(m, '', 1, 2, 3, 4));
      const fmtE  = [...flat.matchAll(FMT_E      )].map(m => norm(m, '', 1, 2, 3, 4));

      const labeled = [...fmtA, ...fmtB, ...fmtC, ...endH, ...stH];
      let   buyHit  = labeled.find(t => t.dir === 'BUY');
      let   sellHit = labeled.find(t => t.dir === 'SELL');

      /* FORMAT F: line-by-line scan — handles any column ordering.
         For each line that contains BUY or SELL, extract whatever
         data appears on that same line.                              */
      if (!buyHit || !sellHit) {
        for (const ln of flat.split('\n')) {
          const u = ln.toUpperCase();
          const hasBuy = /\bBUY\b/.test(u), hasSell = /\bSELL\b/.test(u);
          if (!hasBuy && !hasSell) continue;
          const dir = hasSell ? 'SELL' : 'BUY';
          if (dir === 'BUY' && buyHit)  continue;
          if (dir === 'SELL' && sellHit) continue;

          const timeM = ln.match(/\b(\d{2}:\d{2}:\d{2})\b/);
          const exchM = ln.match(/\b(NSE|BSE|MCX|NFO)\b/);
          /* Strip timestamp before hunting integers (prevents 09/17/02 false-matches) */
          const noT   = ln.replace(/\d{2}:\d{2}:\d{2}/g, '');
          /* Standalone integer not followed by decimal separator */
          const qtyV  = [...noT.matchAll(/\b(\d{1,4})\b(?!\.\d)/g)]
                          .map(m => +m[1]).find(n => n >= 1 && n <= 9999);
          /* Decimal amounts ≤₹100 000 (plausible per-share price) */
          const prcs  = [...noT.matchAll(/\b([\d,]+\.\d{2})\b/g)]
                          .map(m => parseFloat(m[1].replace(/,/g,'')))
                          .filter(n => n >= 0.5 && n < 100000);

          if (!qtyV && !timeM && !prcs.length) continue;
          const hit = { dir, qty: qtyV || 0, avg: prcs[0] || 0,
                        time: timeM?.[1] || '', exchange: exchM?.[1] || '' };
          if (dir === 'BUY')  buyHit  = hit;
          else                sellHit = hit;
        }
      }

      /* Unlabeled fallback: dedupe by time, sort by price */
      const allNolbl = [...fmtE, ...qaH]
        .filter((h, i, arr) => arr.findIndex(x => x.time === h.time) === i);
      const sorted2  = [...allNolbl].sort((a, b) => a.avg - b.avg);
      const entryFb  = sorted2[0] || null;
      const exitFb   = sorted2.length >= 2 ? sorted2[sorted2.length - 1] : null;

      /* ── Populate entry / exit ──────────────────────────────── */
      const eSource = buyHit  || entryFb;
      if (eSource) {
        out.qty       = eSource.qty  || out.qty;
        out.entry     = eSource.avg  || undefined;
        out.entryTime = eSource.time || undefined;
        if (eSource.exchange) out.exchange = eSource.exchange;
      }
      const xSource = sellHit || exitFb;
      if (xSource) {
        if (!out.qty) out.qty = xSource.qty;
        out.exit     = xSource.avg  || undefined;
        out.exitTime = xSource.time || undefined;
        if (!out.exchange && xSource.exchange) out.exchange = xSource.exchange;
      }

      /* Cross-validate: if labeled price is ≥5× off from no-label,
         the labeled read was garbled — prefer unlabeled value.      */
      const crossCheck = (hit, fb, setFn) => {
        if (hit && fb && fb.avg > 0) {
          const r = hit.avg / fb.avg;
          if (r >= 5 || r <= 0.2) setFn(fb.avg, fb.time);
        }
      };
      crossCheck(buyHit,  entryFb, (v,t) => { out.entry = v; out.entryTime = t; });
      crossCheck(sellHit, exitFb,  (v,t) => { out.exit  = v; out.exitTime  = t; });

      /* ── Exchange/Instrument/Type: search anywhere in document ── */
      if (!out.exchange)       { const m = flat.match(/\b(NSE|BSE|MCX|NFO)\b/);   if (m) out.exchange       = m[1]; }
      if (!out.instrumentType) { const m = flat.match(/\b(EQ|FUT|CE|PE)\b/);      if (m) out.instrumentType = m[1]; }
      if (!out.tradeType)      { const m = flat.match(/\b(MIS|CNC|NRML)\b/);      if (m) out.tradeType      = m[1]; }

      /* ══════════════════════════════════════════════════════════════
         QTY RECOVERY
         If the trade-line patterns couldn't set qty, derive it:
           1. Quick: look for "BUY/SELL <number>" or "Qty <number>"
           2. Math:  find large turnover amounts (trade-value column),
              compute GCD×20 (ensures price is a multiple of ₹0.05),
              pick the divisor that appears as a token in OCR text.
      ══════════════════════════════════════════════════════════════ */
      if (!out.qty || out.qty <= 0) {
        const qm = flat.match(/\b(?:BUY|SELL)\s+(\d{1,6})\b/i) ||
                   flat.match(/\bQty\.?\s+(\d{1,6})\b/i);
        if (qm) {
          out.qty = parseInt(qm[1], 10);
        } else {
          /* GCD approach — requires ≥1 large turnover amount in the text */
          const bigA = [...flat.matchAll(/((?:\d{1,3},)?\d{1,3},\d{3}\.\d{2}|\d{5,}\.\d{2})/g)]
            .map(m => Math.round(parseFloat(m[1].replace(/,/g,'')) * 100))
            .filter((v, i, arr) => v > 500000 && arr.indexOf(v) === i); // unique, >₹5000

          if (bigA.length >= 1) {
            const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
            const g20 = bigA.map(v => v * 20).reduce(gcd); // ×20 so price⟂0.05
            const divs = [];
            for (let i = 1; i * i <= g20; i++) {
              if (g20 % i === 0) {
                if (i <= 9999) divs.push(i);
                const j = g20 / i;
                if (j !== i && j <= 9999) divs.push(j);
              }
            }
            divs.sort((a, b) => a - b);
            /* Prefer divisors that actually appear as tokens in the text */
            const tok = new Set(
              [...flat.matchAll(/\b(\d{1,4})\b(?!\.\d)/g)].map(m => +m[1]).filter(n => n > 0)
            );
            const cands = (divs.filter(q => tok.has(q)).length
              ? divs.filter(q => tok.has(q)) : divs).filter(q => q >= 1);
            /* Highest priority: largest multiple of 100, else 50, else 10 */
            out.qty = cands.reduce((best, q) => {
              const s = q % 100 === 0 ? 3 : q % 50 === 0 ? 2 : q % 10 === 0 ? 1 : 0;
              const b = best % 100 === 0 ? 3 : best % 50 === 0 ? 2 : best % 10 === 0 ? 1 : 0;
              return s > b ? q : best;
            }, cands[0]);
          }
        }
      }

      /* ══════════════════════════════════════════════════════════════
         TURNOVER-DERIVED PRICE OVERRIDE
         Zerodha shows a Trade Value (= qty × price) column.
         OCR reliably misreads small prices ("191.00" → "1900") but
         NEVER misreads large 5-digit turnovers ("95,500.00").
         For each HH:MM:SS timestamp: search 600 chars before + 100
         after for the last large number, divide by qty → exact price.
      ══════════════════════════════════════════════════════════════ */
      const allTimesInDoc = [...flat.matchAll(/\b(\d{2}:\d{2}:\d{2})\b/g)];
      if (out.qty && out.qty > 0 && allTimesInDoc.length >= 1) {
        const derived = allTimesInDoc.map(tm => {
          const win = flat.slice(Math.max(0, tm.index - 600), tm.index + 100);
          const bigNums = [...win.matchAll(/([\d,]{5,}\.\d{2})/g)]
            .map(m => parseFloat(m[1].replace(/,/g, '')))
            .filter(v => v > 1000);
          if (!bigNums.length) return null;
          const price = round2(bigNums[bigNums.length - 1] / out.qty);
          if (price < 0.5 || price > 999999) return null;
          return { time: tm[1], price };
        }).filter(Boolean);

        const uniq = derived.filter((d, i, a) => a.findIndex(x => x.time === d.time) === i);
        uniq.sort((a, b) => a.price - b.price);

        if (uniq.length >= 2 && uniq[uniq.length - 1].price > uniq[0].price) {
          out.entry = uniq[0].price;  out.entryTime = uniq[0].time;
          out.exit  = uniq[uniq.length - 1].price;  out.exitTime = uniq[uniq.length - 1].time;
        } else if (uniq.length === 1) {
          if (out.entry == null || Math.abs(out.entry - uniq[0].price) > 1)
            { out.entry = uniq[0].price; out.entryTime = uniq[0].time; }
        }
      }

      /* ══════════════════════════════════════════════════════════════
         CHARGES
         KEY BUG FIX: extractCharge() used to return 0 on no-match,
         making tryCharge() always return on the FIRST pattern and
         never try alternatives.  We inline the match here and check
         for a TRUTHY (> 0) value so every alternative is tried.

         Also: patterns now use [\s\S]{0,30} (not [^\d\n]) so they
         can span a line-break between the label and the amount.
      ══════════════════════════════════════════════════════════════ */
      const CUR = '(?:[₹¥%]|3(?=[1-9]))';  // ₹ misread as ¥, %, or digit 3

      const tryCharge = (...patterns) => {
        for (const p of patterns) {
          const m = flat.match(p);
          if (m) { const v = parseMoney(m[1]); if (v > 0) return v; }
        }
        return null;
      };

      out.charges = {
        brokerage: tryCharge(
          new RegExp(`Brokerage[\\s\\S]{0,20}?${CUR}?([\\d,]+\\.\\d{2})`),
        ),
        stt: tryCharge(
          new RegExp(`\\bSTT\\b[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`),
          new RegExp(`STT\\s*/\\s*CTT[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`Securities\\s+Transaction\\s+Tax[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`Transaction\\s+Tax[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
        stampDuty: tryCharge(
          new RegExp(`Stamp\\s*(?:duty|charges?)[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`\\bStamp\\b[\\s\\S]{0,20}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
        exchangeCharge: tryCharge(
          new RegExp(`Exchange\\s+(?:turnover|transaction)\\s+charge[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`Exchange\\s+charge[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`Exchange\\s+fee[\\s\\S]{0,20}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
        sebiCharge: tryCharge(
          new RegExp(`SEBI\\s+(?:turnover|transaction)?\\s*charge[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
          new RegExp(`\\bSEBI\\b[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`),
          new RegExp(`Regulatory\\s+(?:fee|charge)[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
        gst: tryCharge(
          new RegExp(`\\bGST\\b[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`),
          new RegExp(`Goods\\s+and\\s+Services\\s+Tax[\\s\\S]{0,30}?${CUR}?([\\d,]+\\.\\d{2})`, 'i'),
        ),
      };

      /* Total charges: try labelled total first, else sum parts */
      const totM = flat.match(new RegExp(`\\bTotal\\b[^\\d\\n]{0,20}${CUR}?([\\d,]+\\.\\d{2})`));
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
