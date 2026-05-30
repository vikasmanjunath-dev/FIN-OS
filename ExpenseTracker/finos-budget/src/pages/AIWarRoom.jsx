import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmt, calcTotals, calcRegret, calcLifeHours } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";
import { streamAskArya } from "../utils/aiService";

// ─── TYPEWRITER HOOK ────────────────────────────────────────────
function useTypewriter(text, speed = 18) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return { displayed, done };
}

// ─── VITALS MONITOR (ECG-STYLE) ────────────────────────────────
function VitalsMonitor({ label, value, color, danger }) {
  const canvasRef = useRef(null);
  const dataRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height = 60;
    let frame = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;
      dataRef.current.push(30 + Math.sin(frame * 0.08) * 15 + (danger ? Math.random() * 20 - 10 : Math.random() * 4 - 2));
      if (dataRef.current.length > w / 2) dataRef.current.shift();

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      dataRef.current.forEach((v, i) => {
        const x = (i / (w / 2)) * w;
        i === 0 ? ctx.moveTo(x, v) : ctx.lineTo(x, v);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
      requestAnimationFrame(draw);
    };
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [color, danger]);

  return (
    <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: "16px", padding: "16px", border: `1px solid ${danger ? "rgba(255,42,95,0.3)" : "rgba(255,255,255,0.05)"}`, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
        <span style={{ fontSize: "18px", fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height: "60px", display: "block" }} />
    </div>
  );
}

// ─── THREAT CARD ────────────────────────────────────────────────
function ThreatCard({ threat, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      style={{ background: `rgba(${threat.severity === "CRITICAL" ? "255,42,95" : threat.severity === "HIGH" ? "245,158,11" : "79,124,255"},0.08)`, border: `1px solid rgba(${threat.severity === "CRITICAL" ? "255,42,95" : threat.severity === "HIGH" ? "245,158,11" : "79,124,255"},0.3)`, borderRadius: "16px", padding: "16px", display: "flex", gap: "16px", alignItems: "center" }}
    >
      <div style={{ fontSize: "10px", fontWeight: 900, color: threat.severity === "CRITICAL" ? "#FF2A5F" : threat.severity === "HIGH" ? "#F59E0B" : "#4F7CFF", background: `rgba(${threat.severity === "CRITICAL" ? "255,42,95" : threat.severity === "HIGH" ? "245,158,11" : "79,124,255"},0.2)`, padding: "6px 10px", borderRadius: "8px", letterSpacing: "1px", flexShrink: 0 }}>
        {threat.severity}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: "14px" }}>{threat.title}</div>
        <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "12px", marginTop: "4px" }}>{threat.desc}</div>
      </div>
      <div style={{ color: "#FF2A5F", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", flexShrink: 0 }}>
        {threat.impact}
      </div>
    </motion.div>
  );
}

