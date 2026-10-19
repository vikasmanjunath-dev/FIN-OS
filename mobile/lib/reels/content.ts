// The reels. Every figure comes from lib/reels/figures.ts; a sentence is a template with {gaps} for those figures.
// Rules (checked by __tests__/reels.test.mts): both languages everywhere, 20-45 s, short captions, one quiz with a valid answer,
// every number shown as an assumption or illustration, and no promise of returns or advice to buy something.
import { doublingYears, emi, fill, firstInstalment, hundredMinusAge, inflatedValue, money, sipFutureValue, unitsFor } from '@/lib/reels/figures';
import { CREDIT_REELS, GOAL_REELS, HOME_REELS, SAFETY_REELS } from '@/lib/reels/content-life';
import { RETIRE_REELS, TAX_REELS } from '@/lib/reels/content-tax';
import { BASICS_MORE, INVEST_MORE } from '@/lib/reels/content-more-a';
import { CREDIT_MORE, LOANS_MORE, PROTECT_MORE } from '@/lib/reels/content-more-b';
import { RETIRE_MORE, TAX_MORE } from '@/lib/reels/content-more-c';
import { GOALS_MORE, SAFETY_MORE } from '@/lib/reels/content-more-d';
import { ORDER_REELS, SLIDER2_REELS, SORT_REELS } from '@/lib/reels/content-w3-beats';
import { liveDrafts } from '@/lib/reels/drafts';
import { EXPLAIN_REELS } from '@/lib/reels/content-w3-explain';
import { MYTH_REELS } from '@/lib/reels/content-w3-myth';
import { GUESS_REELS, PATH_REELS, SLIDE_REELS } from '@/lib/reels/content-w3-play';
import { SPOT_REELS } from '@/lib/reels/content-w3-spot';
import type { L, Reel } from '@/lib/reels/types';

const t = (en: string, hi: string): L => ({ en, hi });

// ── 1. Start early ─────────────────────────────────────────────────────────────────────────────────────────────
const SIP_MONTHLY = 5000, SIP_RATE = 12;
const asha = sipFutureValue(SIP_MONTHLY, SIP_RATE, 30), ravi = sipFutureValue(SIP_MONTHLY, SIP_RATE, 20);
const ashaPaid = SIP_MONTHLY * 12 * 30, raviPaid = SIP_MONTHLY * 12 * 20;
const growth = Array.from({ length: 31 }, (_, y) => sipFutureValue(SIP_MONTHLY, SIP_RATE, y)).map(v => v / asha);

const startEarly: Reel = {
  id: 'start-early', topic: 'invest', lesson: 'insight-sip', tags: ['SIP', 'compounding'],
  title: t('Starting early beats starting big', 'बड़ा नहीं, जल्दी शुरू करें'),
  scenes: [
    { ms: 3200, mood: 'surprised', big: t('₹5,000 a month', '₹5,000 हर महीने'), say: t('Same ₹5,000 every month. Very different results.', 'हर महीने वही ₹5,000। नतीजा बहुत अलग।'), prop: { kind: 'coins', count: 5 } },
    { ms: 3600, mood: 'think', say: t('Meet Asha, who starts at 25, and Ravi, who starts at 35.', 'मिलिए आशा से, जो 25 की उम्र में शुरू करती है, और रवि से, जो 35 में।'),
      prop: { kind: 'steps', items: [t('Asha starts at 25', 'आशा: 25 पर शुरू'), t('Ravi starts at 35', 'रवि: 35 पर शुरू')] } },
    { ms: 4200, mood: 'happy', say: fill(t('Both stop at 55. Asha puts in {a}. Ravi puts in {r}.', 'दोनों 55 पर रुकते हैं। आशा {a} लगाती है, रवि {r}।'), { a: money(ashaPaid), r: money(raviPaid) }),
      prop: { kind: 'bars', items: [{ label: t('Asha', 'आशा'), value: ashaPaid, text: money(ashaPaid), tone: 'cyan' }, { label: t('Ravi', 'रवि'), value: raviPaid, text: money(raviPaid), tone: 'gold' }] } },
    { ms: 5200, mood: 'surprised', say: fill(t('At an assumed {rate}% a year, Asha ends near {a}. Ravi, near {r}.', 'मान लें हर साल {rate}% रिटर्न: आशा के पास लगभग {a}, रवि के पास लगभग {r}।'), { rate: SIP_RATE, a: money(asha), r: money(ravi) }),
      prop: { kind: 'bars', items: [{ label: t('Asha', 'आशा'), value: asha, text: money(asha), tone: 'teal' }, { label: t('Ravi', 'रवि'), value: ravi, text: money(ravi), tone: 'gold' }] } },
    { ms: 4000, mood: 'think', say: t('Time did the heavy lifting: ten extra years of compounding.', 'भारी काम समय ने किया: 10 साल ज़्यादा चक्रवृद्धि।'), prop: { kind: 'line', points: growth, tone: 'teal', label: t('Asha’s money over 30 years (illustration)', '30 साल में आशा का पैसा (उदाहरण)') } },
    { ms: 4400, mood: 'worry', say: fill(t('{rate}% is an assumption, not a promise. Real returns go up and down.', '{rate}% सिर्फ़ एक अनुमान है, वादा नहीं। असली रिटर्न ऊपर-नीचे होते रहते हैं।'), { rate: SIP_RATE }), prop: { kind: 'shield', text: t('An assumption', 'एक अनुमान'), sub: t('not guaranteed', 'गारंटी नहीं') } },
    { ms: 3600, mood: 'cheer', say: t('The best time to start was earlier. The next best is this month.', 'सबसे अच्छा समय पहले था। उसके बाद का सबसे अच्छा समय इसी महीने है।') },
  ],
  quiz: { q: t('In the story, why did Asha end up with more?', 'कहानी में आशा के पास ज़्यादा पैसा क्यों हुआ?'),
    options: [t('She earned a higher return', 'उसे ज़्यादा रिटर्न मिला'), t('She invested for 10 more years', 'उसने 10 साल ज़्यादा निवेश किया'), t('She invested much more each month', 'उसने हर महीने बहुत ज़्यादा लगाया')], answer: 1,
    why: t('The monthly amount and the assumed return were the same. The difference is ten more years of compounding.', 'महीने की रकम और अनुमानित रिटर्न एक जैसे थे। फ़र्क़ 10 साल ज़्यादा चक्रवृद्धि का है।') },
};

