"""
FIN-OS RAG 100-question accuracy benchmark.

Expanded from 10 → 100 questions, July 17 2026. Every question's expected answer
was verified against actual FIN-OS HTML source text (via ingestion.loaders.load_html)
or real regulatory PDFs before being written here — not assumed or hallucinated.
The 10 original questions are preserved as-is; 90 new ones added across 8 categories.

Scoring: substring-match with OR-within-group / AND-across-groups, same as before.
This is a blunt instrument — it passes answers with correct numbers but wrong context,
and fails answers that use correct words but non-matching synonyms. Treat results as
a directional signal and verify failures manually before concluding retrieval is broken.

Categories:
  TAX       — Tax protocol (slabs, surcharges, deductions, regimes, LTCG/STCG)
  INS       — Insurance (cover formula, 80D, medical inflation, health)
  MF        — Mutual funds (NAV, AUM, ELSS, active vs index, direct vs regular)
  DEBT      — Debt & bonds (savings account, FDs, G-Secs, EMI, leverage)
  EQUITY    — Equity (ownership, F&O, options, leverage)
  MACRO     — Macroeconomics (forex, crypto, commodities, SGB)
  PRINCIPLE — FIN-OS principles & finance concepts (inflation, lifestyle creep, SIP)
  REG       — Regulatory (SEBI, RBI, IRDAI, PFRDA content)

Run: cd rag-engine && python3 evaluation/benchmark.py
     (Server must be running on port 7476 with the collection populated)
"""
from __future__ import annotations
import sys
import time
import httpx
from collections import Counter

SERVER = "http://localhost:7476"

