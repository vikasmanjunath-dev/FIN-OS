// Wave 4 (draft): choose-your-path, guess-first and what-if sliders. Same builders and rules as wave 3 (content-w3-play.ts); every figure from figures.ts.
import { emi, fill, grownCost, interestInYear, lumpsumValue, money, ratioPct, sipFutureValue, superTopUpSplit } from '@/lib/reels/figures';
import { guess, path, slide } from '@/lib/reels/content-w3-play';
import { t } from '@/lib/reels/kit';
import type { Reel } from '@/lib/reels/types';

const yearsU = t('years', 'साल');
const total = (p: number, rate: number, y: number) => emi(p, rate, y) * y * 12;

// ── Paths ────────────────────────────────────────────────────────────────────────────────────────────────────────
const L1 = 4_000_000, L1R = 8.5;
const SPARE = 10_000, COVER_COST = 1_000, SIP10 = (m: number) => sipFutureValue(m, 12, 10);
const BONUS = 30_000, CARD_M = 3.5;
const COURSE = 600_000, E_RATE = 10, E_YEARS = 5, SAVED_PART = 200_000;
const P_LIMIT = 100_000, P_NEW = 200_000, P_SPEND = 40_000;
const SIDE = 20_000;
const HOSP = 800_000, BASE = 500_000, TOPUP = 2_000_000;

