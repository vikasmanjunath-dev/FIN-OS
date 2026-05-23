/**
 * ScanUPI — UPI Transaction History Screenshot Scanner
 * Supports GPay, PhonePe, Paytm, Razorpay transaction history screens.
 * Uses Tesseract.js OCR (loaded from CDN) + multi-block parser.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BEHAVIOR_TYPES, TRANSACTION_TYPES } from '../utils/constants';

/* ── Tesseract CDN loader ──────────────────────────────────────────── */
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';

function loadTesseract() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(); return; }
    const existing = document.querySelector(`script[src="${TESSERACT_CDN}"]`);
    if (existing) {
      if (existing.dataset.failed) { reject(new Error('Tesseract CDN load failed — check your connection')); return; }
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', () => reject(new Error('Tesseract CDN load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = TESSERACT_CDN;
    s.onload = resolve;
    s.onerror = () => { s.dataset.failed = '1'; reject(new Error('Tesseract CDN load failed — check your connection')); };
    document.head.appendChild(s);
  });
}

/* ── Image pre-processing ─────────────────────────────────────────── */
function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Scale up for better OCR — cap at 2400px on longest side
      const scale = Math.min(3, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;

      // Sample average brightness to decide whether to invert (dark-mode screenshots)
      let bright = 0, samples = 0;
      for (let i = 0; i < d.length; i += 4 * 20) {
        bright += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        samples++;
      }
      const avgBright = bright / samples;
      const isDark = avgBright < 128;

      // Invert dark screenshots so text is dark-on-light (Tesseract prefers this)
      if (isDark) {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
        }
      }

      // Convert to grayscale + gentle contrast stretch (NOT hard binarise)
      // Hard binarise at 145 wiped medium-gray text common in UPI screenshots.
      // Adaptive soft threshold: anything above (mean - 30) → white, else scale.
      let sum = 0;
      const grays = new Float32Array(canvas.width * canvas.height);
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        grays[i >> 2] = g;
        sum += g;
      }
      const mean = sum / grays.length;
      // Soft adaptive threshold: pixels clearly lighter than mean → white, rest → enhance
      const thresh = Math.max(80, mean - 25);
      for (let i = 0; i < d.length; i += 4) {
        const g = grays[i >> 2];
        // Stretch contrast: darken text, whiten background
        const out = g > thresh ? Math.min(255, g + (255 - g) * 0.6) : Math.max(0, g * 0.5);
        d[i] = d[i + 1] = d[i + 2] = Math.round(out);
      }

      ctx.putImageData(imgData, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => resolve(b), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/* ── UPI parser ───────────────────────────────────────────────────── */

// DEBIT: expanded to catch single-word indicators (GPay: "Sent", PhonePe: "Paid", Paytm: "Debited")
const DEBIT_RE = /^(Payment\s+to|Paid\s+to|Sent\s+to|Transferred\s+to|Transfer\s+to|Debited(?:\s+from)?|Auto\s+debit|You\s+paid|Money\s+sent|Amount\s+debited|Outgoing|Paid|Sent|Debit)[\s:–\-]*$/i;

// CREDIT: expanded to catch single-word indicators
const CREDIT_RE = /^(Received\s+from|Money\s+received(?:\s+from)?|Refund\s+from|Credited(?:\s+from)?|Cashback(?:\s+from)?|You\s+received|Amount\s+credited|Incoming|Refund|Received|Credited|Credit)[\s:–\-]*$/i;

// Also match inline direction when it appears with a merchant name on same line
const DEBIT_INLINE  = /\b(paid\s+to|sent\s+to|payment\s+to|transferred?\s+to|debited)\b/i;
const CREDIT_INLINE = /\b(received\s+from|refund\s+from|credited\s+from|cashback\s+from)\b/i;

// Amount regexes — handle: ₹350, Rs.350, RS 350
// CRITICAL: OCR commonly misreads ₹ as ¥ (yen) or % (percent) — both included
const AMOUNT_RE      = /[+\-]?\s*(?:[₹₨¥%]|[Rr][Ss]?\.?\s?)\s*([\d,]{1,8}(?:\.\d{1,2})?)/;
const AMOUNT_LINE_RE = /(?:[₹₨¥%]|[Rr][Ss]?\.?\s?)\s*([\d,]{1,8}(?:\.\d{1,2})?)/;
// Pass 3: bare number on its own line (OCR dropped ₹ symbol entirely)
const NUMBER_ONLY_RE = /^[+\-]?\s*(\d{1,6}(?:[,\s]\d{2,3})*(?:\.\d{1,2})?)\s*$/;
const FAILED_RE  = /\b(Failed|Declined|Expired|Cancelled|Reversed|Failure|Pending)\b/i;
const DATE_RE    = /\b(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\s+\d{2,4})?|Today|Yesterday|\d+\s+days?\s+ago|\d+\s+hours?\s+ago|\d+\s+min\w*\s+ago|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}-\d{1,2}-\d{2,4})\b/i;
const SKIP_RE    = /^(MAY|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC|History|Search|My\s+Statements|Home|Transactions|Rewards|Refer|Pay|Bills|Scan|UPI|GPay|PhonePe|Paytm|January|February|March|April|June|July|August|September|October|November|December|\d{1,2}:\d{2}|APRIL|MARCH|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|Bank\s+Transfer|UPI\s+Transfer|Transaction\s+ID|UTR|Ref\.?\s+No|Ref\s+ID|Status|Amount|Date|Time|Details|View\s+Details|More\s+Details)$/i;

