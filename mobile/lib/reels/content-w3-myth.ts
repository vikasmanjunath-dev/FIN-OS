// Wave 3, part 2: ten myth-or-fact decks. Each reel sets up a topic, pauses on five statements the viewer calls a myth or a fact, then explains the pattern.
// Statements are about how things work, never about what to buy. Facts that change (limits, rates) are phrased so they stay true, or are left out.
import { readMs, sc, t } from '@/lib/reels/kit';
import type { L, Reel, Topic } from '@/lib/reels/types';

export const mythCard = (s: [string, string], fact: boolean, why: [string, string]) => ({ s: t(s[0], s[1]), fact, why: t(why[0], why[1]) });
const min = (say: L, ms: number) => ({ ms: Math.max(readMs(say), ms) });   // keeps every deck at 20 s or more
const ask = t('Myth or fact?', 'मिथक या सच?');
const setup = t('Five statements follow. Call each one a myth or a fact.', 'अब पाँच कथन आएँगे। हर एक को मिथक या सच कहें।');

interface MythArgs {
  id: string; topic: Topic; title: L; tags: string[];
  lines: [L, L, L, L];                       // hook, two things to take away, closing line
  cards: ReturnType<typeof mythCard>[];
  quiz: Reel['quiz'];
}
export function myth(a: MythArgs): Reel {
  const [hook, w1, w2, close] = a.lines;
  return {
    id: a.id, topic: a.topic, tags: ['myths', ...a.tags], title: a.title,
    scenes: [sc('surprised', hook, min(hook, 4800)), sc('think', setup, { prop: { kind: 'steps', items: [t('Read the statement', 'कथन पढ़ें'), t('Call it myth or fact', 'मिथक या सच चुनें')] }, ...min(setup, 4200) }), sc('happy', w1, min(w1, 4800)), sc('think', w2, min(w2, 4800)), sc('cheer', close, min(close, 3800))],
    poke: { after: 1, beat: { kind: 'myth', q: ask, cards: a.cards } },
    quiz: a.quiz,
  };
}

