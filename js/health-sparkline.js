/**
 * health-sparkline.js — Health Score Trajectory Sparkline
 * Renders a compact SVG trend line + stat cards from /health-score/{uid}/history.
 * No external dependencies — pure SVG + vanilla JS.
 *
 * Usage:
 *   <div id="hs-sparkline-mount"></div>
 *   <script src="../js/health-sparkline.js"></script>
 *   // Auto-mounts if #hs-sparkline-mount exists, or call:
 *   HealthSparkline.mount('#my-container', userId, options)
 */
(function (global) {
  'use strict';

  const ALERT_ENGINE = 'http://localhost:8001';

  const TIER_COLOR = {
    ELITE:  '#f0c040',
    GREAT:  '#22d3a6',
    GOOD:   '#00d4ff',
    FAIR:   '#f0a500',
    DANGER: '#f04444',
  };

  const TRAJ_EMOJI = { improving: '📈', stable: '➡️', declining: '📉' };

  /** Draw a compact SVG sparkline from an array of {date, total} points. */
  function drawSparkline(container, series, width = 280, height = 60) {
    if (!series || series.length < 2) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:.8rem;">Not enough data yet</span>';
      return;
    }
    const vals   = series.map(p => p.total);
    const minV   = Math.min(...vals);
    const maxV   = Math.max(...vals);
    const range  = Math.max(maxV - minV, 10);
    const pad    = 6;
    const W      = width, H = height;

    // Normalise Y — higher score = higher on chart
    const x = (i)   => pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = (val) => H - pad - ((val - minV) / range) * (H - pad * 2);

    const points = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    // Gradient fill path
    const fillPath = `M${x(0)},${H} ` +
      vals.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') +
      ` L${x(vals.length - 1)},${H} Z`;

    const latest    = vals[vals.length - 1];
    const latestTier = series[series.length - 1]?.tier || 'GOOD';
    const lineColor  = TIER_COLOR[latestTier] || '#00d4ff';

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
           style="display:block;overflow:visible;">
        <defs>
          <linearGradient id="sg-${Date.now()}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="${lineColor}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <path d="${fillPath}" fill="url(#sg-${Date.now()})" />
        <polyline points="${points}" fill="none" stroke="${lineColor}"
                  stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <!-- Latest dot -->
        <circle cx="${x(vals.length-1).toFixed(1)}" cy="${y(latest).toFixed(1)}"
                r="4" fill="${lineColor}" />
      </svg>`;
  }

  /** Render the full sparkline widget into a container element. */
  async function render(containerEl, userId) {
    if (!containerEl || !userId) return;

    containerEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-weight:700;font-size:.9rem;">Health Score Trend</span>
        <span id="_hs_traj" style="font-size:.85rem;"></span>
      </div>
      <div id="_hs_svg_wrap" style="margin-bottom:12px;"></div>
      <div id="_hs_stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;"></div>`;

    try {
      const res  = await fetch(`${ALERT_ENGINE}/health-score/${userId}/history?days=90`);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      const series = data.series || [];

      if (series.length < 2) {
        containerEl.querySelector('#_hs_svg_wrap').innerHTML =
          '<span style="color:var(--text-muted);font-size:.8rem;">Keep using FIN•OS — your trend will appear here</span>';
        return;
      }

      const vals    = series.map(p => p.total);
      const latest  = vals[vals.length - 1];
      const oldest  = vals[0];
      const peak    = Math.max(...vals);
      const low     = Math.min(...vals);
      const delta   = data.delta || (latest - oldest);
      const latTier = series[series.length - 1]?.tier  || 'GOOD';
      const traj    = series[series.length - 1]?.trajectory || 'stable';

      drawSparkline(containerEl.querySelector('#_hs_svg_wrap'), series, 280, 55);

      containerEl.querySelector('#_hs_traj').textContent = TRAJ_EMOJI[traj] || '➡️';

      const deltaColor = delta > 0 ? '#22d3a6' : delta < 0 ? '#f04444' : '#f0a500';
      const deltaStr   = delta > 0 ? `+${delta}` : String(delta);
      containerEl.querySelector('#_hs_stats').innerHTML = [
        { label: 'Current', val: latest,   color: TIER_COLOR[latTier] || '#00d4ff' },
        { label: 'Peak',    val: peak,      color: '#22d3a6' },
        { label: 'Lowest',  val: low,       color: '#f0a500' },
        { label: '90d Δ',   val: deltaStr,  color: deltaColor },
      ].map(s => `
        <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);
                    border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:1.1rem;font-weight:800;color:${s.color}">${s.val}</div>
          <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px;">${s.label}</div>
        </div>`).join('');

    } catch {
      // Offline demo
      const demoSeries = Array.from({ length: 30 }, (_, i) => ({
        date:  new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
        total: Math.round(52 + (i / 29) * 19 + (Math.random() - 0.5) * 4),
        tier:  'GOOD', trajectory: 'improving',
      }));
      drawSparkline(containerEl.querySelector('#_hs_svg_wrap'), demoSeries, 280, 55);
      containerEl.querySelector('#_hs_traj').textContent = '📈';
      containerEl.querySelector('#_hs_stats').innerHTML =
        '<div style="color:var(--text-muted);font-size:.75rem;grid-column:1/-1;">Demo mode — connect alert engine</div>';
    }
  }

  /** Auto-mount into #hs-sparkline-mount if present. */
  function autoMount(userId) {
    const el = document.getElementById('hs-sparkline-mount');
    if (el && userId) render(el, userId);
  }

  global.HealthSparkline = { render, drawSparkline, autoMount };

})(window);