// Section headers / UI chrome that appear in PhonePe / GPay receipts.
// Matched with ^...\b so trailing OCR noise ("Transfer Details A") is also caught.
const SECTION_HEADER_RE = /^(Transfer\s+Details|PhonePe\s+Transaction|Transaction\s+Successful|Pay\s+securely|Activate\s+Now|Powered\s+by|View\s+History|Split\s+Expense|Share\s+Receipt|Contact\s+\w+\s+Support|UTR:|T\d{12,}|Transaction\s+ID)\b/i;

/* Lines that should never be used as a merchant name */
function isJunkLine(line) {
  return !line || line.length < 2 || DEBIT_RE.test(line) || CREDIT_RE.test(line) ||
         AMOUNT_RE.test(line) || FAILED_RE.test(line) || DATE_RE.test(line) ||
         SKIP_RE.test(line) || SECTION_HEADER_RE.test(line);
}

/* Rejects account numbers / transaction IDs / garbled OCR from being merchant names */
function isValidName(name) {
  if (!name || name.length < 2) return false;
  if (isJunkLine(name)) return false;
  if (/X{3,}/i.test(name)) return false;                             // masked account: XXXXX0554
  if (/^[.\s*_|[\]©]+/.test(name)) return false;                    // starts with OCR artefacts
  if (/^\d{6,}/.test(name)) return false;                           // long digit run = phone/txn ID
  if (/^[A-Z0-9]{14,}$/.test(name)) return false;                  // pure CAPS+digits ≥14 = txn ID
  if (/@\w+/.test(name)) return false;                              // UPI VPA: 9902920686@okbizaxis
  if ((name.match(/[a-zA-Z]/g) || []).length < 3) return false;    // "C k4" has only 2 letters
  return true;
}

function parseDate(str) {
  const now = new Date();
  const s = str.trim().toLowerCase();
  if (s === 'today') return fmtDate(now);
  if (s === 'yesterday') { now.setDate(now.getDate() - 1); return fmtDate(now); }
  const daysAgo = s.match(/(\d+)\s+days?\s+ago/);
  if (daysAgo) { now.setDate(now.getDate() - parseInt(daysAgo[1])); return fmtDate(now); }
  const hoursAgo = s.match(/(\d+)\s+hours?\s+ago/);
  if (hoursAgo) return fmtDate(now);
  const explicit = str.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+(\d{4}))?/i);
  if (explicit) {
    const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const d = new Date(parseInt(explicit[3] || now.getFullYear()), months[explicit[2].toLowerCase()], parseInt(explicit[1]));
    return fmtDate(d);
  }
  return fmtDate(now);
}

function fmtDate(d) { return d.toISOString().split('T')[0]; }

