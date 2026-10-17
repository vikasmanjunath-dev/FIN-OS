// Trade journal: files in and out (pure; nothing here touches storage or the network).
//   * CSV export in this app's own columns, and the same file read back (a round trip loses nothing).
//   * CSV import of a table of trades, or of a broker's trade book (one row per fill: buys and sells are paired into round trips).
//   * JSON import of the website's TradeBook backup (tradebook_backup_*.json), mapped field by field.
//   * Merge with duplicate detection, and undo of a whole import (every imported record carries src:'import' and its batch).
// Like lib/statementImport.ts, rows that cannot be read are skipped and listed, never guessed.
import { parseCSV, toNumber, parseDate, detectDateOrder } from '@/lib/statementImport';
import {
  CHARGE_FIELDS, DISCIPLINE, PLAN_ADHERENCE, SETUP_GRADES, TAG_TYPES, chargesOf, grossOf, hasCharges, netOf, priceGross, r2, readTag, readTrade, todayISO, validDate,
  type Tag, type Trade,
} from '@/lib/tradeJournal';
import { finite, isPlainObject, parseJSON, text } from '@/lib/safeStore';

export const MAX_ROWS = 20000;
export const MAX_FILE_CHARS = 5_000_000;

// ── export ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const HEAD = ['Date', 'Symbol', 'Side', 'Instrument type', 'Entry price', 'Exit price', 'Quantity', 'Lot size', 'Gross profit',
  'Brokerage', 'STT', 'Exchange charges', 'SEBI fee', 'GST', 'Slippage', 'Other charges', 'Total charges', 'Net profit',
  'Setup', 'Setup grade', 'Market regime', 'Emotion before', 'Emotion during', 'Revenge trade', 'Impulsive trade', 'Rules', 'Plan',
  'Confidence', 'Stress', 'Energy', 'Tags', 'Entry time', 'Exit time', 'Reason', 'Mistakes', 'Lesson', 'Notes'] as const;

