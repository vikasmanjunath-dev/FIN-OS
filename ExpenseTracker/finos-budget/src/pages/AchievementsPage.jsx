import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmt, calcTotals, calcRegret } from "../utils/constants";
import { StaggerContainer, StaggerItem } from "../components/PageTransition";

// ─── ACHIEVEMENT DEFINITIONS ────────────────────────────────────
const ACHIEVEMENTS = [
  { id: "first_blood",    icon: "⚡", name: "First Blood",        desc: "Log your first transaction",               xp: 50,  check: (t) => t.length >= 1 },
  { id: "ledger_10",      icon: "📋", name: "Ledger Keeper",      desc: "Log 10 transactions",                     xp: 100, check: (t) => t.length >= 10 },
  { id: "ledger_50",      icon: "📚", name: "Audit Master",       desc: "Log 50 transactions",                     xp: 300, check: (t) => t.length >= 50 },
  { id: "no_wants_3",     icon: "🧘", name: "Monk Mode",          desc: "3 consecutive saves without any want",    xp: 200, check: (t) => { const last3 = t.slice(-3); return last3.length >= 3 && last3.every(x => !x.category.startsWith("want")); } },
  { id: "ghost_buster",   icon: "👻", name: "Ghost Buster",       desc: "Identify a recurring subscription",       xp: 150, check: (t) => t.some(x => x.isRecurring) },
  { id: "sip_warrior",    icon: "📈", name: "SIP Warrior",        desc: "Make an investment transaction",           xp: 200, check: (t) => t.some(x => x.category.startsWith("save")) },
  { id: "budget_under50", icon: "🎯", name: "50% Commander",      desc: "Keep needs under 50% of income",          xp: 250, check: (t, inc) => { const n = t.filter(x=>x.category.startsWith("need")).reduce((a,x)=>a+x.amount,0); return n > 0 && (n/inc) <= 0.5; } },
  { id: "save_20",        icon: "🚀", name: "Escape Velocity",    desc: "Save at least 20% of income",             xp: 500, check: (t, inc) => { const s = t.filter(x=>x.category.startsWith("save")).reduce((a,x)=>a+x.amount,0); return (s/inc) >= 0.2; } },
  { id: "big_save",       icon: "💎", name: "Diamond Hands",      desc: "Single investment over ₹10,000",          xp: 400, check: (t) => t.some(x => x.category.startsWith("save") && x.amount >= 10000) },
  { id: "zero_ego",       icon: "🧠", name: "Ego Destroyer",      desc: "No ego/status spending this month",       xp: 350, check: (t) => !t.some(x => x.category === "want_ego") },
  { id: "csv_export",     icon: "📊", name: "Data Scientist",     desc: "Export your data to CSV (coming soon)",   xp: 100, check: () => false },
  { id: "fire_calc",      icon: "🔥", name: "FIRE Starter",       desc: "Use the FIRE calculator",                 xp: 150, check: () => false },
];

const LEVELS = [
  { level: 1, title: "Intern",           minXP: 0,    color: "#6B7280" },
  { level: 2, title: "Analyst",          minXP: 200,  color: "#3B82F6" },
  { level: 3, title: "Associate",        minXP: 500,  color: "#8B5CF6" },
  { level: 4, title: "Vice President",   minXP: 1000, color: "#F59E0B" },
  { level: 5, title: "Director",         minXP: 1800, color: "#EF4444" },
  { level: 6, title: "Managing Director",minXP: 2800, color: "#EC4899" },
  { level: 7, title: "Partner",          minXP: 4000, color: "#10B981" },
  { level: 8, title: "Sovereign",        minXP: 5500, color: "#C7F000" },
];

