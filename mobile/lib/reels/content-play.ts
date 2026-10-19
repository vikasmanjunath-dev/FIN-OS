// Playable reels: each pauses once in the middle and asks the viewer to do something (guess, drag, or call a statement a myth or a fact).
// They live in their own file so the main library files stay as they are; lib/reels/library.ts joins them. All figures come from figures.ts.
// Hindi here is written for Hindi readers but still needs a native-speaker review before a public release.
import { niceRound } from '@/lib/reels/beats';
import { emi, fill, inflatedValue, money, monthsToDeplete, sipFutureValue } from '@/lib/reels/figures';
import { lumpSumFuture, prepaySaving } from '@/lib/reels/figures-play';
import { sc, t } from '@/lib/reels/kit';
import type { CastId, L, Reel, Scene } from '@/lib/reels/types';

const withWho = (who: CastId, scene: Scene): Scene => ({ ...scene, who });
const pct = (n: number): L => ({ en: `${Math.round(n)}%`, hi: `${Math.round(n)}%` });

// ── 1. Guess first: what a small SIP becomes ─────────────────────────────────────────────────────────────────────
const G_RATE = 12, G_YEARS = 30;
const niceBand = (answer: number): { min: number; max: number } => ({ min: Math.max(1000, niceRound(answer / 12)), max: niceRound(answer * 12) });

/** `sip` is the monthly amount: ₹5,000 in the library, or the person's own from lib/reels/personal-play.ts (then `mine` is true). */
export function buildGuessSip(sip = 5000, mine = false): Reel {
  const fv = sipFutureValue(sip, G_RATE, G_YEARS), put = sip * 12 * G_YEARS, share = ((fv - put) / fv) * 100;
  const band = mine ? niceBand(fv) : { min: 500_000, max: 100_000_000 };
  const m = money(sip);
  return {
    id: 'guess-sip', topic: 'invest', lesson: 'insight-sip', tags: ['SIP', 'compounding', 'guess'], ...(mine ? { mine: true } : {}),
    title: t(`Guess first: ${m.en} a month`, `पहले अंदाज़ा लगाइए: ${m.hi} हर महीने`),
    scenes: [
      sc('surprised', mine ? fill(t('You already put aside {s} a month. Where does that lead?', 'आप पहले से हर महीने {s} अलग रखते हैं। यह कहाँ पहुँचता है?'), { s: m }) : t('Put aside just ₹5,000 every month. Not a big amount.', 'हर महीने सिर्फ़ ₹5,000 अलग रखें। कोई बड़ी रकम नहीं।'),
        { big: t(`${m.en} a month`, `${m.hi} हर महीने`), prop: { kind: 'coins', count: 5 } }),
      sc('think', fill(t('Keep going for {y} years, with growth at an assumed {r}% a year.', '{y} साल तक जारी रखें, हर साल अनुमानित {r}% बढ़त के साथ।'), { y: G_YEARS, r: G_RATE }),
        { prop: { kind: 'steps', items: [fill(t('{s} every month', 'हर महीने {s}'), { s: m }), fill(t('{y} years', '{y} साल'), { y: G_YEARS }), fill(t('{r}% a year, assumed', '{r}% सालाना, अनुमान'), { r: G_RATE })] } }),
      sc('surprised', fill(t('You put in {p}. It grows to about {f}.', 'आप {p} लगाते हैं। यह बढ़कर लगभग {f} हो जाता है।'), { p: money(put), f: money(fv) }),
        { prop: { kind: 'bars', items: [{ label: t('You put in', 'आपने लगाया'), value: put, text: money(put), tone: 'gold' }, { label: t('It becomes', 'बनता है'), value: fv, text: money(fv), tone: 'teal' }] } }),
      sc('think', fill(t('About {s} of the final amount is growth, not your own deposits.', 'अंतिम रकम का लगभग {s} हिस्सा बढ़त है, आपकी जमा रकम नहीं।'), { s: pct(share) }),
        { prop: { kind: 'donut', parts: [{ value: put, label: t('Your deposits', 'आपकी जमा'), tone: 'gold' }, { value: fv - put, label: t('Growth', 'बढ़त'), tone: 'teal' }], centre: fill(t('{s} growth', '{s} बढ़त'), { s: pct(share) }) } }),
      sc('worry', fill(t('{r}% is an assumption, not a promise. Real returns go up and down.', '{r}% सिर्फ़ अनुमान है, वादा नहीं। असली रिटर्न ऊपर-नीचे होते रहते हैं।'), { r: G_RATE }), { prop: { kind: 'shield', text: t('Not a promise', 'वादा नहीं'), sub: t('Returns vary', 'रिटर्न बदलते हैं') } }),
      sc('cheer', t('Time does the heavy lifting. Try your own amount next.', 'भारी काम समय करता है। अब अपनी रकम आज़माएँ।')),
    ],
    poke: {
      after: 1,
      beat: { kind: 'guess', q: fill(t('What will {s} a month become in 30 years?', '{s} हर महीने 30 साल में कितना बन जाएगा?'), { s: m }), min: band.min, max: band.max, answer: Math.round(fv),
        reveal: fill(t('About {f}. You put in only {p}; time and growth, at an assumed {r}%, did the rest.', 'लगभग {f}। आपने सिर्फ़ {p} लगाए; बाक़ी समय और अनुमानित {r}% बढ़त ने किया।'), { f: money(fv), p: money(put), r: G_RATE }) },
    },
    quiz: { q: t('How much of the final amount was growth rather than your own deposits?', 'अंतिम रकम में कितना हिस्सा आपकी जमा नहीं, बढ़त था?'),
      options: [t('About 10%', 'लगभग 10%'), t('About half', 'लगभग आधा'), t('About 90%', 'लगभग 90%')], answer: 2,
      why: fill(t('Deposits were {p} of about {f}. The rest, about {s}, is growth at the assumed rate.', 'जमा {p} थी, कुल लगभग {f}। बाक़ी, लगभग {s}, अनुमानित दर पर बढ़त है।'), { p: money(put), f: money(fv), s: pct(share) }) },
  };
}
const guessSip = buildGuessSip();

// ── 2. Guess first: what a loan really costs ────────────────────────────────────────────────────────────────────
export interface LoanFor { label: L; balance: number; rate: number; /** months still to pay */ months: number; emi: number }

