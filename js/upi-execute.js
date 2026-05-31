/**
 * upi-execute.js — UPI deep-link + platform execution buttons
 * Generates one-tap execution links after investment recommendations.
 *
 * Usage: generateInvestmentLinks(amount, fundName, isin) → HTMLElement
 *        injectExecuteButtons(containerEl, amount, fundName, isin)
 */
(function (global) {
  'use strict';

  const PLATFORMS = [
    {
      id:     'kuvera',
      name:   'Kuvera',
      icon:   '🌿',
      color:  '#22d3a6',
      url:    (amount, isin) =>
        `https://kuvera.in/invest/mf/${isin || ''}?amount=${amount}&utm_source=finos`,
    },
    {
      id:     'groww',
      name:   'Groww',
      icon:   '🌱',
      color:  '#00d09c',
      url:    (amount, isin) =>
        `https://groww.in/mutual-funds/${isin || 'nifty-50-index-fund'}`,
    },
    {
      id:     'zerodha',
      name:   'Zerodha Coin',
      icon:   '🪙',
      color:  '#387ed1',
      url:    (amount, isin) =>
        `https://coin.zerodha.com/mf/funds/${isin || ''}`,
    },
    {
      id:     'upi',
      name:   'Pay via UPI',
      icon:   '⚡',
      color:  '#a855f7',
      url:    (amount, isin) =>
        `upi://pay?am=${amount}&tn=SIP+Investment&cu=INR`,
    },
  ];

  function formatInr(n) {
    n = Math.round(n);
    if (n >= 1e7) return `₹${(n/1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${(n/1e5).toFixed(1)}L`;
    if (n >= 1e3) return `₹${(n/1e3).toFixed(0)}K`;
    return `₹${n}`;
  }

  /**
   * Generate a row of execution buttons.
   * @param {number} amount - Investment amount in INR
   * @param {string} fundName - Human-readable fund name
   * @param {string} [isin] - ISIN code for direct deep-link
   * @returns {HTMLElement}
   */
  function generateInvestmentLinks(amount, fundName, isin) {
    const wrap = document.createElement('div');
    wrap.className = 'upi-execute-row';
    wrap.style.cssText = [
      'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px',
      'padding:14px;background:rgba(0,212,255,.04)',
      'border:1px solid rgba(0,212,255,.15);border-radius:12px',
    ].join(';');

    const label = document.createElement('div');
    label.style.cssText = 'width:100%;font-size:.75rem;color:var(--text-muted,#8892a4);margin-bottom:6px;';
    label.textContent = `Invest ${formatInr(amount)} in ${fundName || 'this fund'} via:`;
    wrap.appendChild(label);

    PLATFORMS.forEach(p => {
      const btn = document.createElement('a');
      btn.href   = p.url(amount, isin);
      btn.target = '_blank';
      btn.rel    = 'noopener noreferrer';
      btn.style.cssText = [
        `background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)`,
        `color:${p.color};border-radius:8px;padding:7px 14px`,
        `font-size:.8rem;font-weight:700;text-decoration:none`,
        `display:inline-flex;align-items:center;gap:5px;transition:background .2s`,
        `cursor:pointer`,
      ].join(';');
      btn.innerHTML = `${p.icon} ${p.name}`;
      btn.addEventListener('mouseover', () => btn.style.background = `rgba(255,255,255,.12)`);
      btn.addEventListener('mouseout',  () => btn.style.background = `rgba(255,255,255,.06)`);
      wrap.appendChild(btn);
    });

    return wrap;
  }

  /**
   * Inject execution buttons after an element.
   */
  function injectExecuteButtons(afterEl, amount, fundName, isin) {
    if (!afterEl) return;
    const existing = afterEl.nextElementSibling;
    if (existing?.classList.contains('upi-execute-row')) existing.remove();
    const row = generateInvestmentLinks(amount, fundName, isin);
    afterEl.insertAdjacentElement('afterend', row);
  }

  /**
   * Parse an Arya message and auto-inject execute buttons if it contains
   * an investment recommendation with an amount.
   */
  function autoInjectFromAryaMessage(messageEl) {
    if (!messageEl) return;
    const text = messageEl.textContent || '';
    // Match patterns like "₹5,000/month" or "₹50K SIP" or "invest ₹10,000"
    const amtMatch = text.match(/₹\s*([\d,]+)\s*([KkLlCr]*)/i);
    if (!amtMatch) return;

    let amount = parseInt(amtMatch[1].replace(/,/g, ''), 10);
    const suffix = amtMatch[2].toUpperCase();
    if (suffix === 'K')  amount *= 1_000;
    if (suffix === 'L')  amount *= 1_00_000;
    if (suffix === 'CR') amount *= 1_00_00_000;

    // Only inject for reasonable investment amounts
    if (amount < 100 || amount > 1_00_00_000) return;

    // Check if it's an investment-related message
    const investKeywords = /sip|invest|mutual fund|nifty|index fund|elss|ppf|nps/i;
    if (!investKeywords.test(text)) return;

    injectExecuteButtons(messageEl, amount, 'Nifty 50 Index Fund');
  }

  // Expose publicly
  global.FinosExecute = {
    generateInvestmentLinks,
    injectExecuteButtons,
    autoInjectFromAryaMessage,
    PLATFORMS,
  };

})(window);