const DAILY_CHALLENGES = [
  { id: "d1", text: "Log every single expense today — no leaks escape", xp: 30, icon: "📝" },
  { id: "d2", text: "Survive the entire day without a 'Want' purchase", xp: 50, icon: "🛡️" },
  { id: "d3", text: "Move ₹500 to your investment/savings goal", xp: 40, icon: "💰" },
  { id: "d4", text: "Find and cancel one unused subscription", xp: 60, icon: "🔍" },
  { id: "d5", text: "Cook at home instead of ordering Zomato/Swiggy", xp: 35, icon: "🍳" },
];

function getLevel(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.minXP) current = l;
    else break;
  }
  const nextLevel = LEVELS.find(l => l.minXP > xp) || null;
  return { ...current, nextLevel };
}

// ─── ANIMATED XP BAR ────────────────────────────────────────────
function XPBar({ current, max, color }) {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "100px", overflow: "hidden", position: "relative" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
        style={{ height: "100%", background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: "100px", boxShadow: `0 0 12px ${color}60` }}
      />
    </div>
  );
}

// ─── ACHIEVEMENT CARD ───────────────────────────────────────────
function AchievementCard({ achievement, unlocked, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.03, y: -4 }}
      style={{
        background: unlocked ? "rgba(20,24,40,0.6)" : "rgba(10,12,20,0.4)",
        border: `1px solid ${unlocked ? "rgba(199,240,0,0.3)" : "rgba(255,255,255,0.05)"}`,
        borderRadius: "20px",
        padding: "24px",
        backdropFilter: "blur(12px)",
        position: "relative",
        overflow: "hidden",
        cursor: "default",
        transition: "border-color 0.3s",
      }}
    >
      {unlocked && (
        <div style={{ position: "absolute", top: -30, right: -30, width: "80px", height: "80px", background: "radial-gradient(circle, rgba(199,240,0,0.15) 0%, transparent 70%)", borderRadius: "50%" }} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
        <div style={{
          fontSize: "28px",
          width: "56px", height: "56px",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "16px",
          background: unlocked ? "rgba(199,240,0,0.1)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${unlocked ? "rgba(199,240,0,0.2)" : "rgba(255,255,255,0.05)"}`,
          filter: unlocked ? "none" : "grayscale(1) opacity(0.4)",
          transition: "all 0.3s",
        }}>
          {achievement.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: unlocked ? "#fff" : "var(--text-muted, #9AA0B4)", fontWeight: 800, fontSize: "15px" }}>
            {achievement.name}
          </div>
          <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "12px", marginTop: "2px" }}>
            {achievement.desc}
          </div>
        </div>
        <div style={{
          background: unlocked ? "rgba(199,240,0,0.15)" : "rgba(255,255,255,0.05)",
          color: unlocked ? "#C7F000" : "var(--text-muted, #9AA0B4)",
          padding: "6px 12px",
          borderRadius: "100px",
          fontSize: "12px",
          fontWeight: 900,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {unlocked ? "✓" : ""} +{achievement.xp} XP
        </div>
      </div>
    </motion.div>
  );
}

// ─── CHALLENGE CARD ─────────────────────────────────────────────
function ChallengeCard({ challenge, completed, onComplete }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      style={{
        background: completed ? "rgba(16,185,129,0.08)" : "rgba(20,24,40,0.4)",
        border: `1px solid ${completed ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.05)"}`,
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        transition: "all 0.3s",
      }}
    >
      <div style={{ fontSize: "24px" }}>{challenge.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: completed ? "#10B981" : "#fff", fontWeight: 600, fontSize: "14px", textDecoration: completed ? "line-through" : "none" }}>
          {challenge.text}
        </div>
        <div style={{ color: "var(--text-muted, #9AA0B4)", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", marginTop: "4px" }}>
          +{challenge.xp} XP
        </div>
      </div>
      {!completed && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={onComplete}
          style={{
            background: "rgba(16,185,129,0.15)",
            border: "1px solid rgba(16,185,129,0.3)",
            color: "#10B981",
            padding: "8px 16px",
            borderRadius: "12px",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: "0.5px",
          }}
        >
          CLAIM
        </motion.button>
      )}
      {completed && <span style={{ color: "#10B981", fontSize: "20px" }}>✓</span>}
    </motion.div>
  );
}

