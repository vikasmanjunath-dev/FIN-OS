"""Export the TF-IDF head of a router version without pickle (ROADMAP C21).
    rag-engine/.venv/bin/python sml/training/export_tfidf.py 0.4.1 [--dtype float32]
Writes sml/models/router/<ver>/tfidf_head.json + tfidf_head.npz (small, trackable; the joblib stays git-ignored)."""
import argparse, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sml" / "runtime"))
from tfidf_head import export_head  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument("version"); ap.add_argument("--dtype", default="float32"); a = ap.parse_args()
d = ROOT / "sml" / "models" / "router" / a.version
print(export_head(d / "tfidf_lr.joblib", d, a.dtype))
