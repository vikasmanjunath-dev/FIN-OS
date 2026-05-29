import { useState, useEffect, useRef } from "react";
import { streamAskArya } from "../utils/aiService";

/**
 * Reusable Arya AI panel — auto-triggers on mount, collapsible, streams tokens live.
 * Props:
 *   prompt       — string or () => string — the question to ask Arya
 *   financialData — object passed to aiService for context
 *   title        — panel header title
 *   subtitle     — panel header subtitle
 *   autoRun      — run on mount? (default true)
 *   deps         — array — re-run when these change (like useEffect deps)
 *   accentColor  — border/icon color (default #00ff88)
 */
export default function AryaPanel({
  prompt,
  financialData = {},
  title = "Arya's Analysis",
  subtitle = "AI-powered insight",
  autoRun = true,
  deps = [],
  accentColor = "#00ff88",
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [ran, setRan] = useState(false);
  const abortRef = useRef(false);

  const run = async () => {
    const q = typeof prompt === "function" ? prompt() : prompt;
    if (!q) return;
    abortRef.current = false;
    setLoading(true);
    setText("");
    try {
      await streamAskArya(q, financialData, (display) => {
        if (!abortRef.current) setText(display);
      });
    } catch (err) {
      setText(`⚠️ Arya offline — run: ollama serve`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRun) { setRan(true); run(); }
    return () => { abortRef.current = true; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      marginTop: "20px",
      borderRadius: "18px",
      background: `linear-gradient(135deg, ${accentColor}08 0%, rgba(0,212,255,0.04) 100%)`,
      border: `1px solid ${accentColor}22`,
      overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "14px 20px",
          background: `${accentColor}0A`,
          borderBottom: `1px solid ${accentColor}12`,
          cursor: "pointer", userSelect: "none",
        }}
      >
        <div style={{
          width: "32px", height: "32px", borderRadius: "10px",
          background: "linear-gradient(135deg,#4d7cff,#00d4ff)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "16px", flexShrink: 0,
        }}>🧠</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "13px", color: accentColor, letterSpacing: ".4px" }}>{title}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginTop: "1px" }}>{subtitle}</div>
        </div>
        {/* Refresh button */}
        <button
          onClick={(e) => { e.stopPropagation(); run(); }}
          disabled={loading}
          style={{
            background: `${accentColor}12`, border: `1px solid ${accentColor}30`,
            color: accentColor, borderRadius: "8px", padding: "4px 10px",
            fontSize: "10px", fontWeight: 700, cursor: loading ? "default" : "pointer",
            fontFamily: "inherit", letterSpacing: ".4px", opacity: loading ? 0.5 : 1,
          }}
        >{loading ? "…" : "↺ Ask"}</button>
        <span style={{
          fontSize: "13px", color: "rgba(255,255,255,0.35)",
          transform: collapsed ? "rotate(-90deg)" : "rotate(0)",
          transition: "transform .2s",
        }}>▼</span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: "18px 20px", fontSize: "14px", lineHeight: 1.75, color: "rgba(255,255,255,0.82)", minHeight: "52px" }}>
          {loading && !text && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: `${accentColor}BB`, fontSize: "13px" }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <span key={i} style={{
                  display: "inline-block", width: "7px", height: "7px", borderRadius: "50%",
                  background: accentColor,
                  animation: `aryaPulse 1.2s ${d}s infinite`,
                }} />
              ))}
              <span style={{ marginLeft: "4px" }}>Arya soch rahi hai…</span>
            </div>
          )}
          {text && (
            <span>
              {text}
              {loading && <span style={{ animation: "aryaBlink .7s infinite", display: "inline-block", marginLeft: "2px" }}>▌</span>}
            </span>
          )}
          {!loading && !text && !ran && (
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>Click ↺ Ask to get Arya's analysis.</span>
          )}
        </div>
      )}

      <style>{`
        @keyframes aryaPulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes aryaBlink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