// ── 2. Inflation ───────────────────────────────────────────────────────────────────────────────────────────────
const INF = 6, INF_YEARS = 10;
const worth = inflatedValue(100, INF, INF_YEARS);
const prices = Array.from({ length: INF_YEARS + 1 }, (_, y) => Math.pow(1 + INF / 100, y)).map(v => v / Math.pow(1 + INF / 100, INF_YEARS));

const inflation: Reel = {
  id: 'inflation', topic: 'basics', lesson: 'insight-inflation', tags: ['inflation', 'saving'],
  title: t('Your ₹100 is quietly shrinking', 'आपके ₹100 चुपचाप घट रहे हैं'),
  scenes: [
    { ms: 3000, mood: 'surprised', big: t('₹100', '₹100'), say: t('Your ₹100 is quietly shrinking.', 'आपके ₹100 चुपचाप घट रहे हैं।'), prop: { kind: 'coins', count: 4 } },
    { ms: 3600, mood: 'think', say: t('Prices tend to rise over time. That is inflation.', 'समय के साथ कीमतें आमतौर पर बढ़ती हैं। इसे महँगाई कहते हैं।'), prop: { kind: 'line', points: prices, tone: 'red', label: t('Prices over 10 years (illustration)', '10 साल में कीमतें (उदाहरण)') } },
    { ms: 5000, mood: 'worry', say: fill(t('At an assumed {r}% inflation a year, in {y} years your ₹100 buys only what about {w} buys today.', 'हर साल {r}% महँगाई मानें, तो {y} साल बाद आपके ₹100 से उतना ही मिलेगा जितना आज लगभग {w} से मिलता है।'), { r: INF, y: INF_YEARS, w: money(Math.round(worth)) }),
      prop: { kind: 'counter', from: 100, to: Math.round(worth), format: 'inr', tone: 'red', label: t('buying power of ₹100, in today’s money', '₹100 की खरीदने की ताक़त, आज के पैसे में') } },
    { ms: 4400, mood: 'think', say: t('If your pay rises 5% while prices rise 6%, you can buy a little less than before.', 'अगर आपकी तनख़्वाह 5% बढ़े और कीमतें 6%, तो आप पहले से थोड़ा कम खरीद पाएँगे।'),
      prop: { kind: 'bars', items: [{ label: t('Pay rise', 'तनख़्वाह'), value: 5, text: t('5%', '5%'), tone: 'teal' }, { label: t('Prices', 'कीमतें'), value: 6, text: t('6%', '6%'), tone: 'red' }] } },
    { ms: 4400, mood: 'happy', say: t('So ask: is my money growing faster than prices? Check your own rate and your own costs.', 'तो पूछें: क्या मेरा पैसा कीमतों से तेज़ बढ़ रहा है? अपनी दर और अपने ख़र्च जाँचें।'), prop: { kind: 'steps', items: [t('Your savings rate', 'आपकी बचत पर दर'), t('Your own price rises', 'आपके अपने ख़र्च की बढ़त')] } },
    { ms: 3200, mood: 'cheer', say: t('Know the number, then make a plan.', 'संख्या जानें, फिर योजना बनाएँ।') },
  ],
  quiz: { q: fill(t('At {r}% inflation, what happens to the buying power of ₹100 over {y} years?', '{y} साल में {r}% महँगाई पर ₹100 की खरीदने की ताक़त का क्या होता है?'), { r: INF, y: INF_YEARS }),
    options: [t('It stays the same', 'वही रहती है'), fill(t('It falls to about {w} of today’s goods', 'आज के लगभग {w} के सामान जितनी रह जाती है'), { w: money(Math.round(worth)) }), t('It doubles', 'दोगुनी हो जाती है')], answer: 1,
    why: t('Prices keep rising, so the same ₹100 buys less each year.', 'कीमतें बढ़ती रहती हैं, इसलिए वही ₹100 हर साल कम खरीदते हैं।') },
};