// ═══ MAIN ACHIEVEMENTS PAGE ═══
export default function AchievementsPage({ transactions, INCOME }) {
  const [completedChallenges, setCompletedChallenges] = useState([]);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [prevLevel, setPrevLevel] = useState(1);

  // Compute unlocked achievements
  const unlocked = useMemo(() => {
    const set = new Set();
    ACHIEVEMENTS.forEach(a => {
      if (a.check(transactions, INCOME)) set.add(a.id);
    });
    return set;
  }, [transactions, INCOME]);

  // Total XP
  const totalXP = useMemo(() => {
    let xp = 0;
    ACHIEVEMENTS.forEach(a => {
      if (unlocked.has(a.id)) xp += a.xp;
    });
    completedChallenges.forEach(cid => {
      const c = DAILY_CHALLENGES.find(x => x.id === cid);
      if (c) xp += c.xp;
    });
    return xp;
  }, [unlocked, completedChallenges]);

  const levelInfo = getLevel(totalXP);

  // Level up animation
  useEffect(() => {
    if (levelInfo.level > prevLevel && prevLevel > 1) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 3000);
    }
    setPrevLevel(levelInfo.level);
  }, [levelInfo.level, prevLevel]);

  const xpForNext = levelInfo.nextLevel ? levelInfo.nextLevel.minXP - levelInfo.minXP : 1;
  const xpProgress = totalXP - levelInfo.minXP;
  const unlockedCount = unlocked.size;

  const todayChallenges = useMemo(() => {
    // Rotate through challenges based on day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const shuffled = [...DAILY_CHALLENGES].sort((a, b) => {
      const ha = ((dayOfYear * 7 + a.id.charCodeAt(1)) % 100);
      const hb = ((dayOfYear * 7 + b.id.charCodeAt(1)) % 100);
      return ha - hb;
    });
    return shuffled.slice(0, 3);
  }, []);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px", position: "relative" }}>

      {/* LEVEL UP CELEBRATION */}
      <AnimatePresence>
        {showLevelUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: -50 }}
            style={{
              position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.95)", border: `2px solid ${levelInfo.color}`,
              borderRadius: "32px", padding: "48px 64px", zIndex: 9999,
              textAlign: "center", boxShadow: `0 0 80px ${levelInfo.color}40`,
              backdropFilter: "blur(20px)",
            }}
          >
            <div style={{ fontSize: "64px", marginBottom: "16px" }}>🏆</div>
            <div style={{ fontSize: "14px", color: levelInfo.color, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 900, marginBottom: "8px" }}>LEVEL UP</div>
            <div style={{ fontSize: "36px", fontWeight: 900, color: "#fff" }}>{levelInfo.title}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "12px", color: "#C7F000", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "8px", height: "8px", background: "#C7F000", borderRadius: "50%", animation: "pulse-glow 1s infinite" }} />
          Gamification Engine
        </div>
        <h1 style={{ fontSize: "3rem", margin: 0, color: "#fff", fontWeight: 900, letterSpacing: "-1px" }}>Achievements</h1>
        <p style={{ color: "var(--text-muted, #9AA0B4)", marginTop: "8px" }}>Your financial discipline, quantified and gamified.</p>
      </div>

      {/* PLAYER CARD */}
      <StaggerContainer>
        <StaggerItem>
          <div style={{
            background: "rgba(20,24,40,0.6)", backdropFilter: "blur(12px)",
            border: `1px solid ${levelInfo.color}50`, borderRadius: "28px",
            padding: "32px", marginBottom: "32px",
            display: "flex", gap: "32px", alignItems: "center",
            boxShadow: `0 10px 40px ${levelInfo.color}15`,
            position: "relative", overflow: "hidden",
          }}>
            {/* Gradient orb */}
            <div style={{ position: "absolute", top: -60, right: -60, width: "200px", height: "200px", background: `radial-gradient(circle, ${levelInfo.color}20 0%, transparent 70%)`, borderRadius: "50%" }} />

            {/* Level Badge */}
            <div style={{
              width: "100px", height: "100px", borderRadius: "24px",
              background: `linear-gradient(135deg, ${levelInfo.color}30, ${levelInfo.color}10)`,
              border: `2px solid ${levelInfo.color}60`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: `inset 0 0 20px ${levelInfo.color}20`,
              flexShrink: 0,
            }}>
              <div style={{ fontSize: "36px", fontWeight: 900, color: levelInfo.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {levelInfo.level}
              </div>
              <div style={{ fontSize: "8px", color: levelInfo.color, textTransform: "uppercase", letterSpacing: "1px", marginTop: "4px" }}>LEVEL</div>
            </div>

            <div style={{ flex: 1, zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
                <div style={{ fontSize: "28px", fontWeight: 900, color: "#fff" }}>{levelInfo.title}</div>
                <div style={{ background: `${levelInfo.color}20`, color: levelInfo.color, padding: "4px 12px", borderRadius: "100px", fontSize: "12px", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace" }}>
                  {totalXP} XP
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {xpProgress}/{xpForNext} XP to next rank
                </span>
              </div>
              <XPBar current={xpProgress} max={xpForNext} color={levelInfo.color} />

              <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)" }}>
                  🏆 <span style={{ color: "#fff", fontWeight: 700 }}>{unlockedCount}</span>/{ACHIEVEMENTS.length} Unlocked
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)" }}>
                  📊 <span style={{ color: "#fff", fontWeight: 700 }}>{transactions.length}</span> Transactions
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted, #9AA0B4)" }}>
                  🔥 <span style={{ color: "#C7F000", fontWeight: 700 }}>{completedChallenges.length}</span> Challenges Done
                </div>
              </div>
            </div>
          </div>
        </StaggerItem>

        {/* DAILY CHALLENGES */}
        <StaggerItem>
          <div style={{
            background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "24px", padding: "32px", marginBottom: "32px", backdropFilter: "blur(12px)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ color: "#F59E0B" }}>⚡</span> Daily Missions
              </h3>
              <div style={{ fontSize: "11px", color: "var(--text-muted, #9AA0B4)", fontFamily: "'JetBrains Mono', monospace" }}>
                Resets at midnight
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {todayChallenges.map(c => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  completed={completedChallenges.includes(c.id)}
                  onComplete={() => setCompletedChallenges(prev => [...prev, c.id])}
                />
              ))}
            </div>
          </div>
        </StaggerItem>

        {/* FINANCIAL AGE */}
        <StaggerItem>
          <FinancialAgeCard transactions={transactions} income={income} />
        </StaggerItem>

        {/* MONTHLY CHALLENGES */}
        <StaggerItem>
          <MonthlyChallengesPanel />
        </StaggerItem>

        {/* LEAGUE / LEADERBOARD */}
        <StaggerItem>
          <LeaguePanel totalXP={totalXP} savingsRate={income > 0 ? (transactions.filter(t=>t.category?.startsWith('save')).reduce((s,t)=>s+t.amount,0)/income*100) : 0} />
        </StaggerItem>

        {/* ACHIEVEMENTS GRID */}
        <StaggerItem>
          <h3 style={{ color: "#fff", margin: "0 0 24px 0", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "#C7F000" }}>🏆</span> All Achievements
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "16px" }}>
            {ACHIEVEMENTS.map((a, i) => (
              <AchievementCard key={a.id} achievement={a} unlocked={unlocked.has(a.id)} index={i} />
            ))}
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FINANCIAL AGE CARD
   "Your financial behaviour is equivalent to a 34-year-old"
══════════════════════════════════════════════════════════════════ */
function FinancialAgeCard({ transactions, income }) {
  const actualAge = Number(localStorage.getItem('finos_age') || 28);

  // Score financial maturity 0-100 from behaviour
  const savingsAmt  = transactions.filter(t => t.category?.startsWith('save')).reduce((s,t) => s+t.amount, 0);
  const wantsAmt    = transactions.filter(t => t.category?.startsWith('want')).reduce((s,t) => s+t.amount, 0);
  const savingsRate = income > 0 ? savingsAmt / income : 0;
  const impulse     = transactions.filter(t => t.category === 'want_ego' || t.category === 'want_impulse').length;

  let maturityScore = 50;
  maturityScore += Math.min(30, savingsRate * 100);   // +30 for 30%+ savings rate
  maturityScore -= Math.min(20, impulse * 3);          // -3 per impulse buy
  maturityScore += transactions.length > 20 ? 10 : 0; // +10 for consistent tracking
  maturityScore = Math.max(20, Math.min(100, maturityScore));

  // Map maturity score to financial age
  // 100 score = 45-year-old wisdom, 20 score = 22-year-old impulsiveness
  const financialAge = Math.round(20 + (maturityScore / 100) * 30);
  const ageDiff      = financialAge - actualAge;
  const isAhead      = ageDiff > 0;

  const col = isAhead ? '#22d3a6' : '#ff9500';

  return (
    <div style={{
      background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "24px", padding: "28px", marginBottom: "32px",
      backdropFilter: "blur(12px)",
    }}>
      <h3 style={{ color: "#fff", margin: "0 0 20px 0", display: "flex", alignItems: "center", gap: "12px" }}>
        <span>🧠</span> Financial Age
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: "32px", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, color: col, lineHeight: 1 }}>{financialAge}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>Financial Age</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, color: "rgba(255,255,255,0.4)", lineHeight: 1 }}>{actualAge}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>Actual Age</div>
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: col, marginBottom: "8px" }}>
            {isAhead
              ? `🚀 You think ${Math.abs(ageDiff)} years ahead of your age!`
              : `📈 ${Math.abs(ageDiff)} years of financial wisdom to gain`}
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
            {isAhead
              ? `Your savings discipline and investment habits put you ahead of most peers. Keep going — compound interest rewards the patient.`
              : `Small improvements in savings rate and fewer impulse buys will rapidly age your financial maturity.`}
          </div>
          <div style={{ marginTop: "12px", height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${maturityScore}%`, background: `linear-gradient(90deg, ${col}, ${col}aa)`, borderRadius: "4px", transition: "width 1.2s ease" }} />
          </div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>Financial Maturity Score: {Math.round(maturityScore)}/100</div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MONTHLY CHALLENGES
══════════════════════════════════════════════════════════════════ */
const MONTHLY_CHALLENGES = [
  { id: 'no_spend_week',    icon: '🧘', name: 'No-Spend Week',        desc: '7 days — needs only, zero wants', xp: 500  },
  { id: 'sip_streak',       icon: '📈', name: 'SIP Consistency',      desc: 'Don\'t miss a single SIP this month', xp: 300  },
  { id: 'zero_cc',          icon: '💳', name: 'Zero Credit Card',     desc: 'Pay cash/UPI only — no CC swipes', xp: 400  },
  { id: 'cook_week',        icon: '🍳', name: 'Home Cook Week',       desc: 'Zero food delivery for 7 days', xp: 200  },
  { id: 'learn_module',     icon: '📚', name: 'Learn & Earn',         desc: 'Complete 2 learn modules', xp: 250  },
  { id: 'goal_fund',        icon: '🎯', name: 'Goal Funder',          desc: 'Fund at least one goal this month', xp: 350  },
];

function MonthlyChallengesPanel() {
  const storeKey = 'finos_monthly_challenges_' + new Date().toISOString().slice(0,7);
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { return []; }
  });

  const toggle = (id) => {
    const newList = completed.includes(id) ? completed.filter(c => c !== id) : [...completed, id];
    setCompleted(newList);
    try { localStorage.setItem(storeKey, JSON.stringify(newList)); } catch {}
  };

  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const totalXP = MONTHLY_CHALLENGES.filter(c => completed.includes(c.id)).reduce((s,c) => s+c.xp, 0);

  return (
    <div style={{
      background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "24px", padding: "28px", marginBottom: "32px",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
          <span>🗓️</span> {month} Challenges
        </h3>
        <div style={{ background: "rgba(199,240,0,0.1)", border: "1px solid rgba(199,240,0,0.3)", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: 900, color: "#c7f000" }}>
          {completed.length}/{MONTHLY_CHALLENGES.length} · {totalXP} XP
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
        {MONTHLY_CHALLENGES.map(c => {
          const done = completed.includes(c.id);
          return (
            <div key={c.id} onClick={() => toggle(c.id)} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 16px",
              background: done ? "rgba(34,211,166,0.1)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${done ? "rgba(34,211,166,0.3)" : "rgba(255,255,255,0.07)"}`,
              borderRadius: "14px", cursor: "pointer", transition: "all 0.2s",
            }}>
              <span style={{ fontSize: "22px" }}>{done ? '✅' : c.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: done ? "#22d3a6" : "#fff" }}>{c.name}</div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{c.desc}</div>
              </div>
              <div style={{ fontSize: "11px", fontWeight: 800, color: done ? "#22d3a6" : "rgba(255,255,255,0.3)" }}>+{c.xp} XP</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LEAGUE / ANONYMOUS LEADERBOARD
