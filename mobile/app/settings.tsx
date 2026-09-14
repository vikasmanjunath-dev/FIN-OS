import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Switch, Alert, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { ENDPOINTS } from '@/constants/endpoints';

function SettingRow({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen() {
  const [name, setName]           = useState('');
  const [income, setIncome]       = useState('');
  const [netWorth, setNetWorth]   = useState('');
  const [hostIP, setHostIP]       = useState('127.0.0.1');
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving]       = useState(false);

  const loadValues = useCallback(async () => {
    const pairs = await AsyncStorage.multiGet([
      'finos_user_name', 'finos_monthly_income', 'finos_net_worth', 'finos_host_ip',
    ]);
    const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
    setName(m['finos_user_name']);
    setIncome(m['finos_monthly_income']);
    setNetWorth(m['finos_net_worth']);
    setHostIP(m['finos_host_ip'] || '127.0.0.1');
  }, []);

  React.useEffect(() => { loadValues(); }, [loadValues]);

  const save = async () => {
    setSaving(true);
    Haptics.selectionAsync();
    await AsyncStorage.multiSet([
      ['finos_user_name',      name],
      ['finos_monthly_income', income],
      ['finos_net_worth',      netWorth],
      ['finos_host_ip',        hostIP],
    ]);
    setSaving(false);
    Alert.alert('Saved', 'Your settings have been saved.');
  };

  const clearAll = () => {
    Alert.alert('Clear All Data', 'This will remove all locally stored FIN·OS data. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          await AsyncStorage.clear();
          Alert.alert('Done', 'All data cleared.');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* ── Profile ── */}
      <Text style={styles.sectionLabel}>PROFILE</Text>
      <View style={styles.card}>
        <SettingRow
          label="Your Name"
          sub="Used by Arya for personalized greetings"
          right={
            <TextInput
              style={styles.inputSmall}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Vikas"
              placeholderTextColor={Colors.textDim}
            />
          }
        />
        <SettingRow
          label="Monthly Income"
          sub="Helps calculate savings rate and FIRE"
          right={
            <TextInput
              style={styles.inputSmall}
              value={income}
              onChangeText={setIncome}
              placeholder="₹ amount"
              placeholderTextColor={Colors.textDim}
              keyboardType="numeric"
            />
          }
        />
        <SettingRow
          label="Net Worth"
          sub="Total assets minus liabilities"
          right={
            <TextInput
              style={styles.inputSmall}
              value={netWorth}
              onChangeText={setNetWorth}
              placeholder="₹ amount"
              placeholderTextColor={Colors.textDim}
              keyboardType="numeric"
            />
          }
        />
      </View>

      {/* ── Backend ── */}
      <Text style={styles.sectionLabel}>BACKEND CONNECTION</Text>
      <View style={styles.card}>
        <SettingRow
          label="Host IP / ngrok URL"
          sub="Your Mac's LAN IP for physical device, or 127.0.0.1 for simulator"
          right={
            <TextInput
              style={[styles.inputSmall, { width: 140 }]}
              value={hostIP}
              onChangeText={setHostIP}
              placeholder="127.0.0.1"
              placeholderTextColor={Colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
          }
        />
        <View style={styles.endpointList}>
          {Object.entries(ENDPOINTS).map(([key, url]) => (
            <View key={key} style={styles.endpointRow}>
              <Text style={styles.endpointKey}>{key}</Text>
              <Text style={styles.endpointUrl} numberOfLines={1}>{url}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Notifications ── */}
      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <View style={styles.card}>
        <SettingRow
          label="Price Alerts"
          sub="Portfolio and watchlist alerts from Arya"
          right={
            <Switch
              value={notifications}
              onValueChange={v => { Haptics.selectionAsync(); setNotifications(v); }}
              trackColor={{ false: Colors.border, true: Colors.purple + '80' }}
              thumbColor={notifications ? Colors.purple : Colors.textMuted}
            />
          }
        />
      </View>

      {/* ── About ── */}
      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLogo}>⬡</Text>
          <View>
            <Text style={styles.aboutName}>FIN·OS</Text>
            <Text style={styles.aboutSub}>Financial Operating System for India</Text>
            <Text style={styles.aboutVersion}>Mobile v1.0.0 · Web finos1.vercel.app</Text>
          </View>
        </View>
      </View>

      {/* ── Save + Danger Zone ── */}
      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dangerBtn} onPress={clearAll}>
        <Text style={styles.dangerBtnText}>Clear All Local Data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, paddingTop: Spacing.xxl },
  backBtn: { color: Colors.cyan, fontSize: 14, fontWeight: '600' },
  headerTitle: { ...Typography.h3 },

  sectionLabel: { ...Typography.label, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, marginTop: Spacing.md },
  card: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.sm },

  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { ...Typography.body, fontWeight: '600', marginBottom: 2 },
  rowSub: { ...Typography.caption },
  inputSmall: { backgroundColor: Colors.overlay, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6, color: Colors.textPrimary, fontSize: 13, minWidth: 100, textAlign: 'right' },

  endpointList: { padding: Spacing.md, paddingTop: 0, gap: 4 },
  endpointRow: { flexDirection: 'row', gap: Spacing.sm },
  endpointKey: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, width: 70 },
  endpointUrl: { fontSize: 10, color: Colors.textDim, flex: 1 },

  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  aboutLogo: { fontSize: 36, color: Colors.cyan },
  aboutName: { ...Typography.h3 },
  aboutSub: { ...Typography.caption, marginTop: 2 },
  aboutVersion: { ...Typography.caption, color: Colors.textDim, marginTop: 2 },

  saveBtn: { margin: Spacing.lg, backgroundColor: Colors.purple, borderRadius: Radii.lg, padding: Spacing.md + 2, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dangerBtn: { marginHorizontal: Spacing.lg, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: Radii.lg, padding: Spacing.md, alignItems: 'center' },
  dangerBtnText: { color: Colors.red, fontSize: 13, fontWeight: '600' },
});