// ── 3. The EMI trap ────────────────────────────────────────────────────────────────────────────────────────────
const LOAN = 1_000_000, LOAN_RATE = 9, LOAN_YEARS = 20;
const fi = firstInstalment(LOAN, LOAN_RATE, LOAN_YEARS);
const emiTrap: Reel = {
  id: 'emi-trap', topic: 'loans', lesson: 'insight-emi', tags: ['loan', 'EMI'],
  title: t('The EMI trap', 'EMI का जाल'),
  scenes: [
    { ms: 3200, mood: 'worry', big: t('EMI', 'EMI'), say: t('Why does your loan barely shrink in the first years?', 'आपका लोन शुरू के सालों में इतना कम क्यों घटता है?') },
    { ms: 4400, mood: 'think', say: fill(t('Take {p} at {r}% for {y} years. The EMI is about {e} a month.', '{p} का लोन, {r}% ब्याज, {y} साल। EMI लगभग {e} महीना।'), { p: money(LOAN), r: LOAN_RATE, y: LOAN_YEARS, e: money(emi(LOAN, LOAN_RATE, LOAN_YEARS)) }),
      prop: { kind: 'counter', from: 0, to: Math.round(emi(LOAN, LOAN_RATE, LOAN_YEARS)), format: 'inr', tone: 'cyan', label: t('EMI per month (illustration)', 'हर महीने की EMI (उदाहरण)') } },
    { ms: 5000, mood: 'surprised', say: fill(t('In the first EMI, {i} is interest and only {pr} reduces the loan.', 'पहली EMI में {i} ब्याज है और सिर्फ़ {pr} लोन घटाता है।'), { i: money(fi.interest), pr: money(fi.principal) }),
      prop: { kind: 'donut', parts: [{ value: fi.interest, label: t('Interest', 'ब्याज'), tone: 'red' }, { value: fi.principal, label: t('Reduces loan', 'लोन घटाता है'), tone: 'teal' }], centre: t(`${Math.round(fi.interestShare * 100)}% interest`, `${Math.round(fi.interestShare * 100)}% ब्याज`) } },
    { ms: 4200, mood: 'think', say: t('Interest is charged on what you still owe, so early on it is the bigger slice.', 'ब्याज बची हुई रकम पर लगता है, इसलिए शुरू में उसका हिस्सा बड़ा होता है।') },
    { ms: 3800, mood: 'happy', say: t('As the balance falls, more of each EMI cuts the loan.', 'जैसे-जैसे बकाया घटता है, EMI का ज़्यादा हिस्सा लोन घटाता है।') },
    { ms: 4800, mood: 'cheer', say: t('An extra payment early can shorten the loan. Ask your lender how it is applied.', 'शुरू में अतिरिक्त भुगतान लोन जल्दी घटा सकता है। बैंक से पूछें कि वह कैसे लगाया जाता है।') },
  ],
  quiz: { q: t('In the very first month, most of an EMI goes to…', 'पहले महीने की EMI का ज़्यादातर हिस्सा कहाँ जाता है?'),
    options: [t('Principal', 'मूलधन में'), t('Interest', 'ब्याज में'), t('Fees', 'शुल्क में')], answer: 1,
    why: t('Interest is calculated on the full balance, so early EMIs are mostly interest.', 'ब्याज पूरी बकाया रकम पर लगता है, इसलिए शुरू की EMI में ज़्यादातर ब्याज होता है।') },
};

// ── 4. Emergency fund ──────────────────────────────────────────────────────────────────────────────────────────
const SPEND = 30_000;
const emergency: Reel = {
  id: 'emergency-fund', topic: 'protect', tags: ['emergency fund', 'safety'],
  title: t('Why an emergency fund', 'आपातकालीन फ़ंड क्यों'),
  scenes: [
    { ms: 3400, mood: 'worry', big: t('3 months', '3 महीने'), say: t('Job gone for 3 months. Would you cope?', '3 महीने नौकरी न रहे, तो क्या आप संभाल लेंगे?') },
    { ms: 4600, mood: 'think', say: t('An emergency fund is money set aside only for shocks: job loss, medical bills, urgent repairs.', 'आपातकालीन फ़ंड वह पैसा है जो सिर्फ़ झटकों के लिए अलग रखा जाता है: नौकरी जाना, इलाज, ज़रूरी मरम्मत।') },
    { ms: 4600, mood: 'happy', say: fill(t('A common guide is 3 to 6 months of expenses. If you spend {s} a month, that is {lo} to {hi}.', 'आम सुझाव है 3 से 6 महीने का ख़र्च। अगर आपका ख़र्च महीने का {s} है, तो यह {lo} से {hi} बनता है।'), { s: money(SPEND), lo: money(SPEND * 3), hi: money(SPEND * 6) }),
      prop: { kind: 'shield', text: t('3 to 6 months', '3 से 6 महीने'), sub: t('of your expenses', 'आपके ख़र्च के') } },
    { ms: 5000, mood: 'think', say: t('Keep it where you can reach it in a day or two, and where its value will not fall just when you need it.', 'इसे ऐसी जगह रखें जहाँ से एक-दो दिन में निकल सके, और जिसकी कीमत ठीक ज़रूरत के समय गिर न सकती हो।') },
    { ms: 3800, mood: 'cheer', say: t('Start small. One month of expenses is a start. Add a little each month.', 'छोटी शुरुआत करें। एक महीने का ख़र्च भी शुरुआत है। हर महीने थोड़ा जोड़ें।'), prop: { kind: 'coins', count: 3 } },
  ],
  quiz: { q: t('What is an emergency fund for?', 'आपातकालीन फ़ंड किसलिए होता है?'),
    options: [t('Hot stock tips', 'शेयर की गर्म सलाह के लिए'), t('Sudden needs like job loss or medical bills', 'नौकरी जाने या इलाज जैसी अचानक ज़रूरतों के लिए'), t('Holiday shopping', 'छुट्टियों की ख़रीदारी के लिए')], answer: 1,
    why: t('It is a cushion for shocks, so it should be safe and easy to reach.', 'यह झटकों के लिए गद्दी है, इसलिए सुरक्षित और आसानी से निकालने लायक होना चाहिए।') },
};

