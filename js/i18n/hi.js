/**
 * Hindi (हिन्दी) — shared interface vocabulary.
 * Keys are the exact English strings used in the UI. Finance terms that Indian users commonly say in English
 * (SIP, FD, ITR, EMI, NPS, PPF …) are left as they are on purpose.
 * ⚠ Needs review by a native speaker before wide release — tone and term choices are a first pass.
 */
FinosI18n.register('hi', {
  /* navigation */
  'Home': 'होम', 'Dashboard': 'डैशबोर्ड', 'Learn': 'सीखें', 'Mindset': 'मानसिकता', 'Diagnostics': 'डायग्नोस्टिक्स',
  'Track': 'ट्रैक', 'Markets': 'बाज़ार', 'Tools': 'टूल्स', 'News': 'समाचार', 'Settings': 'सेटिंग्स',
  'Calculators': 'कैलकुलेटर', 'Portfolio': 'पोर्टफोलियो', 'Tax': 'टैक्स', 'Profile': 'प्रोफ़ाइल',
  'Search or jump to…': 'खोजें या कहीं भी जाएँ…', 'Financial OS': 'फ़ाइनेंशियल OS', 'Arya AI': 'आर्या AI',
  'Online · Ask anything': 'ऑनलाइन · कुछ भी पूछें', 'GROW': 'आगे बढ़ें', 'INVEST': 'निवेश', 'EXPLORE': 'खोजें',
  'Back to Track Finances': 'ट्रैक फ़ाइनेंस पर वापस', 'Track Finances': 'फ़ाइनेंस ट्रैक करें',

  /* pages & sections */
  'Net Worth': 'नेट वर्थ', 'Retirement Planner': 'रिटायरमेंट प्लानर', 'Financial Calendar': 'वित्तीय कैलेंडर',
  'Insurance Hub': 'बीमा हब', 'Budget Forecast': 'बजट पूर्वानुमान', 'Credit Score Tracker': 'क्रेडिट स्कोर ट्रैकर',
  'Emergency Fund Tracker': 'आपातकालीन निधि ट्रैकर', 'Goal Optimizer': 'लक्ष्य ऑप्टिमाइज़र', 'Gold Tracker': 'सोना ट्रैकर',
  'Home Loan EMI Planner': 'होम लोन EMI प्लानर', 'Debt Optimizer': 'कर्ज़ ऑप्टिमाइज़र', 'Crypto Tracker': 'क्रिप्टो ट्रैकर',
  'Overview': 'सारांश', 'Corpus Builder': 'कॉर्पस निर्माण', 'Income Model': 'आय मॉडल', 'Success Odds': 'सफलता की संभावना',
  'Asset Breakdown': 'संपत्ति विवरण', 'FIRE Progress': 'FIRE प्रगति', 'Growth Timeline': 'विकास समयरेखा',
  'Total Net Worth': 'कुल नेट वर्थ', 'Total Assets': 'कुल संपत्ति', 'Total Liabilities': 'कुल देनदारियाँ',
  'Asset Allocation': 'संपत्ति आवंटन', 'Income': 'आय', 'Expenses': 'खर्च', 'Savings': 'बचत', 'Savings Rate': 'बचत दर',
  'Health Score': 'हेल्थ स्कोर', 'Goals': 'लक्ष्य', 'Insurance': 'बीमा', 'Investments': 'निवेश', 'Loans': 'ऋण',
  'Emergency Fund': 'आपातकालीन निधि', 'Since your last visit': 'पिछली बार के बाद से', 'Recommended for you': 'आपके लिए सुझाव',
  'Priority Alerts': 'ज़रूरी अलर्ट',

  /* net worth / balance sheet */
  'Assets': 'संपत्तियाँ', 'Liabilities': 'देनदारियाँ', 'Equity': 'इक्विटी', 'Mutual Funds': 'म्यूचुअल फ़ंड',
  'Fixed Income': 'फ़िक्स्ड इनकम', 'Gold / SGB': 'सोना / SGB', 'Real Estate': 'रियल एस्टेट', 'Crypto': 'क्रिप्टो',
  'Savings / Cash': 'बचत / नकद', 'Other Assets': 'अन्य संपत्तियाँ', 'Home Loan': 'होम लोन', 'Car Loan': 'कार लोन',
  'Personal Loan': 'पर्सनल लोन', 'Credit Card': 'क्रेडिट कार्ड', 'Other Liabilities': 'अन्य देनदारियाँ',
  'Connected Trackers': 'जुड़े हुए ट्रैकर', 'Asset Allocation': 'संपत्ति आवंटन', 'Mutual Funds (SIP)': 'म्यूचुअल फ़ंड (SIP)',
  'Mutual Funds (imported)': 'म्यूचुअल फ़ंड (इम्पोर्टेड)', 'Equity (Zerodha / import)': 'इक्विटी (Zerodha / इम्पोर्ट)',

  /* budgets */
  "This month's budgets": 'इस महीने के बजट', 'Suggest budgets from my spending': 'मेरे खर्च के आधार पर बजट सुझाएँ',
  'Re-suggest from spending': 'खर्च से दोबारा सुझाएँ', '+ Add category': '+ श्रेणी जोड़ें', 'On track': 'ठीक चल रहा है', 'Watch': 'ध्यान दें',
  'Over': 'सीमा से ऊपर', 'No limit set': 'कोई सीमा तय नहीं', 'Food & Dining': 'खाना-पीना', 'Groceries': 'किराना', 'Transport': 'परिवहन',
  'Shopping': 'ख़रीदारी', 'Bills & Utilities': 'बिल और उपयोगिताएँ', 'Housing': 'आवास / किराया', 'EMI & Loans': 'EMI और ऋण',
  'Subscriptions': 'सब्सक्रिप्शन', 'Health': 'स्वास्थ्य', 'Entertainment': 'मनोरंजन', 'Education': 'शिक्षा', 'Travel': 'यात्रा', 'Other': 'अन्य',

  /* settings */
  'Account & Security': 'खाता और सुरक्षा', 'Appearance': 'दिखावट', 'Complexity Mode': 'जटिलता मोड', 'AI System': 'AI सिस्टम',
  'Display Preferences': 'डिस्प्ले पसंद', 'Accessibility': 'सुलभता', 'Notifications': 'सूचनाएँ', 'Data & Privacy': 'डेटा और गोपनीयता',
  'About FIN•OS': 'FIN•OS के बारे में', 'Daily Brief': 'दैनिक सारांश', 'Market Alerts': 'बाज़ार अलर्ट', 'Goal Nudges': 'लक्ष्य रिमाइंडर',
  'Due-Date Reminders': 'देय तिथि रिमाइंडर', 'Install FIN•OS': 'FIN•OS इंस्टॉल करें', 'Install app': 'ऐप इंस्टॉल करें',
  'Export My Data': 'मेरा डेटा एक्सपोर्ट करें', 'Export JSON': 'JSON एक्सपोर्ट', 'Import JSON': 'JSON इम्पोर्ट',
  'Restore From Backup': 'बैकअप से पुनर्स्थापित करें', 'Clear Cache': 'कैश साफ़ करें', 'Clear DNA': 'DNA साफ़ करें',
  'Interface Language': 'इंटरफ़ेस भाषा', 'Language': 'भाषा', 'Theme': 'थीम', 'Dark': 'डार्क', 'Light': 'लाइट',
  'Import holdings (CSV)': 'होल्डिंग्स इम्पोर्ट करें (CSV)', 'Import holdings': 'होल्डिंग्स इम्पोर्ट करें',

  /* common actions */
  'Save': 'सहेजें', 'Cancel': 'रद्द करें', 'Add': 'जोड़ें', 'Delete': 'हटाएँ', 'Edit': 'संपादित करें', 'Close': 'बंद करें',
  'Calculate': 'गणना करें', 'Reset': 'रीसेट', 'Next': 'आगे', 'Back': 'पीछे', 'Done': 'पूरा हुआ', 'Apply': 'लागू करें',
  'Search': 'खोजें', 'Send': 'भेजें', 'Submit': 'जमा करें', 'Download': 'डाउनलोड', 'Upload': 'अपलोड', 'Refresh': 'रिफ़्रेश',
  'Yes': 'हाँ', 'No': 'नहीं', 'Loading…': 'लोड हो रहा है…', 'Loading...': 'लोड हो रहा है...', 'View details': 'विवरण देखें',
  'See all': 'सभी देखें', 'Learn more': 'और जानें', 'Try again': 'फिर कोशिश करें', 'Dismiss': 'हटाएँ',
  'Skip to main content': 'मुख्य सामग्री पर जाएँ', 'Send message': 'संदेश भेजें', 'Your question': 'आपका प्रश्न',

  /* calculators (common labels) */
  'Monthly Investment (₹)': 'मासिक निवेश (₹)', 'Expected Return Rate (p.a %)': 'अपेक्षित रिटर्न दर (वार्षिक %)',
  'Time Period (Years)': 'अवधि (वर्ष)', 'Investment Details': 'निवेश विवरण', 'Loan Amount (₹)': 'ऋण राशि (₹)',
  'Interest Rate (p.a %)': 'ब्याज दर (वार्षिक %)', 'Loan Tenure (Years)': 'ऋण अवधि (वर्ष)',
  'Total Invested': 'कुल निवेश', 'Estimated Returns': 'अनुमानित रिटर्न', 'Total Value': 'कुल मूल्य',
  'Monthly EMI': 'मासिक EMI', 'Total Interest': 'कुल ब्याज', 'Total Payment': 'कुल भुगतान',
});
