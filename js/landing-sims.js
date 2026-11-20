/* FIN-OS landing — the six simulations. Loaded on demand when the visitor nears the "Try it" section. */
(function () {
  'use strict';
  var L = window.FinosLanding; if (!L) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var goToApp = L.goToApp, reduce = L.reduce;
  var timers = {};
  function seq(key, steps) {                    // steps: [[delayMs, fn], ...]; re-running a sim cancels its previous run
    (timers[key] || []).forEach(clearTimeout);
    timers[key] = steps.map(function (s) { return setTimeout(s[1], reduce ? 0 : s[0]); });
  }
  function hide(el) { el.classList.remove('show'); }
  function show(el) {
    el.classList.add('show'); el.dispatchEvent(new CustomEvent('finos-win', { bubbles: true }));
    if (!el.querySelector('.btn')) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--primary btn--sm'; b.innerHTML = 'Enter FIN-OS <span class="arr" aria-hidden="true">→</span>'; b.addEventListener('click', goToApp); el.appendChild(b); }
  }
  var bar = function (id, w) { var e = document.getElementById(id); if (e) e.style.setProperty('--w', w); };
  function on(id, fn) { var b = document.getElementById(id); if (b) b.addEventListener('click', fn); }

  on('runLifeSim', function () {
    var m = $('#lifeMessage'), lists = $$('[data-nodes]'); hide(m); lists.forEach(function (l) { $$('li', l).forEach(function (li) { li.classList.remove('on'); }); });
    var steps = []; for (var i = 0; i < 6; i++) (function (i) { steps.push([i * 450, function () { lists.forEach(function (l) { l.children[i].classList.add('on'); }); }]); })(i);
    steps.push([6 * 450 + 400, function () { show(m); }]); seq('life', steps);
  });
  on('igniteLife', function () { $('#chulha').classList.add('lit'); show($('#desiMessage')); });
  on('runLiteracy', function () {
    var m = $('#literacyMessage'); hide(m); bar('litBad', '0%'); bar('litGood', '0%'); bar('litInv', '0%');
    seq('lit', [[200, function () { bar('litBad', '80%'); }], [1400, function () { bar('litGood', '30%'); }], [2200, function () { bar('litInv', '15%'); }], [3200, function () { show(m); }]]);
  });
  on('runPaycheck', function () {
    var income = 50000, remaining = income, bal = $('#balanceAmount'), m = $('#paycheckMessage'), ex = $$('#exp div'), steps = [];
    hide(m); bar('incFill', '100%'); bal.textContent = '₹50,000'; ex.forEach(function (e) { e.classList.remove('hit'); });
    ex.forEach(function (e, i) {
      steps.push([(i + 1) * 700, function () {
        remaining -= income * (parseInt(e.getAttribute('data-cut'), 10) / 100); e.classList.add('hit');
        bar('incFill', Math.max(0, remaining / income * 100) + '%'); bal.textContent = '₹' + Math.max(0, Math.round(remaining)).toLocaleString('en-IN');
      }]);
    });
    steps.push([ex.length * 700 + 600, function () { if (Math.max(0, Math.round(remaining)) === 0) show(m); }]); seq('pay', steps);
  });
  on('runSolution', function () {
    var m = $('#solutionMessage'); hide(m); bar('fixBefore', '0%'); bar('fixAfter', '0%');
    seq('fix', [[200, function () { bar('fixBefore', '100%'); }], [1200, function () { bar('fixAfter', '20%'); }], [2200, function () { show(m); }]]);
  });
  $$('.belief-grid button').forEach(function (b) {   // ui.js writes the outcome text; the CTA is added after it settles
    b.addEventListener('click', function () {
      setTimeout(function () {
        var r = $('#beliefResult'); if (r.querySelector('.btn')) return;
        var c = document.createElement('button'); c.type = 'button'; c.className = 'btn btn--primary btn--sm'; c.innerHTML = 'Enter FIN-OS <span class="arr" aria-hidden="true">→</span>'; c.addEventListener('click', goToApp); r.appendChild(c);
      }, 450);
    });
  });

})();
