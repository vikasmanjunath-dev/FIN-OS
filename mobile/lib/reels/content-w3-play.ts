// Wave 3, part 3: guess-first reels, what-if sliders and choose-your-path reels. The viewer pauses the reel to do something; nothing is a test.
// Every figure comes from figures.ts (or debt.ts), and the slider models are the ones in lib/reels/beats.ts.
import { calcPrepayment } from '@/lib/debt';
import { niceRound } from '@/lib/reels/beats';
import { emi, fill, grownCost, lumpsumValue, money, pctOf, sipFutureValue, stepUpSipFutureValue, unpaidBalance, yearlyDepositsValue } from '@/lib/reels/figures';
import { readMs, sc, t } from '@/lib/reels/kit';
import type { CastId } from '@/lib/reels/cast';
import type { L, Reel, Topic } from '@/lib/reels/types';

const atLeast = (say: L, ms: number) => ({ ms: Math.max(readMs(say), ms) });
const band = (answer: number) => ({ min: Math.max(1000, niceRound(answer / 10)), max: niceRound(answer * 10) });

// ── Guess first ──────────────────────────────────────────────────────────────────────────────────────────────────
interface GuessArgs {
  id: string; topic: Topic; title: L; tags: string[]; hook: L; setupCaption: L; setupSteps: L[];
  q: L; answer: number; reveal: L; resultCaption: L; resultBars: [L, number, L, number];  // two bars: label, value
  caveat: L; close: L; quiz: Reel['quiz'];
}
export function guess(a: GuessArgs): Reel {
  const [la, va, lb, vb] = a.resultBars;
  const { min, max } = band(a.answer);
  return {
    id: a.id, topic: a.topic, tags: ['guess', ...a.tags], title: a.title,
    scenes: [
      sc('surprised', a.hook, atLeast(a.hook, 4400)),
      sc('think', a.setupCaption, { prop: { kind: 'steps', items: a.setupSteps }, ...atLeast(a.setupCaption, 4600) }),
      sc('happy', a.resultCaption, { prop: { kind: 'bars', items: [{ label: la, value: va, text: money(va), tone: 'gold' }, { label: lb, value: vb, text: money(vb), tone: 'teal' }] }, ...atLeast(a.resultCaption, 4800) }),
      sc('worry', a.caveat, atLeast(a.caveat, 4400)),
      sc('cheer', a.close, atLeast(a.close, 3800)),
    ],
    poke: { after: 1, beat: { kind: 'guess', q: a.q, min, max, answer: a.answer, reveal: a.reveal } },
    quiz: a.quiz,
  };
}

const D_OWED = 50_000, D_RATE = 3.5, D_END = unpaidBalance(D_OWED, D_RATE, 12);
const S_SIP = 1_000, S_YEARS = 25, S_RATE = 12, S_END = sipFutureValue(S_SIP, S_RATE, S_YEARS);
const R_NOW = 20_000, R_YEARS = 20, R_INF = 6, R_END = grownCost(R_NOW, R_INF, R_YEARS);
const F_AMT = 1_000_000, F_YEARS = 25, F_GROSS = 12, F_LOW = lumpsumValue(F_AMT, F_GROSS - 0.2, F_YEARS), F_HIGH = lumpsumValue(F_AMT, F_GROSS - 1.5, F_YEARS);
const P_DEP = 100_000, P_YEARS = 15, P_RATE = 7, P_END = yearlyDepositsValue(P_DEP, P_RATE, P_YEARS);
const H_LOAN = 5_000_000, H_RATE = 8.5, H_YEARS = 20, H_EMI = emi(H_LOAN, H_RATE, H_YEARS), H_INT = H_EMI * H_YEARS * 12 - H_LOAN;
const M_NOW = 100_000, M_RATE = 10, M_YEARS = 20, M_END = grownCost(M_NOW, M_RATE, M_YEARS);
const U_SIP = 10_000, U_STEP = 10, U_RATE = 12, U_YEARS = 20, U_FLAT = sipFutureValue(U_SIP, U_RATE, U_YEARS), U_END = stepUpSipFutureValue(U_SIP, U_STEP, U_RATE, U_YEARS);

