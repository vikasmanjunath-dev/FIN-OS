import { useState } from "react";
import { motion } from "framer-motion";
import { CURRENCIES } from "../components/CurrencyDisplay";
import { fmt } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";

const THEMES = [
  { id: "dark", name: "Void Black", desc: "Default deep space", preview: "linear-gradient(135deg, #060608, #13131a)" },
  { id: "midnight", name: "Midnight Blue", desc: "Deep ocean blue", preview: "linear-gradient(135deg, #050a18, #0a1628)" },
  { id: "oled", name: "OLED Pure", desc: "True black", preview: "linear-gradient(135deg, #000, #0a0a0a)" },
];

const AVATARS = ["🧑‍💻","👨‍💼","👩‍💼","🦸","🧙","🥷","🎯","⚡","🔥","💎","🚀","🧠"];

export default function SettingsPage({ INCOME, setIncome, currency, setCurrency, theme, setTheme, profile, setProfile, transactions }) {
  const [exportStatus, setExportStatus] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [incomeEdit, setIncomeEdit] = useState(INCOME);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const cs = (CURRENCIES[currency] || CURRENCIES.INR).symbol;

  const handleExportJSON = () => {
    const data = { version: "8.0", exportDate: new Date().toISOString(), income: INCOME, currency, theme, profile, transactions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `FIN-OS_Backup_${new Date().toISOString().split("T")[0]}.json`; a.click();
    setExportStatus("ok"); setTimeout(() => setExportStatus(null), 2000);
  };

  const handleImportJSON = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.income) setIncome(d.income);
        if (d.currency) setCurrency(d.currency);
        if (d.theme) setTheme(d.theme);
        if (d.profile) setProfile(d.profile);
        setImportStatus("ok"); setTimeout(() => setImportStatus(null), 2000);
      } catch { setImportStatus("err"); setTimeout(() => setImportStatus(null), 2000); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "12px", color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "8px", height: "8px", background: "#8B5CF6", borderRadius: "50%", animation: "pulse-glow 1s infinite" }} />
          System Configuration
        </div>
        <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900 }}>Settings</h1>
        <p style={{ color: "#9AA0B4", marginTop: "8px" }}>Configure your financial operating system.</p>
      </div>

      <StaggerContainer>
        {/* PROFILE */}
        <StaggerItem>
          <div style={{ background: "radial-gradient(circle at top left, rgba(139,92,246,0.15) 0%, rgba(20,24,40,0.6) 100%)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "28px", padding: "32px", marginBottom: "32px", display: "flex", gap: "32px", alignItems: "center", backdropFilter: "blur(12px)", position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", zIndex: 1 }}>
              <div style={{ width: "100px", height: "100px", borderRadius: "24px", background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(139,92,246,0.1))", border: "2px solid rgba(139,92,246,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px" }}>
                {profile?.avatar || "🧑‍💻"}
              </div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", maxWidth: "120px", justifyContent: "center" }}>
                {AVATARS.map(e => (
                  <button key={e} onClick={() => setProfile(p => ({ ...p, avatar: e }))} style={{ background: profile?.avatar === e ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)", border: profile?.avatar === e ? "1px solid #8B5CF6" : "1px solid transparent", borderRadius: "8px", padding: "2px", fontSize: "14px", cursor: "pointer", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>{e}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, zIndex: 1 }}>
              <div style={{ fontSize: "10px", color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px" }}>Commander Profile</div>
              <input value={profile?.name || ""} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Enter your name..." style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "14px 18px", color: "#fff", outline: "none", fontSize: "20px", fontWeight: 700, width: "100%" }} />
              <div style={{ display: "flex", gap: "16px", marginTop: "16px", fontSize: "12px", color: "#9AA0B4" }}>
                <span>📊 <strong style={{ color: "#fff" }}>{transactions?.length || 0}</strong> Transactions</span>
                <span>💰 <strong style={{ color: "#fff" }}>{cs}{fmt(INCOME)}</strong> Income</span>
              </div>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
            {/* INCOME */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>💰 Income Management</h3>
              <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "0 14px" }}>
                  <span style={{ color: "#10B981", fontWeight: 700, marginRight: "8px", fontSize: "18px" }}>{cs}</span>
                  <input type="number" value={incomeEdit} onChange={(e) => setIncomeEdit(Number(e.target.value) || 0)} style={{ flex: 1, background: "transparent", border: "none", color: "#fff", outline: "none", padding: "14px 0", fontSize: "20px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }} />
                </div>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { if (incomeEdit > 0) setIncome(incomeEdit); }} style={{ background: incomeEdit !== INCOME ? "#10B981" : "rgba(255,255,255,0.05)", color: incomeEdit !== INCOME ? "#fff" : "#9AA0B4", border: "none", borderRadius: "12px", padding: "0 24px", fontWeight: 900, cursor: "pointer", fontSize: "12px" }}>
                  {incomeEdit !== INCOME ? "UPDATE" : "SAVED"}
                </motion.button>
              </div>
              <div style={{ fontSize: "12px", color: "#9AA0B4" }}>Monthly gross income for all ratio calculations.</div>
            </div>

            {/* CURRENCY */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>🌍 Currency</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Object.values(CURRENCIES).map(c => (
                  <motion.button key={c.code} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setCurrency(c.code)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: currency === c.code ? "rgba(79,124,255,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${currency === c.code ? "rgba(79,124,255,0.4)" : "rgba(255,255,255,0.05)"}`, borderRadius: "12px", padding: "12px 16px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "20px", fontWeight: 900, color: currency === c.code ? "#4F7CFF" : "#fff", fontFamily: "'JetBrains Mono', monospace", width: "28px" }}>{c.symbol}</span>
                      <span style={{ color: "#fff", fontWeight: 600, fontSize: "13px" }}>{c.name}</span>
                    </div>
                    {currency === c.code && <span style={{ color: "#4F7CFF", fontWeight: 900 }}>✓</span>}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
            {/* THEME */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>🎨 Display Theme</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {THEMES.map(t => (
                  <motion.button key={t.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setTheme(t.id)} style={{ display: "flex", alignItems: "center", gap: "16px", background: theme === t.id ? "rgba(199,240,0,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${theme === t.id ? "rgba(199,240,0,0.3)" : "rgba(255,255,255,0.05)"}`, borderRadius: "12px", padding: "14px", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: t.preview, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />
                    <div>
                      <div style={{ color: theme === t.id ? "#C7F000" : "#fff", fontWeight: 700, fontSize: "14px" }}>{t.name}</div>
                      <div style={{ color: "#9AA0B4", fontSize: "12px" }}>{t.desc}</div>
                    </div>
                    {theme === t.id && <span style={{ marginLeft: "auto", color: "#C7F000", fontWeight: 900 }}>✓</span>}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* DATA MANAGEMENT */}
            <div style={{ background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "24px", padding: "32px", backdropFilter: "blur(12px)" }}>
              <h3 style={{ color: "#fff", margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>💾 Data Management</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={handleExportJSON} style={{ background: exportStatus ? "rgba(16,185,129,0.15)" : "rgba(79,124,255,0.1)", border: `1px solid ${exportStatus ? "#10B981" : "#4F7CFF"}`, color: exportStatus ? "#10B981" : "#4F7CFF", padding: "16px", borderRadius: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px", textAlign: "center" }}>
                  {exportStatus ? "✓ Exported!" : "📤 Export Backup (JSON)"}
                </motion.button>
                <label style={{ background: importStatus === "ok" ? "rgba(16,185,129,0.15)" : importStatus === "err" ? "rgba(255,42,95,0.15)" : "rgba(245,158,11,0.1)", border: `1px solid ${importStatus === "ok" ? "#10B981" : importStatus === "err" ? "#FF2A5F" : "#F59E0B"}`, color: importStatus === "ok" ? "#10B981" : importStatus === "err" ? "#FF2A5F" : "#F59E0B", padding: "16px", borderRadius: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px", textAlign: "center", display: "block" }}>
                  {importStatus === "ok" ? "✓ Imported!" : importStatus === "err" ? "✕ Invalid File" : "📥 Import from Backup"}
                  <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: "none" }} />
                </label>
                <div style={{ marginTop: "8px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "16px" }}>
                  {!showResetConfirm ? (
                    <button onClick={() => setShowResetConfirm(true)} style={{ width: "100%", background: "rgba(255,42,95,0.05)", border: "1px dashed rgba(255,42,95,0.3)", color: "#FF2A5F", padding: "14px", borderRadius: "12px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>🗑️ Reset All Data</button>
                  ) : (
                    <div style={{ background: "rgba(255,42,95,0.1)", border: "1px solid #FF2A5F", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                      <div style={{ color: "#FF2A5F", fontWeight: 700, marginBottom: "12px" }}>⚠️ Permanently delete ALL data?</div>
                      <div style={{ display: "flex", gap: "12px" }}>
                        <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "12px", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                        <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ flex: 1, background: "#FF2A5F", border: "none", color: "#fff", padding: "12px", borderRadius: "8px", cursor: "pointer", fontWeight: 900 }}>CONFIRM RESET</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div style={{ background: "rgba(20,24,40,0.3)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>₹</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>FIN-OS</div>
            <div style={{ fontSize: "11px", color: "#8B5CF6", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "2px" }}>v8.0 SOVEREIGN</div>
            <div style={{ fontSize: "12px", color: "#9AA0B4", marginTop: "12px" }}>Your financial operating system.</div>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
