import { useState, useMemo, useRef, useEffect } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { fmt, calcTotals, ICONS, CATEGORY_COLORS, TRANSACTION_TYPES, BEHAVIOR_TYPES, calcRegret, calcLifeHours } from "../utils/constants";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// --- CUSTOM GLASSMORPHISM DROPDOWN (FIXES THE WHITE MENU BUG) ---
function GlassDropdown({ value, onChange, options, placeholder, icon }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options.flatMap(o => o.options || [o]).find(o => o.value === value);

  return (
    <div ref={dropdownRef} style={{ position: "relative", width: "100%" }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ background: "rgba(255,255,255,0.03)", border: isOpen ? "1px solid #4F7CFF" : "1px solid rgba(255,255,255,0.1)", padding: "12px 16px", borderRadius: "12px", color: value ? "#fff" : "var(--text-muted, #9AA0B4)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s", fontSize: "13px", boxShadow: isOpen ? "0 0 15px rgba(79,124,255,0.2)" : "none" }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {icon && <span>{icon}</span>}
          {selectedOption ? selectedOption.label : placeholder}
        </div>
        <span style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", fontSize: "10px" }}>▼</span>
      </div>

      {isOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "100%", background: "rgba(10, 12, 20, 0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "8px", zIndex: 50, maxHeight: "250px", overflowY: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
          {options.map((opt, i) => {
            // Handle Option Groups (OptGroup)
            if (opt.group) {
              return (
                <div key={i} style={{ marginBottom: "8px" }}>
                  <div style={{ fontSize: "10px", color: "#4F7CFF", textTransform: "uppercase", letterSpacing: "1px", padding: "8px 12px", fontWeight: "900" }}>{opt.group}</div>
                  {opt.options.map(subOpt => (
                    <div 
                      key={subOpt.value}
                      onClick={() => { onChange(subOpt.value); setIsOpen(false); }}
                      style={{ padding: "10px 12px", borderRadius: "8px", cursor: "pointer", color: value === subOpt.value ? "#fff" : "#A1A4AC", background: value === subOpt.value ? "rgba(79,124,255,0.2)" : "transparent", fontSize: "13px", transition: "background 0.1s" }}
                      onMouseOver={(e) => e.target.style.background = value === subOpt.value ? "rgba(79,124,255,0.2)" : "rgba(255,255,255,0.05)"}
                      onMouseOut={(e) => e.target.style.background = value === subOpt.value ? "rgba(79,124,255,0.2)" : "transparent"}
                    >
                      {subOpt.label}
                    </div>
                  ))}
                </div>
              );
            }
            // Handle Standard Options
            return (
              <div 
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                style={{ padding: "10px 12px", borderRadius: "8px", cursor: "pointer", color: value === opt.value ? "#fff" : "#A1A4AC", background: value === opt.value ? "rgba(79,124,255,0.2)" : "transparent", fontSize: "13px", transition: "background 0.1s" }}
                onMouseOver={(e) => e.target.style.background = value === opt.value ? "rgba(79,124,255,0.2)" : "rgba(255,255,255,0.05)"}
                onMouseOut={(e) => e.target.style.background = value === opt.value ? "rgba(79,124,255,0.2)" : "transparent"}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- MICRO COMPONENTS ---
function StatCard({ label, value, sub, color, glowColor, pct, tag }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "rgba(20,24,40,0.6)", backdropFilter: "blur(12px)", border: `1px solid ${glowColor}`, borderRadius: "24px", padding: "24px", boxShadow: `0 10px 30px ${glowColor}10` }}>
      <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`, opacity: 0.1, zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>{label}</div>
        <div style={{ fontSize: "32px", fontWeight: "900", color, fontFamily: "'Manrope', sans-serif", letterSpacing: "-1px" }}>₹{fmt(value)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", fontSize: "11px" }}>
          <span style={{ background: glowColor, color: "#fff", padding: "4px 8px", borderRadius: "8px", fontWeight: "bold" }}>{tag}</span>
          <span style={{ color: "var(--text-muted, #9AA0B4)" }}>{sub}</span>
        </div>
        <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", marginTop: "16px", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, boxShadow: `0 0 10px ${color}` }} />
        </div>
      </div>
    </div>
  );
}

// --- EDITABLE INFLOW CARD ---
function EditableInflowCard({ value, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setEditValue(value); }, [value]);
  useEffect(() => { if (isEditing && inputRef.current) inputRef.current.focus(); }, [isEditing]);

  const handleSave = () => {
    const parsed = parseFloat(editValue) || 0;
    if (parsed > 0) {
      onSave(parsed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setEditValue(value); setIsEditing(false); }
  };

  const color = "#4F7CFF";
  const glowColor = "rgba(79, 124, 255, 0.4)";

  return (
    <div style={{ position: "relative", overflow: "hidden", background: "rgba(20,24,40,0.6)", backdropFilter: "blur(12px)", border: `1px solid ${isEditing ? color : glowColor}`, borderRadius: "24px", padding: "24px", boxShadow: isEditing ? `0 10px 40px ${glowColor}` : `0 10px 30px ${glowColor}10`, transition: "all 0.3s ease", cursor: isEditing ? "default" : "pointer" }} onClick={() => { if (!isEditing) setIsEditing(true); }}>
      <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`, opacity: isEditing ? 0.2 : 0.1, zIndex: 0, transition: "opacity 0.3s" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Total Inflow</span>
          {!isEditing && <span style={{ fontSize: "14px", opacity: 0.5, transition: "opacity 0.2s" }} title="Click to edit income">✏️</span>}
        </div>

        {isEditing ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "28px", fontWeight: "900", color, fontFamily: "'Manrope', sans-serif" }}>₹</span>
            <input
              ref={inputRef}
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              style={{ width: "100%", fontSize: "28px", fontWeight: "900", color: "#fff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-1px", background: "rgba(0,0,0,0.3)", border: `1px solid ${color}`, borderRadius: "12px", padding: "8px 12px", outline: "none", boxShadow: `0 0 20px ${glowColor}` }}
            />
          </div>
        ) : (
          <div style={{ fontSize: "32px", fontWeight: "900", color, fontFamily: "'Manrope', sans-serif", letterSpacing: "-1px", transition: "all 0.2s" }}>₹{fmt(value)}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", fontSize: "11px" }}>
          <span style={{ background: saved ? "#10B981" : glowColor, color: "#fff", padding: "4px 8px", borderRadius: "8px", fontWeight: "bold", transition: "background 0.3s" }}>{saved ? "✓ Saved" : "Energy Source"}</span>
          {isEditing && <span style={{ color: "#9AA0B4", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace" }}>Enter to save · Esc to cancel</span>}
        </div>
        <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", marginTop: "16px", overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: color, boxShadow: `0 0 10px ${color}` }} />
        </div>
      </div>
    </div>
  );
}

function HealthDonut({ health }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - health / 100);
  const color = health > 70 ? "#10B981" : health > 40 ? "#F59E0B" : "#EF4444";

  return (
    <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="12" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)" }} />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: "20px", fontWeight: "900", color, fontFamily: "'Manrope', sans-serif" }}>{health}%</div>
        <div style={{ fontSize: "8px", color: "var(--text-muted, #9AA0B4)", letterSpacing: "1px" }}>SYS HEALTH</div>
      </div>
    </div>
  );
}

// --- UPGRADED INJECTOR FORM ---
function InjectForm({ addTransaction, INCOME }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [btnState, setBtnState] = useState("default"); 

  const parsedAmount = parseFloat(amount) || 0;
  const isWant = category.startsWith("want");
  const isDebt = category.startsWith("debt");
  const isLeak = isWant || isDebt;
  
  const lifeHours = calcLifeHours(parsedAmount, INCOME);
  const sipCost = calcRegret(parsedAmount);

  let regretMessage = "";
  if (category === "want_ego") regretMessage = "The Sharmaji Tax: Buying this to impress people you don't even like.";
  if (category === "want_impulse") regretMessage = "Dopamine fades in 20 mins. The financial regret lasts all month.";
  if (category === "debt_toxic") regretMessage = "You are selling your future freedom for foam and plastic. Stop.";

  const commit = (isImpulse = false) => {
    if (!name.trim() || !amount || !category || !type) {
      setBtnState("error");
      setTimeout(() => setBtnState("default"), 700);
      return;
    }
    
    if (isImpulse) {
      alert(`[COOLDOWN PROTOCOL ENGAGED]\n"${name}" sent to Impulse Vault. Sleep on it for 24 hours.`);
      setName(""); setAmount(""); setCategory(""); setType(""); setIsRecurring(false); setDate(new Date().toISOString().split("T")[0]);
      return;
    }

    addTransaction({ name: name.trim(), amount: parsedAmount, category, type, date, id: Date.now(), isRecurring });
    setName(""); setAmount(""); setCategory(""); setType(""); setIsRecurring(false); setDate(new Date().toISOString().split("T")[0]);
    setBtnState("success");
    setTimeout(() => setBtnState("default"), 900);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ background: "rgba(0,0,0,0.3)", padding: "16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
        <input style={{ width: "100%", background: "transparent", border: "none", color: "#fff", outline: "none", fontSize: "16px", fontFamily: "'JetBrains Mono', monospace", marginBottom: "16px" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="> Origin (e.g. Zara, EMI, Swiggy)" />
        
        <div style={{ display: "flex", gap: 12, marginBottom: "16px" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "0 12px" }}>
            <span style={{ color: "var(--text-muted, #9AA0B4)", marginRight: "8px" }}>₹</span>
            <input style={{ width: "100%", background: "transparent", border: "none", color: "#fff", outline: "none", padding: "12px 0" }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: isRecurring ? '#FF2A5F' : 'var(--text-muted, #9AA0B4)', background: isRecurring ? 'rgba(255,42,95,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isRecurring ? '#FF2A5F' : 'transparent'}`, padding: '0 16px', borderRadius: '12px', cursor: 'pointer', transition: "all 0.2s" }}>
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} style={{ accentColor: "#FF2A5F" }} />
            Ghost Tax (Recurring)
          </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0 16px', color: '#fff', outline: 'none', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', colorScheme: 'dark' }} />
        </div>

        <div style={{ display: "flex", gap: "12px", zIndex: 20 }}>
            {/* Custom Dropdowns fixing the white menu issue! */}
            <GlassDropdown value={category} onChange={setCategory} options={BEHAVIOR_TYPES} placeholder="Psychological Driver" icon="🧠" />
            <GlassDropdown value={type} onChange={setType} options={TRANSACTION_TYPES} placeholder="Asset Class" icon="📦" />
        </div>
      </div>

      {parsedAmount > 0 && (
        <div style={{ background: isLeak ? "rgba(255, 42, 95, 0.1)" : "rgba(199, 240, 0, 0.05)", border: `1px solid ${isLeak ? "#FF2A5F" : "#C7F000"}`, padding: "16px", borderRadius: "16px", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: "4px", height: "100%", background: isLeak ? "#FF2A5F" : "#C7F000", boxShadow: `0 0 15px ${isLeak ? "#FF2A5F" : "#C7F000"}` }} />
          <div style={{ color: isLeak ? "#FF2A5F" : "#C7F000", fontWeight: "bold", marginBottom: "8px", marginLeft: "8px" }}>⚡ QFT REGRET ENGINE</div>
          <div style={{ color: "var(--text-muted, #9AA0B4)", marginLeft: "8px" }}>• Trading <span style={{ color: "#fff", fontWeight: "bold" }}>{lifeHours} hours</span> of life energy.</div>
          {isLeak && (
            <>
              <div style={{ color: "var(--text-muted, #9AA0B4)", marginTop: "4px", marginLeft: "8px" }}>• 10-Yr Wealth Destroyed: <span style={{ color: "#FF2A5F", fontWeight: "bold", fontSize: "14px" }}>₹{fmt(sipCost)}</span></div>
              {regretMessage && <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed rgba(255, 42, 95, 0.3)", color: "#F59E0B", fontStyle: "italic", marginLeft: "8px" }}>"{regretMessage}"</div>}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button style={{ flex: 1, padding: "16px", borderRadius: "12px", border: "none", fontWeight: "900", letterSpacing: "1px", cursor: "pointer", background: btnState === "success" ? "#10B981" : btnState === "error" ? "#FF2A5F" : "#4F7CFF", color: "#fff", transition: "all 0.3s ease", boxShadow: btnState === "default" ? "0 5px 20px rgba(79,124,255,0.3)" : "none" }} onClick={() => commit(false)}>
          {btnState === "success" ? "✓ PROTOCOL EXECUTED" : btnState === "error" ? "⚠ MISSING PARAMETERS" : "DEPLOY CAPITAL"}
        </button>
        {isLeak && (
          <button style={{ flex: 1, padding: "16px", borderRadius: "12px", border: "1px solid #F59E0B", background: "rgba(245, 158, 11, 0.1)", color: "#F59E0B", fontWeight: "900", letterSpacing: "1px", cursor: "pointer", transition: "all 0.2s" }} onMouseOver={(e)=>e.target.style.background="rgba(245, 158, 11, 0.2)"} onMouseOut={(e)=>e.target.style.background="rgba(245, 158, 11, 0.1)"} onClick={() => commit(true)}>
            ⏸ INITIATE COOLDOWN
          </button>
        )}
      </div>
    </div>
  );
}

// --- UPGRADED COMMAND CENTER LEDGER ---
function Ledger({ transactions, removeTransaction, updateTransaction }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("date_desc");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  // Filter Options for custom dropdown
  const filterOptions = [
    { label: "All Flows", value: "all" },
    { label: "Survival (Needs)", value: "need" },
    { label: "Leaks (Wants)", value: "want" },
    { label: "Assets (Saves)", value: "save" }
  ];

  // Sort Options for custom dropdown
  const sortOptions = [
    { label: "Newest First", value: "date_desc" },
    { label: "Oldest First", value: "date_asc" },
    { label: "Highest Amount", value: "amount_desc" },
    { label: "Lowest Amount", value: "amount_asc" }
  ];

  const processedTransactions = useMemo(() => {
    let result = transactions.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "all" ? true : t.category.startsWith(filter);
      return matchSearch && matchFilter;
    });

    result.sort((a, b) => {
      if (sort === "date_desc") return new Date(b.date) - new Date(a.date);
      if (sort === "date_asc") return new Date(a.date) - new Date(b.date);
      if (sort === "amount_desc") return b.amount - a.amount;
      if (sort === "amount_asc") return a.amount - b.amount;
      return 0;
    });

    return result;
  }, [transactions, search, filter, sort]);

  // Aggregate Metrics for current view
  const viewTotal = processedTransactions.reduce((acc, t) => acc + t.amount, 0);
  const viewRegret = processedTransactions.filter(t => t.category.startsWith("want") || t.category.startsWith("debt")).reduce((acc, t) => acc + calcRegret(t.amount), 0);

  const exportCSV = () => {
    const headers = "Date,Name,Amount,Category,Type,Recurring\n";
    const csv = processedTransactions.map(t => `${t.date},${t.name},${t.amount},${t.category},${t.type},${t.isRecurring}`).join("\n");
    const blob = new Blob([headers + csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FIN-OS_CommandLog_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      
      {/* Tools Row */}
      <div style={{ display: "flex", gap: "12px", zIndex: 10 }}>
        <div style={{ flex: 1.5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "0 12px", display: "flex", alignItems: "center" }}>
            <span style={{ color: "var(--text-muted, #9AA0B4)", marginRight: "8px" }}>🔍</span>
            <input style={{ width: "100%", background: "transparent", border: "none", padding: "12px 0", color: "#fff", outline: "none", fontSize: "13px" }} placeholder="Search extraction logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}><GlassDropdown value={filter} onChange={setFilter} options={filterOptions} placeholder="Filter" /></div>
        <div style={{ flex: 1 }}><GlassDropdown value={sort} onChange={setSort} options={sortOptions} placeholder="Sort" /></div>
        <button onClick={exportCSV} style={{ background: "#C7F000", color: "#000", border: "none", padding: "0 16px", borderRadius: "12px", fontWeight: "900", cursor: "pointer", fontSize: "12px", transition: "transform 0.2s" }} onMouseOver={(e)=>e.target.style.transform="scale(1.05)"} onMouseOut={(e)=>e.target.style.transform="scale(1)"}>↓ CSV</button>
      </div>

      {/* Aggregate Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.3)", padding: "12px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
        <span style={{ color: "var(--text-muted, #9AA0B4)" }}>Showing <span style={{ color: "#fff", fontWeight: "bold" }}>{processedTransactions.length}</span> Records</span>
        <div style={{ display: "flex", gap: "16px" }}>
            {viewRegret > 0 && <span>View Regret: <strong style={{ color: "#FF2A5F" }}>₹{fmt(viewRegret)}</strong></span>}
            <span>View Total: <strong style={{ color: filter === 'save' ? "#10B981" : "#4F7CFF" }}>₹{fmt(viewTotal)}</strong></span>
        </div>
      </div>

      {/* List */}
      <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "8px" }}>
        {processedTransactions.length === 0 ? <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted, #9AA0B4)", fontSize: "13px", background: "rgba(0,0,0,0.2)", borderRadius: "16px", border: "1px dashed rgba(255,255,255,0.1)" }}>Zero entries match this query parameter.</div> : 
          processedTransactions.map((t) => {
            const rootCat = t.category.split('_')[0];
            const cc = CATEGORY_COLORS[rootCat] || CATEGORY_COLORS.need;
            const isLoss = rootCat === "want" || rootCat === "debt";

            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", transition: "all 0.2s cursor-pointer" }} onMouseOver={(e)=>{e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}} onMouseOut={(e)=>{e.currentTarget.style.background="rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.05)"}}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: cc.bg, color: cc.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", boxShadow: `0 5px 15px ${cc.bg}` }}>{ICONS[t.type] || "⚡"}</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: "bold", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                        {t.name} 
                        {t.isRecurring && <span title="Ghost Tax" style={{ fontSize: "12px", background: "rgba(255,42,95,0.1)", color: "#FF2A5F", padding: "2px 6px", borderRadius: "4px" }}>RECURRING</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: cc.text, textTransform: "uppercase", letterSpacing: "1px", marginTop: "4px", display: "flex", gap: "12px" }}>
                      <span>{t.category.replace('_', ' ')}</span>
                      <span style={{ color: "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace" }}>{t.date}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                  <div style={{ color: rootCat === "save" ? "#10B981" : "#fff", fontWeight: "900", fontFamily: "'JetBrains Mono', monospace", fontSize: "18px" }}>
                      {rootCat === "save" ? "+" : "-"}₹{fmt(t.amount)}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {updateTransaction && (
                      <button onClick={() => { setEditingId(t.id); setEditData({ name: t.name, amount: t.amount }); }} style={{ background: "transparent", border: "none", color: "#4F7CFF", fontSize: "10px", cursor: "pointer", opacity: 0.5, transition: "opacity 0.2s", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold" }} onMouseOver={(e)=>e.target.style.opacity=1} onMouseOut={(e)=>e.target.style.opacity=0.5}>
                          Edit
                      </button>
                    )}
                    {removeTransaction && (
                      <button onClick={() => removeTransaction(t.id)} style={{ background: "transparent", border: "none", color: "#EF4444", fontSize: "10px", cursor: "pointer", opacity: 0.5, transition: "opacity 0.2s", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold" }} onMouseOver={(e)=>e.target.style.opacity=1} onMouseOut={(e)=>e.target.style.opacity=0.5}>
                          Terminate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* EDIT MODAL */}
      {editingId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={() => setEditingId(null)}>
          <div style={{ background: 'rgba(20,24,40,0.95)', border: '1px solid #4F7CFF', borderRadius: '24px', padding: '32px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 24px 0' }}>✏️ Edit Transaction</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input value={editData.name || ''} onChange={e => setEditData({ ...editData, name: e.target.value })} placeholder="Name" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', padding: '14px', borderRadius: '12px', color: '#fff', outline: 'none' }} />
              <input type="number" value={editData.amount || ''} onChange={e => setEditData({ ...editData, amount: parseFloat(e.target.value) || 0 })} placeholder="Amount" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', padding: '14px', borderRadius: '12px', color: '#fff', outline: 'none' }} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setEditingId(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '14px', borderRadius: '12px', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button onClick={() => { if (updateTransaction) updateTransaction(editingId, editData); setEditingId(null); }} style={{ flex: 1, background: '#4F7CFF', border: 'none', color: '#fff', padding: '14px', borderRadius: '12px', cursor: 'pointer', fontWeight: 900 }}>SAVE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === MAIN WEALTH INTERFACE COMPONENT ===
export default function WealthInterface({ transactions, addTransaction, removeTransaction, updateTransaction, INCOME, setIncome }) {
  const { needs, wants, saves, total, savings, health } = calcTotals(transactions, INCOME);
  const savingsRate = INCOME > 0 ? Math.round((savings / INCOME) * 100) : 0;
  const recurringTrans = transactions.filter(t => t.isRecurring);
  const recurringTotal = recurringTrans.reduce((a, b) => a + b.amount, 0);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "12px", color: "#4F7CFF", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px" }}>Terminal</div>
        <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: "900", letterSpacing: "-1px" }}>Wealth Interface</h1>
        <p style={{ color: "var(--text-muted, #9AA0B4)", marginTop: "8px" }}>Total command over capital deployment and extraction.</p>
      </div>

      {/* MACRO STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", marginBottom: "32px" }}>
        <EditableInflowCard value={INCOME} onSave={setIncome} />
        <StatCard label="Burn Rate" value={total} color="#FF2A5F" glowColor="rgba(255, 42, 95, 0.4)" pct={Math.min(100, Math.round(total/INCOME*100))} tag="Capital Destroyed" />
        <StatCard label="Ammunition" value={savings} color="#C7F000" glowColor="rgba(199, 240, 0, 0.4)" pct={Math.max(0, Math.round(savings/INCOME*100))} tag="Ready to Deploy" />
        <StatCard label="Savings Rate" value={Math.round(savings)} color={savingsRate >= 20 ? "#10B981" : "#F59E0B"} glowColor={savingsRate >= 20 ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.4)"} pct={Math.min(100, savingsRate)} tag={`${savingsRate}% of Income`} />
      </div>

      {/* GHOST TAX RADAR */}
      {recurringTotal > 0 && (
        <div style={{ background: "rgba(255, 42, 95, 0.05)", border: "1px solid rgba(255, 42, 95, 0.3)", borderRadius: "24px", padding: "24px", marginBottom: "32px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px", boxShadow: "0 10px 40px rgba(255,42,95,0.1)" }}>
           <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
              <div style={{ fontSize: "40px", background: "rgba(255,42,95,0.1)", padding: "16px", borderRadius: "16px", border: "1px solid rgba(255,42,95,0.3)", boxShadow: "0 0 20px rgba(255,42,95,0.2)" }}>👻</div>
              <div>
                  <div style={{ color: "#FF2A5F", fontWeight: "900", letterSpacing: "1px", fontSize: "20px", marginBottom: "4px" }}>GHOST TAX DETECTED</div>
                  <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "14px" }}>You are bleeding <strong style={{ color: "#FF2A5F", fontFamily: "'JetBrains Mono', monospace" }}>₹{fmt(recurringTotal)}/mo</strong> in silent subscriptions.</div>
              </div>
           </div>
           <div style={{ textAlign: "right", background: "rgba(0,0,0,0.5)", padding: "20px", borderRadius: "16px", border: "1px dashed rgba(255,42,95,0.4)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>10-Year Wealth Stolen</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", color: "#FF2A5F", fontWeight: "900", fontSize: "28px" }}>₹{fmt(calcRegret(recurringTotal * 12))}</div>
           </div>
        </div>
      )}

      {/* COMMAND CENTER GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "24px" }}>
        
        {/* INJECTOR */}
        <div style={{ background: "rgba(20,24,40,0.4)", padding: "32px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(12px)", height: "fit-content" }}>
          <h3 style={{ color: "#fff", margin: "0 0 24px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ color: "#4F7CFF" }}>⚡</span> Execute Transaction
          </h3>
          <InjectForm addTransaction={addTransaction} INCOME={INCOME} />
        </div>
        
        {/* LEDGER */}
        <div style={{ background: "rgba(20,24,40,0.4)", padding: "32px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "16px" }}>
            <h3 style={{ color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ color: "#10B981" }}>▤</span> Command Center Log
            </h3>
            <HealthDonut health={health} />
          </div>
          <Ledger transactions={transactions} removeTransaction={removeTransaction} updateTransaction={updateTransaction} />
        </div>
      </div>
    </div>
  );
}