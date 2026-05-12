import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmt } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";

function calcPayoff(debts, strategy, extraPayment = 0) {
  if (!debts || debts.length === 0) return { months: 0, totalInterest: 0, timeline: [] };
  let pool = debts.map(d => ({ ...d, balance: d.amount }));
  let months = 0;
  let totalInterest = 0;
  const timeline = [];
  const maxMonths = 600;

  if (strategy === "avalanche") pool.sort((a, b) => b.rate - a.rate);
  else pool.sort((a, b) => a.balance - b.balance);

  while (pool.some(d => d.balance > 0) && months < maxMonths) {
    months++;
    let extra = extraPayment;
    pool.forEach(d => {
      if (d.balance <= 0) return;
      const interest = (d.balance * (d.rate / 100)) / 12;
      totalInterest += interest;
      d.balance += interest;
      d.balance -= d.minPayment;
      if (d.balance <= 0) { extra += d.minPayment; d.balance = 0; }
    });
    // Apply extra to target
    const target = pool.find(d => d.balance > 0);
    if (target) {
      target.balance = Math.max(0, target.balance - extra);
    }
    if (months % 3 === 0 || !pool.some(d => d.balance > 0)) {
      timeline.push({ month: months, remaining: pool.reduce((a, d) => a + Math.max(0, d.balance), 0) });
    }
  }
  return { months, totalInterest: Math.round(totalInterest), timeline };
}

const DEBT_TYPES = [
  { value: "credit_card", label: "💳 Credit Card", defaultRate: 36 },
  { value: "personal_loan", label: "🏦 Personal Loan", defaultRate: 14 },
  { value: "car_loan", label: "🚗 Car Loan", defaultRate: 9 },
  { value: "bnpl", label: "📱 BNPL / PayLater", defaultRate: 24 },
  { value: "education", label: "🎓 Education Loan", defaultRate: 8 },
  { value: "home_loan", label: "🏠 Home Loan", defaultRate: 8.5 },
  { value: "other", label: "⚡ Other", defaultRate: 12 },
];