/** The example loan (₹10 lakh, 9%, 20 years), or the person's own, whose remaining months the caller has worked out. */
export function buildGuessEmi(own?: LoanFor): Reel {
  const P = own?.balance ?? 1_000_000, R = own?.rate ?? 9, N = own?.months ?? 240;
  const e = own?.emi ?? emi(P, R, N / 12), total = e * N, interest = total - P, share = (interest / total) * 100;
  const years = Math.round((N / 12) * 10) / 10;
  const band = own ? niceBand(interest) : { min: 100_000, max: 10_000_000 };
  const name: L = own?.label ?? t('loan', 'लोन');
  return {
    id: 'guess-emi', topic: 'loans', lesson: 'insight-emi', tags: ['loan', 'EMI', 'guess'], ...(own ? { mine: true } : {}),
    title: own ? t(`Guess first: what your ${name.en} costs`, `पहले अंदाज़ा लगाइए: आपके ${name.hi} की क़ीमत`) : t('Guess first: what a loan costs', 'पहले अंदाज़ा लगाइए: लोन की असली क़ीमत'),
    scenes: [
      sc('worry', own ? fill(t('Your {n} has {p} left, at {r}% a year. The EMI is about {e}.', 'आपके {n} में {p} बाक़ी है, {r}% सालाना। EMI लगभग {e}।'), { n: name, p: money(P), r: R, e: money(e) })
        : fill(t('A {p} loan at {r}% for {y} years has an EMI of about {e}.', '{p} का लोन, {r}% ब्याज, {y} साल: EMI लगभग {e}।'), { p: money(P), r: R, y: 20, e: money(e) }),
        { big: { en: `${money(e).en} a month`, hi: `${money(e).hi} महीना` }, prop: { kind: 'counter', from: 0, to: Math.round(e), format: 'inr', tone: 'cyan', label: t('EMI per month (illustration)', 'हर महीने की EMI (उदाहरण)') } }),
      sc('think', own ? fill(t('At that EMI you have about {y} more years to pay. That is about {n} payments.', 'इस EMI पर लगभग {y} साल और चुकाने हैं। यानी लगभग {n} किस्तें।'), { y: years, n: N })
        : fill(t('You pay that every month for {y} years. That is {n} payments.', 'आप इसे हर महीने {y} साल तक चुकाते हैं। यानी {n} किस्तें।'), { y: 20, n: N }),
        { prop: { kind: 'counter', from: 0, to: N, format: 'plain', unit: t('payments', 'किस्तें'), tone: 'purple' } }),
      sc('surprised', fill(t('Total still to pay: about {t}. That is {i} of interest on {p}.', 'अभी कुल चुकाना: लगभग {t}। यानी {p} पर {i} ब्याज।'), { t: money(total), i: money(interest), p: money(P) }),
        { prop: { kind: 'donut', parts: [{ value: P, label: t('Owed', 'बकाया'), tone: 'teal' }, { value: interest, label: t('Interest', 'ब्याज'), tone: 'red' }], centre: fill(t('{s} interest', '{s} ब्याज'), { s: pct(share) }) } }),
      sc('think', t('The longer the loan and the higher the rate, the bigger the interest slice.', 'लोन जितना लंबा और दर जितनी ऊँची, ब्याज का हिस्सा उतना बड़ा।')),
      sc('happy', t('A part-prepayment or a shorter tenure can cut it. Ask your lender how prepayment is applied.', 'आंशिक प्रीपेमेंट या कम अवधि इसे घटा सकती है। बैंक से पूछें कि प्रीपेमेंट कैसे लगता है।')),
      sc('cheer', t('Look at the total cost, not just the EMI.', 'सिर्फ़ EMI नहीं, कुल लागत देखें।')),
    ],
    poke: {
      after: 1,
      beat: { kind: 'guess', q: own ? fill(t('How much interest will you still pay on the {p} you owe?', 'आप पर जो {p} बाक़ी है, उस पर अभी कितना ब्याज देंगे?'), { p: money(P) }) : t('How much interest will you pay on top of the ₹10 lakh?', '₹10 लाख के ऊपर आप कितना ब्याज चुकाएँगे?'),
        min: band.min, max: band.max, answer: Math.round(interest),
        reveal: fill(t('About {i} of interest, more than the loan itself. Total paid: about {t}.', 'लगभग {i} ब्याज, यानी लोन से भी ज़्यादा। कुल भुगतान: लगभग {t}।'), { i: money(interest), t: money(total) }) },
    },
    quiz: { q: t('Which number shows what a loan really costs you?', 'कौन-सी संख्या बताती है कि लोन आपको असल में कितना पड़ा?'),
      options: [t('Only the EMI', 'सिर्फ़ EMI'), t('EMI times the number of months', 'EMI गुणा महीनों की संख्या'), t('Only the loan amount', 'सिर्फ़ लोन की रकम')], answer: 1,
      why: t('Multiply the EMI by the months to see the total paid, then take away the loan to see the interest.', 'EMI को महीनों से गुणा करें तो कुल भुगतान मिलता है; उसमें से लोन घटाएँ तो ब्याज मिलता है।') },
  };
}
const guessEmi = buildGuessEmi();

// ── 3. What-if slider: the cost of waiting ──────────────────────────────────────────────────────────────────────
const D_RATE = 12, D_H = 30;
export function buildDelayCost(sip = 10_000, mine = false): Reel {
  const now = sipFutureValue(sip, D_RATE, D_H), d10 = sipFutureValue(sip, D_RATE, D_H - 10), skipped = sip * 12 * 10, m = money(sip);
  return {
    id: 'delay-cost', topic: 'invest', lesson: 'insight-sip', tags: ['SIP', 'compounding', 'what-if'], ...(mine ? { mine: true } : {}),
    title: t('What does waiting cost?', 'इंतज़ार की क़ीमत क्या है?'),
    scenes: [
      sc('think', t('Many of us say, “I will start next year.” What does that cost?', 'हममें से कई कहते हैं, “अगले साल शुरू करूँगा।” इसकी क़ीमत क्या है?'), { big: t('Wait a little?', 'थोड़ा रुकें?') }),
      sc('think', fill(t('Take {s} a month for {h} years, with growth at an assumed {r}% a year.', '{h} साल तक हर महीने {s}, हर साल अनुमानित {r}% बढ़त के साथ।'), { s: m, h: D_H, r: D_RATE }),
        { prop: { kind: 'steps', items: [fill(t('{s} every month', 'हर महीने {s}'), { s: m }), fill(t('{h} years to go', '{h} साल बाक़ी'), { h: D_H }), fill(t('{r}% a year, assumed', '{r}% सालाना, अनुमान'), { r: D_RATE })] } }),
      sc('surprised', fill(t('Start today: about {a}. Wait 10 years: about {b}.', 'आज शुरू करें: लगभग {a}। 10 साल रुकें: लगभग {b}।'), { a: money(now), b: money(d10) }),
        { prop: { kind: 'bars', items: [{ label: t('Start today', 'आज'), value: now, text: money(now), tone: 'teal' }, { label: t('Wait 10 yrs', '10 साल बाद'), value: d10, text: money(d10), tone: 'gold' }] } }),
      sc('worry', fill(t('The 10-year wait costs about {l}. The deposits you skipped were only {s}.', '10 साल के इंतज़ार की क़ीमत लगभग {l}। जो जमा आपने छोड़ी, वह सिर्फ़ {s} थी।'), { l: money(now - d10), s: money(skipped) })),
      sc('think', t('Growth earns growth, so the early years carry the most weight.', 'बढ़त पर भी बढ़त मिलती है, इसलिए शुरू के साल सबसे भारी पड़ते हैं।')),
      sc('happy', t('You cannot get lost years back, but starting now still helps.', 'खोए साल वापस नहीं आते, पर आज शुरू करना फिर भी मदद करता है।')),
      sc('worry', fill(t('These are illustrations at an assumed {r}%, not promises.', 'ये अनुमानित {r}% पर उदाहरण हैं, वादे नहीं।'), { r: D_RATE }), { prop: { kind: 'shield', text: t('Illustration', 'उदाहरण'), sub: t('Not a promise', 'वादा नहीं') } }),
    ],
    poke: {
      after: 1,
      beat: { kind: 'slider', q: fill(t('Drag to see what waiting costs a {s} monthly SIP.', 'खिसकाकर देखें कि {s} की मासिक SIP में इंतज़ार की क्या क़ीमत है।'), { s: m }), label: t('Years you wait before starting', 'शुरू करने से पहले इंतज़ार के साल'), unit: t('years', 'साल'),
        min: 0, max: 15, step: 1, start: 5, model: { kind: 'sip-delay', monthly: sip, rate: D_RATE, horizon: D_H },
        takeaway: t('Start {x} years late: about {value} instead of {base}. The wait costs about {lost}.', '{x} साल देर से शुरू करें: {base} की जगह लगभग {value}। इंतज़ार की क़ीमत लगभग {lost}।') },
    },
    quiz: { q: t('Why does waiting 10 years cost far more than the deposits you skipped?', '10 साल रुकने की क़ीमत छोड़ी हुई जमा से कहीं ज़्यादा क्यों है?'),
      options: [t('The bank charges a penalty', 'बैंक जुर्माना लगाता है'), t('Growth builds on earlier growth, so early years matter most', 'बढ़त पर बढ़त मिलती है, इसलिए शुरू के साल सबसे अहम हैं'), t('Returns are higher later', 'बाद में रिटर्न ज़्यादा होता है')], answer: 1,
      why: t('The money you put in early has the longest time to grow, and its growth also grows. That is compounding.', 'शुरू में लगाया पैसा सबसे ज़्यादा समय तक बढ़ता है, और उसकी बढ़त भी बढ़ती है। इसी को चक्रवृद्धि कहते हैं।') },
  };
}
const delayCost = buildDelayCost();

