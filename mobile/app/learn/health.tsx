import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, SectionLabel, TrackerScreen } from '@/components/TrackerUI';
import { clearStats, loadStats } from '@/lib/reelsStatsStorage';
import { EMPTY_STATS, HYPOTHESES, healthOf, type Health, type StatsState } from '@/lib/reels/stats';
import { useLang } from '@/lib/i18n';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const num = (v: number | null, d = 0) => (v === null ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toString());

/** Reels health: how the reels are used on this phone, against the starting hypotheses of the blueprint. Counted here, never sent. */
export default function ReelsHealth() {
  const lang = useLang(), hi = lang === 'hi';
  const [state, setState] = useState<StatsState>(EMPTY_STATS);
  useFocusEffect(useCallback(() => { let live = true; loadStats().then(s => { if (live) setState(s); }); return () => { live = false; }; }, []));
  const h: Health = healthOf(state, new Date());

  const rows: { label: string; value: string; target?: { en: string; hi: string }; ok?: boolean }[] = [
    { label: hi ? 'रील वाले दिन (28 में)' : 'Days with a reel (of 28)', value: String(h.activeDays), target: HYPOTHESES.activeDays, ok: HYPOTHESES.activeDays.ok(h.activeDays) },
    { label: hi ? 'पूरी की गई रीलें' : 'Reels finished', value: String(h.finished) },
    { label: hi ? 'पहली बार में सही जवाब' : 'Right first time', value: pct(h.rightRate) },
    { label: hi ? 'इंटरैक्टिव हिस्से में भागीदारी' : 'Played with the interactive part', value: pct(h.pokeRate) },
    { label: hi ? 'हर 100 रीलों पर शुरू किए काम' : 'Moves started per 100 reels', value: num(h.movesPer100), target: HYPOTHESES.movesPer100, ok: h.movesPer100 === null ? undefined : HYPOTHESES.movesPer100.ok(h.movesPer100) },
    { label: hi ? 'नतीजे की रसीदें' : 'Receipts earned', value: String(h.receipts) },
    { label: hi ? '“पता है” / “कम” हर 100 पर' : '“I know this” and “less” per 100 reels', value: num(h.steeringPer100), target: HYPOTHESES.steeringPer100, ok: h.steeringPer100 === null ? undefined : HYPOTHESES.steeringPer100.ok(h.steeringPer100) },
    { label: hi ? 'रोज़ के मिनट (मध्यिका)' : 'Minutes a day (median)', value: num(h.medianMinutes, 1), target: HYPOTHESES.medianMinutes, ok: h.medianMinutes === null ? undefined : HYPOTHESES.medianMinutes.ok(h.medianMinutes) },
    { label: hi ? 'मित्रा से पूछे सवाल' : 'Questions asked of Mitra', value: String(h.asks) },
  ];

  return (
    <TrackerScreen title={hi ? 'रील्स का हाल' : 'Reels health'} subtitle={hi ? 'पिछले 28 दिन। गिनती सिर्फ़ इसी फ़ोन पर रहती है; कोई रील का नाम या रकम नहीं।' : 'The last 28 days. Counted on this phone only, with no reel names or amounts. Targets are starting hypotheses, not goals to chase.'}>
      <Card accent={Colors.teal}>
        {rows.map(r => (
          <View key={r.label} style={s.row} accessible accessibilityLabel={`${r.label}: ${r.value}${r.target ? `. ${hi ? 'लक्ष्य' : 'Target'} ${r.target[lang]}` : ''}`}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={Typography.body}>{r.label}</Text>
              {r.target ? <Text style={Typography.caption}>{`${hi ? 'शुरुआती अनुमान' : 'Starting hypothesis'}: ${r.target[lang]}`}</Text> : null}
            </View>
            <Text style={[s.val, r.ok === true && { color: Colors.teal }, r.ok === false && { color: Colors.gold }]}>{r.value}</Text>
          </View>
        ))}
      </Card>
      <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>{hi ? 'एक अच्छा दिन 3 मिनट से कम का है। अगर कोई बदलाव मिनट बढ़ाए पर काम शुरू करना नहीं, तो वह बदलाव ग़लत है।' : 'A good day is under three minutes. A change that raises minutes but not moves is the wrong change.'}</Text>
      <SectionLabel>{hi ? 'अपनी गिनती' : 'YOUR COUNTS'}</SectionLabel>
      <TouchableOpacity accessibilityRole="button" style={s.del} onPress={() => Alert.alert(hi ? 'गिनती मिटाएँ?' : 'Delete the counts?', hi ? 'यह सिर्फ़ इसी फ़ोन की गिनती मिटाता है।' : 'This only removes the counts on this phone.', [{ text: hi ? 'रद्द' : 'Cancel', style: 'cancel' }, { text: hi ? 'मिटाएँ' : 'Delete', style: 'destructive', onPress: async () => { await clearStats(); setState(EMPTY_STATS); } }])}>
        <Text style={s.delTxt}>{hi ? 'गिनती मिटाएँ' : 'Delete counts'}</Text>
      </TouchableOpacity>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  val: { color: '#fff', fontSize: 20, fontWeight: '900', minWidth: 56, textAlign: 'right' },
  del: { borderWidth: 1, borderColor: Colors.red + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center' },
  delTxt: { color: Colors.red, fontWeight: '800', fontSize: 14 },
});