// ── 5. Rule of 72 ──────────────────────────────────────────────────────────────────────────────────────────────
const rule72: Reel = {
  id: 'rule-of-72', topic: 'invest', tags: ['compounding', 'maths'],
  title: t('Double your money: the rule of 72', 'पैसा दोगुना: 72 का नियम'),
  scenes: [
    { ms: 3200, mood: 'think', big: t('72', '72'), say: t('How long does it take to double your money?', 'पैसा दोगुना होने में कितना समय लगता है?') },
    { ms: 3600, mood: 'happy', say: t('A quick trick: divide 72 by the yearly return.', 'एक आसान तरीका: 72 को सालाना रिटर्न से भाग दें।') },
    { ms: 4200, mood: 'surprised', say: fill(t('At {a}% a year: 72 ÷ {a} = about {y} years.', '{a}% सालाना पर: 72 ÷ {a} = लगभग {y} साल।'), { a: 8, y: Math.round(doublingYears(8)) }), prop: { kind: 'counter', from: 0, to: Math.round(doublingYears(8)), format: 'plain', unit: t('years', 'साल'), tone: 'cyan', label: t('to double at 8% a year', '8% सालाना पर दोगुना होने में') } },
    { ms: 4200, mood: 'surprised', say: fill(t('At {a}% a year: 72 ÷ {a} = about {y} years.', '{a}% सालाना पर: 72 ÷ {a} = लगभग {y} साल।'), { a: 12, y: Math.round(doublingYears(12)) }), prop: { kind: 'counter', from: 0, to: Math.round(doublingYears(12)), format: 'plain', unit: t('years', 'साल'), tone: 'teal', label: t('to double at 12% a year', '12% सालाना पर दोगुना होने में') } },
    { ms: 4000, mood: 'worry', say: t('It is a rough shortcut. Returns are never fixed or promised.', 'यह मोटा अंदाज़ा है। रिटर्न कभी तय या वादा किए हुए नहीं होते।'), prop: { kind: 'shield', text: t('A rough shortcut', 'एक मोटा अंदाज़ा'), sub: t('not a prediction', 'भविष्यवाणी नहीं') } },
    { ms: 3400, mood: 'cheer', say: t('Use it to compare, not to predict.', 'इसका इस्तेमाल तुलना के लिए करें, भविष्यवाणी के लिए नहीं।') },
  ],
  quiz: { q: t('By the rule of 72, at 6% a year money doubles in about…', '72 के नियम से, 6% सालाना पर पैसा लगभग कितने समय में दोगुना होता है?'),
    options: [t('6 years', '6 साल'), t('12 years', '12 साल'), t('72 years', '72 साल')], answer: 1,
    why: t('72 ÷ 6 = 12 years.', '72 ÷ 6 = 12 साल।') },
};


// ── 6. Good vs bad debt ────────────────────────────────────────────────────────────────────────────────────────
const goodBadDebt: Reel = {
  id: 'good-bad-debt', topic: 'loans', lesson: 'insight-debt', tags: ['debt', 'loan'],
  title: t('Good debt, bad debt', 'अच्छा क़र्ज़, बुरा क़र्ज़'),
  scenes: [
    { ms: 3400, mood: 'think', big: t('Debt', 'क़र्ज़'), say: t('Debt is a tool. It can build something, or it can only cost you.', 'क़र्ज़ एक औज़ार है। वह कुछ बना भी सकता है, या सिर्फ़ आप पर बोझ बन सकता है।') },
    { ms: 4200, mood: 'happy', say: t('Some loans can help you earn more later.', 'कुछ लोन आगे चलकर आपकी कमाई बढ़ाने में मदद कर सकते हैं।'),
      prop: { kind: 'steps', items: [t('Education loan: may raise pay', 'पढ़ाई का लोन: कमाई बढ़ सकती है'), t('Business loan: may grow sales', 'बिज़नेस लोन: बिक्री बढ़ सकती है')] } },
    { ms: 4600, mood: 'worry', say: t('Others take money out: for things that lose value, or just for show.', 'कुछ लोन सिर्फ़ पैसा बाहर ले जाते हैं: जो चीज़ें घटती हैं, या सिर्फ़ दिखावे के लिए।'),
      prop: { kind: 'steps', items: [t('Car loan: the car loses value', 'कार लोन: कार की कीमत घटती है'), t('Credit-card EMI: check the rate', 'क्रेडिट-कार्ड EMI: दर जाँचें'), t('Loan for a show-off party', 'दिखावे की पार्टी का लोन')] } },
    { ms: 4600, mood: 'think', say: t('Before borrowing, ask: will this put money in my pocket later, or only take it out?', 'लोन से पहले पूछें: क्या यह आगे मेरी जेब में पैसा लाएगा, या सिर्फ़ निकालेगा?') },
    { ms: 3800, mood: 'cheer', say: t('Whatever you borrow, check the real rate and plan how you will repay.', 'जो भी लें, असली दर देखें और चुकाने की योजना बनाएँ।') },
  ],
  quiz: { q: t('Which question helps you decide if a loan is useful?', 'कौन-सा सवाल बताता है कि लोन काम का है या नहीं?'),
    options: [t('Will it help me earn or grow money later?', 'क्या यह आगे मेरी कमाई या पैसा बढ़ाएगा?'), t('Do my friends have one too?', 'क्या मेरे दोस्तों के पास भी है?'), t('Is the monthly EMI small?', 'क्या महीने की EMI छोटी है?')], answer: 0,
    why: t('A small EMI can hide a long, costly loan. Ask what the loan does for your future money.', 'छोटी EMI के पीछे लंबा और महँगा लोन छिप सकता है। देखें कि लोन आपके आगे के पैसे के लिए क्या करता है।') },
};

