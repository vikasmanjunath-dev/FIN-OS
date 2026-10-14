#!/usr/bin/env python3
"""Deterministic extractor: website lesson pages (html/*.html) -> mobile/content/learn/*.json + manifest.json.

Run from anywhere:  python3 mobile/scripts/extract-learn.py [--check]
  --check  exit 1 if the committed content differs from what the pages would produce now.

Rules
- Output depends only on the HTML and on the PAGES table below (no clock, no network, sorted keys).
- Only text that the page itself contains is emitted. Nothing is summarised or rewritten.
- Interactive-only pages (quizzes, simulators, hubs) are NOT flattened: they get a manifest entry with
  kind="interactive" and a `tool` route on the phone.
- Passages that need a human fact-check carry needsReview=true; the reasons live in REVIEW below and
  are mirrored in docs/agent-notes/learn-review.md. Nothing is silently corrected.
"""
import json, re, sys
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / 'html'
OUT = ROOT / 'mobile' / 'content' / 'learn'

# id, file, category, order, phone tool route (or None), kind override
PAGES = [
    # Foundations
    ('finance101', 'finance101.html', 'foundations', 1, None, None),
    ('principles', 'principles.html', 'foundations', 2, None, None),
    ('foundations', 'foundations.html', 'foundations', 0, None, 'interactive'),
    # Markets (id matches the website's learned-module ids from js/learn-ai.js where one exists)
    ('equity', 'learn-equity.html', 'markets', 1, '/markets', None),
    ('mutual_funds', 'learn-mf.html', 'markets', 2, '/tools/calculators', None),
    ('etf', 'learn-etf.html', 'markets', 3, '/markets', None),
    ('debt', 'learn-debt.html', 'markets', 4, '/tracker/fixed', None),
    ('money_market', 'learn-money-market.html', 'markets', 5, '/tracker/fixed', None),
    ('commodity', 'learn-commodity.html', 'markets', 6, '/tracker/gold', None),
    ('crypto', 'learn-crypto.html', 'markets', 7, '/tracker/crypto', None),
    ('forex', 'learn-forex.html', 'markets', 8, None, None),
    ('fno', 'learn-fno.html', 'markets', 9, None, None),
    # Analysis
    ('fundamental', 'learn-fundamental.html', 'analysis', 1, None, None),
    ('technical', 'learn-technical.html', 'analysis', 2, None, None),
    ('indicators', 'learn-indicators.html', 'analysis', 3, None, None),
    ('metrics', 'learn-metrics.html', 'analysis', 4, None, None),
    ('analysis', 'learn-analysis.html', 'analysis', 5, None, None),
    # Protection
    ('insurance', 'learn-insurance.html', 'protection', 1, '/tools/lifecover', None),
    # Insights (short, calculator-backed)
    ('insight-sip', 'insight-sip.html', 'insights', 1, '/tools/stepup', None),
    ('insight-emi', 'insight-emi.html', 'insights', 2, '/tools/homeloan', None),
    ('insight-debt', 'insight-debt.html', 'insights', 3, '/tools/debt', None),
    ('insight-inflation', 'insight-inflation.html', 'insights', 4, '/tools/calculators', None),
    ('insight-rbi', 'insight-rbi.html', 'insights', 5, None, None),
    # Mindset: interactive-only on the website (assessments / switchers) -> linked, not flattened
    ('investor-mindset', 'investor-mindset.html', 'mindset', 1, '/tools/dna', 'interactive'),
    ('investor-profile', 'investor-profile.html', 'mindset', 2, '/tools/dna', 'interactive'),
]

CATEGORIES = [
    ('foundations', 'Money foundations'),
    ('markets', 'Markets and instruments'),
    ('analysis', 'Analysing investments'),
    ('protection', 'Protection'),
    ('insights', 'Quick insights'),
    ('mindset', 'Investor mindset'),
]

