// Trade journal storage: two lists in AsyncStorage (the trades, the person's tags), written the way the other trackers are.
//   * Both keys start `finos_sync_never_`: on the device always; in the person's own export and backup; NEVER in the cloud copy
//     (the sync skips that prefix); removed by "Erase all data". Nothing here touches the network.
//   * Reads go through lib/safeStore.ts: a damaged value reads as "nothing" and never throws.
//   * Writers edit the RAW list: a record this version cannot read is left exactly as it was, and before a write replaces a list that
//     could not be read at all, its text is kept aside (finos_sync_never_corrupt_*), never silently destroyed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { asList, keepIfUnreadable, wellFormed } from '@/lib/safeStore';
import {
  MAX_TRADES, buildTag, readAll, readTag, unknownFields,
  type Tag, type Trade,
} from '@/lib/tradeJournal';
import { mergeTags, mergeTrades, remapTags, undoBatch, type ImportResult } from '@/lib/tradeJournalImport';

// Device-only from cloud sync on purpose (notes and feelings are sensitive): the `finos_sync_never_` prefix keeps them out of the sync,
// the same way as the couple planner. They stay in the person's own export/backup and are removed by Erase all data.
export const TRADES_KEY = 'finos_sync_never_trade_journal_v1';
export const TAGS_KEY = 'finos_sync_never_trade_journal_tags_v1';

// Writes are read-modify-write on one list: serialise them so two quick taps cannot lose an entry.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/** For writers: throws only when storage itself fails, so nothing is written after a read that did not happen. */
const readRawStrict = async (key: string): Promise<unknown[]> => asList(await AsyncStorage.getItem(key));
const writeRaw = async (key: string, list: unknown[]) => { await keepIfUnreadable(key, 'array'); await AsyncStorage.setItem(key, JSON.stringify(list)); };

const rand = () => Math.random().toString(36).slice(2, 7);
export const newTradeId = (now = Date.now()) => `tj_${now.toString(36)}_${rand()}`;
export const newBatchId = (now = Date.now()) => `jimp_${now.toString(36)}`;
export const newTagId = (now = Date.now()) => `tg_${now.toString(36)}_${rand()}`;

export interface JournalData {
  trades: Trade[];
  tags: Tag[];
  /** stored entries this version could not read (left untouched) */
  unreadable: number;
  /** the stored value is not a list at all (kept aside before anything is written over it) */
  damaged: boolean;
}

/** Everything for the screens. Storage failing gives an empty journal and `damaged: false`; it never throws. */
export async function loadJournal(): Promise<JournalData> {
  let rawText: string | null = null, tagText: string | null = null;
  try { [rawText, tagText] = await Promise.all([AsyncStorage.getItem(TRADES_KEY), AsyncStorage.getItem(TAGS_KEY)]); } catch { /* nothing readable */ }
  const raw = asList(rawText);
  const good = readAll(raw);
  const tags = asList(tagText).map(readTag).filter((t): t is Tag => t !== null);
  const seen = new Set<string>();
  return {
    trades: good.map(g => g.trade),
    tags: tags.filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true))),
    unreadable: raw.length - good.length,
    damaged: rawText !== null && !wellFormed(rawText, 'array'),
  };
}

/** Adds a new trade, or replaces the one with the same id (its unknown fields are kept). */
export function saveTrade(trade: Trade): Promise<{ ok: true; added: boolean } | { ok: false; error: string }> {
  return exclusive(async () => {
    try {
      const raw = await readRawStrict(TRADES_KEY);
      const hit = readAll(raw).find(g => g.trade.id === trade.id);
      if (hit) raw[hit.i] = { ...unknownFields(raw[hit.i]), ...trade };
      else {
        if (raw.length >= MAX_TRADES) return { ok: false as const, error: `The journal is full (${MAX_TRADES} trades). Export it and delete old trades first.` };
        raw.push(trade);
      }
      await writeRaw(TRADES_KEY, raw);
      return { ok: true as const, added: !hit };
    } catch { return { ok: false as const, error: 'Could not save: the phone\'s storage did not answer. Nothing was changed.' }; }
  });
}

export function deleteTrade(id: string): Promise<boolean> {
  return exclusive(async () => {
    const raw = await readRawStrict(TRADES_KEY);
    const hit = readAll(raw).find(g => g.trade.id === id);
    if (!hit) return false;
    raw.splice(hit.i, 1);
    await writeRaw(TRADES_KEY, raw);
    return true;
  });
}

