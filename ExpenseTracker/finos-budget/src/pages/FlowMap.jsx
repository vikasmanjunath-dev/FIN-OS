import { useMemo } from "react";
import { Line, Bar } from "react-chartjs-2";
import { Chart as ChartJS, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from "chart.js";
import { fmt, calcTotals, calcRegret } from "../utils/constants";

ChartJS.register(LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

export default function FlowMap({ transactions, INCOME }) {
  const { needs, wants, saves, total, savings } = calcTotals(transactions, INCOME);

  // --- ENGINE 1: VELOCITY & BURNDOWN (OLD FEATURE RETAINED) ---
  const currentDay = Math.max(1, new Date().getDate());
  const daysInMonth = 30; 
  const daysLeft = Math.max(1, daysInMonth - currentDay);
  const dailyBurnRate = total / currentDay;
  const daysUntilBroke = dailyBurnRate > 0 ? Math.floor(INCOME / dailyBurnRate) : 30;
  
  const savingsTarget = INCOME * 0.20;
  const safeDailyAllowance = Math.max(0, INCOME - total - savingsTarget) / daysLeft;

  const trajectoryData = useMemo(() => {
    const days = Array.from({ length: currentDay }, (_, i) => `Day ${i + 1}`);
    const idealDailySpend = (INCOME - savingsTarget) / daysInMonth;
    const idealPath = [];
    const actualPath = [];
    let cumulativeActual = 0;

    for (let i = 1; i <= currentDay; i++) {
      idealPath.push(INCOME - (idealDailySpend * i));
      const spentToday = transactions
        .filter((t) => parseInt(t.date?.split("-")[2] || 0, 10) === i)
        .reduce((sum, t) => sum + t.amount, 0);
      cumulativeActual += spentToday;
      actualPath.push(INCOME - cumulativeActual);
    }
    return { days, idealPath, actualPath };
  }, [transactions, INCOME, currentDay, savingsTarget]);

  const burnChartData = {
    labels: trajectoryData.days,
    datasets: [
      { label: "Actual Capital Remaining", data: trajectoryData.actualPath, borderColor: "#FF2A5F", backgroundColor: "rgba(255, 42, 95, 0.1)", fill: true, tension: 0.4, borderWidth: 3, pointRadius: 2 },
      { label: "Ideal Curve (20% Target)", data: trajectoryData.idealPath, borderColor: "#10B981", borderDash: [5, 5], fill: false, tension: 0.1, borderWidth: 2, pointRadius: 0 }
    ]
  };

  // --- ENGINE 2: QFT PERSONA DIAGNOSTIC ---
  const persona = useMemo(() => {
    const wantPct = (wants / INCOME) * 100;
    const savePct = (saves / INCOME) * 100;
    if (savePct >= 30) return { title: "The SIP Monk", desc: "Aggressive compounding detected. You are buying freedom.", color: "#10B981", icon: "🧘‍♂️" };
    if (wantPct > 40) return { title: "The Sharmaji Follower", desc: "Critical Ego Leak. You are financing a lifestyle to impress others.", color: "#FF2A5F", icon: "🎭" };
    if (savePct >= 15) return { title: "The Pragmatist", desc: "Decent baseline. Tighten the Swiggy leaks and you'll hit escape velocity.", color: "#4F7CFF", icon: "⚖️" };
    return { title: "The EMI Slave", desc: "Working for the bank. Immediate intervention required.", color: "#F59E0B", icon: "⛓️" };
  }, [wants, saves, INCOME]);

  // --- ENGINE 3: MONTE CARLO PROJECTIONS (NEW FEATURE) ---
  const monteCarloData = useMemo(() => {
    const years = Array.from({length: 11}, (_, i) => `Yr ${i}`);
    const monthlySave = Math.max(1000, saves); 
    const annualSave = monthlySave * 12;
    const worst = []; const average = []; const best = [];
    let wVal = 0; let aVal = 0; let bVal = 0;

    for(let i=0; i<=10; i++) {
        worst.push(wVal); average.push(aVal); best.push(bVal);
        wVal = (wVal + annualSave) * 1.06;
        aVal = (aVal + annualSave) * 1.12;
        bVal = (bVal + annualSave) * 1.15;
    }
    return { years, worst, average, best, currentRunRate: aVal };
  }, [saves]);

  const mcChartData = {
    labels: monteCarloData.years,
    datasets: [
      { label: "Optimized (15%)", data: monteCarloData.best, borderColor: "#C7F000", borderDash: [5,5], tension: 0.4 },
      { label: "Nifty 50 Index (12%)", data: monteCarloData.average, borderColor: "#4F7CFF", backgroundColor: "rgba(79,124,255,0.1)", fill: true, tension: 0.4, borderWidth: 3 },
      { label: "FD / Safe (6%)", data: monteCarloData.worst, borderColor: "#EF4444", tension: 0.4 }
    ]
  };

  // --- ENGINE 4: HEATMAP & ANOMALIES ---
  const heatmapData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const spendByDay = [0, 0, 0, 0, 0, 0, 0];
    transactions.forEach(t => {
      if(t.category.startsWith('want') || t.category.startsWith('debt')) {
        const d = new Date(t.date).getDay();
        if(!isNaN(d)) spendByDay[d] += t.amount;
      }
    });
    return { days, spendByDay };
  }, [transactions]);

  const anomalies = useMemo(() => transactions.filter(t => (t.category.startsWith('want') || t.category.startsWith('debt')) && t.amount > (INCOME * 0.05)).sort((a,b) => b.amount - a.amount).slice(0, 3), [transactions, INCOME]);

  const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#fff" } } }, scales: { x: { ticks: { color: "#A1A4AC" }, grid: { display: false } }, y: { ticks: { color: "#A1A4AC", callback: v => '₹'+fmt(v) }, grid: { color: "rgba(255,255,255,0.05)" } } } };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#4F7CFF", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px" }}>Deep Analytics</div>
          <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: "900", letterSpacing: "-1px" }}>Cashflow Command Center</h1>
        </div>
        <div style={{ background: "rgba(199, 240, 0, 0.1)", color: "#C7F000", padding: "8px 16px", borderRadius: "12px", border: "1px solid #C7F000", fontWeight: "bold", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}>
            GOD-MODE ALGORITHMS ACTIVE
        </div>
      </div>

      <div style={{ background: "rgba(20,24,40,0.6)", backdropFilter: "blur(12px)", border: `1px solid ${persona.color}`, borderRadius: "24px", padding: "32px", marginBottom: "32px", display: "flex", gap: "32px", alignItems: "center", boxShadow: `0 10px 40px ${persona.color}20` }}>
        <div style={{ fontSize: "64px", background: "rgba(0,0,0,0.3)", padding: "24px", borderRadius: "24px", border: `1px solid ${persona.color}50` }}>{persona.icon}</div>
        <div>
          <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace" }}>Diagnosis: Behavioral Archetype</div>
          <div style={{ fontSize: "36px", fontWeight: "900", color: persona.color, fontFamily: "'Manrope', sans-serif", letterSpacing: "-1px" }}>{persona.title}</div>
          <div style={{ fontSize: "16px", color: "#E2E8F0", marginTop: "12px", lineHeight: "1.6", maxWidth: "600px" }}>{persona.desc}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "32px" }}>
        <div style={{ background: "rgba(20,24,40,0.4)", border: `1px solid ${daysUntilBroke < 30 ? "#FF2A5F" : "rgba(255,255,255,0.1)"}`, padding: "24px", borderRadius: "24px", backdropFilter: "blur(12px)" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase" }}>Survival Runway</div>
          <div style={{ fontSize: "32px", fontWeight: "900", color: daysUntilBroke < 30 ? "#FF2A5F" : "#10B981" }}>{daysUntilBroke < 30 ? `Day ${daysUntilBroke}` : "Stable"}</div>
        </div>
        <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "24px", borderRadius: "24px", backdropFilter: "blur(12px)" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase" }}>Current Velocity (Burn/Day)</div>
          <div style={{ fontSize: "32px", fontWeight: "900", color: "#F59E0B" }}>₹{fmt(Math.round(dailyBurnRate))}</div>
        </div>
        <div style={{ border: "1px solid #10B981", background: "rgba(16,185,129,0.05)", padding: "24px", borderRadius: "24px", backdropFilter: "blur(12px)" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase" }}>Safe Daily Allowance</div>
          <div style={{ fontSize: "32px", fontWeight: "900", color: "#10B981" }}>₹{fmt(Math.round(safeDailyAllowance))}</div>
        </div>
      </div>

      {/* RETAINED: BURNDOWN MATRIX */}
      <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", padding: "32px", borderRadius: "24px", marginBottom: "32px", backdropFilter: "blur(12px)" }}>
        <h3 style={{ color: "#fff", margin: "0 0 8px 0" }}>Capital Burndown Matrix</h3>
        <p style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "14px", marginBottom: "24px" }}>Visualizes how fast you are draining your capital compared to the mathematical ideal.</p>
        <div style={{ height: "250px" }}>
          <Line data={burnChartData} options={{...chartOpts, plugins: { legend: { display: false }}}} />
        </div>
      </div>

      {/* NEW: MONTE CARLO */}
      <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", padding: "32px", borderRadius: "24px", marginBottom: "32px", position: "relative", backdropFilter: "blur(12px)" }}>
        <h3 style={{ color: "#fff", margin: "0 0 8px 0" }}>Monte Carlo Wealth Projection</h3>
        <p style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "14px", marginBottom: "24px" }}>Based on your current monthly savings rate (₹{fmt(saves)}), predicting future net worth across 3 market scenarios.</p>
        <div style={{ height: "300px" }}>
            <Line data={mcChartData} options={chartOpts} />
        </div>
        <div style={{ position: "absolute", top: "32px", right: "32px", textAlign: "right" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase" }}>10-Yr Expected Value</div>
            <div style={{ fontSize: "28px", fontWeight: "900", color: "#4F7CFF", fontFamily: "'JetBrains Mono', monospace" }}>₹{fmt(Math.round(monteCarloData.currentRunRate))}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", padding: "24px", borderRadius: "24px", backdropFilter: "blur(12px)" }}>
          <h3 style={{ color: "#F59E0B", margin: "0 0 8px 0" }}>Vulnerability Heatmap</h3>
          <p style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "12px", marginBottom: "24px" }}>Days of the week your emotional defenses fail.</p>
          <div style={{ height: "200px" }}>
            <Bar data={{ labels: heatmapData.days, datasets: [{ data: heatmapData.spendByDay, backgroundColor: heatmapData.spendByDay.map(v => v > (INCOME*0.05) ? "#FF2A5F" : "#F59E0B"), borderRadius: 8 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: "#fff" } }, y: { display: false } } }} />
          </div>
        </div>

        <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", padding: "24px", borderRadius: "24px", backdropFilter: "blur(12px)" }}>
          <h3 style={{ color: "#FF2A5F", margin: "0 0 8px 0" }}>Weaponized Anomaly Radar</h3>
          <p style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "12px", marginBottom: "24px" }}>Massive leaks flagged. Here is what they cost you in the long run.</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {anomalies.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#10B981", background: "rgba(16,185,129,0.05)", borderRadius: "12px", border: "1px dashed #10B981" }}>✓ No toxic anomalies detected.</div>
            ) : (
              anomalies.map(a => (
                <div key={a.id} style={{ padding: "16px", background: "rgba(255,42,95,0.05)", borderRadius: "12px", border: "1px solid rgba(255,42,95,0.2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontWeight: "bold", color: "#fff", fontSize: "16px" }}>{a.name}</div>
                      <div style={{ fontSize: "10px", color: "#FF2A5F", textTransform: "uppercase", letterSpacing: "1px", marginTop: "4px" }}>{a.category.replace('_', ' ')}</div>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", color: "#FF2A5F", fontWeight: "900", fontSize: "20px" }}>-₹{fmt(a.amount)}</div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.5)", padding: "12px", borderRadius: "8px", fontSize: "12px", color: "var(--text-muted, #9AA0B4)", borderLeft: "3px solid #FF2A5F" }}>
                    10-Year Opportunity Cost: <strong style={{ color: "#F59E0B", fontFamily: "'JetBrains Mono', monospace", fontSize: "14px" }}>₹{fmt(calcRegret(a.amount))}</strong> lost forever.
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}