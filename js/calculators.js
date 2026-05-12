document.addEventListener("DOMContentLoaded", () => {

  const calculatorCategories = [

    /* =========================
       CORE THINKING
       Folder: calculators/core-thinking
       ========================= */
    {
      id: "thinking",
      title: "🧠 Core Thinking",
      subtitle: "Understand money before using it",
      folder: "calculators/core-thinking",
      calculators: [
        { name: "Time Value of Money", file: "time-value-of-money.html" },
        { name: "Inflation Impact", file: "inflation-impact.html" },
        { name: "Real Rate of Return", file: "real-rate-of-return.html" },
        { name: "Purchasing Power Loss", file: "purchasing-power-loss.html" },
        { name: "Compounding Visualizer", file: "compounding-visualizer.html" },
        { name: "Opportunity Cost", file: "opportunity-cost.html" },
        { name: "Risk vs Reward", file: "risk-vs-reward.html" },
        { name: "Wealth vs Income Gap", file: "wealth-vs-income-gap.html" },
        { name: "Money Behavior Analyzer", file: "money-behavior-analyzer.html" },
        { name: "Financial Age Calculator", file: "financial-age-calculator.html" }
      ]
    },

    /* =========================
       INVESTMENT & WEALTH
       Folder: calculators/Investment & Wealth
       ========================= */
    {
      id: "investment",
      title: "💰 Investment & Wealth",
      subtitle: "Grow money with clarity",
      folder: "calculators/Investment & Wealth",
      calculators: [
        { name: "SIP Calculator", file: "sip.html" },
        { name: "Step-Up SIP", file: "stepup.html" },
        { name: "Lumpsum Calculator", file: "lumpsum.html" },
        { name: "Mutual Fund Returns", file: "mutualfunds.html" },
        { name: "Portfolio Growth", file: "portfolio.html" },
        { name: "Asset Allocation", file: "assetalloc.html" },
        { name: "Rebalancing Calculator", file: "rebalancing.html" },
        { name: "Goal-Based Investment", file: "goalbased.html" },
        { name: "CAGR Calculator", file: "cagr.html" },
        { name: "Rolling Returns", file: "rollingreturns.html" },
        { name: "XIRR Calculator", file: "xirr.html" },
        { name: "SWP Calculator", file: "swp.html" },
        { name: "Dividend Reinvestment", file: "dividend.html" },
        { name: "ETF Returns", file: "etf.html" },
        { name: "Tax-Adjusted Returns", file: "taxadj.html" }
      ]
    },

    /* =========================
       BANKING & FIXED INCOME
       Folder: calculators/Banking & Fixed Income
       ========================= */
    {
      id: "banking",
      title: "🏦 Banking & Fixed Income",
      subtitle: "Indian saving instruments",
      folder: "calculators/Banking & Fixed Income",
      calculators: [
        { name: "FD Calculator", file: "fd.html" },
        { name: "RD Calculator", file: "rd.html" },
        { name: "PPF Calculator", file: "ppf.html" },
        { name: "EPF Calculator", file: "epf.html" },
        { name: "NPS Calculator", file: "nps.html" },
        { name: "SCSS Calculator", file: "scss.html" },
        { name: "Sukanya Samriddhi", file: "ssy.html" },
        { name: "Post Office MIS", file: "postoffice.html" },
        { name: "Bond Yield", file: "bond.html" },
        { name: "Savings vs Investment", file: "savingsinvestment.html" }
      ]
    },

    /* =========================
       LOANS & DEBT
       Folder: calculators/Loans, Debt & EMI
       ========================= */
    {
      id: "loans",
      title: "🏠 Loans, Debt & EMI",
      subtitle: "Where most Indians bleed money",
      folder: "calculators/Loans, Debt & EMI",
      calculators: [
        { name: "EMI Calculator", file: "emi.html" },
        { name: "Home Loan Calculator", file: "home.html" },
        { name: "Personal Loan Calculator", file: "personal.html" },
        { name: "Car Loan Calculator", file: "car.html" },
        { name: "Education Loan", file: "education.html" },
        { name: "Loan Tenure Optimizer", file: "loantenure.html" },
        { name: "EMI vs Prepayment", file: "emiprepay.html" },
        { name: "Interest Outflow", file: "interest.html" },
        { name: "Debt Payoff Strategy", file: "debtsnow.html" },
        { name: "Credit Card Interest", file: "creditcard.html" },
        { name: "Loan Eligibility", file: "loaneligibility.html" }
      ]
    },

    /* =========================
       TAX & SALARY
       Folder: calculators/Tax & Salary
       ========================= */
    {
      id: "tax",
      title: "🧾 Tax & Salary",
      subtitle: "Indian tax reality",
      folder: "calculators/Tax & Salary",
      calculators: [
        { name: "Old vs New Regime", file: "oldnew.html" },
        { name: "Income Tax Calculator", file: "income.html" },
        { name: "HRA Exemption", file: "hra.html" },
        { name: "80C Optimizer", file: "80c.html" },
        { name: "Capital Gains Tax", file: "capitalgains.html" },
        { name: "STCG vs LTCG", file: "shortlong.html" },
        { name: "Gratuity Calculator", file: "gratuity.html" },
        { name: "Leave Encashment", file: "leave.html" },
        { name: "Professional Tax", file: "professional.html" },
        { name: "In-Hand Salary", file: "inhand.html" }
      ]
    },

    /* =========================
       RETIREMENT & LIFE
       Folder: calculators/Retirement & Life Planning
       ========================= */
    {
      id: "retirement",
      title: "👵 Retirement & Life",
      subtitle: "Longevity matters",
      folder: "calculators/Retirement & Life Planning",
      calculators: [
        { name: "Retirement Corpus", file: "retirement.html" },
        { name: "Pension Gap", file: "pensiongap.html" },
        { name: "Post-Retirement Income", file: "postretirement.html" },
        { name: "Annuity Comparison", file: "annuity.html" },
        { name: "Life Expectancy Risk", file: "lifeexpectancy.html" },
        { name: "Healthcare Inflation", file: "healthcare.html" },
        { name: "Longevity Risk", file: "longevity.html" }
      ]
    },

    /* =========================
       TRADING (OPTIONAL)
       Folder: calculators/Trading & Markets
       ========================= */
    {
      id: "trading",
      title: "📈 Trading & Markets",
      subtitle: "Advanced tools",
      folder: "calculators/Trading & Markets",
      calculators: [
        { name: "Position Size", file: "positionsize.html" },
        { name: "Risk Per Trade", file: "riskper.html" },
        { name: "Margin Calculator", file: "margin.html" },
        { name: "Brokerage Calculator", file: "brokerage.html" },
        { name: "Break-Even Calculator", file: "breakeven.html" },
        { name: "Options Payoff", file: "options.html" },
        { name: "Futures P&L", file: "futurespl.html" },
        { name: "Volatility Impact", file: "volatility.html" }
      ]
    },

    /* =========================
       FINANCIAL HEALTH
       Folder: calculators/Financial Health
       ========================= */
    {
      id: "health",
      title: "📊 Financial Health",
      subtitle: "Overall money fitness",
      folder: "calculators/Financial Health",
      calculators: [
        { name: "Net Worth Calculator", file: "networth.html" },
        { name: "Expense Ratio", file: "expenseratio.html" },
        { name: "Savings Rate", file: "savings.html" },
        { name: "Emergency Fund", file: "emergencyfund.html" },
        { name: "Insurance Coverage", file: "insurancecoverage.html" },
        { name: "Lifestyle Inflation", file: "lifestyle.html" }
      ]
    },

    /* =========================
       DESI REALITY CHECK
       Folder: calculators/Desi Reality Check
       ========================= */
    {
      id: "desi",
      title: "🔥 Desi Reality Check",
      subtitle: "What Indians actually struggle with",
      folder: "calculators/Desi Reality Check",
      calculators: [
        { name: "EMI Lifestyle Disease", file: "emidiease.html" },
        { name: "Shaadi Cost vs Wealth", file: "shaadicost.html" },
        { name: "Buy vs Rent", file: "buyhouse.html" },
        { name: "Inflation Detector", file: "lifestyle.html" },
        { name: "Middle-Class Trap", file: "middleclass.html" },
        { name: "Child Education", file: "childedu.html" },
        { name: "Parental Dependency", file: "parental.html" },
        { name: "Govt vs Private Job", file: "govvspvt.html" },
        { name: "Debt Addiction Cost", file: "creditaddiction.html" },
        { name: "Log Kya Kahenge", file: "logkyakahenge.html" }
      ]
    }

  ];

  const container = document.getElementById("calculatorCategories");

  calculatorCategories.forEach(cat => {
    const section = document.createElement("div");
    section.className = "calc-category open";

    section.innerHTML = `
      <div class="category-header">
        <h2>${cat.title}</h2>
        <p>${cat.subtitle}</p>
      </div>

      <div class="category-content">
        ${cat.calculators.map(c => `
          <a href="${cat.folder}/${c.file}" class="calc-card">
            ${c.name}
          </a>
        `).join("")}
      </div>
    `;

    container.appendChild(section);
  });

});