// Run with the user's timezone: TZ=Asia/Kolkata node --test tests/calendar.test.js
const test = require('node:test');
const assert = require('node:assert');

function boot(store) {
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => (k in store ? JSON.stringify(store[k]) : null) };
  delete require.cache[require.resolve('../js/finos-calendar.js')];
  delete require.cache[require.resolve('../js/finos-taxdates.js')];
  globalThis.FinosTaxDates = require('../js/finos-taxdates.js');
  require('../js/finos-calendar.js');
  return globalThis.FinosCalendar;
}

test('SIP tracker entries ({fundName, monthlyAmount}) appear as debit events on the 1st (local date)', () => {
  const cal = boot({ finos_sip_portfolio: [{ id: 'a', fundName: 'Parag Parikh Flexi Cap', monthlyAmount: 10000, startDate: '2026-01-01' }] });
  const sips = cal.collectEvents(3).filter((e) => e.type === 'sip');
  assert.ok(sips.length >= 3, 'expected ≥3 monthly SIP events, got ' + sips.length);
  assert.ok(sips.every((e) => e.date.endsWith('-01')), 'dates must be the 1st: ' + sips.map((e) => e.date));
  assert.strictEqual(sips[0].title, 'Parag Parikh Flexi Cap');
  assert.strictEqual(sips[0].amount, 10000);
});

test('legacy {fund, amount} entries and a custom debitDay still work', () => {
  const cal = boot({ finos_sip_portfolio: [{ fund: 'Old Fund', amount: 5000, startDate: '2025-01-01', debitDay: 10 }] });
  const sips = cal.collectEvents(2).filter((e) => e.type === 'sip');
  assert.ok(sips.length >= 2);
  assert.ok(sips.every((e) => e.date.endsWith('-10')));
});

test('tax events keep coming far into the future (no hardcoded cut-off)', () => {
  const cal = boot({});
  const tax = cal.collectEvents(36).filter((e) => e.type === 'tax');
  const last = tax[tax.length - 1].date;
  assert.ok(last > '2028-12-01', 'tax calendar stops too early: ' + last);
});

test('subscriptions appear as typed "sub" events when finos-subscriptions.js is loaded (paused ones do not)', () => {
  const cal = boot({
    finos_subscriptions: [
      { id: 'a', name: 'Netflix', category: 'ott', amount: 649, cycle: 'monthly', nextDate: '2026-01-05' },
      { id: 'b', name: 'Old gym', category: 'fitness', amount: 999, cycle: 'monthly', nextDate: '2026-01-05', status: 'paused' },
    ],
  });
  // the calendar only knows about subscriptions once the module is on the page (like FinosTaxDates)
  assert.strictEqual(cal.collectEvents(3).filter((e) => e.type === 'sub').length, 0);
  delete require.cache[require.resolve('../js/finos-subscriptions.js')];
  globalThis.FinosSubscriptions = require('../js/finos-subscriptions.js');
  const subs = cal.collectEvents(4).filter((e) => e.type === 'sub');
  assert.ok(subs.length >= 3, 'expected ≥3 upcoming renewals, got ' + subs.length);
  assert.ok(subs.every((e) => e.title === 'Netflix renews' && e.amount === 649));
  delete globalThis.FinosSubscriptions;
});
