// Seven-day challenges: one small task a day, each ending in a real thing done (a subscription cancelled, a limit set, a phone made safer).
// A habit, not a game: one task per calendar day at most, a missed day costs nothing (the next task simply waits), and nothing is scored or
// compared. Done is the person's own word, so it is honest and private. Pure functions of the state and "now", tested with known answers.
import { isPlainObject, parseJSON } from '@/lib/safeStore';
import { dayKey, dayNum, type PillarId } from '@/lib/reels/journey';
import { METRIC_OF } from '@/lib/reels/moves';
import type { ReelsProfile } from '@/lib/reels/reelsProfile';
import type { Signals } from '@/lib/reels/signals';
import type { L } from '@/lib/reels/types';

const l = (en: string, hi: string): L => ({ en, hi });

export interface ChallengeDay {
  title: L; body: L;
  /** a screen that helps with the task */ href?: string; hrefLabel?: L;
  /** a reel the person can watch first (shown as a small link; watching or finishing writes nothing to the challenge) */ reel?: string;
}
export interface Challenge {
  id: string; title: L; blurb: L; days: ChallengeDay[]; end: L;
  /** The Money Score pillars this challenge speaks to; `suggestChallenge` uses them. */
  pillars: PillarId[];
  /** True when a task reads as "put in more" (a claim, a prepayment): never suggested to a person under money strain. */
  growth?: boolean;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'leak-week', pillars: ['savings'],
    title: l('Find your leak in 7 days', '7 दिन में अपना रिसाव ढूँढें'),
    blurb: l('One small step a day to see where your money quietly goes, and plug one hole.', 'हर दिन एक छोटा क़दम: देखें पैसा चुपचाप कहाँ जाता है, और एक छेद बंद करें।'),
    days: [
      { title: l('Log today’s spending', 'आज का ख़र्च दर्ज करें'), body: l('Write down everything you spent today, even the small things.', 'आज जो भी ख़र्च किया, छोटा-बड़ा सब लिख लें।'), href: '/tracker/transactions', hrefLabel: l('Open transactions', 'लेन-देन खोलें'), reel: 'cash-flow' },
      { title: l('List your subscriptions', 'अपनी सब्सक्रिप्शन की सूची बनाएँ'), body: l('List every app, channel and service that charges you each month.', 'हर ऐप, चैनल और सेवा लिखें जो हर महीने आपसे पैसे लेती है।'), href: '/tracker/subscriptions', hrefLabel: l('Open subscriptions', 'सब्सक्रिप्शन खोलें') },
      { title: l('Cancel or pause one', 'एक रद्द करें या रोकें'), body: l('Pick one you barely use and cancel or pause it.', 'ऐसी एक चुनें जो मुश्किल से इस्तेमाल होती है, और उसे रद्द करें या रोकें।'), href: '/tracker/subscriptions', hrefLabel: l('Open subscriptions', 'सब्सक्रिप्शन खोलें') },
      { title: l('Find your biggest category', 'अपनी सबसे बड़ी मद ढूँढें'), body: l('Look at where most of your money goes this month.', 'देखें इस महीने ज़्यादातर पैसा कहाँ जाता है।'), href: '/tools/leak', hrefLabel: l('Open the leak finder', 'रिसाव खोजक खोलें'), reel: 'myths-money' },
      { title: l('Give it a limit', 'उसकी एक सीमा तय करें'), body: l('Set a monthly limit for that category that feels fair.', 'उस मद की एक मासिक सीमा तय करें जो आपको ठीक लगे।'), href: '/tracker/budget', hrefLabel: l('Open budget', 'बजट खोलें'), reel: 'needs-wants-wealth' },
      { title: l('Check the week', 'हफ़्ते का हाल देखें'), body: l('Compare this week’s spending with your limit.', 'इस हफ़्ते का ख़र्च अपनी सीमा से मिलाएँ।'), href: '/tracker/transactions', hrefLabel: l('Open transactions', 'लेन-देन खोलें') },
      { title: l('Pick one habit to change', 'बदलने के लिए एक आदत चुनें'), body: l('Choose one small habit to change next month, and write it down.', 'अगले महीने बदलने के लिए एक छोटी आदत चुनें और उसे लिख लें।') },
    ],
    end: l('You looked at where your money goes for seven days. Keep the limit, and check it once a week.', 'आपने सात दिन देखा कि पैसा कहाँ जाता है। सीमा रखें, और हफ़्ते में एक बार जाँचें।'),
  },
  {
    id: 'scam-proof-week', pillars: [],
    title: l('Scam-proof your phone in 7 days', '7 दिन में अपना फ़ोन ठगी-रोधी बनाएँ'),
    blurb: l('One small setting a day, so a scam call or message has less to work with.', 'हर दिन एक छोटी सेटिंग, ताकि ठगी वाले कॉल या मैसेज के पास कम मौक़ा रहे।'),
    days: [
      { title: l('Lock your payment apps', 'पेमेंट ऐप को लॉक करें'), body: l('Turn on the screen lock or PIN inside each payment app.', 'हर पेमेंट ऐप के अंदर स्क्रीन लॉक या PIN चालू करें।') },
      { title: l('Clear old links', 'पुराने लिंक हटाएँ'), body: l('Delete old messages with links you do not trust. Never click one that asks for KYC or an OTP.', 'जिन लिंक पर भरोसा नहीं, उनके पुराने मैसेज मिटाएँ। KYC या OTP माँगने वाले लिंक पर कभी क्लिक न करें।'), reel: 'fake-kyc-links' },
      { title: l('Set a payment limit', 'भुगतान की सीमा तय करें'), body: l('Set a daily limit in your payment apps or bank app that fits your normal use.', 'अपने पेमेंट ऐप या बैंक ऐप में रोज़ की ऐसी सीमा तय करें जो आपके आम इस्तेमाल से मेल खाए।') },
      { title: l('Turn on bank alerts', 'बैंक अलर्ट चालू करें'), body: l('Turn on an alert for every transaction on each account.', 'हर खाते में हर लेन-देन का अलर्ट चालू करें।'), reel: 'upi-collect-scam' },
      { title: l('Save the right numbers', 'सही नंबर सेव करें'), body: l('Save your bank’s official care number from its own app, and the national cybercrime helpline, 1930.', 'अपने बैंक के अपने ऐप से उसका आधिकारिक केयर नंबर, और राष्ट्रीय साइबर क्राइम हेल्पलाइन 1930 सेव करें।'), reel: 'fake-customer-care' },
      { title: l('Tell one person', 'एक व्यक्ति को बताएँ'), body: l('Tell a family member about the OTP and “digital arrest” scams.', 'परिवार के किसी सदस्य को OTP और “डिजिटल अरेस्ट” ठगी के बारे में बताएँ।'), reel: 'digital-arrest' },
      { title: l('Trim app permissions', 'ऐप की अनुमतियाँ घटाएँ'), body: l('Remove permissions, especially for messages and screen sharing, from apps that do not need them.', 'जिन ऐप को ज़रूरत नहीं, उनसे अनुमतियाँ हटाएँ, ख़ासकर मैसेज और स्क्रीन शेयर की।'), reel: 'phone-safety-checklist' },
    ],
    end: l('Your phone is a little harder to scam. Pause before every urgent message, and check in your bank’s own app.', 'आपका फ़ोन अब थोड़ा ज़्यादा ठगी-रोधी है। हर जल्दबाज़ी वाले मैसेज से पहले रुकें, और अपने बैंक के ही ऐप में जाँचें।'),
  },
  {
    id: 'know-your-numbers', pillars: ['investing', 'wealth'],
    title: l('Know your numbers in 7 days', '7 दिन में अपने आँकड़े जानें'),
    blurb: l('Record the five figures every other tool in the app reads: income, spending, emergency fund, SIP and loans.', 'वे पाँच आँकड़े दर्ज करें जिन्हें ऐप के बाक़ी टूल पढ़ते हैं: आय, ख़र्च, इमरजेंसी फ़ंड, SIP और लोन।'),
    days: [
      { title: l('Record your take-home pay', 'अपनी हाथ में आने वाली आय दर्ज करें'), body: l('Enter the amount that reaches your account each month, after tax.', 'हर महीने टैक्स के बाद खाते में जितना आता है, वह रकम भरें।'), href: '/tracker/budget', hrefLabel: l('Open budget', 'बजट खोलें'), reel: 'salary-slip-decoded' },
      { title: l('Note your monthly spending', 'महीने का ख़र्च लिखें'), body: l('Add up last month’s spending from your bank or UPI history and enter it.', 'अपने बैंक या UPI की हिस्ट्री से पिछले महीने का ख़र्च जोड़कर भरें।'), href: '/tracker/budget', hrefLabel: l('Open budget', 'बजट खोलें'), reel: 'needs-wants-wealth' },
      { title: l('Enter your emergency fund', 'इमरजेंसी फ़ंड की रकम भरें'), body: l('Enter the cash you could reach in a day. If it is zero, enter zero.', 'वह नकद भरें जो आप एक दिन में निकाल सकें। शून्य है तो शून्य भरें।'), href: '/tracker/emergency', hrefLabel: l('Open emergency fund', 'इमरजेंसी फ़ंड खोलें'), reel: 'emergency-target' },
      { title: l('Record your SIP, if you have one', 'SIP हो तो उसे दर्ज करें'), body: l('Add the SIP you already pay each month as a recurring entry. No SIP? Nothing to add today.', 'जो SIP आप पहले से हर महीने देते हैं, उसे आवर्ती एंट्री में जोड़ें। SIP नहीं है तो आज कुछ जोड़ना नहीं।'), href: '/tracker/recurring', hrefLabel: l('Open recurring entries', 'आवर्ती एंट्री खोलें'), reel: 'pay-yourself-first' },
      { title: l('List your loans', 'अपने लोन की सूची बनाएँ'), body: l('Enter the balance, rate and EMI of each loan. No loans? Enjoy a free day.', 'हर लोन की बकाया रकम, दर और EMI भरें। कोई लोन नहीं है? आज की छुट्टी।'), href: '/tools/debt', hrefLabel: l('Open debt payoff', 'क़र्ज़ चुकाना खोलें'), reel: 'good-bad-debt' },
      { title: l('See your net worth', 'अपनी नेट वर्थ देखें'), body: l('Look at what you own minus what you owe. It is only a starting line.', 'देखें आपके पास क्या है और कितना देना है। यह सिर्फ़ शुरुआती रेखा है।'), href: '/tracker/networth', hrefLabel: l('Open net worth', 'नेट वर्थ खोलें') },
      { title: l('Read your Money Score', 'अपना Money Score पढ़ें'), body: l('Open the score and read which of the six parts is lowest. Do not fix it today.', 'स्कोर खोलें और देखें छह में से कौन सा हिस्सा सबसे कम है। आज उसे सुधारना नहीं है।'), href: '/tools/score', hrefLabel: l('Open Money Score', 'Money Score खोलें'), reel: 'order-first-salary' },
    ],
    end: l('Your five core figures are now in the app, so every tool and reel can use your own numbers. Update them when something changes.', 'आपके पाँच मुख्य आँकड़े अब ऐप में हैं, इसलिए हर टूल और रील आपके अपने आँकड़े इस्तेमाल कर सकती है। कुछ बदले तो उन्हें अपडेट करें।'),
  },
  {
    id: 'first-fund-step', pillars: ['emergency'],
    title: l('Your first emergency-fund step', 'इमरजेंसी फ़ंड का पहला क़दम'),
    blurb: l('Seven small steps from “I have nothing set aside” towards a first month of cover. Any start counts.', 'सात छोटे क़दम: “कुछ अलग नहीं रखा” से पहले एक महीने के कवर की ओर। कोई भी शुरुआत गिनी जाती है।'),
    days: [
      { title: l('Add up your must-pay bills', 'ज़रूरी बिल जोड़ें'), body: l('Add up one month of rent, food, EMIs, bills and school fees. Skip the extras.', 'एक महीने का किराया, खाना, EMI, बिल और फ़ीस जोड़ें। फ़ालतू ख़र्च छोड़ दें।'), href: '/tracker/budget', hrefLabel: l('Open budget', 'बजट खोलें'), reel: 'emergency-target' },
      { title: l('See what you have set aside', 'देखें कितना अलग रखा है'), body: l('Enter your emergency fund balance and see how many months it covers.', 'इमरजेंसी फ़ंड की रकम भरें और देखें वह कितने महीने चलेगी।'), href: '/tracker/emergency', hrefLabel: l('Open emergency fund', 'इमरजेंसी फ़ंड खोलें'), reel: 'emergency-fund' },
      { title: l('Name a first target', 'पहला लक्ष्य तय करें'), body: l('Choose one month of must-pay bills as your first target. Six months can wait.', 'पहला लक्ष्य एक महीने के ज़रूरी बिल रखें। छह महीने बाद के लिए हैं।'), href: '/tracker/emergency', hrefLabel: l('Open emergency fund', 'इमरजेंसी फ़ंड खोलें'), reel: 'order-emergency-steps' },
      { title: l('Choose where it will sit', 'तय करें यह कहाँ रहेगा'), body: l('Read how a savings account and a liquid fund differ. Pick a place you can reach in a day.', 'पढ़ें कि बचत खाता और लिक्विड फ़ंड कैसे अलग हैं। ऐसी जगह चुनें जहाँ से एक दिन में रकम मिल सके।'), href: '/tracker/emergency', hrefLabel: l('Open emergency fund', 'इमरजेंसी फ़ंड खोलें'), reel: 'where-keep-fund' },
      { title: l('Pick a small amount', 'एक छोटी रकम चुनें'), body: l('Decide an amount you can set aside this month, even ₹500, and write it down.', 'इस महीने अलग रखने लायक़ रकम तय करें, ₹500 भी चलेगी, और उसे लिख लें।'), reel: 'pay-yourself-first' },
      { title: l('Move it', 'उसे अलग खाते में डालें'), body: l('In your bank app, move that amount to the place you chose. It is your own money, set apart.', 'अपने बैंक ऐप में वह रकम चुनी हुई जगह पर भेजें। यह आपका अपना पैसा है, बस अलग रखा है।'), reel: 'irregular-income-buffer' },
      { title: l('Update your balance', 'रकम अपडेट करें'), body: l('Enter the new balance in the app and read the months it now covers.', 'ऐप में नई रकम भरें और देखें अब वह कितने महीने चलेगी।'), href: '/tracker/emergency', hrefLabel: l('Open emergency fund', 'इमरजेंसी फ़ंड खोलें') },
    ],
    end: l('You named a target, picked a place and set something apart. Come back when the balance changes and see the months grow.', 'आपने लक्ष्य तय किया, जगह चुनी और कुछ अलग रखा। रकम बदले तो लौटें और बढ़ते महीने देखें।'),
  },
  {
    id: 'tax-ready-week', pillars: ['wealth', 'investing'], growth: true,
    title: l('Tax-ready in 7 days', '7 दिन में टैक्स के लिए तैयार'),
    blurb: l('See your regime, your deductions, your papers and your dates, so filing is not a last-week rush.', 'अपना रिजीम, कटौतियाँ, काग़ज़ और तारीख़ें देखें, ताकि रिटर्न भरना आख़िरी हफ़्ते की भागदौड़ न बने।'),
    days: [
      { title: l('Compare the two regimes', 'दोनों रिजीम की तुलना करें'), body: l('Enter your pay and see the old and new regime side by side.', 'अपनी आय भरें और पुराना व नया रिजीम साथ-साथ देखें।'), href: '/tools/tax', hrefLabel: l('Open tax savings', 'टैक्स बचत खोलें'), reel: 'tax-regimes' },
      { title: l('Check your 80C so far', '80C में अब तक का हिसाब देखें'), body: l('List what you already count under 80C, such as PF, tuition fees or a home-loan principal.', '80C में पहले से जो गिना जाता है उसे लिखें, जैसे PF, ट्यूशन फ़ीस या होम लोन का मूलधन।'), href: '/tools/taxplanner', hrefLabel: l('Open tax planner', 'टैक्स प्लानर खोलें'), reel: 'section-80c' },
      { title: l('List your proofs', 'अपने प्रमाण सूचीबद्ध करें'), body: l('Write down which papers you have: rent receipts, premium receipts, PF statement.', 'लिखें कौन से काग़ज़ आपके पास हैं: किराये की रसीद, प्रीमियम रसीद, PF स्टेटमेंट।'), href: '/tools/taxplanner', hrefLabel: l('Open tax planner', 'टैक्स प्लानर खोलें'), reel: 'tax-proofs-checklist' },
      { title: l('Find your Form 16 or AIS', 'Form 16 या AIS ढूँढें'), body: l('Ask HR for Form 16, or open your AIS on the income tax portal. Save a copy on your phone.', 'HR से Form 16 माँगें, या आयकर पोर्टल पर अपना AIS खोलें। एक कॉपी फ़ोन में रखें।'), reel: 'form-16-decoded' },
      { title: l('Mark the tax dates', 'टैक्स की तारीख़ें चिह्नित करें'), body: l('Look at the dates for advance tax and filing, and set a reminder for each.', 'अग्रिम कर और रिटर्न भरने की तारीख़ें देखें, और हर एक की याद दिलाएँ।'), href: '/tools/calendar', hrefLabel: l('Open calendar', 'कैलेंडर खोलें'), reel: 'tax-dates' },
      { title: l('Open the ITR prep kit', 'ITR तैयारी किट खोलें'), body: l('Look through the kit and note what is still missing. No need to file today.', 'किट देखें और लिखें अभी क्या कम है। आज रिटर्न भरना नहीं है।'), href: '/tools/itr', hrefLabel: l('Open the ITR prep kit', 'ITR किट खोलें'), reel: 'itr-which-form' },
      { title: l('Write one question', 'एक सवाल लिखें'), body: l('Write one tax question you want a qualified professional to answer, and keep it with your papers.', 'एक टैक्स सवाल लिखें जो आप किसी योग्य पेशेवर से पूछना चाहते हैं, और उसे अपने काग़ज़ों के साथ रखें।'), reel: 'myths-tax' },
    ],
    end: l('You know your regime, your papers and your dates. For your own case, ask a qualified tax professional.', 'आप अपना रिजीम, काग़ज़ और तारीख़ें जानते हैं। अपने मामले के लिए किसी योग्य टैक्स पेशेवर से पूछें।'),
  },
  {
    id: 'loan-checkup-week', pillars: ['debt'],
    title: l('Loan check-up in 7 days', '7 दिन में लोन का चेक-अप'),
    blurb: l('Look at every loan once, calmly: what you owe, what it costs and what you could ask.', 'हर लोन को एक बार शांति से देखें: कितना देना है, कितना महँगा है और क्या पूछ सकते हैं।'),
    days: [
      { title: l('List every loan', 'हर लोन की सूची बनाएँ'), body: l('Enter the balance, rate and EMI of each loan, including credit-card dues.', 'हर लोन की बकाया रकम, दर और EMI भरें, क्रेडिट कार्ड की बकाया भी।'), href: '/tools/debt', hrefLabel: l('Open debt payoff', 'क़र्ज़ चुकाना खोलें'), reel: 'good-bad-debt' },
      { title: l('See your EMI share', 'EMI का हिस्सा देखें'), body: l('Divide all your EMIs by your take-home pay. Just look at the share.', 'अपनी सभी EMI को हाथ में आने वाली आय से भाग दें। बस यह हिस्सा देखें।'), href: '/tools/debt', hrefLabel: l('Open debt payoff', 'क़र्ज़ चुकाना खोलें'), reel: 'emi-trap' },
      { title: l('Find the costliest rate', 'सबसे महँगी दर ढूँढें'), body: l('Mark which loan has the highest interest rate. It costs you the most per rupee.', 'देखें किस लोन की ब्याज दर सबसे ज़्यादा है। वह हर रुपये पर सबसे महँगा पड़ता है।'), href: '/tools/debt', hrefLabel: l('Open debt payoff', 'क़र्ज़ चुकाना खोलें'), reel: 'myths-loans' },
      { title: l('Check your credit score', 'अपना क्रेडिट स्कोर देखें'), body: l('See where your score stands and what it does to the rate you are offered.', 'देखें आपका स्कोर कहाँ है और मिलने वाली दर पर उसका क्या असर होता है।'), href: '/tools/credit', hrefLabel: l('Open credit score', 'क्रेडिट स्कोर खोलें'), reel: 'credit-score-basics' },
      { title: l('Try one prepay what-if', 'प्रीपेमेंट का एक “क्या हो अगर” देखें'), body: l('Try a small extra payment in the tool and read the result. It is only a look; nothing to do.', 'टूल में थोड़ी अतिरिक्त किस्त आज़माएँ और नतीजा पढ़ें। यह बस देखना है; कुछ करना नहीं।'), href: '/tools/prepay', hrefLabel: l('Open the prepay tool', 'प्रीपेमेंट टूल खोलें'), reel: 'home-loan-prepay' },
      { title: l('Read the prepayment terms', 'प्रीपेमेंट की शर्तें पढ़ें'), body: l('In your loan papers or lender app, find whether a prepayment fee applies.', 'अपने लोन के काग़ज़ों या लेंडर के ऐप में देखें कि प्रीपेमेंट शुल्क लगता है या नहीं।'), reel: 'home-loan-costs' },
      { title: l('Write one question for the lender', 'लेंडर के लिए एक सवाल लिखें'), body: l('For example: is my rate floating, and how do I see the schedule? Keep it for your next call.', 'जैसे: मेरी दर फ़्लोटिंग है क्या, और भुगतान का शेड्यूल कहाँ दिखेगा? इसे अगली कॉल के लिए रखें।'), reel: 'floating-vs-fixed' },
    ],
    end: l('You have looked at every loan, its cost and its terms once. Do it again whenever a rate changes.', 'आपने हर लोन, उसकी लागत और शर्तें एक बार देख लीं। दर बदले तो फिर देखें।'),
  },
  {
    id: 'insurance-basics-week', pillars: ['insurance'],
    title: l('Insurance basics in 7 days', '7 दिन में बीमा की बुनियाद'),
    blurb: l('Find out what cover you have, what is missing and what to ask. No policy is recommended here.', 'जानें आपके पास कौन सा कवर है, क्या कम है और क्या पूछना है। यहाँ कोई पॉलिसी सुझाई नहीं जाती।'),
    days: [
      { title: l('List the cover you have', 'अपना मौजूदा कवर लिखें'), body: l('Add each policy you have: health, life, motor. Include cover from your employer.', 'अपनी हर पॉलिसी जोड़ें: स्वास्थ्य, जीवन, गाड़ी। नियोक्ता वाला कवर भी लिखें।'), href: '/tracker/insurance', hrefLabel: l('Open insurance tracker', 'बीमा ट्रैकर खोलें'), reel: 'insurance-basics' },
      { title: l('Note the renewal dates', 'नवीनीकरण की तारीख़ें लिखें'), body: l('Write each policy’s renewal date so none lapses by surprise.', 'हर पॉलिसी की नवीनीकरण तारीख़ लिखें, ताकि कोई अचानक बंद न हो।'), href: '/tracker/insurance', hrefLabel: l('Open insurance tracker', 'बीमा ट्रैकर खोलें'), reel: 'health-cover-gotchas' },
      { title: l('Read your health cover', 'अपना स्वास्थ्य कवर पढ़ें'), body: l('Find the sum insured, waiting periods and room-rent limit in your policy.', 'अपनी पॉलिसी में बीमा राशि, प्रतीक्षा अवधि और कमरे के किराये की सीमा देखें।'), href: '/insurance/compare', hrefLabel: l('Open the comparison', 'तुलना खोलें'), reel: 'super-top-up' },
      { title: l('See how much life cover fits', 'देखें जीवन बीमा कितना बैठता है'), body: l('Enter your figures and read how much term cover two standard methods suggest.', 'अपने आँकड़े भरें और देखें दो मानक तरीक़ों से कितना टर्म कवर बनता है।'), href: '/tools/lifecover', hrefLabel: l('Open life cover', 'लाइफ़ कवर खोलें'), reel: 'life-cover' },
      { title: l('Check each nominee', 'हर नॉमिनी जाँचें'), body: l('Check that each policy and account has a nominee, and that the name is current.', 'जाँचें कि हर पॉलिसी और खाते में नॉमिनी है और नाम अभी का है।'), reel: 'nominee-basics' },
      { title: l('Keep claim details handy', 'क्लेम की जानकारी पास रखें'), body: l('Save policy numbers and the insurer’s claim helpline where a family member can find them.', 'पॉलिसी नंबर और बीमाकर्ता की क्लेम हेल्पलाइन ऐसी जगह रखें जहाँ परिवार का कोई सदस्य पा सके।'), reel: 'insurance-claim-steps' },
      { title: l('Write one question to ask', 'पूछने के लिए एक सवाल लिखें'), body: l('Open the hub, pick one kind of cover, and write one question to ask your insurer or advisor.', 'हब खोलें, एक तरह का कवर चुनें, और अपने बीमाकर्ता या सलाहकार से पूछने का एक सवाल लिखें।'), href: '/insurance', hrefLabel: l('Open the insurance hub', 'बीमा हब खोलें'), reel: 'myths-insurance' },
    ],
    end: l('You know what you have, what is missing and what to ask. Bring the question to a licensed advisor or your insurer.', 'आप जानते हैं क्या है, क्या कम है और क्या पूछना है। वह सवाल किसी लाइसेंसधारी सलाहकार या बीमाकर्ता से पूछें।'),
  },
  {
    id: 'subscription-sweep', pillars: ['savings'],
    title: l('Sweep your subscriptions in 7 days', '7 दिन में अपनी सब्सक्रिप्शन साफ़ करें'),
    blurb: l('Find every automatic payment, see which ones you use, and cancel one.', 'हर ऑटोमैटिक भुगतान ढूँढें, देखें कौन सा काम आता है, और एक रद्द करें।'),
    days: [
      { title: l('Open your autopay lists', 'अपनी ऑटोपे सूचियाँ खोलें'), body: l('In your UPI and bank apps, open the autopay or mandate list and note every item.', 'अपने UPI और बैंक ऐप में ऑटोपे या मैंडेट की सूची खोलें और हर मद लिख लें।'), reel: 'lifestyle-creep' },
      { title: l('Add them to the tracker', 'उन्हें ट्रैकर में जोड़ें'), body: l('Add each one with its monthly cost and renewal date.', 'हर एक को उसकी मासिक लागत और नवीनीकरण तारीख़ के साथ जोड़ें।'), href: '/tracker/subscriptions', hrefLabel: l('Open subscriptions', 'सब्सक्रिप्शन खोलें') },
      { title: l('Check last month’s card bill', 'पिछले महीने का कार्ड बिल देखें'), body: l('Scan your card statement for small repeating charges you missed.', 'कार्ड स्टेटमेंट में बार-बार लगने वाले छोटे शुल्क ढूँढें जो छूट गए हों।'), reel: 'no-cost-emi' },
      { title: l('Ask: did I use it?', 'पूछें: क्या इस्तेमाल किया?'), body: l('Mark each one as used this month or not.', 'हर एक पर निशान लगाएँ कि इस महीने इस्तेमाल हुई या नहीं।'), href: '/tracker/subscriptions', hrefLabel: l('Open subscriptions', 'सब्सक्रिप्शन खोलें') },
      { title: l('Cancel or pause one', 'एक रद्द करें या रोकें'), body: l('Choose the least used one and cancel or pause it in its own app or in your bank’s mandate list.', 'सबसे कम इस्तेमाल वाली चुनें और उसके अपने ऐप या बैंक की मैंडेट सूची में रद्द करें या रोकें।'), href: '/tracker/subscriptions', hrefLabel: l('Open subscriptions', 'सब्सक्रिप्शन खोलें') },
      { title: l('Check for free trials', 'फ़्री ट्रायल जाँचें'), body: l('Look at upcoming renewals for a free trial about to turn paid.', 'आने वाले नवीनीकरण देखें कि कोई फ़्री ट्रायल पैसे वाला तो नहीं बनने वाला।'), href: '/tools/calendar', hrefLabel: l('Open calendar', 'कैलेंडर खोलें') },
      { title: l('See what it saves in a year', 'देखें साल में कितना बचता है'), body: l('Multiply what you cancelled by twelve, and look at where else money slips out.', 'जो रद्द की उसकी लागत को बारह से गुणा करें, और देखें पैसा और कहाँ से निकलता है।'), href: '/tools/leak', hrefLabel: l('Open the leak finder', 'रिसाव खोजक खोलें'), reel: 'cash-flow' },
    ],
    end: l('You found your automatic payments and cancelled or paused one. Check the list again every few months.', 'आपने अपने ऑटोमैटिक भुगतान ढूँढे और एक रद्द या स्थगित की। हर कुछ महीने में सूची फिर देखें।'),
  },
];