# Pages deliberately not extracted (and why) so the omission is auditable.
EXCLUDED = {
    'simulator-guide.html': 'manual for the website-only trading simulator UI; nothing on the phone to apply it to',
    'train-mindset.html': 'redirect stub to simulator-landing.html',
    'mindset-sim-hub.html': 'interactive simulator hub',
    'mindset-sim.html': 'interactive simulator',
}

SKIP_TAGS = {'script', 'style', 'nav', 'aside', 'button', 'canvas', 'svg', 'input', 'select', 'textarea',
             'form', 'iframe', 'noscript', 'footer', 'link', 'meta', 'option', 'label'}
INTERACTIVE_TAGS = {'canvas', 'input', 'select', 'textarea', 'form'}
INLINE = {'span', 'strong', 'b', 'em', 'i', 'a', 'code', 'small', 'sup', 'sub', 'u', 'mark', 'br', 'abbr'}
CALLOUT_RE = re.compile(r'(concept|pro-tip|protip|callout|highlight|truth|desi|definition|warning|tip|note|insight-box|key|law-card)', re.I)
HEADINGS = {'h1': 1, 'h2': 2, 'h3': 3, 'h4': 4, 'h5': 4, 'h6': 4}
EMOJI_ONLY = re.compile(r'^[\W_]+$', re.U)

