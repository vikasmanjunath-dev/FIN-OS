import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { Holding, NewHolding, FundResult, lookupStock, searchFunds } from '@/hooks/useHoldings';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (h: NewHolding) => Promise<void>;
}

type Kind = 'Stock' | 'MF';
interface Picked { symbol: string; name: string; price: number | null; type: Holding['type']; }

const num = (s: string) => parseFloat(s.replace(/,/g, ''));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function AddHoldingModal({ visible, onClose, onAdd }: Props) {
  const [kind, setKind] = useState<Kind>('Stock');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funds, setFunds] = useState<FundResult[]>([]);
  const [directGrowthOnly, setDirectGrowthOnly] = useState(true);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [units, setUnits] = useState('');
  const [avg, setAvg] = useState('');
  const [sip, setSip] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setQuery(''); setFunds([]); setPicked(null); setUnits(''); setAvg(''); setSip(''); setError(null);
  };
  const close = () => { reset(); onClose(); };
  const switchKind = (k: Kind) => { reset(); setKind(k); };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true); setError(null); setPicked(null); setFunds([]);
    try {
      if (kind === 'Stock') {
        const s = await lookupStock(query);
        setPicked({ symbol: s.symbol, name: s.name, price: r2(s.price), type: 'Stock' });
        setAvg(String(r2(s.price)));
      } else {
        const r = await searchFunds(query);
        if (!r.length) setError('No funds found. Try the fund house or a shorter name.');
        setFunds(r);
      }
    } catch (e: any) {
      setError(kind === 'Stock'
        ? `Couldn't find "${query.trim().toUpperCase()}" on NSE. Use the ticker, e.g. RELIANCE or HDFCBANK.`
        : 'Search failed — is the backend running?');
    } finally {
      setSearching(false);
    }
  };

  const pickFund = (f: FundResult) => {
    const isElss = /elss|tax saver|tax advantage/i.test(f.scheme_name);
    setPicked({ symbol: f.scheme_code, name: f.scheme_name, price: f.nav, type: isElss ? 'ELSS' : 'MF' });
    if (f.nav != null) setAvg(String(f.nav));
    setFunds([]);
  };

  const unitsN = num(units), avgN = num(avg), sipN = sip ? num(sip) : undefined;
  const valid = !!picked && unitsN > 0 && avgN > 0 && (sipN === undefined || sipN >= 0);

  const save = async () => {
    if (!picked || !valid) return;
    setSaving(true);
    await onAdd({
      type: picked.type,
      symbol: picked.symbol,
      name: picked.name,
      units: unitsN,
      avgPrice: avgN,
      sipMonthly: picked.type === 'Stock' ? undefined : sipN || undefined,
      lastPrice: picked.price ?? undefined,
      priceDate: picked.price != null ? new Date().toISOString().slice(0, 10) : undefined,
    });
    setSaving(false);
    close();
  };

  const shown = directGrowthOnly
    ? funds.filter(f => /direct/i.test(f.plan) && /^growth/i.test(f.option))
    : funds;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={Typography.h3}>Add holding</Text>
            <TouchableOpacity onPress={close} hitSlop={12}><Text style={styles.close}>✕</Text></TouchableOpacity>
          </View>

          <View style={styles.seg}>
            {(['Stock', 'MF'] as Kind[]).map(k => (
              <TouchableOpacity key={k} style={[styles.segBtn, kind === k && styles.segBtnOn]} onPress={() => switchKind(k)}>
                <Text style={[styles.segTxt, kind === k && styles.segTxtOn]}>{k === 'Stock' ? 'Stock (NSE)' : 'Mutual fund'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={search}
                placeholder={kind === 'Stock' ? 'NSE ticker, e.g. HDFCBANK' : 'Fund name, e.g. Parag Parikh Flexi'}
                placeholderTextColor={Colors.textDim}
                autoCapitalize={kind === 'Stock' ? 'characters' : 'none'}
                autoCorrect={false}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={searching}>
                {searching ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.searchBtnTxt}>Search</Text>}
              </TouchableOpacity>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            {kind === 'MF' && funds.length > 0 && (
              <>
                <TouchableOpacity style={styles.filterRow} onPress={() => setDirectGrowthOnly(v => !v)}>
                  <Text style={styles.filterBox}>{directGrowthOnly ? '☑' : '☐'}</Text>
                  <Text style={Typography.caption}>Direct plan · Growth option only</Text>
                </TouchableOpacity>
                {shown.length === 0 && <Text style={styles.error}>No Direct-Growth match — untick the filter to see all plans.</Text>}
                {shown.map(f => (
                  <TouchableOpacity key={f.scheme_code} style={styles.fundRow} onPress={() => pickFund(f)}>
                    <Text style={styles.fundName} numberOfLines={2}>{f.scheme_name}</Text>
                    <Text style={Typography.caption}>
                      {f.fund_house} · {f.plan} · {f.option}{f.nav != null ? ` · NAV ₹${f.nav}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {picked && (
              <View style={styles.pickedCard}>
                <Text style={styles.pickedName}>{picked.name}</Text>
                <Text style={Typography.caption}>
                  {picked.type === 'Stock' ? `NSE: ${picked.symbol}` : `Scheme ${picked.symbol} · ${picked.type}`}
                  {picked.price != null ? ` · now ₹${picked.price}` : ''}
                </Text>

                <Text style={styles.fieldLabel}>{picked.type === 'Stock' ? 'QUANTITY (SHARES)' : 'UNITS HELD'}</Text>
                <TextInput style={styles.input} value={units} onChangeText={setUnits} keyboardType="decimal-pad"
                  placeholder="0" placeholderTextColor={Colors.textDim} />

                <Text style={styles.fieldLabel}>{picked.type === 'Stock' ? 'AVG BUY PRICE (₹)' : 'AVG NAV (₹)'}</Text>
                <TextInput style={styles.input} value={avg} onChangeText={setAvg} keyboardType="decimal-pad"
                  placeholder="0" placeholderTextColor={Colors.textDim} />

                {picked.type !== 'Stock' && (
                  <>
                    <Text style={styles.fieldLabel}>MONTHLY SIP (₹) — OPTIONAL</Text>
                    <TextInput style={styles.input} value={sip} onChangeText={setSip} keyboardType="decimal-pad"
                      placeholder="0" placeholderTextColor={Colors.textDim} />
                  </>
                )}

                {valid && (
                  <Text style={styles.preview}>
                    Invested ₹{Math.round(unitsN * avgN).toLocaleString('en-IN')}
                    {picked.price != null && ` · Worth ₹${Math.round(unitsN * picked.price).toLocaleString('en-IN')}`}
                  </Text>
                )}

                <TouchableOpacity style={[styles.saveBtn, !valid && { opacity: 0.4 }]} onPress={save} disabled={!valid || saving}>
                  <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Add to portfolio'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl,
    borderWidth: 1, borderColor: Colors.borderMed, padding: Spacing.lg, maxHeight: '88%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  close: { color: Colors.textMuted, fontSize: 18 },

  seg: { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: Radii.md, padding: 3, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  segBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radii.sm },
  segBtnOn: { backgroundColor: 'rgba(0,212,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)' },
  segTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  segTxtOn: { color: Colors.cyan, fontWeight: '700' },

  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14,
  },
  searchBtn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingHorizontal: Spacing.md, justifyContent: 'center', minWidth: 76, alignItems: 'center' },
  searchBtnTxt: { color: Colors.bg, fontWeight: '800', fontSize: 13 },

  error: { color: Colors.gold, fontSize: 12, marginVertical: Spacing.sm, lineHeight: 17 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: Spacing.sm },
  filterBox: { color: Colors.cyan, fontSize: 16 },
  fundRow: { paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fundName: { ...Typography.body, fontWeight: '600', marginBottom: 2 },

  pickedCard: { marginTop: Spacing.sm, backgroundColor: Colors.bg, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  pickedName: { ...Typography.body, fontWeight: '700', marginBottom: 2 },
  fieldLabel: { ...Typography.label, marginTop: Spacing.md, marginBottom: 6 },
  preview: { color: Colors.teal, fontSize: 12, fontWeight: '700', marginTop: Spacing.md },
  saveBtn: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md },
  saveTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
});
