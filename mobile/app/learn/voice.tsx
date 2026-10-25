import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card, TrackerScreen } from '@/components/TrackerUI';
import { Caption } from '@/components/reels/Caption';
import { applyVoicePrefs, listVoices, speakScene, stopSpeaking } from '@/lib/reels/speech';
import { DEFAULT_VOICE_PREFS, SPEEDS, type VoicePrefs } from '@/lib/reels/voicePrefs';
import { loadVoicePrefs, saveVoicePrefs } from '@/lib/reels/voicePrefsStorage';
import { plan } from '@/lib/reels/voice';
import { useLang } from '@/lib/i18n';
import type { Mood } from '@/lib/reels/types';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

type Voice = Awaited<ReturnType<typeof listVoices>>[number];
const SAMPLES: { mood: Mood; en: string; hi: string }[] = [
  { mood: 'surprised', en: 'At an assumed 12% a year, ₹5,000 a month grows to about ₹1.75 crore in 30 years.', hi: 'मान लें हर साल 12%, तो महीने के ₹5,000 तीस साल में बढ़कर लगभग ₹1.75 करोड़ हो जाते हैं।' },
  { mood: 'worry', en: 'An unpaid card bill grows fast. Pay in full when you can.', hi: 'न चुकाया कार्ड बिल तेज़ी से बढ़ता है। जब हो सके पूरा चुकाएँ।' },
  { mood: 'cheer', en: 'Start small, keep going, and let time do the work. You have got this!', hi: 'छोटी शुरुआत करें, चलते रहें, और समय को काम करने दें। आप कर सकते हैं!' },
];