# --- Content review ---------------------------------------------------------------------------
# Every entry is a passage a human must fact-check before it is trusted. The extractor does NOT change the text;
# it flags the block `needsReview` and the phone shows a banner with the reason. The same table feeds
# docs/agent-notes/learn-review.md and mobile/content/learn/review.json.
# (id, page id, anchor regex matched against the block text, why it is doubtful, current rule/fact, confidence)
REVIEW_ITEMS = [
    ('finance101-cpi', 'finance101', r'Government inflation is 6%',
     'Quotes retail inflation (CPI) as 6%. Headline CPI ran far below that through FY 2025-26.',
     'All-India CPI inflation averaged roughly 2-3% in FY 2025-26 (monthly prints near record lows in late 2025). The "desi inflation 10%+" part is the author\'s own estimate, not an official figure.',
     'high'),
    ('finance101-epf-taxfree', 'finance101', r'Maximize EPF/PPF',
     '"Tax free growth" is true for PPF but not unconditionally for EPF.',
     'EPF interest on employee contributions above Rs 2.5 lakh a year (Rs 5 lakh where there is no employer contribution) is taxable since FY 2021-22. PPF interest is fully exempt.',
     'high'),
    ('finance101-sgb-digital', 'finance101', r'SGB \(Digital Gold\)',
     'Equates Sovereign Gold Bonds with "Digital Gold". They are different products.',
     'SGBs are RBI-issued government securities. "Digital gold" sold by apps is not an SGB and is not regulated by SEBI or RBI (SEBI cautioned investors in Nov 2025).',
     'high'),
    ('finance101-cc-interest', 'finance101', r'Interest is 42% per year',
     'Single figure stated as fact.',
     'Credit-card revolving interest is typically 36-48% a year depending on the issuer; check the card\'s own most-important-terms document.',
     'medium'),
    ('commodity-jewelry', 'commodity', r'20% Making Charges \+ 3% GST',
     'Making charges are shown as a fixed 20%; GST on the making charge is 5%, on the gold value 3%.',
     'Making charges vary (roughly 5-25%). GST: 3% on gold value, 5% on making charges (as applicable in FY 2025-26).',
     'medium'),
    ('commodity-sgb', 'commodity', r'Gold Price Appreciation \+ 2\.5% Interest|Issued by RBI\. No storage risk',
     'Presents SGB as something you can buy today and as "the best way to own gold". New SGB tranches have not been issued since early 2024.',
     'The government has not opened new SGB tranches since the Feb 2024 series; today they can only be bought on the exchange (often at a premium, thin liquidity). The maturity tax exemption applies to redemption at maturity by the original investor; selling on the exchange is taxed as a capital gain. "Mathematically the best" is an opinion.',
     'medium'),
    ('commodity-digital-gold', 'commodity', r'Digital Gold / ETF',
     'Groups unregulated digital gold with gold ETFs.',
     'Gold ETFs are SEBI-regulated; app-based "digital gold" is not (SEBI warning, Nov 2025).',
     'high'),
    ('debt-yields', 'debt', r'Savings Accounts \(3%\) or FDs \(6\.5%\)',
     'Rates are a snapshot that is out of date after the RBI repo cuts of 2025.',
     'Savings accounts pay about 2.5-3%. FD rates for general customers are mostly about 6-7% and the 10-year G-Sec yield has been around 6.3-6.7%, not 7.2-7.5%. Check live rates.',
     'medium'),
    ('debt-duration', 'debt', r'Long Duration Funds',
     'Quotes a return range (12-15%) as what long-duration funds "can give".',
     'Illustrative only; returns depend on the rate cycle and can be negative. Debt-fund gains are taxed at slab rate (no indexation, no LTCG benefit) for units bought after 1 Apr 2023.',
     'medium'),
    ('equity-asm', 'equity', r'ASM \(Additional Surveillance Measure\)',
     'Attributes the ASM list to SEBI and gives a single trigger and a fixed margin.',
     'ASM is an exchange (NSE/BSE) framework agreed with SEBI; inclusion uses several parameters, not one 50% jump, and the margins per stage are set by the exchange and have changed. Check the exchange circular.',
     'medium'),
    ('equity-ipo', 'equity', r'The company only gets money once',
     'Simplification.',
     'A listed company can also raise money later through a follow-on public offer, rights issue, QIP or preferential allotment.',
     'high'),
    ('etf-ter', 'etf', r'Expense Ratio: 0\.05%',
     'A specific fee quoted for "a Nifty 50 ETF".',
     'Nifty 50 ETFs charge roughly 0.03-0.10% a year depending on the fund; verify on the fund\'s factsheet.',
     'medium'),
    ('fno-stat', 'fno', r"66% of the time",
     'Unsourced statistic, and "option buyers lose 100% of premium" overstates it.',
     'SEBI studies found about 9 in 10 individual F&O traders lost money in FY22-FY25 (91% in FY25, average loss about Rs 1.1 lakh). The 66% figure has no source.',
     'high'),
    ('fno-selling', 'fno', r'Selling options IS the House',
     'Encourages option selling without saying that sellers carry very large (for naked calls, unlimited) losses and need large margins.',
     'Option writing needs margin well above the premium collected; one gap move can wipe out many months of premium. SEBI\'s 2024-25 measures (larger contract size, upfront premium, expiry limits) apply to index options.',
     'high'),
    ('forex-rate', 'forex', r'USD / INR = 83\.50',
     'Spot rate is stale.',
     'USD/INR traded around Rs 88-90 in late 2025.',
     'high'),
    ('forex-leverage', 'forex', r'The Power of 100x|With ₹1,000, you can control',
     '100x leverage for an Indian resident is not available on legal venues.',
     'Residents may trade currency derivatives only on recognised Indian exchanges (USD/INR, EUR/INR, GBP/INR, JPY/INR); margin trading on foreign forex platforms is not permitted under FEMA (RBI keeps an alert list). Exchange margins are far below 100x.',
     'high'),
    ('forex-volume', 'forex', r'\$6 Trillion/Day',
     'Out-of-date global turnover.',
     'The BIS triennial survey of April 2025 put FX turnover at about USD 9.6 trillion a day (USD 7.5 trillion in 2022).',
     'medium'),
    ('forex-carry', 'forex', r'Japan, 0%|USA, 5%',
     'Example interest rates are stale.',
     'Policy rates are no longer about 0% (Japan) and 5% (USA): Japan has been near 0.5-0.75% and the US Fed funds range was cut to about 3.5-3.75% by Dec 2025.',
     'medium'),
    ('metrics-fd', 'metrics', r'FD gives 7%',
     'Uses 7% as the FD benchmark.',
     'General-category FD rates are mostly about 6-7% after the 2025 repo cuts; the 15% hurdle is a rule of thumb, not a standard.',
     'low'),
    ('metrics-thresholds', 'metrics', r'>15% is excellent|>2 is dangerous|Should be > 3|<1 is undervalued',
     'Rule-of-thumb thresholds stated as rules.',
     'Healthy ratios differ by sector (banks and NBFCs are structurally highly leveraged; ROE and P/B norms differ). Treat as starting points, not verdicts.',
     'low'),
    ('indicators-vwap', 'indicators', r'Big dealers \(FIIs\) only buy near VWAP',
     'Overclaim about institutional behaviour.',
     'Institutions often benchmark execution against VWAP, but they do not only buy near it.',
     'low'),
    ('insurance-medinf', 'insurance', r'medical inflation is roughly 14%',
     'Single figure presented as fact.',
     'Commonly cited estimates of Indian medical inflation range about 10-14% a year depending on the source; none is an official statistic.',
     'low'),
    ('insurance-endowment', 'insurance', r'These plans give ~5% returns',
     'Compares ~5% returns with a stale 6-7% inflation.',
     'Traditional endowment plans often return about 4-6% a year; CPI was about 2-3% in FY 2025-26, so "losing money to inflation" is weaker today. The point that insurance and investment should be kept separate still stands.',
     'medium'),
    ('insurance-cover', 'insurance', r'Cover = \(Annual Income',
     'A formula given as "The FIN-OS Formula" and "anything less is a vulnerability".',
     'Income multiples of 10-20x plus liabilities are common rules of thumb; the right cover depends on dependants, assets and years to retirement. Use the Life Cover tool for a worked estimate.',
     'low'),
    ('moneymarket-rate', 'money_market', r'7% Interest\. Almost zero risk',
     'Quotes 7% for the money market.',
     'T-bill and liquid-fund yields were about 5.3-6% in FY 2025-26 after the 2025 repo cuts. "Almost zero risk" holds for T-bills, not for every liquid fund.',
     'medium'),
    ('moneymarket-cp', 'money_market', r'CP \(Commercial Paper\)',
     'Suggests an individual can lend to a corporate via commercial paper.',
     'Commercial paper has a minimum face value of Rs 5 lakh and is mainly bought by institutions; retail access is through debt/liquid funds.',
     'medium'),
    ('moneymarket-arb', 'money_market', r'Arbitrage Funds are taxed as Equity|returns 7-8% risk-free',
     'Tax and return claims are incomplete.',
     'Arbitrage funds are taxed as equity funds: 20% short-term (held under 12 months) and 12.5% long-term gains above Rs 1.25 lakh a year, not 12.5% from 6 months. They are low-risk, not risk-free, and typically returned about 6-7%. Liquid funds are taxed at slab rate (30% only in the top slab).',
     'high'),
    ('mf-spiva', 'mutual_funds', r'80% of Active Funds FAIL',
     'Presents an SPIVA-style statistic as a general fact.',
     'S&P SPIVA India shows a high underperformance rate for large-cap active funds over 10 years, but mid/small-cap categories differ a lot and the figure changes every report.',
     'medium'),
    ('mf-direct', 'mutual_funds', r'Direct plan gives you|Regular Plan: Includes 1% commission',
     'A specific rupee gain is stated without its assumptions.',
     'The regular-vs-direct expense gap is about 0.5-1.5% depending on the scheme; the rupee gain depends on SIP size, tenure and return. Direct plans have no distributor commission; "scam" is the author\'s framing.',
     'medium'),
    ('insight-emi-prepay', 'insight-emi', r'Pre-pay 1 extra EMI every year',
     'Arithmetic is wrong: one extra EMI a year does not take a 20-year loan to 12 years.',
     'Checked: for a 20-year loan at 8-10%, one extra EMI each year closes it in about 16.3-16.9 years. "80% of EMI is interest in year one" is right for roughly 8-9% rates and 20 years.',
     'high'),
    ('insight-sip-math', 'insight-sip', r'Start at 25: You invest',
     'The retirement age and the return are not stated.',
     'The figures match a Rs 5,000 monthly SIP at 12% a year (not guaranteed) running 30 years vs 20 years (about Rs 1.75 crore vs Rs 49 lakh). Equity returns are not assured.',
     'medium'),
    ('insight-inflation-cpi', 'insight-inflation', r'While CPI is 6%|Inflation: 7% Loss',
     'Uses 6-7% as current inflation.',
     'CPI inflation averaged about 2-3% in FY 2025-26. "Nifty 50: 12%" is an assumption, not a promise.',
     'high'),
]
REVIEW_BY_PAGE = {}
for _r in REVIEW_ITEMS:
    REVIEW_BY_PAGE.setdefault(_r[1], []).append(_r)


