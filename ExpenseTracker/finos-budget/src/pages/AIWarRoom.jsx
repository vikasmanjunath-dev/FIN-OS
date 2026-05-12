import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmt, calcTotals, calcRegret, calcLifeHours } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";

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

  // AI response generator
  const processQuery = (query) => {
    setIsProcessing(true);
    setAiMessages(prev => [...prev, { role: "user", text: query }]);

    const q = query.toLowerCase();
    let response = "";

    if (q.includes("fire") || q.includes("retire")) {
      const monthlyExpenses = total || 30000;
      const fireNumber = monthlyExpenses * 12 * 25;
      const currentSavings = saves * 12;
      const yearsToFire = currentSavings > 0 ? Math.ceil(Math.log(fireNumber / Math.max(1, currentSavings)) / Math.log(1.12)) : 99;
      response = `[FIRE ANALYSIS]\n\nTarget FIRE Number: ₹${fmt(fireNumber)}\nBased on monthly burn rate of ₹${fmt(monthlyExpenses)}\n\nAt current investment rate (₹${fmt(saves)}/mo):\n→ Years to Financial Independence: ${yearsToFire} years\n→ Required corpus at 4% SWR: ₹${fmt(fireNumber)}\n\n[RECOMMENDATION]: Increase SIP by 20% to shave 3-4 years off your FIRE date.`;
    } else if (q.includes("worst") || q.includes("biggest")) {
      const sorted = [...transactions].filter(t => t.category.startsWith("want") || t.category.startsWith("debt")).sort((a, b) => b.amount - a.amount);
      const top3 = sorted.slice(0, 3);
      response = `[DAMAGE REPORT — TOP 3 WEALTH DESTROYERS]\n\n${top3.map((t, i) => `${i + 1}. ${t.name}: -₹${fmt(t.amount)} (${t.category.replace("_", " ")})\n   10-Year Cost: ₹${fmt(calcRegret(t.amount))}`).join("\n\n")}${top3.length === 0 ? "No destructive transactions found. Excellent discipline." : "\n\n[ACTION]: Eliminate the top leak to reclaim ₹" + fmt(calcRegret(top3[0]?.amount || 0)) + " in 10 years."}`;
    } else if (q.includes("food") || q.includes("zomato") || q.includes("swiggy")) {
      const food = transactions.filter(t => t.type === "Dining");
      const foodTotal = food.reduce((a, t) => a + t.amount, 0);
      const hours = calcLifeHours(foodTotal, INCOME);
      response = `[FOOD AUDIT]\n\nTotal dining spend: ₹${fmt(foodTotal)}\nTransactions: ${food.length}\nLife-hours traded: ${hours}h\n10-Year opportunity cost: ₹${fmt(calcRegret(foodTotal))}\n\n[INSIGHT]: Cooking 3 days/week saves ~₹1,200/month = ₹4.47L in 10 years with compounding.`;
    } else if (q.includes("predict") || q.includes("next")) {
      const dayOfWeek = new Date().getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      response = `[PREDICTIVE ENGINE]\n\nBehavioral Pattern Analysis:\n→ ${isWeekend ? "⚠️ WEEKEND DETECTED: 73% higher impulse probability" : "✓ Weekday: Lower impulse probability"}\n→ Fatigue Index: ${health < 50 ? "HIGH — Financial stress detected" : "MODERATE"}\n→ Most likely next purchase: ${transactions.length > 0 ? transactions[transactions.length - 1].type : "Unknown"}\n\n[PRE-EMPTIVE PROTOCOL]: Lock ₹${fmt(Math.round(INCOME * 0.05))} into savings before the next impulse window.`;
    } else {
      response = `[ANALYSIS COMPLETE]\n\nIncome: ₹${fmt(INCOME)}\nBurn Rate: ₹${fmt(total)} (${Math.round(total / INCOME * 100)}%)\nHealth Score: ${health}%\nSavings: ₹${fmt(savings)}\n\nTop Categories:\n→ Needs: ₹${fmt(needs)} (${Math.round(needs / INCOME * 100)}%)\n→ Wants: ₹${fmt(wants)} (${Math.round(wants / INCOME * 100)}%)\n→ Investments: ₹${fmt(saves)} (${Math.round(saves / INCOME * 100)}%)\n\n[STATUS]: ${health > 70 ? "Systems optimal. Maintain current trajectory." : health > 40 ? "Warning: Lifestyle creep detected. Tighten protocols." : "CRITICAL: Immediate intervention required."}`;
    }

    setTimeout(() => {
      setAiMessages(prev => [...prev, { role: "ai", text: response }]);
      setIsProcessing(false);
    }, 800);
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
    </div>
  );
}
