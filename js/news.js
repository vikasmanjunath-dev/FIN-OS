/* =========================================
   FIN-OS INTELLIGENCE: HYPER-SPEED SCRAPER (V3.0)
   - Added: Sequential Fetching, Timeout limits, and Ghost Fallback
   ========================================= */

const RSS2JSON_BASE = "https://api.rss2json.com/v1/api.json?rss_url=";

const URL_INDIA = "https://news.google.com/rss/search?q=business+finance+india+when:1d&hl=en-IN&gl=IN&ceid=IN:en";
const URL_GLOBAL = "https://news.google.com/rss/search?q=global+markets+economy+finance+when:1d&hl=en-US&gl=US&ceid=US:en";

const newsContainer = document.getElementById('newsFeed');
const connectionStatus = document.getElementById('connectionStatus');
const loader = document.getElementById('loaderScreen');

document.addEventListener('DOMContentLoaded', () => {
  // 1. INSTANT LOAD: Check if we have cached news
  const cachedNews = localStorage.getItem('finos_news_cache');
  if (cachedNews) {
    const parsedCache = JSON.parse(cachedNews);
    renderNews(parsedCache);
    hideLoader();
    updateStatus("DISPLAYING CACHED INTEL", "#f5af19");
  }

  // 2. BACKGROUND SYNC: Fetch fresh data
  initScraper(!cachedNews); 
});

async function initScraper(showLoader) {
  if (showLoader && loader) loader.style.display = 'flex';
  
  try {
    // FIX: Fetch sequentially to avoid triggering rate-limits on the free API
    const rawIndia = await fetchFeed(URL_INDIA, "India");
    const rawGlobal = await fetchFeed(URL_GLOBAL, "Global");

    let indiaFinal = filterTrustedSources(rawIndia, ['Mint', 'MoneyControl', 'Hindu', 'Times', 'Standard', 'Express', 'NDTV']).slice(0, 10);
    let globalFinal = filterTrustedSources(rawGlobal, ['Reuters', 'Bloomberg', 'CNBC', 'WSJ', 'Financial', 'BBC', 'Yahoo']).slice(0, 8);

    const finalFeed = [...indiaFinal, ...globalFinal].sort(() => Math.random() - 0.5); 

    if (finalFeed.length > 0) {
      localStorage.setItem('finos_news_cache', JSON.stringify(finalFeed));
      renderNews(finalFeed);
      updateStatus("LIVE UPLINK SECURE", "#00F3FF");
      initInteractions();
      // Inject AI summary after cards render
      setTimeout(injectNewsSummaries, 400);
    } else {
      throw new Error("Empty Data Stream - Rate Limited");
    }
  } catch (error) {
    console.warn("API Blocked or Offline. Initiating Ghost Protocol...", error);
    
    // GHOST PROTOCOL: Never show a dead screen. Use realistic fallback data.
    if (showLoader) {
      updateStatus("LIVE FEED OFFLINE. USING LOCAL GHOST DATA.", "#ff4757");
      deploySimulatedData();
      initInteractions();
    }
  } finally {
    hideLoader();
  }
}

// --- 2. FAST JSON FETCH (With Timeout) ---
async function fetchFeed(targetUrl, regionTag) {
  // 5-second timeout to prevent infinite hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(RSS2JSON_BASE + encodeURIComponent(targetUrl), {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (data.status !== "ok" || !data.items) return [];

    return data.items.map((item, index) => {
      const cleanTitle = item.title.split(' - ')[0]; 
      const sourceName = item.source || item.title.split(' - ').pop() || "Network";

      return {
        id: regionTag + index,
        title: cleanTitle,
        link: item.link,
        time: timeAgo(new Date(item.pubDate)),
        rawDate: new Date(item.pubDate).getTime(), 
        source: sourceName,
        type: determineType(cleanTitle),
        region: regionTag
      };
    });
  } catch (e) {
    clearTimeout(timeoutId);
    return [];
  }
}

// --- 3. SMART FILTER LOGIC ---
function filterTrustedSources(items, keywords) {
  const sorted = items.sort((a, b) => b.rawDate - a.rawDate);
  const trusted = sorted.filter(item => keywords.some(k => item.source.toLowerCase().includes(k.toLowerCase()) || item.title.toLowerCase().includes(k.toLowerCase())));
  return trusted.length >= 4 ? trusted : [...trusted, ...sorted.filter(i => !trusted.includes(i))];
}

