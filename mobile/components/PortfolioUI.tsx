import React, { useEffect, useState } from 'react';
import { loadPortfolioHistory, type HistoryLoad } from '@/lib/portfolioApi';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/TrackerUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useHoldings, toView, type HoldingView } from '@/hooks/useHoldings';

/** The person's holdings as priced views, plus whether the store has finished reading the phone. */
export function usePortfolioViews(): { views: HoldingView[]; loaded: boolean; total: number; unpriced: number } {
  const { holdings, loaded } = useHoldings();
  const views = holdings.map(toView);
  return { views, loaded, total: views.reduce((s, v) => s + v.current, 0), unpriced: views.filter(v => !v.priced).length };
}

/** Shown instead of an analytics screen when there is nothing to analyse. Never fills in example holdings. */
export function EmptyPortfolio({ loaded }: { loaded: boolean }) {
  return (
    <Card>
      <Text style={Typography.body}>{loaded ? 'You have no holdings on this phone yet.' : 'Loading your holdings…'}</Text>
      {loaded ? (
        <>
          <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>Add shares or mutual funds in Portfolio, or import a broker file. This screen only analyses what you have entered; it never shows example holdings.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to Portfolio" onPress={() => router.push('/portfolio' as any)} style={{ marginTop: Spacing.sm }}>
            <Text style={{ color: Colors.cyan, fontWeight: '700' }}>Open Portfolio ›</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </Card>
  );
}

export function NotAdvice({ extra }: { extra?: string }) {
  return <Text style={[Typography.caption, { marginTop: Spacing.lg, lineHeight: 17 }]}>{`${extra ? extra + ' ' : ''}Estimates for planning and understanding, not advice or a recommendation to buy or sell.`}</Text>;
}

export function Row({ children }: { children: React.ReactNode }) { return <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>; }

// ── one year of price history for the holdings, loaded once per visit ─────────────────────────────────────────────────


export interface HistoryState { status: 'idle' | 'loading' | 'done'; progress: number; data: HistoryLoad | null; reload: () => void }

/** Loads (or re-reads from the saved copy) the price history of every holding. `enabled` false does nothing. */
export function usePortfolioHistory(views: HoldingView[], enabled: boolean): HistoryState {
  const [state, setState] = useState<{ status: HistoryState['status']; progress: number; data: HistoryLoad | null }>({ status: 'idle', progress: 0, data: null });
  const [tick, setTick] = useState(0);
  const sig = views.map(v => `${v.type}:${v.symbol}`).join('|');   // a price refresh must not restart the download
  useEffect(() => {
    if (!enabled || !views.length) return;
    let current = true;                        // flipped by the cleanup: a superseded load never writes its result
    // Never keep results for the previous holdings set visible while this one loads.
    setState({ status: 'loading', progress: 0, data: null });
    loadPortfolioHistory(views, (d, t) => { if (current) setState(s => ({ ...s, progress: d / t })); })
      .then(data => { if (current) setState({ status: 'done', progress: 1, data }); })
      .catch(() => { if (current) setState({ status: 'done', progress: 1, data: null }); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sig, tick]);
  return { ...state, reload: () => setTick(t => t + 1) };
}
