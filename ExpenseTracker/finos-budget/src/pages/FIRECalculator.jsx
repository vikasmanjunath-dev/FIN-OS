import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { fmt, calcTotals } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";

// ─── FIRE CALCULATOR ENGINE ─────────────────────────────────────
function calcFIRE(monthlyExpenses, monthlySavings, currentCorpus = 0, returnRate = 0.12) {
  const annualExpenses = monthlyExpenses * 12;
  const fireNumber = annualExpenses * 25; // 4% SWR rule
  const leanFire = annualExpenses * 20;
  const fatFire = annualExpenses * 33;

  let corpus = currentCorpus;
  let years = 0;
  const annualSave = monthlySavings * 12;
  const trajectory = [{ year: 0, corpus }];

  while (corpus < fireNumber && years < 60) {
    corpus = (corpus + annualSave) * (1 + returnRate);
    years++;
    trajectory.push({ year: years, corpus: Math.round(corpus) });
  }

  return { fireNumber, leanFire, fatFire, yearsToFire: years, trajectory };
}

// ─── ANIMATED COUNTDOWN ────────────────────────────────────────
function FireCountdown({ years, color }) {
  const yrs = Math.floor(years);
  const months = Math.round((years - yrs) * 12);
  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "center" }}>
      {[{ val: yrs, label: "YEARS" }, { val: months, label: "MONTHS" }].map((item, i) => (
        <motion.div key={i} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.15, type: "spring" }}
          style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${color}40`, borderRadius: "20px", padding: "24px 32px", textAlign: "center", minWidth: "120px" }}>
          <div style={{ fontSize: "48px", fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{item.val}</div>
          <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", letterSpacing: "2px", marginTop: "8px" }}>{item.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── TIMELINE NODE ──────────────────────────────────────────────
function TimelineNode({ year, corpus, fireNumber, color, index, isLast }) {
  const pct = Math.min(100, (corpus / fireNumber) * 100);
  const isMilestone = pct >= 25 && pct < 26 || pct >= 50 && pct < 51 || pct >= 75 && pct < 76 || pct >= 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{ display: "flex", alignItems: "center", gap: "16px", position: "relative" }}
    >
      {/* Timeline line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "40px", flexShrink: 0 }}>
        <div style={{
          width: isMilestone ? "16px" : "10px", height: isMilestone ? "16px" : "10px",
          borderRadius: "50%",
          background: pct >= 100 ? "#C7F000" : color,
          boxShadow: isMilestone ? `0 0 12px ${color}` : "none",
          border: `2px solid ${pct >= 100 ? "#C7F000" : color}`,
          zIndex: 2,
        }} />
        {!isLast && <div style={{ width: "2px", height: "32px", background: `linear-gradient(to bottom, ${color}40, transparent)` }} />}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center",
        background: pct >= 100 ? "rgba(199,240,0,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${pct >= 100 ? "rgba(199,240,0,0.3)" : "rgba(255,255,255,0.05)"}`,
        borderRadius: "12px", padding: "12px 16px",
        marginBottom: isLast ? 0 : "4px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace", minWidth: "60px" }}>Year {year}</span>
          <div style={{ width: "120px", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "100px", overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: index * 0.05 }}
              style={{ height: "100%", background: pct >= 100 ? "#C7F000" : color, borderRadius: "100px" }} />
          </div>
          <span style={{ fontSize: "11px", color: pct >= 100 ? "#C7F000" : "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace" }}>{pct.toFixed(0)}%</span>
        </div>
        <span style={{ fontSize: "14px", fontWeight: 700, color: pct >= 100 ? "#C7F000" : "#fff", fontFamily: "'JetBrains Mono', monospace" }}>
          ₹{fmt(corpus)}
        </span>
      </div>
    </motion.div>
  );
}

// ─── SCENARIO CARD ──────────────────────────────────────────────
function ScenarioCard({ title, icon, savings, result, color, isActive, onClick }) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        background: isActive ? `${color}15` : "rgba(20,24,40,0.4)",
        border: `1px solid ${isActive ? `${color}50` : "rgba(255,255,255,0.05)"}`,
        borderRadius: "20px", padding: "24px", cursor: "pointer",
        backdropFilter: "blur(12px)", transition: "all 0.3s",
      }}
    >
      <div style={{ fontSize: "28px", marginBottom: "12px" }}>{icon}</div>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>{title}</div>
      <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "12px", marginBottom: "16px" }}>Save ₹{fmt(savings)}/mo</div>
      <div style={{ fontSize: "28px", fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {result.yearsToFire < 60 ? `${result.yearsToFire} yrs` : "60+ yrs"}
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)", marginTop: "4px" }}>to FIRE</div>
    </motion.div>
  );
}