/** Voice settings: pick how the reels sound, hear a sample with the words lighting up in time, and see what the phone offers. */
export default function VoiceScreen() {
  const lang = useLang();
  const hi = lang === 'hi';
  const [prefs, setPrefs] = useState<VoicePrefs>({ ...DEFAULT_VOICE_PREFS, voice: {} });
  const [voices, setVoices] = useState<Record<'en' | 'hi', Voice[]>>({ en: [], hi: [] });
  const [sample, setSample] = useState<{ n: number; lang: 'en' | 'hi'; progress: number; started: number } | null>(null);
  useEffect(() => { let live = true; loadVoicePrefs().then(p => { if (live) setPrefs(p); }); Promise.all([listVoices('en'), listVoices('hi')]).then(([en, h]) => { if (live) setVoices({ en, hi: h }); }); return () => { live = false; stopSpeaking(); }; }, []);

  const update = useCallback((next: VoicePrefs) => { setPrefs(next); applyVoicePrefs(next); void saveVoicePrefs(next); }, []);
  const play = useCallback((n: number, l: 'en' | 'hi') => {
    const smp = SAMPLES[n], started = Date.now();
    setSample({ n, lang: l, progress: 0, started });
    speakScene({ text: smp[l], mood: smp.mood, lang: l, budgetMs: 60_000, onProgress: f => setSample(s => (s && s.started === started ? { ...s, progress: f } : s)), onDone: () => setSample(s => (s && s.started === started ? null : s)) });
  }, []);
  const best = (l: 'en' | 'hi') => voices[l][0];
  const noEnhanced = (l: 'en' | 'hi') => voices[l].length > 0 && !voices[l].some(v => v.enhanced);
  const est = useMemo(() => plan({ text: SAMPLES[0][lang], mood: SAMPLES[0].mood, lang, budgetMs: 60_000, speed: prefs.speed, style: prefs.style }).estMs, [lang, prefs.speed, prefs.style]);

  return (
    <TrackerScreen title={hi ? 'रील की आवाज़' : 'Reel voice'} subtitle={hi ? 'रील कैसी सुनाई दे, यह चुनें। आवाज़ आपके फ़ोन की अपनी है।' : 'Choose how the reels sound. The voice is your phone’s own, and works offline.'}>
      <Card accent={Colors.purple}>
        <Text style={Typography.label}>{hi ? 'सुनकर देखें' : 'HEAR IT'}</Text>
        {sample ? (
          <View style={s.sampleBox}><Caption text={SAMPLES[sample.n][sample.lang]} progress={sample.progress} elapsedMs={1000} sceneMs={60_000} style={s.sampleTxt} /></View>
        ) : <Text style={[Typography.caption, { marginVertical: 8 }]}>{hi ? 'नीचे कोई नमूना दबाएँ। बोले जा रहे शब्द रोशन होंगे।' : 'Tap a sample. The word being said lights up.'}</Text>}
        {SAMPLES.map((smp, i) => (
          <View key={i} style={s.row}>
            <TouchableOpacity style={s.play} accessibilityRole="button" accessibilityLabel={`${hi ? 'अंग्रेज़ी नमूना' : 'English sample'} ${i + 1}`} onPress={() => play(i, 'en')}><Text style={s.playTxt}>▶ EN</Text></TouchableOpacity>
            <TouchableOpacity style={s.play} accessibilityRole="button" accessibilityLabel={`${hi ? 'हिंदी नमूना' : 'Hindi sample'} ${i + 1}`} onPress={() => play(i, 'hi')}><Text style={s.playTxt}>▶ हि</Text></TouchableOpacity>
            <Text style={[Typography.caption, { flexGrow: 1, flexShrink: 1, flexBasis: 90 }]}>{smp.mood === 'surprised' ? (hi ? 'आश्चर्य' : 'surprised') : smp.mood === 'worry' ? (hi ? 'चिंता' : 'worried') : (hi ? 'उत्साह' : 'cheering')}</Text>
          </View>
        ))}
        <TouchableOpacity style={s.stop} accessibilityRole="button" onPress={() => { stopSpeaking(); setSample(null); }}><Text style={s.stopTxt}>{hi ? 'रोकें' : 'Stop'}</Text></TouchableOpacity>
      </Card>

      <Card>
        <Text style={Typography.label}>{hi ? 'गति' : 'SPEED'}</Text>
        <View style={s.chips}>{SPEEDS.map(sp => <TouchableOpacity key={sp.value} accessibilityRole="button" accessibilityState={{ selected: prefs.speed === sp.value }} style={[s.chip, prefs.speed === sp.value && s.chipOn]} onPress={() => update({ ...prefs, speed: sp.value })}><Text style={[s.chipTxt, prefs.speed === sp.value && s.chipTxtOn]}>{hi ? sp.hi : sp.label}</Text></TouchableOpacity>)}</View>
        <Text style={[Typography.caption, { marginTop: 6 }]}>{hi ? `पहला नमूना इस गति पर लगभग ${Math.round(est / 1000)} सेकंड का है। रील की हर सीन आवाज़ के हिसाब से लंबी होती है।` : `The first sample takes about ${Math.round(est / 1000)} seconds at this speed. Each scene lasts as long as the voice needs.`}</Text>
        <Text style={[Typography.label, { marginTop: Spacing.md }]}>{hi ? 'अंदाज़' : 'STYLE'}</Text>
        <View style={s.chips}>
          {(['expressive', 'steady'] as const).map(st => <TouchableOpacity key={st} accessibilityRole="button" accessibilityState={{ selected: prefs.style === st }} style={[s.chip, prefs.style === st && s.chipOn]} onPress={() => update({ ...prefs, style: st })}><Text style={[s.chipTxt, prefs.style === st && s.chipTxtOn]}>{st === 'expressive' ? (hi ? 'भावपूर्ण' : 'Expressive') : (hi ? 'सधी हुई' : 'Steady')}</Text></TouchableOpacity>)}
        </View>
        <Text style={[Typography.label, { marginTop: Spacing.md }]}>{hi ? 'ठहराव' : 'BREATHS BETWEEN SENTENCES'}</Text>
        <View style={s.chips}>
          {(['short', 'normal', 'long'] as const).map(pz => <TouchableOpacity key={pz} accessibilityRole="button" accessibilityState={{ selected: prefs.pauses === pz }} style={[s.chip, prefs.pauses === pz && s.chipOn]} onPress={() => update({ ...prefs, pauses: pz })}><Text style={[s.chipTxt, prefs.pauses === pz && s.chipTxtOn]}>{pz === 'short' ? (hi ? 'छोटे' : 'Short') : pz === 'normal' ? (hi ? 'सामान्य' : 'Normal') : (hi ? 'लंबे' : 'Long')}</Text></TouchableOpacity>)}
        </View>
      </Card>

      {(['en', 'hi'] as const).map(l => (
        <Card key={l}>
          <Text style={Typography.label}>{l === 'en' ? (hi ? 'अंग्रेज़ी आवाज़' : 'ENGLISH VOICE') : (hi ? 'हिंदी आवाज़' : 'HINDI VOICE')}</Text>
          {voices[l].length === 0 ? <Text style={[Typography.caption, { marginVertical: 6 }]}>{hi ? 'इस भाषा की कोई आवाज़ नहीं मिली। फ़ोन की डिफ़ॉल्ट आवाज़ इस्तेमाल होगी।' : 'No voice for this language was found, so the phone’s default will be used.'}</Text> : null}
          {voices[l].slice(0, 8).map(v => {
            const on = (prefs.voice[l] ?? best(l)?.identifier) === v.identifier;
            return (
              <TouchableOpacity key={v.identifier} style={[s.voice, on && s.voiceOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${v.name}, ${v.enhanced ? (hi ? 'बेहतर गुणवत्ता' : 'enhanced') : (hi ? 'मानक' : 'standard')}${v.recommended ? (hi ? ', सुझाई गई' : ', recommended') : ''}`}
                onPress={() => { update({ ...prefs, voice: { ...prefs.voice, [l]: v.identifier } }); play(0, l); }}>
                <View style={{ flex: 1 }}><Text style={s.voiceName}>{v.name}</Text><Text style={Typography.caption}>{`${v.language}${v.enhanced ? (hi ? ' · बेहतर गुणवत्ता' : ' · enhanced') : ''}${v.recommended ? (hi ? ' · सुझाई गई' : ' · recommended') : ''}`}</Text></View>
                <Text style={s.tick}>{on ? '✓' : ''}</Text>
              </TouchableOpacity>
            );
          })}
          {noEnhanced(l) ? (
            <Text style={[Typography.caption, { marginTop: 8, lineHeight: 17 }]}>{hi
              ? 'आपके फ़ोन में सिर्फ़ मानक आवाज़ें हैं। ज़्यादा स्वाभाविक आवाज़ के लिए: iPhone पर सेटिंग्स > एक्सेसिबिलिटी > स्पोकन कंटेंट > वॉयस > भाषा चुनकर Enhanced या Premium आवाज़ डाउनलोड करें। Android पर सेटिंग्स > सिस्टम > भाषाएँ > टेक्स्ट-टू-स्पीच आउटपुट में आवाज़ का डेटा इंस्टॉल करें।'
              : 'Your phone has only standard voices here. For a more natural one: on iPhone, Settings > Accessibility > Spoken Content > Voices > pick the language and download an Enhanced or Premium voice. On Android, Settings > System > Languages > Text-to-speech output, then install the voice data.'}</Text>
          ) : null}
        </Card>
      ))}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  sampleBox: { minHeight: 90, justifyContent: 'center', marginVertical: 8 },
  sampleTxt: { color: '#fff', fontSize: 18, lineHeight: 26, fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  play: { minHeight: 44, minWidth: 64, borderRadius: Radii.md, backgroundColor: Colors.purple, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  playTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stop: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  stopTxt: { color: Colors.textMuted, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: Colors.borderMed, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  chipTxt: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  chipTxtOn: { color: Colors.bg },
  voice: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.borderMed, marginTop: 8 },
  voiceOn: { borderColor: Colors.teal, backgroundColor: 'rgba(34,211,166,0.08)' },
  voiceName: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  tick: { color: Colors.teal, fontWeight: '900', fontSize: 18, width: 24, textAlign: 'center' },
});
