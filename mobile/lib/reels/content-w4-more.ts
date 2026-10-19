// Wave 4 (draft): sort-it, put-in-order, myth-or-fact decks and two explainers. Same builders and rules as wave 3.
import { card, item, reel } from '@/lib/reels/content-w3-beats';
import { myth, mythCard } from '@/lib/reels/content-w3-myth';
import { fill, money } from '@/lib/reels/figures';
import { readMs, sc, t } from '@/lib/reels/kit';
import type { L, Reel } from '@/lib/reels/types';

const atLeast = (say: L, ms: number) => ({ ms: Math.max(readMs(say), ms) });

export const W4_SORT: Reel[] = [
  reel({
    id: 'sort-fixed-or-variable', topic: 'basics', title: t('Sort it: fixed or changing?', 'छाँटिए: तय या बदलने वाला?'), tags: ['budget', 'expenses'],
    lines: [t('A budget is easier once you know which costs stay put and which move.', 'बजट तब आसान होता है जब पता हो कौन-से ख़र्च टिके रहते हैं और कौन-से बदलते हैं।'),
      t('Sort each cost by whether it is the same every month.', 'हर ख़र्च को इस आधार पर छाँटें कि वह हर महीने एक-सा है या नहीं।'), t('Fixed costs are your base. Changing ones are where you have room.', 'तय ख़र्च आपका आधार हैं। बदलने वाले वहाँ हैं जहाँ आपके पास गुंजाइश है।'),
      t('Fixed does not mean untouchable. Rent and plans can be reviewed too, just less often.', 'तय का मतलब अछूता नहीं। किराया और योजनाएँ भी देखी जा सकती हैं, बस कम बार।'), t('List yours in two columns once, and see where the room is.', 'अपने ख़र्च एक बार दो कॉलम में लिखें, और देखें गुंजाइश कहाँ है।')],
    beat: { kind: 'sort', q: t('The same every month, or does it change?', 'हर महीने एक-सा, या बदलता है?'), bins: [t('Fixed', 'तय'), t('Changes', 'बदलता है')], cards: [
      card('Rent', 'किराया', 0, 'The same amount each month.', 'हर महीने वही रकम।'),
      card('A loan EMI', 'लोन की EMI', 0, 'Set by the loan, month after month.', 'लोन से तय, महीने-दर-महीने।'),
      card('Groceries', 'किराना', 1, 'It moves with what and how much you buy.', 'आप क्या और कितना ख़रीदते हैं, उसके साथ बदलता है।'),
      card('Electricity bill', 'बिजली का बिल', 1, 'It rises and falls with the season and use.', 'मौसम और इस्तेमाल के साथ घटता-बढ़ता है।'),
      card('A yearly insurance premium', 'सालाना बीमा प्रीमियम', 0, 'A set amount on a known date.', 'तय तारीख़ पर तय रकम।'),
      card('Eating out', 'बाहर खाना', 1, 'You decide it, and it varies.', 'आप तय करते हैं, और वह बदलता है।')] },
    quiz: { q: t('Where is the most room in a budget?', 'बजट में सबसे ज़्यादा गुंजाइश कहाँ है?'), options: [t('In the costs that change', 'जो ख़र्च बदलते हैं उनमें'), t('In the fixed costs', 'तय ख़र्चों में'), t('Nowhere', 'कहीं नहीं')], answer: 0,
      why: t('You choose changing costs each month, so that is where you can adjust quickly.', 'बदलने वाले ख़र्च आप हर महीने चुनते हैं, इसलिए वहीं जल्दी बदलाव हो सकता है।') },
  }, 'sort'),
  reel({
    id: 'sort-own-or-owe', topic: 'basics', title: t('Sort it: what you own and what you owe', 'छाँटिए: जो आपका है और जो आप पर बकाया है'), tags: ['net worth'],
    lines: [t('Your net worth is what you own, less what you owe. To find it, you have to sort the two.', 'आपकी कुल संपत्ति वह है जो आपका है, घटा जो आप पर बकाया है। इसके लिए दोनों छाँटने पड़ते हैं।'),
      t('Sort each item as something you own or something you owe.', 'हर चीज़ को छाँटें: आपका है या आप पर बकाया।'), t('Owning more than you owe is the base of every plan.', 'जितना बकाया है उससे ज़्यादा का मालिक होना हर योजना का आधार है।'),
      t('A loan can still be worth it. The point is to see the whole picture.', 'लोन फिर भी सार्थक हो सकता है। बात पूरी तस्वीर देखने की है।'), t('Write both lists once a year. The difference is your progress.', 'साल में एक बार दोनों सूचियाँ लिखें। अंतर आपकी प्रगति है।')],
    beat: { kind: 'sort', q: t('Own it, or owe it?', 'आपका है, या बकाया?'), bins: [t('I own it', 'मेरा है'), t('I owe it', 'मुझ पर बकाया')], cards: [
      card('Money in a savings account', 'बचत खाते का पैसा', 0, 'It is yours.', 'वह आपका है।'),
      card('The balance of a home loan', 'होम लोन का बकाया', 1, 'You still have to repay it.', 'आपको उसे अभी चुकाना है।'),
      card('Units of a mutual fund', 'म्यूचुअल फ़ंड की यूनिट', 0, 'You own them, and their value moves.', 'आप उनके मालिक हैं, और उनकी कीमत बदलती है।'),
      card('An unpaid card bill', 'न चुकाया कार्ड बिल', 1, 'It is money you owe, with interest.', 'यह आप पर बकाया है, ब्याज के साथ।'),
      card('A car loan balance', 'कार लोन का बकाया', 1, 'You owe it until it is repaid.', 'चुकने तक यह आप पर बकाया है।')] },
    quiz: { q: t('What is net worth?', 'कुल संपत्ति क्या है?'), options: [t('What you own less what you owe', 'जो आपका है, घटा जो बकाया है'), t('Your salary', 'आपकी सैलरी'), t('Your savings only', 'सिर्फ़ आपकी बचत')], answer: 0,
      why: t('Both sides count, so a loan lowers it as an asset raises it.', 'दोनों पक्ष गिने जाते हैं, इसलिए लोन उसे घटाता है और संपत्ति बढ़ाती है।') },
  }, 'sort'),
  reel({
    id: 'sort-credit-habits', topic: 'credit', title: t('Sort it: habits that help or hurt a credit score', 'छाँटिए: क्रेडिट स्कोर के लिए मददगार या नुक़सानदेह आदतें'), tags: ['credit score'],
    lines: [t('Your credit score moves with your habits more than with any trick.', 'आपका क्रेडिट स्कोर किसी भी तरकीब से ज़्यादा आपकी आदतों से बदलता है।'),
      t('Sort each habit by what it usually does to a score.', 'हर आदत को इस आधार पर छाँटें कि वह आम तौर पर स्कोर का क्या करती है।'), t('The helpful ones are mostly about paying on time and using little of your limit.', 'मददगार ज़्यादातर समय पर भुगतान और सीमा का कम इस्तेमाल हैं।'),
      t('The hurtful ones often come from stress, so a plan helps more than guilt.', 'नुक़सानदेह अक्सर तनाव से आती हैं, इसलिए योजना अपराध-बोध से ज़्यादा काम आती है।'), t('Pick one habit to fix this month.', 'इस महीने एक आदत सुधारने को चुनें।')],
    beat: { kind: 'sort', q: t('Usually helps, or usually hurts?', 'आम तौर पर मदद या नुक़सान?'), bins: [t('Helps', 'मदद'), t('Hurts', 'नुक़सान')], cards: [
      card('Paying every bill on time', 'हर बिल समय पर चुकाना', 0, 'On-time payment is the biggest part of a score.', 'समय पर भुगतान स्कोर का सबसे बड़ा हिस्सा है।'),
      card('Using nearly all of a card’s limit', 'कार्ड की लगभग पूरी सीमा इस्तेमाल करना', 1, 'High usage can look risky to lenders.', 'ऊँचा इस्तेमाल लेनदारों को जोखिम भरा दिख सकता है।'),
      card('Keeping an old account open and in good standing', 'पुराना खाता अच्छी स्थिति में चालू रखना', 0, 'It lengthens your credit history.', 'इससे आपका क्रेडिट इतिहास लंबा होता है।'),
      card('Applying to many lenders in one week', 'एक हफ़्ते में कई लेनदारों को अर्ज़ी', 1, 'Many enquiries in a short time look like a scramble for credit.', 'थोड़े समय में कई एन्क्वायरी क्रेडिट की भागदौड़ जैसी दिखती हैं।'),
      card('Checking your own score now and then', 'कभी-कभी अपना स्कोर देखना', 0, 'It is a soft check and does not hurt, and it helps you catch errors.', 'यह सॉफ़्ट चेक है, नुक़सान नहीं करता, और ग़लतियाँ पकड़ने में मदद करता है।')] },
    quiz: { q: t('Which habit counts most?', 'कौन-सी आदत सबसे ज़्यादा गिनी जाती है?'), options: [t('Paying on time', 'समय पर भुगतान'), t('Owning many cards', 'कई कार्ड रखना'), t('Having a high income', 'ऊँची आय होना')], answer: 0,
      why: t('Repayment behaviour is what lenders trust most.', 'चुकाने का व्यवहार वह है जिस पर लेनदार सबसे ज़्यादा भरोसा करते हैं।') },
  }, 'sort'),
  reel({
    id: 'sort-steady-or-moving', topic: 'retire', title: t('Sort it: steady or moving income in retirement', 'छाँटिए: रिटायरमेंट की स्थिर या बदलती आय'), tags: ['retirement income'],
    lines: [t('In retirement some income arrives like a salary, and some goes up and down.', 'रिटायरमेंट में कुछ आय वेतन की तरह आती है, और कुछ ऊपर-नीचे होती है।'),
      t('Sort each source as steady or moving.', 'हर स्रोत को स्थिर या बदलता छाँटें।'), t('Steady income pays the basics. Moving income can grow, and can also fall short.', 'स्थिर आय बुनियादी ख़र्च चलाती है। बदलती आय बढ़ सकती है, और कम भी पड़ सकती है।'),
      t('Many people try to cover their must-pay costs with steady sources first.', 'कई लोग पहले अपने अनिवार्य ख़र्च स्थिर स्रोतों से ढकने की कोशिश करते हैं।'), t('List your future sources, and mark each one.', 'अपने भविष्य के स्रोत लिखें, और हर एक पर निशान लगाएँ।')],
    beat: { kind: 'sort', q: t('Steady, or moving?', 'स्थिर, या बदलता?'), bins: [t('Steady', 'स्थिर'), t('Moving', 'बदलता')], cards: [
      card('A pension that pays a fixed amount', 'तय रकम देने वाली पेंशन', 0, 'The amount is known in advance.', 'रकम पहले से पता है।'),
      card('Withdrawals from a share-based fund', 'शेयर आधारित फ़ंड से निकासी', 1, 'The value, and so what you can take, moves with the market.', 'कीमत, और इसलिए जो निकाल सकते हैं, बाज़ार के साथ बदलती है।'),
      card('Interest on a fixed deposit', 'फ़िक्स्ड डिपॉज़िट का ब्याज', 0, 'The rate is set for the term.', 'दर अवधि के लिए तय है।'),
      card('Dividends from shares', 'शेयरों का डिविडेंड', 1, 'Companies can raise, cut or skip them.', 'कंपनियाँ उन्हें बढ़ा, घटा या छोड़ सकती हैं।'),
      card('An annuity with a fixed payout', 'तय भुगतान वाली एन्युटी', 0, 'It pays the agreed amount, though prices may rise.', 'वह तय रकम देती है, हालाँकि कीमतें बढ़ सकती हैं।')] },
    quiz: { q: t('What do many people cover with steady income first?', 'कई लोग स्थिर आय से पहले क्या ढकते हैं?'), options: [t('Their must-pay costs', 'अपने अनिवार्य ख़र्च'), t('Their holidays', 'अपनी छुट्टियाँ'), t('Their gifts', 'अपने तोहफ़े')], answer: 0,
      why: t('If the basics are safe, a bad year in the market is less frightening.', 'बुनियादी ख़र्च सुरक्षित हों तो बाज़ार का बुरा साल कम डराता है।') },
  }, 'sort'),
  reel({
    id: 'sort-after-fraud', topic: 'safety', title: t('Sort it: after a fraud, do or do not', 'छाँटिए: धोखाधड़ी के बाद, करें या न करें'), tags: ['fraud', 'response'],
    lines: [t('If you lose money to a fraud, the first hour matters, and shame is the biggest enemy.', 'धोखाधड़ी में पैसा जाए तो पहला घंटा अहम है, और शर्म सबसे बड़ी दुश्मन।'),
      t('Sort each action: do it now, or do not.', 'हर क़दम छाँटें: अभी करें, या न करें।'), t('Speed helps. Calling the bank and the helpline early gives money a chance to be stopped.', 'गति मदद करती है। बैंक और हेल्पलाइन को जल्दी कॉल करने से पैसा रुकने का मौक़ा मिलता है।'),
      t('Anyone can be fooled. Reporting is what you do next.', 'कोई भी बहक सकता है। रिपोर्ट करना आगे का काम है।'), t('Save these steps where you can find them quickly.', 'ये क़दम ऐसी जगह रखें जहाँ जल्दी मिलें।')],
    beat: { kind: 'sort', q: t('Do it now, or do not?', 'अभी करें, या न करें?'), bins: [t('Do now', 'अभी करें'), t('Do not', 'न करें')], cards: [
      card('Call your bank to stop or flag the payment', 'पैसा रोकने या चिह्नित करने के लिए बैंक को कॉल करें', 0, 'The sooner the bank knows, the better the chance.', 'बैंक को जितनी जल्दी पता चले, मौक़ा उतना बेहतर।'),
      card('Report on the national helpline, 1930', 'राष्ट्रीय हेल्पलाइन 1930 पर सूचित करें', 0, 'It starts the process to freeze the money.', 'यह पैसा रोकने की प्रक्रिया शुरू करता है।'),
      card('Pay the “recovery agent” who calls to get it back', 'पैसा वापस दिलाने वाले “रिकवरी एजेंट” को भुगतान', 1, 'It is the same scammers, back for more.', 'वही ठग हैं, और माँगने लौटे हैं।'),
      card('Keep the screenshots and messages as proof', 'सबूत के तौर पर स्क्रीनशॉट और संदेश रखें', 0, 'They help the complaint.', 'वे शिकायत में मदद करते हैं।'),
      card('Delete the chat so no one finds out', 'चैट मिटा दें ताकि किसी को पता न चले', 1, 'You lose your evidence, and shame is what the scammers rely on.', 'आप सबूत खो देते हैं, और शर्म पर ही ठग निर्भर रहते हैं।')] },
    quiz: { q: t('What is the first step after losing money to a fraud?', 'धोखाधड़ी में पैसा जाने के बाद पहला क़दम क्या है?'), options: [t('Call your bank and the helpline quickly', 'बैंक और हेल्पलाइन को जल्दी कॉल करें'), t('Wait a week', 'एक हफ़्ता रुकें'), t('Pay for recovery', 'रिकवरी के लिए भुगतान करें')], answer: 0,
      why: t('Money can sometimes be held if it is reported quickly.', 'जल्दी बताने पर पैसा कभी-कभी रोका जा सकता है।') },
  }, 'sort'),
  reel({
    id: 'sort-keep-or-review', topic: 'basics', title: t('Sort it: keep it or look again', 'छाँटिए: रखें या दोबारा देखें'), tags: ['subscriptions', 'spending'],
    lines: [t('Small monthly charges hide in plain sight. A yearly look finds the ones you forgot.', 'छोटे मासिक शुल्क सामने ही छिपे रहते हैं। साल में एक नज़र उन्हें ढूँढ़ लेती है जो आप भूल गए।'),
      t('Sort each charge: worth keeping, or worth a second look.', 'हर शुल्क छाँटें: रखने लायक़, या दोबारा देखने लायक़।'), t('Keep what you use and value. Look again at what you forgot or doubled up.', 'जो इस्तेमाल करते हैं और क़ीमती है उसे रखें। जो भूल गए या दोहरा है उसे फिर देखें।'),
      t('Cancelling is not a loss if you had stopped using it.', 'इस्तेमाल बंद हो गया हो तो रद्द करना नुक़सान नहीं।'), t('Open your statement and mark each charge.', 'अपना स्टेटमेंट खोलें और हर शुल्क पर निशान लगाएँ।')],
    beat: { kind: 'sort', q: t('Keep, or look again?', 'रखें, या दोबारा देखें?'), bins: [t('Keep', 'रखें'), t('Look again', 'दोबारा देखें')], cards: [
      card('A music app you use every day', 'रोज़ इस्तेमाल होने वाला म्यूज़िक ऐप', 0, 'You use it, so it earns its place.', 'आप इस्तेमाल करते हैं, इसलिए जगह बनती है।'),
      card('A gym you have not visited in months', 'महीनों से न गए जिम की सदस्यता', 1, 'Unused, so it is just a cost.', 'इस्तेमाल नहीं, तो सिर्फ़ ख़र्च है।'),
      card('Four video apps with overlapping shows', 'एक-जैसे शो वाले चार वीडियो ऐप', 1, 'Doubled up. One or two may be enough.', 'दोहराव। एक-दो काफ़ी हो सकते हैं।'),
      card('Your yearly health insurance', 'आपका सालाना हेल्थ इंश्योरेंस', 0, 'Protection you would regret dropping.', 'सुरक्षा जिसे छोड़ने पर पछतावा होगा।'),
      card('A “free trial” that started charging', 'एक “मुफ़्त ट्रायल” जो चार्ज करने लगा', 1, 'You may not have chosen it. Check and cancel if unwanted.', 'शायद आपने नहीं चुना। जाँचें और अनचाहा हो तो रद्द करें।')] },
    quiz: { q: t('When is cancelling a charge not a loss?', 'शुल्क रद्द करना नुक़सान कब नहीं है?'), options: [t('When you had stopped using it', 'जब आपने इस्तेमाल बंद कर दिया हो'), t('Never', 'कभी नहीं'), t('When it is cheap', 'जब वह सस्ता हो')], answer: 0,
      why: t('Paying for what you do not use gives you nothing back.', 'जो इस्तेमाल नहीं होता उसके पैसे देने से कुछ वापस नहीं मिलता।') },
  }, 'sort'),
];