export default function DebtDestroyer({ debts, setDebts }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newDebt, setNewDebt] = useState({ name: "", type: "credit_card", amount: "", rate: 36, minPayment: "" });
  const [extraPayment, setExtraPayment] = useState(2000);

  const addDebt = () => {
    if (!newDebt.name || !newDebt.amount || !newDebt.minPayment) return;
    setDebts(prev => [...prev, { ...newDebt, id: Date.now(), amount: parseFloat(newDebt.amount), minPayment: parseFloat(newDebt.minPayment), rate: parseFloat(newDebt.rate) }]);
    setNewDebt({ name: "", type: "credit_card", amount: "", rate: 36, minPayment: "" });
    setIsAdding(false);
  };

  const removeDebt = (id) => setDebts(prev => prev.filter(d => d.id !== id));

  const avalanche = useMemo(() => calcPayoff(debts, "avalanche", extraPayment), [debts, extraPayment]);
  const snowball = useMemo(() => calcPayoff(debts, "snowball", extraPayment), [debts, extraPayment]);
  const noExtra = useMemo(() => calcPayoff(debts, "avalanche", 0), [debts]);

  const totalDebt = debts.reduce((a, d) => a + d.amount, 0);
  const totalMinPayments = debts.reduce((a, d) => a + d.minPayment, 0);
  const bestStrategy = avalanche.totalInterest <= snowball.totalInterest ? "avalanche" : "snowball";
  const savedInterest = noExtra.totalInterest - avalanche.totalInterest;

  const freedomYears = Math.floor(avalanche.months / 12);
  const freedomMonths = avalanche.months % 12;
  const freedomDate = new Date();
  freedomDate.setMonth(freedomDate.getMonth() + avalanche.months);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#EF4444", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: "8px", height: "8px", background: "#EF4444", borderRadius: "50%" }} />
            Debt Elimination Protocol
          </div>
          <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900 }}>Debt Destroyer</h1>
          <p style={{ color: "#9AA0B4", marginTop: "8px" }}>Strategically eliminate every rupee you owe.</p>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} style={{ background: isAdding ? "rgba(255,42,95,0.1)" : "#EF4444", color: isAdding ? "#FF2A5F" : "#fff", border: isAdding ? "1px solid #FF2A5F" : "none", padding: "12px 24px", borderRadius: "12px", fontWeight: 900, cursor: "pointer" }}>
          {isAdding ? "CANCEL" : "+ ADD DEBT"}
        </button>
      </div>

      <StaggerContainer>
        {/* ADD FORM */}
        <AnimatePresence>
          {isAdding && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <div style={{ background: "rgba(20,24,40,0.6)", border: "1px solid #EF4444", borderRadius: "24px", padding: "32px", marginBottom: "32px", backdropFilter: "blur(12px)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <input placeholder="Debt Name" value={newDebt.name} onChange={e => setNewDebt({ ...newDebt, name: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                  <select value={newDebt.type} onChange={e => { const t = DEBT_TYPES.find(x => x.value === e.target.value); setNewDebt({ ...newDebt, type: e.target.value, rate: t?.defaultRate || 12 }); }} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }}>
                    {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="number" placeholder="Outstanding (₹)" value={newDebt.amount} onChange={e => setNewDebt({ ...newDebt, amount: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                  <input type="number" placeholder="Min Monthly (₹)" value={newDebt.minPayment} onChange={e => setNewDebt({ ...newDebt, minPayment: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#9AA0B4", fontSize: "12px" }}>Interest Rate:</span>
                    <input type="number" value={newDebt.rate} onChange={e => setNewDebt({ ...newDebt, rate: e.target.value })} style={{ width: "80px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "10px", borderRadius: "8px", color: "#F59E0B", outline: "none", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }} />
                    <span style={{ color: "#9AA0B4", fontSize: "12px" }}>% p.a.</span>
                  </div>
                  <button onClick={addDebt} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "12px 32px", borderRadius: "12px", fontWeight: 900, cursor: "pointer" }}>ADD DEBT</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {debts.length === 0 ? (
          <StaggerItem>
            <div style={{ background: "rgba(16,185,129,0.05)", border: "1px dashed #10B981", borderRadius: "24px", padding: "60px", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</div>
              <div style={{ color: "#10B981", fontWeight: 900, fontSize: "24px", marginBottom: "8px" }}>DEBT FREE</div>
              <div style={{ color: "#9AA0B4" }}>You have no debts tracked. Add debts above to start strategizing.</div>
            </div>
          </StaggerItem>
        ) : (
          <>
            {/* FREEDOM DATE */}
            <StaggerItem>
              <div style={{ background: "radial-gradient(circle at top, rgba(239,68,68,0.1) 0%, rgba(20,24,40,0.6) 70%)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "28px", padding: "40px", marginBottom: "32px", textAlign: "center", backdropFilter: "blur(12px)" }}>
                <div style={{ fontSize: "14px", color: "#9AA0B4", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "16px" }}>Freedom Date</div>
                <div style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                  {[{ val: freedomYears, label: "YEARS" }, { val: freedomMonths, label: "MONTHS" }].map((item, i) => (
                    <motion.div key={i} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ delay: i * 0.15, type: "spring" }} style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "20px", padding: "20px 32px", textAlign: "center" }}>
                      <div style={{ fontSize: "40px", fontWeight: 900, color: "#EF4444", fontFamily: "'JetBrains Mono', monospace" }}>{item.val}</div>
                      <div style={{ fontSize: "10px", color: "#9AA0B4", letterSpacing: "2px", marginTop: "4px" }}>{item.label}</div>
                    </motion.div>
                  ))}
                </div>
                <div style={{ color: "#9AA0B4", fontSize: "14px" }}>Target: <strong style={{ color: "#fff" }}>{freedomDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</strong></div>
              </div>
            </StaggerItem>

            {/* SUMMARY */}
            <StaggerItem>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
                {[
                  { label: "Total Debt", value: `₹${fmt(totalDebt)}`, color: "#EF4444", icon: "💀" },
                  { label: "Monthly Payments", value: `₹${fmt(totalMinPayments)}`, color: "#F59E0B", icon: "📤" },
                  { label: "Interest Saved", value: `₹${fmt(savedInterest)}`, color: "#10B981", icon: "💰" },
                  { label: "Active Debts", value: debts.length, color: "#4F7CFF", icon: "📋" },
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

            {/* EXTRA PAYMENT SLIDER */}
            <StaggerItem>
              <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", padding: "24px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "24px" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>⚡ Extra Monthly Payment:</span>
                <input type="range" min="0" max="20000" step="500" value={extraPayment} onChange={e => setExtraPayment(Number(e.target.value))} style={{ flex: 1, accentColor: "#C7F000" }} />
                <span style={{ color: "#C7F000", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: "18px", minWidth: "100px" }}>₹{fmt(extraPayment)}</span>
              </div>
            </StaggerItem>

            {/* STRATEGIES COMPARISON */}
            <StaggerItem>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
                {[
                  { name: "Avalanche", icon: "🏔️", desc: "Highest interest first — saves the most money", data: avalanche, color: "#4F7CFF" },
                  { name: "Snowball", icon: "⛄", desc: "Smallest balance first — fastest psychological wins", data: snowball, color: "#F59E0B" },
                ].map(s => (
                  <div key={s.name} style={{ background: "rgba(20,24,40,0.4)", border: `1px solid ${bestStrategy === s.name.toLowerCase() ? s.color + "50" : "rgba(255,255,255,0.05)"}`, borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)", position: "relative" }}>
                    {bestStrategy === s.name.toLowerCase() && <div style={{ position: "absolute", top: "16px", right: "16px", background: `${s.color}20`, color: s.color, padding: "4px 12px", borderRadius: "100px", fontSize: "10px", fontWeight: 900, letterSpacing: "1px" }}>RECOMMENDED</div>}
                    <div style={{ fontSize: "32px", marginBottom: "12px" }}>{s.icon}</div>
                    <div style={{ color: "#fff", fontWeight: 900, fontSize: "20px", marginBottom: "4px" }}>{s.name} Strategy</div>
                    <div style={{ color: "#9AA0B4", fontSize: "12px", marginBottom: "20px" }}>{s.desc}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "12px 16px", borderRadius: "12px" }}>
                        <span style={{ color: "#9AA0B4", fontSize: "13px" }}>Time to Freedom</span>
                        <span style={{ color: s.color, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace" }}>{Math.floor(s.data.months / 12)}y {s.data.months % 12}m</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "12px 16px", borderRadius: "12px" }}>
                        <span style={{ color: "#9AA0B4", fontSize: "13px" }}>Total Interest Paid</span>
                        <span style={{ color: "#FF2A5F", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace" }}>₹{fmt(s.data.totalInterest)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </StaggerItem>

            {/* DEBT LIST */}
            <StaggerItem>
              <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
                <h3 style={{ color: "#fff", margin: "0 0 24px 0" }}>📋 Active Debts</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {debts.map(d => {
                    const dt = DEBT_TYPES.find(t => t.value === d.type);
                    return (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ fontSize: "24px" }}>{dt ? dt.label.split(" ")[0] : "💳"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: "15px" }}>{d.name}</div>
                          <div style={{ color: "#9AA0B4", fontSize: "11px", marginTop: "2px" }}>{d.rate}% p.a. · Min ₹{fmt(d.minPayment)}/mo</div>
                        </div>
                        <div style={{ color: "#EF4444", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: "18px" }}>₹{fmt(d.amount)}</div>
                        <button onClick={() => removeDebt(d.id)} style={{ background: "transparent", border: "none", color: "#EF4444", fontSize: "10px", cursor: "pointer", opacity: 0.5, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }} onMouseOver={e => e.target.style.opacity = 1} onMouseOut={e => e.target.style.opacity = 0.5}>REMOVE</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </StaggerItem>
          </>
        )}
      </StaggerContainer>
    </div>
  );
}