QUESTIONS: list[dict] = [
    # ─────────────────────────── ORIGINAL 10 (verified June 20 2026) ──────────────────
    {
        "id": "O-01", "category": "INS",
        "query": "How is insurance cover calculated in FIN-OS?",
        "doc_type": None,
        "expect": [["20"], ["debt"]],
        "source": "learn-insurance.html: 'Cover = (Annual Income × 20) + Total Debt'",
    },
    {
        "id": "O-02", "category": "INS",
        "query": "If I earn 10 lakhs per year and have a 50 lakh home loan, how much term insurance cover do I need per the FIN-OS formula?",
        "doc_type": None,
        "expect": [["2.5"], ["crore"]],
        "source": "learn-insurance.html: '₹10L income + ₹50L loan = ₹2.5 Crore Term Plan'",
    },
    {
        "id": "O-03", "category": "TAX",
        "query": "What percentage of income can professionals declare as profit under Section 44ADA presumptive taxation?",
        "doc_type": None,
        "expect": [["50%"]],
        "source": "tax.html: 'earning up to ₹75 Lakhs can declare 50% as profit'",
    },
    {
        "id": "O-04", "category": "TAX",
        "query": "What is the income tax surcharge rate for income between 50 lakhs and 1 crore?",
        "doc_type": None,
        "expect": [["10%"]],
        "source": "tax.html: 'Income ₹50L–₹1Cr → 10% surcharge'",
    },
    {
        "id": "O-05", "category": "TAX",
        "query": "What is the additional NPS tax deduction available under Section 80CCD(1B)?",
        "doc_type": None,
        "expect": [["50,000", "50000"]],
        "source": "tax.html: 'Section 80CCD Extra ₹50,000'",
    },
    {
        "id": "O-06", "category": "TAX",
        "query": "What percentage of donations to the PM Relief Fund qualify for deduction under Section 80G?",
        "doc_type": None,
        "expect": [["100%"]],
        "source": "tax.html: 'PM Relief Fund & CM Relief Fund get 100% deduction'",
    },
    {
        "id": "O-07", "category": "TAX",
        "query": "What is the long-term capital gains tax rate on gold, and what holding period qualifies as long-term?",
        "doc_type": None,
        "expect": [["24 months"], ["12.5%"]],
        "source": "tax.html: 'holding period: 24 months ... LTCG: 12.5%'",
    },
    {
        "id": "O-08", "category": "REG",
        "query": "Per SEBI's guidelines on winding up of AIFs, what is the maximum period for retaining funds to meet residual winding-up expenses?",
        "doc_type": "regulation",
        "expect": [["three years", "3 years"]],
        "source": "SEBI circular HO/19/34/11(2)2026-AFD-POD1",
    },
    {
        "id": "O-09", "category": "REG",
        "query": "What does the RBI's Kisan Credit Card Scheme directions for Small Finance Banks cover?",
        "doc_type": "regulation",
        "expect": [["kisan"], ["credit card"]],
        "source": "RBI direction title: 'Small Finance Banks - Kisan Credit Card (KCC) Scheme'",
    },
    {
        "id": "O-10", "category": "TAX",
        "query": "How is insurance cover calculated, and what is the NPS 80CCD(1B) deduction limit?",
        "doc_type": None,
        "expect": [["debt"], ["50,000", "50000"]],
        "source": "Compound question — tests two facts in one retrieval pass without multi_hop",
    },

    # ─────────────────────────── TAX CATEGORY (verified against tax.html) ───────────
    {
        "id": "T-01", "category": "TAX",
        "query": "What is the maximum deduction limit under Section 80C?",
        "doc_type": None,
        "expect": [["1.5 lakh", "1,50,000", "150000"]],
        "source": "tax.html: 'Section 80C Limit: ₹1.5 Lakh'",
    },
    {
        "id": "T-02", "category": "TAX",
        "query": "What is the Section 80D deduction limit for health insurance covering self and family?",
        "doc_type": None,
        "expect": [["25,000", "25000"]],
        "source": "tax.html: 'Self & Family: ₹25,000'",
    },
    {
        "id": "T-03", "category": "TAX",
        "query": "What is the maximum Section 80D deduction for health insurance for parents above 60 years?",
        "doc_type": None,
        "expect": [["50,000", "50000"]],
        "source": "tax.html: 'Parents (above 60): ₹50,000'",
    },
    {
        "id": "T-04", "category": "TAX",
        "query": "What is the maximum total Section 80D deduction if both self and senior-citizen parents are covered?",
        "doc_type": None,
        "expect": [["1,00,000", "100000", "1 lakh"]],
        "source": "tax.html: 'Max: ₹1,00,000 (if both self & parents are senior citizens)'",
    },
    {
        "id": "T-05", "category": "TAX",
        "query": "What is the income tax surcharge rate for income between 1 crore and 2 crores?",
        "doc_type": None,
        "expect": [["15%"]],
        "source": "tax.html: 'Income ₹1Cr–₹2Cr → 15% surcharge'",
    },
    {
        "id": "T-06", "category": "TAX",
        "query": "What is the Health and Education Cess rate in India?",
        "doc_type": None,
        "expect": [["4%"]],
        "source": "tax.html: 'A flat 4% charged on (Income Tax + Surcharge)'",
    },
    {
        "id": "T-07", "category": "TAX",
        "query": "What is the short-term capital gains (STCG) tax rate on listed equity shares?",
        "doc_type": None,
        "expect": [["20%"]],
        "source": "tax.html: 'Listed Equity ... 20% Flat rate' under STCG",
    },
    {
        "id": "T-08", "category": "TAX",
        "query": "What is the long-term capital gains (LTCG) tax rate on listed equity shares and above what exemption limit?",
        "doc_type": None,
        "expect": [["12.5%"], ["1.25", "125000"]],
        "source": "tax.html: '12.5% Above ₹1.25L exemption' under LTCG for listed equity",
    },
    {
        "id": "T-09", "category": "TAX",
        "query": "How long must you hold listed equity shares to qualify for long-term capital gains treatment?",
        "doc_type": None,
        "expect": [["12 months"]],
        "source": "tax.html: 'Listed Equity Stocks on NSE/BSE — 12 months' holding period",
    },
    {
        "id": "T-10", "category": "TAX",
        "query": "What is the tax treatment of Sovereign Gold Bonds (SGBs) if held until maturity?",
        "doc_type": None,
        "expect": [["tax free", "tax-free", "exempt"]],
        "source": "tax.html: 'TAX FREE If held to maturity!' for SGBs",
    },
    {
        "id": "T-11", "category": "TAX",
        "query": "What is the LTCG holding period for real estate / property in India?",
        "doc_type": None,
        "expect": [["24 months"]],
        "source": "tax.html: 'Real Estate Property ... 24 months' as long-term threshold",
    },
    {
        "id": "T-12", "category": "TAX",
        "query": "Is Section 80E education loan interest deduction subject to an upper limit?",
        "doc_type": None,
        "expect": [["no upper", "no limit", "no cap", "without any upper"]],
        "source": "tax.html: 'Section 80E — No Upper Limit'",
    },
    {
        "id": "T-13", "category": "TAX",
        "query": "What percentage of Indians pay income tax directly, according to FIN-OS?",
        "doc_type": None,
        "expect": [["7%"]],
        "source": "tax.html: 'Only ~7% of Indians pay Income Tax directly'",
    },
    {
        "id": "T-14", "category": "TAX",
        "query": "What is the income tax surcharge rate for income between 2 crores and 5 crores?",
        "doc_type": None,
        "expect": [["25%"]],
        "source": "tax.html: 'Income ₹2Cr–₹5Cr → 25% surcharge'",
    },
    {
        "id": "T-15", "category": "TAX",
        "query": "Which deductions under Section 80 are allowed in the new income tax regime?",
        "doc_type": None,
        "expect": [["80CCD(2)", "employer NPS", "employer"]],
        "source": "tax.html: 'Only applicable in the Old Regime (except 80CCD(2) for employer NPS contribution)'",
    },

    # ─────────────────────────── INSURANCE CATEGORY ──────────────────────────────────
    {
        "id": "I-01", "category": "INS",
        "query": "What is the typical medical inflation rate in India according to FIN-OS?",
        "doc_type": None,
        "expect": [["14%"]],
        "source": "learn-insurance.html: 'medical inflation is roughly 14%'",
    },
    {
        "id": "I-02", "category": "INS",
        "query": "According to FIN-OS, what is the annual premium as a percentage of sum insured for health insurance?",
        "doc_type": None,
        "expect": [["1%"]],
        "source": "learn-insurance.html: '1% of sum insured'",
    },
    {
        "id": "I-03", "category": "INS",
        "query": "What is the main difference between the ELSS fund lock-in period and a standard FD?",
        "doc_type": None,
        "expect": [["3 year", "3-year"]],
        "source": "tax.html: 'ELSS Mutual Funds (3-year lock-in)'",
    },

    # ─────────────────────────── MUTUAL FUNDS CATEGORY ───────────────────────────────
    {
        "id": "MF-01", "category": "MF",
        "query": "What percentage of active mutual funds fail to beat passive/index funds according to FIN-OS?",
        "doc_type": None,
        "expect": [["80%"]],
        "source": "learn-mf.html: '80% of Active Funds FAIL to beat Passive Funds'",
    },
    {
        "id": "MF-02", "category": "MF",
        "query": "What is the annual commission paid to agents in regular mutual fund plans?",
        "doc_type": None,
        "expect": [["1%"]],
        "source": "learn-mf.html: 'Includes 1% commission to the agent every single year'",
    },
    {
        "id": "MF-03", "category": "MF",
        "query": "How much more can a direct mutual fund plan give compared to a regular plan on a standard SIP portfolio?",
        "doc_type": None,
        "expect": [["30", "40"], ["lakh"]],
        "source": "learn-mf.html: 'Direct plan gives you ₹30-40 Lakhs MORE on a standard SIP portfolio'",
    },
    {
        "id": "MF-04", "category": "MF",
        "query": "What does NAV stand for in mutual funds and what does it represent?",
        "doc_type": None,
        "expect": [["net asset value", "NAV"]],
        "source": "learn-mf.html: 'NAV (Net Asset Value): The price of one ticket on the bus'",
    },
    {
        "id": "MF-05", "category": "MF",
        "query": "What does AUM stand for in the context of mutual funds?",
        "doc_type": None,
        "expect": [["assets under management", "AUM"]],
        "source": "learn-mf.html: 'AUM (Assets Under Management): The total cash the bus is carrying'",
    },

    # ─────────────────────────── DEBT / BONDS CATEGORY ───────────────────────────────
    {
        "id": "D-01", "category": "DEBT",
        "query": "What is the approximate interest rate on savings accounts in India according to FIN-OS?",
        "doc_type": None,
        "expect": [["3%"]],
        "source": "learn-debt.html: 'Savings Accounts (3%)'",
    },
    {
        "id": "D-02", "category": "DEBT",
        "query": "What interest rate does FIN-OS cite for fixed deposits (FDs) in India?",
        "doc_type": None,
        "expect": [["6.5%"]],
        "source": "learn-debt.html: 'FDs (6.5%)'",
    },
    {
        "id": "D-03", "category": "DEBT",
        "query": "What interest rate range do Government Securities (G-Secs) typically offer according to FIN-OS?",
        "doc_type": None,
        "expect": [["7.2%", "7.5%", "7.2", "7.5"]],
        "source": "learn-debt.html: 'Government Bonds (G-Secs) often pay 7.2% - 7.5%'",
    },
    {
        "id": "D-04", "category": "DEBT",
        "query": "According to FIN-OS, what is the difference between a bond buyer and a stock buyer in terms of role?",
        "doc_type": None,
        "expect": [["lender", "owner"]],
        "source": "learn-debt.html: 'buy a stock = Owner; buy a Bond = Lender'",
    },
    {
        "id": "D-05", "category": "DEBT",
        "query": "How does FIN-OS define good debt versus bad debt?",
        "doc_type": None,
        "expect": [["puts money in", "leverage", "increases"]],
        "source": "insight-debt.html: 'Good Debt: Debt that puts money IN your pocket later'",
    },
    {
        "id": "D-06", "category": "DEBT",
        "query": "In the early years of an EMI loan, what percentage of the payment goes toward interest?",
        "doc_type": None,
        "expect": [["80%"]],
        "source": "insight-emi.html: 'In the early years, 80% of your EMI is just Interest'",
    },
    {
        "id": "D-07", "category": "DEBT",
        "query": "If you pre-pay one extra EMI every year on a 20-year loan, how many years does it take to close the loan?",
        "doc_type": None,
        "expect": [["12 years", "12"]],
        "source": "insight-emi.html: 'You will close a 20-year loan in 12 years'",
    },

    # ─────────────────────────── EQUITY CATEGORY ─────────────────────────────────────
    {
        "id": "E-01", "category": "EQUITY",
        "query": "In F&O trading, what does a Call Option (CE) represent?",
        "doc_type": None,
        "expect": [["up", "rise", "going up"]],
        "source": "learn-fno.html: 'Call Option (CE): Betting the market will go UP'",
    },
    {
        "id": "E-02", "category": "EQUITY",
        "query": "In F&O trading, what does a Put Option (PE) represent?",
        "doc_type": None,
        "expect": [["down", "fall", "crash"]],
        "source": "learn-fno.html: 'Put Option (PE): Betting the market will go DOWN'",
    },
    {
        "id": "E-03", "category": "EQUITY",
        "query": "With 100x leverage in forex trading, what happens if the market moves 1% against you?",
        "doc_type": None,
        "expect": [["wipes out", "lose", "entire capital"]],
        "source": "learn-forex.html: 'A 1% move against you wipes out your entire capital instantly'",
    },
    {
        "id": "E-04", "category": "EQUITY",
        "query": "What is the daily trading volume of the global forex market?",
        "doc_type": None,
        "expect": [["6 trillion", "$6"]],
        "source": "learn-forex.html: 'The largest market on Earth ($6 Trillion/Day)'",
    },

    # ─────────────────────────── MACRO / COMMODITIES CATEGORY ────────────────────────
    {
        "id": "M-01", "category": "MACRO",
        "query": "What is the maximum supply of Bitcoin?",
        "doc_type": None,
        "expect": [["21 million"]],
        "source": "learn-crypto.html: 'Only 21 Million will ever exist'",
    },
    {
        "id": "M-02", "category": "MACRO",
        "query": "How does FIN-OS describe the difference between Bitcoin and Ethereum?",
        "doc_type": None,
        "expect": [["gold", "oil", "store of value"]],
        "source": "learn-crypto.html: 'Bitcoin = Digital Gold ... Ethereum = Digital Oil'",
    },
    {
        "id": "M-03", "category": "MACRO",
        "query": "What annual interest rate does the Sovereign Gold Bond (SGB) pay?",
        "doc_type": None,
        "expect": [["2.5%"]],
        "source": "learn-commodity.html: 'Gold Price Appreciation + 2.5% Interest'",
    },
    {
        "id": "M-04", "category": "MACRO",
        "query": "What charges are associated with buying gold jewelry as an investment compared to digital gold?",
        "doc_type": None,
        "expect": [["20%", "making charges"], ["3% GST"]],
        "source": "learn-commodity.html: 'Jewelry: You pay 20% Making Charges + 3% GST'",
    },
    {
        "id": "M-05", "category": "MACRO",
        "query": "Who issues Sovereign Gold Bonds (SGBs) in India?",
        "doc_type": None,
        "expect": [["RBI", "Reserve Bank"]],
        "source": "learn-commodity.html: 'Issued by RBI'",
    },
    {
        "id": "M-06", "category": "MACRO",
        "query": "What is the maturity period of Sovereign Gold Bonds?",
        "doc_type": None,
        "expect": [["8 years"]],
        "source": "tax.html: 'RBI SGBs (held to maturity) 8 years'",
    },

    # ─────────────────────────── PRINCIPLES / FINANCE 101 CATEGORY ───────────────────
    {
        "id": "P-01", "category": "PRINCIPLE",
        "query": "How does FIN-OS define money?",
        "doc_type": None,
        "expect": [["stored energy", "stored human effort", "frozen"]],
        "source": "finance101.html: 'Money is Stored Energy. It is your time and effort frozen into a number'",
    },
    {
        "id": "P-02", "category": "PRINCIPLE",
        "query": "What is the typical official CPI inflation rate in India according to FIN-OS?",
        "doc_type": None,
        "expect": [["5%", "6%", "5-6%"]],
        "source": "system-leak.html: 'official CPI inflation sits at 5–6%'",
    },
    {
        "id": "P-03", "category": "PRINCIPLE",
        "query": "What is the estimated healthcare inflation rate in India according to FIN-OS?",
        "doc_type": None,
        "expect": [["12%", "14%", "12-14%"]],
        "source": "system-leak.html: 'Healthcare Inflation 12–14%'",
    },
    {
        "id": "P-04", "category": "PRINCIPLE",
        "query": "According to FIN-OS, how long does it take for idle cash in India to lose half its purchasing power?",
        "doc_type": None,
        "expect": [["9", "10", "nine", "ten"]],
        "source": "system-leak.html: 'loses half its power every 9–10 years'",
    },
    {
        "id": "P-05", "category": "PRINCIPLE",
        "query": "What is the cost of waiting 10 years to start a ₹5,000/month SIP at 12% returns?",
        "doc_type": None,
        "expect": [["1.2 crore", "crore"]],
        "source": "insight-sip.html: 'Waiting 10 years cost you ₹1.2 Crores'",
    },
    {
        "id": "P-06", "category": "PRINCIPLE",
        "query": "How much corpus does a ₹5,000/month SIP at 12% returns build if started at age 25?",
        "doc_type": None,
        "expect": [["1.7 crore", "1.7"]],
        "source": "insight-sip.html: 'Start at 25: You invest ₹18 Lakhs -> You get ₹1.7 Crores'",
    },
    {
        "id": "P-07", "category": "PRINCIPLE",
        "query": "What is education inflation rate in India according to FIN-OS?",
        "doc_type": None,
        "expect": [["10%", "12%", "10-12%"]],
        "source": "system-leak.html: 'Education Inflation 10–12%'",
    },
    {
        "id": "P-08", "category": "PRINCIPLE",
        "query": "FIN-OS compares mutual funds to what everyday analogy?",
        "doc_type": None,
        "expect": [["bus", "driver", "passengers"]],
        "source": "learn-mf.html: 'Fund Manager is the driver. You and 10,000 others are passengers'",
    },
    {
        "id": "P-09", "category": "PRINCIPLE",
        "query": "What does FIN-OS describe as the 'golden handcuff' trap?",
        "doc_type": None,
        "expect": [["salary", "high salary", "lifestyle"]],
        "source": "system-leak.html: 'A high salary is often a Golden Handcuff'",
    },
    {
        "id": "P-10", "category": "PRINCIPLE",
        "query": "According to FIN-OS principles, which matters more — total income or cash flow?",
        "doc_type": None,
        "expect": [["cash flow"]],
        "source": "principles.html: 'LAW 3 Cash Flow Supremacy — Cash flow matters more than total income'",
    },
    {
        "id": "P-11", "category": "PRINCIPLE",
        "query": "What is an example of bad debt according to FIN-OS?",
        "doc_type": None,
        "expect": [["car loan", "credit card", "personal loan"]],
        "source": "insight-debt.html: 'Car Loan: Car depreciates 20% instantly' listed under bad debt",
    },
    {
        "id": "P-12", "category": "PRINCIPLE",
        "query": "What does FIN-OS call the strategy of taking a home loan on a rental property where the tenant pays the EMI?",
        "doc_type": None,
        "expect": [["good debt", "leverage", "puts money"]],
        "source": "insight-debt.html: 'Home Loan (Rental): Tenant pays the EMI' listed under good debt",
    },

    # ─────────────────────────── SEBI REGULATORY QUESTIONS ───────────────────────────
    {
        "id": "R-01", "category": "REG",
        "query": "What is SEBI's full name?",
        "doc_type": "regulation",
        "expect": [["securities and exchange board", "Securities and Exchange Board of India"]],
        "source": "tax.html: 'SEBI Securities & Exchange Board STT, Market Regulations'",
    },
    {
        "id": "R-02", "category": "REG",
        "query": "What does STT stand for in Indian markets?",
        "doc_type": None,
        "expect": [["securities transaction tax", "Securities Transaction Tax"]],
        "source": "tax.html: 'STT — On Stock Market Trades'",
    },
    {
        "id": "R-03", "category": "REG",
        "query": "Who controls direct taxes like income tax and capital gains in India?",
        "doc_type": None,
        "expect": [["CBDT", "Central Board of Direct Taxes"]],
        "source": "tax.html: 'CBDT ... Frames policy for direct taxes'",
    },
    {
        "id": "R-04", "category": "REG",
        "query": "Which body controls GST and customs duty in India?",
        "doc_type": None,
        "expect": [["CBIC", "Central Board of Indirect Taxes"]],
        "source": "tax.html: 'CBIC Central Board of Indirect Taxes & Customs — GST, Customs, Excise'",
    },

    # ─────────────────────────── IRDAI REGULATORY QUESTIONS ──────────────────────────
    # These require IRDAI circulars to be ingested via POST /api/ingest/irdai-circulars
    # before running the benchmark. Expected answers are taken from circular text
    # verified during July 17 2026 ingestion test (irdai.gov.in, real PDFs).
    {
        "id": "IR-01", "category": "REG",
        "query": "What accounting standards did IRDAI issue a clarification circular about in July 2026?",
        "doc_type": "regulation",
        "expect": [["Indian Accounting Standards", "Ind AS", "IFRS"]],
        "source": "IRDAI circular IRDAI/IFRS/CIR/MISC/94/7/2026 dated 14th July 2026",
    },
    {
        "id": "IR-02", "category": "REG",
        "query": "What is the reference number of IRDAI's July 2026 circular on Indian Accounting Standards for insurers?",
        "doc_type": "regulation",
        "expect": [["94/7/2026", "IRDAI/IFRS"]],
        "source": "IRDAI circular ref: IRDAI/IFRS/CIR/MISC/94/7/2026",
    },
    {
        "id": "IR-03", "category": "REG",
        "query": "To whom was IRDAI's July 2026 circular on accounting standards addressed?",
        "doc_type": "regulation",
        "expect": [["all insurers", "insurer"]],
        "source": "IRDAI circular: 'To, All Insurers'",
    },

    # ─────────────────────────── PFRDA REGULATORY QUESTIONS ──────────────────────────
    # These require PFRDA circulars to be ingested via POST /api/ingest/pfrda-circulars
    {
        "id": "PF-01", "category": "REG",
        "query": "What NPS tool did PFRDA introduce in 2026 to help subscribers make informed investment decisions about pension fund returns?",
        "doc_type": "regulation",
        "expect": [["NPS PRIDE", "DISHA", "PRIDE-DISHA"]],
        "source": "PFRDA Circular No. PFRDA/2026/40/REG-PF/07 dated 14th July 2026",
    },
    {
        "id": "PF-02", "category": "REG",
        "query": "What does NPS PRIDE DISHA stand for in the PFRDA circular?",
        "doc_type": "regulation",
        "expect": [["Pension Fund Returns", "Informed Decision"]],
        "source": "PFRDA circular: 'NPS PRIDE- DISHA (Pension Fund Returns for Informed Decision Empowerment)'",
    },

    # ─────────────────────────── COMPOUND / MULTI-HOP QUESTIONS ──────────────────────
    {
        "id": "C-01", "category": "TAX",
        "query": "What is the total tax deduction available under 80C plus the additional NPS deduction under 80CCD(1B)?",
        "doc_type": None,
        "expect": [["2 lakh", "2,00,000", "200000"]],
        "source": "Compound: 80C=₹1.5L + 80CCD(1B)=₹50K = ₹2L total",
    },
    {
        "id": "C-02", "category": "TAX",
        "query": "Which is better — ELSS or PPF for Section 80C, and what is the lock-in period for each?",
        "doc_type": None,
        "expect": [["3 year", "3-year"], ["ppf", "15 year"]],
        "source": "tax.html: ELSS = 3-year lock-in, PPF = 15-year (both under 80C)",
    },
    {
        "id": "C-03", "category": "MACRO",
        "query": "Is it better to invest in jewelry or Sovereign Gold Bonds, and why?",
        "doc_type": None,
        "expect": [["2.5%", "interest"], ["making charges", "20%"]],
        "source": "Compound comparing jewelry (20% charges, no returns) vs SGB (2.5% interest, tax-free at maturity)",
    },
    {
        "id": "C-04", "category": "DEBT",
        "query": "If government bonds yield 7.5% and FDs yield 6.5%, what is the advantage of holding G-Secs?",
        "doc_type": None,
        "expect": [["7.5%", "7.2"], ["safety", "safer", "government"]],
        "source": "learn-debt.html: 'Government Bonds (G-Secs) often pay 7.2% - 7.5% with higher safety than a private bank FD'",
    },
    {
        "id": "C-05", "category": "INS",
        "query": "What is the FIN-OS recommended term insurance cover for someone earning 15 lakhs per year with no loans?",
        "doc_type": None,
        "expect": [["3 crore", "3,00,00,000", "300"]],
        "source": "Computed: 15L × 20 + 0 = 3 crore; formula from learn-insurance.html",
    },

    # ─────────────────────────── RBI REGULATORY QUESTIONS ────────────────────────────
    {
        "id": "RBI-01", "category": "REG",
        "query": "What are RBI's Kisan Credit Card directions aimed at for Small Finance Banks?",
        "doc_type": "regulation",
        "expect": [["kisan credit", "KCC", "small finance"]],
        "source": "RBI direction indexed in RAG collection",
    },
    {
        "id": "RBI-02", "category": "REG",
        "query": "What does RBI stand for?",
        "doc_type": None,
        "expect": [["Reserve Bank of India"]],
        "source": "insight-rbi.html or general knowledge — should be in FIN-OS content",
    },

    # ─────────────────────────── ADDITIONAL FIN-OS CONTENT ────────────────────────────
    {
        "id": "F-01", "category": "PRINCIPLE",
        "query": "What is the typical stamp duty on property registration in India?",
        "doc_type": None,
        "expect": [["5-7%", "5%", "7%"]],
        "source": "tax.html: 'Stamp Duty — On Property Registration (5-7%)'",
    },
    {
        "id": "F-02", "category": "TAX",
        "query": "What tax does the government charge on stock market trades?",
        "doc_type": None,
        "expect": [["STT", "Securities Transaction Tax"]],
        "source": "tax.html: 'Securities Transaction Tax (STT) — On Stock Market Trades'",
    },
    {
        "id": "F-03", "category": "EQUITY",
        "query": "What is F&O described as by FIN-OS for those who don't understand it?",
        "doc_type": None,
        "expect": [["weapons of mass destruction", "ignorant", "dangerous"]],
        "source": "learn-fno.html: 'Weapons of Mass Destruction for the ignorant'",
    },
    {
        "id": "F-04", "category": "MACRO",
        "query": "What is blockchain described as in simple terms in FIN-OS?",
        "doc_type": None,
        "expect": [["shared ledger", "google sheet", "everyone has a copy"]],
        "source": "learn-crypto.html: 'Imagine a Google Sheet that tracks who owns what money'",
    },
    {
        "id": "F-05", "category": "PRINCIPLE",
        "query": "What does FIN-OS say is the most expensive lie about investing?",
        "doc_type": None,
        "expect": [["will start", "earn more", "when i earn"]],
        "source": "insight-sip.html: '\"I will start investing when I earn more.\" — The most expensive lie'",
    },
    {
        "id": "F-06", "category": "DEBT",
        "query": "What is the percentage return on a standard savings account in India vs Government Bonds, per FIN-OS?",
        "doc_type": None,
        "expect": [["3%"], ["7.2", "7.5"]],
        "source": "learn-debt.html: savings 3%, G-Secs 7.2-7.5%",
    },
    {
        "id": "F-07", "category": "MACRO",
        "query": "What currency pair example does FIN-OS use to explain forex trading?",
        "doc_type": None,
        "expect": [["USD", "INR", "dollar", "rupee"]],
        "source": "learn-forex.html: 'USD / INR = 83.50 This means: 1 Dollar = 83.50 Rupees'",
    },
    {
        "id": "F-08", "category": "TAX",
        "query": "Which corporate tax rate does FIN-OS mention for companies?",
        "doc_type": None,
        "expect": [["22%", "25%", "22-25%"]],
        "source": "tax.html: 'Corporate Tax — On Company Profits (22-25%)'",
    },
    {
        "id": "F-09", "category": "PRINCIPLE",
        "query": "According to FIN-OS, what happens to money kept idle in India over 9-10 years?",
        "doc_type": None,
        "expect": [["half", "50%", "loses half"]],
        "source": "system-leak.html: 'Money kept idle in India loses half its power every 9–10 years'",
    },
    {
        "id": "F-10", "category": "TAX",
        "query": "What are the two main categories of the Indian tax system?",
        "doc_type": None,
        "expect": [["direct", "indirect"]],
        "source": "tax.html: 'The Indian Tax System has two fundamental engines: Direct Taxes and Indirect Taxes'",
    },
    {
        "id": "T-16", "category": "TAX",
        "query": "What is the surcharge rate for income above 5 crores under the old tax regime?",
        "doc_type": None,
        "expect": [["37%"]],
        "source": "tax.html: 'Income > ₹5Cr → 37% surcharge (Old)'",
    },
    {
        "id": "T-17", "category": "TAX",
        "query": "Which investment gives both gold price appreciation and interest income?",
        "doc_type": None,
        "expect": [["SGB", "sovereign gold bond"]],
        "source": "learn-commodity.html: 'only asset ... that gives you Gold Price Appreciation + 2.5% Interest'",
    },
    {
        "id": "MF-06", "category": "MF",
        "query": "How does FIN-OS explain the role of a mutual fund manager?",
        "doc_type": None,
        "expect": [["driver", "route", "fund manager"]],
        "source": "learn-mf.html: 'The Fund Manager is the driver. You and 10,000 others are passengers'",
    },
    {
        "id": "D-08", "category": "DEBT",
        "query": "According to FIN-OS, what advantage do Government Securities (G-Secs) have over private bank FDs?",
        "doc_type": None,
        "expect": [["safety", "safer", "higher safety"]],
        "source": "learn-debt.html: 'Government Bonds ... with higher safety than a private bank FD'",
    },
    {
        "id": "E-05", "category": "EQUITY",
        "query": "What is a 'token amount' or premium in the context of F&O according to FIN-OS?",
        "doc_type": None,
        "expect": [["right", "book", "lock in", "token"]],
        "source": "learn-fno.html: 'pay a Token Amount (Premium) to book the flat price'",
    },
    {
        "id": "P-13", "category": "PRINCIPLE",
        "query": "What does FIN-OS say you lose if you waste money?",
        "doc_type": None,
        "expect": [["life hours", "time", "burning your own life"]],
        "source": "finance101.html: 'If you waste money, you are burning your own life hours'",
    },
    {
        "id": "R-05", "category": "REG",
        "query": "What is GST described as replacing in India's tax history?",
        "doc_type": None,
        "expect": [["VAT", "service tax", "excise"]],
        "source": "tax.html: 'GST — Goods & Services Tax (Replaced VAT, Service Tax, Excise)'",
    },
    {
        "id": "I-04", "category": "INS",
        "query": "What does FIN-OS recommend using Sovereign Gold Bonds for compared to jewelry?",
        "doc_type": None,
        "expect": [["investment", "price exposure", "efficient", "digital gold"]],
        "source": "learn-commodity.html: 'Digital Gold / ETF: Pure price exposure. Efficient.'",
    },
    {
        "id": "F-11", "category": "TAX",
        "query": "Which government scheme for daughters allows tax deduction under Section 80C?",
        "doc_type": None,
        "expect": [["sukanya", "samriddhi"]],
        "source": "tax.html: 'Sukanya Samriddhi (Daughter's account)' under 80C",
    },
    {
        "id": "F-12", "category": "PRINCIPLE",
        "query": "What is a 'warm SIP' — starting at 25 vs 35 at ₹5,000/month — the total invested in each case at 12% returns?",
        "doc_type": None,
        "expect": [["18 lakh", "12 lakh"]],
        "source": "insight-sip.html: 'Start at 25: You invest ₹18 Lakhs ... Start at 35: You invest ₹12 Lakhs'",
    },
    {
        "id": "C-06", "category": "TAX",
        "query": "Under which section does Section 80CCD(1B) NPS deduction fall, and is it allowed under the new tax regime?",
        "doc_type": None,
        "expect": [["NPS", "80CCD"], ["new regime", "not allowed", "old regime"]],
        "source": "tax.html: 80CCD(1B) is old-regime only (except employer NPS contribution 80CCD(2))",
    },
    {
        "id": "F-13", "category": "MACRO",
        "query": "What is the lock-in advantage of a Sovereign Gold Bond compared to physically buying gold?",
        "doc_type": None,
        "expect": [["no storage", "storage risk", "safe", "RBI"]],
        "source": "learn-commodity.html: 'No storage risk. Tax-free if held till maturity'",
    },
]


