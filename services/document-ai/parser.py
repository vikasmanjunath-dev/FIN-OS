"""
FIN-OS Document AI  v1.0
────────────────────────────────────────────────────────────────────────────
Upload a salary slip, bank statement, or Form-16 PDF/image and get back
structured financial data ready to auto-fill the FIN-OS dashboard.

Pipeline
  1. Extract raw text (pdfplumber for PDFs, pytesseract for images)
  2. Identify document type (salary slip / bank statement / Form-16)
  3. Run regex + LLM (Ollama) extraction to pull key fields
  4. Return structured JSON + Supabase upsert helpers

Run:
  python parser.py            → test mode (parses sample.pdf if present)
  uvicorn parser:app --port 5050  → standalone micro-service (port 5050)

Install:
  pip install flask flask-cors pdfplumber Pillow pytesseract requests
  # Also: brew install tesseract  (macOS) or  apt install tesseract-ocr
"""

from __future__ import annotations
import io
import json
import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

# Optional OCR / PDF deps — graceful degradation if not installed
try:
    import pdfplumber
    _PDF_OK = True
except ImportError:
    _PDF_OK = False

try:
    from PIL import Image
    import pytesseract
    _OCR_OK = True
except ImportError:
    _OCR_OK = False

# ── Logging ───────────────────────────────────────────────────────────────────
log = logging.getLogger("finos-docai")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ── Ollama config ─────────────────────────────────────────────────────────────
OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:14b")

DOC_SYSTEM = (
    "You are a financial document parser for Indian documents. "
    "Extract ONLY the fields asked. Return valid JSON — no prose, no markdown code fences. "
    "Use null for missing fields. All monetary values as plain numbers (no ₹ symbol)."
)

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ═══════════════════════════════════════════════════════════════════════════════
# 1. TEXT EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF using pdfplumber."""
    if not _PDF_OK:
        raise RuntimeError(
            "pdfplumber not installed. Run: pip install pdfplumber"
        )
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    return "\n".join(text_parts)


def extract_text_from_image(file_bytes: bytes) -> str:
    """OCR an image file using pytesseract."""
    if not _OCR_OK:
        raise RuntimeError(
            "Pillow / pytesseract not installed. "
            "Run: pip install Pillow pytesseract  AND  brew install tesseract"
        )
    img = Image.open(io.BytesIO(file_bytes))
    return pytesseract.image_to_string(img, lang="eng")


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Auto-detect file type and extract text."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_bytes)
    elif ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"):
        return extract_text_from_image(file_bytes)
    else:
        # Try PDF first, then OCR, then raw decode
        try:
            return extract_text_from_pdf(file_bytes)
        except Exception:
            try:
                return extract_text_from_image(file_bytes)
            except Exception:
                return file_bytes.decode("utf-8", errors="replace")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. DOCUMENT TYPE DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

def detect_doc_type(text: str) -> str:
    """
    Returns one of: 'salary_slip' | 'bank_statement' | 'form16' | 'unknown'
    """
    t = text.lower()
    salary_score = sum([
        "gross salary"  in t,
        "net salary"    in t,
        "basic"         in t and "da"  in t,
        "pf deduction"  in t or "epf"  in t,
        "tds"           in t and "salary" in t,
        "payslip"       in t or "pay slip" in t or "payroll" in t,
        "employee"      in t and "month" in t,
        "take home"     in t or "in hand" in t,
    ])
    bank_score = sum([
        "account number"   in t or "account no"  in t,
        "statement of"     in t or "bank statement" in t,
        "opening balance"  in t or "closing balance" in t,
        "deposit"          in t and "withdrawal" in t,
        "dr"               in t and "cr" in t and "balance" in t,
        "ifsc"             in t,
        "transaction id"   in t or "utr"  in t,
        "passbook"         in t,
    ])
    form16_score = sum([
        "form 16"          in t or "form-16" in t,
        "certificate of"   in t and "tds"    in t,
        "pan of deductor"  in t or "tan"     in t,
        "gross total income" in t,
        "chapter vi"       in t or "80c"     in t,
        "income tax"       in t and "return" in t,
    ])

    scores = {
        "salary_slip":   salary_score,
        "bank_statement": bank_score,
        "form16":        form16_score,
    }
    best = max(scores, key=scores.get)
    return best if scores[best] >= 2 else "unknown"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. REGEX FAST-EXTRACTORS
