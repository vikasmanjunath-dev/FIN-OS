import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmt, calcRegret } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";

const SUB_CATEGORIES = [
  { value: "entertainment", label: "🎬 Entertainment", color: "#EC4899" },
  { value: "music", label: "🎵 Music", color: "#8B5CF6" },
  { value: "productivity", label: "💼 Productivity", color: "#4F7CFF" },
  { value: "cloud", label: "☁️ Cloud / Storage", color: "#06B6D4" },
  { value: "shopping", label: "🛍️ Shopping", color: "#F59E0B" },
  { value: "health", label: "🏋️ Health / Fitness", color: "#10B981" },
  { value: "news", label: "📰 News / Media", color: "#EF4444" },
  { value: "gaming", label: "🎮 Gaming", color: "#C7F000" },
  { value: "other", label: "⚡ Other", color: "#9AA0B4" },
];

const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly", multiplier: 12 },
  { value: "quarterly", label: "Quarterly", multiplier: 4 },
  { value: "yearly", label: "Yearly", multiplier: 1 },
];

export default function SubscriptionManager({ subscriptions, setSubscriptions, INCOME }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newSub, setNewSub] = useState({ name: "", amount: "", category: "entertainment", cycle: "monthly", active: true });

  const addSubscription = () => {
    if (!newSub.name || !newSub.amount) return;
    setSubscriptions(prev => [...prev, { ...newSub, id: Date.now(), amount: parseFloat(newSub.amount) }]);
    setNewSub({ name: "", amount: "", category: "entertainment", cycle: "monthly", active: true });
    setIsAdding(false);
  };

  const toggleSub = (id) => setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  const removeSub = (id) => setSubscriptions(prev => prev.filter(s => s.id !== id));

  const stats = useMemo(() => {
    const active = subscriptions.filter(s => s.active);
    const monthlyTotal = active.reduce((acc, s) => {
      const cycle = BILLING_CYCLES.find(c => c.value === s.cycle);
      return acc + (s.amount * (cycle?.multiplier || 12)) / 12;
    }, 0);
    const annualTotal = monthlyTotal * 12;
    const ghostScore = INCOME > 0 ? ((monthlyTotal / INCOME) * 100).toFixed(1) : 0;
    const tenYearCost = calcRegret(annualTotal);
    return { active: active.length, total: subscriptions.length, monthlyTotal: Math.round(monthlyTotal), annualTotal: Math.round(annualTotal), ghostScore, tenYearCost };
  }, [subscriptions, INCOME]);

  const categoryTotals = useMemo(() => {
    const map = {};
    subscriptions.filter(s => s.active).forEach(s => {
      const cycle = BILLING_CYCLES.find(c => c.value === s.cycle);
      const monthly = (s.amount * (cycle?.multiplier || 12)) / 12;
      map[s.category] = (map[s.category] || 0) + monthly;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [subscriptions]);

  // Renewal calendar — next 30 days
  const renewals = useMemo(() => {
    const today = new Date();
    return subscriptions.filter(s => s.active).map(s => {
      const day = (s.id % 28) + 1;
      const nextDate = new Date(today.getFullYear(), today.getMonth(), day);
      if (nextDate < today) nextDate.setMonth(nextDate.getMonth() + 1);
      return { ...s, nextRenewal: nextDate };
    }).sort((a, b) => a.nextRenewal - b.nextRenewal).slice(0, 8);
  }, [subscriptions]);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#EC4899", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ width: "8px", height: "8px", background: "#EC4899", borderRadius: "50%" }} />
            Ghost Tax Headquarters
          </div>
          <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900 }}>Subscriptions</h1>
          <p style={{ color: "#9AA0B4", marginTop: "8px" }}>Track, manage, and kill silent recurring charges.</p>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} style={{ background: isAdding ? "rgba(255,42,95,0.1)" : "#EC4899", color: isAdding ? "#FF2A5F" : "#fff", border: isAdding ? "1px solid #FF2A5F" : "none", padding: "12px 24px", borderRadius: "12px", fontWeight: 900, cursor: "pointer" }}>
          {isAdding ? "CANCEL" : "+ ADD SUBSCRIPTION"}
        </button>
      </div>

      <StaggerContainer>
        {/* ADD FORM */}
        <AnimatePresence>
          {isAdding && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <div style={{ background: "rgba(20,24,40,0.6)", border: "1px solid #EC4899", borderRadius: "24px", padding: "32px", marginBottom: "32px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <input placeholder="Service Name" value={newSub.name} onChange={e => setNewSub({ ...newSub, name: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }} />
                  <div style={{ display: "flex", alignItems: "center", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "0 14px" }}>
                    <span style={{ color: "#9AA0B4", marginRight: "4px" }}>₹</span>
                    <input type="number" placeholder="Amount" value={newSub.amount} onChange={e => setNewSub({ ...newSub, amount: e.target.value })} style={{ flex: 1, background: "transparent", border: "none", color: "#fff", outline: "none", padding: "14px 0" }} />
                  </div>
                  <select value={newSub.category} onChange={e => setNewSub({ ...newSub, category: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }}>
                    {SUB_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <select value={newSub.cycle} onChange={e => setNewSub({ ...newSub, cycle: e.target.value })} style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "12px", color: "#fff", outline: "none" }}>
                    {BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <button onClick={addSubscription} style={{ background: "#EC4899", color: "#fff", border: "none", padding: "14px 32px", borderRadius: "12px", fontWeight: 900, cursor: "pointer" }}>REGISTER SUBSCRIPTION</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* STATS */}
        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "32px" }}>
            {[
              { label: "Monthly Drain", value: `₹${fmt(stats.monthlyTotal)}`, color: "#EC4899", icon: "💸" },
              { label: "Annual Cost", value: `₹${fmt(stats.annualTotal)}`, color: "#F59E0B", icon: "📅" },
              { label: "Ghost Score", value: `${stats.ghostScore}%`, color: stats.ghostScore > 5 ? "#FF2A5F" : "#10B981", icon: "👻" },
              { label: "10-Yr Cost", value: `₹${fmt(stats.tenYearCost)}`, color: "#EF4444", icon: "💀" },
              { label: "Active / Total", value: `${stats.active}/${stats.total}`, color: "#4F7CFF", icon: "📋" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", padding: "20px", backdropFilter: "blur(12px)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "18px" }}>{s.icon}</span>
                  <span style={{ fontSize: "10px", color: "#9AA0B4", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </StaggerItem>

        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
            {/* CATEGORY BREAKDOWN */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", fontSize: "14px" }}>📊 Category Breakdown</h3>
              {categoryTotals.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "#9AA0B4" }}>No active subscriptions.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {categoryTotals.map(([cat, amount]) => {
                    const sc = SUB_CATEGORIES.find(c => c.value === cat);
                    const pct = stats.monthlyTotal > 0 ? Math.round((amount / stats.monthlyTotal) * 100) : 0;
                    return (
                      <div key={cat}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px" }}>
                          <span style={{ color: "#fff" }}>{sc?.label || cat}</span>
                          <span style={{ color: sc?.color || "#9AA0B4", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>₹{fmt(Math.round(amount))}/mo ({pct}%)</span>
                        </div>
                        <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "100px", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: sc?.color || "#9AA0B4", borderRadius: "100px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RENEWAL CALENDAR */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", fontSize: "14px" }}>📅 Upcoming Renewals</h3>
              {renewals.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "#9AA0B4" }}>No upcoming renewals.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {renewals.map(r => {
                    const sc = SUB_CATEGORIES.find(c => c.value === r.category);
                    const daysUntil = Math.ceil((r.nextRenewal - new Date()) / 86400000);
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: `${sc?.color || "#9AA0B4"}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>{sc?.label?.split(" ")[0] || "⚡"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#fff", fontWeight: 600, fontSize: "13px" }}>{r.name}</div>
                          <div style={{ color: "#9AA0B4", fontSize: "11px" }}>{r.nextRenewal.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                        </div>
                        <div style={{ background: daysUntil <= 3 ? "rgba(255,42,95,0.15)" : "rgba(255,255,255,0.05)", color: daysUntil <= 3 ? "#FF2A5F" : "#9AA0B4", padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700 }}>{daysUntil}d</div>
                        <span style={{ color: sc?.color || "#9AA0B4", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: "14px" }}>₹{fmt(r.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </StaggerItem>

        {/* SUBSCRIPTION LIST */}
        <StaggerItem>
          <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
            <h3 style={{ color: "#fff", margin: "0 0 24px 0" }}>📋 All Subscriptions</h3>
            {subscriptions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#9AA0B4", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "16px" }}>No subscriptions tracked yet. Add one above.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {subscriptions.map(s => {
                  const sc = SUB_CATEGORIES.find(c => c.value === s.category);
                  const cycle = BILLING_CYCLES.find(c => c.value === s.cycle);
                  const monthlyAmt = Math.round((s.amount * (cycle?.multiplier || 12)) / 12);
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "16px", background: s.active ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)", padding: "16px", borderRadius: "16px", border: `1px solid ${s.active ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)"}`, opacity: s.active ? 1 : 0.5 }}>
                      <div style={{ fontSize: "24px" }}>{sc?.label?.split(" ")[0] || "⚡"}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                          {s.name}
                          <span style={{ fontSize: "10px", background: s.active ? "rgba(16,185,129,0.15)" : "rgba(255,42,95,0.15)", color: s.active ? "#10B981" : "#FF2A5F", padding: "2px 8px", borderRadius: "4px" }}>{s.active ? "ACTIVE" : "KILLED"}</span>
                        </div>
                        <div style={{ color: "#9AA0B4", fontSize: "11px", marginTop: "2px" }}>{sc?.label?.slice(2)} · {cycle?.label} · ₹{fmt(monthlyAmt)}/mo</div>
                      </div>
                      <div style={{ color: sc?.color || "#9AA0B4", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", fontSize: "18px" }}>₹{fmt(s.amount)}</div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => toggleSub(s.id)} style={{ background: s.active ? "rgba(255,42,95,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${s.active ? "#FF2A5F" : "#10B981"}`, color: s.active ? "#FF2A5F" : "#10B981", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "10px", fontWeight: 900 }}>
                          {s.active ? "KILL" : "REVIVE"}
                        </motion.button>
                        <button onClick={() => removeSub(s.id)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#9AA0B4", padding: "8px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
