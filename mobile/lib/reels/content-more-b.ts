// Second wave, part B: loans, credit and protection.
import { emi, fill, impliedMonthlyRate, lumpsumValue, money, proportionalClaim, superTopUpSplit, taxAtSlab, unpaidBalance, yearlyDepositsValue } from '@/lib/reels/figures';
import { sc, t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

const pct1 = (n: number) => String(Math.round(n * 10) / 10);

// ── Loans ────────────────────────────────────────────────────────────────────────────────────────────────────────
const HL = 5_000_000, RATE_A = 8.5, RATE_B = 9.5, YEARS = 20;
const emiA = emi(HL, RATE_A, YEARS), emiB = emi(HL, RATE_B, YEARS);
const floating: Reel = {
  id: 'floating-vs-fixed', topic: 'loans', tags: ['home loan', 'floating rate', 'fixed rate'],
  title: t('Floating or fixed rate?', 'फ़्लोटिंग या फ़िक्स्ड दर?'),
  scenes: [
    sc('think', t('A loan’s rate can be floating, which moves with a benchmark, or fixed, which stays put for a period.', 'लोन की दर फ़्लोटिंग हो सकती है, जो बेंचमार्क के साथ चलती है, या फ़िक्स्ड, जो एक अवधि तक स्थिर रहती है।'), { big: t('Floating or fixed', 'फ़्लोटिंग या फ़िक्स्ड') }),
    sc('happy', t('Most home loans are floating. When the benchmark falls your EMI or tenure can fall, and when it rises they can rise.', 'ज़्यादातर होम लोन फ़्लोटिंग होते हैं। बेंचमार्क गिरे तो EMI या अवधि घट सकती है, बढ़े तो बढ़ सकती है।')),
    sc('surprised', fill(t('Example: {p} for {y} years. At an assumed {a}% the EMI is about {ea}. If the rate becomes {b}%, it is about {eb}.', 'उदाहरण: {p}, {y} साल। मान लें {a}% पर EMI लगभग {ea}। दर {b}% हो जाए तो लगभग {eb}।'), { p: money(HL), y: YEARS, a: RATE_A, b: RATE_B, ea: money(emiA), eb: money(emiB) }),
      { prop: { kind: 'bars', items: [{ label: t(`At ${RATE_A}%`, `${RATE_A}% पर`), value: emiA, text: money(emiA), tone: 'teal' }, { label: t(`At ${RATE_B}%`, `${RATE_B}% पर`), value: emiB, text: money(emiB), tone: 'red' }] } }),
    sc('think', t('A fixed rate gives certainty but is often set higher, and it can reset after the fixed period ends.', 'फ़िक्स्ड दर निश्चितता देती है पर अक्सर ऊँची होती है, और तय अवधि के बाद बदल सकती है।')),
    sc('cheer', t('Ask your lender which type you have, when it resets, and what changes when it does.', 'अपने बैंक से पूछें कि आपकी कौन-सी है, कब बदलती है, और बदलने पर क्या बदलता है।')),
  ],
  quiz: { q: t('What happens to a floating-rate loan when the benchmark rises?', 'बेंचमार्क बढ़ने पर फ़्लोटिंग दर के लोन का क्या होता है?'),
    options: [t('Its EMI or tenure can go up', 'उसकी EMI या अवधि बढ़ सकती है'), t('Nothing, ever', 'कुछ नहीं होता'), t('The loan is cancelled', 'लोन रद्द हो जाता है')], answer: 0,
    why: t('A floating rate follows the benchmark, so the cost of the loan moves with it.', 'फ़्लोटिंग दर बेंचमार्क के साथ चलती है, इसलिए लोन की लागत भी उसके साथ बदलती है।') },
};

const EXTRA = 100_000, PL_RATE = 9, INV_RATE = 12, PL_YEARS = 10;
const prepayValue = lumpsumValue(EXTRA, PL_RATE, PL_YEARS), investValue = lumpsumValue(EXTRA, INV_RATE, PL_YEARS);
const prepayInvest: Reel = {
  id: 'prepay-vs-invest', topic: 'loans', tags: ['prepayment', 'investing', 'trade-off'],
  title: t('Prepay the loan or invest?', 'लोन प्रीपे करें या निवेश?'),
  scenes: [
    sc('think', t('You have spare money. Pay down a loan, or invest it? It depends, and here is how to see it.', 'आपके पास अतिरिक्त पैसा है। लोन घटाएँ या निवेश करें? यह स्थिति पर निर्भर है, और देखने का तरीक़ा यह है।'), { big: t('Prepay or invest?', 'प्रीपे या निवेश?') }),
    sc('happy', fill(t('Prepaying a {r}% loan is like earning {r}% for sure, because you stop paying that interest.', '{r}% के लोन का प्रीपेमेंट पक्के {r}% कमाने जैसा है, क्योंकि आप वह ब्याज देना बंद कर देते हैं।'), { r: PL_RATE })),
    sc('surprised', fill(t('{x} over {y} years: prepaying at {p}% is worth about {a}. Invested at an assumed {i}%, about {b}, not certain.', 'उदाहरण: {x}, {y} साल। {p}% पर प्रीपे का मूल्य लगभग {a}। मान लें {i}% पर निवेश में लगभग {b}, पर पक्का नहीं।'), { x: money(EXTRA), y: PL_YEARS, p: PL_RATE, i: INV_RATE, a: money(prepayValue), b: money(investValue) }),
      { prop: { kind: 'bars', items: [{ label: t('Prepay', 'प्रीपे'), value: prepayValue, text: money(prepayValue), tone: 'teal' }, { label: t('Invest', 'निवेश'), value: investValue, text: money(investValue), tone: 'gold' }] } }),
    sc('worry', t('The invested figure is an assumption and may be taxed or fall. The prepay saving is known. Your comfort with risk matters.', 'निवेश का आँकड़ा अनुमान है, उस पर टैक्स लग सकता है और वह गिर सकता है। प्रीपे की बचत पक्की है। जोखिम से आपका सहज होना मायने रखता है।')),
    sc('cheer', t('Keep your emergency fund first. Then compare your loan rate with what you can reasonably expect.', 'पहले आपातकालीन फ़ंड रखें। फिर अपने लोन की दर की तुलना उससे करें जो आप उचित रूप से उम्मीद कर सकते हैं।')),
  ],
  quiz: { q: t('What is certain about prepaying a loan?', 'लोन प्रीपे करने के बारे में पक्का क्या है?'),
    options: [t('You stop paying that interest', 'आप वह ब्याज देना बंद कर देते हैं'), t('It always beats investing', 'वह हमेशा निवेश से बेहतर है'), t('It earns market returns', 'वह बाज़ार जैसा रिटर्न देता है')], answer: 0,
    why: t('The saving equals the loan’s interest rate. Whether that beats investing depends on the numbers and your risk.', 'बचत लोन की ब्याज दर के बराबर होती है। यह निवेश से बेहतर है या नहीं, यह आँकड़ों और जोखिम पर निर्भर है।') },
};

export const LOANS_MORE: Reel[] = [floating, prepayInvest];

// ── Credit ───────────────────────────────────────────────────────────────────────────────────────────────────────
const CASH = 28_500, EMI3 = 10_000, N = 3;
const monthly = impliedMonthlyRate(CASH, EMI3, N);
const noCost: Reel = {
  id: 'no-cost-emi', topic: 'credit', tags: ['no cost EMI', 'credit'],
  title: t('Is a “no-cost EMI” really free?', 'क्या “नो-कॉस्ट EMI” सच में मुफ़्त है?'),
  scenes: [
    sc('think', t('“No-cost EMI” sounds like free credit. The cost is often hidden somewhere else.', '“नो-कॉस्ट EMI” मुफ़्त क्रेडिट जैसा लगता है। लागत अक्सर कहीं और छिपी होती है।'), { big: t('No-cost?', 'नो-कॉस्ट?') }),
    sc('surprised', fill(t('Example: a phone is {c} if you pay cash, or {e} a month for {n} months, which is {t}.', 'उदाहरण: फ़ोन नक़द देने पर {c} का है, या {n} महीने {e} महीना, जो {t} होता है।'), { c: money(CASH), e: money(EMI3), n: N, t: money(EMI3 * N) }),
      { prop: { kind: 'bars', items: [{ label: t('Cash price', 'नक़द भाव'), value: CASH, text: money(CASH), tone: 'teal' }, { label: t('EMI total', 'EMI कुल'), value: EMI3 * N, text: money(EMI3 * N), tone: 'gold' }] } }),
    sc('worry', fill(t('That gap works out to about {m}% a month, or roughly {a}% a year, simple. That is the real cost of the “no-cost” offer.', 'वह अंतर लगभग {m}% महीना, यानी मोटे तौर पर {a}% सालाना (साधारण) बैठता है। यही “नो-कॉस्ट” ऑफ़र की असली लागत है।'), { m: pct1(monthly), a: Math.round(monthly * 12) })),
    sc('think', t('The cost can sit in a lost discount, a processing fee or the interest the seller pays and recovers in the price.', 'लागत छूटे हुए डिस्काउंट, प्रोसेसिंग फ़ीस या उस ब्याज में हो सकती है जिसे विक्रेता क़ीमत में वसूल लेता है।')),
    sc('cheer', t('Always ask for the cash price and compare it with the EMI total.', 'हमेशा नक़द भाव पूछें और उसकी तुलना EMI के कुल से करें।')),
  ],
  quiz: { q: t('How can you tell whether a “no-cost EMI” costs you?', 'पता कैसे चले कि “नो-कॉस्ट EMI” में आपकी लागत है?'),
    options: [t('Compare the cash price with the total of the EMIs', 'नक़द भाव की तुलना EMI के कुल से करें'), t('Trust the name', 'नाम पर भरोसा करें'), t('Ask a friend if they bought it', 'दोस्त से पूछें कि उसने ली या नहीं')], answer: 0,
    why: t('If paying in instalments costs more than paying cash, the difference is what you pay for the credit.', 'अगर किस्तों में देना नक़द से महँगा है, तो अंतर ही उधार की आपकी क़ीमत है।') },
};

const BNPL = 20_000, BNPL_MONTHLY = 3, BNPL_MONTHS = 3, bnplAfter = unpaidBalance(BNPL, BNPL_MONTHLY, BNPL_MONTHS);
const bnpl: Reel = {
  id: 'bnpl-late-fees', topic: 'credit', tags: ['BNPL', 'pay later'],
  title: t('“Pay later” has a later', '“पे लेटर” का एक “लेटर” होता है'),
  scenes: [
    sc('think', t('Buy now, pay later feels like spending money you do not have yet. The bill still comes.', 'अभी ख़रीदो, बाद में दो, ऐसा लगता है जैसे वह पैसा ख़र्च हो रहा है जो अभी आपके पास नहीं। बिल फिर भी आता है।'), { big: t('Pay later', 'पे लेटर') }),
    sc('worry', fill(t('Miss the date and fees and interest start. {b} unpaid at an assumed {m}% a month becomes about {a} in {n} months.', 'तारीख़ चूकें तो शुल्क और ब्याज शुरू होते हैं। {b} बकाया, मान लें {m}% महीना, {n} महीने में लगभग {a} हो जाता है।'), { b: money(BNPL), m: BNPL_MONTHLY, n: BNPL_MONTHS, a: money(Math.round(bnplAfter)) }),
      { prop: { kind: 'bars', items: [{ label: t('Bill', 'बिल'), value: BNPL, text: money(BNPL), tone: 'gold' }, { label: t('After 3 months', '3 महीने बाद'), value: bnplAfter, text: money(Math.round(bnplAfter)), tone: 'red' }] } }),
    sc('think', t('Missed payments can also show up on your credit report, and some of these services report to credit bureaus.', 'छूटे भुगतान आपकी क्रेडिट रिपोर्ट में भी दिख सकते हैं, और ऐसी कुछ सेवाएँ क्रेडिट ब्यूरो को रिपोर्ट करती हैं।')),
    sc('happy', t('Treat each pay-later purchase as a loan. Count them together with your EMIs.', 'हर पे-लेटर ख़रीद को लोन मानें। उन्हें अपनी EMI के साथ गिनें।')),
    sc('cheer', t('Set a limit, switch on reminders, and pay before the due date.', 'एक सीमा तय करें, रिमाइंडर चालू करें, और देय तारीख़ से पहले चुकाएँ।')),
  ],
  quiz: { q: t('How should you treat a pay-later purchase?', 'पे-लेटर ख़रीद को कैसे लें?'),
    options: [t('Like a loan you must repay on time', 'ऐसे लोन की तरह जिसे समय पर चुकाना है'), t('Like free money', 'मुफ़्त पैसे की तरह'), t('Like a gift', 'उपहार की तरह')], answer: 0,
    why: t('It is borrowing. Late fees, interest and credit-report entries follow if you miss the date.', 'यह उधार है। तारीख़ चूकने पर देरी का शुल्क, ब्याज और क्रेडिट रिपोर्ट में प्रविष्टि आती है।') },
};

export const CREDIT_MORE: Reel[] = [noCost, bnpl];

// ── Protection ───────────────────────────────────────────────────────────────────────────────────────────────────
const BUDGET = 50_000, TERM = 12_000, rest = BUDGET - TERM, restValue = yearlyDepositsValue(rest, 10, 20);
const termUlip: Reel = {
  id: 'term-vs-ulip', topic: 'protect', lesson: 'insurance', tags: ['term insurance', 'ULIP'],
  title: t('Term plan or ULIP?', 'टर्म प्लान या ULIP?'),
  scenes: [
    sc('think', t('Two products, two different jobs. Mixing them can hide what you pay for each.', 'दो प्रोडक्ट, दो अलग काम। उन्हें मिलाने से यह छिप सकता है कि हर एक के लिए आप क्या दे रहे हैं।'), { big: t('Two jobs', 'दो काम') }),
    sc('happy', t('A term plan is pure life cover. If you are alive at the end, nothing is paid back.', 'टर्म प्लान शुद्ध जीवन कवर है। अंत में आप जीवित हों तो कुछ वापस नहीं मिलता।'), { prop: { kind: 'steps', items: [t('Term: cover only', 'टर्म: सिर्फ़ कवर'), t('ULIP: cover plus market investment', 'ULIP: कवर और बाज़ार निवेश')] } }),
    sc('surprised', fill(t('Example: {b} a year, cover costing {c}, leaves {r}. Invested for 20 years at an assumed 10%: about {v}.', 'उदाहरण: साल में {b}, {c} का कवर, {r} बचता है। 20 साल हर साल मान लें 10% पर निवेश: लगभग {v}।'), { b: money(BUDGET), c: money(TERM), r: money(rest), v: money(restValue) }),
      { prop: { kind: 'bars', items: [{ label: t('Cover cost', 'कवर की लागत'), value: TERM, text: money(TERM), tone: 'gold' }, { label: t('Left to invest', 'निवेश को बचा'), value: rest, text: money(rest), tone: 'teal' }] } }),
    sc('think', t('A ULIP’s charges and lock-in differ by plan. Ask for the full charge table before you buy.', 'ULIP के शुल्क और लॉक-इन हर प्लान में अलग हैं। ख़रीदने से पहले पूरी शुल्क तालिका माँगें।')),
    sc('cheer', t('Many people keep cover and investing separate, so each cost is clear. Premiums here are only an example.', 'कई लोग कवर और निवेश अलग रखते हैं ताकि हर लागत साफ़ दिखे। यहाँ प्रीमियम सिर्फ़ उदाहरण हैं।')),
  ],
  quiz: { q: t('What does a term plan pay if you outlive the term?', 'अवधि के बाद भी आप जीवित हों तो टर्म प्लान क्या देता है?'),
    options: [t('Nothing, it is pure cover', 'कुछ नहीं, यह शुद्ध कवर है'), t('Double your premiums', 'आपके प्रीमियम का दोगुना'), t('A market return', 'बाज़ार जैसा रिटर्न')], answer: 0,
    why: t('You pay for protection against a risk, and a low price is the result of not paying a maturity amount.', 'आप जोखिम से सुरक्षा के लिए देते हैं, और कम क़ीमत का कारण है कि परिपक्वता की रकम नहीं मिलती।') },
};

const BILL = 200_000, CAP = 5_000, ROOM = 10_000, paid = proportionalClaim(BILL, CAP, ROOM);
const healthGotchas: Reel = {
  id: 'health-cover-gotchas', topic: 'protect', lesson: 'insurance', tags: ['health insurance', 'room rent', 'waiting period'],
  title: t('Health cover fine print', 'हेल्थ कवर के छोटे अक्षर'),
  scenes: [
    sc('worry', t('A health policy can pay much less than you expect. Three clauses decide most of it.', 'हेल्थ पॉलिसी आपकी उम्मीद से बहुत कम दे सकती है। ज़्यादातर तीन शर्तें तय करती हैं।'), { big: t('Fine print', 'छोटे अक्षर') }),
    sc('think', t('Waiting periods, room-rent limits and co-pay.', 'इंतज़ार की अवधि, कमरे के किराये की सीमा और को-पे।'), { prop: { kind: 'steps', items: [t('Waiting period', 'इंतज़ार की अवधि'), t('Room-rent limit', 'कमरे के किराये की सीमा'), t('Co-pay and sub-limits', 'को-पे और उप-सीमाएँ')] } }),
    sc('surprised', fill(t('Example: room limit {c} a day, a {r} room, a {b} bill. The claim can be cut in proportion to about {p}.', 'उदाहरण: कमरा सीमा {c} रोज़, {r} का कमरा, {b} का बिल। क्लेम अनुपात में घटकर लगभग {p} हो सकता है।'), { c: money(CAP), r: money(ROOM), b: money(BILL), p: money(paid) }),
      { prop: { kind: 'bars', items: [{ label: t('Bill', 'बिल'), value: BILL, text: money(BILL), tone: 'gold' }, { label: t('Claim paid', 'क्लेम मिला'), value: paid, text: money(paid), tone: 'red' }] } }),
    sc('think', t('A policy with no room-rent limit avoids this. Whatever you pick, read the exact wording.', 'जिस पॉलिसी में कमरे के किराये की सीमा नहीं होती, वह इससे बचाती है। जो भी चुनें, सटीक शब्द पढ़ें।')),
    sc('cheer', t('Ask the insurer in writing about these three before you buy.', 'ख़रीदने से पहले इन तीनों के बारे में बीमा कंपनी से लिखित में पूछें।')),
  ],
  quiz: { q: t('What can a room-rent limit do to your claim?', 'कमरे के किराये की सीमा आपके क्लेम का क्या कर सकती है?'),
    options: [t('Cut the whole claim in proportion', 'पूरे क्लेम को अनुपात में घटा सकती है'), t('Nothing at all', 'कुछ नहीं'), t('Double the claim', 'क्लेम दोगुना कर सकती है')], answer: 0,
    why: t('Many policies reduce other charges too, not just the room, when the room costs more than the limit.', 'कई पॉलिसियाँ कमरा सीमा से महँगा होने पर सिर्फ़ कमरा नहीं, दूसरे शुल्क भी घटा देती हैं।') },
};

const PARENT_80D = 50_000, parentSaved = Math.round(taxAtSlab(PARENT_80D, 30));
const parentsCover: Reel = {
  id: 'parents-health-cover', topic: 'protect', lesson: 'insurance', tags: ['parents', 'health insurance', '80D'],
  title: t('Health cover for your parents', 'माता-पिता के लिए हेल्थ कवर'),
  scenes: [
    sc('think', t('Medical costs hit hardest in later years, and so do premiums. Start the conversation early.', 'इलाज का ख़र्च बाद के सालों में सबसे भारी पड़ता है, और प्रीमियम भी। बातचीत जल्दी शुरू करें।'), { big: t('Your parents', 'माता-पिता') }),
    sc('happy', t('A separate policy for them keeps their claims apart from yours and your family’s cover.', 'उनकी अलग पॉलिसी उनके क्लेम को आपके और आपके परिवार के कवर से अलग रखती है।')),
    sc('worry', t('Check these before you buy:', 'ख़रीदने से पहले ये जाँचें:'), { prop: { kind: 'steps', items: [t('Waiting period for existing illness', 'पहले से बीमारी का इंतज़ार'), t('Room-rent limit', 'कमरे की सीमा'), t('Co-pay for older ages', 'उम्र पर को-पे'), t('Renewal terms', 'रिन्यूअल की शर्तें')] } }),
    sc('surprised', fill(t('In the old regime, senior-citizen parents’ premiums can be deducted up to {d}. At the 30% slab, about {s} saved.', 'पुराने रिजीम में वरिष्ठ माता-पिता के प्रीमियम की कटौती {d} तक मिल सकती है। 30% स्लैब में लगभग {s} बचते हैं।'), { d: money(PARENT_80D), s: money(parentSaved) })),
    sc('cheer', t('Limits change, so confirm the current ones. Buy cover because they need it, not for the tax.', 'सीमाएँ बदलती हैं, इसलिए ताज़ा सीमा पक्की करें। कवर इसलिए लें कि उन्हें ज़रूरत है, टैक्स के लिए नहीं।')),
  ],
  quiz: { q: t('Why consider a separate health policy for parents?', 'माता-पिता के लिए अलग हेल्थ पॉलिसी क्यों सोचें?'),
    options: [t('Their claims and premiums do not eat into your own cover', 'उनके क्लेम और प्रीमियम आपके अपने कवर पर बोझ नहीं डालते'), t('It is always cheaper', 'वह हमेशा सस्ती होती है'), t('It needs no medical details', 'उसमें मेडिकल जानकारी नहीं देनी पड़ती')], answer: 0,
    why: t('Separate cover keeps each family member’s sum insured intact and makes the terms easier to compare.', 'अलग कवर हर सदस्य की बीमित राशि सुरक्षित रखता है और शर्तों की तुलना आसान बनाता है।') },
};

const nominee: Reel = {
  id: 'nominee-basics', topic: 'protect', tags: ['nominee', 'succession'],
  title: t('Name your nominees', 'अपने नॉमिनी तय करें'),
  scenes: [
    sc('think', t('If you were gone tomorrow, who could claim your bank balance, policies and funds?', 'अगर आप कल न रहें, तो आपका बैंक बैलेंस, पॉलिसी और फ़ंड कौन क्लेम कर सकेगा?'), { big: t('Nominee', 'नॉमिनी') }),
    sc('happy', t('A nominee is the person named to receive the money. Add one on every account.', 'नॉमिनी वह व्यक्ति है जिसे पैसा मिलने के लिए नामित किया जाता है। हर खाते में एक जोड़ें।'), { prop: { kind: 'steps', items: [t('Bank accounts and FDs', 'बैंक खाते और FD'), t('Insurance policies', 'बीमा पॉलिसियाँ'), t('Mutual funds and demat', 'म्यूचुअल फ़ंड और डीमैट'), t('EPF and NPS', 'EPF और NPS')] } }),
    sc('worry', t('A nominee is not always the final owner. A will or succession law can decide who is entitled in the end.', 'नॉमिनी हमेशा अंतिम मालिक नहीं होता। अंत में कौन हक़दार है, यह वसीयत या उत्तराधिकार क़ानून तय कर सकता है।')),
    sc('think', t('Update nominees after marriage, a child or a loss. Old names are a common problem.', 'शादी, बच्चे या किसी की मृत्यु के बाद नॉमिनी बदलें। पुराने नाम आम परेशानी हैं।')),
    sc('cheer', t('Tell your family where the list is kept. A short note can save months.', 'परिवार को बताएँ कि सूची कहाँ रखी है। एक छोटा नोट महीनों बचा सकता है।')),
  ],
  quiz: { q: t('When should you review your nominees?', 'नॉमिनी की समीक्षा कब करनी चाहिए?'),
    options: [t('After marriage, a child or a loss', 'शादी, बच्चे या किसी की मृत्यु के बाद'), t('Never, once is enough', 'कभी नहीं, एक बार काफ़ी है'), t('Only when you retire', 'सिर्फ़ रिटायर होने पर')], answer: 0,
    why: t('Life changes, and an old nominee can leave the wrong person to claim or delay the right one.', 'जीवन बदलता है, और पुराना नॉमिनी ग़लत व्यक्ति को हक़ दे सकता है या सही व्यक्ति को देर करा सकता है।') },
};

const B_BILL = 1_200_000, B_BASE = 500_000, B_DED = 500_000, B_TOP = 2_000_000;
const split = superTopUpSplit(B_BILL, B_BASE, B_DED, B_TOP);
const topUp: Reel = {
  id: 'super-top-up', topic: 'protect', lesson: 'insurance', tags: ['health insurance', 'top-up'],
  title: t('A super top-up, simply', 'सुपर टॉप-अप, आसान भाषा में'),
  scenes: [
    sc('worry', t('One large hospital bill can empty a small cover. A bigger plan can cost a lot.', 'एक बड़ा अस्पताल बिल छोटे कवर को ख़ाली कर सकता है। बड़ा प्लान महँगा हो सकता है।'), { big: t('Big bills', 'बड़े बिल') }),
    sc('think', t('A super top-up is a cheaper extra layer. It starts paying once the bill crosses a limit you choose.', 'सुपर टॉप-अप सस्ती अतिरिक्त परत है। बिल आपकी चुनी सीमा पार करे तो वह देना शुरू करता है।')),
    sc('surprised', fill(t('Example: {b} bill, {c} base, {t} super top-up after {d}. Base pays {x}, top-up {y}, you {z}.', 'उदाहरण: {b} का बिल, {c} बेस, {d} के बाद {t} का सुपर टॉप-अप। बेस {x}, टॉप-अप {y}, आप {z} देते हैं।'), { b: money(B_BILL), c: money(B_BASE), t: money(B_TOP), d: money(B_DED), x: money(split.base), y: money(split.topUp), z: money(split.you) }),
      { prop: { kind: 'bars', items: [{ label: t('Base pays', 'बेस देता'), value: split.base, text: money(split.base), tone: 'teal' }, { label: t('Top-up pays', 'टॉप-अप देता'), value: split.topUp, text: money(split.topUp), tone: 'gold' }] } }),
    sc('think', t('The limit usually matches your base cover. Check that the two policies fit together.', 'सीमा आम तौर पर आपके बेस कवर के बराबर रखी जाती है। देखें कि दोनों पॉलिसियाँ आपस में मेल खाती हैं।')),
    sc('cheer', t('Compare the waiting periods and terms of both, and read the exact wording.', 'दोनों की इंतज़ार अवधि और शर्तों की तुलना करें, और सटीक शब्द पढ़ें।')),
  ],
  quiz: { q: t('When does a super top-up start paying?', 'सुपर टॉप-अप कब देना शुरू करता है?'),
    options: [t('After the bill passes its deductible', 'बिल उसकी डिडक्टिबल पार करने के बाद'), t('From the first rupee', 'पहले रुपये से'), t('Only if you have no other policy', 'सिर्फ़ तब जब कोई और पॉलिसी न हो')], answer: 0,
    why: t('It sits above a limit, which is why it is cheaper than a plain plan of the same size.', 'यह एक सीमा के ऊपर बैठता है, इसीलिए उसी आकार के सादे प्लान से सस्ता होता है।') },
};

const ESSENTIALS = [12_000, 8_000, 8_000, 2_000], essentials = ESSENTIALS.reduce((a, b) => a + b, 0);
const target: Reel = {
  id: 'emergency-target', topic: 'protect', tags: ['emergency fund', 'target'],
  title: t('Your emergency fund number', 'आपका आपातकालीन फ़ंड नंबर'),
  scenes: [
    sc('think', t('Start from what you must pay even with no income: rent, food, EMIs and bills. Not your full spending.', 'उससे शुरू करें जो आमदनी न होने पर भी देना ही पड़े: किराया, खाना, EMI और बिल। पूरा ख़र्च नहीं।'), { big: t('Essentials', 'ज़रूरी ख़र्च') }),
    sc('happy', fill(t('Example: rent, food, an EMI and bills come to {e} a month.', 'उदाहरण: किराया, खाना, एक EMI और बिल मिलाकर {e} महीना होते हैं।'), { e: money(essentials) }),
      { prop: { kind: 'counter', from: 0, to: essentials, format: 'inr', tone: 'cyan', label: t('essentials a month (example)', 'ज़रूरी ख़र्च महीना (उदाहरण)') } }),
    sc('surprised', fill(t('A common guide is 3 to 6 months. At 6 months that is {s}. A steady job may need less, an unsteady income more.', 'आम सुझाव 3 से 6 महीने है। 6 महीने पर यह {s} है। पक्की नौकरी में कम चल सकता है, अनिश्चित आय में ज़्यादा।'), { s: money(essentials * 6) }),
      { prop: { kind: 'bars', items: [{ label: t('3 months', '3 महीने'), value: essentials * 3, text: money(essentials * 3), tone: 'gold' }, { label: t('6 months', '6 महीने'), value: essentials * 6, text: money(essentials * 6), tone: 'teal' }] } }),
    sc('think', t('Build it in steps: one month first, then three, then your target.', 'इसे चरणों में बनाएँ: पहले एक महीना, फिर तीन, फिर आपका लक्ष्य।')),
    sc('cheer', t('Write your number down today. A target you can see is easier to reach.', 'आज अपना नंबर लिख लें। जो लक्ष्य दिखता है उस तक पहुँचना आसान है।')),
  ],
  quiz: { q: t('What should the fund be sized on?', 'फ़ंड का आकार किस पर तय करें?'),
    options: [t('Your essential monthly costs', 'आपके ज़रूरी मासिक ख़र्च'), t('Your salary', 'आपकी सैलरी'), t('Your wish list', 'आपकी इच्छा-सूची')], answer: 0,
    why: t('In an emergency you cut wants, so the fund only has to cover what you cannot skip.', 'आपातकाल में चाहतें घट जाती हैं, इसलिए फ़ंड को सिर्फ़ वह चलाना है जिसे छोड़ा नहीं जा सकता।') },
};

const whereFund: Reel = {
  id: 'where-keep-fund', topic: 'protect', tags: ['emergency fund', 'liquidity'],
  title: t('Where to keep your emergency fund', 'आपातकालीन फ़ंड कहाँ रखें'),
  scenes: [
    sc('think', t('An emergency fund has two jobs: be there when needed, and not lose value when you need it.', 'आपातकालीन फ़ंड के दो काम हैं: ज़रूरत पर मौजूद रहना, और ज़रूरत के समय क़ीमत न खोना।'), { big: t('Safe and ready', 'सुरक्षित और तैयार') }),
    sc('happy', t('People often layer it by how fast they can reach it.', 'लोग अक्सर इसे इस हिसाब से परतों में रखते हैं कि कितनी जल्दी निकल सके।'), { prop: { kind: 'steps', items: [t('Savings account: instant', 'बचत खाता: तुरंत'), t('Sweep-in FD: a day', 'स्वीप-इन FD: एक दिन'), t('Low-risk liquid fund: a day or two', 'कम जोखिम का लिक्विड फ़ंड: एक-दो दिन')] } }),
    sc('worry', t('Avoid keeping it where it is locked, or where the price can fall just when you need it.', 'इसे ऐसी जगह न रखें जहाँ वह बँध जाए, या जहाँ क़ीमत ठीक ज़रूरत के समय गिर सकती हो।')),
    sc('think', t('Return is the last thing to ask of this money. Access and safety come first.', 'इस पैसे से रिटर्न की उम्मीद सबसे आख़िर में करें। पहुँच और सुरक्षा पहले हैं।')),
    sc('cheer', t('Keep it apart from your daily account so you do not spend it by habit.', 'इसे रोज़ के खाते से अलग रखें ताकि आदतन ख़र्च न हो।')),
  ],
  quiz: { q: t('What matters most for an emergency fund?', 'आपातकालीन फ़ंड के लिए सबसे अहम क्या है?'),
    options: [t('Safety and quick access', 'सुरक्षा और जल्दी पहुँच'), t('The highest possible return', 'सबसे ऊँचा संभव रिटर्न'), t('A long lock-in', 'लंबा लॉक-इन')], answer: 0,
    why: t('You must get the full amount quickly, so access and safety beat returns here.', 'आपको पूरी रकम जल्दी चाहिए, इसलिए यहाँ पहुँच और सुरक्षा रिटर्न से ऊपर हैं।') },
};

export const PROTECT_MORE: Reel[] = [termUlip, healthGotchas, parentsCover, nominee, topUp, target, whereFund];