// ═══ MAIN FIRE PAGE ═══
export default function FIRECalculator({ transactions, INCOME }) {
  const { total, saves, savings } = calcTotals(transactions, INCOME);
  const monthlyExpenses = total || 30000;
  const [customSavings, setCustomSavings] = useState(saves || Math.round(INCOME * 0.2));
  const [returnRate, setReturnRate] = useState(12);
  const [corpus, setCorpus] = useState(0);

  const fireResult = useMemo(() => calcFIRE(monthlyExpenses, customSavings, corpus, returnRate / 100), [monthlyExpenses, customSavings, corpus, returnRate]);

  // Scenario presets
  const scenarios = useMemo(() => [
    { title: "Current Path", icon: "🚶", savings: saves || 5000, color: "#4F7CFF" },
    { title: "Aggressive", icon: "🏃", savings: Math.round(INCOME * 0.35), color: "#F59E0B" },
    { title: "Beast Mode", icon: "🚀", savings: Math.round(INCOME * 0.50), color: "#10B981" },
    { title: "Monk Mode", icon: "🧘", savings: Math.round(INCOME * 0.70), color: "#C7F000" },
  ].map(s => ({ ...s, result: calcFIRE(monthlyExpenses, s.savings, corpus, returnRate / 100) })), [monthlyExpenses, INCOME, saves, corpus, returnRate]);

  const [activeScenario, setActiveScenario] = useState(0);

  const fireColor = fireResult.yearsToFire <= 15 ? "#C7F000" : fireResult.yearsToFire <= 25 ? "#10B981" : fireResult.yearsToFire <= 35 ? "#F59E0B" : "#FF2A5F";

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      {/* HEADER */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "12px", color: "#FF6B35", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: "8px", height: "8px", background: "#FF6B35", borderRadius: "50%" }} />
          Independence Protocol
        </div>
        <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900, letterSpacing: "-1px" }}>FIRE Calculator</h1>
        <p style={{ color: "var(--text-muted, #9AA0B4)", marginTop: "8px" }}>When can you stop trading your life for money?</p>
      </div>

      <StaggerContainer>
        {/* FIRE COUNTDOWN */}
        <StaggerItem>
          <div style={{
            background: `radial-gradient(circle at top, ${fireColor}10 0%, rgba(20,24,40,0.6) 70%)`,
            border: `1px solid ${fireColor}30`, borderRadius: "28px",
            padding: "48px", marginBottom: "32px", textAlign: "center",
            backdropFilter: "blur(12px)", position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: "300px", height: "300px", background: `radial-gradient(circle, ${fireColor}15 0%, transparent 70%)`, borderRadius: "50%" }} />
            <div style={{ fontSize: "14px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "24px", position: "relative", zIndex: 1 }}>
              Time to Financial Independence
            </div>
            <FireCountdown years={fireResult.yearsToFire} color={fireColor} />
            <div style={{ marginTop: "32px", display: "flex", justifyContent: "center", gap: "32px", position: "relative", zIndex: 1 }}>
              {[
                { label: "FIRE Number", value: `₹${fmt(fireResult.fireNumber)}`, color: "#fff" },
                { label: "Lean FIRE", value: `₹${fmt(fireResult.leanFire)}`, color: "#10B981" },
                { label: "Fat FIRE", value: `₹${fmt(fireResult.fatFire)}`, color: "#F59E0B" },
              ].map((item, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>{item.label}</div>
                  <div style={{ fontSize: "18px", fontWeight: 900, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </StaggerItem>

        {/* CONTROLS */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "32px" }}>
            {[
              { label: "Monthly Investment", value: customSavings, set: setCustomSavings, icon: "💰", color: "#10B981", unit: "₹" },
              { label: "Expected Return (%)", value: returnRate, set: setReturnRate, icon: "📈", color: "#4F7CFF", unit: "%" },
              { label: "Current Corpus", value: corpus, set: setCorpus, icon: "🏦", color: "#F59E0B", unit: "₹" },
            ].map((ctrl, i) => (
              <div key={i} style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", padding: "24px", backdropFilter: "blur(12px)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "18px" }}>{ctrl.icon}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", letterSpacing: "1px" }}>{ctrl.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: ctrl.color, fontWeight: 700 }}>{ctrl.unit === "₹" ? "₹" : ""}</span>
                  <input type="number" value={ctrl.value} onChange={e => ctrl.set(Number(e.target.value) || 0)}
                    style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "14px", color: "#fff", outline: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "18px", fontWeight: 700 }} />
                  {ctrl.unit === "%" && <span style={{ color: ctrl.color, fontWeight: 700 }}>%</span>}
                </div>
              </div>
            ))}
          </div>
        </StaggerItem>

        {/* SCENARIOS */}
        <StaggerItem>
          <h3 style={{ color: "#fff", margin: "0 0 20px 0", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "#F59E0B" }}>🎲</span> What-If Scenarios
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
            {scenarios.map((s, i) => (
              <ScenarioCard key={i} {...s} isActive={activeScenario === i} onClick={() => { setActiveScenario(i); setCustomSavings(s.savings); }} />
            ))}
          </div>
        </StaggerItem>

        {/* TIMELINE */}
        <StaggerItem>
          <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
            <h3 style={{ color: "#fff", margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ color: fireColor }}>📊</span> Wealth Trajectory
            </h3>
            <div style={{ maxHeight: "500px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {fireResult.trajectory.filter((_, i) => i % (fireResult.trajectory.length > 30 ? 2 : 1) === 0 || i === fireResult.trajectory.length - 1).map((point, i, arr) => (
                <TimelineNode key={point.year} year={point.year} corpus={point.corpus} fireNumber={fireResult.fireNumber} color={fireColor} index={i} isLast={i === arr.length - 1} />
              ))}
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