// ─── HOLT'S EWMA FORECAST ───────────────────────────────────────
function holtForecast(series, alpha = 0.3, beta = 0.1) {
  if (!series.length) return 0;
  if (series.length === 1) return series[0];
  let level = series[0];
  let trend = series[1] - series[0];
  for (let i = 1; i < series.length; i++) {
    const prev = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  return Math.max(0, level + trend);
}

function computeBudgetForecast(transactions, monthsBack = 6) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  // Build month keys
  const months = [];
  for (let i = monthsBack; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Skip investment/save categories
  const skipRe = /invest|save|safe|equity|wealth/i;

  // Bucket by category + month
  const catMonthly = {};
  transactions.forEach((t) => {
    if (!t.date || !t.amount || skipRe.test(t.category || "")) return;
    const d = new Date(t.date);
    if (isNaN(d) || d < cutoff) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cat = t.category || "Other";
    if (!catMonthly[cat]) catMonthly[cat] = {};
    catMonthly[cat][key] = (catMonthly[cat][key] || 0) + Math.abs(t.amount);
  });

  const byCategory = {};
  Object.entries(catMonthly).forEach(([cat, monthly]) => {
    const series = months.map((m) => monthly[m] || 0);
    if (series.every((v) => v === 0)) return;
    byCategory[cat] = Math.round(holtForecast(series));
  });

  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  return { total, byCategory };
}

// ─── FORECAST PANEL ─────────────────────────────────────────────
function ForecastPanel({ transactions, INCOME }) {
  const forecast = useMemo(() => computeBudgetForecast(transactions, 6), [transactions]);
  const top5 = Object.entries(forecast.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = top5[0]?.[1] || 1;
  const pctOfIncome = INCOME > 0 ? Math.round((forecast.total / INCOME) * 100) : 0;
  const hasData = forecast.total > 0;

  const panelStyle = {
    background: "rgba(79,124,255,0.05)",
    border: "1px solid rgba(79,124,255,0.18)",
    borderRadius: "24px",
    padding: "28px",
    backdropFilter: "blur(12px)",
  };
  const labelStyle = {
    fontSize: "10px", textTransform: "uppercase",
    letterSpacing: "1.2px", color: "#4F7CFF", marginBottom: "20px",
    display: "flex", alignItems: "center", gap: "8px",
  };
  const totalStyle = {
    fontSize: "42px", fontWeight: 900, color: "#fff",
    fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-1px",
  };

  return (
    <div style={panelStyle}>
      <div style={labelStyle}>
        <span>🔮</span> Next Month Budget Forecast
      </div>

      {!hasData ? (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
          Add transactions across multiple months to enable forecasting.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "16px", marginBottom: "6px" }}>
            <div style={totalStyle}>₹{forecast.total.toLocaleString("en-IN")}</div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", paddingBottom: "8px" }}>
              predicted spend
            </div>
          </div>
          <div style={{ fontSize: "12px", color: pctOfIncome > 80 ? "#FF2A5F" : pctOfIncome > 60 ? "#F59E0B" : "#10B981", marginBottom: "24px", fontWeight: 700 }}>
            {pctOfIncome}% of your ₹{INCOME.toLocaleString("en-IN")} income
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {top5.map(([cat, amt]) => (
              <div key={cat}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>{cat}</span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>
                    ₹{amt.toLocaleString("en-IN")}
                  </span>
                </div>
                <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(amt / max) * 100}%`, background: "linear-gradient(90deg, #4F7CFF, #00D4FF)", borderRadius: "4px", transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "20px", fontSize: "11px", color: "rgba(255,255,255,0.25)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
            ⚡ Client-side EWMA — based on last 6 months of transactions
          </div>
        </>
      )}
    </div>
  );
}

// ─── MATRIX RAIN COMPONENT ──────────────────────────────────────
function MatrixRain({ transactions }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height = canvas.offsetHeight;
    const cols = Math.floor(w / 16);
    const drops = Array(cols).fill(0).map(() => Math.random() * h);
    const chars = "₹0123456789ABCDEF+-×÷%.";

    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = "13px 'JetBrains Mono', monospace";

      drops.forEach((y, i) => {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const alpha = 0.3 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(199, 240, 0, ${alpha})`;
        ctx.fillText(char, i * 16, y);
        if (y > h && Math.random() > 0.97) drops[i] = 0;
        drops[i] += 14 + Math.random() * 4;
      });
      requestAnimationFrame(draw);
    };
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, opacity: 0.15, pointerEvents: "none" }} />;
}