══════════════════════════════════════════════════════════════════ */
function LeaguePanel({ totalXP, savingsRate }) {
  // Simulated peer data (anonymized)
  const peers = [
    { rank: 1,  name: 'Anon_3847', xp: totalXP + 2400, sr: 38, badge: '👑' },
    { rank: 2,  name: 'Anon_9021', xp: totalXP + 1200, sr: 34, badge: '🥈' },
    { rank: 3,  name: 'Anon_5531', xp: totalXP + 400,  sr: 31, badge: '🥉' },
    { rank: '?', name: 'You',      xp: totalXP,         sr: Math.round(savingsRate), badge: '⭐', isYou: true },
    { rank: '—', name: 'Anon_7723', xp: Math.max(0, totalXP - 300), sr: 22, badge: '' },
    { rank: '—', name: 'Anon_2198', xp: Math.max(0, totalXP - 800), sr: 18, badge: '' },
  ];

  const agePct = Math.min(100, (totalXP / 500) * 15); // rough percentile

  return (
    <div style={{
      background: "rgba(20,24,40,0.4)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "24px", padding: "28px", marginBottom: "32px",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
          <span>🏅</span> Savers League
        </h3>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Anonymous · This month</div>
      </div>
      <div style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", color: "#00d4ff", fontWeight: 700 }}>
          You are in the top {Math.max(5, Math.round(100 - agePct))}% of savers in your income group
        </div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
          Savings rate: {Math.round(savingsRate)}% · Keep going to climb the ranks
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {peers.map((p, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px",
            background: p.isYou ? "rgba(0,212,255,0.08)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${p.isYou ? "rgba(0,212,255,0.25)" : "rgba(255,255,255,0.05)"}`,
            borderRadius: "12px",
          }}>
            <div style={{ width: "28px", textAlign: "center", fontSize: "13px", fontWeight: 900, color: i < 3 ? "#f0c040" : "rgba(255,255,255,0.3)" }}>
              {p.rank}
            </div>
            <div style={{ flex: 1, fontSize: "13px", fontWeight: p.isYou ? 800 : 500, color: p.isYou ? "#00d4ff" : "rgba(255,255,255,0.7)" }}>
              {p.badge} {p.name}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>SR: {p.sr}%</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: p.isYou ? "#00d4ff" : "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>
              {p.xp} XP
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
