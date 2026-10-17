import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CalcField, Segmented, Collapsible, Bullet } from '@/components/CalcUI';
import { add, remove, view, type WatchItem, type WatchType } from '@/lib/watchlist';
import { loadWatchlist, refreshWatchlist, saveWatchlist } from '@/lib/watchlistStorage';
import { lookupStock, searchFunds, type FundResult } from '@/hooks/useHoldings';
import { Colors, Spacing, Typography } from '@/constants/theme';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function WatchlistScreen() {
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [kind, setKind] = useState<WatchType>('Stock');
  const [q, setQ] = useState('');
  const [funds, setFunds] = useState<FundResult[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useRef<WatchItem[]>([]);

  const commit = (next: WatchItem[]) => { live.current = next; setItems(next); saveWatchlist(next).catch(() => {}); };

  const refresh = useCallback(async (list: WatchItem[]) => {
    if (!list.length) return;
    setBusy(true);
    try {
      const r = await refreshWatchlist(list, ymd(new Date()));
      if (r.updated > 0) commit(r.items);
      setMsg(r.updated > 0 ? '' : 'Could not fetch prices right now. Showing the last ones.');
    } catch { setMsg('Could not fetch prices right now. Showing the last ones.'); }
    setBusy(false);
  }, []);

  useFocusEffect(useCallback(() => { loadWatchlist().then(l => { live.current = l; setItems(l); refresh(l); }); }, [refresh]));

  useEffect(() => {
    if (kind !== 'MF' || q.trim().length < 3) { setFunds([]); return; }
    const t = setTimeout(() => { searchFunds(q).then(r => setFunds(r.slice(0, 8))).catch(() => { setFunds([]); setMsg('Fund search needs a connection.'); }); }, 400);
    return () => clearTimeout(t);
  }, [q, kind]);

  const addStock = async () => {
    setMsg(''); setBusy(true);
    let name = q.trim().toUpperCase(), price: number | null = null;
    try { const r = await lookupStock(q); name = r.name; price = r.price; } catch { /* offline or unknown: add without a price, never with a made-up one */ }
    const res = add(live.current, 'Stock', q, name, price, new Date());
    setBusy(false);
    if (!res.ok) { setMsg(res.error); return; }
    commit(res.items); setQ('');
    if (price === null) setMsg('Added without a price: it could not be fetched. It fills in next time you are online.');
  };
  const addFund = (f: FundResult) => {
    const res = add(live.current, 'MF', f.scheme_code, f.scheme_name, f.nav, new Date());
    if (!res.ok) { setMsg(res.error); return; }
    commit(res.items); setQ(''); setFunds([]); setMsg('');
  };
  const drop = (i: WatchItem) => {
    const go = () => commit(remove(live.current, i.id));
    if (Platform.OS === 'web') { if (window.confirm(`Stop watching ${i.symbol}?`)) go(); return; }
    Alert.alert('Remove from watchlist', `Stop watching ${i.symbol}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const openResearch = (i: WatchItem) => router.push((i.type === 'Stock' ? `/market/stock/${encodeURIComponent(i.symbol)}` : `/market/fund/${encodeURIComponent(i.symbol)}`) as any);

  const rows = useMemo(() => view(items ?? [], ymd(new Date())), [items]);
  if (!items) return <TrackerScreen title="Watchlist" subtitle="Stocks and funds you follow."><Card><Text style={Typography.body}>Loading…</Text></Card></TrackerScreen>;

  return (
    <TrackerScreen title="Watchlist" subtitle="Stocks and funds you follow without owning. The price when you added each one is kept, so you can see how it has moved since.">
      <Card>
        <Segmented<WatchType> label="ADD" value={kind} onChange={v => { setKind(v); setQ(''); setFunds([]); setMsg(''); }} options={[{ id: 'Stock', label: 'Stock' }, { id: 'MF', label: 'Mutual fund' }]} />
        <CalcField label={kind === 'Stock' ? 'NSE TICKER' : 'FUND NAME'} text value={q} onChange={setQ} placeholder={kind === 'Stock' ? 'e.g. INFY' : 'e.g. nifty 50 index'} maxLength={60} />
        {kind === 'Stock' && <TouchableOpacity style={s.btn} accessibilityRole="button" disabled={busy || !q.trim()} onPress={addStock}><Text style={s.btnTxt}>{busy ? 'Checking…' : '＋ Add to watchlist'}</Text></TouchableOpacity>}
        {funds.map(f => (
          <TouchableOpacity key={f.scheme_code} accessibilityRole="button" accessibilityLabel={`Add ${f.scheme_name}`} style={s.fund} onPress={() => addFund(f)}>
            <Text style={s.name} numberOfLines={2}>{f.scheme_name}</Text>
            <Text style={Typography.caption}>{`${f.fund_house}${f.nav ? ` · NAV ₹${f.nav}` : ''}`}</Text>
          </TouchableOpacity>
        ))}
        {msg ? <Text style={[Typography.caption, { marginTop: Spacing.sm, color: Colors.gold }]} accessibilityRole="alert">{msg}</Text> : null}
      </Card>

      <SectionLabel>{`WATCHING (${rows.length})`}</SectionLabel>
      {rows.length === 0 && <Card><Text style={Typography.body}>Nothing yet. Add a ticker or search a fund above.</Text></Card>}
      {rows.map(r => (
        <Card key={r.id}>
          <View style={s.top}>
            <TouchableOpacity style={s.open} accessibilityRole="link" accessibilityLabel={`Open research for ${r.name}`} accessibilityHint={r.type === 'Stock' ? 'Opens the stock research screen' : 'Opens the fund research screen'} onPress={() => openResearch(r)}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{r.name}</Text>
                <Text style={Typography.caption}>{`${r.type === 'Stock' ? r.symbol : `Scheme ${r.symbol}`}${r.priceDate ? ` · ${r.stale ? 'last price ' : ''}${r.priceDate}` : ' · no price yet'}`}</Text>
                <Text style={s.more}>Research →</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.price}>{r.lastPrice ? `₹${r.lastPrice.toLocaleString('en-IN')}` : '—'}</Text>
                {r.changePct !== null && <Text style={[s.chg, { color: r.changePct >= 0 ? Colors.teal : Colors.red }]}>{`${r.changePct >= 0 ? '+' : '−'}${Math.abs(r.changePct).toFixed(1)}% since added`}</Text>}
              </View>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Stop watching ${r.symbol}`} hitSlop={10} onPress={() => drop(r)}><Text style={s.del}>✕</Text></TouchableOpacity>
          </View>
        </Card>
      ))}
      {rows.length > 0 && (
        <TouchableOpacity accessibilityRole="button" onPress={() => refresh(live.current)} disabled={busy}><Text style={[s.link, busy && { opacity: 0.5 }]}>{busy ? 'Refreshing…' : 'Refresh prices'}</Text></TouchableOpacity>
      )}
      <Collapsible title="About this list">
        <Bullet>Prices come from the same service the Portfolio uses. If it cannot be reached, the last price stays and is marked as old.</Bullet>
        <Bullet>The watchlist is stored on this phone only. Nothing here is a recommendation.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 44, justifyContent: 'center', backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.xs },
  btnTxt: { color: '#000', fontWeight: '900', fontSize: 14 },
  fund: { minHeight: 44, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 10, marginTop: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  more: { color: Colors.cyan, fontSize: 11, fontWeight: '800', marginTop: 4 },
  name: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  price: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  chg: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  del: { color: Colors.red, fontSize: 16, padding: 6 },
  link: { color: Colors.cyan, fontWeight: '800', textAlign: 'center', paddingVertical: Spacing.md },
});