// ── 4. What-if slider: what idle cash buys later ────────────────────────────────────────────────────────────────
const I_AMT = 100_000, I_RATE = 6;
const i20 = Math.round(inflatedValue(I_AMT, I_RATE, 20));
const power = Array.from({ length: 31 }, (_, y) => inflatedValue(I_AMT, I_RATE, y));
const inflationSlide: Reel = {
  id: 'inflation-slide', topic: 'basics', lesson: 'insight-inflation', tags: ['inflation', 'what-if'],
  title: t('What will your ₹1 lakh buy later?', 'आपके ₹1 लाख से आगे क्या मिलेगा?'),
  scenes: [
    sc('surprised', t('You keep ₹1 lakh in a drawer. It stays ₹1 lakh. Does it stay as useful?', 'आप ₹1 लाख दराज़ में रखते हैं। वह ₹1 लाख ही रहता है। क्या उसकी क़ीमत भी वही रहती है?'), { big: t('₹1,00,000', '₹1,00,000'), prop: { kind: 'coins', count: 4 } }),
    sc('think', fill(t('Prices tend to rise. That is inflation. Let us assume {r}% a year.', 'कीमतें आमतौर पर बढ़ती हैं। यही महँगाई है। मान लें हर साल {r}%।'), { r: I_RATE }),
      { prop: { kind: 'line', points: power, tone: 'red', label: t('buying power of ₹1 lakh (illustration)', '₹1 लाख की खरीदने की ताक़त (उदाहरण)') } }),
    sc('worry', fill(t('At that rate, in 20 years your ₹1 lakh buys what about {v} buys today.', 'इस दर पर 20 साल बाद आपके ₹1 लाख से उतना मिलेगा जितना आज लगभग {v} में मिलता है।'), { v: money(i20) }),
      { prop: { kind: 'counter', from: I_AMT, to: i20, format: 'inr', tone: 'red', label: t('what ₹1 lakh buys in 20 years, in today’s money', '20 साल बाद ₹1 लाख की ताक़त, आज के पैसे में') } }),
    sc('think', t('Money that only sits still loses buying power, slowly and quietly.', 'जो पैसा बस पड़ा रहता है, उसकी ताक़त धीरे-धीरे और चुपचाप घटती है।')),
    sc('happy', t('The aim is for your money to grow faster than prices. Check your own rate.', 'लक्ष्य है कि आपका पैसा कीमतों से तेज़ बढ़े। अपनी दर जाँचें।')),
    sc('worry', fill(t('{r}% is an assumption. Real inflation changes from year to year.', '{r}% एक अनुमान है। असली महँगाई साल दर साल बदलती है।'), { r: I_RATE }), { prop: { kind: 'shield', text: t('An assumption', 'अनुमान'), sub: t('It changes', 'यह बदलता है') } }),
  ],
  poke: {
    after: 1,
    beat: { kind: 'slider', q: t('Drag the years to see what ₹1 lakh buys later.', 'साल खिसकाकर देखें कि आगे ₹1 लाख से क्या मिलेगा।'), label: t('Years from now', 'अब से कितने साल'), unit: t('years', 'साल'),
      min: 0, max: 30, step: 1, start: 10, model: { kind: 'inflation-years', amount: I_AMT, rate: I_RATE },
      takeaway: t('In {x} years, ₹1 lakh buys what about {value} buys today, at an assumed 6% a year.', '{x} साल बाद ₹1 लाख से उतना मिलेगा जितना आज लगभग {value} में मिलता है (अनुमानित 6% सालाना)।') },
  },
  quiz: { q: t('In the story, what happens to ₹1 lakh kept idle for 20 years?', 'कहानी में 20 साल बेकार रखे ₹1 लाख का क्या होता है?'),
    options: [t('It buys the same as today', 'आज जितना ही मिलता है'), fill(t('It buys what about {v} buys today', 'उससे उतना मिलता है जितना आज लगभग {v} में'), { v: money(i20) }), t('It buys more than today', 'आज से ज़्यादा मिलता है')], answer: 1,
    why: t('The rupees stay the same but prices rise, so each rupee buys less. At the assumed rate, ₹1 lakh loses over two thirds of its buying power in 20 years.', 'रुपये उतने ही रहते हैं पर कीमतें बढ़ती हैं, इसलिए हर रुपये से कम मिलता है। अनुमानित दर पर 20 साल में ₹1 लाख की ताक़त दो-तिहाई से ज़्यादा घट जाती है।') },
};

// ── 5. Myth or fact: money habits ───────────────────────────────────────────────────────────────────────────────
const mythsMoney: Reel = {
  id: 'myths-money', topic: 'basics', tags: ['myths', 'habits'],
  title: t('Myth or fact: money habits', 'मिथक या सच: पैसे की आदतें'),
  scenes: [
    sc('happy', t('Money advice online is full of half-truths. Let us test four.', 'पैसे की ऑनलाइन सलाह में कई अधूरे सच होते हैं। चार को परखते हैं।'), { big: t('Myth or fact?', 'मिथक या सच?') }),
    sc('think', t('You will see a statement. Decide if it is a myth or a fact.', 'आपको एक बात दिखेगी। तय करें कि वह मिथक है या सच।'), { prop: { kind: 'steps', items: [t('Read the line', 'बात पढ़ें'), t('Tap Myth or Fact', 'मिथक या सच दबाएँ'), t('See why', 'वजह देखें')] } }),
    sc('happy', t('Notice which ones felt obvious and which ones fooled you.', 'देखें कि कौन-सी आसान लगीं और किसने चकमा दिया।')),
    sc('think', t('Beliefs like these quietly shape what we do with money every month.', 'ऐसी धारणाएँ चुपचाप तय करती हैं कि हम हर महीने पैसे का क्या करते हैं।')),
    sc('worry', t('When unsure, check how a thing works before you act on it.', 'पक्का न हो तो कुछ करने से पहले जाँचें कि वह कैसे काम करता है।'), { prop: { kind: 'shield', text: t('Check first', 'पहले जाँचें'), sub: t('Then act', 'फिर करें') } }),
    sc('cheer', t('Small, true habits beat big, clever tricks.', 'छोटी, सच्ची आदतें बड़ी चालाकियों से बेहतर हैं।')),
    sc('happy', t('Next, try the same idea on your own spending.', 'अब यही सोच अपने ख़र्च पर आज़माएँ।')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'myth', q: t('Myth or fact?', 'मिथक या सच?'), cards: [
      { s: t('A higher salary automatically means you will save more.', 'ज़्यादा तनख़्वाह का मतलब अपने-आप ज़्यादा बचत है।'), fact: false, why: t('Spending tends to rise with income. Saving is a habit, not a salary.', 'आमदनी के साथ ख़र्च भी बढ़ता है। बचत आदत है, तनख़्वाह नहीं।') },
      { s: t('Prices rising over time makes idle cash buy less.', 'समय के साथ कीमतें बढ़ने से पड़ी रकम से कम मिलता है।'), fact: true, why: t('That is inflation: the same cash buys fewer things later.', 'यही महँगाई है: वही रकम आगे कम चीज़ें ख़रीदती है।') },
      { s: t('You need a large lump sum to start investing.', 'निवेश शुरू करने के लिए बड़ी रकम चाहिए।'), fact: false, why: t('Many SIPs accept small monthly amounts. Starting small still builds the habit.', 'कई SIP छोटी मासिक रकम लेती हैं। छोटी शुरुआत भी आदत बनाती है।') },
      { s: t('Paying only the minimum due on a credit card clears the debt.', 'क्रेडिट कार्ड का सिर्फ़ न्यूनतम बिल भरने से क़र्ज़ ख़त्म हो जाता है।'), fact: false, why: t('The rest keeps growing with interest. Pay the full bill when you can.', 'बाक़ी रकम पर ब्याज लगता रहता है। जब हो सके, पूरा बिल भरें।') },
    ] },
  },
  quiz: { q: t('Which habit helps most, whatever your salary?', 'तनख़्वाह जो भी हो, कौन-सी आदत सबसे ज़्यादा मदद करती है?'),
    options: [t('Waiting to earn more first', 'पहले ज़्यादा कमाने का इंतज़ार'), t('Saving a fixed part of income first', 'आमदनी का एक तय हिस्सा पहले बचाना'), t('Paying only minimum dues', 'सिर्फ़ न्यूनतम बिल भरना')], answer: 1,
    why: t('Setting aside a fixed part as soon as money arrives works at any salary, because it does not depend on what is left over.', 'पैसा आते ही एक तय हिस्सा अलग करना हर तनख़्वाह पर काम करता है, क्योंकि वह इस पर निर्भर नहीं कि बचा क्या।') },
};