// ── 7. RBI and your EMI ────────────────────────────────────────────────────────────────────────────────────────
const RBI_LOAN = 3_000_000, RBI_YEARS = 20, RBI_FROM = 8.5, RBI_TO = 9;
const emiLow = emi(RBI_LOAN, RBI_FROM, RBI_YEARS), emiHigh = emi(RBI_LOAN, RBI_TO, RBI_YEARS);
const rbi: Reel = {
  id: 'rbi-and-emi', topic: 'loans', lesson: 'insight-rbi', tags: ['RBI', 'EMI', 'repo rate'],
  title: t('When the RBI moves, your EMI can move', 'RBI बदले तो आपकी EMI बदल सकती है'),
  scenes: [
    { ms: 3400, mood: 'surprised', big: t('Repo rate', 'रेपो रेट'), say: t('When the RBI Governor speaks, your EMI can move.', 'जब RBI गवर्नर बोलते हैं, आपकी EMI बदल सकती है।') },
    { ms: 5200, mood: 'think', say: t('Here is the chain reaction.', 'यह पूरी कड़ी है।'),
      prop: { kind: 'steps', items: [t('Prices rise (inflation)', 'कीमतें बढ़ती हैं'), t('RBI raises the repo rate', 'रेपो रेट बढ़ती है'), t('Banks raise loan rates', 'बैंक लोन की दर बढ़ाते हैं'), t('Your EMI or tenure can change', 'आपकी EMI या अवधि बदल सकती है')] } },
    { ms: 5400, mood: 'worry', say: fill(t('Example: on a {p} loan for {y} years, a rise from {a}% to {b}% adds about {d} to the monthly EMI.', 'उदाहरण: {p} के {y} साल के लोन पर दर {a}% से {b}% होने पर महीने की EMI लगभग {d} बढ़ती है।'), { p: money(RBI_LOAN), y: RBI_YEARS, a: RBI_FROM, b: RBI_TO, d: money(emiHigh - emiLow) }),
      prop: { kind: 'bars', items: [{ label: t(`At ${RBI_FROM}%`, `${RBI_FROM}% पर`), value: emiLow, text: money(emiLow), tone: 'teal' }, { label: t(`At ${RBI_TO}%`, `${RBI_TO}% पर`), value: emiHigh, text: money(emiHigh), tone: 'red' }] } },
    { ms: 4600, mood: 'think', say: t('Whether and when your loan changes depends on its terms. Some loans reset on a date.', 'आपका लोन बदलेगा या नहीं, और कब, यह उसकी शर्तों पर निर्भर है। कुछ लोन तय तारीख़ पर दर बदलते हैं।') },
    { ms: 4000, mood: 'cheer', say: t('Know your loan’s rate type and reset date. Ask your lender.', 'अपने लोन की दर का प्रकार और बदलाव की तारीख़ जानें। बैंक से पूछें।') },
  ],
  quiz: { q: t('When the repo rate rises, what can happen to a loan whose rate resets?', 'रेपो रेट बढ़ने पर, ऐसे लोन का क्या हो सकता है जिसकी दर बदलती है?'),
    options: [t('Nothing, ever', 'कुछ नहीं होता'), t('Its rate can rise, so EMI or tenure may change', 'दर बढ़ सकती है, इसलिए EMI या अवधि बदल सकती है'), t('The loan is forgiven', 'लोन माफ़ हो जाता है')], answer: 1,
    why: t('Banks often pass rate changes on, and what changes (EMI or tenure) depends on the loan terms.', 'बैंक अक्सर दर में बदलाव आगे बढ़ाते हैं, और क्या बदलेगा (EMI या अवधि) यह लोन की शर्तों पर निर्भर है।') },
};

// ── 8. Mutual fund units and NAV ───────────────────────────────────────────────────────────────────────────────
const MF_AMOUNT = 1000, MF_NAV = 50, MF_UNITS = unitsFor(MF_AMOUNT, MF_NAV);
const mfUnits: Reel = {
  id: 'mf-units-nav', topic: 'invest', lesson: 'mutual_funds', tags: ['mutual fund', 'NAV'],
  title: t('Mutual funds: units and NAV', 'म्यूचुअल फ़ंड: यूनिट और NAV'),
  scenes: [
    { ms: 3800, mood: 'happy', big: t('The bus', 'बस'), say: t('A mutual fund is like a bus: many passengers, one driver.', 'म्यूचुअल फ़ंड एक बस जैसा है: कई यात्री, एक ड्राइवर।'),
      prop: { kind: 'steps', items: [t('You and many others pool money', 'आप और बहुत लोग पैसा मिलाते हैं'), t('A fund manager picks the route', 'फ़ंड मैनेजर रास्ता चुनता है')] } },
    { ms: 3800, mood: 'think', say: t('NAV is the price of one seat, called a unit.', 'NAV एक सीट की कीमत है, जिसे यूनिट कहते हैं।'), prop: { kind: 'counter', from: 0, to: MF_NAV, format: 'inr', tone: 'cyan', label: t('NAV: price of one unit (example)', 'NAV: एक यूनिट की कीमत (उदाहरण)') } },
    { ms: 4600, mood: 'surprised', say: fill(t('Put in {a} when the NAV is {n}, and you get {u} units, before charges.', '{a} लगाएँ जब NAV {n} हो, तो शुल्क से पहले आपको {u} यूनिट मिलती हैं।'), { a: money(MF_AMOUNT), n: money(MF_NAV), u: MF_UNITS }),
      prop: { kind: 'counter', from: 0, to: MF_UNITS, format: 'plain', unit: t('units', 'यूनिट'), tone: 'teal', label: t('what you hold', 'आपके पास') } },
    { ms: 4600, mood: 'worry', say: t('A lower NAV does not mean cheaper or better. It is only the price of one unit.', 'कम NAV का मतलब सस्ता या बेहतर नहीं है। वह सिर्फ़ एक यूनिट की कीमत है।') },
    { ms: 4400, mood: 'think', say: t('Returns are not promised. Read the fund’s goal and risk level first.', 'रिटर्न का वादा नहीं होता। पहले फ़ंड का उद्देश्य और जोखिम स्तर पढ़ें।'), prop: { kind: 'shield', text: t('Read the goal', 'उद्देश्य पढ़ें'), sub: t('and the risk level', 'और जोखिम स्तर') } },
    { ms: 3400, mood: 'cheer', say: t('Check the plan, the costs and your time horizon before you invest.', 'निवेश से पहले प्लान, ख़र्च और अपनी समय-सीमा जाँचें।') },
  ],
  quiz: { q: t('Fund A has a NAV of ₹20 and Fund B has ₹200. Which one is cheaper?', 'फ़ंड A का NAV ₹20 है और फ़ंड B का ₹200। कौन-सा सस्ता है?'),
    options: [t('Fund A, the lower NAV', 'फ़ंड A, कम NAV'), t('You cannot tell from the NAV alone', 'सिर्फ़ NAV से पता नहीं चलता'), t('Fund B, the higher NAV', 'फ़ंड B, ज़्यादा NAV')], answer: 1,
    why: t('NAV is a unit price, not a measure of value. What matters is what the fund holds, its costs and your goal.', 'NAV यूनिट की कीमत है, मूल्य का पैमाना नहीं। मायने रखता है कि फ़ंड में क्या है, उसका ख़र्च और आपका लक्ष्य।') },
};

