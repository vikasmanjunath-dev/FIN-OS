"""
Indicator Engine
================
RSI, MACD, SMA/EMA, Bollinger, ATR. Vectorised with numpy. No pandas required.

Inputs: list[{t, o, h, l, c, v}].  Outputs: { name -> [values aligned to bars] }.
"""
from __future__ import annotations

import math
from typing import Iterable

import numpy as np


class IndicatorEngine:
    # ---------------- Moving averages ----------------
    @staticmethod
    def sma(values: Iterable[float], period: int) -> list[float | None]:
        a = np.asarray(list(values), dtype=float)
        if len(a) < period:
            return [None] * len(a)
        ker = np.ones(period) / period
        out = np.convolve(a, ker, mode="valid")
        return [None] * (period - 1) + [float(x) for x in out]

    @staticmethod
    def ema(values: Iterable[float], period: int) -> list[float | None]:
        a = np.asarray(list(values), dtype=float)
        out: list[float | None] = [None] * len(a)
        if len(a) < period:
            return out
        k = 2 / (period + 1)
        prev = float(np.mean(a[:period]))
        out[period - 1] = prev
        for i in range(period, len(a)):
            prev = a[i] * k + prev * (1 - k)
            out[i] = prev
        return out

    # ---------------- RSI ----------------
    @staticmethod
    def rsi(closes: Iterable[float], period: int = 14) -> list[float | None]:
        a = np.asarray(list(closes), dtype=float)
        out: list[float | None] = [None] * len(a)
        if len(a) < period + 1:
            return out
        delta = np.diff(a)
        gains = np.where(delta > 0, delta, 0.0)
        losses = np.where(delta < 0, -delta, 0.0)
        avg_g = float(gains[:period].mean())
        avg_l = float(losses[:period].mean())
        out[period] = 100 - 100 / (1 + (avg_g / (avg_l or 1e-9)))
        for i in range(period + 1, len(a)):
            g, l = gains[i - 1], losses[i - 1]
            avg_g = (avg_g * (period - 1) + g) / period
            avg_l = (avg_l * (period - 1) + l) / period
            out[i] = 100 - 100 / (1 + (avg_g / (avg_l or 1e-9)))
        return out

    # ---------------- MACD ----------------
    def macd(self, closes: Iterable[float], fast: int = 12, slow: int = 26, signal: int = 9):
        ef = self.ema(closes, fast)
        es = self.ema(closes, slow)
        line = [
            (a - b) if (a is not None and b is not None) else None
            for a, b in zip(ef, es)
        ]
        sig = self.ema([0 if v is None else v for v in line], signal)
        # null-out signal where line is null
        sig = [None if line[i] is None else sig[i] for i in range(len(line))]
        hist = [
            (line[i] - sig[i]) if (line[i] is not None and sig[i] is not None) else None
            for i in range(len(line))
        ]
        return {"macd": line, "signal": sig, "histogram": hist}

    # ---------------- Bollinger ----------------
    def bollinger(self, closes: Iterable[float], period: int = 20, mult: float = 2.0):
        a = np.asarray(list(closes), dtype=float)
        mid = self.sma(a, period)
        upper: list[float | None] = [None] * len(a)
        lower: list[float | None] = [None] * len(a)
        for i in range(period - 1, len(a)):
            window = a[i - period + 1: i + 1]
            sd = float(window.std())
            upper[i] = mid[i] + mult * sd
            lower[i] = mid[i] - mult * sd
        return {"middle": mid, "upper": upper, "lower": lower}

    # ---------------- ATR ----------------
    @staticmethod
    def atr(candles: list[dict], period: int = 14) -> list[float | None]:
        if len(candles) < period + 1:
            return [None] * len(candles)
        trs = [None]
        for i in range(1, len(candles)):
            h, l, pc = candles[i]["h"], candles[i]["l"], candles[i - 1]["c"]
            trs.append(max(h - l, abs(h - pc), abs(l - pc)))
        out: list[float | None] = [None] * len(candles)
        prev = float(np.mean([t for t in trs[1:period + 1]]))
        out[period] = prev
        for i in range(period + 1, len(candles)):
            prev = (prev * (period - 1) + trs[i]) / period
            out[i] = prev
        return out

    # ---------------- All-in-one ----------------
    def compute_all(self, candles: list[dict]) -> dict:
        if not candles:
            return {"empty": True}
        closes = [c["c"] for c in candles]
        macd = self.macd(closes)
        bb = self.bollinger(closes, 20, 2)
        return {
            "rsi_14": self.rsi(closes, 14),
            "ma_20": self.sma(closes, 20),
            "ma_50": self.sma(closes, 50),
            "ma_200": self.sma(closes, 200),
            "macd": macd["macd"],
            "macd_signal": macd["signal"],
            "macd_hist": macd["histogram"],
            "bb_upper": bb["upper"],
            "bb_middle": bb["middle"],
            "bb_lower": bb["lower"],
            "atr_14": self.atr(candles, 14),
            "ts": [c["t"] for c in candles],
        }