// ── 6. Myth or fact: scams ──────────────────────────────────────────────────────────────────────────────────────
const mythsScams: Reel = {
  id: 'myths-scams', topic: 'safety', tags: ['scams', 'myths', 'safety'],
  title: t('Myth or fact: scam calls and messages', 'मिथक या सच: ठगी के कॉल और मैसेज'),
  scenes: [
    sc('worry', t('Scammers count on you acting fast. Four quick checks.', 'ठग चाहते हैं कि आप जल्दबाज़ी में करें। चार छोटी जाँच।'), { big: t('Spot the scam', 'ठगी पहचानें') }),
    sc('think', t('You will see a statement. Decide if it is a myth or a fact.', 'आपको एक बात दिखेगी। तय करें कि वह मिथक है या सच।'), { prop: { kind: 'steps', items: [t('Read the line', 'बात पढ़ें'), t('Tap Myth or Fact', 'मिथक या सच दबाएँ'), t('See why', 'वजह देखें')] } }),
    sc('happy', t('Every one of these is a trick used on real people in India.', 'इनमें से हर एक भारत में असली लोगों पर आज़माई गई चाल है।')),
    sc('think', t('The pattern is the same: urgency, fear, and a request for a code, a link or money.', 'तरीक़ा एक ही है: जल्दबाज़ी, डर, और कोड, लिंक या पैसे की माँग।')),
    sc('worry', t('Pause. Hang up. Check using a number or app you already trust.', 'रुकें। कॉल काटें। ऐसे नंबर या ऐप से जाँचें जिस पर आप पहले से भरोसा करते हैं।'), { prop: { kind: 'shield', text: t('Pause first', 'पहले रुकें'), sub: t('Then check', 'फिर जाँचें') } }),
    sc('happy', t('If money is lost, report fast: the national cybercrime helpline is 1930.', 'पैसा चला जाए तो जल्दी रिपोर्ट करें: राष्ट्रीय साइबर क्राइम हेल्पलाइन 1930 है।')),
    sc('cheer', t('You decide the pace, not the caller.', 'रफ़्तार आप तय करते हैं, कॉल करने वाला नहीं।')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'myth', q: t('Myth or fact?', 'मिथक या सच?'), cards: [
      { s: t('Your bank will never ask for your OTP or PIN on a call.', 'आपका बैंक कभी कॉल पर आपका OTP या PIN नहीं माँगेगा।'), fact: true, why: t('OTPs and PINs are only for you. Anyone asking for them is trying to get into your account.', 'OTP और PIN सिर्फ़ आपके लिए हैं। जो भी माँगे, वह आपके खाते में घुसना चाहता है।') },
      { s: t('If a caller says you are under “digital arrest”, you must stay on the call and pay.', 'अगर कॉल करने वाला कहे कि आप “डिजिटल अरेस्ट” में हैं, तो कॉल पर रहकर पैसे देने होंगे।'), fact: false, why: t('It is a scam. Genuine agencies do not settle cases by taking money over a call. Hang up and report it.', 'यह ठगी है। असली एजेंसियाँ कॉल पर पैसे लेकर मामला नहीं निपटातीं। कॉल काटें और रिपोर्ट करें।') },
      { s: t('A big promised profit is safe if many people in the group say it worked.', 'ग्रुप में कई लोग कहें कि काम किया, तो बड़े मुनाफ़े का वादा सुरक्षित है।'), fact: false, why: t('Fake members and screenshots are easy to make. A promised profit with no risk is a warning sign.', 'नकली सदस्य और स्क्रीनशॉट बनाना आसान है। बिना जोखिम के मुनाफ़े का वादा ख़तरे की निशानी है।') },
      { s: t('An SMS link asking you to update KYC urgently is how banks usually contact you.', 'KYC जल्दी अपडेट करने का SMS लिंक बैंक के संपर्क का आम तरीक़ा है।'), fact: false, why: t('Fraudsters copy bank messages. Open your bank’s own app or visit the branch instead of the link.', 'ठग बैंक जैसे मैसेज बनाते हैं। लिंक की जगह बैंक का अपना ऐप खोलें या शाखा जाएँ।') },
    ] },
  },
  quiz: { q: t('What is the safest first move when an unknown caller creates urgency?', 'अनजान कॉल करने वाला जल्दबाज़ी मचाए तो सबसे सुरक्षित पहला क़दम क्या है?'),
    options: [t('Do what they say, quickly', 'जल्दी से वही करें जो वे कहें'), t('Pause, hang up and check with an official number', 'रुकें, कॉल काटें और आधिकारिक नंबर से जाँचें'), t('Share the OTP to prove it is you', 'OTP बताकर साबित करें कि आप ही हैं')], answer: 1,
    why: t('Urgency is the scammer’s tool. Pausing and checking through a number you already trust breaks the trick.', 'जल्दबाज़ी ठग का हथियार है। रुककर किसी भरोसेमंद नंबर से जाँचने से चाल टूट जाती है।') },
};

// ── 7. Spot the scam: a KYC text message ─────────────────────────────────────────────────────────────────────────
const spotKyc: Reel = {
  id: 'spot-kyc-sms', topic: 'safety', tags: ['scams', 'KYC', 'spot'],
  title: t('Spot the scam: the KYC message', 'ठगी पहचानें: KYC वाला मैसेज'),
  scenes: [
    sc('worry', t('A message says your bank account will be blocked today. Your heart races.', 'एक मैसेज कहता है आज आपका बैंक खाता बंद हो जाएगा। दिल तेज़ धड़कता है।'), { big: t('Is this real?', 'क्या यह सच है?') }),
    sc('think', t('Here is an example of the kind of message scammers send. Read it slowly.', 'ठगों के भेजे मैसेज का एक उदाहरण यह है। इसे धीरे-धीरे पढ़ें।'), { prop: { kind: 'steps', items: [t('Read it slowly', 'धीरे पढ़ें'), t('Tap what looks off', 'शक वाला हिस्सा छुएँ'), t('See the red flags', 'लाल झंडे देखें')] } }),
    sc('happy', t('Real banks do not ask for your OTP, and they do not rush you with a threat.', 'असली बैंक आपका OTP नहीं माँगते, और धमकी देकर जल्दी नहीं मचाते।')),
    sc('think', t('A link you did not ask for is never the place to type bank details.', 'जो लिंक आपने नहीं माँगा, वहाँ बैंक की जानकारी कभी न डालें।')),
    sc('worry', t('Even the sender name can be faked. Check inside your bank’s own app.', 'भेजने वाले का नाम भी नक़ली हो सकता है। अपने बैंक के ही ऐप में जाँचें।'), { prop: { kind: 'shield', text: t('Use the real app', 'असली ऐप खोलें'), sub: t('Not the link', 'लिंक नहीं') } }),
    sc('cheer', t('Unsure? Stop, wait ten minutes, then ask the bank on its own number.', 'पक्का नहीं? रुकें, दस मिनट रुकें, फिर बैंक के अपने नंबर पर पूछें।')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'spot', q: t('Tap the parts that look like red flags.', 'लाल झंडे जैसे लगने वाले हिस्से छुएँ।'), from: t('SMS from “BANK-ALERT”', '“BANK-ALERT” का SMS'),
      parts: [
        { t: t('Dear customer, your KYC needs an update.', 'प्रिय ग्राहक, आपकी KYC अपडेट करनी है।') },
        { t: t('Do it right now or your account will be blocked today.', 'अभी करें, वरना आज ही आपका खाता बंद हो जाएगा।'), flag: t('A threat and a deadline. Scammers rush you so you do not stop to think.', 'धमकी और समय-सीमा। ठग जल्दी करवाते हैं ताकि आप सोचें नहीं।') },
        { t: t('Click bank-kyc-update.co/login', 'क्लिक करें bank-kyc-update.co/login'), flag: t('A link you did not ask for, on a look-alike address. Use your bank’s own app or website.', 'बिन माँगा लिंक, नक़ली-सा पता। अपने बैंक का ही ऐप या वेबसाइट इस्तेमाल करें।') },
        { t: t('and share the OTP you receive.', 'और जो OTP आए, वह बताएँ।'), flag: t('An OTP is a key to your money. No genuine bank asks you to share it.', 'OTP आपके पैसे की चाबी है। कोई असली बैंक उसे बताने को नहीं कहता।') },
        { t: t('– Customer Care', '– कस्टमर केयर') },
      ],
      todo: t('Do not click, reply or share the OTP. Open your bank’s own app instead. If money was lost, report it quickly on the national cybercrime helpline, 1930.', 'न क्लिक करें, न जवाब दें, न OTP बताएँ। इसकी जगह अपने बैंक का ऐप खोलें। पैसा चला गया हो तो तुरंत राष्ट्रीय साइबर क्राइम हेल्पलाइन 1930 पर रिपोर्ट करें।') },
  },
  quiz: { q: t('Which part of such a message should worry you most?', 'ऐसे मैसेज का कौन-सा हिस्सा आपको सबसे ज़्यादा खटकना चाहिए?'),
    options: [t('It mentions a bank', 'उसमें बैंक का नाम है'), t('It rushes you and asks for an OTP', 'वह जल्दी मचाता है और OTP माँगता है'), t('It came by SMS', 'वह SMS से आया')], answer: 1,
    why: t('A rush and a request for an OTP together are the clearest sign. Stop, and check inside your bank’s own app.', 'जल्दबाज़ी और OTP की माँग साथ हों तो यह सबसे साफ़ निशानी है। रुकें, और अपने बैंक के ही ऐप में जाँचें।') },
};