/** A text cell: quoted when needed, and a leading = + - @ (or tab / return) is defused so a spreadsheet never runs it as a formula. */
export function csvText(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** A number cell: written as a plain number (a negative profit starts with "-" and must stay a number). Blank when absent. */
const csvNum = (v: number | null | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** The whole journal as CSV text (CRLF rows). Blank cells mean "not recorded": a recorded 0 is written as 0. */
export function toCsv(trades: readonly Trade[], tags: readonly Tag[]): string {
  const name = new Map(tags.map(t => [t.id, t.name]));
  const yn = (b: boolean | undefined) => (b === true ? 'yes' : b === false ? 'no' : '');
  const rows = trades.map(t => {
    const g = grossOf(t);
    return [
      t.date, csvText(t.symbol), t.direction ?? '', csvText(t.instrumentType), csvNum(t.entry), csvNum(t.exit), csvNum(t.qty), csvNum(t.lotSize), csvNum(g),
      ...CHARGE_FIELDS.map(f => csvNum(t[f])), hasCharges(t) ? csvNum(chargesOf(t)) : '', csvNum(netOf(t)),
      csvText(t.strategy), csvText(t.setupGrade), csvText(t.regime), csvText(t.preEmotion), csvText(t.emotion), yn(t.isRevenge), yn(t.isImpulsive),
      csvText(t.discipline), csvText(t.planAdherence), csvNum(t.confidence), csvNum(t.stress), csvText(t.energy),
      csvText((t.tags ?? []).map(id => name.get(id)).filter(Boolean).join('; ')), t.entryTime ?? '', t.exitTime ?? '',
      csvText(t.reason), csvText(t.mistakes), csvText(t.lesson), csvText(t.notes),
    ].join(',');
  });
  return [HEAD.join(','), ...rows].join('\r\n') + '\r\n';
}

// ── reading ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ImportFormat = 'journal-csv' | 'table-csv' | 'fills-csv' | 'web-json' | 'none';
export interface ImportResult {
  ok: boolean;
  format: ImportFormat;
  trades: Trade[];
  tags: Tag[];
  skipped: { line: number; reason: string }[];
  warnings: string[];
  dateRange: { from: string; to: string } | null;
  /** positions still open at the end of a trade book (not imported) */
  openPositions: number;
  totals: { count: number; rated: number; net: number };
}
const fail = (format: ImportFormat, msg: string): ImportResult => ({ ok: false, format, trades: [], tags: [], skipped: [], warnings: [msg], dateRange: null, openPositions: 0, totals: { count: 0, rated: 0, net: 0 } });

const norm = (h: unknown) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cleanSymbol = (s: string) => s.replace(/[^A-Za-z0-9&._\- ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40);
const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

type Col = Record<string, number>;
const ALIASES: Record<string, string[]> = {
  date: ['date', 'trade date', 'tradedate', 'exit date', 'trade day', 'order date', 'transaction date'],
  time: ['time', 'trade time', 'order execution time', 'execution time', 'timestamp', 'exchange timestamp'],
  symbol: ['symbol', 'tradingsymbol', 'trading symbol', 'scrip', 'scrip name', 'script', 'instrument name', 'security', 'security name', 'stock', 'stock name', 'contract'],
  side: ['side', 'direction', 'trade type', 'transaction type', 'buy sell', 'buy or sell', 'b s', 'action', 'type'],
  qty: ['quantity', 'qty', 'traded qty', 'trade qty', 'traded quantity', 'net qty'],
  lot: ['lot size', 'lot', 'lotsize'],
  price: ['price', 'trade price', 'rate', 'avg price', 'average price', 'traded price'],
  entry: ['entry price', 'entry', 'buy price', 'buy avg', 'buy average', 'avg buy price', 'average buy price', 'buy rate'],
  exit: ['exit price', 'exit', 'sell price', 'sell avg', 'sell average', 'avg sell price', 'average sell price', 'sell rate'],
  gross: ['gross profit', 'gross p l', 'gross pnl', 'gross', 'gross profit loss', 'realized p l before charges', 'gross p&l'],
  net: ['net profit', 'net p l', 'net pnl', 'net', 'p l', 'pnl', 'profit', 'profit loss', 'realized p l', 'realised p l', 'realized profit', 'realised profit', 'realized pnl', 'realised pnl', 'net profit loss'],
  chargesTotal: ['total charges', 'charges', 'total tax', 'total taxes', 'total fees', 'fees'],
  brokerage: ['brokerage', 'brokerage charges', 'commission'], stt: ['stt', 'stt ctt', 'stt ctt charges', 'securities transaction tax'], exchange: ['exchange charges', 'exchange txn charges', 'transaction charges', 'exchange transaction charges'],
  sebi: ['sebi fee', 'sebi', 'sebi charges', 'sebi turnover fee'], gst: ['gst', 'igst', 'gst charges'], slippage: ['slippage'], other: ['other charges', 'other', 'stamp duty', 'dp charges'],
  instrumentType: ['instrument type'],
  strategy: ['setup', 'strategy'], setupGrade: ['setup grade'], regime: ['market regime', 'regime'], preEmotion: ['emotion before', 'pre emotion', 'pre trade emotion'],
  emotion: ['emotion during', 'emotion'], isRevenge: ['revenge trade', 'revenge'], isImpulsive: ['impulsive trade', 'impulsive'], discipline: ['rules', 'discipline'],
  planAdherence: ['plan', 'plan adherence'], confidence: ['confidence'], stress: ['stress'], energy: ['energy'], tags: ['tags', 'tag'],
  entryTime: ['entry time'], exitTime: ['exit time'], reason: ['reason'], mistakes: ['mistakes'], lesson: ['lesson'], notes: ['notes', 'note', 'remarks'],
};

/** Maps a header row to column numbers. An alias is used by the first field that claims it, in the order of ALIASES (so "exchange" is the charge, not a market name). */
function mapHeader(row: string[]): Col {
  const h = row.map(norm);
  const col: Col = {};
  const taken = new Set<number>();
  for (const field of Object.keys(ALIASES)) {
    for (const alias of ALIASES[field]) {
      const i = h.findIndex((x, ix) => x === norm(alias) && !taken.has(ix));
      if (i >= 0) { col[field] = i; taken.add(i); break; }
    }
  }
  return col;
}

const BUY = /^(b|buy|bought|long|purchase)$/i, SELL = /^(s|sell|sold|short)$/i;
const sideOf = (s: string): 'buy' | 'sell' | null => { const t = s.trim(); return BUY.test(t) ? 'buy' : SELL.test(t) ? 'sell' : null; };
const timeOf = (...cells: (string | undefined)[]): string | undefined => {
  for (const c of cells) { const m = c ? /(?:^|[T\s])(\d{1,2}):(\d{2})/.exec(c) : null; if (m && +m[1] < 24) return `${m[1].padStart(2, '0')}:${m[2]}`; }
  return undefined;
};
const triOf = (s: string): boolean | undefined => (/^(yes|y|true|1)$/i.test(s.trim()) ? true : /^(no|n|false|0)$/i.test(s.trim()) ? false : undefined);

interface Fill { line: number; date: string; time?: string; symbol: string; side: 'buy' | 'sell'; qty: number; price: number; seq: number }

/** Pairs fills into round trips, one trade per stretch from flat to flat in one symbol. Profit = sell value − buy value. Positions still open are counted, not imported. */
export function pairFills(fills: readonly Fill[]): { trades: Omit<Trade, 'id'>[]; open: number } {
  const ordered = [...fills].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time ?? '') !== (b.time ?? '') && a.time && b.time ? (a.time < b.time ? -1 : 1) : a.seq - b.seq));
  interface Cycle { symbol: string; long: boolean; openQty: number; openValue: number; closeQty: number; closeValue: number; pos: number; first: Fill; last: Fill }
  const cycles = new Map<string, Cycle>();
  const out: Omit<Trade, 'id'>[] = [];
  const EPS = 1e-9;
  const emit = (c: Cycle) => {
    const sell = c.long ? c.closeValue : c.openValue, buy = c.long ? c.openValue : c.closeValue;
    const sameDay = c.first.date === c.last.date;
    const t: Omit<Trade, 'id'> = {
      date: c.last.date, symbol: c.symbol, direction: c.long ? 'Long' : 'Short', entry: r2(c.openValue / c.openQty), exit: r2(c.closeValue / c.closeQty), qty: c.openQty, gross: r2(sell - buy),
    };
    if (sameDay && c.first.time && c.last.time) { t.entryTime = c.first.time; t.exitTime = c.last.time; }
    if (!(t.entry! > 0)) { delete t.entry; delete t.exit; }
    out.push(t);
  };
  for (const f of ordered) {
    let qty = f.qty;
    const isBuy = f.side === 'buy';
    let c = cycles.get(f.symbol);
    while (qty > EPS) {
      if (!c) { c = { symbol: f.symbol, long: isBuy, openQty: 0, openValue: 0, closeQty: 0, closeValue: 0, pos: 0, first: f, last: f }; cycles.set(f.symbol, c); }
      c.last = f;
      if (c.long === isBuy) { c.openQty += qty; c.openValue += qty * f.price; c.pos += qty; qty = 0; }
      else {
        const part = Math.min(qty, c.pos);
        c.closeQty += part; c.closeValue += part * f.price; c.pos -= part; qty -= part;
        if (c.pos <= EPS) { emit(c); cycles.delete(f.symbol); c = undefined; }
      }
    }
  }
  return { trades: out, open: cycles.size };
}