export const GUESS_REELS: Reel[] = [
  guess({
    id: 'guess-card-dues', topic: 'credit', title: t('Guess first: a card bill left unpaid', 'पहले अंदाज़ा लगाइए: न चुकाया कार्ड बिल'), tags: ['credit card', 'interest'],
    hook: t('You carry a card bill of ₹50,000 and pay nothing for a year. What does it become?', 'आप पर ₹50,000 का कार्ड बिल है और साल भर कुछ नहीं चुकाते। वह कितना हो जाता है?'),
    setupCaption: fill(t('Take {o} at an assumed {r}% a month, with no payments for 12 months.', '{o} का बिल, मान लें {r}% महीना, 12 महीने कोई भुगतान नहीं।'), { o: money(D_OWED), r: D_RATE }),
    setupSteps: [t('₹50,000 owed', '₹50,000 बकाया'), t('3.5% interest a month', 'महीने का 3.5% ब्याज'), t('No payments for a year', 'साल भर भुगतान नहीं')],
    q: t('How much will you owe after a year?', 'एक साल बाद आप पर कितना बकाया होगा?'), answer: D_END,
    reveal: fill(t('About {e}. The bill grew by about {g} in a year, just from interest on interest.', 'लगभग {e}। बिल साल भर में लगभग {g} बढ़ा, सिर्फ़ ब्याज पर ब्याज से।'), { e: money(Math.round(D_END)), g: money(Math.round(D_END - D_OWED)) }),
    resultCaption: fill(t('{o} becomes about {e} in a year at that rate. That is more than half again.', '{o} उस दर पर साल में लगभग {e} हो जाता है। यह आधे से भी ज़्यादा की बढ़त है।'), { o: money(D_OWED), e: money(Math.round(D_END)) }),
    resultBars: [t('Today', 'आज'), D_OWED, t('In a year', 'साल बाद'), D_END],
    caveat: t('Your card’s rate may differ. Check your statement, and treat this as an illustration.', 'आपके कार्ड की दर अलग हो सकती है। स्टेटमेंट देखें, और इसे उदाहरण मानें।'),
    close: t('Pay the full bill when you can. If you cannot, ask the bank for a cheaper way to repay.', 'हो सके तो पूरा बिल चुकाएँ। न हो सके तो बैंक से चुकाने का सस्ता तरीक़ा पूछें।'),
    quiz: { q: t('Why does an unpaid card bill grow so fast?', 'न चुकाया कार्ड बिल इतनी तेज़ी से क्यों बढ़ता है?'), options: [t('Interest is charged every month, including on past interest', 'हर महीने ब्याज लगता है, पिछले ब्याज पर भी'), t('A flat yearly fee', 'सालाना तय शुल्क'), t('It does not grow', 'वह नहीं बढ़ता')], answer: 0,
      why: t('Each month’s interest joins the balance, so the next month’s interest is on more.', 'हर महीने का ब्याज बकाया में जुड़ता है, इसलिए अगले महीने का ब्याज ज़्यादा पर लगता है।') },
  }),
  guess({
    id: 'guess-small-sip', topic: 'invest', title: t('Guess first: a ₹1,000 SIP', 'पहले अंदाज़ा लगाइए: ₹1,000 की SIP'), tags: ['SIP', 'compounding'],
    hook: t('₹1,000 a month feels too small to matter. Does it?', 'महीने के ₹1,000 इतने कम लगते हैं कि फ़र्क़ नहीं पड़ता। क्या सच में?'),
    setupCaption: fill(t('Keep it up for {y} years, with growth at an assumed {r}% a year.', '{y} साल तक जारी रखें, मान लें हर साल {r}% बढ़त।'), { y: S_YEARS, r: S_RATE }),
    setupSteps: [t('₹1,000 every month', 'हर महीने ₹1,000'), t('25 years', '25 साल'), t('12% a year, assumed', '12% सालाना, अनुमानित')],
    q: t('What does ₹1,000 a month become in 25 years?', '25 साल में महीने के ₹1,000 कितने बनते हैं?'), answer: S_END,
    reveal: fill(t('About {e}. You put in only {p}. Time did the rest, at an assumed rate.', 'लगभग {e}। आपने सिर्फ़ {p} लगाए। बाक़ी समय ने किया, अनुमानित दर पर।'), { e: money(Math.round(S_END)), p: money(S_SIP * 12 * S_YEARS) }),
    resultCaption: fill(t('You put in {p} and it grows to about {e}.', 'आप {p} डालते हैं और वह बढ़कर लगभग {e} हो जाता है।'), { p: money(S_SIP * 12 * S_YEARS), e: money(Math.round(S_END)) }),
    resultBars: [t('You put in', 'आपने डाला'), S_SIP * 12 * S_YEARS, t('It grows to', 'बढ़कर'), S_END],
    caveat: t('The rate is an assumption, not a promise. Real returns go up and down.', 'दर एक अनुमान है, वादा नहीं। असली रिटर्न ऊपर-नीचे होते रहते हैं।'),
    close: t('Starting small beats waiting to start big.', 'छोटी शुरुआत बड़ी शुरुआत के इंतज़ार से बेहतर है।'),
    quiz: { q: t('What does most of the growth come from?', 'ज़्यादातर बढ़त किससे आती है?'), options: [t('Time and compounding', 'समय और चक्रवृद्धि'), t('The monthly amount alone', 'सिर्फ़ मासिक रकम'), t('Luck', 'क़िस्मत')], answer: 0,
      why: t('Early money has the longest to grow, and its growth grows too.', 'शुरू का पैसा सबसे लंबे समय बढ़ता है, और उसकी बढ़त भी बढ़ती है।') },
  }),
  guess({
    id: 'guess-rent-20y', topic: 'basics', title: t('Guess first: tomorrow’s rent', 'पहले अंदाज़ा लगाइए: कल का किराया'), tags: ['inflation', 'rent'],
    hook: t('Your rent is ₹20,000 a month today. Prices rise a little each year. What will the same home cost?', 'आज आपका किराया ₹20,000 महीना है। कीमतें हर साल थोड़ी बढ़ती हैं। उसी घर का किराया क्या होगा?'),
    setupCaption: fill(t('Say rent rises {r}% a year for {y} years.', 'मान लें किराया साल में {r}% बढ़ता है, {y} साल तक।'), { r: R_INF, y: R_YEARS }),
    setupSteps: [t('₹20,000 a month today', 'आज ₹20,000 महीना'), t('6% a year, assumed', '6% सालाना, अनुमानित'), t('20 years', '20 साल')],
    q: t('What would that rent be in 20 years?', '20 साल बाद वह किराया क्या होगा?'), answer: R_END,
    reveal: fill(t('About {e} a month, more than three times today’s. Small yearly rises add up.', 'महीने का लगभग {e}, आज के तीन गुने से ज़्यादा। छोटी सालाना बढ़त जुड़ती जाती है।'), { e: money(Math.round(R_END)) }),
    resultCaption: fill(t('{n} a month today becomes about {e} a month in {y} years.', 'आज का {n} महीना {y} साल में लगभग {e} महीना हो जाता है।'), { n: money(R_NOW), e: money(Math.round(R_END)), y: R_YEARS }),
    resultBars: [t('Today', 'आज'), R_NOW, t('In 20 years', '20 साल बाद'), R_END],
    caveat: t('Six percent is an assumption. Rent can rise faster or slower where you live.', 'छह प्रतिशत अनुमान है। आपके यहाँ किराया इससे तेज़ या धीमा बढ़ सकता है।'),
    close: t('Plan your future costs in future rupees.', 'भविष्य के ख़र्च भविष्य के रुपयों में सोचें।'),
    quiz: { q: t('Why will the same home cost more rent later?', 'वही घर बाद में महँगे किराये पर क्यों मिलेगा?'), options: [t('Prices keep rising over the years', 'सालों में कीमतें बढ़ती रहती हैं'), t('Homes get smaller', 'घर छोटे हो जाते हैं'), t('Landlords decide on a whim', 'मकान-मालिक मनमर्ज़ी करते हैं')], answer: 0,
      why: t('Costs compound year after year, so a small rise becomes a big gap.', 'लागतें साल-दर-साल जुड़ती हैं, इसलिए छोटी बढ़त बड़ा अंतर बन जाती है।') },
  }),
  guess({
    id: 'guess-fee-gap', topic: 'invest', title: t('Guess first: what a 1% cost takes', 'पहले अंदाज़ा लगाइए: 1% ख़र्च कितना खाता है'), tags: ['costs', 'expense ratio'],
    hook: t('Two funds earn the same before costs. One charges 0.2% a year and the other 1.5%. Does the gap matter?', 'दो फ़ंड ख़र्च से पहले बराबर कमाते हैं। एक सालाना 0.2% लेता है, दूसरा 1.5%। क्या अंतर मायने रखता है?'),
    setupCaption: fill(t('Put in {a} for {y} years, at an assumed {g}% a year before costs.', '{a} {y} साल के लिए, ख़र्च से पहले मान लें {g}% सालाना।'), { a: money(F_AMT), y: F_YEARS, g: F_GROSS }),
    setupSteps: [t('₹10 lakh, once', '₹10 लाख, एक बार'), t('Same return before costs', 'ख़र्च से पहले एक-सा रिटर्न'), t('0.2% against 1.5% a year', '0.2% बनाम 1.5% सालाना')],
    q: t('After 25 years, how much more does the low-cost fund hold?', '25 साल बाद कम ख़र्च वाले फ़ंड में कितना ज़्यादा होगा?'), answer: F_LOW - F_HIGH,
    reveal: fill(t('About {d} more: {l} against {h}. A small yearly cost compounds into a big gap.', 'लगभग {d} ज़्यादा: {l} बनाम {h}। छोटा सालाना ख़र्च सालों में बड़ा अंतर बन जाता है।'), { d: money(Math.round(F_LOW - F_HIGH)), l: money(Math.round(F_LOW)), h: money(Math.round(F_HIGH)) }),
    resultCaption: fill(t('The low-cost fund ends near {l}, the high-cost one near {h}.', 'कम ख़र्च वाला फ़ंड लगभग {l} पर, ज़्यादा ख़र्च वाला लगभग {h} पर पहुँचता है।'), { l: money(Math.round(F_LOW)), h: money(Math.round(F_HIGH)) }),
    resultBars: [t('High cost', 'ज़्यादा ख़र्च'), F_HIGH, t('Low cost', 'कम ख़र्च'), F_LOW],
    caveat: t('Costs are examples, and returns are assumed. Real funds differ.', 'ख़र्च उदाहरण हैं और रिटर्न अनुमानित। असली फ़ंड अलग होते हैं।'),
    close: t('Compare costs before you choose, and check them each year.', 'चुनने से पहले ख़र्च की तुलना करें, और हर साल जाँचें।'),
    quiz: { q: t('Why does a small yearly cost matter?', 'छोटा सालाना ख़र्च क्यों मायने रखता है?'), options: [t('It is taken every year and compounds', 'वह हर साल कटता है और जुड़ता जाता है'), t('It is charged once', 'वह एक बार लगता है'), t('It does not matter', 'वह मायने नहीं रखता')], answer: 0,
      why: t('Money that goes in costs does not grow, and neither does its growth.', 'जो पैसा ख़र्च में जाता है वह नहीं बढ़ता, और उसकी बढ़त भी नहीं।') },
  }),
  guess({
    id: 'guess-ppf-15', topic: 'retire', title: t('Guess first: fifteen years of PPF', 'पहले अंदाज़ा लगाइए: पंद्रह साल की PPF'), tags: ['PPF', 'compounding'],
    hook: t('You put ₹1 lakh into a PPF every year for 15 years. What will it be worth?', 'आप 15 साल हर साल PPF में ₹1 लाख डालते हैं। उसकी क़ीमत क्या होगी?'),
    setupCaption: fill(t('Say the rate stays at {r}% a year for all {y} years. It really changes, so this is an illustration.', 'मान लें दर {y} सालों तक {r}% सालाना रहती है। असल में बदलती है, इसलिए यह उदाहरण है।'), { r: P_RATE, y: P_YEARS }),
    setupSteps: [t('₹1 lakh a year', 'साल का ₹1 लाख'), t('15 years', '15 साल'), t('7% a year, assumed', '7% सालाना, अनुमानित')],
    q: t('What would the account hold at the end?', 'अंत में खाते में कितना होगा?'), answer: P_END,
    reveal: fill(t('About {e}. You put in {p}, so the rest is interest.', 'लगभग {e}। आपने {p} डाले, बाक़ी ब्याज है।'), { e: money(Math.round(P_END)), p: money(P_DEP * P_YEARS) }),
    resultCaption: fill(t('{p} put in becomes about {e}.', 'डाले हुए {p} बढ़कर लगभग {e} हो जाते हैं।'), { p: money(P_DEP * P_YEARS), e: money(Math.round(P_END)) }),
    resultBars: [t('You put in', 'आपने डाला'), P_DEP * P_YEARS, t('It ends near', 'अंत में'), P_END],
    caveat: t('The government resets the rate every quarter, and your money is locked in. The real figure will differ.', 'सरकार हर तिमाही दर बदलती है, और पैसा बँधा रहता है। असली आँकड़ा अलग होगा।'),
    close: t('A steady yearly habit does the heavy lifting here.', 'यहाँ सालाना की स्थिर आदत भारी काम करती है।'),
    quiz: { q: t('Why does the PPF figure differ from a straight total of deposits?', 'PPF का आँकड़ा जमा के सीधे जोड़ से अलग क्यों है?'), options: [t('Interest is added and itself earns interest', 'ब्याज जुड़ता है और उस पर भी ब्याज मिलता है'), t('The bank adds a bonus', 'बैंक बोनस जोड़ता है'), t('It is not different', 'वह अलग नहीं है')], answer: 0,
      why: t('Each year’s interest joins the balance, so later interest is on more.', 'हर साल का ब्याज बैलेंस में जुड़ता है, इसलिए बाद का ब्याज ज़्यादा पर लगता है।') },
  }),
  guess({
    id: 'guess-home-interest', topic: 'loans', title: t('Guess first: the interest on a home loan', 'पहले अंदाज़ा लगाइए: होम लोन का ब्याज'), tags: ['home loan', 'interest'],
    hook: t('You borrow ₹50 lakh for a home. Over 20 years, how much of what you pay is interest?', 'आप घर के लिए ₹50 लाख उधार लेते हैं। 20 साल में आप जो चुकाते हैं उसमें ब्याज कितना है?'),
    setupCaption: fill(t('Take {l} at an assumed {r}% for {y} years, paid as an EMI every month.', '{l} का लोन, मान लें {r}%, {y} साल, हर महीने EMI से चुकाना।'), { l: money(H_LOAN), r: H_RATE, y: H_YEARS }),
    setupSteps: [t('₹50 lakh borrowed', '₹50 लाख उधार'), t('8.5% a year, assumed', '8.5% सालाना, अनुमानित'), t('20 years of EMIs', '20 साल की EMI')],
    q: t('How much interest will you pay in all?', 'कुल कितना ब्याज चुकाएँगे?'), answer: H_INT,
    reveal: fill(t('About {i}, on a loan of {l}. The EMI is about {e} a month.', '{l} के लोन पर लगभग {i}। EMI लगभग {e} महीना।'), { i: money(Math.round(H_INT)), l: money(H_LOAN), e: money(Math.round(H_EMI)) }),
    resultCaption: fill(t('You borrow {l} and repay about {t} in total.', 'आप {l} उधार लेते हैं और कुल लगभग {t} चुकाते हैं।'), { l: money(H_LOAN), t: money(Math.round(H_LOAN + H_INT)) }),
    resultBars: [t('Borrowed', 'उधार'), H_LOAN, t('You repay', 'आप चुकाते'), H_LOAN + H_INT],
    caveat: t('Your rate may change, since most home loans are floating. This is an illustration.', 'आपकी दर बदल सकती है, क्योंकि ज़्यादातर होम लोन फ़्लोटिंग हैं। यह उदाहरण है।'),
    close: t('Look at the total, not only the EMI, before you sign.', 'दस्तख़त से पहले सिर्फ़ EMI नहीं, कुल रकम देखें।'),
    quiz: { q: t('What is the best way to compare two loans?', 'दो लोन की तुलना का अच्छा तरीक़ा क्या है?'), options: [t('Their total cost over the full term', 'पूरी अवधि की उनकी कुल लागत'), t('Only the EMI', 'सिर्फ़ EMI'), t('The bank’s name', 'बैंक का नाम')], answer: 0,
      why: t('Two loans with the same EMI can cost very different totals.', 'एक-सी EMI वाले दो लोन की कुल लागत बहुत अलग हो सकती है।') },
  }),
  guess({
    id: 'guess-medical-20y', topic: 'protect', title: t('Guess first: tomorrow’s hospital bill', 'पहले अंदाज़ा लगाइए: कल का अस्पताल बिल'), tags: ['health', 'inflation'],
    hook: t('A treatment costs ₹1 lakh today. Medical costs tend to rise faster than other prices.', 'आज एक इलाज ₹1 लाख का है। इलाज का ख़र्च दूसरी कीमतों से तेज़ बढ़ता है।'),
    setupCaption: fill(t('Say medical costs rise {r}% a year, for {y} years.', 'मान लें इलाज का ख़र्च साल में {r}% बढ़ता है, {y} साल तक।'), { r: M_RATE, y: M_YEARS }),
    setupSteps: [t('₹1 lakh today', 'आज ₹1 लाख'), t('10% a year, assumed', '10% सालाना, अनुमानित'), t('20 years', '20 साल')],
    q: t('What would the same treatment cost then?', 'तब वही इलाज कितने का होगा?'), answer: M_END,
    reveal: fill(t('About {e}, close to seven times today’s bill. This is why cover needs a regular review.', 'लगभग {e}, आज के बिल का क़रीब सात गुना। इसीलिए कवर की नियमित समीक्षा ज़रूरी है।'), { e: money(Math.round(M_END)) }),
    resultCaption: fill(t('{n} today becomes about {e} in {y} years.', 'आज का {n} {y} साल में लगभग {e} हो जाता है।'), { n: money(M_NOW), e: money(Math.round(M_END)), y: M_YEARS }),
    resultBars: [t('Today', 'आज'), M_NOW, t('In 20 years', '20 साल बाद'), M_END],
    caveat: t('Ten percent is an assumption. Real rises vary by treatment and city.', 'दस प्रतिशत अनुमान है। असली बढ़त इलाज और शहर पर निर्भर है।'),
    close: t('Review your health cover every few years, and do not wait for a bill.', 'हर कुछ साल हेल्थ कवर देखें, और बिल आने का इंतज़ार न करें।'),
    quiz: { q: t('What does this tell you about health cover?', 'यह हेल्थ कवर के बारे में क्या बताता है?'), options: [t('A cover set years ago may fall short', 'सालों पहले तय कवर कम पड़ सकता है'), t('Cover never needs a review', 'कवर को समीक्षा नहीं चाहिए'), t('Costs fall with time', 'ख़र्च समय के साथ घटता है')], answer: 0,
      why: t('Costs rise, so the sum insured that felt generous can become thin.', 'ख़र्च बढ़ता है, इसलिए जो बीमित राशि बड़ी लगती थी वह कम पड़ सकती है।') },
  }),
  guess({
    id: 'guess-step-up', topic: 'goals', title: t('Guess first: a SIP that rises with your pay', 'पहले अंदाज़ा लगाइए: वेतन के साथ बढ़ती SIP'), tags: ['SIP', 'step-up'],
    hook: t('Your pay rises every year. What if your SIP rises with it, by a little?', 'आपका वेतन हर साल बढ़ता है। अगर SIP भी थोड़ी-सी बढ़ती जाए तो?'),
    setupCaption: fill(t('Start at {s} a month and raise it {p}% every year, for {y} years, at an assumed {r}% a year.', '{s} महीना से शुरू करें और हर साल {p}% बढ़ाएँ, {y} साल, मान लें {r}% सालाना।'), { s: money(U_SIP), p: U_STEP, y: U_YEARS, r: U_RATE }),
    setupSteps: [t('₹10,000 a month to start', 'शुरुआत में ₹10,000 महीना'), t('Raised 10% each year', 'हर साल 10% बढ़ोतरी'), t('20 years', '20 साल')],
    q: t('What would it be worth after 20 years?', '20 साल बाद उसकी क़ीमत क्या होगी?'), answer: U_END,
    reveal: fill(t('About {e}. The same SIP kept flat would reach about {f}.', 'लगभग {e}। वही SIP स्थिर रहे तो लगभग {f} तक पहुँचती।'), { e: money(Math.round(U_END)), f: money(Math.round(U_FLAT)) }),
    resultCaption: fill(t('Stepping up reaches about {e}. Staying flat reaches about {f}.', 'हर साल बढ़ाने पर लगभग {e}। स्थिर रखने पर लगभग {f}।'), { e: money(Math.round(U_END)), f: money(Math.round(U_FLAT)) }),
    resultBars: [t('Flat SIP', 'स्थिर SIP'), U_FLAT, t('Stepped up', 'हर साल बढ़ाई'), U_END],
    caveat: t('The return is an assumption. What helps is the habit of raising the amount.', 'रिटर्न अनुमान है। मदद करती है रकम बढ़ाने की आदत।'),
    close: t('Pick a month each year, like after your raise, to step your SIP up.', 'हर साल एक महीना चुनें, जैसे वेतन बढ़ने के बाद, SIP बढ़ाने के लिए।'),
    quiz: { q: t('Why does a rising SIP end higher?', 'बढ़ती SIP अंत में ज़्यादा क्यों होती है?'), options: [t('More money goes in, and it grows too', 'ज़्यादा पैसा जाता है, और वह भी बढ़ता है'), t('The return is higher', 'रिटर्न ज़्यादा है'), t('Banks reward it', 'बैंक उसे इनाम देते हैं')], answer: 0,
      why: t('Each year’s extra deposit also gets time to grow.', 'हर साल की अतिरिक्त जमा को भी बढ़ने का समय मिलता है।') },
  }),
];