export const W4_PATH: Reel[] = [
  path({
    id: 'path-loan-tenure', who: 'rohan', topic: 'loans', title: t('Choose: how long Rohan borrows for', 'चुनें: रोहन कितने साल के लिए उधार ले'), tags: ['home loan', 'tenure'],
    lines: [t('Rohan needs a ₹40 lakh home loan, and the bank lets him pick the length.', 'रोहन को ₹40 लाख का होम लोन चाहिए, और बैंक उसे अवधि चुनने देता है।'),
      t('Three lengths, each with a different EMI and a different total cost.', 'तीन अवधियाँ, हर एक की अलग EMI और अलग कुल लागत।'),
      t('A longer loan eases each month and costs more in all.', 'लंबा लोन हर महीना हल्का करता है और कुल में महँगा पड़ता है।'), t('A shorter loan costs less in all, but asks more every month.', 'छोटा लोन कुल में सस्ता है, पर हर महीने ज़्यादा माँगता है।'), t('Pick the shortest your month can safely carry.', 'वह सबसे छोटी चुनें जो आपका महीना सुरक्षित रूप से उठा सके।')],
    q: t('How long does Rohan borrow for?', 'रोहन कितने साल के लिए उधार ले?'), setup: t('Pick one. Figures are at an assumed 8.5% a year.', 'एक चुनें। आँकड़े मान लें 8.5% सालाना पर हैं।'),
    options: [15, 20, 25].map(y => ({ label: t(`${y} years`, `${y} साल`), result: fill(t('The EMI is about {e} a month, and he pays about {t} in all.', 'EMI लगभग {e} महीना है, और वह कुल लगभग {t} चुकाता है।'), { e: money(Math.round(emi(L1, L1R, y))), t: money(Math.round(total(L1, L1R, y))) }) })),
    verdict: t('There is no single winner. It depends on his income, his other EMIs and how steady his job is. The numbers show the trade.', 'कोई एक विजेता नहीं। यह उसकी आय, दूसरी EMI और नौकरी की स्थिरता पर निर्भर है। आँकड़े समझौता दिखाते हैं।'),
    quiz: { q: t('What does a shorter loan do?', 'छोटा लोन क्या करता है?'), options: [t('Costs less in all, with a bigger EMI', 'कुल में सस्ता, बड़ी EMI के साथ'), t('Costs more in all', 'कुल में महँगा'), t('Removes interest', 'ब्याज हटाता है')], answer: 0,
      why: t('Fewer months of interest, but each month carries more of the loan.', 'ब्याज के महीने कम, पर हर महीना लोन का ज़्यादा हिस्सा उठाता है।') },
  }),
  path({
    id: 'path-cover-or-sip', who: 'neel', topic: 'protect', title: t('Choose: Neel’s first ₹10,000 a month', 'चुनें: नील के पहले महीने के ₹10,000'), tags: ['insurance', 'SIP'],
    lines: [t('Neel is 28 with a family that depends on him, and ₹10,000 a month spare.', 'नील 28 साल का है, परिवार उस पर निर्भर है, और महीने के ₹10,000 बचते हैं।'),
      t('He can put it all into investing, or protect first. Each path has a different shape.', 'वह सब निवेश में डाल सकता है, या पहले सुरक्षा ले सकता है। हर रास्ते का रूप अलग है।'),
      t('Cover does not grow, but it changes what a bad event would do to his family.', 'कवर बढ़ता नहीं, पर यह बदलता है कि बुरी घटना का परिवार पर क्या असर होगा।'), t('Investing grows with risk, and it is also what he would draw on in a crisis.', 'निवेश जोखिम के साथ बढ़ता है, और संकट में उसी से निकालना पड़ेगा।'), t('Check what his family would need, then decide the split.', 'देखें परिवार को क्या चाहिए होगा, फिर बँटवारा तय करें।')],
    q: t('What does Neel do with the ₹10,000?', 'नील उन ₹10,000 का क्या करता है?'), setup: t('Pick one. Premium shown is only an example.', 'एक चुनें। दिखाया प्रीमियम सिर्फ़ उदाहरण है।'),
    options: [
      { label: t('All into a SIP', 'सब SIP में'), result: fill(t('At an assumed 12% a year, {m} a month could become about {v} in ten years. If something happened to him, his family would have only that.', 'मान लें 12% सालाना, {m} महीना दस साल में लगभग {v} हो सकता है। उसे कुछ हो जाए तो परिवार के पास बस वही होगा।'), { m: money(SPARE), v: money(Math.round(SIP10(SPARE))) }) },
      { label: t('Term cover first, rest in a SIP', 'पहले टर्म कवर, बाक़ी SIP'), result: fill(t('With an example premium of {c} a month, {r} goes to the SIP and could become about {v}. His family is also protected from day one.', 'उदाहरण प्रीमियम {c} महीना हो, तो {r} SIP में जाता है और लगभग {v} हो सकता है। परिवार पहले दिन से सुरक्षित भी है।'), { c: money(COVER_COST), r: money(SPARE - COVER_COST), v: money(Math.round(SIP10(SPARE - COVER_COST))) }) },
      { label: t('Both covers, then a smaller SIP', 'दोनों कवर, फिर छोटी SIP'), result: t('The SIP is smaller, but a hospital bill or a loss of income no longer decides his plans. It asks for patience about the growth.', 'SIP छोटी है, पर अस्पताल का बिल या आय का जाना अब उसकी योजना तय नहीं करता। बढ़त को लेकर धैर्य चाहिए।') },
    ],
    verdict: t('There is no single winner. It depends on who relies on him, what he already has, and how he feels about risk.', 'कोई एक विजेता नहीं। यह इस पर निर्भर है कि कौन उस पर निर्भर है, उसके पास पहले क्या है, और जोखिम से उसकी सहजता।'),
    quiz: { q: t('What does cover do that a SIP does not?', 'कवर वह क्या करता है जो SIP नहीं करती?'), options: [t('Pays out when a bad event happens', 'बुरी घटना होने पर भुगतान करता है'), t('Grows faster', 'ज़्यादा तेज़ बढ़ता है'), t('Guarantees a return', 'रिटर्न की गारंटी देता है')], answer: 0,
      why: t('It moves a large risk off the family, which savings alone may not cover.', 'वह परिवार से बड़ा जोखिम हटाता है, जिसे अकेली बचत शायद न ढक पाए।') },
  }),
  path({
    id: 'path-festival-bonus', who: 'isha', topic: 'goals', title: t('Choose: Isha’s festival bonus', 'चुनें: ईशा का त्योहार बोनस'), tags: ['bonus', 'card debt'],
    lines: [t('Isha gets a ₹30,000 festival bonus, and has a card bill that is still running.', 'ईशा को ₹30,000 का त्योहार बोनस मिला है, और एक कार्ड बिल अभी चल रहा है।'),
      t('Three uses: clear the bill, put it aside for next year’s festival, or enjoy it.', 'तीन उपयोग: बिल चुकाना, अगले साल के त्योहार के लिए रखना, या उसका आनंद लेना।'),
      t('Card interest is usually the highest rate in a household’s money life.', 'कार्ड का ब्याज आम तौर पर घर की पैसों की ज़िंदगी में सबसे ऊँची दर है।'), t('A festival is also a real cost, and planning for it keeps it from becoming debt.', 'त्योहार भी असली ख़र्च है, और उसकी योजना उसे क़र्ज़ बनने से रोकती है।'), t('Decide the use before the money arrives.', 'पैसा आने से पहले उपयोग तय करें।')],
    q: t('What does Isha do with the bonus?', 'ईशा बोनस का क्या करती है?'), setup: t('Pick one. Card interest is an assumed 3.5% a month.', 'एक चुनें। कार्ड का ब्याज मान लें 3.5% महीना।'),
    options: [
      { label: t('Clear the card bill', 'कार्ड बिल चुकाए'), result: fill(t('It stops about {i} of interest every month on {b}. A sure saving, and the bill is gone.', '{b} पर हर महीने लगभग {i} का ब्याज रुकता है। पक्की बचत, और बिल ख़त्म।'), { i: money(Math.round(BONUS * CARD_M / 100)), b: money(BONUS) }) },
      { label: t('Set it aside for next festival', 'अगले त्योहार के लिए रखे'), result: t('Next year’s costs are covered in advance, and the card bill keeps running with its interest.', 'अगले साल के ख़र्च पहले से ढके हैं, और कार्ड बिल ब्याज के साथ चलता रहता है।') },
      { label: t('Spend it on gifts and the family', 'तोहफ़ों और परिवार पर ख़र्च करे'), result: t('It is enjoyed now. Nothing is left to cut the card bill, or to prepare for next year.', 'आज उसका आनंद मिलता है। कार्ड बिल घटाने या अगले साल की तैयारी के लिए कुछ नहीं बचता।') },
    ],
    verdict: t('There is no single winner. How high her card rate is, and what the festival means to her family, decide.', 'कोई एक विजेता नहीं। उसके कार्ड की दर कितनी ऊँची है, और त्योहार उसके परिवार के लिए क्या है, यही तय करता है।'),
    quiz: { q: t('Why does clearing a card bill give a sure saving?', 'कार्ड बिल चुकाने से पक्की बचत क्यों होती है?'), options: [t('You stop paying its interest', 'आप उसका ब्याज देना बंद कर देते हैं'), t('Banks give a reward', 'बैंक इनाम देते हैं'), t('It earns market returns', 'वह बाज़ार जैसा रिटर्न कमाता है')], answer: 0,
      why: t('The interest you avoid is as good as interest earned, with no risk.', 'जो ब्याज आप बचाते हैं वह कमाए ब्याज जितना है, बिना जोखिम के।') },
  }),
  path({
    id: 'path-education-loan', who: 'sana', topic: 'loans', title: t('Choose: how Sana pays for a course', 'चुनें: सना कोर्स की फ़ीस कैसे दे'), tags: ['education loan'],
    lines: [t('Sana has a ₹6 lakh course ahead, and ₹6 lakh in savings.', 'सना के सामने ₹6 लाख का कोर्स है, और ₹6 लाख की बचत।'),
      t('She can use savings, borrow, or split. Each leaves her in a different place.', 'वह बचत ले सकती है, उधार ले सकती है, या बाँट सकती है। हर एक उसे अलग जगह छोड़ता है।'),
      t('Using savings costs no interest and leaves her no cushion. Borrowing keeps the cushion and costs interest.', 'बचत लेने पर ब्याज नहीं, पर गद्दी नहीं बचती। उधार में गद्दी रहती है और ब्याज लगता है।'), t('How soon the course raises her pay changes the answer.', 'कोर्स से उसका वेतन कितनी जल्दी बढ़ेगा, यह जवाब बदलता है।'), t('Compare the total, and what you keep as a cushion.', 'कुल की तुलना करें, और यह भी कि गद्दी में क्या रहता है।')],
    q: t('How does Sana pay?', 'सना कैसे चुकाती है?'), setup: t('Pick one. A loan here is 5 years at an assumed 10%.', 'एक चुनें। यहाँ लोन 5 साल का है, मान लें 10%।'),
    options: [
      { label: t('Use all her savings', 'पूरी बचत लगाए'), result: t('No interest and no EMI. Her savings fall to nothing, so any surprise needs a new loan.', 'न ब्याज, न EMI। बचत शून्य हो जाती है, इसलिए कोई अनहोनी नया लोन माँगेगी।') },
      { label: t('Borrow the whole fee', 'पूरी फ़ीस उधार ले'), result: fill(t('She keeps {s} as a cushion and pays about {i} in interest over five years.', 'वह {s} की गद्दी रखती है और पाँच साल में लगभग {i} ब्याज देती है।'), { s: money(COURSE), i: money(Math.round(total(COURSE, E_RATE, E_YEARS) - COURSE)) }) },
      { label: t('₹2 lakh from savings, borrow the rest', '₹2 लाख बचत से, बाक़ी उधार'), result: fill(t('Interest falls to about {i}, and she still keeps {k} in savings.', 'ब्याज घटकर लगभग {i} रह जाता है, और बचत में {k} फिर भी रहता है।'), { i: money(Math.round(total(COURSE - SAVED_PART, E_RATE, E_YEARS) - (COURSE - SAVED_PART))), k: money(COURSE - SAVED_PART) }) },
    ],
    verdict: t('There is no single winner. How safe her job feels and how fast the course pays back decide the split.', 'कोई एक विजेता नहीं। नौकरी कितनी सुरक्षित लगती है और कोर्स कितनी जल्दी वसूल होता है, यही बँटवारा तय करता है।'),
    quiz: { q: t('What does keeping savings as a cushion cost?', 'बचत को गद्दी के रूप में रखने की क्या लागत है?'), options: [t('The interest on the loan you take instead', 'बदले में लिए लोन का ब्याज'), t('Nothing', 'कुछ नहीं'), t('The course fee', 'कोर्स की फ़ीस')], answer: 0,
      why: t('You pay interest for the comfort of a safety net, and that is a real price.', 'सुरक्षा-जाल की सहूलियत के लिए आप ब्याज देते हैं, और यह असली क़ीमत है।') },
  }),
  path({
    id: 'path-parents-help', who: 'kavya', topic: 'goals', title: t('Choose: Kavya and her parents’ monthly help', 'चुनें: कव्या और माता-पिता की मासिक मदद'), tags: ['family', 'support'],
    lines: [t('Kavya sends her parents ₹10,000 every month, and wonders about her own savings.', 'कव्या हर महीने माता-पिता को ₹10,000 भेजती है, और अपनी बचत को लेकर सोचती है।'),
      t('Helping family is a valid use of money. The question is how to fit it with her own plans.', 'परिवार की मदद पैसे का जायज़ उपयोग है। सवाल यह है कि उसे अपनी योजनाओं में कैसे बिठाएँ।'),
      t('Every choice here is a good one for someone. None is selfish and none is wrong.', 'यहाँ हर चुनाव किसी के लिए अच्छा है। कोई स्वार्थी या ग़लत नहीं।'), t('What helps is making the choice with the numbers in front of you.', 'मदद यह करता है कि चुनाव आँकड़े सामने रखकर हो।'), t('Talk it through with your family, then decide.', 'परिवार से बात करें, फिर तय करें।')],
    q: t('What does Kavya do?', 'कव्या क्या करती है?'), setup: t('Pick one. Figures are over ten years at an assumed 12% growth.', 'एक चुनें। आँकड़े दस साल के हैं, मान लें 12% बढ़त।'),
    options: [
      { label: t('Keep sending ₹10,000', '₹10,000 भेजती रहे'), result: t('Her parents are supported in full. Her own investing waits for now, and she can start when her income grows.', 'माता-पिता को पूरा सहारा मिलता है। उसका अपना निवेश अभी रुकता है, और आय बढ़ने पर शुरू कर सकती है।') },
      { label: t('Send ₹5,000 and invest ₹5,000', '₹5,000 भेजे और ₹5,000 निवेश करे'), result: fill(t('Her parents still get help, and her {m} a month could become about {v} in ten years, for her own future.', 'माता-पिता को मदद मिलती रहती है, और उसके {m} महीने दस साल में लगभग {v} हो सकते हैं, उसके अपने भविष्य के लिए।'), { m: money(5_000), v: money(Math.round(SIP10(5_000))) }) },
      { label: t('Ask her siblings to share it', 'भाई-बहनों से बाँटने को कहे'), result: t('The load is shared and she keeps more for herself. It needs a conversation, and may need patience.', 'बोझ बँटता है और उसके पास अपने लिए ज़्यादा रहता है। इसके लिए बातचीत चाहिए, और धैर्य भी।') },
    ],
    verdict: t('There is no single winner, and no wrong answer. Her parents’ needs, her own plans and her family’s way of doing things decide.', 'कोई एक विजेता नहीं, और कोई ग़लत जवाब नहीं। माता-पिता की ज़रूरतें, उसकी अपनी योजनाएँ और परिवार का तरीक़ा तय करते हैं।'),
    quiz: { q: t('What helps most in a choice like this?', 'ऐसे चुनाव में सबसे ज़्यादा क्या मदद करता है?'), options: [t('Looking at the numbers and talking it through', 'आँकड़े देखना और बात करना'), t('Guilt', 'अपराध-बोध'), t('Doing what a friend did', 'दोस्त की नक़ल')], answer: 0,
      why: t('A choice made openly, with the figures, is easier to keep up.', 'खुलकर, आँकड़ों के साथ लिया चुनाव निभाना आसान होता है।') },
  }),
  path({
    id: 'path-limit-increase', who: 'imran', topic: 'credit', title: t('Choose: Imran’s card limit offer', 'चुनें: इमरान को कार्ड सीमा का ऑफ़र'), tags: ['credit card', 'limit'],
    lines: [t('Imran’s bank offers to double his card limit from ₹1 lakh to ₹2 lakh.', 'इमरान का बैंक कार्ड की सीमा ₹1 लाख से दोगुनी करके ₹2 लाख करने का ऑफ़र देता है।'),
      t('He spends about ₹40,000 a month on the card. What he does next changes his usage.', 'वह कार्ड पर महीने में लगभग ₹40,000 ख़र्च करता है। आगे वह क्या करे, इससे उसका इस्तेमाल बदलता है।'),
      t('Usage is the share of the limit you use, and lenders watch it.', 'इस्तेमाल सीमा का वह हिस्सा है जो आप वापरते हैं, और लेनदार उसे देखते हैं।'), t('A higher limit lowers usage only if spending stays the same.', 'ऊँची सीमा इस्तेमाल तभी घटाती है जब ख़र्च वही रहे।'), t('Take a limit as room, not as a target.', 'सीमा को गुंजाइश मानें, लक्ष्य नहीं।')],
    q: t('What does Imran do?', 'इमरान क्या करता है?'), setup: t('Pick one. See what happens to his usage.', 'एक चुनें। देखें उसके इस्तेमाल का क्या होता है।'),
    options: [
      { label: t('Accept, and keep spending the same', 'मंज़ूर करे और वही ख़र्च रखे'), result: fill(t('His usage falls from about {a}% to about {b}% of the limit, which looks healthier to lenders.', 'उसका इस्तेमाल सीमा के लगभग {a}% से घटकर लगभग {b}% रह जाता है, जो लेनदारों को बेहतर दिखता है।'), { a: Math.round(ratioPct(P_SPEND, P_LIMIT)), b: Math.round(ratioPct(P_SPEND, P_NEW)) }) },
      { label: t('Accept, and spend more', 'मंज़ूर करे और ज़्यादा ख़र्च करे'), result: fill(t('If his spending doubles to {s}, his usage stays near {a}%, and his bill doubles, so the risk of carrying a balance rises.', 'ख़र्च दोगुना होकर {s} हो जाए तो इस्तेमाल लगभग {a}% रहता है, और बिल दोगुना, इसलिए बकाया रखने का जोखिम बढ़ता है।'), { s: money(P_SPEND * 2), a: Math.round(ratioPct(P_SPEND * 2, P_NEW)) }) },
      { label: t('Decline the offer', 'ऑफ़र ठुकरा दे'), result: fill(t('His usage stays near {a}% of the limit. Nothing changes, and his habits stay in his hands.', 'उसका इस्तेमाल सीमा के लगभग {a}% पर रहता है। कुछ नहीं बदलता, और आदतें उसके हाथ में रहती हैं।'), { a: Math.round(ratioPct(P_SPEND, P_LIMIT)) }) },
    ],
    verdict: t('There is no single winner. It depends on whether he will treat the extra room as room, or as money to spend.', 'कोई एक विजेता नहीं। यह इस पर निर्भर है कि वह अतिरिक्त गुंजाइश को गुंजाइश मानेगा, या ख़र्च करने का पैसा।'),
    quiz: { q: t('When does a higher limit lower your usage?', 'ऊँची सीमा आपका इस्तेमाल कब घटाती है?'), options: [t('When you keep spending the same', 'जब आप ख़र्च वही रखें'), t('When you spend more', 'जब आप ज़्यादा ख़र्च करें'), t('Always', 'हमेशा')], answer: 0,
      why: t('Usage is spending divided by the limit, so it only falls if spending does not rise.', 'इस्तेमाल यानी ख़र्च को सीमा से भाग, इसलिए वह तभी घटता है जब ख़र्च न बढ़े।') },
  }),
  path({
    id: 'path-side-income', who: 'devika', topic: 'goals', title: t('Choose: Devika’s side income', 'चुनें: देविका की अतिरिक्त आमदनी'), tags: ['side income', 'saving'],
    lines: [t('Devika earns ₹20,000 a month from a side project, on top of her salary.', 'देविका अपने वेतन के ऊपर एक साइड प्रोजेक्ट से महीने के ₹20,000 कमाती है।'),
      t('Spend it, save it, or use the first part to learn a skill that could earn more.', 'ख़र्च करे, बचाए, या पहले हिस्से से ऐसा हुनर सीखे जो ज़्यादा कमा सके।'),
      t('Extra income is easy to spend because it never felt like part of the budget.', 'अतिरिक्त आय ख़र्च करना आसान है क्योंकि वह कभी बजट का हिस्सा नहीं लगी।'), t('A skill costs money now and pays later, if it works.', 'हुनर अभी पैसा लेता है और बाद में देता है, अगर चल जाए।'), t('Decide how the first rupee of side income will be used.', 'तय करें कि साइड इनकम का पहला रुपया कैसे इस्तेमाल होगा।')],
    q: t('What does Devika do with the ₹20,000?', 'देविका उन ₹20,000 का क्या करती है?'), setup: t('Pick one. Figures are over ten years at an assumed 10% growth.', 'एक चुनें। आँकड़े दस साल के हैं, मान लें 10% बढ़त।'),
    options: [
      { label: t('Spend it as it comes', 'जैसे आए ख़र्च करे'), result: t('Her life is lighter now. The side income leaves nothing behind once it stops.', 'आज उसका जीवन हल्का है। साइड इनकम रुकने पर कुछ पीछे नहीं बचता।') },
      { label: t('Save all of it', 'पूरा बचाए'), result: fill(t('{m} a month could become about {v} in ten years. It asks for restraint, and the side income may not last.', '{m} महीना दस साल में लगभग {v} हो सकता है। इसके लिए संयम चाहिए, और साइड इनकम टिकी न रहे ऐसा भी हो सकता है।'), { m: money(SIDE), v: money(Math.round(sipFutureValue(SIDE, 10, 10))) }) },
      { label: t('Learn a skill first, then save', 'पहले हुनर सीखे, फिर बचाए'), result: t('The first months go to the course. If it raises her earnings, the later saving can be bigger. It is a bet on herself, and it may not pay.', 'शुरू के महीने कोर्स में जाते हैं। उससे कमाई बढ़ी तो बाद की बचत बड़ी हो सकती है। यह अपने ऊपर दाँव है, और चुके भी।') },
    ],
    verdict: t('There is no single winner. It depends on how long the side income lasts and how safe her main job is.', 'कोई एक विजेता नहीं। यह इस पर निर्भर है कि साइड इनकम कितनी टिकेगी और उसकी मुख्य नौकरी कितनी सुरक्षित है।'),
    quiz: { q: t('Why decide how to use side income early?', 'साइड इनकम के उपयोग का फ़ैसला जल्दी क्यों करें?'), options: [t('Unplanned extra money is easy to spend', 'बिना योजना का अतिरिक्त पैसा आसानी से ख़र्च हो जाता है'), t('Banks insist', 'बैंक कहते हैं'), t('It is taxed otherwise', 'वरना उस पर टैक्स लगता है')], answer: 0,
      why: t('A decision made before the money arrives is easier to keep.', 'पैसा आने से पहले किया फ़ैसला निभाना आसान होता है।') },
  }),
  path({
    id: 'path-health-top-up', who: 'aarav', topic: 'protect', lesson: 'insurance', title: t('Choose: Aarav’s hospital bill', 'चुनें: आरव का अस्पताल बिल'), tags: ['health insurance', 'top-up'],
    lines: [t('Aarav’s father is admitted, and the bill comes to ₹8 lakh.', 'आरव के पिता भर्ती हुए, और बिल ₹8 लाख का आया।'),
      t('Three covers he could have had, and what each would leave him to pay.', 'तीन कवर जो उसके पास हो सकते थे, और हर एक में उसे क्या देना पड़ता।'),
      t('A small base cover leaves a large gap. A top-up fills it for much less than a big base cover.', 'छोटा बेस कवर बड़ा अंतर छोड़ता है। टॉप-अप उसे बड़े बेस कवर से कहीं कम में भरता है।'), t('Premiums vary, so compare the real quotes.', 'प्रीमियम अलग होते हैं, इसलिए असली कोटेशन की तुलना करें।'), t('Check your cover against a bill like this one.', 'अपने कवर को ऐसे बिल से मिलाकर देखें।')],
    q: t('What cover did Aarav have?', 'आरव के पास कौन-सा कवर था?'), setup: t('Pick one. The bill is ₹8 lakh in each case.', 'एक चुनें। हर मामले में बिल ₹8 लाख का है।'),
    options: [
      { label: t('₹5 lakh base cover only', 'सिर्फ़ ₹5 लाख का बेस कवर'), result: fill(t('The policy pays {b} and he pays {y} from his own pocket.', 'पॉलिसी {b} देती है और वह {y} अपनी जेब से देता है।'), { b: money(superTopUpSplit(HOSP, BASE, BASE, 0).base), y: money(superTopUpSplit(HOSP, BASE, BASE, 0).you) }) },
      { label: t('₹5 lakh base plus a super top-up', '₹5 लाख बेस और एक सुपर टॉप-अप'), result: fill(t('Base pays {b}, the top-up pays {u}, and he pays {y}. The top-up cost much less than a larger base would.', 'बेस {b} देता है, टॉप-अप {u}, और वह {y} देता है। टॉप-अप की लागत बड़े बेस से बहुत कम थी।'), { b: money(superTopUpSplit(HOSP, BASE, BASE, TOPUP).base), u: money(superTopUpSplit(HOSP, BASE, BASE, TOPUP).topUp), y: money(superTopUpSplit(HOSP, BASE, BASE, TOPUP).you) }) },
      { label: t('A ₹10 lakh base cover', '₹10 लाख का बेस कवर'), result: t('The bill is paid in full by the policy. The yearly premium is higher than for a small base, every year.', 'पूरा बिल पॉलिसी चुकाती है। सालाना प्रीमियम छोटे बेस से ज़्यादा है, हर साल।') },
    ],
    verdict: t('There is no single winner. Premiums, his family’s age and what he can afford each year decide.', 'कोई एक विजेता नहीं। प्रीमियम, परिवार की उम्र और हर साल वह कितना दे सकता है, यही तय करता है।'),
    quiz: { q: t('What does a super top-up add to a base cover?', 'सुपर टॉप-अप बेस कवर में क्या जोड़ता है?'), options: [t('Cover for bills above a limit', 'एक सीमा से ऊपर के बिलों का कवर'), t('Nothing', 'कुछ नहीं'), t('Cover for the first rupee', 'पहले रुपये का कवर')], answer: 0,
      why: t('It starts where the base ends, which is why it costs less.', 'वह वहाँ शुरू होता है जहाँ बेस ख़त्म होता है, इसीलिए सस्ता है।') },
  }),
];

