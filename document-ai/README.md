# FIN-OS Document AI

> FastAPI · pdfplumber · pytesseract · Ollama  
> **Port:** 8004 | **Version:** v1 | **Updated:** July 2026

AI-powered document parser that extracts structured financial data from uploaded PDFs and images. Supports salary slips, credit card statements, ITR forms, broker notes, and bank statements.

---

## Folder Structure

```
document-ai/
├── server.py           ← FastAPI entry point (all logic in one file)
├── requirements.txt    ← Python dependencies
└── Dockerfile          ← Container build
```

---

## Supported Document Types

| Type | Input | Extracted fields |
|---|---|---|
| `salary_slip` | PDF / image | `take_home`, `gross`, `hra`, `allowances`, `employer`, `month`, `year` |
| `credit_card` | PDF | `transactions[]` with `date`, `amount`, `category`, `merchant` |
| `itr` | PDF | `income`, `deductions` (80C, HRA, NPS), `tax_paid`, `refund` |
| `broker_note` | PDF | `symbol`, `qty`, `price`, `side` (buy/sell), `exchange`, `date`, `charges` |
| `bank_statement` | PDF | `transactions[]`, `opening_balance`, `closing_balance`, `patterns` |

---

## Processing Pipeline

```
File Upload (PDF / PNG / JPG, max 10 MB)
    ↓
Text Extraction
  ├─ PDF  → pdfplumber (native text layer)
  └─ Image → pytesseract (OCR)
    ↓
Document Type Detection
  (keyword scoring: "gross salary", "credit card", "ITR", etc.)
    ↓
LLM Structured Extraction
  (Ollama: qwen3:14b, zero-shot JSON prompt)
    ↓
JSON Response → browser
```

---

## API Endpoints

### `POST /extract`

Upload a document file and get structured JSON back.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | File | PDF, PNG, or JPG — max 10 MB |
| `doc_type` | string (optional) | Override auto-detection: `salary_slip` / `credit_card` / `itr` / `broker_note` / `bank_statement` |

**Response:**

```json
{
  "doc_type": "salary_slip",
  "data": {
    "take_home": 87500,
    "gross": 110000,
    "hra": 15000,
    "allowances": 7500,
    "employer": "Infosys Ltd",
    "month": "June",
    "year": 2026
  },
  "raw_text_preview": "INFOSYS LIMITED\nPay Slip for June 2026...",
  "confidence": 0.91
}
```

### `GET /health`

```json
{ "status": "ok", "model": "qwen3:14b", "ocr": true }
```

### `GET /docs`

FastAPI auto-generated Swagger UI.

---

## Setup

### 1. System dependencies (OCR)

```bash
# macOS
brew install tesseract

# Ubuntu / Debian
sudo apt install tesseract-ocr
```

### 2. Python dependencies

```bash
cd document-ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment variables

```bash
OLLAMA_BASE_URL=http://localhost:11434   # default
OLLAMA_MODEL=qwen3:14b                  # default; qwen3:8b works well too
```

### 4. Start

```bash
# Ollama must be running
ollama serve
ollama pull qwen3:14b

uvicorn server:app --port 8004 --reload
```

---

## Docker

```bash
docker build -t finos-document-ai .
docker run -p 8004:8004 \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  finos-document-ai
```

---

## File Size & Type Limits

| Constraint | Value |
|---|---|
| Max file size | 10 MB |
| Accepted MIME types | `application/pdf`, `image/png`, `image/jpeg` |

Files exceeding limits return `413 Payload Too Large`. Unsupported types return `415 Unsupported Media Type`.

---

## Dependencies

```
fastapi, uvicorn       — API server
pdfplumber             — PDF text extraction (native layer)
pytesseract            — OCR fallback for scanned PDFs / images
Pillow                 — Image loading for pytesseract
httpx                  — Async calls to Ollama
python-multipart       — multipart/form-data parsing
```

---

## Integration with FIN-OS

The `document-ai.html` page in `html/` uploads documents to this service and displays the extracted data:
- Salary slips → pre-fills income in the budget tracker
- Credit card statements → bulk-imports transactions
- ITR documents → pre-fills tax planning with actual numbers
- Broker notes → bulk-imports trades into the Trade Journal
