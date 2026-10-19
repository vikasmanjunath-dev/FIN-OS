import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Keyboard } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { INDEX, popularEntries, search, type Entry } from '@/lib/search';

const RECENT_KEY = 'finos_search_recent';

export default function SearchScreen() {
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(r => { try { const v = JSON.parse(r ?? '[]'); if (Array.isArray(v)) setRecent(v.filter(x => typeof x === 'string').slice(0, 5)); } catch { /* none */ } });
  }, []);

  const results = useMemo(() => search(q), [q]);
  const recents = useMemo(() => recent.map(r => INDEX.find(x => x.route === r)).filter((x): x is Entry => !!x), [recent]);

  const open = (e: Entry) => {
    Keyboard.dismiss();
    const next = [e.route, ...recent.filter(r => r !== e.route)].slice(0, 5);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
    router.replace(e.route as any);
  };

  const list = q.trim() ? results : [];
  return (
    <View style={s.root}>
      <View style={s.bar}>
        <TextInput style={s.input} value={q} onChangeText={setQ} autoFocus placeholder="Search tools, trackers, calculators…" placeholderTextColor={Colors.textDim}
          accessibilityLabel="Search" autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={() => list[0] && open(list[0])} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close search" onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} hitSlop={12}>
          <Text style={s.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}>
        {q.trim() ? (
          list.length ? list.map(e => <Row key={e.id} e={e} onPress={() => open(e)} />) : <Text style={[Typography.body, { marginTop: Spacing.lg }]}>{`Nothing matches "${q.trim()}". Try a word like "loan", "tax" or "SIP".`}</Text>
        ) : (
          <>
            {recents.length > 0 && (<><Text style={s.label}>RECENT</Text>{recents.map(e => <Row key={'r' + e.id} e={e} onPress={() => open(e)} />)}</>)}
            <Text style={s.label}>POPULAR</Text>
            {popularEntries().map(e => <Row key={'p' + e.id} e={e} onPress={() => open(e)} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ e, onPress }: { e: Entry; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.row} accessibilityRole="button" accessibilityLabel={`${e.title}. ${e.sub}`} onPress={onPress}>
      <Text style={s.icon}>{e.icon}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>{e.title}</Text>
        <Text style={Typography.caption} numberOfLines={1}>{`${e.group} · ${e.sub}`}</Text>
      </View>
      <Text style={s.chev}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, paddingTop: 54 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, paddingTop: Spacing.sm },
  input: { flex: 1, minWidth: 0, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.lg, color: Colors.textPrimary, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  cancel: { color: Colors.cyan, fontWeight: '700', fontSize: 14 },
  label: { ...Typography.label, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  icon: { fontSize: 20, width: 28, textAlign: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  chev: { color: Colors.textMuted, fontSize: 22 },
});
