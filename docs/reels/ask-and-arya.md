# Ask Mitra and the Arya bridge

Part of the Money Reels guide (`docs/REELS.md`, section 9). Arya is the app's assistant. Both directions are decided on the phone and carry no personal data in any route.

## Ask Mitra

A "Ask Mitra" button under every reel opens `AskSheet`. `lib/reels/ask.ts` understands a what-if on the reel's own example ("what if the rate is 10%?", "and for 20 years?", "what if I put in 1 lakh") by merging the named parts into the reel's amount, rate and years and running Arya's phone calculators (`runDeviceTool`), or any other phone tool in `ALLOWED` (the calculators, savings rate, emergency fund, debt, Money Score, goal SIP, tax dates and 80C, tax estimate). It refuses to say what to buy or sell, never goes online (no price, market, crypto or news tools) and never writes (no memory or open-screen tools). A reel rebuilt from the person's own figures uses them as the base. Answers carry their source and time; the tool text is English even in Hindi (the wrapper sentences are bilingual).

## Arya bridge (both directions)

Arya (the assistant) and the reels now point at each other. Everything is decided on the phone: no network call, nothing about the person in any route, education not advice. The logic is `mobile/lib/reels/aryaLink.ts` (pure, tested in `mobile/__tests__/reels-aryalink.test.mts`).

**Arya to a reel.** Under a finished Arya answer, `components/reels/AryaReelChip.tsx` asks `reelFor(question, signals, profile, { watched, answer })` and, when a reel clearly explains the question, shows one chip, "Watch a 30-second reel on this" (Hindi: "इस पर 30 सेकंड की रील देखें"), that opens `/learn/reels?id=<reel-id>`. `components/AryaBubble.tsx` gets the question from the screen (`app/(tabs)/arya.tsx` passes the user message just before the answer). How `reelFor` chooses:

- A hand-written table of ideas (about 120 patterns in English, Hinglish and Hindi) maps words to tiers of reels, most specific first. The first matching idea decides. Of the reels in a tier it prefers a playable one (guess, slider...), then one made timely by the person's triggers, then one that fits their weakest Money Score pillar.
- It skips a reel the person watched or marked known. When none is left it returns nothing.
- Under money strain it never returns a reel whose message is "put in more" (`growth` in `meta.ts`). A scam reel (topic `safety`) comes only for a question about being cheated.
- It is silent (null) for: text the guardrails block or flag (tax evasion, forged documents); a reply the guardrails flag, or Arya's refusal text; a buy/sell/hold or "should I" question; a named stock, fund, company or product; a question about the person's own figures or a calculator with numbers (Arya's phone tools answer those); a "this or that" question about two different ideas; and anything the table does not know. Precision over recall: no chip is better than a wrong chip.
- Input can be a sentence, `{ topic }` (one of the nine topics, anything else gives nothing) or `{ intent, text }`.

**A reel to Arya.** The Ask Mitra sheet (`components/reels/AskSheet.tsx`) has an "Ask Arya more" row that opens `/(tabs)/arya?reel=<reel-id>`. What is passed, exactly:

| Parameter | Value | When |
|---|---|---|
| `reel` | the id of a library reel (`[a-z0-9-]`, at most 40 characters, must exist) | always |
| `mine` | `1` | only when the reel is one of `MINE_REELS` (`start-early`, `guess-sip`, `emi-trap`, `guess-emi`), was built from the person's own figures, the person has those figures, and they tapped the separate "Ask Arya with my numbers" button |

No amount, rate, name or text is ever a route parameter. The Arya screen runs `parseAryaParams` on what it receives (unknown or malformed ids, arrays, a `mine` on any other reel: dropped), works out the topic and the reel's own EXAMPLE figures from the reel id (`contextBase` in `ask.ts`), writes a question into the message box, and clears the parameters. The person edits it and sends it. With `mine=1` the screen reads the person's figures from this phone (`loadMine`) and says so. The prefilled text is for example "I watched the reel “Guess first: ₹5,000 a month”. Example: SIP of ₹5,000 a month at 12% for 30 years. Can you explain it more?", and the example sentence is one Arya's SIP, EMI and inflation calculators read back to the same figures (tested).

**Tests.** 18 tests: 78 questions in a table (English and Hindi) with the expected reel or null, precision across the table, strain, unknown topic, watched/known, determinism, guardrail and product guards, route parameters, parameter validation, prefill figures, labels in both languages.

**Not verified.** The Hindi text is a draft for a native reviewer. The word table is hand-written and will miss questions phrased in ways it does not know (that is the intended failure: no chip). Hinglish coverage is thin. The chip on a real device and screen-reader behaviour have not been checked.
