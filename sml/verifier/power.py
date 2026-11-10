"""How many founder labels does the verifier gate (P >= 0.90, R >= 0.80) need? Pure python, exact binomial.
Question: with N labelled claims, if the true verifier were GOOD (P 0.92, R 0.85), how often would the 95% one-sided
lower bounds both clear the gate (so a GO is possible)? The prevalence of unsupported claims is the real-answer rate seen so far
(34 of 224 agreed rows = 15%).   python3 sml/verifier/power.py

Results (600 / 300 trials, seed 1; chance that a verifier with the stated TRUE quality clears BOTH lower bounds):
  true P 0.92 R 0.85 (barely above the gate): 300 labels 1%, 500 3%, 800 5%, 1200 12%, 2000 22%  -> unreachable by sampling alone
  true P 0.95 R 0.90:                         300 11%,  500 23%, 800 46%, 1200 74%
  true P 0.97 R 0.93 (clearly good):          300 28%,  500 61%, 800 90%, 1200 98%
So 300 labels cannot confirm even a clearly good verifier (only ~45 unsupported claims, so recall is the binding limit); about 800
labels are needed, and the current pool is 521. A NO-GO from 300 labels would also not prove the verifier is bad."""
from math import comb
import random

def lower(k, n, a=0.05):                       # exact (Clopper-Pearson) one-sided lower bound by bisection
    if k == 0: return 0.0
    lo, hi = 0.0, 1.0
    for _ in range(40):
        m = (lo + hi) / 2
        tail = sum(comb(n, i) * m**i * (1 - m)**(n - i) for i in range(k, n + 1))   # P(X >= k | p=m)
        lo, hi = (m, hi) if tail < a else (lo, m)
    return lo

def sim(N, prev=0.15, P=0.92, R=0.85, P_gate=0.90, R_gate=0.80, trials=600, seed=1):
    rnd = random.Random(seed); ok = 0
    # P: of the claims flagged unsupported, share truly unsupported. R: of truly unsupported, share flagged.
    fpr = (R * prev / P) * (1 - P) / (1 - prev)          # false-flag rate on supported claims that yields precision P
    for _ in range(trials):
        neg = sum(rnd.random() < prev for _ in range(N)); pos = N - neg
        tp = sum(rnd.random() < R for _ in range(neg)); fp = sum(rnd.random() < fpr for _ in range(pos))
        if tp and lower(tp, tp + fp) >= P_gate and lower(tp, neg) >= R_gate: ok += 1
    return ok / trials

if __name__ == "__main__":
    print("N labelled | unsupported expected | chance a truly good verifier can clear the gate")
    for N in (300, 500, 800, 1200, 2000):
        print(f"{N:>10} | {round(N*0.15):>20} | {sim(N):.0%}")
