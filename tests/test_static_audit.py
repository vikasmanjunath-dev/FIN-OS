"""pytest wrapper around tests/static_audit.py — one test per check, failures list every offender."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_audit


@pytest.mark.parametrize("name", list(static_audit.CHECKS))
def test_static_audit(name):
    problems = static_audit.CHECKS[name]()
    assert not problems, f"{len(problems)} problem(s):\n  " + "\n  ".join(problems[:40])
