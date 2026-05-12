/**
 * js/investor-profile.js
 * Deep D3.js & GSAP visual representations + Narrative Data
 */

document.addEventListener("DOMContentLoaded", () => {

    // --- 1. DATA DICTIONARY (1000x Detail) ---
    const profiles = {
        buffett: {
            id: "buffett",
            name: "Warren Buffett",
            subtitle: "The Architecture of Patience & Value",
            priColor: "#4ade80",
            secColor: "#166534",
            analogyTitle: "Buying the Castle, not the Moat.",
            analogyIcon: "fa-chess-rook",
            analogyText: `
                <p class="mb-4">Imagine a medieval castle. In the stock market, most beginners bet on the flags flying above the walls—predicting which way the wind will blow tomorrow. <b>Warren Buffett buys the castle itself.</b></p>
                <p class="mb-4">He doesn't care about daily price movements (the wind). He looks for an "Economic Moat"—a massive, uncrossable body of water around the castle protecting it from invading armies (competitors). If a business has a strong brand, high switching costs, or network effects, its moat is deep.</p>
                <div class="p-5 border-l-4 border-green-500 bg-green-500/10 rounded-r-xl my-6">
                    <p class="text-green-400 font-medium italic">"Price is what you pay. Value is what you get."</p>
                </div>
                <p>The secret? The stock market is manic-depressive. Sometimes it offers to sell you the castle for pennies on the dollar because of a temporary thunderstorm. That is the <b>Margin of Safety</b>. You buy the castle when the crowd is panicking about the rain.</p>
            `,
            diagramTitle: "Intrinsic Value vs Market Price Matrix",
            diagramDesc: "In the short term, the market is a voting machine (volatile noise). In the long term, it is a weighing machine (hugging intrinsic value). Adjust the TIME HORIZON slider to witness convergence.",
            scenarios: [
                { title: "Market crashes 30% due to global panic", action: "AGGRESSIVE BUY", color: "text-green-400", response: "Outstanding. A massive macro-panic is precisely when high-quality castles go on sale. Does the panic destroy the company's competitive advantage? No? Then we deploy massive capital at a heavy discount." },
                { title: "A hyped AI startup IPOs today", action: "IGNORE COMPLETELY", color: "text-gray-500", response: "It has no track record, no predictable cash flow, and zero visible economic moat. It is entirely outside our 'Circle of Competence'. Let the speculators play. We pass." },
                { title: "A steady consumer brand drops 5% slowly", action: "HOLD & OBSERVE", color: "text-yellow-500", response: "A 5% drop is just daily noise. We do not react to minor voting-machine actions. We simply verify the intrinsic fundamentals haven't decayed." }
            ],
            // INDIAN DESI CONTEXT
            desiTitle: "The Indian Compounding Machine",
            desiCoreText: `
                <p>Buffett in India is NOT buying flashy startups. He is buying <b>HDFC Bank, Asian Paints, Nestlé India.</b></p>
                <p>Why? <i class="text-neonPri">"India's consumption story compounds slowly, but relentlessly."</i></p>
                <p class="mt-2 text-white"><b>Example 1: Asian Paints</b><br>Expensive? YES. Overvalued? Maybe. Still rising? YES. Strong brand moat, and more importantly, the dealer network is a distribution moat. Insight: <b>In India, distribution = moat.</b></p>
                <p class="mt-2 text-white"><b>Example 2: HDFC Bank</b><br>Consistent ROE, extreme risk management, and trust factor yielding predictable cash flow.</p>
            `,
            desiEngine: [
                "<b>Step 1:</b> 'Yeh business 10 saal chalega?' If answer = NO → reject immediately.",
                "<b>Step 2:</b> 'Iska moat kya hai?' Brand? (Tata, Nestle). Network? (Asian Paints). Switching cost? (Banking).",
                "<b>Step 3:</b> 'Kya main panic mein bhi hold karunga?' If NO → don't buy."
            ],
            desiKink: `<h4 class="font-bold text-orange-400 mb-1">“THE BOREDOM EDGE”</h4><p>Retail loves Smallcaps and momentum stocks. Buffett loves FMCG, Banks, Utilities. <b>Insight: Ignore excitement → capture compounding.</b></p>`,
            desiMistakes: ["Buying PSU just because 'cheap'", "Falling for 'multibagger tips'", "Ignoring management quality"],
            finosImplTitle: "Desi Value Engine",
            finosImplTags: ["ROE", "Debt", "Buffett Score"],
            switchAction: "Value Buy",
            switchColor: "text-green-400 border-green-400 bg-green-500/20",
            switchSight: "Consistent ROE, deep distribution moat, strong management history, and long-term compounding stability regardless of macro events.",
            switchModeName: "Value Engine",
            switchModeFocus: "Fundamentals &rarr; Intrinsic Value"
        },
        simons: {
            id: "simons",
            name: "Jim Simons",
            subtitle: "The Architecture of Data & Systems",
            priColor: "#60a5fa",
            secColor: "#1e3a8a",
            analogyTitle: "The Casino Always Wins.",
            analogyIcon: "fa-dice",
            analogyText: `
                <p class="mb-4">Most investors think they are analyzing companies. They read news, judge CEOs, and try to guess the future. Jim Simons treats the market exactly like a casino—but <b>he is the house.</b></p>
                <p class="mb-4">Instead of looking at the slot machine, his computers analyze billions of variables: the temperature in Brazil, the delay between trades in London, the volume spikes at 3:15 PM every Tuesday. They aren't predicting long-term trends; they are identifying tiny statistical anomalies.</p>
                <div class="p-5 border-l-4 border-blue-500 bg-blue-500/10 rounded-r-xl my-6">
                    <p class="text-blue-400 font-medium italic">"We don't predict perfectly. We just need to be right 51% of the time. The volume takes care of the rest."</p>
                </div>
                <p>If you flip a coin 10,000 times, and it lands on heads 51% of the time, you will inevitably become a billionaire if you size your bets correctly. Simons removes human emotion entirely. Machines execute millions of microscopic trades to capture these tiny, mathematically proven edges.</p>
            `,
            diagramTitle: "Statistical Arbitrage & Pattern Detection",
            diagramDesc: "Raw market data appears entirely chaotic to humans. Hit INITIATE MODEL to apply the Hidden Markov Model—forcing chaotic data to reveal probabilistic distributions.",
            scenarios: [
                { title: "A major CEO resigns unexpectedly", action: "ALGORITHMIC REACTION", color: "text-blue-400", response: "The algorithm instantly parses the news feed, identifies historically correlated asset drops, and executes 10,000 short trades across connected supply-chain equities within 0.003 seconds." },
                { title: "Expert analysts say 'Buy Apple'", action: "EXCLUDE VARIABLE", color: "text-gray-500", response: "Human opinions, newsletters, and fundamentally subjective analyses are excluded from the dataset. It is noise. Only raw mathematical data points (price, volume, order flow) are processed." },
                { title: "Algorithm detects a 50.1% edge in soybean futures", action: "MAXIMIZE LEVERAGE", color: "text-blue-400", response: "Because the math has proven a slight statistical edge over a massive sample size, the system aggressively utilizes leverage to execute millions of micro-transactions, mathematically guaranteeing a net-positive outcome over time." }
            ],
            // INDIAN DESI CONTEXT
            desiTitle: "The Algo Trader of Dalal Street",
            desiCoreText: `
                <p>Simons in India = NOT fundamentals. He is trading: <b>NIFTY 50, BANK NIFTY, Options & intraday moves.</b></p>
                <p class="mt-2 text-white"><b>Example: Bank Nifty</b><br>Highly volatile. Driven by FIIs, Options data, and Liquidity. Instead of predicting the economy, he mathematically predicts the trapped options writers.</p>
                <p class="mt-2">Patterns exist: Opening range breakouts, VWAP reversals, Option chain traps.</p>
            `,
            desiEngine: [
                "<b>Step 1: Data Capture:</b> Candle data (1 min, 3 min), Volume spikes, Option chain gamma.",
                "<b>Step 2: Pattern Recognition:</b> Example: 'If price breaks ORB + volume spike → 70% continuation'.",
                "<b>Step 3: Probability Output:</b> Execute trade fully automated ONLY if statistical edge > 60%."
            ],
            desiKink: `<h4 class="font-bold text-orange-400 mb-1">“NO OPINION EDGE”</h4><p>Indian traders watch news and follow YouTube influencers. Simons ignores everything except the tape. <b>Insight: Data > Opinions.</b></p>`,
            desiMistakes: ["Overtrading manually", "Emotional revenge trading", "Ignoring the raw mathematical probability"],
            finosImplTitle: "Quant Engine India",
            finosImplTags: ["Pattern Prob", "Win%", "EV"],
            switchAction: "Algorithmic Short",
            switchColor: "text-blue-400 border-blue-400 bg-blue-500/20",
            switchSight: "Detects a 63% probability of a 3-minute mean-reversion drop based on abnormal options chain OI writing at the current strike price.",
            switchModeName: "Quant Mode",
            switchModeFocus: "Price/Volume &rarr; Probability Score"
        },
        soros: {
            id: "soros",
            name: "George Soros",
            subtitle: "The Architecture of Macro Reflexivity",
            priColor: "#f87171",
            secColor: "#7f1d1d",
            analogyTitle: "The Hall of Mirrors.",
            analogyIcon: "fa-infinity",
            analogyText: `
                <p class="mb-4">Traditional economics teaches that markets eventually find an objective "equilibrium." George Soros realized this is a complete myth. <b>Markets are a hall of mirrors where perception alters reality.</b></p>
                <p class="mb-4">Think of a struggling bank. Traditional investors look at its balance sheet and hold. But Soros notices a rumor spreading that the bank will fail. As panic spreads, depositors withdraw cash, and the stock crashes. Because the stock crashed, the bank cannot raise cash. The rumor directly caused the bank to go bankrupt.</p>
                <div class="p-5 border-l-4 border-red-500 bg-red-500/10 rounded-r-xl my-6">
                    <p class="text-red-400 font-medium italic">"Markets can influence the fundamentals they are supposed to reflect. This is Reflexivity."</p>
                </div>
                <p>Soros looks for these feedback loops. When he spots a massive gap between public perception and underlying macroeconomic reality, he doesn't just buy—he places hyper-aggressive, leveraged bets against the structural flaws of entire countries and currencies.</p>
            `,
            diagramTitle: "The Reflexivity Feedback Loop",
            diagramDesc: "Standard theory claims price reflects fundamentals. Reflexivity proves price actually ALTERS fundamentals, creating a self-feeding loop resulting in massive booms and busts.",
            scenarios: [
                { title: "A country artificially pegs its currency too high", action: "ATTACK AND BREAK IT", color: "text-red-500", response: "The structural flaw is obvious. We will short the currency aggressively. As the market sees us shorting, panic ensues. The central bank bleeds reserves trying to defend the peg until they surrender. The loop shatters." },
                { title: "A new technology triggers a massive market boom", action: "RIDE THE BUBBLE", color: "text-orange-400", response: "We recognize it's a bubble built on false perception. But because perception drives capital, the bubble will grow larger than anyone thinks. We ride the irrational wave up aggressively, but keep our fingers directly on the eject button." },
                { title: "An investment loses 1% slowly", action: "CUT INSTANTLY", color: "text-gray-500", response: "Survival is the only priority. If our hypothesis is wrong, we do not wait 'to see what happens.' We ruthlessly cut the loss, protect capital, and survive to fight another day." }
            ],
            // INDIAN DESI CONTEXT
            desiTitle: "The News & Narrative King",
            desiCoreText: `
                <p>Soros in India tracks: RBI policy, Inflation, Elections, and Global cues.</p>
                <p class="mt-2 text-white"><b>Example 1: Election Rally</b><br>Market rallies before elections based purely on the expectation of stability. If expectation fails → Reflexive crash.</p>
                <p class="mt-2 text-white"><b>Example 2: Adani Crisis (2023)</b><br>Negative report &rarr; Panic selling &rarr; Price crash &rarr; Margin calls trigger more selling. <b>Narrative drives the actual reality.</b></p>
            `,
            desiEngine: [
                "<b>Step 1: Identify Narrative:</b> 'India growth story', 'PSU revival', 'EV revolution'.",
                "<b>Step 2: Check Reality:</b> Is the underlying reality artificially inflated by the narrative itself?",
                "<b>Step 3: Trade the Gap:</b> Enter early into the sentiment shift, and exit violently when the narrative breaks."
            ],
            desiKink: `<h4 class="font-bold text-orange-400 mb-1">“THE SPEED EDGE”</h4><p>Indian traders enter late and exit late. Soros acts FAST, admits mistakes instantly without ego, and exits FAST. <b>Insight: Speed > Certainty.</b></p>`,
            desiMistakes: ["Believing news blindly", "Holding the bag after the core narrative has fundamentally broken"],
            finosImplTitle: "Narrative Engine India",
            finosImplTags: ["News Sentiment", "Bubble Alert", "Trend Strength"],
            switchAction: "Ride the Narrative",
            switchColor: "text-red-400 border-red-400 bg-red-500/20",
            switchSight: "Recognizes that the 'India Banking Growth' narrative is currently self-fulfilling. Buying amplifies the stock, which allows them to raise cheaper capital, making the bank actually stronger.",
            switchModeName: "Macro Mode",
            switchModeFocus: "Sentiment &rarr; Trend Strength"
        },
        burry: {
            id: "burry",
            name: "Michael Burry",
            subtitle: "The Architecture of Contrarian Research",
            priColor: "#fb923c",
            secColor: "#7c2d12",
            analogyTitle: "Finding the Trap Door.",
            analogyIcon: "fa-biohazard",
            analogyText: `
                <p class="mb-4">Imagine a massive, crowded theater. Everyone is laughing and enjoying the show. Michael Burry is the only person ignoring the stage, intensely reading the building's architectural blueprints to discover that the floor supports are completely rotten.</p>
                <p class="mb-4">He thrives on <b>Asymmetrical Contrarianism</b>. If 99% of Wall Street agrees on an investment thesis, Burry starts digging for the hidden flaw. He reads thousands of pages of dry, obscure data—mortgage tranches, niche corporate filings—looking for the exact moment reality diverges from the consensus illusion.</p>
                <div class="p-5 border-l-4 border-orange-500 bg-orange-500/10 rounded-r-xl my-6">
                    <p class="text-orange-400 font-medium italic">"I don't know when it's going to happen. But I know it's going to happen."</p>
                </div>
                <p>When he finds it, he takes an isolated, heavily concentrated position against the crowd. But here is the hardest part for any beginner: he will bleed money, face mockery, and suffer extreme psychological pressure for years before the trap door finally snaps and reality corrects itself in a violent flash.</p>
            `,
            diagramTitle: "Consensus Divergence Map",
            diagramDesc: "The wider the gap between the Consensus Narrative and Independent Reality, the more elastic energy is stored. The snap-back is violent and asymmetrical.",
            scenarios: [
                { title: "The housing market has 'literally never crashed'", action: "DIG INTO RAW DATA", color: "text-orange-400", response: "'Never crashed' is a social assumption, not a mathematical law. I will read the individual prospectuses of thousands of subprime loans. If fraud is rampant, I will buy insurance against the entire system collapsing." },
                { title: "Wall Street experts unanimously predict growth", action: "ASSUME THEY ARE WRONG", color: "text-orange-500", response: "When consensus is unanimous, there is no one left to buy, and the risk premium is functionally zero. The trade is horribly crowded. I look strictly for where groupthink has blinded them to systemic fragility." },
                { title: "You are bleeding 15% due to being early", action: "INCREASE POSITION", color: "text-red-500", response: "Pain is irrelevant if the fundamental research is absolute. Being early looks exactly like being wrong. If the data confirms the trap door exists, I will aggressively add to the position while everyone else laughs." }
            ],
            // INDIAN DESI CONTEXT
            desiTitle: "The Anti-Herd Operator",
            desiCoreText: `
                <p>Burry in India looks at: <b>Overhyped IPOs, Overleveraged companies, and Retail frenzy stocks.</b></p>
                <p class="mt-2 text-white"><b>Example 1: Zomato IPO Phase</b><br>Massive hype, retail buying blindly. Contrarian view: Severe cash burn, structurally loss-making delivery unit, overvaluation compared to peers.</p>
                <p class="mt-2 text-white"><b>Example 2: PSU Stocks (Before Rally)</b><br>Completely ignored, hated by the crowd, yet trading below book value. Contrarian entry yields a colossal asymmetric upside.</p>
            `,
            desiEngine: [
                "<b>Step 1: Crowd Analysis:</b> Is everyone blindly bullish on Twitter/Telegram? → Extreme Danger.",
                "<b>Step 2: Deep Research:</b> Comb through raw balance sheets, off-book entity debt, and actual cash flows instead of reported EBITDA.",
                "<b>Step 3: Opposite Position:</b> Take a massive isolated position aggressively against the majority."
            ],
            desiKink: `<h4 class="font-bold text-orange-400 mb-1">“PAIN TOLERANCE EDGE”</h4><p>Contrarian trades feel absolutely wrong initially. You bleed money. <b>Insight: Be comfortable being completely uncomfortable.</b></p>`,
            desiMistakes: ["Blindly following Twitter tips", "Panic exiting contrarian trades before the catalyst triggers"],
            finosImplTitle: "Contrarian Radar India",
            finosImplTags: ["Crowd Bias", "Overbought", "Overcrowded Alert"],
            switchAction: "Ignore (Crowded)",
            switchColor: "text-gray-500 border-gray-500 bg-gray-500/20",
            switchSight: "Everyone already owns this. There is zero hidden asymmetric upside left. Looking for structural cracks in their lending logic instead to short later.",
            switchModeName: "Contrarian Mode",
            switchModeFocus: "Sentiment/Positioning &rarr; Crowd Bias"
        },
        lynch: {
            id: "lynch",
            name: "Peter Lynch",
            subtitle: "The Ground Reality Architecture",
            priColor: "#facc15",
            secColor: "#854d0e",
            analogyTitle: "Jo Dikhta Hai, Wohi Bikta Hai.",
            analogyIcon: "fa-binoculars",
            analogyText: `
                <p class="mb-4">People think Peter Lynch means "Use a product -> buy the stock." That is surface-level nonsense. The true edge is: <b>You are closer to emerging demand than the institutions.</b></p>
                <p class="mb-4">In a country like India with a massive informal economy and fragmented data, reality appears in the streets long before it appears in financial statements. While hedge funds wait for quarterly reports, you can step outside and literally observe the demand curve shifting.</p>
                <div class="p-5 border-l-4 border-yellow-500 bg-yellow-500/10 rounded-r-xl my-6">
                    <p class="text-yellow-400 font-medium italic">"Jahan bheed hai, wahan paisa hai — but only if you understand WHY the bheed is there."</p>
                </div>
                <p>Institutions rely on spreadsheets and analysts. You rely on your eyes. By observing consumer surges, retail footfalls, and aspirational shifts, you can capture explosive growth entirely outside of Wall Street's radar before the mutual funds eventually arrive.</p>
            `,
            diagramTitle: "Ground Signal Heatmap",
            diagramDesc: "Observe how localized retail anomalies translate to macro-level stock trends over time.",
            scenarios: [
                {
                    title: "Zomato delivery bikes are suddenly everywhere",
                    action: "ANALYZE STRUCTURAL SHIFT",
                    color: "text-yellow-400",
                    response: "Is this temporary hype or a habit forming? Indian consumers rarely switch once habituated. This is 'Category expansion', not just company growth. We verify unit economics on the balance sheet and enter."
                },
                {
                    title: "Analyst downgrades a stock due to 'macro fears'",
                    action: "IGNORE & CHECK CAR PARK",
                    color: "text-gray-500",
                    response: "Analysts write reports. I check the DMart parking lot. Are the billing queues still 20 minutes long? Yes? Then the business is fundamentally decoupled from the macro panic. We hold."
                },
                {
                    title: "A hyped software company IPOs at 100x earnings",
                    action: "PASS ENTIRELY",
                    color: "text-red-500",
                    response: "I cannot observe a SaaS product's ground reality. It requires guessing about corporate procurement budgets. If I can't see the demand with my own eyes, I do not invest in it."
                }
            ],
            desiTitle: "The Desi Detective System",
            desiCoreText: `
                <p>Lynch in India watches: <b>Consumption Surges, Retail Footfall, Aspirational Upgrades.</b></p>
                <p class="mt-2 text-white"><b>Example 1: Titan Company</b><br>Income rising 20% leads to lifestyle spend rising 50%. Aspiration is a massive multiplier in India.</p>
                <p class="mt-2 text-white"><b>Example 2: DMart vs Bheendi Bazaar</b><br>People are upgrading to organized retail. The habit formation edge is permanent.</p>
            `,
            desiEngine: [
                "<b>Step 1: Signal Detection:</b> 'Are Zomato bikes suddenly ubiquitous?' Observe repeating, daily scaling.",
                "<b>Step 2: The Habit Kink:</b> Once an Indian consumer is habituated, they stay. E.g., UPI, Food Delivery.",
                "<b>Step 3: Verification:</b> Check 'Story → Numbers Match'. If story is strong but cashflow doesn't reflect it, reject.",
                "<b>Step 4: Timing:</b> Enter when growth is visible but largely unknown. Exit when narrative permanently breaks."
            ],
            desiKink: `<h4 class="font-bold text-yellow-500 mb-1">“THE INFORMATION ASYMMETRY EDGE”</h4><p>Retail advantage: Institutions rely on delayed reports, you see reality. <b>Insight: Your daily life is a research lab.</b></p>`,
            desiMistakes: ["Using a product and blindly buying without checking balance sheets", "Entering AFTER the mutual funds trigger the rally"],
            finosImplTitle: "Lynch Scanner",
            finosImplTags: ["Ground Reality", "Habit Index", "Aspiration Shift"],
            switchAction: "Observe & Verify",
            switchColor: "text-yellow-400 border-yellow-400 bg-yellow-500/20",
            switchSight: "Sees that HDFC cards are the dominant payment method in every high-end mall and restaurant they visit. Observes massive unrecorded 'aspirational reality' playing out daily.",
            switchModeName: "Reality Engine",
            switchModeFocus: "Observation &rarr; Demand Identification"
        },
        dalio: {
            id: "dalio",
            name: "Ray Dalio",
            subtitle: "The Economic Machine Architecture",
            priColor: "#a855f7",
            secColor: "#581c87",
            analogyTitle: "Paisa System Ka Game Hai.",
            analogyIcon: "fa-gears",
            analogyText: `
                <p class="mb-4">Dalio does not trade companies; he trades the massive, invisible ocean of money that forces entire economies to rise and fall. His foundational truth: <b>Credit + Money = Spending = Income = Asset Prices.</b></p>
                <div class="p-5 border-l-4 border-purple-500 bg-purple-500/10 rounded-r-xl my-6">
                    <p class="text-purple-400 font-medium italic">"Market samajhna hai toh company nahi, paisa ka flow samajh."</p>
                </div>
                <p>When the RBI prints money, banks lend more, people spend more, companies earn more, and stocks go up. It has very little to do with exactly how "smart" the company's CEO is. It's a structural liquidity wave.</p>
                <p class="mt-4">By mapping these cycles (Short-Term Credit Cycles and Long-Term Structural Debt Cycles), Dalio allocates across Equity, Gold, and Debt automatically based on Risk Parity—creating a portfolio designed to survive all environments without predicting the future.</p>
            `,
            diagramTitle: "Macro Liquidity Flow Matrix",
            diagramDesc: "Track the cycle position and liquidity overlays affecting all asset classes simultaneously.",
            scenarios: [
                {
                    title: "Central Banks aggressively cut interest rates to 0",
                    action: "MAXIMIZE MACRO LEVERAGE",
                    color: "text-purple-400",
                    response: "Cheap money forces an expansion. This is Kink #1: 'Cheap Money = Risk On'. Asset returns will be massive purely due to systemic leverage. I rotate heavily into Equity."
                },
                {
                    title: "Market is peaking, borrowing is at maximum capacity",
                    action: "REDUCE RISK PARITY",
                    color: "text-yellow-500",
                    response: "We are late in the short-term credit cycle. People are wildly extrapolating current trends, leveraging themselves dangerously. I re-balance capital to Gold and safe Debt to prepare for the inevitable structural tightening."
                },
                {
                    title: "Retail traders boast about their 100% returns in 2021",
                    action: "IGNORE. IT IS LIQUIDITY.",
                    color: "text-gray-500",
                    response: "This is Kink #2: 'Liquidity > Intelligence'. They believe they are stock market geniuses. In reality, they are merely foam riding a massive tidal wave of macro liquidity. When the wave recedes, they will drown."
                }
            ],
            desiTitle: "The Indian Economic Machine",
            desiCoreText: `
                <p>Dalio in India tracks: <b>RBI Repo Rates, Credit Growth, and Aggregate Liquidity.</b></p>
                <p class="mt-2 text-white"><b>Case Study 1: The COVID Liquidity Boom (2020)</b><br>Global coordination injected unprecedented cash. Result? Small-caps exploded entirely irrespective of fundamentals.</p>
                <p class="mt-2 text-white"><b>Case Study 2: NBFC Leverage Crisis</b><br>Kink #7 is 'Debt Kills'. Overleveraged systems always collapse when liquidity unexpectedly tightens.</p>
            `,
            desiEngine: [
                "<b>Step 1: Interest Rate Monitor:</b> Tracks the 'Cost of Money' via RBI announcements.",
                "<b>Step 2: Liquidity Flow:</b> Tracks 'Money Supply' and bank balance sheet lending.",
                "<b>Step 3: Cycle Detection:</b> Mathematically scores if India is Early, Mid, or Late cycle.",
                "<b>Step 4: Radical Systemization:</b> Eliminates all human bias (Kink #8 & #9: 'Ego Kills Returns'). Strictly allocates via algorithm."
            ],
            desiKink: `<h4 class="font-bold text-purple-500 mb-1">“THE CYCLE POSITION EDGE”</h4><p>You cannot fight the RBI. <b>Insight: Don't predict tomorrow; map exactly where we are in the cycle today.</b></p>`,
            desiMistakes: ["Confusing a liquidity rally with your own intelligence", "Holding a 100% equity portfolio during late-cycle extremes"],
            finosImplTitle: "Economic Dashboard",
            finosImplTags: ["Liquidity Meter", "Cycle Detector", "Risk Parity"],
            switchAction: "Balance via Macro",
            switchColor: "text-purple-400 border-purple-400 bg-purple-500/20",
            switchSight: "Discounts HDFC's specific performance and evaluates the overall sector's structural leverage. Overlays RBI credit matrices and balances exposure mathematically alongside gold and debt.",
            switchModeName: "Macro Overlay Mode",
            switchModeFocus: "System Liquidity &rarr; Capital Flow"
        },
        livermore: {
            id: "livermore",
            name: "Jesse Livermore",
            subtitle: "The Trend & Timing Architecture",
            priColor: "#06b6d4",
            secColor: "#164e63",
            analogyTitle: "Market ki leher pe sawar ho ja.",
            analogyIcon: "fa-water",
            analogyText: `
                <p class="mb-4">Livermore does not care about your fundamental spreadsheets or the latest news. He operates on one brutal truth: <b>Price movement = Truth.</b></p>
                <div class="p-5 border-l-4 border-cyan-500 bg-cyan-500/10 rounded-r-xl my-6">
                    <p class="text-cyan-400 font-medium italic">"Market ko predict mat kar — uske saath flow kar. Trend = Direction × Momentum."</p>
                </div>
                <p>Retail traders consistently lose because they predict and overtrade. Livermore waits (80% of his time) and only acts (20%) when the market physically demonstrates confirmation via a heavy volume breakout.</p>
                <p class="mt-4">By mapping the 3 phases of a trend—Accumulation, Markup, and Distribution—he ensures he enters right when Smart Money forces the markup, and sits tightly until the trend breaks, completely devoid of emotion or hope.</p>
            `,
            diagramTitle: "Breakout & Trend Engine",
            diagramDesc: "Identify structural accumulation blocks bursting into aggressive markup phases with strict momentum verification.",
            scenarios: [
                {
                    title: "A major stock breaks 52-week highs on staggering volume",
                    action: "EARLY STRENGTH SIGNAL",
                    color: "text-cyan-400",
                    response: "This is Kink #1. Strong stocks show strength BEFORE the news arrives. I wait for the clean breakout to confirm, initiate a small pilot position, and add to the winner if it holds the trend."
                },
                {
                    title: "Your position drops 10% instantly after earnings",
                    action: "CUT LOSS FAST",
                    color: "text-red-500",
                    response: "Small loss > big loss. Kink #8 is the Loss Acceptance Edge. Hope is the ultimate portfolio killer. You are NOT your trade. Liquidate instantly and wait for a new setup."
                },
                {
                    title: "The trend is up, your stock is up 50% and consolidating",
                    action: "SIT TIGHT",
                    color: "text-yellow-500",
                    response: "Kink #6: Patience in profits. The biggest money is made by sitting tight when you are right, not in the entry. Retail books profits too early out of fear. I wait for the momentum curve to actively snap."
                }
            ],
            desiTitle: "Indian Momentum Reality",
            desiCoreText: `
                <p>India is a momentum trader's paradise due to retail-driven avalanches and operator setups.</p>
                <p class="mt-2 text-white"><b>Case Study 1: PSU Bank Rallies</b><br>State Bank of India was ignored for years. Suddenly, heavy accumulation broke out. Retail ignored it early and entered late. Livermore catches the exact Phase 2 Markup breakout.</p>
                <p class="mt-2 text-white"><b>Case Study 2: Bank NIFTY Intraday</b><br>Kink #2 is the Waiting Edge. Define the opening range. Wait for the breakout. Ride the momentum. Do nothing during chop.</p>
            `,
            desiEngine: [
                "<b>Step 1: Wait.</b> Watch the accumulation phase. Monitor, do not trade.",
                "<b>Step 2: React, Don't Predict.</b> Wait for price completely clearing resistance on abnormal volume.",
                "<b>Step 3: Add to Winners.</b> Start at 20% size. Add on confirmation (Kink #5). Never average a losing position.",
                "<b>Step 4: Execute Sit Tight Mode.</b> Allow the trend curve to expand exponentially. Exit only when the trend structure fundamentally weakens."
            ],
            desiKink: `<h4 class="font-bold text-cyan-500 mb-1">“PHASE IDENTIFICATION EDGE”</h4><p>Retail enters during Phase 3 (Distribution) out of FOMO. <b>Insight: The highest risk-reward is catching the explosive pivot from Phase 1 to Phase 2.</b></p>`,
            desiMistakes: ["Averaging down on a failing trade", "Taking a 5% profit early and missing the 200% run"],
            finosImplTitle: "Trend Engine",
            finosImplTags: ["Breakout Detector", "Sit Tight Mode", "Loss Guard"],
            switchAction: "Ride Pure Momentum",
            switchColor: "text-cyan-400 border-cyan-400 bg-cyan-500/20",
            switchSight: "Ignores the name of the bank completely. Only views a chart showing a compressed volatility band violently expanding into an uptrend verified by uncharacteristic block volumes.",
            switchModeName: "Trend Action Mode",
            switchModeFocus: "Breakout &rarr; Momentum Continuation"
        },
        munger: {
            id: "munger",
            name: "Charlie Munger",
            subtitle: "The Mental Models Architecture",
            priColor: "#f59e0b",
            secColor: "#78350f",
            analogyTitle: "Soch Badlo, Paisa Apne Aap Badhega.",
            analogyIcon: "fa-brain",
            analogyText: `
                <p class="mb-4">Munger is not a stock picker. He is a <b>thinking machine built on a lattice of mental models</b> pulled from physics, psychology, mathematics, and biology. His real edge? Most people think in ONE dimension.</p>
                <div class="p-5 border-l-4 border-amber-500 bg-amber-500/10 rounded-r-xl my-6">
                    <p class="text-amber-400 font-medium italic">"Market ko beat karna hai toh pehle apni soch ko beat kar. Better Thinking = Better Decisions = Better Capital."</p>
                </div>
                <p>India is the perfect battlefield for Munger. Markets here run on pure emotion, herd psychology, and social influence &mdash; meaning every single rational thought is a direct alpha opportunity.</p>
                <p class="mt-4">By systematically running Inversion Thinking, Incentive X-Rays, and Social Proof checks before any decision, Munger eliminates 90% of the analytical errors that demolish retail portfolios.</p>
            `,
            diagramTitle: "Cognitive Bias Web",
            diagramDesc: "Visualize how interconnected biases cascade and amplify each other, creating dangerous market behavior.",
            scenarios: [
                {
                    title: "Your broker recommends buying Smallcap XYZ with 'great conviction'",
                    action: "INCENTIVE X-RAY",
                    color: "text-amber-400",
                    response: "Kink #1. Ask: 'Isko kya fayda hai?' Your broker earns brokerage on every trade. Their incentive is volume, not your returns. Activate the X-Ray before trusting any external recommendation."
                },
                {
                    title: "A Telegram group of 50,000 people all bullish on one stock",
                    action: "CROWD = RISK",
                    color: "text-red-400",
                    response: "Kink #2. Social Proof Trap activated. When everyone is bullish simultaneously, that IS the danger zone. Mathematically, who is left to buy? The smart money is already distributing."
                },
                {
                    title: "A stock you own is down 30%. You refuse to sell.",
                    action: "LOSS AVERSION ALERT",
                    color: "text-orange-400",
                    response: "Kink #3. Loss Aversion Bias detected. Your brain hates realizing a loss more than it loves a gain. Correct behavior is the exact inverse of your instinct: Cut losses aggressively, hold winners patiently."
                }
            ],
            desiTitle: "India's Psychological Alpha Layer",
            desiCoreText: `
                <p>India runs on emotion, social proof, and narrative. Every cognitive bias is amplified in our markets.</p>
                <p class="mt-2 text-white"><b>Overconfidence Trap:</b><br>After 3 profitable trades in a bull market, the average retail trader declares themselves an 'expert.' Kink #5: The best investors constantly doubt themselves. Humility is the ultimate edge.</p>
                <p class="mt-2 text-white"><b>Recency Bias:</b><br>After the PSU rally, everyone believes PSUs will 'always be bullish.' Kink #4: Markets always mean-revert. Cycles always exist. Permanence is an illusion.</p>
            `,
            desiEngine: [
                "<b>Step 1: Incentive X-Ray.</b> Before trusting any advice: 'Isko kya fayda hai?'",
                "<b>Step 2: Inversion Thinking (Kink #6).</b> Ask: 'Isme kya galat ho sakta hai?' before the thesis, not after.",
                "<b>Step 3: Multi-Model Check.</b> Apply Economics + Psychology + Business logic simultaneously (Kink #7: One model = danger).",
                "<b>Step 4: Remove Stupidity First.</b> Don't try to be brilliant. Just eliminate the obvious, avoidable mistakes."
            ],
            desiKink: `<h4 class="font-bold text-amber-500 mb-1">"INVERSION THINKING"</h4><p>Don't ask: 'How do I make money?' Ask: <b>'What will definitely destroy my capital?' Then avoid THAT with extreme discipline.</b></p>`,
            desiMistakes: ["Following highly subscribed Telegram tips without an incentive check", "Holding a 40% loss because 'it will recover' — pure Loss Aversion"],
            finosImplTitle: "Bias Detector",
            finosImplTags: ["Incentive X-Ray", "Stupidity Filter", "Inversion Mode"],
            switchAction: "Run Bias Filter",
            switchColor: "text-amber-400 border-amber-400 bg-amber-500/20",
            switchSight: "Before touching the stock, runs the full Incentive X-Ray on every analyst calling it a 'buy'. Then inverts the thesis: what could destroy HDFC Bank? Identifies all active market cognitive biases before allocating a single rupee.",
            switchModeName: "Psychological Clarity Mode",
            switchModeFocus: "Bias Removal &rarr; Rational Allocation"
        },
        naval: {
            id: "naval",
            name: "Naval Ravikant",
            subtitle: "The Wealth Creation Architecture",
            priColor: "#b45309",
            secColor: "#451a03",
            analogyTitle: "Paisa Nahi, System Banao.",
            analogyIcon: "fa-infinity",
            analogyText: `
                <p class="mb-4">Naval doesn't trade markets. He builds <b>systems that generate money while he sleeps</b>. His foundational truth: you will never get rich renting out your time — no matter how high your salary is.</p>
                <div class="p-5 border-l-4 border-amber-700 bg-amber-700/10 rounded-r-xl my-6">
                    <p class="text-amber-500 font-medium italic">"Trading paisa deta hai. Ownership wealth banata hai. Wealth = Assets &times; Leverage &times; Time."</p>
                </div>
                <p>The average Indian dreams of a high-paying job. Naval says that is Level 1 thinking. True leverage comes from Code and Media &mdash; assets that scale to millions of users at zero marginal cost.</p>
                <p class="mt-4">The path: generate early capital via trading &rarr; deploy into equity ownership &rarr; build scalable systems (SaaS, content, platforms) &rarr; compound across 10-20 years. Judgment — not hard work — is the ultimate force multiplier at this level.</p>
            `,
            diagramTitle: "The Leverage Pyramid",
            diagramDesc: "Map your income sources from low-leverage time-selling up to zero-marginal-cost Code & Media systems.",
            scenarios: [
                {
                    title: "You have a stable job earning ₹15L/year. How do you scale?",
                    action: "EQUITY SHIFT REQUIRED",
                    color: "text-amber-500",
                    response: "Kink #2: Equity > Salary. Your time income has a ceiling — you cannot work more than 24 hours per day. Redirect 20% of savings into equity (direct stocks or startup angels) and start building a parallel Code or Media leverage asset immediately."
                },
                {
                    title: "You made ₹5L profit in trading. What next?",
                    action: "DEPLOY INTO OWNERSHIP",
                    color: "text-green-400",
                    response: "Trading generated the capital. Now deploy it into a ownership asset — not another trade. This could be equity in a high-conviction startup, a SaaS product that serves your niche knowledge, or a content brand. Kink #1: Infinite Scale Edge."
                },
                {
                    title: "You have deep knowledge of financial derivatives. What's the leverage?",
                    action: "SPECIFIC KNOWLEDGE PLAY",
                    color: "text-blue-400",
                    response: "Kink #3: Non-Commodity Skills. Very few people understand derivatives deeply. Build a paid newsletter, a SaaS tool for derivatives traders, or become a fractional CFO. Code or Media leverage converts this specific knowledge into infinite-scale income."
                }
            ],
            desiTitle: "India's Leverage Opportunity",
            desiCoreText: `
                <p>India is perfect for Naval's framework: 1.4B population, rising internet penetration, exploding middle class &mdash; all creating massive leverage opportunities.</p>
                <p class="mt-2 text-white"><b>Code Leverage:</b><br>Zerodha built a system serving millions of traders with virtually zero marginal cost per user. That is Naval's model at national scale — specific knowledge (trading infrastructure) + code leverage.</p>
                <p class="mt-2 text-white"><b>Media Leverage:</b><br>India's finance content ecosystem is exploding. One strong YouTube channel with 500K subscribers generates passive income from a single piece of knowledge content — forever.</p>
            `,
            desiEngine: [
                "<b>Step 1: Identify your Specific Knowledge.</b> What do you know deeply that most people don't? (Kink #3: Non-Commodity Skills)",
                "<b>Step 2: Find your highest Leverage type.</b> Labor &lt; Capital &lt; Code/Media. Migrate upward aggressively.",
                "<b>Step 3: Trade for seed capital.</b> Use markets to generate the initial capital stack for deployment.",
                "<b>Step 4: Buy Ownership, Not Time.</b> Every rupee should move you from salary-dependent to equity-compounding (Kink #2)."
            ],
            desiKink: `<h4 class="font-bold text-amber-600 mb-1">"TIME ARBITRAGE"</h4><p>India is addicted to short-term wins. Naval's edge is entirely counter-cultural: <b>Play a 10-20 year game while everyone else plays 10-day games.</b></p>`,
            desiMistakes: ["Optimizing salary instead of equity upside", "Using trading profits to fund lifestyle instead of ownership assets"],
            finosImplTitle: "Wealth Mode",
            finosImplTags: ["Leverage Map", "Asset Builder", "Ownership Tracker"],
            switchAction: "Build Ownership Systems",
            switchColor: "text-amber-600 border-amber-700 bg-amber-700/20",
            switchSight: "Ignores HDFC's quarterly EPS completely. Models the long-term ownership of HDFC equity as a compounding machine, overlaid with whether initiating a financial SaaS product on top of the HDFC API ecosystem could create even higher leverage returns.",
            switchModeName: "Wealth Architecture Mode",
            switchModeFocus: "Capital &rarr; Ownership &rarr; Leverage Systems"
        },
        graham: {
            id: "graham",
            name: "Benjamin Graham",
            subtitle: "The Value Foundation Architecture",
            priColor: "#16a34a",
            secColor: "#14532d",
            analogyTitle: "Price aur Value Alag Hai.",
            analogyIcon: "fa-scale-balanced",
            analogyText: `
                <p class="mb-4">Graham introduced the most important idea in the entire history of investing: <b>Price is NOT Value</b>. Market price is a temporary mood. Intrinsic value is permanent economic reality.</p>
                <div class="p-5 border-l-4 border-green-700 bg-green-700/10 rounded-r-xl my-6">
                    <p class="text-green-400 font-medium italic">"Sasta kharid, mehenga nahi &mdash; bas patience rakh. Mr. Market is your servant, not your master."</p>
                </div>
                <p>India is emotionally volatile with massive retail participation &mdash; the perfect ecosystem for Graham's edge. When Coal India is ignored and priced at 0.5x book value, Graham buys. When the crowd rushes in at 3x book, he has already exited.</p>
                <p class="mt-4">His two-pillar system: (1) Calculate Intrinsic Value rigorously from fundamentals. (2) Only buy when market price is at least 30% below that value &mdash; the <b>Margin of Safety</b>. This cushion protects against your own analytical errors, market volatility, and unforeseen events.</p>
            `,
            diagramTitle: "Price vs Intrinsic Value Tracker",
            diagramDesc: "Watch Mr. Market's mood oscillate around the stable line of true business value. The gap IS the opportunity.",
            scenarios: [
                {
                    title: "A quality NBFC is trading at 0.7x Book Value after a market panic",
                    action: "MARGIN OF SAFETY ACTIVE",
                    color: "text-green-400",
                    response: "Kink #3. Perfect Graham setup. Intrinsic Value > Market Price by >30%. Mr. Market is in panic mode. This is NOT a risk — this is the Margin of Safety working exactly as designed. Buy in tranches."
                },
                {
                    title: "A narrative tech stock trades at 80x earnings with no profits",
                    action: "DATA OVER DRAMA",
                    color: "text-red-400",
                    response: "Kink #4. No earnings, no book value, no Margin of Safety. You are buying a story, not a business. Graham doesn't touch it. 'Price is what you pay, value is what you get' — and here you are getting very little."
                },
                {
                    title: "PSU stock doubles in one year on government policy news",
                    action: "PERCEPTION GAP CLOSE",
                    color: "text-yellow-400",
                    response: "Kink #1. The Perception Gap is closing. Same company, same earnings — just different narrative. Your Margin of Safety has either been consumed or exceeded. Graham exits when price meets or surpasses intrinsic value."
                }
            ],
            desiTitle: "India's Value Opportunity",
            desiCoreText: `
                <p>India is structurally undervalued in pockets — PSUs, NBFCs, cyclical sectors. These are Graham's hunting grounds.</p>
                <p class="mt-2 text-white"><b>Case — PSU Rally (Coal India):</b><br>Ignored for years at 0.6x Book Value. Kink #1: The Perception Gap. Same fundamentals, different story. Graham identified the gap between reality (cash-generating utility) and perception (ignored state company).</p>
                <p class="mt-2 text-white"><b>Mr. Market in India:</b><br>India's retail-driven markets create extreme mood oscillations — exuberance and despair amplified by social media. Kink #2: Ignore Market Mood. Use Mr. Market's panic to buy, his euphoria to sell.</p>
            `,
            desiEngine: [
                "<b>Step 1: Calculate Intrinsic Value.</b> Use earnings power, book value, and conservative growth. Numbers only — no stories.",
                "<b>Step 2: Apply Margin of Safety.</b> Only buy at 30%+ discount to intrinsic value. This is non-negotiable (Kink #3).",
                "<b>Step 3: Ignore Mr. Market's Mood (Kink #2).</b> His daily offer is data input, not a command to trade.",
                "<b>Step 4: Hold Until Value is Recognized.</b> Patience is the mechanism. The market WILL eventually price in reality."
            ],
            desiKink: `<h4 class="font-bold text-green-500 mb-1">"INEFFICIENCY = PROFIT"</h4><p>Markets are NOT efficient. Indian smallcaps and PSUs are routinely mispriced. <b>Kink #7: Every inefficiency is a profit opportunity for those with the patience to exploit it.</b></p>`,
            desiMistakes: ["Buying a falling stock without calculating Margin of Safety first", "Confusing low price with low value — a ₹5 stock can be expensive at ₹5"],
            finosImplTitle: "Intrinsic Value Engine",
            finosImplTags: ["Margin of Safety Meter", "Mr. Market Mode", "Data Filter"],
            switchAction: "Run Intrinsic Value Scan",
            switchColor: "text-green-400 border-green-700 bg-green-700/20",
            switchSight: "Ignores HDFC Bank's brand, history, and analyst targets. Calculates Book Value, Earnings Power, and P/E vs sector median. Derives intrinsic value. If market price < 0.70 × intrinsic value, it is a buy. Otherwise: wait.",
            switchModeName: "Value Discovery Mode",
            switchModeFocus: "Intrinsic Value &rarr; Margin of Safety &rarr; Buy"
        }
    };
    // --- 2. DOM ELEMENTS ---
    const heroName = document.getElementById('heroName');
    const heroSubtitle = document.getElementById('heroSubtitle');
    const analogyTitle = document.getElementById('analogyTitle');
    const analogyIcon = document.getElementById('analogyIcon');
    const analogyText = document.getElementById('analogyText');
    const diagramTitle = document.getElementById('diagramTitle');
    const diagramDesc = document.getElementById('diagramDesc');
    const diagramControls = document.getElementById('diagramControls');
    const canvasContainer = document.getElementById('interactiveCanvas');
    const navItems = document.querySelectorAll('.nav-item');
    const scenarioList = document.getElementById('scenarioList');
    const sandboxResponse = document.getElementById('sandboxResponse');
    const sbName = document.getElementById('sbName');

    let currentSimulation = null; // Store reference to cancel animations

    // --- 3. PAGE INITIALIZATION ---
    // Start with Buffett or check URL params
    const urlParams = new URLSearchParams(window.location.search);
    let activeId = urlParams.get('investor') || 'buffett';
    if (!profiles[activeId]) activeId = 'buffett';

    const loadProfile = (id) => {
        const data = profiles[id];

        // Update styling
        document.body.setAttribute('data-hero', id);

        // Active Nav State Update
        navItems.forEach(btn => {
            if (btn.dataset.target === id) {
                btn.classList.add('bg-white/10', 'border', 'border-white/10', 'text-white');
                btn.classList.remove('text-gray-400');
            } else {
                btn.classList.remove('bg-white/10', 'border', 'border-white/10', 'text-white');
                btn.classList.add('text-gray-400');
            }
        });

        // Basic DOM Resets Contexts
        sandboxResponse.innerHTML = `<p class="text-gray-500 text-lg italic font-light text-center w-full">Select a scenario on the left to see how <span class="font-bold text-white">${data.name}</span> would react...</p>`;

        // Identify new DOM elements for V5
        const desiTitle = document.getElementById('desiTitle');
        const desiCoreHeader = document.getElementById('desiCoreHeader');
        const desiCoreText = document.getElementById('desiCoreText');
        const desiKink = document.getElementById('desiKink');
        const desiEngineList = document.getElementById('desiEngineList');
        const desiMistakes = document.getElementById('desiMistakes');
        const finosImplTitle = document.getElementById('finosImplTitle');
        const finosImplTags = document.getElementById('finosImplTags');

        // GSAP Animate Text Change (Hero, Text Blocks, Desi Data)
        gsap.to([heroName, heroSubtitle, analogyTitle, analogyText, diagramTitle, diagramDesc, scenarioList, desiTitle, desiCoreText, desiKink, desiEngineList, desiMistakes, finosImplTitle, finosImplTags], {
            opacity: 0,
            y: -10,
            duration: 0.3,
            onComplete: () => {
                heroName.textContent = data.name;
                heroSubtitle.textContent = data.subtitle;
                analogyTitle.textContent = data.analogyTitle;
                analogyIcon.className = `fa-solid ${data.analogyIcon} text-[300px] text-[${data.priColor}]`;
                analogyText.innerHTML = data.analogyText;
                diagramTitle.textContent = data.diagramTitle;
                diagramDesc.textContent = data.diagramDesc;

                // Inject Massive V5 Desi Data
                desiTitle.textContent = data.desiTitle;
                desiCoreText.innerHTML = data.desiCoreText;
                desiKink.innerHTML = data.desiKink;
                desiEngineList.innerHTML = data.desiEngine.map((step, idx) => `
                    <div class="relative">
                        <span class="absolute -left-10 top-0 w-8 h-8 rounded-full border border-white/20 bg-[#0a0a0c] flex items-center justify-center text-xs font-mono text-[${data.priColor}]">${idx + 1}</span>
                        <p class="text-gray-300 text-sm leading-relaxed">${step}</p>
                    </div>
                `).join('');
                desiMistakes.innerHTML = data.desiMistakes.map(err => `<li class="flex items-start"><i class="fa-solid fa-xmark mt-1 mr-2 text-red-500"></i> ${err}</li>`).join('');
                finosImplTitle.textContent = data.finosImplTitle;
                finosImplTitle.style.color = data.priColor;
                finosImplTags.innerHTML = data.finosImplTags.map(tag => `<span class="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] uppercase tracking-widest text-gray-400">${tag}</span>`).join('');

                // Build Scenarios UI
                scenarioList.innerHTML = data.scenarios.map((s, idx) => `
                    <button class="w-full text-left p-4 rounded-xl border border-white/10 bg-black/40 hover:bg-white/10 hover:border-white/30 transition-all group group-hover:scale-[1.01]" onclick="triggerSandbox(${idx}, '${id}')">
                        <div class="flex items-start">
                            <span class="text-[${data.priColor}] font-mono text-xs mr-3 mt-1 opacity-70 group-hover:opacity-100">0${idx + 1}</span>
                            <span class="text-gray-200 group-hover:text-white">${s.title}</span>
                        </div>
                    </button>
                `).join('');

                gsap.to([heroName, heroSubtitle, analogyTitle, analogyText, diagramTitle, diagramDesc, scenarioList, desiTitle, desiCoreText, desiKink, desiEngineList, desiMistakes, finosImplTitle, finosImplTags], {
                    opacity: 1,
                    y: 0,
                    duration: 0.6,
                    stagger: 0.05
                });
            }
        });

        // Initialize Diagram Visualizations
        initDiagram(id);
    };

    // Nav Click Listeners
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentSimulation) currentSimulation.kill && currentSimulation.kill();
            loadProfile(btn.dataset.target);
            // Smooth scroll back to top of narrative on swap
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // --- 4. SANDBOX LOGIC ---
    window.triggerSandbox = (scenarioIdx, id) => {
        const scenario = profiles[id].scenarios[scenarioIdx];

        // Reset Response Box
        sandboxResponse.innerHTML = `<div class="flex justify-center my-6"><i class="fa-solid fa-circle-notch fa-spin text-2xl text-[${profiles[id].priColor}]"></i></div>`;

        gsap.fromTo(sandboxResponse, { opacity: 0 }, { opacity: 1, duration: 0.2 });

        setTimeout(() => {
            sandboxResponse.innerHTML = `
                <div class="border-l-4 border-[${profiles[id].priColor}] pl-6">
                    <h4 class="text-sm tracking-widest uppercase font-bold text-gray-500 mb-2">Calculated Action</h4>
                    <p class="text-3xl font-display font-bold ${scenario.color} drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] mb-4 animate-pulse">${scenario.action}</p>
                    <div class="h-px w-full bg-white/10 mb-4"></div>
                    <p class="text-gray-300 font-light text-lg leading-relaxed italic">"${scenario.response}"</p>
                </div>
            `;
            gsap.fromTo(sandboxResponse.children, { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.2, ease: "power2.out" });
        }, 800);
    };

    // --- 5. DIAGRAM ROUTER (Existing Logic Retained for Layout Structure) ---
    const initDiagram = (id) => {
        canvasContainer.innerHTML = "";
        diagramControls.innerHTML = "";
        const width = canvasContainer.clientWidth;
        const height = canvasContainer.clientHeight;
        const svg = d3.select("#interactiveCanvas").append("svg").attr("width", width).attr("height", height).attr("class", "svg-diagram");

        if (id === "buffett") initBuffett(svg, width, height, profiles[id]);
        if (id === "simons") initSimons(svg, width, height, profiles[id]);
        if (id === "soros") initSoros(svg, width, height, profiles[id]);
        if (id === "burry") initBurry(svg, width, height, profiles[id]);
        if (id === "lynch") initLynch(svg, width, height, profiles[id]);
        if (id === "dalio") initDalio(svg, width, height, profiles[id]);
        if (id === "livermore") initLivermore(svg, width, height, profiles[id]);
        if (id === "munger") initMunger(svg, width, height, profiles[id]);
        if (id === "naval") initNaval(svg, width, height, profiles[id]);
        if (id === "graham") initGraham(svg, width, height, profiles[id]);
    };

    // ... Retention of original complex D3 methods (omitted heavy D3 boilerplate here for brevity of tool limit, assuming exact previous math logic) ...
    // Since we overwrote the whole file, I will dynamically inject the old D3 functions here.

    const initBuffett = (svg, width, height, data) => {
        diagramControls.innerHTML = `
            <label class="text-xs font-mono text-gray-400 flex justify-between uppercase"><span>Time Horizon</span><span id="bTimeVal" class="text-white font-bold">1 Year</span></label>
            <input type="range" id="bTimeSlider" min="1" max="20" value="1" class="w-full range-styled mt-2">
            <div class="flex items-center mt-3 text-[10px] space-x-4">
                <span class="flex items-center"><span class="w-3 h-1 bg-[${data.priColor}] md:w-4 mr-2 rounded"></span> Intrinsic Value</span>
                <span class="flex items-center"><span class="w-3 h-1 bg-gray-500 md:w-4 mr-2 rounded"></span> Market Price</span>
            </div>
        `;
        const bSlider = document.getElementById('bTimeSlider');
        const generateData = (years) => {
            let intrinsicData = [], marketData = [];
            let points = years * 10, currentIntrinsic = 10, currentMarket = 10;
            for (let i = 0; i <= points; i++) {
                intrinsicData.push({ x: i, y: currentIntrinsic });
                let volatility = (20 - (years / 2)) * (Math.random() - 0.5);
                let noise = Math.sin(i * 0.5) * volatility;
                if (i === 0) marketData.push({ x: i, y: currentIntrinsic });
                else {
                    let price = currentIntrinsic + noise;
                    if (i === points && years === 20) price = currentIntrinsic;
                    marketData.push({ x: i, y: price });
                }
                currentIntrinsic += 1.5;
            }
            return { intrinsic: intrinsicData, market: marketData, maxPoints: points, maxVal: currentIntrinsic + 20 };
        };
        const renderChart = (years) => {
            document.getElementById('bTimeVal').textContent = `${years} Year${years > 1 ? 's' : ''}`;
            const plot = generateData(years), xScale = d3.scaleLinear().domain([0, plot.maxPoints]).range([50, width - 50]), yScale = d3.scaleLinear().domain([0, plot.maxVal]).range([height - 50, 50]);
            const lineGen = d3.line().x(d => xScale(d.x)).y(d => yScale(d.y)).curve(years < 5 ? d3.curveMonotoneX : d3.curveBasis);
            svg.selectAll('*').remove();
            svg.append("g").attr("transform", `translate(50, 0)`).call(d3.axisLeft(yScale).ticks(5)).attr("class", "text-gray-700 opacity-50").selectAll("path, line").attr("stroke", "#333");
            const path1 = svg.append("path").datum(plot.intrinsic).attr("class", "line-chart glow-line").attr("stroke", data.priColor).attr("d", lineGen);
            const path2 = svg.append("path").datum(plot.market).attr("class", "line-chart glow-line-secondary").attr("stroke", "#6b7280").attr("d", lineGen);
            const t1 = path1.node().getTotalLength(), t2 = path2.node().getTotalLength();
            path1.attr("stroke-dasharray", t1).attr("stroke-dashoffset", t1);
            path2.attr("stroke-dasharray", t2).attr("stroke-dashoffset", t2);
            gsap.to(path1.node(), { strokeDashoffset: 0, duration: 1.5, ease: "power2.out" });
            gsap.to(path2.node(), { strokeDashoffset: 0, duration: 1.5, ease: "power2.out" });
        };
        renderChart(1);
        bSlider.addEventListener('input', (e) => renderChart(parseInt(e.target.value)));
    };

    const initSimons = (svg, width, height, data) => {
        diagramControls.innerHTML = `
            <button id="sTrigger" class="w-full py-3 rounded border border-[${data.priColor}] bg-[${data.priColor}]/10 hover:bg-[${data.priColor}]/20 text-white font-mono uppercase tracking-widest text-xs transition-all flex items-center justify-center pulse-badge">
                <i class="fa-solid fa-microchip mr-2"></i> Initiate Model
            </button>
            <div class="mt-3 text-center"><p class="text-[10px] text-gray-400 font-mono" id="sStatus">STATUS: CHAOTIC DATA</p></div>
        `;
        const numDots = 300; let dots = [];
        for (let i = 0; i < numDots; i++) dots.push({ id: i, rx: Math.random() * width, ry: Math.random() * height, bx: null, by: null });
        const meanX = width / 2, devX = width / 6; let bins = new Array(20).fill(0), binWidth = width / 20;
        dots.forEach(d => {
            let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
            let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            d.bx = (num * devX) + meanX; if (d.bx < 0) d.bx = 10; if (d.bx > width) d.bx = width - 10;
            let bIdx = Math.floor(d.bx / binWidth); if (bIdx >= 20) bIdx = 19; if (bIdx < 0) bIdx = 0;
            bins[bIdx]++; d.by = (height - 50) - (bins[bIdx] * 15);
        });
        const circs = svg.selectAll("circle").data(dots).enter().append("circle").attr("cx", d => d.rx).attr("cy", d => d.ry).attr("r", 3).attr("fill", "#4b5563").attr("opacity", 0.6);
        currentSimulation = gsap.to(circs.nodes(), { cx: "random(0, " + width + ")", cy: "random(0, " + height + ")", duration: 5, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { amount: 2, from: "random" } });
        document.getElementById('sTrigger').addEventListener('click', () => {
            currentSimulation.kill();
            document.getElementById('sStatus').textContent = "STATUS: PROBABILITY DETECTED";
            document.getElementById('sStatus').style.color = data.priColor;
            gsap.to(circs.nodes(), {
                cx: (i) => dots[i].bx, cy: (i) => dots[i].by,
                fill: (i) => { if (dots[i].bx < meanX - devX * 1.5 || dots[i].bx > meanX + devX * 1.5) return "#ef4444"; return data.priColor; },
                opacity: 0.9, duration: 2, stagger: 0.005, ease: "elastic.out(1, 0.5)"
            });
        });
    };

    const initSoros = (svg, width, height, data) => {
        diagramControls.innerHTML = `<div class="text-center"><p class="text-xs text-gray-400 font-mono mb-2 uppercase">Core Feedback Mechanism</p><div class="flex items-center justify-center space-x-3 text-[10px]"><span class="text-gray-300">Cognitive Function</span><i class="fa-solid fa-right-left text-[${data.priColor}]"></i><span class="text-white">Participating Function</span></div></div>`;
        const centerX = width / 2, centerY = height / 2, radiusX = Math.min(width / 3, 150), radiusY = Math.min(height / 3, 80);
        const pathData = `M ${centerX - radiusX},${centerY} A ${radiusX},${radiusY} 0 1,1 ${centerX + radiusX},${centerY} A ${radiusX},${radiusY} 0 1,1 ${centerX - radiusX},${centerY}`;
        svg.append("path").attr("d", pathData).attr("fill", "none").attr("stroke", "rgba(255,255,255,0.1)").attr("stroke-width", 2).attr("stroke-dasharray", "5,5");
        const nodes = [{ id: "Perception", x: centerX, y: centerY - radiusY, label: "Market Sentiment / Perception" }, { id: "Fundamentals", x: centerX, y: centerY + radiusY, label: "Fundamental Reality" }];
        svg.selectAll(".soros-bg").data(nodes).enter().append("circle").attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 8).attr("fill", data.secColor).attr("class", "glow-line");
        svg.selectAll(".soros-txt").data(nodes).enter().append("text").attr("x", d => d.x).attr("y", d => d.y - 15).attr("text-anchor", "middle").attr("fill", "#fff").attr("font-size", "12px").text(d => d.label);
        const runner = svg.append("circle").attr("r", 6).attr("fill", data.priColor).attr("class", "glow-line");
        currentSimulation = gsap.to(runner.node(), {
            duration: 4, repeat: -1, ease: "linear",
            onUpdate: function () {
                const prog = this.progress(), angle = prog * Math.PI * 2;
                runner.attr("cx", centerX - Math.cos(angle) * radiusX).attr("cy", centerY - Math.sin(angle) * radiusY);
                if (prog > 0.24 && prog < 0.26) svg.select(`circle[cy="${centerY - radiusY}"]`).attr("r", 15).transition().duration(500).attr("r", 8);
                if (prog > 0.74 && prog < 0.76) svg.select(`circle[cy="${centerY + radiusY}"]`).attr("r", 15).transition().duration(500).attr("r", 8);
            }
        });
    };

    const initBurry = (svg, width, height, data) => {
        diagramControls.innerHTML = `<button id="bTrigger" class="w-full py-2 border border-orange-500/30 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-bold uppercase transition hover:bg-orange-500/20 pulse-badge">Advance Time to Breakpoint</button>`;
        const consensus = [{ x: 50, y: height - 50 }, { x: width * 0.3, y: height / 2 }, { x: width * 0.6, y: height * 0.2 }, { x: width * 0.8, y: height * 0.15 }, { x: width - 50, y: height - 50 }];
        const reality = [{ x: 50, y: height - 50 }, { x: width * 0.3, y: height / 2 + 20 }, { x: width * 0.6, y: height * 0.7 }, { x: width * 0.8, y: height * 0.8 }, { x: width - 50, y: height - 90 }];
        const lineGen = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveMonotoneX);
        const pReal = svg.append("path").attr("d", lineGen(reality)).attr("fill", "none").attr("stroke", data.priColor).attr("stroke-width", 3).attr("class", "glow-line");
        const pCons = svg.append("path").attr("d", lineGen(consensus)).attr("fill", "none").attr("stroke", "#ef4444").attr("stroke-width", 3).attr("class", "glow-line-secondary");
        svg.append("clipPath").attr("id", "revealClip").append("rect").attr("width", width * 0.6).attr("height", height);
        pReal.attr("clip-path", "url(#revealClip)"); pCons.attr("clip-path", "url(#revealClip)");

        document.getElementById('bTrigger').addEventListener('click', (e) => {
            gsap.to(svg.select("#revealClip rect").node(), {
                width: width, duration: 2.5, ease: "power2.inOut",
                onComplete: () => { e.target.textContent = "BUBBLE COLLAPSE EXPERIENCED"; e.target.className = "mt-4 w-full py-2 border border-white/10 bg-white/5 text-gray-500 rounded-lg text-xs font-bold uppercase pointer-events-none"; }
            });
            setTimeout(() => {
                svg.append("text").attr("x", width * 0.8).attr("y", height * 0.7).attr("fill", data.priColor).attr("font-size", "24px").attr("font-weight", "bold").attr("text-anchor", "middle").text("ALPHA EXTRACTED").attr("opacity", 0).transition().duration(1000).attr("opacity", 1);
            }, 1500);
        });
    };

    const initLynch = (svg, width, height, data) => {
        diagramControls.innerHTML = `<button id="lTrigger" class="w-full py-2 border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs font-bold uppercase transition hover:bg-yellow-500/20 pulse-badge">Inject Ground Signal</button>`;

        // Heatmap Grid logic to show isolated anomalies turning into macro clusters
        const cols = 20, rows = 12;
        const cellW = width / cols, cellH = height / rows;
        let gridData = [];

        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                gridData.push({ x: i * cellW, y: j * cellH, w: cellW, h: cellH, active: false });
            }
        }

        const rects = svg.selectAll("rect.heatmap-cell").data(gridData).enter()
            .append("rect")
            .attr("class", "heatmap-cell")
            .attr("x", d => d.x + 2).attr("y", d => d.y + 2)
            .attr("width", d => d.w - 4).attr("height", d => d.h - 4)
            .attr("fill", "rgba(255,255,255,0.05)")
            .attr("rx", 4);

        document.getElementById('lTrigger').addEventListener('click', () => {
            currentSimulation && currentSimulation.kill && currentSimulation.kill();
            const targetCells = [];
            for (let i = 0; i < 15; i++) {
                targetCells.push(Math.floor(Math.random() * gridData.length));
            }
            gsap.to(rects.filter((d, i) => targetCells.includes(i)).nodes(), {
                fill: data.priColor,
                opacity: 0.9,
                scale: 1.1,
                transformOrigin: "center center",
                duration: 0.5,
                stagger: 0.05,
                ease: "back.out(1.7)"
            });
        });
    };

    const initDalio = (svg, width, height, data) => {
        diagramControls.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <span class="text-xs uppercase font-bold text-gray-400 tracking-widest">Macro Cycle</span>
                <span id="dPhase" class="text-purple-400 font-mono text-sm font-bold bg-purple-500/10 px-3 py-1 rounded">EARLY EXPANSION</span>
            </div>
            <button id="dTrigger" class="w-full py-2 border border-purple-500/30 bg-purple-500/10 text-purple-400 rounded-lg text-xs font-bold uppercase transition hover:bg-purple-500/20 pulse-badge flex justify-center items-center">
                <i class="fa-solid fa-bolt mr-2"></i> Inject Liquidity (Flatten Interest Rates)
            </button>
        `;

        // The Economic Machine: A massive oscillating wave (Sine wave) superimposed over an upward trending line (Productivity).
        svg.append("defs").append("linearGradient").attr("id", "dalioGrad").attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%")
            .selectAll("stop").data([{ offset: "0%", color: data.priColor }, { offset: "100%", color: "transparent" }])
            .enter().append("stop").attr("offset", d => d.offset).attr("stop-color", d => d.color).attr("stop-opacity", (d, i) => i === 0 ? 0.3 : 0);

        let productivityData = [{ x: 50, y: height - 50 }, { x: width - 50, y: 50 }];
        svg.append("line").attr("x1", 50).attr("y1", height - 50).attr("x2", width - 50).attr("y2", 50).attr("stroke", "#4b5563").attr("stroke-width", 2).attr("stroke-dasharray", "5,5");

        let waveData = [];
        const numPoints = 100;
        let amplitude = height * 0.15;
        let frequency = 2; // Two full cycles
        for (let i = 0; i <= numPoints; i++) {
            let x = 50 + (i / numPoints) * (width - 100);
            let trendY = (height - 50) - (i / numPoints) * (height - 100);
            let waveY = trendY - Math.sin((i / numPoints) * Math.PI * 2 * frequency) * amplitude;
            waveData.push({ x: x, y: waveY, trendY: trendY });
        }

        let lineGen = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveBasis);
        let areaGen = d3.area().x(d => d.x).y0(d => d.trendY).y1(d => d.y).curve(d3.curveBasis);

        const areaPath = svg.append("path").attr("d", areaGen(waveData)).attr("fill", "url(#dalioGrad)");
        const wavePath = svg.append("path").attr("d", lineGen(waveData)).attr("stroke", data.priColor).attr("stroke-width", 3).attr("fill", "none").attr("class", "glow-line");

        // Indicator dot on the cycle
        const indicator = svg.append("circle").attr("cx", waveData[25].x).attr("cy", waveData[25].y).attr("r", 8).attr("fill", "#fff").attr("stroke", data.priColor).attr("stroke-width", 3).attr("class", "glow-line shadow-[0_0_20px_#a855f7]");

        document.getElementById('dTrigger').addEventListener('click', (e) => {
            document.getElementById('dPhase').textContent = "MEGA LIQUIDITY BOOM";
            document.getElementById('dPhase').classList.add("animate-pulse");
            // Multiply amplitude heavily to simulate zero rates
            let newWaveData = waveData.map((d, i) => {
                let waveY = d.trendY - Math.sin((i / numPoints) * Math.PI * 2 * frequency) * (amplitude * 2.5);
                return { x: d.x, y: waveY, trendY: d.trendY };
            });
            gsap.to(wavePath.node(), { attr: { d: lineGen(newWaveData) }, duration: 2, ease: "elastic.out(1, 0.4)" });
            gsap.to(areaPath.node(), { attr: { d: areaGen(newWaveData) }, duration: 2, ease: "elastic.out(1, 0.4)" });
            gsap.to(indicator.node(), { attr: { cy: newWaveData[25].y }, duration: 2, ease: "elastic.out(1, 0.4)" });

            // Add particles flooding the screen (Money Printing visual)
            for (let p = 0; p < 50; p++) {
                let part = svg.append("circle").attr("cx", Math.random() * width).attr("cy", height).attr("r", 3).attr("fill", "#22c55e").attr("opacity", 0.6);
                gsap.to(part.node(), { cy: -50, x: "+=" + (Math.random() * 100 - 50), duration: Math.random() * 2 + 1, ease: "power1.in", onComplete: () => part.remove() });
            }
        });
    };

    const initLivermore = (svg, width, height, data) => {
        diagramControls.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <span class="text-xs uppercase font-bold text-gray-400 tracking-widest">Trend Phase</span>
                <span id="lPhase" class="text-gray-500 font-mono text-sm font-bold bg-white/5 border border-white/10 px-3 py-1 rounded">PHASE 1: ACCUMULATION</span>
            </div>
            <button id="livTrigger" class="w-full py-2 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 rounded-lg text-xs font-bold uppercase transition hover:bg-cyan-500/20 pulse-badge flex justify-center items-center">
                <i class="fa-solid fa-rocket mr-2"></i> Confirm Breakout Signal
            </button>
        `;

        // Draw flat accumulation price action
        let priceData = [];
        let numPoints = 80;
        let baseHeight = height * 0.7; // Start low for accumulation

        for (let i = 0; i <= numPoints; i++) {
            let x = 20 + (i / numPoints) * (width - 40);
            let noise = Math.sin(i * 1.5) * 10 + Math.random() * 5;
            // Flat accumulation
            priceData.push({ x: x, y: baseHeight + noise, index: i });
        }

        let lineGen = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveMonotoneX);

        // Grid lines mapping resistance
        const resistanceY = baseHeight - 25;
        svg.append("line").attr("x1", 20).attr("y1", resistanceY).attr("x2", width - 20).attr("y2", resistanceY)
            .attr("stroke", "#ef4444").attr("stroke-width", 2).attr("stroke-dasharray", "4,4").attr("class", "opacity-50");
        svg.append("text").attr("x", width / 2).attr("y", resistanceY - 5).attr("fill", "#ef4444").attr("font-size", "10px")
            .attr("text-anchor", "middle").text("CRITICAL RESISTANCE / BREAKOUT ZONE");

        // Candlestick style path
        const pricePath = svg.append("path").attr("d", lineGen(priceData))
            .attr("stroke", "#9ca3af").attr("stroke-width", 3).attr("fill", "none");

        // Volume Bars
        const volumeG = svg.append("g").attr("transform", `translate(0, ${height - 20})`);
        const volBars = volumeG.selectAll("rect").data(priceData).enter().append("rect")
            .attr("x", d => d.x - 1).attr("y", d => -Math.random() * 15 - 5).attr("width", 2)
            .attr("height", d => Math.random() * 15 + 5).attr("fill", "#4b5563");

        document.getElementById('livTrigger').addEventListener('click', () => {
            document.getElementById('lPhase').textContent = "PHASE 2: MARKUP (TREND ACTIVE)";
            document.getElementById('lPhase').className = "text-cyan-400 font-mono text-sm font-bold bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded shadow-[0_0_15px_#06b6d4]";

            // Alter Price Data: Blast past resistance into exponential markup
            let markupData = priceData.map((d, i) => {
                if (i < 30) return d; // Keep left side flat
                let exponential = Math.pow((i - 30) * 0.2, 2.5);
                let newY = d.y - exponential;
                // Clip at top
                if (newY < 20) newY = 20 + Math.random() * 5;
                return { x: d.x, y: newY, index: i };
            });

            gsap.to(pricePath.node(), { attr: { d: lineGen(markupData) }, stroke: data.priColor, duration: 2, ease: "power2.out" });
            pricePath.attr("class", "glow-line shadow-[0_0_20px_#06b6d4]");

            // Spike volume massively at breakout point
            volBars.each(function (d, i) {
                if (i > 25 && i < 35) {
                    gsap.to(this, { y: -50 - Math.random() * 20, height: 50 + Math.random() * 20, fill: data.priColor, duration: 1, ease: "bounce.out" });
                } else if (i >= 35) {
                    gsap.to(this, { y: -20 - Math.random() * 10, height: 20 + Math.random() * 10, fill: "#22c55e", duration: 1.5 });
                }
            });

            // Add BUY Signal marker
            const breakoutPoint = markupData[32];
            const marker = svg.append("circle").attr("cx", breakoutPoint.x).attr("cy", breakoutPoint.y).attr("r", 0).attr("fill", "#fff").attr("stroke", data.priColor).attr("stroke-width", 3);
            gsap.to(marker.node(), { r: 8, duration: 0.5, delay: 0.5, ease: "back.out(2)" });
            const textMarker = svg.append("text").attr("x", breakoutPoint.x - 10).attr("y", breakoutPoint.y - 15).attr("fill", "#fff").attr("font-size", "12px").attr("font-weight", "bold").text("PYRAMID ENTRY");
            gsap.from(textMarker.node(), { opacity: 0, y: 10, duration: 0.5, delay: 0.6 });
        });
    };

    const initMunger = (svg, width, height, data) => {
        const biases = [
            { id: "loss", label: "Loss Aversion", color: "#ef4444", x: 0.50, y: 0.20 },
            { id: "herd", label: "Herd Mentality", color: "#f59e0b", x: 0.20, y: 0.42 },
            { id: "over", label: "Overconfidence", color: "#a855f7", x: 0.80, y: 0.42 },
            { id: "recent", label: "Recency Bias", color: "#06b6d4", x: 0.25, y: 0.75 },
            { id: "fomo", label: "FOMO", color: "#22c55e", x: 0.75, y: 0.75 },
            { id: "anchor", label: "Anchoring", color: "#ec4899", x: 0.50, y: 0.55 },
        ].map(b => ({ ...b, px: b.x * width, py: b.y * height }));

        diagramControls.innerHTML = `<button id="mTrigger" class="w-full py-2 border border-amber-500/30 bg-amber-500/10 text-amber-400 rounded-lg text-xs font-bold uppercase transition hover:bg-amber-500/20 pulse-badge">Activate Bias Web</button>
        <p class="text-[10px] text-gray-500 text-center mt-2 font-mono">See how each bias feeds the next</p>`;

        const edges = [
            ["loss", "herd"], ["herd", "fomo"], ["fomo", "over"],
            ["over", "anchor"], ["anchor", "recent"], ["recent", "herd"], ["loss", "fomo"]
        ];
        edges.forEach(([a, b]) => {
            const na = biases.find(n => n.id === a), nb = biases.find(n => n.id === b);
            svg.append("line").attr("x1", na.px).attr("y1", na.py).attr("x2", nb.px).attr("y2", nb.py)
                .attr("stroke", "rgba(255,255,255,0.06)").attr("stroke-width", 2).attr("class", "edge-line");
        });

        const nodeG = svg.selectAll(".bias-node").data(biases).enter().append("g").attr("class", "bias-node");
        const circles = nodeG.append("circle").attr("cx", d => d.px).attr("cy", d => d.py)
            .attr("r", 8).attr("fill", d => d.color + "22").attr("stroke", d => d.color).attr("stroke-width", 2);
        nodeG.append("text").attr("x", d => d.px).attr("y", d => d.py + 22)
            .attr("text-anchor", "middle").attr("fill", d => d.color)
            .attr("font-size", "9px").attr("font-weight", "bold").text(d => d.label);

        document.getElementById('mTrigger').addEventListener('click', () => {
            gsap.to(circles.nodes(), { r: 32, duration: 0.8, stagger: 0.1, ease: "back.out(1.7)" });
            svg.selectAll("line.edge-line").each(function () {
                d3.select(this).transition().duration(1000).attr("stroke", data.priColor).attr("stroke-opacity", 0.45).attr("stroke-width", 2);
            });
        });
    };

    const initNaval = (svg, width, height, data) => {
        const levels = [
            { label: "LABOR LEVERAGE", sub: "Teams & Employees", color: "#6b7280", h: 0.25, y: 0.75 },
            { label: "CAPITAL LEVERAGE", sub: "Equity & Compounding", color: "#3b82f6", h: 0.25, y: 0.5 },
            { label: "CODE / MEDIA LEVERAGE", sub: "Infinite Scale", color: data.priColor, h: 0.25, y: 0.25 },
        ];

        diagramControls.innerHTML = `
            <button id="navTrigger" class="w-full py-2 border border-amber-700/30 bg-amber-700/10 text-amber-600 rounded-lg text-xs font-bold uppercase transition hover:bg-amber-700/20 pulse-badge">
                <i class="fa-solid fa-rocket mr-2"></i> Escape Time-For-Money Trap
            </button>
            <p class="text-[10px] text-gray-500 text-center mt-2 font-mono">Click to migrate up the Leverage Pyramid</p>
        `;

        // Draw Pyramid layers as stacked trapezoids
        levels.forEach((lv, i) => {
            const topWidth = (width * 0.3) + (i * width * 0.15);
            const botWidth = (width * 0.3) + ((i + 1) * width * 0.15);
            const yTop = lv.y * height;
            const yBot = (lv.y + lv.h) * height;
            const xMid = width / 2;

            const poly = svg.append("polygon")
                .attr("points", `
                    ${xMid - topWidth / 2},${yTop}
                    ${xMid + topWidth / 2},${yTop}
                    ${xMid + botWidth / 2},${yBot}
                    ${xMid - botWidth / 2},${yBot}
                `)
                .attr("fill", lv.color + "20")
                .attr("stroke", lv.color)
                .attr("stroke-width", 2)
                .attr("opacity", 0.5)
                .attr("class", `level-poly-${i}`);

            svg.append("text").attr("x", xMid).attr("y", yTop + 18)
                .attr("text-anchor", "middle").attr("fill", lv.color)
                .attr("font-size", "11px").attr("font-weight", "bold").text(lv.label);
            svg.append("text").attr("x", xMid).attr("y", yTop + 33)
                .attr("text-anchor", "middle").attr("fill", "#9ca3af")
                .attr("font-size", "9px").text(lv.sub);
        });

        document.getElementById('navTrigger').addEventListener('click', () => {
            // Animate bottom 2 layers fading, top layer expanding
            gsap.to(svg.select(".level-poly-0").node(), { fillOpacity: 0.05, strokeOpacity: 0.2, duration: 1 });
            gsap.to(svg.select(".level-poly-1").node(), { fillOpacity: 0.1, strokeOpacity: 0.4, duration: 1, delay: 0.3 });
            gsap.to(svg.select(".level-poly-2").node(), {
                fillOpacity: 0.5, strokeOpacity: 1, duration: 1.5, delay: 0.6, ease: "back.out(1.7)"
            });

            // Burst particles upward from the top
            for (let p = 0; p < 40; p++) {
                let part = svg.append("circle").attr("cx", width / 2 + (Math.random() - 0.5) * 80)
                    .attr("cy", height * 0.35).attr("r", 3).attr("fill", data.priColor).attr("opacity", 0.8);
                gsap.to(part.node(), {
                    cy: height * 0.05, x: "+=" + (Math.random() * 120 - 60),
                    opacity: 0, duration: Math.random() * 1.5 + 0.5, delay: Math.random() * 0.5,
                    ease: "power2.out", onComplete: () => part.remove()
                });
            }
        });
    };

    const initGraham = (svg, width, height, data) => {
        diagramControls.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <span class="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Market Mood</span>
                <span id="grahamMood" class="text-gray-400 font-mono text-xs bg-white/5 border border-white/10 px-2 py-1 rounded">MR. MARKET: RATIONAL</span>
            </div>
            <div class="flex gap-2">
                <button id="grahamPanic" class="flex-1 py-1.5 border border-red-500/30 bg-red-500/10 text-red-400 rounded text-[10px] font-bold uppercase transition hover:bg-red-500/20">Market Panic</button>
                <button id="grahamEuphoria" class="flex-1 py-1.5 border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 rounded text-[10px] font-bold uppercase transition hover:bg-yellow-500/20">Euphoria</button>
            </div>
        `;

        const pW = width - 40, pH = height - 40;
        const xOff = 20, yOff = 20;

        // Intrinsic Value line — flat with gentle growth
        const ivPoints = d3.range(0, pW, 5).map(x => ({
            x: x + xOff,
            y: yOff + pH * 0.5 - (x / pW) * pH * 0.3 // gentle upward slope
        }));

        // Market Price — oscillates wildly around IV
        let marketData = ivPoints.map((pt, i) => ({
            x: pt.x,
            y: pt.y + Math.sin(i * 0.25) * 50 + (Math.random() - 0.5) * 20
        }));

        const lineGen = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveMonotoneX);

        // Shaded buy zone below IV
        svg.append("path")
            .datum(ivPoints)
            .attr("d", d3.area().x(d => d.x).y0(d => d.y + 60).y1(d => d.y)(ivPoints))
            .attr("fill", data.priColor).attr("fill-opacity", 0.08);

        svg.append("text").attr("x", xOff + 5).attr("y", yOff + pH * 0.82).attr("fill", data.priColor)
            .attr("font-size", "9px").attr("font-weight", "bold").text("MARGIN OF SAFETY ZONE (BUY)");

        // IV Line
        svg.append("path").datum(ivPoints).attr("d", lineGen)
            .attr("stroke", data.priColor).attr("stroke-width", 3).attr("fill", "none").attr("stroke-dasharray", "8,4");
        svg.append("text").attr("x", xOff + pW - 80).attr("y", ivPoints[ivPoints.length - 1].y - 8)
            .attr("fill", data.priColor).attr("font-size", "9px").attr("font-weight", "bold").text("INTRINSIC VALUE");

        // Market Price Line
        const marketPath = svg.append("path").datum(marketData).attr("d", lineGen)
            .attr("stroke", "#f87171").attr("stroke-width", 2.5).attr("fill", "none");

        const panickifyData = () => {
            return ivPoints.map((pt, i) => ({
                x: pt.x,
                y: pt.y + 80 + Math.sin(i * 0.15) * 20 + Math.random() * 10 // price crashes below IV
            }));
        };
        const euphoriaData = () => {
            return ivPoints.map((pt, i) => ({
                x: pt.x,
                y: pt.y - 90 - Math.sin(i * 0.2) * 25 + Math.random() * 10 // price rockets above IV
            }));
        };

        document.getElementById("grahamPanic").addEventListener("click", () => {
            document.getElementById("grahamMood").textContent = "MR. MARKET: PANIC — BUY SIGNAL!";
            document.getElementById("grahamMood").className = "text-green-400 font-mono text-xs bg-green-500/10 border border-green-500/30 px-2 py-1 rounded shadow-[0_0_10px_#16a34a]";
            gsap.to(marketPath.node(), { attr: { d: lineGen(panickifyData()) }, stroke: "#ef4444", duration: 1.5, ease: "power2.out" });
        });
        document.getElementById("grahamEuphoria").addEventListener("click", () => {
            document.getElementById("grahamMood").textContent = "MR. MARKET: EUPHORIC — SELL / AVOID!";
            document.getElementById("grahamMood").className = "text-yellow-400 font-mono text-xs bg-yellow-500/10 border border-yellow-500/30 px-2 py-1 rounded shadow-[0_0_10px_#eab308]";
            gsap.to(marketPath.node(), { attr: { d: lineGen(euphoriaData()) }, stroke: "#facc15", duration: 1.5, ease: "power2.out" });
        });
    };

    // --- 6. ULTIMATE MINDSET SWITCHER LOGIC ---
    const switcherBtns = document.querySelectorAll('.switcher-btn');
    const switchAction = document.getElementById('switcherAction');
    const switchSight = document.getElementById('switcherSight');
    const switchModeName = document.getElementById('switcherModeName');
    const switchModeFocus = document.getElementById('switcherModeFocus');
    const switcherGlow = document.getElementById('switcherGlow');

    switcherBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.dataset.view;
            const data = profiles[targetId];

            // Reset buttons
            switcherBtns.forEach(b => {
                b.className = "switcher-btn w-full text-left p-4 rounded-xl font-display font-bold tracking-widest text-gray-500 uppercase transition-all hover:bg-white/5";
            });

            // Activate clicked button
            e.target.className = `switcher-btn w-full text-left p-4 rounded-xl font-display font-bold tracking-widest uppercase transition-all border bg-[${data.priColor}]/10 text-[${data.priColor}] border-[${data.priColor}]/40`;

            // Animate content swap
            gsap.to([switchAction, switchSight, switchModeName, switchModeFocus], {
                opacity: 0, y: 10, duration: 0.2, onComplete: () => {
                    switchAction.textContent = data.switchAction;
                    switchAction.className = `text-xs font-bold uppercase tracking-widest ${data.switchColor}`;
                    switchSight.innerHTML = data.switchSight;
                    switchModeName.textContent = data.switchModeName;
                    switchModeName.style.color = data.priColor;
                    switchModeFocus.innerHTML = data.switchModeFocus;
                    switcherGlow.style.backgroundColor = data.priColor;

                    gsap.to([switchAction, switchSight, switchModeName, switchModeFocus], {
                        opacity: 1, y: 0, duration: 0.4, stagger: 0.05
                    });
                }
            });
        });
    });

    // Load Default
    loadProfile(activeId);
});
