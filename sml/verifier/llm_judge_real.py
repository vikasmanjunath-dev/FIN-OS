"""
W2.6: local LLM as the verifier. For every real claim, ask a local Ollama model whether the claim is fully supported by the
evidence windows the generator saw. Resumable (appends to llm_judge_<model>.jsonl). Then scores against the agreed labels.
    rag-engine/.venv/bin/python sml/verifier/llm_judge_real.py [model]      # default qwen3:8b
temperature 0, think off, one-word verdict. The prompt mirrors the annotators' instructions (no outside knowledge, strict on numbers).
"""
import json, re, sys, time, collections
from pathlib import Path
import httpx
HERE = Path(__file__).resolve().parent
MODEL = sys.argv[1] if len(sys.argv) > 1 else "qwen3:8b"
MODE = sys.argv[2] if len(sys.argv) > 2 else "oneword"      # oneword | decomp
TAG = MODEL.replace(":", "_") + ("" if MODE == "oneword" else "_" + MODE)
OUT = HERE / f"llm_judge_{TAG}.jsonl"
rows = [json.loads(l) for l in open(HERE / "real_claims_raw.jsonl")]
PROMPT = """You are a strict fact-checker. Decide whether the CLAIM is supported by the EVIDENCE only. Use no outside knowledge.
SUPPORTED = every factual element of the claim (numbers, names, conditions, direction such as allowed vs not allowed, scope) is stated or directly implied by the evidence.
CONTRADICTED = the evidence states something incompatible with the claim (different number, opposite direction, different entity, a number attached to the wrong thing).
UNSUPPORTED = the evidence does not contain enough to confirm the claim, or covers only part of it, and does not contradict it.
Be strict about numbers and conditions: a number taken from a neighbouring sentence about something else is not support.

EVIDENCE:
{ev}

CLAIM: {claim}

Answer with exactly one word: SUPPORTED, CONTRADICTED or UNSUPPORTED."""

PROMPT_DECOMP = """You are a strict fact-checker. Use ONLY the EVIDENCE, no outside knowledge.
Step 1: list every separate factual element of the CLAIM (each number, name, condition, direction such as allowed/not allowed, and any scope word like 'all' or 'only').
Step 2: for each element say FOUND (stated or directly implied in the evidence), WRONG (the evidence says something different) or MISSING (not in the evidence).
Step 3: final line exactly 'VERDICT: SUPPORTED' (all FOUND), 'VERDICT: CONTRADICTED' (any WRONG) or 'VERDICT: UNSUPPORTED' (none WRONG but any MISSING).
Be strict: an element taken from a neighbouring sentence about something else is MISSING or WRONG. Keep the whole answer under 90 words.

EVIDENCE:
{ev}

CLAIM: {claim}"""
if MODE == "decomp": PROMPT = PROMPT_DECOMP
NUM_PREDICT = 6 if MODE == "oneword" else 160
done = {}
if OUT.exists():
    for l in open(OUT): r = json.loads(l); done[r["idx"]] = r
with open(OUT, "a") as fh:
    for i, r in enumerate(rows):
        if i in done: continue
        ev = "\n\n".join(f"[{k+1}] {e['title']}\n{e['text'].strip('… ')}" for k, e in enumerate(r["evidence"]))
        t0 = time.time()
        try:
            resp = httpx.post("http://localhost:11434/api/generate", json={"model": MODEL, "prompt": PROMPT.format(ev=ev, claim=r["claim"]), "stream": False, "think": False,
                              "options": {"temperature": 0, "num_predict": NUM_PREDICT}}, timeout=300).json()["response"]
        except Exception as e:
            resp = f"ERROR {e}"
        m = re.search(r"SUPPORTED|CONTRADICTED|UNSUPPORTED", resp.upper())
        # 'UNSUPPORTED' contains 'SUPPORTED': take the longest/first real token
        txt = resp.upper()
        if MODE == "decomp":
            mm = re.findall(r"VERDICT:\s*(SUPPORTED|CONTRADICTED|UNSUPPORTED)", txt)
            txt = mm[-1] if mm else "ERROR"
        verdict = "unsupported" if "UNSUPPORTED" in txt else ("contradicted" if "CONTRADICTED" in txt else ("supported" if "SUPPORTED" in txt else "error"))
        rec = {"idx": i, "verdict": verdict, "raw": resp[-60:], "sec": round(time.time() - t0, 1)}
        fh.write(json.dumps(rec) + "\n"); fh.flush()
        if i % 20 == 0: print(i, verdict, rec["sec"], flush=True)

# ---- score
def labels(*names):
    d = {}
    for n in names:
        for l in open(HERE / n): x = json.loads(l); d[x["idx"]] = x["label"]
    return d
LA, LB = labels("labels_A1.jsonl", "labels_A2.jsonl"), labels("labels_B1.jsonl", "labels_B2.jsonl")
J = {json.loads(l)["idx"]: json.loads(l) for l in open(OUT)}
agree = [i for i in range(len(rows)) if LA[i] == LB[i]]
def prf(idxs, gold):
    flag = {i: J[i]["verdict"] != "supported" for i in idxs}
    tp = sum(flag[i] and gold(i) for i in idxs); fp = sum(flag[i] and not gold(i) for i in idxs)
    fn = sum((not flag[i]) and gold(i) for i in idxs); tn = sum((not flag[i]) and not gold(i) for i in idxs)
    return {"precision": round(tp / max(1, tp + fp), 3), "recall": round(tp / max(1, tp + fn), 3), "false_flag_rate": round(fp / max(1, fp + tn), 3), "tp": tp, "fp": fp, "fn": fn, "tn": tn}
res = {"model": MODEL, "mode": MODE, "n": len(rows), "errors": sum(1 for j in J.values() if j["verdict"] == "error"), "median_sec": sorted(j["sec"] for j in J.values())[len(J) // 2],
       "agreed": prf(agree, lambda i: LA[i] != "supported"), "labeler_A": prf(range(len(rows)), lambda i: LA[i] != "supported"), "labeler_B": prf(range(len(rows)), lambda i: LB[i] != "supported"),
       "verdict_counts": dict(collections.Counter(j["verdict"] for j in J.values()))}
(HERE / f"llm_judge_{TAG}_results.json").write_text(json.dumps(res, indent=1)); print(json.dumps(res, indent=1))