export const challengeById = (id: string): Challenge | undefined => CHALLENGES.find(c => c.id === id);

// ── the person's progress ─────────────────────────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  /** The day (YYYY-MM-DD) it was started. */
  start: string;
  /** The calendar day each finished task was marked done, in order: done[0] is task 1. */
  done: string[];
}
export interface ChallengeState { v: 1; runs: Run[] }
export const EMPTY_CHALLENGES: ChallengeState = { v: 1, runs: [] };

/** A run with no progress for this many days is dropped, so an old abandoned one never lingers. */
export const STALE_DAYS = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseChallenges(raw: string | null | undefined): ChallengeState {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value) || !Array.isArray((p.value as { runs?: unknown }).runs)) return { v: 1, runs: [] };
  const runs: Run[] = [];
  for (const r of (p.value as { runs: unknown[] }).runs) {
    if (!isPlainObject(r)) continue;
    const o = r as { id?: unknown; start?: unknown; done?: unknown };
    const c = typeof o.id === 'string' ? challengeById(o.id) : undefined;
    if (!c || typeof o.start !== 'string' || !DAY.test(o.start) || !Number.isFinite(dayNum(o.start)) || !Array.isArray(o.done)) continue;
    const done: string[] = [];
    for (const d of o.done) { if (typeof d === 'string' && DAY.test(d) && Number.isFinite(dayNum(d)) && done.length < c.days.length && (done.length === 0 || dayNum(d) > dayNum(done[done.length - 1]))) done.push(d); }
    if (!runs.some(x => x.id === c.id)) runs.push({ id: c.id, start: o.start, done });
  }
  return { v: 1, runs };
}

