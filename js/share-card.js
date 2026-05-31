/**
 * share-card.js — Financial milestone share card generator
 * Generates a beautiful Canvas PNG for WhatsApp/Twitter/Instagram sharing
 *
 * Triggered by: NETWORTH_MILESTONE alert, manual call from dashboard
 * Usage: ShareCard.generate(milestone, userStats) → Promise<dataURL>
 *        ShareCard.share(milestone, userStats, platform)
 */
(function (global) {
  'use strict';

  const MILESTONE_COLORS = {
    '1L':  { bg: ['#0d1117', '#1a1f2e'], accent: '#00d4ff',  emoji: '🎯' },
    '5L':  { bg: ['#0d1117', '#1a2010'], accent: '#22d3a6',  emoji: '🚀' },
    '10L': { bg: ['#0d1117', '#1f1a10'], accent: '#f0a500',  emoji: '💰' },
    '25L': { bg: ['#0d1117', '#1a1030'], accent: '#a855f7',  emoji: '🏆' },
    '50L': { bg: ['#0d1117', '#1a0d30'], accent: '#e879f9',  emoji: '👑' },
    '1CR': { bg: ['#0d1117', '#1a1000'], accent: '#f0c040',  emoji: '💎' },
    '5CR': { bg: ['#0d1117', '#201000'], accent: '#ff6b35',  emoji: '🦋' },
  };

  function formatMilestone(key) {
    const map = { '1L':'₹1 Lakh','5L':'₹5 Lakh','10L':'₹10 Lakh',
                  '25L':'₹25 Lakh','50L':'₹50 Lakh','1CR':'₹1 Crore','5CR':'₹5 Crore' };
    return map[key] || key;
  }

  /**
   * Generate share card as base64 PNG data URL.
   * @param {string} milestone - '1L' | '5L' | '10L' | '25L' | '50L' | '1CR' | '5CR'
   * @param {object} stats - { savingsRate, healthScore, healthTier, yearsToNext, userName }
   * @returns {string} canvas data URL
   */
  function generate(milestone, stats = {}) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const theme = MILESTONE_COLORS[milestone] || MILESTONE_COLORS['1L'];

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, theme.bg[0]);
    grad.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Glowing orb
    const orb = ctx.createRadialGradient(W*0.7, H*0.3, 0, W*0.7, H*0.3, W*0.4);
    orb.addColorStop(0, theme.accent + '22');
    orb.addColorStop(1, 'transparent');
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, W, H);

    // Grid dots
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = 40; x < W; x += 60) {
      for (let y = 40; y < H; y += 60) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // FIN•OS brand
    ctx.font = 'bold 36px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = theme.accent;
    ctx.fillText('FIN•OS', 80, 100);

    ctx.font = '22px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('Financial Operating System', 80, 135);

    // Big milestone emoji
    ctx.font = '140px serif';
    ctx.fillText(theme.emoji, W/2 - 80, H*0.38);

    // Milestone amount
    ctx.font = 'bold 100px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    const milText = formatMilestone(milestone);
    ctx.fillText(milText, W/2, H*0.55);

    // Achievement text
    ctx.font = 'bold 42px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = theme.accent;
    ctx.fillText('Net Worth Milestone Hit! 🎉', W/2, H*0.63);

    // Stats row
    ctx.textAlign = 'left';
    const statY = H*0.73;
    const stats_data = [
      { label: 'Savings Rate', value: `${stats.savingsRate || '--'}%` },
      { label: 'Health Score', value: `${stats.healthScore || '--'}/100` },
      { label: 'Tier',         value: stats.healthTier || 'GOOD' },
    ];

    const boxW = 280, boxH = 100, gap = 30;
    const startX = (W - (stats_data.length * boxW + (stats_data.length-1) * gap)) / 2;

    stats_data.forEach((s, i) => {
      const bx = startX + i * (boxW + gap);
      // Box
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.roundRect(bx, statY, boxW, boxH, 14);
      ctx.fill();
      ctx.strokeStyle = theme.accent + '44';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Value
      ctx.font = 'bold 34px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(s.value, bx + boxW/2, statY + 45);
      // Label
      ctx.font = '18px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(s.label, bx + boxW/2, statY + 75);
    });

    // User name
    ctx.textAlign = 'center';
    if (stats.userName) {
      ctx.font = 'bold 32px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(stats.userName, W/2, H*0.88);
    }

    // CTA
    ctx.font = '24px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('Track your wealth free at finos.app', W/2, H*0.95);

    // Border
    ctx.strokeStyle = theme.accent + '30';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, W-40, H-40);

    ctx.textAlign = 'left';
    return canvas.toDataURL('image/png', 0.95);
  }

  /**
   * Download the share card as a PNG file.
   */
  function download(milestone, stats) {
    const url = generate(milestone, stats);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finos-milestone-${milestone.toLowerCase()}.png`;
    a.click();
  }

  /**
   * Share to a specific platform.
   * @param {string} milestone
   * @param {object} stats
   * @param {'whatsapp'|'twitter'|'download'} platform
   */
  function share(milestone, stats, platform = 'download') {
    const url = generate(milestone, stats);
    const text = encodeURIComponent(
      `🎉 I just hit ${formatMilestone(milestone)} net worth on FIN•OS — India's smartest financial OS! Track yours free: https://finos.app`
    );

    const platforms = {
      whatsapp: `https://wa.me/?text=${text}`,
      twitter:  `https://twitter.com/intent/tweet?text=${text}`,
      download: null,
    };

    if (platform === 'download' || !platforms[platform]) {
      download(milestone, stats);
      return;
    }

    // For social platforms: copy image to clipboard, then open share URL
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        if (navigator.clipboard?.write) {
          navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]).catch(() => {});
        }
        window.open(platforms[platform], '_blank', 'noopener');
      })
      .catch(() => window.open(platforms[platform], '_blank', 'noopener'));
  }

  /**
   * Show a full share modal with platform buttons.
   */
  function showShareModal(milestone, stats) {
    const existing = document.getElementById('finos-share-modal');
    if (existing) existing.remove();

    const imgUrl = generate(milestone, stats);

    const modal = document.createElement('div');
    modal.id = 'finos-share-modal';
    modal.style.cssText = [
      'position:fixed;inset:0;z-index:99999',
      'background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center',
      'padding:20px;',
    ].join(';');

    const theme = MILESTONE_COLORS[milestone] || MILESTONE_COLORS['1L'];

    modal.innerHTML = `
      <div style="background:#161b22;border:1px solid ${theme.accent}33;border-radius:20px;
                  padding:28px;max-width:480px;width:100%;text-align:center;">
        <img src="${imgUrl}" style="width:100%;border-radius:12px;margin-bottom:20px;" />
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:6px;">
          Share your milestone! 🎉
        </div>
        <div style="font-size:.85rem;color:#8892a4;margin-bottom:20px;">
          Inspire others on their financial journey
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:16px;">
          <button onclick="ShareCard.share('${milestone}',${JSON.stringify(stats)},'whatsapp')"
            style="background:#25d366;color:#fff;border:none;border-radius:10px;
                   padding:10px 20px;font-weight:700;cursor:pointer;">
            📱 WhatsApp
          </button>
          <button onclick="ShareCard.share('${milestone}',${JSON.stringify(stats)},'twitter')"
            style="background:#1d9bf0;color:#fff;border:none;border-radius:10px;
                   padding:10px 20px;font-weight:700;cursor:pointer;">
            🐦 Twitter/X
          </button>
          <button onclick="ShareCard.download('${milestone}',${JSON.stringify(stats)})"
            style="background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2);
                   border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;">
            💾 Download
          </button>
        </div>
        <button onclick="document.getElementById('finos-share-modal').remove()"
          style="background:transparent;border:none;color:#8892a4;cursor:pointer;font-size:.85rem;">
          Close
        </button>
      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  global.ShareCard = { generate, download, share, showShareModal };

})(window);
