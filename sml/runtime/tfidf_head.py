"""Pure-numpy TF-IDF + logistic head of the router, loaded WITHOUT pickle from an export (ROADMAP C21).
It reproduces scikit-learn's TfidfVectorizer ('word' 1-2 grams and 'char_wb' 2-5 grams, lowercase, sublinear tf, idf, l2 per block) and
the LogisticRegression softmax, so the same weights can later be ported to JavaScript (J1) and checked against this file.

Tokenisation note for the JS port: `\\w` here is Python's Unicode `\\w` (letters, digits, underscore). Devanagari vowel signs and virama are
combining marks and are NOT `\\w`, so a Hindi word is split at them. The model was trained that way, so a port must do the same
(JS: [\\p{L}\\p{N}_] without \\p{M}).

    export_head(joblib_path, out_dir)   writes tfidf_head.json (vocab, idf, meta) and tfidf_head.npz (coef, intercept)
    TfidfHead.load(dir).proba(text)     -> (classes, probabilities)
"""
from __future__ import annotations
import json, math, re
from pathlib import Path
import numpy as np

_TOKEN = re.compile(r"(?u)\b\w\w+\b")
_WS = re.compile(r"\s\s+")


def word_terms(text: str, ngram=(1, 2)) -> list[str]:
    toks = _TOKEN.findall(text.lower())
    out = list(toks)
    for n in range(2, ngram[1] + 1):
        out += [" ".join(toks[i:i + n]) for i in range(len(toks) - n + 1)]
    return out


def char_wb_terms(text: str, ngram=(2, 5)) -> list[str]:
    out = []
    for w in _WS.sub(" ", text.lower()).split():
        w = " " + w + " "
        for n in range(ngram[0], ngram[1] + 1):
            off = 0
            out.append(w[off:off + n])
            while off + n < len(w):
                off += 1
                out.append(w[off:off + n])
            if off == 0:
                break
    return out


class TfidfHead:
    def __init__(self, meta, vocab_w, idf_w, vocab_c, idf_c, coef, intercept):
        self.classes = meta["classes"]; self.embed_weight = meta.get("embed_weight")
        self.vw, self.vc = vocab_w, vocab_c
        self.idf_w, self.idf_c = idf_w, idf_c
        self.nw = len(vocab_w); self.coef = coef; self.b = intercept

    @classmethod
    def load(cls, d) -> "TfidfHead":
        d = Path(d); j = json.loads((d / "tfidf_head.json").read_text())
        z = np.load(d / "tfidf_head.npz", allow_pickle=False)
        return cls(j["meta"], {t: i for i, t in enumerate(j["vocab_word"])}, np.asarray(j["idf_word"], dtype=np.float64),
                   {t: i for i, t in enumerate(j["vocab_char"])}, np.asarray(j["idf_char"], dtype=np.float64),
                   z["coef"].astype(np.float64), z["intercept"].astype(np.float64))

    def _block(self, terms, vocab, idf):
        tf = {}
        for t in terms:
            i = vocab.get(t)
            if i is not None:
                tf[i] = tf.get(i, 0) + 1
        idx = np.fromiter(tf.keys(), dtype=np.int64, count=len(tf))
        val = np.array([(1.0 + math.log(c)) * idf[i] for i, c in tf.items()])
        n = math.sqrt(float((val * val).sum()))
        return idx, (val / n if n else val)

    def logits(self, text: str) -> np.ndarray:
        iw, vw = self._block(word_terms(text), self.vw, self.idf_w)
        ic, vc = self._block(char_wb_terms(text), self.vc, self.idf_c)
        z = self.b.copy()
        if len(iw): z += self.coef[:, iw] @ vw
        if len(ic): z += self.coef[:, self.nw + ic] @ vc
        return z

    def proba(self, text: str) -> np.ndarray:
        z = self.logits(text); p = np.exp(z - z.max()); return p / p.sum()


def export_head(joblib_path, out_dir, coef_dtype="float32") -> dict:
    import joblib
    tf = joblib.load(joblib_path)
    w, c, lr = tf["word"], tf["char"], tf["lr"]
    assert w.ngram_range == (1, 2) and c.ngram_range == (2, 5) and c.analyzer == "char_wb" and w.lowercase and c.lowercase
    assert w.sublinear_tf and c.sublinear_tf and w.norm == "l2" and c.norm == "l2" and w.strip_accents is None and c.strip_accents is None
    assert w.token_pattern == r"(?u)\b\w\w+\b" and getattr(w, "stop_words", None) is None
    order = lambda v: [t for t, _ in sorted(v.vocabulary_.items(), key=lambda kv: kv[1])]
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    meta = {"classes": [str(x) for x in tf["classes"]], "embed_weight": tf.get("embed_weight"), "n_word": len(w.vocabulary_), "n_char": len(c.vocabulary_),
            "source": "tfidf_lr.joblib", "analyzers": "word(1,2) + char_wb(2,5), lowercase, sublinear_tf, l2 per block, then logistic regression"}
    (out / "tfidf_head.json").write_text(json.dumps({"meta": meta, "vocab_word": order(w), "idf_word": [float(x) for x in w.idf_],
                                                      "vocab_char": order(c), "idf_char": [float(x) for x in c.idf_]}, ensure_ascii=False))
    np.savez_compressed(out / "tfidf_head.npz", coef=lr.coef_.astype(coef_dtype), intercept=lr.intercept_.astype(np.float64))
    return meta
