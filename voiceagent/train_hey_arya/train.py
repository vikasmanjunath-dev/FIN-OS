"""
Phase 24 — Custom "Hey Arya" wake-word model trainer.

Generates synthetic training data via edge-tts, extracts openwakeword AudioFeatures
embeddings, trains a 3-layer MLP, and exports hey_arya.onnx to ../models/.

Usage (from voiceagent/ directory):
    .venv/bin/python3 train_hey_arya/train.py

Output:
    models/hey_arya.onnx   ← drop-in replacement for hey_jarvis.onnx
    train_hey_arya/embeddings_cache.npz  ← cached features (skip TTS re-gen)

Runtime: ~12–20 min on first run (TTS + training). Subsequent runs use the
cache and skip TTS generation: ~1–2 min.

No extra dependencies beyond the voiceagent venv (edge-tts, torch, torchaudio,
openwakeword, onnxruntime, numpy, scipy). ffmpeg must be on PATH.
"""
from __future__ import annotations
import asyncio
import json
import os
import random
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

# ── Paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent
VENV_PYTHON  = SCRIPT_DIR.parent / ".venv" / "bin" / "python3"
MODELS_DIR   = SCRIPT_DIR.parent / "models"
CACHE_FILE   = SCRIPT_DIR / "embeddings_cache.npz"
OUTPUT_ONNX  = MODELS_DIR / "hey_arya.onnx"

MODELS_DIR.mkdir(exist_ok=True)

# ── TTS voices (5 Indian English / Hindi voices available in edge-tts) ──
VOICES = [
    "en-IN-NeerjaExpressiveNeural",
    "en-IN-NeerjaNeural",
    "en-IN-PrabhatNeural",
    "hi-IN-MadhurNeural",
    "hi-IN-SwaraNeural",
]

# ── Positive phrases (all phrasings that should wake Arya) ────────────
POSITIVE_PHRASES = [
    "hey arya",
    "hey aria",
    "hey arya please",
    "hey arya help",
    "hey arya listen",
    "okay arya",
]

# Rate modifiers for edge-tts SSML
RATE_TAGS = ["-10%", "+0%", "+15%"]   # slow / normal / fast

# ── Negative phrases (must NOT trigger the wake word) ─────────────────
NEGATIVE_PHRASES = [
    # Similar-sounding confusables
    "hey siri", "hey google", "hey alexa", "hey cortana", "hey jarvis",
    "hey aria the opera singer", "hey daria", "hey maria",
    # Financial queries (the dominant context)
    "what is my portfolio value today",
    "show me the nifty 50 chart",
    "calculate my sip returns",
    "how much should i invest in mutual funds",
    "what is the current sensex level",
    "open my track finances page",
    "check my expense breakdown",
    "what is the current repo rate",
    "show me recent market news",
    "calculate my emi for twenty lakhs",
    "what is the current gold price",
    "how is my health score doing",
    "open the portfolio analyser",
    "what are the best elss funds",
    "explain the difference between growth and dividend plans",
    "how much tax will i save under section eighty c",
    "what is my fire number",
    "set a price alert for reliance",
    "show me the supertrend indicator",
    "what is the current dollar rupee rate",
    # General conversation
    "good morning",
    "what time is it",
    "tell me a joke",
    "what is the weather today",
    "set a reminder for five pm",
    "play some music",
    "call mom",
    "navigate to home",
    "i need financial advice",
    "thank you very much",
    # Short negatives
    "yes", "no", "okay", "alright", "start", "stop", "pause", "resume",
    "arya", "hiya", "hey", "hello arya",
]

# Voices used for negatives (3 of 5 to keep generation faster)
NEG_VOICES = VOICES[:3]


# ── Audio helpers ──────────────────────────────────────────────────────
async def _tts_to_pcm(text: str, voice: str, rate: str = "+0%") -> np.ndarray | None:
    """Generate text-to-speech and return 16kHz mono int16 PCM array."""
    try:
        import edge_tts
        comm = edge_tts.Communicate(text, voice=voice, rate=rate)
        mp3_bytes = b""
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                mp3_bytes += chunk["data"]
        if not mp3_bytes:
            return None

        # MP3 → raw int16 PCM at 16kHz mono via ffmpeg
        proc = subprocess.run(
            ["ffmpeg", "-loglevel", "quiet",
             "-f", "mp3", "-i", "pipe:0",
             "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"],
            input=mp3_bytes, capture_output=True, timeout=15,
        )
        if proc.returncode != 0:
            return None
        return np.frombuffer(proc.stdout, dtype="int16")
    except Exception:
        return None


def _pad_or_trim(pcm: np.ndarray, target_samples: int = 32000) -> np.ndarray:
    """Pad with silence or trim to exactly target_samples (2 s @ 16kHz)."""
    if len(pcm) >= target_samples:
        return pcm[:target_samples]
    return np.concatenate([pcm, np.zeros(target_samples - len(pcm), dtype="int16")])


