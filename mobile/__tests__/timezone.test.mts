// Mobile counterpart of tests/timezone.test.js (audit TRK-TZ-001): date-sensitive suites must pass in zones either side of UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const here = import.meta.dirname;
const SUITES = ['calendar.parity.test.mts', 'fixedIncome.parity.test.mts', 'funds.parity.test.mts'];
for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata']) {
  test(`date-sensitive parity suites pass with TZ=${tz}`, () => {
    const r = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', path.join(here, 'register-aliases.mjs'), '--test',
      ...SUITES.map(f => path.join(here, f))], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, `failed under ${tz}:\n${(r.stdout || '').slice(-1500)}`);
  });
}
