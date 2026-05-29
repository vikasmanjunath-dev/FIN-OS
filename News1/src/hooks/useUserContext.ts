/**
 * useUserContext.ts
 * Fetches EVERYTHING about the logged-in user from Supabase:
 *   profiles · transactions · goals · holdings
 * Falls back gracefully to localStorage if the user isn't authenticated.
 *
 * Returns a rich UserContext object consumed by Arya for maximum personalisation.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

// ── Full type definitions ────────────────────────────────────────────────────

export interface ProfileData {
  fullName:       string;
  email:          string;
  phone:          string;
  city:           string;
  memberSince:    string;
  lifeStage:      string;
  incomeRange:    string;
  interests:      string[];
  mindset:        string;
  curiosityQuery: string;
  financialDna:   string;
  healthScore:    number;
  netWorth:       number;
  savingsRate:    number;
  psychProfile:   string | null;
}

export interface TransactionSummary {
  count:          number;
  totalIncome:    number;
  totalExpense:   number;
  netCashflow:    number;
  topCategories:  Array<{ cat: string; amt: number; pct: number }>;
  recent:         Array<{ category: string; amount: number; date: string; type: string }>;
  anomalies:      string[];  // e.g. "⚠ Food spending is 45% of expenses"
  hasSIP:         boolean;
}

export interface Goal {
  name:        string;
  target:      number;
  saved:       number;
  deadline:    string | null;
  progressPct: number;
  onTrack:     boolean;
}

export interface Holding {
  symbol:       string;
  quantity:     number;
  avgPrice:     number;
  currentPrice: number;
  value:        number;
  gainLoss:     number;
  gainLossPct:  number;
}

export interface PortfolioSummary {
  totalValue:  number;
  totalCost:   number;
  pnl:         number;
  pnlPct:      number;
  holdings:    Holding[];
  topGainer:   Holding | null;
  topLoser:    Holding | null;
}

export interface UserContext {
  isLoggedIn:   boolean;
  userId:       string | null;
  profile:      ProfileData;
  transactions: TransactionSummary | null;
  goals:        Goal[];
  portfolio:    PortfolioSummary | null;
  loadedAt:     Date;
}

// ── localStorage fallback helpers ────────────────────────────────────────────

function lsGet(key: string, fallback = ''): string {
  return localStorage.getItem(key) || fallback;
}

function parseInterests(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return raw ? raw.split(',').map(s => s.trim()) : []; }
}

function buildFallbackProfile(): ProfileData {
  let psychProfile: string | null = null;
  try {
    const raw = localStorage.getItem('FINOS_CORE_DNA');
    if (raw) psychProfile = raw;
  } catch {}

  return {
    fullName:       lsGet('finos_display_name', 'Investor'),
    email:          '',
    phone:          lsGet('finos_phone', ''),
    city:           '',
    memberSince:    '',
    lifeStage:      lsGet('finos_stage', 'Rookie'),
    incomeRange:    lsGet('finos_income', 'not set'),
    interests:      parseInterests(lsGet('finos_interests', 'stocks')),
    mindset:        lsGet('finos_mindset', 'freedom'),
    curiosityQuery: lsGet('finos_query', ''),
    financialDna:   lsGet('finos_financial_dna', 'Explorer'),
    healthScore:    parseFloat(lsGet('finos_health_score', '0')),
    netWorth:       parseFloat(lsGet('finos_net_worth', '0')),
    savingsRate:    parseFloat(lsGet('finos_savings_rate', '0')),
    psychProfile,
  };
}

// ── Main hook ────────────────────────────────────────────────────────────────

export function useUserContext() {
  const [ctx, setCtx] = useState<UserContext>({
    isLoggedIn:   false,
    userId:       null,
    profile:      buildFallbackProfile(),
    transactions: null,
    goals:        [],
    portfolio:    null,
    loadedAt:     new Date(),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      try {
        // ── 1. Check Supabase session ─────────────────────────────────────
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // Not logged in — enrich fallback from localStorage
          if (!cancelled) {
            setCtx(prev => ({ ...prev, isLoggedIn: false, loadedAt: new Date() }));
          }
          return;
        }

        const uid  = session.user.id;
        const email = session.user.email ?? '';

        // ── 2. Fetch all tables in parallel ──────────────────────────────
        const [profileRes, txRes, goalsRes, holdingsRes] = await Promise.allSettled([
          supabase.from('profiles')
            .select('*')
            .eq('id', uid)
            .single(),

          supabase.from('transactions')
            .select('category, amount, date, type')
            .eq('user_id', uid)
            .order('date', { ascending: false })
            .limit(100),

          supabase.from('goals')
            .select('*')
            .eq('user_id', uid),

          supabase.from('holdings')
            .select('symbol, quantity, avg_price, current_price')
            .eq('user_id', uid),
        ]);

        if (cancelled) return;

        // ── 3. Build profile ──────────────────────────────────────────────
        const dbProf = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
        let psychProfile: string | null = null;
        try {
          const raw = localStorage.getItem('FINOS_CORE_DNA');
          if (raw) psychProfile = raw;
        } catch {}

        const profile: ProfileData = {
          fullName:       dbProf?.full_name       || lsGet('finos_display_name', 'Investor'),
          email,
          phone:          dbProf?.phone           || lsGet('finos_phone', ''),
          city:           dbProf?.city            || '',
          memberSince:    session.user.created_at?.slice(0, 10) || '',
          lifeStage:      dbProf?.life_stage       || lsGet('finos_stage', 'Rookie'),
          incomeRange:    dbProf?.income_range     || lsGet('finos_income', 'not set'),
          interests:      dbProf?.interests        || parseInterests(lsGet('finos_interests', 'stocks')),
          mindset:        dbProf?.mindset          || lsGet('finos_mindset', 'freedom'),
          curiosityQuery: dbProf?.curiosity_query  || lsGet('finos_query', ''),
          financialDna:   dbProf?.financial_dna    || lsGet('finos_financial_dna', 'Explorer'),
          healthScore:    parseFloat(dbProf?.health_score  || lsGet('finos_health_score', '0')),
          netWorth:       parseFloat(dbProf?.net_worth     || lsGet('finos_net_worth', '0')),
          savingsRate:    parseFloat(dbProf?.savings_rate  || lsGet('finos_savings_rate', '0')),
          psychProfile:   dbProf?.psych_profile ? JSON.stringify(dbProf.psych_profile) : psychProfile,
        };

        // Also cache back to localStorage for other FIN·OS pages
        localStorage.setItem('finos_display_name',  profile.fullName);
        localStorage.setItem('finos_financial_dna', profile.financialDna);
        localStorage.setItem('finos_stage',         profile.lifeStage);
        localStorage.setItem('finos_income',        profile.incomeRange);
        localStorage.setItem('finos_interests',     JSON.stringify(profile.interests));
        localStorage.setItem('finos_mindset',       profile.mindset);
        if (profile.healthScore) localStorage.setItem('finos_health_score', String(profile.healthScore));
        if (profile.netWorth)    localStorage.setItem('finos_net_worth',    String(profile.netWorth));
        if (profile.savingsRate) localStorage.setItem('finos_savings_rate', String(profile.savingsRate));

        // ── 4. Build transaction summary ──────────────────────────────────
        let transactions: TransactionSummary | null = null;
        if (txRes.status === 'fulfilled' && txRes.value.data?.length) {
          const txs = txRes.value.data;
          let totalIncome = 0, totalExpense = 0;
          const catMap: Record<string, number> = {};

          txs.forEach(t => {
            const amt = Math.abs(parseFloat(t.amount) || 0);
            if (t.type === 'income') totalIncome += amt;
            else                    totalExpense += amt;
            if (t.category) catMap[t.category] = (catMap[t.category] || 0) + amt;
          });

          // Top categories with % of total expense
          const topCategories = Object.entries(catMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([cat, amt]) => ({
              cat,
              amt: Math.round(amt),
              pct: totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0,
            }));

          // Anomaly detection: any category > 30% of total spend
          const anomalies: string[] = [];
          topCategories.forEach(({ cat, pct, amt }) => {
            if (pct > 30) anomalies.push(`⚠ ${cat} is ${pct}% of expenses (₹${amt.toLocaleString('en-IN')})`);
          });
          const hasSIP = txs.some(t => /sip|mutual|invest/i.test(t.category || ''));
          if (!hasSIP) anomalies.push('⚠ No SIP / mutual fund transaction found this period');

          transactions = {
            count: txs.length,
            totalIncome:  Math.round(totalIncome),
            totalExpense: Math.round(totalExpense),
            netCashflow:  Math.round(totalIncome - totalExpense),
            topCategories,
            recent: txs.slice(0, 8).map(t => ({
              category: t.category || 'Uncategorised',
              amount:   Math.round(parseFloat(t.amount) || 0),
              date:     t.date?.slice(0, 10) || '',
              type:     t.type || 'expense',
            })),
            anomalies,
            hasSIP,
          };
        }

        // ── 5. Build goals list ───────────────────────────────────────────
        let goals: Goal[] = [];
        if (goalsRes.status === 'fulfilled' && goalsRes.value.data?.length) {
          goals = goalsRes.value.data.map(g => {
            const target  = parseFloat(g.target_amount) || 0;
            const saved   = parseFloat(g.current_amount) || 0;
            const pct     = target > 0 ? Math.round((saved / target) * 100) : 0;
            const deadline = g.target_date || g.deadline || null;
            const onTrack = deadline
              ? (() => {
                  const monthsLeft = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
                  const needed     = (target - saved) / Math.max(monthsLeft, 1);
                  // "on track" if needing < 20% of monthly income equivalent
                  return needed < 50000; // rough heuristic
                })()
              : pct >= 10;
            return {
              name:        g.name || g.goal_name || 'Goal',
              target,
              saved,
              deadline,
              progressPct: pct,
              onTrack,
            };
          });
        }

        // ── 6. Build portfolio summary ────────────────────────────────────
        let portfolio: PortfolioSummary | null = null;
        if (holdingsRes.status === 'fulfilled' && holdingsRes.value.data?.length) {
          const raw = holdingsRes.value.data;
          const holdings: Holding[] = raw.map(h => {
            const qty   = parseFloat(h.quantity)      || 0;
            const avg   = parseFloat(h.avg_price)     || 0;
            const cur   = parseFloat(h.current_price) || 0;
            const value = qty * cur;
            const cost  = qty * avg;
            return {
              symbol:      h.symbol,
              quantity:    qty,
              avgPrice:    avg,
              currentPrice: cur,
              value:       Math.round(value),
              gainLoss:    Math.round(value - cost),
              gainLossPct: cost > 0 ? +((((value - cost) / cost) * 100).toFixed(2)) : 0,
            };
          });

          const totalValue = holdings.reduce((s, h) => s + h.value,    0);
          const totalCost  = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
          const sorted     = [...holdings].sort((a, b) => b.gainLossPct - a.gainLossPct);

          portfolio = {
            totalValue: Math.round(totalValue),
            totalCost:  Math.round(totalCost),
            pnl:        Math.round(totalValue - totalCost),
            pnlPct:     totalCost > 0 ? +((((totalValue - totalCost) / totalCost) * 100).toFixed(2)) : 0,
            holdings,
            topGainer:  sorted[0]       ?? null,
            topLoser:   sorted[sorted.length - 1] ?? null,
          };
        }

        if (!cancelled) {
          setCtx({
            isLoggedIn: true,
            userId:     uid,
            profile,
            transactions,
            goals,
            portfolio,
            loadedAt: new Date(),
          });
        }
      } catch (err) {
        console.debug('[UserContext] Fetch error (non-fatal):', err);
        if (!cancelled) {
          setCtx(prev => ({ ...prev, isLoggedIn: false, loadedAt: new Date() }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  return { userCtx: ctx, userLoading: loading };
}
