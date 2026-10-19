// Wave 3, part 4: eight explainers on markets, protection claims, credit reports and tax forms. Concepts that stay true; amounts are examples worked in code.
import { fill, money, pctOf } from '@/lib/reels/figures';
import { readMs, sc, t } from '@/lib/reels/kit';
import type { L, Reel } from '@/lib/reels/types';

const atLeast = (say: L, ms: number) => ({ ms: Math.max(readMs(say), ms) });

// ── Stocks ───────────────────────────────────────────────────────────────────────────────────────────────────────
const PRICE = 500, QTY = 10, COST = PRICE * QTY, FALL = 20, LEFT = COST - pctOf(COST, FALL);
const stocks: Reel = {
  id: 'stock-basics', topic: 'invest', tags: ['stocks', 'shares'],
  title: t('What owning a share means', 'शेयर का मालिक होने का मतलब'),
  scenes: [
    sc('think', t('A share is a small piece of ownership in a company. Own one, and you own a sliver of it.', 'शेयर किसी कंपनी में मालिकाना हक़ का छोटा हिस्सा है। एक ख़रीदें तो आप उसके एक टुकड़े के मालिक हैं।'), { big: t('A small piece', 'एक छोटा हिस्सा'), ...atLeast(t('x'.repeat(95), 'x'.repeat(95)), 4800) }),
    sc('happy', fill(t('{q} shares at {p} each cost {c}. If the company does well the price can rise, and some pay a dividend.', '{p} के हिसाब से {q} शेयर के {c} लगते हैं। कंपनी अच्छा करे तो भाव बढ़ सकता है, और कुछ डिविडेंड देती हैं।'), { q: QTY, p: money(PRICE), c: money(COST) }), { prop: { kind: 'counter', from: 0, to: COST, format: 'inr', tone: 'cyan', label: t('what you pay (example)', 'आप जो देते हैं (उदाहरण)') }, ms: 6000 }),
    sc('worry', fill(t('The price can also fall. If it drops {f}%, your {c} becomes about {l}.', 'भाव गिर भी सकता है। {f}% गिरे तो आपके {c} लगभग {l} रह जाते हैं।'), { f: FALL, c: money(COST), l: money(LEFT) }), { prop: { kind: 'bars', items: [{ label: t('You paid', 'आपने दिया'), value: COST, text: money(COST), tone: 'gold' }, { label: t('After a fall', 'गिरावट के बाद'), value: LEFT, text: money(LEFT), tone: 'red' }] }, ms: 5200 }),
    sc('think', t('You can lose money in shares, and no one can promise a gain. Money you may need soon does not belong here.', 'शेयरों में पैसा घट सकता है, और कोई लाभ का वादा नहीं कर सकता। जो पैसा जल्द चाहिए वह यहाँ नहीं रखें।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('Learn how a company earns money before you buy its share.', 'शेयर ख़रीदने से पहले जानें कि कंपनी पैसा कैसे कमाती है।'), atLeast(t('x'.repeat(60), 'x'.repeat(60)), 3800)),
  ],
  quiz: { q: t('What can happen to a share’s price?', 'शेयर के भाव का क्या हो सकता है?'), options: [t('It can rise or fall', 'वह बढ़ या गिर सकता है'), t('It only rises', 'वह सिर्फ़ बढ़ता है'), t('It is fixed', 'वह तय रहता है')], answer: 0,
    why: t('A share’s price follows how buyers and sellers see the company, so it moves both ways.', 'शेयर का भाव इस पर चलता है कि ख़रीदार और विक्रेता कंपनी को कैसे देखते हैं, इसलिए वह दोनों तरफ़ चलता है।') },
};

// ── IPO ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const ISSUE = 400, LOT = 10, PAID = ISSUE * LOT, LIST_LOW = 380, LIST_HIGH = 440;
const ipo: Reel = {
  id: 'ipo-basics', topic: 'invest', tags: ['IPO', 'listing'],
  title: t('An IPO, in plain words', 'IPO, आसान भाषा में'),
  scenes: [
    sc('think', t('An IPO is when a company sells its shares to the public for the first time, to raise money.', 'IPO तब होता है जब कोई कंपनी पैसा जुटाने के लिए पहली बार जनता को अपने शेयर बेचती है।'), { big: t('First sale', 'पहली बिक्री'), ...atLeast(t('x'.repeat(95), 'x'.repeat(95)), 4800) }),
    sc('happy', t('You apply through your broker or bank. If shares are in demand, you may get fewer than you asked for, or none.', 'आप अपने ब्रोकर या बैंक से अर्ज़ी देते हैं। माँग ज़्यादा हो तो माँगे से कम, या कोई नहीं, मिल सकते हैं।'), { prop: { kind: 'steps', items: [t('Apply through your own broker', 'अपने ब्रोकर से अर्ज़ी दें'), t('Shares are allotted by a process', 'शेयर प्रक्रिया से बँटते हैं'), t('Then they list and trade', 'फिर लिस्ट होकर ट्रेड होते हैं')] }, ms: 5400 }),
    sc('surprised', fill(t('Say the issue price is {i} and you get {q} shares for {p}. On listing day the price can open at {lo} or at {hi}.', 'मान लें इश्यू भाव {i} है और आपको {p} में {q} शेयर मिले। लिस्टिंग के दिन भाव {lo} या {hi} पर खुल सकता है।'), { i: money(ISSUE), q: LOT, p: money(PAID), lo: money(LIST_LOW), hi: money(LIST_HIGH) }), { prop: { kind: 'bars', items: [{ label: t('You paid', 'आपने दिया'), value: PAID, text: money(PAID), tone: 'gold' }, { label: t('If it lists low', 'कम खुले तो'), value: LIST_LOW * LOT, text: money(LIST_LOW * LOT), tone: 'red' }, { label: t('If it lists high', 'ज़्यादा खुले तो'), value: LIST_HIGH * LOT, text: money(LIST_HIGH * LOT), tone: 'teal' }] }, ms: 6200 }),
    sc('worry', t('A listing gain is not guaranteed, and the price can move either way afterwards. Excitement is not a reason to apply.', 'लिस्टिंग पर लाभ पक्का नहीं, और बाद में भाव दोनों तरफ़ जा सकता है। उत्साह अर्ज़ी देने का कारण नहीं।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('Read the company’s offer document, and apply only for what you can afford to lose.', 'कंपनी का ऑफ़र दस्तावेज़ पढ़ें, और उतने की ही अर्ज़ी दें जितना खोना सह सकें।'), atLeast(t('x'.repeat(80), 'x'.repeat(80)), 4400)),
  ],
  quiz: { q: t('Is an IPO listing gain guaranteed?', 'क्या IPO पर लिस्टिंग का लाभ पक्का है?'), options: [t('No, it can list below the issue price', 'नहीं, वह इश्यू भाव से नीचे भी लिस्ट हो सकता है'), t('Yes, always', 'हाँ, हमेशा'), t('Yes, for small applicants', 'हाँ, छोटे आवेदकों के लिए')], answer: 0,
    why: t('The listing price is set by buyers and sellers on the day. Nothing fixes it above the issue price.', 'लिस्टिंग का भाव उस दिन ख़रीदार और विक्रेता तय करते हैं। उसे इश्यू भाव से ऊपर कुछ तय नहीं करता।') },
};

// ── ETF ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const E_AMT = 1_000_000, E_LOW = 0.1, E_HIGH = 1.5;
const etf: Reel = {
  id: 'etf-basics', topic: 'invest', tags: ['ETF', 'costs'],
  title: t('An ETF in plain words', 'ETF आसान भाषा में'),
  scenes: [
    sc('think', t('An ETF is a fund that you buy and sell on the stock exchange, like a share. Most copy an index.', 'ETF ऐसा फ़ंड है जिसे आप स्टॉक एक्सचेंज पर शेयर की तरह ख़रीदते-बेचते हैं। ज़्यादातर किसी इंडेक्स की नक़ल करते हैं।'), { big: t('A fund that trades', 'ट्रेड होने वाला फ़ंड'), ...atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000) }),
    sc('happy', t('You need a demat account to hold one. The price changes through the day as people trade it.', 'इसे रखने के लिए डीमैट खाता चाहिए। लोगों के ट्रेड से भाव दिन भर बदलता है।')),
    sc('surprised', fill(t('Their yearly cost is often low. On {a}, a {l}% cost is about {x} a year, against about {y} at {h}%.', 'इनका सालाना ख़र्च अक्सर कम होता है। {a} पर {l}% ख़र्च सालाना लगभग {x}, जबकि {h}% पर लगभग {y}।'), { a: money(E_AMT), l: E_LOW, x: money(pctOf(E_AMT, E_LOW)), h: E_HIGH, y: money(pctOf(E_AMT, E_HIGH)) }), { prop: { kind: 'bars', items: [{ label: t('Low cost', 'कम ख़र्च'), value: pctOf(E_AMT, E_LOW), text: money(pctOf(E_AMT, E_LOW)), tone: 'teal' }, { label: t('High cost', 'ज़्यादा ख़र्च'), value: pctOf(E_AMT, E_HIGH), text: money(pctOf(E_AMT, E_HIGH)), tone: 'gold' }] }, ms: 6200 }),
    sc('worry', t('It still rises and falls with what it holds. Low cost is not low risk, and each trade has brokerage.', 'वह जो रखता है उसके साथ ऊपर-नीचे होता है। कम ख़र्च का मतलब कम जोखिम नहीं, और हर ट्रेड पर ब्रोकरेज लगती है।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('Check what it tracks, its cost and how easily it trades before you buy.', 'ख़रीदने से पहले देखें वह क्या ट्रैक करता है, उसका ख़र्च और ट्रेड कितनी आसानी से होता है।'), atLeast(t('x'.repeat(80), 'x'.repeat(80)), 4400)),
  ],
  quiz: { q: t('How is an ETF different from a regular mutual fund?', 'ETF सामान्य म्यूचुअल फ़ंड से कैसे अलग है?'), options: [t('It trades on the exchange like a share', 'वह शेयर की तरह एक्सचेंज पर ट्रेड होता है'), t('It cannot fall', 'वह गिर नहीं सकता'), t('It pays a fixed return', 'वह तय रिटर्न देता है')], answer: 0,
    why: t('You buy and sell an ETF through a broker during market hours, at the price of the moment.', 'ETF आप ब्रोकर के ज़रिए बाज़ार के घंटों में, उस पल के भाव पर ख़रीदते-बेचते हैं।') },
};

// ── Demat and KYC ────────────────────────────────────────────────────────────────────────────────────────────────
const demat: Reel = {
  id: 'demat-kyc-basics', topic: 'invest', tags: ['demat', 'KYC'],
  title: t('Demat and KYC, simply', 'डीमैट और KYC, आसान भाषा में'),
  scenes: [
    sc('think', t('A demat account holds your shares and units electronically, much as a bank account holds cash.', 'डीमैट खाता आपके शेयर और यूनिट इलेक्ट्रॉनिक रूप में रखता है, जैसे बैंक खाता नक़दी रखता है।'), { big: t('Digital locker', 'डिजिटल लॉकर'), ...atLeast(t('x'.repeat(95), 'x'.repeat(95)), 4800) }),
    sc('happy', t('To open one you complete KYC, which proves who you are.', 'खोलने के लिए आप KYC पूरा करते हैं, जो साबित करता है कि आप कौन हैं।'), { prop: { kind: 'steps', items: [t('Identity proof', 'पहचान प्रमाण'), t('Address proof', 'पते का प्रमाण'), t('A bank account, linked', 'जुड़ा बैंक खाता'), t('A nominee, added', 'जोड़ा गया नॉमिनी')] }, ms: 5600 }),
    sc('think', t('KYC is done once and usually works across many financial products.', 'KYC एक बार होता है और आम तौर पर कई वित्तीय उत्पादों में चलता है।'), atLeast(t('x'.repeat(70), 'x'.repeat(70)), 4000)),
    sc('worry', t('Check the yearly charges, and keep your login and OTP to yourself. A broker never needs your password.', 'सालाना शुल्क देखें, और अपना लॉगिन और OTP अपने पास रखें। ब्रोकर को आपका पासवर्ड कभी नहीं चाहिए।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('Open an account only with a registered broker, and add a nominee on day one.', 'खाता सिर्फ़ पंजीकृत ब्रोकर के साथ खोलें, और पहले दिन ही नॉमिनी जोड़ें।'), atLeast(t('x'.repeat(80), 'x'.repeat(80)), 4400)),
  ],
  quiz: { q: t('What does a demat account hold?', 'डीमैट खाता क्या रखता है?'), options: [t('Your shares and units, in electronic form', 'आपके शेयर और यूनिट, इलेक्ट्रॉनिक रूप में'), t('Your cash only', 'सिर्फ़ आपकी नक़दी'), t('Your loans', 'आपके लोन')], answer: 0,
    why: t('It is the electronic holder of securities, linked to your bank account for payments.', 'यह प्रतिभूतियों का इलेक्ट्रॉनिक धारक है, जो भुगतान के लिए आपके बैंक खाते से जुड़ा होता है।') },
};

// ── Credit report ────────────────────────────────────────────────────────────────────────────────────────────────
const report: Reel = {
  id: 'credit-report-read', topic: 'credit', tags: ['credit report', 'disputes'],
  title: t('How to read your credit report', 'अपनी क्रेडिट रिपोर्ट कैसे पढ़ें'),
  scenes: [
    sc('think', t('Your credit report is the record lenders see. You can get a full copy for free once a year.', 'आपकी क्रेडिट रिपोर्ट वह रिकॉर्ड है जो लेनदार देखते हैं। आप साल में एक बार पूरी कॉपी मुफ़्त पा सकते हैं।'), { big: t('The record', 'वह रिकॉर्ड'), ...atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000) }),
    sc('happy', t('Read it in four parts.', 'इसे चार हिस्सों में पढ़ें।'), { prop: { kind: 'steps', items: [t('Your details', 'आपकी जानकारी'), t('Each account and its status', 'हर खाता और उसकी स्थिति'), t('Payment history', 'भुगतान का इतिहास'), t('Enquiries', 'एन्क्वायरी')] }, ms: 5600 }),
    sc('worry', t('Look for accounts you do not recognise, payments marked late that were on time, and closed loans shown as open.', 'ऐसे खाते देखें जिन्हें आप नहीं पहचानते, समय पर किए भुगतान जो देर से दिखे, और बंद लोन जो खुले दिखें।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5200)),
    sc('think', t('Errors can happen. You can raise a dispute with the credit bureau, and ask the lender to correct it.', 'ग़लतियाँ हो सकती हैं। आप क्रेडिट ब्यूरो में विवाद दर्ज कर सकते हैं और लेनदार से सुधार करवा सकते हैं।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('Check it once a year, and before you apply for a big loan.', 'साल में एक बार देखें, और बड़ा लोन माँगने से पहले भी।'), atLeast(t('x'.repeat(60), 'x'.repeat(60)), 3800)),
  ],
  quiz: { q: t('What should you do if your report has a wrong entry?', 'रिपोर्ट में ग़लत प्रविष्टि हो तो क्या करें?'), options: [t('Raise a dispute and ask the lender to correct it', 'विवाद दर्ज करें और लेनदार से सुधार करवाएँ'), t('Ignore it', 'अनदेखा करें'), t('Close all your accounts', 'सारे खाते बंद करें')], answer: 0,
    why: t('A wrong entry can lower your score and stays until it is corrected.', 'ग़लत प्रविष्टि स्कोर घटा सकती है और सुधरने तक बनी रहती है।') },
};

// ── Insurance claim steps ────────────────────────────────────────────────────────────────────────────────────────
const claim: Reel = {
  id: 'insurance-claim-steps', topic: 'protect', lesson: 'insurance', tags: ['claim', 'health insurance'],
  title: t('Making a health claim, step by step', 'हेल्थ क्लेम, क़दम-दर-क़दम'),
  scenes: [
    sc('worry', t('A claim is when the policy has to prove itself, often at a stressful time. It helps to know the steps before.', 'क्लेम वह घड़ी है जब पॉलिसी को ख़ुद को साबित करना होता है, अक्सर तनाव के समय। पहले से क़दम जानना मदद करता है।'), { big: t('When you need it', 'जब ज़रूरत हो'), ...atLeast(t('x'.repeat(110), 'x'.repeat(110)), 5200) }),
    sc('think', t('Two routes: cashless, where the hospital bills the insurer, and reimbursement, where you pay first and claim back.', 'दो रास्ते: कैशलेस, जहाँ अस्पताल बीमा कंपनी को बिल देता है, और रिइम्बर्समेंट, जहाँ आप पहले चुकाकर क्लेम करते हैं।'), { prop: { kind: 'steps', items: [t('Cashless: at a network hospital', 'कैशलेस: नेटवर्क अस्पताल में'), t('Reimbursement: pay, then claim', 'रिइम्बर्समेंट: चुकाएँ, फिर क्लेम')] }, ms: 5800 }),
    sc('happy', t('For a planned stay, tell the insurer early. For an emergency, tell them as soon as you can.', 'योजनाबद्ध भर्ती हो तो बीमा कंपनी को पहले बताएँ। आपात हो तो जितनी जल्दी हो सके।'), atLeast(t('x'.repeat(95), 'x'.repeat(95)), 4800)),
    sc('think', t('Keep every paper: the discharge summary, bills, reports and prescriptions. Missing papers delay a claim.', 'हर काग़ज़ रखें: डिस्चार्ज सारांश, बिल, रिपोर्ट और पर्चियाँ। काग़ज़ छूटें तो क्लेम में देर होती है।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('Find your network hospitals and your policy number before you ever need them.', 'अपने नेटवर्क अस्पताल और पॉलिसी नंबर ज़रूरत पड़ने से पहले ही खोज लें।'), atLeast(t('x'.repeat(80), 'x'.repeat(80)), 4400)),
  ],
  quiz: { q: t('In a cashless claim, who pays the hospital?', 'कैशलेस क्लेम में अस्पताल को कौन चुकाता है?'), options: [t('The insurer, directly', 'सीधे बीमा कंपनी'), t('You, in full', 'आप, पूरा'), t('Your employer', 'आपका नियोक्ता')], answer: 0,
    why: t('At a network hospital the insurer settles the approved bill, so you pay only what the policy does not cover.', 'नेटवर्क अस्पताल में बीमा कंपनी स्वीकृत बिल चुकाती है, इसलिए आप सिर्फ़ वह देते हैं जो पॉलिसी में कवर नहीं।') },
};

// ── ITR forms ────────────────────────────────────────────────────────────────────────────────────────────────────
const forms: Reel = {
  id: 'itr-which-form', topic: 'tax', tags: ['ITR', 'forms'],
  title: t('Which ITR form is yours?', 'आपका ITR फ़ॉर्म कौन-सा है?'),
  scenes: [
    sc('think', t('The tax department has different return forms. Which one you use depends on the kind of income you have.', 'आयकर विभाग के रिटर्न फ़ॉर्म अलग-अलग हैं। आप कौन-सा लेते हैं, यह आपकी आय के प्रकार पर निर्भर है।'), { big: t('The right form', 'सही फ़ॉर्म'), ...atLeast(t('x'.repeat(105), 'x'.repeat(105)), 5000) }),
    sc('happy', t('A rough guide:', 'एक मोटा मार्गदर्शन:'), { prop: { kind: 'steps', items: [t('Salary: a simple form', 'वेतन: सरल फ़ॉर्म'), t('Capital gains: a fuller form', 'कैपिटल गेन: विस्तृत फ़ॉर्म'), t('Business: another form', 'कारोबार: दूसरा फ़ॉर्म')] }, ms: 5600 }),
    sc('worry', t('Using the wrong form can make a return defective, and you may have to file it again.', 'ग़लत फ़ॉर्म से रिटर्न दोषपूर्ण हो सकता है, और दोबारा भरना पड़ सकता है।'), atLeast(t('x'.repeat(85), 'x'.repeat(85)), 4600)),
    sc('think', t('The portal helps you pick, and it pre-fills what it knows. Check each figure against your records.', 'पोर्टल चुनने में मदद करता है, और जो जानता है वह पहले से भरता है। हर आँकड़ा अपने रिकॉर्ड से मिलाएँ।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('List your sources of income first. The form follows from that list.', 'पहले अपनी आय के स्रोतों की सूची बनाएँ। फ़ॉर्म उसी सूची से तय होता है।'), atLeast(t('x'.repeat(70), 'x'.repeat(70)), 4000)),
  ],
  quiz: { q: t('What decides which return form you use?', 'आप कौन-सा रिटर्न फ़ॉर्म लेंगे, यह क्या तय करता है?'), options: [t('The kinds of income you have', 'आपकी आय के प्रकार'), t('Your age only', 'सिर्फ़ आपकी उम्र'), t('Your bank', 'आपका बैंक')], answer: 0,
    why: t('Each form is built for certain kinds of income, so list yours first.', 'हर फ़ॉर्म कुछ प्रकार की आय के लिए बना है, इसलिए पहले अपनी सूची बनाएँ।') },
};

// ── FD ladder ────────────────────────────────────────────────────────────────────────────────────────────────────
const LADDER = 600_000, RUNG = LADDER / 3;
const ladder: Reel = {
  id: 'fd-ladder', topic: 'basics', tags: ['FD', 'liquidity'],
  title: t('Laddering fixed deposits', 'फ़िक्स्ड डिपॉज़िट की सीढ़ी'),
  scenes: [
    sc('think', t('One big fixed deposit locks all your money together. A ladder spreads the dates, so some money is free each year.', 'एक बड़ी FD सारा पैसा एक साथ बाँध देती है। सीढ़ी तारीख़ें बाँटती है, ताकि हर साल कुछ पैसा खुले।'), { big: t('A ladder', 'एक सीढ़ी'), ...atLeast(t('x'.repeat(110), 'x'.repeat(110)), 5200) }),
    sc('happy', fill(t('Split {t} into three equal deposits of {r}, maturing in one, two and three years.', '{t} को {r} की तीन बराबर FD में बाँटें, जो एक, दो और तीन साल में परिपक्व हों।'), { t: money(LADDER), r: money(RUNG) }), { prop: { kind: 'bars', items: [{ label: t('1 year', '1 साल'), value: RUNG, text: money(RUNG), tone: 'teal' }, { label: t('2 years', '2 साल'), value: RUNG, text: money(RUNG), tone: 'cyan' }, { label: t('3 years', '3 साल'), value: RUNG, text: money(RUNG), tone: 'gold' }] }, ms: 5600 }),
    sc('think', t('Each year one deposit matures. You can use it, or renew it for three years so the ladder keeps going.', 'हर साल एक FD परिपक्व होती है। आप उसे इस्तेमाल कर सकते हैं, या तीन साल को फिर लगा सकते हैं ताकि सीढ़ी चलती रहे।'), atLeast(t('x'.repeat(105), 'x'.repeat(105)), 5000)),
    sc('worry', t('Rates change, and the interest is taxed at your slab. A ladder helps with timing, not with inflation.', 'दरें बदलती हैं, और ब्याज पर आपके स्लैब से टैक्स लगता है। सीढ़ी समय में मदद करती है, महँगाई में नहीं।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
    sc('cheer', t('Match the rungs to when you will need the money.', 'सीढ़ी के पायदानों को उस समय से मिलाएँ जब पैसा चाहिए।'), atLeast(t('x'.repeat(50), 'x'.repeat(50)), 3600)),
  ],
  quiz: { q: t('What does a ladder of deposits give you?', 'जमा की सीढ़ी आपको क्या देती है?'), options: [t('Some money free every year', 'हर साल कुछ पैसा मुक्त'), t('A higher rate for sure', 'पक्का ऊँचा ब्याज'), t('No tax', 'कोई टैक्स नहीं')], answer: 0,
    why: t('Staggered maturity turns one locked sum into regular access.', 'क्रमवार परिपक्वता एक बँधी रकम को नियमित पहुँच में बदल देती है।') },
};

export const EXPLAIN_REELS: Reel[] = [stocks, ipo, etf, demat, report, claim, forms, ladder];
