"""Env knobs must not be able to break the server (RAG_PROMPT_TOP_K / RAG_PROMPT_CHUNK_CHARS, B13).
Run: cd rag-engine && .venv/bin/pytest evaluation/test_config_knobs.py -v"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402


def test_defaults_are_the_shipped_values():
    assert (config.PROMPT_TOP_K, config.PROMPT_CHUNK_CHARS) == (3, 500)


def test_env_int_clamps_and_falls_back(monkeypatch):
    monkeypatch.setenv("K", "0");      assert config._env_int("K", 3, 1, 10) == 1        # 0 chunks would send an empty context
    monkeypatch.setenv("K", "99999");  assert config._env_int("K", 3, 1, 10) == 10
    monkeypatch.setenv("K", "abc");    assert config._env_int("K", 3, 1, 10) == 3        # unparsable: default, not an import crash
    monkeypatch.setenv("K", "");       assert config._env_int("K", 3, 1, 10) == 3
    monkeypatch.setenv("K", "5");      assert config._env_int("K", 3, 1, 10) == 5
    monkeypatch.delenv("K");           assert config._env_int("K", 3, 1, 10) == 3


def test_cache_key_covers_the_prompt_knobs():
    sig = config.pipeline_signature()
    assert f"pk{config.PROMPT_TOP_K}" in sig and f"pc{config.PROMPT_CHUNK_CHARS}" in sig
