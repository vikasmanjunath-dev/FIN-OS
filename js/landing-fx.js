/* FIN-OS landing — effects + interactive models. Loaded on first interaction (scroll / pointer / key) or after idle,
   so it never delays first paint. Decorative parts skip themselves under prefers-reduced-motion. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement, body = document.body;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var NS = 'http://www.w3.org/2000/svg';
  var el = function (tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
  var svgEl = function (tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  var inr = function (v) { return v >= 1e7 ? '₹' + (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? '₹' + (v / 1e5).toFixed(1) + ' L' : '₹' + Math.round(v).toLocaleString('en-IN'); };

  /* ---- scroll progress bar + chapter rail --------------------------------- */
  (function () {
    var bar = el('div', 'prog', body); bar.setAttribute('aria-hidden', 'true'); var fill = el('i', '', bar);
    var CH = [['why', 'Problem'], ['time', 'Time'], ['thinking', 'Indias'], ['try', 'Try it'], ['vision', 'Vision'], ['principles', 'Principles'], ['faq', 'FAQ']];
    var rail = el('ul', 'rail', body); rail.setAttribute('aria-hidden', 'true');
    var items = CH.map(function (c) { var li = el('li', '', rail); li.innerHTML = '<span>' + c[1] + '<small></small></span>'; return li; });
    var secs = CH.map(function (c) { return document.getElementById(c[0]); }), tick = false, docH = root.scrollHeight;
    if (window.ResizeObserver) new ResizeObserver(function () { docH = root.scrollHeight; }).observe(body);   // cached: no layout read per scroll frame
    function update() {
      tick = false; var max = Math.max(1, docH - window.innerHeight);
      var cur = -1; secs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < window.innerHeight * .5) cur = i; });   // all reads first, then writes: one layout, not several
      fill.style.setProperty('--p', clamp(window.scrollY / max, 0, 1).toFixed(4));
      items.forEach(function (li, i) { li.classList.toggle('on', i === cur); });
      var B = window.FinosBG;                     // "scroll = time": the readout lives in the rail (wide screens), where it can't collide with content
      if (cur >= 0 && B && B.V) { var k = clamp(window.scrollY / max, 0, 1) * 240; items[cur].querySelector('small').textContent = ' · YR ' + (k / 12).toFixed(1) + ' · ' + inr(B.V(B.mode, k)); }
    }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update); update();
  })();

  /* ---- pause infinite animations while their element is off-screen -------- */
  if ('IntersectionObserver' in window) {
    var animIO = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('paused', !e.isIntersecting); }); }, { rootMargin: '80px' });
    $$('.orbit, .marquee, .tl__c--end, .chip, .bento').forEach(function (n) { animIO.observe(n); });
  }

  /* ---- theme cross-fade (ui.js owns the toggle; we only soften the swap) -- */
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#themeToggle')) return;
    root.classList.add('theming'); setTimeout(function () { root.classList.remove('theming'); }, 750);
  }, true);

  /* ---- spotlight borders, aura, magnetic buttons, ripples ----------------- */
  if (fine && !reduce) {
    var SPOT = '.card,.sim,.col,.stage,.tl__c';
    $$(SPOT).forEach(function (n) { var s = document.createElement('i'); s.className = 'spot'; s.setAttribute('aria-hidden', 'true'); n.appendChild(s); });
    var aura = el('div', 'aura', body); aura.setAttribute('aria-hidden', 'true');
    var ax = -999, ay = -999, tx = -999, ty = -999, raf = 0, pend = null;
    function frame() {
      raf = 0; ax += (tx - ax) * .14; ay += (ty - ay) * .14; aura.style.transform = 'translate3d(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px,0)';
      if (pend) { var r = pend.getBoundingClientRect(); pend.style.setProperty('--mx', (tx - r.left).toFixed(0) + 'px'); pend.style.setProperty('--my', (ty - r.top).toFixed(0) + 'px'); pend = null; }
      if (Math.abs(tx - ax) > .5 || Math.abs(ty - ay) > .5) raf = requestAnimationFrame(frame);
    }
    document.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY; if (ax < -900) { ax = tx; ay = ty; }
      pend = e.target.closest ? e.target.closest(SPOT) : null; if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
    $$('.btn--lg, .nav__act .btn, .final .btn').forEach(function (b) {
      b.addEventListener('pointermove', function (e) { var r = b.getBoundingClientRect(); b.style.translate = (((e.clientX - r.left) / r.width - .5) * 14).toFixed(1) + 'px ' + (((e.clientY - r.top) / r.height - .5) * 10).toFixed(1) + 'px'; });
      b.addEventListener('pointerleave', function () { b.style.translate = ''; });
    });
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest && e.target.closest('.btn--primary'); if (!b) return;
      var r = b.getBoundingClientRect(), s = el('span', 'ripple', b); s.style.left = (e.clientX - r.left) + 'px'; s.style.top = (e.clientY - r.top) + 'px'; setTimeout(function () { s.remove(); }, 750);
    });
  }

  /* ---- Life-energy orbit: money flows in from earning, out to commitments -- */
  (function () {
    var o = $('.orbit'); if (!o) return;
    var chips = $$('.orbit__chip', o), core = $('.orbit__core', o), svg = svgEl('svg', { 'class': 'orbit__flow', 'aria-hidden': 'true' }), lines = [];
    o.insertBefore(svg, o.firstChild);
    function build() {
      var r = o.getBoundingClientRect(); if (!r.width) return; var cx = r.width / 2, cy = r.height / 2, cr = core.getBoundingClientRect().width / 2;
      svg.setAttribute('viewBox', '0 0 ' + r.width + ' ' + r.height); while (svg.firstChild) svg.removeChild(svg.firstChild); lines = [];
      chips.forEach(function (c) {
        var b = c.getBoundingClientRect(), x = b.left - r.left + b.width / 2, y = b.top - r.top + b.height / 2, a = Math.atan2(y - cy, x - cx), out = c.classList.contains('out');
        var sx = cx + Math.cos(a) * (cr + 4), sy = cy + Math.sin(a) * (cr + 4), ex = x - Math.cos(a) * (b.width * .45), ey = y - Math.sin(a) * (b.height * .6);
        var ln = svgEl('line', out ? { x1: sx, y1: sy, x2: ex, y2: ey, 'class': 'flow out' } : { x1: ex, y1: ey, x2: sx, y2: sy, 'class': 'flow' }, svg); lines.push(ln);
        c.onpointerenter = function () { ln.classList.add('hot'); }; c.onpointerleave = function () { ln.classList.remove('hot'); };
      });
    }
    if (window.ResizeObserver) new ResizeObserver(build).observe(o); build();
    if (fine && !reduce) {
      o.addEventListener('pointermove', function (e) { var r = o.getBoundingClientRect(); o.style.setProperty('--ox', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(2)); o.style.setProperty('--oy', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(2)); });
      o.addEventListener('pointerleave', function () { o.style.setProperty('--ox', 0); o.style.setProperty('--oy', 0); });
    }
  })();

  /* ---- The cost of waiting: a live model using the page's own assumptions -- */
  (function () {
    var age = $('#waitAge'), svg = $('#waitSvg'); if (!age || !svg) return;
    var P = 500, out = $('#waitAgeOut'), corpusEl = $('#waitCorpus'), inEl = $('#waitIn'), lossEl = $('#waitLoss'), srEl = $('#waitSr'), btns = $$('#wait .seg button');
    var fv = function (p, m) { return m <= 0 ? 0 : p * ((Math.pow(1.01, m) - 1) / .01) * 1.01; };      // 12% a year, compounded monthly
    var W = 600, H = 300, L = 44, R = 16, T = 26, B = 34, drawn = false;
    var X = function (a) { return L + (W - L - R) * (a - 25) / 35; };
    var grid = svgEl('g', {}, svg), gl = [], gt = [];
    for (var i = 1; i <= 3; i++) { gl.push(svgEl('line', { 'class': 'grid-l', x1: L, x2: W - R }, grid)); gt.push(svgEl('text', { x: 0, 'text-anchor': 'start' }, grid)); }
    svgEl('line', { 'class': 'grid-l', x1: L, x2: W - R, y1: H - B, y2: H - B, style: 'stroke:rgba(var(--ink),.3)' }, svg);
    [25, 35, 45, 60].forEach(function (a) { var t = svgEl('text', { x: X(a), y: H - 10, 'text-anchor': a === 25 ? 'start' : a === 60 ? 'end' : 'middle' }, svg); t.textContent = 'AGE ' + a; });
    var area = svgEl('path', { style: 'fill:rgba(var(--c1),.16)' }, svg), ghost = svgEl('path', { 'class': 'ghost' }, svg), sel = svgEl('path', { 'class': 'sel draw', pathLength: 1 }, svg);
    var dot = svgEl('circle', { r: 5, 'class': 'dot' }, svg), val = svgEl('text', { 'class': 'val', 'text-anchor': 'end' }, svg);
    var lab = svgEl('text', { x: L, y: 14 }, svg); lab.textContent = 'DASHED = STARTING AT 25 · SOLID = YOUR START AGE';
    function render() {
      var s = +age.value, max = fv(P, 420) * 1.06, Y = function (v) { return H - B - (H - B - T) * v / max; };
      out.textContent = s; age.style.setProperty('--fill', ((s - 25) / 25 * 100) + '%');
      for (var i = 0; i < 3; i++) { var yy = Y(max * (i + 1) / 3.2); gl[i].setAttribute('y1', yy); gl[i].setAttribute('y2', yy); gt[i].setAttribute('y', yy - 5); gt[i].setAttribute('x', L + 4); gt[i].textContent = inr(max * (i + 1) / 3.2); }
      var g = '', p = '', m, months = (60 - s) * 12;
      for (m = 0; m <= 420; m += 6) g += (m ? 'L' : 'M') + X(25 + m / 12).toFixed(1) + ',' + Y(fv(P, m)).toFixed(1);
      for (m = 0; m <= months; m += 6) p += (m ? 'L' : 'M') + X(s + m / 12).toFixed(1) + ',' + Y(fv(P, m)).toFixed(1);
      p += 'L' + X(60).toFixed(1) + ',' + Y(fv(P, months)).toFixed(1);
      ghost.setAttribute('d', g); sel.setAttribute('d', p); area.setAttribute('d', p + 'L' + X(60) + ',' + (H - B) + 'L' + X(s) + ',' + (H - B) + 'Z');
      var end = fv(P, months), full = fv(P, 420);
      dot.setAttribute('cx', X(60)); dot.setAttribute('cy', Y(end)); val.setAttribute('x', X(60) - 10); val.setAttribute('y', Y(end) - 12); val.textContent = inr(end);
      corpusEl.textContent = inr(end); inEl.textContent = inr(P * months); lossEl.textContent = s === 25 ? '—' : '−' + inr(full - end);
      return { s: s, end: end, full: full, put: P * months };
    }
    var last = render();
    age.addEventListener('input', function () { last = render(); });
    age.addEventListener('change', function () { srEl.textContent = 'Starting at age ' + last.s + ': ' + inr(last.end) + ' at 60, from ' + inr(last.put) + ' put in. ' + (last.s === 25 ? '' : inr(last.full - last.end) + ' less than starting at 25.'); });
    btns.forEach(function (b) { b.addEventListener('click', function () { P = +b.getAttribute('data-amt'); btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); last = render(); srEl.textContent = '₹' + P.toLocaleString('en-IN') + ' a month: ' + inr(last.end) + ' at 60 if you start at ' + last.s + '.'; }); });
    function go() { if (drawn) return; drawn = true; requestAnimationFrame(function () { sel.classList.add('go'); }); setTimeout(function () { sel.classList.remove('draw', 'go'); }, 2200); }
    if (reduce) sel.classList.remove('draw'); else if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { go(); io.disconnect(); } }, { threshold: .4 }); io.observe(svg); } else sel.classList.remove('draw');
  })();

  /* ---- Completion burst: lime + blue confetti from the message that appeared */
  if (!reduce) document.addEventListener('finos-win', function (e) {
    var t = e.target && e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : null; if (!t) return;
    var cv = el('canvas', 'burst', body), cx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.setAttribute('aria-hidden', 'true'); cx.scale(dpr, dpr);
    var cols = ['182,255,59', '212,255,122', '88,140,255', '255,255,255'], ps = [], i;
    for (i = 0; i < 46; i++) { var a = Math.random() * 6.283, v = 3 + Math.random() * 7; ps.push({ x: t.left + t.width / 2, y: t.top + t.height / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, s: 3 + Math.random() * 4, c: cols[i % 4], r: Math.random() * 6, vr: (Math.random() - .5) * .4 }); }
    var t0 = performance.now();
    (function tick(now) {
      var p = (now - t0) / 1400; cx.clearRect(0, 0, w, h);
      ps.forEach(function (q) { q.x += q.vx; q.y += q.vy; q.vy += .28; q.vx *= .985; q.r += q.vr; cx.save(); cx.translate(q.x, q.y); cx.rotate(q.r); cx.fillStyle = 'rgba(' + q.c + ',' + Math.max(0, 1 - p).toFixed(2) + ')'; cx.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2); cx.restore(); });
      if (p < 1) requestAnimationFrame(tick); else cv.remove();
    })(t0);
  });

  /* ---- Context-aware cursor ring: grows on links, says DRAG on sliders, SCRUB over the hero chart ---- */
  if (fine && !reduce) {
    var ring = el('div', 'cur', body), lab = el('span', '', ring), rx = -99, ry = -99, rtx = -99, rty = -99, rraf = 0, state = '';
    ring.setAttribute('aria-hidden', 'true');
    var setState = function (s, t) { if (s !== state) { state = s; ring.className = 'cur on' + (s ? ' ' + s : ''); lab.textContent = t || ''; } };
    var rframe = function () { rraf = 0; rx += (rtx - rx) * .22; ry += (rty - ry) * .22; ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)'; if (Math.abs(rtx - rx) > .4 || Math.abs(rty - ry) > .4) rraf = requestAnimationFrame(rframe); };
    document.addEventListener('pointermove', function (e) {
      rtx = e.clientX; rty = e.clientY; if (rx < -90) { rx = rtx; ry = rty; }
      var t = e.target, B = window.FinosBG;
      if (t.closest && t.closest('input[type="range"]')) setState('drag', 'DRAG');
      else if (t.closest && t.closest('a,button,summary,[role="tab"]')) setState('link', '');
      else if (B && B.ptr && B.G && B.amb < .35 && !B.ptr.ui && rtx > B.G.xL && rtx < B.G.xR && rty > B.G.y0 - 40 && rty < B.G.y1 + 40) setState('scrub', 'SCRUB');
      else setState('', '');
      if (!rraf) rraf = requestAnimationFrame(rframe);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { ring.className = 'cur'; state = 'x'; });
  }

  /* ---- Pinned life story: scroll = age 25 → 60 (₹500 from 25 versus ₹5,000 from 45, at an assumed 12%) */
  (function () {
    var track = $('.story__track'), svg = $('#storySvg'); if (!track || !svg) return;
    var beats = $$('.beats li'), fv = function (p, m) { return m <= 0 ? 0 : p * ((Math.pow(1.01, m) - 1) / .01) * 1.01; };
    var W = 600, H = 340, L = 8, R = 8, T = 30, B = 40, MAX = fv(500, 420) * 1.1;
    var X = function (a) { return L + (W - L - R) * (a - 25) / 35; }, Y = function (v) { return H - B - (H - B - T) * v / MAX; };
    var g = svgEl('g', {}, svg);
    for (var i = 1; i <= 3; i++) svgEl('line', { 'class': 'grid-l', x1: L, x2: W - R, y1: Y(MAX * i / 3.4), y2: Y(MAX * i / 3.4) }, g);
    svgEl('line', { 'class': 'grid-l', x1: L, x2: W - R, y1: H - B, y2: H - B, style: 'stroke:rgba(var(--ink),.3)' }, svg);
    [25, 35, 45, 60].forEach(function (a) { var t = svgEl('text', { x: X(a), y: H - 14, 'text-anchor': a === 25 ? 'start' : a === 60 ? 'end' : 'middle' }, svg); t.textContent = 'AGE ' + a; });
    var fa = svgEl('path', { 'class': 'fa' }, svg), pb = svgEl('path', { 'class': 'b' }, svg), pa = svgEl('path', { 'class': 'a' }, svg);
    var da = svgEl('circle', { r: 5, 'class': 'da' }, svg), db = svgEl('circle', { r: 4.5, 'class': 'db' }, svg);
    var va = svgEl('text', { 'class': 'va', 'text-anchor': 'end' }, svg), vb = svgEl('text', { 'class': 'vb', 'text-anchor': 'end' }, svg), ag = svgEl('text', { 'class': 'age', x: L, y: 16 }, svg);
    var lastBeat = -1;
    function update(p) {
      var age = 25 + p * 35, d = '', e = '', m, ma = Math.round((age - 25) * 12);
      for (m = 0; m <= ma; m += 4) d += (m ? 'L' : 'M') + X(25 + m / 12).toFixed(1) + ',' + Y(fv(500, m)).toFixed(1);
      d += 'L' + X(age).toFixed(1) + ',' + Y(fv(500, ma)).toFixed(1);
      pa.setAttribute('d', d); fa.setAttribute('d', d + 'L' + X(age) + ',' + (H - B) + 'L' + X(25) + ',' + (H - B) + 'Z');
      var vA = fv(500, ma), mb = Math.round((age - 45) * 12), vB = mb > 0 ? fv(5000, mb) : 0;
      if (mb > 0) { for (m = 0; m <= mb; m += 4) e += (m ? 'L' : 'M') + X(45 + m / 12).toFixed(1) + ',' + Y(fv(5000, m)).toFixed(1); e += 'L' + X(age).toFixed(1) + ',' + Y(vB).toFixed(1); }
      pb.setAttribute('d', e); pb.style.opacity = mb > 0 ? 1 : 0; db.style.opacity = mb > 0 ? 1 : 0;
      da.setAttribute('cx', X(age)); da.setAttribute('cy', Y(vA)); db.setAttribute('cx', X(age)); db.setAttribute('cy', Y(vB));
      va.setAttribute('x', X(age) - 10); va.setAttribute('y', Y(vA) - 12); va.textContent = 'Starts at 25: ' + inr(vA);
      vb.setAttribute('x', X(age) - 10); vb.setAttribute('y', Y(vB) + 24); vb.textContent = mb > 0 ? 'Starts at 45: ' + inr(vB) : ''; vb.style.opacity = mb > 0 ? 1 : 0;
      ag.textContent = 'AGE ' + Math.round(age);
      var b = p < .14 ? 0 : p < .43 ? 1 : p < .8 ? 2 : 3;
      if (b !== lastBeat) { lastBeat = b; beats.forEach(function (li, j) { li.classList.toggle('on', j === b); }); }
    }
    if (reduce) { update(1); return; }
    var tick = false;
    function onScroll() { tick = false; var r = track.getBoundingClientRect(); update(clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1)); }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(onScroll); } }, { passive: true }); onScroll();
  })();

  /* ---- Save my card: a local PNG of the visitor's own illustration (nothing leaves the device) ---------- */
  (function () {
    var btn = $('#shareBtn'), FL = window.FinosLanding; if (!btn || !FL || !FL.snapshot) return;
    btn.addEventListener('click', function () {
      var sn = FL.snapshot(), n = sn.mind, k = sn.amt / 10000, months = n === 1 ? 240 : n === 2 ? 96 : 0;
      var sip = function (m) { return m <= 0 ? 0 : 10000 * ((Math.pow(1.01, m) - 1) / .01) * 1.01; }, corpus = sip(months) * k, put = months * sn.amt;
      var cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630; var c = cv.getContext('2d');
      var bg = c.createLinearGradient(0, 0, 0, 630); bg.addColorStop(0, '#04102b'); bg.addColorStop(.55, '#0a1d4d'); bg.addColorStop(1, '#061333'); c.fillStyle = bg; c.fillRect(0, 0, 1200, 630);
      var gl = c.createRadialGradient(1000, 180, 0, 1000, 180, 520); gl.addColorStop(0, 'rgba(182,255,59,.16)'); gl.addColorStop(1, 'rgba(182,255,59,0)'); c.fillStyle = gl; c.fillRect(0, 0, 1200, 630);
      var col = n === 1 ? '182,255,59' : n === 2 ? '88,140,255' : '150,172,220';
      c.fillStyle = '#eaf0ff'; c.font = '800 34px Manrope, sans-serif'; c.fillText('FIN•OS', 60, 80);
      c.fillStyle = '#8d9bbe'; c.font = '600 18px "JetBrains Mono", monospace'; c.fillText('MY ILLUSTRATION · INDIA ' + n, 60, 130);
      c.fillStyle = '#eaf0ff'; c.font = '800 54px Manrope, sans-serif'; c.fillText('₹' + sn.amt.toLocaleString('en-IN') + ' a month', 60, 215); c.fillText('for 20 years', 60, 275);
      c.fillStyle = 'rgb(' + col + ')'; c.font = '700 96px "JetBrains Mono", monospace'; c.fillText(inr(corpus), 60, 390);
      c.fillStyle = '#a9b6d3'; c.font = '500 22px Manrope, sans-serif'; c.fillText('after putting in ' + inr(put) + ' · assumed 12% a year', 60, 432);
      var arr = sn.chart.cur[n - 1], mx = 0, i; for (i = 0; i <= 240; i++) mx = Math.max(mx, arr[i]); mx = mx || 1;
      c.beginPath(); for (i = 0; i <= 240; i++) { var x = 640 + 500 * i / 240, y = 420 - 300 * arr[i] / mx; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.strokeStyle = 'rgba(' + col + ',.25)'; c.lineWidth = 10; c.lineJoin = 'round'; c.stroke(); c.strokeStyle = 'rgb(' + col + ')'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#8d9bbe'; c.font = '600 15px "JetBrains Mono", monospace'; c.fillText('ILLUSTRATIVE SIMULATION · NOT REAL MARKET DATA · RETURNS ARE NEVER GUARANTEED · NOT ADVICE', 60, 585);
      cv.toBlob(function (blob) {
        if (!blob) return; var f = new File([blob], 'finos-my-number.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] }) && navigator.share) { navigator.share({ files: [f], title: 'My FIN-OS illustration' }).catch(function () {}); return; }
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'finos-my-number.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }, 'image/png');
    });
  })();

  /* ---- 3D layer: custom WebGL (no library), only on capable, non-reduced, wide screens ---------------- */
  if (window.FinosLanding && !window.FinosLanding.reduce && window.innerWidth >= 800 && window.FinosBG) {
    var gs = document.createElement('script'); gs.src = 'js/landing-gl.js'; gs.defer = true; body.appendChild(gs);
  }
})();
