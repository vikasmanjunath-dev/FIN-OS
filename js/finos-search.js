/**
 * FIN-OS Global Smart Search
 * Injects next to #themeToggle on every page. Zero dependencies.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     SEARCH INDEX — every page, feature, calculator, tool
  ═══════════════════════════════════════════════════════ */
  const INDEX = [
    /* ── Core Pages ── */
    { title:'Dashboard',         desc:'Your financial command centre — DNA score, goals, recent activity',   url:'../html/dashboard.html',         cat:'Pages',       tags:['home','overview','summary','score','dna','command'] },
    { title:'Foundations',       desc:'Foundation Matrix — personal finance 101, principles, shield protocol',url:'../html/foundations.html',       cat:'Pages',       tags:['learn','basics','foundation','system','behavior','laws'] },
    { title:'Diagnostics',       desc:'Deep financial health scan — find leaks, risks and blind spots',       url:'../html/diagnostics.html',        cat:'Pages',       tags:['health','scan','diagnosis','leaks','risk','audit'] },
    { title:'Track Finances',    desc:'Track income, expenses, savings — your money flow at a glance',        url:'../html/track-finances.html',     cat:'Pages',       tags:['budget','expense','income','savings','cashflow','track'] },
    { title:'Live Tracker',      desc:'Real-time stock, crypto and market data feed',                         url:'../stock-dashboard/index.html',   cat:'Pages',       tags:['stocks','live','market','crypto','nifty','sensex','price'] },
    { title:'Train Mindset',     desc:'Simulator hub — train investor psychology and decision making',        url:'../html/simulator-landing.html',  cat:'Pages',       tags:['simulator','mindset','psychology','investor','training','bias'] },
    { title:'News',              desc:'Global Intel Matrix — live financial news shards',                      url:'../html/news.html',               cat:'Pages',       tags:['news','intel','global','market update','headlines','live'] },
    { title:'Settings',          desc:'Preferences, theme, notifications and account settings',               url:'../html/settings.html',           cat:'Pages',       tags:['settings','theme','dark','preferences','account','notification'] },
    { title:'Profile',           desc:'Your investor profile, DNA, risk tolerance and personal data',         url:'../html/profile.html',            cat:'Pages',       tags:['profile','user','investor','risk','dna','personal'] },
    { title:'Portfolio',         desc:'Track your stock and mutual fund portfolio in one place',              url:'../html/portfolio.html',          cat:'Pages',       tags:['portfolio','stocks','mf','holdings','returns','pl'] },
    { title:'Markets',           desc:'Markets overview — equity, debt, crypto, forex, commodities',          url:'../html/markets.html',            cat:'Pages',       tags:['markets','equity','debt','crypto','forex','commodity'] },
    { title:'Calculators',       desc:'50+ financial calculators for every money decision',                   url:'../html/calculators.html',        cat:'Pages',       tags:['calculator','tool','compute','finance','math'] },
    { title:'Clarity',           desc:'FIN-OS Clarity — cut through confusion with structured thinking',      url:'../html/clarity.html',            cat:'Pages',       tags:['clarity','decision','framework','thinking','structured'] },
    { title:'Know Your Finances',desc:'Deep dive into your financial picture — income, debt, net worth',      url:'../html/know-your-finances.html', cat:'Pages',       tags:['finances','know','picture','income','debt'] },
    { title:'Tax',               desc:'Tax planning, 80C, new vs old regime, capital gains overview',         url:'../html/tax.html',                cat:'Pages',       tags:['tax','80c','income tax','itr','regime','capital gains','tds'] },
    { title:'Investor Mindset',  desc:'Master the mental game of investing — biases, patience, conviction',   url:'../html/investor-mindset.html',   cat:'Pages',       tags:['mindset','psychology','bias','investor','mental','conviction'] },
    { title:'Investor Profile',  desc:'Discover your investor personality — aggressive, moderate or safe',    url:'../html/investor-profile.html',   cat:'Pages',       tags:['profile','personality','risk','aggressive','conservative'] },
    { title:'Financial Being',   desc:'Holistic financial wellness — stress, behaviour, life money score',    url:'../html/financial-being.html',    cat:'Pages',       tags:['wellness','wellbeing','stress','behaviour','life'] },
    { title:'Roadmap',           desc:'Your personalised financial roadmap — step by step wealth plan',       url:'../html/roadmap.html',            cat:'Pages',       tags:['roadmap','plan','steps','wealth','goal','journey'] },
    { title:'DNA Decoder',       desc:'Decode your financial DNA — what kind of money person are you?',       url:'../html/dna.html',                cat:'Pages',       tags:['dna','personality','money','type','decode','quiz'] },
    { title:'Principles',        desc:'Immutable laws of money — compounding, leverage, time value',          url:'../html/principles.html',         cat:'Pages',       tags:['principles','laws','rules','compounding','leverage','time'] },
    { title:'Finance 101',       desc:'Start from zero — income vs wealth, EMI disease, money myths busted',  url:'../html/finance101.html',         cat:'Pages',       tags:['finance 101','basics','beginner','income','wealth','myths','emi'] },
    { title:'Market Intel',      desc:'Deep market intelligence — macro, rates, flows, sentiment',            url:'../html/market-intel.html',       cat:'Pages',       tags:['intel','macro','rates','flows','sentiment','deep'] },
    { title:'Insurance Directory',desc:'Find the right term, health and life insurance — anti-wipeout shield', url:'../html/insurance-directory.html', cat:'Pages',      tags:['insurance','term','health','life','cover','premium','claim'] },
    { title:'Impact',            desc:'Social and ESG impact investing — align money with values',             url:'../html/impact.html',             cat:'Pages',       tags:['impact','esg','social','responsible','values','green'] },
    { title:'Decision Engine',   desc:'Buy vs rent, job vs business, invest vs prepay — smart life decisions', url:'../html/decision.html',           cat:'Pages',       tags:['decision','buy rent','job','business','versus','compare'] },
    { title:'Simulator',         desc:'Live investment simulator — practice without real money',               url:'../html/simulator.html',          cat:'Pages',       tags:['simulator','practice','paper trading','virtual','game'] },
    { title:'Trading Simulator', desc:'Trade stocks and F&O in a live simulated environment',                  url:'../html/trading-simulator.html',  cat:'Pages',       tags:['trading','simulator','fno','stocks','practice','paper'] },
    { title:'System Leak',       desc:'Find where your money leaks — subscriptions, EMIs, lifestyle inflation',url:'../html/system-leak.html',       cat:'Pages',       tags:['leak','expense','subscription','lifestyle','drain','identify'] },
    { title:'Tracker',           desc:'Day-to-day expense and income tracker',                                 url:'../html/tracker.html',            cat:'Pages',       tags:['tracker','daily','expense','income','log','record'] },
    { title:'Life Wealth',       desc:'Life milestones and wealth map — marriage, home, children, retirement',  url:'../html/life-wealth.html',       cat:'Pages',       tags:['life','milestones','marriage','home','children','retirement','plan'] },
    { title:'Foundations — Finance 101', desc:'Dismantle money myths, income vs wealth, EMI disease explained', url:'../html/finance101.html',       cat:'Learning',    tags:['finance 101','beginner','myths','income','wealth'] },

    /* ── Calculators: Investment & Wealth ── */
    { title:'SIP Calculator',        desc:'Calculate SIP returns — monthly investment, expected corpus, wealth creation', url:'../calculators/investment & wealth/sip.html',          cat:'Calculators', tags:['sip','mutual fund','monthly','invest','corpus','return','compounding'] },
    { title:'Lump Sum Calculator',   desc:'One-time investment returns calculator — how much will ₹X grow to?',           url:'../calculators/investment & wealth/lupsum.html',        cat:'Calculators', tags:['lump sum','one time','investment','return','grow','amount'] },
    { title:'CAGR Calculator',       desc:'Compound Annual Growth Rate — measure true investment performance',              url:'../calculators/investment & wealth/cagr.html',          cat:'Calculators', tags:['cagr','compound','growth','rate','performance','annual'] },
    { title:'Step-Up SIP',           desc:'Step-up SIP — increase your SIP amount each year and see the power',           url:'../calculators/investment & wealth/stepup.html',        cat:'Calculators', tags:['step up','sip','increase','annual','increment','sip boost'] },
    { title:'SWP Calculator',        desc:'Systematic Withdrawal Plan — monthly income from your corpus in retirement',    url:'../calculators/investment & wealth/swp.html',           cat:'Calculators', tags:['swp','withdrawal','income','retirement','corpus','monthly payout'] },
    { title:'Goal-Based SIP',        desc:'How much SIP do you need to reach your goal? Car, home, education, retirement', url:'../calculators/investment & wealth/goalbased.html',     cat:'Calculators', tags:['goal','target','sip','planning','car','home','education','retirement'] },
    { title:'Mutual Fund Returns',   desc:'Calculate returns on any mutual fund — XIRR, absolute, annualised',             url:'../calculators/investment & wealth/mutualfunds.html',   cat:'Calculators', tags:['mutual fund','mf','return','nav','xirr','annualised'] },
    { title:'Portfolio Returns',     desc:'Portfolio-level return calculator — combine all your investments',               url:'../calculators/investment & wealth/portfolio.html',      cat:'Calculators', tags:['portfolio','return','combined','holdings','overall','xirr'] },
    { title:'XIRR Calculator',       desc:'Extended IRR — accurate return for irregular cashflows and SIPs',               url:'../calculators/investment & wealth/xirr.html',          cat:'Calculators', tags:['xirr','irr','return','cashflow','irregular','accurate'] },
    { title:'Asset Allocation',      desc:'Build the right portfolio mix — equity, debt, gold for your risk profile',      url:'../calculators/investment & wealth/assetalloc.html',    cat:'Calculators', tags:['asset allocation','equity','debt','gold','mix','portfolio','risk'] },
    { title:'ETF Calculator',        desc:'ETF cost and return comparison — expense ratio vs active fund',                  url:'../calculators/investment & wealth/etf.html',           cat:'Calculators', tags:['etf','index fund','expense ratio','passive','cost','return'] },
    { title:'Dividend Calculator',   desc:'Dividend income calculator — yield, payout, reinvestment (DRIP)',               url:'../calculators/investment & wealth/dividend.html',      cat:'Calculators', tags:['dividend','yield','income','drip','reinvest','payout'] },
    { title:'Portfolio Rebalancing', desc:'When and how to rebalance — keep your allocation on track',                     url:'../calculators/investment & wealth/rebalancing.html',   cat:'Calculators', tags:['rebalance','allocation','drift','equity','debt','reset'] },
    { title:'Rolling Returns',       desc:'Rolling return analysis — see consistency of any investment over time',          url:'../calculators/investment & wealth/rollingreturns.html', cat:'Calculators',tags:['rolling','returns','consistency','analysis','period','fund'] },
    { title:'Tax-Adjusted Returns',  desc:'Real returns after tax — LTCG, STCG impact on your actual gains',              url:'../calculators/investment & wealth/taxadj.html',        cat:'Calculators', tags:['tax adjusted','ltcg','stcg','real return','after tax','gains'] },

    /* ── Calculators: Loans, Debt & EMI ── */
    { title:'EMI Calculator',        desc:'Calculate monthly EMI for any loan — home, car, personal',                      url:'../calculators/loans, debt & emi/emi.html',             cat:'Calculators', tags:['emi','loan','monthly','instalment','interest','principal'] },
    { title:'Home Loan EMI',         desc:'Home loan EMI, total interest and amortisation schedule',                        url:'../calculators/loans, debt & emi/home.html',            cat:'Calculators', tags:['home loan','housing','emi','mortgage','interest','property'] },
    { title:'Car Loan EMI',          desc:'Car loan EMI and total cost — is it worth it?',                                  url:'../calculators/loans, debt & emi/car.html',             cat:'Calculators', tags:['car loan','auto','emi','vehicle','interest','cost'] },
    { title:'Personal Loan',         desc:'Personal loan EMI and cost comparison across interest rates',                    url:'../calculators/loans, debt & emi/personal.html',        cat:'Calculators', tags:['personal loan','unsecured','emi','interest rate','tenure'] },
    { title:'Education Loan',        desc:'Education loan repayment plan — course cost vs ROI',                             url:'../calculators/loans, debt & emi/education.html',       cat:'Calculators', tags:['education loan','student','college','emi','repayment','roi'] },
    { title:'Credit Card Cost',      desc:'Credit card true cost — minimum payment trap and interest compounding',          url:'../calculators/loans, debt & emi/creditcard.html',      cat:'Calculators', tags:['credit card','interest','minimum payment','trap','cost','debt'] },
    { title:'Loan Eligibility',      desc:'How much home/personal loan can you get based on your income?',                  url:'../calculators/loans, debt & emi/loaneligibility.html', cat:'Calculators', tags:['eligibility','loan amount','income','foir','banks','qualify'] },
    { title:'Loan Tenure',           desc:'Shorter vs longer tenure — total interest difference calculator',                url:'../calculators/loans, debt & emi/loantenure.html',      cat:'Calculators', tags:['tenure','loan duration','short','long','interest','compare'] },
    { title:'EMI Prepayment',        desc:'Prepay your loan — how much interest and time do you save?',                    url:'../calculators/loans, debt & emi/emiprepay.html',       cat:'Calculators', tags:['prepay','part payment','loan','save interest','foreclose'] },
    { title:'Debt Snowball',         desc:'Debt payoff strategy — snowball vs avalanche, fastest way out of debt',          url:'../calculators/loans, debt & emi/debtsnow.html',        cat:'Calculators', tags:['debt','snowball','avalanche','payoff','strategy','multiple loans'] },
    { title:'Interest Rate Compare', desc:'Compare loan interest rates — flat vs reducing balance, real cost',              url:'../calculators/loans, debt & emi/interest.html',        cat:'Calculators', tags:['interest rate','flat','reducing','compare','actual','cost'] },

    /* ── Calculators: Tax & Salary ── */
    { title:'Income Tax Calculator', desc:'FY income tax — old vs new regime, slabs, surcharge, cess',                    url:'../calculators/tax & salary/income.html',               cat:'Calculators', tags:['income tax','itr','slab','old regime','new regime','fy','cess'] },
    { title:'Old vs New Regime',     desc:'Which tax regime saves you more? Side-by-side comparison',                      url:'../calculators/tax & salary/oldnew.html',               cat:'Calculators', tags:['old new regime','tax compare','115bac','deductions','savings'] },
    { title:'In-Hand Salary',        desc:'CTC to in-hand salary calculator — PF, PT, TDS, HRA deducted',                 url:'../calculators/tax & salary/inhand.html',               cat:'Calculators', tags:['ctc','inhand','salary','take home','pf','tds','hra','deduction'] },
    { title:'80C Deductions',        desc:'Maximise 80C — ELSS, PPF, LIC, EPF, home loan principal, SSY',                url:'../calculators/tax & salary/80c.html',                  cat:'Calculators', tags:['80c','deduction','elss','ppf','lic','epf','tax saving','limit'] },
    { title:'HRA Calculator',        desc:'HRA exemption — metro vs non-metro, actual vs 40/50% rule',                    url:'../calculators/tax & salary/hra.html',                  cat:'Calculators', tags:['hra','house rent','exemption','metro','tax','allowance'] },
    { title:'Capital Gains Tax',     desc:'LTCG and STCG tax on stocks, MF, property — after Budget 2024',               url:'../calculators/tax & salary/captalgains.html',          cat:'Calculators', tags:['capital gains','ltcg','stcg','tax','stocks','mutual fund','property','budget'] },
    { title:'Gratuity Calculator',   desc:'Gratuity amount on resignation or retirement — formula + eligibility',          url:'../calculators/tax & salary/gratuity.html',             cat:'Calculators', tags:['gratuity','resignation','retirement','formula','5 years','payout'] },
    { title:'Short-Long Term Gains', desc:'Short term vs long term capital gains — holding period matters',                url:'../calculators/tax & salary/shortlong.html',            cat:'Calculators', tags:['short term','long term','holding','capital gain','1 year','3 year'] },
    { title:'Leave Encashment',      desc:'Leave encashment tax exemption on retirement or during service',                url:'../calculators/tax & salary/leave.html',                cat:'Calculators', tags:['leave','encashment','pl','tax','exemption','retirement'] },
    { title:'Professional Tax',      desc:'Professional tax deduction by state — Maharashtra, Karnataka etc',              url:'../calculators/tax & salary/professional.html',         cat:'Calculators', tags:['professional tax','pt','state','maharashtra','karnataka','deduction'] },

    /* ── Calculators: Banking & Fixed Income ── */
    { title:'FD Calculator',         desc:'Fixed deposit maturity — cumulative vs payout, interest, TDS',                 url:'../calculators/banking & fixed income/fd.html',         cat:'Calculators', tags:['fd','fixed deposit','maturity','interest','bank','cumulative','tds'] },
    { title:'RD Calculator',         desc:'Recurring deposit — monthly savings, maturity, interest rate compare',          url:'../calculators/banking & fixed income/rd.html',         cat:'Calculators', tags:['rd','recurring deposit','monthly','maturity','savings','bank'] },
    { title:'PPF Calculator',        desc:'Public Provident Fund — 15-year corpus, tax-free, extension options',           url:'../calculators/banking & fixed income/ppf.html',        cat:'Calculators', tags:['ppf','public provident fund','tax free','15 year','80c','sovereign'] },
    { title:'EPF Calculator',        desc:'Employee Provident Fund — corpus at retirement, employer contribution',          url:'../calculators/banking & fixed income/epf.html',        cat:'Calculators', tags:['epf','employee provident fund','pf','retirement','employer','contribution'] },
    { title:'NPS Calculator',        desc:'National Pension System — corpus, annuity, Tier 1 vs Tier 2 returns',           url:'../calculators/banking & fixed income/nps.html',        cat:'Calculators', tags:['nps','national pension','annuity','retirement','tier 1','80ccd'] },
    { title:'Bond Calculator',       desc:'Bond yield, price, duration and coupon return calculator',                       url:'../calculators/banking & fixed income/bond.html',       cat:'Calculators', tags:['bond','yield','coupon','duration','price','fixed income','debt'] },
    { title:'SSY Calculator',        desc:'Sukanya Samriddhi Yojana — girl child scheme, 21-year corpus',                  url:'../calculators/banking & fixed income/ssy.html',        cat:'Calculators', tags:['ssy','sukanya samriddhi','girl child','21 year','government','scheme'] },
    { title:'Post Office Schemes',   desc:'Post office savings — MIS, NSC, KVP, Mahila, Senior Citizen comparison',       url:'../calculators/banking & fixed income/postoffice.html', cat:'Calculators', tags:['post office','mis','nsc','kvp','senior citizen','savings','government'] },
    { title:'Savings vs Investment', desc:'Should you save in FD or invest in equity? Break-even analysis',                url:'../calculators/banking & fixed income/savingsinvestment.html', cat:'Calculators', tags:['save','invest','fd vs equity','break even','compare','risk','return'] },
    { title:'SCSS Calculator',       desc:'Senior Citizens Savings Scheme — quarterly income, safety, returns',             url:'../calculators/banking & fixed income/scss.html',       cat:'Calculators', tags:['scss','senior citizen','quarterly','income','savings','government'] },

    /* ── Calculators: Financial Health ── */
    { title:'Net Worth Calculator',  desc:'Your true wealth — assets minus liabilities, net worth statement',              url:'../calculators/financial health/networth.html',         cat:'Calculators', tags:['net worth','assets','liabilities','wealth','statement','balance sheet'] },
    { title:'Emergency Fund',        desc:'How big should your emergency fund be? 3, 6, or 12 months?',                   url:'../calculators/financial health/emergencyfund.html',    cat:'Calculators', tags:['emergency fund','safety net','months','expenses','liquid','crisis'] },
    { title:'Savings Rate',          desc:'What % of income do you save? Benchmark against FIRE targets',                  url:'../calculators/financial health/savings.html',          cat:'Calculators', tags:['savings rate','income','save','fire','percentage','benchmark'] },
    { title:'Expense Ratio Impact',  desc:'How fund expense ratios eat into your long-term wealth',                        url:'../calculators/financial health/expenseratio.html',     cat:'Calculators', tags:['expense ratio','cost','fund','drag','impact','long term','compounding'] },
    { title:'Insurance Coverage',    desc:'Are you under-insured? Calculate the right life and health cover',              url:'../calculators/financial health/insurancecoverage.html', cat:'Calculators',tags:['insurance','cover','life','health','under insured','hli','term'] },
    { title:'Lifestyle Score',       desc:'Your lifestyle inflation score — are you living beyond your means?',             url:'../calculators/financial health/lifestyle.html',        cat:'Calculators', tags:['lifestyle','inflation','spending','means','score','upgrade'] },

    /* ── Calculators: Retirement & Life ── */
    { title:'Retirement Planner',    desc:'How much corpus do you need to retire? FIRE number calculator',                 url:'../calculators/retirement & life planning/retirement.html',       cat:'Calculators', tags:['retirement','fire','corpus','retire','age','freedom','financial independence'] },
    { title:'Post-Retirement Income',desc:'How long will your retirement corpus last? SWP + withdrawal planning',          url:'../calculators/retirement & life planning/postretirement.html',    cat:'Calculators', tags:['post retirement','income','corpus','last','withdrawal','swp','pension'] },
    { title:'Pension Gap',           desc:'Gap between what you need and what EPF/NPS provides — bridge it',               url:'../calculators/retirement & life planning/pensiongap.html',        cat:'Calculators', tags:['pension','gap','epf','nps','retire','shortfall','bridge'] },
    { title:'Life Expectancy',       desc:'Estimate your life expectancy — plan your money to last',                       url:'../calculators/retirement & life planning/lifeexpentancy.html',    cat:'Calculators', tags:['life expectancy','age','plan','longevity','health','retirement'] },
    { title:'Healthcare Cost',       desc:'Future medical expense planning — inflation-adjusted healthcare corpus',         url:'../calculators/retirement & life planning/healthcare.html',        cat:'Calculators', tags:['healthcare','medical','cost','inflation','retirement','corpus','hospital'] },
    { title:'Annuity Calculator',    desc:'NPS annuity — monthly pension from your retirement corpus',                     url:'../calculators/retirement & life planning/annuity.html',           cat:'Calculators', tags:['annuity','pension','monthly','nps','insurance','income','retirement'] },
    { title:'Longevity Risk',        desc:'Will your money outlive you? Plan for 30+ years of retirement',                 url:'../calculators/retirement & life planning/longevity.html',         cat:'Calculators', tags:['longevity','outlive','30 years','retirement','risk','corpus','last'] },

    /* ── Calculators: Trading & Markets ── */
    { title:'Options P&L',           desc:'Options profit & loss — call, put, payoff, breakeven at expiry',                url:'../calculators/trading & markets/options.html',         cat:'Calculators', tags:['options','call','put','pl','payoff','strike','premium','expiry'] },
    { title:'Futures P&L',           desc:'Futures trade P&L — entry, exit, lot size, margin, realised gain',             url:'../calculators/trading & markets/futurespl.html',       cat:'Calculators', tags:['futures','fno','pl','lot size','margin','entry','exit'] },
    { title:'Brokerage Calculator',  desc:'Zerodha / Angel / ICICI brokerage and taxes on stock trades',                  url:'../calculators/trading & markets/brokerage.html',       cat:'Calculators', tags:['brokerage','zerodha','angle','stt','charges','trade cost','taxes'] },
    { title:'Margin Calculator',     desc:'SPAN margin required for futures and options positions',                         url:'../calculators/trading & markets/margin.html',          cat:'Calculators', tags:['margin','span','exposure','nrml','mis','fno','required'] },
    { title:'Position Size',         desc:'How many shares to buy? Risk-based position sizing for traders',                url:'../calculators/trading & markets/positionsize.html',    cat:'Calculators', tags:['position size','shares','risk','1%','capital','lot','trading'] },
    { title:'Risk Per Trade',        desc:'Maximum loss per trade — never blow your account, risk management',             url:'../calculators/trading & markets/riskper.html',         cat:'Calculators', tags:['risk','per trade','stop loss','max loss','account','capital','management'] },
    { title:'Breakeven Price',       desc:'Breakeven on any trade — buy price + all costs = your breakeven',               url:'../calculators/trading & markets/breakeven.html',       cat:'Calculators', tags:['breakeven','price','costs','trade','entry','buy','sell'] },
    { title:'Volatility Calculator', desc:'Historical and implied volatility — measure market risk and uncertainty',       url:'../calculators/trading & markets/volatility.html',      cat:'Calculators', tags:['volatility','iv','hv','risk','options','vix','uncertainty'] },

    /* ── Calculators: Core Thinking ── */
    { title:'Compounding Visualiser',desc:'See the magic of compounding over time — the 8th wonder animated',              url:'../calculators/core-thinking/compounding-visualizer.html', cat:'Calculators', tags:['compounding','visualise','8th wonder','power','time','growth'] },
    { title:'Inflation Impact',      desc:'How inflation destroys purchasing power — visualise real cost of delay',        url:'../calculators/core-thinking/inflation-impact.html',    cat:'Calculators', tags:['inflation','purchasing power','real value','delay','cost','6%'] },
    { title:'Time Value of Money',   desc:'A rupee today is worth more than tomorrow — PV, FV, discount rate',            url:'../calculators/core-thinking/time-value-of-money.html', cat:'Calculators', tags:['time value','pv','fv','present','future','discount','money'] },
    { title:'Opportunity Cost',      desc:'What does not investing truly cost you? The hidden price of inaction',          url:'../calculators/core-thinking/opportunity-cost.html',    cat:'Calculators', tags:['opportunity cost','inaction','delay','hidden cost','invest','forgone'] },
    { title:'Real Rate of Return',   desc:'Nominal return minus inflation — your true wealth creation rate',               url:'../calculators/core-thinking/real-rate-of-return.html', cat:'Calculators', tags:['real return','nominal','inflation adjusted','actual','wealth'] },
    { title:'Financial Age',         desc:'How old is your financial life? Score your financial maturity',                 url:'../calculators/core-thinking/financial-age-calculator.html', cat:'Calculators', tags:['financial age','maturity','score','quiz','readiness'] },
    { title:'Risk vs Reward',        desc:'Visualise risk-return tradeoff across equity, debt, gold, crypto',              url:'../calculators/core-thinking/risk-vs-reward.html',      cat:'Calculators', tags:['risk reward','tradeoff','equity','debt','gold','crypto','compare'] },
    { title:'Wealth vs Income Gap',  desc:'High income ≠ wealth. See the gap and how to close it',                        url:'../calculators/core-thinking/wealth-vs-income-gap.html', cat:'Calculators', tags:['wealth','income','gap','difference','rich','salary','trap'] },
    { title:'Purchasing Power Loss', desc:'How much of your savings are losing value to inflation right now?',             url:'../calculators/core-thinking/purchasing-power-loss.html', cat:'Calculators',tags:['purchasing power','loss','inflation','savings','value','erode'] },
    { title:'Money Behaviour Analyser',desc:'Your money psychology — spender, saver, avoider or worrier?',                url:'../calculators/core-thinking/money-behavior-analyzer.html', cat:'Calculators',tags:['behaviour','psychology','spender','saver','avoider','money type','quiz'] },

    /* ── Calculators: Desi Reality ── */
    { title:'Buy a House?',          desc:'Should you buy or rent? Real EMI vs rent + investment comparison',              url:'../calculators/desi reality check/buyhouse.html',       cat:'Calculators', tags:['buy house','rent','emi','property','decision','realty','afford'] },
    { title:'Shaadi Cost Planner',   desc:'Indian wedding cost planner — budget, loan or parents? Real numbers',           url:'../calculators/desi reality check/shaadicost.html',     cat:'Calculators', tags:['wedding','shaadi','cost','budget','marriage','plan','loan'] },
    { title:'Child Education Cost',  desc:'IIT / MBBS / study abroad cost with inflation — start SIP now',                url:'../calculators/desi reality check/childedu.html',       cat:'Calculators', tags:['child education','iit','mbbs','abroad','cost','sip','future','school'] },
    { title:'Middle Class Trap',     desc:'Are you stuck in the middle class trap? Score your financial escape velocity',  url:'../calculators/desi reality check/middleclass.html',    cat:'Calculators', tags:['middle class','trap','escape','financial freedom','score','salary'] },
    { title:'Govt vs Private Job',   desc:'Government vs private job — real total compensation, pension, job security',   url:'../calculators/desi reality check/govvspvt.html',       cat:'Calculators', tags:['government job','private','compare','ias','psu','salary','pension','security'] },
    { title:'Lifestyle Inflation',   desc:'Track lifestyle creep — how upgrades silently kill your savings rate',          url:'../calculators/desi reality check/lifestyle.html',      cat:'Calculators', tags:['lifestyle inflation','upgrade','creep','savings','spending','salary hike'] },
    { title:'Parental Support',      desc:'Planning for ageing parents — corpus needed, cost of care in India',            url:'../calculators/desi reality check/parental.html',       cat:'Calculators', tags:['parents','ageing','care','corpus','support','medical','retirement'] },
    { title:'EMI Disease',           desc:'Are you over-leveraged? EMI-to-income ratio reality check',                    url:'../calculators/desi reality check/emidiease.html',      cat:'Calculators', tags:['emi disease','over leveraged','ratio','income','debt','loans','burden'] },
    { title:'Credit Addiction',      desc:'Credit card and BNPL addiction score — how deep is the hole?',                 url:'../calculators/desi reality check/creditaddiction.html', cat:'Calculators',tags:['credit','addiction','bnpl','card','score','debt','habit'] },
    { title:'Log Kya Kahenge',       desc:'The social pressure cost calculator — how much does "log kya kahenge" cost?',  url:'../calculators/desi reality check/logkyakahenge.html',  cat:'Calculators', tags:['social pressure','log kya kahenge','status','peer','wedding','car','house'] },

    /* ── Learning ── */
    { title:'Learn: Equity',         desc:'Everything about Indian stock markets — how to pick stocks, analysis, NSE/BSE', url:'../html/learn-equity.html',     cat:'Learning', tags:['equity','stocks','share market','nse','bse','invest','analysis','beginner'] },
    { title:'Learn: Mutual Funds',   desc:'Mutual fund basics to advanced — NAV, AUM, SIP, direct vs regular',            url:'../html/learn-mf.html',          cat:'Learning', tags:['mutual fund','mf','nav','aum','sip','direct','regular','sebi','amfi'] },
    { title:'Learn: Debt',           desc:'Bonds, debentures, G-Sec, debt funds — safe and steady income',                url:'../html/learn-debt.html',        cat:'Learning', tags:['debt','bond','g-sec','debenture','safe','fixed income','fund'] },
    { title:'Learn: Crypto',         desc:'Crypto basics — Bitcoin, Ethereum, wallets, India regulations, tax',           url:'../html/learn-crypto.html',      cat:'Learning', tags:['crypto','bitcoin','ethereum','blockchain','wallet','india','vda','tax'] },
    { title:'Learn: ETF',            desc:'Exchange traded funds — Nifty ETF, gold ETF, how to invest via Zerodha',       url:'../html/learn-etf.html',         cat:'Learning', tags:['etf','nifty etf','gold etf','index','passive','zerodha','invest'] },
    { title:'Learn: F&O',            desc:'Futures and Options — hedging, speculation, option strategies in India',        url:'../html/learn-fno.html',         cat:'Learning', tags:['fno','futures','options','derivative','hedge','strategy','nifty','expiry'] },
    { title:'Learn: Forex',          desc:'Foreign exchange — USD/INR, remittance, LRS, currency risk',                   url:'../html/learn-forex.html',       cat:'Learning', tags:['forex','currency','usd inr','remittance','lrs','rbi','fema'] },
    { title:'Learn: Commodity',      desc:'Gold, silver, crude oil — MCX, commodity trading basics India',                url:'../html/learn-commodity.html',   cat:'Learning', tags:['commodity','gold','silver','crude','mcx','trading','comdex'] },
    { title:'Learn: Insurance',      desc:'Term, health, ULIP — what you need and what to avoid',                         url:'../html/learn-insurance.html',   cat:'Learning', tags:['insurance','term','health','ulip','lic','irda','premium','claim','cover'] },
    { title:'Learn: Technical Analysis',desc:'Charts, candlesticks, RSI, MACD, support, resistance for Indian markets',  url:'../html/learn-technical.html',   cat:'Learning', tags:['technical','chart','candlestick','rsi','macd','support','resistance','indicator'] },
    { title:'Learn: Fundamental Analysis',desc:'Balance sheet, P&E, ROE, moat — how to analyse any Indian company',      url:'../html/learn-fundamental.html', cat:'Learning', tags:['fundamental','balance sheet','pe','roe','moat','company','annual report'] },
    { title:'Learn: Indicators',     desc:'Key market indicators — VIX, FII/DII, PCR, Open Interest decoded',             url:'../html/learn-indicators.html',  cat:'Learning', tags:['indicators','vix','fii','dii','pcr','oi','open interest','market'] },
    { title:'Learn: Metrics',        desc:'Financial metrics — ROCE, EPS, PB, dividend yield, free cash flow',            url:'../html/learn-metrics.html',     cat:'Learning', tags:['metrics','roce','eps','pb','dividend','fcf','ratio','value'] },
    { title:'Learn: Money Market',   desc:'Liquid funds, T-Bills, commercial paper — the money market explained',         url:'../html/learn-money-market.html',cat:'Learning', tags:['money market','liquid','tbill','commercial paper','short term','park'] },
  ];

  /* ═══════════════════════════════════════════════════════
     SMART SEARCH — fuzzy scoring
  ═══════════════════════════════════════════════════════ */
  function score(item, q) {
    const ql = q.toLowerCase().trim();
    if (!ql) return 0;
    const tl = item.title.toLowerCase();
    const dl = item.desc.toLowerCase();
    const tags = item.tags.join(' ');
    let s = 0;
    if (tl === ql)           s += 100;
    if (tl.startsWith(ql))  s += 60;
    if (tl.includes(ql))    s += 40;
    if (dl.includes(ql))    s += 20;
    if (tags.includes(ql))  s += 15;
    // partial word matching
    ql.split(' ').forEach(word => {
      if (word.length < 2) return;
      if (tl.includes(word))  s += 10;
      if (tags.includes(word)) s += 5;
      if (dl.includes(word))   s += 3;
    });
    return s;
  }

  function search(q) {
    if (!q || q.trim().length < 1) return [];
    return INDEX
      .map(item => ({ ...item, _score: score(item, q) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);
  }

  /* ═══════════════════════════════════════════════════════
     INJECT CSS
  ═══════════════════════════════════════════════════════ */
  const css = `
  #fs-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-right: 10px;
    vertical-align: middle;
  }
  #fs-toggle {
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 10px;
    width: 36px; height: 36px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,.7);
    transition: all .18s;
    outline: none;
    flex-shrink: 0;
  }
  #fs-toggle:hover {
    background: rgba(0,212,255,.15);
    border-color: rgba(0,212,255,.4);
    color: #00d4ff;
  }
  #fs-toggle svg { width:16px; height:16px; fill:currentColor; }

  #fs-bar {
    position: fixed;
    top: 0; right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #13151f;
    border: 1.5px solid rgba(0,212,255,.35);
    border-radius: 12px;
    padding: 0 10px 0 12px;
    height: 38px;
    width: 0;
    overflow: hidden;
    opacity: 0;
    transition: width .28s cubic-bezier(.4,0,.2,1), opacity .2s, border-color .2s;
    box-shadow: 0 4px 24px rgba(0,0,0,.4), 0 0 0 1px rgba(0,212,255,.08);
    pointer-events: none;
    white-space: nowrap;
    z-index: 99997;
  }
  #fs-bar.active {
    width: min(380px, 70vw);
    opacity: 1;
    pointer-events: all;
  }
  #fs-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 13.5px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-width: 0;
    caret-color: #00d4ff;
  }
  #fs-input::placeholder { color: rgba(255,255,255,.35); }
  #fs-clear {
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,.35); font-size: 14px;
    padding: 0; line-height:1;
    display: none;
    transition: color .15s;
    flex-shrink:0;
  }
  #fs-clear.show { display: block; }
  #fs-clear:hover { color: rgba(255,255,255,.8); }

  #fs-dropdown {
    position: fixed;
    top: 60px;
    right: 0;
    width: min(420px, 92vw);
    background: #0f1117;
    border: 1px solid rgba(0,212,255,.18);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(0,212,255,.06);
    display: none;
    z-index: 99999;
    max-height: 480px;
    overflow-y: auto;
  }
  #fs-dropdown.show { display: block; }
  #fs-dropdown::-webkit-scrollbar { width: 4px; }
  #fs-dropdown::-webkit-scrollbar-track { background: transparent; }
  #fs-dropdown::-webkit-scrollbar-thumb { background: rgba(0,212,255,.2); border-radius: 2px; }

  .fs-empty {
    padding: 22px 18px;
    text-align: center;
    color: rgba(255,255,255,.35);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  }
  .fs-cat-label {
    padding: 10px 16px 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.2px;
    color: rgba(0,212,255,.6);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    text-transform: uppercase;
  }
  .fs-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    text-decoration: none;
    transition: background .12s;
    border-bottom: 1px solid rgba(255,255,255,.04);
  }
  .fs-item:last-child { border-bottom: none; }
  .fs-item:hover, .fs-item.focused {
    background: rgba(0,212,255,.08);
  }
  .fs-item-icon {
    width: 32px; height: 32px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .cat-Pages       .fs-item-icon { background: rgba(123,47,247,.2); }
  .cat-Calculators .fs-item-icon { background: rgba(0,212,255,.15); }
  .cat-Learning    .fs-item-icon { background: rgba(0,255,150,.12); }
  .fs-item-body { flex: 1; min-width: 0; }
  .fs-item-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fs-item-desc {
    font-size: 11.5px;
    color: rgba(255,255,255,.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }
  .fs-item-arrow {
    color: rgba(255,255,255,.2);
    font-size: 13px;
    flex-shrink: 0;
    transition: color .12s, transform .12s;
  }
  .fs-item:hover .fs-item-arrow, .fs-item.focused .fs-item-arrow {
    color: #00d4ff;
    transform: translateX(2px);
  }
  .fs-highlight { color: #00d4ff; }

  .fs-footer {
    padding: 8px 16px;
    border-top: 1px solid rgba(255,255,255,.06);
    display: flex;
    gap: 14px;
    font-size: 10.5px;
    color: rgba(255,255,255,.25);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .fs-footer kbd {
    background: rgba(255,255,255,.08);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    font-family: inherit;
    color: rgba(255,255,255,.4);
    border: 1px solid rgba(255,255,255,.1);
  }

  @media (max-width: 600px) {
    #fs-bar.active { width: min(300px, 80vw); }
  }

  /* ══════════════════════════════════════════════════════════
     LIGHT MODE OVERRIDES
     Triggered by  [data-theme="light"]  on <html>
  ══════════════════════════════════════════════════════════ */
  [data-theme="light"] #fs-toggle {
    background: rgba(0,0,0,.06);
    border-color: rgba(0,0,0,.18);
    color: rgba(0,0,0,.65);
  }
  [data-theme="light"] #fs-toggle:hover {
    background: rgba(0,100,255,.10);
    border-color: rgba(0,100,255,.40);
    color: #0050ff;
  }

  [data-theme="light"] #fs-bar {
    background: #ffffff;
    border-color: rgba(0,100,255,.40);
    box-shadow: 0 4px 24px rgba(0,0,0,.12), 0 0 0 1px rgba(0,100,255,.08);
    color: #0050ff; /* inherited by #fs-bar-icon stroke */
  }
  [data-theme="light"] #fs-input {
    color: #111827;
    caret-color: #0050ff;
  }
  [data-theme="light"] #fs-input::placeholder {
    color: rgba(0,0,0,.35);
  }
  [data-theme="light"] #fs-bar svg path {
    stroke: #0050ff;
  }
  [data-theme="light"] #fs-clear {
    color: rgba(0,0,0,.35);
  }
  [data-theme="light"] #fs-clear:hover {
    color: rgba(0,0,0,.75);
  }

  [data-theme="light"] #fs-dropdown {
    background: #ffffff;
    border-color: rgba(0,0,0,.10);
    box-shadow: 0 20px 60px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.06);
  }
  [data-theme="light"] #fs-dropdown::-webkit-scrollbar-thumb {
    background: rgba(0,100,255,.2);
  }
  [data-theme="light"] .fs-empty {
    color: rgba(0,0,0,.40);
  }
  [data-theme="light"] .fs-cat-label {
    color: rgba(0,80,200,.7);
  }
  [data-theme="light"] .fs-item {
    border-bottom-color: rgba(0,0,0,.05);
  }
  [data-theme="light"] .fs-item:hover,
  [data-theme="light"] .fs-item.focused {
    background: rgba(0,100,255,.06);
  }
  [data-theme="light"] .cat-Pages       .fs-item-icon { background: rgba(123,47,247,.12); }
  [data-theme="light"] .cat-Calculators .fs-item-icon { background: rgba(0,100,255,.10); }
  [data-theme="light"] .cat-Learning    .fs-item-icon { background: rgba(0,160,80,.10);  }
  [data-theme="light"] .fs-item-title {
    color: #111827;
  }
  [data-theme="light"] .fs-item-desc {
    color: rgba(0,0,0,.45);
  }
  [data-theme="light"] .fs-item-arrow {
    color: rgba(0,0,0,.22);
  }
  [data-theme="light"] .fs-item:hover .fs-item-arrow,
  [data-theme="light"] .fs-item.focused .fs-item-arrow {
    color: #0050ff;
  }
  [data-theme="light"] .fs-highlight {
    color: #0050ff;
  }
  [data-theme="light"] .fs-footer {
    border-top-color: rgba(0,0,0,.08);
    color: rgba(0,0,0,.30);
  }
  [data-theme="light"] .fs-footer kbd {
    background: rgba(0,0,0,.06);
    border-color: rgba(0,0,0,.12);
    color: rgba(0,0,0,.45);
  }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ═══════════════════════════════════════════════════════
     BUILD DOM
  ═══════════════════════════════════════════════════════ */
  const CAT_ICONS = { Pages: '🗂️', Calculators: '🧮', Learning: '📚' };

  const wrap = document.createElement('div');
  wrap.id = 'fs-wrap';
  wrap.innerHTML = `
    <button id="fs-toggle" aria-label="Search" title="Search (/)">
      <svg viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>
    </button>
    <div id="fs-bar">
      <svg id="fs-bar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;opacity:.6"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      <input id="fs-input" type="text" placeholder="Search pages, calculators, topics…" autocomplete="off" spellcheck="false"/>
      <button id="fs-clear" aria-label="Clear">✕</button>
    </div>
    <div id="fs-dropdown" role="listbox" aria-label="Search results"></div>
  `;

  /* ───────────────────────────────────────────────────────────
     INJECT — smart multi-selector placement
     Priority order:
       1. Right before #themeToggle (most pages)
       2. At end of .header-flex / .nav-actions / .topbar-r
       3. At end of first <header> / <nav>
       4. Fallback: fixed top-right
  ─────────────────────────────────────────────────────────── */
  function inject() {
    // 1. Preferred: insert just before #themeToggle
    const toggle = document.getElementById('themeToggle');
    if (toggle && toggle.parentNode) {
      toggle.parentNode.insertBefore(wrap, toggle);
      return;
    }

    // 2. Append inside known nav containers (right-aligned flex rows)
    const containerSelectors = [
      '.header-flex',
      '.nav-actions',
      '.nav-right',
      '.topbar-r',
      '.navbar-right',
      'header .flex',
      'header',
      'nav',
    ];
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Ensure the container is flex so the button aligns properly
        const cs = window.getComputedStyle(el);
        if (cs.display === 'flex' || cs.display === 'inline-flex') {
          el.appendChild(wrap);
        } else {
          // Wrap it in a right-aligned absolute so it doesn't break layout
          wrap.style.cssText = 'position:absolute;top:50%;right:16px;transform:translateY(-50%);z-index:9000;';
          el.style.position = el.style.position || 'relative';
          el.appendChild(wrap);
        }
        return;
      }
    }

    // 3. Final fallback: fixed top-right corner
    wrap.style.cssText = 'position:fixed;top:14px;right:16px;z-index:9900;';
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  /* ═══════════════════════════════════════════════════════
     LOGIC
  ═══════════════════════════════════════════════════════ */
  let isOpen = false;
  let focusIdx = -1;
  let currentResults = [];

  const bar      = () => document.getElementById('fs-bar');
  const input    = () => document.getElementById('fs-input');
  const dropdown = () => document.getElementById('fs-dropdown');
  const clearBtn = () => document.getElementById('fs-clear');
  const togBtn   = () => document.getElementById('fs-toggle');

  function openSearch() {
    if (isOpen) return;
    isOpen = true;

    // Anchor bar flush to the right edge of themeToggle, vertically centred on fs-toggle
    const fsToggleEl  = document.getElementById('fs-toggle');
    const themeToggle = document.getElementById('themeToggle');
    const fsRect    = fsToggleEl.getBoundingClientRect();
    const anchor    = themeToggle ? themeToggle.getBoundingClientRect() : fsRect;
    const b  = bar();
    const dd = dropdown();
    const rightOffset = window.innerWidth - anchor.right;
    const barTop = fsRect.top + (fsRect.height - 38) / 2;
    b.style.top   = barTop + 'px';
    b.style.right = rightOffset + 'px';
    dd.style.top  = (anchor.bottom + 8) + 'px';
    dd.style.right = rightOffset + 'px';

    b.classList.add('active');
    setTimeout(() => input().focus(), 250);
    document.addEventListener('mousedown', onOutsideClick);
  }

  function closeSearch() {
    if (!isOpen) return;
    isOpen = false;
    bar().classList.remove('active');
    dropdown().classList.remove('show');
    input().value = '';
    clearBtn().classList.remove('show');
    focusIdx = -1;
    currentResults = [];
    document.removeEventListener('mousedown', onOutsideClick);
  }

  function onOutsideClick(e) {
    if (!wrap.contains(e.target)) closeSearch();
  }

  function highlight(text, q) {
    if (!q) return text;
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${esc})`, 'gi'),
      '<span class="fs-highlight">$1</span>');
  }

  function renderResults(q) {
    const dd = dropdown();
    currentResults = search(q);
    focusIdx = -1;

    if (!q.trim()) { dd.classList.remove('show'); return; }

    if (!currentResults.length) {
      dd.innerHTML = `<div class="fs-empty">No results for "<strong>${q}</strong>" — try a different keyword</div>`;
      dd.classList.add('show');
      return;
    }

    // Group by category
    const groups = {};
    currentResults.forEach(r => {
      if (!groups[r.cat]) groups[r.cat] = [];
      groups[r.cat].push(r);
    });

    let html = '';
    Object.entries(groups).forEach(([cat, items]) => {
      html += `<div class="fs-cat-label cat-${cat}">${CAT_ICONS[cat] || ''} ${cat}</div>`;
      items.forEach((item, i) => {
        const globalIdx = currentResults.indexOf(item);
        html += `
          <a class="fs-item cat-${cat}" href="${item.url}" role="option" data-idx="${globalIdx}">
            <div class="fs-item-icon">${CAT_ICONS[cat] || '📄'}</div>
            <div class="fs-item-body">
              <div class="fs-item-title">${highlight(item.title, q)}</div>
              <div class="fs-item-desc">${item.desc}</div>
            </div>
            <span class="fs-item-arrow">→</span>
          </a>`;
      });
    });

    html += `<div class="fs-footer">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> open</span>
      <span><kbd>Esc</kbd> close</span>
    </div>`;
    dd.innerHTML = html;
    dd.classList.add('show');
  }

  function updateFocus() {
    dropdown().querySelectorAll('.fs-item').forEach((el, i) => {
      el.classList.toggle('focused', i === focusIdx);
      if (i === focusIdx) el.scrollIntoView({ block: 'nearest' });
    });
  }

  /* Events */
  document.addEventListener('DOMContentLoaded', () => {
    const tb = togBtn(), inp = input(), cl = clearBtn();

    tb.addEventListener('click', () => isOpen ? closeSearch() : openSearch());

    inp.addEventListener('input', () => {
      const q = inp.value;
      cl.classList.toggle('show', q.length > 0);
      renderResults(q);
    });

    inp.addEventListener('keydown', e => {
      const items = dropdown().querySelectorAll('.fs-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusIdx = Math.min(focusIdx + 1, items.length - 1);
        updateFocus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusIdx = Math.max(focusIdx - 1, 0);
        updateFocus();
      } else if (e.key === 'Enter') {
        if (focusIdx >= 0 && items[focusIdx]) {
          items[focusIdx].click();
        } else if (currentResults.length) {
          window.location.href = currentResults[0].url;
        }
      } else if (e.key === 'Escape') {
        closeSearch();
      }
    });

    cl.addEventListener('click', () => {
      inp.value = '';
      cl.classList.remove('show');
      dropdown().classList.remove('show');
      inp.focus();
      currentResults = [];
    });

    // Global shortcut: press / to open search
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        isOpen ? closeSearch() : openSearch();
      }
    });
  });

})();
