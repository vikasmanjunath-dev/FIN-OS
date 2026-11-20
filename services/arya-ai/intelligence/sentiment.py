"""
Arya AI — Rule-based financial sentiment engine.
No ML model dependency. Fast, accurate for Indian finance headlines.
Returns (sentiment: str, score: float) where score is -1.0 to +1.0.
"""

_BULLISH = [
    "surge", "rally", "soar", "jump", "rise", "gain", "climb", "hit record",
    "all-time high", "52-week high", "strong", "beat", "outperform", "upgrade",
    "buy", "positive", "profit", "revenue growth", "dividend", "buyback",
    "expansion", "acquisition gains", "recovery", "upside", "breakout",
    "bull", "bullish", "inflow", "fii buying", "dii buying", "rate cut",
    "growth", "robust", "impressive", "exceeded", "above estimate",
]

_BEARISH = [
    "fall", "drop", "plunge", "crash", "decline", "slip", "tumble", "lose",
    "loss", "miss", "below estimate", "underperform", "downgrade", "sell",
    "negative", "weak", "concern", "warning", "risk", "debt", "default",
    "fraud", "scam", "probe", "penalty", "fine", "ban", "suspend",
    "outflow", "fii selling", "bear", "bearish", "rate hike", "inflation spike",
    "slowdown", "contraction", "lower guidance", "cut target",
]

_NEUTRAL = [
    "hold", "neutral", "unchanged", "stable", "flat", "consolidate",
    "sideways", "in line", "meet estimate", "as expected",
]

_WEIGHT = {
    "hit record": 0.9, "all-time high": 0.9, "plunge": 0.8, "crash": 0.9,
    "surge": 0.8, "rally": 0.7, "soar": 0.8, "fraud": 0.95, "scam": 0.9,
    "ban": 0.85, "rate cut": 0.7, "rate hike": 0.65, "dividend": 0.6,
    "buyback": 0.65, "outperform": 0.7, "upgrade": 0.65, "downgrade": 0.7,
}


def score_headline(text: str) -> tuple[str, float]:
    """
    Returns (sentiment, score).
    sentiment: 'bullish' | 'bearish' | 'neutral'
    score: -1.0 (very bearish) to +1.0 (very bullish)
    """
    tl    = text.lower()
    score = 0.0
    hits  = 0

    for word in _BULLISH:
        if word in tl:
            w      = _WEIGHT.get(word, 0.5)
            score += w
            hits  += 1

    for word in _BEARISH:
        if word in tl:
            w      = _WEIGHT.get(word, 0.5)
            score -= w
            hits  += 1

    if hits == 0:
        return "neutral", 0.0

    normalised = max(-1.0, min(1.0, score / hits))

    if normalised > 0.15:
        return "bullish", round(normalised, 3)
    if normalised < -0.15:
        return "bearish", round(normalised, 3)
    return "neutral", round(normalised, 3)


def aggregate_sentiment(articles: list[dict]) -> dict:
    """
    Given a list of news dicts (each with sentiment_score),
    return aggregate: {score, label, bullish_count, bearish_count, neutral_count}
    """
    if not articles:
        return {"score": 0.0, "label": "neutral", "bullish": 0, "bearish": 0, "neutral": 0}

    scores   = [a.get("sentiment_score", 0) for a in articles]
    avg      = sum(scores) / len(scores)
    bull_n   = sum(1 for a in articles if a.get("sentiment") == "bullish")
    bear_n   = sum(1 for a in articles if a.get("sentiment") == "bearish")
    neut_n   = len(articles) - bull_n - bear_n

    if avg > 0.1:
        label = "bullish"
    elif avg < -0.1:
        label = "bearish"
    else:
        label = "neutral"

    return {
        "score":   round(avg, 3),
        "label":   label,
        "bullish": bull_n,
        "bearish": bear_n,
        "neutral": neut_n,
        "total":   len(articles),
    }