def clean(s: str) -> str:
    s = s.replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip()


BLOCKISH = {'div', 'p', 'li', 'ul', 'ol', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'th', 'section', 'article', 'table', 'dt', 'dd'}


def text_of(el) -> str:
    """Flatten an element to one line of text. Inline tags join without a space (so `<b>x</b>.` stays `x.`),
    block-level tags and <br> become a space."""
    parts = []

    def rec(n):
        for c in n.children:
            if isinstance(c, NavigableString):
                if type(c).__name__ in ('Comment', 'Doctype', 'Declaration'):
                    continue
                parts.append(str(c))
            elif isinstance(c, Tag):
                if c.name in SKIP_TAGS:
                    continue
                blk = c.name in BLOCKISH
                if blk:
                    parts.append(' ')
                rec(c)
                if blk:
                    parts.append(' ')
    rec(el)
    return clean(''.join(parts))


KICKER_RE = re.compile(r'(chapter-badge|module-tag|mod-badge|phase-badge)', re.I)
CHROME_RE = re.compile(r'^(SYSTEM[: ]|⬇|SEC-\d+$|Swipe to|Initialize |MODULE SELECTION|Visualizing |Needs vs Wants Radar$|Emergency Fund \(6 Months\)$)')


def has_class(el: Tag, rx) -> bool:
    return bool(rx.search(' '.join(el.get('class') or [])))