# ═══════════════════════════════════════════════════════════════════════════════

def _first_match(pattern: str, text: str, group: int = 1,
                  flags: int = re.I) -> Any:
    m = re.search(pattern, text, flags)
    return m.group(group) if m else None


def _parse_amount(s: str | None) -> float | None:
    if not s:
        return None
    cleaned = re.sub(r"[^\d.]", "", s.replace(",", ""))
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def regex_extract_salary(text: str) -> dict:
    """Fast regex pass for salary slips."""
    return {
        "gross_salary":      _parse_amount(_first_match(
            r"(?:gross\s+salary|gross\s+ctc|gross\s+pay)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "net_salary":        _parse_amount(_first_match(
            r"(?:net\s+salary|take.?home|in.?hand|net\s+pay)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "basic_salary":      _parse_amount(_first_match(
            r"basic\s*(?:salary)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "hra":               _parse_amount(_first_match(
            r"\bhra\b\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "pf_deduction":      _parse_amount(_first_match(
            r"(?:pf|epf|provident\s+fund)\s*(?:deduction)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "tds_deducted":      _parse_amount(_first_match(
            r"(?:tds|income\s+tax)\s*(?:deducted)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "month_year":        _first_match(
            r"(?:for\s+the\s+month\s+of|pay\s+period|month)\s*[:\-]?\s*"
            r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4})", text),
        "employer_name":     _first_match(
            r"(?:company|employer|organization|firm)\s*[:\-]?\s*([A-Z][A-Za-z ]{2,40})", text),
        "employee_name":     _first_match(
            r"(?:employee\s+name|name\s+of\s+employee)\s*[:\-]?\s*([A-Z][A-Za-z ]{2,30})", text),
        "pan":               _first_match(
            r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text),
    }


