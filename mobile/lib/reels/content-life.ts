// Credit score, home loan, scams and goals reels. Figures come from lib/reels/figures.ts and lib/debt.ts.
import { calcPrepayment } from '@/lib/debt';
import { emi, fill, loanFromEmi, money, sipFutureValue, sipNeeded, stepUpSipFutureValue, unpaidBalance } from '@/lib/reels/figures';
import { sc, t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

// ── Credit score: the basics ─────────────────────────────────────────────────────────────────────────────────────
const scoreBasics: Reel = {
  id: 'credit-score-basics', topic: 'credit', tags: ['credit score', 'CIBIL'],
  title: t('What is a credit score?', 'क्रेडिट स्कोर क्या है?'),
  scenes: [
    sc('think', t('A credit score is a number from 300 to 900 that tells lenders how you handle borrowed money.', 'क्रेडिट स्कोर 300 से 900 के बीच की संख्या है जो लेनदारों को बताती है कि आप उधार का पैसा कैसे सँभालते हैं।'), { big: t('300 to 900', '300 से 900') }),
    sc('happy', t('A higher score usually means easier approval and better terms on a loan.', 'ज़्यादा स्कोर का मतलब आम तौर पर लोन की आसान मंज़ूरी और बेहतर शर्तें हैं।')),
    sc('think', t('A few habits move it the most.', 'कुछ आदतें इसे सबसे ज़्यादा प्रभावित करती हैं।'), { prop: { kind: 'steps', items: [t('Pay every bill on time', 'हर बिल समय पर चुकाएँ'), t('Keep card usage low', 'कार्ड का इस्तेमाल कम रखें'), t('Keep old accounts open', 'पुराने खाते चालू रखें'), t('Apply for credit rarely', 'क्रेडिट कम माँगें')] } }),
    sc('surprised', t('Paying on time is the biggest one. A single late payment can pull the score down.', 'समय पर भुगतान सबसे बड़ा है। एक देरी भी स्कोर गिरा सकती है।')),
    sc('cheer', t('You can get your full credit report free once a year. Read it for mistakes.', 'आप साल में एक बार पूरी क्रेडिट रिपोर्ट मुफ़्त पा सकते हैं। उसमें ग़लतियाँ देखें।')),
  ],
  quiz: { q: t('Which habit matters most for your score?', 'स्कोर के लिए कौन-सी आदत सबसे अहम है?'),
    options: [t('Paying bills and EMIs on time', 'बिल और EMI समय पर चुकाना'), t('Having as many cards as possible', 'ज़्यादा से ज़्यादा कार्ड रखना'), t('Closing every old account', 'हर पुराना खाता बंद करना')], answer: 0,
    why: t('Lenders care most about whether you repay on time.', 'लेनदार सबसे ज़्यादा देखते हैं कि आप समय पर चुकाते हैं या नहीं।') },
};

// ── Credit score: utilisation ────────────────────────────────────────────────────────────────────────────────────
const LIMIT = 200_000, GUIDE = 30, guideAmt = (LIMIT * GUIDE) / 100;
const utilisation: Reel = {
  id: 'credit-utilisation', topic: 'credit', tags: ['credit card', 'utilisation'],
  title: t('Credit utilisation, simply', 'क्रेडिट यूटिलाइज़ेशन, आसान भाषा में'),
  scenes: [
    sc('think', t('Utilisation is how much of your card limit you are using.', 'यूटिलाइज़ेशन यानी आप अपने कार्ड की सीमा का कितना हिस्सा इस्तेमाल कर रहे हैं।'), { big: t('Usage', 'इस्तेमाल') }),
    sc('happy', fill(t('On a {l} limit, using {u} is 30% usage. A common guide is to stay under about that.', '{l} की सीमा पर {u} का इस्तेमाल 30% है। आम सुझाव है कि लगभग इससे नीचे रहें।'), { l: money(LIMIT), u: money(guideAmt) }),
      { prop: { kind: 'donut', parts: [{ value: guideAmt, label: t('Used', 'इस्तेमाल'), tone: 'cyan' }, { value: LIMIT - guideAmt, label: t('Free', 'ख़ाली'), tone: 'teal' }], centre: t('30% used', '30% प्रयोग') } }),
    sc('worry', t('Using most of your limit every month can look risky to lenders, even if you pay in full.', 'हर महीने सीमा का ज़्यादातर हिस्सा इस्तेमाल करना लेनदारों को जोखिम भरा लग सकता है, भले आप पूरा चुकाएँ।')),
    sc('think', t('Spend less on the card, pay before the statement date, or ask for a higher limit.', 'कार्ड पर कम ख़र्च करें, स्टेटमेंट तारीख़ से पहले चुकाएँ, या ऊँची सीमा माँगें।')),
    sc('cheer', t('Low usage plus on-time payment is the combination lenders like.', 'कम इस्तेमाल और समय पर भुगतान, यही जोड़ी लेनदारों को पसंद है।')),
  ],
  quiz: { q: t('Which usage looks safest to lenders on a ₹2 lakh limit?', '₹2 लाख की सीमा पर लेनदारों को कौन-सा इस्तेमाल सबसे सुरक्षित लगता है?'),
    options: [t('About ₹60,000', 'लगभग ₹60,000'), t('About ₹1.9 lakh', 'लगभग ₹1.9 लाख'), t('The full ₹2 lakh', 'पूरे ₹2 लाख')], answer: 0,
    why: t('Lower usage shows you are not leaning on credit.', 'कम इस्तेमाल दिखाता है कि आप क्रेडिट पर ज़्यादा निर्भर नहीं हैं।') },
};

// ── Credit score: the card interest trap ─────────────────────────────────────────────────────────────────────────
const OWED = 50_000, MONTHLY = 3.5, afterYear = unpaidBalance(OWED, MONTHLY, 12);
const cardTrap: Reel = {
  id: 'card-interest-trap', topic: 'credit', tags: ['credit card', 'interest'],
  title: t('The minimum-due trap', 'मिनिमम ड्यू का जाल'),
  scenes: [
    sc('worry', t('Paying only the minimum due keeps the card going, but the rest keeps growing.', 'सिर्फ़ मिनिमम ड्यू चुकाने से कार्ड चलता रहता है, पर बाक़ी रकम बढ़ती रहती है।'), { big: t('Minimum due', 'मिनिमम ड्यू') }),
    sc('think', t('Card interest is often quoted per month, and it adds up fast.', 'कार्ड का ब्याज अक्सर प्रति माह बताया जाता है, और वह तेज़ी से जुड़ता है।')),
    sc('surprised', fill(t('Example: {o} left unpaid at {m}% a month, with no payments, grows to about {a} in a year.', 'उदाहरण: {o} बिना चुकाए, {m}% प्रति माह पर, बिना किसी भुगतान के एक साल में लगभग {a} हो जाता है।'), { o: money(OWED), m: MONTHLY, a: money(afterYear) }),
      { prop: { kind: 'bars', items: [{ label: t('Today', 'आज'), value: OWED, text: money(OWED), tone: 'gold' }, { label: t('In a year', 'एक साल में'), value: afterYear, text: money(afterYear), tone: 'red' }] } }),
    sc('think', t('Your card’s own rate may differ, so check your statement. Treat these numbers as an illustration.', 'आपके कार्ड की दर अलग हो सकती है, स्टेटमेंट देखें। इन आँकड़ों को उदाहरण मानें।')),
    sc('cheer', t('Pay the full bill when you can. If you cannot, ask the bank about a cheaper way to repay.', 'हो सके तो पूरा बिल चुकाएँ। न हो सके तो बैंक से सस्ता तरीक़ा पूछें।')),
  ],
  quiz: { q: t('If you pay only the minimum due, what happens to the rest?', 'सिर्फ़ मिनिमम ड्यू चुकाने पर बाक़ी रकम का क्या होता है?'),
    options: [t('It is waived', 'माफ़ हो जाती है'), t('It keeps earning interest for the bank', 'उस पर बैंक के लिए ब्याज बनता रहता है'), t('It moves to your savings', 'वह आपकी बचत में चली जाती है')], answer: 1,
    why: t('The unpaid part is charged interest, month after month.', 'न चुकाए हिस्से पर महीने-दर-महीने ब्याज लगता है।') },
};

// ── Credit score: enquiries ──────────────────────────────────────────────────────────────────────────────────────
const enquiries: Reel = {
  id: 'credit-enquiries', topic: 'credit', tags: ['credit enquiry', 'loan application'],
  title: t('Too many loan applications', 'बहुत सारी लोन अर्ज़ियाँ'),
  scenes: [
    sc('think', t('When a lender checks your credit to decide on a loan, it leaves an enquiry on your report.', 'जब कोई लेनदार लोन तय करने के लिए आपकी क्रेडिट जाँचता है, तो रिपोर्ट पर एक एन्क्वायरी दर्ज होती है।'), { big: t('Enquiries', 'एन्क्वायरी') }),
    sc('worry', t('Many applications in a short time can look like you are desperate for credit, and can lower your score.', 'थोड़े समय में कई अर्ज़ियाँ ऐसी लग सकती हैं कि आपको क्रेडिट की सख़्त ज़रूरत है, और स्कोर घट सकता है।')),
    sc('happy', t('Checking your own score through a proper service is a soft check. It does not hurt it.', 'सही सेवा से अपना ख़ुद का स्कोर देखना सॉफ़्ट चेक है। इससे स्कोर नहीं घटता।')),
    sc('think', t('Before you apply, check your eligibility first, and shop around with care.', 'अर्ज़ी से पहले अपनी पात्रता जाँचें, और सोच-समझकर तुलना करें।'), { prop: { kind: 'steps', items: [t('Check your own score', 'अपना स्कोर देखें'), t('Check eligibility first', 'पहले पात्रता जाँचें'), t('Apply to one or two', 'एक-दो जगह अर्ज़ी दें')] } }),
    sc('cheer', t('Space your applications out, and only apply for credit you need.', 'अर्ज़ियों के बीच अंतर रखें, और वही क्रेडिट माँगें जो ज़रूरी हो।')),
  ],
  quiz: { q: t('Does checking your own credit score hurt it?', 'क्या अपना क्रेडिट स्कोर देखने से वह घटता है?'),
    options: [t('No, it is a soft check', 'नहीं, यह सॉफ़्ट चेक है'), t('Yes, every time', 'हाँ, हर बार'), t('Only on weekends', 'सिर्फ़ सप्ताहांत में')], answer: 0,
    why: t('A self check is not a lender’s hard enquiry. Many applications to lenders are what count.', 'ख़ुद की जाँच लेनदार की हार्ड एन्क्वायरी नहीं है। गिनती लेनदारों को दी गई कई अर्ज़ियों की होती है।') },
};

export const CREDIT_REELS: Reel[] = [scoreBasics, utilisation, cardTrap, enquiries];

// ── Home loan: how much can you borrow ───────────────────────────────────────────────────────────────────────────
const INCOME = 100_000, SHARE = 40, HL_RATE = 8.5, HL_YEARS = 20;
const emiCap = (INCOME * SHARE) / 100, canBorrow = loanFromEmi(emiCap, HL_RATE, HL_YEARS);
const affordability: Reel = {
  id: 'home-loan-affordability', topic: 'loans', lesson: 'insight-emi', tags: ['home loan', 'EMI', 'affordability'],
  title: t('How big a home loan is safe?', 'कितना बड़ा होम लोन सुरक्षित है?'),
  scenes: [
    sc('think', t('Start from what you can pay every month, not from the price of the house.', 'घर की कीमत से नहीं, इस से शुरू करें कि आप हर महीने कितना चुका सकते हैं।'), { big: t('Start with EMI', 'EMI से शुरू') }),
    sc('happy', fill(t('A common guide: keep all your EMIs under about 40% of take-home pay. On {i} a month, that is {c}.', 'एक आम सुझाव: सारी EMI हाथ में आने वाली आय के लगभग 40% से कम रखें। {i} महीने पर यह {c} है।'), { i: money(INCOME), c: money(emiCap) }),
      { prop: { kind: 'counter', from: 0, to: emiCap, format: 'inr', tone: 'cyan', label: t('EMI ceiling (example)', 'EMI की सीमा (उदाहरण)') } }),
    sc('surprised', fill(t('At an assumed {r}% for {y} years, that EMI repays a loan of about {l}.', 'मान लें {r}% पर {y} साल, तो यह EMI लगभग {l} का लोन चुका सकती है।'), { r: HL_RATE, y: HL_YEARS, l: money(canBorrow) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(canBorrow), format: 'inr', tone: 'teal', label: t('loan that fits (illustration)', 'जो लोन समाता है (उदाहरण)') } }),
    sc('worry', t('A bank may approve more than you can comfortably repay. Approval is not the same as affordable.', 'बैंक उससे ज़्यादा मंज़ूर कर सकता है जितना आप आराम से चुका सकें। मंज़ूरी का मतलब सस्ता नहीं।')),
    sc('cheer', t('Keep room for repairs, a job break and rate changes before you decide.', 'फ़ैसले से पहले मरम्मत, नौकरी में अंतराल और दर बदलाव की गुंजाइश रखें।')),
  ],
  quiz: { q: t('Where should you start when choosing a home loan size?', 'होम लोन की रकम चुनते समय कहाँ से शुरू करें?'),
    options: [t('The EMI you can pay comfortably', 'जो EMI आप आराम से चुका सकें'), t('The maximum the bank offers', 'बैंक जो अधिकतम दे'), t('The most expensive house you like', 'सबसे महँगा घर जो पसंद आए')], answer: 0,
    why: t('Your monthly comfort sets a safe loan, not the bank’s limit.', 'आपकी मासिक सुविधा सुरक्षित लोन तय करती है, बैंक की सीमा नहीं।') },
};

// ── Home loan: tenure ────────────────────────────────────────────────────────────────────────────────────────────
const HL = 5_000_000;
const e20 = emi(HL, HL_RATE, 20), e30 = emi(HL, HL_RATE, 30);
const total20 = e20 * 240, total30 = e30 * 360;
const tenure: Reel = {
  id: 'home-loan-tenure', topic: 'loans', lesson: 'insight-emi', tags: ['home loan', 'tenure', 'interest'],
  title: t('20 years or 30 years?', '20 साल या 30 साल?'),
  scenes: [
    sc('think', t('A longer loan means a smaller EMI. But there is a catch.', 'लंबे लोन का मतलब छोटी EMI। पर इसमें एक पेच है।'), { big: t('Longer = lighter?', 'लंबा = हल्का?') }),
    sc('happy', fill(t('Take {p} at an assumed {r}%. The EMI is about {a} for 20 years, or about {b} for 30 years.', '{p} का लोन, मान लें {r}%। EMI 20 साल में लगभग {a}, और 30 साल में लगभग {b}।'), { p: money(HL), r: HL_RATE, a: money(e20), b: money(e30) }),
      { prop: { kind: 'bars', items: [{ label: t('20 years', '20 साल'), value: e20, text: money(e20), tone: 'gold' }, { label: t('30 years', '30 साल'), value: e30, text: money(e30), tone: 'teal' }] } }),
    sc('surprised', fill(t('But in total you pay about {a} over 20 years and about {b} over 30.', 'पर कुल मिलाकर आप 20 साल में लगभग {a} और 30 साल में लगभग {b} चुकाते हैं।'), { a: money(total20), b: money(total30) }),
      { prop: { kind: 'bars', items: [{ label: t('20 years', '20 साल'), value: total20, text: money(total20), tone: 'teal' }, { label: t('30 years', '30 साल'), value: total30, text: money(total30), tone: 'red' }] } }),
    sc('think', t('A lighter EMI helps now but costs more interest. You can choose longer and prepay when you can.', 'हल्की EMI अभी राहत देती है पर ब्याज बढ़ाती है। आप लंबा चुन सकते हैं और हो सके तो प्रीपे करें।')),
    sc('cheer', t('Pick the shortest tenure that still fits your monthly comfort.', 'वह सबसे छोटी अवधि चुनें जो आपकी मासिक सुविधा में अब भी फ़िट हो।')),
  ],
  quiz: { q: t('What is the cost of a longer home-loan tenure?', 'होम लोन की लंबी अवधि की क्या क़ीमत है?'),
    options: [t('More total interest', 'कुल ब्याज ज़्यादा'), t('A higher EMI', 'ज़्यादा EMI'), t('No cost at all', 'कोई क़ीमत नहीं')], answer: 0,
    why: t('You borrow the money for longer, so the total interest goes up.', 'आप पैसा ज़्यादा समय के लिए उधार लेते हैं, इसलिए कुल ब्याज बढ़ता है।') },
};

// ── Home loan: prepay ────────────────────────────────────────────────────────────────────────────────────────────
const e = Math.round(emi(HL, HL_RATE, HL_YEARS)), EXTRA = 8_000;
const base = calcPrepayment(HL, HL_RATE, e, 0), prepaid = calcPrepayment(HL, HL_RATE, e, EXTRA);
const interestSaved = base.interest - prepaid.interest, yearsSaved = Math.round((base.months - prepaid.months) / 12);
const prepay: Reel = {
  id: 'home-loan-prepay', topic: 'loans', lesson: 'insight-emi', tags: ['home loan', 'prepayment'],
  title: t('What prepaying a home loan does', 'होम लोन प्रीपे करने से क्या होता है'),
  scenes: [
    sc('think', t('Prepaying means paying extra towards the loan balance, on top of your EMI.', 'प्रीपे का मतलब है EMI के ऊपर लोन की बकाया रकम में अतिरिक्त पैसा देना।'), { big: t('Prepay', 'प्रीपे') }),
    sc('happy', fill(t('Example: a {p} loan at an assumed {r}% for 20 years. Add {x} extra every month.', 'उदाहरण: {p} का लोन, मान लें {r}%, 20 साल। हर महीने {x} अतिरिक्त जोड़ें।'), { p: money(HL), r: HL_RATE, x: money(EXTRA) })),
    sc('surprised', fill(t('That saves about {i} of interest and finishes the loan about {y} years sooner.', 'इससे लगभग {i} का ब्याज बचता है और लोन लगभग {y} साल पहले ख़त्म होता है।'), { i: money(interestSaved), y: yearsSaved }),
      { prop: { kind: 'bars', items: [{ label: t('No extra', 'बिना अतिरिक्त'), value: base.interest, text: money(base.interest), tone: 'red' }, { label: t('With extra', 'अतिरिक्त सहित'), value: prepaid.interest, text: money(prepaid.interest), tone: 'teal' }] } }),
    sc('think', t('Early prepayments help most, because the balance is high and interest is charged on it.', 'शुरू के प्रीपेमेंट सबसे ज़्यादा मदद करते हैं, क्योंकि बकाया ज़्यादा होता है और ब्याज उसी पर लगता है।')),
    sc('worry', t('Check for prepayment charges, and keep your emergency fund before you prepay.', 'प्रीपेमेंट शुल्क जाँचें, और प्रीपे से पहले आपातकालीन फ़ंड बनाए रखें।')),
    sc('cheer', t('Ask how the bank applies it: shorter tenure or smaller EMI.', 'बैंक से पूछें कि वह कैसे लगाता है: कम अवधि या छोटी EMI।')),
  ],
  quiz: { q: t('When does a prepayment save the most interest?', 'प्रीपेमेंट से सबसे ज़्यादा ब्याज कब बचता है?'),
    options: [t('Early in the loan', 'लोन की शुरुआत में'), t('In the last year', 'आख़िरी साल में'), t('It saves the same any time', 'कभी भी बराबर बचता है')], answer: 0,
    why: t('Interest is charged on the balance, which is largest early on.', 'ब्याज बकाया पर लगता है, जो शुरू में सबसे ज़्यादा होता है।') },
};

// ── Home loan: the other costs ───────────────────────────────────────────────────────────────────────────────────
const homeCosts: Reel = {
  id: 'home-loan-costs', topic: 'loans', lesson: 'insight-emi', tags: ['home loan', 'down payment', 'stamp duty'],
  title: t('Costs beyond the loan', 'लोन से ऊपर के ख़र्च'),
  scenes: [
    sc('surprised', t('The price of the house is not the full cost of buying it.', 'घर की कीमत उसे खरीदने का पूरा ख़र्च नहीं है।'), { big: t('More costs', 'और ख़र्च') }),
    sc('think', t('Lenders usually finance only part of the price. You bring the rest as a down payment.', 'लेनदार आम तौर पर कीमत का सिर्फ़ एक हिस्सा देते हैं। बाक़ी डाउन पेमेंट आप देते हैं।')),
    sc('worry', t('On top of that, there are charges that are easy to forget.', 'इसके ऊपर कुछ ऐसे ख़र्च हैं जिन्हें भूलना आसान है।'), { prop: { kind: 'steps', items: [t('Down payment', 'डाउन पेमेंट'), t('Stamp duty, registration', 'स्टैम्प ड्यूटी, रजिस्ट्रेशन'), t('Processing fee', 'प्रोसेसिंग फ़ीस'), t('Interiors, moving', 'इंटीरियर, शिफ़्टिंग')] } }),
    sc('think', t('Stamp duty and registration differ by state. Ask for the exact amounts before you commit.', 'स्टैम्प ड्यूटी और रजिस्ट्रेशन राज्य के हिसाब से अलग हैं। पक्का करने से पहले सटीक रकम पूछें।')),
    sc('cheer', t('Add all of it up first, and keep some savings untouched after the purchase.', 'पहले सब जोड़ें, और ख़रीद के बाद कुछ बचत हाथ न लगाएँ।')),
  ],
  quiz: { q: t('What do you usually pay on top of the loan?', 'लोन के ऊपर आम तौर पर आप क्या देते हैं?'),
    options: [t('A down payment and registration costs', 'डाउन पेमेंट और रजिस्ट्रेशन ख़र्च'), t('Nothing, the loan covers everything', 'कुछ नहीं, लोन में सब आ जाता है'), t('Only the first EMI', 'सिर्फ़ पहली EMI')], answer: 0,
    why: t('The loan rarely covers the full price and never the extra charges.', 'लोन शायद ही पूरी कीमत देता है और अतिरिक्त शुल्क कभी नहीं।') },
};

export const HOME_REELS: Reel[] = [affordability, tenure, prepay, homeCosts];

// ── Scams ────────────────────────────────────────────────────────────────────────────────────────────────────────
const otp: Reel = {
  id: 'otp-never-share', topic: 'safety', tags: ['OTP', 'fraud'],
  title: t('Never share these three things', 'ये तीन चीज़ें कभी साझा न करें'),
  scenes: [
    sc('worry', t('A caller says they are from your bank and asks for an OTP. That is a scam.', 'कोई कहता है वह आपके बैंक से है और OTP माँगता है। यह धोखा है।'), { big: t('Stop', 'रुकिए') }),
    sc('think', t('Your bank, the RBI and the police never need these from you.', 'आपके बैंक, RBI या पुलिस को ये आपसे कभी नहीं चाहिए।'), { prop: { kind: 'steps', items: [t('OTP', 'OTP'), t('UPI or ATM PIN', 'UPI या ATM PIN'), t('Card CVV and password', 'कार्ड CVV और पासवर्ड')] } }),
    sc('happy', t('Scammers create panic: “your account will be blocked”. Panic is the trick.', 'ठग घबराहट पैदा करते हैं: “आपका खाता बंद हो जाएगा”। घबराहट ही उनकी चाल है।')),
    sc('think', t('Hang up. Call the number printed on your card or on the bank’s official app.', 'फ़ोन काट दें। कार्ड पर छपे नंबर या बैंक के आधिकारिक ऐप से कॉल करें।')),
    sc('cheer', t('If money has gone, call 1930 straight away and report at cybercrime.gov.in.', 'अगर पैसा चला गया, तुरंत 1930 पर कॉल करें और cybercrime.gov.in पर शिकायत करें।')),
  ],
  quiz: { q: t('A caller from “your bank” asks for an OTP. What do you do?', '“आपके बैंक” से कॉल पर OTP माँगा जाता है। आप क्या करें?'),
    options: [t('Share it to avoid a block', 'ब्लॉक से बचने के लिए बता दें'), t('Hang up and call the bank’s official number', 'फ़ोन काटें और बैंक के आधिकारिक नंबर पर कॉल करें'), t('Share half of it', 'आधा बता दें')], answer: 1,
    why: t('A real bank never asks for your OTP. Check through the number you already trust.', 'असली बैंक OTP कभी नहीं माँगता। जिस नंबर पर आप पहले से भरोसा करते हैं, उससे जाँचें।') },
};

const upiCollect: Reel = {
  id: 'upi-collect-scam', topic: 'safety', tags: ['UPI', 'fraud'],
  title: t('Receiving money needs no PIN', 'पैसा पाने के लिए PIN नहीं चाहिए'),
  scenes: [
    sc('surprised', t('A buyer says “I sent money, approve the request” and asks for your UPI PIN.', 'ख़रीदार कहता है “पैसे भेजे हैं, रिक्वेस्ट मंज़ूर करें” और UPI PIN माँगता है।'), { big: t('PIN = paying', 'PIN = देना') }),
    sc('think', t('You enter a PIN only to send money. Receiving never needs it.', 'PIN सिर्फ़ पैसा भेजने के लिए डालते हैं। पाने के लिए कभी नहीं।')),
    sc('worry', t('A “collect request” asks YOU to pay. Read the screen: does it say pay, or receive?', '“कलेक्ट रिक्वेस्ट” आपसे पैसा माँगती है। स्क्रीन पढ़ें: पे लिखा है या रिसीव?')),
    sc('think', t('Be extra careful while selling things online. Scammers love those chats.', 'ऑनलाइन सामान बेचते समय ख़ास सावधान रहें। ठगों को ऐसी चैट पसंद हैं।')),
    sc('cheer', t('If it asks for your PIN, decline it. Report the request in the app.', 'अगर PIN माँगे, तो मना करें। ऐप में रिक्वेस्ट की शिकायत करें।')),
  ],
  quiz: { q: t('When do you need to enter your UPI PIN?', 'UPI PIN कब डालना पड़ता है?'),
    options: [t('Only when sending money', 'सिर्फ़ पैसा भेजते समय'), t('To receive money', 'पैसा पाने के लिए'), t('To check who is calling', 'यह जाँचने के लिए कि कौन कॉल कर रहा है')], answer: 0,
    why: t('The PIN authorises a payment out of your account. Receiving never needs it.', 'PIN आपके खाते से भुगतान को मंज़ूरी देता है। पाने के लिए ज़रूरत नहीं।') },
};

const digitalArrest: Reel = {
  id: 'digital-arrest', topic: 'safety', tags: ['fraud', 'cyber crime'],
  title: t('“Digital arrest” is a scam', '“डिजिटल अरेस्ट” एक धोखा है'),
  scenes: [
    sc('worry', t('A video call from “police” or “customs” says you are in a case and must stay on the call.', '“पुलिस” या “कस्टम” की वीडियो कॉल कहती है कि आप किसी केस में हैं और कॉल पर बने रहें।'), { big: t('Hang up', 'कॉल काटें') }),
    sc('think', t('No agency arrests anyone over a video call, or takes money to “clear” a case.', 'कोई एजेंसी वीडियो कॉल पर गिरफ़्तारी नहीं करती, न केस “निपटाने” के लिए पैसे लेती है।')),
    sc('surprised', t('They use fear, fake uniforms and time pressure. They want you alone and scared.', 'वे डर, नक़ली वर्दी और जल्दबाज़ी का इस्तेमाल करते हैं। वे चाहते हैं कि आप अकेले और डरे रहें।')),
    sc('think', t('End the call and talk to someone you trust. Do not transfer any money.', 'कॉल बंद करें और किसी भरोसेमंद से बात करें। कोई पैसा न भेजें।'), { prop: { kind: 'steps', items: [t('End the call', 'कॉल बंद करें'), t('Tell someone you trust', 'किसी भरोसेमंद को बताएँ'), t('Call 1930', '1930 पर कॉल करें')] } }),
    sc('cheer', t('Report quickly on 1930 or cybercrime.gov.in. Early reports give a better chance.', '1930 या cybercrime.gov.in पर जल्दी शिकायत करें। जल्दी बताने से बेहतर मौक़ा मिलता है।')),
  ],
  quiz: { q: t('Can an agency arrest you over a video call and ask for money?', 'क्या कोई एजेंसी वीडियो कॉल पर गिरफ़्तार कर पैसे माँग सकती है?'),
    options: [t('No, it is a scam', 'नहीं, यह धोखा है'), t('Yes, if the uniform looks real', 'हाँ, अगर वर्दी असली लगे'), t('Yes, for small amounts', 'हाँ, छोटी रकम के लिए')], answer: 0,
    why: t('There is no such thing as a digital arrest. End the call and report it.', 'डिजिटल अरेस्ट जैसी कोई चीज़ नहीं होती। कॉल बंद करें और शिकायत करें।') },
};

const investScam: Reel = {
  id: 'investment-scam', topic: 'safety', tags: ['fraud', 'SEBI', 'investment'],
  title: t('Spotting a fake investment tip', 'नक़ली निवेश सलाह कैसे पहचानें'),
  scenes: [
    sc('worry', t('A stranger adds you to a group that shares “sure” tips and shows big profits.', 'कोई अजनबी आपको ग्रुप में जोड़ता है जहाँ “पक्की” सलाह और बड़े मुनाफ़े दिखाए जाते हैं।'), { big: t('Red flags', 'ख़तरे के निशान') }),
    sc('think', t('Warning signs:', 'चेतावनी के संकेत:'), { prop: { kind: 'steps', items: [t('Fixed high profit promised', 'तय ऊँचे मुनाफ़े का वादा'), t('Pressure to pay today', 'आज ही पैसे देने का दबाव'), t('Unknown app or link', 'अनजान ऐप या लिंक'), t('Asked to pay a person', 'किसी व्यक्ति को भुगतान')] }, ms: 5400 }),
    sc('surprised', t('Real investments carry risk, and no one can promise a fixed high return.', 'असली निवेश में जोखिम होता है, और कोई तय ऊँचे रिटर्न का वादा नहीं कर सकता।')),
    sc('happy', t('Check that an adviser or broker is registered on SEBI’s official website.', 'देखें कि सलाहकार या ब्रोकर SEBI की आधिकारिक वेबसाइट पर पंजीकृत है।')),
    sc('cheer', t('Invest only through apps and brokers you have checked. If in doubt, wait and ask.', 'निवेश सिर्फ़ उन ऐप और ब्रोकर से करें जिन्हें आपने जाँचा है। शक हो तो रुकें और पूछें।')),
  ],
  quiz: { q: t('What is the biggest warning sign of an investment scam?', 'निवेश धोखे का सबसे बड़ा संकेत क्या है?'),
    options: [t('A promise of fixed, high profit', 'तय और ऊँचे मुनाफ़े का वादा'), t('A SEBI registration number', 'SEBI पंजीकरण नंबर'), t('A written risk warning', 'लिखी हुई जोखिम चेतावनी')], answer: 0,
    why: t('Real investments rise and fall. A fixed high return promise is a classic lure.', 'असली निवेश ऊपर-नीचे होते हैं। तय ऊँचे रिटर्न का वादा पुराना जाल है।') },
};

const kycLinks: Reel = {
  id: 'fake-kyc-links', topic: 'safety', tags: ['phishing', 'KYC'],
  title: t('The “update your KYC” message', '“KYC अपडेट करें” वाला मैसेज'),
  scenes: [
    sc('worry', t('An SMS says your account will be blocked today unless you update your KYC at a link.', 'एक SMS कहता है कि आज खाता बंद हो जाएगा जब तक आप लिंक पर KYC अपडेट न करें।'), { big: t('Urgent!', 'तुरंत!') }),
    sc('think', t('The link opens a page that looks like your bank’s, and asks for your login and OTP.', 'लिंक एक ऐसा पेज खोलता है जो आपके बैंक जैसा दिखता है और लॉगिन व OTP माँगता है।')),
    sc('surprised', t('That page is fake. Whatever you type goes straight to the scammer.', 'वह पेज नक़ली है। जो भी आप लिखते हैं वह सीधे ठग के पास जाता है।')),
    sc('think', t('Do not tap links in messages. Open the bank’s own app, or visit the branch.', 'मैसेज के लिंक पर टैप न करें। बैंक का अपना ऐप खोलें, या शाखा जाएँ।'), { prop: { kind: 'shield', text: t('Do not tap', 'टैप न करें'), sub: t('open the app', 'ऐप खोलें') } }),
    sc('cheer', t('Urgency is the clue. Slow down and check on your own.', 'जल्दबाज़ी ही सुराग़ है। रुकें और ख़ुद जाँचें।')),
  ],
  quiz: { q: t('An SMS link says “update KYC now”. What is safest?', 'SMS में “अभी KYC अपडेट करें” वाला लिंक है। सबसे सुरक्षित क्या है?'),
    options: [t('Tap quickly before it expires', 'ख़त्म होने से पहले जल्दी टैप करें'), t('Open the bank’s app or branch instead', 'इसके बजाय बैंक का ऐप या शाखा खोलें'), t('Forward it to friends', 'दोस्तों को भेज दें')], answer: 1,
    why: t('Fake links copy real pages. Go to the bank through the app you already use.', 'नक़ली लिंक असली पेज की नक़ल करते हैं। जिस ऐप का आप पहले से इस्तेमाल करते हैं, उसी से बैंक तक जाएँ।') },
};

export const SAFETY_REELS: Reel[] = [otp, upiCollect, digitalArrest, investScam, kycLinks];

// ── Goals: the SIP a goal needs ──────────────────────────────────────────────────────────────────────────────────
const GOAL = 5_000_000, G_RATE = 10, G_YEARS = 15;
const now = sipNeeded(GOAL, G_RATE, G_YEARS), later = sipNeeded(GOAL, G_RATE, G_YEARS - 5);
const goalSip: Reel = {
  id: 'goal-sip-needed', topic: 'goals', lesson: 'insight-sip', tags: ['goal', 'SIP'],
  title: t('Work backwards from your goal', 'अपने लक्ष्य से पीछे की ओर चलें'),
  scenes: [
    sc('think', t('A goal needs a number and a date. Then you can work out the monthly amount.', 'लक्ष्य के लिए एक रकम और एक तारीख़ चाहिए। फिर महीने की रकम निकल सकती है।'), { big: t('Goal first', 'पहले लक्ष्य') }),
    sc('happy', fill(t('Say {g} in {y} years. At an assumed {r}% a year, you would need about {n} a month.', 'मान लें {y} साल में {g}। मान लें {r}% सालाना, तो आपको महीने में लगभग {n} चाहिए।'), { g: money(GOAL), y: G_YEARS, r: G_RATE, n: money(Math.round(now)) }),
      { prop: { kind: 'counter', from: 0, to: Math.round(now), format: 'inr', tone: 'teal', label: t('a month, starting now (example)', 'महीना, अभी से (उदाहरण)') } }),
    sc('surprised', fill(t('Wait five years and the same goal needs about {l} a month.', 'पाँच साल रुकें, तो वही लक्ष्य महीने में लगभग {l} माँगता है।'), { l: money(Math.round(later)) }),
      { prop: { kind: 'bars', items: [{ label: t('Start now', 'अभी शुरू'), value: now, text: money(Math.round(now)), tone: 'teal' }, { label: t('Wait 5 years', '5 साल रुकें'), value: later, text: money(Math.round(later)), tone: 'red' }] } }),
    sc('worry', t('Returns are not fixed, so keep some buffer, and review the plan every year.', 'रिटर्न तय नहीं होते, इसलिए कुछ गुंजाइश रखें, और हर साल योजना देखें।')),
    sc('cheer', t('Name your goal, set a date, and start with whatever amount you can.', 'अपने लक्ष्य को नाम दें, तारीख़ तय करें, और जो रकम हो सके उससे शुरू करें।')),
  ],
  quiz: { q: t('Why does waiting make the monthly amount bigger?', 'रुकने पर महीने की रकम बड़ी क्यों हो जाती है?'),
    options: [t('Less time for the money to grow', 'पैसे को बढ़ने के लिए कम समय'), t('The goal gets cheaper', 'लक्ष्य सस्ता हो जाता है'), t('Banks charge extra', 'बैंक अतिरिक्त शुल्क लेते हैं')], answer: 0,
    why: t('Fewer years means each rupee has less time to grow, so you must put in more.', 'कम साल मतलब हर रुपये को बढ़ने का कम समय, इसलिए ज़्यादा डालना पड़ता है।') },
};

// ── Goals: buckets ───────────────────────────────────────────────────────────────────────────────────────────────
const buckets: Reel = {
  id: 'goal-time-buckets', topic: 'goals', lesson: 'principles', tags: ['goals', 'time horizon'],
  title: t('Match the money to the time', 'पैसे को समय से मिलाएँ'),
  scenes: [
    sc('think', t('Not every goal should sit in the same place. Time left is what matters.', 'हर लक्ष्य का पैसा एक ही जगह नहीं होना चाहिए। बचा हुआ समय मायने रखता है।'), { big: t('Time left', 'बचा समय'), ms: 4200 }),
    sc('happy', t('Sort your goals by when you need the money.', 'अपने लक्ष्यों को इस हिसाब से छाँटें कि पैसा कब चाहिए।'), { prop: { kind: 'steps', items: [t('Under 3 years: safe', '3 साल से कम: सुरक्षित'), t('3 to 7 years: a mix', '3 से 7 साल: मिश्रण'), t('Over 7 years: growth', '7 साल से ज़्यादा: ग्रोथ')] }, ms: 5200 }),
    sc('worry', t('Money needed soon should not sit where its value can fall right before you need it.', 'जो पैसा जल्द चाहिए वह ऐसी जगह न रखें जहाँ ठीक ज़रूरत के समय उसकी कीमत गिर सकती हो।')),
    sc('think', t('A long goal can take more ups and downs, because there is time to recover.', 'लंबे लक्ष्य में ज़्यादा उतार-चढ़ाव झेले जा सकते हैं, क्योंकि सँभलने का समय होता है।')),
    sc('cheer', t('As a goal gets closer, move its money towards safer places.', 'जैसे-जैसे लक्ष्य पास आए, उसका पैसा सुरक्षित जगहों की ओर ले जाएँ।')),
  ],
  quiz: { q: t('Money you need in 2 years is best kept…', 'जो पैसा 2 साल में चाहिए वह सबसे अच्छा कहाँ रहे?'),
    options: [t('Where it is safe and easy to reach', 'जहाँ सुरक्षित और आसानी से निकल सके'), t('Wherever returns look highest', 'जहाँ रिटर्न सबसे ऊँचे दिखें'), t('In whatever a friend picked', 'जो दोस्त ने चुना हो')], answer: 0,
    why: t('A short goal has no time to recover from a fall, so safety comes first.', 'छोटे लक्ष्य के पास गिरावट से उबरने का समय नहीं होता, इसलिए सुरक्षा पहले।') },
};

// ── Goals: inflation ─────────────────────────────────────────────────────────────────────────────────────────────
const TODAY_COST = 10_000_000, G_INF = 6, G_INF_YEARS = 20, futureCost = Math.round(TODAY_COST * Math.pow(1 + G_INF / 100, G_INF_YEARS));
const goalInflation: Reel = {
  id: 'goal-inflation', topic: 'goals', lesson: 'insight-inflation', tags: ['goal', 'inflation'],
  title: t('Your goal costs more later', 'आपका लक्ष्य आगे महँगा होगा'),
  scenes: [
    sc('surprised', t('A goal that costs a lot today will cost more by the time you reach it.', 'जो लक्ष्य आज महँगा है, वह पहुँचने तक और महँगा होगा।'), { big: t('It grows', 'यह बढ़ता है') }),
    sc('worry', fill(t('Example: a goal that costs {c} today. At an assumed {r}% inflation, in {y} years it costs about {f}.', 'उदाहरण: आज {c} का लक्ष्य। मान लें {r}% महँगाई, तो {y} साल बाद यह लगभग {f} का होगा।'), { c: money(TODAY_COST), r: G_INF, y: G_INF_YEARS, f: money(futureCost) }),
      { prop: { kind: 'bars', items: [{ label: t('Today', 'आज'), value: TODAY_COST, text: money(TODAY_COST), tone: 'gold' }, { label: t('In 20 years', '20 साल बाद'), value: futureCost, text: money(futureCost), tone: 'red' }] } }),
    sc('think', t('So set the target in future rupees, not today’s, or you will fall short.', 'इसलिए लक्ष्य आज के नहीं, भविष्य के रुपयों में तय करें, वरना कम पड़ेगा।')),
    sc('happy', t('Education and healthcare often rise faster than average prices. Check each goal.', 'पढ़ाई और इलाज अक्सर औसत कीमतों से तेज़ बढ़ते हैं। हर लक्ष्य अलग जाँचें।')),
    sc('cheer', t('Add inflation to every goal, then work out the monthly amount.', 'हर लक्ष्य में महँगाई जोड़ें, फिर महीने की रकम निकालें।')),
  ],
  quiz: { q: t('Why set a goal amount in future rupees?', 'लक्ष्य की रकम भविष्य के रुपयों में क्यों तय करें?'),
    options: [t('Prices will have risen by then', 'तब तक कीमतें बढ़ चुकी होंगी'), t('Taxes will be lower', 'टैक्स कम होगा'), t('Banks require it', 'बैंक इसे ज़रूरी मानते हैं')], answer: 0,
    why: t('Today’s amount will buy less later, so the target must be higher.', 'आज की रकम आगे कम ख़रीदेगी, इसलिए लक्ष्य ऊँचा होना चाहिए।') },
};

// ── Goals: step-up SIP ───────────────────────────────────────────────────────────────────────────────────────────
const S_SIP = 10_000, S_STEP = 10, S_RATE = 12, S_YEARS = 20;
const flat = sipFutureValue(S_SIP, S_RATE, S_YEARS), stepped = stepUpSipFutureValue(S_SIP, S_STEP, S_RATE, S_YEARS);
const stepUp: Reel = {
  id: 'goal-step-up', topic: 'goals', lesson: 'insight-sip', tags: ['SIP', 'step-up'],
  title: t('Raise your SIP as you earn more', 'कमाई बढ़े तो SIP भी बढ़ाएँ'),
  scenes: [
    sc('think', t('Your pay rises over the years. Your SIP can rise with it.', 'सालों में आपकी आय बढ़ती है। आपकी SIP भी उसके साथ बढ़ सकती है।'), { big: t('Step up', 'स्टेप-अप') }),
    sc('happy', fill(t('Example: {s} a month for {y} years, one plan flat, one raised {p}% every year.', 'उदाहरण: {s} महीना, {y} साल, एक योजना स्थिर, एक हर साल {p}% बढ़ती।'), { s: money(S_SIP), y: S_YEARS, p: S_STEP })),
    sc('surprised', fill(t('At an assumed {r}% a year, flat ends near {f}. Stepped up, near {u}.', 'मान लें {r}% सालाना: स्थिर में अंत में लगभग {f}। स्टेप-अप में लगभग {u}।'), { r: S_RATE, f: money(flat), u: money(stepped) }),
      { prop: { kind: 'bars', items: [{ label: t('Flat SIP', 'स्थिर SIP'), value: flat, text: money(flat), tone: 'gold' }, { label: t('Stepped up', 'स्टेप-अप'), value: stepped, text: money(stepped), tone: 'teal' }] } }),
    sc('worry', t('The return is an assumption, not a promise. What helps is the habit of raising the amount.', 'रिटर्न एक अनुमान है, वादा नहीं। मदद करती है रकम बढ़ाने की आदत।')),
    sc('cheer', t('Pick a month each year, such as after your raise, to increase your SIP.', 'हर साल एक महीना चुनें, जैसे वेतन बढ़ने के बाद, SIP बढ़ाने के लिए।')),
  ],
  quiz: { q: t('What does a step-up SIP do?', 'स्टेप-अप SIP क्या करती है?'),
    options: [t('Raises the monthly amount each year', 'हर साल मासिक रकम बढ़ाती है'), t('Guarantees a higher return', 'ऊँचे रिटर्न की गारंटी देती है'), t('Stops the SIP after a year', 'एक साल बाद SIP बंद कर देती है')], answer: 0,
    why: t('You put in more as your income grows, so more money works for you for longer.', 'आय बढ़ने के साथ आप ज़्यादा डालते हैं, इसलिए ज़्यादा पैसा ज़्यादा समय काम करता है।') },
};

export const GOAL_REELS: Reel[] = [goalSip, buckets, goalInflation, stepUp];