// ── 9. Direct vs regular plans ─────────────────────────────────────────────────────────────────────────────────
const DR = { monthly: 10_000, gross: 12, regularCost: 1.5, directCost: 0.5, years: 15 };
const regularFv = sipFutureValue(DR.monthly, DR.gross - DR.regularCost, DR.years), directFv = sipFutureValue(DR.monthly, DR.gross - DR.directCost, DR.years);
const directRegular: Reel = {
  id: 'direct-vs-regular', topic: 'invest', lesson: 'mutual_funds', tags: ['mutual fund', 'expense ratio', 'direct plan'],
  title: t('Direct or regular plan?', 'डायरेक्ट या रेगुलर प्लान?'),
  scenes: [
    { ms: 3600, mood: 'think', big: t('Same fund', 'वही फ़ंड'), say: t('One fund, two versions: a regular plan and a direct plan.', 'एक फ़ंड, दो रूप: रेगुलर प्लान और डायरेक्ट प्लान।') },
    { ms: 4600, mood: 'happy', say: t('A regular plan includes a distributor’s fee, so its yearly cost is higher.', 'रेगुलर प्लान में वितरक की फ़ीस शामिल होती है, इसलिए उसका सालाना ख़र्च ज़्यादा होता है।'),
      prop: { kind: 'bars', items: [{ label: t('Regular', 'रेगुलर'), value: DR.regularCost, text: t(`${DR.regularCost}%`, `${DR.regularCost}%`), tone: 'gold' }, { label: t('Direct', 'डायरेक्ट'), value: DR.directCost, text: t(`${DR.directCost}%`, `${DR.directCost}%`), tone: 'teal' }] } },
    { ms: 5600, mood: 'surprised', say: fill(t('{m} a month for {y} years, at an assumed {g}% before costs: about {d} with direct, {r} with regular.', 'हर महीने {m}, {y} साल, ख़र्च से पहले मान लें {g}% रिटर्न: डायरेक्ट में लगभग {d}, रेगुलर में लगभग {r}।'), { m: money(DR.monthly), y: DR.years, g: DR.gross, d: money(directFv), r: money(regularFv) }),
      prop: { kind: 'bars', items: [{ label: t('Direct', 'डायरेक्ट'), value: directFv, text: money(directFv), tone: 'teal' }, { label: t('Regular', 'रेगुलर'), value: regularFv, text: money(regularFv), tone: 'gold' }] } },
    { ms: 3800, mood: 'think', say: t('A small yearly gap compounds into a big gap over time.', 'सालाना छोटा सा फ़र्क़ समय के साथ बड़ा फ़र्क़ बन जाता है।') },
    { ms: 4600, mood: 'happy', say: t('A regular plan may come with advice and service. Decide if that is worth the cost to you.', 'रेगुलर प्लान के साथ सलाह और सेवा मिल सकती है। तय करें कि वह आपके लिए इस ख़र्च के लायक है या नहीं।') },
    { ms: 3600, mood: 'cheer', say: t('Compare the latest expense ratios before you choose. These costs are examples.', 'चुनने से पहले ताज़ा एक्सपेंस रेशियो की तुलना करें। ये ख़र्च उदाहरण हैं।') },
  ],
  quiz: { q: t('Why can a 1% yearly cost difference matter?', 'सालाना 1% के ख़र्च के फ़र्क़ से क्या असर पड़ता है?'),
    options: [t('It compounds over the years', 'वह सालों में जुड़ता जाता है'), t('It is paid only once', 'वह सिर्फ़ एक बार लगता है'), t('It only applies to shares', 'वह सिर्फ़ शेयरों पर लगता है')], answer: 0,
    why: t('The cost comes out every year, so the gap grows with the years invested.', 'ख़र्च हर साल कटता है, इसलिए निवेश के सालों के साथ फ़र्क़ बढ़ता जाता है।') },
};

