"""PULSE offline replay harness (G2): how would a learned ranker have done on LOGGED renders? Offline only; nothing in the app reads or writes these logs.
    rag-engine/.venv/bin/python sml/tools/pulse/replay.py --log events.jsonl [--k 5] [--eps 0.1] [--seed 1]
    rag-engine/.venv/bin/python sml/tools/pulse/replay.py --synthetic            # self-check on a SYNTHETIC log with a known best widget (not a result about FIN-OS)

LOG FORMAT (offline only; the app's own counters, js/sml/pulse-counters.js, are aggregates and cannot be replayed): one JSON object per PULSE render
  {"v":1, "day":"2026-10-26", "rule_order":[ids best-first, pinned ones included] | "ctx":{...inputs of AryaPulseRank.rank...},
   "featured":"taxDashboard",   # the widget shown in the FIRST NON-PINNED slot
   "propensity":0.28,           # probability the logging policy had of showing exactly that widget there (needed for any off-policy estimate)
   "tap":1}                     # 1 if the person tapped that widget during the view, else 0
Why propensities: a deterministic logging policy (the rule ranker alone) shows the same thing every time, so what a DIFFERENT order would have earned cannot be estimated from it.
A future live use therefore needs a small, flagged amount of randomisation (epsilon-greedy over the rule ranker's top-K) that logs the propensity.

POLICIES (all act on the rule ranker's order and respect its safety net):
  rule            the rule ranker as it is today (js/arya-pulse-rank.js): featured = first non-pinned widget of its order
  epsgreedy(eps)  with prob 1-eps the widget with the best tap rate so far, with prob eps a random one of the top-K
  thompson        Beta(1+taps, 1+misses) sample per candidate, best sample wins
  SAFETY NET      candidates are only the rule ranker's top-K non-pinned widgets (never promotes anything it ranks lower); PINNED widgets stay where the rule ranker put them;
                  no widget moves down more than `max_shift` places and the rule's first non-pinned widget never falls below position `floor` of the non-pinned list.
                  check_order() verifies every proposed order; violations must be zero.
ESTIMATORS (with 95% bootstrap intervals): IPS and self-normalised IPS (SNIPS) for a frozen policy; sequential REPLAY (Li et al. 2011) for a learning bandit, valid only when the logging
policy was uniform over the candidates (the harness checks propensities against 1/K and says when it is not). `support` = share of events where the policy would have shown what was logged;
with low support the estimate is reported as NOT IDENTIFIABLE instead of a number.

GATE FOR ANY FUTURE LIVE USE (written now, not met by anything): (1) >= 1,000 randomised renders logged by a flagged, default-off epsilon-greedy over the rule top-K with propensities, from real people who opted in;
(2) on a time-ordered split (learn on the first part, evaluate frozen on the last part) the SNIPS uplift of the learned policy over the rule policy has a 95% interval entirely above 0, with support >= 30%;
(3) check_order() reports 0 violations on every evaluated render; (4) the rule ranker stays the fallback and a one-line rollback exists; (5) the founder approves. Until then the ranker stays rule-based."""
from __future__ import annotations
import argparse, json, math, random, subprocess
from collections import defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
PINNED = ["crossPageHUD", "smartInsightCards"]          # same as AryaPulseRank.PINNED (checked by a test)


# ── safety net ────────────────────────────────────────────────────────────────────────────────────────────────────
def non_pinned(order, pinned=PINNED): return [w for w in order if w not in pinned]


def candidates(rule_order, k=5, pinned=PINNED): return non_pinned(rule_order, pinned)[:k]


def build_order(featured, rule_order, pinned=PINNED):
    """The full order a policy proposes: pinned widgets exactly where the rule ranker put them, `featured` in the first non-pinned slot, everyone else in rule order."""
    pos = [i for i, w in enumerate(rule_order) if w not in pinned]
    rest = [w for w in non_pinned(rule_order, pinned) if w != featured]; new_np = ([featured] if featured in rule_order else []) + rest
    out = list(rule_order)
    for i, w in zip(pos, new_np): out[i] = w
    return out


def check_order(order, rule_order, k=5, floor=2, max_shift=1, pinned=PINNED):
    """Violations of the safety net (list of strings; empty = fine)."""
    v = []
    if sorted(order) != sorted(rule_order): v.append("not a permutation of the rule order")
    for i, w in enumerate(rule_order):
        if w in pinned and (i >= len(order) or order[i] != w): v.append(f"pinned widget {w} moved")
    np_rule, np_new = non_pinned(rule_order, pinned), non_pinned(order, pinned)
    if np_new and np_new[0] not in np_rule[:k]: v.append("featured widget is outside the rule ranker's top-K")
    for w in np_rule:
        if w in np_new and np_new.index(w) - np_rule.index(w) > max_shift: v.append(f"{w} demoted by more than {max_shift}")
    if np_rule and np_rule[0] in np_new and np_new.index(np_rule[0]) >= floor: v.append("rule's first widget fell below the floor")
    return v