function parseMoney(str) {
  if (!str) return null;
  const m = str.match(/[\d,]+(?:\.\d{1,2})?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function cleanName(name) {
  return name
    .replace(/\b(upi|ref|id|txn|no\.?)\b.*/i, '')
    .replace(/[^a-zA-Z0-9\s\.\*\-&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

/* ── Auto-categorise by merchant name ────────────────────────────── */
const RULES = [
  { re: /swiggy|zomato|domino|pizza|mcdonald|kfc|burger|food|cafe|restaurant|biryani|blinkit|dunzo|thali|dhaba/i,   type: 'Dining',        cat: 'want_impulse'   },
  { re: /ola|uber|rapido|yulu|bounce|auto\s|cab|taxi/i,                                                               type: 'Cabs',          cat: 'want_lifestyle' },
  { re: /petrol|fuel|bpcl|hpcl|iocl|shell|speed\s+fuel|diesel/i,                                                     type: 'Transport',     cat: 'need_survival'  },
  { re: /bigbasket|jiomart|zepto|instamart|grocer|kirana|milk|dairy|vegetable/i,                                      type: 'Groceries',     cat: 'need_survival'  },
  { re: /amazon|flipkart|myntra|meesho|ajio|nykaa|reliance\s+digital|croma|tatacliq/i,                               type: 'Shopping',      cat: 'want_impulse'   },
  { re: /netflix|hotstar|prime\s+video|zee5|sony\s*liv|spotify|youtube\s+premium|jio\s*cinema|crunchyroll/i,         type: 'Subscriptions', cat: 'want_lifestyle' },
  { re: /pvr|inox|bookmyshow|cinepolis|movie|concert|event\s+ticket/i,                                               type: 'Entertainment', cat: 'want_lifestyle' },
  { re: /apollo|netmeds|1mg|medplus|pharmeasy|hospital|clinic|doctor|pharmacy|medical/i,                              type: 'Health',        cat: 'need_survival'  },
  { re: /gym|cult\.?fit|fitness|yoga|crossfit|healthify|sports/i,                                                     type: 'Fitness',       cat: 'want_lifestyle' },
  { re: /zerodha|groww|upstox|angel\s+broking|kite|coin|mutual\s+fund|sip\s|equity/i,                                type: 'Invest_Equity', cat: 'save_wealth'    },
  { re: /ppf|epf|nps|provident|fd\s|fixed\s+deposit|recurring\s+deposit|lic\s|insurance\s+premium/i,                 type: 'Invest_Safe',   cat: 'save_wealth'    },
  { re: /rent|landlord|maintenance|society\s+fee|housing\s+loan/i,                                                    type: 'Housing',       cat: 'need_obligation'},
  { re: /electricity|water\s+bill|gas\s+bill|broadband|internet|airtel|jio\s|vi\s|vodafone|bsnl/i,                   type: 'Housing',       cat: 'need_obligation'},
  { re: /udemy|coursera|byju|unacademy|books|coaching|education|skillshare|pluralsight/i,                             type: 'Education',     cat: 'save_self'      },
  { re: /wine|beer|liquor|alcohol|bar\s|pub\s|cigarette|smoke|hookah|vape/i,                                          type: 'Vice',          cat: 'want_ego'       },
  { re: /emi|loan\s+emi|credit\s+card\s+due|card\s+payment|minimum\s+due/i,                                          type: 'Debt',          cat: 'debt_toxic'     },
  { re: /tax|gst\s|income\s+tax|tds\s/i,                                                                              type: 'Taxes',         cat: 'need_obligation'},
];

function autoCategory(name, isCredit) {
  /* Received money is income / liquid savings — not an "investment" */
  if (isCredit) return { type: 'Other', cat: 'save_liquid' };
  const lower = name.toLowerCase();
  for (const { re, type, cat } of RULES) {
    if (re.test(lower)) return { type, cat };
  }
  return { type: 'Other', cat: 'want_impulse' };
}

/* ── Dedup helper ─────────────────────────────────────────────────── */
function isDuplicate(txns, name, amount) {
  return txns.some(t =>
    Math.abs(t.amount - amount) < 0.01 &&
    t.name.toLowerCase().slice(0, 12) === name.toLowerCase().slice(0, 12)
  );
}

/* ── Main UPI parser — returns array of transaction objects ───────── */
function parseUPI(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const txns  = [];

  /* ════════════════════════════════════════════════════════════════════
     PASS 1 — Direction-anchored (classic approach)
     Works well for Paytm / Razorpay / older GPay formats that show
     "Payment to Swiggy", "Received from Rahul" etc.
     ════════════════════════════════════════════════════════════════════ */
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let direction = null;

    if (DEBIT_RE.test(line))        direction = 'debit';
    if (CREDIT_RE.test(line))       direction = 'credit';
    if (DEBIT_INLINE.test(line))    direction = 'debit';
    if (CREDIT_INLINE.test(line))   direction = 'credit';

    if (!direction) { i++; continue; }

    // Try to pull merchant name from the direction line itself
    // e.g. "Payment to Swiggy" → "Swiggy"
    let name = line
      .replace(/^(Payment\s+to|Paid\s+to|Sent\s+to|Transferred?\s+to|Received\s+from|Money\s+received\s+from|Refund\s+from|Credited\s+from|Cashback\s+from)/i, '')
      .replace(AMOUNT_RE, '')
      .trim();

    let j = i + 1;
    let amount = null; // may be set early if name+amount on same line

    if (!name) {
      // Scan forward for merchant name
      while (j < Math.min(i + 4, lines.length)) {
        const nl = lines[j];
        if (FAILED_RE.test(nl) || DATE_RE.test(nl) || SKIP_RE.test(nl)) break;

        // ── Inline name+amount: "TEA STALL ¥63" ─────────────────────
        // OCR misreads ₹ as ¥ or %, putting amount on the SAME line as name.
        const amIdx = nl.search(AMOUNT_LINE_RE);
        if (amIdx >= 0) {
          const beforeAmt = nl.slice(0, amIdx).trim();
          const amMatch   = nl.match(AMOUNT_LINE_RE);
          if (beforeAmt && isValidName(beforeAmt)) {
            // "TEA STALL" + "¥63" → name + amount from same line
            if (!name) name = beforeAmt;
            if (amount === null && amMatch) amount = parseMoney(amMatch[1]);
          } else if (amount === null && amMatch) {
            // Pure amount line like "₹350" or "¥63" — capture amount, stop scan
            amount = parseMoney(amMatch[1]);
          }
          j++;
          break; // done after hitting an amount line
        }

        // Pure name line
        if (isValidName(nl)) {
          if (!name) name = nl; else name += ' ' + nl;
        }
        j++;
      }
      // Backward lookup — GPay puts name BEFORE the direction keyword
      if (!name && i > 0) {
        const prev = lines[i - 1];
        if (isValidName(prev)) name = prev;
      }
    }

    let date = null, failed = false;
    for (let k = j; k < Math.min(j + 8, lines.length); k++) {
      const kl = lines[k];
      if (FAILED_RE.test(kl)) { failed = true; break; }
      if (amount === null) { const am = kl.match(AMOUNT_RE); if (am) amount = parseMoney(am[1]); }
      if (!date)           { const dm = kl.match(DATE_RE);   if (dm) date   = parseDate(dm[0]); }
    }

    name = cleanName(name || '');
    if (isValidName(name) && amount !== null && amount > 0 && !failed && !isDuplicate(txns, name, amount)) {
      const isCredit = direction === 'credit';
      const { type, cat } = autoCategory(name, isCredit);
      txns.push({ _id: Date.now() + Math.random(), name, amount, isCredit, date: date || fmtDate(new Date()), type, category: cat, selected: true });
    }
    i = j + 1;
  }

  /* ════════════════════════════════════════════════════════════════════
     PASS 2 — Amount-anchored (catches GPay / PhonePe new-style formats)
     e.g.  "Amazon Pay\nSent\n₹350\n23 May"
     In these apps the direction keyword ("Sent"/"Received") is a
     standalone line — it doesn't match the old compound-phrase patterns.
     We find every ₹-amount line, then search ±5 lines for context.
     ════════════════════════════════════════════════════════════════════ */
  for (let ai = 0; ai < lines.length; ai++) {
    const amLine = lines[ai];
    const amMatch = amLine.match(AMOUNT_LINE_RE);
    if (!amMatch) continue;

    const amount = parseMoney(amMatch[1]);
    if (!amount || amount <= 0 || amount > 10_000_000) continue;

    let name = null, direction = null, date = null, failed = false;
    const win_start = Math.max(0, ai - 5);
    const win_end   = Math.min(lines.length - 1, ai + 5);

    for (let k = win_start; k <= win_end; k++) {
      const kl = lines[k];
      if (k === ai) continue;

      if (FAILED_RE.test(kl)) { failed = true; break; }

      // Direction
      if (!direction) {
        if (DEBIT_RE.test(kl) || DEBIT_INLINE.test(kl))   direction = 'debit';
        if (CREDIT_RE.test(kl) || CREDIT_INLINE.test(kl)) direction = 'credit';
      }

      // Date
      if (!date) { const dm = kl.match(DATE_RE); if (dm) date = parseDate(dm[0]); }

      // Name — prefer line closest to the amount that is a valid merchant name
      if (!name && isValidName(kl) && !AMOUNT_LINE_RE.test(kl)) {
        name = kl;
      }
    }

    if (failed) continue;

    // No direction keyword found in window → this is likely UI noise or ad text
    // (e.g., "Pay securely up to ₹5,000") — skip it entirely.
    // Exception: if the amount line itself starts with + treat as credit.
    if (!direction) {
      if (amLine.trim().startsWith('+')) direction = 'credit';
      else continue; // no direction = noise, don't create a fake transaction
    }

    name = cleanName(name || 'Unknown');
    if (isValidName(name) && amount > 0 && !isDuplicate(txns, name, amount)) {
      const isCredit = direction === 'credit';
      const { type, cat } = autoCategory(name, isCredit);
      txns.push({ _id: Date.now() + Math.random(), name, amount, isCredit, date: date || fmtDate(new Date()), type, category: cat, selected: true });
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     PASS 3 — Bare-number fallback
     OCR sometimes drops the ₹ symbol entirely, leaving lines like:
       "Amazon Pay"  "Sent"  "350.00"  "23 May"
     We look for pure-number lines that sit near a direction keyword.
     Only fires when Passes 1 & 2 found nothing (to avoid noise).
     ════════════════════════════════════════════════════════════════════ */
  if (txns.length === 0) {
    for (let ai = 0; ai < lines.length; ai++) {
      const numMatch = lines[ai].match(NUMBER_ONLY_RE);
      if (!numMatch) continue;

      // Remove commas/spaces used as thousands separators, then parse
      const rawNum = numMatch[1].replace(/[,\s]/g, '');
      const amount = parseFloat(rawNum);
      if (isNaN(amount) || amount < 1 || amount > 9_999_999) continue;

      const win_start = Math.max(0, ai - 6);
      const win_end   = Math.min(lines.length - 1, ai + 4);

      let name = null, direction = null, date = null, failed = false, hasDir = false;

      // Prefer lines ABOVE the amount for merchant name (most UPI layouts)
      // First pass: look above
      for (let k = ai - 1; k >= win_start; k--) {
        const kl = lines[k];
        if (FAILED_RE.test(kl)) { failed = true; break; }
        if (!direction) {
          if (DEBIT_RE.test(kl) || DEBIT_INLINE.test(kl))   { direction = 'debit';  hasDir = true; }
          if (CREDIT_RE.test(kl) || CREDIT_INLINE.test(kl)) { direction = 'credit'; hasDir = true; }
        }
        if (!date) { const dm = kl.match(DATE_RE); if (dm) date = parseDate(dm[0]); }
        if (!name && !isJunkLine(kl) && !NUMBER_ONLY_RE.test(kl) && !AMOUNT_LINE_RE.test(kl)) {
          name = kl;
        }
      }

      // Second pass: look below (for date / confirm direction)
      if (!failed) {
        for (let k = ai + 1; k <= win_end; k++) {
          const kl = lines[k];
          if (FAILED_RE.test(kl)) { failed = true; break; }
          if (!direction) {
            if (DEBIT_RE.test(kl) || DEBIT_INLINE.test(kl))   { direction = 'debit';  hasDir = true; }
            if (CREDIT_RE.test(kl) || CREDIT_INLINE.test(kl)) { direction = 'credit'; hasDir = true; }
          }
          if (!date) { const dm = kl.match(DATE_RE); if (dm) date = parseDate(dm[0]); }
          // Only use below-lines for name if above produced nothing
          if (!name && !isJunkLine(kl) && !NUMBER_ONLY_RE.test(kl) && !AMOUNT_LINE_RE.test(kl)) {
            name = kl;
          }
        }
      }

      if (failed || !hasDir) continue; // require at least one direction keyword

      name = cleanName(name || 'Unknown');
      if (amount > 0 && !isDuplicate(txns, name, amount)) {
        const isCredit = direction === 'credit';
        const { type, cat } = autoCategory(name, isCredit);
        txns.push({ _id: Date.now() + Math.random(), name, amount, isCredit, date: date || fmtDate(new Date()), type, category: cat, selected: true });
      }
    }
  }

  return txns;
}

/* ── Sub-components ───────────────────────────────────────────────── */
const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9500,
    background: 'rgba(4,6,12,0.88)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    padding: 0,
  },
  panel: {
    width: '100%', maxWidth: 600, maxHeight: '92vh',
    background: 'linear-gradient(145deg,#0d1120,#080c18)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px 20px 0 0',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 -24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(79,124,255,0.12)',
    overflow: 'hidden',
    animation: 'scanSlideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 22px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
  },
  body: { padding: '18px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 },
  footer: {
    padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)',
    display: 'flex', gap: 10, flexShrink: 0,
  },
};

function BtnClose({ onClick }) {
  return (
    <button onClick={onClick} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, width:32, height:32, color:'#9AA0B4', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
  );
}

function ProgressBar({ pct, label }) {
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9AA0B4', marginBottom:6 }}>
        <span>{label}</span><span style={{ fontFamily:'monospace', color:'#4F7CFF' }}>{pct}%</span>
      </div>
      <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#4F7CFF,#00ff88)', borderRadius:2, transition:'width .3s ease' }} />
      </div>
    </div>
  );
}

function MiniDropdown({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const flat = options.flatMap(o => o.options || [o]);
  const sel  = flat.find(o => o.value === value);
  return (
    <div ref={ref} style={{ position:'relative', flex:1 }}>
      <div onClick={() => setOpen(v => !v)} style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${open ? '#4F7CFF' : 'rgba(255,255,255,0.08)'}`, borderRadius:8, padding:'6px 10px', fontSize:11, color: value ? '#fff' : '#9AA0B4', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:4 }}>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:100 }}>{sel ? sel.label : placeholder}</span>
        <span style={{ fontSize:9, flexShrink:0, opacity:0.6 }}>▼</span>
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'rgba(8,12,24,0.97)', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:6, zIndex:200, maxHeight:200, overflowY:'auto', boxShadow:'0 12px 32px rgba(0,0,0,0.5)' }}>
          {options.map((opt, idx) => opt.group ? (
            <div key={idx}>
              <div style={{ fontSize:9, color:'#4F7CFF', textTransform:'uppercase', letterSpacing:'0.08em', padding:'6px 8px', fontWeight:900 }}>{opt.group}</div>
              {opt.options.map(sub => (
                <div key={sub.value} onClick={() => { onChange(sub.value); setOpen(false); }} style={{ padding:'7px 8px', borderRadius:6, cursor:'pointer', fontSize:11, color: value === sub.value ? '#fff' : '#9AA0B4', background: value === sub.value ? 'rgba(79,124,255,0.2)' : 'transparent' }}>{sub.label}</div>
              ))}
            </div>
          ) : (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }} style={{ padding:'7px 8px', borderRadius:6, cursor:'pointer', fontSize:11, color: value === opt.value ? '#fff' : '#9AA0B4', background: value === opt.value ? 'rgba(79,124,255,0.2)' : 'transparent' }}>{opt.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function TxnRow({ txn, onChange, onToggle }) {
  const isCredit = txn.isCredit;
  const amtColor = isCredit ? '#00ff88' : '#FF6B6B';
  return (
    <div style={{ background: txn.selected ? 'rgba(79,124,255,0.07)' : 'rgba(255,255,255,0.02)', border: `1px solid ${txn.selected ? 'rgba(79,124,255,0.25)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 12, padding: '12px 14px', opacity: txn.selected ? 1 : 0.45, transition: 'all .15s' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <input type="checkbox" checked={txn.selected} onChange={() => onToggle(txn._id)}
          style={{ accentColor:'#4F7CFF', marginTop:3, flexShrink:0, width:15, height:15 }} />
        <div style={{ width:34, height:34, borderRadius:10, background: isCredit ? 'rgba(0,255,136,0.12)' : 'rgba(255,107,107,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>
          {isCredit ? '↙' : '↗'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{txn.name}</div>
          <div style={{ fontSize:11, color:'#9AA0B4', marginTop:1 }}>{txn.date} · {isCredit ? 'Received' : 'Paid'}</div>
        </div>
        <div style={{ fontWeight:900, fontSize:15, color:amtColor, fontFamily:'monospace', flexShrink:0 }}>
          {isCredit ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}
        </div>
      </div>
      {txn.selected && (
        <div style={{ display:'flex', gap:8, marginTop:10, paddingLeft:44 }}>
          <MiniDropdown value={txn.category} onChange={v => onChange(txn._id, 'category', v)} options={BEHAVIOR_TYPES} placeholder="Driver" />
          <MiniDropdown value={txn.type}     onChange={v => onChange(txn._id, 'type', v)}     options={TRANSACTION_TYPES} placeholder="Type" />
        </div>
      )}
    </div>
  );
}

/* ── Main ScanUPI component ───────────────────────────────────────── */
export default function ScanUPI({ addTransaction }) {
  const [open,       setOpen]       = useState(false);
  const [file,       setFile]       = useState(null);
  const [thumbSrc,   setThumbSrc]   = useState('');
  const [status,     setStatus]     = useState('idle');   // idle | running | done | error
  const [statusMsg,  setStatusMsg]  = useState('');
  const [pct,        setPct]        = useState(0);
  const [pctLabel,   setPctLabel]   = useState('');
  const [txns,       setTxns]       = useState([]);
  const [rawOCR,     setRawOCR]     = useState('');
  const [showRaw,    setShowRaw]    = useState(false);
  const [imported,   setImported]   = useState(false);
  const [importCount, setImportCount] = useState(0);
  const fileInputRef  = useRef();
  const dzRef         = useRef();
  const thumbUrlRef   = useRef('');  // tracks current blob URL for cleanup

  /* inject keyframe animation once */
  useEffect(() => {
    if (document.getElementById('scan-upi-anim')) return;
    const style = document.createElement('style');
    style.id = 'scan-upi-anim';
    style.textContent = `@keyframes scanSlideUp { from { transform:translateY(40px); opacity:0; } to { transform:translateY(0); opacity:1; } }`;
    document.head.appendChild(style);
  }, []);

  /* Body scroll lock while modal is open */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const reset = useCallback(() => {
    /* Revoke any existing thumbnail blob URL to prevent memory leak */
    if (thumbUrlRef.current) {
      URL.revokeObjectURL(thumbUrlRef.current);
      thumbUrlRef.current = '';
    }
    setFile(null); setThumbSrc(''); setStatus('idle'); setStatusMsg('');
    setPct(0); setPctLabel(''); setTxns([]); setRawOCR(''); setShowRaw(false);
    setImported(false); setImportCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const openModal  = () => { reset(); setOpen(true); };
  const closeModal = useCallback(() => { setOpen(false); setTimeout(reset, 300); }, [reset]);

  /* File selection */
  const pickFile = useCallback((f) => {
    if (!f || !f.type.startsWith('image/')) {
      setStatusMsg('Only image files are supported (PNG, JPG, WebP)');
      setStatus('error');
      return;
    }
    /* Revoke old thumbnail URL before creating a new one */
    if (thumbUrlRef.current) URL.revokeObjectURL(thumbUrlRef.current);
    const url = URL.createObjectURL(f);
    thumbUrlRef.current = url;
    setFile(f);
    setThumbSrc(url);
    setStatus('idle');
    setStatusMsg('');
    setTxns([]);
  }, []);

  /* Drag & drop */
  useEffect(() => {
    if (!open) return;
    const dz = dzRef.current;
    if (!dz) return;
    const over  = e => { e.preventDefault(); dz.style.borderColor = 'rgba(79,124,255,0.8)'; };
    const leave = () => { dz.style.borderColor = 'rgba(79,124,255,0.3)'; };
    const drop  = e => { e.preventDefault(); leave(); pickFile(e.dataTransfer.files[0]); };
    dz.addEventListener('dragover', over);
    dz.addEventListener('dragleave', leave);
    dz.addEventListener('drop', drop);
    return () => { dz.removeEventListener('dragover', over); dz.removeEventListener('dragleave', leave); dz.removeEventListener('drop', drop); };
  }, [open, pickFile]);

  /* Clipboard paste */
  useEffect(() => {
    if (!open) return;
    const h = e => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
      if (item) pickFile(item.getAsFile());
    };
    document.addEventListener('paste', h);
    return () => document.removeEventListener('paste', h);
  }, [open, pickFile]);

  /* Escape key */
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, closeModal]);

  /* OCR pipeline */
  const runScan = async () => {
    if (!file) return;
    setStatus('running');
    setTxns([]);
    setRawOCR('');
    setImported(false);

    const step = (p, lbl) => { setPct(p); setPctLabel(lbl); };

    try {
      step(5,  'Loading OCR engine…');
      await loadTesseract();

      step(12, 'Pre-processing image…');
      let target = file;
      try { target = await preprocessImage(file); } catch { /* use raw file on preprocess failure */ }

      step(18, 'Running OCR…');
      const { data: { text } } = await window.Tesseract.recognize(
        target, 'eng',
        {
          logger: m => { if (m.status === 'recognizing text') step(18 + Math.round(m.progress * 55), `OCR ${Math.round(m.progress * 100)}%`); },
          // PSM 4 = single column of variable-size text — best for UPI transaction lists
          tessedit_pageseg_mode: '4',
          // Preserve inter-word spacing so "Amazon Pay" stays on one line
          preserve_interword_spaces: '1',
        }
      );

      setRawOCR(text);
      step(76, 'Parsing transactions…');
      const parsed = parseUPI(text);
      step(100, 'Done');

      setTxns(parsed);
      setStatus('done');
      setStatusMsg(parsed.length > 0
        ? `Found ${parsed.length} transaction${parsed.length !== 1 ? 's' : ''} — review and import`
        : 'No transactions detected — try a clearer screenshot or a different app');

    } catch (err) {
      console.error('[ScanUPI]', err);
      setStatus('error');
      setStatusMsg('❌ ' + (err.message || 'Scan failed'));
      setPct(0);
    }
  };

  /* Edit transaction fields */
  const editTxn = (id, key, val) => {
    setTxns(prev => prev.map(t => t._id === id ? { ...t, [key]: val } : t));
  };
  const toggleTxn = id => {
    setTxns(prev => prev.map(t => t._id === id ? { ...t, selected: !t.selected } : t));
  };
  const toggleAll = () => {
    const allSelected = txns.every(t => t.selected);
    setTxns(prev => prev.map(t => ({ ...t, selected: !allSelected })));
  };

  /* Import — snapshot selectedCount before clearing */
  const importTxns = () => {
    const toImport = txns.filter(t => t.selected);
    if (toImport.length === 0) return;
    toImport.forEach(t => {
      addTransaction({
        name:        t.name,
        amount:      t.amount,
        category:    t.category,
        type:        t.type,
        date:        t.date,
        isRecurring: false,
        id:          Date.now() + Math.random(),
      });
    });
    setImportCount(toImport.length);
    setImported(true);
    setTimeout(closeModal, 1400);
  };

  const selectedCount = txns.filter(t => t.selected).length;
  const canScan = !!file && status !== 'running';

  /* ── Closed state: render just the trigger button ──────────────── */
  if (!open) {
    return (
      <button
        onClick={openModal}
        style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'10px 18px', background:'rgba(79,124,255,0.12)', color:'#4F7CFF', border:'1px solid rgba(79,124,255,0.3)', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', transition:'all .2s', fontFamily:'inherit', whiteSpace:'nowrap' }}
        onMouseOver={e => { e.currentTarget.style.background='rgba(79,124,255,0.22)'; e.currentTarget.style.boxShadow='0 0 16px rgba(79,124,255,0.3)'; }}
        onMouseOut={e  => { e.currentTarget.style.background='rgba(79,124,255,0.12)'; e.currentTarget.style.boxShadow='none'; }}
      >
        <span style={{fontSize:16}}>📲</span> Scan UPI
      </button>
    );
  }

  /* ── Open state: full bottom-sheet modal via portal ─────────────── */
  return createPortal(
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <div style={S.panel}>

        {/* Header */}
        <div style={S.header}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:'rgba(79,124,255,0.15)', border:'1px solid rgba(79,124,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📲</div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>Scan UPI History</div>
              <div style={{ fontSize:11, color:'#9AA0B4', marginTop:1 }}>GPay · PhonePe · Paytm · Razorpay</div>
            </div>
          </div>
          <BtnClose onClick={closeModal} />
        </div>

        {/* Body */}
        <div style={S.body}>

          {/* Dropzone */}
          <div
            ref={dzRef}
            onClick={() => fileInputRef.current?.click()}
            style={{ position:'relative', border:'2px dashed rgba(79,124,255,0.3)', borderRadius:14, padding: file ? '12px 16px' : '30px 16px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, textAlign:'center', cursor:'pointer', transition:'all .2s', background:'rgba(79,124,255,0.03)', minHeight: file ? 0 : 130 }}
          >
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => pickFile(e.target.files[0])} />
            {file ? (
              <div style={{ display:'flex', alignItems:'center', gap:12, width:'100%' }}>
                <img src={thumbSrc} alt="preview" style={{ width:56, height:44, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0, textAlign:'left' }}>
                  <div style={{ fontWeight:600, fontSize:13, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</div>
                  <div style={{ fontSize:11, color:'#9AA0B4', marginTop:1 }}>{(file.size/1024).toFixed(0)} KB · Click to change</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); reset(); }}
                  style={{ background:'rgba(255,107,107,0.12)', border:'1px solid rgba(255,107,107,0.3)', borderRadius:8, padding:'4px 8px', color:'#FF6B6B', fontSize:12, cursor:'pointer' }}
                >✕</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize:28 }}>📱</div>
                <div style={{ fontWeight:600, fontSize:14, color:'#fff' }}>Drop UPI screenshot here</div>
                <div style={{ fontSize:11, color:'#9AA0B4', lineHeight:1.6 }}>
                  or <span style={{ color:'#4F7CFF', fontWeight:600 }}>click to browse</span> · also <span style={{ color:'#4F7CFF', fontWeight:600 }}>Ctrl+V</span> from clipboard<br/>
                  GPay / PhonePe / Paytm history screen
                </div>
              </>
            )}
          </div>

          {/* Scan button */}
          <button
            onClick={runScan}
            disabled={!canScan}
            style={{ width:'100%', padding:'12px', border:'none', borderRadius:10, background: canScan ? 'linear-gradient(135deg,#4F7CFF,#6A5AFF)' : 'rgba(255,255,255,0.06)', color: canScan ? '#fff' : '#9AA0B4', fontSize:14, fontWeight:700, cursor: canScan ? 'pointer' : 'not-allowed', transition:'all .2s', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
            onMouseOver={e => { if (canScan) { e.currentTarget.style.boxShadow='0 0 22px rgba(79,124,255,0.45)'; e.currentTarget.style.transform='translateY(-1px)'; } }}
            onMouseOut={e  => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none'; }}
          >
            {status === 'running' ? '⏳ Scanning…' : status === 'done' ? '🔄 Re-scan' : '🔍 Analyse Screenshot'}
          </button>

          {/* Progress */}
          {status === 'running' && <ProgressBar pct={pct} label={pctLabel} />}

          {/* Status message */}
          {statusMsg && (
            <div style={{ fontSize:12, color: status === 'error' ? '#FF6B6B' : (status === 'done' && txns.length === 0) ? '#F59E0B' : '#00ff88', fontWeight: status !== 'running' ? 600 : 400, textAlign:'center', fontStyle: status === 'running' ? 'italic' : 'normal' }}>
              {status === 'done' && txns.length > 0 ? '✅ ' : ''}{statusMsg}
            </div>
          )}

          {/* Raw OCR — always visible when scan finished with no results */}
          {status === 'done' && txns.length === 0 && rawOCR && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#F59E0B' }}>📋 What OCR read from your screenshot:</div>
                <button
                  onClick={() => navigator.clipboard?.writeText(rawOCR)}
                  style={{ fontSize:10, color:'#4F7CFF', background:'none', border:'none', cursor:'pointer', padding:'2px 6px', fontFamily:'inherit' }}
                >
                  Copy text
                </button>
              </div>
              <div style={{ background:'rgba(0,0,0,0.45)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:10, padding:10, fontFamily:'monospace', fontSize:10, color:'#c8c8d0', whiteSpace:'pre-wrap', wordBreak:'break-all', maxHeight:220, overflowY:'auto', lineHeight:1.7 }}>
                {rawOCR.trim() || '(empty — Tesseract returned no text. Try a sharper, lighter screenshot.)'}
              </div>
              <div style={{ fontSize:10, color:'#9AA0B4', marginTop:6, lineHeight:1.6 }}>
                ↑ Share this text in support so we can improve detection for your screenshot format.
              </div>
            </div>
          )}

          {/* Import success banner */}
          {imported && (
            <div style={{ background:'rgba(0,255,136,0.1)', border:'1px solid rgba(0,255,136,0.3)', borderRadius:10, padding:'12px', textAlign:'center', fontSize:13, fontWeight:700, color:'#00ff88' }}>
              ✅ Imported {importCount} transaction{importCount !== 1 ? 's' : ''} successfully!
            </div>
          )}

          {/* Transaction list */}
          {txns.length > 0 && !imported && (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:8 }}>
                  Extracted Transactions
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(79,124,255,0.2)', color:'#4F7CFF', border:'1px solid rgba(79,124,255,0.3)' }}>
                    {selectedCount}/{txns.length} selected
                  </span>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={toggleAll} style={{ fontSize:10, color:'#9AA0B4', background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>
                    {txns.every(t => t.selected) ? 'Deselect all' : 'Select all'}
                  </button>
                  <button onClick={() => setShowRaw(v => !v)} style={{ fontSize:10, color:'#9AA0B4', background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>
                    {showRaw ? 'Hide raw' : 'Show raw OCR'}
                  </button>
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {txns.map(t => (
                  <TxnRow key={t._id} txn={t} onChange={editTxn} onToggle={toggleTxn} />
                ))}
              </div>

              <div style={{ fontSize:10, color:'#9AA0B4', textAlign:'center' }}>
                ✏️ Adjust category/type for each transaction before importing
              </div>

              {showRaw && (
                <div style={{ background:'rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:12, fontFamily:'monospace', fontSize:10, color:'#9AA0B4', whiteSpace:'pre-wrap', wordBreak:'break-all', maxHeight:180, overflowY:'auto' }}>
                  {rawOCR.slice(0, 3000)}
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        {txns.length > 0 && !imported && (
          <div style={S.footer}>
            <button
              onClick={closeModal}
              style={{ padding:'11px 20px', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, background:'transparent', color:'#9AA0B4', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
            >
              Cancel
            </button>
            <button
              onClick={importTxns}
              disabled={selectedCount === 0}
              style={{ flex:1, padding:'11px', border:'none', borderRadius:10, background: selectedCount === 0 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#00ff88,#00cc6a)', color: selectedCount === 0 ? '#9AA0B4' : '#000', fontSize:13, fontWeight:800, cursor: selectedCount === 0 ? 'not-allowed' : 'pointer', fontFamily:'inherit', transition:'all .2s', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
              onMouseOver={e => { if (selectedCount > 0) e.currentTarget.style.boxShadow='0 0 22px rgba(0,255,136,0.4)'; }}
              onMouseOut={e  => { e.currentTarget.style.boxShadow='none'; }}
            >
              ✅ Import {selectedCount > 0 ? `${selectedCount} Transaction${selectedCount !== 1 ? 's' : ''}` : 'Selected'}
            </button>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
