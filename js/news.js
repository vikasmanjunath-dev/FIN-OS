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