document.addEventListener("DOMContentLoaded", async () => {
    
  // =========================================================================
  // 1. THE ETF SUPER-DATABASE (Hardcoded for Max Accuracy)
  // =========================================================================
  const ETF_MASTER = {
      // --- BROAD MARKET (NIFTY 50 / SENSEX) ---
      "NIFTYBEES": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "SENSEXBEES": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "ICICINIFTY": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "HDFCNIFTY": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "SBIETF": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "KOTAKNIFTY": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "UTINIFTETF": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "AXISNIFTY": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "BSLNIFTY": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "NIFTYETF": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "LICNETFN50": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "IDFNIFTYET": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "IVZINNIFTY": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "SETFNIF50": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "ICICISENSX": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "HDFCSENSEX": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "KOTAKSENSEX": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "UTISENSETF": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "AXISENSEX": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },
      "SENSEXETF": { "type": "Equity", "cap": "Large", "sector": "Index ETF" },

      // --- NIFTY NEXT 50 ---
      "JUNIORBEES": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },
      "ICICINXT50": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },
      "HDFCNEXT50": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },
      "UTINEXT50": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },
      "SBIETFNX50": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },
      "NEXT50": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },
      "ABSLNN50ET": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },
      "SETFNN50": { "type": "Equity", "cap": "Large", "sector": "Index - Next 50" },

      // --- MID CAP & SMALL CAP ---
      "MID150BEES": { "type": "Equity", "cap": "Mid", "sector": "Index - Midcap 150" },
      "MOTILALOFS": { "type": "Equity", "cap": "Mid", "sector": "Index - Midcap 100" },
      "ICICIM150": { "type": "Equity", "cap": "Mid", "sector": "Index - Midcap 150" },
      "HDFCMID150": { "type": "Equity", "cap": "Mid", "sector": "Index - Midcap 150" },
      "MIDCAPETF": { "type": "Equity", "cap": "Mid", "sector": "Index - Midcap 150" },
      "ABSLMID150": { "type": "Equity", "cap": "Mid", "sector": "Index - Midcap 150" },
      "ICICIMCAP": { "type": "Equity", "cap": "Mid", "sector": "Index - Midcap Select" },
      "SMALLCAP": { "type": "Equity", "cap": "Small", "sector": "Index - Smallcap 250" },
      "HDFCSML250": { "type": "Equity", "cap": "Small", "sector": "Index - Smallcap 250" },
      "MOTM": { "type": "Equity", "cap": "Small", "sector": "Index - Smallcap 250" },
      "MIDSMALL": { "type": "Equity", "cap": "Mid", "sector": "Index - MidSmall 400" },
      "MULTICAP": { "type": "Equity", "cap": "Mid", "sector": "Index - Multicap" },

      // --- SECTOR: BANKING & FINANCE ---
      "BANKBEES": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "PSUBNKBEES": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "KOTAKBKETF": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "ICICIBANKN": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "HDFCBANKETF": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "SBIETFBANK": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "AXISBNKETF": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "BANKETF": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "EBANK": { "type": "Equity", "cap": "Large", "sector": "Bank ETF" },
      "ICICIBANKP": { "type": "Equity", "cap": "Large", "sector": "Private Bank ETF" },
      "KOTAKPSUBK": { "type": "Equity", "cap": "Large", "sector": "PSU Bank ETF" },
      "BANKPSU": { "type": "Equity", "cap": "Large", "sector": "PSU Bank ETF" },
      "BFSI": { "type": "Equity", "cap": "Large", "sector": "Financial Services ETF" },

      // --- SECTOR: TECH, AUTO, OTHERS ---
      "ITBEES": { "type": "Equity", "cap": "Large", "sector": "Tech ETF" },
      "PHARMABEES": { "type": "Equity", "cap": "Large", "sector": "Pharma ETF" },
      "AUTOBEES": { "type": "Equity", "cap": "Large", "sector": "Auto ETF" },
      "INFRABEES": { "type": "Equity", "cap": "Large", "sector": "Infra ETF" },
      "CONSUMBEES": { "type": "Equity", "cap": "Large", "sector": "Consumption ETF" },
      "FMGCGI": { "type": "Equity", "cap": "Large", "sector": "FMCG ETF" },
      "ICICITECH": { "type": "Equity", "cap": "Large", "sector": "Tech ETF" },
      "HDFCNIFIT": { "type": "Equity", "cap": "Large", "sector": "Tech ETF" },
      "SBIETFIT": { "type": "Equity", "cap": "Large", "sector": "Tech ETF" },
      "AXISTECETF": { "type": "Equity", "cap": "Large", "sector": "Tech ETF" },
      "KOTAKIT": { "type": "Equity", "cap": "Large", "sector": "Tech ETF" },
      "ITETF": { "type": "Equity", "cap": "Large", "sector": "Tech ETF" },
      "ICICIPHARM": { "type": "Equity", "cap": "Large", "sector": "Pharma ETF" },
      "ICICIFMCG": { "type": "Equity", "cap": "Large", "sector": "FMCG ETF" },
      "ICICIAUTO": { "type": "Equity", "cap": "Large", "sector": "Auto ETF" },
      "EVINDIA": { "type": "Equity", "cap": "Large", "sector": "EV & Auto ETF" },
      "ICICIINFRA": { "type": "Equity", "cap": "Large", "sector": "Infra ETF" },
      "MAKEINDIA": { "type": "Equity", "cap": "Large", "sector": "Manufacturing ETF" },
      "METAL": { "type": "Equity", "cap": "Large", "sector": "Metal ETF" },

      // --- SMART BETA / FACTOR ---
      "MOM30IETF": { "type": "Equity", "cap": "Large", "sector": "Factor ETF" },
      "LOWVOLIETF": { "type": "Equity", "cap": "Large", "sector": "Factor ETF" },
      "ALPHA": { "type": "Equity", "cap": "Large", "sector": "Factor ETF" },
      "ICICILOVOL": { "type": "Equity", "cap": "Large", "sector": "Factor - Low Volatility" },
      "LOWVOL": { "type": "Equity", "cap": "Large", "sector": "Factor - Low Volatility" },
      "ICICIALPLV": { "type": "Equity", "cap": "Large", "sector": "Factor - Alpha Low Vol" },
      "ALPHAETF": { "type": "Equity", "cap": "Large", "sector": "Factor - Alpha" },
      "ICICINV20": { "type": "Equity", "cap": "Large", "sector": "Factor - Value 20" },
      "NV20BEES": { "type": "Equity", "cap": "Large", "sector": "Factor - Value 20" },
      "KOTAKNV20": { "type": "Equity", "cap": "Large", "sector": "Factor - Value 20" },
      "EQ30": { "type": "Equity", "cap": "Large", "sector": "Factor - Quality" },
      "MOM50": { "type": "Equity", "cap": "Large", "sector": "Factor - Momentum" },
      "ICICIMOM30": { "type": "Equity", "cap": "Large", "sector": "Factor - Momentum" },

      // --- THEMATIC & GLOBAL ---
      "MON100": { "type": "Equity", "cap": "Large", "sector": "Global ETF" },
      "MAFANG": { "type": "Equity", "cap": "Large", "sector": "Global ETF" },
      "HNGSNGBEES": { "type": "Equity", "cap": "Large", "sector": "Global ETF" },
      "CPSEETF": { "type": "Equity", "cap": "Large", "sector": "Thematic ETF" },
      "BHARAT22": { "type": "Equity", "cap": "Large", "sector": "Thematic ETF" },
      "ICICIB22": { "type": "Equity", "cap": "Large", "sector": "Thematic - Bharat 22" },
      "ESG": { "type": "Equity", "cap": "Large", "sector": "Thematic - ESG" },
      "MONQ50": { "type": "Equity", "cap": "Large", "sector": "Global - Nasdaq Q-50" },
      "MOFN100": { "type": "Equity", "cap": "Large", "sector": "Global - Nasdaq 100" },
      "MASPTOP50": { "type": "Equity", "cap": "Large", "sector": "Global - S&P 500 Top 50" },
      "MAHKTECH": { "type": "Equity", "cap": "Large", "sector": "Global - Hang Seng Tech" },

      // --- COMMODITY ---
      "GOLDBEES": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "SILVERBEES": { "type": "Commodity", "cap": "Silver", "sector": "Silver" },
      "GOLDIAM": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "SETFGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "HDFCSILVER": { "type": "Commodity", "cap": "Silver", "sector": "Silver" },
      "HDFCGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "SBIGETS": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "IDBIGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "BSLGOLDETF": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "ICICIGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "GOLDETF": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "IVZINGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "BIRLAGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "ICICISILVER": { "type": "Commodity", "cap": "Silver", "sector": "Silver" },
      "KOTAKSILVER": { "type": "Commodity", "cap": "Silver", "sector": "Silver" },
      "AXISILVER": { "type": "Commodity", "cap": "Silver", "sector": "Silver" },
      "SILVRETF": { "type": "Commodity", "cap": "Silver", "sector": "Silver" },
      "KOTAKGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },
      "AXISGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Gold" },

      // --- DEBT & LIQUID ---
      "LIQUIDBEES": { "type": "Debt", "cap": "Liquid", "sector": "Cash" },
      "LIQUIDETF": { "type": "Debt", "cap": "Liquid", "sector": "Cash" },
      "GILT5YBEES": { "type": "Debt", "cap": "G-Sec", "sector": "Bonds" },
      "LTGILTBEES": { "type": "Debt", "cap": "G-Sec", "sector": "Bonds" },
      "ICICILIQ": { "type": "Debt", "cap": "Liquid", "sector": "Cash" },
      "LIQUID": { "type": "Debt", "cap": "Liquid", "sector": "Cash" },
      "LIQUIDPLUS": { "type": "Debt", "cap": "Liquid", "sector": "Cash" },
      "DSPNEWETF": { "type": "Debt", "cap": "Liquid", "sector": "Cash" },
      "SETF10GILT": { "type": "Debt", "cap": "G-Sec", "sector": "Bonds - 10Y" },
      "ICICI5GSEC": { "type": "Debt", "cap": "G-Sec", "sector": "Bonds - 5Y" },
      "LICNETFGSC": { "type": "Debt", "cap": "G-Sec", "sector": "Bonds - 10Y" },
      "MOGSEC": { "type": "Debt", "cap": "G-Sec", "sector": "Bonds - 5Y" },
      "GSEC10YEAR": { "type": "Debt", "cap": "G-Sec", "sector": "Bonds - 10Y" },
      "EBBETF0430": { "type": "Debt", "cap": "G-Sec", "sector": "Target Maturity - 2030" },
      "EBBETF0431": { "type": "Debt", "cap": "G-Sec", "sector": "Target Maturity - 2031" },
      "EBBETF0432": { "type": "Debt", "cap": "G-Sec", "sector": "Target Maturity - 2032" },
      "MONEYMARKET": { "type": "Debt", "cap": "Liquid", "sector": "Cash" },

      
    "MOM50": { "type": "Equity", "cap": "Large", "sector": "Index - Nifty 50" },
    "MOM100": { "type": "Equity", "cap": "Mid", "sector": "Index - Nifty Midcap 100" },
    "MOSMALL250": { "type": "Equity", "cap": "Small", "sector": "Index - Nifty Smallcap 250" },
    "MONIFTY500": { "type": "Equity", "cap": "Large", "sector": "Index - Nifty 500" },
    "MONEXT50": { "type": "Equity", "cap": "Large", "sector": "Index - Nifty Next 50" },

    "MON100": { "type": "Equity", "cap": "Large", "sector": "Global - Nasdaq 100" },
    "MONQ50": { "type": "Equity", "cap": "Large", "sector": "Global - Nasdaq Q-50" },

    "MODEFENCE": { "type": "Equity", "cap": "Mid", "sector": "Sector - Defence" },
    "MOHEALTH": { "type": "Equity", "cap": "Large", "sector": "Sector - Healthcare" },
    "MOREALTY": { "type": "Equity", "cap": "Mid", "sector": "Sector - Realty" },
    "MOBANK": { "type": "Equity", "cap": "Large", "sector": "Sector - Banking" },
    "MOIT": { "type": "Equity", "cap": "Large", "sector": "Sector - IT" },
    "MOINFRA": { "type": "Equity", "cap": "Large", "sector": "Sector - Infrastructure" },
    "MOENERGY": { "type": "Equity", "cap": "Large", "sector": "Sector - Energy" },
    "MOCAPITAL": { "type": "Equity", "cap": "Mid", "sector": "Sector - Capital Markets" },
    "MOSERVICES": { "type": "Equity", "cap": "Large", "sector": "Sector - Services" },
    "MOTOURISM": { "type": "Equity", "cap": "Mid", "sector": "Sector - Tourism" },
    "MOMANUFACTURING": { "type": "Equity", "cap": "Large", "sector": "Sector - Manufacturing" },
    "MOPSE": { "type": "Equity", "cap": "Large", "sector": "Sector - PSU" },

    "MOVALUE": { "type": "Equity", "cap": "Large", "sector": "Smart Beta - Value" },
    "MOQUALITY": { "type": "Equity", "cap": "Large", "sector": "Smart Beta - Quality" },
    "MOLOWVOL": { "type": "Equity", "cap": "Large", "sector": "Smart Beta - Low Volatility" },
    "MOMOMENTUM": { "type": "Equity", "cap": "Large", "sector": "Smart Beta - Momentum 30" },
    "MOMENTUM50": { "type": "Equity", "cap": "Large", "sector": "Smart Beta - Momentum 50" },
    "MOALPHA": { "type": "Equity", "cap": "Mid", "sector": "Smart Beta - Alpha 50" },

    "MOIPO": { "type": "Equity", "cap": "Mid", "sector": "Thematic - IPO" },
    "MOMNC": { "type": "Equity", "cap": "Large", "sector": "Thematic - MNC" },
    "MOESG": { "type": "Equity", "cap": "Large", "sector": "Thematic - ESG" },
    
    "MOGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Commodity - Gold" },
    "MOSILVER": { "type": "Commodity", "cap": "Silver", "sector": "Commodity - Silver" },
  
    "MOGSEC": { "type": "Debt", "cap": "G-Sec", "sector": "Debt - 5Y G-Sec" },


  
  "GOLDCASE": { "type": "Commodity", "cap": "Gold", "sector": "Commodity - Gold" },
  "LIQUIDCASE": { "type": "Debt", "cap": "Liquid", "sector": "Debt - Cash" },
  
  "CONSUMER": { "type": "Equity", "cap": "Large", "sector": "Thematic - Consumption" },
  "EVINDIA": { "type": "Equity", "cap": "Large", "sector": "Thematic - Electric Vehicles" },
  "MAKEINDIA": { "type": "Equity", "cap": "Large", "sector": "Thematic - Manufacturing" },
  "BFSI": { "type": "Equity", "cap": "Large", "sector": "Sector - Financial Services" },
  "MULTICAP": { "type": "Equity", "cap": "Mid", "sector": "Index - Nifty 500 Multicap" },
  "SMALLCAP": { "type": "Equity", "cap": "Small", "sector": "Smart Beta - Smallcap Quality" },
  "ESG": { "type": "Equity", "cap": "Large", "sector": "Thematic - ESG Leaders" },
  "METAL": { "type": "Equity", "cap": "Large", "sector": "Sector - Metal" },
  
  "NIFTYEES": { "type": "Equity", "cap": "Large", "sector": "Index - Nifty 50" },
  "EBANK": { "type": "Equity", "cap": "Large", "sector": "Sector - Banking" },
  "EQ30": { "type": "Equity", "cap": "Large", "sector": "Smart Beta - Quality 30" },
  
  "ICICI500": { "type": "Equity", "cap": "Mid", "sector": "Index - S&P BSE 500" },
  "ABSLBANETF": { "type": "Equity", "cap": "Large", "sector": "Sector - Banking" },
  "ABSLNN50ET": { "type": "Equity", "cap": "Large", "sector": "Index - Nifty Next 50" },
  
  "IVZINGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Commodity - Gold" },
  "IVZINNIFTY": { "type": "Equity", "cap": "Large", "sector": "Index - Nifty 50" },
  "IDBIGOLD": { "type": "Commodity", "cap": "Gold", "sector": "Commodity - Gold" },
  "BSLGOLDETF": { "type": "Commodity", "cap": "Gold", "sector": "Commodity - Gold" }

  };

  // =========================================================================
  // 2. DYNAMIC DATA LOADING ENGINE
  // =========================================================================
  
  let STOCK_MASTER = {};

  async function loadMarketData() {
      try {
          // A. Load External JSON
          console.log("Fetching market data...");
          const response = await fetch('indian_market_final.json');
          
          if (!response.ok) {
              throw new Error(`Failed to load JSON file (Status: ${response.status})`);
          }
          
          const rawData = await response.json();
          
          // B. Merge External Data with ETF Master
          // Note: ETF_MASTER takes priority to ensure correct categorization
          STOCK_MASTER = { ...rawData, ...ETF_MASTER };
          
          // C. Patch "Variable" Caps from JSON to "Small" (Conservative default)
          for(let sym in STOCK_MASTER) {
              if(STOCK_MASTER[sym].cap === "Variable") {
                  STOCK_MASTER[sym].cap = "Small"; 
              }
          }
          
          console.log("✅ Market Data Loaded Successfully: ", Object.keys(STOCK_MASTER).length, " entries");

      } catch (e) {
          console.error("⚠️ Data Load Error:", e);
          alert("Notice: Could not load 'indian_market_final.json'. Using internal ETF database only.");
          STOCK_MASTER = ETF_MASTER; // Fallback
      }
  }

  // Init Data Load
  await loadMarketData();


  // =========================================================================
  // 3. UI & FILE HANDLING
  // =========================================================================

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  if(dropZone && fileInput) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  }

  function handleFile(file) {
    if(!file) return;
    const fName = file.name.toLowerCase();
    const reader = new FileReader();
    
    if (fName.endsWith('.csv')) {
      reader.onload = (e) => parseCSV(e.target.result);
      reader.readAsText(file);
    } else if (fName.endsWith('.xlsx') || fName.endsWith('.xls')) {
      reader.onload = (e) => parseExcel(e.target.result);
      reader.readAsArrayBuffer(file);
    } else {
      alert("Please upload a valid CSV or Excel file.");
    }
  }

  function parseCSV(text) {
    const rows = text.split(/\r\n|\n/).map(line => line.split(','));
    processData(rows);
  }
  
  function parseExcel(buffer) {
    try {
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
      processData(json);
    } catch(e) {
      console.error(e);
      alert("Error reading Excel file.");
    }
  }

  // =========================================================================
  // 4. INTELLIGENT PARSER
  // =========================================================================

  function processData(rows) {
    if (!rows || rows.length < 2) return alert("File appears empty.");

    // Detect Header
    let headerIdx = -1;
    const symbolTerms = ['symbol', 'scrip', 'instrument', 'security', 'stock name'];
    
    for(let i=0; i<Math.min(rows.length, 25); i++) {
      const rowStr = rows[i].map(c => c ? c.toString().toLowerCase().trim() : '').join(' ');
      if (symbolTerms.some(term => rowStr.includes(term))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) return alert("Could not find a 'Symbol' column. Check your file headers.");

    const headers = rows[headerIdx].map(c => c ? c.toString().toLowerCase().trim() : '');
    
    // Column Mapping
    const findCol = (terms) => {
        for (let term of terms) {
            const idx = headers.findIndex(h => h.includes(term));
            if (idx !== -1) return idx;
        }
        return -1;
    };
    
    const symbolIdx = findCol(['symbol', 'scrip', 'instrument', 'stock name']);
    const qtyIdx = findCol(['quantity available', 'quantity', 'qty', 'units', 'shares']);
    const priceIdx = findCol(['previous closing', 'closing price', 'ltp', 'current price', 'market price', 'last price', 'average price']);
    const valueIdx = findCol(['current value', 'market value', 'present value', 'net value']);

    if (symbolIdx === -1) return alert("Header found, but 'Symbol' column is missing.");

    let portfolio = [];
    
    for(let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if(!row || !row[symbolIdx]) continue;

      let rawSymbol = row[symbolIdx].toString().toUpperCase();
      // CLEAN SYMBOL LOGIC (Crucial for matching)
      let symbol = rawSymbol
        .replace(/NSE:|BSE:|ISIN:|INE[0-9A-Z]+|"/g, '')
        .replace(/-EQ|-BE|-SM/g, '') // Remove Zerodha suffixes
        .trim();
        
      if(symbol.includes('.')) symbol = symbol.split('.')[0].trim();

      const cleanNum = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const str = val.toString().replace(/,/g, '').replace(/₹/g, '').trim();
        return parseFloat(str) || 0;
      };

      let val = 0;
      if (valueIdx !== -1 && row[valueIdx]) {
        val = cleanNum(row[valueIdx]);
      } else if (qtyIdx !== -1 && priceIdx !== -1) {
        const q = cleanNum(row[qtyIdx]);
        const p = cleanNum(row[priceIdx]);
        if (q > 0 && p > 0) val = q * p;
      }

      if (val > 10) { 
        portfolio.push({ symbol, value: val });
      }
    }

    if (portfolio.length > 0) {
      analyze(portfolio);
    } else {
      alert("Found symbols but could not calculate values.");
    }
  }

  // =========================================================================
  // 5. ANALYTICS ENGINE (With Unclassified Tracker)
  // =========================================================================

  function analyze(data) {
    try {
      const upSec = document.getElementById('uploadSection');
      const dashSec = document.getElementById('analysisDashboard');
      if(upSec) upSec.classList.add('hidden');
      if(dashSec) dashSec.classList.remove('hidden');

      let totalValue = 0;
      let unknownList = []; // Track unclassified items

      let stats = {
        Equity: { total: 0, caps: { Large: 0, Mid: 0, Small: 0, Unknown: 0 }, sectors: {} },
        Debt: { total: 0, types: { Liquid: 0, Bonds: 0, Other: 0 } },
        Commodity: { total: 0, types: { Gold: 0, Silver: 0, Other: 0 } },
        Other: { total: 0 }
      };

      data.forEach(item => {
        totalValue += item.value;
        const sym = item.symbol;
        
        let type = "Equity", cap = "Unknown", sector = "Other";
        let isIdentified = false;

        // 1. Check Master DB
        if (STOCK_MASTER[sym]) {
          const info = STOCK_MASTER[sym];
          type = info.type;
          cap = info.cap;
          sector = info.sector;
          isIdentified = true;
        } else {
          // 2. Heuristics fallback
          if (sym.includes('GOLD') || sym.includes('SGB')) { type = 'Commodity'; cap = 'Gold'; sector = 'Gold'; isIdentified = true; }
          else if (sym.includes('SILVER')) { type = 'Commodity'; cap = 'Silver'; sector = 'Silver'; isIdentified = true; }
          else if (sym.includes('LIQUID') || sym.includes('FUND') || sym.includes('BOND')) { type = 'Debt'; cap = 'Bonds'; sector = 'Fixed Income'; isIdentified = true; }
          else if (sym.includes('NIFTY') || sym.includes('SENSEX')) { type = 'Equity'; cap = 'Large'; sector = 'Index ETF'; isIdentified = true; }
          else if (sym.includes('BEES') || sym.includes('ETF')) { type = 'Equity'; cap = 'Large'; sector = 'Thematic ETF'; isIdentified = true; }
          else { 
            // Truly Unknown
            type = 'Equity'; cap = 'Unknown'; sector = 'Diversified'; 
            unknownList.push({ symbol: sym, value: item.value }); 
          }
        }

        // 3. Aggregate
        if (type === 'Equity') {
          stats.Equity.total += item.value;
          stats.Equity.caps[cap] = (stats.Equity.caps[cap] || 0) + item.value;
          stats.Equity.sectors[sector] = (stats.Equity.sectors[sector] || 0) + item.value;
        } else if (type === 'Commodity') {
          stats.Commodity.total += item.value;
          let k = 'Other';
          if(cap.includes('Gold') || cap.includes('SGB') || sector === 'Gold') k = 'Gold';
          else if(cap.includes('Silver') || sector === 'Silver') k = 'Silver';
          stats.Commodity.types[k] += item.value;
        } else if (type === 'Debt') {
          stats.Debt.total += item.value;
          const k = sym.includes('LIQUID') ? 'Liquid' : 'Bonds';
          stats.Debt.types[k] += item.value;
        } else {
          stats.Other.total += item.value;
        }
      });

      // UI Updates
      const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
      setText('totalValue', `₹${(totalValue/100000).toFixed(2)} Lakh`);

      let topAsset = "None", maxVal = -1;
      if (stats.Equity.total > maxVal) { maxVal = stats.Equity.total; topAsset = "Equity"; }
      if (stats.Commodity.total > maxVal) { maxVal = stats.Commodity.total; topAsset = "Gold/Silver"; }
      if (stats.Debt.total > maxVal) { maxVal = stats.Debt.total; topAsset = "Debt"; }
      setText('topAsset', topAsset);

      let riskW = (stats.Equity.caps.Large * 0.3) + 
                  (stats.Equity.caps.Mid * 0.7) + 
                  (stats.Equity.caps.Small * 1.0) + 
                  (stats.Equity.caps.Unknown * 0.9) +
                  (stats.Commodity.total * 0.2) +
                  (stats.Debt.total * 0.05);
      
      let score = totalValue > 0 ? Math.min(100, Math.round((riskW / totalValue) * 100)) : 0;
      setText('riskScore', `${score}/100`);
      const bar = document.getElementById('riskFill');
      if(bar) bar.style.width = `${score}%`;

      renderCharts(stats);
      generateInsights(stats, totalValue, score);
      renderHierarchy(stats, totalValue, unknownList);

    } catch (err) {
      console.error("Dashboard Render Error:", err);
    }
  }

  // =========================================================================
  // 6. VISUALS & BREAKDOWN (Showing Unknowns)
  // =========================================================================

  let charts = {};

  function renderCharts(stats) {
    const draw = (id, type, data, opts) => {
      const ctx = document.getElementById(id);
      if(!ctx) return;
      if(charts[id]) charts[id].destroy();
      charts[id] = new Chart(ctx, { type, data, options: opts });
    };

    const commonOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {color: '#888'} } } };

    draw('assetClassChart', 'doughnut', {
      labels: ['Equity', 'Debt', 'Gold', 'Silver', 'Other'],
      datasets: [{
        data: [stats.Equity.total, stats.Debt.total, stats.Commodity.types.Gold, stats.Commodity.types.Silver, stats.Other.total],
        backgroundColor: ['#4F7CFF', '#00b894', '#FFD700', '#C0C0C0', '#636e72'], borderWidth: 0
      }]
    }, commonOpts);

    draw('marketCapChart', 'pie', {
      labels: ['Large', 'Mid', 'Small', 'Unknown'],
      datasets: [{
        data: [stats.Equity.caps.Large, stats.Equity.caps.Mid, stats.Equity.caps.Small, stats.Equity.caps.Unknown],
        backgroundColor: ['#4F7CFF', '#C7F000', '#ff4757', '#a29bfe'], borderWidth: 0
      }]
    }, commonOpts);

    const sectors = Object.entries(stats.Equity.sectors).sort((a,b) => b[1] - a[1]).slice(0, 8);
    draw('sectorChart', 'bar', {
      labels: sectors.map(s=>s[0]),
      datasets: [{ label: 'Value', data: sectors.map(s=>s[1]), backgroundColor: '#4F7CFF', borderRadius: 4 }]
    }, { 
      responsive: true, maintainAspectRatio: false, 
      scales: { x: { grid: {display:false}, ticks:{color:'#888'} }, y: { grid:{color:'#333'}, ticks:{color:'#888'} } },
      plugins: { legend: {display:false} }
    });
  }

  function renderHierarchy(stats, total, unknownList) {
    const box = document.getElementById('hierarchyContainer');
    if(!box || total === 0) return;
    
    const p = (v) => ((v/total)*100).toFixed(1) + '%';
    let h = '<div class="h-list">';
    
    // Equity Section
    if(stats.Equity.total > 0) {
      h += `<div class="h-item main-cat"><span class="h-name">📈 EQUITY</span><span class="h-val">${p(stats.Equity.total)}</span></div>`;
      h += `<div class="h-sub">`;
      if(stats.Equity.caps.Large > 0) h += `<div class="h-row"><span>Large Cap</span><span>${p(stats.Equity.caps.Large)}</span></div>`;
      if(stats.Equity.caps.Mid > 0) h += `<div class="h-row"><span>Mid Cap</span><span>${p(stats.Equity.caps.Mid)}</span></div>`;
      if(stats.Equity.caps.Small > 0) h += `<div class="h-row"><span>Small Cap</span><span>${p(stats.Equity.caps.Small)}</span></div>`;
      if(stats.Equity.caps.Unknown > 0) h += `<div class="h-row" style="color:#ff4757;"><span>Unknown/Other</span><span>${p(stats.Equity.caps.Unknown)}</span></div>`;
      h += `</div>`;
    }
    
    // Commodity Section
    if(stats.Commodity.total > 0) {
      h += `<div class="h-item main-cat"><span class="h-name">🧈 COMMODITIES</span><span class="h-val">${p(stats.Commodity.total)}</span></div>`;
      h += `<div class="h-sub">`;
      if(stats.Commodity.types.Gold > 0) h += `<div class="h-row"><span>Gold</span><span>${p(stats.Commodity.types.Gold)}</span></div>`;
      if(stats.Commodity.types.Silver > 0) h += `<div class="h-row"><span>Silver</span><span>${p(stats.Commodity.types.Silver)}</span></div>`;
      h += `</div>`;
    }
    
    // Debt Section
    if(stats.Debt.total > 0) {
      h += `<div class="h-item main-cat"><span class="h-name">🛡️ DEBT</span><span class="h-val">${p(stats.Debt.total)}</span></div>`;
      h += `<div class="h-sub">`;
      if(stats.Debt.types.Liquid > 0) h += `<div class="h-row"><span>Liquid</span><span>${p(stats.Debt.types.Liquid)}</span></div>`;
      if(stats.Debt.types.Bonds > 0) h += `<div class="h-row"><span>Bonds</span><span>${p(stats.Debt.types.Bonds)}</span></div>`;
      h += `</div>`;
    }

    // --- UNKNOWN SPECIFICS (The "Particulars" Section) ---
    if(unknownList.length > 0) {
      h += `<div class="h-item main-cat" style="background:rgba(255,71,87,0.1); border:1px solid rgba(255,71,87,0.3); margin-top:20px;">
              <span class="h-name" style="color:#ff4757;">⚠️ UNCLASSIFIED HOLDINGS</span>
            </div>`;
      h += `<div class="h-sub" style="border-left:2px solid #ff4757;">`;
      unknownList.forEach(item => {
         h += `<div class="h-row"><span>${item.symbol}</span><span>₹${Math.round(item.value).toLocaleString()}</span></div>`;
      });
      h += `<div class="h-row" style="font-size:12px; opacity:0.7; margin-top:8px;"><i>(These symbols were not found in our database. Please check spelling or manually categorize.)</i></div>`;
      h += `</div>`;
    }
    
    h += '</div>';
    box.innerHTML = h;
  }

  function generateInsights(stats, total, risk) {
    if(total === 0) return;
    const eq = stats.Equity;
    
    const largeP = (eq.caps.Large / total);
    const smallP = (eq.caps.Small / total);
    const goldP = (stats.Commodity.total / total);

    let good = "Balanced Start.", bad = "Review Allocation.", verdict = "Neutral";

    if (goldP > 0.1) good = "Smart Hedge: You own Gold. You're ready for a crisis.";
    else if (largeP > 0.6) good = "Rock Solid: Heavy Large Cap allocation implies stability.";
    else if (smallP > 0.3) good = "High Growth Potential: You are aggressively chasing alpha.";

    if (smallP > 0.5) bad = "Volatility Risk: Too much Small Cap exposure. Expect wild swings.";
    else if (eq.caps.Unknown > eq.total * 0.5) bad = "Mystery Portfolio: Too many unrecognized stocks.";
    else if (largeP > 0.9) bad = "Low Growth: This is basically a glorified FD.";

    if (risk > 75) verdict = "The Daredevil";
    else if (risk < 25) verdict = "The Conservative";
    else verdict = "The Strategist";

    const setText = (id, t) => { const el = document.getElementById(id); if(el) el.innerText = t; };
    setText('goodInsight', good);
    setText('badInsight', bad);
    setText('verdictInsight', verdict);
  }
});
