import { useMemo } from "react";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, PointElement, LineElement, Filler } from "chart.js";
import { fmt, calcTotals } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, PointElement, LineElement, Filler);

export default function ReportsPage({ transactions, INCOME }) {
  const { needs, wants, saves, total, savings, health } = calcTotals(transactions, INCOME);
  const savingsRate = INCOME > 0 ? Math.round((savings / INCOME) * 100) : 0;

  const categoryBreakdown = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const key = t.type || "Other";
      map[key] = (map[key] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const topMerchants = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      map[t.name] = (map[t.name] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [transactions]);

  const dayOfWeekData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const amounts = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    transactions.forEach(t => {
      const d = new Date(t.date).getDay();
      if (!isNaN(d)) { amounts[d] += t.amount; counts[d]++; }
    });
    return { days, amounts, counts };
  }, [transactions]);

  const behaviorSplit = useMemo(() => {
    const groups = { need_survival: 0, need_obligation: 0, want_lifestyle: 0, want_impulse: 0, want_ego: 0, debt_toxic: 0, save_liquid: 0, save_wealth: 0, save_self: 0 };
    transactions.forEach(t => { if (groups[t.category] !== undefined) groups[t.category] += t.amount; });
    return groups;
  }, [transactions]);

  const donutData = {
    labels: ["Needs", "Wants", "Investments", "Unallocated"],
    datasets: [{
      data: [needs, wants, saves, Math.max(0, savings)],
      backgroundColor: ["#4F7CFF", "#FF2A5F", "#10B981", "rgba(255,255,255,0.05)"],
      borderWidth: 0, hoverOffset: 8,
    }],
  };

  const categoryChartData = {
    labels: categoryBreakdown.slice(0, 8).map(c => c[0]),
    datasets: [{
      data: categoryBreakdown.slice(0, 8).map(c => c[1]),
      backgroundColor: ["#4F7CFF", "#FF2A5F", "#10B981", "#F59E0B", "#06B6D4", "#8B5CF6", "#EC4899", "#C7F000"],
      borderWidth: 0, borderRadius: 8,
    }],
  };

  const simMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const savingsRateHistory = simMonths.map((_, i) => Math.max(5, savingsRate + Math.round((Math.random() - 0.5) * 15 - (5 - i) * 2)));
  savingsRateHistory[savingsRateHistory.length - 1] = savingsRate;

  const savingsTrend = {
    labels: simMonths,
    datasets: [{
      label: "Savings Rate %",
      data: savingsRateHistory,
      borderColor: "#C7F000", backgroundColor: "rgba(199,240,0,0.1)",
      fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointBackgroundColor: "#C7F000",
    }],
  };

  const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9AA0B4" }, grid: { display: false } }, y: { ticks: { color: "#9AA0B4", callback: v => "₹" + fmt(v) }, grid: { color: "rgba(255,255,255,0.05)" } } } };

  const handlePrint = () => window.print();

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }} id="reports-page">
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#06B6D4", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", background: "#06B6D4", borderRadius: "50%", animation: "pulse-glow 1s infinite" }} />
            Analytics Core
          </div>
          <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900 }}>Monthly Report</h1>
          <p style={{ color: "#9AA0B4", marginTop: "8px" }}>Comprehensive financial analysis for the current cycle.</p>
        </div>
        <button onClick={handlePrint} style={{ background: "#4F7CFF", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "12px", fontWeight: 900, cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>🖨️ PRINT REPORT</button>
      </div>

      <StaggerContainer>
        {/* SUMMARY ROW */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "32px" }}>
            {[
              { label: "Total Income", value: `₹${fmt(INCOME)}`, color: "#4F7CFF", icon: "📥" },
              { label: "Total Spent", value: `₹${fmt(total)}`, color: "#FF2A5F", icon: "📤" },
              { label: "Net Savings", value: `₹${fmt(savings)}`, color: "#10B981", icon: "💰" },
              { label: "Savings Rate", value: `${savingsRate}%`, color: savingsRate >= 20 ? "#C7F000" : "#F59E0B", icon: "📊" },
              { label: "Health Score", value: `${health}%`, color: health > 70 ? "#10B981" : health > 40 ? "#F59E0B" : "#FF2A5F", icon: "❤️" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", padding: "20px", backdropFilter: "blur(12px)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "18px" }}>{s.icon}</span>
                  <span style={{ fontSize: "10px", color: "#9AA0B4", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </StaggerItem>

        {/* CHARTS ROW */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px", marginBottom: "32px" }}>
            {/* DONUT */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px 0", fontSize: "14px" }}>💸 Allocation Split</h3>
              <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { position: "bottom", labels: { color: "#9AA0B4", font: { size: 11 }, padding: 12 } } } }} />
              </div>
            </div>

            {/* CATEGORY BAR */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px 0", fontSize: "14px" }}>📦 Category Breakdown</h3>
              <div style={{ height: "200px" }}>
                <Bar data={categoryChartData} options={chartOpts} />
              </div>
            </div>

            {/* SAVINGS TREND */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px 0", fontSize: "14px" }}>📈 Savings Rate Trend</h3>
              <div style={{ height: "200px" }}>
                <Line data={savingsTrend} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9AA0B4" }, grid: { display: false } }, y: { ticks: { color: "#9AA0B4", callback: v => v + "%" }, grid: { color: "rgba(255,255,255,0.05)" }, min: 0, max: 100 } } }} />
              </div>
            </div>
          </div>
        </StaggerItem>

        {/* TOP MERCHANTS + BEHAVIOR */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
            {/* TOP MERCHANTS */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", fontSize: "14px" }}>🏪 Top 5 Spending Sources</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {topMerchants.map(([name, amount], i) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: `rgba(79,124,255,${0.3 - i * 0.05})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#4F7CFF", fontWeight: 900, fontSize: "14px", fontFamily: "'JetBrains Mono', monospace" }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: "14px" }}>{name}</div>
                      <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "100px", marginTop: "6px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, (amount / (topMerchants[0]?.[1] || 1)) * 100)}%`, height: "100%", background: "#4F7CFF", borderRadius: "100px" }} />
                      </div>
                    </div>
                    <span style={{ color: "#4F7CFF", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: "14px" }}>₹{fmt(amount)}</span>
                  </div>
                ))}
                {topMerchants.length === 0 && <div style={{ textAlign: "center", padding: "24px", color: "#9AA0B4" }}>No transactions yet.</div>}
              </div>
            </div>

            {/* BEHAVIOR HEATMAP */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", fontSize: "14px" }}>🧠 Behavioral DNA Breakdown</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {Object.entries(behaviorSplit).filter(([, v]) => v > 0).map(([key, val]) => {
                  const pct = INCOME > 0 ? Math.round((val / INCOME) * 100) : 0;
                  const isLeak = key.startsWith("want") || key.startsWith("debt");
                  const color = key.startsWith("save") ? "#10B981" : key.startsWith("need") ? "#4F7CFF" : "#FF2A5F";
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                        <span style={{ color: "#fff", textTransform: "capitalize" }}>{key.replace("_", " ")}</span>
                        <span style={{ color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>₹{fmt(val)} ({pct}%)</span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "100px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, pct * 2)}%`, height: "100%", background: color, borderRadius: "100px", boxShadow: `0 0 8px ${color}40` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </StaggerItem>

        {/* SPENDING BY DAY */}
        <StaggerItem>
          <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
            <h3 style={{ color: "#fff", margin: "0 0 20px 0", fontSize: "14px" }}>📅 Spending by Day of Week</h3>
            <div style={{ height: "200px" }}>
              <Bar data={{ labels: dayOfWeekData.days, datasets: [{ data: dayOfWeekData.amounts, backgroundColor: dayOfWeekData.amounts.map(v => v > (INCOME * 0.05) ? "#FF2A5F" : "#4F7CFF"), borderRadius: 8 }] }} options={{ ...chartOpts, plugins: { legend: { display: false } } }} />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: "16px", fontSize: "12px" }}>
              <span style={{ color: "#9AA0B4" }}>Total Transactions: <strong style={{ color: "#fff" }}>{transactions.length}</strong></span>
              <span style={{ color: "#9AA0B4" }}>Avg per transaction: <strong style={{ color: "#4F7CFF" }}>₹{fmt(transactions.length > 0 ? Math.round(total / transactions.length) : 0)}</strong></span>
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