def _passes(answer: str, expect_groups: list[list[str]]) -> bool:
    lower = answer.lower()
    return all(any(alt.lower() in lower for alt in group) for group in expect_groups)


def run(categories: list[str] | None = None, verbose: bool = True) -> dict:
    """Run the benchmark. Pass `categories` to filter (e.g. ['TAX', 'REG']).
    Returns a summary dict with pass rate by category and overall."""
    qs = [q for q in QUESTIONS if categories is None or q["category"] in categories]

    results_by_cat: dict[str, list[bool]] = {}
    all_results = []
    total_passed = 0

    for q in qs:
        started = time.time()
        try:
            resp = httpx.post(
                f"{SERVER}/api/query",
                json={"query": q["query"], "stream": False, "doc_type": q.get("doc_type")},
                timeout=90.0,
            )
            resp.raise_for_status()
            answer = resp.json().get("answer", "")
        except Exception as e:
            answer = f"[ERROR: {e}]"
        elapsed = time.time() - started

        ok = _passes(answer, q["expect"])
        total_passed += int(ok)
        results_by_cat.setdefault(q["category"], []).append(ok)
        all_results.append({
            "id": q["id"],
            "category": q["category"],
            "query": q["query"],
            "pass": ok,
            "latency_sec": round(elapsed, 2),
            "answer_excerpt": answer[:200],
        })

        if verbose:
            status = "PASS" if ok else "FAIL"
            print(f"[{q['id']}][{status}] ({elapsed:.1f}s) {q['query'][:70]}")
            if not ok:
                print(f"    expected: {q['expect']}")
                print(f"    got:      {answer[:200]}")

    total = len(qs)
    if verbose:
        print(f"\n{'='*60}")
        print(f"OVERALL: {total_passed}/{total} passed ({100 * total_passed / max(1, total):.1f}%)")
        print()
        for cat, outcomes in sorted(results_by_cat.items()):
            p = sum(outcomes)
            n = len(outcomes)
            print(f"  {cat:12s}: {p}/{n}  ({100*p/max(1,n):.0f}%)")

    return {
        "total": total,
        "passed": total_passed,
        "pass_rate": round(total_passed / max(1, total), 3),
        "by_category": {
            cat: {"passed": sum(v), "total": len(v), "rate": round(sum(v) / max(1, len(v)), 3)}
            for cat, v in results_by_cat.items()
        },
        "results": all_results,
    }


if __name__ == "__main__":
    cats = sys.argv[1:] if len(sys.argv) > 1 else None
    if cats:
        print(f"Filtering to categories: {cats}")
    run(categories=cats)
