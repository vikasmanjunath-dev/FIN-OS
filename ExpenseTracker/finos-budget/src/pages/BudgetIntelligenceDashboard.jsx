import { useState, useEffect, useMemo } from "react";
import { Doughnut, Radar, Line } from "react-chartjs-2";
import { 
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, 
  Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler 
} from "chart.js";
import { fmt, calcTotals, calcRegret } from "../utils/constants";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, RadialLinearScale, PointElement, LineElement, Filler);

const DONUT_COLORS = ["#EF4444", "#F59E0B", "#10B981", "#06B6D4"];
const DONUT_LABELS = ["Needs", "Wants", "Investments", "Liquid Savings"];

// --- 1. SYSTEM HEALTH CORE ---
function HealthScore({ health }) {
  const grade = health >= 80 ? "A" : health >= 60 ? "B" : health >= 40 ? "C" : "D";
  const gradeColor = health >= 80 ? "#10B981" : health >= 60 ? "#06B6D4" : health >= 40 ? "#F59E0B" : "#EF4444";
  const desc = health >= 80 ? "System Optimal. Escape velocity achieved." : health >= 60 ? "Stable, but susceptible to lifestyle creep." : health >= 40 ? "Critical Leaks detected. Immediate intervention required." : "System Failure. You are working for the bank.";

  return (
    <div style={{ background: "rgba(20,24,40,0.6)", border: `1px solid ${gradeColor}50`, borderRadius: "24px", padding: "32px", display: "flex", alignItems: "center", gap: "32px", backdropFilter: "blur(12px)", boxShadow: `0 10px 40px ${gradeColor}20` }}>
      <div style={{ width: 100, height: 100, borderRadius: "50%", border: `4px solid ${gradeColor}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `inset 0 0 20px ${gradeColor}40, 0 0 20px ${gradeColor}40`, background: "rgba(0,0,0,0.4)", position: "relative" }}>
        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "48px", fontWeight: "900", color: gradeColor, textShadow: `0 0 20px ${gradeColor}`, zIndex: 2 }}>{grade}</span>
        {/* Animated pulse ring */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: "50%", border: `1px solid ${gradeColor}`, animation: "pulse-glow 2s infinite" }} />
      </div>
      <div>
        <div style={{ fontSize: "12px", color: gradeColor, textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px" }}>QFT System Evaluation</div>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: "36px", fontWeight: "900", color: "#fff" }}>{health}% Financial Health</div>
        <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "14px", marginTop: "8px", lineHeight: "1.6" }}>{desc}</div>
      </div>
    </div>
  );
}

// --- 2. MICRO KPI CARDS ---
function MicroMetric({ icon, title, value, sub, color, alert, isGlow }) {
  return (
    <div style={{ background: "rgba(20,24,40,0.4)", border: `1px solid ${alert ? "#FF2A5F" : "rgba(255,255,255,0.05)"}`, borderRadius: "20px", padding: "20px", backdropFilter: "blur(12px)", position: "relative", overflow: "hidden", boxShadow: isGlow ? `0 0 20px ${color}20` : "none" }}>
      {alert && <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "4px", background: "#FF2A5F", boxShadow: "0 0 10px #FF2A5F" }} />}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        <span style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "1px" }}>{title}</span>
      </div>
      <div style={{ fontSize: "28px", fontWeight: "900", color, fontFamily: "'JetBrains Mono', monospace", marginBottom: "4px", textShadow: isGlow ? `0 0 10px ${color}80` : "none" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)", lineHeight: "1.4" }}>{sub}</div>
    </div>
  );
}

// === MAIN DASHBOARD COMPONENT ===
export default function BudgetIntelligenceDashboard({ transactions, INCOME }) {
  const { needs, wants, saves, savings, total, health } = calcTotals(transactions, INCOME);
  const [aiInput, setAiInput] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  
  const needPct = Math.round((needs / INCOME) * 100) || 0;
  const wantPct = Math.round((wants / INCOME) * 100) || 0;
  const savePct = Math.round((saves / INCOME) * 100) || 0;

  // --- ENGINE 1: ESCAPE VELOCITY (SOVEREIGNTY CLOCK) ---
  const dailyBurn = Math.max(total / Math.max(1, new Date().getDate()), 1);
  const survivalDays = Math.floor(savings / dailyBurn);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- ENGINE 2: LIFE-ENERGY EXCHANGE RATE ---
  // Assuming 160 working hours a month
  const hourlyWage = Math.round(INCOME / 160); 
  const hoursTradedForWants = Math.round(wants / hourlyWage);

  // --- ENGINE 3: THE MULTIVERSE (PARALLEL REALITY) ---
  const parallelWealth = wants * 12 * 1.15; // Assuming 15% return if wants were invested over a year
  const wealthGap = parallelWealth - saves;

  // --- ENGINE 4: MACRO THEFT ---
  const monthlyInflationLoss = Math.round((savings * 0.07) / 12);
  const impulseStreak = useMemo(() => {
    let streak = 0;
    const sortedTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (let t of sortedTx) {
        if (t.category.startsWith("want")) break;
        streak++;
    }
    return streak;
  }, [transactions]);

  // --- DNA RADAR CALCULATION ---
  const dnaData = {
    labels: ["Discipline", "Offense", "Defense", "Minimalism", "Sovereignty"],
    datasets: [{
      label: "Your DNA",
      data: [Math.min(100, savePct * 2), Math.min(100, (saves / (savings + 1)) * 100), savings > INCOME ? 90 : 40, Math.max(0, 100 - (wantPct * 1.5)), 100],
      backgroundColor: "rgba(199,240,0,0.2)", borderColor: "#C7F000", borderWidth: 2, pointBackgroundColor: "#050505", pointBorderColor: "#C7F000"
    }]
  };

  const radarOptions = {
    scales: { r: { angleLines: { color: "rgba(255,255,255,0.15)" }, grid: { color: "rgba(255,255,255,0.15)" }, pointLabels: { color: "#E2E8F0", font: { family: "'JetBrains Mono', monospace", size: 10 } }, ticks: { display: false, min: 0, max: 100 } } },
    plugins: { legend: { display: false } }, maintainAspectRatio: false
  };

  const simulateAiQuery = (query) => {
      setAiInput(query);
      setAiResponse(">> Accessing Quantum Ledger...\n>> Analyzing Temporal Spending Patterns...");
      setTimeout(() => {
          setAiResponse(`[PREDICTIVE ALERT]: Neural nets indicate an 84% probability of an emotional purchase this coming Friday at 8:00 PM based on your 'Fatigue Spending' history.\n\n[RECOMMENDATION]: Pre-emptively locking ₹3,000 into your Liquid Reserve Vault. Do you authorize this protocol?`);
      }, 1500);
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      
      {/* HEADER */}
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#4F7CFF", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: "8px", height: "8px", background: "#4F7CFF", borderRadius: "50%", animation: "pulse-glow 1s infinite" }} /> Intelligence Core</div>
          <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: "900", letterSpacing: "-1px" }}>Decision Engine v2.0</h1>
          <p style={{ color: "var(--text-muted, #9AA0B4)", marginTop: "8px" }}>Predictive behavioral analytics and temporal wealth mapping.</p>
        </div>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <HealthScore health={health} />
      </div>

      {/* TIER 1: THE INSANE NEW WIDGETS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", marginBottom: "32px" }}>
        
        {/* ESCAPE VELOCITY CLOCK */}
        <div style={{ background: "rgba(20,24,40,0.8)", border: "1px solid #10B981", borderRadius: "20px", padding: "20px", backdropFilter: "blur(12px)", boxShadow: "0 0 30px rgba(16,185,129,0.15)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -20, top: -20, fontSize: "80px", opacity: 0.05 }}>⏱️</div>
            <div style={{ fontSize: "12px", color: "#10B981", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "1px", marginBottom: "12px" }}>Escape Velocity</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontSize: "32px", fontWeight: "900", color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>{survivalDays}</span>
                <span style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "14px" }}>Days</span>
            </div>
            <div style={{ fontSize: "12px", color: "#10B981", fontFamily: "'JetBrains Mono', monospace", marginTop: "4px" }}>
                {clock.getHours().toString().padStart(2, '0')}:{clock.getMinutes().toString().padStart(2, '0')}:{clock.getSeconds().toString().padStart(2, '0')} T-MINUS
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", marginTop: "12px", lineHeight: "1.4" }}>Time you can survive without working based on current liquid reserves.</div>
        </div>

        {/* LIFE ENERGY EXCHANGE */}
        <MicroMetric 
            icon="🩸" title="Life-Energy Traded" 
            value={`${(hoursTradedForWants / 8).toFixed(1)} Days`} 
            sub={`You surrendered ${hoursTradedForWants} hours of your life this month just to fund toxic lifestyle wants.`} 
            color="#F59E0B" isGlow={true}
        />

        <MicroMetric icon="🔥" title="Detox Streak" value={`${impulseStreak} Days`} sub="Consecutive days without an ego/impulse leak." color={impulseStreak > 3 ? "#10B981" : "#F59E0B"} />
        <MicroMetric icon="💸" title="Macro-Theft" value={`-₹${fmt(monthlyInflationLoss)}`} sub="Purchasing power stolen by inflation this month." color="#FF2A5F" alert={monthlyInflationLoss > 1000} />
      </div>

      {/* TIER 2: AI & THE MULTIVERSE */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", marginBottom: "32px" }}>
        
        {/* QFT AI CO-PILOT WITH PREDICTIVE FATIGUE */}
        <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", padding: "32px", borderRadius: "24px", backdropFilter: "blur(12px)" }}>
            <h3 style={{ color: "#fff", margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ color: "#C7F000", textShadow: "0 0 10px #C7F000" }}>✦</span> QFT Predictive Co-Pilot
            </h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", flex: 1, marginBottom: "24px" }}>
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.02)", position: "relative", minWidth: 0 }}>
                    <div style={{ position: "absolute", top: 16, left: 16, fontSize: "10px", color: "#A1A4AC", letterSpacing: "1px", textTransform: "uppercase", zIndex: 10 }}>Financial DNA</div>
                    <div style={{ height: "240px", marginTop: "20px", position: "relative", zIndex: 1 }}>
                        <Radar data={dnaData} options={radarOptions} />
                    </div>
                </div>

                {/* AI TERMINAL */}
                <div style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", overflow: "hidden", minWidth: 0, boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)" }}>
                    <div style={{ background: "rgba(255,255,255,0.05)", padding: "8px 16px", fontSize: "10px", color: "#A1A4AC", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "8px" }}>
                        <span style={{ color: "#C7F000" }}>root@fin-os</span><span>:</span><span style={{ color: "#4F7CFF" }}>~/oracle</span>
                    </div>
                    <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ color: "var(--text-muted, #9AA0B4)", wordWrap: "break-word" }}>[SYSTEM]: Predictive Oracle Online. Awaiting temporal queries...</div>
                        {aiResponse && (
                            <div style={{ color: "#C7F000", background: "rgba(199, 240, 0, 0.05)", padding: "16px", borderRadius: "12px", borderLeft: "4px solid #C7F000", lineHeight: "1.6", whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
                                {aiResponse}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
                {["Run Fatigue Prediction", "Simulate Recession", "Analyze Ego Spend"].map(s => (
                    <button key={s} onClick={() => simulateAiQuery(s)} style={{ background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px", padding: "8px 16px", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }} onMouseOver={(e)=>e.target.style.background="rgba(255,255,255,0.1)"} onMouseOut={(e)=>e.target.style.background="rgba(255,255,255,0.05)"}>{s}</button>
                ))}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Message Oracle AI..." style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "16px", color: "#fff", outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
                <button onClick={() => simulateAiQuery(aiInput)} style={{ background: "#fff", color: "#000", border: "none", borderRadius: "12px", padding: "0 24px", fontWeight: "900", cursor: "pointer" }}>EXECUTE</button>
            </div>
        </div>

        {/* THE MULTIVERSE ENGINE */}
        <div style={{ background: "radial-gradient(circle at bottom left, rgba(79,124,255,0.1) 0%, rgba(20,24,40,0.6) 100%)", border: "1px solid #4F7CFF", padding: "32px", borderRadius: "24px", backdropFilter: "blur(12px)", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
           <div style={{ position: "absolute", right: -40, top: -40, width: "150px", height: "150px", background: "radial-gradient(circle, rgba(79,124,255,0.3) 0%, transparent 70%)", borderRadius: "50%", filter: "blur(20px)" }} />
           
           <h3 style={{ color: "#fff", margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "12px", zIndex: 2 }}>
               <span style={{ color: "#4F7CFF", textShadow: "0 0 10px #4F7CFF" }}>🌌</span> The Multiverse Engine
           </h3>
           <p style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", marginBottom: "24px", zIndex: 2 }}>Simulating Earth-616: The universe where you invested your 'Wants'.</p>
           
           <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "24px", zIndex: 2 }}>
               
               <div style={{ background: "rgba(0,0,0,0.4)", border: "1px dashed rgba(79,124,255,0.5)", padding: "20px", borderRadius: "16px", textAlign: "center" }}>
                   <div style={{ fontSize: "10px", color: "#4F7CFF", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px" }}>Parallel Net Worth (1 Yr)</div>
                   <div style={{ fontSize: "36px", fontWeight: "900", color: "#fff", fontFamily: "'JetBrains Mono', monospace", textShadow: "0 0 20px rgba(79,124,255,0.5)" }}>₹{fmt(Math.round(parallelWealth))}</div>
                   <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", marginTop: "8px" }}>If your toxic leaks were routed to NIFTY50.</div>
               </div>

               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "rgba(255,42,95,0.1)", borderRadius: "16px", border: "1px solid rgba(255,42,95,0.3)" }}>
                   <div>
                       <div style={{ color: "#fff", fontWeight: "bold", fontSize: "14px", marginBottom: "4px" }}>The Reality Gap</div>
                       <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)" }}>Wealth you actively surrendered to society.</div>
                   </div>
                   <div style={{ color: "#FF2A5F", fontWeight: "900", fontFamily: "'JetBrains Mono', monospace", fontSize: "20px" }}>-₹{fmt(Math.round(wealthGap))}</div>
               </div>

           </div>
        </div>
      </div>

      {/* TIER 3: GOLDEN RATIO */}
      <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", padding: "32px", borderRadius: "24px", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
          <div>
            <h3 style={{ color: "#fff", margin: "0 0 8px 0" }}>Golden Ratio Compliance (50/30/20)</h3>
            <p style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "12px", margin: 0 }}>Visualizing your alignment with foundational wealth-building physics.</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", padding: "8px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
              Total Load: {needPct + wantPct + savePct}%
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
           {[
             { label: "Needs (Survival & Obligations)", actual: needPct, ideal: 50, color: "#4F7CFF", icon: "🛡️" },
             { label: "Wants (Ego & Lifestyle Leaks)", actual: wantPct, ideal: 30, color: "#FF2A5F", icon: "🎭" },
             { label: "Savings (Future Freedom & Wealth)", actual: savePct, ideal: 20, color: "#10B981", icon: "🚀" }
           ].map((r) => {
             const ok = r.label.includes("Savings") ? r.actual >= r.ideal : r.actual <= r.ideal;
             return (
               <div key={r.label}>
                 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                     <span style={{ color: "#fff", fontWeight: "bold", fontSize: "14px" }}>{r.icon} {r.label}</span>
                     <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                         <span style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>System Ideal: {r.ideal}%</span>
                         <span style={{ fontFamily: "'JetBrains Mono', monospace", color: r.color, fontWeight: "900", fontSize: "16px", background: "rgba(0,0,0,0.3)", padding: "4px 8px", borderRadius: "6px" }}>{r.actual}%</span>
                         <span style={{ fontSize: "16px", background: ok ? "rgba(16,185,129,0.1)" : "rgba(255,42,95,0.1)", padding: "4px", borderRadius: "6px" }}>{ok ? "✅" : "⚠️"}</span>
                     </div>
                 </div>
                 <div style={{ width: "100%", height: "16px", background: "rgba(0,0,0,0.5)", borderRadius: "8px", position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                     <div style={{ width: `${r.ideal}%`, height: "100%", position: "absolute", borderRight: "2px dashed rgba(255,255,255,0.3)", zIndex: 2 }} />
                     <div style={{ width: `${r.actual}%`, height: "100%", position: "absolute", background: r.color, boxShadow: `0 0 15px ${r.color}`, zIndex: 1, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                 </div>
               </div>
             );
           })}
        </div>
      </div>
    </div>
  );
}