export const W4_ORDER: Reel[] = [
  reel({
    id: 'order-first-sip-steps', topic: 'invest', title: t('Put it in order: starting your first SIP', 'क्रम में लगाइए: पहली SIP शुरू करना'), tags: ['SIP', 'steps'],
    lines: [t('Starting a first SIP has a few steps, and the order saves you from rework.', 'पहली SIP शुरू करने के कुछ क़दम हैं, और सही क्रम दोबारा काम से बचाता है।'),
      t('Put the steps in order.', 'क़दमों को क्रम में लगाएँ।'), t('Safety and goals come before a product. Then comes the amount, and then the habit.', 'उत्पाद से पहले सुरक्षा और लक्ष्य आते हैं। फिर रकम, और फिर आदत।'),
      t('A simple first SIP is better than a perfect one you never start.', 'सरल पहली SIP उस पूरी SIP से बेहतर है जो कभी शुरू नहीं होती।'), t('Do step one today.', 'पहला क़दम आज करें।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Build a small emergency fund', 'छोटा इमरजेंसी फ़ंड बनाएँ', 'Investing comes after a cushion.', 'निवेश गद्दी के बाद आता है।'),
      item('Name your goal and its date', 'लक्ष्य और उसकी तारीख़ तय करें', 'The goal decides how much risk fits.', 'लक्ष्य तय करता है कि कितना जोखिम जमेगा।'),
      item('Complete KYC and link your bank', 'KYC पूरा करें और बैंक जोड़ें', 'You need these before any investment.', 'किसी भी निवेश से पहले ये चाहिए।'),
      item('Pick a fund and read its risk label and cost', 'फ़ंड चुनें और उसका जोखिम लेबल व लागत पढ़ें', 'Read before you commit.', 'वादा करने से पहले पढ़ें।'),
      item('Set a small monthly amount on payday', 'पे-डे पर छोटी मासिक रकम तय करें', 'A small automatic amount is easy to keep.', 'छोटी ऑटोमैटिक रकम निभाना आसान है।')] },
    quiz: { q: t('What comes before investing?', 'निवेश से पहले क्या आता है?'), options: [t('A small emergency fund', 'छोटा इमरजेंसी फ़ंड'), t('A big first deposit', 'बड़ी पहली जमा'), t('A tip from a friend', 'दोस्त की सलाह')], answer: 0,
      why: t('A cushion stops you from selling investments to pay a surprise bill.', 'गद्दी आपको अचानक के बिल के लिए निवेश बेचने से बचाती है।') },
  }, 'order'),
  reel({
    id: 'order-monthly-budget', topic: 'basics', title: t('Put it in order: a monthly money routine', 'क्रम में लगाइए: महीने की पैसों की दिनचर्या'), tags: ['budget', 'routine'],
    lines: [t('A simple routine each month takes ten minutes and keeps money from surprising you.', 'हर महीने की सरल दिनचर्या दस मिनट लेती है और पैसे को चौंकाने से रोकती है।'),
      t('Put the steps in order.', 'क़दमों को क्रम में लगाएँ।'), t('Look back first, plan next, and set up what runs by itself.', 'पहले पीछे देखें, फिर योजना बनाएँ, और जो अपने आप चले उसे लगाएँ।'),
      t('Doing it on the same day each month makes it a habit.', 'हर महीने उसी दिन करना उसे आदत बनाता है।'), t('Pick a day and put it in your calendar.', 'एक दिन चुनें और उसे कैलेंडर में डालें।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Look at last month’s spending', 'पिछले महीने का ख़र्च देखें', 'Start from what really happened.', 'जो असल में हुआ उससे शुरू करें।'),
      item('Check upcoming bills and renewals', 'आने वाले बिल और नवीनीकरण देखें', 'Known costs come before spare money.', 'ज्ञात ख़र्च बचे पैसे से पहले आते हैं।'),
      item('Set this month’s spending limits', 'इस महीने की ख़र्च-सीमाएँ तय करें', 'A plan for the month ahead.', 'आने वाले महीने की योजना।'),
      item('Move savings out on payday', 'पे-डे पर बचत अलग करें', 'Savings come out before spending.', 'बचत ख़र्च से पहले निकलती है।'),
      item('Review once mid-month', 'महीने के बीच में एक बार देखें', 'A short check keeps you on track.', 'छोटी जाँच आपको राह पर रखती है।')] },
    quiz: { q: t('Why start with last month?', 'पिछले महीने से शुरू क्यों करें?'), options: [t('It shows what really happened', 'वह दिखाता है कि असल में क्या हुआ'), t('It is easier', 'वह आसान है'), t('Banks ask for it', 'बैंक माँगते हैं')], answer: 0,
      why: t('A plan built on real figures works better than one built on guesses.', 'असली आँकड़ों पर बनी योजना अंदाज़ों पर बनी से बेहतर चलती है।') },
  }, 'order'),
  reel({
    id: 'order-after-fraud', topic: 'safety', title: t('Put it in order: the first hour after a fraud', 'क्रम में लगाइए: धोखाधड़ी के बाद का पहला घंटा'), tags: ['fraud', 'steps'],
    lines: [t('Money lost to a fraud sometimes can be held if you act fast and in the right order.', 'धोखाधड़ी में गया पैसा कभी-कभी रोका जा सकता है अगर आप जल्दी और सही क्रम में काम करें।'),
      t('Put the steps in order.', 'क़दमों को क्रम में लगाएँ।'), t('First stop the money, then report, then secure your accounts.', 'पहले पैसा रोकें, फिर रिपोर्ट करें, फिर खाते सुरक्षित करें।'),
      t('Keep calm. A clear order beats panic.', 'शांत रहें। साफ़ क्रम घबराहट से बेहतर है।'), t('Keep the helpline number where you can reach it fast.', 'हेल्पलाइन नंबर ऐसी जगह रखें जहाँ जल्दी मिले।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Call your bank and ask it to stop the payment', 'बैंक को कॉल करें और भुगतान रोकने को कहें', 'The bank can act on the money soonest.', 'पैसे पर बैंक सबसे जल्दी कार्रवाई कर सकता है।'),
      item('Report on the national helpline, 1930', 'राष्ट्रीय हेल्पलाइन 1930 पर सूचित करें', 'It starts the formal freeze process.', 'यह औपचारिक रोक की प्रक्रिया शुरू करता है।'),
      item('Block your cards and change your passwords', 'कार्ड ब्लॉक करें और पासवर्ड बदलें', 'It stops further loss.', 'इससे आगे का नुक़सान रुकता है।'),
      item('Save screenshots, numbers and messages', 'स्क्रीनशॉट, नंबर और संदेश सहेजें', 'They are your proof.', 'वे आपका सबूत हैं।'),
      item('File a complaint on the cybercrime portal', 'साइबर क्राइम पोर्टल पर शिकायत दर्ज करें', 'It makes the report formal.', 'यह रिपोर्ट को औपचारिक बनाता है।')] },
    quiz: { q: t('What comes first after losing money?', 'पैसा जाने के बाद पहले क्या?'), options: [t('Ask your bank to stop the payment', 'बैंक से भुगतान रोकने को कहें'), t('Post about it online', 'ऑनलाइन पोस्ट करें'), t('Wait', 'इंतज़ार')], answer: 0,
      why: t('Money is easiest to stop in the first hour.', 'पैसा पहले घंटे में सबसे आसानी से रोका जा सकता है।') },
  }, 'order'),
  reel({
    id: 'order-buying-a-home', topic: 'loans', title: t('Put it in order: buying your first home', 'क्रम में लगाइए: पहला घर ख़रीदना'), tags: ['home loan', 'steps'],
    lines: [t('Buying a home is many steps over many months. A good order avoids expensive surprises.', 'घर ख़रीदना कई महीनों में कई क़दम है। अच्छा क्रम महँगी अनहोनी से बचाता है।'),
      t('Put the steps in order.', 'क़दमों को क्रम में लगाएँ।'), t('Decide what you can afford first, then look, and check papers before you pay.', 'पहले तय करें क्या ख़रीद सकते हैं, फिर देखें, और भुगतान से पहले काग़ज़ जाँचें।'),
      t('Skipping a step usually costs more than it saves.', 'कोई क़दम छोड़ना आम तौर पर बचाने से ज़्यादा महँगा पड़ता है।'), t('Do the first two steps before you visit any flat.', 'कोई भी फ़्लैट देखने से पहले पहले दो क़दम करें।')],
    beat: { kind: 'order', q: t('First to last.', 'पहले से आख़िरी।'), items: [
      item('Work out what EMI you can carry', 'तय करें कितनी EMI उठा सकते हैं', 'The budget comes before the search.', 'खोज से पहले बजट।'),
      item('Check your credit report', 'अपनी क्रेडिट रिपोर्ट देखें', 'It affects the offers you get.', 'यह मिलने वाले ऑफ़र पर असर डालती है।'),
      item('Compare lenders and get a sanction', 'बैंकों की तुलना करें और मंज़ूरी लें', 'You then know your real limit.', 'फिर आपकी असली सीमा पता है।'),
      item('Verify the property’s papers', 'संपत्ति के काग़ज़ जाँचें', 'Check title and approvals before paying.', 'भुगतान से पहले टाइटल और मंज़ूरियाँ जाँचें।'),
      item('Pay, sign and register', 'भुगतान, दस्तख़त और रजिस्ट्रेशन', 'This comes last, once everything is checked.', 'सब जाँचने के बाद यह आख़िर में आता है।')] },
    quiz: { q: t('When do you check the property’s papers?', 'संपत्ति के काग़ज़ कब जाँचते हैं?'), options: [t('Before you pay', 'भुगतान से पहले'), t('After registering', 'रजिस्ट्रेशन के बाद'), t('Never', 'कभी नहीं')], answer: 0,
      why: t('A problem found after paying is far harder to fix.', 'भुगतान के बाद मिली समस्या सुलझाना बहुत कठिन है।') },
  }, 'order'),
];