# ── policies ──────────────────────────────────────────────────────────────────────────────────────────────────────
class Rule:
    name = "rule"
    def choose(self, rule_order, rnd=None): return candidates(rule_order, 1)[0] if non_pinned(rule_order) else None
    def update(self, widget, reward): pass


class EpsGreedy:
    def __init__(self, eps=0.1, k=5): self.eps, self.k, self.s, self.n = eps, k, defaultdict(int), defaultdict(int); self.name = f"epsgreedy({eps})"
    def rate(self, w): return (self.s[w] + 1) / (self.n[w] + 2)
    def choose(self, rule_order, rnd=None):
        c = candidates(rule_order, self.k); rnd = rnd or random
        if not c: return None
        return rnd.choice(c) if rnd.random() < self.eps else max(c, key=lambda w: (self.rate(w), -c.index(w)))
    def update(self, widget, reward): self.n[widget] += 1; self.s[widget] += int(reward)


class Thompson:
    def __init__(self, k=5): self.k, self.s, self.n = k, defaultdict(int), defaultdict(int); self.name = "thompson"
    def choose(self, rule_order, rnd=None):
        c = candidates(rule_order, self.k); rnd = rnd or random
        return max(c, key=lambda w: (rnd.betavariate(1 + self.s[w], 1 + self.n[w] - self.s[w]), -c.index(w))) if c else None
    def update(self, widget, reward): self.n[widget] += 1; self.s[widget] += int(reward)


class Greedy(EpsGreedy):
    """Frozen after training: always the best tap rate among the top-K."""
    def __init__(self, k=5): super().__init__(0.0, k); self.name = "greedy(frozen)"


# ── log handling ──────────────────────────────────────────────────────────────────────────────────────────────────
def load_log(path):
    rows = [json.loads(l) for l in Path(path).read_text(encoding="utf-8").splitlines() if l.strip()]
    need_ctx = [r for r in rows if "rule_order" not in r and "ctx" in r]
    if need_ctx:                                      # ask the REAL rule ranker (js/arya-pulse-rank.js) for the orders
        js = "const R=require(process.argv[1]);const c=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(c.map(x=>R.rank(x).map(y=>y.id))));"
        orders = json.loads(subprocess.run(["node", "-e", js, str(ROOT / "js" / "arya-pulse-rank.js")], input=json.dumps([r["ctx"] for r in need_ctx]), capture_output=True, text=True, check=True).stdout)
        for r, o in zip(need_ctx, orders): r["rule_order"] = o
    return [r for r in rows if r.get("rule_order") and r.get("featured") and 0 < float(r.get("propensity", 0)) <= 1 and r.get("tap") in (0, 1)]


def boot_ci(vals, stat, n=1000, seed=0):
    rnd = random.Random(seed); out = []
    for _ in range(n):
        s = [vals[rnd.randrange(len(vals))] for _ in vals]; out.append(stat(s))
    out.sort(); return [round(out[int(.025 * n)], 4), round(out[int(.975 * n) - 1], 4)]


def ips_terms(rows, policy, k=5):
    """per-event (weight, reward): weight = 1[policy would show what was logged] / propensity (policy deterministic: Rule or Greedy)."""
    t = []
    for r in rows:
        a = policy.choose(r["rule_order"]); t.append((1.0 / r["propensity"] if a == r["featured"] else 0.0, r["tap"]))
    return t


def ips(terms): return sum(w * x for w, x in terms) / len(terms) if terms else None
def snips(terms): sw = sum(w for w, _ in terms); return sum(w * x for w, x in terms) / sw if sw else None


def estimate(rows, policy, min_support=30):
    t = ips_terms(rows, policy); support = sum(1 for w, _ in t if w > 0)
    if support < min_support: return {"policy": policy.name, "n": len(rows), "support_events": support, "identifiable": False, "note": f"only {support} logged events agree with this policy (need {min_support}): NOT IDENTIFIABLE from this log"}
    return {"policy": policy.name, "n": len(rows), "support_events": support, "support": round(support / len(rows), 4), "identifiable": True, "ips": round(ips(t), 4), "snips": round(snips(t), 4),
            "snips_ci95": boot_ci(t, lambda s: snips(s) or 0.0)}


def uniform_logging(rows, k=5, tol=0.05):
    return all(abs(r["propensity"] - 1 / max(1, len(candidates(r["rule_order"], k)))) <= tol for r in rows)


def replay(rows, policy, k=5, seed=0):
    """Li et al. 2011 replay: the policy proposes, a matching logged event counts and teaches it. Unbiased only for uniform logging."""
    rnd = random.Random(seed); matched = hits = 0; viol = 0
    for r in rows:
        a = policy.choose(r["rule_order"], rnd)
        if a is None: continue
        viol += len(check_order(build_order(a, r["rule_order"]), r["rule_order"], k))
        if a == r["featured"]: matched += 1; hits += r["tap"]; policy.update(a, r["tap"])
    return {"policy": policy.name, "matched": matched, "tap_rate": round(hits / matched, 4) if matched else None, "safety_violations": viol}


