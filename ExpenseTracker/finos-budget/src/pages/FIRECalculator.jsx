import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmt, calcTotals } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";
import AryaPanel from "../components/AryaPanel";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const INDIA_INFLATION = 0.065;   // 6.5% long-run CPI
const MEDICAL_INFLATION = 0.14;  // 14% India medical inflation
const INDIA_SWR = 0.035;         // 3.5% India-calibrated SWR (vs 4% US)

const GEO_CITIES = [
  { city: "Mumbai",    index: 1.00 },
  { city: "Delhi",     index: 0.90 },
  { city: "Bangalore", index: 0.85 },
  { city: "Chennai",   index: 0.80 },
  { city: "Pune",      index: 0.75 },
  { city: "Hyderabad", index: 0.75 },
  { city: "Kolkata",   index: 0.70 },
  { city: "Ahmedabad", index: 0.65 },
  { city: "Jaipur",    index: 0.60 },
  { city: "Nagpur",    index: 0.55 },
  { city: "Indore",    index: 0.55 },
  { city: "Mysore",    index: 0.50 },
  { city: "Coimbatore",index: 0.50 },
];

// ─── CORE MATH ───────────────────────────────────────────────────────────────
function calcYearsToFire(target, monthlySavings, currentCorpus, annualReturn) {
  if (monthlySavings <= 0) return 99;
  let corpus = currentCorpus;
  const annualSave = monthlySavings * 12;
  let years = 0;
  while (corpus < target && years < 80) {
    corpus = (corpus + annualSave) * (1 + annualReturn);
    years++;
  }
  return years;
}

function buildTrajectory(target, monthlySavings, currentCorpus, annualReturn, maxYears) {
  const traj = [{ year: 0, corpus: Math.round(currentCorpus) }];
  let corpus = currentCorpus;
  const annualSave = monthlySavings * 12;
  for (let y = 1; y <= maxYears; y++) {
    corpus = (corpus + annualSave) * (1 + annualReturn);
    traj.push({ year: y, corpus: Math.round(corpus) });
    if (corpus >= target) break;
  }
  return traj;
}

// Monte Carlo: sequence of returns risk
// Returns { survivalRate, p10, p50, p90 } over retirementYears
function monteCarlo(corpus, annualWithdrawal, retirementYears, N = 500) {
  const meanReturn   = 0.08;   // conservative post-retirement equity
  const stdReturn    = 0.18;
  const bondReturn   = 0.065;  // 65% equity, 35% bonds
  const inflation    = INDIA_INFLATION;
  let survived = 0;
  const finalCorpora = [];

  for (let sim = 0; sim < N; sim++) {
    let c = corpus;
    let withdrawal = annualWithdrawal;
    let alive = true;
    for (let y = 0; y < retirementYears; y++) {
      // Box-Muller normal
      const u1 = Math.random(), u2 = Math.random();
      const z  = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
      const r  = 0.65 * (meanReturn + z * stdReturn) + 0.35 * bondReturn;
      c = c * (1 + r) - withdrawal;
      withdrawal *= (1 + inflation);
      if (c <= 0) { alive = false; break; }
    }
    if (alive) survived++;
    finalCorpora.push(Math.max(0, c));
  }
  finalCorpora.sort((a, b) => a - b);
  return {
    survivalRate: Math.round((survived / N) * 100),
    p10: finalCorpora[Math.floor(N * 0.10)],
    p50: finalCorpora[Math.floor(N * 0.50)],
    p90: finalCorpora[Math.floor(N * 0.90)],
  };
}

