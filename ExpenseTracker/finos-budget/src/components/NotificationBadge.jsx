import { motion } from "framer-motion";

/**
 * NotificationBadge — Pulsing red dot indicator for items needing attention.
 *
 * @param {number} count — number to display (0 = hidden)
 * @param {string} color — badge color (default #FF2A5F)
 */
export default function NotificationBadge({ count = 0, color = "#FF2A5F" }) {
  if (count <= 0) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      style={{
        position: "absolute",
        top: "4px",
        right: "8px",
        minWidth: "16px",
        height: "16px",
        borderRadius: "100px",
        background: color,
        color: "#fff",
        fontSize: "9px",
        fontWeight: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 4px",
        boxShadow: `0 0 8px ${color}80`,
        fontFamily: "'JetBrains Mono', monospace",
        zIndex: 10,
      }}
    >
      <motion.span
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {count > 9 ? "9+" : count}
      </motion.span>
    </motion.div>
  );
}
