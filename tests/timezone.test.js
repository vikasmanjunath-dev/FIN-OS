// Date-only strings ("2026-04-01") are calendar days. Parsed as UTC instants they land on the previous day west of UTC,
// which moved the tax year, SIP streaks and FD/calendar maturity dates (audit TRK-TZ-001). Re-run the date-sensitive
// suites under zones either side of UTC; the same suites run in the host zone in the normal pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SUITES = ['taxdates.test.js', 'calendar.test.js', 'fd-tracker.test.js', 'budget.test.js', 'subscriptions.test.js', 'insurance-calendar.test.js'];
for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata', 'UTC']) {
  test(`date-sensitive suites pass with TZ=${tz}`, () => {
    for (const f of SUITES) {
      const r = spawnSync(process.execPath, ['--test', path.join(__dirname, f)], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
      assert.equal(r.status, 0, `${f} failed under ${tz}:\n${(r.stdout || '').slice(-1500)}`);
    }
  });
}