// ── What-if sliders ──────────────────────────────────────────────────────────────────────────────────────────────
interface SlideArgs {
  id: string; topic: Topic; title: L; tags: string[]; hook: L; setupCaption: L; setupSteps: L[]; resultCaption: L; caveat: L; close: L;
  beat: Extract<NonNullable<Reel['poke']>['beat'], { kind: 'slider' }>; quiz: Reel['quiz'];
}
export function slide(a: SlideArgs): Reel {
  return {
    id: a.id, topic: a.topic, tags: ['slider', ...a.tags], title: a.title,
    scenes: [
      sc('surprised', a.hook, atLeast(a.hook, 4400)), sc('think', a.setupCaption, { prop: { kind: 'steps', items: a.setupSteps }, ...atLeast(a.setupCaption, 4600) }),
      sc('happy', a.resultCaption, atLeast(a.resultCaption, 4800)), sc('worry', a.caveat, atLeast(a.caveat, 4400)), sc('cheer', a.close, atLeast(a.close, 3800)),
    ],
    poke: { after: 1, beat: a.beat }, quiz: a.quiz,
  };
}
const yearsUnit = t('years', 'साल');

export const SLIDE_REELS: Reel[] = [
  slide({
    id: 'slide-start-late', topic: 'invest', title: t('Drag it: what waiting to start costs', 'खिसकाइए: शुरू करने में देरी की क़ीमत'), tags: ['SIP', 'delay'],
    hook: t('Every year you wait to start a SIP seems small. Drag the slider to see what it adds up to.', 'SIP शुरू करने में हर साल की देरी छोटी लगती है। स्लाइडर खिसकाकर देखें कुल कितनी होती है।'),
    setupCaption: t('A SIP of ₹10,000 a month, for a 30-year horizon, at an assumed 12% a year.', '₹10,000 की मासिक SIP, 30 साल का दायरा, मान लें 12% सालाना।'),
    setupSteps: [t('₹10,000 a month', 'महीने का ₹10,000'), t('30-year horizon', '30 साल का दायरा'), t('12% a year, assumed', '12% सालाना, अनुमानित')],
    resultCaption: t('The first years of investing do the most work, so the wait costs more than the deposits you skip.', 'निवेश के शुरू के साल सबसे ज़्यादा काम करते हैं, इसलिए इंतज़ार की क़ीमत छोड़ी हुई जमा से ज़्यादा है।'),
    caveat: t('The rate is an assumption. The pattern, that early years matter most, holds for any positive rate.', 'दर अनुमान है। पैटर्न, कि शुरू के साल सबसे ज़्यादा मायने रखते हैं, किसी भी धनात्मक दर पर सही है।'),
    close: t('The best time to start was earlier. The next best is this month.', 'सबसे अच्छा समय पहले था। उसके बाद का सबसे अच्छा समय इसी महीने है।'),
    beat: { kind: 'slider', q: t('Drag to see what a delay costs a ₹10,000 SIP.', 'खिसकाकर देखें ₹10,000 की SIP में देरी की क्या क़ीमत है।'), label: t('Years you wait before starting', 'शुरू करने से पहले इंतज़ार के साल'), unit: yearsUnit, min: 0, max: 15, step: 1, start: 5,
      model: { kind: 'sip-delay', monthly: 10_000, rate: 12, horizon: 30 }, takeaway: t('Wait {x} years: about {value} instead of {base}. The wait costs about {lost}.', '{x} साल रुकें: {base} की जगह लगभग {value}। इंतज़ार की क़ीमत लगभग {lost}।') },
    quiz: { q: t('Why does a delay cost more than the deposits skipped?', 'देरी की क़ीमत छोड़ी जमा से ज़्यादा क्यों है?'), options: [t('Early money has the longest time to grow', 'शुरू के पैसे को बढ़ने का सबसे लंबा समय मिलता है'), t('Banks fine late starters', 'बैंक देर से शुरू करने वालों पर जुर्माना लगाते हैं'), t('Returns fall later', 'बाद में रिटर्न घटते हैं')], answer: 0,
      why: t('Growth builds on earlier growth, so the first years matter most.', 'बढ़त पर बढ़त मिलती है, इसलिए शुरू के साल सबसे अहम हैं।') },
  }),
  slide({
    id: 'slide-sip-length', topic: 'invest', title: t('Drag it: how long you keep a SIP going', 'खिसकाइए: SIP कितने साल चलाएँ'), tags: ['SIP', 'years'],
    hook: t('A small SIP and a long time. Drag the years to watch the money grow.', 'छोटी SIP और लंबा समय। साल खिसकाकर पैसा बढ़ता देखें।'),
    setupCaption: t('A SIP of ₹3,000 a month, at an assumed 12% a year.', '₹3,000 की मासिक SIP, मान लें 12% सालाना।'),
    setupSteps: [t('₹3,000 a month', 'महीने का ₹3,000'), t('12% a year, assumed', '12% सालाना, अनुमानित'), t('You choose the years', 'साल आप चुनें')],
    resultCaption: t('The line curves upward: the later years add far more than the early ones, because growth builds on growth.', 'रेखा ऊपर की ओर मुड़ती है: बाद के साल शुरू के सालों से कहीं ज़्यादा जोड़ते हैं, क्योंकि बढ़त पर बढ़त मिलती है।'),
    caveat: t('Returns are assumed, and real ones move up and down, so the path will not be smooth.', 'रिटर्न अनुमानित हैं, और असली ऊपर-नीचे होते हैं, इसलिए रास्ता सीधा नहीं होगा।'),
    close: t('Staying in for the long run is the part you control.', 'लंबे समय तक टिके रहना वह हिस्सा है जो आपके हाथ में है।'),
    beat: { kind: 'slider', q: t('Drag the years to see what ₹3,000 a month becomes.', 'साल खिसकाकर देखें ₹3,000 महीना क्या बनता है।'), label: t('Years you keep it going', 'आप उसे कितने साल चलाते हैं'), unit: yearsUnit, min: 1, max: 35, step: 1, start: 10,
      model: { kind: 'sip-years', monthly: 3_000, rate: 12 }, takeaway: t('After {x} years you put in {put}, and it is about {value}, at an assumed 12% a year.', '{x} साल बाद आप {put} डालते हैं और वह लगभग {value} है, मान लें 12% सालाना।') },
    quiz: { q: t('What happens to growth in the later years?', 'बाद के सालों में बढ़त का क्या होता है?'), options: [t('It adds more each year', 'हर साल ज़्यादा जोड़ती है'), t('It stops', 'वह रुक जाती है'), t('It stays the same', 'वह एक-सी रहती है')], answer: 0,
      why: t('The bigger the balance, the more a year’s growth adds.', 'बैलेंस जितना बड़ा, एक साल की बढ़त उतना ज़्यादा जोड़ती है।') },
  }),
  slide({
    id: 'slide-rent-power', topic: 'basics', title: t('Drag it: what today’s ₹25,000 buys later', 'खिसकाइए: आज का ₹25,000 आगे क्या ख़रीदेगा'), tags: ['inflation', 'salary'],
    hook: t('Your monthly income stays at ₹25,000 and prices rise. Drag the years to see what it buys.', 'आपकी मासिक आय ₹25,000 पर टिकी है और कीमतें बढ़ती हैं। साल खिसकाकर देखें वह क्या ख़रीदती है।'),
    setupCaption: t('Say prices rise 6% a year, and the income does not change.', 'मान लें कीमतें साल में 6% बढ़ती हैं, और आय नहीं बदलती।'),
    setupSteps: [t('₹25,000, unchanged', '₹25,000, अपरिवर्तित'), t('Prices up 6% a year', 'कीमतें साल में 6% ऊपर'), t('You choose the years', 'साल आप चुनें')],
    resultCaption: t('The rupees are the same, but each buys less. That is why income, too, has to keep rising.', 'रुपये वही हैं, पर हर रुपया कम ख़रीदता है। इसीलिए आय को भी बढ़ते रहना चाहिए।'),
    caveat: t('Six percent is an assumption. Your own cost of living may rise faster or slower.', 'छह प्रतिशत अनुमान है। आपका अपना जीवन-ख़र्च इससे तेज़ या धीमा बढ़ सकता है।'),
    close: t('Ask for raises, and save for the years when prices are higher.', 'इन्क्रीमेंट माँगें, और उन सालों के लिए बचाएँ जब कीमतें ज़्यादा होंगी।'),
    beat: { kind: 'slider', q: t('Drag the years to see what ₹25,000 buys later.', 'साल खिसकाकर देखें आगे ₹25,000 से क्या मिलता है।'), label: t('Years from now', 'अब से कितने साल'), unit: yearsUnit, min: 0, max: 30, step: 1, start: 10,
      model: { kind: 'inflation-years', amount: 25_000, rate: 6 }, takeaway: t('In {x} years ₹25,000 buys what about {value} buys today, at an assumed 6% a year.', '{x} साल बाद ₹25,000 से उतना मिलेगा जितना आज लगभग {value} में मिलता है, मान लें 6% सालाना।') },
    quiz: { q: t('Why must income keep rising?', 'आय को बढ़ते क्यों रहना चाहिए?'), options: [t('Prices rise, so the same amount buys less', 'कीमतें बढ़ती हैं, इसलिए वही रकम कम ख़रीदती है'), t('Banks demand it', 'बैंक इसकी माँग करते हैं'), t('Taxes fall', 'टैक्स घटता है')], answer: 0,
      why: t('Real income only grows if it rises faster than prices.', 'असली आय तभी बढ़ती है जब वह कीमतों से तेज़ बढ़े।') },
  }),
  slide({
    id: 'slide-cash-cupboard', topic: 'basics', title: t('Drag it: ₹10 lakh left idle', 'खिसकाइए: ₹10 लाख जो पड़े रहे'), tags: ['inflation', 'idle cash'],
    hook: t('₹10 lakh sits at home or in a low-interest account. Drag the years to see what it quietly loses.', '₹10 लाख घर में या कम ब्याज वाले खाते में पड़े हैं। साल खिसकाकर देखें वह चुपचाप क्या खोता है।'),
    setupCaption: t('Say prices rise 5% a year and the money earns nothing.', 'मान लें कीमतें साल में 5% बढ़ती हैं और पैसा कुछ नहीं कमाता।'),
    setupSteps: [t('₹10 lakh, idle', '₹10 लाख, बेकार'), t('Prices up 5% a year', 'कीमतें साल में 5% ऊपर'), t('You choose the years', 'साल आप चुनें')],
    resultCaption: t('The amount never changes, so it feels safe. Its buying power is what shrinks.', 'रकम कभी नहीं बदलती, इसलिए सुरक्षित लगती है। घटती है उसकी ख़रीदने की ताक़त।'),
    caveat: t('Idle money is right for an emergency fund. The point is about money you will not need for years.', 'आपातकालीन फ़ंड के लिए पड़ा पैसा ठीक है। बात उस पैसे की है जो सालों नहीं चाहिए।'),
    close: t('Match each rupee to a job and a timeline.', 'हर रुपये को एक काम और एक समय-सीमा से मिलाएँ।'),
    beat: { kind: 'slider', q: t('Drag the years to see what ₹10 lakh buys.', 'साल खिसकाकर देखें ₹10 लाख से क्या मिलता है।'), label: t('Years it sits idle', 'कितने साल पड़ा रहे'), unit: yearsUnit, min: 0, max: 25, step: 1, start: 10,
      model: { kind: 'inflation-years', amount: 1_000_000, rate: 5 }, takeaway: t('After {x} years, ₹10 lakh buys what about {value} buys today, at an assumed 5% a year.', '{x} साल बाद ₹10 लाख से उतना मिलेगा जितना आज लगभग {value} में मिलता है, मान लें 5% सालाना।') },
    quiz: { q: t('What shrinks when money sits idle?', 'पैसा पड़ा रहे तो क्या घटता है?'), options: [t('What it can buy', 'वह जो ख़रीद सकता है'), t('The number on the statement', 'स्टेटमेंट का आँकड़ा'), t('Nothing', 'कुछ नहीं')], answer: 0,
      why: t('The figure stays, but prices rise, so each rupee buys less.', 'आँकड़ा वही रहता है, पर कीमतें बढ़ती हैं, इसलिए हर रुपया कम ख़रीदता है।') },
  }),
];