// ── 10. What insurance is ──────────────────────────────────────────────────────────────────────────────────────
const insuranceBasics: Reel = {
  id: 'insurance-basics', topic: 'protect', lesson: 'insurance', tags: ['insurance', 'health cover'],
  title: t('Insurance is not an investment', 'बीमा निवेश नहीं है'),
  scenes: [
    { ms: 3600, mood: 'worry', big: t('Insurance', 'बीमा'), say: t('Insurance is not an investment. It moves a big risk off you.', 'बीमा निवेश नहीं है। वह एक बड़ा जोखिम आपसे हटाकर बाँटता है।') },
    { ms: 4600, mood: 'think', say: t('You pay a small premium so the insurer carries a huge cost if something goes wrong.', 'आप छोटा प्रीमियम देते हैं ताकि कुछ बुरा होने पर बड़ा ख़र्च बीमा कंपनी उठाए।'), prop: { kind: 'shield', text: t('Risk transfer', 'जोखिम का हस्तांतरण'), sub: t('small premium, big cover', 'छोटा प्रीमियम, बड़ा कवर') } },
    { ms: 4600, mood: 'happy', say: t('Before you buy health cover, check the fine print.', 'हेल्थ कवर लेने से पहले छोटे अक्षर पढ़ें।'), prop: { kind: 'steps', items: [t('Room rent limit', 'कमरे के किराये की सीमा'), t('Co-pay and sub-limits', 'को-पे और उप-सीमाएँ'), t('Waiting periods', 'इंतज़ार की अवधि')] } },
    { ms: 4800, mood: 'worry', say: t('A room-rent cap can reduce your whole claim in proportion, not just the room charge.', 'कमरे के किराये की सीमा पूरे क्लेम को अनुपात में घटा सकती है, सिर्फ़ कमरे का ख़र्च नहीं।') },
    { ms: 4400, mood: 'think', say: t('Read the wording: who is covered, exclusions, claim steps and renewal terms.', 'शर्तें पढ़ें: कौन कवर है, क्या शामिल नहीं, क्लेम कैसे होगा और नवीनीकरण की शर्तें।') },
    { ms: 3400, mood: 'cheer', say: t('Buy protection for protection. Look for returns elsewhere.', 'सुरक्षा के लिए बीमा लें। रिटर्न कहीं और देखें।') },
  ],
  quiz: { q: t('What is insurance mainly for?', 'बीमा मुख्य रूप से किसलिए है?'),
    options: [t('Earning returns', 'रिटर्न कमाने के लिए'), t('Transferring a big financial risk', 'बड़े वित्तीय जोखिम को बाँटने के लिए'), t('Only saving tax', 'सिर्फ़ टैक्स बचाने के लिए')], answer: 1,
    why: t('It pays according to the policy terms when a covered event happens. That is protection, not an investment.', 'कवर की गई घटना होने पर वह पॉलिसी की शर्तों के अनुसार भुगतान करता है। यह सुरक्षा है, निवेश नहीं।') },
};

// ── 11. How much life cover ────────────────────────────────────────────────────────────────────────────────────
const lifeCover: Reel = {
  id: 'life-cover', topic: 'protect', lesson: 'insurance', tags: ['term insurance', 'life cover'],
  title: t('How much life cover?', 'कितना लाइफ़ कवर?'),
  scenes: [
    { ms: 3400, mood: 'think', big: t('How much?', 'कितना?'), say: t('How much life cover is enough?', 'कितना लाइफ़ कवर काफ़ी है?') },
    { ms: 4000, mood: 'happy', say: t('There is no magic number. Start with who depends on your income.', 'कोई जादुई संख्या नहीं होती। देखें कि आपकी कमाई पर कौन निर्भर है।') },
    { ms: 5000, mood: 'think', say: t('Then count what they would need.', 'फिर गिनें कि उन्हें क्या चाहिए होगा।'), prop: { kind: 'steps', items: [t('Income your family needs', 'परिवार को चाहिए आमदनी'), t('Loans still to repay', 'चुकाने बाक़ी लोन'), t('Savings and cover you have', 'आपकी बचत और मौजूदा कवर')] } },
    { ms: 4000, mood: 'surprised', say: t('And for how many years that support must last.', 'और कितने साल तक यह सहारा चाहिए।') },
    { ms: 4400, mood: 'happy', say: t('A calculator gives a starting estimate. Review it as life changes.', 'कैलकुलेटर सिर्फ़ शुरुआती अनुमान देता है। ज़िंदगी बदले तो उसे फिर देखें।') },
    { ms: 3200, mood: 'cheer', say: t('New loan, new child, new job? Revisit your cover.', 'नया लोन, नया बच्चा, नई नौकरी? कवर फिर देखें।') },
  ],
  quiz: { q: t('A life-cover estimate should consider…', 'लाइफ़ कवर का अनुमान लगाते समय क्या देखना चाहिए?'),
    options: [t('Only your age', 'सिर्फ़ आपकी उम्र'), t('Dependants’ needs, loans and what you already have', 'आश्रितों की ज़रूरत, लोन और आपके पास पहले से जो है'), t('Only the premium you like', 'सिर्फ़ मनचाहा प्रीमियम')], answer: 1,
    why: t('Cover is about what your family would need, so it depends on your household, not on one rule.', 'कवर इस पर निर्भर है कि आपके परिवार को क्या चाहिए होगा, इसलिए यह घर की स्थिति पर टिका है, किसी एक नियम पर नहीं।') },
};

// ── 12. 100 minus age ──────────────────────────────────────────────────────────────────────────────────────────
const at30 = hundredMinusAge(30), at50 = hundredMinusAge(50);
const hundredAge: Reel = {
  id: 'hundred-minus-age', topic: 'invest', lesson: 'principles', tags: ['asset allocation', 'equity'],
  title: t('The “100 minus age” rule', '“100 घटा उम्र” का नियम'),
  scenes: [
    { ms: 3600, mood: 'think', big: t('100 − age', '100 − उम्र'), say: t('A rough rule for mixing shares with safer assets.', 'शेयर और सुरक्षित निवेश को मिलाने का एक मोटा नियम।') },
    { ms: 4000, mood: 'happy', say: t('Share of equity = 100 minus your age.', 'इक्विटी का हिस्सा = 100 घटा आपकी उम्र।') },
    { ms: 4800, mood: 'surprised', say: fill(t('At 30: about {e}% in equity and {d}% in safer assets.', '30 की उम्र में: लगभग {e}% इक्विटी और {d}% सुरक्षित निवेश।'), { e: at30.equity, d: at30.debt }),
      prop: { kind: 'donut', parts: [{ value: at30.equity, label: t('Equity', 'इक्विटी'), tone: 'cyan' }, { value: at30.debt, label: t('Safer assets', 'सुरक्षित'), tone: 'gold' }], centre: t('Age 30', 'उम्र 30') } },
    { ms: 4800, mood: 'think', say: fill(t('At 50: about {e}% and {d}%. The risk comes down as you age.', '50 की उम्र में: लगभग {e}% और {d}%। उम्र के साथ जोखिम घटता है।'), { e: at50.equity, d: at50.debt }),
      prop: { kind: 'donut', parts: [{ value: at50.equity, label: t('Equity', 'इक्विटी'), tone: 'cyan' }, { value: at50.debt, label: t('Safer assets', 'सुरक्षित'), tone: 'gold' }], centre: t('Age 50', 'उम्र 50') } },
    { ms: 4600, mood: 'worry', say: t('It is a rough starting point, not advice. Your goals and comfort with risk matter more.', 'यह मोटी शुरुआत है, सलाह नहीं। आपके लक्ष्य और जोखिम सहने की क्षमता ज़्यादा मायने रखते हैं।'), prop: { kind: 'shield', text: t('A rough rule', 'एक मोटा नियम'), sub: t('not advice', 'सलाह नहीं') } },
    { ms: 3400, mood: 'cheer', say: t('Pick a mix you can stick with when markets fall.', 'ऐसा मिश्रण चुनें जिस पर बाज़ार गिरने पर भी टिके रह सकें।') },
  ],
  quiz: { q: t('By the “100 minus age” rule, a 40-year-old would hold about…', '“100 घटा उम्र” के नियम से 40 साल का व्यक्ति लगभग कितना इक्विटी रखेगा?'),
    options: [t('40% in equity', '40% इक्विटी'), t('60% in equity', '60% इक्विटी'), t('100% in equity', '100% इक्विटी')], answer: 1,
    why: t('100 − 40 = 60. It is only a rough starting point.', '100 − 40 = 60। यह सिर्फ़ एक मोटी शुरुआत है।') },
};

