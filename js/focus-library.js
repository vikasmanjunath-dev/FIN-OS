/**
 * FIN-OS FOCUS LIBRARY (PRODUCTION V2)
 * Total Cards: 150 (30 per DNA trait across 3 age protocols)
 */
const focusLibrary = {
    rookie: { // Age 18-24 (Focus: Habits & Human Capital)
        Risk: [
            { t: "Beta Testing", p: "Your human capital is high. Volatility is your friend. Research a Nifty 50 Index Fund today." },
            { t: "The Hybrid Move", p: "Balance fear with a 'Low Volatility' ETF. It keeps you in the game during market crashes." },
            { t: "Small Stakes, Big Lessons", p: "Losses today are tuition fees. Invest ₹1000 in a sector you follow to learn how markets breathe." },
            { t: "The 'Sleep Well' Test", p: "If checking your portfolio makes you sweat at ₹10k, you won't handle ₹10Cr. Train your nerves now." },
            { t: "Leverage Warning", p: "Avoid F&O. You are here to build a base, not gamble your starting capital on 10x dreams." },
            { t: "Portfolio Beta", p: "Calculate if your stocks move faster than the Nifty. High risk should mean higher long-term rewards." },
            { t: "The Crypto Filter", p: "Crypto is 5% of a portfolio, not 100%. Don't bet your survival on a single meme-coin." },
            { t: "Demat Audit", p: "Check your brokerage charges. For a Rookie, high transaction fees are a silent growth killer." },
            { t: "Position Sizing", p: "Don't put all your eggs in one stock. Diversification is the only 'free lunch' in finance." },
            { t: "The Exit Mindset", p: "Know why you bought. If the reason changes, sell. Never 'marry' a risky investment." }
        ],
        Growth: [
            { t: "Compounding 101", p: "At 20, every ₹1,000 is worth ~₹20k by retirement. You're buying 'time-travel' units." },
            { t: "The Skill Equity", p: "Your greatest asset isn't a stock; it's your skills. Spend 1 hour today learning a high-value trade." },
            { t: "Nifty 50 Protocol", p: "The simplest path: Buy the 50 biggest companies in India. It's the ultimate 'Thali' of growth." },
            { t: "Expense Ratio Check", p: "A 1% fee eats 30% of your wealth over 30 years. Switch to 'Direct' plans today." },
            { t: "The Side-Hustle Fund", p: "Use your growth DNA to start a small project. Let your first ₹10k profit be your first investment." },
            { t: "ETF Deep Dive", p: "Understand Tracking Error. If your fund lags the index, your growth is leaking. Fix the pipe." },
            { t: "Sectoral Bets", p: "Tech or Pharma? Pick one sector you understand and learn how it cycles. Growth requires knowledge." },
            { t: "Dividend Reinvestment", p: "Don't spend the tiny dividends you get. Reinvest them automatically to trigger the flywheel." },
            { t: "The 10% Rule", p: "Invest 10% of every gift or 'pocket money' you receive. Build the 'Owner' identity early." },
            { t: "Alpha Hunting", p: "Look for companies with 'Moats'. Growth is sustainable only when the company has a secret sauce." }
        ],
        Discipline: [
            { t: "Habit > Amount", p: "Even ₹500/month builds the 'Investor Brain.' Set an auto-debit today to make it non-negotiable." },
            { t: "The Boring Edge", p: "While others chase hype, your steady SIP in a Nifty 50 ETF is building a silent fortress." },
            { t: "Auto-Debit Synergy", p: "Set your investment date to the 1st of every month. Pay your future self before the pizza shops." },
            { t: "Noise Cancellation", p: "The market is shouting; your plan is 10 years long. Delete the trading app for today." },
            { t: "The Savings Tank", p: "Treat your savings like air. You need a 3-month buffer before you can even think about luxury." },
            { t: "Subscription Audit", p: "That ₹299 app you don't use is worth ₹50k in 20 years. Cancel the dead weight today." },
            { t: "The Budget OS", p: "Track your 'Needs vs Wants' for 24 hours. Awareness is the first step to financial discipline." },
            { t: "Consistency Badge", p: "You haven't missed a SIP in 3 months. This streak is more valuable than your current balance." },
            { t: "The 'No' Power", p: "Practice saying no to one social expense today. That 'No' is a 'Yes' to your 30-year-old self." },
            { t: "Long-term Vision", p: "Look at a 20-year stock chart. Notice how the 'crashes' look like tiny bumps. Stay focused." }
        ],
        Status: [
            { t: "The Ghost Wealth", p: "Wealth is the money you DON'T spend. Don't match your peers' Instagram lives with debt." },
            { t: "Brand vs Equity", p: "Buying the product makes you a consumer; buying the stock makes you an owner. Choose wisely." },
            { t: "The iPhone Math", p: "A ₹1.2L phone on EMI costs you ₹5L in lost growth. Is the camera worth 3 years of freedom?" },
            { t: "Peer Pressure Filter", p: "If you're buying it to show off, you can't afford it. Status is a game with no winners." },
            { t: "Invisible Luxury", p: "The true flex is having a bank balance that allows you to quit a job you hate. Focus on that." },
            { t: "The 'Sharma-ji' Tax", p: "Stop comparing your Chapter 1 to someone else's Chapter 20. Your DNA is unique." },
            { t: "Appreciation Audit", p: "Sneakers lose value; Stocks gain value. Shift your 'Collection' focus to assets today." },
            { t: "The Sales Trap", p: "50% off is still 100% spent. Don't let marketing dictate your financial DNA." },
            { t: "Quality > Quantity", p: "Buy one good thing that lasts 5 years rather than 5 cheap things that last 1 year." },
            { t: "Net Worth Privacy", p: "Don't talk about your money. Let your lifestyle be humble and your portfolio be loud." }
        ],
        Security: [
            { t: "The Safety Net", p: "A 6-month emergency fund is your 'permission slip' to take big career risks later. Start it today." },
            { t: "Opportunity Cost", p: "Hoarding cash feels safe, but inflation is eating it. Look into Liquid Funds for better safety." },
            { t: "Gold Protocol", p: "Don't buy jewelry for safety. Research Digital Gold or SGBs—they pay you to hold them." },
            { t: "Health Shield", p: "Your parents' health insurance is not enough. Get a base cover for yourself while you are young/cheap." },
            { t: "FD Reality Check", p: "Is your FD beating inflation? If it's 6% and milk prices rose 8%, you are losing money safely." },
            { t: "The 'Rainy Day' Logic", p: "Security isn't about being rich; it's about not being helpless. Build your fortress brick by brick." },
            { t: "Cyber Safety", p: "Use a dedicated email for finance. Security starts with your digital footprint." },
            { t: "The Nominee Task", p: "Ensure every account has a nominee. Security is protecting those who depend on you." },
            { t: "Cash is King?", p: "Cash is only king if you use it to buy assets when they are on sale. Otherwise, it's a melting ice cube." },
            { t: "Fixed Income Basics", p: "Learn about Debt Funds. They are the 'Stable Ground' of your financial operating system." }
        ]
    },
    grinder: { // Age 25-45 (Focus: Efficiency & Leverage)
       // Add 10 cards for each trait here following the Grinder Logic
       Risk: [
            { t: "The 20% Rule", p: "If the market drops 20%, do you have cash ready? Keep your 'Buy the Dip' fund in a Liquid Fund." },
            { t: "Smart Beta Edge", p: "Look beyond simple indexing. Momentum ETFs (MOM30) help you ride trends automatically." },
            { t: "Portfolio Rebalancing", p: "If your equity grew to 80% due to a bull run, sell some and move back to 60%. Lock in gains." },
            { t: "Hedged Growth", p: "Use Gold as a 10% hedge. When stocks crash, gold usually shines. It's your portfolio's stabilizer." },
            { t: "The Sector Rotation", p: "Don't get stuck in yesterday's winners. Cycles change. Audit your sectoral exposure today." },
            { t: "Active vs Passive", p: "If your mutual fund isn't beating the index after fees, fire it. Switch to a low-cost ETF." },
            { t: "Concentrated Bets", p: "Conviction pays. If you understand a business deeply, it might be worth a 10% 'Satellite' position." },
            { t: "The Volatility Buffer", p: "Ensure your EMIs are less than 30% of your income. High debt makes volatility unbearable." },
            { t: "International Diversification", p: "Don't bet only on India. Add US Tech exposure to hedge against currency devaluation." },
            { t: "Tax-Harvesting", p: "Sell losing stocks to offset gains and save on LTCG tax. Efficiency is a form of growth." }
       ],
       Security: [
            { t: "Insurance ≠ Investment", p: "Stop mixing emotions with math. Buy Term Insurance for protection and Equity for growth." },
            { t: "The Debt Snowball", p: "Credit card debt is a 42% leak. Kill the 'Ugly Debt' today before trying to build wealth." },
            { t: "Emergency Fund 2.0", p: "With a family, you need 12 months of expenses. Buffer for job loss AND medical emergencies." },
            { t: "Critical Illness Shield", p: "A hospital bill shouldn't break your portfolio. Upgrade your health cover with a 'Super Top-up'." },
            { t: "Sovereign Gold (SGB)", p: "The best way to hold gold for security. 2.5% interest + tax-free gains. Pure security." },
            { t: "Home Loan Logic", p: "Don't rush to prepay a 8% loan if you can earn 12% in Equity. Math over emotion." },
            { t: "The 'Hisaab' Habit", p: "Review your net worth once a quarter. Security comes from knowing exactly where you stand." },
            { t: "EPF/PPF Synergy", p: "Maximize your tax-free debt. It's the 'Fixed' anchor of your mid-life portfolio." },
            { t: "Nominee Verification", p: "Check your bank and demat nominees. Security is making things easy for your loved ones." },
            { t: "The Trust Factor", p: "Consider a family trust if your assets are complex. Protect your wealth from legal leaks." }
       ],
       Status: [
            { t: "The Lifestyle Trap", p: "A bigger house you live in is a liability, not an asset. Does this upgrade serve you or your ego?" },
            { t: "Invisible Upgrades", p: "Instead of a car, upgrade your Health Insurance. One emergency can wipe out years of status-seeking." },
            { t: "Social Signaling Audit", p: "Are you paying for a gym you don't go to or a club you don't enjoy? Cut the status leaks." },
            { t: "The 'Neighbor' Filter", p: "If your neighbor buys a BMW, it doesn't mean you should. Run your own race." },
            { t: "Second-hand Logic", p: "A 2-year-old luxury car is 40% cheaper and 95% the same. Let someone else pay the status tax." },
            { t: "The Wedding Budget", p: "Don't spend 2 years of savings on 1 day of celebration. Your marriage is an asset; the party is an expense." },
            { t: "School Fee Inflation", p: "Status often dictates school choice. Ensure the education quality justifies the 15% annual hike." },
            { t: "Gadget Cycle", p: "Wait for 3 generations before upgrading tech. The marginal utility is low; the opportunity cost is high." },
            { t: "Vacation Velocity", p: "Travel for memories, not for 'The Gram'. A budget trip can be more enriching than a luxury trap." },
            { t: "The 'Rich' vs 'Wealthy'", p: "Rich is a high income; Wealthy is a high net worth. Focus on the latter." }
       ],
       Discipline: [
            { t: "The Step-Up SIP", p: "Your income grew, but did your investments? Increase your SIP by 10% today to match your raise." },
            { t: "The 15-15-15 Rule", p: "₹15k for 15 years at 15% = ₹1 Crore. Consistency is the only magic in the FIN-OS." },
            { t: "Automation Audit", p: "Check your auto-pay dates. Ensure investments leave your account before the bills arrive." },
            { t: "The 'One In, One Out' Rule", p: "Before buying something new, sell something old. Keep your lifestyle clutter-free." },
            { t: "Quarterly Review", p: "Don't check stocks daily; check them every 90 days. Short-term noise is a discipline killer." },
            { t: "The 24-Hour Rule", p: "Wait 24 hours before any purchase >₹5,000. Let the dopamine fade and the logic return." },
            { t: "Goal-Based Buckets", p: "Tag your SIPs: 'Retirement', 'Education', 'House'. Seeing the goal keeps you disciplined." },
            { t: "The 'Pay Yourself First' Mantra", p: "Treat your investment like a mandatory EMI. It's the most important bill you have." },
            { t: "Discipline over Intelligence", p: "A boring investor with a 20-year SIP beats a 'smart' trader 99% of the time." },
            { t: "The Compound Interest Curve", p: "The first 5 years feel slow. The last 5 years are where the magic happens. Don't quit early." }
       ],
       Growth: [
            { t: "Tax Leakage", p: "You work for money, but 30% leaks to tax. Use ELSS or PPF today to plug the holes in your bucket." },
            { t: "The Owner's Mindset", p: "Shift focus to ESOPs or direct Equity. Stop just working for the business; start owning it." },
            { t: "Mid-Cap Momentum", p: "Large caps are safe, but Mid-caps are where future giants live. Add a 15% tilt for growth." },
            { t: "The Alpha Audit", p: "Is your portfolio beating the Nifty? If not, you are taking risk without the reward. Refine today." },
            { t: "Impact Cost Analysis", p: "Buying illiquid stocks costs you more in spreads. Stick to high-volume growth vehicles." },
            { t: "Sectoral Cycles", p: "Keep an eye on Infrastructure or Banking. Growth often follows government spending cycles." },
            { t: "The 'Multi-bagger' Myth", p: "Don't look for the next 100x. Focus on consistent 15-18% compounders. They build real wealth." },
            { t: "Dividend Yield", p: "As you grow, dividends become a significant 'Salary'. Look for high-yield growth stocks." },
            { t: "The F&O Trap", p: "9/10 traders lose money. Your growth DNA is better served in long-term equity." },
            { t: "Venture Exposure", p: "If you have a large base, consider a small allocation to Angel investing or Unlisted shares." }
       ]
    },
    monk: { // Age 46+ (Focus: Preservation & Legacy)
        Security: [
            { t: "Capital Protection", p: "At this stage, NOT losing money is the priority. Shift high-risk equity to stable Debt or Gold." },
            { t: "Health is Wealth", p: "Your biggest expense is now your body. Check your critical illness cover—it's a security move." },
            { t: "The SWP Protocol", p: "Instead of a salary, set up a Systemic Withdrawal Plan. Let your assets pay you monthly." },
            { t: "Annuity vs Growth", p: "Don't lock everything in a low-interest annuity. Keep some in equity to fight inflation." },
            { t: "The 'Debt-Free' Goal", p: "Enter retirement with zero debt. A home loan at 60 is a heavy psychological anchor." },
            { t: "Medical Inflation", p: "Medicine costs rise at 15% per year. Ensure your 'Health Bucket' is growing faster." },
            { t: "The Safe Haven", p: "Maximize your Senior Citizen Savings Scheme (SCSS). It's the highest-rated safe yield available." },
            { t: "Portfolio Beta Reduction", p: "Your portfolio shouldn't dance with the market. Aim for low-volatility stability." },
            { t: "The Will Power", p: "Drafting a Will is the ultimate security move for your family. Do it this week." },
            { t: "Cash Flow over NAV", p: "Stop caring about the total portfolio value. Care about how much cash it generates monthly." }
        ],
        Discipline: [
            { t: "The Legacy Plan", p: "Review your nominations and Will today. Ensure your 'Stored Energy' reaches the right hands." },
            { t: "The Bucket Strategy", p: "1 year in Cash, 5 in Debt, rest in Equity. Spend from cash; let the rest grow." },
            { t: "Estate Rebalancing", p: "If you have 3 properties, consider selling one to buy liquid assets. Real estate is hard to split." },
            { t: "The 'Nominee' Walkthrough", p: "Sit with your spouse/children and show them where the 'Keys' to the OS are kept." },
            { t: "Simplification", p: "Close 3 bank accounts you don't use. A clean financial life is a disciplined one." },
            { t: "The Gifting Logic", p: "Start gifting assets to your children now to reduce future inheritance tax/complexity." },
            { t: "Philanthropy Bucket", p: "Allocate a small % for giving. Discipline at this stage includes intentional sharing." },
            { t: "The 'No Risk' Filter", p: "If it sounds too good to be true, it's a scam. Your discipline is your shield against 'tips'." },
            { t: "Asset Consolidation", p: "Move your 10 mutual funds into just 3. Complexity is the enemy of an easy retirement." },
            { t: "The Daily Walk", p: "Discipline in health is discipline in finance. A healthy body reduces medical leaks." }
        ],
        Growth: [
            { t: "Inflation vs Pension", p: "Fixed pensions lose to inflation. Keep a 'Growth Bucket' in Blue-chips to maintain power." },
            { t: "Passive Income", p: "Focus on Dividend stocks or REITs. Let your assets pay for your life so you don't have to." },
            { t: "Beat the 7% Thief", p: "Inflation at 7% halves your money every 10 years. You MUST keep some growth engine running." },
            { t: "Rental Yield Audit", p: "If your flat gives 2% rent and a Bond gives 7%, consider the math. Don't be 'House Rich, Cash Poor'." },
            { t: "The Dividend Flywheel", p: "Invest in 'Dividend Aristocrats'. Companies that increase dividends every year are your best friends." },
            { t: "REITs and InvITs", p: "Get commercial real estate growth without the headache of managing tenants. Modern growth." },
            { t: "The Equity Anchor", p: "Even at 70, you should have 20% in equity. It's the only asset class that beats the cost of milk." },
            { t: "Tax-Efficient Exit", p: "Plan your withdrawals to stay in the lowest tax bracket. Legal growth optimization." },
            { t: "Silver and Gold", p: "Commodities act as a final growth hedge during global uncertainty. Keep a 10% anchor." },
            { t: "Intellectual Capital", p: "Your growth now is your wisdom. Consider mentoring or consulting to keep your income active." }
        ],
        Status: [
            { t: "The Wedding Trap", p: "Don't raid retirement for a 1-day party. Your kids need an independent parent, not a wedding." },
            { t: "The Wealth Handover", p: "Teach your family how to manage the 'OS' you've built. Status is a family that understands money." },
            { t: "The Legacy Flex", p: "True status is a Will that is clear and a family that is united. Not the brand of your car." },
            { t: "Time over Luxury", p: "You can buy a better watch, but you can't buy more time. Spend on experiences with grandkids." },
            { t: "The 'Social' Budget", p: "Don't let social circles dictate your spending. Retirement is about living on your own terms." },
            { t: "Humble Assets", p: "A high-yielding bond is more 'impressive' than a gold watch at this stage. Focus on the engine." },
            { t: "The 'Dada-ji' Fund", p: "Instead of toys, start a SIP for your grandkids' higher education. That is a lasting status." },
            { t: "Downsizing Efficiency", p: "A smaller home is easier to maintain and cheaper to run. Efficiency is the ultimate flex." },
            { t: "The Respect Index", p: "People respect your stability, not your spending. Be the rock of the family." },
            { t: "Peace is Profitable", p: "Avoid complex business ventures now. Status is having nothing to worry about when you wake up." }
        ],
        Risk: [
             { t: "The FOMO Filter", p: "You don't have time to recover from a 100% loss. Say no to 'tips' and high-risk crypto." },
             { t: "Reverse Mortgage", p: "If wealth is locked in a house, learn to unlock it for your comfort. The house serves you now." },
             { t: "Portfolio Volatility Check", p: "Your portfolio shouldn't drop more than 5% when the market drops 10%. Lower your Beta." },
             { t: "Guaranteed Income", p: "Risk today is not having enough cash. Focus on PMVVY or SCSS for guaranteed floors." },
             { t: "The 'Tip' Shield", p: "Relatives will ask for loans. Security is saying 'No' to preserve your retirement corpus." },
             { t: "Scam Awareness", p: "High-yield schemes target seniors. If it returns >10% guaranteed, it's likely a trap. Protect your capital." },
             { t: "Liquidity Risk", p: "Don't buy land now; it's hard to sell when you need medicine. Stay in liquid, tradable assets." },
             { t: "Currency Hedge", p: "Keep some assets in gold or global funds to protect against the rupee losing value." },
             { t: "The Stop-Loss Mindset", p: "If an investment drops 10%, exit. At 60, you are a preserver, not a gambler." },
             { t: "Debt Quality", p: "Only hold 'AAA' rated bonds. Don't chase an extra 1% yield in risky company deposits." }
        ]
    }
};