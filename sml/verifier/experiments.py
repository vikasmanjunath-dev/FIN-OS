"""W2.4 cheap-variant experiments on the synthetic verifier set (no fine-tuning). Seeded, reproducible.
(a) premise selection: best sentence(s) of the evidence instead of the whole window.
(b) margin threshold: supported iff P(ent) - max(P(con), P(neu)) >= tau, tau chosen on a validation split of train.jsonl
    (carved by page group), never on test.
Also: paraphrased-entailed subset (rule-based light paraphrase, 150 rows from test) and the numeric detector OR-combination.
One process loads the NLI model (as rag-engine/generation/faithfulness.py), batches of 8, frees it. Logits are cached in
nli_logits_cache.json so the analysis re-runs without the model.  Usage: python experiments.py"""
import json, re, os, sys, gc, math, random, subprocess, hashlib
from pathlib import Path
HERE = Path(__file__).parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
SEED = 20261025
STOP = set("the a an of to in on for and or is are was were be been by with as at that this it its from which will shall may can not any all such than then their there these those has have had".split())

def load(n): return [json.loads(l) for l in open(HERE / f"{n}.jsonl")]
def toks(s): return re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", s.lower())
def content(s): return [t for t in toks(s) if t not in STOP]

# ---------- sentence split + premise selection ----------
SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\[(\"'‘“])")
def sentences(ev):
    return [s.strip() for s in SPLIT.split(ev) if s.strip()]

def build_idf(texts):
    df = {}
    for t in texts:
        for w in set(content(t)): df[w] = df.get(w, 0) + 1
    n = len(texts)
    return lambda w: math.log(1 + (n - df.get(w, 0) + 0.5) / (df.get(w, 0) + 0.5))

def rank_sentences(claim, sents, idf):
    cw = set(content(claim))
    out = []
    for i, s in enumerate(sents):
        sw = set(content(s))
        sc = sum(idf(w) for w in cw & sw) / (1 + 0.15 * math.log(1 + len(sw)))   # idf-weighted overlap, mild length norm
        out.append((sc, i))
    return sorted(out, key=lambda x: (-x[0], x[1]))

def premise(variant, claim, ev, idf):
    if variant == "full": return ev
    sents = sentences(ev)
    if len(sents) <= 1: return ev
    rk = rank_sentences(claim, sents, idf)
    i = rk[0][1]
    if variant == "top1": return sents[i]
    if variant == "top1_nbr": return " ".join(sents[max(0, i - 1): i + 2])
    if variant == "top2":
        keep = sorted([rk[0][1], rk[1][1]]) if len(rk) > 1 else [i]
        return " ".join(sents[j] for j in keep)
    raise ValueError(variant)
VARIANTS = ["full", "top1", "top1_nbr", "top2"]

# ---------- deterministic rule-based light paraphrase ----------
SYN = [(r"\bapproximately\b", "about"), (r"\bobtain\b", "get"),
       (r"\bindividuals\b", "people"), (r"\badditional\b", "extra"), (r"\bhowever\b", "but"), 
       (r"\bshall\b", "will"), (r"\bassist\b", "help"), (r"\brequire\b", "need"), (r"\brequires\b", "needs"),
       (r"\bprior to\b", "before"), (r"\bsubsequent to\b", "after"), (r"\bcommence\b", "start"), (r"\bterminate\b", "end"),
       (r"\butili[sz]e\b", "use"), (r"\bpermitted\b", "allowed"), (r"\bindicate\b", "show"), (r"\bindicates\b", "shows"),
       (r"\bprovide\b", "give"), (r"\bprovides\b", "gives"), (r"\bensure\b", "make sure"), (r"\bendeavour\b", "try"),
       (r"\bin order to\b", "to"), (r"\bapplicable\b", "relevant"), (r"\bcommonly\b", "often"), (r"\bchoose\b", "pick"), (r"\bimportant\b", "key"), (r"\bhelps\b", "assists"),
       (r"\bbegin\b", "start"), (r"\bcan be\b", "may be"), (r"\bcannot\b", "can not"), (r"\bmaintain\b", "keep"),
       (r"\bmaintains\b", "keeps"), (r"\bcustomers\b", "clients"), (r"\bcustomer\b", "client"),
       (r"\bdoes not\b", "doesn't"), (r"\bdo not\b", "don't"), (r"\bis not\b", "isn't"), (r"\bare not\b", "aren't"),
       (r"\bit is\b", "it's"), (r"\bIt is\b", "It's"), (r"\bwill not\b", "won't"),
       (r"\bregarding\b", "about"), (r"\bwith respect to\b", "regarding"), (r"\bin respect of\b", "regarding"),
       (r"\bcommunicate\b", "tell"), (r"\bnecessary\b", "needed"), (r"\bseek\b", "ask for"), (r"\bcommonly\b", "often"),
       (r"\bmajority of\b", "most of"), (r"\bnumerous\b", "many"), (r"\bsufficient\b", "enough"),
       (r"\bassistance\b", "help"), (r"\bvia\b", "through"), (r"\bthereafter\b", "after that"),
       (r"\bfurnish\b", "submit"), (r"\bfurnished\b", "submitted"), (r"\bhence\b", "so"), (r"\bthus\b", "so")]
FRONT = re.compile(r"^(.{25,}?)\s+((?:within|by|from|on|before|after|at the end of|with effect from)\s+[^,.;]{6,60}?)([.])$", re.S)
FILLER = re.compile(r"\b(also|very|actually|basically|really|essentially)\s+", re.I)
LEAD = re.compile(r"^((?:If|When|Where|Once|Unless|Although|Whenever|While|In case|In the event)\b[^,]{8,120}),\s+(.{15,})$", re.S)
TRAIL = re.compile(r"^(.{15,}?),\s+((?:if|when|where|once|unless|although|while|because)\b[^,.?!]{8,120})([.?!]?)$", re.S)
SAFE_LOWER = {"the", "it", "this", "they", "we", "you", "a", "an", "these", "those", "he", "she", "i", "there", "such", "any", "all", "each", "your", "our", "their", "its"}
def _low(x):
    w = x.split(" ", 1)[0]
    return (x[0].lower() + x[1:]) if w.lower() in SAFE_LOWER else None
def _cap(x): return x[0].upper() + x[1:]
def paraphrase(claim):
    s = claim.strip(); orig = s
    single = not re.search(r"[.!?:;]\s", s) and not re.search(r"[^\x00-\x7f]{2}", s) and not s.startswith(("(", "[")) and s[:1].isupper()
    if single:
        m = LEAD.match(s)
        if m and not re.search(r"\bnot\b|n't|\bthen\b", m.group(0)) and m.group(1).count("(") == m.group(1).count(")"):
            head, tail = m.group(1), m.group(2).rstrip()                # "If A, B." -> "B, if A."
            end = tail[-1] if tail[-1] in ".?!" else "."
            tail = tail.rstrip(".?!"); lt = _low(head)
            if tail[:1].isupper() or tail[:1].isalpha():
                lh = head[0].lower() + head[1:]
                s = _cap(tail) + ", " + lh + end
        else:
            m = TRAIL.match(s)
            if m and not re.search(r"\bnot\b|n't", m.group(0)):          # "B, if A." -> "If A, B."
                b_, a_, end = m.groups(); lb = _low(b_)
                if lb and m.group(2).count("(") == m.group(2).count(")"):
                    s = _cap(a_) + ", " + lb + (end or ".")
        if s == orig:
            m = FRONT.match(s)
            if m and re.search(r"\d", m.group(2)) and not re.match(r"by\s+\w+ing\b", m.group(2), re.I) and not re.search(r"\b(or|and|of|the|to|in|on|by|a)\s*$", m.group(2).rstrip(".")) \
               and not re.search(r"\b(or|and)\b", m.group(2)) and m.group(1).count("(") == m.group(1).count(")") and m.group(2).count("(") == m.group(2).count(")"):
                lb = _low(m.group(1))
                if lb: s = _cap(m.group(2)) + ", " + lb + "."
    s = FILLER.sub("", s)
    for pat, rep in SYN:
        new = re.sub(pat, lambda mm: rep.capitalize() if mm.group(0)[0].isupper() else rep, s)
        if new != s: s = new
    s = re.sub(r"\s+", " ", s).strip()
    return s if s != orig else None

def build_paraphrases(rows, k=None, seed=SEED):
    out = []
    for r in rows:
        if r["label"] != "entailed": continue
        p = paraphrase(r["claim"])
        if not p or p.lower() == r["claim"].lower(): continue
        if sorted(re.findall(r"\d[\d,.]*", p)) != sorted(re.findall(r"\d[\d,.]*", r["claim"])): continue
        if p in r["evidence"]: continue
        if True:
            q = dict(r); q["source_claim"] = r["claim"]; q["claim"] = p; q["change_type"] = "paraphrase"; out.append(q)
    random.Random(seed).shuffle(out)
    return out[:k] if k else out

# ---------- validation split carved from train by page group ----------
def val_split(train, frac=0.3, seed=SEED):
    pages = sorted({r["page_key"] for r in train})
    # pages sharing sentences were already grouped in train/test split; also keep claim-sharing pages together here
    parent = {p: p for p in pages}
    def f(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    by_claim = {}
    for r in train:
        if r["label"] == "unsupported": continue
        by_claim.setdefault(r["source_sentence"] or r["claim"], set()).add(r["page_key"])
    for ps in by_claim.values():
        ps = sorted(ps)
        for p in ps[1:]: parent[f(p)] = f(ps[0])
    groups = {}
    for p in pages: groups.setdefault(f(p), []).append(p)
    gl = sorted(groups.values(), key=lambda g: g[0]); random.Random(seed).shuffle(gl)
    tot = len(train); val_pages = set(); n = 0
    for g in gl:
        if n >= frac * tot: break
        val_pages |= set(g); n += sum(1 for r in train if r["page_key"] in g)
    return [r for r in train if r["page_key"] not in val_pages], [r for r in train if r["page_key"] in val_pages]

# ---------- NLI ----------
def run_nli(pairs, bs=8):
    sys.path.insert(0, str(ROOT / "rag-engine"))
    from generation.faithfulness import _get_model
    model, _ = _get_model()
    id2 = {int(k): v.lower() for k, v in model.model.config.id2label.items()}
    order = [id2[i] for i in range(3)]
    out = []
    for i in range(0, len(pairs), bs):
        sc = model.predict(pairs[i:i + bs])
        out += [[float(x) for x in s] for s in sc]
    del model; gc.collect()
    try:
        import torch; torch.mps.empty_cache()
    except Exception: pass
    return order, out

def softmax(v):
    m = max(v); e = [math.exp(x - m) for x in v]; z = sum(e); return [x / z for x in e]

def numeric_flags(rows, tag):
    p = HERE / f"_tmp_{tag}.jsonl"
    p.write_text("\n".join(json.dumps(r) for r in rows))
    js = ("const fs=require('fs'),path=require('path');const NC=require(path.resolve(process.argv[1],'js/sml/numeric-check.js'));"
          "const rows=fs.readFileSync(process.argv[2],'utf8').trim().split('\\n').map(JSON.parse);"
          "console.log(JSON.stringify(rows.map(r=>{try{return NC.check(r.claim,[r.evidence]).unmatched.length>0}catch(e){return false}})))")
    o = subprocess.run(["node", "-e", js, str(ROOT), str(p)], check=True, capture_output=True, text=True).stdout
    p.unlink()
    return json.loads(o)

# ---------- metrics ----------
def pr(flags, rows):
    tp = sum(1 for f, r in zip(flags, rows) if f and r["label"] != "entailed")
    fp = sum(1 for f, r in zip(flags, rows) if f and r["label"] == "entailed")
    fn = sum(1 for f, r in zip(flags, rows) if not f and r["label"] != "entailed")
    tn = sum(1 for f, r in zip(flags, rows) if not f and r["label"] == "entailed")
    p = tp / (tp + fp) if tp + fp else 0.0; rc = tp / (tp + fn) if tp + fn else 0.0
    return dict(precision=round(p, 4), recall=round(rc, 4), f1=round(2 * p * rc / (p + rc), 4) if p + rc else 0.0,
                entailed_false_flag_rate=round(fp / max(1, fp + tn), 4), tp=tp, fp=fp, fn=fn, tn=tn)

def margin(probs, order):   # order = label names by index
    e = order.index("entailment"); o = [i for i in range(3) if i != e]
    return probs[e] - max(probs[i] for i in o)

def wprec(flags, rows, mix=2.0):
    """precision/recall with entailed rows re-weighted so positives:negatives = mix:1 (the test mix is 2:1); val is ~3:1 or more."""
    npos = sum(r["label"] != "entailed" for r in rows); nneg = len(rows) - npos
    w = (npos / mix) / max(1, nneg)
    tp = sum(1 for f, r in zip(flags, rows) if f and r["label"] != "entailed")
    fp = w * sum(1 for f, r in zip(flags, rows) if f and r["label"] == "entailed")
    fn = sum(1 for f, r in zip(flags, rows) if not f and r["label"] != "entailed")
    p = tp / (tp + fp) if tp + fp else 0.0; rc = tp / (tp + fn) if tp + fn else 0.0
    return p, rc, (2 * p * rc / (p + rc) if p + rc else 0.0)

def choose_tau(margins, rows, min_p=0.90, mode="f1"):
    """Supported iff margin >= tau. Pick the tau with the highest recall whose (2:1 re-weighted) validation precision >= min_p;
    if none reaches it, the tau with the best weighted F1. Only validation rows are used."""
    best = None
    cands = sorted({round(m, 4) for m in margins})
    if mode == "f1":     # primary: tau maximising the 2:1-weighted F1 on validation (more central than the gate edge)
        return max((wprec([x < t for x in margins], rows)[2], t) for t in cands)[1], True
    for t in cands:      # mode "edge": highest recall with weighted precision >= min_p (sits on the gate boundary; chosen first, kept for comparison)
        p, rc, f1 = wprec([x < t for x in margins], rows)
        if p >= min_p and (best is None or rc > best[1] or (rc == best[1] and t > best[0])):
            best = (t, rc)
    if best: return best[0], True
    return max((wprec([x < t for x in margins], rows)[2], t) for t in cands)[1], False

def main():
    random.seed(SEED)
    train, test = load("train"), load("test")
    trn, val = val_split(train)
    para_test = build_paraphrases(test)                       # only ~60 of 192 test entailed rows can be rule-paraphrased
    for r in para_test: r["origin"] = "test"
    extra = build_paraphrases(trn, 150 - len(para_test), seed=SEED + 1)   # topped up from train-fit pages (disjoint from val and test, never used to pick tau)
    for r in extra: r["origin"] = "train_fit"
    n_test_para = len(para_test); para_test = para_test + extra
    para_val = build_paraphrases(val)
    para_val = para_val[:min(len(para_val), 150)]
    for name, rs in (("para_test", para_test), ("para_val", para_val)):
        (HERE / f"{name}.jsonl").write_text("\n".join(json.dumps(r, sort_keys=True) for r in rs) + "\n")
    idf = build_idf([r["evidence"] for r in train + test])   # unlabeled text statistics only
    sets = {"val": val, "test": test, "para_val": para_val, "para_test": para_test}
    cache = HERE / "nli_logits_cache.json"
    key = hashlib.sha256(json.dumps({k: [(r["claim"], r["evidence"]) for r in v] for k, v in sets.items()}).encode()).hexdigest()
    if cache.exists() and json.load(open(cache)).get("key") == key:
        c = json.load(open(cache)); order, logits = c["order"], c["logits"]
    else:
        pairs, idx = [], {}
        for sname, rs in sets.items():
            for v in VARIANTS:
                idx[f"{sname}|{v}"] = (len(pairs), len(rs))
                pairs += [(premise(v, r["claim"], r["evidence"], idf), r["claim"]) for r in rs]
        print("NLI pairs:", len(pairs), flush=True)
        order, out = run_nli(pairs)
        logits = {k: out[a:a + n] for k, (a, n) in idx.items()}
        json.dump({"key": key, "order": order, "logits": logits}, open(cache, "w"))
    probs = {k: [softmax(l) for l in v] for k, v in logits.items()}
    nf = {s: numeric_flags(sets[s], s) for s in sets}

    # test mixes: extractive (entailed from test) ; paraphrased (150 paraphrased entailed replace extractive entailed)
    neg_test = [i for i, r in enumerate(test) if r["label"] != "entailed"]
    ent_test = [i for i, r in enumerate(test) if r["label"] == "entailed"]
    neg_val = [i for i, r in enumerate(val) if r["label"] != "entailed"]
    ent_val = [i for i, r in enumerate(val) if r["label"] == "entailed"]
    res = {"seed": SEED, "label_order": order,
           "sizes": {"train_fit": len(trn), "val": len(val), "val_pages": len({r["page_key"] for r in val}), "test": len(test),
                     "para_test": len(para_test), "para_test_from_test_pages": n_test_para, "para_val": len(para_val),
                     "val_by_label": {l: sum(r["label"] == l for r in val) for l in ("entailed", "contradicted", "unsupported")}},
           "variants": {}}
    def mix(rows_neg_idx, rows_neg, ent_rows, ent_scores, neg_scores):
        rows = [rows_neg[i] for i in rows_neg_idx] + ent_rows
        return rows, neg_scores + ent_scores
    for v in VARIANTS:
        pt, pv = probs[f"test|{v}"], probs[f"val|{v}"]; ppt, ppv = probs[f"para_test|{v}"], probs[f"para_val|{v}"]
        mt, mv = [margin(p, order) for p in pt], [margin(p, order) for p in pv]
        mpt, mpv = [margin(p, order) for p in ppt], [margin(p, order) for p in ppv]
        e = order.index("entailment")
        pe_t, pe_v, pe_pt, pe_pv = [p[e] for p in pt], [p[e] for p in pv], [p[e] for p in ppt], [p[e] for p in ppv]
        out = {}
        # argmax baseline for this premise
        am = lambda ps: [max(range(3), key=lambda i: p[i]) != e for p in ps]
        ext_rows = test; para_rows = [test[i] for i in neg_test] + para_test
        def para_flags(f_test, f_para): return [f_test[i] for i in neg_test] + f_para
        out["argmax"] = {"extractive": pr(am(pt), ext_rows), "paraphrased": pr(para_flags(am(pt), am(ppt)), para_rows)}
        # tau on validation: (1) extractive val, (2) extractive+paraphrased val (honest)
        val_ext_rows = val
        t1, ok1 = choose_tau(mv, val_ext_rows); t1e, ok1e = choose_tau(mv, val_ext_rows, mode="edge")
        val_mix_rows = [val[i] for i in range(len(val)) if val[i]['label'] != 'entailed'] + para_val
        val_mix_m = [mv[i] for i in neg_val] + mpv
        t2, ok2 = choose_tau(val_mix_m, val_mix_rows)
        def at(t):
            ft = [m < t for m in mt]; fp_ = [m < t for m in mpt]
            nfl = nf["test"]; nfp = [nfl[i] for i in neg_test] + nf["para_test"]
            f_ext = ft; f_par = para_flags(ft, fp_)
            f_par0 = para_flags(ft, fp_)
            tonly = [test[i] for i in neg_test] + para_test[:n_test_para]
            return {"tau": t, "paraphrased_test_pages_only": pr([ft[i] for i in neg_test] + fp_[:n_test_para], tonly), "extractive": pr(f_ext, ext_rows), "paraphrased": pr(f_par, para_rows),
                    "extractive_plus_numeric": pr([a or b for a, b in zip(f_ext, nfl)], ext_rows),
                    "paraphrased_plus_numeric": pr([a or b for a, b in zip(f_par, nfp)], para_rows)}
        out["tau_edge_rule_val_extractive"] = at(t1e); out["tau_edge_rule_val_extractive"]["reached_p090_on_val"] = ok1e
        out["tau_val_extractive"] = dict(at(t1), reached_p090_on_val=ok1, val_metrics=pr([m < t1 for m in mv], val))
        out["tau_val_mixed"] = dict(at(t2), reached_p090_on_val=ok2, val_metrics=pr([m < t2 for m in val_mix_m], val_mix_rows))
        # PR curve on test at 6 fixed thresholds on the margin, extractive and paraphrased mixes
        out["pr_curve_margin"] = []
        for t in (-0.9, -0.5, 0.0, 0.5, 0.9, 0.99):
            out["pr_curve_margin"].append({"tau": t, "extractive": pr([m < t for m in mt], ext_rows),
                                           "paraphrased": pr(para_flags([m < t for m in mt], [m < t for m in mpt]), para_rows)})
        # alternative: threshold on P(entailment) chosen on val
        t3, ok3 = choose_tau(pe_v, val)
        out["p_entail_threshold"] = {"tau": t3, "reached_p090_on_val": ok3, "extractive": pr([x < t3 for x in pe_t], ext_rows),
                                      "paraphrased": pr(para_flags([x < t3 for x in pe_t], [x < t3 for x in pe_pt]), para_rows)}
        out["entailed_supported_rate"] = {"extractive_at_tau_val": round(sum(m >= t1 for m in mt) / len(mt) * 0 + sum(m >= t1 for m in [mt[i] for i in ent_test]) / len(ent_test), 4),
                                          "paraphrased_at_tau_val": round(sum(m >= t1 for m in mpt) / len(mpt), 4)}
        res["variants"][v] = out
    # premise-selector sanity: how often does top1 equal the true source sentence (extractive test entailed)
    hit = 0; hitp = 0
    for r in test:
        if r["label"] != "entailed": continue
        s = sentences(r["evidence"]); 
        if not s: continue
        hit += r["claim"] in premise("top1", r["claim"], r["evidence"], idf)
    for r in para_test:
        s = sentences(r["evidence"])
        hitp += r["source_claim"] in premise("top1", r["claim"], r["evidence"], idf)
    res["selector_top1_contains_source"] = {"extractive_entailed_test": f"{hit}/{len(ent_test)}", "paraphrased": f"{hitp}/{len(para_test)}"}
    (HERE / "experiments_results.json").write_text(json.dumps(res, indent=2))
    print(json.dumps({v: {"argmax_ext": d["argmax"]["extractive"]["precision"], "tau": d["tau_val_extractive"]["tau"],
                          "ext": [d["tau_val_extractive"]["extractive"]["precision"], d["tau_val_extractive"]["extractive"]["recall"]],
                          "par": [d["tau_val_extractive"]["paraphrased"]["precision"], d["tau_val_extractive"]["paraphrased"]["recall"]]}
                      for v, d in res["variants"].items()}, indent=1))
    print(res["selector_top1_contains_source"], res["sizes"])

if __name__ == "__main__":
    main()
