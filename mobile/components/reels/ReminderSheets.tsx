import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { getPermission, requestPermission } from '@/lib/remindersNative';
import { loadNudge, saveNudge, syncReelReminders } from '@/lib/reelRemindersStorage';
import { DEFAULT_NUDGE, NUDGE_HOURS, type NudgePrefs, type WhenOption } from '@/lib/reels/reminders';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

export type WhenStatus = null | 'denied' | 'unsupported' | { done: string };

const hourLabel = (h: number, lang: Lang) => (lang === 'hi' ? `${h > 12 ? h - 12 : h} ${h >= 12 ? 'शाम/दोपहर' : 'सुबह'}`.replace('शाम/दोपहर', h < 17 ? 'दोपहर' : 'शाम') : `${h > 12 ? h - 12 : h} ${h >= 12 ? 'pm' : 'am'}`);

/** "When will you do it?": a handful of moments, one tap, one reminder. Asking when, not whether. */
export function WhenSheet({ lang, visible, options, status, onPick, onClose }: { lang: Lang; visible: boolean; options: WhenOption[]; status: WhenStatus; onPick: (o: WhenOption) => void; onClose: () => void }) {
  const hi = lang === 'hi';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.back}>
        <View style={s.card} accessibilityViewIsModal>
          <Text style={s.title}>{hi ? 'यह आप कब करेंगे?' : 'When will you do it?'}</Text>
          <Text style={s.sub}>{hi ? 'एक समय चुनें। हम उसी वक़्त एक बार याद दिलाएँगे। रकम या ब्योरा लॉक स्क्रीन पर नहीं दिखेगा।' : 'Pick a moment. We will remind you once, then. No amount or detail shows on your lock screen.'}</Text>
          {status && typeof status === 'object' ? (
            <Text style={s.done} accessibilityLiveRegion="polite">{(hi ? 'ठीक है। याद दिलाएँगे: ' : 'Done. We will remind you: ') + status.done}</Text>
          ) : (
            <>
              {options.map(o => <TouchableOpacity key={o.id} accessibilityRole="button" style={s.opt} onPress={() => onPick(o)}><Text style={s.optTxt}>{o.label[lang]}</Text></TouchableOpacity>)}
              {status === 'denied' ? <Text style={s.warn}>{hi ? 'फ़ोन की सेटिंग में इस ऐप के लिए नोटिफ़िकेशन बंद हैं। उन्हें चालू करके फिर चुनें।' : 'Notifications are off for this app in your phone settings. Turn them on, then pick a time.'}</Text> : null}
              {status === 'unsupported' ? <Text style={s.warn}>{hi ? 'रिमाइंडर फ़ोन ऐप में चलते हैं, ब्राउज़र प्रीव्यू में नहीं।' : 'Reminders work in the phone app, not in the browser preview.'}</Text> : null}
            </>
          )}
          <TouchableOpacity accessibilityRole="button" style={s.close} onPress={onClose}><Text style={s.closeTxt}>{status && typeof status === 'object' ? (hi ? 'ठीक है' : 'Done') : (hi ? 'अभी नहीं' : 'Not now')}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** The daily nudge: off until the person turns it on, at an hour they pick, one a day, silent on a day they have already done a reel. */
export function NudgeSheet({ lang, visible, onClose }: { lang: Lang; visible: boolean; onClose: () => void }) {
  const hi = lang === 'hi';
  const [prefs, setPrefs] = useState<NudgePrefs>({ ...DEFAULT_NUDGE });
  const [msg, setMsg] = useState<null | 'denied' | 'unsupported'>(null);
  useEffect(() => { if (visible) { setMsg(null); loadNudge().then(setPrefs).catch(() => {}); } }, [visible]);

  const apply = useCallback(async (next: NudgePrefs) => {
    setMsg(null);
    if (next.enabled) {
      let p = await getPermission();
      if (p === 'undetermined') p = await requestPermission();
      if (p !== 'granted') { setMsg(p === 'unsupported' ? 'unsupported' : 'denied'); next = { ...next, enabled: false }; }
    }
    setPrefs(next); await saveNudge(next); await syncReelReminders().catch(() => {});
  }, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.back}>
        <View style={s.card} accessibilityViewIsModal>
          <Text style={s.title}>{hi ? 'रोज़ का रिमाइंडर' : 'Daily reminder'}</Text>
          <Text style={s.sub}>{hi ? 'दिन में एक बार, आपके चुने वक़्त पर, एक छोटे पाठ का नाम। जिस दिन आप रील देख चुके हों, उस दिन नहीं।' : 'Once a day, at the hour you pick, naming one short lesson. Not on a day you have already done a reel.'}</Text>
          <View style={s.switchRow}>
            <Text style={s.optTxt}>{hi ? 'रोज़ याद दिलाएँ' : 'Remind me daily'}</Text>
            <Switch value={prefs.enabled} onValueChange={v => apply({ ...prefs, enabled: v })} accessibilityLabel={hi ? 'रोज़ का रिमाइंडर' : 'Daily reminder'} />
          </View>
          {prefs.enabled ? (
            <View style={s.hours}>
              {NUDGE_HOURS.map(h => <TouchableOpacity key={h} accessibilityRole="button" accessibilityState={{ selected: prefs.hour === h }} style={[s.hour, prefs.hour === h && s.hourOn]} onPress={() => apply({ ...prefs, hour: h })}><Text style={[s.hourTxt, prefs.hour === h && s.hourTxtOn]}>{hourLabel(h, lang)}</Text></TouchableOpacity>)}
            </View>
          ) : null}
          {msg === 'denied' ? <Text style={s.warn}>{hi ? 'फ़ोन की सेटिंग में इस ऐप के लिए नोटिफ़िकेशन बंद हैं। उन्हें चालू करके फिर कोशिश करें।' : 'Notifications are off for this app in your phone settings. Turn them on, then try again.'}</Text> : null}
          {msg === 'unsupported' ? <Text style={s.warn}>{hi ? 'रिमाइंडर फ़ोन ऐप में चलते हैं, ब्राउज़र प्रीव्यू में नहीं।' : 'Reminders work in the phone app, not in the browser preview.'}</Text> : null}
          <Text style={s.fine}>{hi ? 'कोई दोष-भावना वाला संदेश नहीं, रात को कभी नहीं। कभी भी बंद करें।' : 'Never a guilt message, never at night. Turn it off any time.'}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.close} onPress={onClose}><Text style={s.closeTxt}>{hi ? 'ठीक है' : 'Done'}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { backgroundColor: '#0F1530', borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, padding: Spacing.lg, paddingBottom: Spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  title: { color: '#fff', fontSize: 20, fontWeight: '900' },
  sub: { color: '#D8DEEC', fontSize: 14, lineHeight: 20, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  opt: { minHeight: 52, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.05)', marginTop: Spacing.sm },
  optTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  done: { color: Colors.teal, fontSize: 16, fontWeight: '800', marginTop: Spacing.md },
  warn: { color: '#FBBF24', fontSize: 13, lineHeight: 19, marginTop: Spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  hour: { minHeight: 44, minWidth: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.09)' },
  hourOn: { backgroundColor: '#fff' },
  hourTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hourTxtOn: { color: '#070A1A' },
  fine: { color: Colors.textDim, fontSize: 12, marginTop: Spacing.md },
  close: { minHeight: 48, borderRadius: Radii.lg, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  closeTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
});
