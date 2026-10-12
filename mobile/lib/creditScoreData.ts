// Generated from js/finos-credit-score.js (BANDS and TIPS), so the wording is the website's exactly. Do not edit by hand:
// __tests__/creditScore.parity.test.mts compares it with the website's own file.

export interface Band { min: number; max: number; label: string; color: string; icon: string; hlRate: number; desc: string }
export interface Tip { priority: 'HIGH' | 'MED' | 'LOW'; tip: string; detail: string; impact: string }

export const BANDS: Band[] = [
  {
    "min": 800,
    "max": 900,
    "label": "Excellent",
    "color": "#22D3A6",
    "icon": "🏆",
    "hlRate": 8.5,
    "desc": "You qualify for the best home loan rates and highest credit limits."
  },
  {
    "min": 750,
    "max": 799,
    "label": "Very Good",
    "color": "#4ADE80",
    "icon": "✅",
    "hlRate": 8.75,
    "desc": "Strong credit profile. Minor improvements push you into the top tier."
  },
  {
    "min": 700,
    "max": 749,
    "label": "Good",
    "color": "#FFB347",
    "icon": "👍",
    "hlRate": 9,
    "desc": "Most lenders will approve you, but premium rates need a higher score."
  },
  {
    "min": 650,
    "max": 699,
    "label": "Fair",
    "color": "#FFA07A",
    "icon": "⚠️",
    "hlRate": 9.5,
    "desc": "Approvals possible but at higher rates. Focus on payment discipline."
  },
  {
    "min": 600,
    "max": 649,
    "label": "Poor",
    "color": "#FF6B6B",
    "icon": "🚨",
    "hlRate": 10.5,
    "desc": "Some lenders will decline. Secured cards and on-time payments help most."
  },
  {
    "min": 300,
    "max": 599,
    "label": "Very Poor",
    "color": "#FF3B3B",
    "icon": "💀",
    "hlRate": 0,
    "desc": "Most credit applications will be declined. Start with a secured credit card."
  }
];

export const TIPS: Record<'utilization' | 'payments' | 'age' | 'inquiries' | 'mix', Tip[]> = {
  "utilization": [
    {
      "priority": "HIGH",
      "tip": "Reduce credit utilization below 30%",
      "detail": "Your current utilization is above 30% — the key CIBIL threshold. Pay down balances or request a limit increase to drop below.",
      "impact": "+30-50 pts"
    },
    {
      "priority": "MED",
      "tip": "Push utilization below 10% for max score",
      "detail": "Keeping utilization under 10% can add 15-25 points over 3-6 months.",
      "impact": "+15-25 pts"
    }
  ],
  "payments": [
    {
      "priority": "HIGH",
      "tip": "Never miss an EMI or credit card due date",
      "detail": "A single 30-day late payment can drop your score by 50-100 points and stays on record for 7 years. Set auto-pay for the minimum amount.",
      "impact": "Protect score"
    },
    {
      "priority": "HIGH",
      "tip": "Clear any existing delinquencies",
      "detail": "Past-due accounts (DPD > 0) are the single biggest negative factor. Contact the lender, negotiate a settlement, and get a NOC/closure letter.",
      "impact": "+50-100 pts"
    }
  ],
  "age": [
    {
      "priority": "LOW",
      "tip": "Keep your oldest credit card open",
      "detail": "Even if you don't use it, your oldest account raises the average credit age — a 15% scoring factor.",
      "impact": "+5-15 pts"
    }
  ],
  "inquiries": [
    {
      "priority": "MED",
      "tip": "Avoid multiple loan applications within 6 months",
      "detail": "Each hard inquiry from a lender drops your score ~5-10 pts and stays visible for 2 years. Use pre-approval checks (soft inquiries) first.",
      "impact": "+5-10 pts per avoided inquiry"
    }
  ],
  "mix": [
    {
      "priority": "LOW",
      "tip": "Maintain a healthy mix of secured + unsecured credit",
      "detail": "Having both a home/car loan (secured) and a credit card (unsecured) demonstrates credit maturity. Credit mix is 10% of the score.",
      "impact": "+5-10 pts"
    }
  ]
} as any;