class Walker:
    def __init__(self):
        self.blocks = []   # flat list of blocks; headings included
        self.interactive = False

    def flush_inline(self, buf):
        t = clean(''.join(buf))
        buf.clear()
        if t and not EMOJI_ONLY.match(t) and not CHROME_RE.search(t):
            self.blocks.append({'t': 'p', 'text': t})

    def walk(self, el: Tag):
        buf = []
        for ch in el.children:
            if isinstance(ch, NavigableString):
                if not isinstance(ch, type(ch)) or ch.parent is None:
                    continue
                if type(ch).__name__ in ('Comment', 'Doctype', 'Declaration'):
                    continue
                buf.append(str(ch))
                continue
            if not isinstance(ch, Tag):
                continue
            name = ch.name
            if name in INTERACTIVE_TAGS:
                self.interactive = True
            if name in SKIP_TAGS:
                continue
            if ch.get('hidden') is not None or 'hidden' in (ch.get('class') or []) and name != 'section':
                continue
            if name in INLINE:
                buf.append(text_of(ch) if name != 'br' else ' ')
                continue
            self.flush_inline(buf)
            if name in HEADINGS:
                t = text_of(ch)
                if t:
                    self.blocks.append({'t': 'h', 'level': HEADINGS[name], 'text': t})
            elif KICKER_RE.search(' '.join(ch.get('class') or [])) and len(text_of(ch)) < 60:
                t = text_of(ch)
                if t:
                    self.blocks.append({'t': 'kicker', 'text': t})
            elif name == 'p':
                t = text_of(ch)
                if t and not CHROME_RE.search(t):
                    self.blocks.append({'t': 'p', 'text': t})
            elif name in ('ul', 'ol'):
                items = [text_of(li) for li in ch.find_all('li', recursive=False)]
                items = [i for i in items if i]
                if items:
                    self.blocks.append({'t': 'ul' if name == 'ul' else 'ol', 'items': items})
            elif name == 'table':
                rows = []
                for tr in ch.find_all('tr'):
                    cells = [text_of(c) for c in tr.find_all(['th', 'td'])]
                    if any(cells):
                        rows.append(cells)
                if rows:
                    self.blocks.append({'t': 'table', 'rows': rows})
            elif CALLOUT_RE.search(' '.join(ch.get('class') or [])) and not ch.find(['section', 'h1', 'h2']):
                self.callout(ch)
            else:
                self.walk(ch)
        self.flush_inline(buf)

    def callout(self, el: Tag):
        title = ''
        inner = Walker()
        inner.walk(el)
        blocks = inner.blocks
        if inner.interactive:
            self.interactive = True
        if blocks and blocks[0]['t'] == 'h':
            title = blocks[0]['text']
            blocks = blocks[1:]
        parts = []
        for b in blocks:
            if b['t'] in ('h', 'p'):
                parts.append(b['text'])
            elif b['t'] in ('ul', 'ol'):
                parts.extend('- ' + i for i in b['items'])
            elif b['t'] == 'table':
                parts.extend(' | '.join(r) for r in b['rows'])
        cls = ' '.join(el.get('class') or [])
        kind = 'tip' if re.search(r'pro-tip|tip', cls) else 'warning' if re.search(r'warn|scam', cls) else 'fact' if re.search(r'truth|highlight|definition', cls) else 'note'
        if title or parts:
            self.blocks.append({'t': 'callout', 'kind': kind, 'title': title, 'text': '\n'.join(parts)})


