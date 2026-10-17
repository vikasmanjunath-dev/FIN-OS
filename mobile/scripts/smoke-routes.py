#!/usr/bin/env python3
"""Opens every screen of the phone app in the Expo web preview and fails on anything a person would notice:
a runtime error, a React error, an empty screen, or the words NaN / undefined / Infinity / [object Object] on screen.
Runs each screen with an empty phone and with a populated one, in dark and light.

    npx expo start --web --port 8082            # in mobile/
    python3 mobile/scripts/smoke-routes.py      # or: ... /tools/score /tracker/budget

Backend calls are expected to fail (no server): those request errors are ignored; what the screen does about them is checked.
"""
import json, os, re, sys, datetime as dt
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8082')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')

# One real value for every dynamic segment, so the route is a real screen and not the screen's "unknown id" branch.
SAMPLES = {
    'tools/calc/[id]': ['/tools/calc/sip', '/tools/calc/hra', '/tools/calc/optionspayoff'],
    'insurance/[type]': ['/insurance/health', '/insurance/term'],
    'funds/[code]': ['/funds/120503'],
    'learn/[id]': ['/learn/finance101'],
    'market/fund/[code]': ['/market/fund/120503'],
    'market/stock/[symbol]': ['/market/stock/RELIANCE'],
    'market/crypto/[id]': ['/market/crypto/bitcoin', '/market/crypto/matic-network'],
    'market/commodity/[key]': ['/market/commodity/gold'],
    'market/fx/[pair]': ['/market/fx/USD_INR'],
}

def routes():
    out = []
    for d, _, files in os.walk(ROOT):
        for f in files:
            if not f.endswith('.tsx') or f.startswith('_'): continue
            rel = os.path.relpath(os.path.join(d, f), ROOT)[:-4].replace(os.sep, '/')
            rel = rel.replace('(tabs)/', '')
            if rel == 'index': continue                       # the launch redirect, not a screen
            if rel.endswith('/index'): rel = rel[:-6]         # folder/index.tsx is served at /folder (not /folder/index)
            if rel in SAMPLES: out += SAMPLES[rel]; continue
            if '[' in rel: out.append('/' + rel + '  <-- add a sample value to SAMPLES'); continue
            out.append('/' + rel)
    return sorted(set(out))

def populated():
    today = dt.date.today()
    d = lambda n: (today - dt.timedelta(days=n)).isoformat()
    txns = [{'id': f't{i}', 'date': d(i % 25), 'amount': 400 + 137 * i, 'type': ['need_food', 'want_shop', 'need_transport', 'need_rent'][i % 4],
             'category': ['need_food', 'want_shop', 'need_transport', 'need_rent'][i % 4], 'label': ['Lunch', 'Amazon', 'Uber', 'Rent'][i % 4]} for i in range(30)]
    txns.append({'id': 'inc', 'date': d(3), 'amount': 120000, 'type': 'credit', 'category': 'Salary', 'label': 'Salary'})
    return {
        'finos_transactions': txns,
        'finos_goals': [{'id': 'g1', 'name': 'House', 'target': 5000000, 'current': 800000, 'target_date': f'{today.year + 6}-06-01', 'monthly_sip': 15000},
                        {'id': 'g2', 'name': 'Car', 'target': 900000, 'current': 100000, 'target_date': f'{today.year + 2}-03-01', 'monthly_sip': 20000}],
        'finos_subscriptions': [{'id': 's1', 'name': 'Netflix', 'category': 'ott', 'amount': 649, 'cycle': 'monthly', 'nextDate': (today + dt.timedelta(days=5)).isoformat()},
                                {'id': 's2', 'name': 'Gym', 'category': 'fitness', 'amount': 6000, 'cycle': 'quarterly', 'nextDate': (today + dt.timedelta(days=40)).isoformat()}],
        'finos_insurance_policies': [{'id': 'p1', 'type': 'health', 'provider': 'Star', 'sum_assured': 500000, 'premium': 14000, 'renewal_date': (today + dt.timedelta(days=20)).isoformat()},
                                     {'id': 'p2', 'type': 'life_term', 'provider': 'LIC', 'sum_assured': 10000000, 'premium': 12000, 'renewal_date': (today + dt.timedelta(days=200)).isoformat()}],
        'finos_holdings_v1': [{'id': 'h1', 'type': 'Stock', 'symbol': 'INFY', 'name': 'Infosys', 'units': 20, 'avgPrice': 1500, 'lastPrice': 1620},
                              {'id': 'h2', 'type': 'MF', 'symbol': '120503', 'name': 'Index fund', 'units': 400, 'avgPrice': 150, 'lastPrice': 180, 'sipMonthly': 10000}],
        'finos_harvest_positions': [{'id': 'x', 'name': 'Zomato', 'type': 'equity', 'qty': 100, 'buyPrice': 250, 'cmp': 200, 'purchaseDate': '2025-12-01'}],
        'finos_sip_portfolio': [{'fundName': 'Index fund', 'monthlyAmount': 10000, 'startDate': '2024-01-01'}],
        'finos_fd_portfolio': [{'id': 'f1', 'name': 'HDFC FD', 'type': 'fd', 'principal': 200000, 'rate': 7, 'start': '2025-01-01', 'tenureMonths': 36}],
        'finos_user_name': 'Asha Rao', 'finos_age': '34', 'finos_monthly_income': '120000', 'finos_dependents': '2', 'finos_monthly_expense': '60000',
        'finos_emergency_fund': '250000', 'finos_epf_value': '800000', 'finos_nps_value': '300000', 'finos_ppf_value': '400000', 'finos_portfolio_value': '600000',
    }

