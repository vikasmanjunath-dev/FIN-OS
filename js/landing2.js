/* FIN-OS landing — behaviour. Vanilla, no dependencies. Respects prefers-reduced-motion. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var nv = navigator, lowPower = !!((nv.connection && nv.connection.saveData) || (nv.deviceMemory && nv.deviceMemory <= 2) || (nv.hardwareConcurrency && nv.hardwareConcurrency <= 2));
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || lowPower;   // low-power / data-saver devices get the calm version
  var fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var IO = 'IntersectionObserver' in window;

  /* ---- intro: counter, then a circular reveal into the hero (once per session) */
  if (root.classList.contains('intro')) {
    var pct = $('#introPct'), ibar = $('.intro__bar i'), ti = performance.now();
    (function itick(now) {
      var p = clamp((now - ti) / 1100, 0, 1), e = 1 - Math.pow(1 - p, 3); pct.textContent = Math.round(e * 100); ibar.style.setProperty('--p', e.toFixed(3));
      if (p < 1) requestAnimationFrame(itick);
      else { root.classList.add('intro-out'); setTimeout(function () { root.classList.remove('intro', 'intro-out'); try { sessionStorage.setItem('finos-intro', '1'); } catch (_) {} }, 950); }
    })(ti);
  }

  /* ---- app entry: signed-in users skip login ------------------------------ */
  function leave(e, url) {                      // circular wipe from the pressed button, then navigate
    if (reduce) { location.href = url; return; }
    var o = document.createElement('div'); o.className = 'leave'; o.setAttribute('aria-hidden', 'true');
    o.style.setProperty('--x', ((e && e.clientX) || window.innerWidth / 2) + 'px'); o.style.setProperty('--y', ((e && e.clientY) || window.innerHeight / 2) + 'px');
    document.body.appendChild(o); requestAnimationFrame(function () { o.classList.add('go'); }); setTimeout(function () { location.href = url; }, 460);
  }
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) $$('.leave').forEach(function (n) { n.parentNode.removeChild(n); }); });   // back button: clear the wipe
  function goToApp(e) {
    try {
      var raw = localStorage.getItem('sb-oeapcyucnduhwpgxfknb-auth-token');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.access_token && (!p.expires_at || Date.now() / 1000 < p.expires_at)) { leave(e, 'html/profile.html'); return; }
      }
    } catch (_) {}
    leave(e, 'login.html');
  }
  ['loginBtn', 'loginBtnFinal', 'stickyCTABtn'].forEach(function (id) { var b = document.getElementById(id); if (b) b.addEventListener('click', goToApp); });
  $$('[data-enter]').forEach(function (b) { b.addEventListener('click', goToApp); });

  /* ---- returning-visitor personalisation (all values set as text) --------- */
  try {
    var name = localStorage.getItem('finos_display_name'), dna = localStorage.getItem('finos_financial_dna'), rate = parseFloat(localStorage.getItem('finos_savings_rate') || '0');
    if (name) {
      var first = name.trim().split(/\s+/)[0];
      var eb = $('#eyebrow'); if (eb) eb.textContent = 'Welcome back, ' + first;
      [$('#loginBtn'), $('[data-enter]')].forEach(function (b) {
        if (!b) return; b.textContent = 'Continue, ' + first + ' ';
        var a = document.createElement('span'); a.className = 'arr'; a.setAttribute('aria-hidden', 'true'); a.textContent = '→'; b.appendChild(a);
      });
    }
    if (dna && dna !== 'Explorer') {
      var fb = $('#finalBox'), fbtn = $('#loginBtnFinal');
      if (fb && fbtn) { var d = document.createElement('p'); d.className = 'dna'; d.textContent = 'Your Financial DNA: ' + dna + (rate > 0 ? ' · Savings rate: ' + rate + '%' : ''); fb.insertBefore(d, fbtn); }
    }
  } catch (_) {}

  /* ---- nav: stuck state, mobile menu, active section --------------------- */
  var nav = $('#nav'), links = $('#navLinks'), burger = $('#burger');
  function stuck() { nav.classList.toggle('is-stuck', window.scrollY > 8); }
  window.addEventListener('scroll', stuck, { passive: true }); stuck();
  function menu(open) { burger.setAttribute('aria-expanded', String(open)); links.classList.toggle('open', open); }
  burger.addEventListener('click', function () { menu(burger.getAttribute('aria-expanded') !== 'true'); });
  links.addEventListener('click', function (e) { if (e.target.closest('a')) menu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && links.classList.contains('open')) { menu(false); burger.focus(); } });
  window.addEventListener('resize', function () { if (window.innerWidth > 860) menu(false); });
  if (IO) {
    var navIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) $$('a', links).forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + e.target.id)); }); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['why', 'time', 'thinking', 'try', 'faq'].forEach(function (id) { var s = document.getElementById(id); if (s) navIO.observe(s); });
    var hero = $('.hero'), sticky = $('#sticky-cta'), sbtn = $('#stickyCTABtn'), heroOut = false, endIn = false;
    var syncSticky = function () { var on = heroOut && !endIn && window.scrollY > 0; sticky.classList.toggle('on', on); sticky.setAttribute('aria-hidden', String(!on)); sbtn.tabIndex = on ? 0 : -1; };
    new IntersectionObserver(function (es) { heroOut = !es[0].isIntersecting; syncSticky(); }).observe(hero);
    var endIO = new IntersectionObserver(function (es) { endIn = es.some(function (e) { return e.isIntersecting; }); syncSticky(); });   // never cover the closing CTA or the footer
    $$('.final, .foot').forEach(function (n) { endIO.observe(n); });
  }

  /* ---- reveal + counters -------------------------------------------------- */
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count')), dec = +el.getAttribute('data-dec') || 0, t0 = performance.now(), dur = 1400;
    if (reduce) return;
    (function tick(now) {
      var p = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * e).toFixed(dec); if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }
  var reveals = $$('[data-r]');
  if (IO && !reduce) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; e.target.classList.add('in'); rio.unobserve(e.target);
        $$('[data-count]', e.target).forEach(countUp);
      });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el) { rio.observe(el); });
  } else { reveals.forEach(function (el) { el.classList.add('in'); }); }

  /* ---- accessible tabs (arrow keys, roving tabindex) --------------------- */
  function tabs(list, onSelect) {
    var btns = $$('[role="tab"]', list);
    function select(b, focus, silent) {
      btns.forEach(function (x) {
        var on = x === b; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
        var p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on;
      });
      if (focus) b.focus(); if (!silent && onSelect) onSelect(b);
    }
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { select(b); });
      b.addEventListener('keydown', function (e) {
        var k = e.key, j = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? btns.length - 1 : -1;
        if (j < 0) return; e.preventDefault(); select(btns[(j + btns.length) % btns.length], true);
      });
    });
    return { select: select, btns: btns };
  }

  /* ---- mindset state shared by the hero stage and the Three Indias tabs --- */
  var MONTHLY = 10000, RATE = 0.12 / 12, amt = 10000;
  var sip = function (m) { return m <= 0 ? 0 : MONTHLY * ((Math.pow(1 + RATE, m) - 1) / RATE) * (1 + RATE); };
  var SCEN = {
    3: { months: 0, sub: 'Money = Survival', cap: 'Spent as it arrives. <b>Nothing is left to compound.</b> Ends with stress and dependence.' },
    2: { months: 96, sub: 'Money = Lifestyle', cap: 'EMIs and status first; starts investing at year 12. <b>Eight years of compounding.</b>' },
    1: { months: 240, sub: 'Money = Tool', cap: 'Pays itself first, from day one. <b>Time does the heavy lifting.</b> Ends with freedom and choice.' }
  };
  var inr = function (v) { return v >= 1e7 ? '₹' + (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? '₹' + (v / 1e5).toFixed(1) + ' L' : '₹' + Math.round(v).toLocaleString('en-IN'); };
  var stage = $('#stage'), numEl = $('#num'), capEl = $('#cap'), srEl = $('#sr'), segBtns = $$('.seg button', stage);
  var mind = 3, userPicked = false, shown = 0, numRaf = 0, chart = null;
  var indias = tabs($('#indias [role="tablist"]'), function (b) { setMind(+b.getAttribute('data-n'), true); });
  function countNum(target) {
    cancelAnimationFrame(numRaf);
    var from = shown, t0 = performance.now(), dur = reduce ? 0 : 750;
    (function tick(now) {
      var p = dur ? clamp((now - t0) / dur, 0, 1) : 1, e = 1 - Math.pow(1 - p, 3);
      shown = from + (target - from) * e; numEl.textContent = inr(shown); if (p < 1) numRaf = requestAnimationFrame(tick);
    })(t0);
  }
  function setMind(n, user) {
    if (user) userPicked = true; mind = n; var s = SCEN[n], put = s.months * amt, kk = amt / MONTHLY;
    stage.setAttribute('data-m', n);
    segBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-n') === n)); });
    indias.select($('[data-n="' + n + '"]', $('#indias')), false, true);
    capEl.innerHTML = s.cap + ' <span style="opacity:.75">Put in ' + inr(put) + '.</span>';
    srEl.textContent = 'India ' + n + ', ' + s.sub + ': ' + inr(sip(s.months) * kk) + ' after 20 years. ' + inr(put) + ' put in.';
    countNum(sip(s.months) * kk); if (chart) chart.setMode(n);
  }
  segBtns.forEach(function (b) { b.addEventListener('click', function () { setMind(+b.getAttribute('data-n'), true); }); });
  /* ---- your number: the amount rescales the readout, the chart and the data table ---- */
  var AMTS = [500, 1000, 2000, 5000, 10000, 15000, 25000, 50000, 100000], amtEl = $('#amt'), dataDet = $('.data'), dataEl = $('#dataTable');
  function fillTable() {
    if (!dataDet || !dataDet.open) return; var k = amt / MONTHLY, rows = '';
    [0, 5, 10, 15, 20].forEach(function (y) { rows += '<tr><th scope="row">Year ' + y + '</th><td>' + inr(sip(y * 12) * k) + '</td><td>' + inr(sip(Math.max(0, y * 12 - 144)) * k) + '</td><td>₹0</td></tr>'; });
    $('tbody', dataEl).innerHTML = rows;
  }
  if (dataDet) dataDet.addEventListener('toggle', fillTable);
  function setAmt(i) {
    amt = AMTS[i]; var t = '₹' + amt.toLocaleString('en-IN');
    $('#amtOut').textContent = t; $('#amtTitle').textContent = t + ' / month'; $('#chipAmt').textContent = t; $('#noteAmt').textContent = amt.toLocaleString('en-IN');
    amtEl.setAttribute('aria-valuetext', t + ' a month'); amtEl.style.setProperty('--fill', (i / 8 * 100) + '%');
    if (chart) chart.setScale(amt / MONTHLY); setMind(mind); fillTable();
  }
  if (amtEl) { amtEl.style.setProperty('--fill', '50%'); amtEl.addEventListener('input', function () { setAmt(+amtEl.value); }); }
  setTimeout(function () { if (!userPicked) setMind(1); }, reduce ? 400 : 2800);   // opens in chaos, resolves to clarity
  if (fine && !reduce) {
    var raf = 0, px = 0, py = 0;
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect(); px = ((e.clientX - r.left) / r.width) * 2 - 1; py = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; stage.style.setProperty('--px', px.toFixed(2)); stage.style.setProperty('--py', py.toFixed(2)); });
    });
    stage.addEventListener('pointerleave', function () { stage.style.setProperty('--px', 0); stage.style.setProperty('--py', 0); });
  }

  /* ---- simulations: tabs now, behaviour lazily (js/landing-sims.js) ------- */
  window.FinosLanding = { goToApp: goToApp, reduce: reduce, tabs: tabs };
  tabs($('#simTabs'));
  var simsRequested = false;
  function loadSims() { if (simsRequested) return; simsRequested = true; var sc = document.createElement('script'); sc.src = 'js/landing-sims.js'; sc.defer = true; document.body.appendChild(sc); }
  var tryEl = $('#try');
  if (IO && tryEl) { var simIO = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { loadSims(); simIO.disconnect(); } }, { rootMargin: '700px 0px' }); simIO.observe(tryEl); } else loadSims();
  $('#simTabs').addEventListener('click', loadSims);

  /* ---- effects layer: loads on first interaction (or after idle), never blocks first paint */
  var fxReq = false;
  function loadFx() { if (fxReq) return; fxReq = true; var f = document.createElement('script'); f.src = 'js/landing-fx.js'; f.defer = true; document.body.appendChild(f); }
  ['pointermove', 'scroll', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, loadFx, { once: true, passive: true }); });
  setTimeout(loadFx, 4500);

  /* ---- signature: the 20-year wealth simulation, full-bleed behind the whole page.
        Hero: full chart with ₹ grid, SIP bars, scrub readout. Scrolling: settles into an ambient layer with a "you are here" marker. */
  var cv = document.createElement('canvas'); cv.id = 'bg'; cv.setAttribute('aria-hidden', 'true'); document.body.insertBefore(cv, document.body.firstChild);
  var ctx = cv.getContext('2d'); if (!ctx) return;
  var W = 0, H = 0, dpr = 1, C = {}, seed = 11, from = null, to = null, cur = null, t0 = 0, born = 0, nextRoll = 0, prog = 0, mode = 3, vmax = 1, rafId = 0, lastT = 0;
  var G = { amb: 0, xL: 0, xR: 0, y0: 0, y1: 0 }, ptr = { x: -9999, y: -9999, px: 0, py: 0, ui: false };
  var NP = 0, PX, PY, PVX, PVY, PS;
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gen(sd) {                            // one simulated market for India 1 and 2; each scaled to end on the figure the readout shows
    var r = rng(sd), a = new Float32Array(241), b = new Float32Array(241), z = new Float32Array(241), v1 = 0, v2 = 0, k;
    for (k = 1; k <= 240; k++) {
      var g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2832 * r()), ret = .01 + .028 * g;
      v1 = (v1 + MONTHLY) * (1 + ret); v2 = k > 144 ? (v2 + MONTHLY) * (1 + ret) : 0; a[k] = v1; b[k] = v2;
    }
    var f1 = sip(240) / Math.max(1, v1), f2 = v2 > 0 ? sip(96) / v2 : 0;
    for (k = 0; k <= 240; k++) { a[k] *= f1; b[k] *= f2; }
    return [a, b, z];
  }
  function colors() {
    var cs = getComputedStyle(root), g = function (n) { return cs.getPropertyValue(n).trim(); };
    C = { 1: g('--c1'), 2: g('--c2'), 3: g('--c3'), ink: g('--ink'), light: root.getAttribute('data-theme') === 'light' };
  }
  function size() {
    W = window.innerWidth; H = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, W < 800 ? 1.5 : 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    NP = clamp(Math.round(W * H / 6500), 90, 300); PX = new Float32Array(NP); PY = new Float32Array(NP); PVX = new Float32Array(NP); PVY = new Float32Array(NP); PS = new Float32Array(NP);
    for (var i = 0; i < NP; i++) { PX[i] = Math.random() * W; PY[i] = Math.random() * H; PS[i] = Math.random(); }
    requestAnimationFrame(measure);                                  // off the critical path: no synchronous reflow during start-up
  }
  var heroCta = $('.hero__cta'), ctaB = 0, docH = 0, sy = window.scrollY;
  window.addEventListener('scroll', function () { sy = window.scrollY; }, { passive: true });   // cached: reading scrollY inside the frame loop can force a layout
  function measure() { if (heroCta) ctaB = heroCta.getBoundingClientRect().bottom + window.scrollY; docH = root.scrollHeight; }   // cached: reading these every frame forced a layout
  function geo() {                                                  // the hero baseline sits under the CTA buttons, never through them
    var narrow = W < 800, amb = clamp(sy / (H * .8), 0, 1), hy1 = clamp((ctaB || H * .8) + 34, H * .58, H * .92), hy0 = W < 1100 ? hy1 - H * .14 : Math.min(H * .20, hy1 - H * .26);   // stacked layouts: keep the curve below the copy
    G.amb = amb; G.xL = W * .04; G.xR = W * .96; G.y1 = hy1 * (1 - amb) + H * .90 * amb; G.y0 = hy0 * (1 - amb) + H * .30 * amb;
  }
  var scale = 1, NICE = [1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7, 2.5e7, 5e7, 1e8], FB = window.FinosBG = { gl: null };
  var X = function (k) { return G.xL + (G.xR - G.xL) * k / 240; };
  var Y = function (v) { return G.y1 - (G.y1 - G.y0) * v / vmax; };
  var V = function (m, k) { var a = cur[m - 1], i = Math.min(239, Math.max(0, k | 0)); return (a[i] + (a[i + 1] - a[i]) * (k - i)) * scale; };
  var pathY = function (m, x) { return Y(V(m, clamp((x - G.xL) / (G.xR - G.xL) * 240, 0, prog * 240))); };
  function stepP() {                            // capital rides the active curve; it parts around the cursor
    var kh = prog * 240; if (kh < 2) return; var xh = X(kh);
    for (var i = 0; i < NP; i++) {
      var x = PX[i], y = PY[i], s = PS[i], xr = clamp(x, G.xL, xh), sl = clamp((pathY(mode, xr + 8) - pathY(mode, xr - 8)) / 16, -1.6, 1.6), spd = 1 + s * 1.1;
      var dx = x - ptr.x, dy = y - ptr.y, d2 = dx * dx + dy * dy;
      if (d2 < 14400) { var d = Math.sqrt(d2) + .01, f = (1 - d / 120) * .9; PVX[i] += dx / d * f; PVY[i] += dy / d * f; }
      PVX[i] += (spd - PVX[i]) * .08; PVY[i] += (sl * spd + (pathY(mode, xr) - y) * .07 - PVY[i]) * .08;
      x += PVX[i]; y += PVY[i];
      if (x > xh + 30 || x < -20 || y < -20 || y > H + 20) { x = G.xL + Math.random() * 20; y = pathY(mode, G.xL + 6) + (Math.random() - .5) * 30; PVX[i] = PVY[i] = 0; }
      PX[i] = x; PY[i] = y;
    }
  }
  function draw2d(now) {
    if (!W || !cur) return; now = now || performance.now(); geo();
    if (!reduce && now > nextRoll && prog >= 1) { from = cur.map(function (x) { return new Float32Array(x); }); to = gen(++seed); t0 = now; nextRoll = now + 15000; }
    var e = clamp((now - t0) / 1500, 0, 1); e = e * e * (3 - 2 * e);
    for (var m = 0; m < 3; m++) for (var k = 0; k <= 240; k++) cur[m][k] = from[m][k] + (to[m][k] - from[m][k]) * e;
    if (born) { var p = reduce ? 1 : clamp((now - born) / 3200, 0, 1); prog = 1 - Math.pow(1 - p, 3); }
    vmax += (cur[0][240] * scale * 1.06 - vmax) * .12; if (vmax < 1) vmax = cur[0][240] * scale * 1.06;
    var amb = G.amb, al = 1 - amb * (W < 800 ? .74 : .5), tf = clamp(1 - amb * 2.4, 0, 1), kh = prog * 240, ink = C.ink, x0 = G.xL, x1 = G.xR, y0 = G.y0, y1 = G.y1, i;
    var ox = ptr.px * 10, oy = ptr.py * 6, hx = X(kh), hy = Y(V(mode, kh)), rgb = C[mode], narrow = W < 800;
    var glOn = !!(FB.gl && FB.gl.ok);
    FB.W = W; FB.H = H; FB.G = G; FB.kh = kh; FB.mode = mode; FB.C = C; FB.al = al; FB.amb = amb; FB.X = X; FB.Y = Y; FB.V = V; FB.ptr = ptr; FB.now = now; FB.reduce = reduce;
    ctx.clearRect(0, 0, W, H); ctx.lineJoin = 'round'; ctx.globalAlpha = al;
    var gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, 280); gr.addColorStop(0, 'rgba(' + rgb + ',' + (C.light ? .16 : .22) + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); ctx.fillStyle = gr; ctx.fillRect(hx - 280, hy - 280, 560, 560);
    ctx.save(); ctx.translate(ox * .3, oy * .3);                               // back layer: ₹ grid, baseline, SIP bars
    ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.lineWidth = 1;
    NICE.filter(function (v) { return v > vmax * .1 && v < vmax * .92; }).filter(function (v, j, arr) { return arr.length <= 4 || j % Math.ceil(arr.length / 4) === 0; }).forEach(function (lv) {
      var yy = Y(lv); if (yy < y0 - 6 || yy > y1 - 10) return;
      ctx.strokeStyle = 'rgba(' + ink + ',.08)'; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
      if (!narrow && tf > .03) { ctx.globalAlpha = al * tf; ctx.fillStyle = 'rgba(' + ink + ',.45)'; ctx.fillText('₹' + (lv >= 1e7 ? lv / 1e7 + ' Cr' : lv / 1e5 + ' L'), 8, yy - 5); ctx.globalAlpha = al; }
    });
    if (tf > .03) { ctx.globalAlpha = al * tf; for (i = 0; i <= 4; i++) { ctx.fillStyle = 'rgba(' + ink + ',.45)'; ctx.fillText('YR ' + i * 5, clamp(X(i * 60) - 12, 3, W - 36), y1 + 46); } ctx.globalAlpha = al; }
    ctx.strokeStyle = 'rgba(' + ink + ',.22)'; ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    var bw = (x1 - x0) / 80;
    if (!glOn) for (i = 0; i < 80; i++) {
      var mo = i * 3, lit = mo <= kh && (mode === 1 || (mode === 2 && mo >= 144)), head = lit && mo + 3 > kh;
      ctx.fillStyle = lit ? 'rgba(' + rgb + ',' + (head ? .95 : .5) + ')' : 'rgba(' + ink + ',.07)';
      ctx.fillRect(x0 + i * bw + 1, y1 + 6, Math.max(1.4, bw - 2.2), (5 + ((i * 37) % 11)) * (head ? 1.5 : 1));
    }
    ctx.restore();
    [1, 2, 3].filter(function (q) { return q !== mode; }).concat([mode]).forEach(function (q) {   // curves: nearer layers move more
      var act = q === mode, col = C[q], ks = q === 2 ? 144 : 0, kk, d = act ? 1 : .6;
      ctx.save(); ctx.translate(ox * d, oy * d);
      if (act && q !== 3 && glOn) { ctx.restore(); return; }                  // the 3D layer draws the active curve
      if (q === 3) {
        ctx.strokeStyle = 'rgba(' + col + ',' + (act ? .95 : .45) + ')'; ctx.lineWidth = act ? 2.2 : 1.3; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -now / 45;
        ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(hx, y1); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); return;
      }
      var path = function () { ctx.beginPath(); ctx.moveTo(X(ks), Y(V(q, ks))); for (kk = ks + 1; kk < kh; kk++) ctx.lineTo(X(kk), Y(V(q, kk))); ctx.lineTo(hx, Y(V(q, kh))); };
      path();
      if (act) {
        ctx.save(); ctx.lineTo(hx, y1); ctx.lineTo(X(ks), y1); ctx.closePath();
        var fg = ctx.createLinearGradient(0, y0, 0, y1); fg.addColorStop(0, 'rgba(' + col + ',.26)'); fg.addColorStop(1, 'rgba(' + col + ',0)'); ctx.fillStyle = fg; ctx.fill(); ctx.restore();
        path(); ctx.strokeStyle = 'rgba(' + col + ',.18)'; ctx.lineWidth = 9; ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(' + col + ',' + (act ? 1 : .4) + ')'; ctx.lineWidth = act ? 2.4 : 1.3; ctx.stroke(); ctx.restore();
    });
    if (!reduce && NP) {                                                       // capital particles
      ctx.save(); ctx.translate(ox, oy); ctx.globalCompositeOperation = C.light ? 'source-over' : 'lighter'; ctx.strokeStyle = 'rgba(' + rgb + ',' + (C.light ? .45 : .4) + ')'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath();
      for (i = 0; i < NP; i++) { ctx.moveTo(PX[i] - PVX[i] * 3, PY[i] - PVY[i] * 3); ctx.lineTo(PX[i], PY[i]); } ctx.stroke(); ctx.restore();
    }
    if (prog < 1) {                                                            // opening: a scan line rides the pen
      var sg = ctx.createLinearGradient(0, y0, 0, y1); sg.addColorStop(0, 'rgba(' + rgb + ',0)'); sg.addColorStop(.5, 'rgba(' + rgb + ',.6)'); sg.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.strokeStyle = sg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx, y0 - 20); ctx.lineTo(hx, y1 + 20); ctx.stroke();
    }
    var hp = glOn ? FB.gl.proj(hx, hy) : [hx, hy];
    ctx.save(); if (!glOn) ctx.translate(ox, oy); var pu = (Math.sin(now / 420) + 1) / 2;
    ctx.fillStyle = 'rgb(' + rgb + ')'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 4, 0, 6.2832); ctx.fill();
    if (!reduce) { ctx.strokeStyle = 'rgba(' + rgb + ',' + (.5 - pu * .45).toFixed(2) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hp[0], hp[1], 7 + pu * 10, 0, 6.2832); ctx.stroke(); }
    if (tf > .03) { ctx.globalAlpha = al * tf; ctx.font = '700 13px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgb(' + rgb + ')'; var lab = inr(V(mode, kh)), lw = ctx.measureText(lab).width; ctx.fillText(lab, clamp(hp[0] - lw - 12, 8, W - lw - 8), hp[1] - 12); }
    ctx.restore(); ctx.globalAlpha = 1;
    if (amb > .12) {                                                           // scroll = time: "you are here" on the curve
      var kk2 = clamp(sy / Math.max(1, docH - H), 0, 1) * 240, mx = X(kk2), my = Y(V(mode, kk2)); if (glOn) { var mp = FB.gl.proj(mx, my); mx = mp[0]; my = mp[1]; }
      ctx.globalAlpha = clamp(amb * 1.3, 0, 1); ctx.strokeStyle = 'rgba(' + rgb + ',.28)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(mx, y0 - 30); ctx.lineTo(mx, y1 + 30); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgb(' + rgb + ')'; ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (.5 - pu * .4).toFixed(2) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx, my, 8 + pu * 10, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (amb < .35 && !ptr.ui && ptr.x > x0 && ptr.x < x1 && ptr.y > y0 - 40 && ptr.y < y1 + 40) {   // hero scrub readout
      var hk = clamp(Math.round((ptr.x - x0) / (x1 - x0) * 240), 0, Math.floor(kh)), cx = X(hk), rows = [[1, 'India 1'], [2, 'India 2'], [3, 'India 3']], bw2 = 152, bh = 74, bx = cx + 12 > W - bw2 - 4 ? cx - bw2 - 12 : cx + 12, by = clamp(ptr.y - 90, 70, H - 120);
      ctx.globalAlpha = 1 - amb * 2.5; ctx.strokeStyle = 'rgba(' + ink + ',.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1 + 4); ctx.stroke(); ctx.setLineDash([]);
      rows.forEach(function (r) { ctx.fillStyle = 'rgb(' + C[r[0]] + ')'; ctx.beginPath(); ctx.arc(cx, Y(V(r[0], hk)), 4, 0, 6.2832); ctx.fill(); });
      ctx.fillStyle = C.light ? 'rgba(255,255,255,.96)' : 'rgba(6,14,36,.94)'; ctx.strokeStyle = 'rgba(' + ink + ',.25)'; ctx.beginPath(); ctx.rect(bx, by, bw2, bh); ctx.fill(); ctx.stroke();
      ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(' + ink + ',.7)'; ctx.fillText('YEAR ' + (hk / 12).toFixed(1) + ' · MONTH ' + hk, bx + 10, by + 16); ctx.font = '700 11px "JetBrains Mono", monospace';
      rows.forEach(function (r, j) { ctx.fillStyle = 'rgb(' + C[r[0]] + ')'; ctx.fillText(r[1], bx + 10, by + 34 + j * 15); var t = inr(V(r[0], hk)); ctx.fillText(t, bx + bw2 - 10 - ctx.measureText(t).width, by + 34 + j * 15); });
      ctx.globalAlpha = 1;
    }
  }
  function draw(now) { draw2d(now); if (FB.gl && FB.gl.ok) FB.gl.frame(FB); }
  function loop(now) {
    rafId = 0; if (document.hidden) return;
    if (!reduce && sy > H * 1.1 && now - lastT < 30) { rafId = requestAnimationFrame(loop); return; }   // 30 fps once past the hero
    lastT = now; geo(); if (!reduce) stepP(); draw(now); if (!reduce) rafId = requestAnimationFrame(loop);
  }
  function wake() { if (!rafId && !document.hidden) rafId = requestAnimationFrame(loop); }
  colors(); size(); to = from = gen(seed); cur = [new Float32Array(from[0]), new Float32Array(from[1]), new Float32Array(from[2])];
  vmax = cur[0][240] * scale * 1.06; nextRoll = performance.now() + 15000; born = performance.now() + (root.classList.contains('intro') ? 1800 : 150);
  window.addEventListener('resize', function () { size(); draw(); });
  window.addEventListener('scroll', function () { if (reduce) draw(); }, { passive: true });
  window.addEventListener('pointermove', function (e) {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.px = clamp(e.clientX / W * 2 - 1, -1, 1); ptr.py = clamp(e.clientY / H * 2 - 1, -1, 1);
    ptr.ui = !!(e.target.closest && e.target.closest('a,button,input,label,summary,.stage,.nav,.card,.sim,.wait,.faq')); if (reduce) draw();
  }, { passive: true });
  document.addEventListener('pointerleave', function () { ptr.x = ptr.y = -9999; });
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('finos-theme-changed', function () { colors(); draw(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); draw(); });
  window.addEventListener('load', measure); if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
  chart = { setMode: function (n) { mode = n; draw(); }, setScale: function (k) { scale = k; draw(); }, snapshot: function () { return { mode: mode, scale: scale, cur: cur }; } };
  window.FinosLanding.snapshot = function () { return { amt: amt, mind: mind, chart: chart.snapshot() }; };
  setMind(3); wake();
})();