def dedupe_blocks(blocks):
    out = []
    for b in blocks:
        if out and out[-1] == b:
            continue
        out.append(b)
    return out


def sectionise(blocks, page_title):
    """Split the flat block list into sections at h1/h2 (and h3 when no h2 exists)."""
    heads = [b for b in blocks if b['t'] == 'h']
    has_h2 = any(h['level'] <= 2 and h['text'] != page_title for h in heads)
    split_level = 2 if has_h2 else 3
    sections, cur = [], {'heading': '', 'blocks': []}
    title_seen = False
    kicker = ''
    for i, b in enumerate(blocks):
        if b['t'] == 'kicker':
            nxt = blocks[i + 1] if i + 1 < len(blocks) else None
            if nxt and nxt['t'] == 'h' and nxt['level'] <= split_level:
                kicker = b['text']
            else:
                cur['blocks'].append({'t': 'p', 'text': b['text']})
            continue
        if b['t'] == 'h' and not title_seen and b['level'] == 1:
            title_seen = True
            cur['heading'] = ''
            continue
        if b['t'] == 'h' and b['level'] <= split_level:
            if cur['heading'] or cur['blocks']:
                sections.append(cur)
            cur = {'heading': b['text'], 'blocks': []}
            if kicker:
                cur['kicker'] = kicker
                kicker = ''
            continue
        cur['blocks'].append(b)
    if cur['heading'] or cur['blocks']:
        sections.append(cur)
    return sections


def block_text(b):
    if b['t'] in ('p', 'h'):
        return b['text']
    if b['t'] in ('ul', 'ol'):
        return ' '.join(b['items'])
    if b['t'] == 'callout':
        return b['title'] + ' ' + b['text']
    if b['t'] == 'table':
        return ' '.join(' '.join(r) for r in b['rows'])
    return ''


QUOTES = {}


def review_reasons(pid, text, used=None):
    out = []
    for rid, _p, rx, *_ in REVIEW_BY_PAGE.get(pid, []):
        if re.search(rx, text):
            out.append(rid)
            QUOTES.setdefault(rid, text)
            if used is not None:
                used.add(rid)
    return out