// ── Guess first ──────────────────────────────────────────────────────────────────────────────────────────────────
const EDU = 2_000_000, EDU_Y = 15, EDU_R = 8, eduEnd = grownCost(EDU, EDU_R, EDU_Y);
const LUMP = 100_000, LUMP_Y = 10, LUMP_R = 12, lumpEnd = lumpsumValue(LUMP, LUMP_R, LUMP_Y);
const H = 3_000_000, H_R = 9, H_Y = 20, firstYear = interestInYear(H, H_R, H_Y, 1), loanEmi = emi(H, H_R, H_Y);
const GAP_P = 4_000_000, GAP_A = 8.5, GAP_B = 10.5, GAP_Y = 20, gap = emi(GAP_P, GAP_B, GAP_Y) - emi(GAP_P, GAP_A, GAP_Y);

export const W4_GUESS: Reel[] = [
  guess({
    id: 'guess-edu-cost-15y', topic: 'goals', title: t('Guess first: tomorrow’s course fee', 'पहले अंदाज़ा लगाइए: कल की कोर्स फ़ीस'), tags: ['education', 'inflation'],
    hook: t('A degree costs ₹20 lakh today. Your child will go in 15 years. What will it cost then?', 'एक डिग्री आज ₹20 लाख की है। आपका बच्चा 15 साल में जाएगा। तब वह कितनी होगी?'),
    setupCaption: fill(t('Say education costs rise {r}% a year, for {y} years.', 'मान लें पढ़ाई का ख़र्च साल में {r}% बढ़ता है, {y} साल तक।'), { r: EDU_R, y: EDU_Y }),
    setupSteps: [t('₹20 lakh today', 'आज ₹20 लाख'), t('8% a year, assumed', '8% सालाना, अनुमानित'), t('15 years', '15 साल')],
    q: t('What would the same degree cost then?', 'तब वही डिग्री कितने की होगी?'), answer: eduEnd,
    reveal: fill(t('About {e}, more than three times today’s fee. Set the goal in future rupees.', 'लगभग {e}, आज की फ़ीस के तीन गुने से ज़्यादा। लक्ष्य भविष्य के रुपयों में रखें।'), { e: money(Math.round(eduEnd)) }),
    resultCaption: fill(t('{n} today becomes about {e} in {y} years.', 'आज का {n} {y} साल में लगभग {e} हो जाता है।'), { n: money(EDU), e: money(Math.round(eduEnd)), y: EDU_Y }),
    resultBars: [t('Today', 'आज'), EDU, t('In 15 years', '15 साल बाद'), eduEnd],
    caveat: t('Eight percent is an assumption. Fees differ by course and place, so check yours.', 'आठ प्रतिशत अनुमान है। फ़ीस कोर्स और जगह के हिसाब से अलग है, अपनी जाँचें।'),
    close: t('Plan for the future price, not today’s.', 'आज की नहीं, भविष्य की क़ीमत की योजना बनाएँ।'),
    quiz: { q: t('Why plan for the future price?', 'भविष्य की क़ीमत की योजना क्यों?'), options: [t('Fees will have risen by then', 'तब तक फ़ीस बढ़ चुकी होगी'), t('Fees fall with time', 'फ़ीस समय के साथ घटती है'), t('Banks require it', 'बैंक चाहते हैं')], answer: 0,
      why: t('You will pay tomorrow’s fee, so tomorrow’s fee is the goal.', 'आप कल की फ़ीस देंगे, इसलिए कल की फ़ीस ही लक्ष्य है।') },
  }),
  guess({
    id: 'guess-lump-10y', topic: 'invest', title: t('Guess first: ₹1 lakh for ten years', 'पहले अंदाज़ा लगाइए: ₹1 लाख, दस साल'), tags: ['compounding'],
    hook: t('You put ₹1 lakh away and leave it alone for ten years. What might it be?', 'आप ₹1 लाख अलग रखकर दस साल छोड़ देते हैं। वह क्या हो सकता है?'),
    setupCaption: fill(t('Say it grows {r}% a year, with no withdrawals.', 'मान लें वह साल में {r}% बढ़ता है, कोई निकासी नहीं।'), { r: LUMP_R }),
    setupSteps: [t('₹1 lakh, once', '₹1 लाख, एक बार'), t('12% a year, assumed', '12% सालाना, अनुमानित'), t('10 years', '10 साल')],
    q: t('What might it be after ten years?', 'दस साल बाद वह क्या हो सकता है?'), answer: lumpEnd,
    reveal: fill(t('About {e}, more than three times what went in. Growth builds on growth.', 'लगभग {e}, डाली रकम का तीन गुने से ज़्यादा। बढ़त पर बढ़त मिलती है।'), { e: money(Math.round(lumpEnd)) }),
    resultCaption: fill(t('{a} left alone for {y} years could be about {e}.', '{y} साल छोड़े गए {a} लगभग {e} हो सकते हैं।'), { a: money(LUMP), y: LUMP_Y, e: money(Math.round(lumpEnd)) }),
    resultBars: [t('You put in', 'आपने डाला'), LUMP, t('It could be', 'हो सकता है'), lumpEnd],
    caveat: t('The rate is an assumption, not a promise. Real returns go up and down.', 'दर अनुमान है, वादा नहीं। असली रिटर्न ऊपर-नीचे होते हैं।'),
    close: t('Time is the part you control.', 'समय वह हिस्सा है जो आपके हाथ में है।'),
    quiz: { q: t('What turns ₹1 lakh into much more over ten years?', '₹1 लाख को दस साल में बहुत ज़्यादा क्या बनाता है?'), options: [t('Growth on past growth', 'पिछली बढ़त पर बढ़त'), t('The monthly deposit', 'मासिक जमा'), t('A bank bonus', 'बैंक का बोनस')], answer: 0,
      why: t('Each year’s growth joins the balance and grows too.', 'हर साल की बढ़त बैलेंस में जुड़ती है और वह भी बढ़ती है।') },
  }),
  guess({
    id: 'guess-first-year-interest', topic: 'loans', title: t('Guess first: interest in a loan’s first year', 'पहले अंदाज़ा लगाइए: लोन के पहले साल का ब्याज'), tags: ['home loan', 'interest'],
    hook: t('You take a ₹30 lakh home loan. In the first year you pay twelve EMIs. How much of that is interest?', 'आप ₹30 लाख का होम लोन लेते हैं। पहले साल बारह EMI चुकाते हैं। उसमें ब्याज कितना है?'),
    setupCaption: fill(t('Say {l} at {r}% a year for {y} years, an EMI of about {e}.', 'मान लें {l}, {r}% सालाना, {y} साल, EMI लगभग {e}।'), { l: money(H), r: H_R, y: H_Y, e: money(Math.round(loanEmi)) }),
    setupSteps: [t('₹30 lakh borrowed', '₹30 लाख उधार'), t('9% a year, assumed', '9% सालाना, अनुमानित'), t('20 years', '20 साल')],
    q: t('How much interest is in the first year’s EMIs?', 'पहले साल की EMI में कितना ब्याज है?'), answer: firstYear,
    reveal: fill(t('About {i} of the {t} you pay that year. Early EMIs are mostly interest.', 'उस साल चुकाए {t} में लगभग {i}। शुरू की EMI में ज़्यादातर ब्याज होता है।'), { i: money(Math.round(firstYear)), t: money(Math.round(loanEmi * 12)) }),
    resultCaption: fill(t('Of about {t} paid in year one, about {i} is interest.', 'पहले साल चुकाए लगभग {t} में से लगभग {i} ब्याज है।'), { t: money(Math.round(loanEmi * 12)), i: money(Math.round(firstYear)) }),
    resultBars: [t('Paid in year one', 'पहले साल चुकाया'), loanEmi * 12, t('Of it, interest', 'उसमें ब्याज'), firstYear],
    caveat: t('Your rate and EMI may differ, so this is an illustration.', 'आपकी दर और EMI अलग हो सकती हैं, इसलिए यह उदाहरण है।'),
    close: t('Early prepayments cut the part that is interest.', 'शुरू के प्रीपेमेंट ब्याज वाला हिस्सा घटाते हैं।'),
    quiz: { q: t('Why is the first year’s EMI mostly interest?', 'पहले साल की EMI में ज़्यादातर ब्याज क्यों है?'), options: [t('Interest is charged on the full balance', 'ब्याज पूरे बकाया पर लगता है'), t('Banks take it first', 'बैंक पहले वही लेते हैं'), t('It is not', 'ऐसा नहीं है')], answer: 0,
      why: t('The balance is largest at the start, so the interest on it is too.', 'शुरू में बकाया सबसे बड़ा होता है, इसलिए उस पर ब्याज भी।') },
  }),
  guess({
    id: 'guess-rate-two-points', topic: 'loans', title: t('Guess first: two points on the rate', 'पहले अंदाज़ा लगाइए: दर में दो अंक'), tags: ['EMI', 'rate'],
    hook: t('A lender quotes 10.5% where another quotes 8.5%, on a ₹40 lakh loan. How much more is the EMI?', 'एक बैंक 10.5% बताता है जहाँ दूसरा 8.5%, ₹40 लाख के लोन पर। EMI कितनी ज़्यादा है?'),
    setupCaption: fill(t('Same loan, {y} years, an assumed {a}% against {b}%.', 'वही लोन, {y} साल, मान लें {a}% बनाम {b}%।'), { y: GAP_Y, a: GAP_A, b: GAP_B }),
    setupSteps: [t('₹40 lakh, 20 years', '₹40 लाख, 20 साल'), t('8.5% against 10.5%', '8.5% बनाम 10.5%'), t('Compare the EMI', 'EMI की तुलना करें')],
    q: t('How much more is the monthly EMI at 10.5%?', '10.5% पर मासिक EMI कितनी ज़्यादा है?'), answer: gap,
    reveal: fill(t('About {g} more every month, for twenty years. Small differences in rate add up.', 'हर महीने लगभग {g} ज़्यादा, बीस साल तक। दर के छोटे फ़र्क़ जुड़ते हैं।'), { g: money(Math.round(gap)) }),
    resultCaption: fill(t('The EMI is about {a} at {ra}% and about {b} at {rb}%.', 'EMI {ra}% पर लगभग {a} और {rb}% पर लगभग {b} है।'), { a: money(Math.round(emi(GAP_P, GAP_A, GAP_Y))), b: money(Math.round(emi(GAP_P, GAP_B, GAP_Y))), ra: GAP_A, rb: GAP_B }),
    resultBars: [t('At 8.5%', '8.5% पर'), emi(GAP_P, GAP_A, GAP_Y), t('At 10.5%', '10.5% पर'), emi(GAP_P, GAP_B, GAP_Y)],
    caveat: t('Rates are examples. Ask each lender for its current rate, in writing.', 'दरें उदाहरण हैं। हर बैंक से उसकी ताज़ा दर लिखित में माँगें।'),
    close: t('Compare offers by the total, not just the headline rate.', 'ऑफ़र की तुलना कुल से करें, सिर्फ़ ऊपर लिखी दर से नहीं।'),
    quiz: { q: t('Why does a small rate difference matter?', 'दर का छोटा फ़र्क़ क्यों मायने रखता है?'), options: [t('It applies to a big amount for many years', 'वह बड़ी रकम पर कई साल लगता है'), t('It does not', 'वह नहीं रखता'), t('Banks round it away', 'बैंक उसे गोल कर देते हैं')], answer: 0,
      why: t('Every month for twenty years carries the extra, so it adds up.', 'बीस साल के हर महीने में अतिरिक्त जुड़ता है, इसलिए वह बड़ा बनता है।') },
  }),
];

