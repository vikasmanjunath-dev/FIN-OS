(function () {
  'use strict';

  /* ── helpers ───────────────────────────────────────────────── */
  var isDark = function () {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  };
  var textColor = function () { return isDark() ? '#9AA0B4' : '#475569'; };
  var gridColor = function () { return isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; };

  /* ── Quant DNA Radar Chart ──────────────────────────────────── */
  var initChart = function () {
    var el = document.getElementById('quantDnaChart');
    if (!el || !window.Chart) return;

    var chart = new window.Chart(el, {
      type: 'radar',
      data: {
        labels: ['Momentum', 'Mean Rev', 'Breakout', 'Volume', 'Volatility'],
        datasets: [{
          label: 'Strategy Strength',
          data: [72, 45, 88, 60, 55],
          backgroundColor: 'rgba(79,124,255,0.15)',
          borderColor: '#4F7CFF',
          pointBackgroundColor: '#C7F000',
          pointBorderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: gridColor() },
            grid:        { color: gridColor() },
            pointLabels: { color: textColor(), font: { family: "'JetBrains Mono',monospace", size: 11 } },
            ticks:       { display: false }
          }
        },
        plugins: { legend: { display: false } }
      }
    });

    /* theme sync */
    window.addEventListener('finos-theme-changed', function () {
      chart.options.scales.r.angleLines.color = gridColor();
      chart.options.scales.r.grid.color       = gridColor();
      chart.options.scales.r.pointLabels.color = textColor();
      chart.update('none');
    });
  };

  /* ── Engine Toggle ──────────────────────────────────────────── */
  var initToggle = function () {
    var btns = document.querySelectorAll('.mode-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  };

  /* ── Boot ───────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initChart();
      initToggle();
    });
  } else {
    initChart();
    initToggle();
  }
})();
