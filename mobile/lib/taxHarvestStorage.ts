// Harvest holdings and this year's booked gains on the device (the website's keys), plus the two figures other
// surfaces read (finos_harvest_tax_saved, finos_harvest_ltcg_net).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import { POSITIONS_KEY, analyse, bookedKeys, normalisePositions, type Position } from '@/lib/taxHarvest';

const n = (v: string | null | undefined) => { const x = parseFloat(v ?? ''); return Number.isFinite(x) && x > 0 ? x : 0; };

export async function loadHarvest(now: Date = new Date()): Promise<{ positions: Position[]; ltcg: number; stcg: number }> {
  const k = bookedKeys(now);
  const g = await getMany([POSITIONS_KEY, k.ltcg, k.stcg]);
  let positions: Position[] = [];
  try { positions = normalisePositions(JSON.parse(g[POSITIONS_KEY] ?? '[]')); } catch { /* corrupt: start empty */ }
  return { positions, ltcg: n(g[k.ltcg]), stcg: n(g[k.stcg]) };
}

export async function saveHarvest(positions: Position[], ltcg: number, stcg: number, now: Date = new Date()) {
  const k = bookedKeys(now);
  const a = analyse(positions, ltcg, stcg, now);
  await AsyncStorage.multiSet([
    [POSITIONS_KEY, JSON.stringify(positions)],
    [k.ltcg, String(Math.max(0, ltcg))],
    [k.stcg, String(Math.max(0, stcg))],
    ['finos_harvest_tax_saved', String(a.taxSaved)],
    ['finos_harvest_ltcg_net', String(a.netLTCG)],
  ]);
}