// ── What-if sliders ──────────────────────────────────────────────────────────────────────────────────────────────
export const W4_SLIDE: Reel[] = [
  slide({
    id: 'slide-home-rate', topic: 'loans', title: t('Drag it: the rate on a ₹40 lakh loan', 'खिसकाइए: ₹40 लाख के लोन की दर'), tags: ['home loan', 'rate'],
    hook: t('A home loan’s rate can move. Drag it to see what each point does to the EMI.', 'होम लोन की दर बदल सकती है। खिसकाकर देखें हर अंक EMI का क्या करता है।'),
    setupCaption: t('A ₹40 lakh loan over 20 years. The start rate is an assumed 8.5%.', '₹40 लाख का लोन, 20 साल। शुरुआती दर मान लें 8.5%।'),
    setupSteps: [t('₹40 lakh, 20 years', '₹40 लाख, 20 साल'), t('Start at 8.5%', '8.5% से शुरू'), t('You move the rate', 'दर आप हिलाएँ')],
    resultCaption: t('Each point of rate adds a similar amount to the EMI, month after month for years.', 'दर का हर अंक EMI में लगभग इतना ही जोड़ता है, सालों तक हर महीने।'),
    caveat: t('Most home loans are floating, so a change in the benchmark can pass through to you.', 'ज़्यादातर होम लोन फ़्लोटिंग हैं, इसलिए बेंचमार्क का बदलाव आप तक आ सकता है।'),
    close: t('Know your loan’s rate type, and keep some room in your budget.', 'अपने लोन की दर का प्रकार जानें, और बजट में कुछ गुंजाइश रखें।'),
    beat: { kind: 'slider', q: t('Drag the rate to see the EMI move.', 'दर खिसकाकर EMI का बदलना देखें।'), label: t('The loan’s yearly rate', 'लोन की सालाना दर'), unit: t('%', '%'), min: 7, max: 12, step: 0.5, start: 10, model: { kind: 'emi-rate', principal: 4_000_000, years: 20, rate0: 8.5 },
      takeaway: t('At {x} a year the EMI is about {value}, against {base} at 8.5%. The gap is about {diff} a month.', '{x} सालाना पर EMI लगभग {value}, 8.5% पर {base}। अंतर लगभग {diff} महीना।') },
    quiz: { q: t('What does a higher rate do to the EMI?', 'ऊँची दर EMI का क्या करती है?'), options: [t('Raises it, for every month left', 'उसे बढ़ाती है, बचे हर महीने के लिए'), t('Lowers it', 'घटाती है'), t('Nothing', 'कुछ नहीं')], answer: 0,
      why: t('Interest is the price of the loan, and a higher rate is a higher price.', 'ब्याज लोन की क़ीमत है, और ऊँची दर ऊँची क़ीमत।') },
  }),
  slide({
    id: 'slide-child-goal', topic: 'goals', title: t('Drag it: a ₹40 lakh goal for your child', 'खिसकाइए: बच्चे के लिए ₹40 लाख का लक्ष्य'), tags: ['child', 'goal'],
    hook: t('The earlier you start for a child’s big goal, the lighter each month. Drag to see how much.', 'बच्चे के बड़े लक्ष्य के लिए जितना जल्दी शुरू करें, हर महीना उतना हल्का। खिसकाकर देखें कितना।'),
    setupCaption: t('A goal of ₹40 lakh, at an assumed 10% a year.', '₹40 लाख का लक्ष्य, मान लें 10% सालाना।'),
    setupSteps: [t('₹40 lakh goal', '₹40 लाख का लक्ष्य'), t('10% a year, assumed', '10% सालाना, अनुमानित'), t('You choose the years', 'साल आप चुनें')],
    resultCaption: t('With more years, growth does more of the work, so you put in much less of your own.', 'ज़्यादा साल हों तो बढ़त ज़्यादा काम करती है, इसलिए आप अपना बहुत कम डालते हैं।'),
    caveat: t('The return is an assumption, so keep some margin, and move to safer places as the date nears.', 'रिटर्न अनुमान है, इसलिए गुंजाइश रखें, और तारीख़ पास आने पर सुरक्षित जगहों की ओर बढ़ें।'),
    close: t('Start with what you can, and raise it with your pay.', 'जितना हो सके उतने से शुरू करें, और वेतन के साथ बढ़ाएँ।'),
    beat: { kind: 'slider', q: t('Drag the years to see the monthly SIP the goal needs.', 'साल खिसकाकर देखें लक्ष्य को कितनी मासिक SIP चाहिए।'), label: t('Years to the goal', 'लक्ष्य तक के साल'), unit: yearsU, min: 5, max: 18, step: 1, start: 12, model: { kind: 'goal-sip', target: 4_000_000, rate: 10 },
      takeaway: t('With {x} to go, the goal needs about {value} a month. You put in about {put}, and growth does the rest.', '{x} बचे हों तो लक्ष्य को महीने में लगभग {value} चाहिए। आप लगभग {put} डालते हैं, बाक़ी बढ़त करती है।') },
    quiz: { q: t('Why does an earlier start lighten each month?', 'जल्दी शुरुआत हर महीना हल्का क्यों करती है?'), options: [t('Growth has longer to work', 'बढ़त को काम का ज़्यादा समय मिलता है'), t('The goal shrinks', 'लक्ष्य घटता है'), t('Banks reduce it', 'बैंक घटाते हैं')], answer: 0,
      why: t('Early money compounds for longer, so you need less of your own.', 'शुरू का पैसा ज़्यादा समय चक्रवृद्धि पाता है, इसलिए अपना कम चाहिए।') },
  }),
  slide({
    id: 'slide-pension-spend', topic: 'retire', title: t('Drag it: how long ₹1 crore lasts', 'खिसकाइए: ₹1 करोड़ कितना चलेगा'), tags: ['withdrawal', 'retirement'],
    hook: t('The same corpus lasts very different lengths of time depending on how fast you draw it. Drag to see.', 'वही कोष इस पर बहुत अलग समय चलता है कि आप उसे कितनी तेज़ी से निकालते हैं। खिसकाकर देखें।'),
    setupCaption: t('₹1 crore, earning an assumed 7% a year. Drag the monthly withdrawal.', '₹1 करोड़, मान लें 7% सालाना कमाई। मासिक निकासी खिसकाएँ।'),
    setupSteps: [t('₹1 crore corpus', '₹1 करोड़ का कोष'), t('7% a year, assumed', '7% सालाना, अनुमानित'), t('You choose the withdrawal', 'निकासी आप चुनें')],
    resultCaption: t('A modest rise in the withdrawal can cut the years a lot, and prices rising makes it harder.', 'निकासी में थोड़ी बढ़त सालों को बहुत घटा सकती है, और बढ़ती कीमतें इसे और कठिन बनाती हैं।'),
    caveat: t('Returns vary, so keep a margin and review the plan every year.', 'रिटर्न बदलते हैं, इसलिए गुंजाइश रखें और हर साल योजना देखें।'),
    close: t('Choose a withdrawal that lasts for the years you need.', 'ऐसी निकासी चुनें जो आपको चाहिए उतने साल चले।'),
    beat: { kind: 'slider', q: t('Drag the withdrawal to see how long it lasts.', 'निकासी खिसकाकर देखें वह कितना चलता है।'), label: t('Taken out each month', 'हर महीने निकालें'), unit: t('per month', 'प्रति माह'), xFormat: 'inr', min: 40_000, max: 120_000, step: 5_000, start: 70_000, model: { kind: 'corpus-spend', corpus: 10_000_000, rate: 7 },
      takeaway: t('Taking {x} a month, the corpus lasts about {value}, at an assumed 7% growth.', 'महीने में {x} निकालने पर कोष लगभग {value} चलता है, मान लें 7% बढ़त पर।') },
    quiz: { q: t('What helps a corpus last longer?', 'कोष ज़्यादा चलने में क्या मदद करता है?'), options: [t('Taking out less each month', 'हर महीने कम निकालना'), t('Taking out more', 'ज़्यादा निकालना'), t('Ignoring prices', 'कीमतें अनदेखी करना')], answer: 0,
      why: t('Less taken out leaves more to earn, so the money lasts longer.', 'कम निकलने से ज़्यादा बचा रहकर कमाता है, इसलिए पैसा ज़्यादा चलता है।') },
  }),
  slide({
    id: 'slide-sip-thousand', topic: 'invest', title: t('Drag it: a ₹1,000 SIP over the years', 'खिसकाइए: सालों में ₹1,000 की SIP'), tags: ['SIP', 'small'],
    hook: t('₹1,000 a month feels small. Drag the years and see what time does to it.', 'महीने के ₹1,000 छोटे लगते हैं। साल खिसकाकर देखें समय उनका क्या करता है।'),
    setupCaption: t('A SIP of ₹1,000 a month, at an assumed 12% a year.', '₹1,000 की मासिक SIP, मान लें 12% सालाना।'),
    setupSteps: [t('₹1,000 a month', 'महीने का ₹1,000'), t('12% a year, assumed', '12% सालाना, अनुमानित'), t('You choose the years', 'साल आप चुनें')],
    resultCaption: t('The first years look slow. The later years add far more, because growth builds on growth.', 'शुरू के साल धीमे लगते हैं। बाद के साल कहीं ज़्यादा जोड़ते हैं, क्योंकि बढ़त पर बढ़त मिलती है।'),
    caveat: t('Returns are assumed, and real ones go up and down, so the path will not be smooth.', 'रिटर्न अनुमानित हैं, और असली ऊपर-नीचे होते हैं, इसलिए रास्ता सीधा नहीं होगा।'),
    close: t('Starting small is far better than not starting.', 'छोटी शुरुआत, शुरू न करने से कहीं बेहतर है।'),
    beat: { kind: 'slider', q: t('Drag the years to see what ₹1,000 a month becomes.', 'साल खिसकाकर देखें ₹1,000 महीना क्या बनता है।'), label: t('Years you keep it going', 'आप उसे कितने साल चलाते हैं'), unit: yearsU, min: 1, max: 35, step: 1, start: 15, model: { kind: 'sip-years', monthly: 1_000, rate: 12 },
      takeaway: t('After {x} you put in {put}, and it is about {value}, at an assumed 12% a year.', '{x} बाद आप {put} डालते हैं और वह लगभग {value} है, मान लें 12% सालाना।') },
    quiz: { q: t('What matters most for a small SIP?', 'छोटी SIP के लिए सबसे ज़्यादा क्या मायने रखता है?'), options: [t('Time and keeping it going', 'समय और उसे चलाए रखना'), t('A big first deposit', 'बड़ी पहली जमा'), t('Luck', 'क़िस्मत')], answer: 0,
      why: t('Years and consistency do the work, not the size of the first amount.', 'काम सालों और निरंतरता से होता है, पहली रकम के आकार से नहीं।') },
  }),
  slide({
    id: 'slide-tax-big-deductions', topic: 'tax', title: t('Drag it: tax with large deductions', 'खिसकाइए: बड़ी कटौतियों के साथ टैक्स'), tags: ['income tax', 'regime'],
    hook: t('With large deductions, the old regime can win. Drag the income to see where.', 'बड़ी कटौतियों के साथ पुराना रिजीम जीत सकता है। आय खिसकाकर देखें कहाँ।'),
    setupCaption: t('Salary income, FY 2026-27, with ₹3.5 lakh of deductions in the old regime.', 'वेतन की आय, FY 2026-27, पुराने रिजीम में ₹3.5 लाख की कटौती के साथ।'),
    setupSteps: [t('Salary income', 'वेतन की आय'), t('₹3.5 lakh deductions, old', '₹3.5 लाख कटौती, पुराना'), t('Cess included', 'सेस सहित')],
    resultCaption: t('The line where the two meet depends on your deductions. Bigger deductions move it.', 'जहाँ दोनों मिलते हैं वह रेखा आपकी कटौतियों पर निर्भर है। बड़ी कटौतियाँ उसे खिसकाती हैं।'),
    caveat: t('Rules change with each Budget. Check the current year before you choose.', 'नियम हर बजट में बदलते हैं। चुनने से पहले इस साल के नियम देखें।'),
    close: t('Count your real deductions, then compare both on your numbers.', 'अपनी असली कटौतियाँ गिनें, फिर अपने आँकड़ों पर दोनों की तुलना करें।'),
    beat: { kind: 'slider', q: t('Drag the yearly income to compare the two regimes.', 'सालाना आय खिसकाकर दोनों रिजीम की तुलना करें।'), label: t('Yearly salary', 'सालाना वेतन'), unit: t('a year', 'सालाना'), xFormat: 'inr', min: 1_000_000, max: 3_500_000, step: 50_000, start: 2_000_000, model: { kind: 'tax-income', deduction: 350_000 },
      takeaway: t('On {x}, the new regime tax is about {value}, and the old regime about {base}. The gap is about {diff}.', '{x} पर नए रिजीम का टैक्स लगभग {value}, और पुराने का लगभग {base}। अंतर लगभग {diff}।') },
    quiz: { q: t('What can tip the choice towards the old regime?', 'चुनाव को पुराने रिजीम की ओर क्या झुका सकता है?'), options: [t('Large deductions', 'बड़ी कटौतियाँ'), t('A smaller income only', 'सिर्फ़ छोटी आय'), t('Nothing', 'कुछ नहीं')], answer: 0,
      why: t('The old regime rewards deductions, so more of them can outweigh its higher rates.', 'पुराना रिजीम कटौतियों को महत्व देता है, इसलिए ज़्यादा कटौतियाँ उसकी ऊँची दरों पर भारी पड़ सकती हैं।') },
  }),
  slide({
    id: 'slide-step-up-small', topic: 'goals', title: t('Drag it: raising a ₹5,000 SIP each year', 'खिसकाइए: ₹5,000 की SIP हर साल बढ़ाना'), tags: ['SIP', 'step-up'],
    hook: t('Raising a smaller SIP by a little each year can do a lot. Drag the yearly step-up.', 'छोटी SIP को हर साल थोड़ा बढ़ाना बहुत कुछ कर सकता है। सालाना बढ़ोतरी खिसकाएँ।'),
    setupCaption: t('₹5,000 a month for 25 years, at an assumed 12% a year.', 'महीने का ₹5,000, 25 साल, मान लें 12% सालाना।'),
    setupSteps: [t('₹5,000 a month', 'महीने का ₹5,000'), t('25 years, 12% assumed', '25 साल, 12% अनुमानित'), t('You choose the step-up', 'बढ़ोतरी आप चुनें')],
    resultCaption: t('Even a modest step lifts the end figure well above a flat SIP.', 'मामूली बढ़ोतरी भी अंतिम रकम को स्थिर SIP से काफ़ी ऊपर ले जाती है।'),
    caveat: t('Returns are an assumption. What helps is the habit of raising the amount.', 'रिटर्न अनुमान है। मदद करती है रकम बढ़ाने की आदत।'),
    close: t('Tie the step-up to your yearly raise.', 'बढ़ोतरी को अपने सालाना इन्क्रीमेंट से जोड़ें।'),
    beat: { kind: 'slider', q: t('Drag the yearly step-up to see the end figure.', 'सालाना बढ़ोतरी खिसकाकर अंतिम रकम देखें।'), label: t('Raise each year by', 'हर साल बढ़ाएँ'), unit: t('%', '%'), min: 0, max: 15, step: 1, start: 7, model: { kind: 'step-up', monthly: 5_000, rate: 12, years: 25 },
      takeaway: t('Raising it {x} a year ends near {value}, against {base} with no step-up. That is about {diff} more.', 'हर साल {x} बढ़ाने पर अंत में लगभग {value}, बिना बढ़ोतरी के {base}। यानी लगभग {diff} ज़्यादा।') },
    quiz: { q: t('What does the step-up change?', 'बढ़ोतरी क्या बदलती है?'), options: [t('How much goes in over the years', 'सालों में कितना जाता है'), t('The return', 'रिटर्न'), t('Nothing', 'कुछ नहीं')], answer: 0,
      why: t('More money goes in each year, and each extra amount also gets time to grow.', 'हर साल ज़्यादा पैसा जाता है, और हर अतिरिक्त रकम को भी बढ़ने का समय मिलता है।') },
  }),
];
