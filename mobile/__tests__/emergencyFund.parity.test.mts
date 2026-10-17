import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY_TRACKER_DATA, computeEmergency } from '../lib/trackers.ts';

const WEB_SOURCE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-emergency-fund.js'), 'utf8');

function webEmergency(values: Record<string, string>) {
  const data = new Map(Object.entries(values));
  const sandbox: any = { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } };
  sandbox.window = sandbox;
  vm.runInNewContext(WEB_SOURCE, sandbox);
  return sandbox.FinosEmergencyFund._compute();
}

test('web and mobile emergency fund agree on Account Aggregator spend and supported targets', () => {
  const mobile = computeEmergency({ ...EMPTY_TRACKER_DATA, aaExpense: 40000, emergencyFund: -100, emergencyTarget: 5 });
  const web = webEmergency({ finos_aa_expense: '40000', finos_emergency_fund: '-100', finos_emergency_months_target: '5' });
  assert.deepEqual([web.monthlyExp, web.target, web.fund, web.targetAmt, web.pct, web.covered, web.shortfall, web.surplus],
    [mobile.monthlyExpense, mobile.target, mobile.fund, mobile.targetAmount, mobile.pct, mobile.covered, mobile.shortfall, mobile.surplus]);
});

test('web emergency fund treats Infinity as invalid data instead of displaying non-finite totals', () => {
  const web = webEmergency({ finos_monthly_expense: 'Infinity', finos_emergency_fund: 'Infinity', finos_emergency_months_target: '6' });
  assert.equal(Number.isFinite(web.fund), true);
  assert.equal(Number.isFinite(web.monthlyExp), true);
  assert.equal(Number.isFinite(web.targetAmt), true);
  assert.deepEqual([web.monthlyExp, web.fund, web.targetAmt, web.covered], [0, 0, 0, 0]);
});

test('web and mobile use the budget expense fallback when no direct expense source is recorded', () => {
  const mobile = computeEmergency({ ...EMPTY_TRACKER_DATA, budgetExpense: 25000, emergencyFund: 50000 });
  const web = webEmergency({ finos_budget_expenses: '25000', finos_emergency_fund: '50000' });
  assert.deepEqual([web.monthlyExp, web.targetAmt, web.covered], [mobile.monthlyExpense, mobile.targetAmount, mobile.covered]);
});