// ─── FIRE VARIANT CONFIG ─────────────────────────────────────────────────────
const VARIANTS = [
  {
    id: "lean",
    label: "Lean FIRE",
    icon: "🏕️",
    color: "#10B981",
    desc: "Frugal minimalist — cover essentials only",
    expenseFn: (monthly) => 40000,
    swr: INDIA_SWR + 0.005,   // 4% — leaner corpus, flexible spending
    badge: "EARLY",
  },
  {
    id: "regular",
    label: "Regular FIRE",
    icon: "🏠",
    color: "#4F7CFF",
    desc: "Maintain current lifestyle forever",
    expenseFn: (monthly) => monthly,
    swr: INDIA_SWR,            // 3.5% India-calibrated
    badge: "DEFAULT",
  },
  {
    id: "fat",
    label: "Fat FIRE",
    icon: "🏰",
    color: "#F59E0B",
    desc: "Luxury living — 2× current expenses",
    expenseFn: (monthly) => monthly * 2,
    swr: INDIA_SWR - 0.005,   // 3% — conservative for larger corpus
    badge: "RICH",
  },
  {
    id: "barista",
    label: "Barista FIRE",
    icon: "☕",
    color: "#C7F000",
    desc: "Part-time work (₹30K/mo) covers 40% — retire the rest",
    expenseFn: (monthly) => Math.max(15000, monthly - 30000),
    swr: INDIA_SWR + 0.005,
    badge: "HYBRID",
  },
];

// ─── SUBCOMPONENTS ───────────────────────────────────────────────────────────
function VariantTab({ variant, isActive, years, corpus, onClick }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        background: isActive ? `${variant.color}18` : "rgba(20,24,40,0.4)",
        border: `1px solid ${isActive ? variant.color + "60" : "rgba(255,255,255,0.06)"}`,
        borderRadius: "18px", padding: "20px", cursor: "pointer",
        backdropFilter: "blur(12px)", transition: "all 0.25s",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", top: "10px", right: "10px",
        fontSize: "9px", fontWeight: 800, letterSpacing: "0.8px",
        color: variant.color, background: `${variant.color}18`,
        border: `1px solid ${variant.color}40`, padding: "2px 7px", borderRadius: "6px",
      }}>{variant.badge}</div>
      <div style={{ fontSize: "24px", marginBottom: "10px" }}>{variant.icon}</div>
      <div style={{ color: "#fff", fontWeight: 800, fontSize: "14px", marginBottom: "3px" }}>{variant.label}</div>
      <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "11px", marginBottom: "14px" }}>{variant.desc}</div>
      <div style={{ fontSize: "30px", fontWeight: 900, color: isActive ? variant.color : "#fff",
                    fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
        {years >= 80 ? "80+" : years} <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-muted, #9AA0B4)" }}>yrs</span>
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)", marginTop: "4px" }}>{fmt(corpus)} corpus</div>
    </motion.div>
  );
}

