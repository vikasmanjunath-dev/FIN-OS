"""Synthetic claim-vs-evidence generator (W2.1). Deterministic, seeded.
Reads sml/verifier/chunks_cache.jsonl (made by dump_chunks.py from a READ-ONLY Qdrant scroll),
or scrolls Qdrant itself if the cache is missing. Writes train.jsonl, test.jsonl, MANIFEST.json.
Labels are exact by construction (see REPORT.md for what that does and does not mean)."""
import json, re, random, hashlib, collections, sys
from pathlib import Path

HERE = Path(__file__).parent
SEED = 20261025
PER_CLASS = 1200
EV_CHARS = 600
STOP = set("the a an of to in on for and or is are was were be been by with as at from that this it its which shall will may can not any all such under per into than their there these those has have had also but if then so we you your he she they them his her our do does done".split())

def load_chunks():
    p = HERE / "chunks_cache.jsonl"
    if not p.exists():
        import dump_chunks  # noqa
    return [json.loads(l) for l in open(p)]

TAG = re.compile(r"<[^>]+>")
MD = re.compile(r"[*_`#|>]+")
WS = re.compile(r"\s+")
SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")

PAGE = re.compile(r"\[PAGE \d+\]")
def clean(s):
    s = PAGE.sub(" ", s)
    return WS.sub(" ", MD.sub(" ", TAG.sub(" ", s))).strip()

def words(s): return re.findall(r"[A-Za-z0-9]+", s)

def content(s): return {w.lower() for w in words(s) if w.lower() not in STOP and len(w) > 2}

def jacc(a, b):
    return len(a & b) / max(1, len(a | b))

def good_sentence(s):
    w = s.split()
    if not (8 <= len(w) <= 60): return False
    if not s[-1] in ".!?": return False
    letters = sum(c.isalpha() and c.isascii() for c in s)
    if letters / len(s) < 0.6: return False
    if s.count("?") or s.endswith("?"): return False
    if re.search(r"\b(?:Rs|No|Nos|Sr|Dr|Mr|Ms|Cr|approx|vs|etc)\.$", s): return False  # abbreviation, sentence is cut
    if not re.match(r"[A-Z0-9(\"'\u201c\u2018]", s): return False          # begins mid-word/fragment
    if re.search(r"(?:\s|^)(?:[a-zA-Z]|\d{1,2}|[ivxIVX]{1,4})\.$", s): return False  # trailing list marker
    return True

def sentences_in(evidence):
    """sentences fully inside the evidence window (a final sentence cut by the window is dropped)"""
    parts = SPLIT.split(evidence)
    out = []
    for k, p in enumerate(parts):
        if k == 0 and not re.match(r"[A-Z(\"'\u201c\u2018]", evidence): continue   # chunk begins mid-sentence
        p = p.strip()
        if good_sentence(p) and p in evidence:
            out.append(p)
    return out

# ---------- perturbations ----------
NUM = re.compile(r"(?<![\w.])(\d(?:[\d,]*\d)?(?:\.\d+)?)(?![\w])")
def num_type(s, m):
    before = s[max(0, m.start() - 22):m.start()].lower()
    after = s[m.end():m.end() + 14].lower()
    if after.startswith("%") or after.startswith(" per cent") or after.startswith(" percent"): return "percent"
    if re.search(r"(rs\.?|₹|inr)\s*$", before) or re.match(r"\s*(lakh|crore|lakhs|crores)", after): return "rupee"
    if re.search(r"(section|sections|clause|regulation|rule|article|para|paragraph)\s*$", before): return "section"
    v = m.group(1).replace(",", "")
    if re.fullmatch(r"(19|20)\d\d", v): return "year"
    if re.match(r"\s*(year|years|month|months|days)", after): return "years"
    return "other"

def fmt_like(orig, val):
    dec = len(orig.split(".")[1]) if "." in orig else 0
    if "," in orig and dec == 0:
        return f"{int(round(val)):,}"
    return f"{val:.{dec}f}" if dec else str(int(round(val)))

