import { useEffect } from "react";
import usePersistedState from "./hooks/usePersistedState";
import WealthInterface from "./pages/WealthInterface";
import FlowMap from "./pages/FlowMap";
import BudgetIntelligenceDashboard from "./pages/BudgetIntelligenceDashboard";
import Goals from "./pages/Goals";
import AIWarRoom from "./pages/AIWarRoom";
import FIRECalculator from "./pages/FIRECalculator";
import AchievementsPage from "./pages/AchievementsPage";
import SettingsPage from "./pages/SettingsPage";
import ReportsPage from "./pages/ReportsPage";
import DebtDestroyer from "./pages/DebtDestroyer";
import SubscriptionManager from "./pages/SubscriptionManager";
import Sidebar from "./components/Sidebar";
import ParticleField from "./components/ParticleField";
import PageTransition from "./components/PageTransition";
import { calcTotals } from "./utils/constants";
import "./App.css";

const DEFAULT_TRANSACTIONS = [];

export default function App() {
  const [page, setPage] = usePersistedState("finos_page", "wealth");
  const [transactions, setTransactions] = usePersistedState("finos_transactions", DEFAULT_TRANSACTIONS);
  const [INCOME, setIncome] = usePersistedState("finos_income", 85000);
  const [currency, setCurrency] = usePersistedState("finos_currency", "INR");
  const [theme, setTheme] = usePersistedState("finos_theme", "dark");
  const [profile, setProfile] = usePersistedState("finos_profile", { name: "", avatar: "🧑‍💻" });
  const [goals, setGoals] = usePersistedState("finos_goals", [
    { id: 1, name: "Emergency Fund", emoji: "🏧", target: 300000, current: 50000, deadlineMonths: 12, color: "#F59E0B", priority: "high" },
    { id: 2, name: "Europe Trip", emoji: "✈️", target: 150000, current: 15000, deadlineMonths: 6, color: "#06B6D4", priority: "medium" },
  ]);
  const [debts, setDebts] = usePersistedState("finos_debts", []);
  const [subscriptions, setSubscriptions] = usePersistedState("finos_subscriptions", []);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "midnight") {
      root.style.setProperty("--bg", "#050a18");
      root.style.setProperty("--bg2", "#0a1224");
      root.style.setProperty("--bg3", "#0f1830");
    } else if (theme === "oled") {
      root.style.setProperty("--bg", "#000000");
      root.style.setProperty("--bg2", "#050505");
      root.style.setProperty("--bg3", "#0a0a0a");
    } else {
      root.style.setProperty("--bg", "#060608");
      root.style.setProperty("--bg2", "#0d0d12");
      root.style.setProperty("--bg3", "#13131a");
    }
  }, [theme]);

  const addTransaction = (txn) => {
    setTransactions((prev) => [...prev, { ...txn, id: Date.now() }]);
  };

  const removeTransaction = (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const updateTransaction = (id, updates) => {
    setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
  };

  const { health } = calcTotals(transactions, INCOME);

  return (
    <div className="app-root">
      <ParticleField health={health} />
      <Sidebar activePage={page} setPage={setPage} />
      <main className="main-content">
        <PageTransition pageKey={page}>
          {page === "wealth" && (
            <WealthInterface
              transactions={transactions}
              addTransaction={addTransaction}
              removeTransaction={removeTransaction}
              updateTransaction={updateTransaction}
              INCOME={INCOME}
              setIncome={setIncome}
            />
          )}
          {page === "flow" && (
            <FlowMap transactions={transactions} INCOME={INCOME} />
          )}
          {page === "intel" && (
            <BudgetIntelligenceDashboard transactions={transactions} INCOME={INCOME} />
          )}
          {page === "warroom" && (
            <AIWarRoom transactions={transactions} INCOME={INCOME} />
          )}
          {page === "fire" && (
            <FIRECalculator transactions={transactions} INCOME={INCOME} />
          )}
          {page === "goals" && (
            <Goals transactions={transactions} INCOME={INCOME} goals={goals} setGoals={setGoals} />
          )}
          {page === "achievements" && (
            <AchievementsPage transactions={transactions} INCOME={INCOME} />
          )}
          {page === "reports" && (
            <ReportsPage transactions={transactions} INCOME={INCOME} />
          )}
          {page === "debt" && (
            <DebtDestroyer debts={debts} setDebts={setDebts} INCOME={INCOME} />
          )}
          {page === "subscriptions" && (
            <SubscriptionManager subscriptions={subscriptions} setSubscriptions={setSubscriptions} INCOME={INCOME} />
          )}
          {page === "settings" && (
            <SettingsPage
              INCOME={INCOME} setIncome={setIncome}
              currency={currency} setCurrency={setCurrency}
              theme={theme} setTheme={setTheme}
              profile={profile} setProfile={setProfile}
              transactions={transactions}
            />
          )}
        </PageTransition>
      </main>
    </div>
  );
}