// ── 8. Spot the scam: a profit group ───────────────────────────────────────────────────────────────────────────
const spotGroup: Reel = {
  id: 'spot-invest-group', topic: 'safety', tags: ['scams', 'investment fraud', 'spot'],
  title: t('Spot the scam: the profit group', 'ठगी पहचानें: मुनाफ़े वाला ग्रुप'),
  scenes: [
    sc('surprised', t('A friendly stranger adds you to a group where everyone seems to be making money.', 'एक मिलनसार अजनबी आपको ऐसे ग्रुप में जोड़ता है जहाँ सब पैसे कमाते दिखते हैं।'), { big: t('Easy money?', 'आसान पैसा?') }),
    sc('think', t('Here is an example of the pitch. Spot what is off.', 'इस पेशकश का एक उदाहरण यह है। देखें क्या ग़लत है।'), { prop: { kind: 'steps', items: [t('Read the pitch', 'पेशकश पढ़ें'), t('Tap what looks off', 'शक वाला हिस्सा छुएँ'), t('See the red flags', 'लाल झंडे देखें')] } }),
    sc('happy', t('A promised profit with no risk, a rush, and money to a personal account are classic signs.', 'बिना जोखिम के मुनाफ़े का वादा, जल्दबाज़ी और निजी खाते में पैसा, ये आम निशानियाँ हैं।')),
    sc('think', t('Profit screenshots and cheering members are easy to fake.', 'मुनाफ़े के स्क्रीनशॉट और वाह-वाह करते सदस्य बनाना आसान है।')),
    sc('worry', t('Real investing never needs you to pay a stranger’s personal account.', 'असली निवेश में किसी अजनबी के निजी खाते में पैसा नहीं देना पड़ता।'), { prop: { kind: 'shield', text: t('Personal account?', 'निजी खाता?'), sub: t('Walk away', 'दूर हट जाएँ') } }),
    sc('cheer', t('Ask first: who regulates this, and can I check it myself?', 'पहले पूछें: इसे कौन नियंत्रित करता है, और क्या मैं ख़ुद जाँच सकता हूँ?')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'spot', q: t('Tap the parts that look like red flags.', 'लाल झंडे जैसे लगने वाले हिस्से छुएँ।'), from: t('WhatsApp group “Profit Club”', 'WhatsApp ग्रुप “Profit Club”'),
      parts: [
        { t: t('Hi! I am Priya, I help people grow money.', 'नमस्ते! मैं प्रिया हूँ, मैं लोगों का पैसा बढ़ाने में मदद करती हूँ।') },
        { t: t('Members earned big profits this month with no risk at all.', 'इस महीने सदस्यों ने बिना किसी जोखिम के बड़ा मुनाफ़ा कमाया।'), flag: t('Nobody can promise profit with no risk. Every real investment can lose money.', 'बिना जोखिम के मुनाफ़े का वादा कोई नहीं कर सकता। हर असली निवेश में नुक़सान हो सकता है।') },
        { t: t('Only 3 seats left. Pay ₹5,000 today to join.', 'सिर्फ़ 3 सीटें बची हैं। जुड़ने के लिए आज ₹5,000 दें।'), flag: t('Pressure to pay fast, and an up-front fee, are classic signs.', 'जल्दी पैसा देने का दबाव और पहले से फ़ीस, ये आम निशानियाँ हैं।') },
        { t: t('Send the money to my personal UPI ID.', 'पैसा मेरे निजी UPI ID पर भेजें।'), flag: t('A real firm takes money into an account you can check, not a person’s UPI ID.', 'असली कंपनी ऐसे खाते में पैसा लेती है जिसे आप जाँच सकें, किसी व्यक्ति के UPI ID में नहीं।') },
        { t: t('Profit screenshots are attached.', 'मुनाफ़े के स्क्रीनशॉट साथ में हैं।'), flag: t('Screenshots are easy to fake and prove nothing.', 'स्क्रीनशॉट नक़ली बनाना आसान है और वे कुछ साबित नहीं करते।') },
        { t: t('Welcome to the group!', 'ग्रुप में स्वागत है!') },
      ],
      todo: t('Do not pay. Leave the group and block the number. If money was lost, report it quickly on the national cybercrime helpline, 1930.', 'पैसा न दें। ग्रुप छोड़ें और नंबर ब्लॉक करें। पैसा चला गया हो तो तुरंत राष्ट्रीय साइबर क्राइम हेल्पलाइन 1930 पर रिपोर्ट करें।') },
  },
  quiz: { q: t('Which of these is a sign of an investment scam?', 'इनमें से कौन-सी निवेश ठगी की निशानी है?'),
    options: [t('A promise of profit with no risk', 'बिना जोखिम के मुनाफ़े का वादा'), t('A company bank account you can check', 'कंपनी का ऐसा बैंक खाता जिसे आप जाँच सकें'), t('A clear written risk warning', 'जोखिम की साफ़ लिखी चेतावनी')], answer: 0,
    why: t('Every real investment can lose money. A promise of profit with no risk is the loudest warning sign.', 'हर असली निवेश में नुक़सान हो सकता है। बिना जोखिम के मुनाफ़े का वादा सबसे बड़ी चेतावनी है।') },
};

