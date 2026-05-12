export const ICONS = {
  Housing: "🏠",
  Groceries: "🛒",
  Dining: "🍱",
  Vice: "🚬",
  Transport: "🚗",
  Cabs: "🚕",
  Debt: "💳",
  Subscriptions: "👻",
  Shopping: "🛍️",
  Tech: "💻",
  Entertainment: "🎬",
  Health: "💊",
  Fitness: "🏋️",
  Invest_Equity: "📈",
  Invest_Safe: "🏦",
  Education: "🧠",
  Taxes: "🏛️",
  Other: "⚡",
};

// Colors map to the root of the behavior (need, want, debt, save)
export const CATEGORY_COLORS = {
  need: { text: "var(--cyan)",  bg: "rgba(6,182,212,0.12)",   border: "rgba(6,182,212,0.3)"   },
  want: { text: "var(--gold)",  bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)"  },
  debt: { text: "var(--red)",   bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)"   },
  save: { text: "var(--green)", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)"  },
};

// DEEP PSYCHOLOGICAL BEHAVIOR MATRIX
export const BEHAVIOR_TYPES = [
  {
    group: "🛡️ Base Level (The Foundation)",
    options: [
      { value: "need_survival", label: "Survival (Roti, Kapda, Makaan, Meds)" },
      { value: "need_obligation", label: "Duty (Taxes, Bills, Maid, EMI-Home)" }
    ]
  },
  {
    group: "🩸 Wealth Destroyers (The Leaks)",
    options: [
      { value: "want_lifestyle", label: "Lifestyle Creep (Dining out, Pubs)" },
      { value: "want_impulse", label: "Dopamine Impulse (Late-night Swiggy, Amazon)" },
      { value: "want_ego", label: "Ego / Status Tax (Brands, VIP, Show-off)" },
      { value: "debt_toxic", label: "Toxic Debt (CC Minimums, BNPL, Car EMI)" }
    ]
  },
  {
    group: "🚀 Future Builders (The Escape)",
    options: [
      { value: "save_liquid", label: "Liquid Buffer (Emergency, FD)" },
      { value: "save_wealth", label: "Wealth Engine (Index Funds, Equity, SGB)" },
      { value: "save_self", label: "Self-Leverage (Courses, Books, Gym)" }
    ]
  }
];

// GRANULAR TRANSACTION CLASSIFICATION
export const TRANSACTION_TYPES = [
  { value: "Housing", label: "🏠 Housing (Rent/Maintenance/Maid)" },
  { value: "Groceries", label: "🛒 Groceries & Essentials" },
  { value: "Dining", label: "🍱 Dining (Swiggy/Zomato/Cafes)" },
  { value: "Vice", label: "🚬 Vices (Alcohol/Smokes/Parties)" },
  { value: "Transport", label: "🚗 Transport (Fuel/Metro/Tolls)" },
  { value: "Cabs", label: "🚕 Convenience (Ola/Uber/Rapido)" },
  { value: "Debt", label: "💳 Toxic EMI & Credit Card Dues" },
  { value: "Subscriptions", label: "👻 Ghost Taxes (Netflix/Spotify/SaaS)" },
  { value: "Shopping", label: "🛍️ Shopping (Myntra/Amazon/Nykaa)" },
  { value: "Tech", label: "💻 Tech & Gadgets (Upgrades)" },
  { value: "Entertainment", label: "🎬 Entertainment (Movies/Concerts)" },
  { value: "Health", label: "💊 Health (Doctor/Pharmacy/Tests)" },
  { value: "Fitness", label: "🏋️ Fitness (Gym/Supplements/Therapy)" },
  { value: "Invest_Equity", label: "📈 Equity (SIP/Stocks/Mutual Funds)" },
  { value: "Invest_Safe", label: "🏦 Safe (FDs/PPF/EPF)" },
  { value: "Education", label: "🧠 Education (Courses/Books/Mentorship)" },
  { value: "Taxes", label: "🏛️ Taxes & Govt Fees" },
  { value: "Other", label: "⚡ Unclassified Leak" },
];