def evaluate(rows, k=5, eps=0.1, seed=1, split=0.5):
    """Time-ordered: learn on the first part by replay, freeze, compare with the rule policy on the last part (SNIPS, paired bootstrap)."""
    rows = list(rows); cut = int(len(rows) * split); train, test = rows[:cut], rows[cut:]
    res = {"events": len(rows), "train": len(train), "test": len(test), "logging_is_uniform_over_top_k": uniform_logging(rows, k)}
    if not res["logging_is_uniform_over_top_k"]: res["warning"] = "logging was not uniform over the top-K: sequential replay is biased here; only the IPS/SNIPS numbers are meaningful"
    learners = {"epsgreedy": EpsGreedy(eps, k), "thompson": Thompson(k)}
    res["replay_on_train"] = {n: replay(train, p, k, seed) for n, p in learners.items()}
    frozen = {}
    for n, p in learners.items():
        g = Greedy(k); g.s, g.n = p.s, p.n; g.name = f"{n}->greedy(frozen)"; frozen[n] = g
    res["rule_on_test"] = estimate(test, Rule())
    res["learned_on_test"] = {n: estimate(test, g) for n, g in frozen.items()}
    res["uplift_vs_rule_on_test"] = {}
    for n, g in frozen.items():
        a, b = ips_terms(test, Rule()), ips_terms(test, g)
        if res["rule_on_test"]["identifiable"] and res["learned_on_test"][n]["identifiable"]:
            d = [(wb * xb - wa * xa) for (wa, xa), (wb, xb) in zip(a, b)]
            res["uplift_vs_rule_on_test"][n] = {"ips_diff": round(sum(d) / len(d), 4), "ci95": boot_ci(d, lambda s: sum(s) / len(s)), "interval_above_zero": boot_ci(d, lambda s: sum(s) / len(s))[0] > 0}
        else: res["uplift_vs_rule_on_test"][n] = {"identifiable": False}
    res["gate_for_live_use"] = {"randomised_renders_needed": 1000, "have": len(rows), "met": False, "why": "no real randomised log exists; this harness has only been run on synthetic logs" if len(rows) < 1000 else "needs the checks in the module docstring"}
    return res


def from_counters(stats):
    """What the app's own counters (js/sml/pulse-counters.js) CAN say: tap rate per widget with a Wilson interval. No off-policy estimate is possible from aggregates."""
    def wilson(k, n, z=1.96):
        if not n: return [0.0, 1.0]
        p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
        return [round(max(0, c - h), 4), round(min(1, c + h), 4)]
    out = {}
    for w, c in (stats.get("widgets") or {}).items():
        if c.get("imp"): out[w] = {"impressions": c["imp"], "taps": c["tap"], "tap_rate": round(c["tap"] / c["imp"], 4), "wilson95": wilson(c["tap"], c["imp"]), "avg_position": round(c["pos_sum"] / c["imp"], 2)}
    return {"widgets": out, "note": "aggregates only: they show which widgets get tapped, not what a different order would have earned (needs propensity-logged renders)"}


# ── synthetic log with a KNOWN best widget (self-check only) ─────────────────────────────────────────────────────────
def synthetic_log(n=4000, k=5, eps=0.5, seed=0, best="debtFreedomPlanner", true_rates=None):
    rnd = random.Random(seed); order = PINNED + ["moneyScore", "taxDashboard", "debtFreedomPlanner", "goalCards", "savingsRateMeter", "newsWidget"]
    rates = true_rates or {"moneyScore": 0.06, "taxDashboard": 0.09, "debtFreedomPlanner": 0.30, "goalCards": 0.10, "savingsRateMeter": 0.05}
    cand = candidates(order, k); rows = []
    for i in range(n):
        # logging policy: with prob eps uniform over the top-K, else the rule's choice -> every top-K widget has propensity >= eps/K, the rule's one has 1-eps+eps/K
        a = rnd.choice(cand) if rnd.random() < eps else cand[0]
        p = eps / len(cand) + ((1 - eps) if a == cand[0] else 0.0)
        rows.append({"v": 1, "day": "2026-01-01", "rule_order": order, "featured": a, "propensity": round(p, 6), "tap": int(rnd.random() < rates[a])})
    return rows, rates


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--log"); ap.add_argument("--synthetic", action="store_true"); ap.add_argument("--k", type=int, default=5); ap.add_argument("--eps", type=float, default=0.1); ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    if a.synthetic: rows, rates = synthetic_log(k=a.k); print("SYNTHETIC log: true tap rates", rates)
    elif a.log: rows = load_log(a.log)
    else: ap.error("give --log or --synthetic")
    print(json.dumps(evaluate(rows, a.k, a.eps, a.seed), indent=1))