// ── Choose your path ─────────────────────────────────────────────────────────────────────────────────────────────
interface PathArgs {
  id: string; topic: Topic; lesson?: string; who: CastId; title: L; tags: string[]; lines: [L, L, L, L, L]; // hook, setup caption, two takeaways, close
  q: L; setup: L; options: { label: L; result: L }[]; verdict: L; quiz: Reel['quiz'];
}
export function path(a: PathArgs): Reel {
  const [hook, setupCap, w1, w2, close] = a.lines;
  return {
    id: a.id, topic: a.topic, ...(a.lesson ? { lesson: a.lesson } : {}), tags: ['choose', ...a.tags], title: a.title,
    scenes: [sc('surprised', hook, { who: a.who, ...atLeast(hook, 4400) }), sc('think', setupCap, { who: a.who, ...atLeast(setupCap, 4400) }), sc('happy', w1, { who: a.who, ...atLeast(w1, 4800) }), sc('think', w2, atLeast(w2, 4600)), sc('cheer', close, { who: a.who, ...atLeast(close, 3800) })],
    poke: { after: 1, beat: { kind: 'path', q: a.q, setup: a.setup, options: a.options, verdict: a.verdict } },
    quiz: a.quiz,
  };
}

// raise
const RAISE = 10_000, R10 = (m: number) => sipFutureValue(m, 10, 10);
// card bill
const BILL = 40_000, SPARE = 15_000, MONTH_RATE = 3.5;
const carryFull = pctOf(BILL, MONTH_RATE), carryHalf = pctOf(BILL - SPARE, MONTH_RATE);
// car
const CAR = 800_000, SAVED = 300_000, C_RATE = 9, C_YEARS = 5;
const loanAll = emi(CAR, C_RATE, C_YEARS) * C_YEARS * 12 - CAR, loanPart = emi(CAR - SAVED, C_RATE, C_YEARS) * C_YEARS * 12 - (CAR - SAVED);
// two-year goal
const GOAL2 = 200_000, FD2 = lumpsumValue(GOAL2, 7, 2), UP2 = lumpsumValue(GOAL2, 12, 2), DOWN2 = lumpsumValue(GOAL2, -10, 2);
// spare monthly
const SP = 15_000, LOAN_BAL = 3_000_000, LOAN_RATE = 9, LOAN_EMI = Math.round(emi(LOAN_BAL, LOAN_RATE, 20));
const noExtra = calcPrepayment(LOAN_BAL, LOAN_RATE, LOAN_EMI, 0), withExtra = calcPrepayment(LOAN_BAL, LOAN_RATE, LOAN_EMI, SP);
const SP10 = sipFutureValue(SP, 12, 10);