// ── 13. Cash flow beats salary ─────────────────────────────────────────────────────────────────────────────────
const NEHA = { earn: 100_000, spend: 95_000 }, KARAN = { earn: 60_000, spend: 40_000 };
const cashFlow: Reel = {
  id: 'cash-flow', topic: 'basics', lesson: 'principles', tags: ['cash flow', 'saving'],
  title: t('Cash flow beats salary', 'सैलरी से बड़ा है कैश फ़्लो'),
  scenes: [
    { ms: 3600, mood: 'think', big: t('Cash flow', 'कैश फ़्लो'), say: t('Income is what comes in. Cash flow is what you keep.', 'आमदनी वह है जो आती है। कैश फ़्लो वह है जो आप बचाते हैं।') },
    { ms: 4800, mood: 'happy', say: fill(t('Neha earns {a} a month. Karan earns {b}.', 'नेहा महीने में {a} कमाती है। करन {b} कमाता है।'), { a: money(NEHA.earn), b: money(KARAN.earn) }),
      prop: { kind: 'bars', items: [{ label: t('Neha earns', 'नेहा कमाती'), value: NEHA.earn, text: money(NEHA.earn), tone: 'cyan' }, { label: t('Karan earns', 'करन कमाता'), value: KARAN.earn, text: money(KARAN.earn), tone: 'gold' }] } },
    { ms: 5200, mood: 'surprised', say: fill(t('Neha spends {a}, so she keeps {c}. Karan spends {b}, so he keeps {d}.', 'नेहा {a} ख़र्च करती है, तो {c} बचाती है। करन {b} ख़र्च करता है, तो {d} बचाता है।'), { a: money(NEHA.spend), b: money(KARAN.spend), c: money(NEHA.earn - NEHA.spend), d: money(KARAN.earn - KARAN.spend) }),
      prop: { kind: 'bars', items: [{ label: t('Neha keeps', 'नेहा बचाती'), value: NEHA.earn - NEHA.spend, text: money(NEHA.earn - NEHA.spend), tone: 'gold' }, { label: t('Karan keeps', 'करन बचाता'), value: KARAN.earn - KARAN.spend, text: money(KARAN.earn - KARAN.spend), tone: 'teal' }] } },
    { ms: 4200, mood: 'worry', say: t('A bigger salary does not help if it all goes out.', 'बड़ी सैलरी तब काम नहीं आती जब सब निकल जाए।') },
    { ms: 3600, mood: 'cheer', say: t('Track what you keep, not just what you earn.', 'सिर्फ़ कमाई नहीं, यह भी देखें कि आप कितना बचाते हैं।') },
  ],
  quiz: { q: t('Who builds savings faster in the story?', 'कहानी में बचत कौन तेज़ी से बनाता है?'),
    options: [t('Neha, she earns more', 'नेहा, वह ज़्यादा कमाती है'), t('Karan, he keeps more each month', 'करन, वह हर महीने ज़्यादा बचाता है'), t('They are equal', 'दोनों बराबर हैं')], answer: 1,
    why: t('Karan keeps ₹20,000 a month against Neha’s ₹5,000. What you keep builds wealth.', 'करन हर महीने ₹20,000 बचाता है, नेहा ₹5,000। जो बचता है, वही संपत्ति बनाता है।') },
};

export const REELS: Reel[] = [startEarly, inflation, emiTrap, emergency, rule72, goodBadDebt, rbi, mfUnits, directRegular, insuranceBasics, lifeCover, hundredAge, cashFlow, ...TAX_REELS, ...RETIRE_REELS, ...CREDIT_REELS, ...HOME_REELS, ...SAFETY_REELS, ...GOAL_REELS, ...BASICS_MORE, ...INVEST_MORE, ...LOANS_MORE, ...CREDIT_MORE, ...PROTECT_MORE, ...TAX_MORE, ...RETIRE_MORE, ...SAFETY_MORE, ...GOALS_MORE, ...SPOT_REELS, ...MYTH_REELS, ...GUESS_REELS, ...SLIDE_REELS, ...PATH_REELS, ...EXPLAIN_REELS, ...SORT_REELS, ...ORDER_REELS, ...SLIDER2_REELS, ...liveDrafts()];
export const reelById = (id: string): Reel | undefined => REELS.find(r => r.id === id);