// ── 9. Choose your path: a bonus ───────────────────────────────────────────────────────────────────────────────
const B = { bonus: 200_000, loan: 400_000, rate: 9, years: 3, spend: 60_000, fundMonths: 2, growth: 12, horizon: 10 };
const bEmi = emi(B.loan, B.rate, B.years), bSave = prepaySaving(B.loan, B.rate, bEmi, B.bonus), bGrow = lumpSumFuture(B.bonus, B.growth, B.horizon);
const bFundNow = B.spend * B.fundMonths, bMonthsAfter = (bFundNow + B.bonus) / B.spend;
const chooseBonus: Reel = {
  id: 'choose-bonus', topic: 'basics', tags: ['bonus', 'windfall', 'choose'],
  title: t('Choose your path: a ₹2 lakh bonus', 'अपना रास्ता चुनें: ₹2 लाख का बोनस'),
  scenes: [
    sc('happy', t('Priya gets a ₹2 lakh bonus. What could she do with it?', 'प्रिया को ₹2 लाख का बोनस मिला। वह इसका क्या कर सकती है?'), { big: t('₹2 lakh bonus', '₹2 लाख का बोनस') }),
    sc('think', fill(t('She has a car loan with {l} left at {r}% a year, and savings for {m} months of spending.', 'उसके कार लोन में {l} बाक़ी है, {r}% सालाना, और {m} महीने के ख़र्च जितनी बचत है।'), { l: money(B.loan), r: B.rate, m: B.fundMonths }),
      { prop: { kind: 'steps', items: [fill(t('Car loan {l}', 'कार लोन {l}'), { l: money(B.loan) }), fill(t('{m} months of savings', '{m} महीने की बचत'), { m: B.fundMonths }), fill(t('{s} spent a month', 'महीने का ख़र्च {s}'), { s: money(B.spend) })] } }),
    sc('think', t('Each path helps in a different way, and each has a cost.', 'हर रास्ता अलग तरह से मदद करता है, और हर रास्ते की एक क़ीमत है।')),
    sc('happy', t('Paying a loan early gives a sure saving: the interest you would have paid.', 'लोन जल्दी चुकाने से पक्की बचत होती है: वह ब्याज जो आप देते।')),
    sc('think', t('A safety net protects every other plan from a surprise bill or a gap in income.', 'सुरक्षा-निधि अचानक के बिल या आमदनी में रुकावट से हर दूसरी योजना को बचाती है।')),
    sc('worry', t('Investing may grow it faster, but returns vary and can fall short.', 'निवेश इसे तेज़ बढ़ा सकता है, पर रिटर्न बदलते हैं और कम भी पड़ सकते हैं।'), { prop: { kind: 'shield', text: t('Returns vary', 'रिटर्न बदलते हैं'), sub: t('Not a promise', 'वादा नहीं') } }),
    sc('cheer', t('Compare the loan’s rate with what you hope to earn, then decide.', 'लोन की दर की तुलना उस कमाई से करें जिसकी आप उम्मीद करते हैं, फिर तय करें।')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'path', q: t('What does Priya do with the bonus?', 'प्रिया बोनस का क्या करती है?'), setup: t('Pick one. You will see where each path leads.', 'एक चुनें। फिर देखें हर रास्ता कहाँ जाता है।'),
      options: [
        { label: t('Prepay the car loan', 'कार लोन जल्दी चुकाए'), result: fill(t('The loan ends about {m} months sooner and saves about {i} of interest. A sure saving, equal to the loan’s rate.', 'लोन लगभग {m} महीने पहले ख़त्म होता है और लगभग {i} ब्याज बचता है। पक्की बचत, लोन की दर के बराबर।'), { m: Math.round(bSave.monthsSaved), i: money(bSave.interestSaved) }) },
        { label: t('Invest it for 10 years', '10 साल के लिए निवेश करे'), result: fill(t('At an assumed {g}% a year, {b} could grow to about {f} in {h} years. Returns vary and can fall short.', 'अनुमानित {g}% सालाना पर {b} {h} साल में लगभग {f} हो सकता है। रिटर्न बदलते हैं और कम भी पड़ सकते हैं।'), { g: B.growth, b: money(B.bonus), f: money(bGrow), h: B.horizon }) },
        { label: t('Add to the safety net', 'सुरक्षा-निधि में जोड़े'), result: fill(t('Her savings go from {a} to about {m} months of spending. It earns little, but it steadies every other plan.', 'उसकी बचत {a} महीने से बढ़कर लगभग {m} महीने के ख़र्च जितनी हो जाती है। कमाई कम, पर हर दूसरी योजना स्थिर रहती है।'), { a: B.fundMonths, m: Math.round(bMonthsAfter * 10) / 10 }) },
        { label: t('Spend it on a holiday', 'छुट्टी पर ख़र्च करे'), result: t('It is enjoyed now, and nothing is left to grow or to save interest. A small treat can still be part of a plan.', 'आज उसका आनंद मिलता है, पर बढ़ने या ब्याज बचाने को कुछ नहीं बचता। छोटी-सी मौज भी योजना का हिस्सा हो सकती है।') },
      ],
      verdict: t('There is no single winner. It depends on the loan’s rate, how safe your savings feel, and what you hope to earn. Your own numbers decide.', 'कोई एक विजेता नहीं है। यह लोन की दर, बचत कितनी सुरक्षित लगती है और आप कितनी कमाई चाहते हैं, इस पर निर्भर है। आपके अपने आँकड़े तय करते हैं।') },
  },
  quiz: { q: t('What helps most when choosing between prepaying a loan and investing?', 'लोन जल्दी चुकाने और निवेश के बीच चुनते समय सबसे ज़्यादा क्या काम आता है?'),
    options: [t('Comparing the loan’s rate with what you hope to earn', 'लोन की दर की तुलना अपनी उम्मीद की कमाई से करना'), t('Copying what a friend did', 'दोस्त की नक़ल करना'), t('Picking the bigger number', 'बड़ी संख्या चुन लेना')], answer: 0,
    why: t('A loan’s rate is a cost you pay for sure. A return is something you hope to earn. Comparing them, and checking your safety net, is the start.', 'लोन की दर ऐसी लागत है जो पक्की देनी पड़ती है। रिटर्न वह है जिसकी आप उम्मीद करते हैं। दोनों की तुलना और अपनी सुरक्षा-निधि की जाँच, यही शुरुआत है।') },
};

// ── 10. Sort it: needs, wants, and what builds your future ───────────────────────────────────────────────────────
const sortNeeds: Reel = {
  id: 'sort-needs-wants', topic: 'basics', tags: ['budget', 'needs', 'wants', 'sort'],
  title: t('Sort it: needs, wants, future', 'छाँटिए: ज़रूरत, चाहत, भविष्य'),
  scenes: [
    withWho('aarav', sc('happy', t('Aarav just got his first salary. Where should each rupee go?', 'आरव को पहली तनख़्वाह मिली है। हर रुपया कहाँ जाए?'), { big: t('First salary', 'पहली तनख़्वाह') })),
    withWho('aarav', sc('think', t('Spending falls into three groups: needs, wants, and what builds your future.', 'ख़र्च तीन तरह का होता है: ज़रूरत, चाहत, और जो आपका भविष्य बनाता है।'), { prop: { kind: 'steps', items: [t('Needs: you must pay', 'ज़रूरत: देना ही है'), t('Wants: nice to have', 'चाहत: होता तो अच्छा'), t('Future: grows later', 'भविष्य: बढ़ता है')] } })),
    sc('happy', t('Most people find some of their spending sits in the wrong group.', 'ज़्यादातर लोग पाते हैं कि उनका कुछ ख़र्च ग़लत समूह में बैठा है।')),
    sc('think', t('There is no shame in wants. The aim is to choose them on purpose.', 'चाहतों में कोई शर्म नहीं। मक़सद है उन्हें सोच-समझकर चुनना।')),
    sc('worry', t('Wants that repeat every month can quietly crowd out the future group.', 'हर महीने दोहराई जाने वाली चाहतें चुपचाप भविष्य वाले हिस्से को दबा सकती हैं।'), { prop: { kind: 'shield', text: t('Choose on purpose', 'सोचकर चुनें'), sub: t('Not by habit', 'आदत से नहीं') } }),
    withWho('aarav', sc('cheer', t('Try sorting your own last month the same way.', 'अपना पिछला महीना भी इसी तरह छाँटकर देखें।'))),
  ],
  poke: {
    after: 1,
    beat: { kind: 'sort', q: t('Where does each one belong?', 'हर एक कहाँ आता है?'), bins: [t('Need', 'ज़रूरत'), t('Want', 'चाहत'), t('Future', 'भविष्य')],
      cards: [
        { t: t('Rent for his flat', 'उसके फ़्लैट का किराया'), bin: 0, why: t('A basic need: it keeps a roof over his head.', 'बुनियादी ज़रूरत: इससे सिर पर छत रहती है।') },
        { t: t('Streaming apps he rarely opens', 'स्ट्रीमिंग ऐप जो वह कम खोलता है'), bin: 1, why: t('A want. If it is rarely used, it is worth a second look.', 'चाहत। कम इस्तेमाल हो तो एक बार फिर सोचना ठीक है।') },
        { t: t('A monthly SIP', 'हर महीने की SIP'), bin: 2, why: t('It builds his future: money set aside to grow over time.', 'यह उसका भविष्य बनाती है: पैसा अलग रखा जो समय के साथ बढ़ता है।') },
        { t: t('Electricity bill', 'बिजली का बिल'), bin: 0, why: t('A need: it is a must-pay running cost.', 'ज़रूरत: यह देना ही पड़ने वाला चालू ख़र्च है।') },
        { t: t('Top-up of his emergency fund', 'इमरजेंसी फ़ंड में जमा'), bin: 2, why: t('It builds his future: a cushion for a surprise bill.', 'यह भविष्य बनाता है: अचानक के बिल के लिए गद्दी।') },
      ] },
  },
  quiz: { q: t('Which group does money set aside for an emergency fund belong to?', 'इमरजेंसी फ़ंड के लिए अलग रखा पैसा किस समूह में आता है?'),
    options: [t('Needs', 'ज़रूरत'), t('Wants', 'चाहत'), t('What builds your future', 'जो भविष्य बनाता है')], answer: 2,
    why: t('Money set aside for later, like a cushion or a SIP, builds your future. It is not spent on today.', 'आगे के लिए अलग रखा पैसा, जैसे गद्दी या SIP, भविष्य बनाता है। वह आज पर ख़र्च नहीं होता।') },
};

