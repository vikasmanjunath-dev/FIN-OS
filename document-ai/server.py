"""
FIN-OS Document AI Server  v1
==============================
Extracts structured financial data from uploaded documents (PDF/PNG/JPG).

Document types supported:
  salary_slip      → take_home, gross, hra, allowances, employer, month, year
  credit_card      → transactions list with date/amount/category/merchant
  itr              → income, deductions (80C, HRA, NPS), tax_paid, refund
  broker_note      → symbol, qty, price, side (buy/sell), exchange, date, charges
  bank_statement   → transactions list, opening_balance, closing_balance, patterns

Pipeline:
  File Upload → Text Extraction (pdfplumber / pytesseract) →
  Type Detection → LLM Structured Extraction (Ollama) → JSON Response

Run:
  uvicorn server:app --port 8004 --reload
"""

import io
import json
import os
import re
from typing import Optional

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# ── Config ───────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:14b")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
SUPPORTED_MIME_TYPES = {"application/pdf", "image/png", "image/jpeg"}

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="FIN-OS Document AI",
    description="Extracts structured financial data from uploaded documents.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Text extraction ──────────────────────────────────────────────────────────
def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Use pdfplumber to extract text from all pages."""
    import pdfplumber

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def extract_text_from_image(file_bytes: bytes) -> str:
    """Try pytesseract; return empty string if tesseract not installed."""
    try:
        import pytesseract
        from PIL import Image

        img = Image.open(io.BytesIO(file_bytes))
        return pytesseract.image_to_string(img, lang="eng")
    except ImportError:
        return ""
    except Exception:
        return ""


# ── Auto-detect document type ────────────────────────────────────────────────
def detect_doc_type(text: str, filename: str) -> tuple:
    """
    Rule-based document type detection from text content + filename.
    Returns (doc_type, confidence).
    """
    text_lower = text.lower()
    fname_lower = filename.lower()

    scores = {
        "salary_slip": 0,
        "credit_card": 0,
        "itr": 0,
        "broker_note": 0,
        "bank_statement": 0,
    }

    # Salary slip signals
    for kw in [
        "salary slip", "payslip", "pay stub", "gross salary", "net pay",
        "basic salary", "hra", "provident fund", "epf", "professional tax",
        "take home", "ctc", "cost to company", "in hand",
    ]:
        if kw in text_lower:
            scores["salary_slip"] += 2
    if any(x in fname_lower for x in ["salary", "payslip", "pay_slip", "payroll"]):
        scores["salary_slip"] += 5

    # Credit card statement signals
    for kw in [
        "credit card", "statement", "minimum due", "total outstanding",
        "payment due", "credit limit", "reward points", "closing balance",
    ]:
        if kw in text_lower:
            scores["credit_card"] += 2
    if any(x in fname_lower for x in ["cc", "credit", "card_statement"]):
        scores["credit_card"] += 5

    # ITR signals
    for kw in [
        "income tax return", "itr", "assessment year", "pan", "aadhaar",
        "total income", "gross total income", "deductions", "80c", "tax payable",
        "refund", "acknowledgement number", "form 16",
    ]:
        if kw in text_lower:
            scores["itr"] += 2
    if any(x in fname_lower for x in ["itr", "income_tax", "form16", "form_16"]):
        scores["itr"] += 5

    # Broker note signals
    for kw in [
        "contract note", "trade confirmation", "nse", "bse", "isin",
        "settlement", "brokerage", "securities", "equity", "zerodha",
        "groww", "upstox", "angel", "quantity", "rate", "buy", "sell",
    ]:
        if kw in text_lower:
            scores["broker_note"] += 1
    if any(x in fname_lower for x in ["contract", "trade", "broker", "order"]):
        scores["broker_note"] += 5

    # Bank statement signals
    for kw in [
        "bank statement", "account statement", "opening balance",
        "closing balance", "debit", "credit", "upi", "neft", "imps", "rtgs",
        "atm", "cheque", "transaction date",
    ]:
        if kw in text_lower:
            scores["bank_statement"] += 2
    if any(x in fname_lower for x in ["bank", "statement", "account_statement"]):
        scores["bank_statement"] += 5

    best = max(scores, key=scores.get)
    confidence = min(0.99, scores[best] / 20)
    if scores[best] == 0:
        best = "unknown"
        confidence = 0.0
    return best, confidence


# ── LLM extraction prompts ──────────────────────────────────────────────────
EXTRACTION_PROMPTS = {
    "salary_slip": """Extract these fields from this Indian salary slip. Return ONLY valid JSON, nothing else.

