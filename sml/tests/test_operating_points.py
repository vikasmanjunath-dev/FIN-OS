import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "training"))
import operating_points as O

def test_table_counts_and_monotonic():
    rows = [(True, True, 0.9)] * 6 + [(True, False, 0.3)] * 4 + [(False, False, 0.05)] * 80 + [(False, False, 0.4)] * 20
    t = {r["threshold"]: r for r in O.table(rows, 0.1)}
    assert t[0.3]["recall"] == 1.0 and t[0.35]["recall"] == 0.6 and t[0.5]["recall"] == 0.6
    assert t[0.35]["false_alarm"] == 0.2 and t[0.5]["false_alarm"] == 0.0
    assert t[0.35]["harmless_refused_per_10k"] == 1800 and t[0.5]["risky_missed_per_10k"] == 400.0
    fa = [r["false_alarm"] for r in O.table(rows)]; assert fa == sorted(fa, reverse=True)