export const PATH_REELS: Reel[] = [
  path({
    id: 'path-first-raise', who: 'neha', topic: 'goals', title: t('Choose: what Neha does with a raise', 'चुनें: इन्क्रीमेंट का नेहा क्या करे'), tags: ['raise', 'saving'],
    lines: [t('Neha gets a ₹10,000 monthly raise. What happens next is up to her.', 'नेहा को महीने के ₹10,000 का इन्क्रीमेंट मिलता है। आगे क्या हो, यह उस पर है।'),
      t('Each choice has a different result in ten years. Pick one and see where it leads.', 'हर चुनाव का दस साल में अलग नतीजा है। एक चुनें और देखें वह कहाँ ले जाता है।'),
      t('Spending all of a raise is a real choice, and people make it for good reasons.', 'पूरा इन्क्रीमेंट ख़र्च करना असली चुनाव है, और लोग अच्छे कारणों से करते हैं।'),
      t('What matters is that it is a choice, made before the money arrives.', 'मायने यह रखता है कि यह चुनाव है, पैसा आने से पहले किया गया।'),
      t('Decide your split before your next raise.', 'अगले इन्क्रीमेंट से पहले अपना बँटवारा तय करें।')],
    q: t('What does Neha do with the ₹10,000?', 'नेहा उन ₹10,000 का क्या करती है?'), setup: t('Pick one. You will see about ten years of each path.', 'एक चुनें। हर रास्ते के लगभग दस साल देखें।'),
    options: [
      { label: t('Spend it all', 'सब ख़र्च करे'), result: t('Her life is more comfortable from day one. After ten years there is nothing extra set aside from this raise.', 'पहले दिन से उसका जीवन आरामदायक होता है। दस साल बाद इस इन्क्रीमेंट से कुछ अलग जमा नहीं होता।') },
      { label: t('Save half', 'आधा बचाए'), result: fill(t('She saves {h} a month, and at an assumed 10% a year that is about {v} after ten years, and she still enjoys {h} more each month.', 'वह महीने के {h} बचाती है, और मान लें 10% सालाना पर दस साल में लगभग {v} बनता है, और वह हर महीने {h} ज़्यादा का आनंद भी लेती है।'), { h: money(RAISE / 2), v: money(Math.round(R10(RAISE / 2))) }) },
      { label: t('Save all of it', 'पूरा बचाए'), result: fill(t('She saves {a} a month, which could reach about {v} in ten years at an assumed 10%. It asks for more patience now.', 'वह महीने के {a} बचाती है, जो मान लें 10% पर दस साल में लगभग {v} तक पहुँच सकता है। इसमें अभी ज़्यादा धैर्य चाहिए।'), { a: money(RAISE), v: money(Math.round(R10(RAISE))) }) },
    ],
    verdict: t('There is no single winner. It depends on her goals, her debts and how stretched she feels. The numbers just show the trade-off.', 'कोई एक विजेता नहीं। यह उसके लक्ष्यों, क़र्ज़ों और खिंचाव पर निर्भर है। आँकड़े बस समझौता दिखाते हैं।'),
    quiz: { q: t('What does saving part of a raise do?', 'इन्क्रीमेंट का हिस्सा बचाने से क्या होता है?'), options: [t('Builds savings without cutting today’s income', 'आज की आय घटाए बिना बचत बनाता है'), t('Lowers her pay', 'उसका वेतन घटाता है'), t('Guarantees a return', 'रिटर्न की गारंटी देता है')], answer: 0,
      why: t('The raise is new money, so saving part of it does not shrink what she already lives on.', 'इन्क्रीमेंट नया पैसा है, इसलिए उसका हिस्सा बचाने से उसकी मौजूदा ज़िंदगी नहीं घटती।') },
  }),
  path({
    id: 'path-card-bill', who: 'dev', topic: 'credit', title: t('Choose: how Dev pays a card bill', 'चुनें: देव कार्ड बिल कैसे चुकाए'), tags: ['credit card', 'interest'],
    lines: [t('Dev has a ₹40,000 card bill and ₹15,000 spare this month.', 'देव का कार्ड बिल ₹40,000 का है और इस महीने उसके पास ₹15,000 बचे हैं।'),
      t('Three ways to handle it, with different costs next month.', 'इसे सँभालने के तीन तरीक़े, अगले महीने अलग लागत के साथ।'),
      t('Any unpaid part usually attracts interest every month, at a rate far above a loan’s.', 'न चुकाए हिस्से पर आम तौर पर हर महीने ब्याज लगता है, लोन से कहीं ऊँची दर पर।'),
      t('Check your own card’s rate, since it is the number that decides this.', 'अपने कार्ड की दर देखें, क्योंकि यही आँकड़ा इसे तय करता है।'),
      t('Pay the full bill whenever you can.', 'जब भी हो सके पूरा बिल चुकाएँ।')],
    q: t('How does Dev pay the bill?', 'देव बिल कैसे चुकाता है?'), setup: t('Pick one, then see what carrying the rest costs for a month.', 'एक चुनें, फिर देखें बाक़ी रकम एक महीना रखने की क्या लागत है।'),
    options: [
      { label: t('Pay only the minimum', 'सिर्फ़ न्यूनतम भरे'), result: fill(t('Almost all of {b} stays on the card. At an assumed {r}% a month, carrying it costs about {c} in interest for one month.', 'लगभग पूरा {b} कार्ड पर रहता है। मान लें {r}% महीना, उसे रखने का एक महीने का ब्याज लगभग {c}।'), { b: money(BILL), r: MONTH_RATE, c: money(Math.round(carryFull)) }) },
      { label: t('Pay ₹15,000 now', '₹15,000 अभी चुकाए'), result: fill(t('{o} stays on the card and costs about {c} in interest for a month. It is a step, not the end.', '{o} कार्ड पर रहता है और एक महीने का ब्याज लगभग {c}। यह एक क़दम है, अंत नहीं।'), { o: money(BILL - SPARE), c: money(Math.round(carryHalf)) }) },
      { label: t('Find the rest and pay in full', 'बाक़ी जुटाकर पूरा चुकाए'), result: t('No interest this month, and the habit starts clean. It may mean pausing something else for now.', 'इस महीने कोई ब्याज नहीं, और आदत साफ़ शुरू होती है। इसके लिए अभी कुछ और रोकना पड़ सकता है।') },
    ],
    verdict: t('Paying more of the bill costs less interest. What Dev can spare, and what else is due, decides how much he can pay.', 'बिल का ज़्यादा हिस्सा चुकाने पर ब्याज कम लगता है। देव कितना दे सकता है और और क्या देना है, वही तय करता है।'),
    quiz: { q: t('What does carrying a card balance cost?', 'कार्ड का बकाया रखने की लागत क्या है?'), options: [t('Interest every month on what is unpaid', 'हर महीने न चुकाई रकम पर ब्याज'), t('Nothing', 'कुछ नहीं'), t('A one-time fee only', 'सिर्फ़ एक बार का शुल्क')], answer: 0,
      why: t('The unpaid part is charged interest month after month until it is cleared.', 'न चुकाए हिस्से पर रकम चुकने तक महीने-दर-महीने ब्याज लगता है।') },
  }),
  path({
    id: 'path-car-payment', who: 'arjun', topic: 'loans', title: t('Choose: how Arjun pays for a car', 'चुनें: अर्जुन कार के लिए कैसे चुकाए'), tags: ['car', 'loan'],
    lines: [t('Arjun likes a ₹8 lakh car and has ₹3 lakh saved.', 'अर्जुन को ₹8 लाख की कार पसंद है और उसके पास ₹3 लाख की बचत है।'),
      t('Three ways to pay, each with a different cost and a different cushion left.', 'चुकाने के तीन तरीक़े, हर एक की अलग लागत और बचे हुए गद्दे की अलग मात्रा।'),
      t('Interest is the price of borrowing. A cushion is the price of being able to cope.', 'ब्याज उधार की क़ीमत है। गद्दा सँभल पाने की क़ीमत है।'),
      t('Compare the total paid, and how much savings you keep.', 'कुल चुकाई रकम की तुलना करें, और यह भी कि बचत कितनी रहती है।'),
      t('Decide how much of your savings you are willing to spend.', 'तय करें कि अपनी बचत का कितना ख़र्च करने को तैयार हैं।')],
    q: t('How does Arjun pay?', 'अर्जुन कैसे चुकाता है?'), setup: t('Pick one. Loans here are 5 years at an assumed 9%.', 'एक चुनें। यहाँ लोन 5 साल का है, मान लें 9%।'),
    options: [
      { label: t('Loan for the whole price', 'पूरी कीमत का लोन'), result: fill(t('He keeps his {s} savings, and pays about {i} in interest over five years.', 'वह अपनी {s} की बचत रखता है, और पाँच साल में लगभग {i} ब्याज देता है।'), { s: money(SAVED), i: money(Math.round(loanAll)) }) },
      { label: t('₹3 lakh down, loan for the rest', '₹3 लाख डाउन, बाक़ी का लोन'), result: fill(t('Interest falls to about {i}, but his savings fall to nothing, so any surprise needs a new loan.', 'ब्याज घटकर लगभग {i} रह जाता है, पर बचत शून्य हो जाती है, इसलिए कोई अनहोनी नया लोन माँगेगी।'), { i: money(Math.round(loanPart)) }) },
      { label: t('Wait and buy a cheaper car in cash', 'रुकें और सस्ती कार नक़द ख़रीदें'), result: t('No interest at all, and no EMI. It means a smaller car, or a longer wait, to keep his plans safe.', 'कोई ब्याज या EMI नहीं। इसका मतलब छोटी कार, या लंबा इंतज़ार, ताकि योजनाएँ सुरक्षित रहें।') },
    ],
    verdict: t('A bigger down payment costs less interest and leaves less cushion. A job, a family and other goals decide what is comfortable.', 'बड़ी डाउन पेमेंट में ब्याज कम और गद्दा कम होता है। नौकरी, परिवार और दूसरे लक्ष्य तय करते हैं कि क्या आरामदायक है।'),
    quiz: { q: t('What does a bigger down payment do?', 'बड़ी डाउन पेमेंट क्या करती है?'), options: [t('Cuts interest but uses savings', 'ब्याज घटाती है पर बचत लेती है'), t('Removes the EMI', 'EMI हटा देती है'), t('Raises the interest', 'ब्याज बढ़ाती है')], answer: 0,
      why: t('You borrow less, so you pay less interest, and you have less saved afterwards.', 'आप कम उधार लेते हैं, इसलिए कम ब्याज देते हैं, और बाद में बचत भी कम रहती है।') },
  }),
  path({
    id: 'path-two-year-goal', who: 'riya', topic: 'goals', title: t('Choose: where Riya keeps money she needs in 2 years', 'चुनें: 2 साल में चाहिए पैसा रिया कहाँ रखे'), tags: ['goal', 'risk'],
    lines: [t('Riya needs ₹2 lakh for a course in two years.', 'रिया को दो साल में एक कोर्स के लिए ₹2 लाख चाहिए।'),
      t('Three places to keep it, with very different ranges of results.', 'इसे रखने की तीन जगहें, नतीजों की बहुत अलग रेंज के साथ।'),
      t('A short deadline leaves little time to recover from a fall.', 'कम समय-सीमा में गिरावट से उबरने का समय नहीं मिलता।'),
      t('The question is not only what you might earn, but what you can afford to lose.', 'सवाल सिर्फ़ यह नहीं कि आप क्या कमा सकते हैं, बल्कि यह भी कि क्या खो सकते हैं।'),
      t('Match the place to the deadline.', 'जगह को समय-सीमा से मिलाएँ।')],
    q: t('Where does Riya keep the money?', 'रिया पैसा कहाँ रखती है?'), setup: t('Pick one. See a range of what it could be in two years.', 'एक चुनें। देखें दो साल में वह कितना हो सकता है।'),
    options: [
      { label: t('A fixed deposit', 'फ़िक्स्ड डिपॉज़िट'), result: fill(t('At an assumed 7% a year it grows to about {f}. The figure is known in advance, and it is slow.', 'मान लें 7% सालाना पर बढ़कर लगभग {f}। आँकड़ा पहले से पता है, और रफ़्तार धीमी है।'), { f: money(Math.round(FD2)) }) },
      { label: t('A share-based fund', 'शेयर आधारित फ़ंड'), result: fill(t('In a good stretch, at an assumed 12% a year, about {u}. In a bad stretch, at minus 10%, about {d}. She could end short of her goal.', 'अच्छे दौर में, मान लें 12% सालाना, लगभग {u}। बुरे दौर में, माइनस 10%, लगभग {d}। लक्ष्य से कम भी रह सकता है।'), { u: money(Math.round(UP2)), d: money(Math.round(DOWN2)) }) },
      { label: t('Keep it in the savings account', 'बचत खाते में रखे'), result: t('Easy to reach and steady, but it earns little, so prices may rise faster than the money grows.', 'आसानी से मिलता है और स्थिर है, पर कमाई कम है, इसलिए कीमतें पैसे से तेज़ बढ़ सकती हैं।') },
    ],
    verdict: t('A short deadline favours places where the amount is steady. Her comfort with risk and her backup plan decide it.', 'कम समय-सीमा में वे जगहें ठीक हैं जहाँ रकम स्थिर रहे। जोखिम से उसकी सहजता और बैकअप योजना तय करते हैं।'),
    quiz: { q: t('Why is a share fund a stretch for a two-year goal?', 'दो साल के लक्ष्य के लिए शेयर फ़ंड जोखिम भरा क्यों है?'), options: [t('A fall may not recover in time', 'गिरावट समय पर न उबरे'), t('It pays no returns', 'वह रिटर्न नहीं देता'), t('It is illegal', 'वह अवैध है')], answer: 0,
      why: t('With little time left, a market fall can leave the money below the goal.', 'कम समय बचा हो तो बाज़ार की गिरावट पैसे को लक्ष्य से नीचे छोड़ सकती है।') },
  }),
  path({
    id: 'path-spare-monthly', who: 'kabir', topic: 'goals', title: t('Choose: what Kabir does with ₹15,000 a month', 'चुनें: हर महीने के ₹15,000 का कबीर क्या करे'), tags: ['prepay', 'SIP', 'balance'],
    lines: [t('Kabir has ₹15,000 spare every month, a home loan, and a long way to retirement.', 'कबीर के पास हर महीने ₹15,000 बचते हैं, एक होम लोन है, और रिटायरमेंट बहुत दूर है।'),
      t('He can use it three ways. Each one is a trade between a sure saving and a hoped-for gain.', 'वह इसे तीन तरह से लगा सकता है। हर एक पक्की बचत और उम्मीद वाले लाभ के बीच का सौदा है।'),
      t('Prepaying saves interest for sure. Investing may earn more, or less.', 'प्रीपे पक्का ब्याज बचाता है। निवेश ज़्यादा या कम कमा सकता है।'),
      t('Splitting it keeps both going, with less of each.', 'बाँटने से दोनों चलते हैं, हर एक कम के साथ।'),
      t('Keep an emergency fund first, then decide.', 'पहले आपातकालीन फ़ंड रखें, फिर तय करें।')],
    q: t('What does Kabir do with the ₹15,000?', 'कबीर उन ₹15,000 का क्या करता है?'), setup: t('Pick one. Figures are over 10 years, for a ₹30 lakh loan at an assumed 9%.', 'एक चुनें। आँकड़े 10 साल के हैं, ₹30 लाख का लोन, मान लें 9%।'),
    options: [
      { label: t('Prepay the loan every month', 'हर महीने लोन प्रीपे करे'), result: fill(t('The loan ends about {y} years sooner and saves about {i} of interest. A sure result, equal to the loan’s rate.', 'लोन लगभग {y} साल पहले ख़त्म होता है और लगभग {i} का ब्याज बचता है। पक्का नतीजा, लोन की दर के बराबर।'), { y: Math.round((noExtra.months - withExtra.months) / 12), i: money(Math.round(noExtra.interest - withExtra.interest)) }) },
      { label: t('Invest it in a SIP', 'SIP में निवेश करे'), result: fill(t('At an assumed 12% a year, {s} a month could become about {v} in ten years. It is not certain, and may fall short.', 'मान लें 12% सालाना, {s} महीना दस साल में लगभग {v} हो सकता है। यह पक्का नहीं, और कम भी रह सकता है।'), { s: money(SP), v: money(Math.round(SP10)) }) },
      { label: t('Split it between both', 'दोनों में बाँटे'), result: t('He cuts some interest for sure and lets some money grow. It is a middle path, with half of each result.', 'वह कुछ ब्याज पक्का घटाता है और कुछ पैसा बढ़ने देता है। यह बीच का रास्ता है, हर नतीजे का आधा।') },
    ],
    verdict: t('There is no single answer. The loan’s rate, his comfort with risk and his other goals decide.', 'कोई एक जवाब नहीं। लोन की दर, जोखिम से उसकी सहजता और बाक़ी लक्ष्य तय करते हैं।'),
    quiz: { q: t('What is certain about prepaying a loan?', 'लोन प्रीपे करने के बारे में पक्का क्या है?'), options: [t('You stop paying that interest', 'आप वह ब्याज देना बंद कर देते हैं'), t('It beats investing', 'वह निवेश से बेहतर है'), t('It earns market returns', 'वह बाज़ार जैसा रिटर्न देता है')], answer: 0,
      why: t('The saving equals the loan’s rate. Whether that beats investing depends on the numbers and your risk.', 'बचत लोन की दर के बराबर है। यह निवेश से बेहतर है या नहीं, आँकड़ों और जोखिम पर निर्भर है।') },
  }),
];