const M = (id: string, topic: Reel['topic'], title: [string, string], tags: string[], lines: [L, L, L, L], cards: ReturnType<typeof mythCard>[], quiz: Reel['quiz']): Reel => myth({ id, topic, title: t(title[0], title[1]), tags, lines, cards, quiz });
export const W4_MYTH: Reel[] = [
  M('myths-stocks', 'invest', ['Share market myths, sorted', 'शेयर बाज़ार के मिथक, छाँटे हुए'], ['stocks'],
    [t('The share market attracts big claims. Some of them are the myths that cost people most.', 'शेयर बाज़ार बड़े दावे खींचता है। उनमें से कुछ वही मिथक हैं जो लोगों को सबसे महँगे पड़ते हैं।'), t('A share price moves on news, mood and results, and no one can time all of it.', 'शेयर का भाव ख़बर, मिज़ाज और नतीजों पर चलता है, और कोई भी सब का समय नहीं साध सकता।'), t('Patience and spreading your money matter more than finding a tip.', 'सलाह ढूँढ़ने से ज़्यादा धैर्य और पैसा बाँटना मायने रखता है।'), t('Learn first, and invest only what you can leave alone.', 'पहले सीखें, और सिर्फ़ वही लगाएँ जिसे छोड़ सकें।')],
    [mythCard(['A low-priced share is cheap.', 'कम भाव वाला शेयर सस्ता है।'], false, ['Price per share says nothing about value. A company’s worth is what matters.', 'प्रति शेयर भाव मूल्य के बारे में कुछ नहीं बताता। कंपनी का मूल्य मायने रखता है।']),
     mythCard(['You can lose more than you invest in a plain share purchase.', 'सीधे शेयर ख़रीद में आप लगाए से ज़्यादा खो सकते हैं।'], false, ['In a simple purchase, the most you lose is what you put in.', 'सरल ख़रीद में ज़्यादा से ज़्यादा आप वही खोते हैं जो लगाया।']),
     mythCard(['Spreading across companies lowers the damage of one bad pick.', 'कई कंपनियों में बाँटने से एक ग़लत चुनाव का नुक़सान घटता है।'], true, ['One failure is a small part of the whole.', 'एक असफलता पूरे का छोटा हिस्सा होती है।']),
     mythCard(['A tip from a group chat is reliable if many people share it.', 'ग्रुप चैट की सलाह भरोसेमंद है अगर कई लोग साझा करें।'], false, ['Repeating a tip does not make it true, and it can be a way to push a price.', 'सलाह दोहराने से वह सच नहीं होती, और वह भाव चढ़ाने का तरीक़ा हो सकती है।']),
     mythCard(['Money needed in a year or two does not belong in shares.', 'एक-दो साल में चाहिए पैसा शेयरों में नहीं रखना चाहिए।'], true, ['There may be no time to recover from a fall.', 'गिरावट से उबरने का समय न मिले, ऐसा हो सकता है।'])],
    { q: t('What is the most you lose in a simple share purchase?', 'सरल शेयर ख़रीद में ज़्यादा से ज़्यादा आप कितना खोते हैं?'), options: [t('What you put in', 'जो आपने लगाया'), t('Unlimited amounts', 'असीमित रकम'), t('Nothing', 'कुछ नहीं')], answer: 0, why: t('A share cannot fall below zero, so your loss stops at what you paid.', 'शेयर शून्य से नीचे नहीं जा सकता, इसलिए नुक़सान आपके दिए पर रुकता है।') }),
  M('myths-emi-cards', 'credit', ['Card and EMI myths, sorted', 'कार्ड और EMI के मिथक, छाँटे हुए'], ['credit card', 'EMI'],
    [t('Cards and EMIs make spending easy. That ease hides some myths.', 'कार्ड और EMI ख़र्च आसान बनाते हैं। उस आसानी में कुछ मिथक छिपे हैं।'), t('The cost is in the interest and the fees, not the swipe.', 'लागत ब्याज और शुल्क में है, स्वाइप में नहीं।'), t('Used with care, a card is a tool. Used without a plan, it is a loan.', 'सावधानी से इस्तेमाल हो तो कार्ड औज़ार है। बिना योजना के वह लोन है।'), t('Pay in full whenever you can.', 'जब भी हो सके पूरा चुकाएँ।')],
    [mythCard(['Paying the minimum due keeps you out of trouble.', 'न्यूनतम बकाया चुकाने से आप परेशानी से बचे रहते हैं।'], false, ['The rest keeps charging interest, which can grow fast.', 'बाक़ी पर ब्याज लगता रहता है, जो तेज़ी से बढ़ सकता है।']),
     mythCard(['A card’s interest-free period applies if you pay the full bill by the due date.', 'पूरा बिल देय तारीख़ तक चुकाएँ तो कार्ड की ब्याज-मुक्त अवधि लागू होती है।'], true, ['Usually, yes. Check your card’s terms.', 'आम तौर पर हाँ। अपने कार्ड की शर्तें देखें।']),
     mythCard(['A cash advance on a card is free.', 'कार्ड से कैश निकालना मुफ़्त है।'], false, ['It usually carries a fee and interest from day one.', 'उस पर आम तौर पर शुल्क और पहले दिन से ब्याज लगता है।']),
     mythCard(['Converting a big purchase to EMI always costs extra.', 'बड़ी ख़रीद को EMI में बदलने पर हमेशा अतिरिक्त लगता है।'], false, ['Not always, but there may be a fee or interest, so check the total.', 'हमेशा नहीं, पर शुल्क या ब्याज हो सकता है, इसलिए कुल देखें।']),
     mythCard(['Having a card makes you spend more than you plan.', 'कार्ड रखने पर आप योजना से ज़्यादा ख़र्च करते हैं।'], true, ['Research on spending shows paying later feels lighter, so plan limits.', 'ख़र्च पर शोध दिखाता है कि बाद में चुकाना हल्का लगता है, इसलिए सीमा तय करें।'])],
    { q: t('What happens to the part of a card bill you do not pay?', 'कार्ड बिल का जो हिस्सा आप नहीं चुकाते उसका क्या होता है?'), options: [t('It keeps charging interest', 'उस पर ब्याज लगता रहता है'), t('It is waived', 'वह माफ़ हो जाता है'), t('It is ignored', 'अनदेखा होता है')], answer: 0, why: t('Interest is charged on what is unpaid until it is cleared.', 'न चुकाई रकम पर चुकने तक ब्याज लगता है।') }),
  M('myths-budgeting', 'basics', ['Budgeting myths, sorted', 'बजट के मिथक, छाँटे हुए'], ['budget'],
    [t('Budgeting has a bad name. Some of that comes from myths about what it is.', 'बजट की छवि बुरी है। उसका कुछ हिस्सा इस बारे के मिथकों से आता है कि वह क्या है।'), t('A budget is a plan for your money, not a punishment.', 'बजट आपके पैसे की योजना है, सज़ा नहीं।'), t('The best one is the one you can keep, not the one that looks perfect.', 'सबसे अच्छा वह है जिसे निभा सकें, वह नहीं जो परफ़ेक्ट दिखे।'), t('Start simple and adjust.', 'सरल शुरू करें और बदलते रहें।')],
    [mythCard(['A budget means you cannot enjoy spending.', 'बजट का मतलब है आप ख़र्च का आनंद नहीं ले सकते।'], false, ['A good budget includes things you enjoy, on purpose.', 'अच्छे बजट में वे चीज़ें होती हैं जिनका आप जान-बूझकर आनंद लेते हैं।']),
     mythCard(['You need an app to budget.', 'बजट बनाने के लिए ऐप चाहिए।'], false, ['A notebook works. What matters is the habit.', 'कॉपी भी चलती है। आदत मायने रखती है।']),
     mythCard(['Tracking spending for a month shows where money goes.', 'महीने भर ख़र्च लिखने से दिखता है पैसा कहाँ जाता है।'], true, ['Most people are surprised by a few categories.', 'ज़्यादातर लोग कुछ मदों से हैरान होते हैं।']),
     mythCard(['One slip means the budget has failed.', 'एक चूक का मतलब बजट फ़ेल।'], false, ['A slip is data. You adjust and carry on.', 'चूक एक आँकड़ा है। बदलाव करें और आगे बढ़ें।']),
     mythCard(['Budgeting is only for people who earn little.', 'बजट सिर्फ़ कम कमाने वालों के लिए है।'], false, ['Everyone with goals benefits, at any income.', 'लक्ष्य रखने वाले हर व्यक्ति को फ़ायदा है, किसी भी आय पर।'])],
    { q: t('What is a budget?', 'बजट क्या है?'), options: [t('A plan for your money', 'आपके पैसे की योजना'), t('A punishment', 'सज़ा'), t('A bank product', 'बैंक का उत्पाद')], answer: 0, why: t('It decides in advance where your money goes, so it can go where you want.', 'वह पहले से तय करता है पैसा कहाँ जाएगा, ताकि वह वहाँ जाए जहाँ आप चाहें।') }),
  M('myths-inflation', 'basics', ['Inflation myths, sorted', 'महँगाई के मिथक, छाँटे हुए'], ['inflation'],
    [t('Inflation is felt every day and understood by few. That leaves room for myths.', 'महँगाई हर दिन महसूस होती है और कम लोग समझते हैं। इसलिए मिथकों की जगह बनती है।'), t('It is the slow rise in prices that makes each rupee buy less.', 'यह कीमतों की धीमी बढ़त है जिससे हर रुपया कम ख़रीदता है।'), t('It is not the same for everyone, because we buy different things.', 'यह सबके लिए एक-सी नहीं, क्योंकि हम अलग चीज़ें ख़रीदते हैं।'), t('Think about your own costs.', 'अपने ख़र्चों के बारे में सोचें।')],
    [mythCard(['Inflation only matters when prices jump suddenly.', 'महँगाई तभी मायने रखती है जब कीमतें अचानक उछलें।'], false, ['The slow, steady rise does the most damage over years.', 'धीमी, लगातार बढ़त सालों में सबसे ज़्यादा नुक़सान करती है।']),
     mythCard(['Cash at home keeps its value.', 'घर में रखी नक़दी अपनी क़ीमत बनाए रखती है।'], false, ['The amount stays, but what it buys falls.', 'रकम वही रहती है, पर उससे जो मिलता है वह घटता है।']),
     mythCard(['Your own inflation can differ from the headline number.', 'आपकी अपनी महँगाई ऊपर बताई संख्या से अलग हो सकती है।'], true, ['It depends on what you buy, such as rent, school or food.', 'यह इस पर निर्भर है कि आप क्या ख़रीदते हैं, जैसे किराया, स्कूल या खाना।']),
     mythCard(['A raise equal to inflation makes you better off.', 'महँगाई के बराबर इन्क्रीमेंट से आप बेहतर हो जाते हैं।'], false, ['It only keeps you where you were.', 'वह बस आपको वहीं रखता है जहाँ आप थे।']),
     mythCard(['Prices of some things, like healthcare and education, can rise faster than average.', 'कुछ चीज़ों की कीमतें, जैसे इलाज और पढ़ाई, औसत से तेज़ बढ़ सकती हैं।'], true, ['Plan for those separately.', 'उनकी योजना अलग से बनाएँ।'])],
    { q: t('What does inflation do to cash kept idle?', 'बेकार रखी नक़दी का महँगाई क्या करती है?'), options: [t('Lowers what it can buy', 'उससे जो ख़रीद सकते हैं वह घटाती है'), t('Raises the amount', 'रकम बढ़ाती है'), t('Nothing', 'कुछ नहीं')], answer: 0, why: t('Prices rise, so the same amount buys less each year.', 'कीमतें बढ़ती हैं, इसलिए वही रकम हर साल कम ख़रीदती है।') }),
  M('myths-ppf-nps', 'retire', ['PPF and NPS myths, sorted', 'PPF और NPS के मिथक, छाँटे हुए'], ['PPF', 'NPS'],
    [t('PPF and NPS are common, and so are the myths about them.', 'PPF और NPS आम हैं, और उनके बारे में मिथक भी।'), t('They are different tools with different rules, so do not treat them as the same.', 'वे अलग औज़ार हैं और उनके नियम अलग हैं, इसलिए उन्हें एक न मानें।'), t('Rules and rates change, so check the latest.', 'नियम और दरें बदलती हैं, इसलिए ताज़ा देखें।'), t('Choose for your own timeline.', 'अपनी समय-सीमा के हिसाब से चुनें।')],
    [mythCard(['The PPF rate is fixed for all 15 years.', 'PPF की दर पूरे 15 साल तय रहती है।'], false, ['The government resets it every quarter.', 'सरकार उसे हर तिमाही बदलती है।']),
     mythCard(['An NPS account can be opened without an employer.', 'बिना नियोक्ता के भी NPS खाता खुल सकता है।'], true, ['It is open to citizens within an age range.', 'यह एक आयु-सीमा के नागरिकों के लिए खुला है।']),
     mythCard(['You can take all your PPF money out any time.', 'PPF का सारा पैसा कभी भी निकाल सकते हैं।'], false, ['There is a 15-year term with limited early withdrawals.', '15 साल की अवधि है और जल्दी निकासी सीमित है।']),
     mythCard(['NPS returns are guaranteed.', 'NPS के रिटर्न की गारंटी है।'], false, ['Its value follows the markets it invests in.', 'उसकी कीमत उन बाज़ारों के साथ चलती है जिनमें वह लगता है।']),
     mythCard(['Both are meant for long-term goals.', 'दोनों लंबी अवधि के लक्ष्यों के लिए हैं।'], true, ['Their limits on early exit suit long horizons.', 'जल्दी निकासी की सीमाएँ लंबे समय के लिए ठीक हैं।'])],
    { q: t('How often is the PPF rate reset?', 'PPF की दर कितनी बार बदली जाती है?'), options: [t('Every quarter', 'हर तिमाही'), t('Never', 'कभी नहीं'), t('Once in 15 years', '15 साल में एक बार')], answer: 0, why: t('The government sets it each quarter, so it can rise or fall.', 'सरकार उसे हर तिमाही तय करती है, इसलिए वह बढ़ या घट सकती है।') }),
  M('myths-credit-cards-use', 'credit', ['Credit card use myths, sorted', 'क्रेडिट कार्ड इस्तेमाल के मिथक, छाँटे हुए'], ['credit card'],
    [t('Credit cards bring rewards and risks, and myths about both.', 'क्रेडिट कार्ड इनाम और जोखिम लाते हैं, और दोनों के मिथक भी।'), t('Rewards are real but small next to the interest on an unpaid bill.', 'इनाम असली हैं, पर न चुकाए बिल के ब्याज के सामने छोटे।'), t('Using a card well is mostly about the due date.', 'कार्ड ठीक से इस्तेमाल करना ज़्यादातर देय तारीख़ की बात है।'), t('Know your date and your limit.', 'अपनी तारीख़ और अपनी सीमा जानें।')],
    [mythCard(['More cards mean a higher credit score.', 'ज़्यादा कार्ड का मतलब ऊँचा क्रेडिट स्कोर।'], false, ['What matters is how you use them, not how many you hold.', 'मायने रखता है कि कैसे इस्तेमाल करते हैं, कितने रखते हैं नहीं।']),
     mythCard(['Reward points are worth more than the interest on an unpaid bill.', 'रिवॉर्ड पॉइंट न चुकाए बिल के ब्याज से ज़्यादा क़ीमती हैं।'], false, ['The interest usually costs far more than the rewards give.', 'ब्याज आम तौर पर इनाम से कहीं ज़्यादा लगता है।']),
     mythCard(['A card’s statement date and due date are different.', 'कार्ड की स्टेटमेंट तारीख़ और देय तारीख़ अलग होती हैं।'], true, ['The due date comes a few weeks after the statement.', 'देय तारीख़ स्टेटमेंट के कुछ हफ़्ते बाद आती है।']),
     mythCard(['It is safe to share your card’s CVV if a caller sounds official.', 'कॉल करने वाला आधिकारिक लगे तो कार्ड का CVV बताना सुरक्षित है।'], false, ['No genuine caller needs your CVV or OTP.', 'किसी असली कॉलर को आपका CVV या OTP नहीं चाहिए।']),
     mythCard(['Setting an alert for the due date helps avoid late fees.', 'देय तारीख़ का अलर्ट लगाने से देरी के शुल्क से बचा जा सकता है।'], true, ['A reminder takes a minute to set.', 'रिमाइंडर लगाने में एक मिनट लगता है।'])],
    { q: t('What matters most for using a card well?', 'कार्ड ठीक से इस्तेमाल करने के लिए सबसे ज़्यादा क्या मायने रखता है?'), options: [t('Paying the full bill by the due date', 'देय तारीख़ तक पूरा बिल चुकाना'), t('Owning many cards', 'कई कार्ड रखना'), t('Collecting points', 'पॉइंट जुटाना')], answer: 0, why: t('Paying in full avoids interest and builds your history.', 'पूरा चुकाने से ब्याज बचता है और इतिहास बनता है।') }),
];