Fields to extract:
{
  "employee_name": "string or null",
  "employer": "company name or null",
  "month": "e.g. March 2026 or null",
  "gross_salary": number_in_rupees_or_null,
  "basic_salary": number_or_null,
  "hra": number_or_null,
  "special_allowance": number_or_null,
  "other_allowances": number_or_null,
  "epf_deduction": number_or_null,
  "professional_tax": number_or_null,
  "income_tax_tds": number_or_null,
  "total_deductions": number_or_null,
  "net_take_home": number_or_null,
  "pf_number": "string or null",
  "uan": "string or null"
}

Salary slip text:
""",

    "credit_card": """Extract transactions from this Indian credit card statement. Return ONLY valid JSON.

{
  "card_name": "e.g. HDFC Regalia or null",
  "statement_period": "e.g. Jan 2026 or null",
  "opening_balance": number_or_null,
  "closing_balance": number_or_null,
  "minimum_due": number_or_null,
  "total_due": number_or_null,
  "payment_due_date": "YYYY-MM-DD or null",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "merchant/description",
      "amount": number_positive_for_debit,
      "type": "debit or credit",
      "category": "guess: food/transport/shopping/entertainment/emi/other"
    }
  ]
}

Statement text:
""",

    "itr": """Extract tax information from this Indian Income Tax Return or Form 16. Return ONLY valid JSON.

{
  "pan": "string or null",
  "assessment_year": "e.g. 2025-26 or null",
  "name": "string or null",
  "gross_total_income": number_or_null,
  "deductions_80c": number_or_null,
  "deductions_80d": number_or_null,
  "deductions_nps_80ccd": number_or_null,
  "hra_exemption": number_or_null,
  "total_deductions": number_or_null,
  "taxable_income": number_or_null,
  "tax_payable": number_or_null,
  "tds_paid": number_or_null,
  "advance_tax_paid": number_or_null,
  "refund_due": number_or_null,
  "tax_regime": "old or new or null",
  "itr_form": "ITR-1 or ITR-2 or etc or null"
}

ITR text:
""",

    "broker_note": """Extract trade details from this Indian broker contract note. Return ONLY valid JSON.

{
  "broker": "e.g. Zerodha or null",
  "trade_date": "YYYY-MM-DD or null",
  "settlement_date": "YYYY-MM-DD or null",
  "exchange": "NSE or BSE or null",
  "trades": [
    {
      "symbol": "e.g. RELIANCE or NIFTY24DEC or null",
      "isin": "string or null",
      "side": "buy or sell",
      "quantity": number_or_null,
      "price": number_or_null,
      "gross_amount": number_or_null,
      "asset_type": "equity or futures or options or null"
    }
  ],
  "brokerage": number_or_null,
  "stt": number_or_null,
  "exchange_charges": number_or_null,
  "gst": number_or_null,
  "total_charges": number_or_null,
  "net_amount": number_or_null
}

Contract note text:
""",

    "bank_statement": """Extract account and transaction data from this Indian bank statement. Return ONLY valid JSON.

{
  "bank_name": "string or null",
  "account_number": "last 4 digits only or null",
  "statement_period": "e.g. Jan 2026 or null",
  "opening_balance": number_or_null,
  "closing_balance": number_or_null,
  "total_credits": number_or_null,
  "total_debits": number_or_null,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "narration/description",
      "debit": number_or_null,
      "credit": number_or_null,
      "balance": number_or_null,
      "mode": "UPI/NEFT/IMPS/ATM/CHEQUE/other",
      "category": "salary/rent/food/shopping/emi/investment/other"
    }
  ]
}