// ═══ MAIN AI WAR ROOM ═══
export default function AIWarRoom({ transactions, INCOME }) {
  const { needs, wants, saves, total, savings, health } = calcTotals(transactions, INCOME);
  const [aiMessages, setAiMessages] = useState([{ role: "system", text: "NEURAL CORE ONLINE. All subsystems operational. Awaiting directive..." }]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const terminalRef = useRef(null);

  // Generate threats from transaction data
  const threats = useMemo(() => {
    const t = [];
    const wantPct = (wants / INCOME) * 100;
    if (wantPct > 30) t.push({ severity: "CRITICAL", title: "Lifestyle Inflation Detected", desc: `Want spending at ${wantPct.toFixed(0)}% — exceeds 30% safety threshold`, impact: `-₹${fmt(wants)}` });
    const recurring = transactions.filter(x => x.isRecurring);
    if (recurring.length > 0) t.push({ severity: "HIGH", title: `${recurring.length} Ghost Tax Subscriptions`, desc: "Silent recurring drains detected in your cash flow", impact: `-₹${fmt(recurring.reduce((a, x) => a + x.amount, 0))}/mo` });
    if (savings < INCOME * 0.1) t.push({ severity: "CRITICAL", title: "Reserve Deficit", desc: "Liquid reserves below 10% of income — no safety net", impact: `₹${fmt(savings)}` });
    const ego = transactions.filter(x => x.category === "want_ego");
    if (ego.length > 0) t.push({ severity: "HIGH", title: "Ego Tax Active", desc: `${ego.length} status-driven purchases this cycle`, impact: `-₹${fmt(ego.reduce((a, x) => a + x.amount, 0))}` });
    if (t.length === 0) t.push({ severity: "INFO", title: "Systems Nominal", desc: "No critical threats detected. Continue current protocol.", impact: "✓" });
    return t;
  }, [transactions, INCOME, wants, savings]);

  // AI response generator — powered by Arya / Ollama (streams tokens live)
  const processQuery = async (query) => {
    setIsProcessing(true);
    setAiMessages(prev => [...prev, { role: "user", text: query }]);
    setAiMessages(prev => [...prev, { role: "ai", text: "" }]);

    try {
      const financialData = { INCOME, needs, wants, saves, total, savings, health, transactions };
      await streamAskArya(query, financialData, (display) => {
        setAiMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "ai", text: display };
          return updated;
        });
      });
    } catch (err) {
      setAiMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "ai", text: `[ERROR] ${err.message}\n\nMake sure Ollama is running: ollama serve` };
        return updated;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [aiMessages]);

  const quickCommands = ["Run full diagnostic", "Find my worst leak", "Predict next impulse", "Calculate my FIRE number", "Audit food spending"];

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      {/* HEADER */}
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#FF2A5F", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: "8px", height: "8px", background: "#FF2A5F", borderRadius: "50%" }} />
            Threat Detection Active
          </div>
          <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900, letterSpacing: "-1px" }}>AI War Room</h1>
          <p style={{ color: "var(--text-muted, #9AA0B4)", marginTop: "8px" }}>Neural command center for financial defense operations.</p>
        </div>
        <div style={{ background: health > 70 ? "rgba(16,185,129,0.1)" : health > 40 ? "rgba(245,158,11,0.1)" : "rgba(255,42,95,0.1)", border: `1px solid ${health > 70 ? "#10B981" : health > 40 ? "#F59E0B" : "#FF2A5F"}`, padding: "12px 20px", borderRadius: "16px", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: health > 70 ? "#10B981" : health > 40 ? "#F59E0B" : "#FF2A5F", fontWeight: 900 }}>
          DEFCON {health > 70 ? "5" : health > 40 ? "3" : "1"} — {health > 70 ? "SAFE" : health > 40 ? "ELEVATED" : "CRITICAL"}
        </div>
      </div>

      {/* VITALS ROW */}
      <StaggerContainer>
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
            <VitalsMonitor label="System Health" value={`${health}%`} color={health > 70 ? "#10B981" : health > 40 ? "#F59E0B" : "#FF2A5F"} danger={health < 40} />
            <VitalsMonitor label="Burn Rate" value={`₹${fmt(total)}`} color="#FF2A5F" danger={total > INCOME * 0.8} />
            <VitalsMonitor label="Savings Pulse" value={`₹${fmt(savings)}`} color="#10B981" danger={savings < INCOME * 0.1} />
            <VitalsMonitor label="Threat Level" value={threats.filter(t => t.severity === "CRITICAL").length > 0 ? "ACTIVE" : "CLEAR"} color={threats.some(t => t.severity === "CRITICAL") ? "#FF2A5F" : "#10B981"} danger={threats.some(t => t.severity === "CRITICAL")} />
          </div>
        </StaggerItem>

        {/* THREAT DETECTION + AI TERMINAL */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "24px", marginBottom: "32px" }}>
            {/* THREATS */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "28px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px 0", display: "flex", alignItems: "center", gap: "12px", fontSize: "16px" }}>
                <span style={{ color: "#FF2A5F" }}>🎯</span> Active Threats
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {threats.map((t, i) => <ThreatCard key={i} threat={t} index={i} />)}
              </div>
            </div>

            {/* AI TERMINAL */}
            <div style={{ background: "rgba(5,8,15,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "24px", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", backdropFilter: "blur(12px)" }}>
              <MatrixRain transactions={transactions} />
              {/* Terminal header */}
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F56" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FFBD2E" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#27C93F" }} />
                  <span style={{ marginLeft: "12px", fontSize: "11px", color: "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace" }}>fin-os://neural-core</span>
                </div>
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity }} style={{ fontSize: "10px", color: "#C7F000", fontFamily: "'JetBrains Mono', monospace" }}>
                  ● LIVE
                </motion.div>
              </div>

              {/* Messages */}
              <div ref={terminalRef} style={{ flex: 1, padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "400px", zIndex: 2 }}>
                {aiMessages.map((msg, i) => (
                  <div key={i} style={{ fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.7 }}>
                    {msg.role === "system" && <div style={{ color: "#6B7280" }}>[SYS] {msg.text}</div>}
                    {msg.role === "user" && <div style={{ color: "#4F7CFF" }}><span style={{ color: "#C7F000" }}>root@fin-os</span>:<span style={{ color: "#4F7CFF" }}>~$</span> {msg.text}</div>}
                    {msg.role === "ai" && <div style={{ color: "#C7F000", background: "rgba(199,240,0,0.04)", padding: "16px", borderRadius: "12px", borderLeft: "3px solid #C7F000", whiteSpace: "pre-wrap" }}>{msg.text}</div>}
                  </div>
                ))}
                {isProcessing && (
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity }} style={{ color: "#C7F000", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace" }}>
                    ▓▓▓ Processing neural query...
                  </motion.div>
                )}
              </div>

              {/* Quick commands */}
              <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "8px", flexWrap: "wrap", zIndex: 2 }}>
                {quickCommands.map(cmd => (
                  <motion.button key={cmd} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => processQuery(cmd)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", borderRadius: "20px", padding: "6px 14px", fontSize: "11px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                    {cmd}
                  </motion.button>
                ))}
              </div>

              {/* Input */}
              <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "12px", zIndex: 2 }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && input.trim()) { processQuery(input); setInput(""); } }} placeholder="Enter command..." style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", color: "#fff", outline: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }} />
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { if (input.trim()) { processQuery(input); setInput(""); } }} style={{ background: "#C7F000", color: "#000", border: "none", borderRadius: "12px", padding: "0 24px", fontWeight: 900, cursor: "pointer", fontSize: "12px", letterSpacing: "0.5px" }}>
                  EXECUTE
                </motion.button>
              </div>
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* FORECAST + REGRET ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "8px" }}>
        <ForecastPanel transactions={transactions} INCOME={INCOME} />

        {/* 10-YEAR REGRET CARD */}
        <div style={{ background: "rgba(255,42,95,0.05)", border: "1px solid rgba(255,42,95,0.18)", borderRadius: "24px", padding: "28px", backdropFilter: "blur(12px)" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.2px", color: "#FF2A5F", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⏳</span> 10-Year Opportunity Cost
          </div>
          <div style={{ fontSize: "42px", fontWeight: 900, color: "#fff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-1px", marginBottom: "6px" }}>
            ₹{calcRegret(wants).toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>
            what your want-spending becomes at 12% CAGR
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[
              { label: "Monthly wants", value: `₹${fmt(wants)}`, color: "#FF2A5F" },
              { label: "Annual drain", value: `₹${fmt(wants * 12)}`, color: "#F59E0B" },
              { label: "10yr regret (12%)", value: `₹${fmt(calcRegret(wants))}`, color: "#FF2A5F" },
              { label: "Multiplier", value: "3.1×", color: "#C7F000" },
            ].map((item) => (
              <div key={item.label} style={{ background: "rgba(0,0,0,0.3)", borderRadius: "12px", padding: "12px" }}>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.8px" }}>{item.label}</div>
                <div style={{ fontSize: "16px", fontWeight: 900, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