// ── Two explainers for the new series ────────────────────────────────────────────────────────────────────────────
const BABY_EXTRA = 8_000;
export const W4_EXPLAIN: Reel[] = [
  {
    id: 'couples-money-talk', topic: 'goals', tags: ['couples', 'joint money'],
    title: t('Talking about money as a couple', 'जोड़े के रूप में पैसे पर बात'),
    scenes: [
      sc('think', t('Couples often fight about money not because of the numbers, but because they never talked about them.', 'जोड़े अक्सर पैसे पर आँकड़ों की वजह से नहीं, बल्कि इसलिए झगड़ते हैं कि कभी बात ही नहीं की।'), { who: 'neel', big: t('Talk first', 'पहले बात'), ...atLeast(t('x'.repeat(110), 'x'.repeat(110)), 5200) }),
      sc('happy', t('A first conversation can cover four things.', 'पहली बातचीत चार चीज़ें ढक सकती है।'), { who: 'isha', prop: { kind: 'steps', items: [t('What each of you earns and owes', 'आप दोनों क्या कमाते और चुकाते हैं'), t('What each of you wants', 'आप दोनों क्या चाहते हैं'), t('How you will split costs', 'ख़र्च कैसे बाँटेंगे'), t('A shared emergency fund', 'साझा इमरजेंसी फ़ंड')] }, ms: 5600 }),
      sc('think', t('There is no single right way. Some pool all income, some pool a share, some keep it all apart.', 'कोई एक सही तरीक़ा नहीं। कुछ पूरी आय मिलाते हैं, कुछ एक हिस्सा, कुछ सब अलग रखते हैं।'), atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000)),
      sc('worry', t('Hidden debts and secret spending are what break trust, far more than small amounts.', 'छिपे क़र्ज़ और गुप्त ख़र्च भरोसा तोड़ते हैं, छोटी रकमों से कहीं ज़्यादा।'), atLeast(t('x'.repeat(90), 'x'.repeat(90)), 4800)),
      sc('cheer', t('Set a monthly money date, thirty minutes, and keep it kind.', 'महीने की एक मनी डेट रखें, तीस मिनट, और उसे प्यार से निभाएँ।'), { who: 'neel', ...atLeast(t('x'.repeat(65), 'x'.repeat(65)), 4000) }),
    ],
    quiz: { q: t('What breaks trust most in a couple’s money life?', 'जोड़े की पैसों की ज़िंदगी में भरोसा सबसे ज़्यादा क्या तोड़ता है?'), options: [t('Hidden debts and secret spending', 'छिपे क़र्ज़ और गुप्त ख़र्च'), t('Small shared costs', 'छोटे साझा ख़र्च'), t('Different incomes', 'अलग आय')], answer: 0,
      why: t('Openness matters more than how the money is split.', 'पैसा कैसे बँटे इससे ज़्यादा खुलापन मायने रखता है।') },
  },
  {
    id: 'new-baby-costs', topic: 'goals', tags: ['child', 'family'],
    title: t('Money, before the baby arrives', 'बच्चे के आने से पहले पैसा'),
    scenes: [
      sc('happy', t('A baby is a joy, and a long list of costs that start before the birth.', 'बच्चा ख़ुशी है, और ख़र्चों की लंबी सूची जो जन्म से पहले शुरू हो जाती है।'), { who: 'sana', big: t('A new baby', 'नया बच्चा'), ...atLeast(t('x'.repeat(100), 'x'.repeat(100)), 5000) }),
      sc('think', t('Think of costs in three groups.', 'ख़र्चों को तीन समूहों में सोचें।'), { prop: { kind: 'steps', items: [t('Before: check-ups, the birth', 'पहले: जाँच, प्रसव'), t('Early years: care, vaccines', 'शुरुआती साल: देखभाल, टीके'), t('Later: school and more', 'आगे: स्कूल और बहुत कुछ')] }, ms: 5400 }),
      sc('surprised', fill(t('Say the household spends {e} more a month. That is {y} more in a year, so plan the month and the year.', 'मान लें घर का ख़र्च महीने में {e} बढ़ता है। यानी साल में {y} ज़्यादा, इसलिए महीने और साल दोनों की योजना बनाएँ।'), { e: money(BABY_EXTRA), y: money(BABY_EXTRA * 12) }), { prop: { kind: 'counter', from: 0, to: BABY_EXTRA * 12, format: 'inr', tone: 'gold', label: t('more a year (example)', 'साल में ज़्यादा (उदाहरण)') }, ms: 6000 }),
      sc('think', t('Check your health cover for maternity terms and waiting periods early. Review your term cover and your nominees too.', 'हेल्थ कवर में मातृत्व की शर्तें और इंतज़ार की अवधि जल्दी देखें। टर्म कवर और नॉमिनी भी देखें।'), { who: 'sana', ...atLeast(t('x'.repeat(115), 'x'.repeat(115)), 5400) }),
      sc('cheer', t('Start a child fund early, even with a small amount, and let it grow with the years.', 'बच्चे का फ़ंड जल्दी शुरू करें, छोटी रकम से भी, और उसे सालों के साथ बढ़ने दें।'), atLeast(t('x'.repeat(95), 'x'.repeat(95)), 4800)),
    ],
    quiz: { q: t('What should you check early with a new baby coming?', 'बच्चा आने वाला हो तो जल्दी क्या देखें?'), options: [t('Maternity terms and waiting periods in your cover', 'कवर में मातृत्व की शर्तें और इंतज़ार की अवधि'), t('Only holiday plans', 'सिर्फ़ छुट्टी की योजना'), t('Nothing yet', 'अभी कुछ नहीं')], answer: 0,
      why: t('Waiting periods can run for months, so the time to check is early.', 'इंतज़ार की अवधि महीनों चल सकती है, इसलिए जाँचने का समय जल्दी है।') },
  },
];
