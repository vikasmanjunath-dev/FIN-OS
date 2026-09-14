/**
 * FIN-OS Learn Navigation
 * Injects prev/next module links into the toc-sidebar of all learn-*.html pages.
 */
(function () {
  const CURRICULUM = [
    { file: 'learn-equity.html',       title: 'Equity Protocol',       icon: '📈' },
    { file: 'learn-mf.html',           title: 'Mutual Funds',          icon: '🏦' },
    { file: 'learn-debt.html',         title: 'Debt Instruments',      icon: '📋' },
    { file: 'learn-etf.html',          title: 'ETF Protocol',          icon: '📦' },
    { file: 'learn-technical.html',    title: 'Technical Analysis',    icon: '📊' },
    { file: 'learn-fundamental.html',  title: 'Fundamental Analysis',  icon: '🔬' },
    { file: 'learn-analysis.html',     title: 'Market Analysis',       icon: '🧠' },
    { file: 'learn-metrics.html',      title: 'Market Metrics',        icon: '📐' },
    { file: 'learn-indicators.html',   title: 'Market Indicators',     icon: '📡' },
    { file: 'learn-money-market.html', title: 'Money Market',          icon: '💵' },
    { file: 'learn-commodity.html',    title: 'Commodity Protocol',    icon: '🛢️' },
    { file: 'learn-fno.html',          title: 'F&O Protocol',          icon: '⚡' },
    { file: 'learn-forex.html',        title: 'Forex Protocol',        icon: '💱' },
    { file: 'learn-crypto.html',       title: 'Crypto Protocol',       icon: '🔗' },
  ];

  const page = location.pathname.split('/').pop();
  const idx  = CURRICULUM.findIndex(m => m.file === page);
  if (idx === -1) return;

  const prev = idx > 0               ? CURRICULUM[idx - 1] : null;
  const next = idx < CURRICULUM.length - 1 ? CURRICULUM[idx + 1] : null;

  function ready(fn) {
    if (document.readyState !== 'loading') { fn(); return; }
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  ready(function () {
    const toc = document.querySelector('.toc-sidebar');
    if (!toc) return;

    /* inject a style block once */
    if (!document.getElementById('fln-style')) {
      const s = document.createElement('style');
      s.id = 'fln-style';
      s.textContent = `
        .fln-nav{display:flex;flex-direction:column;gap:6px;margin-top:12px;
          border-top:1px solid var(--border-soft,rgba(255,255,255,.07));padding-top:12px;}
        .fln-btn{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;
          font-size:11px;font-weight:700;letter-spacing:.03em;text-decoration:none;
          background:var(--bg-surface,rgba(255,255,255,.04));
          border:1px solid var(--border-soft,rgba(255,255,255,.07));
          color:var(--text-secondary,rgba(255,255,255,.55));
          transition:all .2s;white-space:nowrap;overflow:hidden;}
        .fln-btn:hover{background:rgba(255,255,255,.09);
          color:var(--text-primary,#fff);border-color:rgba(255,255,255,.18);}
        [data-theme="light"] .fln-btn:hover{background:rgba(0,0,0,.06);color:#111;}
        .fln-btn.next{background:rgba(79,124,255,.1);border-color:rgba(79,124,255,.25);color:#4f7cff;}
        .fln-btn.next:hover{background:rgba(79,124,255,.2);color:#4f7cff;}
        .fln-icon{font-size:13px;flex-shrink:0;}
        .fln-label{overflow:hidden;text-overflow:ellipsis;}
        .fln-progress{font-size:9px;color:var(--text-tertiary,rgba(255,255,255,.22));
          letter-spacing:.06em;text-align:center;margin-top:6px;font-weight:600;}
      `;
      document.head.appendChild(s);
    }

    const div = document.createElement('div');
    div.className = 'fln-nav';

    if (next) {
      const a = document.createElement('a');
      a.href = next.file;
      a.className = 'fln-btn next';
      a.title = 'Next: ' + next.title;
      a.innerHTML = `<span class="fln-icon">${next.icon}</span><span class="fln-label">Next: ${next.title}</span><span style="margin-left:auto">→</span>`;
      div.appendChild(a);
    }

    if (prev) {
      const a = document.createElement('a');
      a.href = prev.file;
      a.className = 'fln-btn';
      a.title = 'Previous: ' + prev.title;
      a.innerHTML = `<span style="margin-right:auto">←</span><span class="fln-label">${prev.title}</span><span class="fln-icon">${prev.icon}</span>`;
      div.appendChild(a);
    }

    const prog = document.createElement('div');
    prog.className = 'fln-progress';
    prog.textContent = `MODULE ${idx + 1} / ${CURRICULUM.length}`;
    div.appendChild(prog);

    /* Mark this module visited */
    try {
      const visited = JSON.parse(localStorage.getItem('finos_learn_visited') || '[]');
      if (!visited.includes(page)) visited.push(page);
      localStorage.setItem('finos_learn_visited', JSON.stringify(visited));
    } catch (_) {}

    toc.appendChild(div);

    /* Curriculum complete callout — only on the last module */
    if (!next) {
      const visited = (() => {
        try { return JSON.parse(localStorage.getItem('finos_learn_visited') || '[]'); } catch { return []; }
      })();
      const completedAll = CURRICULUM.every(m => visited.includes(m.file));

      const s = document.getElementById('fln-style');
      if (s) s.textContent += `
        .fln-complete{margin-top:14px;padding:14px;border-radius:12px;
          background:linear-gradient(135deg,rgba(34,211,166,.1),rgba(79,124,255,.07));
          border:1px solid rgba(34,211,166,.25);}
        [data-theme="light"] .fln-complete{background:linear-gradient(135deg,rgba(34,211,166,.08),rgba(79,124,255,.05));
          border-color:rgba(34,211,166,.3);}
        .fln-complete-title{font-size:13px;font-weight:800;color:#22d3a6;margin-bottom:4px;}
        .fln-complete-sub{font-size:11px;color:var(--text-secondary,rgba(255,255,255,.45));
          line-height:1.5;margin-bottom:12px;}
        .fln-complete-actions{display:flex;flex-direction:column;gap:6px;}
        .fln-ca{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;
          font-size:11px;font-weight:700;text-decoration:none;
          background:var(--bg-surface,rgba(255,255,255,.05));
          border:1px solid var(--border-soft,rgba(255,255,255,.09));
          color:var(--text-secondary,rgba(255,255,255,.65));transition:all .18s;}
        .fln-ca:hover{background:rgba(255,255,255,.1);color:var(--text-primary,#fff);}
        [data-theme="light"] .fln-ca:hover{background:rgba(0,0,0,.07);color:#111;}
        .fln-ca.primary{background:rgba(34,211,166,.12);border-color:rgba(34,211,166,.3);color:#22d3a6;}
        .fln-ca.primary:hover{background:rgba(34,211,166,.22);color:#0d9488;}
      `;

      const box = document.createElement('div');
      box.className = 'fln-complete';
      box.innerHTML = completedAll
        ? `<div class="fln-complete-title">🎓 Curriculum Complete</div>
           <div class="fln-complete-sub">You've studied all 14 market modules. Time to put knowledge to work.</div>
           <div class="fln-complete-actions">
             <a href="track-finances.html" class="fln-ca primary">📊 Start Tracking Finances</a>
             <a href="life-goals-planner.html" class="fln-ca">🎯 Set Your First Goal</a>
             <a href="markets.html" class="fln-ca">📡 Back to Markets Hub</a>
           </div>`
        : `<div class="fln-complete-title">✅ Final Module</div>
           <div class="fln-complete-sub">Revisit any module above, then put your knowledge to work.</div>
           <div class="fln-complete-actions">
             <a href="track-finances.html" class="fln-ca primary">📊 Track Your Finances</a>
             <a href="markets.html" class="fln-ca">📡 Back to Markets Hub</a>
           </div>`;

      toc.appendChild(box);
    }
  });
})();
