"""
Insights Engine
===============
Rule-based signal generation from technical indicators + spot data.
Each rule is transparent and auditable — no black-box ML.

Output schema per signal:
  { type, label, detail, severity }   severity ∈ {bullish, bearish, neutral, warning}
"""
from __future__ import annotations

from typing import Any


class InsightsEngine:
    # ── Public API ──────────────────────────────────────────────────────────
    def generate(
        self,
        symbol: str,
        spot: dict,
        candles: list[dict],
        ind: dict,
    ) -> list[dict]:
        signals: list[dict] = []
        signals += self._rsi_signals(ind)
        signals += self._macd_signals(ind)
        signals += self._ma_signals(spot, ind)
        signals += self._volume_signals(candles, ind)
        signals += self._range_signals(spot)
        signals += self._pe_signals(spot)
        return signals

    # ── Private helpers ─────────────────────────────────────────────────────
    @staticmethod
    def _last(series: list | None) -> float | None:
        if not series:
            return None
        for v in reversed(series):
            if v is not None:
                return v
        return None

    def _rsi_signals(self, ind: dict) -> list[dict]:
        rsi = self._last(ind.get("rsi"))
        if rsi is None:
            return []
        if rsi > 75:
            return [{"type": "RSI", "label": "Heavily Overbought",
                     "detail": f"RSI {rsi:.1f} — momentum extreme, high reversal risk",
                     "severity": "bearish"}]
        if rsi > 65:
            return [{"type": "RSI", "label": "Overbought Zone",
                     "detail": f"RSI {rsi:.1f} — consider trimming or tightening stops",
                     "severity": "warning"}]
        if rsi < 25:
            return [{"type": "RSI", "label": "Deeply Oversold",
                     "detail": f"RSI {rsi:.1f} — potential bounce setup, watch for reversal candle",
                     "severity": "bullish"}]
        if rsi < 35:
            return [{"type": "RSI", "label": "Oversold Zone",
                     "detail": f"RSI {rsi:.1f} — selling pressure easing, accumulation possible",
                     "severity": "bullish"}]
        return [{"type": "RSI", "label": "Neutral",
                 "detail": f"RSI {rsi:.1f} — no extreme signal",
                 "severity": "neutral"}]

    def _macd_signals(self, ind: dict) -> list[dict]:
        macd  = self._last(ind.get("macd"))
        sig   = self._last(ind.get("macd_signal"))
        hist  = self._last(ind.get("macd_hist"))
        if macd is None or sig is None:
            return []

        if macd > sig and hist and hist > 0:
            return [{"type": "MACD", "label": "Bullish Crossover",
                     "detail": f"MACD ({macd:.2f}) above signal ({sig:.2f}) — momentum building",
                     "severity": "bullish"}]
        if macd < sig and hist and hist < 0:
            return [{"type": "MACD", "label": "Bearish Crossover",
                     "detail": f"MACD ({macd:.2f}) below signal ({sig:.2f}) — selling pressure",
                     "severity": "bearish"}]
        return []

    def _ma_signals(self, spot: dict, ind: dict) -> list[dict]:
        price = spot.get("price") or 0
        ma50  = self._last(ind.get("sma_50"))
        ma200 = self._last(ind.get("sma_200"))
        if not price or ma50 is None or ma200 is None:
            return []

        signals = []
        if price > ma200 and ma50 > ma200:
            signals.append({"type": "Trend", "label": "Golden Zone",
                            "detail": "Price + MA50 both above MA200 — structural uptrend intact",
                            "severity": "bullish"})
        elif price < ma200 and ma50 < ma200:
            signals.append({"type": "Trend", "label": "Bearish Regime",
                            "detail": "Price + MA50 below MA200 — avoid fresh longs",
                            "severity": "bearish"})
        elif price > ma200 and ma50 < ma200:
            signals.append({"type": "Trend", "label": "Early Recovery",
                            "detail": "Price reclaimed MA200 but MA50 still below — wait for MA50 to follow",
                            "severity": "neutral"})

        # Proximity to MA50
        if ma50 and abs(price - ma50) / ma50 < 0.01:
            signals.append({"type": "Support", "label": "Resting on MA50",
                            "detail": "Price within 1% of 50-day MA — key support/resistance level",
                            "severity": "neutral"})
        return signals

    def _volume_signals(self, candles: list[dict], ind: dict) -> list[dict]:
        if len(candles) < 20:
            return []
        vols  = [c.get("v", 0) or 0 for c in candles]
        avg20 = sum(vols[-20:]) / 20 if len(vols) >= 20 else 0
        last  = vols[-1] if vols else 0
        if avg20 <= 0:
            return []
        ratio = last / avg20
        if ratio > 2.5:
            return [{"type": "Volume", "label": "Volume Spike",
                     "detail": f"{ratio:.1f}× avg volume — institutional flow? Confirm with price action",
                     "severity": "warning"}]
        if ratio < 0.3:
            return [{"type": "Volume", "label": "Low Volume Day",
                     "detail": f"Only {ratio:.1f}× avg volume — weak conviction, avoid chasing",
                     "severity": "neutral"}]
        return []

    def _range_signals(self, spot: dict) -> list[dict]:
        price = spot.get("price") or 0
        hi52  = spot.get("high_52w") or 0
        lo52  = spot.get("low_52w") or 0
        if not price or not hi52 or not lo52 or hi52 == lo52:
            return []
        pct = (price - lo52) / (hi52 - lo52)
        if pct >= 0.95:
            return [{"type": "52W Range", "label": "Near 52-Week High",
                     "detail": f"Price at {pct*100:.0f}% of yearly range — breakout territory or distribution",
                     "severity": "warning"}]
        if pct <= 0.05:
            return [{"type": "52W Range", "label": "Near 52-Week Low",
                     "detail": f"Price at {pct*100:.0f}% of yearly range — deep value zone or value trap",
                     "severity": "neutral"}]
        return []

    def _pe_signals(self, spot: dict) -> list[dict]:
        pe = spot.get("pe")
        if pe is None:
            return []
        if pe > 80:
            return [{"type": "Valuation", "label": "Expensive",
                     "detail": f"P/E {pe:.1f} — priced for perfection, any miss = sharp correction",
                     "severity": "warning"}]
        if pe < 12 and pe > 0:
            return [{"type": "Valuation", "label": "Value Zone",
                     "detail": f"P/E {pe:.1f} — below historical median, potential contrarian play",
                     "severity": "bullish"}]
        return []