NOISE = re.compile(r'ERR_CONNECTION|ERR_NAME|Failed to load resource|WebSocket|net::|localhost:\d+|favicon|AbortError|Network request failed|Failed to fetch|NetworkError|Load failed|status of 4\d\d|ECONNREFUSED|fetch', re.I)
# What expo-router renders for a route that does not exist. A pass on this page proves nothing (a stale dev server serves it for every
# new route), so it is a failure here, and so are the "unknown id" fallbacks of the dynamic screens.
UNMATCHED = re.compile(r'Unmatched Route|Page could not be found|There is no cover type called', re.I)
BAD_TEXT = re.compile(r'\bNaN\b|\bundefined\b|Infinity|\[object Object\]')

def main():
    only = sys.argv[1:]
    rs = only or routes()
    failures = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel='chromium')
        for theme in ('dark', 'light'):
            for label, data in (('empty', {}), ('populated', populated())):
                ctx = b.new_context(viewport={'width': 430, 'height': 900})
                init = f"localStorage.setItem('finos_theme_mobile','{theme}');" + ''.join(f"localStorage.setItem({k!r},{json.dumps(json.dumps(v))});" if not isinstance(v, str) else f"localStorage.setItem({k!r},{json.dumps(v)});" for k, v in data.items())
                ctx.add_init_script(init)
                ctx.route(re.compile(r'^https?://(?!localhost|127\.0\.0\.1).*'), lambda r: r.abort())      # no outside network
                pg = ctx.new_page()
                errs = []
                pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:160]))
                pg.on('console', lambda m: errs.append('console.error: ' + m.text[:160]) if m.type == 'error' and not NOISE.search(m.text) else None)
                for r in rs:
                    errs.clear()
                    try:
                        pg.goto(BASE + r, wait_until='domcontentloaded'); pg.wait_for_timeout(2200)
                        text = pg.inner_text('body')
                    except Exception as e:  # noqa: BLE001
                        failures.append((theme, label, r, f'navigation: {str(e)[:120]}')); continue
                    problems = list(errs)
                    if len(text.strip()) < 15: problems.append('empty screen')
                    if UNMATCHED.search(text): problems.append('UNMATCHED ROUTE (404 page or unknown-id fallback), not a real screen')
                    m = BAD_TEXT.search(text)
                    if m: problems.append(f'shows "{m.group(0)}": ...{text[max(0, m.start() - 40): m.end() + 30]!r}'.replace('\n', ' '))
                    for p in dict.fromkeys(problems): failures.append((theme, label, r, p))
                ctx.close()
        b.close()
    for f in failures: print(' | '.join(f))
    print(f'{len(rs)} screens x 4 runs: {len(failures)} problem(s)')
    return 1 if failures else 0

if __name__ == '__main__':
    sys.exit(main())
