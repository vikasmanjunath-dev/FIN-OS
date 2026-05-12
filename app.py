from flask import Flask, jsonify
from flask_cors import CORS
import feedparser
import time
import ssl

# MAC SSL FIX
if hasattr(ssl, '_create_unverified_context'):
    ssl._create_default_https_context = ssl._create_unverified_context

# STEALTH MODE
feedparser.USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

FEEDS = {
    "India": "https://news.google.com/rss/search?q=business+finance+india+when:1d&hl=en-IN&gl=IN&ceid=IN:en",
    "Global": "https://news.google.com/rss/search?q=global+markets+economy+finance+when:1d&hl=en-US&gl=US&ceid=US:en"
}

cache = {
    "data": [],
    "last_updated": 0
}
CACHE_DURATION = 600 # 10 mins

def determine_type(title):
    t = title.lower()
    if any(word in t for word in ['sensex', 'nifty', 'stock', 'ipo', 'market', 'shares']): return 'stocks'
    if any(word in t for word in ['bitcoin', 'crypto', 'eth', 'token', 'binance']): return 'crypto'
    return 'macro'

# NEW: High Impact detection algorithm
def check_impact(title):
    impact_keywords = ['surge', 'crash', 'plummets', 'soars', 'record', 'rate', 'rbi', 'fed', 'warns', 'crisis', 'breakout', 'hits', 'drops', 'halving', 'inflation']
    t = title.lower()
    return any(word in t for word in impact_keywords)

def fetch_and_parse():
    aggregated_news = []
    print("\n--- INITIATING SECURE GOOGLE NEWS FETCH ---")
    
    for region, url in FEEDS.items():
        print(f"Fetching {region} shards...")
        feed = feedparser.parse(url)
        
        if not feed.entries:
            print(f"⚠️ WARNING: No entries found for {region}.")
            continue
            
        for i, entry in enumerate(feed.entries[:15]): # Fetching slightly more to allow for aggressive filtering
            clean_title = entry.title.split(' - ')[0]
            source = entry.title.split(' - ')[-1] if ' - ' in entry.title else "Network"
            
            aggregated_news.append({
                "id": f"{region}_{i}",
                "title": clean_title,
                "link": entry.link,
                "source": source,
                "type": determine_type(clean_title),
                "high_impact": check_impact(clean_title), # Assign impact flag
                "region": region,
                "timestamp": time.mktime(entry.published_parsed) if hasattr(entry, 'published_parsed') else time.time()
            })
            
    aggregated_news.sort(key=lambda x: x['timestamp'], reverse=True)
    print(f"✅ Successfully decrypted {len(aggregated_news)} total shards.")
    return aggregated_news

@app.route('/api/intel', methods=['GET'])
def get_intel():
    current_time = time.time()
    
    if current_time - cache["last_updated"] > CACHE_DURATION or not cache["data"]:
        try:
            fresh_data = fetch_and_parse()
            if fresh_data:
                cache["data"] = fresh_data
                cache["last_updated"] = current_time
        except Exception as e:
            print(f"Fetch crashed: {e}")
            
    return jsonify({
        "status": "online",
        "cached_ago": int(current_time - cache["last_updated"]),
        "items": cache["data"]
    })

if __name__ == '__main__':
    print("🚀 FIN-OS SECURE BACKEND ACTIVE ON PORT 5000")
    app.run(debug=True, port=5000)