function MetricCard({ label, value, sub, color = "#fff", danger = false }) {
  return (
    <div style={{
      background: danger ? "rgba(255,42,95,0.06)" : "rgba(0,0,0,0.35)",
      border: `1px solid ${danger ? "rgba(255,42,95,0.25)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: "14px", padding: "16px", textAlign: "center",
    }}>
      <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase",
                    letterSpacing: "1px", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

function TimelineRow({ year, corpus, target, color, index, isLast }) {
  const pct = Math.min(100, (corpus / target) * 100);
  const done = pct >= 100;
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.6) }}
      style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: isLast ? 0 : "4px" }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "36px", flexShrink: 0 }}>
        <div style={{
          width: done ? "14px" : "9px", height: done ? "14px" : "9px", borderRadius: "50%",
          background: done ? "#C7F000" : color, boxShadow: done ? `0 0 10px #C7F000` : "none",
          border: `2px solid ${done ? "#C7F000" : color}`, zIndex: 2, flexShrink: 0,
        }} />
        {!isLast && <div style={{ width: "2px", height: "28px", background: `linear-gradient(${color}40, transparent)` }} />}
      </div>
      <div style={{
        flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center",
        background: done ? "rgba(199,240,0,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${done ? "rgba(199,240,0,0.2)" : "rgba(255,255,255,0.04)"}`,
        borderRadius: "10px", padding: "10px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace", minWidth: "54px" }}>
            Yr {year}
          </span>
          <div style={{ width: "110px", height: "5px", background: "rgba(255,255,255,0.06)", borderRadius: "100px", overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: Math.min(index * 0.04, 0.5) }}
              style={{ height: "100%", background: done ? "#C7F000" : color, borderRadius: "100px" }} />
          </div>
          <span style={{ fontSize: "10px", color: done ? "#C7F000" : "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace" }}>
            {pct.toFixed(0)}%
          </span>
        </div>
        <span style={{ fontSize: "13px", fontWeight: 700, color: done ? "#C7F000" : "#fff", fontFamily: "'JetBrains Mono', monospace" }}>
          {fmt(corpus)}
        </span>
      </div>
    </motion.div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function FIRECalculator({ transactions, INCOME }) {
  const { total, saves, savings: persistedCorpus } = calcTotals(transactions, INCOME);
  const monthlyExpenses = total || Math.round(INCOME * 0.6);

  const [monthlySavings, setMonthlySavings] = useState(saves || Math.round(INCOME * 0.25));
  const [returnRate, setReturnRate]         = useState(12);
  const [corpus, setCorpus]                 = useState(persistedCorpus || 0);
  const [activeVariant, setActiveVariant]   = useState("regular");
  const [currentCity, setCurrentCity]       = useState("Mumbai");
  const [targetCity, setTargetCity]         = useState("Pune");
  const [currentAge, setCurrentAge]         = useState(30);
  const [monthlyHealthcareNow, setHealthcareNow] = useState(5000);

  const rateDecimal = returnRate / 100;

  // ── Variant calculations ─────────────────────────────────────────────────
  const variantCalcs = useMemo(() => {
    return VARIANTS.map(v => {
      const monthlyExp = v.expenseFn(monthlyExpenses);
      const annualExp  = monthlyExp * 12;
      const fireNum    = annualExp / v.swr;
      const yrs        = calcYearsToFire(fireNum, monthlySavings, corpus, rateDecimal);
      const traj       = buildTrajectory(fireNum, monthlySavings, corpus, rateDecimal, Math.min(yrs + 2, 50));
      return { ...v, monthlyExp, annualExp, fireNum, years: yrs, trajectory: traj };
    });
  }, [monthlyExpenses, monthlySavings, corpus, rateDecimal]);

  const active = variantCalcs.find(v => v.id === activeVariant) || variantCalcs[1];

  // ── Sequence of returns risk ─────────────────────────────────────────────
  const retirementHorizon = 85 - (currentAge + active.years);
  const mc = useMemo(() => {
    if (active.years >= 80) return { survivalRate: 0, p10: 0, p50: 0, p90: 0 };
    return monteCarlo(active.fireNum, active.annualExp, Math.max(10, retirementHorizon));
  }, [active.fireNum, active.annualExp, retirementHorizon]);

  // ── Healthcare corpus ────────────────────────────────────────────────────
  const healthcareCorpus = useMemo(() => {
    const yearsToRetire = active.years;
    const costAtRetire  = monthlyHealthcareNow * 12 * Math.pow(1 + MEDICAL_INFLATION, yearsToRetire);
    // Need PV of 25-year healthcare annuity growing at 14%, discounted at 8%
    let pv = 0;
    let cost = costAtRetire;
    for (let y = 0; y < 25; y++) {
      pv += cost / Math.pow(1 + 0.08, y + 1);
      cost *= (1 + MEDICAL_INFLATION);
    }
    return Math.round(pv);
  }, [monthlyHealthcareNow, active.years]);

  // ── Geographic arbitrage ─────────────────────────────────────────────────
  const geoCalc = useMemo(() => {
    const srcIdx  = GEO_CITIES.find(c => c.city === currentCity)?.index || 1.0;
    const dstIdx  = GEO_CITIES.find(c => c.city === targetCity)?.index  || 0.75;
    const sameCity     = currentCity === targetCity;
    const moreExpensive = dstIdx > srcIdx;
    const savingsFactor = 1 - dstIdx / srcIdx;
    const reducedExp    = monthlyExpenses * dstIdx / srcIdx;
    const newFireNum    = (reducedExp * 12) / active.swr;
    const newYears      = calcYearsToFire(newFireNum, monthlySavings, corpus, rateDecimal);
    const yearsSaved    = Math.max(0, active.years - newYears);
    const yearsAdded    = moreExpensive ? Math.max(0, newYears - active.years) : 0;
    return {
      sameCity,
      moreExpensive,
      savingsFactor: Math.round(savingsFactor * 100),
      reducedExp: Math.round(reducedExp),
      newFireNum,
      yearsSaved,
      yearsAdded,
      newYears,
    };
  }, [currentCity, targetCity, monthlyExpenses, active, monthlySavings, corpus, rateDecimal]);

  // ── Color ────────────────────────────────────────────────────────────────
  const fireColor = active.years <= 15 ? "#C7F000" : active.years <= 25 ? "#10B981" : active.years <= 35 ? "#F59E0B" : "#FF2A5F";

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      {/* HEADER */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "12px", color: "#FF6B35", textTransform: "uppercase", letterSpacing: "2px",
                      fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
            style={{ width: "8px", height: "8px", background: "#FF6B35", borderRadius: "50%" }} />
          Independence Protocol
        </div>
        <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900, letterSpacing: "-1px" }}>FIRE Calculator</h1>
        <p style={{ color: "var(--text-muted, #9AA0B4)", marginTop: "8px" }}>4 FIRE variants · India-calibrated SWR · Sequence of returns risk · Geographic arbitrage</p>
      </div>

      <StaggerContainer>
        {/* ── CONTROLS ── */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: "14px", marginBottom: "28px" }}>
            {[
              { label: "Monthly Investment", value: monthlySavings, set: setMonthlySavings, unit: "₹", color: "#10B981" },
              { label: "Expected Return %", value: returnRate, set: setReturnRate, unit: "%", color: "#4F7CFF" },
              { label: "Current Corpus", value: corpus, set: setCorpus, unit: "₹", color: "#F59E0B" },
              { label: "Your Age", value: currentAge, set: setCurrentAge, unit: "yrs", color: "#C7F000" },
            ].map((ctrl, i) => (
              <div key={i} style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.06)",
                                    borderRadius: "16px", padding: "18px", backdropFilter: "blur(12px)" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase",
                              letterSpacing: "1px", marginBottom: "10px" }}>{ctrl.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {ctrl.unit === "₹" && <span style={{ color: ctrl.color, fontWeight: 700 }}>₹</span>}
                  <input type="number" value={ctrl.value} onChange={e => ctrl.set(Number(e.target.value) || 0)}
                    style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)",
                             borderRadius: "10px", padding: "10px 12px", color: "#fff", outline: "none",
                             fontFamily: "'JetBrains Mono', monospace", fontSize: "16px", fontWeight: 700, width: "100%" }} />
                  {ctrl.unit !== "₹" && <span style={{ color: ctrl.color, fontWeight: 700 }}>{ctrl.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </StaggerItem>

        {/* ── 4 FIRE VARIANTS ── */}
        <StaggerItem>
          <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "24px", padding: "28px", marginBottom: "28px" }}>
            <h3 style={{ color: "#fff", margin: "0 0 20px 0", fontSize: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ color: "#FF6B35" }}>🔥</span> Choose Your FIRE Target
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
              {variantCalcs.map(v => (
                <VariantTab key={v.id} variant={v} isActive={activeVariant === v.id}
                  years={v.years} corpus={v.fireNum}
                  onClick={() => setActiveVariant(v.id)} />
              ))}
            </div>

            {/* Active variant detail */}
            <AnimatePresence mode="wait">
              <motion.div key={activeVariant}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ marginTop: "20px", padding: "20px", borderRadius: "16px",
                         background: `${active.color}0A`, border: `1px solid ${active.color}30` }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
                  {[
                    { label: "Monthly Expenses",     val: fmt(active.monthlyExp),  color: "#fff" },
                    { label: "FIRE Number",           val: fmt(active.fireNum),     color: active.color },
                    { label: `SWR (${(active.swr*100).toFixed(1)}%)`, val: `${fmt(active.fireNum * active.swr)}/yr`, color: "#fff" },
                    { label: "Years to FIRE",         val: active.years >= 80 ? "80+" : active.years + " yrs", color: fireColor },
                    { label: "Fire Age",              val: active.years >= 80 ? "—" : (currentAge + active.years), color: fireColor },
                    { label: "Retire by",             val: active.years >= 80 ? "—" : (new Date().getFullYear() + active.years), color: "#fff" },
                  ].map((m, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase",
                                    letterSpacing: "1px", marginBottom: "4px" }}>{m.label}</div>
                      <div style={{ fontSize: "18px", fontWeight: 900, color: m.color,
                                    fontFamily: "'JetBrains Mono', monospace" }}>{m.val}</div>
                    </div>
                  ))}
                </div>
                {activeVariant === "barista" && (
                  <div style={{ marginTop: "14px", fontSize: "12px", color: "rgba(255,255,255,0.55)", padding: "10px 14px",
                                background: "rgba(199,240,0,0.05)", borderRadius: "10px", border: "1px solid rgba(199,240,0,0.15)" }}>
                    ☕ Barista FIRE assumes ₹30,000/month part-time income (freelance/consulting/teaching) covers 40% of expenses.
                    You only need to fund the remaining {fmt(active.monthlyExp)}/month from corpus.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </StaggerItem>

        {/* ── AI INTELLIGENCE PANELS (2×2 grid) ── */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "28px" }}>

            {/* Panel 1: Sequence of Returns Risk */}
            <div style={{ background: "rgba(20,24,40,0.5)", border: "1px solid rgba(255,42,95,0.2)",
                          borderRadius: "20px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
                <span style={{ fontSize: "18px" }}>🎲</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: "14px" }}>Sequence of Returns Risk</div>
                  <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "11px" }}>
                    {active.years < 80
                      ? `500 Monte Carlo paths · ${Math.max(10, retirementHorizon)}-yr retirement`
                      : "Increase savings to unlock this analysis"}
                  </div>
                </div>
              </div>
              {active.years >= 80 ? (
                <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--text-muted, #9AA0B4)", fontSize: "13px" }}>
                  <div style={{ fontSize: "28px", marginBottom: "10px" }}>📈</div>
                  Increase monthly investment or reduce expenses to reach FIRE within 80 years — then sequence-of-returns analysis unlocks.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                    <MetricCard label="Portfolio Survival" value={`${mc.survivalRate}%`}
                      color={mc.survivalRate >= 85 ? "#10B981" : mc.survivalRate >= 70 ? "#F59E0B" : "#FF2A5F"}
                      danger={mc.survivalRate < 70}
                      sub="chance of lasting age 85" />
                    <MetricCard label="Median Outcome (P50)" value={fmt(mc.p50)} color="#4F7CFF" sub="corpus remaining at 85" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <MetricCard label="Bad Luck (P10)" value={fmt(mc.p10)} color="#FF2A5F" sub="worst 10% scenario" />
                    <MetricCard label="Good Luck (P90)" value={fmt(mc.p90)} color="#10B981" sub="best 10% scenario" />
                  </div>
                  {mc.survivalRate < 80 && (
                    <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", fontSize: "12px",
                                  background: "rgba(255,42,95,0.08)", border: "1px solid rgba(255,42,95,0.2)",
                                  color: "rgba(255,255,255,0.8)" }}>
                      ⚠️ {mc.survivalRate}% survival — add <strong>{fmt(active.fireNum * 0.15)}</strong> to corpus or drop SWR to 3%.
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Panel 2: Healthcare Inflation */}
            <div style={{ background: "rgba(20,24,40,0.5)", border: "1px solid rgba(245,158,11,0.2)",
                          borderRadius: "20px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
                <span style={{ fontSize: "18px" }}>🏥</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: "14px" }}>Healthcare Inflation Buffer</div>
                  <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "11px" }}>India medical inflation: 14%/yr</div>
                </div>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase",
                              letterSpacing: "1px", marginBottom: "6px" }}>Monthly Healthcare Budget Now</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#F59E0B", fontWeight: 700 }}>₹</span>
                  <input type="number" value={monthlyHealthcareNow} onChange={e => setHealthcareNow(Number(e.target.value) || 5000)}
                    style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,158,11,0.25)",
                             borderRadius: "10px", padding: "10px 12px", color: "#fff", outline: "none",
                             fontFamily: "'JetBrains Mono', monospace", fontSize: "14px" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <MetricCard label="At Retirement" color="#F59E0B"
                  value={fmt(monthlyHealthcareNow * 12 * Math.pow(1 + MEDICAL_INFLATION, active.years) / 12) + "/mo"}
                  sub={`after ${active.years} yrs at 14%`} />
                <MetricCard label="Healthcare Corpus" color="#FF2A5F"
                  value={fmt(healthcareCorpus)}
                  sub="PV of 25yr healthcare needs"
                  danger={healthcareCorpus > active.fireNum * 0.25} />
              </div>
              <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", fontSize: "12px",
                            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)",
                            color: "rgba(255,255,255,0.75)" }}>
                💡 Total corpus needed (FIRE + healthcare): <strong style={{ color: "#F59E0B" }}>{fmt(active.fireNum + healthcareCorpus)}</strong>
              </div>
            </div>

            {/* Panel 3: India SWR Calibration */}
            <div style={{ background: "rgba(20,24,40,0.5)", border: "1px solid rgba(79,124,255,0.2)",
                          borderRadius: "20px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
                <span style={{ fontSize: "18px" }}>🇮🇳</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: "14px" }}>India-Calibrated SWR</div>
                  <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "11px" }}>Why 3.5% not 4% — India inflation reality</div>
                </div>
              </div>
              {[
                { label: "US 4% Rule", swr: 0.04, color: "#9AA0B4", note: "Calibrated to US 3% inflation + bond yields" },
                { label: "India 3.5% Rule", swr: INDIA_SWR, color: "#4F7CFF", note: "India CPI 6.5% + volatile equity", active: true },
                { label: "Conservative 3%", swr: 0.03, color: "#10B981", note: "For 40+ yr retirement or conservative profile" },
              ].map((row, i) => {
                const corpusNeeded = active.annualExp / row.swr;
                return (
                  <div key={i} style={{
                    padding: "12px 14px", borderRadius: "10px", marginBottom: "8px",
                    background: row.active ? `${row.color}12` : "rgba(0,0,0,0.25)",
                    border: `1px solid ${row.active ? row.color + "40" : "rgba(255,255,255,0.06)"}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: row.active ? row.color : "#fff" }}>{row.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)" }}>{row.note}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14px", fontWeight: 900, color: row.color,
                                    fontFamily: "'JetBrains Mono', monospace" }}>{fmt(corpusNeeded)}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)" }}>corpus needed</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Panel 4: Geographic Arbitrage */}
            <div style={{ background: "rgba(20,24,40,0.5)", border: "1px solid rgba(199,240,0,0.2)",
                          borderRadius: "20px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
                <span style={{ fontSize: "18px" }}>🗺️</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: "14px" }}>Geographic Arbitrage</div>
                  <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "11px" }}>Retire in a cheaper city — retire earlier</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                {[
                  { label: "Currently in", value: currentCity, set: setCurrentCity },
                  { label: "Retire to", value: targetCity, set: setTargetCity },
                ].map((sel, i) => (
                  <div key={i}>
                    <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase",
                                  letterSpacing: "1px", marginBottom: "6px" }}>{sel.label}</div>
                    <select value={sel.value} onChange={e => sel.set(e.target.value)}
                      style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.12)",
                               borderRadius: "10px", padding: "9px 12px", color: "#fff", outline: "none", fontSize: "13px",
                               fontFamily: "-apple-system, sans-serif" }}>
                      {GEO_CITIES.map(c => <option key={c.city} value={c.city}>{c.city}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <MetricCard
                  label="Expense Change"
                  value={geoCalc.sameCity ? "0%" : `${geoCalc.moreExpensive ? "+" : "-"}${Math.abs(geoCalc.savingsFactor)}%`}
                  color={geoCalc.sameCity ? "var(--text-muted, #9AA0B4)" : geoCalc.moreExpensive ? "#FF2A5F" : "#C7F000"}
                  sub={geoCalc.sameCity ? "same city selected" : `₹${fmt(monthlyExpenses)} → ₹${fmt(geoCalc.reducedExp)}/mo`}
                />
                <MetricCard
                  label={geoCalc.moreExpensive ? "Years Added" : "Years Saved"}
                  value={geoCalc.sameCity ? "—" : geoCalc.moreExpensive ? `+${geoCalc.yearsAdded} yrs` : `${geoCalc.yearsSaved} yrs`}
                  color={geoCalc.sameCity ? "var(--text-muted, #9AA0B4)" : geoCalc.moreExpensive ? "#FF2A5F" : "#C7F000"}
                  sub={geoCalc.sameCity ? "pick a different city" : `Retire at ${currentAge + geoCalc.newYears} instead of ${currentAge + active.years}`}
                />
              </div>
              {geoCalc.sameCity ? (
                <div style={{ padding: "10px 12px", borderRadius: "10px", fontSize: "12px",
                              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                              color: "rgba(255,255,255,0.5)" }}>
                  💡 Select a different "Retire to" city to see the arbitrage savings.
                </div>
              ) : geoCalc.moreExpensive ? (
                <div style={{ padding: "10px 12px", borderRadius: "10px", fontSize: "12px",
                              background: "rgba(255,42,95,0.06)", border: "1px solid rgba(255,42,95,0.15)",
                              color: "rgba(255,255,255,0.8)" }}>
                  ⚠️ {targetCity} is more expensive than {currentCity} — retiring there adds <strong>{geoCalc.yearsAdded} years</strong> to your FIRE timeline.
                  New corpus: <strong style={{ color: "#FF2A5F" }}>{fmt(geoCalc.newFireNum)}</strong>
                </div>
              ) : geoCalc.yearsSaved > 0 ? (
                <div style={{ padding: "10px 12px", borderRadius: "10px", fontSize: "12px",
                              background: "rgba(199,240,0,0.06)", border: "1px solid rgba(199,240,0,0.15)",
                              color: "rgba(255,255,255,0.8)" }}>
                  🏙️ {currentCity} → {targetCity} = <strong style={{ color: "#C7F000" }}>{geoCalc.yearsSaved} years earlier FIRE.</strong>{" "}
                  New corpus target: <strong style={{ color: "#C7F000" }}>{fmt(geoCalc.newFireNum)}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </StaggerItem>

        {/* ── ARYA FIRE ANALYSIS ── */}
        <StaggerItem>
          <AryaPanel
            title="Arya's FIRE Blueprint"
            subtitle="Personalized path to financial independence"
            accentColor="#FF6B35"
            financialData={{ INCOME, needs: 0, wants: 0, saves: monthlySavings, total: monthlyExpenses, savings: corpus, health: 0, transactions }}
            deps={[monthlySavings, returnRate, corpus, INCOME, activeVariant, currentAge]}
            prompt={() =>
              `FIRE analysis for ${activeVariant.toUpperCase()} variant:
Monthly expenses: ₹${fmt(monthlyExpenses)}, investing: ₹${fmt(monthlySavings)}/mo at ${returnRate}% returns.
Current corpus: ₹${fmt(corpus)}, age: ${currentAge}. FIRE number: ₹${fmt(active.fireNum)} (${(active.swr*100).toFixed(1)}% India SWR).
Years to FIRE: ${active.years}. Monte Carlo survival: ${mc.survivalRate}%.
Healthcare corpus needed: ₹${fmt(healthcareCorpus)}.
Geographic arbitrage: ${geoCalc.yearsSaved > 0 ? `moving to ${targetCity} saves ${geoCalc.yearsSaved} years` : 'staying in current city'}.

Give 3 specific, numbered actions to reach FIRE faster. Use exact rupee numbers.
Mention: 1 investment action, 1 tax action, 1 lifestyle/income action.
Hinglish tone. Be specific — no generic advice.`
            }
          />
        </StaggerItem>

        {/* ── WEALTH TRAJECTORY ── */}
        <StaggerItem>
          <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
              <h3 style={{ color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ color: active.color }}>📈</span> Wealth Trajectory — {active.label}
              </h3>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "12px", color: "var(--text-muted, #9AA0B4)" }}>
                <div style={{ width: "12px", height: "3px", background: active.color, borderRadius: "4px" }}></div> Current path
                <div style={{ width: "12px", height: "3px", background: "#C7F000", borderRadius: "4px" }}></div> FIRE target reached
              </div>
            </div>
            <div style={{ maxHeight: "480px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {active.trajectory.map((pt, i, arr) => (
                <TimelineRow key={pt.year} year={pt.year} corpus={pt.corpus} target={active.fireNum}
                  color={active.color} index={i} isLast={i === arr.length - 1} />
              ))}
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
