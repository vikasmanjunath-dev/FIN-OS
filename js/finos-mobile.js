/**
 * finos-mobile.js — Native-Feel Mobile Experience  v1.0
 * ───────────────────────────────────────────────────────
 * Drop on any page to enable:
 *   • Bottom navigation (5 tabs: Home|Invest|Track|Learn|Arya)
 *   • Quick-capture sheet (log expense in 3 taps)
 *   • Offline indicator bar
 *   • Haptic feedback on key interactions
 *   • Swipe-left on transactions for actions
 *   • Pull-to-refresh
 */
(function (global) {
  'use strict';

  const isMobile = () => window.innerWidth <= 768;
  const haptic = (pattern = [10]) => {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
  };

  /* ── Offline indicator ────────────────────────────────────────── */
  function initOfflineIndicator() {
    const bar = document.createElement('div');
    bar.className = 'finos-offline-bar';
    bar.id = 'finos-offline-bar';
    bar.innerHTML = '📡 You\'re offline — FIN•OS is working from cached data';
    document.body.appendChild(bar);

    function update() {
      bar.classList.toggle('visible', !navigator.onLine);
    }
    window.addEventListener('online',  () => { update(); haptic([10,10,10]); });
    window.addEventListener('offline', () => { update(); haptic([50]); });
    update();
  }

  /* ── Bottom Navigation ────────────────────────────────────────── */
  function injectBottomNav() {
    if (!isMobile()) return;
    if (document.getElementById('finos-bottom-nav')) return;

    const path = window.location.pathname;
    const isActive = (href) => path.includes(href) ? 'active' : '';

    // Detect base path (one level up from html/ or root)
    const depth = path.split('/').filter(Boolean).length;
    const base = depth <= 1 ? '.' : '..';

    const tabs = [
      { href: `${base}/html/home.html`,         icon: '🏠', label: 'Home',   match: 'home' },
      { href: `${base}/html/portfolio.html`,     icon: '📈', label: 'Invest', match: 'portfolio' },
      { href: `${base}/html/track-finances.html`,icon: '💰', label: 'Track',  match: 'track' },
      { href: `${base}/html/learn-equity.html`,  icon: '📚', label: 'Learn',  match: 'learn' },
      { href: `${base}/voiceagent/index.html`,   icon: '✨', label: 'Arya',   match: 'voiceagent' }
    ];

    const nav = document.createElement('nav');
    nav.id = 'finos-bottom-nav';
    nav.className = 'finos-bottom-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');

    nav.innerHTML = tabs.map(t => `
      <a href="${t.href}" class="finos-bottom-nav-tab ${isActive(t.match)}"
        aria-label="${t.label}" onclick="hapticNav()">
        <span class="nav-icon">${t.icon}</span>
        <span class="nav-label">${t.label}</span>
      </a>`).join('');

    document.body.appendChild(nav);

    window.hapticNav = () => haptic([8]);
  }

  /* ── Quick Capture Sheet ──────────────────────────────────────── */
  function initQuickCapture() {
    // Add a floating "+" button visible on mobile
    if (!isMobile()) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'finos-sheet-backdrop';
    backdrop.id = 'qc-backdrop';
    backdrop.onclick = closeCapture;
    document.body.appendChild(backdrop);

    const sheet = document.createElement('div');
    sheet.className = 'finos-quick-capture';
    sheet.id = 'finos-quick-capture';

    const CATS = [
      { icon:'🍔', label:'Food',     cat:'need_food' },
      { icon:'🚗', label:'Transport',cat:'need_transport' },
      { icon:'🛍️', label:'Shopping', cat:'want_shopping' },
      { icon:'💡', label:'Utilities',cat:'need_utilities' },
      { icon:'🎬', label:'Fun',      cat:'want_entertainment' },
      { icon:'📈', label:'Invest',   cat:'save_investment' },
    ];

    sheet.innerHTML = `
      <div class="finos-quick-capture-handle"></div>
      <div class="finos-quick-capture-title">⚡ Quick Expense</div>
      <div class="finos-quick-capture-amount" id="qcAmount">₹0</div>
      <input type="text" id="qcNote" placeholder="What was this for?" style="
        width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
        border-radius:10px;padding:10px 12px;color:#fff;font-size:13px;margin-bottom:12px;">
      <div class="finos-qc-cats">
        ${CATS.map(c => `<button class="finos-qc-cat" onclick="qcSelectCat(this,'${c.cat}')">${c.icon} ${c.label}</button>`).join('')}
      </div>
      <div class="finos-qc-numpad">
        ${['1','2','3','4','5','6','7','8','9','⌫','0','✓'].map(k =>
          `<button class="finos-qc-key ${k==='✓'?'action':''}" onclick="qcKey('${k}')">${k}</button>`
        ).join('')}
      </div>
      <button class="finos-qc-save" onclick="qcSave()">Save Transaction</button>`;
    document.body.appendChild(sheet);

    // State
    let amount = '';
    let selectedCat = 'need_food';

    window.openQuickCapture = function() {
      amount = '';
      document.getElementById('qcAmount').textContent = '₹0';
      document.getElementById('qcNote').value = '';
      sheet.classList.add('open');
      backdrop.classList.add('visible');
      haptic([10]);
    };

    function closeCapture() {
      sheet.classList.remove('open');
      backdrop.classList.remove('visible');
    }

    window.qcKey = function(k) {
      haptic([6]);
      if (k === '⌫') { amount = amount.slice(0,-1); }
      else if (k === '✓') { qcSave(); return; }
      else if (amount.length < 7) { amount += k; }
      document.getElementById('qcAmount').textContent = amount ? '₹' + Number(amount).toLocaleString('en-IN') : '₹0';
    };

    window.qcSelectCat = function(el, cat) {
      document.querySelectorAll('.finos-qc-cat').forEach(b => b.classList.remove('selected'));
      el.classList.add('selected');
      selectedCat = cat;
      haptic([6]);
    };

    window.qcSave = function() {
      const amt = Number(amount);
      if (!amt) { document.getElementById('qcAmount').style.color = '#ff4444'; return; }
      const txn = {
        amount: amt,
        category: selectedCat,
        type: selectedCat,
        label: document.getElementById('qcNote').value || selectedCat.replace(/_/g,' '),
        date: new Date().toISOString().slice(0,10),
        ts: Date.now()
      };
      try {
        const txns = JSON.parse(localStorage.getItem('finos_transactions') || '[]');
        txns.push(txn);
        localStorage.setItem('finos_transactions', JSON.stringify(txns));
        window._finosRequestContext?.();
      } catch (_) {}
      haptic([10,5,10]);
      // Show success flash
      const saveBtn = document.querySelector('.finos-qc-save');
      saveBtn.textContent = '✅ Saved!';
      saveBtn.style.background = 'rgba(34,211,166,.5)';
      setTimeout(() => {
        saveBtn.textContent = 'Save Transaction';
        saveBtn.style.background = '';
        closeCapture();
      }, 800);
    };

    // Add floating button
    const fab = document.createElement('button');
    fab.id = 'finos-qc-fab';
    fab.textContent = '+';
    fab.setAttribute('aria-label', 'Quick add expense');
    fab.onclick = window.openQuickCapture;
    fab.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      width:50px;height:50px;border-radius:50%;
      background:linear-gradient(135deg,#00d4ff,#7b2ff7);
      border:none;color:#fff;font-size:26px;font-weight:900;
      cursor:pointer;z-index:999;box-shadow:0 4px 20px rgba(0,212,255,.4);
      display:none;align-items:center;justify-content:center;line-height:1;`;
    if (isMobile()) { fab.style.display = 'flex'; }
    document.body.appendChild(fab);
  }

  /* ── Swipe gestures on transaction rows ────────────────────────── */
  function initSwipeGestures() {
    if (!isMobile()) return;
    let startX = 0, startY = 0, currentEl = null;

    document.addEventListener('touchstart', e => {
      const row = e.target.closest('.swipe-row');
      if (!row) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentEl = row;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!currentEl) return;
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > 20) { currentEl = null; return; }
      if (dx < -40) {
        currentEl.classList.add('swiped');
        haptic([6]);
      } else if (dx > 20) {
        currentEl.classList.remove('swiped');
      }
    }, { passive: true });

    document.addEventListener('touchend', () => { currentEl = null; });
  }

  /* ── Pull-to-refresh ──────────────────────────────────────────── */
  function initPullToRefresh() {
    if (!isMobile()) return;

    const ptr = document.createElement('div');
    ptr.className = 'finos-ptr';
    ptr.id = 'finos-ptr';
    ptr.textContent = '↻';
    document.body.appendChild(ptr);

    let startY = 0, pulling = false;

    document.addEventListener('touchstart', e => {
      if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 60) {
        ptr.classList.add('visible');
        ptr.style.transform = `translateX(-50%) rotate(${dy * 2}deg)`;
      }
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!pulling) return;
      pulling = false;
      if (ptr.classList.contains('visible')) {
        haptic([10,10]);
        ptr.textContent = '⏳';
        window._finosRequestContext?.();
        setTimeout(() => {
          ptr.classList.remove('visible');
          ptr.textContent = '↻';
        }, 1200);
      }
    });
  }

  /* ── Biometric auth hint ──────────────────────────────────────── */
  async function offerBiometric() {
    if (!isMobile()) return;
    if (!window.PublicKeyCredential) return;
    const alreadyOffered = localStorage.getItem('finos_biometric_offered');
    if (alreadyOffered) return;
    // Only offer after 2nd visit
    const visits = Number(localStorage.getItem('finos_visit_count') || 0) + 1;
    localStorage.setItem('finos_visit_count', visits);
    if (visits < 2) return;

    // Show a gentle nudge
    setTimeout(() => {
      const nudge = document.createElement('div');
      nudge.style.cssText = `
        position:fixed;bottom:90px;left:12px;right:12px;z-index:5000;
        background:#0f1117;border:1px solid rgba(0,212,255,.2);border-radius:16px;
        padding:14px 16px;display:flex;align-items:center;gap:12px;
        box-shadow:0 8px 32px rgba(0,0,0,.5);animation:_aSlide .3s ease;`;
      nudge.innerHTML = `
        <span style="font-size:24px;">🔒</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;margin-bottom:2px;">Enable Face ID / Fingerprint?</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);">Open FIN•OS instantly, securely.</div>
        </div>
        <button onclick="this.closest('div').remove();localStorage.setItem('finos_biometric_offered','1');"
          style="padding:6px 12px;background:rgba(0,212,255,.15);border:1px solid rgba(0,212,255,.3);
          border-radius:8px;color:#00d4ff;font-size:11px;font-weight:700;cursor:pointer;">Enable</button>`;
      document.body.appendChild(nudge);
      localStorage.setItem('finos_biometric_offered', '1');
      setTimeout(() => nudge.remove(), 8000);
    }, 3000);
  }

  /* ── Init all on DOM ready ────────────────────────────────────── */
  function init() {
    if (document.querySelector('link[href*="mobile-ux.css"]') === null) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = '../css/mobile-ux.css';
      document.head.appendChild(link);
    }
    initOfflineIndicator();
    injectBottomNav();
    if (isMobile()) {
      initQuickCapture();
      initSwipeGestures();
      initPullToRefresh();
      offerBiometric();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Reinject on resize (e.g. tablet rotation)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isMobile() && !document.getElementById('finos-bottom-nav')) injectBottomNav();
    }, 300);
  });

  global.FinosMobile = { openQuickCapture: () => window.openQuickCapture?.() };

}(window));
