import { motion } from "framer-motion";

const NAV_SECTIONS = [
  {
    label: "CORE",
    items: [
      { id: "wealth", icon: "⚡", label: "Wealth", color: "#4F7CFF" },
      { id: "flow",   icon: "🌊", label: "Flow Map", color: "#06B6D4" },
      { id: "intel",  icon: "🧠", label: "Intelligence", color: "#C7F000" },
      { id: "warroom", icon: "🎯", label: "War Room", color: "#FF2A5F" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { id: "fire",   icon: "🔥", label: "FIRE Calc", color: "#FF6B35" },
      { id: "goals",  icon: "🏆", label: "Goals", color: "#F59E0B" },
      { id: "achievements", icon: "⭐", label: "Achievements", color: "#C7F000" },
      { id: "reports", icon: "📊", label: "Reports", color: "#06B6D4" },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { id: "debt",   icon: "💀", label: "Debt Destroyer", color: "#EF4444" },
      { id: "subscriptions", icon: "👻", label: "Subscriptions", color: "#EC4899" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { id: "settings", icon: "⚙️", label: "Settings", color: "#8B5CF6" },
    ],
  },
];

export default function Sidebar({ activePage, setPage }) {
  return (
    <nav className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <motion.div
          className="sidebar-logo-icon"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          ₹
        </motion.div>
        <span className="sidebar-logo-text">FIN-OS</span>
      </div>

      <div className="sidebar-divider" />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", width: "100%" }}>
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label}>
            {/* Section Label */}
            <div style={{
              padding: "8px 18px 4px",
              fontSize: "9px",
              color: "var(--text4)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}>
              {section.label}
            </div>

            {section.items.map((item) => (
              <motion.button
                key={item.id}
                className={`nav-item${activePage === item.id ? " active" : ""}`}
                onClick={() => setPage(item.id)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.97 }}
                style={activePage === item.id ? {
                  background: `${item.color}18`,
                  borderLeft: `3px solid ${item.color}`,
                  color: item.color,
                } : {}}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {activePage === item.id && (
                  <motion.div
                    layoutId="nav-indicator"
                    style={{
                      position: "absolute",
                      right: "8px",
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: item.color,
                      boxShadow: `0 0 8px ${item.color}`,
                    }}
                  />
                )}
              </motion.button>
            ))}

            {si < NAV_SECTIONS.length - 1 && (
              <div style={{ width: "calc(100% - 32px)", height: "1px", background: "var(--border)", margin: "6px 16px" }} />
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-divider" />

      {/* Version badge */}
      <div style={{
        padding: "8px 18px",
        width: "100%",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}>
        <div style={{
          fontSize: "9px",
          color: "var(--text4)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.5px",
        }}>
          v8.0 SOVEREIGN
        </div>
      </div>
    </nav>
  );
}