// ── tags ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function addTag(input: { name: string; type?: string; color?: string }): Promise<{ ok: true; tag: Tag } | { ok: false; error: string }> {
  return exclusive(async () => {
    try {
      const raw = await readRawStrict(TAGS_KEY);
      const existing = raw.map(readTag).filter((t): t is Tag => t !== null);
      const made = buildTag(input, existing, newTagId());
      if (!made.ok) return made;
      raw.push(made.tag);
      await writeRaw(TAGS_KEY, raw);
      return made;
    } catch { return { ok: false as const, error: 'Could not save the tag.' }; }
  });
}

/** Removes the tag, then the tag from the trades that carried it (if the second step is interrupted, the leftover id is harmless: it matches no tag). */
export function deleteTag(id: string): Promise<boolean> {
  return exclusive(async () => {
    const tags = await readRawStrict(TAGS_KEY);
    const keep = tags.filter(t => readTag(t)?.id !== id);
    if (keep.length === tags.length) return false;
    await writeRaw(TAGS_KEY, keep);
    const raw = await readRawStrict(TRADES_KEY);
    let changed = false;
    raw.forEach((r, i) => {
      const t = readAll([r])[0]?.trade;
      if (t?.tags?.includes(id)) { raw[i] = { ...(r as object), tags: t.tags.filter(x => x !== id) }; changed = true; }
    });
    if (changed) await writeRaw(TRADES_KEY, raw);
    return true;
  });
}

// ── import / export ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Fresh { added: number; duplicates: number }

/** Before saving: how many of these would be new and how many are already in the journal (nothing is written). */
export async function previewImport(result: ImportResult): Promise<Fresh> {
  let raw: unknown[] = [];
  try { raw = await readRawStrict(TRADES_KEY); } catch { /* treated as empty */ }
  const { added, duplicates } = mergeTrades(raw, result.trades);
  return { added, duplicates };
}

export function importTrades(result: ImportResult, batch = newBatchId()): Promise<Fresh & { batch: string; tagsAdded: number }> {
  return exclusive(async () => {
    const raw = await readRawStrict(TRADES_KEY);
    let incoming = result.trades;
    let tagsAdded = 0;
    if (result.tags.length) {
      const existingRaw = await readRawStrict(TAGS_KEY);
      const existing = existingRaw.map(readTag).filter((t): t is Tag => t !== null);
      const { tags, idMap } = mergeTags(existing, result.tags);
      incoming = remapTags(incoming, idMap);
      tagsAdded = tags.length - existing.length;
      if (tagsAdded > 0) await writeRaw(TAGS_KEY, [...existingRaw, ...tags.slice(existing.length)]);
    }
    const room = Math.max(0, MAX_TRADES - raw.length);
    const m = mergeTrades(raw, incoming);
    const limited = m.addedTrades.slice(0, room);
    if (limited.length) await writeRaw(TRADES_KEY, [...raw, ...limited]);
    return { added: limited.length, duplicates: m.duplicates, batch, tagsAdded };
  });
}

/** Removes everything one import added. Returns how many records were removed. */
export function undoImport(batch: string): Promise<number> {
  return exclusive(async () => {
    const raw = await readRawStrict(TRADES_KEY);
    const next = undoBatch(raw, batch);
    const removed = raw.length - next.length;
    if (removed) await writeRaw(TRADES_KEY, next);
    return removed;
  });
}

export interface BatchInfo { batch: string; count: number; from: string; to: string }
export async function listBatches(): Promise<BatchInfo[]> {
  let raw: unknown[] = [];
  try { raw = await readRawStrict(TRADES_KEY); } catch { return []; }
  const by = new Map<string, BatchInfo>();
  for (const { trade: t } of readAll(raw)) {
    if (t.src !== 'import' || !t.batch) continue;
    const b = by.get(t.batch) ?? { batch: t.batch, count: 0, from: t.date, to: t.date };
    b.count++;
    if (t.date < b.from) b.from = t.date;
    if (t.date > b.to) b.to = t.date;
    by.set(t.batch, b);
  }
  return [...by.values()].sort((a, b) => (a.to < b.to ? 1 : -1));
}