function determineType(title) {
  const t = title.toLowerCase();
  if (t.includes('sensex') || t.includes('nifty') || t.includes('stock') || t.includes('ipo') || t.includes('market') || t.includes('shares')) return 'stocks';
  if (t.includes('bitcoin') || t.includes('crypto') || t.includes('eth') || t.includes('token') || t.includes('binance')) return 'crypto';
  return 'macro';
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const hrs = seconds / 3600;
  if (hrs > 24) return Math.floor(hrs/24) + "d ago";
  if (hrs > 1) return Math.floor(hrs) + "h ago";
  const mins = seconds / 60;
  if (mins > 1) return Math.floor(mins) + "m ago";
  return "Just now";
}

// --- 4. RENDERER & UX ---
function renderNews(newsArray) {
  newsContainer.innerHTML = '';
  newsArray.forEach(news => {
    const a = document.createElement('a');
    a.href = news.link;
    a.target = "_blank";
    a.className = `intel-packet ${news.type}`;
    a.innerHTML = `
      <div class="packet-meta">
        <span class="packet-tag">${news.type.toUpperCase()}</span>
        <span>${news.time}</span>
      </div>
      <h3>${news.title}</h3>
      <div class="packet-footer">
        <span class="source-brand">${news.source}</span>
        <span class="read-arrow">DECRYPT ➔</span>
      </div>
    `;
    newsContainer.appendChild(a);
  });
}

function hideLoader() {
  if (loader) loader.style.display = 'none';
}

function updateStatus(text, color) {
  if(connectionStatus) {
    connectionStatus.innerText = text;
    connectionStatus.style.color = color;
  }
}

// --- 5. INTERACTIVE 3D & SCROLL ENGINE ---
function initInteractions() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('revealed');
        }, Math.random() * 100); 
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '50px' });

  const cards = document.querySelectorAll('.intel-packet');
  cards.forEach(card => {
    observer.observe(card); 
    
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rotateX = ((y - cy) / cy) * -8; 
      const rotateY = ((x - cx) / cx) * 8;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    });
  });
}

// --- 6. SMART DOCK FILTERING ---
window.filterNews = function(category, btnElement) {
  const cards = document.querySelectorAll('.intel-packet');
  const buttons = document.querySelectorAll('.dock-btn');
  
  if (category !== 'all') {
    const count = Array.from(cards).filter(c => c.classList.contains(category)).length;
    if (count === 0) return; 
  }

  buttons.forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');

  cards.forEach(card => {
    if (category === 'all' || card.classList.contains(category)) {
      card.style.display = 'block';
      card.classList.remove('revealed');
      setTimeout(() => card.classList.add('revealed'), 10);
    } else {
      card.style.display = 'none';
    }
  });
}

// ── 7. AI NEWS SUMMARIZER ─────────────────────────────────────────────────────
// fetchAiSummary(symbol, headlines) — calls /summarize on market intel Flask server
// Returns { bullets, sentiment_score, sentiment_label, retail_impact, related_stocks }

const SUMMARIZE_URL = 'http://127.0.0.1:5000/summarize';
const _summaryCache = new Map();   // in-memory: symbol → { data, ts }
const SUMMARY_TTL   = 30 * 60 * 1000;  // 30 minutes

window.fetchAiSummary = async function (symbol, headlines = []) {
  if (!symbol) return null;
  const key = symbol.toUpperCase();

  // Cache hit
  const cached = _summaryCache.get(key);
  if (cached && Date.now() - cached.ts < SUMMARY_TTL) return cached.data;

  // AbortSignal.timeout() polyfill for older browsers
  function _makeSignal(ms) {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  }

  try {
    const resp = await fetch(SUMMARIZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, news_items: headlines.slice(0, 6) }),
      signal: _makeSignal(15000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.status !== 'success') return null;
    _summaryCache.set(key, { data, ts: Date.now() });
    return data;
  } catch { return null; }
};

// Inject skeleton + sentiment CSS once
(function _injectNewsCss() {
  if (document.getElementById('arya-news-css')) return;
  const s = document.createElement('style');
  s.id = 'arya-news-css';
  s.textContent = `
    .arya-dot {
      border-radius: 6px;
      background: linear-gradient(90deg, rgba(255,255,255,.05) 25%, rgba(255,255,255,.12) 50%, rgba(255,255,255,.05) 75%);
      background-size: 200% 100%;
      animation: arya-shimmer 1.4s infinite;
    }
    @keyframes arya-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .arya-news-summary-card { transition: opacity .3s; }
  `;
  document.head.appendChild(s);
})();

