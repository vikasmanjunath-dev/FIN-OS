#!/usr/bin/env python3
"""Store screenshots from the Expo web preview, with a clearly SYNTHETIC profile.

    cd mobile && npx expo start --web --port 8082        # in another terminal
    python3 mobile/scripts/release-screenshots.py        # writes mobile/assets/store/<size>/<theme>-<NN>-<screen>.png
    python3 mobile/scripts/release-screenshots.py --only home,score --themes dark

What these are, honestly: the real app code rendered by react-native-web at a phone viewport, device scale 3. They show the
real screens and real calculations on made-up data. They are NOT captured from an iPhone or an Android phone, so they have no
status bar or home indicator. Apple and Google both want screenshots of the app running; replace these with simulator /
device captures after the first EAS build if you want that (docs/STORE_LISTING.md). Nothing here is a real person's data:
the profile is named "Sample User", every figure is invented, and the seed is in this file.
"""
import argparse, datetime as dt, json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8082')
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'store'))

# (folder, css width, css height, device scale) -> pixel size = width*scale x height*scale
SIZES = [
    ('ios-1290x2796', 430, 932, 3),      # App Store 6.7" (iPhone Pro Max class); App Store Connect also scales this for 6.5" / 6.9" slots
    ('android-1080x1920', 360, 640, 3),  # Google Play phone, 9:16
]

# (slug, route, what it shows, optional button text to press before the capture)
SCREENS = [
    ('home',       '/dashboard',            'Home: net worth, spending this month, next best step', None),
    ('score',      '/tools/score',          'Money Score: six pillars and ranked next moves',       'Calculate my score'),
    ('budget',     '/tracker/budget',       'Monthly budget by category',                           None),
    ('networth',   '/tracker/networth',     'Net worth across everything you track',                None),
    ('tax',        '/tools/taxplanner',     'Tax planner: old vs new regime',                       None),
    ('goals',      '/tracker/goals',        'Goals and the SIP each one needs',                     None),
    ('privacy',    '/privacy',              'Privacy & your data: what is stored, what can leave',  None),
]


def seed(today: dt.date) -> dict:
    d = lambda n: (today - dt.timedelta(days=n)).isoformat()
    ahead = lambda n: (today + dt.timedelta(days=n)).isoformat()
    month_start = today.replace(day=1)
    prev_month_end = month_start - dt.timedelta(days=1)
    txns, i = [], 0

    def add(date, amount, kind, category, label):
        nonlocal i
        i += 1
        txns.append({'id': f'demo{i}', 'date': date.isoformat() if hasattr(date, 'isoformat') else date, 'amount': amount, 'type': kind,
                     'category': category if kind == 'expense' else ('Income' if kind == 'income' else 'Savings & Investments'),
                     'label': label, 'cat': category if kind == 'expense' else None, 'source': 'mobile'})

    for m_start in (month_start, (prev_month_end).replace(day=1)):
        add(m_start + dt.timedelta(days=0), 95000, 'income', 'Income', 'Salary')
        add(m_start + dt.timedelta(days=1), 22000, 'expense', 'Housing', 'Rent')
        add(m_start + dt.timedelta(days=1), 12000, 'saving', 'Savings', 'Index fund SIP')
        add(m_start + dt.timedelta(days=2), 1800, 'expense', 'Bills & Utilities', 'Electricity bill')
        add(m_start + dt.timedelta(days=2), 999, 'expense', 'Bills & Utilities', 'Broadband')
        add(m_start + dt.timedelta(days=3), 649, 'expense', 'Subscriptions', 'Streaming')
        add(m_start + dt.timedelta(days=4), 3200, 'expense', 'Groceries', 'Weekly groceries')
        add(m_start + dt.timedelta(days=5), 1450, 'expense', 'Food & Dining', 'Dinner out')
        add(m_start + dt.timedelta(days=6), 2400, 'expense', 'Transport', 'Fuel')
        add(m_start + dt.timedelta(days=7), 3900, 'expense', 'Shopping', 'Clothes')
        add(m_start + dt.timedelta(days=8), 2900, 'expense', 'Groceries', 'Groceries')
        add(m_start + dt.timedelta(days=9), 1100, 'expense', 'Health', 'Pharmacy')
        add(m_start + dt.timedelta(days=10), 2200, 'expense', 'Entertainment', 'Weekend outing')
        add(m_start + dt.timedelta(days=11), 5200, 'expense', 'EMI & Loans', 'Phone EMI')
    txns = [t for t in txns if t['date'] <= today.isoformat()]

    holdings = [
        {'id': 'h1', 'type': 'Stock', 'symbol': 'SAMPLEA', 'name': 'Sample Technologies Ltd', 'units': 40, 'avgPrice': 1480, 'lastPrice': 1632, 'priceDate': d(1)},
        {'id': 'h2', 'type': 'Stock', 'symbol': 'SAMPLEB', 'name': 'Sample Bank Ltd', 'units': 60, 'avgPrice': 910, 'lastPrice': 874, 'priceDate': d(1)},
        {'id': 'h3', 'type': 'MF', 'symbol': '900001', 'name': 'Sample Index Fund - Direct Growth', 'units': 520.4, 'avgPrice': 142.5, 'lastPrice': 171.8, 'sipMonthly': 12000, 'priceDate': d(1)},
        {'id': 'h4', 'type': 'ELSS', 'symbol': '900002', 'name': 'Sample Tax Saver Fund - Direct', 'units': 310.2, 'avgPrice': 96.2, 'lastPrice': 118.4, 'sipMonthly': 6000, 'priceDate': d(1)},
    ]
    port_value = sum(h['units'] * h['lastPrice'] for h in holdings)

    return {
        'finos_theme_mobile': None,       # set per run
        'finos_user_name': 'Sample User', 'finos_age': '34', 'finos_dependents': '2',
        'finos_monthly_income': '95000', 'finos_monthly_expense': '58000',
        'finos_transactions': txns,
        'finos_budgets': {'limits': {'Food & Dining': 6000, 'Groceries': 9000, 'Transport': 4000, 'Shopping': 5000, 'Entertainment': 3000, 'Subscriptions': 1500}},
        'finos_goals': [
            {'id': 'g1', 'name': 'Emergency fund', 'target': 360000, 'current': 240000, 'target_date': f'{today.year + 1}-03-01'},
            {'id': 'g2', 'name': 'Home down payment', 'target': 2500000, 'current': 620000, 'target_date': f'{today.year + 6}-06-01'},
            {'id': 'g3', 'name': 'Family holiday', 'target': 200000, 'current': 55000, 'target_date': f'{today.year + 1}-12-01'},
        ],
        'finos_holdings_v1': holdings,
        'finos_portfolio_value': str(round(port_value)), 'finos_sip_total': '18000',
        'finos_subscriptions': [
            {'id': 's1', 'name': 'Streaming', 'category': 'ott', 'amount': 649, 'cycle': 'monthly', 'nextDate': ahead(9)},
            {'id': 's2', 'name': 'Music', 'category': 'music', 'amount': 119, 'cycle': 'monthly', 'nextDate': ahead(17)},
        ],
        'finos_insurance_policies': [
            {'id': 'p1', 'type': 'health', 'provider': 'Sample Health Insurer', 'sum_assured': 1000000, 'annual_premium': 16500, 'renewal_date': ahead(48)},
            {'id': 'p2', 'type': 'life_term', 'provider': 'Sample Life Insurer', 'sum_assured': 10000000, 'annual_premium': 14200, 'renewal_date': ahead(160)},
        ],
        'finos_emergency_fund': '240000', 'finos_emergency_months_target': '6',
        'finos_epf_value': '620000', 'finos_nps_value': '180000', 'finos_ppf_value': '350000', 'finos_fd_value': '200000', 'finos_gold_value': '90000',
        'finos_cash_value': '75000', 'finos_home_loan': '0', 'finos_car_loan': '0',
        'finos_80c_used': '110000',
        'finos_onboarding_done': 'true',
    }


