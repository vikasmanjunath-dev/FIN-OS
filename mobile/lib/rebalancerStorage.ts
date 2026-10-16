// Rebalancer on the device: the values it reads from the other trackers and the saved target (the website's finos_target_alloc).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import { CLASSES, DEFAULT_TARGET, type Alloc } from '@/lib/rebalancer';

const KEYS = ['finos_portfolio_value', 'finos_mf_import_value', 'finos_sip_value', 'finos_fd_value', 'finos_gold_value', 'finos_property_value', 'finos_crypto_value',
  'finos_epf_value', 'finos_nps_value', 'finos_ppf_value', 'finos_target_alloc'];
const n = (v: string | null | undefined) => { const x = parseFloat(v ?? ''); return Number.isFinite(x) && x > 0 ? x : 0; };

export async function loadRebalancer(): Promise<{ values: Alloc; target: Alloc; saved: boolean }> {
  const g = await getMany(KEYS);
  const values: Alloc = {
    equity: n(g.finos_portfolio_value) + n(g.finos_mf_import_value) + n(g.finos_sip_value), debt: n(g.finos_fd_value), gold: n(g.finos_gold_value),
    realestate: n(g.finos_property_value), crypto: n(g.finos_crypto_value), govt: n(g.finos_epf_value) + n(g.finos_nps_value) + n(g.finos_ppf_value),
  };
  let target: Alloc = { ...DEFAULT_TARGET };
  let saved = false;
  try {
    const raw = JSON.parse(g.finos_target_alloc ?? 'null');
    if (raw && typeof raw === 'object') {
      CLASSES.forEach(k => { const v = Number(raw[k]); if (Number.isFinite(v) && v >= 0) target[k] = v; });
      saved = true;
    }
  } catch { /* use the default */ }
  return { values, target, saved };
}

export async function saveTarget(target: Alloc, rebalanceNeeded: boolean) {
  await AsyncStorage.multiSet([['finos_target_alloc', JSON.stringify(target)], ['finos_rebalance_needed', rebalanceNeeded ? '1' : '0']]);
}