// Inject an AI summary card into any container element
window.injectAiSummaryCard = function (container, symbolOrData, headlines = []) {
  if (!container) return;

  // Placeholder while loading
  const card = document.createElement('div');
  card.className = 'arya-news-summary-card';
  card.style.cssText = `
    background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.12);
    border-radius:14px;padding:16px 18px;margin:12px 0;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;`;
  card.innerHTML = `
    <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;
      color:#00ff88;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
      🧠 Arya AI Summary
      <span id="arya-sentiment-badge-${symbolOrData}"
        style="padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;
               background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);">Loading…</span>
    </div>
    <div id="arya-bullets-${symbolOrData}" style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.7;">
      <div class="arya-dot" style="width:120px;height:12px;background:rgba(255,255,255,.06);border-radius:6px;margin:6px 0;"></div>
      <div class="arya-dot" style="width:180px;height:12px;background:rgba(255,255,255,.06);border-radius:6px;margin:6px 0;"></div>
      <div class="arya-dot" style="width:100px;height:12px;background:rgba(255,255,255,.06);border-radius:6px;margin:6px 0;"></div>
    </div>
    <div id="arya-retail-${symbolOrData}" style="margin-top:10px;font-size:12px;
      color:rgba(255,255,255,.4);border-top:1px solid rgba(255,255,255,.06);padding-top:8px;"></div>`;
  container.prepend(card);

  // Fetch and populate
  fetchAiSummary(symbolOrData, headlines).then(data => {
    if (!data) {
      card.style.display = 'none';
      return;
    }

    const badge   = card.querySelector(`#arya-sentiment-badge-${symbolOrData}`);
    const bulletsEl = card.querySelector(`#arya-bullets-${symbolOrData}`);
    const retailEl  = card.querySelector(`#arya-retail-${symbolOrData}`);

    const score = data.sentiment_score || 0;
    const badgeColor = score > 20 ? '#00ff88' : score < -20 ? '#ff6b6b' : '#ffb703';
    const badgeBg    = score > 20 ? 'rgba(0,255,136,.12)' : score < -20 ? 'rgba(255,107,107,.12)' : 'rgba(255,183,3,.12)';
    const badgeLabel = score > 20 ? `▲ BULLISH ${score}` : score < -20 ? `▼ BEARISH ${score}` : `→ NEUTRAL ${score}`;

    if (badge) {
      badge.textContent   = badgeLabel;
      badge.style.color   = badgeColor;
      badge.style.background = badgeBg;
    }

    if (bulletsEl && data.bullets?.length) {
      bulletsEl.innerHTML = data.bullets.map(b =>
        `<div style="display:flex;gap:8px;margin-bottom:4px;">
           <span style="color:#00ff88;flex-shrink:0;">•</span>
           <span>${b}</span>
         </div>`
      ).join('');
    }

    if (retailEl && data.retail_impact) {
      retailEl.textContent = `💡 For you: ${data.retail_impact}`;
    }
  });
};

// Auto-inject on news page: attach AI summary to top 3 news cards
function injectNewsSummaries() {
  const cards = document.querySelectorAll('.intel-packet');
  if (!cards.length) return;
  const headlines = Array.from(cards).slice(0, 8).map(c => c.querySelector('h3')?.textContent || '');
  // Inject one aggregate summary at the top of the feed
  const feed = document.getElementById('newsFeed');
  if (feed) {
    injectAiSummaryCard(feed, 'IndiaMarkets', headlines);
  }
}

// --- 7. FAILSAFE GHOST DATA ---
function deploySimulatedData() {
  const mockData = [
    { title: "Nifty hits record high amid strong global cues", type: "stocks", time: "12m ago", source: "Mint", link: "#" },
    { title: "RBI maintains repo rate, signals focus on inflation", type: "macro", time: "1h ago", source: "MoneyControl", link: "#" },
    { title: "Bitcoin surges past key resistance level ahead of halving", type: "crypto", time: "2h ago", source: "Reuters", link: "#" },
    { title: "Tech stocks lead rally as inflation data cools", type: "stocks", time: "3h ago", source: "Bloomberg", link: "#" },
    { title: "Ethereum gas fees drop to yearly lows", type: "crypto", time: "5h ago", source: "CryptoNews", link: "#" },
    { title: "Global supply chains brace for new shipping delays", type: "macro", time: "6h ago", source: "WSJ", link: "#" },
    { title: "New IPOs line up in Indian markets for next quarter", type: "stocks", time: "8h ago", source: "Economic Times", link: "#" },
    { title: "Gold prices stabilize as bond yields fluctuate", type: "macro", time: "10h ago", source: "Financial Times", link: "#" }
  ];
  renderNews(mockData);
}