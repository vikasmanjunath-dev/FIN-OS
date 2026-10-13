import { num, row, type CalcDef } from './types.ts';
import { rupee } from './fmt.ts';

const G = 'trade' as const;

export const TRADE: CalcDef[] = [
  {
    id: 'breakeven', group: G, title: 'Break-Even Calculator', blurb: 'The exit price where a trade costs you nothing.', web: 'trading & markets/breakeven.html',
    inputs: [num('entry', 'Entry price', '₹', 500, 0, 100000, 1), num('qty', 'Quantity', '', 100, 1, 1000, 1), num('fixed', 'Fixed costs (brokerage etc.)', '₹', 40, 0, 100000, 1), num('var', 'Variable costs (STT / tax)', '%', 0.1, 0, 1, 0.01)],
    run: ({ entry, qty, fixed, var: v }) => {
      const varPct = v / 100, entryVal = entry * qty;
      const be = (fixed + entryVal * (1 + varPct)) / (qty * (1 - varPct));
      return [row('entryVal', 'Entry value', '₹' + Math.round(entryVal).toLocaleString()), row('costVal', 'Total costs', '₹' + Math.round(be * qty - entryVal).toLocaleString()), row('beVal', '', 'Exit Above: ₹' + be.toFixed(2), { hero: true })];
    },
  },
  {
    id: 'brokerage', group: G, title: 'Brokerage Calculator', blurb: 'Taxes and charges on an equity trade.', web: 'trading & markets/brokerage.html',
    inputs: [
      { kind: 'choice', key: 'mode', label: 'Trade type', def: 'delivery', webVar: 'type', options: [{ id: 'delivery', label: 'Delivery' }, { id: 'intraday', label: 'Intraday' }] },
      num('buy', 'Buy price', '₹', 1000, 0, 1000000, 1), num('sell', 'Sell price', '₹', 1100, 0, 1000000, 1), num('qty', 'Quantity', '', 50, 1, 1000, 1),
    ],
    run: ({ mode, buy, sell, qty }) => {
      const buyVal = buy * qty, sellVal = sell * qty, turnover = buyVal + sellVal, gross = sellVal - buyVal;
      const brokerage = mode === 'delivery' ? 0 : Math.min(20, turnover * 0.0003) * 2;
      const stt = mode === 'delivery' ? (buyVal + sellVal) * 0.001 : sellVal * 0.00025;
      const exc = turnover * 0.0000345, sebi = turnover * 0.000001, stamp = buyVal * 0.00015;
      const gst = (brokerage + exc + sebi) * 0.18;
      const charges = brokerage + stt + exc + sebi + stamp + gst;
      const net = gross - charges;
      return [row('turnover', 'Turnover', rupee(turnover)), row('totalTax', 'Total taxes & charges', rupee(charges), { tone: 'warn' }), row('netPnL', '', 'Net P&L: ' + rupee(net), { tone: net >= 0 ? 'good' : 'bad', hero: true })];
    },
    notes: ['Approximate: a flat-fee discount broker, NSE charges, STT, stamp duty and GST. Your broker\'s contract note is the final word.'],
  },
  {
    id: 'futurespl', group: G, title: 'Futures P&L', blurb: 'Profit or loss on futures by lot size.', web: 'trading & markets/futurespl.html',
    inputs: [
      { kind: 'choice', key: 'side', label: 'Side', def: 'long', webVar: 'side', options: [{ id: 'long', label: 'Long (buy)' }, { id: 'short', label: 'Short (sell)' }] },
      num('lot', 'Lot size', '', 50, 1, 100000, 1), num('entry', 'Entry price', '₹', 24000, 0, 10000000, 1), num('exit', 'Exit price', '₹', 24100, 0, 10000000, 1), num('qty', 'Number of lots', '', 1, 1, 50, 1),
    ],
    run: ({ side, lot, entry, exit, qty }) => {
      const points = side === 'long' ? exit - entry : entry - exit;
      const totalQty = lot * qty, pnl = points * totalQty;
      return [row('ptsVal', 'Points captured', points.toFixed(2)), row('valVal', 'Total value', rupee(entry * totalQty)),
        row('pnlVal', '', pnl >= 0 ? 'Profit: ' + rupee(pnl) : 'Loss: ' + rupee(pnl), { tone: pnl >= 0 ? 'good' : 'bad', hero: true })];
    },
    notes: ['Gross profit or loss before brokerage, STT and exchange charges.'],
  },
  {
    id: 'margin', group: G, title: 'Margin Calculator', blurb: 'Margin blocked for one futures contract.', web: 'trading & markets/margin.html',
    inputs: [num('price', 'Price per unit', '₹', 24000, 0, 10000000, 1), num('lot', 'Lot size', '', 25, 1, 100000, 1), num('span', 'SPAN margin (volatility risk)', '%', 10, 5, 20, 0.5), num('exp', 'Exposure margin', '%', 2, 1, 5, 0.1)],
    run: ({ price, lot, span, exp }) => {
      const contract = price * lot, margin = contract * (span / 100 + exp / 100);
      return [row('contractVal', 'Contract value', rupee(contract)), row('marginVal', 'Blocked margin', rupee(margin)), row('leverageVal', '', (contract / margin).toFixed(1) + 'x Leverage', { hero: true })];
    },
    notes: ['Exchanges change SPAN and exposure margins daily, so use your broker\'s margin calculator before trading.'],
  },
  {
    id: 'optionspayoff', group: G, title: 'Options Payoff', blurb: 'Maximum profit, loss and break-even at expiry.', web: 'trading & markets/options.html',
    inputs: [
      { kind: 'choice', key: 'type', label: 'Strategy', def: 'longCall', id: 'type', options: [{ id: 'longCall', label: 'Long call (buy CE)' }, { id: 'longPut', label: 'Long put (buy PE)' }, { id: 'shortCall', label: 'Short call (sell CE)' }, { id: 'shortPut', label: 'Short put (sell PE)' }] },
      num('strike', 'Strike price', '₹', 24000, 0, 10000000, 50), num('premium', 'Premium paid / received', '₹', 200, 0, 1000000, 1), num('lot', 'Lot size', '', 25, 1, 100000, 1),
    ],
    run: ({ type, strike: k, premium: prem, lot }) => {
      let be = 0, maxP: number | string = 0, maxL: number | string = 0;
      if (type === 'longCall') { be = k + prem; maxP = 'Unlimited'; maxL = prem * lot; }
      else if (type === 'longPut') { be = k - prem; maxP = (k - prem) * lot; maxL = prem * lot; }
      else if (type === 'shortCall') { be = k + prem; maxP = prem * lot; maxL = 'Unlimited'; }
      else if (type === 'shortPut') { be = k - prem; maxP = prem * lot; maxL = (k - prem) * lot; }
      return [row('maxProfit', 'Max profit', typeof maxP === 'number' ? '₹' + Math.round(maxP) : maxP, { tone: 'good' }), row('maxLoss', 'Max loss', typeof maxL === 'number' ? '₹' + Math.round(maxL) : maxL, { tone: 'bad' }),
        row('beVal', '', 'Break Even: ' + Math.round(be), { hero: true })];
    },
    notes: ['At expiry only, before brokerage and charges. Selling options carries large or unlimited risk.'],
  },
  {
    id: 'positionsize', group: G, title: 'Position Size', blurb: 'The quantity that keeps a trade within your risk limit.', web: 'trading & markets/positionsize.html',
    inputs: [num('capital', 'Capital', '₹', 100000, 10000, 5000000, 5000), num('risk', 'Risk per trade', '%', 1, 0.1, 5, 0.1), num('entry', 'Entry price', '₹', 500, 0, 10000000, 1), num('sl', 'Stop-loss price', '₹', 480, 0, 10000000, 1)],
    run: ({ capital, risk, entry, sl }) => {
      const riskAmount = capital * (risk / 100), diff = Math.abs(entry - sl);
      if (diff === 0 || entry === 0) return [];
      const qty = Math.floor(riskAmount / diff), used = qty * entry;
      return [row('lossVal', 'Max loss', rupee(riskAmount), { tone: 'warn' }), row('capUsedVal', 'Capital used', rupee(used)),
        row('qtyVal', '', used > capital ? 'Funds Insufficient ⚠️' : 'Buy ' + qty + ' Qty', { tone: used > capital ? 'bad' : 'good', hero: true })];
    },
  },
  {
    id: 'riskpertrade', group: G, title: 'Risk Per Trade', blurb: 'Is your trade size safe for your account?', web: 'trading & markets/riskper.html',
    inputs: [num('capital', 'Trading capital', '₹', 100000, 10000, 5000000, 10000), num('entry', 'Entry price', '₹', 250, 0, 10000000, 1), num('sl', 'Stop-loss price', '₹', 240, 0, 10000000, 1), num('qty', 'Quantity / lots', '', 100, 1, 1000, 1)],
    run: ({ capital, entry, sl, qty }) => {
      const risk = Math.abs(entry - sl) * qty, pct = (risk / capital) * 100;
      return [row('riskAmt', 'Risk amount', rupee(risk)), row('riskPct', '% of capital', pct.toFixed(2) + '%'),
        row('statusVal', '', pct > 2 ? 'High Risk! ⚠️' : pct > 1 ? 'Moderate Risk ⚠️' : 'Safe Trade ✅', { tone: pct > 2 ? 'bad' : pct > 1 ? 'warn' : 'good', hero: true })];
    },
    notes: ['A common rule is to risk no more than 1 to 2% of capital on one trade.'],
  },
  {
    id: 'vega', group: G, title: 'Volatility Impact (Vega)', blurb: 'How a change in implied volatility moves an option\'s premium.', web: 'trading & markets/volatility.html',
    inputs: [num('prem', 'Current option premium', '₹', 200, 0, 1000000, 1), num('vega', 'Option vega', '₹', 15, 0, 100000, 1), num('iv', 'Change in IV (±)', '%', 5, -20, 20, 1)],
    run: ({ prem, vega, iv }) => {
      const change = vega * iv, np = Math.max(0, prem + change);
      return [row('oldVal', 'Old premium', '₹' + prem), row('newVal', 'New premium', '₹' + np),
        row('diffVal', '', change > 0 ? 'Increase: +₹' + change : 'Decrease: -₹' + Math.abs(change), { tone: change > 0 ? 'good' : 'bad', hero: true })];
    },
    notes: ['Vega is the premium change for a one-point move in implied volatility. It shifts as the option ages and moves in or out of the money.'],
  },
];