def extract_page(pid, fname, category, order, tool, kind_override):
    raw = (HTML / fname).read_text(encoding='utf-8')
    soup = BeautifulSoup(raw, 'html.parser')
    title_tag = soup.find('title')
    title = clean(title_tag.get_text()) if title_tag else pid
    title = re.sub(r'\s*\|\s*FIN[-•·]?OS\s*$', '', title).strip()
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    desc = clean(desc_tag['content']) if desc_tag and desc_tag.get('content') else ''
    main = (soup.find(class_='deep-content') or soup.find(class_='insight-content') or soup.find('main')
            or soup.find(class_='deep-wrapper') or soup.body)
    w = Walker()
    # sidebar toc headers etc are outside main for most pages; also drop hero duplicates after dedupe
    w.walk(main)
    blocks = dedupe_blocks(w.blocks)
    h1 = next((b['text'] for b in blocks if b['t'] == 'h' and b['level'] == 1), '')
    page_title = title
    sections = sectionise(blocks, h1)
    words = sum(len(block_text(b).split()) for s in sections for b in s['blocks']) + sum(len(s['heading'].split()) for s in sections)
    interactive_only = kind_override == 'interactive' or words < 40
    kind = 'interactive' if interactive_only else 'lesson'
    entry = {
        'id': pid, 'title': title, 'category': category, 'order': order, 'kind': kind,
        'source': 'html/' + fname, 'tool': tool,
        'hasInteractive': bool(w.interactive),
        'minutes': 0 if interactive_only else max(1, round(words / 200)),
        'words': words,
        'summary': desc,
    }
    if interactive_only:
        entry['summary'] = entry['summary'] or ''
        return entry, None
    review_ids = []
    used = set()
    for s in sections:
        for b in s['blocks']:
            rs = review_reasons(pid, block_text(b), used)
            if rs:
                b['needsReview'] = True
                b['reviewReasons'] = rs
                for r in rs:
                    if r not in review_ids:
                        review_ids.append(r)
        sh = review_reasons(pid, s['heading'], used)
        if sh:
            s['needsReview'] = True
    # summary: the page description if present, else the first paragraph of the first section that has one
    if not entry['summary']:
        for s in sections:
            p = next((b['text'] for b in s['blocks'] if b['t'] == 'p'), '')
            if p:
                entry['summary'] = p[:220]
                break
    entry['needsReview'] = bool(review_ids)
    entry['reviewReasons'] = review_ids
    lesson = {'id': pid, 'title': title, 'summary': entry['summary'], 'category': category,
              'source': 'html/' + fname, 'sections': sections, 'tool': tool,
              'needsReview': entry['needsReview'], 'reviewReasons': review_ids}
    return entry, lesson


def build():
    files = {}
    manifest = {'version': 1, 'categories': [{'id': c, 'title': t} for c, t in CATEGORIES],
                'excluded': EXCLUDED, 'lessons': []}
    for pid, fname, cat, order, tool, kind in PAGES:
        entry, lesson = extract_page(pid, fname, cat, order, tool, kind)
        manifest['lessons'].append(entry)
        if lesson:
            files[f'{pid}.json'] = lesson
    missing = [r[0] for r in REVIEW_ITEMS if r[0] not in QUOTES]
    if missing:
        raise SystemExit('review anchors that matched nothing (page text changed?): %s' % missing)
    files['review.json'] = {'version': 1, 'items': [
        {'id': r[0], 'lesson': r[1], 'quote': QUOTES[r[0]][:300], 'why': r[3], 'current': r[4], 'confidence': r[5]}
        for r in REVIEW_ITEMS]}
    files['manifest.json'] = manifest
    return files