export const runOf = (s: ChallengeState, id: string): Run | undefined => s.runs.find(r => r.id === id);
export const isFinished = (r: Run): boolean => { const c = challengeById(r.id); return !!c && r.done.length >= c.days.length; };

export interface Today {
  /** 0-based index of the next task to do. */
  index: number;
  /** False when a task was already marked done today: the next one waits for tomorrow. */
  available: boolean;
  finished: boolean;
}

export function todayOf(r: Run, now: Date): Today {
  const c = challengeById(r.id);
  const finished = !!c && r.done.length >= c.days.length;
  const doneToday = r.done.length > 0 && r.done[r.done.length - 1] === dayKey(now);
  return { index: Math.min(r.done.length, (c?.days.length ?? 1) - 1), available: !finished && !doneToday, finished };
}

/** Starts a challenge (or restarts a finished or stale one). Starting one that is in progress changes nothing. */
export function startChallenge(s: ChallengeState, id: string, now: Date): ChallengeState {
  const c = challengeById(id);
  if (!c) return s;
  const cur = runOf(s, id);
  if (cur && !isFinished(cur) && !isStale(cur, now)) return s;
  return { v: 1, runs: [...s.runs.filter(r => r.id !== id), { id, start: dayKey(now), done: [] }] };
}

/** Marks the next task done for today. At most one a day; nothing changes if today's task is already done or the challenge is finished. */
export function completeToday(s: ChallengeState, id: string, now: Date): ChallengeState {
  const cur = runOf(s, id);
  if (!cur) return s;
  const t = todayOf(cur, now);
  if (!t.available) return s;
  return { v: 1, runs: s.runs.map(r => (r.id === id ? { ...r, done: [...r.done, dayKey(now)] } : r)) };
}

