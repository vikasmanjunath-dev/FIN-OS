import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const THEME_CYCLE = ["dark", "midnight", "oled"];
const THEME_META = {
  dark:     { icon: "🌑", label: "Void Black",  preview: "linear-gradient(135deg,#060608,#13131a)" },
  midnight: { icon: "🌙", label: "Midnight",    preview: "linear-gradient(135deg,#050a18,#0a1628)" },
  oled:     { icon: "⬛", label: "OLED Pure",   preview: "linear-gradient(135deg,#000,#0a0a0a)"    },
};

export default function TopBar({ theme, setTheme, transactions = [], onSearch }) {
  const [search, setSearch] = useState("");
  const [showAlerts, setShowAlerts] = useState(false);

  const leakTxns = transactions.filter(t =>
    t.category?.startsWith("want") || t.category?.startsWith("debt")
  );
  const alertCount = leakTxns.length;
  const leakTotal  = leakTxns.reduce((s, t) => s + (t.amount || 0), 0);

  const handleSearch = (val) => {
    setSearch(val);
    if (onSearch) onSearch(val);
  };

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n));

  return (
    <div className="topbar-global">
      {/* ── Search ── */}
      <div className="topbar-search">
        <span className="topbar-search-icon">🔍</span>
        <input
          className="topbar-search-input"
          placeholder="Search transactions, categories…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <AnimatePresence>
          {search && (
            <motion.button
              key="clear"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              className="topbar-search-clear"
              onClick={() => handleSearch("")}
            >
              ✕
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Controls ── */}
      <div className="topbar-controls">

        {/* Alert bell */}
        <div style={{ position: "relative" }}>
          <motion.button
            className={`topbar-btn${alertCount > 0 ? " topbar-btn--alert" : ""}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAlerts(v => !v)}
            title={alertCount > 0 ? `${alertCount} financial leaks detected` : "No alerts"}
          >
            🔔
            {alertCount > 0 && (
              <motion.span
                key={alertCount}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="topbar-badge"
              >
                {alertCount > 9 ? "9+" : alertCount}
              </motion.span>
            )}
          </motion.button>

          {/* Alert dropdown */}
          <AnimatePresence>
            {showAlerts && (
              <motion.div
                key="alerts-panel"
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="topbar-alert-panel"
                onClick={e => e.stopPropagation()}
              >
                <div className="topbar-alert-header">
                  <span>⚠️ Financial Leaks</span>
                  <button className="topbar-alert-close" onClick={() => setShowAlerts(false)}>✕</button>
                </div>

                {alertCount === 0 ? (
                  <div className="topbar-alert-empty">✅ No leaks detected. System clean.</div>
                ) : (
                  <>
                    <div className="topbar-alert-summary">
                      <span className="topbar-alert-count">{alertCount}</span> transactions draining wealth
                      <strong style={{ color: "#FF2A5F", marginLeft: 6 }}>₹{fmt(leakTotal)}</strong>
                    </div>
                    <div className="topbar-alert-list">
                      {leakTxns.slice(0, 6).map(t => (
                        <div key={t.id} className="topbar-alert-item">
                          <span className="topbar-alert-name">{t.name}</span>
                          <span className="topbar-alert-amount">-₹{fmt(t.amount)}</span>
                        </div>
                      ))}
                      {leakTxns.length > 6 && (
                        <div className="topbar-alert-more">+{leakTxns.length - 6} more leaks</div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme cycle */}
        <motion.button
          className="topbar-btn topbar-theme-btn"
          onClick={cycleTheme}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={`Current: ${THEME_META[theme]?.label} — click to cycle`}
        >
          <motion.div
            key={theme}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="topbar-theme-preview"
            style={{ background: THEME_META[theme]?.preview }}
          />
          <span className="topbar-theme-icon">{THEME_META[theme]?.icon}</span>
          <span className="topbar-theme-label">{THEME_META[theme]?.label}</span>
        </motion.button>
      </div>
    </div>
  );
}