def perturb_number(s, ev, rng):
    ms = [m for m in NUM.finditer(s)]
    rng.shuffle(ms)
    for m in ms:
        raw = m.group(1)
        try: v = float(raw.replace(",", ""))
        except ValueError: continue
        t = num_type(s, m)
        pre = s[max(0, m.start() - 1):m.start()]; post = s[m.end():m.end() + 2]
        near = s[max(0, m.start() - 14):m.start()].lower()
        if m.start() < 3: continue                                          # sentence-initial numbers are list/page labels
        if raw.startswith("0") and "." not in raw: continue                 # zero-padded labels (07, 02)
        if re.match(r"0\d", raw): continue
        if pre in ("(", "/", "-", ".", "\u2013") or post[:1] in (")", "/") or post[:2] == ". " and t == "other": continue
        if re.search(r"(figure|fig\.?|table|q\.?|step|level|law|page|no\.?|sec-|layer_?|annex\w*|chapter|part|item|serial)\s*$", near): continue
        if t == "other" and "." not in raw and "," not in raw:
            if not re.match(r"\s+[a-z]", s[m.end():m.end() + 3]): continue   # bare ints only when a lowercase count noun follows
        if t == "other" and v < 2: continue
        cands = []
        if t == "year":
            cands = [v + d for d in (-5, -3, -2, -1, 1, 2, 3, 5)]
        elif t == "section":
            if v == 0: continue
            cands = [v + d for d in (-3, -2, -1, 1, 2, 3, 5)]
        elif t == "percent":
            cands = [v * 2, v * 1.5, v * 0.5, v * 0.75, v * 1.25, v + 1, v + 2, v - 1]
        else:
            cands = [v * 2, v * 1.5, v * 0.5, v * 0.75, v * 1.25, v * 1.3]
        rng.shuffle(cands)
        for c in cands:
            if c <= 0: continue
            if "." not in raw and t not in ("percent",) and abs(c - round(c)) > 1e-9:
                c = round(c)
            new = fmt_like(raw, c)
            if new == raw or new.replace(",", "") == raw.replace(",", ""): continue
            if new in ev or new.replace(",", "") in ev.replace(",", ""): continue  # never produce a number the evidence has
            out = s[:m.start()] + new + s[m.end():]
            return out, "number", f"{t}:{raw}->{new}"
    return None

POL = [("not allowed", "allowed"), ("allowed", "not allowed"), ("increase", "decrease"), ("increased", "decreased"),
       ("increases", "decreases"), ("decrease", "increase"), ("decreased", "increased"), ("higher", "lower"), ("lower", "higher"),
       ("before", "after"), ("after", "before"), ("old regime", "new regime"), ("new regime", "old regime"),
       ("mandatory", "optional"), ("optional", "mandatory"), ("permitted", "prohibited"), ("prohibited", "permitted"),
       ("exceed", "fall below"), ("above", "below"), ("below", "above"), ("eligible", "ineligible"), ("taxable", "tax-free")]
def perturb_polarity(s, ev, rng):
    opts = POL[:]
    rng.shuffle(opts)
    for a, b in opts:
        m = re.search(r"(?<![\w-])" + re.escape(a) + r"(?![\w-])", s, re.I)
        if not m: continue
        if a == "allowed" and re.search(r"not\s+$", s[:m.start()], re.I): continue
        w = m.group(0)
        rep = b.capitalize() if w[0].isupper() else b
        out = s[:m.start()] + rep + s[m.end():]
        if out != s: return out, "polarity", f"{w}->{rep}"
    return None

AUX = re.compile(r"\b(is|are|shall|must|may|can|will|was|were|has|have|does|do|should)\b")
def perturb_negation(s, ev, rng):
    if re.search(r"\b(not|no|never|neither|nor|without|cannot)\b|n[\u2019']t\b", s, re.I): return None
    m = AUX.search(s)
    if not m: return None
    if re.match(r"\s+(?:i|we|you|he|she|it|they|the|a|an|this|that|these|those)\b", s[m.end():], re.I): return None  # inverted order -> ungrammatical
    if m.group(0) in ("have", "has") and re.match(r"\s+been\b", s[m.end():]): return None
    out = s[:m.end()] + " not" + s[m.end():]
    return out, "negation", f"{m.group(0)}->{m.group(0)} not"

