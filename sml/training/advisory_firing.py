"""Which messages would the soft router advisory (E8) fire on? Measured on the held-out sets with the SHIPPED rule, nothing tuned.
    rag-engine/.venv/bin/python sml/training/advisory_firing.py [version ...]      (default 0.4.1 0.5.1)
Fires when the router predicts advice_seeking with needs_guard AND the regex guard (js/arya-guardrails.js, run through node) does not flag the message.
Output: sml/eval/advisory_firing.json (counts by set and gold intent, plus the benign messages it fires on, for reading the wording against real false alarms)."""
import json, subprocess, sys
from collections import Counter, defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; D = ROOT / "sml" / "data"
sys.path.insert(0, str(ROOT / "sml" / "runtime")); sys.path.insert(0, str(D))
from router_predict import predict  # noqa: E402

versions = sys.argv[1:] or ["0.4.1", "0.5.1"]
SETS = ["test_v5", "test_v6", "test_v7", "test_v8"]
rows = [dict(json.loads(l), set=s) for s in SETS for l in (D / f"{s}.jsonl").read_text().splitlines() if l.strip()]
js = "const G=require(process.argv[1]);const t=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(t.map(x=>G.apply(x,'').flags)));"
flags = json.loads(subprocess.run(["node", "-e", js, str(ROOT / "js" / "arya-guardrails.js")], input=json.dumps([r["text"] for r in rows]), capture_output=True, text=True, check=True).stdout)
out = {"rule": "router intent == advice_seeking and needs_guard and the regex guard did not flag", "sets": SETS, "n": len(rows), "versions": {}}
for v in versions:
    dec = [predict(r["text"], v) for r in rows]
    fire = [d["intent"] == "advice_seeking" and d["needs_guard"] and not (set(f) & {"advice_requested", "evasion_request"}) for d, f in zip(dec, flags)]
    by = defaultdict(lambda: [0, 0])
    for r, f in zip(rows, fire): by[r["intent"]][0] += 1; by[r["intent"]][1] += int(f)
    benign = [(r, f) for r, f in zip(rows, fire) if r["risk"] != "high"]
    adv = [(r, f) for r, f in zip(rows, fire) if r["intent"] == "advice_seeking"]
    regex_already = sum(1 for r, f_, f in zip(rows, flags, fire) if r["intent"] == "advice_seeking" and (set(f_) & {"advice_requested", "evasion_request"}))
    fired_benign = [r for r, f in benign if f]
    out["versions"][v] = {"fires_total": sum(fire), "fires_on_gold_advice_seeking": f"{sum(f for r, f in adv)}/{len(adv)}", "gold_advice_already_flagged_by_regex": regex_already,
                          "fires_on_benign_messages": f"{len(fired_benign)}/{len(benign)} = {100 * len(fired_benign) / len(benign):.1f}%",
                          "fires_on_evasion_gold": sum(1 for r, f in zip(rows, fire) if r["intent"] == "evasion_request" and f),
                          "benign_fires_by_gold_intent": dict(Counter(r["intent"] for r in fired_benign).most_common()),
                          "per_set_benign_fire_rate": {s: f"{sum(1 for r, f in benign if f and r['set'] == s)}/{sum(1 for r, f in benign if r['set'] == s)}" for s in SETS},
                          "benign_examples": [r["text"] for r in fired_benign[:25]]}
    print(v, json.dumps({k: x for k, x in out["versions"][v].items() if k != "benign_examples"}, ensure_ascii=False))
(ROOT / "sml" / "eval" / "advisory_firing.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
