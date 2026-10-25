import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { announce } from '@/components/reels/announce';
import { getPermission, requestPermission } from '@/lib/remindersNative';
import { loadMoveReminders, loadNotify, loadNudge, saveNotify, saveNudge, syncReelReminders, turnAllReelNoticesOff } from '@/lib/reelRemindersStorage';
import { DEFAULT_NOTIFY, DEFAULT_NUDGE, NUDGE_HOURS, followupsOn, type NotifyPrefs, type NudgePrefs, type WhenOption } from '@/lib/reels/reminders';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

export type WhenStatus = null | 'denied' | 'unsupported' | { done: string };

const hourLabel = (h: number, lang: Lang) => (lang === 'hi' ? `${h > 12 ? h - 12 : h} ${h >= 12 ? 'शाम/दोपहर' : 'सुबह'}`.replace('शाम/दोपहर', h < 17 ? 'दोपहर' : 'शाम') : `${h > 12 ? h - 12 : h} ${h >= 12 ? 'pm' : 'am'}`);

/** "When will you do it?": a handful of moments, one tap, one reminder. Asking when, not whether. */
export function WhenSheet({ lang, visible, options, status, onPick, onClose }: { lang: Lang; visible: boolean; options: WhenOption[]; status: WhenStatus; onPick: (o: WhenOption) => void; onClose: () => void }) {
  const hi = lang === 'hi';
  useEffect(() => { if (status === 'denied') announce(hi ? 'फ़ोन की सेटिंग में नोटिफ़िकेशन बंद हैं।' : 'Notifications are off in your phone settings.'); else if (status === 'unsupported') announce(hi ? 'रिमाइंडर फ़ोन ऐप में चलते हैं।' : 'Reminders work in the phone app.'); else if (status && typeof status === 'object') announce((hi ? 'ठीक है। याद दिलाएँगे: ' : 'Done. We will remind you: ') + status.done); }, [status, hi]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.back}>
        <View style={s.card} accessibilityViewIsModal>
          <Text style={s.title} accessibilityRole="header">{hi ? 'यह आप कब करेंगे?' : 'When will you do it?'}</Text>
          <Text style={s.sub}>{hi ? 'एक समय चुनें। हम उसी वक़्त एक बार याद दिलाएँगे। रकम या ब्योरा लॉक स्क्रीन पर नहीं दिखेगा।' : 'Pick a moment. We will remind you once, then. No amount or detail shows on your lock screen.'}</Text>
          {status && typeof status === 'object' ? (
            <Text style={s.done} accessibilityLiveRegion="polite">{(hi ? 'ठीक है। याद दिलाएँगे: ' : 'Done. We will remind you: ') + status.done}</Text>
          ) : (
            <>
              {options.map(o => <TouchableOpacity key={o.id} accessibilityRole="button" style={s.opt} onPress={() => onPick(o)}><Text style={s.optTxt}>{o.label[lang]}</Text></TouchableOpacity>)}
              {status === 'denied' ? <Text style={s.warn} accessibilityLiveRegion="polite">{hi ? 'फ़ोन की सेटिंग में इस ऐप के लिए नोटिफ़िकेशन बंद हैं। उन्हें चालू करके फिर चुनें।' : 'Notifications are off for this app in your phone settings. Turn them on, then pick a time.'}</Text> : null}
              {status === 'unsupported' ? <Text style={s.warn} accessibilityLiveRegion="polite">{hi ? 'रिमाइंडर फ़ोन ऐप में चलते हैं, ब्राउज़र प्रीव्यू में नहीं।' : 'Reminders work in the phone app, not in the browser preview.'}</Text> : null}
            </>
          )}
          <TouchableOpacity accessibilityRole="button" style={s.close} onPress={onClose}><Text style={s.closeTxt}>{status && typeof status === 'object' ? (hi ? 'ठीक है' : 'Done') : (hi ? 'अभी नहीं' : 'Not now')}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** The reminders from the reels, in one place: the daily nudge, follow-ups on things the person said they would do, the Sunday look-back, and "turn all off". */
export function NudgeSheet({ lang, visible, onClose }: { lang: Lang; visible: boolean; onClose: () => void }) {
  const hi = lang === 'hi';
  const [prefs, setPrefs] = useState<NudgePrefs>({ ...DEFAULT_NUDGE });
  const [notify, setNotify] = useState<NotifyPrefs>({ ...DEFAULT_NOTIFY, fu: {} });
  const [haveMoves, setHaveMoves] = useState(false);
  const [msg, setMsg] = useState<null | 'denied' | 'unsupported' | 'off'>(null);
  const reload = useCallback(() => { loadNudge().then(setPrefs).catch(() => {}); loadNotify().then(setNotify).catch(() => {}); loadMoveReminders().then(m => setHaveMoves(m.length > 0)).catch(() => {}); }, []);
  useEffect(() => { if (visible) { setMsg(null); reload(); } }, [visible, reload]);
  useEffect(() => {
    if (msg === 'denied') announce(hi ? 'फ़ोन की सेटिंग में नोटिफ़िकेशन बंद हैं।' : 'Notifications are off in your phone settings.');
    else if (msg === 'unsupported') announce(hi ? 'रिमाइंडर फ़ोन ऐप में चलते हैं।' : 'Reminders work in the phone app.');
    else if (msg === 'off') announce(hi ? 'सारे रिमाइंडर बंद कर दिए।' : 'All reminders are off.');
  }, [msg, hi]);

  /** True when notifications may be sent; asks the phone once. Otherwise says why not. */
  const allowed = useCallback(async (): Promise<boolean> => {
    let p = await getPermission();
    if (p === 'undetermined') p = await requestPermission();
    if (p !== 'granted') { setMsg(p === 'unsupported' ? 'unsupported' : 'denied'); return false; }
    return true;
  }, []);

  const apply = useCallback(async (next: NudgePrefs) => {
    setMsg(null);
    if (next.enabled && !(await allowed())) next = { ...next, enabled: false };
    setPrefs(next); await saveNudge(next); await syncReelReminders().catch(() => {});
    loadNotify().then(setNotify).catch(() => {});
  }, [allowed]);

  const applyNotify = useCallback(async (next: NotifyPrefs) => {
    setMsg(null);
    const turningOn = (next.followups === true && next.followups !== notify.followups) || (next.weekly && !notify.weekly);
    if (turningOn && !(await allowed())) return;
    // Only the two switches are the sheet's to change; `armed` and the follow-up record `fu` are the planner's, so they are read fresh and never written back from this sheet's older copy.
    const fresh = await loadNotify().catch(() => notify);
    const merged: NotifyPrefs = { ...fresh, followups: next.followups, weekly: next.weekly };
    setNotify(merged); await saveNotify(merged); await syncReelReminders().catch(() => {});
  }, [allowed, notify]);

  const allOff = useCallback(async () => {
    await turnAllReelNoticesOff().catch(() => {});
    reload(); setMsg('off');
  }, [reload]);

  const followOn = followupsOn(notify, prefs, haveMoves ? [1] : []);
  const anyOn = prefs.enabled || followOn || notify.weekly || haveMoves;
  const fuLabel = hi ? 'जो काम मैंने करने को कहा था, उन पर फ़ॉलो-अप' : 'Follow-ups on things I said I would do';
  const weekLabel = hi ? 'रविवार की झलक' : 'Sunday look-back';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.back}>
        <View style={s.card} accessibilityViewIsModal>
          <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
            <Text style={s.title} accessibilityRole="header">{hi ? 'रिमाइंडर' : 'Reminders'}</Text>
            <Text style={s.sub}>{hi ? 'दिन में एक से ज़्यादा नहीं, सुबह 8 से रात 9 के बीच ही, और जिस दिन आप रील देख चुके हों उस दिन चुप। लॉक स्क्रीन पर कोई रकम या आँकड़ा नहीं।' : 'Never more than one a day, only between 8 am and 9 pm, and quiet on a day you have already done a reel. No amount or figure on your lock screen.'}</Text>
            <View style={s.switchRow}>
              <Text style={[s.optTxt, s.rowTxt]}>{hi ? 'रोज़ याद दिलाएँ' : 'Remind me daily'}</Text>
              <Switch value={prefs.enabled} onValueChange={v => apply({ ...prefs, enabled: v })} accessibilityLabel={hi ? 'रोज़ का रिमाइंडर' : 'Daily reminder'} />
            </View>
            {prefs.enabled ? (
              <View style={s.hours}>
                {NUDGE_HOURS.map(h => <TouchableOpacity key={h} accessibilityRole="button" accessibilityLabel={(hi ? 'रिमाइंडर का समय ' : 'Reminder time ') + hourLabel(h, lang)} accessibilityState={{ selected: prefs.hour === h }} style={[s.hour, prefs.hour === h && s.hourOn]} onPress={() => apply({ ...prefs, hour: h })}><Text style={[s.hourTxt, prefs.hour === h && s.hourTxtOn]}>{hourLabel(h, lang)}</Text></TouchableOpacity>)}
              </View>
            ) : null}
            <View style={s.switchRow}>
              <Text style={[s.optTxt, s.rowTxt]}>{fuLabel}</Text>
              <Switch value={followOn} onValueChange={v => applyNotify({ ...notify, followups: v })} accessibilityLabel={fuLabel} accessibilityHint={hi ? 'हर काम पर सिर्फ़ एक छोटा सवाल, तीसरे दिन' : 'One short question about each, on the third day'} />
            </View>
            <Text style={s.hint}>{hi ? 'हर काम पर बस एक बार, तीसरे दिन, एक छोटे सवाल के साथ। काम शुरू होते ही बंद।' : 'Once for each, on day 3, as a short question. It stops when you start it.'}</Text>
            <View style={s.switchRow}>
              <Text style={[s.optTxt, s.rowTxt]}>{weekLabel}</Text>
              <Switch value={notify.weekly} onValueChange={v => applyNotify({ ...notify, weekly: v })} accessibilityLabel={weekLabel} accessibilityHint={hi ? 'रविवार शाम, सिर्फ़ उस हफ़्ते जब आपने रीलें देखी हों' : 'Sunday evening, only in a week you did reels'} />
            </View>
            <Text style={s.hint}>{hi ? 'रविवार शाम एक शांत नज़र। जिस हफ़्ते रीलें नहीं देखीं, उसमें कुछ नहीं।' : 'A quiet look back on Sunday evening. Nothing in a week without reels.'}</Text>
            {msg === 'denied' ? <Text style={s.warn} accessibilityLiveRegion="polite">{hi ? 'फ़ोन की सेटिंग में इस ऐप के लिए नोटिफ़िकेशन बंद हैं। उन्हें चालू करके फिर कोशिश करें।' : 'Notifications are off for this app in your phone settings. Turn them on, then try again.'}</Text> : null}
            {msg === 'unsupported' ? <Text style={s.warn} accessibilityLiveRegion="polite">{hi ? 'रिमाइंडर फ़ोन ऐप में चलते हैं, ब्राउज़र प्रीव्यू में नहीं।' : 'Reminders work in the phone app, not in the browser preview.'}</Text> : null}
            {msg === 'off' ? <Text style={s.done} accessibilityLiveRegion="polite">{hi ? 'सारे रिमाइंडर बंद हैं।' : 'All reminders are off.'}</Text> : null}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={hi ? 'सारे रिमाइंडर बंद करें' : 'Turn all reminders off'} accessibilityHint={hi ? 'रोज़ का, फ़ॉलो-अप, रविवार की झलक और रील के बाद लगाए सारे रिमाइंडर बंद होंगे' : 'Turns off the daily one, follow-ups, the Sunday look-back and any reminder you set after a reel'} accessibilityState={{ disabled: !anyOn }} disabled={!anyOn} style={[s.offRow, !anyOn && s.offRowDim]} onPress={allOff}>
              <Text style={s.offTxt}>{hi ? 'सारे रिमाइंडर बंद करें' : 'Turn all reminders off'}</Text>
            </TouchableOpacity>
            <Text style={s.fine}>{hi ? 'कोई दोष-भावना वाला संदेश नहीं, रात को कभी नहीं। कभी भी बंद करें।' : 'Never a guilt message, never at night. Turn it off any time.'}</Text>
          </ScrollView>
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
  scroll: { maxHeight: 520 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, gap: Spacing.sm },
  rowTxt: { flex: 1 },
  hint: { color: Colors.textDim, fontSize: 12, lineHeight: 17, marginBottom: Spacing.xs },
  offRow: { minHeight: 48, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  offRowDim: { opacity: 0.45 },
  offTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  hour: { minHeight: 44, minWidth: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.09)' },
  hourOn: { backgroundColor: '#fff' },
  hourTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hourTxtOn: { color: '#070A1A' },
  fine: { color: Colors.textDim, fontSize: 12, marginTop: Spacing.md },
  close: { minHeight: 48, borderRadius: Radii.lg, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  closeTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
});