function rowsToTrades(body: string[][], col: Col, firstLine: number, today: string, res: ImportResult, mode: 'table' | 'fills'): void {
  const cell = (r: string[], k: string) => (col[k] === undefined ? '' : (r[col[k]] ?? '').trim());
  const { order, mixed } = detectDateOrder(body.map(r => cell(r, 'date')));
  if (mixed) res.warnings.push('The dates mix day-first and month-first forms, so some may be misread. Check the date range below.');
  const fills: Fill[] = [];
  body.slice(0, MAX_ROWS).forEach((r, k) => {
    const line = firstLine + k;
    const date = parseDate(cell(r, 'date'), order);
    if (!date) { res.skipped.push({ line, reason: cell(r, 'date') ? 'unreadable date' : 'no date' }); return; }
    if (date > today) { res.skipped.push({ line, reason: 'date is in the future' }); return; }
    const symbol = cleanSymbol(unguard(cell(r, 'symbol')));
    if (!symbol) { res.skipped.push({ line, reason: 'no instrument' }); return; }
    if (mode === 'fills') {
      const side = sideOf(cell(r, 'side')), qty = toNumber(cell(r, 'qty')), price = toNumber(cell(r, 'price'));
      if (!side) { res.skipped.push({ line, reason: 'not a buy or a sell' }); return; }
      if (!(qty > 0) || !(price > 0)) { res.skipped.push({ line, reason: 'no quantity or price' }); return; }
      fills.push({ line, date, time: timeOf(cell(r, 'time'), cell(r, 'date')), symbol, side, qty, price, seq: fills.length });
      return;
    }
    const raw: Record<string, unknown> = { id: 'x', date, symbol };
    const side = cell(r, 'side');
    const dir = sideOf(side);
    if (dir) raw.direction = dir === 'buy' ? 'Long' : 'Short';
    const num = (key: string): number | undefined => { const c = cell(r, key); if (c === '') return undefined; const n = toNumber(c); return Number.isFinite(n) ? n : NaN; };
    for (const key of ['entry', 'exit', 'qty', 'lot', 'gross', 'net', 'confidence', 'stress', 'chargesTotal', ...CHARGE_FIELDS]) {
      const n = num(key);
      if (n !== undefined && Number.isNaN(n)) { res.skipped.push({ line, reason: `${key} is not a number` }); return; }
    }
    const single = col.entry === undefined && col.exit === undefined && col.price !== undefined;
    const entry = num('entry') ?? (single ? num('price') : undefined);
    raw.entry = entry; raw.exit = num('exit'); raw.qty = num('qty'); raw.lotSize = num('lot');
    for (const f of CHARGE_FIELDS) raw[f] = num(f);
    const total = num('chargesTotal');
    if (total !== undefined && !CHARGE_FIELDS.some(f => raw[f] !== undefined)) raw.chargesTotal = total;
    const tr = readTrade(raw);
    if (!tr) { res.skipped.push({ line, reason: 'unreadable row' }); return; }
    const g = num('gross'), n = num('net');
    if (g !== undefined) tr.gross = r2(g);
    else if (n !== undefined) tr.gross = r2(n + chargesOf(tr));              // only a net figure was given: charges (if any) were already taken out of it
    else { const pg = priceGross(tr); if (pg !== null) tr.gross = pg; }
    const setText = (key: keyof Trade, field: string, max: number) => { const v = unguard(cell(r, field)).slice(0, max).trim(); if (v) (tr as any)[key] = v; };
    setText('instrumentType', 'instrumentType', 20); setText('strategy', 'strategy', 60); setText('setupGrade', 'setupGrade', 4); setText('regime', 'regime', 40);
    setText('preEmotion', 'preEmotion', 30); setText('emotion', 'emotion', 30); setText('energy', 'energy', 30);
    setText('reason', 'reason', 2000); setText('mistakes', 'mistakes', 2000); setText('lesson', 'lesson', 2000); setText('notes', 'notes', 2000);
    const disc = cell(r, 'discipline').toLowerCase(); if (DISCIPLINE.some(d => d.id === disc)) tr.discipline = disc;
    const plan = cell(r, 'planAdherence').toLowerCase(); if (PLAN_ADHERENCE.some(d => d.id === plan)) tr.planAdherence = plan;
    const rev = triOf(cell(r, 'isRevenge')); if (rev !== undefined) tr.isRevenge = rev;
    const imp = triOf(cell(r, 'isImpulsive')); if (imp !== undefined) tr.isImpulsive = imp;
    const conf = num('confidence'); if (conf !== undefined && Number.isInteger(conf) && conf >= 1 && conf <= 10) tr.confidence = conf;
    const str = num('stress'); if (str !== undefined && Number.isInteger(str) && str >= 1 && str <= 10) tr.stress = str;
    const et = timeOf(cell(r, 'entryTime')), xt = timeOf(cell(r, 'exitTime')); if (et) tr.entryTime = et; if (xt) tr.exitTime = xt;
    if (!SETUP_GRADES.some(x => x.id === tr.setupGrade)) delete tr.setupGrade;
    const tagNames = cell(r, 'tags').split(/[;|]/).map(s => unguard(s).trim()).filter(Boolean);
    if (tagNames.length) (tr as any).__tagNames = tagNames.slice(0, 30);
    res.trades.push(tr);
  });
  if (mode === 'fills') {
    const paired = pairFills(fills);
    res.openPositions = paired.open;
    for (const t of paired.trades) { const tr = readTrade({ ...t, id: 'x' }); if (tr) res.trades.push(tr); }
    if (paired.open) res.warnings.push(`${paired.open} position${paired.open === 1 ? ' is' : 's are'} still open at the end of the file (bought and not sold, or sold and not bought back), so ${paired.open === 1 ? 'it was' : 'they were'} not imported.`);
    res.warnings.push('A broker trade book has no charges, so these trades have none recorded and their net profit equals the gross. Edit a trade to add its charges.');
  }
}