def _add_noise(pcm: np.ndarray, snr_db: float = 20.0) -> np.ndarray:
    """Add Gaussian white noise at the specified SNR."""
    signal_rms = np.sqrt(np.mean(pcm.astype("float32") ** 2)) + 1e-9
    noise_rms  = signal_rms / (10 ** (snr_db / 20))
    noise = (np.random.randn(len(pcm)) * noise_rms).astype("int16")
    return np.clip(pcm.astype("int32") + noise.astype("int32"), -32768, 32767).astype("int16")


# ── Feature extraction ─────────────────────────────────────────────────
def _extract_embedding(pcm: np.ndarray, af) -> np.ndarray:
    """Extract (16, 96) float32 embedding from 2-second PCM via AudioFeatures."""
    pcm2s = _pad_or_trim(pcm, 32000)
    emb   = af._get_embeddings(pcm2s)           # shape (16, 96)
    # Guard: some edge cases may return fewer frames
    if emb.shape[0] < 16:
        pad = np.zeros((16 - emb.shape[0], 96), dtype="float32")
        emb = np.vstack([pad, emb])
    return emb[:16].astype("float32")            # exactly (16, 96)


# ── Data generation ────────────────────────────────────────────────────
async def _generate_all_audio(verbose: bool = True) -> tuple[list, list]:
    """
    Return (positive_pcm_list, negative_pcm_list).
    Each element is an int16 numpy array at 16kHz.
    """
    pos: list[np.ndarray] = []
    neg: list[np.ndarray] = []

    total_pos = len(POSITIVE_PHRASES) * len(VOICES) * len(RATE_TAGS)
    total_neg = len(NEGATIVE_PHRASES) * len(NEG_VOICES)
    done = 0

    if verbose:
        print(f"[TTS] Generating {total_pos} positive + {total_neg} negative samples…")

    # ── Positive samples ──
    for phrase in POSITIVE_PHRASES:
        for voice in VOICES:
            for rate in RATE_TAGS:
                pcm = await _tts_to_pcm(phrase, voice, rate)
                if pcm is not None and len(pcm) > 800:
                    pos.append(pcm)
                    # Noisy augmentation copy
                    pos.append(_add_noise(pcm, snr_db=random.uniform(12, 25)))
                done += 1
                if verbose and done % 10 == 0:
                    print(f"  {done}/{total_pos + total_neg} clips done …", end="\r")

    # ── Negative samples ──
    for phrase in NEGATIVE_PHRASES:
        for voice in NEG_VOICES:
            pcm = await _tts_to_pcm(phrase, voice, "+0%")
            if pcm is not None and len(pcm) > 800:
                neg.append(pcm)
            done += 1
            if verbose and done % 10 == 0:
                print(f"  {done}/{total_pos + total_neg} clips done …", end="\r")

    # ── Silence / noise negatives (no TTS needed) ──
    rng = np.random.default_rng(42)
    for snr in [30, 20, 15, 10]:
        silence = (rng.standard_normal(32000) * 200).astype("int16")
        neg.append(silence)

    if verbose:
        print(f"\n[TTS] Done — {len(pos)} positive, {len(neg)} negative PCM clips")
    return pos, neg