Bank statement text:
""",
}


# ── LLM call ─────────────────────────────────────────────────────────────────
async def call_ollama(prompt: str, text: str) -> dict:
    """Call Ollama LLM and parse the JSON response."""
    full_prompt = prompt + text

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": full_prompt,
                "stream": False,
                "options": {"temperature": 0.1},
            },
        )
        response.raise_for_status()
        data = response.json()
        raw_text = data.get("response", "")

    # Strip <think>...</think> blocks (qwen3 reasoning tokens)
    raw_text = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()

    # Extract JSON from the response
    json_match = re.search(r"\{[\s\S]*\}", raw_text)
    if not json_match:
        raise ValueError(f"No JSON found in LLM response: {raw_text[:300]}")

    return json.loads(json_match.group())


# ── Fill actions builder ─────────────────────────────────────────────────────
def build_fill_actions(doc_type: str, extracted: dict) -> list:
    """Map extracted fields to Supabase table.column targets."""
    actions = []

    if doc_type == "salary_slip":
        if extracted.get("net_take_home"):
            actions.append({
                "target": "profiles.monthly_income",
                "value": extracted["net_take_home"],
                "label": "Monthly take-home income",
            })
        if extracted.get("employer"):
            actions.append({
                "target": "profiles.employer",
                "value": extracted["employer"],
                "label": "Employer name",
            })
        if extracted.get("epf_deduction"):
            actions.append({
                "target": "profiles.monthly_epf",
                "value": extracted["epf_deduction"],
                "label": "Monthly EPF contribution",
            })

    elif doc_type == "itr":
        if extracted.get("deductions_80c"):
            actions.append({
                "target": "profiles.invested_80c",
                "value": extracted["deductions_80c"],
                "label": "80C investments this year",
            })
        if extracted.get("deductions_nps_80ccd"):
            actions.append({
                "target": "profiles.has_nps",
                "value": True,
                "label": "NPS account (detected from ITR)",
            })
        if extracted.get("tax_regime"):
            actions.append({
                "target": "profiles.tax_regime",
                "value": extracted["tax_regime"],
                "label": "Tax regime",
            })

    elif doc_type in ("credit_card", "bank_statement"):
        txns = extracted.get("transactions", [])
        if txns:
            actions.append({
                "target": "transactions.bulk_insert",
                "value": txns,
                "label": f"Import {len(txns)} transactions",
            })

    elif doc_type == "broker_note":
        trades = extracted.get("trades", [])
        if trades:
            actions.append({
                "target": "tradebook.bulk_insert",
                "value": trades,
                "label": f"Import {len(trades)} trades to Trade Journal",
            })

    return actions


# ── Extractor availability check ─────────────────────────────────────────────
def _check_pdfplumber() -> bool:
    try:
        import pdfplumber  # noqa: F401
        return True
    except ImportError:
        return False


def _check_tesseract() -> bool:
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


# ── Supported document types metadata ───────────────────────────────────────
SUPPORTED_TYPES_META = {
    "salary_slip": {
        "label": "Salary Slip / Payslip",
        "fields": [
            "employee_name", "employer", "month", "gross_salary", "basic_salary",
            "hra", "special_allowance", "epf_deduction", "professional_tax",
            "income_tax_tds", "net_take_home", "pf_number", "uan",
        ],
        "fill_targets": ["profiles.monthly_income", "profiles.employer", "profiles.monthly_epf"],
    },
    "credit_card": {
        "label": "Credit Card Statement",
        "fields": [
            "card_name", "statement_period", "opening_balance", "closing_balance",
            "minimum_due", "total_due", "payment_due_date", "transactions",
        ],
        "fill_targets": ["transactions.bulk_insert"],
    },
    "itr": {
        "label": "Income Tax Return / Form 16",
        "fields": [
            "pan", "assessment_year", "gross_total_income", "deductions_80c",
            "deductions_80d", "deductions_nps_80ccd", "hra_exemption",
            "taxable_income", "tax_payable", "tds_paid", "refund_due", "tax_regime",
        ],
        "fill_targets": ["profiles.invested_80c", "profiles.has_nps", "profiles.tax_regime"],
    },
    "broker_note": {
        "label": "Broker Contract Note",
        "fields": [
            "broker", "trade_date", "exchange", "trades",
            "brokerage", "stt", "gst", "total_charges", "net_amount",
        ],
        "fill_targets": ["tradebook.bulk_insert"],
    },
    "bank_statement": {
        "label": "Bank Account Statement",
        "fields": [
            "bank_name", "account_number", "statement_period",
            "opening_balance", "closing_balance", "total_credits",
            "total_debits", "transactions",
        ],
        "fill_targets": ["transactions.bulk_insert"],
    },
}


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """Returns service status and available extractor capabilities."""
    pdfplumber_ok = _check_pdfplumber()
    tesseract_ok = _check_tesseract()

    # Check Ollama connectivity
    ollama_ok = False
    ollama_model_available = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if r.status_code == 200:
                ollama_ok = True
                tags = r.json().get("models", [])
                model_names = [m.get("name", "") for m in tags]
                ollama_model_available = any(
                    OLLAMA_MODEL in name or name.startswith(OLLAMA_MODEL.split(":")[0])
                    for name in model_names
                )
    except Exception:
        pass

    return {
        "status": "ok",
        "version": "1.0.0",
        "extractors": {
            "pdfplumber": pdfplumber_ok,
            "tesseract_ocr": tesseract_ok,
        },
        "llm": {
            "ollama_reachable": ollama_ok,
            "model": OLLAMA_MODEL,
            "model_available": ollama_model_available,
            "base_url": OLLAMA_BASE_URL,
        },
        "limits": {
            "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
            "supported_mime_types": list(SUPPORTED_MIME_TYPES),
        },
    }


@app.get("/supported-types")
async def supported_types():
    """Returns list of supported document types with field descriptions."""
    return {
        "supported_types": SUPPORTED_TYPES_META,
        "total": len(SUPPORTED_TYPES_META),
    }


@app.post("/parse/document")
async def parse_document(
    file: UploadFile = File(...),
    doc_type: Optional[str] = Form(None),
):
    """
    Parse a financial document and extract structured data.

    - **file**: PDF, PNG, or JPEG document (max 10 MB)
    - **doc_type**: Optional hint (salary_slip / credit_card / itr / broker_note / bank_statement)
    """
    warnings = []

    # ── Validate file size ───────────────────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB.",
        )

    # ── Validate MIME type ───────────────────────────────────────────────────
    content_type = file.content_type or ""
    filename = file.filename or "upload"

    # Infer content type from extension if not provided
    if content_type not in SUPPORTED_MIME_TYPES:
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        ext_map = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}
        content_type = ext_map.get(ext, content_type)

    if content_type not in SUPPORTED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{content_type}'. Supported: PDF, PNG, JPEG.",
        )

    # ── Extract text ─────────────────────────────────────────────────────────
    raw_text = ""
    try:
        if content_type == "application/pdf":
            raw_text = extract_text_from_pdf(file_bytes)
        else:
            raw_text = extract_text_from_image(file_bytes)
            if not raw_text.strip():
                warnings.append("OCR returned empty text. Tesseract may not be installed.")
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Text extraction failed: {str(e)}",
        )

    if not raw_text.strip():
        warnings.append("No text could be extracted from the document.")

    # ── Detect document type ─────────────────────────────────────────────────
    detected_type, confidence = detect_doc_type(raw_text, filename)

    if doc_type and doc_type in SUPPORTED_TYPES_META:
        # User-provided hint overrides detection
        final_doc_type = doc_type
        if doc_type != detected_type:
            warnings.append(
                f"Provided doc_type='{doc_type}' used; auto-detection suggested '{detected_type}' "
                f"(confidence {confidence:.2f})."
            )
    else:
        final_doc_type = detected_type
        if doc_type and doc_type not in SUPPORTED_TYPES_META:
            warnings.append(f"Unknown doc_type hint '{doc_type}' ignored.")

    if final_doc_type == "unknown" or final_doc_type not in EXTRACTION_PROMPTS:
        return {
            "doc_type": "unknown",
            "confidence": confidence,
            "extracted": {},
            "raw_text_preview": raw_text[:200],
            "fill_actions": [],
            "warnings": warnings + ["Could not determine document type. Try providing doc_type hint."],
        }

    # ── LLM extraction ────────────────────────────────────────────────────────
    extracted = {}
    try:
        prompt = EXTRACTION_PROMPTS[final_doc_type]
        extracted = await call_ollama(prompt, raw_text)
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot reach Ollama at {OLLAMA_BASE_URL}. Make sure Ollama is running.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="LLM extraction timed out. Document may be too long.",
        )
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=422,
            detail=f"LLM returned malformed JSON: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"LLM extraction failed: {str(e)}",
        )

    # ── Build fill actions ────────────────────────────────────────────────────
    fill_actions = build_fill_actions(final_doc_type, extracted)

    return {
        "doc_type": final_doc_type,
        "confidence": round(confidence, 4),
        "extracted": extracted,
        "raw_text_preview": raw_text[:200],
        "fill_actions": fill_actions,
        "warnings": warnings,
    }