/** Reads a pasted or chosen file: this app's CSV, a broker table or trade book, or the website's JSON backup. */
export function parseJournalFile(input: string, o: { batch: string; today: string }): ImportResult {
  const src = String(input ?? '');
  if (!src.trim()) return fail('none', 'The file is empty.');
  if (src.length > MAX_FILE_CHARS) return fail('none', 'That file is too large to read here (over 5 million characters).');
  if (/^\s*[\[{]/.test(src)) return fromWebJson(src, o);
  const rows = parseCSV(src) as string[][];
  if (!rows.length) return fail('none', 'The file is empty.');
  let head = -1, col: Col = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const c = mapHeader(rows[i]);
    if (c.date !== undefined && c.symbol !== undefined && (c.qty !== undefined || c.price !== undefined || c.entry !== undefined || c.gross !== undefined || c.net !== undefined)) { head = i; col = c; break; }
  }
  if (head < 0) return fail('none', 'This does not look like a list of trades. I could not find columns for the date, the instrument, and the quantity, price or profit. A broker\'s trade book (Zerodha Console → Reports → Tradebook) or this app\'s own export both work.');
  const body = rows.slice(head + 1);
  const isFills = col.side !== undefined && col.price !== undefined && col.qty !== undefined && col.entry === undefined && col.exit === undefined && col.gross === undefined && col.net === undefined;
  const isJournal = col.entry !== undefined && col.exit !== undefined && col.strategy !== undefined && col.emotion !== undefined;
  const res = fail(isFills ? 'fills-csv' : isJournal ? 'journal-csv' : 'table-csv', '');
  res.warnings = [];
  if (body.length > MAX_ROWS) res.warnings.push(`Only the first ${MAX_ROWS} rows were read.`);
  rowsToTrades(body, col, head + 2, o.today, res, isFills ? 'fills' : 'table');
  // tag names typed in the file become tags (the person's own words, first spelling kept); they are matched to existing tags when merged
  const byName = new Map<string, Tag>();
  for (const t of res.trades as (Trade & { __tagNames?: string[] })[]) {
    const names = t.__tagNames; delete t.__tagNames;
    if (!names) continue;
    const ids: string[] = [];
    for (const n of names) {
      const key = n.toLowerCase();
      if (!byName.has(key)) byName.set(key, { id: `${o.batch}_tag${byName.size}`, name: n.slice(0, 30), type: 'custom', color: '#00d4ff' });
      ids.push(byName.get(key)!.id);
    }
    t.tags = [...new Set(ids)];
  }
  res.tags = [...byName.values()];
  return finish(res, o);
}

function finish(res: ImportResult, o: { batch: string }, keepIds = false): ImportResult {
  res.trades.forEach((t, i) => { if (!keepIds) t.id = `${o.batch}_${i}`; t.src = 'import'; t.batch = o.batch; });
  const rated = res.trades.map(netOf).filter((n): n is number => n !== null);
  const dates = res.trades.map(t => t.date).sort();
  res.totals = { count: res.trades.length, rated: rated.length, net: r2(rated.reduce((s, n) => s + n, 0)) };
  res.dateRange = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  res.ok = res.trades.length > 0;
  if (!res.ok && !res.warnings.length) res.warnings.push('I found the columns but no readable trades.');
  if (res.skipped.length) res.warnings.push(res.skipped.length === 1 ? '1 row was skipped (see below).' : `${res.skipped.length} rows were skipped (see below).`);
  const unrated = res.trades.length - rated.length;
  if (res.ok && unrated > 0 && res.format !== 'fills-csv') res.warnings.push(`${unrated} trade${unrated === 1 ? ' has' : 's have'} no profit or no prices, so ${unrated === 1 ? 'it is' : 'they are'} kept but left out of every profit figure until you add them.`);
  return res;
}

// ── the website's backup ─────────────────────────────────────────────────────────────────────────────────────────────────────
const safeId = (s: unknown) => String(s ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);

/** One TradeBook trade → this app's trade. The website stores 0 for an empty box and saves default answers for ones nobody touched, so those are left out, not imported as if the person had chosen them. */
export function mapWebTrade(w: Record<string, unknown>, tagIds: Map<string, string>, today: string): Trade | null {
  const date = typeof w.date === 'string' ? w.date.slice(0, 10) : '';
  if (!validDate(date) || date > today) return null;
  const raw: Record<string, unknown> = { id: 'w_' + (safeId(w.id) || 'x'), date, symbol: w.symbol };
  const pos = (v: unknown) => { const n = finite(v, NaN); return Number.isFinite(n) && n > 0 ? n : undefined; };
  raw.direction = w.direction === 'Long' || w.direction === 'Short' ? w.direction : undefined;
  raw.entry = pos(w.entry); raw.qty = pos(w.qty); raw.lotSize = pos(w.lotSize);
  const exit = pos(w.exit);
  const g = finite(w.gross, NaN), n = finite(w.net, NaN), tax = finite(w.tax, NaN);
  for (const f of CHARGE_FIELDS) raw[f] = pos(w[f]);
  if (!CHARGE_FIELDS.some(f => raw[f] !== undefined) && Number.isFinite(tax) && tax > 0) raw.chargesTotal = tax;
  const tr = readTrade({ ...raw, exit });
  if (!tr) return null;
  const charges = chargesOf(tr);
  if (Number.isFinite(g) && g !== 0) tr.gross = r2(g);
  else if (Number.isFinite(g)) {
    // the website saved a gross of exactly 0: a real breakeven when the prices are there, otherwise nothing was entered
    if (tr.entry && exit !== undefined) tr.gross = 0;
    else if (Number.isFinite(n) && n !== 0) tr.gross = r2(n + charges);
  } else if (Number.isFinite(n)) tr.gross = r2(n + charges);
  // the website writes exit 0 for "empty"; it is a real 0 (worthless option) only when the website's own profit says so
  if (exit === undefined && tr.entry && tr.qty && tr.direction && typeof tr.gross === 'number') {
    const zero = priceGross({ ...tr, exit: 0 });
    if (zero !== null && Math.abs(zero - tr.gross) < 0.01 && tr.gross !== 0) tr.exit = 0;
  }
  const s = (k: string, max: number) => { const v = text(w[k], '', max).trim(); return v || undefined; };
  const set = (k: keyof Trade, v: string | undefined) => { if (v) (tr as any)[k] = v; };
  set('instrumentType', s('instrumentType', 20)); set('strategy', s('strategy', 60)); set('setupGrade', SETUP_GRADES.some(x => x.id === w.setupGrade) ? String(w.setupGrade) : undefined);
  set('regime', s('regime', 40)); set('preEmotion', s('preEmotion', 30)); set('emotion', s('emotion', 30)); set('energy', s('energy', 30));
  set('discipline', DISCIPLINE.some(x => x.id === w.discipline) ? String(w.discipline) : undefined);
  set('planAdherence', PLAN_ADHERENCE.some(x => x.id === w.planAdherence) ? String(w.planAdherence) : undefined);
  set('reason', s('reason', 2000)); set('mistakes', s('mistakes', 2000)); set('lesson', s('lesson', 2000)); set('notes', s('notes', 2000));
  if (w.isRevenge === true || w.isRevenge === 'true') tr.isRevenge = true;
  if (w.isImpulsive === true || w.isImpulsive === 'true') tr.isImpulsive = true;
  const et = typeof w.entryTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(w.entryTime) ? w.entryTime : undefined;
  const xt = typeof w.exitTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(w.exitTime) ? w.exitTime : undefined;
  if (et) tr.entryTime = et; if (xt) tr.exitTime = xt;
  if (Array.isArray(w.tags)) { const ids = w.tags.map(x => tagIds.get(String(x))).filter((x): x is string => !!x); if (ids.length) tr.tags = [...new Set(ids)]; }
  return tr;
}

function fromWebJson(src: string, o: { batch: string; today: string }): ImportResult {
  const p = parseJSON(src);
  if (!p.ok) return fail('web-json', 'This is not readable JSON.');
  const root = p.value;
  const list: unknown[] = Array.isArray(root) ? root : isPlainObject(root) && Array.isArray(root.trades) ? root.trades : [];
  if (!list.length) return fail('web-json', 'I could not find a list of trades in this file. A TradeBook backup has a "trades" list.');
  const res = fail('web-json', ''); res.warnings = [];
  const tagIds = new Map<string, string>();
  if (isPlainObject(root) && Array.isArray(root.tags)) {
    for (const t of root.tags) {
      if (!isPlainObject(t)) continue;
      const tag = readTag({ id: 'w_' + safeId(t.id), name: t.name, type: TAG_TYPES.some(x => x.id === t.type) ? t.type : 'custom', color: typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : undefined });
      if (tag && safeId(t.id)) { res.tags.push(tag); tagIds.set(String(t.id), tag.id); }
    }
  }
  list.slice(0, MAX_ROWS).forEach((w, k) => {
    if (!isPlainObject(w)) { res.skipped.push({ line: k + 1, reason: 'not a trade' }); return; }
    const t = mapWebTrade(w, tagIds, o.today);
    if (!t) { res.skipped.push({ line: k + 1, reason: 'no valid date or instrument' }); return; }
    res.trades.push(t);
  });
  res.warnings.push('Not imported from the website: confidence and stress (it saves 5 and 3 even when you never set them), "no" answers to revenge and impulsive (same reason), and its charts, quality scores, rules, moods and XP.');
  // the website's ids are kept (prefixed w_) so importing the same backup twice is recognised
  const out = finish(res, o, true);
  return out;
}

// ── merging and undo ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Same trade, whatever its id: date, instrument, side, prices, quantity and profit. */
export function contentKey(t: Trade): string {
  const g = grossOf(t);
  return [t.date, t.symbol, t.direction ?? '', t.entry ?? '', t.exit ?? '', t.qty ?? '', g === null ? '' : g.toFixed(2)].join('|');
}

/**
 * Adds `incoming` to the raw stored list. A record whose id is already stored, or whose content matches one already stored, is a duplicate.
 * Identical trades inside one file are kept (two real trades can look the same): duplicates are counted, so if the journal already has two of a
 * kind, the first two of them in the file are the duplicates.
 */
export function mergeTrades(existing: readonly unknown[], incoming: readonly Trade[]): { merged: unknown[]; added: number; duplicates: number; addedTrades: Trade[] } {
  const ids = new Set<string>();
  const have = new Map<string, number>();
  for (const r of existing) {
    const t = readTrade(r);
    if (!t) continue;
    ids.add(t.id);
    const k = contentKey(t); have.set(k, (have.get(k) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const addedTrades: Trade[] = [];
  for (const t of incoming) {
    if (ids.has(t.id)) continue;
    const k = contentKey(t);
    const n = (seen.get(k) ?? 0) + 1; seen.set(k, n);
    if (n > (have.get(k) ?? 0)) { addedTrades.push(t); ids.add(t.id); }
  }
  return { merged: [...existing, ...addedTrades], added: addedTrades.length, duplicates: incoming.length - addedTrades.length, addedTrades };
}

/** Removes exactly the records one import added. */
export function undoBatch(existing: readonly unknown[], batch: string): unknown[] {
  return existing.filter(r => !(isPlainObject(r) && r.src === 'import' && r.batch === batch));
}

/** Tags from a file merged into the person's tags by name (case-insensitive); returns the tag list to store and a map from the file's tag ids to the ids kept. */
export function mergeTags(existing: readonly Tag[], incoming: readonly Tag[]): { tags: Tag[]; idMap: Map<string, string> } {
  const tags = [...existing];
  const idMap = new Map<string, string>();
  for (const t of incoming) {
    const hit = tags.find(x => x.name.toLowerCase() === t.name.toLowerCase()) ?? tags.find(x => x.id === t.id);
    if (hit) idMap.set(t.id, hit.id);
    else if (tags.length < 60) { tags.push(t); idMap.set(t.id, t.id); }
  }
  return { tags, idMap };
}

/** The trades with their tag ids replaced through `idMap` (an id with no entry is dropped). */
export function remapTags(trades: readonly Trade[], idMap: Map<string, string>): Trade[] {
  return trades.map(t => {
    if (!t.tags) return t;
    const ids = [...new Set(t.tags.map(id => idMap.get(id)).filter((x): x is string => !!x))];
    const { tags: _old, ...rest } = t;
    return ids.length ? { ...rest, tags: ids } : rest;
  });
}

export const importToday = (now: Date) => todayISO(now);
