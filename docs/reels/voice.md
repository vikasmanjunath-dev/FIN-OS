# Voice: read-aloud, settings and the route to a recorded voice

Part of the Money Reels guide (`docs/REELS.md`, section 7). Today the voice is the phone's own text-to-speech. Nobody has listened to it on a real phone yet.

## How a reel is spoken

With sound on, a reel is read aloud by the phone's own text-to-speech. It is built to sound like a person telling the story, and to stay exactly in step with the words on screen.

- **Text made speakable** (`lib/reels/voice.ts`, `speechText`): rupees ("₹3.49 crore" is said as "3.49 crore rupees"), percent, Indian digit grouping, ranges, symbols, acronyms ("EMI" is "E M I", and in Hindi "ई एम आई"), and the helpline 1930 digit by digit. The caption on screen does not change.
- **Phrases and breaths**: each caption is cut at sentence ends and colons with pauses that fit the punctuation; questions rise; sentences that carry a figure slow down a little; a few big words are said first as a hook.
- **Mood**: worried is slower and lower, cheering is quicker and brighter, surprised lifts the pitch.
- **Best voice**: `pickVoice` chooses the installed voice for the language, preferring the right country and enhanced or neural quality over compact.
- **Timing**: the scripts were written for silent reading, which is about twice as fast as speech, so with sound on `withVoiceTiming` stretches each scene to what the voice needs (a reel of 23 s becomes about 31 s in English and 34 s in Hindi). The voice starts 180 ms after the caption appears and ends 300 ms before the next scene. The measured speed of the phone's voice is remembered, so later scenes are fitted more exactly, and the clock waits at the end of a scene (at most 1.6 s) until the sentence is really finished.
- **Caption in step** (`components/reels/Caption.tsx`): the word being said is lit, the words already said stay white and the ones to come are dimmer; the caption rises and fades in as its scene starts and fades out as it ends. Progress comes from the voice's own word boundaries, or from a clock on phones that give none.
- **Tests**: `__tests__/reels-voice.test.mts` covers the text rules, pauses, mood, fitting for every scene in both languages, voice choice, word following, motion and the clock hold.
- **Limits**: a phone's built-in voice is not an actor. The quality depends on which voices are installed (on iPhone, Settings > Accessibility > Spoken Content > Voices; on Android, the text-to-speech engine's voice data). Nothing here was heard by a person yet: it needs a listen on a real phone in both languages. A recorded voice from a voice artist is the next step up and would use the same timing.

## Beats and the quiz are read too

With sound on (the speaker button in the reels top bar), the phone's voice now reads more than the scene captions: each beat's question and what it asks you to look at (`askText`), what it reveals (`revealText`: the answer, the red flags and what to do, the paths and the verdict, the correct order, a card's reason), the quiz question with numbered options (`quizText`), and then right or not and why (`quizVerdictText`). Amounts are spoken as rupees ("18 lakh rupees", "18 लाख रुपये") and symbols a voice would spell out are dropped (`speakable`). Text builders are pure in `lib/reels/narration.ts` and tested over every beat in the library in both languages; speaking is `useVoice` in `Poke.tsx` and an effect in `ReelPlayer.tsx`, started after a short pause so the reel's own voice has stopped. Phone text-to-speech is the same voice as before (no recorded voice yet) and was not heard on a real phone.

## Voice settings and the recording brief

- **Reel voice screen** (`/learn/voice`, from Learn, and in search): choose Slower, Normal or Faster; Expressive or Steady; short, normal or long breaths between sentences; and the installed voice for English and for Hindi, listed best first with "enhanced" and "recommended" tags. Tapping a voice plays a sample with the words lighting up in time. If the phone only has standard voices, the screen says how to install an enhanced one on iPhone and on Android. Choices are saved on the phone only (`finos_session_reels_voice`, listed in the privacy registry) and change both how the voice sounds and how long each scene lasts.
- **Replay**: `useVoice` returns `replay()`, which says the current line again.
- **Recording brief for a voice artist** (`docs/voice/recording-brief-en.md` and `-hi.md`, made by `scripts/voice-brief.mts`): every line of the live library (one clip per scene: 936 per language) with the feeling to play, what to say (numbers and acronyms as spoken), and the length it is timed to. A recorded voice is the step above the phone's voice. It is not wired yet: playing clips needs the `expo-audio` module and a manifest of clip lengths and word times, and the clips themselves need a person to record them. The timing, the caption highlight and the voice settings are already built so they can be reused.

## Recorded clips (the clip is the clock)

- `npm run reels:voiceover -- <reel-id>... | --all` records one clip per scene per language with the Mac's own voices (`say`, default Tara for English and Lekha for Hindi) and ffmpeg; no network. It writes `mobile/assets/voice/*.m4a`, `manifest.json`, and the generated `lib/reels/voiceManifest.ts` (lengths and phrase timings) and `voiceAssets.ts` (static requires so Metro bundles the clips). The engine is the one function `speakToWav`, so a studio voice service can replace it.
- With sound on, a scene that has a clip is exactly `lead 180 ms + clip + breath 320 ms` long (`withVoiceTiming(..., clipMs)`, `sceneMsForClip`), the clip plays after the lead (`lib/reels/clipplayer.ts`, expo-audio), and the lit word follows the recording through `clipProgress` (exact at phrase ends). A scene with no clip uses the phone's voice as before. Measured in the web preview: clip 0 of `guess-sip` to clip 1 started 6,313 ms apart against 6,273 ms planned.
- Size: about 21 KB a clip. All 180 live reels are recorded (1,892 clips, English and Hindi, about 45 MB in the bundle; `assets/voice/manifest.json` lists every clip). `guess-sip` was the pilot; listen to a sample of the rest before shipping. The speed setting in Reel voice does not change recorded clips (they are fixed); the phone-voice settings still apply to scenes without clips.
- Needs `expo-audio` (added; a dev-client rebuild is needed on a phone, Expo Go includes it).