def review_markdown():
    lines = ['# Learn content review (FY 2025-26 / Tax Year 2026-27)', '',
             'Generated by `mobile/scripts/extract-learn.py` from its REVIEW_ITEMS table; do not edit by hand.',
             'Nothing below was silently corrected: the lesson text is shipped as the website has it, the passage is',
             'flagged `needsReview` and the app shows a "check before relying" banner. Confidence is how sure I am',
             'that the passage is wrong or stale, from my own knowledge (no live web access in this pass); a human',
             'with the primary source (CBDT, RBI, SEBI, NSE circulars) must confirm each row before the flag is removed.',
             '', '| # | Lesson | Quote on the page | Why it is doubtful | Current rule / fact | Confidence |',
             '|---|---|---|---|---|---|']
    for i, r in enumerate(REVIEW_ITEMS, 1):
        q = QUOTES[r[0]][:200].replace('|', '/')
        lines.append('| %d | %s | %s | %s | %s | %s |' % (i, r[1], q, r[3].replace('|', '/'), r[4].replace('|', '/'), r[5]))
    lines += ['', '## Omissions noticed (nothing to flag, but the lessons are silent)', '',
              '- Crypto lesson: no mention of India\'s 30% flat tax on virtual digital asset gains, 1% TDS and no set-off of losses.',
              '- Equity / MF lessons: no mention of capital-gains rates (LTCG 12.5% above Rs 1.25 lakh, STCG 20% on listed equity from 23 Jul 2024).',
              '- Insurance lesson: GST on individual health and term premiums was removed from 22 Sep 2025.',
              '- Tax regime lessons: the website has no learn-tax page; tax facts live in the calculators (shared tax core), not here.',
              '']
    return '\n'.join(lines)


def content_ts(files):
    ids = sorted(k[:-5] for k in files if k not in ('manifest.json', 'review.json'))
    lines = ['// GENERATED by mobile/scripts/extract-learn.py - do not edit. Static requires so Metro bundles the lessons offline.',
             "import type { Lesson, Manifest, ReviewItem } from '@/lib/learn';", '',
             "export const MANIFEST = require('@/content/learn/manifest.json') as Manifest;",
             "export const REVIEW_ITEMS = (require('@/content/learn/review.json') as { items: ReviewItem[] }).items;", '',
             'export const LESSONS: Record<string, Lesson> = {']
    for i in ids:
        lines.append("  '%s': require('@/content/learn/%s.json') as Lesson," % (i, i))
    lines += ['};', '']
    return '\n'.join(lines)


def main():
    files = build()
    rendered = {k: json.dumps(v, ensure_ascii=False, indent=1, sort_keys=True) + '\n' for k, v in files.items()}
    ts_path = ROOT / 'mobile' / 'lib' / 'learnContent.ts'
    ts = content_ts(files)
    if '--check' in sys.argv:
        if not ts_path.exists() or ts_path.read_text(encoding='utf-8') != ts:
            print('learnContent.ts out of date')
            sys.exit(1)
        bad = [k for k, v in rendered.items() if not (OUT / k).exists() or (OUT / k).read_text(encoding='utf-8') != v]
        extra = [p.name for p in OUT.glob('*.json') if p.name not in rendered]
        if bad or extra:
            print('learn content out of date:', bad + extra)
            sys.exit(1)
        print('learn content up to date (%d files)' % len(rendered))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    ts_path.write_text(ts, encoding='utf-8')
    for p in OUT.glob('*.json'):
        if p.name not in rendered:
            p.unlink()
    for k, v in rendered.items():
        (OUT / k).write_text(v, encoding='utf-8')
    md = ROOT / 'docs' / 'agent-notes' / 'learn-review.md'
    md.parent.mkdir(parents=True, exist_ok=True)
    md.write_text(review_markdown(), encoding='utf-8')
    m = files['manifest.json']['lessons']
    print('wrote %d files; %d lessons, %d interactive; needsReview lessons: %d' % (
        len(rendered), sum(1 for x in m if x['kind'] == 'lesson'), sum(1 for x in m if x['kind'] != 'lesson'),
        sum(1 for x in m if x.get('needsReview'))))


if __name__ == '__main__':
    main()
