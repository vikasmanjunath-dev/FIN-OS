"""D10 answer-checking slice: the figure check must flag a wrong governed figure and stay quiet on correct statements (including the false alarms found on the real pool)."""
import importlib.util
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("afc", ROOT / "sml" / "tools" / "answer_figures_check.py")
A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)


def groups(claim, ev=""): return {f["group"]: f for f in A.check_claim(claim, ev)}


def test_flags_wrong_80c_limit_and_splits_by_evidence():
    g = groups("The Section 80C deduction limit is ₹2 lakh.")
    assert g["80C"]["where"] == "not_in_evidence" and g["80C"]["stated"] == [200000.0]
    assert groups("The Section 80C deduction limit is ₹2 lakh.", "...Section 80C limit of Rs 2,00,000...")["80C"]["where"] == "in_evidence"


def test_flags_wrong_equity_rates():
    assert "LTCG_equity_rate" in groups("LTCG on equity shares is taxed at 10%.")
    assert "STCG_equity_rate" in groups("STCG on equity mutual funds is taxed at 15%.")


def test_quiet_on_correct_and_known_false_alarms():
    for ok in ("Section 80C allows a deduction up to ₹1.5 lakh.", "The 80CCD(1B) deduction is an additional ₹50,000 beyond the 80C limit.",
               "Total deduction under 80C plus 80CCD(1B) is ₹2 Lakh.", "Slab rate can be up to 30% plus surcharge and cess.",
               "Health and education cess is 4%.", "LTCG on listed equity above ₹1.25 lakh is taxed at 12.5%.", "Under 80D you can claim ₹25,000 for self and family.",
               "In 2026 the Section 80C limit stays ₹1,50,000."):
        assert not A.check_claim(ok), ok


def test_numbers_ignore_years_and_section_numbers():
    assert A.numbers("Section 80C in FY 2025 is ₹1.5L") == [(150000.0, "INR", A.numbers("Section 80C in FY 2025 is ₹1.5L")[0][2])]