// ── 11. Put it in order: a first salary ──────────────────────────────────────────────────────────────────────────
const orderSalary: Reel = {
  id: 'order-first-salary', topic: 'basics', tags: ['first salary', 'order', 'habits'],
  title: t('Put it in order: your first salary', 'क्रम में लगाइए: पहली तनख़्वाह'),
  scenes: [
    withWho('meera', sc('surprised', t('Meera’s first salary has landed. Everything wants a piece of it.', 'मीरा की पहली तनख़्वाह आ गई है। हर चीज़ को उसमें से हिस्सा चाहिए।'), { big: t('Money has an order', 'पैसे का एक क्रम है') })),
    withWho('meera', sc('think', t('One common order is to cover what is fixed, then protect, then grow.', 'एक आम क्रम है: पहले तय ख़र्च, फिर सुरक्षा, फिर बढ़ोतरी।'), { prop: { kind: 'steps', items: [t('Cover what is fixed', 'तय ख़र्च निपटाएँ'), t('Protect yourself', 'अपनी सुरक्षा करें'), t('Then grow it', 'फिर बढ़ाएँ')] } })),
    sc('happy', t('It is a common order, not the only one. Your life may shuffle it.', 'यह एक आम क्रम है, इकलौता नहीं। आपकी ज़िंदगी इसे बदल सकती है।')),
    sc('think', t('The point is that each step makes the next one safer.', 'असल बात यह है कि हर क़दम अगले को ज़्यादा सुरक्षित बनाता है।')),
    sc('worry', t('If something urgent breaks the order one month, that is fine. Reset it next month.', 'किसी महीने कोई ज़रूरी चीज़ क्रम बिगाड़ दे तो चिंता नहीं। अगले महीने फिर बना लें।'), { prop: { kind: 'shield', text: t('Reset, do not quit', 'फिर बनाएँ, छोड़ें नहीं'), sub: t('One month is not the plan', 'एक महीना योजना नहीं') } }),
    withWho('meera', sc('cheer', t('Write your own order down once. It makes every payday easier.', 'अपना क्रम एक बार लिख लें। हर तनख़्वाह का दिन आसान हो जाता है।'))),
  ],
  poke: {
    after: 1,
    beat: { kind: 'order', q: t('Put Meera’s first salary to work, first to last.', 'मीरा की पहली तनख़्वाह को क्रम से काम पर लगाएँ।'),
      items: [
        { t: t('Pay rent and bills', 'किराया और बिल भरें'), why: t('These are fixed, so they come out first.', 'ये तय हैं, इसलिए सबसे पहले निकलते हैं।') },
        { t: t('Clear costly card dues', 'महँगी कार्ड बकाया चुकाएँ'), why: t('Card interest is often far higher than savings earn, so clearing it usually comes first.', 'कार्ड का ब्याज अक्सर बचत की कमाई से कहीं ज़्यादा होता है, इसलिए इसे चुकाना आमतौर पर पहले आता है।') },
        { t: t('Build a small emergency fund', 'छोटा इमरजेंसी फ़ंड बनाएँ'), why: t('A few months of spending set aside stops a surprise from becoming a loan.', 'कुछ महीनों का ख़र्च अलग रखने से अचानक की मुसीबत क़र्ज़ नहीं बनती।') },
        { t: t('Start a monthly SIP', 'हर महीने की SIP शुरू करें'), why: t('Starting small and early lets time do the work.', 'छोटी और जल्दी शुरुआत से समय अपना काम करता है।') },
        { t: t('Spend the rest on yourself', 'बाक़ी अपने ऊपर ख़र्च करें'), why: t('Once the basics are done, enjoying the rest is part of a healthy plan.', 'बुनियादी काम हो जाएँ तो बाक़ी का आनंद लेना भी स्वस्थ योजना का हिस्सा है।') },
      ] },
  },
  quiz: { q: t('Why does clearing costly card dues often come before a SIP?', 'महँगी कार्ड बकाया अक्सर SIP से पहले क्यों चुकाई जाती है?'),
    options: [t('Card interest is usually higher than savings earn', 'कार्ड का ब्याज आमतौर पर बचत की कमाई से ज़्यादा होता है'), t('Cards are more important than saving', 'कार्ड बचत से ज़्यादा अहम हैं'), t('A SIP is not allowed with a card', 'कार्ड के साथ SIP की अनुमति नहीं है')], answer: 0,
    why: t('Interest you pay on a card is certain and often high. Savings growth is uncertain, so the sure cost usually goes first.', 'कार्ड पर जो ब्याज देते हैं वह पक्का और अक्सर ऊँचा होता है। बचत की बढ़त अनिश्चित है, इसलिए पक्की लागत आमतौर पर पहले आती है।') },
};

// ── 12. What-if slider: the loan's rate ────────────────────────────────────────────────────────────────────────────
const R = { principal: 3_000_000, years: 20, rate0: 8.5 };
const rateLow = emi(R.principal, 7, R.years), rateHigh = emi(R.principal, 11, R.years);
const emiRateSlide: Reel = {
  id: 'emi-rate-slide', topic: 'loans', lesson: 'insight-emi', tags: ['EMI', 'rate', 'what-if'],
  title: t('What a rate change does to your EMI', 'दर बदलने से आपकी EMI पर क्या असर'),
  scenes: [
    sc('worry', t('The bank says your loan’s rate has moved. What does that do to your EMI?', 'बैंक कहता है आपके लोन की दर बदल गई। आपकी EMI पर इसका क्या असर होगा?'), { big: t('Rate moved', 'दर बदली') }),
    sc('think', fill(t('Take {p} over {y} years. We start at {r}% a year.', '{y} साल के लिए {p}। शुरुआत {r}% सालाना से।'), { p: money(R.principal), y: R.years, r: R.rate0 }), { prop: { kind: 'steps', items: [fill(t('Loan {p}', 'लोन {p}'), { p: money(R.principal) }), fill(t('{y} years', '{y} साल'), { y: R.years }), fill(t('Starts at {r}%', '{r}% से शुरू'), { r: R.rate0 })] } }),
    sc('surprised', fill(t('At about 7% the EMI is {a}. At about 11% it is {b}.', 'लगभग 7% पर EMI {a} है। लगभग 11% पर {b}।'), { a: money(rateLow), b: money(rateHigh) }), { prop: { kind: 'bars', items: [{ label: t('At 7%', '7% पर'), value: rateLow, text: money(rateLow), tone: 'teal' }, { label: t('At 11%', '11% पर'), value: rateHigh, text: money(rateHigh), tone: 'gold' }] } }),
    sc('think', t('A small change in the rate is a big change over twenty years.', 'दर में छोटा बदलाव बीस साल में बड़ा फ़र्क़ बन जाता है।')),
    sc('happy', t('Ask your lender whether a rate change alters your EMI or your tenure.', 'बैंक से पूछें कि दर बदलने पर EMI बदलती है या अवधि।')),
    sc('cheer', t('Know the number before the letter arrives.', 'चिट्ठी आने से पहले संख्या जान लें।')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'slider', q: t('Drag the rate to see the EMI move.', 'दर खिसकाकर देखें कि EMI कैसे बदलती है।'), label: t('The loan’s yearly rate', 'लोन की सालाना दर'), unit: t('%', '%'), min: 7, max: 12, step: 0.5, start: 9.5,
      model: { kind: 'emi-rate', principal: R.principal, years: R.years, rate0: R.rate0 },
      takeaway: t('At {x} a year the EMI is about {value} a month, against {base} at the starting rate. The gap is about {diff} a month.', '{x} सालाना पर EMI लगभग {value} महीना है, शुरुआती दर पर {base}। फ़र्क़ लगभग {diff} महीना।') },
  },
  quiz: { q: t('Why does a small change in the rate matter so much?', 'दर में छोटा बदलाव इतना मायने क्यों रखता है?'),
    options: [t('It is charged on a big amount for many years', 'वह बड़ी रकम पर कई सालों तक लगता है'), t('Banks charge extra when rates change', 'दर बदलने पर बैंक अलग से शुल्क लेते हैं'), t('It only matters in the first month', 'यह सिर्फ़ पहले महीने मायने रखता है')], answer: 0,
    why: t('A rate is charged on what you owe, month after month, for many years, so a small gap adds up.', 'दर आपकी बकाया रकम पर महीने-दर-महीने, कई सालों तक लगती है, इसलिए छोटा फ़र्क़ जुड़ता जाता है।') },
};

