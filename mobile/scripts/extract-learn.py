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
import bisect
import html as htmllib
import json, re, subprocess, sys
from urllib.parse import urlsplit
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
]

CATEGORIES = [
    ('foundations', 'Money foundations'),
    ('markets', 'Markets and instruments'),
    ('analysis', 'Analysing investments'),
    ('protection', 'Protection'),
    ('insights', 'Quick insights'),
    ('mindset', 'Investor mindset'),
    ('website', 'Interactive pages on the website'),
]

# Pages deliberately not extracted (and why) so the omission is auditable.
EXCLUDED = {
    'simulator-guide.html': 'manual for the website-only trading simulator UI; nothing on the phone to apply it to',
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
    ('mindsim-2008-gain', 'mindset-sim', r'64% gain from bottom',
     'The page says holding gave Rs 8.2 lakh, "64% gain from bottom".',
     'From the Rs 2.75 lakh at the bottom to Rs 8.2 lakh is about a 198% gain; 64% is the gain on the starting Rs 5 lakh (computed from the page\'s own numbers).',
     'high'),
    ('mindsim-2008-drawdown', 'mindset-sim', r'60% neeche',
     'The card for this scenario says Nifty fell 52%; the story says it was 60% below its high.',
     'Two different falls for one event. Check NSE index history for the date and the high you mean before quoting either.',
     'high'),
    ('mindsim-2024-budget', 'mindset-sim', r'Nifty 700 points neeche|3% single day',
     'Says Nifty fell 3% (700 points) in one day after the July 2024 Budget.',
     'From memory the Nifty closed only slightly lower that day after a larger dip during the session; check NSE data. The tax change itself (LTCG 10% to 12.5%, STCG 15% to 20% on listed equity) is correct.',
     'medium'),
    ('mindsim-zomato', 'mindset-sim', r'80% premium|Zomato listed at',
     'The card says an 80% premium; the story says a 68% gain and a listing at Rs 128.',
     'Two different figures for one listing. From memory Zomato listed near Rs 115-116 on 23 July 2021 against an issue price of Rs 76 and traded up to about Rs 138 that day; check the exchange record.',
     'medium'),
    ('mindsim-friend-loans', 'mindset-sim', r'40% of friend loans',
     'An unsourced statistic.',
     'No source is given; treat it as an anecdote, not a statistic.',
     'high'),
    ('mindsim-jobloss-tax', 'mindset-sim', r'1\.4L milenge',
     'Says Rs 2 lakh becomes Rs 1.4 lakh "post-tax after STCG".',
     'Short-term gains tax is charged only on gains; a 30% drop cannot come from that tax alone. The figure is unexplained.',
     'medium'),
    ('mindsim-endowment', 'mindset-sim', r'3% CAGR|48L in ELSS|₹48L',
     'Says Rs 50,000 a year for 20 years returning Rs 18 lakh is "3% CAGR", and that Rs 50,000 a year in ELSS at 12% becomes Rs 48 lakh.',
     'Premiums paid every year that return Rs 18 lakh after 20 years work out to about 5.3-5.8% a year (computed). Rs 50,000 a year at a steady 12% for 20 years is about Rs 36-40 lakh, not Rs 48 lakh, and 12% is not guaranteed.',
     'high'),
    ('mindsim-sgb', 'mindset-sim', r'SGB gives gold price appreciation',
     'Presents Sovereign Gold Bonds as something to buy now and as better than physical gold.',
     'The government has not opened new SGB tranches since early 2024; they can only be bought on the exchange, often at a premium. "Better than physical gold" is an opinion.',
     'medium'),
    ('mindsim-2020-sip', 'mindset-sim', r'90%\+ returns',
     'A return figure for people who doubled their SIP, with no source.',
     'Returns depend on the funds and dates; the figure is not backed by anything on the page.',
     'low'),
    ('impact-sip-crore', 'impact-detail', r'Final value ≈ ₹1 crore\+',
     'Says Rs 500 a month for 30 years becomes "Rs 1 crore+".',
     'At a steady 12% a year (SIP formula, instalment at the start of each month) Rs 500 a month for 30 years is about Rs 17.6 lakh; even at 15% it is about Rs 35 lakh. This is the same sum the SIP calculator on this phone does, and the website\'s own js/impact.js computes it the same way.',
     'high'),
    ('impact-delay', 'impact-detail', r'30–40% less wealth|30–40% of final wealth',
     'Says a 5-year delay costs 30-40% of the final wealth.',
     'It depends on the return. For a 25-year against a 30-year SIP the shortfall is about 36% at 8%, 41% at 10% and 46% at 12% a year (computed).',
     'medium'),
    ('impact-fd-inflation', 'impact-detail', r'FD return: 5–6%|Inflation: 6–7%',
     'Quotes FD returns of 5-6% and inflation of 6-7%.',
     'CPI inflation averaged about 2-3% in FY 2025-26 and general-category FD rates are mostly about 6-7%, so "FDs lose to inflation" is weaker today (and depends on tax). Check current rates.',
     'medium'),
    ('decision-loss-2x', 'decision', r'Loss hurts 2x',
     'A research finding given as an exact number.',
     'Studies of loss aversion often find losses weigh roughly 2 to 2.5 times as much as gains, but the size varies between studies and people.',
     'low'),
    ('decision-certain', 'decision', r'Result: Permanent Loss|Result: Wealth Creation',
     'Outcomes are stated as certain.',
     'Selling after a 10% fall is not always a permanent loss and buying more is not always wealth creation; the page\'s point is about reacting without thinking.',
     'low'),
    ('clarity-cover', 'clarity', r'5L Base \+ 20L Super Top-up|20x Annual Income',
     'Insurance cover sizes are given as rules.',
     'These are rules of thumb. The right cover depends on dependants, city, age and liabilities; see the Life cover tool for a worked estimate.',
     'low'),
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


# --- Provenance ---------------------------------------------------------------------------------
# Every block of every lesson carries `line`: the line of its source file (the lesson's `source`, or the block's own `file`
# for content that lives in a js/ file) where its text starts. The extractor FAILS if a block's text cannot be found in the
# file, and __tests__/learn2.test.mts re-checks the same thing independently.
def alnum(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', s.lower())


class Locator:
    """Maps the letters and digits of a file (markup stripped when html=True, entities decoded) back to line numbers."""

    def __init__(self, path: Path, html: bool):
        self.path = path
        raw = path.read_text(encoding='utf-8')
        self.stream = []     # alnum characters
        self.at = []         # 1-based line of each character
        line, i, n = 1, 0, len(raw)
        seg = []
        seg_line = 1

        def flush():
            if seg:
                text = ''.join(seg)
                for k, part in enumerate(text.split('\n')):
                    dec = htmllib.unescape(part) if html else part
                    for ch in alnum(dec):
                        self.stream.append(ch)
                        self.at.append(seg_line + k)
                seg.clear()

        while i < n:
            ch = raw[i]
            if html and ch == '<' and i + 1 < n and (raw[i + 1].isalpha() or raw[i + 1] in '/!'):
                flush()
                j = raw.find('>', i)
                j = n if j < 0 else j
                line += raw.count('\n', i, j + 1)
                i = j + 1
                seg_line = line
                continue
            if not seg:
                seg_line = line
            seg.append(ch)
            if ch == '\n':
                line += 1
            i += 1
        flush()
        self.text = ''.join(self.stream)

    def find(self, quote: str, after_line: int = 1, width: int = 30):
        """First line (>= after_line) where the quote starts, or None. The match is on the first `width` letters/digits."""
        needle = alnum(quote)[:width]
        if not needle:
            return None
        lo = bisect.bisect_left(self.at, after_line)
        if lo >= len(self.at):
            return None
        hit = self.text.find(needle, lo)
        return self.at[hit] if hit >= 0 else None


_LOCATORS = {}


def locator(path: Path, html: bool) -> Locator:
    key = (str(path), html)
    if key not in _LOCATORS:
        _LOCATORS[key] = Locator(path, html)
    return _LOCATORS[key]


def block_quote(b) -> str:
    """The text a block quotes (first piece is enough to find it)."""
    if b['t'] in ('p', 'h'):
        return b['text']
    if b['t'] in ('ul', 'ol'):
        return b['items'][0]
    if b['t'] == 'callout':
        return b['text'] or b.get('title') or ''
    if b['t'] == 'table':
        return ' '.join(b['rows'][0]) if b['rows'] else ''
    if b['t'] == 'kv':
        return b['rows'][0][1]
    return ''


def attach_lines(sections, path: Path, html: bool = True, allow_missing=()):
    """Adds `line` to every block (and section) in document order; raises if a quote is not in the file."""
    loc = locator(path, html)
    cursor = 1
    problems = []
    for s in sections:
        items = ([('heading', s)] if s.get('heading') else []) + [('block', b) for b in s['blocks']]
        for kind, it in items:
            if it.get('file'):          # content from another file: located separately by its builder
                continue
            q = it['heading'] if kind == 'heading' else block_quote(it)
            ln = loc.find(q, max(1, cursor - 6)) or loc.find(q, 1)
            if ln is None:
                if alnum(q) and q not in allow_missing:
                    problems.append(q[:60])
                continue
            if kind == 'heading':
                s['line'] = ln
            else:
                it['line'] = ln
            cursor = ln
    if problems:
        raise SystemExit('quote not found in %s: %s' % (path.name, problems[:6]))


KICKER_RE = re.compile(r'(chapter-badge|module-tag|mod-badge|phase-badge)', re.I)
CHROME_RE = re.compile(r'^(SYSTEM[: ]|⬇|SEC-\d+$|Swipe to|Initialize |MODULE SELECTION|Visualizing |Needs vs Wants Radar$|Emergency Fund \(6 Months\)$)')


def has_class(el: Tag, rx) -> bool:
    return bool(rx.search(' '.join(el.get('class') or [])))


class Walker:
    keep_hidden = False   # set by extract_page for pages whose hidden panels are part of the text (tab / reveal widgets)

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
            if not Walker.keep_hidden and (ch.get('hidden') is not None or 'hidden' in (ch.get('class') or []) and name != 'section'):
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
    if b['t'] in ('table', 'kv'):
        return ' '.join(' '.join(r) for r in b['rows'])
    return ''


def source_links(main):
    """Keep external references available to phone readers as safe, labelled web links."""
    out, seen = [], set()
    for a in main.select('a[href]'):
        url = (a.get('href') or '').strip()
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.netloc:
            continue
        label = clean(a.get_text(' ', strip=True))
        if not label or (label, url) in seen:
            continue
        seen.add((label, url))
        out.append({'label': label[:120], 'url': url})
    return out


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


def prepare_soup(soup, opts):
    """Per-page, text-neutral preparation: drop widget chrome by CSS selector, turn checkbox labels into list items."""
    for sel in opts.get('drop', []):
        for t in soup.select(sel):
            t.decompose()
    for sel in opts.get('drop_parents', []):
        for t in soup.select(sel):
            if t.parent is not None and t.parent.name not in ('body', 'main', 'html'):
                t.parent.decompose()
    for sel in opts.get('h1_to_p', []):
        for t in soup.select(sel):
            t.name = 'p'
    for sel in opts.get('unfooter', []):
        for t in soup.select(sel):
            t.name = 'div'
    for sel in opts.get('checklists', []):
        for box in soup.select(sel):
            for lab in box.find_all('label'):
                for inp in lab.find_all('input'):
                    inp.decompose()
                lab.name = 'li'
            box.name = 'ul'


def extract_page(pid, fname, category, order, tool, kind_override, opts=None):
    opts = opts or {}
    raw = (HTML / fname).read_text(encoding='utf-8')
    soup = BeautifulSoup(raw, 'html.parser')
    prepare_soup(soup, opts)
    Walker.keep_hidden = bool(opts.get('keep_hidden'))
    title_tag = soup.find('title')
    title = clean(title_tag.get_text()) if title_tag else pid
    title = re.sub(r'\s*\|\s*FIN[-•·]?OS\s*$', '', title).strip()
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    desc = clean(desc_tag['content']) if desc_tag and desc_tag.get('content') else ''
    main = ((soup.select_one(opts['main']) if opts.get('main') else None) or soup.find(class_='deep-content') or soup.find(class_='insight-content') or soup.find('main')
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
    attach_lines(sections, HTML / fname)
    entry['needsReview'] = bool(review_ids)
    entry['reviewReasons'] = review_ids
    sources = source_links(main)
    lesson = {'id': pid, 'title': title, 'summary': entry['summary'], 'category': category,
              'source': 'html/' + fname, 'sections': sections, 'tool': tool,
              'needsReview': entry['needsReview'], 'reviewReasons': review_ids}
    if sources:
        lesson['sources'] = sources
    return entry, lesson


# =====================================================================================================
# Second pass: mindset / behaviour lessons from the website, and honest stubs for every interactive page
# =====================================================================================================
# Decision for each page is made by reading it (docs/agent-notes/learn2.md has the table):
#   (a) text that reads as a lesson            -> extracted below with file + line provenance
#   (b) has a phone equivalent                 -> hub / related-tool stub that links to it
#   (c) interactive or service-dependent       -> stub that says so plainly (nothing is flattened into fake text)
#   (d) website only                           -> stub that says so
RUNNER = ROOT / 'mobile' / 'scripts' / 'learnWebRunner.mjs'
JSDIR = ROOT / 'js'


def lit_after(text: str, marker: str) -> str:
    """The JavaScript object/array literal that follows `marker` (string/comment aware bracket matching)."""
    i = text.index(marker) + len(marker)
    while text[i] not in '[{':
        i += 1
    start, depth, j, n = i, 0, i, len(text)
    while j < n:
        c = text[j]
        if c in '\'"`':
            q = c
            j += 1
            while text[j] != q:
                j += 2 if text[j] == '\\' else 1
        elif text.startswith('//', j):
            j = text.index('\n', j)
            continue
        elif text.startswith('/*', j):
            j = text.index('*/', j) + 1
        elif c in '[{':
            depth += 1
        elif c in ']}':
            depth -= 1
            if depth == 0:
                return text[start:j + 1]
        j += 1
    raise SystemExit('unbalanced literal after ' + marker)


def eval_literals(sources: dict) -> dict:
    """Evaluate JS literals with the website's own text, in a sandbox (mobile/scripts/learnWebRunner.mjs evalLiteral)."""
    job = {'literalSources': [{'id': k, 'src': v} for k, v in sources.items()]}
    r = subprocess.run(['node', str(RUNNER), '--job'], input=json.dumps(job), capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode != 0:
        raise SystemExit('learnWebRunner failed: ' + r.stderr[-400:])
    return json.loads(r.stdout)['literals']


class Src:
    """Finds the line of a quote inside one source file (markup stripped for .html when html=True)."""

    def __init__(self, path: Path, html: bool):
        self.path = path
        self.loc = locator(path, html)
        self.rel = str(path.relative_to(ROOT))

    def line(self, quote: str, after: int = 1) -> int:
        ln = self.loc.find(quote, after)
        if ln is None:
            raise SystemExit('quote not found in %s after line %d: %r' % (self.rel, after, quote[:70]))
        return ln


def blk(t, src: Src, quote, after=1, own_file=False, **kw):
    b = {'t': t, **kw}
    b['line'] = src.line(quote, after)
    if own_file:
        b['file'] = src.rel
    return b


def para_lines(raw: str) -> str:
    """A multi-line template literal: each line normalised, blank lines dropped."""
    out = []
    for ln in raw.split('\n'):
        t = clean(ln)
        if t:
            out.append(t)
    return '\n'.join(out)


FIGURE_RE = re.compile(r'[₹%]|\b\d{2,}\b|\b\d+(?:\.\d+)?\s?(?:L|Cr|lakh|crore|x)\b', re.I)

# Hypothetical people / amounts: shown with a neutral "illustration" label (not a fact-check flag).
# (page id, anchor regex on the block text, note)
ILLUSTRATIONS = [
    ('life-wealth', r'Toxic Boss|Comparing w/ Sharmaji|Deep Sleep|Evening Tea', 'The ratings and percentages are the page author\'s own illustration. They are not measurements of anything.'),
    ('impact-detail', r'Ravi earns|Ankit is 27|Rohit owns everything', 'A made-up person. Any amounts in this story are illustrations, not data.'),
    ('mindset-sim', r'Portfolio at this point', 'The portfolio sizes in these scenarios are hypothetical amounts chosen by the page, not anyone\'s record.'),
]


def apply_illustrations(pid, sections):
    for s in sections:
        for b in s['blocks']:
            txt = block_text(b) + ' ' + ' '.join(' '.join(r) for r in b.get('rows', []))
            for p, rx, note in ILLUSTRATIONS:
                if p == pid and re.search(rx, txt):
                    b['illustration'] = note


def flag_review(pid, sections):
    """Same flagging as extract_page: returns the review ids found, marking blocks (and section headings)."""
    ids, used = [], set()
    for s in sections:
        for b in s['blocks']:
            rs = review_reasons(pid, block_text(b) + ' ' + ' '.join(' '.join(r) for r in b.get('rows', [])), used)
            if rs:
                b['needsReview'] = True
                b['reviewReasons'] = rs
                ids += [r for r in rs if r not in ids]
        if review_reasons(pid, s['heading'], used):
            s['needsReview'] = True
    return ids


def lesson_words(sections):
    n = 0
    for s in sections:
        n += len(s['heading'].split())
        for b in s['blocks']:
            n += len(block_text(b).split())
            for r in b.get('rows', []):
                n += sum(len(c.split()) for c in r)
    return n


def finish_lesson(pid, title, summary, category, order, tool, source, sections, notes=(), not_shown=(), files=None, language=None, tool_label=None):
    """Common tail of the new lesson builders: review flags, illustration labels, counts, manifest entry + lesson."""
    review_ids = flag_review(pid, sections)
    apply_illustrations(pid, sections)
    words = lesson_words(sections)
    figures = any(FIGURE_RE.search(block_text(b) + ' ' + ' '.join(' '.join(r) for r in b.get('rows', []))) for s in sections for b in s['blocks'])
    entry = {'id': pid, 'title': title, 'category': category, 'order': order, 'kind': 'lesson', 'source': source, 'tool': tool,
             'hasInteractive': bool(not_shown), 'minutes': max(1, round(words / 200)), 'words': words, 'summary': summary,
             'needsReview': bool(review_ids), 'reviewReasons': review_ids}
    lesson = {'id': pid, 'title': title, 'summary': summary, 'category': category, 'source': source, 'tool': tool,
              'sections': sections, 'needsReview': bool(review_ids), 'reviewReasons': review_ids,
              'files': files or [source], 'notes': list(notes), 'notShown': list(not_shown), 'figures': figures}
    if language:
        lesson['language'] = language
    return entry, lesson


def title_of(soup):
    t = soup.find('title')
    return re.sub(r'\s*\|\s*FIN[-•·]?OS\s*$', '', clean(t.get_text())).strip() if t else ''


def meta_desc(soup):
    d = soup.find('meta', attrs={'name': 'description'})
    return (clean(d['content']) if d and d.get('content') else '', d.sourceline if d else None)


def not_shown(what, why, file, needle):
    """Something on the page that the phone does not show, with the place on the page where it is."""
    path = ROOT / file
    src = Src(path, html=False)
    return {'what': what, 'why': why, 'file': file, 'line': src.line(needle), 'quote': needle}


# --- mindset-sim: the scenario library (17 case studies held in the page's script) ---------------------------------------------
def build_mindset_sim():
    path = HTML / 'mindset-sim.html'
    text = path.read_text(encoding='utf-8')
    scen = eval_literals({'s': lit_after(text, 'const SCENARIOS = ')})['s']
    soup = BeautifulSoup(text, 'html.parser')
    labels = {}
    for b in soup.select('button.filter-btn'):
        m = re.search(r"filterScenarios\('(\w+)'", b.get('onclick') or '')
        if m and m.group(1) != 'all':
            labels[m.group(1)] = text_of(b)
    h1 = soup.find('h1')
    intro = text_of(h1.find_next('p'))
    desc, _ = meta_desc(soup)
    hsrc, jsrc = Src(path, True), Src(path, False)
    sections = [{'heading': '', 'blocks': [blk('p', hsrc, intro, after=h1.sourceline, text=intro)]}]
    order = []
    for sc in scen:
        if sc['cat'] not in order:
            order.append(sc['cat'])
    for cat in order:
        lab = labels[cat]
        sec = {'heading': lab, 'blocks': [], 'line': hsrc.line(lab, h1.sourceline)}
        for sc in [x for x in scen if x['cat'] == cat]:
            start = jsrc.line("id:'%s', cat" % sc['id'])
            at = lambda q: jsrc.line(q, start)
            sec['blocks'].append(blk('h', jsrc, sc['name'], start, level=3, text=sc['name']))
            sec['blocks'].append(blk('kv', jsrc, sc['year'], start, rows=[['Date on the page', sc['year']], ['Difficulty (stars on the page)', sc['diff']], ['Portfolio at this point (hypothetical)', sc['portfolio']]]))
            sec['blocks'].append(blk('p', jsrc, sc['desc'], start, label='Summary on the scenario card', text=sc['desc']))
            sec['blocks'].append(blk('p', jsrc, sc['narrative'], start, label='The situation', text=sc['narrative']))
            sec['blocks'].append(blk('ol', jsrc, sc['choices'][0], start, label='Options the page offers', items=list(sc['choices'])))
            sec['blocks'].append(blk('p', jsrc, sc['choices'][sc['bestChoice']], start, label='The page marks this option as best', text=sc['choices'][sc['bestChoice']]))
            sec['blocks'].append(blk('p', jsrc, sc['choices'][sc['worstChoice']], start, label='The page marks this option as worst', text=sc['choices'][sc['worstChoice']]))
            sec['blocks'].append(blk('p', jsrc, sc['held_outcome'], start, label='What the page says happened to those who held or took the best option', text=sc['held_outcome']))
            sec['blocks'].append(blk('p', jsrc, sc['sold_outcome'], start, label='What the page says happened to those who sold or took the worst option', text=sc['sold_outcome']))
            if sc.get('lesson'):
                sec['blocks'].append(blk('p', jsrc, sc['lesson'], start, label='Note added by the page', text=sc['lesson']))
            sec['blocks'].append(blk('ul', jsrc, sc['biases'][0], start, label='Biases the page names', items=[b.replace('_', ' ') for b in sc['biases']]))
        sections.append(sec)
    n = len(scen)
    notes = [
        'Everything on this page is in Hinglish (Hindi written in English letters), exactly as on the website.',
        'These are %d case studies from the website\'s Mindset Simulator. The portfolio sizes, outcomes and "best / worst" labels are the website author\'s own, written with hindsight, and the page gives no sources or dates for its figures.' % n,
    ]
    ns = [
        not_shown('Picking an option first, then seeing the outcome, with a score ("Optimal Decision", "Costly Mistake", "Acceptable").',
                  'The website hides the outcome until you choose and scores your choice. Here every scenario is plain reading.', 'html/mindset-sim.html', 'const perfScore'),
        not_shown('A short Hinglish debrief written by Arya (the website\'s AI) after you choose.',
                  'It needs the website\'s local AI service, which the phone does not use. The website falls back to the outcome text when that service is not running.', 'html/mindset-sim.html', 'Arya debrief likh rahi hai'),
        not_shown('A saved score for each scenario (the website keeps them in its finos_sim_scores key).',
                  'Nothing is scored here, so nothing is saved about how you would have chosen.', 'html/mindset-sim.html', 'finos_sim_scores'),
    ]
    return finish_lesson('mindset-sim', title_of(soup), desc, 'mindset', 5, None, 'html/mindset-sim.html', sections, notes, ns,
                         files=['html/mindset-sim.html'], language='hinglish')


# --- impact-detail: the eight five-step stories (held in js/impact-detail.js) -----------------------------------------------
def build_impact_detail():
    jpath = JSDIR / 'impact-detail.js'
    flows = eval_literals({'f': lit_after(jpath.read_text(encoding='utf-8'), 'const insightFlows = ')})['f']
    ipath = HTML / 'impact.html'
    isoup = BeautifulSoup(ipath.read_text(encoding='utf-8'), 'html.parser')
    hsrc, jsrc = Src(ipath, True), Src(jpath, False)
    dsoup = BeautifulSoup((HTML / 'impact-detail.html').read_text(encoding='utf-8'), 'html.parser')
    sections = []
    cards = isoup.select('.card.insight[data-impact]')
    for c in cards:
        key = c['data-impact']
        title, sub = text_of(c.find('h4')), text_of(c.find('small'))
        flow = flows[key]
        start = jsrc.line('"%s": {' % key)
        sec = {'heading': title, 'line': hsrc.line(title, c.sourceline - 1), 'blocks': [blk('p', hsrc, sub, c.sourceline - 1, own_file=True, text=sub)]}
        for step in sorted(flow, key=int):
            st = flow[step]
            body = para_lines(st['text'])
            b = {'t': 'callout', 'kind': 'note', 'title': st['title'], 'text': body, 'file': 'js/impact-detail.js'}
            b['line'] = jsrc.line(body.split('\n')[0], start)
            if clean(st['title']) and jsrc.line(st['title'], start) > b['line']:
                raise SystemExit('step title after its text in impact-detail.js')
            start = b['line']
            sec['blocks'].append(b)
        sections.append(sec)
    desc = 'Eight short five-step stories behind the cards on the Small Changes, Big Impact page: a very Indian beginning, time vs money, an analogy, a reality check and the real insight.'
    notes = [
        'Each story is short and is told through an everyday example. The people in them (Ravi, Ankit, Rohit) are made up.',
        'Rupee and percentage figures in these stories are statements from the website page. The page gives no source and no date for them.',
    ]
    ns = [
        not_shown('A "Show My Impact" box that turns your own monthly amount, years and return into a story written by Arya.',
                  'The story part needs the website\'s AI. The sum itself is the SIP calculator on this phone (it uses the same formula).', 'html/impact.html', 'aryaImpactStory()'),
    ]
    ent, les = finish_lesson('impact-detail', 'Impact stories', desc, 'mindset', 8, '/tools/calc/sip', 'html/impact-detail.html', sections, notes, ns,
                             files=['html/impact.html', 'js/impact-detail.js'])
    return ent, les


# --- life-wealth: DOM text plus the five "what money can buy / cannot buy" pairs held in the page's script ------------------
def build_life_wealth(dom_entry, dom_lesson):
    path = HTML / 'life-wealth.html'
    text = path.read_text(encoding='utf-8')
    sc = eval_literals({'s': lit_after(text, 'const scenarios = ')})['s']
    soup = BeautifulSoup(text, 'html.parser')
    labels = {}
    for d in soup.select('.scenario-btn'):
        m = re.search(r"loadScenario\('(\w+)'", d.get('onclick') or '')
        if m:
            labels[m.group(1)] = (text_of(d), d.sourceline)
    jsrc, hsrc = Src(path, False), Src(path, True)
    new = []
    for key, (lab, ln) in labels.items():
        v = sc[key]
        start = jsrc.line('const scenarios = ')
        blocks = [
            blk('ul', jsrc, v['left']['items'][0], start, label='What money can buy: ' + v['left']['title'], items=list(v['left']['items'])),
            blk('p', jsrc, v['right']['text'], start, label='What it cannot buy: ' + v['right']['title'], text=v['right']['text']),
            blk('p', jsrc, v['right']['quote'], start, label='The page\'s one-line summary', text=v['right']['quote']),
        ]
        new.append({'heading': lab, 'line': hsrc.line(lab, ln - 1), 'blocks': blocks})
    secs = dom_lesson['sections']
    # the page's first block (title strip) stays first; the five pairs come next, then the rest of the page
    secs[1:1] = new
    ns = [
        not_shown('A radar chart comparing "The Trap (Typical)" with "True Wealth (Goal)" on five dimensions.',
                  'Its scores are fixed numbers written into the page script, not measurements of anyone, so they are not shown.', 'html/life-wealth.html', 'The Trap (Typical)'),
        not_shown('An animation, "Run the Race", in which the finish line moves away.', 'It is a visual; its one-line message is kept above.', 'html/life-wealth.html', 'function runRace'),
    ]
    notes = ['This lesson is about how to think about money, not a calculation. There is nothing to act on or to check against a rule.']
    return finish_lesson('life-wealth', dom_lesson['title'], dom_lesson['summary'], 'mindset', 6, '/plan/lifegoals', 'html/life-wealth.html', secs, notes, ns,
                         files=['html/life-wealth.html'])




# --- DOM lessons read with the generic walker plus per-page, text-neutral options ------------------------------------------
NEW_DOM_PAGES = [
    # id, file, category, order, tool, opts
    ('decision', 'decision.html', 'mindset', 3, None, dict(
        keep_hidden=True, checklists=['.checklist'], unfooter=['.final-message'],
        drop=['.status-indicator', '.brain-container', '.section-badge', '.bug-icon', 'canvas', '.tool-visual', 'button', '.next-module-btn'],
        drop_parents=['a[href="hedgefund.html"]'])),
    ('clarity', 'clarity.html', 'mindset', 4, '/tracker/networth', dict(
        keep_hidden=True, unfooter=['.final-message'],
        drop=['.scanner-section', '.section-badge', '.step-status', '.step-icon', '.status-light', '.next-module-btn', '.flow-pipe', 'button'],
        drop_parents=['.time-machine'])),
    ('life-wealth', 'life-wealth.html', 'mindset', 6, '/plan/lifegoals', dict(
        keep_hidden=True, unfooter=['.final-message', 'footer'], h1_to_p=['.soul-title'],
        drop=['.duality-wrapper', '.section-badge', '.t-age', '.time-marker', '.flip-front p', '.timeline-track', '.orb-container', 'canvas', 'button'],
        drop_parents=['a[href="life-goals-planner.html"]'])),
]

NEW_DOM_EXTRA = {
    'decision': dict(
        notes=['Outcomes such as "Result: Permanent Loss" are the page\'s way of making a point; real outcomes depend on the situation.'],
        ns=[('A doughnut chart for "Probability Thinking" (Success / Failure / Neutral).', 'Its slices are fixed example numbers in the page script (js/decision.js), not a measurement, so they are not shown.', 'js/decision.js', 'data: [20, 50, 30]'),
            ('A link to another website page: "Active trader? See the trading-desk version, with a live bias detector".', 'That page is not on the phone.', 'html/decision.html', 'hedgefund.html')]),
    'clarity': dict(
        notes=['The website\'s order-of-operations list marks Step 1 "DONE" and Step 2 "CURRENT" for everyone. That is the page\'s example, not your progress, so those labels are left out.'],
        ns=[('A strip at the top that says NET WORTH "CALCULATING..." and DEBT LOAD "SCANNING...", then "DETECTED" and "ANALYZED" two seconds later.',
             'It never shows a net worth or debt figure: js/clarity.js only swaps the words after a timer. Your real figures are in the Net worth tracker, linked below.', 'js/clarity.js', 'DETECTED'),
            ('The "EMI Time Machine" slider ("Future Wealth Lost", 12% over 10 years).',
             'The page does not compound the money: it multiplies the EMI by 120 and then by 1.8, a rough rule. For an EMI of Rs 10,000 it shows Rs 21.6 lakh, whereas Rs 10,000 a month for 10 years at 12% (SIP formula) comes to about Rs 23.2 lakh. The phone has the real calculators (SIP, Opportunity Cost), so the rough slider is not copied.', 'js/clarity.js', 'Rough multiplier')]),
}


def dom_lesson(pid, fname, cat, order, tool, opts):
    entry, lesson = extract_page(pid, fname, cat, order, tool, None, opts)
    return lesson


def build_new_lessons():
    out = []
    ent, les = build_mindset_sim()
    out.append((ent, les))
    out.append(build_impact_detail())
    for pid, fname, cat, order, tool, opts in NEW_DOM_PAGES:
        base = dom_lesson(pid, fname, cat, order, tool, opts)
        if pid == 'life-wealth':
            out.append(build_life_wealth(None, base))
            continue
        ex = NEW_DOM_EXTRA[pid]
        ns = [not_shown(*a) for a in ex['ns']]
        out.append(finish_lesson(pid, base['title'], base['summary'], cat, order, tool, 'html/' + fname, base['sections'], ex['notes'], ns,
                                 files=['html/' + fname]))
    return out


# =====================================================================================================
# Stubs: every interactive / menu / redirect page gets an honest page of its own
# =====================================================================================================
def T_lesson(lid, match='same', note=''):
    return {'type': 'lesson', 'id': lid, 'match': match, 'note': note}


def T_route(route, label, match='same', note=''):
    return {'type': 'route', 'route': route, 'label': label, 'match': match, 'note': note}


def T_none(note=''):
    return {'type': 'none', 'match': 'none', 'note': note}


# match: same = the phone has this; close = the phone has something that does a similar job with its own inputs;
#        note = the phone only has a page that explains what the website page is; none = nothing on the phone.
PAGE_PHONE = {
    'finance101.html': T_lesson('finance101'), 'principles.html': T_lesson('principles'), 'learn-insurance.html': T_lesson('insurance'),
    'markets.html': T_route('/markets', 'Markets'),
    'tax.html': T_route('/tools/taxplanner', 'Tax planner', 'close', 'The website page is a tax lesson and tool; the phone has the planner.'),
    'life-goals-planner.html': T_route('/plan/lifegoals', 'Life goals planner'),
    'life-wealth.html': T_lesson('life-wealth'), 'mindset-sim.html': T_lesson('mindset-sim'),
    'trader-roadmap.html': T_lesson('trader-roadmap', 'note'), 'fear-roadmap.html': T_lesson('fear-roadmap', 'note'),
    'traditional-roadmap.html': T_lesson('traditional-roadmap', 'note'), 'trading-simulator.html': T_lesson('trading-simulator', 'note'),
    'trading-coach.html': T_lesson('trading-coach', 'note'), 'trading-brain.html': T_lesson('trading-brain', 'note'),
    'investor-mindset.html': T_lesson('investor-mindset', 'note'), 'investor-profile.html': T_lesson('investor-profile', 'note'),
    'know-your-finances.html': T_lesson('know-your-finances', 'note'), 'financial-being.html': T_lesson('financial-being', 'note'),
    'simulator-guide.html': T_none('Website only: the manual for the website\'s trading simulator.'),
    'dna.html': T_route('/tools/dna', 'Financial DNA'),
    'benchmarking.html': T_route('/plan/benchmark', 'Benchmarks'),
    'system-leak.html': T_route('/tools/leak', 'Future loss', 'close', 'The phone has the "what the leak would have become" part, and a Subscriptions tracker.'),
}

SCENARIO_PHONE = {
    'job_loss': T_route('/tracker/emergency', 'Emergency fund', 'close'),
    'house_purchase': T_route('/tools/realestate', 'Real estate', 'close'),
    'market_crash': T_none('No phone tool runs a market fall on your holdings.'),
    'sip_delay': T_route('/tools/calc/sip', 'SIP calculator', 'close', 'Work it out twice, with the two periods, to compare.'),
    'fire_shift': T_route('/tools/retirement', 'Retirement planner', 'close'),
    'extra_payment': T_route('/tools/homeloan', 'Home loan', 'close'),
    'time_machine': T_none('The page uses historical FD, Nifty and gold series held on the website side; the phone has no such comparison.'),
    'monte_carlo': T_route('/tools/retirement', 'Retirement planner', 'close', 'The retirement planner runs a seeded Monte Carlo on the figures you enter.'),
    'generational': T_none(),
}


def hub_entry(src: Src, soup_el, title_el, text_el, href=None, extra_el=None, target=None, key=None):
    title, text = text_of(title_el), (text_of(text_el) if text_el is not None else '')
    e = {'title': title, 'text': text, 'line': src.line(title, max(1, soup_el.sourceline - 2))}
    if extra_el is not None:
        e['extra'] = text_of(extra_el)
    if href:
        e['href'] = href
    if key:
        e['key'] = key
    e['target'] = target or PAGE_PHONE.get(href or '', T_none())
    return e


def hub_foundations(soup, src):
    out = []
    for a in soup.select('a.portal-card'):
        out.append(hub_entry(src, a, a.find('h2'), a.find('p'), a['href']))
    sec = soup.select_one('.next-phase-section')
    out.insert(3, hub_entry(src, sec, sec.find('h2'), sec.select_one('.hero-sub'), sec.select_one('a.market-btn')['href']))
    return out


def hub_roadmap(soup, src):
    out = []
    for a in soup.select('a.rm-path-card'):
        href = a['href'] if a['href'].endswith('.html') else None
        t = None
        if href is None:
            t = T_none('The "Investor GPS" path is built inside the roadmap page by a website script from the profile stored there. The phone has no such screen.')
        out.append(hub_entry(src, a, a.select_one('.rm-path-head'), a.select_one('.rm-path-desc'), href, a.select_one('.rm-path-desi'), t))
    return out


def hub_simulator_landing(soup, src):
    out = []
    for a in soup.select('.cards .card'):
        href = a.get('href')
        t = None
        if a.get('id') == 'dnaCard':
            t = T_none('The "behavioral fingerprint" is built from sessions in the website\'s trading simulator. The phone has no simulator, so there is nothing to build it from.')
        out.append(hub_entry(src, a, a.select_one('.card-title'), a.select_one('.card-desc'), href, None, t))
    return out


def hub_diagnostics(soup, src):
    out = []
    for a in soup.select('a.portal-card'):
        out.append(hub_entry(src, a, a.find('h2'), a.find('p'), a['href']))
    for a in soup.select('section a[href$=".html"]'):
        if 'portal-card' in (a.get('class') or []):
            continue
        divs = a.find_all('div', recursive=False)
        out.append(hub_entry(src, a, divs[1], divs[2], a['href']))
    return out


def hub_scenarios():
    jpath = JSDIR / 'arya-scenarios.js'
    text = jpath.read_text(encoding='utf-8')
    src = Src(jpath, False)
    out = []
    for m in re.finditer(r"id: '(\w+)', icon: '[^']*',\s*\n\s*title: '((?:\\'|[^'])+)',\s*\n\s*subtitle: '((?:\\'|[^'])+)'", text):
        sid, title, sub = (g.replace("\\'", "'") for g in m.groups())
        ln = text.count('\n', 0, m.start()) + 1
        out.append({'title': title, 'text': sub, 'line': src.line(title, ln), 'key': sid, 'file': 'js/arya-scenarios.js', 'target': SCENARIO_PHONE[sid]})
    if len(out) != len(SCENARIO_PHONE):
        raise SystemExit('arya-scenarios.js scenario list changed: %s' % [o['key'] for o in out])
    return out


def hub_impact(soup, src):
    out = []
    box = soup.select_one('#arya-impact-calc')
    head = box.find(string=re.compile('COMPOUND IMPACT STORY')).parent
    out.append(hub_entry(src, head, head, head.find_next_sibling('div'), None, None,
                         T_route('/tools/calc/sip', 'SIP calculator', 'same', 'Same sum as the page (monthly amount, years, return; instalments at the start of each month). The page\'s written "story" is made by the website\'s AI and is not on the phone.')))
    for c in soup.select('.card.insight[data-impact]'):
        out.append(hub_entry(src, c, c.find('h4'), c.find('small'), None, None, T_lesson('impact-detail', 'same', 'The story behind this card is in Impact stories.'), key=c['data-impact']))
    return out


HUBS = {'foundations': hub_foundations, 'roadmap': hub_roadmap, 'simulator-landing': hub_simulator_landing,
        'diagnostics': hub_diagnostics, 'impact': hub_impact, 'scenarios': None}

SIMP = 'The phone has no equivalent quiz.'
STUB_SPECS = [
    # id, category, order, status, tool(label), why, about, notCarried
    dict(id='foundations', cat='foundations', order=0, status='hub',
         why='A menu page: five cards that open other pages. Each card is listed below with what the phone has for it. "PHASE 02 UNLOCKED" on the page is a fixed label, not your progress.',
         about=['meta', ('h1next',)]),
    dict(id='simulator-landing', cat='website', order=1, status='hub',
         why='A menu page for the simulators and mind-training pages. The scrolling strip at its top shows fixed index and share prices typed into the page (for example Nifty 50 24,213) and a default "calm win rate" of 74% when no session exists; none of it is live or recorded, so it is not shown. Each card is listed below with what the phone has for it.',
         about=['meta'], nc=[('A scrolling ticker with fixed prices ("NIFTY 50 24,213", "RELIANCE 2,847") and a default "CALM WIN RATE" of 74%.', 'They are typed into the page, not live data or anyone\'s record.', 'html/simulator-landing.html', 'NIFTY 50 <strong class="up">▲ 24,213')]),
    dict(id='roadmap', cat='website', order=2, status='hub',
         why='On the website this page builds a roadmap, a mind map and a "life journey" from the profile and numbers stored there, and recommends a path. None of that is on the phone. Its "All Paths" tab is a menu of seven paths; they are listed below with what exists on the phone.',
         about=['meta', ('sel', 'h1.rm-page-title')], tool='/tools/score', tool_label='Money Score (ranked next moves, the nearest thing)'),
    dict(id='diagnostics', cat='website', order=3, status='hub',
         why='A menu page for the website\'s two big scans (Financial X-Ray, Financial Being) and four smaller tools. It also has an "Arya diagnostic intel" line written by the website\'s AI, which is not shown. Not to be confused with the phone\'s own Diagnostics screen in Settings, which is about crash notes.',
         about=['meta', ('h1next',)]),
    dict(id='scenarios', cat='website', order=4, status='hub',
         why='On the website nine what-if simulations run on the numbers stored there, and Arya (the website\'s AI) narrates the result. The simulations and the narration are not on the phone. For each scenario the phone has a tool that does a similar job with its own inputs; these are close, not the same.',
         about=[('h1next',)]),
    dict(id='impact', cat='mindset', order=7, status='hub', tool='/tools/calc/sip', tool_label='SIP calculator',
         why='A menu page: a compound-growth box and eight cards that open short stories. The phone has the same sum in the SIP calculator and the stories in Impact stories. (The page\'s own description says "ESG and social impact investing"; it does not match the page.)',
         about=['meta', ('sel', '.header p, header p')]),
    dict(id='timeline', cat='website', order=10, status='no-equivalent', tool='/tools/score', tool_label='Money Score',
         why='On the website this page draws a 90-day line of your Health Score from the website\'s alert service. When it cannot reach that service (it only tries when the page is opened from a developer\'s own computer) it draws generated sample scores and sample milestones under a "Demo mode" banner. The phone does not make up a history. The nearest real thing on the phone is the Money Score, which keeps its own history of the scores it has worked out.',
         about=['meta', ('sel', '.tl-hero p')],
         nc=[('Generated sample scores for the last 90 days (about 52 rising to 71) and milestones built from them.', 'The page invents them whenever it cannot get real history.', 'html/timeline.html', 'function generateDemoData')]),
    dict(id='fear-roadmap', cat='website', order=11, status='no-equivalent',
         why='A three-question quiz. Your answers pick one of several written diagnoses and a step list. The page calls itself "one of three persona paths from your Roadmap quiz": the text is written for the answers you pick, not as a lesson for everyone, so it is not copied here. ' + SIMP,
         about=['meta', ('sel_all', '.q-text')],
         nc=[('A step that tells the reader to buy one share of an ETF for about Rs 250 and to set up a Rs 500 SIP.', 'Specific amounts offered as a prescription to people who gave certain answers; not general lesson text.', 'html/fear-roadmap.html', 'Buy 1 share of an ETF')]),
    dict(id='trader-roadmap', cat='website', order=12, status='no-equivalent',
         why='A six-question quiz about a trader\'s income, capital, mood, time, process and goal. The answers pick one of five "personas" and a five-step plan. The text is written for those answers (for one of them it says to close all trading accounts and withdraw the money), so it is not general lesson text and is not copied here. ' + SIMP,
         about=['meta', ('sel_all', '.q-title')],
         nc=[('A persona, "THE HOSTAGE", that says "Close all active trading accounts. Withdraw remaining funds immediately."', 'A strong instruction chosen by a few answers; it is not advice for everyone.', 'html/trader-roadmap.html', 'Close all active trading accounts')]),
    dict(id='traditional-roadmap', cat='website', order=13, status='no-equivalent',
         why='A two-question quiz (where most of your wealth is; what you fear most). Your answers pick one of three personas and a step list. Parts of the step list are out of date, so it is not copied: it says debt funds held long are more tax-efficient than FDs, which no longer holds for units bought on or after 1 April 2023 (gains are taxed at your slab rate), and it uses 6% inflation. ' + SIMP,
         about=['meta', ('sel_all', '.q-text')],
         nc=[('"Debt Funds give similar safety but better tax efficiency if held long term."', 'Out of date for units bought on or after 1 April 2023; see the debt lesson review.', 'html/traditional-roadmap.html', 'better tax efficiency if held long term'),
             ('A bar showing Rs 10 lakh losing value to Rs 6 lakh over 10 years "@ 6% Inflation".', 'A fixed illustration; 6% for 10 years would leave about Rs 5.6 lakh, and 6% is the out-of-date inflation figure flagged in the Finance 101 review.', 'html/traditional-roadmap.html', 'TODAY: ₹10 Lakhs')]),
    dict(id='investor-mindset', cat='mindset', order=1, status='related-tool', tool='/tools/dna', tool_label='Financial DNA',
         why='An animated guide with selectors for time horizon, risk and goal, ten investor "nodes" and demonstration panels (a "Decision Engine" verdict, a "blow-up simulator", a "momentum scanner"). The panels show example numbers typed into the page, not your data or real market readings (the page itself labels one block "Simulated sector momentum scores"), so they are not copied. The closest phone tool is Financial DNA, which is a different thing: a nine-question quiz about how you think about money.',
         about=['meta'],
         nc=[('A "Simulated sector momentum scores" panel and a narrative tracker that marks sectors HOT or AVOID.', 'Example values written into the page; not market readings.', 'html/investor-mindset.html', 'Simulated sector momentum scores'),
             ('A claim that "revenge trading drops 73%" when users see capital decline.', 'No source is given.', 'html/investor-mindset.html', 'revenge trading drops 73%')]),
    dict(id='investor-profile', cat='mindset', order=2, status='related-tool', tool='/tools/dna', tool_label='Financial DNA',
         why='Ten long profiles of famous investors (held in the page\'s script), each with an animated diagram, a sandbox of canned replies shown under an "AI Response Matrix" heading, and an "Indian market translation" that names Indian companies the investor would supposedly buy. That translation is the page author\'s imagination, not a record of anyone\'s holdings, so none of it is copied as lesson text. The closest phone tool is Financial DNA.',
         about=['meta', ('sel', 'h1.text-6xl, h1.text-8xl')],
         nc=[('"Buffett in India is NOT buying flashy startups. He is buying HDFC Bank, Asian Paints, Nestle India."', 'An imagined translation presented in the present tense; not a statement of anyone\'s holdings.', 'js/investor-profile.js', 'Buffett in India is NOT buying flashy startups')]),
    dict(id='trading-simulator', cat='website', order=14, status='website-only',
         why='A practice trading screen with a candle chart that replays pre-built days ("Opening Breakout", "Market Crash" and so on) with virtual money. The candles are generated for the exercise, the screen is built for a wide desktop layout, and the phone has no trading features. It is website only.',
         about=['meta'],
         nc=[('Price candles for each scenario.', 'They are generated by the page (generateCandles uses random numbers), so they are not market history.', 'js/trading-simulator.js', 'function generateCandles')]),
    dict(id='trading-coach', cat='website', order=15, status='no-equivalent',
         why='Three questions (last trade, mood, trades today) that give a "clearance" score, then a short assessment written by Arya (the website\'s AI service, with a fixed fallback text). The score part is simple arithmetic but it is built for traders and the phone has no trading features, and the assessment needs the website\'s AI service, which the phone does not use. ' + SIMP,
         about=['meta', ('sel', '.hero p, header p')]),
    dict(id='trading-brain', cat='website', order=16, status='no-equivalent',
         why='"Trady" is a trading workbench: live market signals fetched from data services, a pattern encyclopedia, a strategy library and a setup builder. The signals need those live services, and the pattern tables quote "win rates" from a "5Y backtest" without saying how they were made, so they are not copied. ' + SIMP,
         about=['meta'],
         nc=[('A table headed "NSE PATTERN WIN RATES (5Y BACKTEST)" and tags such as "% WIN RATE NSE".', 'No method, data source or date is given for these rates.', 'html/trading-brain.html', 'NSE PATTERN WIN RATES (5Y BACKTEST)')]),
    dict(id='know-your-finances', cat='website', order=17, status='no-equivalent',
         why='The "Financial X-Ray": you type in many figures over six steps and a scan (with a chat box that uses the website\'s AI, called QFT on the page) works out cashflow, ratios, net worth and a FIRE horizon. The phone has no single equivalent; its closest parts are the Net worth tracker, the Money Score and the Retirement planner, which use what you have recorded instead of a long form.',
         about=['meta', ('sel', 'p.sr-only, h1.sr-only')], tool='/tracker/networth', tool_label='Net worth tracker'),
    dict(id='financial-being', cat='website', order=18, status='no-equivalent',
         why='A long self-assessment ("calibrate the mirror") that ends in an archetype, fifteen report sections and an AI report from the website\'s local AI service. The report and the chat need that service. The phone has a shorter, different quiz, Financial DNA.',
         about=['meta', ('sel', 'p')], tool='/tools/dna', tool_label='Financial DNA (a different, shorter quiz)'),
    dict(id='mindset-sim-hub', cat='website', order=30, status='redirect', why='On the website this address only forwards you to the Simulator Hub.', about=[('sel', 'body p')]),
    dict(id='train-mindset', cat='website', order=31, status='redirect', why='On the website this address only forwards you to the Simulator Hub.', about=[('sel', 'body p')]),
    dict(id='not-money', cat='website', order=32, status='redirect', why='On the website this address only forwards you to the AI Mindset Simulator.', about=[('sel', 'body p')]),
    dict(id='roadmaps', cat='website', order=33, status='redirect', why='On the website this address only forwards you to the Roadmap page.', about=[('sel', 'body p')]),
    dict(id='simulator', cat='website', order=34, status='redirect', why='On the website this address only forwards you to the Trading Simulator.', about=[('sel', 'body p')]),
]


def build_stub(spec):
    pid = spec['id']
    path = HTML / (pid + '.html')
    raw = path.read_text(encoding='utf-8')
    soup = BeautifulSoup(raw, 'html.parser')
    hsrc, rsrc = Src(path, True), Src(path, False)
    title = title_of(soup)
    desc, dline = meta_desc(soup)
    about = []
    for a in spec.get('about', []):
        if a == 'meta':
            if desc:
                about.append({'text': desc, 'line': rsrc.line(desc)})
            continue
        kind = a[0]
        if kind == 'h1next':
            h1 = soup.find('h1')
            els = [h1.find_next('p')]
        elif kind == 'sel':
            els = soup.select(a[1])[:1]
        else:
            els = soup.select(a[1])
        for el in els:
            t = text_of(el)
            if t:
                about.append({'text': t, 'line': hsrc.line(t, max(1, el.sourceline - 1))})
    redirect = None
    m = re.search(r'url=([\w-]+)\.html', raw)
    if spec['status'] == 'redirect':
        redirect = m.group(1)
    stub = {'status': spec['status'], 'why': spec['why'], 'about': about}
    if redirect:
        stub['redirectTo'] = redirect
        stub['redirectLine'] = rsrc.line('url=%s.html' % redirect)
    if pid in HUBS:
        ents = hub_scenarios() if pid == 'scenarios' else HUBS[pid](soup, hsrc)
        stub['entries'] = ents
    if spec.get('nc'):
        stub['notCarried'] = [not_shown(*x) for x in spec['nc']]
    if spec.get('tool_label'):
        stub['toolLabel'] = spec['tool_label']
    summary = desc or (about[0]['text'] if about else '')
    entry = {'id': pid, 'title': title, 'category': spec['cat'], 'order': spec['order'], 'kind': 'interactive', 'source': 'html/%s.html' % pid,
             'tool': spec.get('tool'), 'hasInteractive': True, 'minutes': 0, 'words': 0, 'summary': summary, 'status': spec['status'], 'stub': stub}
    return entry


def build():
    files = {}
    manifest = {'version': 1, 'categories': [{'id': c, 'title': t} for c, t in CATEGORIES],
                'excluded': EXCLUDED, 'lessons': []}
    for pid, fname, cat, order, tool, kind in PAGES:
        entry, lesson = extract_page(pid, fname, cat, order, tool, kind)
        manifest['lessons'].append(entry)
        if lesson:
            files[f'{pid}.json'] = lesson
    for entry, lesson in build_new_lessons():
        manifest['lessons'].append(entry)
        files[f"{entry['id']}.json"] = lesson
    for spec in STUB_SPECS:
        manifest['lessons'].append(build_stub(spec))
    # keep the order the search index already mirrors (__tests__/search.test.mts): the first-pass pages in their old order, new pages after
    OLD = ['finance101', 'principles', 'foundations', 'equity', 'mutual_funds', 'etf', 'debt', 'money_market', 'commodity', 'crypto', 'forex', 'fno',
           'fundamental', 'technical', 'indicators', 'metrics', 'analysis', 'insurance', 'insight-sip', 'insight-emi', 'insight-debt', 'insight-inflation',
           'insight-rbi', 'investor-mindset', 'investor-profile']
    pos = {e['id']: i for i, e in enumerate(manifest['lessons'])}
    manifest['lessons'].sort(key=lambda e: OLD.index(e['id']) if e['id'] in OLD else 1000 + pos[e['id']])
    ids = {e['id'] for e in manifest['lessons']}
    for e in manifest['lessons']:
        st = e.get('stub') or {}
        if st.get('redirectTo') and st['redirectTo'] not in ids:
            raise SystemExit('%s redirects to %s which has no page here' % (e['id'], st['redirectTo']))
        for en in st.get('entries', []):
            t = en['target']
            if t['type'] == 'lesson' and t['id'] not in ids:
                raise SystemExit('%s entry points at unknown lesson %s' % (e['id'], t['id']))
    missing = [r[0] for r in REVIEW_ITEMS if r[0] not in QUOTES]
    if missing:
        raise SystemExit('review anchors that matched nothing (page text changed?): %s' % missing)
    files['review.json'] = {'version': 1, 'items': [
        {'id': r[0], 'lesson': r[1], 'quote': QUOTES[r[0]][:300], 'why': r[3], 'current': r[4], 'confidence': r[5]}
        for r in REVIEW_ITEMS]}
    files['manifest.json'] = manifest
    return files


def review_markdown():
    lines = ['# Learn content review status', '',
             'Generated by `mobile/scripts/extract-learn.py` from its REVIEW_ITEMS table; do not edit by hand.',
             'The app currently has no active fact-check flags. Previously flagged statements were corrected, removed, or reframed in the source lessons.',
             'This empty queue is not a substitute for periodic review. Product terms, market rules, and tax law change; use the dated official references in a lesson and check current product documents before acting.',
             '', '| # | Lesson | Quote on the page | Why it needs review | Current source / fact | Confidence |',
             '|---|---|---|---|---|---|']
    for i, r in enumerate(REVIEW_ITEMS, 1):
        q = QUOTES[r[0]][:200].replace('|', '/')
        lines.append('| %d | %s | %s | %s | %s | %s |' % (i, r[1], q, r[3].replace('|', '/'), r[4].replace('|', '/'), r[5]))
    lines += ['', '## Scope', '',
              '- Lessons explain concepts and risks; they are not a complete statement of tax, legal, or product rules.',
              '- Specific tax rates and eligibility conditions are intentionally kept out of evergreen lesson copy. Verify current rules with the relevant authority and a qualified professional when needed.',
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