export const DESI_TIPS = [
  { icon: "🧾", tag: "Food Leak", tip: "Zomato / Swiggy ki aadat? Cooking 3 days/week saves ≈₹1,200/month — that's 3 Jio recharges free." },
  { icon: "📱", tag: "Recharge", tip: "Airtel ₹599 vs Jio ₹349 — same unlimited data. Switching saves ₹3,000/year. Seedhi baat, no bakwaas." },
  { icon: "🛺", tag: "Transport", tip: "Ola surge >5km? Take metro. ₹80–150 saved/trip = ₹2,400/month for a daily commuter." },
  { icon: "💰", tag: "SIP Magic", tip: "₹500/month in Nifty 50 SIP → ₹1.16 lakh in 10 years at 12% CAGR. Kal pe dhyan do yaar!" },
  { icon: "🏧", tag: "Emergency Fund", tip: "Keep 3–6 months of expenses in a liquid MF (not savings account). HDFC Liquid Fund > 3% interest." },
];

export function fmt(n) {
  return Number(n).toLocaleString("en-IN");
}

// Engine updated to parse deep categorization
export function calcTotals(transactions, INCOME) {
  const needs = transactions.filter((t) => t.category.startsWith("need")).reduce((a, t) => a + t.amount, 0);
  const wants = transactions.filter((t) => t.category.startsWith("want") || t.category.startsWith("debt")).reduce((a, t) => a + t.amount, 0);
  const saves = transactions.filter((t) => t.category.startsWith("save")).reduce((a, t) => a + t.amount, 0);
  
  const total = needs + wants + saves;
  const savings = Math.max(0, INCOME - total);
  
  // Health score brutally penalizes Wants and Bad Debt
  const health = Math.max(0, Math.min(100, 100 - Math.max(0, Math.round(total / INCOME * 100) - 80) - Math.max(0, Math.round(wants / INCOME * 100) - 30)));
  
  return { needs, wants, saves, total, savings, health };
}

export function calcRegret(amount) {
  // 10 years compounding at 12% returns roughly 3.10x
  return Math.round(amount * 3.105); 
}

export function calcLifeHours(amount, income) {
  // Assuming 22 working days, 8 hours a day = 176 hours a month
  const hourlyRate = income / 176; 
  if(hourlyRate === 0) return 0;
  return (amount / hourlyRate).toFixed(1);
}

// ... (keep all your existing constants and functions: ICONS, CATEGORY_COLORS, fmt, calcTotals, etc.)

// --- FIN-OS V6: ADVANCED ENGINES ---

export function generateMonteCarlo(monthlySavings, years = 10) {
  // Simplified Monte Carlo for Frontend visualization
  // Assumes a base 12% expected return, 15% optimistic, 8% pessimistic
  const labels = Array.from({ length: years }, (_, i) => `Yr ${i + 1}`);
  let optimistic = [];
  let expected = [];
  let pessimistic = [];
  
  let optVal = 0, expVal = 0, pesVal = 0;
  const annualContrib = monthlySavings * 12;

  for (let i = 1; i <= years; i++) {
    optVal = (optVal + annualContrib) * 1.15;
    expVal = (expVal + annualContrib) * 1.12;
    pesVal = (pesVal + annualContrib) * 1.08;
    
    optimistic.push(optVal);
    expected.push(expVal);
    pessimistic.push(pesVal);
  }

  return { labels, optimistic, expected, pessimistic };
}

export const AI_SUGGESTIONS = [
  { id: 1, text: "Analyze my Zomato spend vs my SIP contributions this month.", action: "ANALYZE_LEAKS" },
  { id: 2, text: "If I cut my 'Wants' by 20%, when can I afford the Car goal?", action: "SIMULATE_GOAL" },
  { id: 3, text: "Identify ghost subscriptions I haven't used in 30 days.", action: "FIND_GHOST_TAX" }
];