// ── 13. What-if slider: how much to save for a goal ────────────────────────────────────────────────────────────────
const GS = { target: 1_000_000, rate: 12 };
const gs5 = sipNeededFor(GS.target, GS.rate, 5), gs10 = sipNeededFor(GS.target, GS.rate, 10);
function sipNeededFor(target: number, rate: number, years: number): number { const i = rate / 1200, n = years * 12; return (target * i) / (Math.pow(1 + i, n) - 1); }
const goalSipSlide: Reel = {
  id: 'goal-sip-slide', topic: 'goals', lesson: 'insight-sip', tags: ['goal', 'SIP', 'what-if'],
  title: t('How much a month for your goal?', 'आपके लक्ष्य के लिए महीने में कितना?'),
  scenes: [
    sc('think', t('You want ₹10 lakh for a goal. How much do you need to put aside each month?', 'आपको एक लक्ष्य के लिए ₹10 लाख चाहिए। हर महीने कितना अलग रखना होगा?'), { big: t('₹10 lakh goal', '₹10 लाख का लक्ष्य') }),
    sc('think', fill(t('It depends on how long you have, and on the growth you assume: here {r}% a year.', 'यह इस पर निर्भर है कि कितना समय है, और आप कितनी बढ़त मानते हैं: यहाँ {r}% सालाना।'), { r: GS.rate }), { prop: { kind: 'steps', items: [t('₹10 lakh to reach', '₹10 लाख पाने हैं'), t('Years you have', 'आपके पास साल'), fill(t('{r}% a year, assumed', '{r}% सालाना, अनुमान'), { r: GS.rate })] } }),
    sc('surprised', fill(t('In 5 years you would save about {a} a month. In 10 years, about {b}.', '5 साल में लगभग {a} महीना बचाना होगा। 10 साल में लगभग {b}।'), { a: money(gs5), b: money(gs10) }), { prop: { kind: 'bars', items: [{ label: t('5 years', '5 साल'), value: gs5, text: money(gs5), tone: 'gold' }, { label: t('10 years', '10 साल'), value: gs10, text: money(gs10), tone: 'teal' }] } }),
    sc('happy', t('More time means a smaller monthly amount, because growth does more of the work.', 'ज़्यादा समय का मतलब छोटी मासिक रकम, क्योंकि बढ़त ज़्यादा काम करती है।')),
    sc('worry', fill(t('{r}% is an assumption, not a promise. Real growth varies.', '{r}% अनुमान है, वादा नहीं। असली बढ़त बदलती है।'), { r: GS.rate }), { prop: { kind: 'shield', text: t('An assumption', 'अनुमान'), sub: t('It varies', 'यह बदलता है') } }),
    sc('cheer', t('Start with the time you have, then work out the amount.', 'जितना समय है उससे शुरू करें, फिर रकम निकालें।')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'slider', q: t('Drag the years to see the monthly amount.', 'साल खिसकाकर देखें कि महीने की रकम कितनी बनती है।'), label: t('Years until the goal', 'लक्ष्य तक के साल'), unit: t('years', 'साल'), min: 3, max: 15, step: 1, start: 7,
      model: { kind: 'goal-sip', target: GS.target, rate: GS.rate },
      takeaway: t('To reach {base} in {x} years, you would save about {value} a month, putting in {put}. The rest is assumed growth.', '{x} साल में {base} पाने के लिए आपको लगभग {value} महीना बचाना होगा, यानी {put} आप लगाते हैं। बाक़ी अनुमानित बढ़त है।') },
  },
  quiz: { q: t('Why does a longer time make the monthly amount smaller?', 'ज़्यादा समय से मासिक रकम छोटी क्यों हो जाती है?'),
    options: [t('Growth has longer to do the work', 'बढ़त को काम करने का ज़्यादा समय मिलता है'), t('The goal gets smaller', 'लक्ष्य छोटा हो जाता है'), t('Banks lower the price', 'बैंक क़ीमत घटा देते हैं')], answer: 0,
    why: t('Money set aside earlier has longer to grow, so less of the goal has to come from your own pocket.', 'पहले अलग रखे पैसे को बढ़ने का ज़्यादा समय मिलता है, इसलिए लक्ष्य का कम हिस्सा आपकी जेब से आना पड़ता है।') },
};

// ── 14. What-if slider: how long a retirement corpus lasts ──────────────────────────────────────────────────────────
const CS = { corpus: 10_000_000, rate: 7 };
const lasts40 = monthsToDeplete(CS.corpus, CS.rate, 70_000) / 12, lasts60 = monthsToDeplete(CS.corpus, CS.rate, 100_000) / 12;
const corpusSlide: Reel = {
  id: 'corpus-spend-slide', topic: 'retire', tags: ['retirement', 'withdrawal', 'what-if'],
  title: t('How long does a corpus last?', 'एक कोष कितना चलता है?'),
  scenes: [
    sc('think', t('Imagine ₹1 crore set aside for retirement. How much can you take out each month?', 'सोचिए रिटायरमेंट के लिए ₹1 करोड़ अलग रखा है। हर महीने कितना निकाल सकते हैं?'), { big: t('₹1 crore corpus', '₹1 करोड़ का कोष') }),
    sc('think', fill(t('While you take money out, what is left keeps growing: here about {r}% a year, assumed.', 'जब आप पैसा निकालते हैं, बचा हुआ बढ़ता रहता है: यहाँ लगभग {r}% सालाना, अनुमान।'), { r: CS.rate }), { prop: { kind: 'steps', items: [t('₹1 crore to start', 'शुरू में ₹1 करोड़'), t('A monthly withdrawal', 'हर महीने की निकासी'), fill(t('{r}% a year, assumed', '{r}% सालाना, अनुमान'), { r: CS.rate })] } }),
    sc('surprised', fill(t('Taking ₹70,000 a month lasts about {a} years. Taking ₹1 lakh lasts about {b}.', 'महीने में ₹70,000 निकालें तो लगभग {a} साल चलता है। ₹1 लाख निकालें तो लगभग {b}।'), { a: Math.round(lasts40), b: Math.round(lasts60) }), { prop: { kind: 'bars', items: [{ label: t('₹70,000', '₹70,000'), value: lasts40, text: fill(t('{y} yrs', '{y} साल'), { y: Math.round(lasts40) }), tone: 'teal' }, { label: t('₹1 lakh', '₹1 लाख'), value: lasts60, text: fill(t('{y} yrs', '{y} साल'), { y: Math.round(lasts60) }), tone: 'gold' }] } }),
    sc('think', t('Take out less than the growth and the corpus can last a very long time.', 'वृद्धि से कम निकालें तो कोष बहुत लंबे समय तक चल सकता है।')),
    sc('worry', fill(t('{r}% is an assumption. A bad year early on can change the result a lot.', '{r}% एक अनुमान है। शुरू का एक बुरा साल नतीजे को काफ़ी बदल सकता है।'), { r: CS.rate }), { prop: { kind: 'shield', text: t('An assumption', 'अनुमान'), sub: t('Check it yearly', 'हर साल जाँचें') } }),
    sc('cheer', t('Choose a withdrawal you can sustain, and review it every year.', 'ऐसी निकासी चुनें जो टिक सके, और हर साल उसे जाँचें।')),
  ],
  poke: {
    after: 1,
    beat: { kind: 'slider', q: t('Drag the monthly withdrawal to see how long ₹1 crore lasts.', 'मासिक निकासी खिसकाकर देखें कि ₹1 करोड़ कितना चलता है।'), label: t('Taken out each month', 'हर महीने निकालें'), unit: t('per month', 'प्रति माह'), xFormat: 'inr', min: 30_000, max: 120_000, step: 5_000, start: 70_000,
      model: { kind: 'corpus-spend', corpus: CS.corpus, rate: CS.rate },
      takeaway: t('Taking {x} a month, the corpus lasts about {value}, at an assumed 7% growth. Taking less makes it last longer.', 'महीने में {x} निकालने पर कोष लगभग {value} चलता है, अनुमानित 7% बढ़त पर। कम निकालने से यह और लंबा चलता है।') },
  },
  quiz: { q: t('What happens to how long a corpus lasts when you take out less each month?', 'हर महीने कम निकालें तो कोष कितना चलता है?'),
    options: [t('It lasts longer', 'ज़्यादा चलता है'), t('It lasts the same', 'उतना ही चलता है'), t('It runs out sooner', 'जल्दी ख़त्म होता है')], answer: 0,
    why: t('A smaller withdrawal leaves more to keep growing, so the corpus lasts longer.', 'कम निकासी से ज़्यादा पैसा बढ़ता रहता है, इसलिए कोष ज़्यादा चलता है।') },
};

export const PLAY_REELS: Reel[] = [guessSip, guessEmi, delayCost, inflationSlide, mythsMoney, mythsScams, spotKyc, spotGroup, chooseBonus, sortNeeds, orderSalary, emiRateSlide, goalSipSlide, corpusSlide];