def main():
    rng = random.Random(SEED)
    chunks = load_chunks()
    for c in chunks:
        c["ev"] = clean(c["text"])[:EV_CHARS]
    chunks = [c for c in chunks if len(c["ev"]) > 150]
    chunks.sort(key=lambda c: c["id"])
    pages = sorted({c["page_key"] for c in chunks})
    # candidate sentences per chunk
    cand = []
    for c in chunks:
        for s_ in sentences_in(c["ev"]):
            cand.append((c, s_))
    # pages that share any sentence (mirrored/duplicated documents) are ONE group, so identical text never crosses the split
    parent = {pg: pg for pg in pages}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    first = {}
    for c, s_ in cand:
        if s_ in first: parent[find(c["page_key"])] = find(first[s_])
        else: first[s_] = c["page_key"]
    groups = collections.defaultdict(list)
    for pg in pages: groups[find(pg)].append(pg)
    glist = sorted(groups.values(), key=lambda g: g[0])
    prng = random.Random(SEED + 1); prng.shuffle(glist)
    split_of, ntest = {}, 0
    wt = collections.Counter(c["page_key"] for c, _ in cand)       # weight groups by usable sentences, not page count
    target = 0.3 * sum(wt.values())
    for g in glist:
        w = sum(wt[pg] for pg in g)
        sp = "test" if (ntest < target and ntest + w <= target * 1.25) else "train"
        if sp == "test": ntest += w
        for pg in g: split_of[pg] = sp
    ntest = sum(v == "test" for v in split_of.values())
    rng.shuffle(cand)

    # contradicted first (rarest): per chunk/sentence try perturbations, by type quota
    quota = {"number": int(PER_CLASS * 0.60), "polarity": int(PER_CLASS * 0.20), "negation": int(PER_CLASS * 0.20)}
    fns = {"number": perturb_number, "polarity": perturb_polarity, "negation": perturb_negation}
    contra, used = [], set()
    # pass 1 quota, pass 2 fill remainder with any type
    for phase in (1, 2):
        for c, s in cand:
            if len(contra) >= PER_CLASS: break
            if (c["id"], s) in used: continue
            order = list(fns); rng.shuffle(order)
            for t in order:
                if phase == 1 and quota[t] <= 0: continue
                r = fns[t](s, c["ev"], rng)
                if r:
                    claim, ct, detail = r
                    contra.append(dict(evidence=c["ev"], claim=claim, label="contradicted", change_type=ct, change=detail,
                                       source_sentence=s, page_key=c["page_key"], chunk_id=c["id"]))
                    used.add((c["id"], s)); quota[t] -= 1
                    break
    # entailed: other sentences, not used for contradiction, dedupe on text
    ent, seen = [], set()
    for c, s in cand:
        if len(ent) >= PER_CLASS: break
        if s in seen: continue  # reuse of a contradicted source sentence is allowed (minimal pairs)
        seen.add(s)
        ent.append(dict(evidence=c["ev"], claim=s, label="entailed", change_type="none", change="",
                        source_sentence=s, page_key=c["page_key"], chunk_id=c["id"]))
    # unsupported: pair evidence with a sentence from a different page, low lexical overlap
    byc = {c["id"]: content(c["ev"]) for c in chunks}
    sent_pool = [(c, s, content(s)) for c, s in cand]
    uns = []
    evs = chunks[:]; rng.shuffle(evs)
    i = 0
    while len(uns) < PER_CLASS and i < len(evs) * 6:
        c = evs[i % len(evs)]; i += 1
        c2, s, cs = sent_pool[rng.randrange(len(sent_pool))]
        if c2["page_key"] == c["page_key"] or split_of[c2["page_key"]] != split_of[c["page_key"]]: continue  # same split only: no text crosses train/test
        if jacc(cs, byc[c["id"]]) >= 0.1: continue
        if len(cs & byc[c["id"]]) > 3: continue
        if s in c["ev"]: continue
        uns.append(dict(evidence=c["ev"], claim=s, label="unsupported", change_type="none", change="",
                        source_sentence=s, page_key=c["page_key"], chunk_id=c["id"], claim_page_key=c2["page_key"]))
    # balance inside each split: trim every class to the smallest class of that split (seeded)
    def split_rows(rs, sp): return [r for r in rs if split_of[r["page_key"]] == sp]
    rows = []
    for sp in ("train", "test"):
        grp = [split_rows(x, sp) for x in (ent, contra, uns)]
        n = min(len(g) for g in grp)
        for g in grp:
            g2 = g[:]; random.Random(SEED + 7).shuffle(g2)
            rows += sorted(g2[:n], key=lambda r: (r["chunk_id"], r["label"], r["claim"]))
    train, test = [], []
    for r in rows:
        r["split"] = split_of[r["page_key"]]
        (test if r["split"] == "test" else train).append(r)
    # unsupported claims must not come from the other split's pages leaking text -> claim page may differ in split; check separately
    for name, part in (("train", train), ("test", test)):
        with open(HERE / f"{name}.jsonl", "w") as f:
            for r in part: f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
    man = {"seed": SEED, "per_class_target": PER_CLASS, "evidence_chars": EV_CHARS, "pages": len(pages),
           "pages_train": sum(v == "train" for v in split_of.values()), "pages_test": ntest, "splits": {}}
    for name, part in (("train", train), ("test", test)):
        man["splits"][name] = {"rows": len(part),
            "by_label": dict(collections.Counter(r["label"] for r in part)),
            "contradicted_by_change_type": dict(collections.Counter(r["change_type"] for r in part if r["label"] == "contradicted")),
            "sha256": hashlib.sha256((HERE / f"{name}.jsonl").read_bytes()).hexdigest()}
    (HERE / "MANIFEST.json").write_text(json.dumps(man, indent=2))
    print(json.dumps(man, indent=2))

if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    main()
