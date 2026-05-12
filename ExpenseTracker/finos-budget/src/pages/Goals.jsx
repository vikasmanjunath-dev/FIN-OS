import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmt, calcTotals } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";
import ConfettiEffect from "../components/ConfettiEffect";

const GOAL_EMOJIS = ["🎯", "🚗", "🏠", "✈️", "💻", "💍", "📱", "🎓", "🏧", "👶", "🏖️", "🎸"];
const PRIORITIES = [
  { value: "high", label: "🔴 High", color: "#FF2A5F" },
  { value: "medium", label: "🟡 Medium", color: "#F59E0B" },
  { value: "low", label: "🟢 Low", color: "#10B981" },
];

export default function Goals({ transactions, INCOME, goals, setGoals }) {
  const { savings } = calcTotals(transactions, INCOME);
  const [isAdding, setIsAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: "", emoji: "🎯", target: "", current: "", deadlineMonths: "", color: "#10B981", priority: "medium" });
  const [customAmounts, setCustomAmounts] = useState({});
  const [confettiGoalId, setConfettiGoalId] = useState(null);

  const handleAddGoal = () => {
    if (!newGoal.name || !newGoal.target || !newGoal.deadlineMonths) return;
    setGoals(prev => [...prev, {
      ...newGoal, id: Date.now(),
      target: parseFloat(newGoal.target),
      current: parseFloat(newGoal.current) || 0,
      deadlineMonths: parseInt(newGoal.deadlineMonths),
    }]);
    setIsAdding(false);
    setNewGoal({ name: "", emoji: "🎯", target: "", current: "", deadlineMonths: "", color: "#10B981", priority: "medium" });
  };

  const deleteGoal = (id) => setGoals(prev => prev.filter(g => g.id !== id));

  const addFunds = (id, amount) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== id) return g;
      const newCurrent = Math.min(g.target, g.current + amount);
      if (newCurrent >= g.target && g.current < g.target) {
        setConfettiGoalId(id);
      }
      return { ...g, current: newCurrent };
    }));
  };

  const withdrawFunds = (id, amount) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, current: Math.max(0, g.current - amount) } : g));
  };

  const onConfettiComplete = useCallback(() => setConfettiGoalId(null), []);

  const sortedGoals = [...(goals || [])].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] || 1) - (order[b.priority] || 1);
  });

  const totalGoalTarget = sortedGoals.reduce((a, g) => a + g.target, 0);
  const totalGoalSaved = sortedGoals.reduce((a, g) => a + g.current, 0);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <ConfettiEffect trigger={confettiGoalId !== null} onComplete={onConfettiComplete} />

      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#F59E0B", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", background: "#F59E0B", borderRadius: "50%", animation: "pulse-glow 1s infinite" }} />
            Architecture
          </div>
          <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900 }}>Goal Matrices</h1>
          <p style={{ color: "#9AA0B4", marginTop: "8px" }}>Strategic capital allocation towards your future.</p>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "12px", padding: "12px 20px", fontSize: "13px", color: "#10B981", fontFamily: "'JetBrains Mono', monospace" }}>
            Total: <strong>₹{fmt(totalGoalSaved)}</strong> / ₹{fmt(totalGoalTarget)}
          </div>
          <button onClick={() => setIsAdding(!isAdding)} style={{ background: isAdding ? "rgba(255,42,95,0.1)" : "#F59E0B", color: isAdding ? "#FF2A5F" : "#000", border: isAdding ? "1px solid #FF2A5F" : "none", padding: "12px 24px", borderRadius: "12px", fontWeight: 900, cursor: "pointer" }}>
            {isAdding ? "CANCEL" : "+ CONSTRUCT GOAL"}
          </button>
        </div>
      </div>

      <StaggerContainer>
        {/* ADD GOAL FORM */}
        <AnimatePresence>
          {isAdding && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <div style={{ background: "rgba(20,24,40,0.6)", border: "1px solid #F59E0B", borderRadius: "24px", padding: "32px", marginBottom: "32px", backdropFilter: "blur(12px)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <input placeholder="Goal Name" value={newGoal.name} onChange={e => setNewGoal({ ...newGoal, name: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                  <input type="number" placeholder="Target Amount (₹)" value={newGoal.target} onChange={e => setNewGoal({ ...newGoal, target: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                  <input type="number" placeholder="Already Saved (₹)" value={newGoal.current} onChange={e => setNewGoal({ ...newGoal, current: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                  <input type="number" placeholder="Deadline (Months)" value={newGoal.deadlineMonths} onChange={e => setNewGoal({ ...newGoal, deadlineMonths: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    {GOAL_EMOJIS.map(e => (
                      <button key={e} onClick={() => setNewGoal({ ...newGoal, emoji: e })} style={{ background: newGoal.emoji === e ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.05)", border: newGoal.emoji === e ? "1px solid #F59E0B" : "1px solid transparent", borderRadius: "8px", fontSize: "18px", cursor: "pointer", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center" }}>{e}</button>
                    ))}
                  </div>
                  <select value={newGoal.priority} onChange={e => setNewGoal({ ...newGoal, priority: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <input type="color" value={newGoal.color} onChange={e => setNewGoal({ ...newGoal, color: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "8px", borderRadius: "12px", height: "48px", cursor: "pointer" }} />
                  <button onClick={handleAddGoal} style={{ background: "#10B981", color: "#fff", border: "none", padding: "14px", borderRadius: "12px", fontWeight: 900, cursor: "pointer", letterSpacing: "1px" }}>DEPLOY GOAL</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* GOALS GRID */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px" }}>
            {sortedGoals.map((goal) => {
              const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
              const remaining = goal.target - goal.current;
              const requiredMonthly = remaining > 0 ? remaining / Math.max(1, goal.deadlineMonths) : 0;
              const isRealistic = savings >= requiredMonthly;
              const isComplete = remaining <= 0;
              const pri = PRIORITIES.find(p => p.value === goal.priority);

              // Projected completion date
              const monthlySavingsRate = savings > 0 ? savings : 1;
              const monthsToComplete = remaining > 0 ? Math.ceil(remaining / monthlySavingsRate) : 0;
              const projectedDate = new Date();
              projectedDate.setMonth(projectedDate.getMonth() + monthsToComplete);

              const customAmt = customAmounts[goal.id] || "";

              return (
                <motion.div key={goal.id} whileHover={{ y: -4 }} style={{ background: isComplete ? "rgba(16,185,129,0.05)" : "rgba(20,24,40,0.4)", border: `1px solid ${isComplete ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.05)"}`, borderRadius: "24px", padding: "32px", position: "relative", backdropFilter: "blur(12px)", boxShadow: isComplete ? "0 10px 30px rgba(16,185,129,0.1)" : "0 10px 30px rgba(0,0,0,0.2)", transition: "all 0.3s" }}>
                  {/* Priority badge */}
                  <div style={{ position: "absolute", top: 20, right: 60, background: `${pri?.color || "#F59E0B"}15`, color: pri?.color || "#F59E0B", padding: "4px 10px", borderRadius: "100px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.5px" }}>{goal.priority?.toUpperCase()}</div>
                  <button onClick={() => deleteGoal(goal.id)} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.05)", borderRadius: "50%", width: "32px", height: "32px", border: "none", color: "#9AA0B4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>

                  <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "24px" }}>
                    <div style={{ fontSize: "40px", background: "rgba(0,0,0,0.3)", width: "80px", height: "80px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)" }}>{goal.emoji}</div>
                    <div>
                      <div style={{ fontSize: "22px", fontWeight: 900, color: "#fff", marginBottom: "4px" }}>{goal.name}</div>
                      <div style={{ fontSize: "12px", color: "#9AA0B4", fontFamily: "'JetBrains Mono', monospace" }}>Target: ₹{fmt(goal.target)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px", fontFamily: "'JetBrains Mono', monospace" }}>
                    <span style={{ color: "#fff" }}>₹{fmt(goal.current)} Saved</span>
                    <span style={{ color: isComplete ? "#10B981" : goal.color, fontWeight: 900, fontSize: "18px" }}>{pct}%</span>
                  </div>

                  <div style={{ width: "100%", height: "14px", background: "rgba(0,0,0,0.5)", borderRadius: "7px", marginBottom: "24px", overflow: "hidden", position: "relative" }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }} style={{ height: "100%", background: isComplete ? "#10B981" : goal.color, boxShadow: `0 0 12px ${isComplete ? "#10B981" : goal.color}`, borderRadius: "7px" }} />
                    {isComplete && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "10px", fontWeight: 900, color: "#fff", textShadow: "0 0 4px rgba(0,0,0,0.5)" }}>ACHIEVED 🏆</div>}
                  </div>

                  <div style={{ background: "rgba(0,0,0,0.3)", padding: "16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", fontSize: "13px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#9AA0B4" }}>Time Remaining:</span>
                      <span style={{ color: "#fff", fontWeight: "bold" }}>{goal.deadlineMonths} Months</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#9AA0B4" }}>Required Velocity:</span>
                      <span style={{ color: "#F59E0B", fontFamily: "'JetBrains Mono', monospace", fontWeight: "bold" }}>₹{fmt(Math.round(requiredMonthly))}/mo</span>
                    </div>
                    {!isComplete && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9AA0B4" }}>Projected Completion:</span>
                        <span style={{ color: "#4F7CFF", fontWeight: "bold" }}>{projectedDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: "10px" }}>
                      <span style={{ color: "#9AA0B4" }}>Status:</span>
                      {isComplete ? (
                        <span style={{ color: "#10B981", fontWeight: "bold" }}>Target Achieved 🏆</span>
                      ) : isRealistic ? (
                        <span style={{ color: "#10B981", fontWeight: "bold" }}>On Track ✅</span>
                      ) : (
                        <span style={{ color: "#FF2A5F", fontWeight: "bold" }}>At Risk ⚠️</span>
                      )}
                    </div>
                  </div>

                  {/* FUND / WITHDRAW CONTROLS */}
                  {!isComplete && (
                    <div style={{ marginTop: "20px" }}>
                      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "0 12px" }}>
                          <span style={{ color: "#9AA0B4", marginRight: "4px" }}>₹</span>
                          <input type="number" placeholder="Custom amount" value={customAmt} onChange={e => setCustomAmounts(prev => ({ ...prev, [goal.id]: e.target.value }))} style={{ flex: 1, background: "transparent", border: "none", color: "#fff", outline: "none", padding: "10px 0", fontFamily: "'JetBrains Mono', monospace" }} />
                        </div>
                        <button onClick={() => { const a = parseFloat(customAmt) || 0; if (a > 0) { addFunds(goal.id, a); setCustomAmounts(prev => ({ ...prev, [goal.id]: "" })); } }} style={{ background: "rgba(16,185,129,0.1)", border: "1px solid #10B981", color: "#10B981", padding: "10px 16px", borderRadius: "10px", cursor: "pointer", fontWeight: 900, fontSize: "12px" }}>+ ADD</button>
                        <button onClick={() => { const a = parseFloat(customAmt) || 0; if (a > 0) { withdrawFunds(goal.id, a); setCustomAmounts(prev => ({ ...prev, [goal.id]: "" })); } }} style={{ background: "rgba(255,42,95,0.05)", border: "1px solid rgba(255,42,95,0.3)", color: "#FF2A5F", padding: "10px 16px", borderRadius: "10px", cursor: "pointer", fontWeight: 900, fontSize: "12px" }}>- WITHDRAW</button>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {[1000, 5000, 10000].map(amt => (
                          <button key={amt} onClick={() => addFunds(goal.id, amt)} style={{ flex: 1, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981", padding: "10px", borderRadius: "10px", cursor: "pointer", fontSize: "13px", fontWeight: 900, transition: "all 0.2s" }} onMouseOver={e => e.target.style.background = "rgba(16,185,129,0.2)"} onMouseOut={e => e.target.style.background = "rgba(16,185,129,0.1)"}>+₹{fmt(amt)}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </StaggerItem>

        {sortedGoals.length === 0 && (
          <StaggerItem>
            <div style={{ textAlign: "center", padding: "60px", color: "#9AA0B4", background: "rgba(20,24,40,0.3)", borderRadius: "24px", border: "1px dashed rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎯</div>
              <div style={{ fontWeight: 700, fontSize: "18px", color: "#fff", marginBottom: "8px" }}>No Goals Yet</div>
              <div>Click "CONSTRUCT GOAL" above to start building your future.</div>
            </div>
          </StaggerItem>
        )}
      </StaggerContainer>
    </div>
  );
}