def init_script(theme: str, data: dict) -> str:
    out = []
    for k, v in data.items():
        if k == 'finos_theme_mobile':
            v = theme
        elif v is None:
            continue
        s = v if isinstance(v, str) else json.dumps(v)
        out.append(f"localStorage.setItem({json.dumps(k)},{json.dumps(s)});")
    return ''.join(out)


BAD = re.compile(r'\bNaN\b|\bundefined\b|Infinity|\[object Object\]')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='comma separated screen slugs')
    ap.add_argument('--themes', default='dark,light')
    ap.add_argument('--sizes', help='comma separated folder names')
    a = ap.parse_args()
    only = set(a.only.split(',')) if a.only else None
    themes = a.themes.split(',')
    sizes = [s for s in SIZES if not a.sizes or s[0] in a.sizes.split(',')]
    today = dt.date.today()
    data = seed(today)
    manifest, problems = [], []
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel='chromium')
        for folder, w, h, scale in sizes:
            os.makedirs(os.path.join(OUT, folder), exist_ok=True)
            for theme in themes:
                ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=scale, is_mobile=True, has_touch=True,
                                    color_scheme=theme)
                ctx.add_init_script(init_script(theme, data))
                ctx.route(re.compile(r'^https?://(?!localhost|127\.0\.0\.1).*'), lambda r: r.abort())   # nothing leaves the machine
                pg = ctx.new_page()
                for n, (slug, route, what, click) in enumerate(SCREENS, 1):
                    if only and slug not in only:
                        continue
                    pg.goto(BASE + route, wait_until='domcontentloaded')
                    pg.wait_for_timeout(3200)
                    if click:                       # run the calculator so the screenshot shows a result, not an empty form
                        pg.get_by_text(click, exact=True).first.click()
                        pg.wait_for_timeout(1500)
                    text = pg.inner_text('body')
                    m = BAD.search(text)
                    if m:
                        problems.append(f'{folder}/{theme}/{slug}: shows "{m.group(0)}"')
                    if len(text.strip()) < 40:
                        problems.append(f'{folder}/{theme}/{slug}: nearly empty')
                    name = f'{theme}-{n:02d}-{slug}.png'
                    path = os.path.join(OUT, folder, name)
                    pg.screenshot(path=path)
                    manifest.append({'file': f'{folder}/{name}', 'route': route, 'shows': what, 'theme': theme, 'width': w * scale, 'height': h * scale})
                    print('wrote', f'{folder}/{name}')
                ctx.close()
        b.close()
    if not only:
        with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
            json.dump({'synthetic': True, 'profile': 'Sample User (invented)', 'source': 'Expo web preview rendered with Playwright, not a device capture',
                       'generator': 'mobile/scripts/release-screenshots.py', 'screens': manifest}, f, indent=2)
    for p in problems:
        print('PROBLEM', p)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