/** The last day anything happened in a run. */
const lastDay = (r: Run): string => (r.done.length ? r.done[r.done.length - 1] : r.start);
export const isStale = (r: Run, now: Date): boolean => !isFinished(r) && dayNum(dayKey(now)) - dayNum(lastDay(r)) > STALE_DAYS;

/** Drops runs nobody has touched for a month. */
export const pruneStale = (s: ChallengeState, now: Date): ChallengeState => { const runs = s.runs.filter(r => !isStale(r, now)); return runs.length === s.runs.length ? s : { v: 1, runs }; };

// ── links to My moves ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A pledged reel ("I'll do this") whose tool is the same screen as this task and whose move can be tracked (it has a figure, see `METRIC_OF`),
 * and that is not already started. The screen offers it as a button; only the person's tap calls the moves API. Nothing is started silently.
 */
export function pledgeToStart(day: ChallengeDay, pledgedIds: readonly string[], actHref: (reelId: string) => string | undefined, startedIds: Iterable<string> = []): string | null {
  if (!day.href) return null;
  const started = new Set(startedIds);
  return pledgedIds.find(id => !started.has(id) && METRIC_OF[id] !== undefined && actHref(id) === day.href) ?? null;
}

// ── which challenge fits this person ──────────────────────────────────────────────────────────────────────────