export const MYTH_REELS: Reel[] = [
  myth({
    id: 'myths-sip', topic: 'invest', title: t('SIP myths, sorted', 'SIP के मिथक, छाँटे हुए'), tags: ['SIP'],
    lines: [t('SIPs are talked about a lot, and some of what is said is not true.', 'SIP की बहुत चर्चा होती है, और जो कहा जाता है उसमें कुछ सच नहीं है।'),
      t('A SIP is a way of paying in regularly. The fund you pick decides what you hold.', 'SIP नियमित रूप से पैसा डालने का तरीक़ा है। आप कौन-सा फ़ंड चुनते हैं, वही तय करता है कि आपके पास क्या है।'),
      t('It spreads the dates you buy on, but it cannot remove the ups and downs.', 'यह ख़रीद की तारीख़ें बाँट देती है, पर उतार-चढ़ाव ख़त्म नहीं कर सकती।'),
      t('Learn what a SIP is, then choose with your goal in mind.', 'जानें कि SIP क्या है, फिर अपने लक्ष्य को ध्यान में रखकर चुनें।')],
    cards: [
      mythCard(['A SIP guarantees a return.', 'SIP रिटर्न की गारंटी देती है।'], false, ['A SIP only sets how you invest. What you earn depends on the fund.', 'SIP सिर्फ़ निवेश का तरीक़ा तय करती है। कमाई फ़ंड पर निर्भर है।']),
      mythCard(['You can start a SIP with a small amount.', 'आप थोड़ी रकम से SIP शुरू कर सकते हैं।'], true, ['Many funds accept a few hundred rupees a month.', 'कई फ़ंड महीने में कुछ सौ रुपये स्वीकार करते हैं।']),
      mythCard(['A SIP is a type of fund.', 'SIP एक तरह का फ़ंड है।'], false, ['It is a way of investing, like paying by instalments. Funds are what you buy.', 'यह निवेश का तरीक़ा है, किस्तों में देने जैसा। फ़ंड वह है जो आप ख़रीदते हैं।']),
      mythCard(['When the market falls, a SIP buys more units for the same money.', 'बाज़ार गिरे तो SIP उतने ही पैसे में ज़्यादा यूनिट ख़रीदती है।'], true, ['A lower price means more units for the same amount.', 'कम भाव का मतलब उतनी ही रकम में ज़्यादा यूनिट।']),
      mythCard(['Once you start a SIP you cannot stop it.', 'SIP शुरू करने के बाद उसे रोक नहीं सकते।'], false, ['Most SIPs can be paused or stopped. Check your fund’s rules.', 'ज़्यादातर SIP रोकी या बंद की जा सकती हैं। अपने फ़ंड के नियम देखें।']),
    ],
    quiz: { q: t('What does a SIP decide?', 'SIP क्या तय करती है?'), options: [t('How and when you invest', 'आप कैसे और कब निवेश करते हैं'), t('What return you earn', 'आपका रिटर्न क्या होगा'), t('Which fund is safe', 'कौन-सा फ़ंड सुरक्षित है')], answer: 0,
      why: t('A SIP is a method of paying in. The fund and the market decide the result.', 'SIP पैसा डालने का तरीक़ा है। नतीजा फ़ंड और बाज़ार तय करते हैं।') },
  }),
  myth({
    id: 'myths-credit-score', topic: 'credit', title: t('Credit score myths, sorted', 'क्रेडिट स्कोर के मिथक, छाँटे हुए'), tags: ['credit score'],
    lines: [t('Everyone has a view on credit scores. Some of them cost people money.', 'क्रेडिट स्कोर पर सबकी राय है। उनमें से कुछ लोगों को महँगी पड़ती हैं।'),
      t('Your score is built from how you repay and use credit, not from how much you earn.', 'आपका स्कोर आपके चुकाने और क्रेडिट इस्तेमाल करने से बनता है, आपकी कमाई से नहीं।'),
      t('Small habits, repeated, move it more than any trick.', 'छोटी आदतें, दोहराई जाएँ, किसी भी तरकीब से ज़्यादा असर करती हैं।'),
      t('Pay on time, keep usage low, and check your report once a year.', 'समय पर चुकाएँ, इस्तेमाल कम रखें, और साल में एक बार रिपोर्ट देखें।')],
    cards: [
      mythCard(['A higher income means a higher credit score.', 'ज़्यादा आय का मतलब ज़्यादा क्रेडिट स्कोर।'], false, ['Income is not in the score. Repayment history and usage are.', 'आय स्कोर में नहीं होती। चुकाने का इतिहास और इस्तेमाल होता है।']),
      mythCard(['Checking your own score lowers it.', 'अपना स्कोर देखने से वह घटता है।'], false, ['A check of your own is a soft check and does not hurt it.', 'अपनी जाँच सॉफ़्ट चेक है और स्कोर नहीं घटाती।']),
      mythCard(['Paying the full bill on time helps your history.', 'पूरा बिल समय पर चुकाने से आपका इतिहास सुधरता है।'], true, ['On-time payment is the biggest part of a score.', 'समय पर भुगतान स्कोर का सबसे बड़ा हिस्सा है।']),
      mythCard(['Closing your oldest card always raises your score.', 'सबसे पुराना कार्ड बंद करने से स्कोर हमेशा बढ़ता है।'], false, ['An old account lengthens your history. Closing it can shorten it.', 'पुराना खाता आपका इतिहास लंबा करता है। बंद करने से छोटा हो सकता है।']),
      mythCard(['Using most of your limit every month can look risky.', 'हर महीने सीमा का ज़्यादातर इस्तेमाल जोखिम भरा दिख सकता है।'], true, ['High usage can lower a score even when you pay in full.', 'ऊँचा इस्तेमाल पूरा चुकाने पर भी स्कोर घटा सकता है।']),
    ],
    quiz: { q: t('What is the biggest part of a credit score?', 'क्रेडिट स्कोर का सबसे बड़ा हिस्सा क्या है?'), options: [t('Paying on time', 'समय पर भुगतान'), t('Your salary', 'आपकी सैलरी'), t('How many cards you own', 'आपके पास कितने कार्ड हैं')], answer: 0,
      why: t('Lenders care most about whether you repay on time.', 'लेनदार सबसे ज़्यादा देखते हैं कि आप समय पर चुकाते हैं या नहीं।') },
  }),
  myth({
    id: 'myths-insurance', topic: 'protect', title: t('Insurance myths, sorted', 'बीमा के मिथक, छाँटे हुए'), tags: ['insurance'],
    lines: [t('Insurance is bought in a hurry and misunderstood for years.', 'बीमा जल्दबाज़ी में ख़रीदा जाता है और सालों ग़लत समझा जाता है।'),
      t('Read what is covered, what is not, and when cover starts.', 'पढ़ें कि क्या कवर है, क्या नहीं, और कवर कब से शुरू होता है।'),
      t('A good policy is one you understand, and one that fits your life.', 'अच्छी पॉलिसी वही है जिसे आप समझते हों और जो आपकी ज़िंदगी में फ़िट हो।'),
      t('Check the wording before you rely on it.', 'भरोसा करने से पहले शब्द पढ़ें।')],
    cards: [
      mythCard(['Cover from your employer is enough for life.', 'नियोक्ता का कवर पूरी उम्र के लिए काफ़ी है।'], false, ['It usually ends when you leave the job, and may be small.', 'वह आम तौर पर नौकरी छोड़ने पर ख़त्म हो जाता है, और छोटा हो सकता है।']),
      mythCard(['Hiding a health problem can get a claim rejected.', 'सेहत की समस्या छिपाने पर क्लेम ठुकराया जा सकता है।'], true, ['Tell the insurer the truth. A missing fact can be a reason to refuse.', 'बीमा कंपनी को सच बताएँ। छूटी जानकारी इनकार का कारण बन सकती है।']),
      mythCard(['Young and healthy people do not need health cover.', 'जवान और स्वस्थ लोगों को हेल्थ कवर नहीं चाहिए।'], false, ['Accidents and illness do not wait. Premiums are also lower when young.', 'दुर्घटना और बीमारी इंतज़ार नहीं करती। कम उम्र में प्रीमियम भी कम होता है।']),
      mythCard(['Existing illnesses can be covered after a waiting period.', 'पहले से मौजूद बीमारियाँ इंतज़ार की अवधि के बाद कवर हो सकती हैं।'], true, ['Many policies cover them once the waiting period is over.', 'कई पॉलिसियाँ इंतज़ार की अवधि पूरी होने पर उन्हें कवर करती हैं।']),
      mythCard(['A bigger premium always means better cover.', 'बड़ा प्रीमियम हमेशा बेहतर कवर का मतलब है।'], false, ['Check the limits, waiting periods and exclusions, not just the price.', 'सिर्फ़ क़ीमत नहीं, सीमाएँ, इंतज़ार की अवधि और अपवाद देखें।']),
    ],
    quiz: { q: t('What should you read before relying on a policy?', 'पॉलिसी पर भरोसा करने से पहले क्या पढ़ना चाहिए?'), options: [t('What is covered, what is not, and when it starts', 'क्या कवर है, क्या नहीं, और कब शुरू होता है'), t('Only the price', 'सिर्फ़ क़ीमत'), t('Only the brand', 'सिर्फ़ ब्रांड')], answer: 0,
      why: t('The exact wording decides what is paid, and when.', 'सटीक शब्द तय करते हैं कि क्या मिलेगा, और कब।') },
  }),
  myth({
    id: 'myths-tax', topic: 'tax', title: t('Income-tax myths, sorted', 'आयकर के मिथक, छाँटे हुए'), tags: ['income tax'],
    lines: [t('Tax has more myths than almost any money topic. Some cause people to pay too much.', 'टैक्स में लगभग हर पैसे के विषय से ज़्यादा मिथक हैं। कुछ की वजह से लोग ज़्यादा चुकाते हैं।'),
      t('Rules and limits change with each Budget, so confirm the current ones before acting.', 'नियम और सीमाएँ हर बजट में बदलती हैं, इसलिए कुछ करने से पहले ताज़ा नियम पक्के करें।'),
      t('Keeping records and filing on time protects you more than any shortcut.', 'रिकॉर्ड रखना और समय पर भरना किसी भी शॉर्टकट से ज़्यादा बचाता है।'),
      t('When in doubt, ask a qualified tax professional.', 'शक हो तो योग्य टैक्स पेशेवर से पूछें।')],
    cards: [
      mythCard(['If TDS was cut, you do not need to file a return.', 'अगर TDS कट गया, तो रिटर्न भरने की ज़रूरत नहीं।'], false, ['TDS may be more or less than your tax, and a return is how you settle it.', 'TDS आपके टैक्स से ज़्यादा या कम हो सकता है, और रिटर्न से ही हिसाब बैठता है।']),
      mythCard(['A loss from selling investments can be set against gains.', 'निवेश बेचने का नुक़सान गेन के सामने घटाया जा सकता है।'], true, ['Within the rules, a loss can reduce the gain you are taxed on.', 'नियमों के भीतर, नुक़सान कर-योग्य गेन घटा सकता है।']),
      mythCard(['The new regime allows no deductions at all.', 'नया रिजीम कोई कटौती नहीं देता।'], false, ['Some, such as the standard deduction for salary, are still allowed.', 'कुछ, जैसे वेतन पर स्टैंडर्ड डिडक्शन, अब भी मिलती हैं।']),
      mythCard(['Gifts from close relatives are generally not taxed.', 'क़रीबी रिश्तेदारों से मिले तोहफ़ों पर आम तौर पर टैक्स नहीं लगता।'], true, ['Gifts from specified relatives are exempt, but keep a record.', 'निर्दिष्ट रिश्तेदारों के तोहफ़े मुक्त हैं, पर रिकॉर्ड रखें।']),
      mythCard(['Filing late has no consequences.', 'देर से भरने के कोई नतीजे नहीं।'], false, ['A late return can bring a fee and interest, and can cost you some benefits.', 'देर से रिटर्न पर फ़ीस और ब्याज लग सकता है, और कुछ लाभ जा सकते हैं।']),
    ],
    quiz: { q: t('Does TDS replace filing a return?', 'क्या TDS रिटर्न भरने की जगह लेता है?'), options: [t('No, a return settles the final tax', 'नहीं, रिटर्न से अंतिम टैक्स का हिसाब होता है'), t('Yes, always', 'हाँ, हमेशा'), t('Only for salaried people', 'सिर्फ़ नौकरीपेशा के लिए')], answer: 0,
      why: t('TDS is a payment on account. The return works out what you really owe or are owed.', 'TDS अग्रिम भुगतान है। रिटर्न से तय होता है कि आपको कितना देना है या मिलना है।') },
  }),
  myth({
    id: 'myths-loans', topic: 'loans', title: t('Loan myths, sorted', 'लोन के मिथक, छाँटे हुए'), tags: ['loans', 'EMI'],
    lines: [t('Loans are sold on the EMI, and the EMI hides a lot.', 'लोन EMI के नाम पर बिकते हैं, और EMI में बहुत कुछ छिपा होता है।'),
      t('Look at the total you will pay, the rate, the fees and the prepayment terms.', 'कुल चुकाई जाने वाली रकम, दर, शुल्क और प्रीपेमेंट की शर्तें देखें।'),
      t('A smaller EMI feels like a better deal. The total is what tells you.', 'छोटी EMI बेहतर सौदा लगती है। कुल रकम से सच पता चलता है।'),
      t('Ask for the full cost in writing.', 'पूरी लागत लिखित में माँगें।')],
    cards: [
      mythCard(['A longer loan is always cheaper.', 'लंबा लोन हमेशा सस्ता होता है।'], false, ['The EMI is smaller but the total interest is larger.', 'EMI छोटी है पर कुल ब्याज ज़्यादा।']),
      mythCard(['Individuals generally pay no prepayment charge on a floating-rate loan.', 'व्यक्तियों को फ़्लोटिंग दर के लोन पर आम तौर पर प्रीपेमेंट शुल्क नहीं लगता।'], true, ['Rules for floating-rate loans to individuals bar such charges. Check your own terms.', 'व्यक्तियों के फ़्लोटिंग लोन के नियम ऐसे शुल्क रोकते हैं। अपनी शर्तें देखें।']),
      mythCard(['A zero-interest EMI is always completely free.', 'ज़ीरो-ब्याज EMI हमेशा पूरी तरह मुफ़्त है।'], false, ['The cost can sit in a lost discount or a fee. Compare with the cash price.', 'लागत छूटे डिस्काउंट या फ़ीस में हो सकती है। नक़द भाव से तुलना करें।']),
      mythCard(['Moving a loan to a cheaper lender can reduce your interest.', 'लोन को सस्ते लेनदार के पास ले जाने से ब्याज घट सकता है।'], true, ['A balance transfer can help, once you count the fees.', 'शुल्क गिनने के बाद बैलेंस ट्रांसफ़र मदद कर सकता है।']),
      mythCard(['Missing one EMI has no consequence.', 'एक EMI छूटने का कोई नतीजा नहीं।'], false, ['It can bring a charge and a mark on your credit report.', 'शुल्क लग सकता है और क्रेडिट रिपोर्ट पर निशान पड़ सकता है।']),
    ],
    quiz: { q: t('What tells you a loan’s true cost?', 'लोन की असली लागत क्या बताती है?'), options: [t('The total you will pay over the loan', 'लोन में आप जो कुल चुकाएँगे'), t('The size of the EMI', 'EMI का आकार'), t('The bank’s name', 'बैंक का नाम')], answer: 0,
      why: t('Two loans with the same EMI can cost very different totals.', 'एक-सी EMI वाले दो लोन की कुल लागत बहुत अलग हो सकती है।') },
  }),
  myth({
    id: 'myths-retirement', topic: 'retire', title: t('Retirement myths, sorted', 'रिटायरमेंट के मिथक, छाँटे हुए'), tags: ['retirement'],
    lines: [t('Retirement feels far away, so people believe comfortable things about it.', 'रिटायरमेंट दूर लगता है, इसलिए लोग उसके बारे में आरामदायक बातें मान लेते हैं।'),
      t('Prices keep rising after you stop working, so your money must keep up.', 'काम बंद करने के बाद भी कीमतें बढ़ती हैं, इसलिए आपके पैसे को उनके साथ चलना होगा।'),
      t('Time is the biggest tool you have, and it is the one that runs out.', 'समय आपका सबसे बड़ा औज़ार है, और वही ख़त्म होता है।'),
      t('Start where you are, and write down a number.', 'जहाँ हैं वहीं से शुरू करें, और एक नंबर लिख लें।')],
    cards: [
      mythCard(['Your EPF alone is enough for retirement.', 'सिर्फ़ आपका EPF रिटायरमेंट के लिए काफ़ी है।'], false, ['It depends on your salary, years and spending. Many need more.', 'यह वेतन, सालों और ख़र्च पर निर्भर है। कई लोगों को ज़्यादा चाहिए।']),
      mythCard(['You can wait until your forties to start saving for retirement.', 'रिटायरमेंट की बचत चालीस के बाद शुरू कर सकते हैं।'], false, ['Starting later means saving much more each month for the same goal.', 'देर से शुरू करने पर उसी लक्ष्य के लिए हर महीने बहुत ज़्यादा बचाना पड़ता है।']),
      mythCard(['Inflation stops mattering once you retire.', 'रिटायर होने के बाद महँगाई मायने नहीं रखती।'], false, ['Prices keep rising for decades after you stop working.', 'काम बंद करने के बाद दशकों तक कीमतें बढ़ती हैं।']),
      mythCard(['A PPF account can be emptied at any time.', 'PPF खाता कभी भी ख़ाली किया जा सकता है।'], false, ['It has a 15-year term with limited early withdrawals.', 'उसकी 15 साल की अवधि है और जल्दी निकासी सीमित है।']),
      mythCard(['Most Indian adults can open an NPS account.', 'ज़्यादातर भारतीय वयस्क NPS खाता खोल सकते हैं।'], true, ['It is open to citizens within an age range, whether or not you have an employer.', 'यह एक आयु-सीमा के नागरिकों के लिए खुला है, नियोक्ता हो या न हो।']),
    ],
    quiz: { q: t('Why does inflation still matter after you retire?', 'रिटायर होने के बाद भी महँगाई क्यों मायने रखती है?'), options: [t('Prices keep rising while you spend', 'आपके ख़र्च करते समय भी कीमतें बढ़ती हैं'), t('It stops at 60', 'वह 60 पर रुक जाती है'), t('Banks pay for it', 'बैंक उसका भुगतान करते हैं')], answer: 0,
      why: t('A fixed income buys less each year, so your plan must allow for rising prices.', 'तय आय हर साल कम ख़रीदती है, इसलिए योजना में बढ़ती कीमतों की गुंजाइश चाहिए।') },
  }),
  myth({
    id: 'myths-upi', topic: 'safety', title: t('UPI safety myths, sorted', 'UPI सुरक्षा के मिथक, छाँटे हुए'), tags: ['UPI'],
    lines: [t('UPI is quick, and so are the tricks around it.', 'UPI तेज़ है, और उसके आसपास की चालें भी।'),
      t('One rule covers most of them: a PIN is for paying, never for receiving.', 'एक नियम ज़्यादातर पर लागू होता है: PIN भुगतान के लिए है, पाने के लिए कभी नहीं।'),
      t('Slowing down for ten seconds before you approve anything stops a lot of fraud.', 'किसी भी चीज़ को मंज़ूर करने से पहले दस सेकंड रुकना बहुत धोखाधड़ी रोकता है।'),
      t('Set a daily limit and switch on alerts.', 'रोज़ की सीमा तय करें और अलर्ट चालू करें।')],
    cards: [
      mythCard(['You must enter your PIN to receive money.', 'पैसा पाने के लिए PIN डालना पड़ता है।'], false, ['A PIN sends money out. Receiving never needs it.', 'PIN से पैसा बाहर जाता है। पाने के लिए ज़रूरत नहीं।']),
      mythCard(['A daily UPI limit can cap what a scammer takes.', 'रोज़ की UPI सीमा ठग के ले जाने की रकम सीमित कर सकती है।'], true, ['A limit turns a big loss into a small one.', 'सीमा बड़े नुक़सान को छोटा कर देती है।']),
      mythCard(['A genuine bank may ask for your OTP on a call.', 'असली बैंक कॉल पर आपका OTP माँग सकता है।'], false, ['An OTP is only for you. No genuine caller needs it.', 'OTP सिर्फ़ आपके लिए है। असली कॉल करने वाले को ज़रूरत नहीं।']),
      mythCard(['Checking the name shown before paying is a good habit.', 'भुगतान से पहले दिखा नाम देखना अच्छी आदत है।'], true, ['The name on screen tells you who gets the money.', 'स्क्रीन पर नाम बताता है कि पैसा किसे मिलेगा।']),
      mythCard(['A payment sent to the wrong person can always be reversed by you.', 'ग़लत व्यक्ति को गया भुगतान आप हमेशा वापस ले सकते हैं।'], false, ['You cannot reverse it yourself. Report it quickly to your bank.', 'आप ख़ुद उसे वापस नहीं ले सकते। जल्दी बैंक को सूचित करें।']),
    ],
    quiz: { q: t('When is a UPI PIN needed?', 'UPI PIN कब चाहिए?'), options: [t('Only when you send money', 'सिर्फ़ जब आप पैसा भेजें'), t('When you receive money', 'जब आप पैसा पाएँ'), t('When a caller asks', 'जब कोई कॉल पर माँगे')], answer: 0,
      why: t('The PIN authorises a payment out of your account.', 'PIN आपके खाते से भुगतान को मंज़ूरी देता है।') },
  }),
  myth({
    id: 'myths-gold', topic: 'invest', title: t('Gold myths, sorted', 'सोने के मिथक, छाँटे हुए'), tags: ['gold'],
    lines: [t('Gold is loved by families, and a lot is believed about it.', 'सोना परिवारों को प्रिय है, और उसके बारे में बहुत कुछ माना जाता है।'),
      t('Its price rises and falls like any other asset’s.', 'उसका भाव किसी भी दूसरी संपत्ति की तरह ऊपर-नीचे होता है।'),
      t('How you hold it changes what it costs you.', 'आप उसे कैसे रखते हैं, इससे उसकी लागत बदलती है।'),
      t('Decide what job gold does in your plan, then choose how to hold it.', 'तय करें कि आपकी योजना में सोना क्या काम करता है, फिर चुनें कि कैसे रखें।')],
    cards: [
      mythCard(['Gold always goes up.', 'सोना हमेशा बढ़ता है।'], false, ['Gold has had long flat and falling periods.', 'सोने में लंबे समय तक सपाट और गिरावट के दौर आए हैं।']),
      mythCard(['Jewellery is the cheapest way to hold gold.', 'गहने सोना रखने का सबसे सस्ता तरीक़ा हैं।'], false, ['Making charges and wastage add to the cost, and are often not returned.', 'मेकिंग चार्ज और छीजन लागत बढ़ाते हैं, और अक्सर वापस नहीं मिलते।']),
      mythCard(['A small share of gold can help balance a portfolio.', 'सोने का छोटा हिस्सा पोर्टफ़ोलियो को संतुलित करने में मदद कर सकता है।'], true, ['It can behave differently from shares, which is why some hold a little.', 'वह शेयरों से अलग व्यवहार कर सकता है, इसीलिए कुछ लोग थोड़ा रखते हैं।']),
      mythCard(['Digital gold is protected like a bank deposit.', 'डिजिटल गोल्ड बैंक जमा की तरह सुरक्षित है।'], false, ['It is not a bank deposit. Check who regulates the seller.', 'यह बैंक जमा नहीं है। देखें कि विक्रेता को कौन नियंत्रित करता है।']),
      mythCard(['Gold ETFs are traded on stock exchanges.', 'गोल्ड ETF स्टॉक एक्सचेंज पर ख़रीदे-बेचे जाते हैं।'], true, ['You buy and sell them like shares, without storing metal.', 'आप उन्हें शेयरों की तरह ख़रीदते-बेचते हैं, धातु रखने की झंझट के बिना।']),
    ],
    quiz: { q: t('What adds cost when you buy jewellery as an investment?', 'गहने निवेश के रूप में ख़रीदने पर लागत क्या बढ़ाती है?'), options: [t('Making charges', 'मेकिंग चार्ज'), t('Nothing', 'कुछ नहीं'), t('A lock-in', 'लॉक-इन')], answer: 0,
      why: t('You pay for the design and work, and this is usually not recovered when you sell.', 'आप डिज़ाइन और काम का पैसा देते हैं, जो बेचते समय आम तौर पर वापस नहीं मिलता।') },
  }),
  myth({
    id: 'myths-mutual-funds', topic: 'invest', title: t('Mutual fund myths, sorted', 'म्यूचुअल फ़ंड के मिथक, छाँटे हुए'), tags: ['mutual funds'],
    lines: [t('Mutual funds are explained badly, and the myths cost people both ways.', 'म्यूचुअल फ़ंड बुरी तरह समझाए जाते हैं, और मिथक दोनों तरह से नुक़सान करते हैं।'),
      t('A fund is a pool run by a manager. What is inside it decides how it behaves.', 'फ़ंड एक पूल है जिसे मैनेजर चलाता है। उसके भीतर क्या है, वही उसका बर्ताव तय करता है।'),
      t('Past results do not promise future ones.', 'पुराने नतीजे आगे के नतीजों का वादा नहीं हैं।'),
      t('Read the goal, the risk label and the cost before you choose.', 'चुनने से पहले उद्देश्य, जोखिम लेबल और लागत पढ़ें।')],
    cards: [
      mythCard(['Mutual funds are only for rich people.', 'म्यूचुअल फ़ंड सिर्फ़ अमीरों के लिए हैं।'], false, ['Many accept small monthly amounts.', 'कई छोटी मासिक रकम स्वीकार करते हैं।']),
      mythCard(['A fund with a low NAV is cheaper than one with a high NAV.', 'कम NAV वाला फ़ंड ज़्यादा NAV वाले से सस्ता है।'], false, ['NAV is a unit price, not a measure of value.', 'NAV यूनिट की कीमत है, मूल्य का पैमाना नहीं।']),
      mythCard(['A fund’s past return guarantees its future return.', 'फ़ंड का पिछला रिटर्न उसके भविष्य के रिटर्न की गारंटी है।'], false, ['Past results can repeat or not. Nothing is promised.', 'पुराने नतीजे दोहराएँ या न दोहराएँ। कुछ वादा नहीं।']),
      mythCard(['A fund’s riskometer shows how risky its holdings are.', 'फ़ंड का रिस्कोमीटर बताता है उसकी होल्डिंग कितनी जोखिम भरी है।'], true, ['It rates the risk of what the fund holds, from low to very high.', 'वह फ़ंड की होल्डिंग का जोखिम कम से बहुत ज़्यादा तक दिखाता है।']),
      mythCard(['The yearly cost of a fund matters over a long time.', 'फ़ंड का सालाना ख़र्च लंबे समय में मायने रखता है।'], true, ['A small yearly cost compounds into a big gap over the years.', 'छोटा सालाना ख़र्च सालों में बड़ा अंतर बन जाता है।']),
    ],
    quiz: { q: t('Does a low NAV mean a fund is cheaper?', 'क्या कम NAV का मतलब फ़ंड सस्ता है?'), options: [t('No, it is just a unit price', 'नहीं, वह सिर्फ़ यूनिट की कीमत है'), t('Yes, always', 'हाँ, हमेशा'), t('Only in a falling market', 'सिर्फ़ गिरते बाज़ार में')], answer: 0,
      why: t('What matters is what the fund holds, its cost and your goal.', 'मायने रखता है कि फ़ंड में क्या है, उसकी लागत और आपका लक्ष्य।') },
  }),
  myth({
    id: 'myths-saving', topic: 'basics', title: t('Saving myths, sorted', 'बचत के मिथक, छाँटे हुए'), tags: ['saving'],
    lines: [t('Everyone says save more. Not everyone says how, and some advice backfires.', 'सब कहते हैं ज़्यादा बचाओ। कैसे, यह सब नहीं बताते, और कुछ सलाह उलटी पड़ती है।'),
      t('Saving is mostly a habit and a system, not a feeling of discipline.', 'बचत ज़्यादातर आदत और तरीक़े की बात है, अनुशासन की भावना की नहीं।'),
      t('Small, steady amounts beat rare big ones.', 'छोटी, लगातार रकमें कभी-कभार की बड़ी रकमों से बेहतर हैं।'),
      t('Pick one change and make it automatic.', 'एक बदलाव चुनें और उसे ऑटोमैटिक बना दें।')],
    cards: [
      mythCard(['A savings account always beats inflation.', 'बचत खाता हमेशा महँगाई से आगे रहता है।'], false, ['Its interest is often lower than price rises.', 'उसका ब्याज अक्सर कीमतों की बढ़त से कम होता है।']),
      mythCard(['Save what is left at the end of the month.', 'जो महीने के अंत में बचे वही बचाएँ।'], false, ['Often nothing is left. Moving savings out first works better.', 'अक्सर कुछ नहीं बचता। पहले बचत अलग करना बेहतर चलता है।']),
      mythCard(['Automating a transfer on payday helps you save.', 'पे-डे पर ट्रांसफ़र ऑटोमैटिक करने से बचत होती है।'], true, ['It removes the need to decide every month.', 'यह हर महीने तय करने की ज़रूरत हटा देता है।']),
      mythCard(['Small amounts are not worth saving.', 'छोटी रकमें बचाने लायक़ नहीं।'], false, ['Small amounts build the habit and grow over years.', 'छोटी रकमें आदत बनाती हैं और सालों में बढ़ती हैं।']),
      mythCard(['An emergency fund should be in safe, easy-to-reach places.', 'आपातकालीन फ़ंड सुरक्षित, आसानी से निकलने वाली जगह पर होना चाहिए।'], true, ['Access and safety matter more than return for this money.', 'इस पैसे के लिए पहुँच और सुरक्षा रिटर्न से ज़्यादा मायने रखती है।']),
    ],
    quiz: { q: t('What helps saving most?', 'बचत में सबसे ज़्यादा क्या मदद करता है?'), options: [t('An automatic transfer on payday', 'पे-डे पर ऑटोमैटिक ट्रांसफ़र'), t('Saving what is left', 'जो बचे वह बचाना'), t('Waiting to earn more', 'ज़्यादा कमाने का इंतज़ार')], answer: 0,
      why: t('A system that runs by itself beats willpower at the end of the month.', 'अपने आप चलने वाला तरीक़ा महीने के अंत की इच्छाशक्ति से बेहतर है।') },
  }),
];