def regex_extract_bank(text: str) -> dict:
    """Fast regex pass for bank statements."""
    return {
        "account_number":    _first_match(
            r"(?:account\s+(?:no|number|no\.)|a/c\s+no)\s*[:\-]?\s*(\d[\d\s\-]{6,18}\d)", text),
        "account_holder":    _first_match(
            r"(?:name|account\s+holder|a/c\s+holder)\s*[:\-]?\s*([A-Z][A-Za-z ]{2,35})", text),
        "ifsc":              _first_match(
            r"\b([A-Z]{4}0[A-Z0-9]{6})\b", text),
        "bank_name":         _first_match(
            r"((?:State Bank|HDFC|ICICI|Axis|Kotak|Punjab National|Bank of Baroda|"
            r"Canara|Union|IndusInd|Yes Bank|IDFC|Federal)[A-Za-z &]+)", text),
        "opening_balance":   _parse_amount(_first_match(
            r"opening\s+balance\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "closing_balance":   _parse_amount(_first_match(
            r"closing\s+balance\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "statement_period":  _first_match(
            r"(?:from|period)\s*[:\-]?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*(?:to|[-–])\s*"
            r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", text, group=0),
        "total_credits":     _parse_amount(_first_match(
            r"(?:total\s+credits?|total\s+deposit)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "total_debits":      _parse_amount(_first_match(
            r"(?:total\s+debits?|total\s+withdrawal)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
    }


def regex_extract_form16(text: str) -> dict:
    """Fast regex pass for Form-16."""
    return {
        "gross_total_income":     _parse_amount(_first_match(
            r"gross\s+total\s+income\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "total_deductions_80c":   _parse_amount(_first_match(
            r"(?:80c|chapter\s+vi.a\s+deductions?)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "total_tax_payable":      _parse_amount(_first_match(
            r"(?:total\s+tax\s+payable|tax\s+deducted)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "total_tds":              _parse_amount(_first_match(
            r"(?:total\s+tds|tds\s+deposited)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)", text)),
        "pan":                    _first_match(
            r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text),
        "employer_name":          _first_match(
            r"(?:name\s+of\s+employer|deductor)\s*[:\-]?\s*([A-Z][A-Za-z ]{2,40})", text),
        "assessment_year":        _first_match(
            r"(?:assessment\s+year|a\.y\.)\s*[:\-]?\s*(\d{4}-\d{2,4})", text),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 4. LLM ENRICHMENT
# ═══════════════════════════════════════════════════════════════════════════════

def _ollama_json(prompt: str, fallback: dict) -> dict:
    """
    Ask Ollama to fill in missing fields.  Returns parsed JSON dict.
    Falls back to `fallback` dict on any error.
    """
    try:
        resp = requests.post(OLLAMA_URL, json={
            "model":   OLLAMA_MODEL,
            "system":  DOC_SYSTEM,
            "prompt":  prompt,
            "stream":  False,
            "options": {"temperature": 0.1, "num_predict": 512},
        }, timeout=45)
        resp.raise_for_status()
        raw = resp.json().get("response", "").strip()

        # Strip markdown code fences if present
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.M).strip()

        return json.loads(raw)

    except Exception as e:
        log.warning("LLM extraction failed: %s — using regex results only", e)
        return fallback


def llm_enrich(doc_type: str, text: str, regex_result: dict) -> dict:
    """
    Use Ollama to fill in any null/missing fields that regex missed.
    Passes a truncated snippet of the document to avoid token limits.
    """
    # Trim text to ~2000 chars for the prompt
    snippet = text[:2000].replace("\n", " ").strip()

    if doc_type == "salary_slip":
        prompt = f"""
Extract salary slip fields from this Indian payslip text.

TEXT: {snippet}

Return JSON with these keys (null if not found):
{{
  "gross_salary": <number>,
  "net_salary": <number>,
  "basic_salary": <number>,
  "hra": <number>,
  "special_allowance": <number>,
  "pf_deduction": <number>,
  "professional_tax": <number>,
  "tds_deducted": <number>,
  "other_deductions": <number>,
  "month_year": "<MMM YYYY>",
  "employer_name": "<string>",
  "employee_name": "<string>",
  "pan": "<string or null>"
}}
""".strip()

    elif doc_type == "bank_statement":
        prompt = f"""
Extract bank statement fields from this Indian bank statement text.

TEXT: {snippet}

Return JSON with these keys (null if not found):
{{
  "bank_name": "<string>",
  "account_number": "<string>",
  "account_holder": "<string>",
  "ifsc": "<string>",
  "account_type": "<savings|current|salary|null>",
  "opening_balance": <number>,
  "closing_balance": <number>,
  "total_credits": <number>,
  "total_debits": <number>,
  "statement_period_from": "<YYYY-MM-DD or null>",
  "statement_period_to": "<YYYY-MM-DD or null>",
  "avg_monthly_balance": <number or null>
}}
""".strip()

    elif doc_type == "form16":
        prompt = f"""
Extract Form-16 fields from this Indian Form-16 text.

TEXT: {snippet}

Return JSON with these keys (null if not found):
{{
  "assessment_year": "<YYYY-YY>",
  "pan": "<string>",
  "employer_name": "<string>",
  "gross_total_income": <number>,
  "total_deductions_80c": <number>,
  "deduction_80d": <number or null>,
  "deduction_nps_80ccd": <number or null>,
  "taxable_income": <number>,
  "total_tax_payable": <number>,
  "total_tds": <number>,
  "refund_due": <number or null>
}}
""".strip()

    else:
        # Unknown doc — generic extraction
        prompt = f"""
This is an Indian financial document. Extract key monetary figures.

TEXT: {snippet}

Return JSON with any useful financial fields you find (amounts as numbers, null if not found).
""".strip()

    llm_data = _ollama_json(prompt, {})

    # Merge: regex wins over LLM when both are present and non-null
    merged = {**llm_data}
    for k, v in regex_result.items():
        if v is not None:
            merged[k] = v

    return merged


# ═══════════════════════════════════════════════════════════════════════════════
# 5. DASHBOARD MAPPING
# ═══════════════════════════════════════════════════════════════════════════════

def map_to_dashboard(doc_type: str, data: dict) -> dict:
    """
    Convert extracted fields to FIN-OS dashboard / Supabase schema fields.
    Returns a dict with 'profiles' and 'transactions' keys for auto-fill.
    """
    profile_updates = {}
    transactions    = []
    insights        = []

    if doc_type == "salary_slip":
        net = data.get("net_salary")
        gross = data.get("gross_salary")
        pf = data.get("pf_deduction")
        tds = data.get("tds_deducted")
        month = data.get("month_year", "")

        if net:
            profile_updates["monthly_income"] = net
            insights.append(f"💰 Monthly take-home: ₹{int(net):,}")

        if gross:
            profile_updates["gross_monthly_income"] = gross

        if pf:
            profile_updates["monthly_epf_contribution"] = pf
            insights.append(f"🏦 EPF deducted this month: ₹{int(pf):,}")

        if tds:
            insights.append(f"📊 TDS this month: ₹{int(tds):,}")

        # Create income transaction
        if net and month:
            transactions.append({
                "type":        "income",
                "category":    "Salary",
                "amount":      net,
                "description": f"Salary credit {month}",
                "source":      "document_ai",
            })

        # Create EPF investment transaction
        if pf and month:
            transactions.append({
                "type":        "investment",
                "category":    "EPF",
                "amount":      pf,
                "description": f"EPF deduction {month}",
                "source":      "document_ai",
            })

    elif doc_type == "bank_statement":
        closing = data.get("closing_balance")
        opening = data.get("opening_balance")
        credits = data.get("total_credits")
        debits  = data.get("total_debits")

        if closing:
            profile_updates["bank_balance"] = closing
            insights.append(f"🏦 Closing balance: ₹{int(closing):,}")

        if credits and debits:
            net_cash = credits - debits
            insights.append(
                f"📈 Month cash flow: "
                f"+₹{int(credits):,} in / -₹{int(debits):,} out = "
                f"{'+'if net_cash>=0 else ''}₹{int(net_cash):,}"
            )

    elif doc_type == "form16":
        gross_income = data.get("gross_total_income")
        deductions   = data.get("total_deductions_80c")
        tds          = data.get("total_tds")
        taxable      = data.get("taxable_income")

        if gross_income:
            profile_updates["annual_income"] = gross_income
            profile_updates["monthly_income"] = round(gross_income / 12)
            insights.append(f"💼 Annual gross income: ₹{int(gross_income):,}")

        if deductions:
            profile_updates["annual_80c_investment"] = deductions
            remaining = 1_50_000 - deductions
            if remaining > 0:
                insights.append(
                    f"💡 80C: ₹{int(deductions):,} invested — "
                    f"₹{int(remaining):,} room left for more tax saving!"
                )
            else:
                insights.append(f"✅ 80C maxed out! ₹1.5L limit fully utilized.")

        if tds:
            profile_updates["annual_tds_deducted"] = tds
            insights.append(f"📋 Total TDS deducted: ₹{int(tds):,}")

    return {
        "doc_type":       doc_type,
        "extracted_data": data,
        "profile_updates": profile_updates,
        "transactions":   transactions,
        "insights":       insights,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 6. MAIN PARSE FUNCTION (callable from anywhere)
# ═══════════════════════════════════════════════════════════════════════════════

def parse_document(file_bytes: bytes, filename: str,
                   use_llm: bool = True) -> dict:
    """
    Full pipeline:
      bytes + filename → structured financial data + dashboard mappings.

    Args:
        file_bytes: raw bytes of the uploaded file
        filename:   original filename (used to detect type)
        use_llm:    set False to skip Ollama (faster, regex only)

    Returns dict with keys:
        doc_type, extracted_data, profile_updates, transactions, insights,
        raw_text_length, confidence
    """
    log.info("Parsing document: %s (%d bytes)", filename, len(file_bytes))

    # Step 1: Extract text
    try:
        raw_text = extract_text(file_bytes, filename)
    except RuntimeError as e:
        return {
            "error": str(e),
            "doc_type": "unknown",
            "extracted_data": {},
            "profile_updates": {},
            "transactions": [],
            "insights": [],
        }

    if not raw_text.strip():
        return {
            "error": "Could not extract any text from document. "
                     "Make sure it's a clear scan or searchable PDF.",
            "doc_type": "unknown",
            "extracted_data": {},
            "profile_updates": {},
            "transactions": [],
            "insights": [],
        }

    # Step 2: Detect document type
    doc_type = detect_doc_type(raw_text)
    log.info("Detected doc type: %s", doc_type)

    # Step 3: Regex fast-extract
    if doc_type == "salary_slip":
        regex_data = regex_extract_salary(raw_text)
    elif doc_type == "bank_statement":
        regex_data = regex_extract_bank(raw_text)
    elif doc_type == "form16":
        regex_data = regex_extract_form16(raw_text)
    else:
        regex_data = {}

    # Step 4: LLM enrichment (fills gaps regex missed)
    if use_llm:
        extracted = llm_enrich(doc_type, raw_text, regex_data)
    else:
        extracted = regex_data

    # Step 5: Map to dashboard schema
    result = map_to_dashboard(doc_type, extracted)
    result["raw_text_length"] = len(raw_text)

    # Rough confidence score
    filled = sum(1 for v in result["extracted_data"].values() if v is not None)
    total  = max(1, len(result["extracted_data"]))
    result["confidence"] = min(98, int((filled / total) * 100))

    log.info("Parse done — type=%s  confidence=%d%%  fields=%d/%d",
             doc_type, result["confidence"], filled, total)

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# 7. FLASK API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/parse", methods=["POST"])
def parse_endpoint():
    """
    POST /parse
    Form-data: file=<binary>  (multipart/form-data)
    Optional: use_llm=false  (skip Ollama, regex-only)

    Returns: { status, doc_type, extracted_data, profile_updates,
                transactions, insights, confidence }
    """
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file in request"}), 400

    f         = request.files["file"]
    file_bytes = f.read()
    filename  = f.filename or "upload.pdf"
    use_llm   = request.form.get("use_llm", "true").lower() != "false"

    if len(file_bytes) > 20 * 1024 * 1024:   # 20 MB limit
        return jsonify({"status": "error", "message": "File too large (max 20 MB)"}), 413

    result = parse_document(file_bytes, filename, use_llm=use_llm)

    if "error" in result:
        return jsonify({"status": "error", **result}), 422

    return jsonify({"status": "success", **result})


@app.route("/detect-type", methods=["POST"])
def detect_type_endpoint():
    """
    Quick doc-type detection without full extraction.
    POST /detect-type  — form-data: file=<binary>
    """
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file"}), 400

    f         = request.files["file"]
    file_bytes = f.read()
    filename  = f.filename or "upload.pdf"

    try:
        raw_text = extract_text(file_bytes, filename)
        doc_type = detect_doc_type(raw_text)
        return jsonify({
            "status":       "success",
            "doc_type":     doc_type,
            "text_preview": raw_text[:300],
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":    "ok",
        "pdf_ready": _PDF_OK,
        "ocr_ready": _OCR_OK,
        "ollama":    OLLAMA_URL,
        "model":     OLLAMA_MODEL,
    })


# ── CLI test mode ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        # Test mode: python parser.py sample.pdf
        test_file = Path(sys.argv[1])
        if not test_file.exists():
            print(f"❌ File not found: {test_file}")
            sys.exit(1)

        print(f"\n🔍 Parsing: {test_file.name}")
        result = parse_document(test_file.read_bytes(), test_file.name)

        print(f"\n📄 Document Type  : {result['doc_type']}")
        print(f"🎯 Confidence     : {result.get('confidence', 0)}%")
        print(f"\n📊 Extracted Data:")
        for k, v in (result.get("extracted_data") or {}).items():
            if v is not None:
                print(f"   {k:<28}: {v}")
        print(f"\n🏠 Dashboard Updates:")
        for k, v in (result.get("profile_updates") or {}).items():
            print(f"   {k:<28}: {v}")
        if result.get("transactions"):
            print(f"\n💳 Auto-Transactions: {len(result['transactions'])}")
        print(f"\n💡 Insights:")
        for ins in (result.get("insights") or []):
            print(f"   {ins}")
    else:
        # Server mode
        print("🚀 FIN-OS Document AI Parser — port 5050")
        print("   POST /parse        → parse document")
        print("   POST /detect-type  → detect doc type")
        print("   GET  /health       → service health")
        app.run(host="0.0.0.0", port=5050, debug=True)
