import yfinance as yf
import pandas as pd
import numpy as np

# ================= CLASS: VISUALS =================
class Colors:
    HEADER = '\033[95m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# ================= CLASS: THE ANALYSIS ENGINE =================
class FinancialSystem:
    def __init__(self, symbol):
        self.symbol = self.normalize_symbol(symbol)
        print(f"\n{Colors.HEADER}🚀 INITIALIZING OMNISCIENT FINANCIAL SCAN FOR {self.symbol}...{Colors.ENDC}")
        
        self.stock = yf.Ticker(self.symbol)
        
        # Data Loading with Error Handling
        try:
            self.info = self.stock.info or {}
            self.financials = self.stock.financials.fillna(0)
            self.balance_sheet = self.balance_sheet_safe()
            self.cashflow = self.stock.cashflow.fillna(0)
            
            # Check Data Availability
            self.data_available = not self.financials.empty
            if not self.data_available:
                print(f"{Colors.FAIL}Critical: Financial statements are empty.{Colors.ENDC}")
        except Exception as e:
            print(f"{Colors.FAIL}Critical Error fetching data: {e}{Colors.ENDC}")
            self.data_available = False

        # Scorecard
        self.score = 0
        self.max_score = 0
        self.red_flags = []

        self.sector_benchmarks = {
            "Technology": {"PE": 25, "NM": 15, "ROE": 15, "DE": 0.5},
            "Financial Services": {"PE": 15, "NM": 20, "ROE": 12, "DE": 2.0},
            "Energy": {"PE": 12, "NM": 8, "ROE": 10, "DE": 0.8},
            "Consumer Cyclical": {"PE": 20, "NM": 5, "ROE": 15, "DE": 1.0},
            "Healthcare": {"PE": 22, "NM": 10, "ROE": 12, "DE": 0.8},
            "Utilities": {"PE": 18, "NM": 10, "ROE": 8, "DE": 1.5},
            "Default": {"PE": 20, "NM": 10, "ROE": 12, "DE": 1.0}
        }

    def normalize_symbol(self, symbol):
        symbol = symbol.upper().strip()
        if "." not in symbol:
            symbol += ".NS"
        return symbol

    def balance_sheet_safe(self):
        # Handle potential API failures for balance sheet
        try:
            return self.stock.balance_sheet.fillna(0)
        except:
            return pd.DataFrame()

    def safe_get(self, df, rows):
        """Robust extractor for financial statements."""
        if df.empty: return 0.0
        for row in rows:
            if row in df.index:
                try:
                    val = df.loc[row].iloc[0]
                    return float(val)
                except: continue
        return 0.0

    def interpret(self, value, threshold, mode="high"):
        """Generates a text verdict based on value vs threshold."""
        if value == "N/A" or np.isnan(value): return "No Data"
        
        if mode == "high": # Higher is better
            if value > threshold * 2.0: return f"{Colors.GREEN}Exceptional{Colors.ENDC}"
            elif value > threshold * 1.2: return f"{Colors.GREEN}Strong{Colors.ENDC}"
            elif value > threshold * 0.8: return f"{Colors.WARNING}Average{Colors.ENDC}"
            else: return f"{Colors.FAIL}Weak{Colors.ENDC}"
            
        elif mode == "low": # Lower is better
            if value == 0: return f"{Colors.GREEN}Perfect{Colors.ENDC}"
            if value < threshold * 0.5: return f"{Colors.GREEN}Exceptional{Colors.ENDC}"
            elif value < threshold: return f"{Colors.GREEN}Healthy{Colors.ENDC}"
            elif value < threshold * 1.5: return f"{Colors.WARNING}Caution{Colors.ENDC}"
            else: return f"{Colors.FAIL}Critical{Colors.ENDC}"

    # ================= MODULE 1: SHAREHOLDING & GOVERNANCE =================
    def analyze_shareholding(self):
        print(f"\n{Colors.UNDERLINE}1. SHAREHOLDING & OWNERSHIP DNA{Colors.ENDC}")
        
        insider_hold = self.info.get('heldPercentInsiders', 0) * 100
        inst_hold = self.info.get('heldPercentInstitutions', 0) * 100
        float_shares = self.info.get('floatShares', 0)
        shares_out = self.info.get('sharesOutstanding', 1)
        
        # Float Analysis
        float_pct = (float_shares / shares_out) * 100 if shares_out else 0
        
        # Verdicts
        pm_msg = "High 'Skin in the Game'" if insider_hold > 50 else "Moderate Ownership" if insider_hold > 20 else "Low Promoter Holding"
        inst_msg = "Strong Smart Money Interest" if inst_hold > 25 else "Low Institutional Interest"
        float_msg = "Low Float (Volatile)" if float_pct < 20 else "High Liquidity"
        
        print(f"  {'Promoter/Insider Holding':<30}: {round(insider_hold, 2)}%  -> {pm_msg}")
        print(f"  {'Institutional Holding':<30}: {round(inst_hold, 2)}%  -> {inst_msg}")
        print(f"  {'Public Float %':<30}: {round(float_pct, 2)}%  -> {float_msg}")
        
        # Scoring
        if insider_hold > 45: self.score += 2
        if inst_hold > 20: self.score += 2
        self.max_score += 4
        
        if insider_hold < 10 and inst_hold < 10: 
            self.red_flags.append("Weak Ownership Structure (Low Promoter & Inst)")

    # ================= MODULE 2: PROFITABILITY DEEP DIVE =================
    def analyze_profitability(self):
        print(f"\n{Colors.UNDERLINE}2. COMPREHENSIVE PROFITABILITY ENGINE{Colors.ENDC}")
        
        # Data Points
        rev = self.safe_get(self.financials, ["Total Revenue", "Operating Revenue"])
        gross_profit = self.safe_get(self.financials, ["Gross Profit"])
        ebitda = self.safe_get(self.financials, ["EBITDA", "Normalized EBITDA"])
        ebit = self.safe_get(self.financials, ["EBIT", "Operating Income"])
        net_income = self.safe_get(self.financials, ["Net Income", "Net Income Common Stockholders"])
        
        equity = self.safe_get(self.balance_sheet, ["Total Stockholder Equity"])
        assets = self.safe_get(self.balance_sheet, ["Total Assets"])
        lt_debt = self.safe_get(self.balance_sheet, ["Long Term Debt"])
        
        # Capital Employed = Total Assets - Current Liabilities (Approx: Equity + LT Debt)
        capital_employed = equity + lt_debt
        invested_capital = self.safe_get(self.balance_sheet, ["Invested Capital"]) or capital_employed

        # 1. Margin Ratios
        gm = (gross_profit / rev) * 100 if rev else 0
        om = (ebit / rev) * 100 if rev else 0
        ebitda_m = (ebitda / rev) * 100 if rev else 0
        nm = (net_income / rev) * 100 if rev else 0
        
        # 2. Return Ratios
        roe = (net_income / equity) * 100 if equity else 0
        roa = (net_income / assets) * 100 if assets else 0
        roce = (ebit / capital_employed) * 100 if capital_employed else 0
        roic = (net_income / invested_capital) * 100 if invested_capital else 0

        # Display Margins
        print(f"  {Colors.BOLD}[Margins]{Colors.ENDC}")
        print(f"  {'Gross Margin':<30}: {round(gm, 2)}%  -> {self.interpret(gm, 40, 'high')}")
        print(f"  {'EBITDA Margin':<30}: {round(ebitda_m, 2)}%  -> {self.interpret(ebitda_m, 20, 'high')}")
        print(f"  {'Operating Margin (EBIT)':<30}: {round(om, 2)}%  -> {self.interpret(om, 15, 'high')}")
        print(f"  {'Net Profit Margin':<30}: {round(nm, 2)}%  -> {self.interpret(nm, 10, 'high')}")
        
        # Display Returns
        print(f"  {Colors.BOLD}[Return Metrics]{Colors.ENDC}")
        print(f"  {'ROE (Equity Return)':<30}: {round(roe, 2)}%  -> {self.interpret(roe, 15, 'high')}")
        print(f"  {'ROCE (Capital Efficiency)':<30}: {round(roce, 2)}%  -> {self.interpret(roce, 20, 'high')}")
        print(f"  {'ROIC (Invested Capital)':<30}: {round(roic, 2)}%  -> {self.interpret(roic, 12, 'high')}")
        print(f"  {'ROA (Asset Return)':<30}: {round(roa, 2)}%  -> {self.interpret(roa, 5, 'high')}")
        
        # Scoring
        if roe > 15: self.score += 2
        if roce > 15: self.score += 2
        if nm > 10: self.score += 2
        self.max_score += 6
        
        if roe < 5: self.red_flags.append("Wealth Destroyer: ROE < 5%")
        if om < 0: self.red_flags.append("Operating Loss Detected")

    # ================= MODULE 3: OPERATIONAL EFFICIENCY (CCC) =================
    def analyze_efficiency(self):
        print(f"\n{Colors.UNDERLINE}3. OPERATIONAL EFFICIENCY & CYCLE{Colors.ENDC}")
        
        rev = self.safe_get(self.financials, ["Total Revenue"])
        cogs = self.safe_get(self.financials, ["Cost Of Revenue", "Cost Of Goods Sold"])
        
        inv = self.safe_get(self.balance_sheet, ["Inventory"])
        receivables = self.safe_get(self.balance_sheet, ["Accounts Receivable", "Net Receivables"])
        payables = self.safe_get(self.balance_sheet, ["Accounts Payable"])
        assets = self.safe_get(self.balance_sheet, ["Total Assets"])
        
        # 1. Turnover Ratios
        asset_turnover = rev / assets if assets else 0
        
        # 2. Cash Conversion Cycle Components
        # DIO (Days Inventory Outstanding)
        dio = (inv / cogs) * 365 if cogs else 0
        # DSO (Days Sales Outstanding)
        dso = (receivables / rev) * 365 if rev else 0
        # DPO (Days Payable Outstanding)
        dpo = (payables / cogs) * 365 if cogs else 0
        
        # CCC = DIO + DSO - DPO
        ccc = dio + dso - dpo
        
        print(f"  {'Asset Turnover':<30}: {round(asset_turnover, 2)}x   -> {self.interpret(asset_turnover, 0.8, 'high')}")
        print(f"  {'Inventory Days (DIO)':<30}: {round(dio, 1)} days -> {'Fast Moving' if dio < 60 else 'Slow/Stockpiling'}")
        print(f"  {'Receivable Days (DSO)':<30}: {round(dso, 1)} days -> {'Fast Collection' if dso < 45 else 'Credit Risk'}")
        print(f"  {'Payable Days (DPO)':<30}: {round(dpo, 1)} days -> {'Standard' if dpo < 90 else 'Stretching Vendors'}")
        print(f"  {'Cash Conversion Cycle':<30}: {round(ccc, 1)} days -> {self.interpret(ccc, 90, 'low')}")
        
        if asset_turnover > 0.8: self.score += 2
        if ccc < 60: self.score += 2
        self.max_score += 4

    # ================= MODULE 4: SOLVENCY & LIQUIDITY =================
    def analyze_solvency(self):
        print(f"\n{Colors.UNDERLINE}4. SOLVENCY & LIQUIDITY HEALTH{Colors.ENDC}")
        
        total_debt = self.safe_get(self.balance_sheet, ["Total Debt", "Net Debt"])
        equity = self.safe_get(self.balance_sheet, ["Total Stockholder Equity"])
        curr_assets = self.safe_get(self.balance_sheet, ["Total Current Assets"])
        curr_liab = self.safe_get(self.balance_sheet, ["Total Current Liabilities"])
        inventory = self.safe_get(self.balance_sheet, ["Inventory"])
        cash = self.safe_get(self.balance_sheet, ["Cash And Cash Equivalents"])
        
        ebit = self.safe_get(self.financials, ["EBIT", "Operating Income"])
        interest = self.safe_get(self.financials, ["Interest Expense"])
        assets = self.safe_get(self.balance_sheet, ["Total Assets"])

        # 1. Solvency (Long Term)
        de_ratio = total_debt / equity if equity else 0
        debt_asset_ratio = total_debt / assets if assets else 0
        int_cov = ebit / interest if interest else 100
        
        # 2. Liquidity (Short Term)
        curr_ratio = curr_assets / curr_liab if curr_liab else 0
        # Quick Ratio = (Current Assets - Inventory) / Current Liab
        quick_ratio = (curr_assets - inventory) / curr_liab if curr_liab else 0
        # Cash Ratio = Cash / Current Liab
        cash_ratio = cash / curr_liab if curr_liab else 0

        print(f"  {Colors.BOLD}[Liquidity (Short Term)]{Colors.ENDC}")
        print(f"  {'Current Ratio':<30}: {round(curr_ratio, 2)}   -> {self.interpret(curr_ratio, 1.5, 'high')}")
        print(f"  {'Quick Ratio (Acid Test)':<30}: {round(quick_ratio, 2)}   -> {self.interpret(quick_ratio, 1.0, 'high')}")
        print(f"  {'Cash Ratio':<30}: {round(cash_ratio, 2)}   -> {self.interpret(cash_ratio, 0.5, 'high')}")

        print(f"  {Colors.BOLD}[Solvency (Long Term)]{Colors.ENDC}")
        print(f"  {'Debt-to-Equity':<30}: {round(de_ratio, 2)}   -> {self.interpret(de_ratio, 1.0, 'low')}")
        print(f"  {'Debt-to-Assets':<30}: {round(debt_asset_ratio, 2)}   -> {self.interpret(debt_asset_ratio, 0.5, 'low')}")
        print(f"  {'Interest Coverage':<30}: {round(int_cov, 2)}x   -> {self.interpret(int_cov, 3.0, 'high')}")
        
        if de_ratio < 0.8: self.score += 2
        if int_cov > 4: self.score += 2
        if quick_ratio > 0.8: self.score += 2
        self.max_score += 6
        
        if int_cov < 1.5: self.red_flags.append("Solvency Risk: Interest Coverage < 1.5")
        if quick_ratio < 0.5: self.red_flags.append("Liquidity Risk: Quick Ratio < 0.5")

    # ================= MODULE 5: CASH FLOW QUALITY =================
    def analyze_cash_flow(self):
        print(f"\n{Colors.UNDERLINE}5. CASH FLOW QUALITY & CAPITAL ALLOCATION{Colors.ENDC}")
        
        ocf = self.safe_get(self.cashflow, ["Total Cash From Operating Activities", "Operating Cash Flow"])
        capex = abs(self.safe_get(self.cashflow, ["Capital Expenditures"]))
        net_income = self.safe_get(self.financials, ["Net Income"])
        rev = self.safe_get(self.financials, ["Total Revenue"])
        debt = self.safe_get(self.balance_sheet, ["Total Debt"])
        
        fcf = ocf - capex
        
        # 1. Ratios
        ocf_to_net_income = ocf / net_income if net_income else 0
        fcf_margin = (fcf / rev) * 100 if rev else 0
        capex_intensity = (capex / rev) * 100 if rev else 0
        ocf_to_debt = ocf / debt if debt else 1.0
        
        print(f"  {'Operating Cash Flow (OCF)':<30}: {round(ocf/1e7, 2)} Cr")
        print(f"  {'Free Cash Flow (FCF)':<30}: {round(fcf/1e7, 2)} Cr -> {'Generator' if fcf>0 else 'Burner'}")
        print(f"  {'OCF / Net Income (Quality)':<30}: {round(ocf_to_net_income, 2)}   -> {self.interpret(ocf_to_net_income, 1.0, 'high')}")
        print(f"  {'FCF Margin':<30}: {round(fcf_margin, 2)}%  -> {self.interpret(fcf_margin, 5, 'high')}")
        print(f"  {'Capex Intensity (% of Sales)':<30}: {round(capex_intensity, 2)}%  -> {'Heavy' if capex_intensity > 15 else 'Asset Light'}")
        print(f"  {'OCF / Total Debt':<30}: {round(ocf_to_debt, 2)}   -> {self.interpret(ocf_to_debt, 0.3, 'high')}")

        if fcf > 0: self.score += 2
        if ocf_to_net_income > 0.9: self.score += 2
        self.max_score += 4
        
        if fcf < 0 and ocf < 0: self.red_flags.append("Cash Burn: Negative OCF & FCF")

    # ================= MODULE 6: VALUATION MULTIPLES =================
    def analyze_valuation(self):
        print(f"\n{Colors.UNDERLINE}6. 360-DEGREE VALUATION MATRIX{Colors.ENDC}")
        
        # Market Data
        pe = self.info.get("trailingPE", "N/A")
        fwd_pe = self.info.get("forwardPE", "N/A")
        pb = self.info.get("priceToBook", "N/A")
        ps = self.info.get("priceToSalesTrailing12Months", "N/A")
        peg = self.info.get("pegRatio", "N/A")
        ev_ebitda = self.info.get("enterpriseToEbitda", "N/A")
        ev_rev = self.info.get("enterpriseToRevenue", "N/A")
        
        # Dividend
        div_yield = self.info.get("dividendYield", 0) * 100 if self.info.get("dividendYield") else 0
        payout = self.info.get("payoutRatio", 0) * 100 if self.info.get("payoutRatio") else 0
        
        # Earnings Yield (Inverse of PE)
        ey = (1/pe * 100) if pe != "N/A" and pe > 0 else 0
        
        # Helper
        def v_print(label, val, limit, mode='low'):
            if val == "N/A" or val is None: 
                print(f"  {label:<30}: N/A")
                return 0
            verdict = self.interpret(val, limit, mode)
            print(f"  {label:<30}: {round(val, 2)}   -> {verdict}")
            if mode == 'low' and val < limit: return 1
            if mode == 'high' and val > limit: return 1
            return 0
            
        s = 0
        s += v_print("P/E Ratio (Trailing)", pe, 25)
        s += v_print("Forward P/E", fwd_pe, 20)
        s += v_print("PEG Ratio (Growth Adj.)", peg, 1.0)
        s += v_print("P/B Ratio", pb, 3.0)
        s += v_print("P/S Ratio", ps, 3.0)
        s += v_print("EV / EBITDA", ev_ebitda, 12)
        s += v_print("Earnings Yield %", ey, 5.0, mode='high')
        
        print(f"  {Colors.BOLD}[Shareholder Returns]{Colors.ENDC}")
        print(f"  {'Dividend Yield':<30}: {round(div_yield, 2)}%")
        print(f"  {'Payout Ratio':<30}: {round(payout, 2)}%")
        
        self.score += s
        self.max_score += 7

    # ================= MODULE 7: LIVE SECTOR BENCHMARKING =================
    def analyze_live_sector(self):
        print(f"\n{Colors.UNDERLINE}7. LIVE SECTOR BENCHMARKING (REAL-TIME){Colors.ENDC}")
        
        # 1. Map Sectors to US ETFs (Best proxy for global sector valuation trends)
        # We use US Sector ETFs because they are liquid, real-time, and widely tracked.
        sector_map = {
            "Technology": "XLK",
            "Financial Services": "XLF",
            "Financials": "XLF",
            "Energy": "XLE",
            "Healthcare": "XLV",
            "Consumer Cyclical": "XLY",
            "Consumer Defensive": "XLP",
            "Utilities": "XLU",
            "Basic Materials": "XLB",
            "Industrials": "XLI",
            "Real Estate": "XLRE",
            "Communication Services": "XLC"
        }
        
        my_sector = self.info.get('sector', 'Unknown')
        etf_ticker = sector_map.get(my_sector, "SPY") # Default to S&P 500 if unknown
        
        print(f"  {'Sector Detected':<30}: {Colors.CYAN}{my_sector}{Colors.ENDC}")
        print(f"  {'Benchmark ETF':<30}: {etf_ticker} (Fetching Live Data...)")
        
        # 2. Fetch Live Sector Data
        try:
            sector_obj = yf.Ticker(etf_ticker)
            sec_info = sector_obj.info
            
            # Extract Key Metrics
            sec_pe = sec_info.get('trailingPE', 0)
            sec_pb = sec_info.get('priceToBook', 0)
            sec_yield = sec_info.get('dividendYield', 0) * 100 if sec_info.get('dividendYield') else 0
            sec_beta = sec_info.get('beta3Year', 1.0) # ETFs usually have 3-year beta
            
        except:
            print(f"{Colors.FAIL}  Failed to fetch live sector data.{Colors.ENDC}")
            return

        # 3. Company Metrics
        my_pe = self.info.get("trailingPE", 0)
        my_pb = self.info.get("priceToBook", 0)
        my_yield = self.info.get("dividendYield", 0) * 100 if self.info.get("dividendYield") else 0
        my_beta = self.info.get("beta", 1.0)

        # 4. The Comparison Logic
        def compare(label, company, sector, lower_is_better=True):
            if company == 0 or sector == 0: 
                return "N/A"
            
            # Calculate % difference
            diff = ((company - sector) / sector) * 100
            
            if lower_is_better:
                if diff < -10: return f"{Colors.GREEN}Cheaper ({round(diff,1)}%){Colors.ENDC}"
                elif diff > 10: return f"{Colors.FAIL}Premium ({round(diff,1)}%){Colors.ENDC}"
                else: return f"{Colors.WARNING}Fair Value{Colors.ENDC}"
            else: # Higher is better (Yield)
                if diff > 10: return f"{Colors.GREEN}Better ({round(diff,1)}%){Colors.ENDC}"
                elif diff < -10: return f"{Colors.FAIL}Worse ({round(diff,1)}%){Colors.ENDC}"
                else: return f"{Colors.WARNING}In Line{Colors.ENDC}"

        # 5. Print Table
        print(f"\n  {Colors.BOLD}[Valuation Head-to-Head]{Colors.ENDC}")
        print(f"  {'Metric':<15} | {'Company':<10} | {'Sector Avg':<10} | {'Verdict'}")
        print("-" * 65)
        
        print(f"  {'P/E Ratio':<15} | {round(my_pe, 1):<10} | {round(sec_pe, 1):<10} | {compare('P/E', my_pe, sec_pe, True)}")
        print(f"  {'P/B Ratio':<15} | {round(my_pb, 1):<10} | {round(sec_pb, 1):<10} | {compare('P/B', my_pb, sec_pb, True)}")
        print(f"  {'Div Yield':<15} | {round(my_yield, 1):<10}%| {round(sec_yield, 1):<10}%| {compare('Yield', my_yield, sec_yield, False)}")
        
        # 6. Volatility Check
        print(f"\n  {Colors.BOLD}[Risk Profile]{Colors.ENDC}")
        vol_status = "More Volatile" if my_beta > sec_beta else "More Stable"
        print(f"  {'Beta (Risk)':<30}: {round(my_beta, 2)} vs {round(sec_beta, 2)} (Sector) -> {vol_status}")

        # 7. Update Scores
        # Bonus points if cheaper than sector
        if my_pe > 0 and sec_pe > 0 and my_pe < sec_pe: self.score += 2
        # Bonus points if less volatile than sector
        if my_beta < sec_beta: self.score += 1
        
        self.max_score += 3

    # ================= MAIN RUNNER =================
    def run_full_scan(self):
        if not self.data_available:
            print("Aborting analysis.")
            return

        # Execute
        self.analyze_shareholding()
        self.analyze_profitability()
        self.analyze_efficiency()
        self.analyze_solvency()
        self.analyze_cash_flow()
        self.analyze_valuation()

        self.analyze_live_sector()
        
        # Final Score
        if self.max_score == 0: self.max_score = 1
        final_pct = (self.score / self.max_score) * 100
        
        print(f"\n{Colors.BOLD}======================================================{Colors.ENDC}")
        print(f"{Colors.BOLD}OMNISCIENT VERDICT: {self.symbol}{Colors.ENDC}")
        print(f"Fundamental Health Score: {Colors.CYAN}{round(final_pct, 1)}/100{Colors.ENDC}")
        
        # Detailed Verdict
        if final_pct >= 85:
            rating = f"{Colors.GREEN}💎 FORTRESS (Titanium Balance Sheet){Colors.ENDC}"
            desc = "Exceptional quality. Rare combination of growth, safety, and efficiency."
        elif final_pct >= 70:
            rating = f"{Colors.GREEN}✅ LEADER (High Quality){Colors.ENDC}"
            desc = "Strong fundamentals. A reliable compounder for the long term."
        elif final_pct >= 50:
            rating = f"{Colors.WARNING}⚠️ CONTENDER (Mixed Bag){Colors.ENDC}"
            desc = "Average fundamentals. Invest only if technicals/story align perfectly."
        else:
            rating = f"{Colors.FAIL}❌ LAGGARD (Wealth Destroyer){Colors.ENDC}"
            desc = "Weak fundamentals. High risk of capital erosion."
            
        print(f"Classification: {rating}")
        print(f"Analysis: {desc}")
        
        if self.red_flags:
            print(f"\n{Colors.FAIL}🚨 RISK REPORT (Red Flags):{Colors.ENDC}")
            for flag in self.red_flags:
                print(f"  - {flag}")
        else:
            print(f"\n{Colors.GREEN}✅ Clean Report. No critical risks detected.{Colors.ENDC}")
            
        print(f"{Colors.BOLD}======================================================{Colors.ENDC}")

# ================= EXECUTION =================
if __name__ == "__main__":
    symbol = input("Enter Stock Symbol (e.g., RELIANCE, TCS, AAPL): ")
    system = FinancialSystem(symbol)
    system.run_full_scan()