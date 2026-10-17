import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { computeNps } from '@/lib/retirement';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function webNps(store: Record<string, string>) {
  const localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: unknown) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
  };
  const sandbox: any = { window: {}, localStorage, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(root, 'js/finos-nps-tracker.js'), 'utf8'), sandbox);
  return sandbox.window.FinosNPSTracker;
}

function mobileNps(store: Record<string, string>) {
  return computeNps({
    tier1: Number(store.finos_nps_tier1 || 0), tier2: Number(store.finos_nps_tier2 || 0), dob: store.finos_nps_dob || '',
    emp: Number(store.finos_nps_emp_monthly || 0), er: Number(store.finos_nps_er_monthly || 0),
    equityPct: Number(store.finos_nps_equity_pct || 0), corpPct: Number(store.finos_nps_corp_pct || 0),
    gsecPct: Number(store.finos_nps_gsec_pct || 0), slab: Number(store.finos_nps_tax_slab || 30),
  });
}

test('NPS never assumes age; invalid DOB hides projections and web clears stale derived corpus', () => {
  for (const dob of ['', '1984-02-30', '2999-01-01']) {
    const store: Record<string, string> = { finos_nps_dob: dob, finos_nps_tier1: '100000', finos_nps_emp_monthly: '5000', finos_nps_projected: '999999' };
    const app = mobileNps(store);
    const web = webNps(store)._compute();
    assert.equal(app.ageNow, 0);
    assert.equal(app.yearsLeft, 0);
    assert.equal(app.projected, 100000);
    assert.equal(app.projected, web.projected);
    assert.equal(web.ageNow, 0);
    assert.equal(store.finos_nps_projected, undefined);
  }
});

test('NPS web/mobile calculations agree on a real DOB, month-end contributions, and invalid allocation fallback', () => {
  const store: Record<string, string> = {
    finos_nps_dob: '1990-10-16', finos_nps_tier1: '100000', finos_nps_tier2: '20000',
    finos_nps_emp_monthly: '5000', finos_nps_er_monthly: '3000', finos_nps_equity_pct: '40',
    finos_nps_corp_pct: '30', finos_nps_gsec_pct: '20', finos_nps_annuity_pct: '40',
  };
  const app = mobileNps(store);
  const web = webNps(store)._compute();
  assert.ok(app.ageNow > 0);
  assert.equal(app.ageNow, web.ageNow);
  assert.equal(app.yearsLeft, web.yearsLeft);
  assert.equal(app.annualR, 0.085); // 90% allocation is invalid; web uses the 8.5% blended fallback.
  assert.equal(app.annualR, web.annualR);
  assert.equal(app.projected, web.projected);
  assert.equal(app.annuityCorpus, web.annuityCorpus);
  assert.equal(app.lumpSum, web.lumpSum);
});