# ── Training ───────────────────────────────────────────────────────────
class _WakeWordMLP(nn.Module):
    def __init__(self, input_dim: int = 16 * 96, hidden: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Flatten(),
            nn.Linear(input_dim, hidden),
            nn.LayerNorm(hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden // 2),
            nn.LayerNorm(hidden // 2),
            nn.ReLU(),
            nn.Linear(hidden // 2, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def _train(X: np.ndarray, y: np.ndarray,
           epochs: int = 300, lr: float = 5e-4, batch_size: int = 32) -> _WakeWordMLP:
    """
    Train binary MLP on embeddings.
    X: float32 (N, 16, 96)
    y: float32 (N,) — 1 = positive, 0 = negative
    """
    # Shuffle
    idx = np.random.permutation(len(X))
    X, y = X[idx], y[idx]

    # 80/20 train/val split
    split = int(0.8 * len(X))
    X_tr, X_val = X[:split], X[split:]
    y_tr, y_val = y[:split], y[split:]

    X_tr  = torch.tensor(X_tr,  dtype=torch.float32)
    y_tr  = torch.tensor(y_tr,  dtype=torch.float32).unsqueeze(1)
    X_val = torch.tensor(X_val, dtype=torch.float32)
    y_val = torch.tensor(y_val, dtype=torch.float32).unsqueeze(1)

    model = _WakeWordMLP()
    opt   = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.BCELoss()

    best_val_loss = float("inf")
    best_state    = None

    print(f"[Train] {len(X_tr)} train / {len(X_val)} val samples — {epochs} epochs")

    for epoch in range(1, epochs + 1):
        model.train()
        # Mini-batch shuffle
        perm = torch.randperm(len(X_tr))
        epoch_loss = 0.0
        for i in range(0, len(X_tr), batch_size):
            bi = perm[i : i + batch_size]
            xb, yb = X_tr[bi], y_tr[bi]
            opt.zero_grad()
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            opt.step()
            epoch_loss += loss.item() * len(bi)
        epoch_loss /= len(X_tr)

        # Validation
        model.eval()
        with torch.no_grad():
            val_pred = model(X_val)
            val_loss = loss_fn(val_pred, y_val).item()
            val_acc  = ((val_pred > 0.5).float() == y_val).float().mean().item()
            # Recall on positive val examples
            pos_mask = y_val.squeeze() == 1
            val_recall = (
                ((val_pred[pos_mask] > 0.5).float().sum() / pos_mask.sum()).item()
                if pos_mask.any() else 0.0
            )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state    = {k: v.clone() for k, v in model.state_dict().items()}

        if epoch % 50 == 0 or epoch == 1:
            print(
                f"  epoch {epoch:4d}  loss {epoch_loss:.4f}  "
                f"val_loss {val_loss:.4f}  val_acc {val_acc:.3f}  "
                f"val_recall {val_recall:.3f}"
            )

    if best_state:
        model.load_state_dict(best_state)
    print(f"[Train] Best val loss: {best_val_loss:.4f}")
    return model


def _export_onnx(model: _WakeWordMLP, path: Path) -> None:
    model.eval()
    dummy = torch.randn(1, 16, 96)
    # opset 18: avoids LayerNorm version-conversion failure; openwakeword's onnxruntime
    # handles 18 fine. No dynamic_axes needed — inference always uses batch=1.
    torch.onnx.export(
        model, dummy, str(path),
        input_names=["x.1"],
        output_names=["hey_arya"],
        opset_version=18,
    )
    print(f"[ONNX] Saved → {path}")


def _verify_onnx(path: Path) -> None:
    """Quick sanity-check: load the ONNX model and run inference on silence."""
    from openwakeword.model import Model as OWWModel
    m = OWWModel(wakeword_models=[str(path)], inference_framework="onnx")

    import numpy as np
    silence = np.zeros(1280, dtype="int16")
    scores  = m.predict(silence)
    hey_key = list(scores.keys())[0]
    print(f"[Verify] Silence score on hey_arya model: {scores[hey_key]:.6f} (expect ≈ 0)")


# ── Main ───────────────────────────────────────────────────────────────
def main() -> None:
    from openwakeword.utils import AudioFeatures

    print("=" * 60)
    print("  FIN-OS — 'Hey Arya' wake-word model trainer  (Phase 24)")
    print("=" * 60)

    af = AudioFeatures()

    # ── Step 1: Load or generate embeddings ───────────────────────────
    if CACHE_FILE.exists():
        print(f"[Cache] Loading embeddings from {CACHE_FILE}")
        data = np.load(CACHE_FILE)
        X    = data["X"]
        y    = data["y"]
        print(f"[Cache] {int(y.sum())} positive, {int((y == 0).sum())} negative samples")
    else:
        print("[Cache] No cache found — generating training data…")
        t0 = time.time()

        pos_pcm, neg_pcm = asyncio.run(_generate_all_audio())

        print("[Features] Extracting AudioFeatures embeddings…")
        X_pos = np.stack([_extract_embedding(p, af) for p in pos_pcm])
        X_neg = np.stack([_extract_embedding(n, af) for n in neg_pcm])

        X = np.vstack([X_pos, X_neg])
        y = np.array([1.0] * len(X_pos) + [0.0] * len(X_neg), dtype="float32")

        np.savez(CACHE_FILE, X=X, y=y)
        print(
            f"[Features] {len(X_pos)} positive + {len(X_neg)} negative embeddings "
            f"in {time.time()-t0:.0f}s — cached to {CACHE_FILE}"
        )

    # ── Step 2: Train ─────────────────────────────────────────────────
    print("\n[Train] Starting training…")
    model = _train(X, y)

    # ── Step 3: Export ────────────────────────────────────────────────
    _export_onnx(model, OUTPUT_ONNX)

    # ── Step 4: Sanity check ──────────────────────────────────────────
    _verify_onnx(OUTPUT_ONNX)

    print("\n✅  hey_arya.onnx ready.")
    print(f"   Place it at: {OUTPUT_ONNX}")
    print("   Agent will auto-detect and use it on next restart.")
    print("   To retrain from scratch, delete train_hey_arya/embeddings_cache.npz")


if __name__ == "__main__":
    main()