export interface Suggestion { id: string; /** the words for a button, in both languages */ label: L }

/** A pillar scoring below this is worth a nudge; at or above it nothing is suggested for that pillar. */
export const WEAK_PILLAR = 70;

/**
 * At most one challenge that fits the person, or null. Pure.
 * - Nothing the person already has (in progress, or finished) is suggested again; a run untouched for a month does not count.
 * - The pillars below WEAK_PILLAR are tried weakest first (the saved weakest wins a tie), and the first challenge that speaks to one is chosen;
 *   among several, one whose tasks link a reel the person pledged is preferred.
 * - With no Money Score at all, the gentle first one ("Know your numbers") is suggested.
 * - Under money strain a challenge marked `growth` (one that reads as "put in more") is never suggested.
 */
export function suggestChallenge(profile: ReelsProfile, signals: Pick<Signals, 'pillars' | 'weakest' | 'strain' | 'now'>, state: ChallengeState): Suggestion | null {
  const taken = new Set(state.runs.filter(r => isFinished(r) || !isStale(r, signals.now)).map(r => r.id));
  const open = CHALLENGES.filter(c => !taken.has(c.id) && !(signals.strain && c.growth));
  const scored = (Object.entries(signals.pillars) as [PillarId, number][]).filter(([, v]) => Number.isFinite(v) && v < WEAK_PILLAR);
  const order: PillarId[] = scored.sort((a, b) => a[1] - b[1] || Number(b[0] === signals.weakest) - Number(a[0] === signals.weakest)).map(([p]) => p);
  if (!order.length && signals.weakest && !Object.keys(signals.pillars).length) order.push(signals.weakest);
  const pledged = new Set((profile.pledges ?? []).map(p => p.id));
  let pick: Challenge | undefined;
  for (const p of order) {
    const fits = open.filter(c => c.pillars.includes(p));
    pick = fits.find(c => c.days.some(d => d.reel && pledged.has(d.reel))) ?? fits[0];
    if (pick) break;
  }
  if (!pick && !Object.keys(signals.pillars).length && !signals.weakest) pick = open.find(c => c.id === 'know-your-numbers');
  return pick ? { id: pick.id, label: { en: `Try a 7-day challenge: ${pick.title.en}`, hi: `7 दिन की चुनौती आज़माएँ: ${pick.title.hi}` } } : null;
}
