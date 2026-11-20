"""Action ladder on top of a router decision (ROADMAP E7/E9, founder decision F3: note false alarm <= 5%, block false alarm <= 2%).

decide(decision, ladder) -> {"action": "none" | "note" | "block", "kind": "advice" | "unlawful" | None, "reason": str, "t_note": float, "t_block": float}
  * the ladder only looks at the router's PREDICTED intent: advice_seeking or evasion_request; anything else is "none"
  * note  : predicted advice_seeking / evasion_request with high-risk mass >= t_note
  * block : predicted evasion_request with mass >= t_block (a block is a refusal, so it is the narrowest level)
Thresholds live in sml/models/router/<version>/ladder.json (written by sml/training/choose_ladder.py, evidence in TRACKER E9). Without that file the
ladder is "none" for every message. Pure function, no I/O except load(); the text of a message is never read here.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LADDER_VERSION = "0.5.1"      # the router version the thresholds were chosen for; /api/route uses it when a caller asks for the ladder
_cache: dict = {}


def load(version: str = LADDER_VERSION):
    if version not in _cache:
        p = ROOT / "sml" / "models" / "router" / version / "ladder.json"
        d = json.loads(p.read_text()) if p.exists() else None
        if d is not None:
            tn, tb = d.get("t_note"), d.get("t_block")
            if not (isinstance(tn, (int, float)) and isinstance(tb, (int, float)) and 0 < tn <= tb <= 1):
                raise ValueError(f"ladder.json for {version}: need 0 < t_note <= t_block <= 1")
        _cache[version] = d
    return _cache[version]


def decide(decision, ladder=None) -> dict:
    ladder = load() if ladder is None else ladder
    base = {"action": "none", "kind": None, "reason": "no_ladder", "t_note": None, "t_block": None}
    if not ladder or not isinstance(decision, dict):
        return base
    tn, tb = float(ladder["t_note"]), float(ladder["t_block"])
    base.update(t_note=tn, t_block=tb)
    intent = decision.get("intent"); mass = decision.get("high_risk_mass")
    if intent not in ("advice_seeking", "evasion_request") or not isinstance(mass, (int, float)):
        return {**base, "reason": "not_high_risk"}
    if mass < tn:
        return {**base, "reason": "below_note"}
    if intent == "evasion_request" and mass >= tb:
        return {**base, "action": "block", "kind": "unlawful", "reason": "evasion_high_confidence"}
    return {**base, "action": "note", "kind": "advice" if intent == "advice_seeking" else "unlawful", "reason": "note"}
