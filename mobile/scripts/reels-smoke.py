#!/usr/bin/env python3
"""Smoke test for every Money Reels screen, in English and Hindi, in the Expo web preview.

    npx expo start --web --port 8082                         # in mobile/  (a FRESH server: a stale one serves the 404 page for new routes)
    python3 mobile/scripts/reels-smoke.py                    # everything: routes, then the flows that tap through the product
    python3 mobile/scripts/reels-smoke.py --routes           # only the screens that need no interaction (fast, about a minute)
    python3 mobile/scripts/reels-smoke.py --large            # one more pass of the routes at 320 px wide and 2x text
    python3 mobile/scripts/reels-smoke.py --lang hi          # one language
    BASE=http://localhost:8083 SITE=http://localhost:4200 python3 mobile/scripts/reels-smoke.py

What it needs: python3 with playwright and a Chromium (pip install playwright && playwright install chromium); the phone app's web preview
(BASE, default http://localhost:8082); for html/reels.html a static server on the repository root (SITE, default http://localhost:4200,
e.g. `python3 -m http.server 4200` in the repository root). Without SITE the web page is SKIPPED, not failed. Arya needs its backend: the
Arya chip check is SKIPPED when Arya does not answer within 45 s.

Each screen is opened in each language at VIEW_W x VIEW_H (default 375 x 812) and checked for the things a person notices:
  loads        not the "Unmatched Route" page, has text, shows no NaN / undefined / [object Object]
  console      no console error or warning (the harmless web-only ones are counted and named, not failed; see KNOWN_WEB_WARNINGS)
  hscroll      the page is not wider than the screen, and no text or control sticks out of the right edge
  clipping     no text cut off by an overflow:hidden parent or a numberOfLines that drops words
  targets      every tappable control is at least 44 x 44 CSS px (AUDIT_JS from layout-audit.py, which it reuses)
  overlap      no two pieces of text paint over each other
  keys         no raw translation key or unfilled {param} on screen
  hindi        in Hindi: no visible English words and no English accessible names, except product terms (HINDI_OK)
  back/entry   Back / close returns to where the screen was opened from, and the screen opens from its documented entry
The layout numbers (page width, smallest control, counts) are printed with every PASS / FAIL. Exit code 1 when anything FAILs.
Screenshots of failing screens go to $SMOKE_SHOTS (default /tmp/reels-smoke) with the offending boxes outlined; results.json and a
markdown table are written there too.
"""
import importlib.util
import json
import os
import re
import sys
import time

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:  # pragma: no cover
    print('reels-smoke needs Playwright for Python and a Chromium:\n    pip install playwright\n    playwright install chromium\n'
          'then start the phone app\'s web preview (npx expo start --web --port 8082, in mobile/) and run this again.')
    sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


la = _load('layout_audit', 'layout-audit.py')          # AUDIT_JS, SCALE_JS, OUTLINE_CSS: the same numbers as the layout audit
smoke = _load('smoke_routes', 'smoke-routes.py')       # UNMATCHED, BAD_TEXT, NOISE: the same notion of "a real screen"

BASE = os.environ.get('BASE', 'http://localhost:8082').rstrip('/')
SITE = os.environ.get('SITE', 'http://localhost:4200').rstrip('/')
SHOTS = os.environ.get('SMOKE_SHOTS', '/tmp/reels-smoke')
VIEW_W = int(os.environ.get('VIEW_W', '375'))
VIEW_H = int(os.environ.get('VIEW_H', '812'))
TEXT_SCALE = float(os.environ.get('TEXT_SCALE', '1'))
MIN_TARGET = 44
QUICK = os.environ.get('QUICK') == '1'

# Warnings the web build always prints (react-native-web / expo-router on the web, not the product): counted, named, never failed.
KNOWN_WEB_WARNINGS = [
    (re.compile(r'"shadow\*" style props are deprecated|"textShadow\*" style props are deprecated', re.I), 'RN-web: shadow* style props deprecated'),
    (re.compile(r'props\.pointerEvents is deprecated', re.I), 'RN-web: props.pointerEvents deprecated'),
    (re.compile(r'useNativeDriver.*(not supported|native animated module is missing)', re.I), 'RN-web: useNativeDriver not supported'),
    (re.compile(r'iframe which has both allow-scripts and allow-same-origin', re.I), 'site-wide voice widget iframe (js/finos-widget.js), not the reels page'),
    (re.compile(r'Download the React DevTools|\[Violation\]|Layout was forced', re.I), 'browser/devtools hint'),
    (re.compile(r'expo-notifications.*(not (yet )?(fully )?supported|web)|Push notifications.*web|not available on web', re.I), 'expo-notifications on web'),
    (re.compile(r'expo-speech|speechSynthesis', re.I), 'expo-speech on web'),
]
# Words that stay in English in Hindi mode: product names, instruments and the abbreviations people use in Hindi too.
HINDI_OK = set('''FIN OS Arya Mitra EMI SIP SIPs UPI ELSS PPF EPF EPFO NPS KYC GST TDS PAN ITR RBI SEBI NAV FD RD AI OTP ETF IPO HRA LTCG STCG CIBIL
ULIP BNPL CVV NSC SCSS SGB VPF CTC PDF SMS ATM NSE BSE Nifty Sensex Rishi Lekha CAGR XIRR LIC SBI HDFC ICICI QR APY ECS NACH AMC TER ASBA NFO
FOMO DD IT FY AY MF FIRE TV EV Learn Aarav Meera Imran Kavya Rohan Devika Riya Daniel Eddy Flo Grandma Grandpa Reed Rocko Samantha Fred Karen Moira Tessa Veena Alex Allison Ava Susan Tom Rishi English United Kingdom Australia Ireland India South Africa DICGC iPhone Android Enhanced Premium Siri Google Apple'''.split())

# English / Hindi names of the controls the flows press (case-insensitive substring of the accessible name). The Hindi side is read from the app's own strings.
T = {
    'goal_save': ('Start saving or investing', 'बचत या निवेश शुरू करना'),
    'level_new': ('New to this', 'मेरे लिए सब नया है'),
    'skip': ('Skip', 'छोड़ें'),
    'ask_mitra': ('Ask Mitra', 'मित्रा से पूछें'),
    'trust': ('How this is worked out', 'यह कैसे निकाला गया'),
    'next': ('Next reel', 'अगली रील'),
    'again': ('Watch this reel again', 'यह रील फिर देखें'),
    'save': ('Save for later', 'बाद के लिए सेव करें'),
    'saved': ('Saved for later', 'बाद के लिए सेव है'),
    'pledge': ('I will do this', 'मैं यह करूँगा'),
    'remind': ('Remind me when', 'याद दिलाएँ'),
    'together': ('Play together', 'साथ खेलें'),
    'share': ('Share this lesson', 'यह पाठ साझा करें'),
    'know': ('I know this already', 'मुझे यह पहले से पता है'),
    'less': ('Show fewer reels on this topic', 'इस विषय की रीलें कम दिखाएँ'),
    'close': ('Close', 'बंद करें'),
    'notnow': ('Not now', 'अभी नहीं'),
    'never_mind': ('Never mind', 'रहने दें'),
    'done': ('Done', 'ठीक है'),
    'explore': ('Keep exploring', 'और देखना चाहें'),
    'moves': ('My moves', 'मेरे काम'),
    'challenge': ('Try a 7-day challenge', '7 दिन की चुनौती'),
    'share_image': ('Share as image', 'तस्वीर भेजें'),
    'share_text': ('Share as text', 'पाठ भेजें'),
    'back': ('Back', 'Back'),
    'continue': ('Continue', 'आगे बढ़ें'),
    'next_card': ('Next card', 'अगली बात'),
    'check': ('Check', 'जाँचें'),
    'lock': ('Lock in', 'अंदाज़ा पक्का'),
    'start': ('Start', 'शुरू करें'),
    'remind_sheet': ('When will you do it', 'आप यह कब करेंगे'),
}
TT = lambda k, lang: T[k][0 if lang == 'en' else 1]
BACK_RX = re.compile(r'^(← )?(Back|वापस|पीछे)', re.I)
CLOSE_FEED = re.compile(r'Close reels|रील बंद', re.I)
SHEET_CLOSE = re.compile(r'^(Close|बंद करें|बंद)$')
RX = lambda k: re.compile('|'.join(re.escape(x) for x in dict.fromkeys(T[k])), re.I)
LANGS_ALL = ('en', 'hi')

# ── the page's DOM helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────────

VT_JS = """() => { const out = []; const walk = n => { if (n.nodeType === 3) { const t = n.textContent.replace(/\\s+/g, ' ').trim(); if (t) out.push(t); return; }
  if (n.nodeType !== 1) return; const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.getAttribute('aria-hidden') === 'true') return;
  for (const c of n.childNodes) walk(c); }; walk(document.body); return out; }"""
CTRL_JS = """() => [...document.querySelectorAll('[role=button],[role=switch],[role=tab],[role=link],[role=slider],a[href],button,input,textarea')].filter(e => {
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[aria-hidden=true]'); })
  .map(e => { const r = e.getBoundingClientRect(); return { role: e.getAttribute('role') || e.tagName.toLowerCase(), name: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })"""
# Everything that is not the open sheet is hidden while the audit runs, so a sheet is audited on its own.
HIDE_BEHIND_MODAL = """() => { const m = [...document.body.children].filter(e => e.querySelector('[aria-modal=true],[role=dialog]')); if (!m.length) return 0;
  for (const e of document.body.children) if (e.tagName === 'DIV' && !m.includes(e)) { e.setAttribute('data-vis', e.style.visibility || '-'); e.style.visibility = 'hidden'; } return m.length; }"""
# Audit one region of a busy screen (Home): everything outside the element `find` returns is hidden for the duration.
HIDE_OUTSIDE = """(findSrc) => { const el = (new Function('return (' + findSrc + ')()'))(); if (!el) return 0; const keep = new Set(); for (let e = el; e && e !== document.body; e = e.parentElement) keep.add(e);
  for (const e of keep) { const p = e.parentElement; if (!p) continue; for (const sib of p.children) if (!keep.has(sib) && sib.style.display !== 'none') { sib.setAttribute('data-hid', sib.style.display || '-'); sib.style.display = 'none'; } } return 1; }"""
ARYA_CHIP_JS = """() => { const el = [...document.querySelectorAll('[role=button]')].find(e => e.innerText.includes('🎬')); return el ? el.parentElement.parentElement : null; }"""
HOME_CARD_JS = """() => { const el = [...document.querySelectorAll('[role=button]')].find(e => e.innerText.includes('🎬') && e.getBoundingClientRect().height > 60); return el ? el.parentElement : null; }"""
# Reels that are off screen are hidden from a screen reader (aria-hidden) but still drawn below the one in view: keep them out of the audit.
HIDE_INACTIVE = """() => { let n = 0; for (const e of document.querySelectorAll('[aria-hidden=true]')) { const r = e.getBoundingClientRect(); if (r.height > innerHeight * 0.4 && r.width > innerWidth * 0.6) { e.setAttribute('data-vis', e.style.visibility || '-'); e.style.visibility = 'hidden'; n++; } } return n; }"""
# Does each pair of overlapping texts still overlap once both are cut to what their scroll areas and the screen really show? (A line scrolled half under a
# fixed title overlaps its box, not the title.) Matching is by the start of the text, first drawn match.
OVERLAP_VISIBLE = """(pairs) => {
  const clip = (el, r) => { let q = { left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, innerWidth), bottom: Math.min(r.bottom, innerHeight) };
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue; const b = a.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { q.left = Math.max(q.left, b.left); q.right = Math.min(q.right, b.right); } if (cs.overflowY !== 'visible') { q.top = Math.max(q.top, b.top); q.bottom = Math.min(q.bottom, b.bottom); } }
    return q.right > q.left && q.bottom > q.top ? q : null; };
  const find = t => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while (n = w.nextNode()) { const s = n.textContent.replace(/\\s+/g, ' ').trim(); if (!s || !(s.startsWith(t.slice(0, 25)) || t.startsWith(s.slice(0, 25)))) continue; const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue; const rg = document.createRange(); rg.selectNodeContents(n);
      const rs = [...rg.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => clip(el, r)).filter(Boolean); if (rs.length) out.push(rs); } return out; };
  return pairs.map(([ta, tb]) => { const A = find(ta), B = find(tb);
    for (const a of A) for (const b of B) { if (a === b) continue; for (const ra of a) for (const rb of b) { const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (x > 1 && y > 1 && (x * y) / Math.min((ra.right - ra.left) * (ra.bottom - ra.top), (rb.right - rb.left) * (rb.bottom - rb.top)) > 0.25) return true; } }
    return false; }); }"""
# Text that sits inside a vertical scroll area that has scrolled: cut at its edge because it is scrolled, not because the box is too small.
IN_SCROLLER = """(texts) => texts.map(t => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while (n = w.nextNode()) { const s = n.textContent.replace(/\\s+/g, ' ').trim(); if (!s || !s.startsWith(t.slice(0, 25))) continue;
  for (let e = n.parentElement; e; e = e.parentElement) { const cs = getComputedStyle(e); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1 && e.scrollTop > 0) return true; } } return false; })"""
MODAL_TEXTS = """() => { const m = [...document.body.children].find(e => e.querySelector('[aria-modal=true],[role=dialog]')); return m ? m.innerText.split('\\n').map(x => x.trim()).filter(Boolean) : []; }"""
SHOW_AGAIN = """() => { for (const e of document.querySelectorAll('[data-hid]')) { const d = e.getAttribute('data-hid'); e.style.display = d === '-' ? '' : d; e.removeAttribute('data-hid'); }
  for (const e of document.querySelectorAll('[data-vis]')) { const d = e.getAttribute('data-vis'); e.style.visibility = d === '-' ? '' : d; e.removeAttribute('data-vis'); } }"""

EXTRA_JS = r"""({minTarget, modal}) => {
  const root = modal ? [...document.body.children].find(e => e.querySelector('[aria-modal=true],[role=dialog]')) : null;
  const W = window.innerWidth, sel = '[role=button],[role=link],[role=tab],[role=switch],[role=slider],button,a[href],input,textarea';
  let n = 0, minW = 1e9, minH = 1e9; const past = [], small = [];
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 48);
  for (const el of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect(); if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0 || el.closest('[aria-hidden=true]')) continue;
    if (root && !root.contains(el)) continue;                                 // auditing a sheet: only what is in the sheet
    if (el.querySelector(sel)) continue;                                      // a wrapper around real controls (a backdrop around a sheet) is not itself the target
    const named = !!(el.getAttribute('aria-label') || (el.innerText || '').trim());
    const host = el.parentElement && el.parentElement.closest(sel);
    if (host && !named) { const hr = host.getBoundingClientRect(); if (hr.width >= minTarget - 0.5 && hr.height >= minTarget - 0.5) continue; }   // a switch's picture inside its 44 px row
    n++; minW = Math.min(minW, r.width); minH = Math.min(minH, r.height);
    if (r.width < minTarget - 0.5 || r.height < minTarget - 0.5) small.push({ label: label(el), w: Math.round(r.width), h: Math.round(r.height) });
    let inScroller = false; for (let e = el.parentElement; e; e = e.parentElement) { const c = getComputedStyle(e); if ((c.overflowX === 'auto' || c.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1) { inScroller = true; break; } }
    if (!inScroller && r.right > W + 1 && r.left < W) past.push({ label: label(el), left: Math.round(r.left), right: Math.round(r.right) });
  }
  return { W, scrollW: document.documentElement.scrollWidth, controls: n, minW: n ? Math.round(minW) : null, minH: n ? Math.round(minH) : null, past, small };
}"""
LABELS_JS = """() => [...document.querySelectorAll('[aria-label]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden=true]'); }).map(e => e.getAttribute('aria-label'))"""

KEY_RX = re.compile(r'\b[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){2,}\b|\{[a-zA-Z_]+\}|\b[a-z]+(?:_[a-z]+){2,}\b')
LATIN_WORD = re.compile(r'[A-Za-z]{3,}')
DEVANAGARI = re.compile(r'[ऀ-ॿ]')


def hindi_leftovers(strings):
    """Strings with an English word (3+ letters) that is not a product term. A string that is mixed Hindi and English shows the English words after an arrow.
    Names of people in a story and the like are listed too: a human decides."""
    out = []
    for s in strings:
        s2 = re.sub(r'https?://\S+|Money Score|finos[_a-z]*|FIN·OS', ' ', s)          # product names and the storage keys the privacy text names
        words = [w for w in LATIN_WORD.findall(s2) if w not in HINDI_OK and w.upper() not in HINDI_OK]
        if words:
            out.append(f"{s[:46]} -> [{', '.join(dict.fromkeys(words))[:40]}]" if DEVANAGARI.search(s) else s[:70])
    return list(dict.fromkeys(out))


# ── the report ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

class Report:
    def __init__(self):
        self.rows = []
        self.warn_kinds = {}

    def add(self, screen, lang, check, status, note=''):
        self.rows.append({'screen': screen, 'lang': lang, 'check': check, 'status': status, 'note': note})
        mark = {'PASS': 'PASS', 'FAIL': 'FAIL', 'WARN': 'warn', 'SKIP': 'skip'}[status]
        print(f'{mark:4}  {lang}  {screen:34} {check:14} {note}'.rstrip())
        sys.stdout.flush()

    def counts(self):
        c = {'PASS': 0, 'FAIL': 0, 'WARN': 0, 'SKIP': 0}
        for r in self.rows:
            c[r['status']] += 1
        return c

    def markdown(self):
        screens = list(dict.fromkeys(r['screen'] for r in self.rows))
        lines = ['| Screen | Lang | Result | Failing checks / notes |', '|---|---|---|---|']
        for s in screens:
            for lang in LANGS_ALL:
                rs = [r for r in self.rows if r['screen'] == s and r['lang'] == lang]
                if not rs:
                    continue
                bad = [r for r in rs if r['status'] == 'FAIL']
                res = 'FAIL' if bad else ('SKIP' if all(r['status'] == 'SKIP' for r in rs) else 'PASS')
                notes = '; '.join(f"{r['check']}: {r['note']}" for r in bad) or '; '.join(f"{r['check']}: {r['note']}" for r in rs if r['status'] in ('WARN', 'SKIP'))
                lines.append(f"| {s} | {lang} | {res} | {notes[:300]} |")
        return '\n'.join(lines)


class Session:
    """One browser context for one language, with the console and page errors collected."""

    def __init__(self, browser, rep, lang, w=VIEW_W, h=VIEW_H, scale=TEXT_SCALE, seed_lang=True):
        self.rep, self.lang = rep, lang
        self.ctx = browser.new_context(viewport={'width': w, 'height': h}, accept_downloads=False)
        seed = "localStorage.setItem('finos_theme_mobile','dark');"
        if seed_lang:
            seed += f"localStorage.setItem('finos_lang','{lang}');"
        # seeded once per browser tab, so a reload in the middle of a flow keeps what the person did
        self.ctx.add_init_script(f"if(!sessionStorage.getItem('__smoke')){{sessionStorage.setItem('__smoke','1');{seed}}}")
        if scale != 1:
            self.ctx.add_init_script(la.SCALE_JS % {'k': scale})
        self.ctx.route(re.compile(r'^https?://(?!localhost|127\.0\.0\.1).*'), lambda r: r.abort())
        self.pg = self.ctx.new_page()
        self.pg.set_default_timeout(10000)
        self.msgs = []
        self.pg.on('console', lambda m: self.msgs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
        self.pg.on('pageerror', lambda e: self.msgs.append(('pageerror', str(e))))
        self.dialogs = []
        self.pg.on('dialog', self._dialog)
        self.dialog_answer = False
        self.w, self.h = w, h
        self.where = 'start'
        self.reported_missing = set()

    def _dialog(self, d):
        self.dialogs.append(d.message)
        d.accept() if self.dialog_answer else d.dismiss()

    def close(self):
        self.ctx.close()

    # -- reading the screen
    def texts(self):
        return self.pg.evaluate(VT_JS)

    def text(self):
        return ' | '.join(self.texts())

    def has(self, pattern, timeout=0):
        rx = pattern if hasattr(pattern, 'search') else re.compile(pattern, re.I)
        end = time.time() + timeout
        while True:
            if rx.search(self.text()):
                return True
            if time.time() >= end:
                return False
            self.pg.wait_for_timeout(250)

    def controls(self):
        return self.pg.evaluate(CTRL_JS)

    def button(self, key_or_rx, **kw):
        rx = RX(key_or_rx) if isinstance(key_or_rx, str) and key_or_rx in T else (key_or_rx if hasattr(key_or_rx, 'search') else re.compile(re.escape(key_or_rx), re.I))
        return self.pg.get_by_role('button', name=rx, **kw)

    def click(self, key_or_rx, wait=700, nth=0, timeout=4000):
        """Press a control by (part of) its accessible name. A control that is not there is a FAIL on the screen last checked, not a crash."""
        loc = self.button(key_or_rx)
        loc = loc.nth(nth) if nth else loc.first
        try:
            loc.click(timeout=timeout)
        except PWTimeout:
            name = T[key_or_rx][0] if isinstance(key_or_rx, str) and key_or_rx in T else getattr(key_or_rx, 'pattern', str(key_or_rx))
            self.rep.add(self.where, self.lang, 'press', 'FAIL', f'no button matching {name!r} (url {self.pg.url.replace(BASE, "")})')
            self.shot('press-' + str(name)[:20])
            return False
        self.pg.wait_for_timeout(wait)
        return True

    def exists(self, key_or_rx):
        loc = self.button(key_or_rx)
        return loc.count() > 0 and any(loc.nth(i).is_visible() for i in range(min(loc.count(), 6)))

    def goto(self, path, base=None, wait=1800):
        self.pg.goto((base or BASE) + path, wait_until='domcontentloaded')
        self.pg.wait_for_timeout(wait)

    def clear_reels_storage(self, lang_unset=False):
        """A new person: every key the reels keep, and the language when asked (the welcome then asks for it)."""
        self.pg.evaluate("""(unset) => { for (const k of Object.keys(localStorage)) if (k.startsWith('finos_session_reels') || k.startsWith('finos_reels') || k === 'finos_streak' || (unset && k === 'finos_lang')) localStorage.removeItem(k); }""", lang_unset)

    # -- the checks
    def drain(self):
        m, self.msgs = self.msgs, []
        return m

    def check(self, screen, expect=None, modal=False, hindi_scope=None, ignore_small=(), note_extra='', hindi_a11y=True, skip=(), region=None, no_hindi=False):
        """Run every per-screen check on what is on screen now and record PASS / FAIL for each."""
        pg, lang, rep = self.pg, self.lang, self.rep
        label = screen
        self.where = screen
        texts = self.texts()
        if region:
            pg.evaluate(HIDE_OUTSIDE, region)
            try:
                texts = self.texts()
            finally:
                pg.evaluate(SHOW_AGAIN)
        body = ' | '.join(texts)
        # loads
        probs = []
        if smoke.UNMATCHED.search(body):
            probs.append('UNMATCHED ROUTE / unknown-id fallback')
        if len(body.strip()) < 15:
            probs.append('empty screen')
        m = smoke.BAD_TEXT.search(body)
        if m:
            probs.append(f'shows "{m.group(0)}" near ...{body[max(0, m.start() - 30): m.end() + 20]}')
        if expect:
            exp = expect if isinstance(expect, (list, tuple)) else [expect]
            for e in exp:
                e = e[lang] if isinstance(e, dict) else e
                if not re.search(e, body, re.I):
                    probs.append(f'expected text not found: {e!r}')
        rep.add(label, lang, 'loads', 'FAIL' if probs else 'PASS', '; '.join(probs[:3]))
        # console
        msgs = self.drain()
        errs, harmless = [], {}
        for typ, txt in msgs:
            if smoke.NOISE.search(txt) and typ != 'pageerror':
                continue
            kind = next((name for rx, name in KNOWN_WEB_WARNINGS if rx.search(txt)), None)
            if kind and typ == 'warning':
                harmless[kind] = harmless.get(kind, 0) + 1
                rep.warn_kinds[kind] = rep.warn_kinds.get(kind, 0) + 1
                continue
            errs.append(f'{typ}: {txt[:140]}')
        errs = list(dict.fromkeys(errs))
        rep.add(label, lang, 'console', 'FAIL' if errs else 'PASS', ' | '.join(errs[:3]) + (f' (+{len(errs) - 3} more)' if len(errs) > 3 else '') or (f'harmless web-only warnings: {harmless}' if harmless else ''))
        # layout
        if region:
            pg.evaluate(HIDE_OUTSIDE, region)
        if modal:
            pg.evaluate(HIDE_BEHIND_MODAL)
        else:
            pg.evaluate(HIDE_INACTIVE)
        try:
            res = pg.evaluate(la.AUDIT_JS, {'minTarget': MIN_TARGET, 'safeTop': 0, 'safeBottom': 0})
            ex = pg.evaluate(EXTRA_JS, {'minTarget': MIN_TARGET, 'modal': modal})
        finally:
            pg.evaluate(SHOW_AGAIN)
        if modal:
            res['small'] = []          # the sheet's own controls are counted by EXTRA_JS (named controls inside a backdrop button are skipped by the audit)
        W, H = self.w, self.h
        if res['overlap']:       # keep a pair only when the two texts still overlap in what is really drawn
            keep = pg.evaluate(OVERLAP_VISIBLE, [[o['a'], o['b']] for o in res['overlap']])
            res['overlap'] = [o for o, k in zip(res['overlap'], keep) if k]
        clipped = [c for c in res['clipped'] if not (c.get('text_box') and (c['text_box'][0] >= W - 1 or c['text_box'][2] <= 0 or c['text_box'][1] >= H))]
        clipped = [c for c in clipped if not (c['axis'] == 'x' and c.get('text_box') and max(c['clip_box'][0] - c['text_box'][0], c['text_box'][2] - c['clip_box'][2]) < 3)]    # a glyph that overhangs its line box by a pixel or two is not a cut word
        ys = [c for c in clipped if c['axis'] == 'y']
        if ys:
            scrolled = dict(zip([c['text'] for c in ys], pg.evaluate(IN_SCROLLER, [c['text'] for c in ys])))
            clipped = [c for c in clipped if not (c['axis'] == 'y' and scrolled.get(c['text']))]
        seen_small, small = set(), []
        for sm in res['small'] + ex['small']:            # the layout audit's list, plus named controls it skips because they sit inside a bigger control (a sheet inside its backdrop)
            k = (sm['label'], sm['w'], sm['h'])
            if k not in seen_small and not any(i in sm['label'] for i in ignore_small) and sm['label']:
                seen_small.add(k); small.append(sm)
        nums = f"page {ex['scrollW']}/{ex['W']} px, {ex['controls']} controls, smallest {ex['minW']}x{ex['minH']}"
        hs = res['hscroll'] + [{'what': 'control past the right edge', **p} for p in ex['past']]
        if 'hscroll' not in skip:
            rep.add(label, lang, 'no-hscroll', 'FAIL' if hs else 'PASS', ('; '.join(f"{h.get('what')}: {h.get('text') or h.get('label') or ''} right={h.get('right') or h.get('scrollWidth')}" for h in hs[:3]) if hs else nums))
        if 'clipping' not in skip:
            rep.add(label, lang, 'no-clipping', 'FAIL' if clipped else 'PASS', '; '.join(f"{c['text']!r} ({c['axis']})" for c in clipped[:3]) + (f' (+{len(clipped) - 3})' if len(clipped) > 3 else ''))
        if 'targets' not in skip:
            rep.add(label, lang, 'targets>=44', 'FAIL' if small else 'PASS', '; '.join(f"{s['label']!r} {s['w']}x{s['h']}" for s in small[:4]) + (f' (+{len(small) - 4})' if len(small) > 4 else '') if small else f"smallest {ex['minW']}x{ex['minH']} of {ex['controls']}")
        if 'overlap' not in skip:
            rep.add(label, lang, 'no-overlap', 'FAIL' if res['overlap'] else 'PASS', '; '.join(f"{o['a']!r} / {o['b']!r}" for o in res['overlap'][:3]))
        # keys and Hindi
        raw = [m.group(0) for t in texts for m in KEY_RX.finditer(t)]
        raw = [r for r in raw if not re.match(r'^\d|^[a-z]+\.[a-z]{2,4}$', r) and 'localhost' not in r]
        rep.add(label, lang, 'no-raw-keys', 'FAIL' if raw else 'PASS', ', '.join(dict.fromkeys(raw))[:120])
        if lang == 'hi' and not no_hindi:
            scope = texts
            if hindi_scope:
                scope = pg.evaluate(hindi_scope)
            left = hindi_leftovers(scope)
            rep.add(label, lang, 'hindi-text', 'FAIL' if left else 'PASS', f'{len(left)} English: ' + ' | '.join(left[:4]) if left else '')
            if hindi_a11y and not hindi_scope:
                if region:
                    pg.evaluate(HIDE_OUTSIDE, region)
                try:
                    labels = pg.evaluate(LABELS_JS)
                finally:
                    if region:
                        pg.evaluate(SHOW_AGAIN)
                lleft = hindi_leftovers(labels)
                rep.add(label, lang, 'hindi-a11y', 'FAIL' if lleft else 'PASS', f'{len(lleft)} English names: ' + ' | '.join(lleft[:4]) if lleft else '')
            if not modal:
                try:
                    miss = pg.evaluate('window.__finosMissing ? window.__finosMissing() : []')
                except Exception:  # noqa: BLE001
                    miss = []
                new = [m for m in miss if m not in self.reported_missing]
                self.reported_missing.update(miss)
                if new:       # only what this screen added: the page keeps one list for the whole visit
                    self.rep.add(label, lang, 'i18n-table', 'WARN', f'{len(new)} English string(s) with no Hindi entry first asked for here: ' + ' | '.join(m[:50] for m in new[:3]))
        failing = [r for r in rep.rows[-12:] if r['screen'] == label and r['lang'] == lang and r['status'] == 'FAIL']
        if failing:
            self.shot(label)

    def shot(self, label):
        try:
            os.makedirs(SHOTS, exist_ok=True)
            self.pg.add_style_tag(content=la.OUTLINE_CSS)
            self.pg.screenshot(path=os.path.join(SHOTS, re.sub(r'[^A-Za-z0-9]+', '_', f'{self.lang}_{label}')[:90] + '.png'))
        except Exception:  # noqa: BLE001
            pass


def ready(s, rx, timeout=8000):
    """Wait for the screen's own words; a stale dev server shows the 404 page instead."""
    return s.has(rx, timeout / 1000)


# ── routes that need no interaction ───────────────────────────────────────────────────────────────────────────────────────────────────

ROUTE_SCREENS = [
    ('Home card (returning person)', '/dashboard', {'en': 'reel', 'hi': 'रील'}, 'HOME'),
    # (name, path, words that prove it is the real screen in each language)
    ('Learn index', '/learn', {'en': 'Money reels', 'hi': 'मनी रील्स'}),
    ('Reels feed (resumed)', '/learn/reels', {'en': 'Money reels', 'hi': 'मनी रील्स'}),
    ('Voice settings', '/learn/voice', {'en': 'Reel voice', 'hi': 'रील की आवाज़|आवाज़'}),
    ('My moves', '/learn/moves', {'en': 'My moves', 'hi': 'मेरे काम'}),
    ('Challenges', '/learn/challenges', {'en': '7-day challenges', 'hi': '7 दिन की चुनौतियाँ'}),
    ('Money Map', '/learn/map', {'en': 'Money Map', 'hi': 'मनी मैप'}),
    ('Story series', '/learn/series', {'en': 'Story series', 'hi': 'कहानी'}),
    ('Series: First Salary', '/learn/series/first-salary', {'en': 'First Salary', 'hi': '.'}),
    ('Reels health', '/learn/health', {'en': 'Reels health', 'hi': 'रील'}),
    ('What the reels know', '/learn/reels-data', {'en': 'What the reels know about you', 'hi': 'रील.*आपके बारे'}),
    ('Diagnostics', '/diagnostics', {'en': 'Diagnostics', 'hi': 'डायग्नोस्टिक|Diagnostics'}),
]


def run_routes(b, rep, langs, w=VIEW_W, h=VIEW_H, scale=TEXT_SCALE, tag=''):
    for lang in langs:
        s = Session(b, rep, lang, w, h, scale)
        # Home first: the card, and the Reels tab, so the person state exists and the feed is not the cold start
        s.goto('/dashboard', wait=3000)
        s.drain()
        s.pg.evaluate("""() => { localStorage.setItem('finos_session_reels_profile', JSON.stringify({ v: 1, known: [], less: {}, start: { goals: [], level: 'some', at: '2026-10-01T00:00:00.000Z', skipped: true } })); }""")
        for item in ROUTE_SCREENS:
            name, path, expect = item[:3]
            region = HOME_CARD_JS if len(item) > 3 else None
            s.goto(path, wait=3000 if region else 2200)
            if not ready(s, expect[lang] if lang in expect else '.'):
                s.pg.wait_for_timeout(1500)
            s.check(name + tag, expect=expect, region=region)
        s.close()


# ── the flows that tap through the product ────────────────────────────────────────────────────────────────────────────────────────────

def beat_play(s, tag):
    """Answer whatever beat is on: the first myth/fact/option, Check, Next card, Continue. Probes the question state and the reveal."""
    probed_q = probed_r = False
    kinds = []
    for step in range(14):
        if s.exists('continue'):
            if not probed_r:
                s.check(f'{tag} beat reveal', modal=False, hindi_a11y=False, skip=('overlap',) if False else ())
                probed_r = True
            s.click('continue', wait=900)
            return True, kinds
        if s.exists('next_card'):
            s.click('next_card', wait=600); kinds.append('cards'); continue
        if s.exists('check'):
            if not probed_q:
                s.check(f'{tag} beat question', hindi_a11y=False); probed_q = True
            s.click('check', wait=700); kinds.append('check'); continue
        if s.exists(re.compile(r'^(Myth|मिथक)', re.I)):
            if not probed_q:
                s.check(f'{tag} beat question', hindi_a11y=False); probed_q = True
            s.click(re.compile(r'^(Myth|मिथक)', re.I), wait=700); kinds.append('myth/fact'); continue
        if s.exists('lock'):
            s.click('lock', wait=700); kinds.append('guess'); continue
        # an option card of a pick-style beat: the first control below the title that is not Skip / Ask Mitra / the top bar
        cs = [c for c in s.controls() if c['y'] > 150 and c['h'] >= 40 and not re.search(r'skip|छोड़ें|ask mitra|मित्रा|how this|यह कैसे|close|बंद', c['name'], re.I) and c['role'] == 'button']
        if cs and step < 12:
            c = cs[0]; s.pg.mouse.click(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2); s.pg.wait_for_timeout(600); kinds.append('pick'); continue
        break
    return False, kinds


def wait_for_beat_or_quiz(s, timeout=60):
    """A reel plays by itself: wait until its beat shows (a Skip link, no title) or its question does."""
    end = time.time() + timeout
    skip, quiz = RX('skip'), re.compile(r'ONE QUICK QUESTION|एक छोटा सवाल', re.I)
    while time.time() < end:
        body = s.text()
        if quiz.search(body):
            return 'quiz'
        if s.exists('skip') and not re.search(r'Let.s make this yours|इसे आपके लिए', body):
            return 'beat'
        s.pg.wait_for_timeout(500)
    return None


def jump_to_quiz(s, timeout=25):
    """Tap the scene bar at its right end: the reel jumps to its last scene and, when that ends, to its question."""
    sc = s.pg.get_by_role('slider').first
    bb = sc.bounding_box()
    s.pg.mouse.click(bb['x'] + bb['width'] - 3, bb['y'] + bb['height'] / 2)
    return s.has(re.compile(r'ONE QUICK QUESTION|एक छोटा सवाल', re.I), timeout)


def answer_quiz(s):
    cs = [c for c in s.controls() if c['role'] == 'button' and c['y'] > 150 and c['h'] >= 50 and c['w'] > 250 and not re.search(r'ask mitra|मित्रा', c['name'], re.I)]
    if not cs:
        return False
    c = cs[0]
    s.pg.mouse.click(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2)
    s.pg.wait_for_timeout(1100)
    return s.has(re.compile(r'Right!|Not quite|सही!|लगभग!', re.I), 3)


def swipe(s, x0, x1, y):
    s.pg.mouse.move(x0, y)
    s.pg.mouse.down()
    steps = 8
    for i in range(1, steps + 1):
        s.pg.mouse.move(x0 + (x1 - x0) * i / steps, y + (i % 2))
        s.pg.wait_for_timeout(16)
    s.pg.mouse.up()
    s.pg.wait_for_timeout(700)


def stage_box(s):
    for c in s.controls():
        if c['role'] == 'button' and re.search(r'^(Pause|Play|रोकें|चलाएँ)$', c['name']):
            return c
    return None


def flow_cold_start(b, rep, lang):
    """A new person: nothing answered, no language set. Home card, then the Reels tab, the welcome (language, goal, level) and a first episode."""
    s = Session(b, rep, lang)
    s.goto('/dashboard', wait=2500)
    s.clear_reels_storage()
    s.drain()
    # Home card for a new person, in the language the person has chosen
    s.goto('/dashboard', wait=3000)
    s.check('Home card (new person)', expect={'en': 'reel', 'hi': 'रील'}, region=HOME_CARD_JS)
    # a person who has not chosen a language yet: the welcome asks it first
    s.clear_reels_storage(lang_unset=True)
    s.goto('/dashboard', wait=2500)
    # the Reels tab is the documented entry
    tab = s.pg.get_by_role('tab', name=re.compile(r'Reels|रील', re.I)).first
    tab.click(); s.pg.wait_for_timeout(2500)
    on_feed = '/learn/reels' in s.pg.url
    rep.add('Reels tab -> feed', lang, 'entry', 'PASS' if on_feed else 'FAIL', f'url {s.pg.url.replace(BASE, "")}' if not on_feed else '')
    # Welcome
    first = s.text()
    asks_lang = bool(re.search(r'Which language|कौन सी भाषा', first))
    rep.add('Welcome (cold start)', lang, 'asks language first', 'PASS' if asks_lang else 'FAIL', '' if asks_lang else 'no language question for a person with no language set')
    if asks_lang:
        s.check('Welcome: language step', modal=True, hindi_a11y=False, no_hindi=True)
        s.click(re.compile('हिन्दी' if lang == 'hi' else 'English'), wait=900)
    s.pg.wait_for_timeout(500)
    if not s.has(RX('goal_save'), 4):
        rep.add('Welcome (cold start)', lang, 'goal step', 'FAIL', 'goal options not shown')
        s.close(); return None
    s.check('Welcome: goal step', expect={'en': 'What are you here for', 'hi': 'किसलिए'}, modal=True, hindi_a11y=False)
    s.click('goal_save', wait=900)
    s.check('Welcome: level step', expect={'en': 'How comfortable', 'hi': 'कितने सहज'}, modal=True, hindi_a11y=False)
    s.click('level_new', wait=0)
    # the first reel starts at once and reaches its beat in about 7 s: move straight on to pause it (flow_episode)
    end = time.time() + 15
    box = None
    while time.time() < end and not box:
        box = stage_box(s)
        if not box:
            s.pg.wait_for_timeout(100)
    if box:
        s.pg.mouse.click(box['x'] + box['w'] / 2, box['y'] + box['h'] / 2)
        s.pg.wait_for_timeout(300)
    s.pg.evaluate("localStorage.getItem('finos_lang')")
    langnow = s.pg.evaluate("String(localStorage.getItem('finos_lang') || '').replace(/\"/g, '')")
    rep.add('Welcome (cold start)', lang, 'language kept', 'PASS' if langnow == lang or (lang == 'en' and langnow in ('', 'en')) else 'FAIL', f'finos_lang={langnow!r}')
    return s


def flow_episode(s, rep, lang):
    """The first episode: reel 1 (beat, question, answer, shelf, sheets, gestures), reel 2, then the calm stop."""
    pg = s.pg
    s.check('Reel 1: scene (paused)', hindi_a11y=True)
    # a sheet over the reel pauses it, so the trust sheet and the Ask sheet are opened first, while the picture still shows
    trust_done = False
    if s.exists('trust'):
        s.click('trust', wait=900)
        s.check('Trust sheet', modal=True, expect={'en': 'WHAT WE ASSUMED|FORMULA', 'hi': 'सूत्र|हमने क्या माना'})
        s.click(SHEET_CLOSE, wait=600)
        rep.add('Trust sheet', lang, 'close', 'PASS' if not s.has(re.compile('WHAT WE ASSUMED|हमने क्या माना')) else 'FAIL', '')
        trust_done = True
    if s.exists('ask_mitra'):
        s.click('ask_mitra', wait=900)
        s.check('Ask Mitra sheet', modal=True, expect={'en': 'Ask Mitra', 'hi': 'मित्रा से पूछें'})
        s.click(SHEET_CLOSE, wait=600)
    else:
        rep.add('Ask Mitra sheet', lang, 'opens', 'FAIL', 'no Ask Mitra button on the playing reel')
    # gestures on the picture: double tap = pledge, swipe right = save, swipe left = steer sheet
    box = stage_box(s)
    if box:
        cx, cy = box['x'] + box['w'] / 2, box['y'] + box['h'] / 2
        pg.mouse.click(cx, cy, click_count=2, delay=60); pg.wait_for_timeout(500)
        t = s.text()
        ok = bool(re.search(r'Added to My moves|Already on My moves|Saved for later|Already saved|मेरे काम में जुड़ा|पहले से मेरे काम में|बाद के लिए रखी|पहले से सेव', t))
        rep.add('Gesture: double-tap pledge', lang, 'toast', 'PASS' if ok else 'FAIL', '' if ok else 'no pledge / save toast after a double tap on the picture')
        pg.wait_for_timeout(2400)
        swipe(s, cx - 100, cx + 110, cy)
        t = s.text()
        ok = bool(re.search(r'Saved for later|Removed from saved|बाद के लिए रखी|सेव से हटाई', t))
        rep.add('Gesture: swipe right (synthetic mouse)', lang, 'save toast', 'PASS' if ok else 'FAIL', '' if ok else 'no save toast after a rightward drag')
        pg.wait_for_timeout(2400)
        swipe(s, cx + 110, cx - 100, cy)
        ok = s.has(re.compile(r'What should the reels know|इस रील के बारे में क्या बताएँ', re.I), 2)
        rep.add('Gesture: swipe left (synthetic mouse)', lang, 'steer sheet', 'PASS' if ok else 'FAIL', '' if ok else 'no steer sheet after a leftward drag')
        if ok:
            s.check('Steer sheet', modal=True)
            s.click('never_mind', wait=500)
    else:
        rep.add('Gestures', lang, 'picture found', 'FAIL', 'no Pause/Play control on the first reel; screen: ' + s.text()[:160]); s.shot('no-stage')
    # resume (the picture is the play / pause button), then the beat
    box = stage_box(s)
    if box and re.search(r'^(Play|चलाएँ)$', box['name']):
        pg.mouse.click(box['x'] + box['w'] / 2, box['y'] + box['h'] / 2); pg.wait_for_timeout(400)
    kind = wait_for_beat_or_quiz(s, 40)
    rep.add('Reel 1', lang, 'beat shows', 'PASS' if kind == 'beat' else 'WARN', 'first reel went to its question without a beat' if kind != 'beat' else '')
    if kind == 'beat' or s.exists('skip'):
        ok, kinds = beat_play(s, 'Reel 1')
        rep.add('Reel 1 beat', lang, 'completes', 'PASS' if ok else 'FAIL', 'kind: ' + (','.join(dict.fromkeys(kinds)) or '?'))
    # the question
    got = s.has(re.compile(r'ONE QUICK QUESTION|एक छोटा सवाल', re.I), 1) or jump_to_quiz(s)
    if not got:
        rep.add('Reel 1 quiz', lang, 'shows', 'FAIL', 'the question never came'); return False
    if not trust_done and s.exists('trust'):
        s.click('trust', wait=900)
        s.check('Trust sheet', modal=True, expect={'en': 'WHAT WE ASSUMED|FORMULA', 'hi': 'सूत्र|हमने क्या माना'})
        s.click(SHEET_CLOSE, wait=600)
        trust_done = True
    s.check('Reel 1: quiz', expect={'en': 'ONE QUICK QUESTION', 'hi': 'एक छोटा सवाल'})
    ok = answer_quiz(s)
    rep.add('Reel 1 quiz', lang, 'verdict after answer', 'PASS' if ok else 'FAIL', '')
    s.check('Reel 1: after the answer (verdict, shelf)', expect={'en': 'KEEP OR SHARE', 'hi': 'रखें या साझा करें'})
    # the shelf (the swipe and the double tap above already saved and pledged this reel, so Save is pressed to remove and again to keep)
    ON_MOVES = re.compile(r'^(On My moves|मेरे काम की सूची में है)', re.I)
    if s.exists('saved'):
        s.click('saved', wait=700)
        off = s.exists('save') and not s.exists('saved')
        s.click('save', wait=700)
        rep.add('Shelf: Save', lang, 'toggles off and on', 'PASS' if off and s.exists('saved') else 'FAIL', '' if off else 'pressing "Saved" did not remove it')
    elif s.exists('save'):
        s.click('save', wait=700)
        rep.add('Shelf: Save', lang, 'state', 'PASS' if s.exists('saved') else 'FAIL', 'button did not switch to "Saved"')
    else:
        rep.add('Shelf: Save', lang, 'present', 'FAIL', 'no Save button after the answer')
    if s.exists('pledge'):
        s.click('pledge', wait=700)
        rep.add("Shelf: I'll do this", lang, 'state', 'PASS' if s.exists(ON_MOVES) else 'FAIL', 'button did not switch to "On My moves"')
    elif s.exists(ON_MOVES):
        rep.add("Shelf: I'll do this", lang, 'state', 'PASS', 'already on My moves from the double tap')
    else:
        rep.add("Shelf: I'll do this", lang, 'present', 'WARN', 'reel 1 has no tool, so no pledge button')
    if s.exists('remind'):
        s.click('remind', wait=900)
        s.check('Remind me sheet (reel)', modal=True, expect={'en': 'When will you do it', 'hi': 'कब'})
        s.click('notnow', wait=600)
    if s.exists('together'):
        s.click('together', wait=900)
        s.check('Play together sheet', modal=True)
        s.click(SHEET_CLOSE, wait=600)
    else:
        rep.add('Shelf: Play together', lang, 'present', 'WARN', 'reel 1 has no guess beat (checked on the SIP reel through the Arya chip)')
    # share
    s.click('share', wait=1200)
    s.check('Share sheet (image + text choice)', modal=True, expect={'en': 'Share as image', 'hi': 'तस्वीर भेजें'})
    # Share as image: on the web the picture cannot be handed to a share sheet, so the sheet must say what happened (picture saved, or the text instead)
    s.click('share_image', wait=3500)
    note = s.text()
    ok_img = bool(re.search(r'Picture saved|Could not make the picture|cannot share a picture|तस्वीर सेव|तस्वीर नहीं बन|तस्वीर साझा नहीं|यह रहा पाठ|Share as text|पाठ भेजें|Share…|साझा करें', note))
    rep.add('Share sheet: Share as image', lang, 'ends in a result or a fallback', 'PASS' if ok_img else 'FAIL', '' if ok_img else 'nothing on screen says what happened after Share as image')
    if s.exists('share_text'):
        s.click('share_text', wait=1000)
    s.check('Share sheet (text)', modal=True)
    # close the share modal: its Close button, or Escape
    for _ in range(2):
        if s.exists(SHEET_CLOSE):
            s.click(SHEET_CLOSE, wait=600)
    # tune
    if s.exists('know'):
        s.click('know', wait=600)
        rep.add('Shelf: I know this', lang, 'confirms', 'PASS' if s.has(re.compile(r'will not come up again|अब नहीं आएगी'), 2) else 'FAIL', '')
    s.check('Reel 1: shelf used', expect={'en': 'KEEP OR SHARE', 'hi': 'रखें या साझा करें'})
    # next reel
    s.click('next', wait=1800)
    kind = wait_for_beat_or_quiz(s, 45)
    s.check('Reel 2: playing', hindi_a11y=False)
    if kind == 'beat':
        ok, kinds = beat_play(s, 'Reel 2')
        rep.add('Reel 2 beat', lang, 'completes', 'PASS' if ok else 'FAIL', 'kind: ' + (','.join(dict.fromkeys(kinds)) or '?'))
    got = s.has(re.compile(r'ONE QUICK QUESTION|एक छोटा सवाल', re.I), 1) or jump_to_quiz(s)
    if got:
        answer_quiz(s)
        s.check('Reel 2: after the answer', hindi_a11y=False)
        s.click('next', wait=1800)
    # the calm stop
    reached = s.has(re.compile(r'enough for today|आज के लिए इतना काफ़ी', re.I), 6)
    rep.add('Calm stop', lang, 'reached after the episode', 'PASS' if reached else 'FAIL', '' if reached else 'the feed did not end on the calm stop')
    if reached:
        s.check('Calm stop (week line, fact)', expect={'en': "TODAY'S MONEY FACT|money fact", 'hi': 'पैसे का तथ्य'})
        body = s.text()
        rep.add('Calm stop', lang, 'week line', 'PASS' if re.search(r'week|हफ़्ते|सप्ताह|days|दिन', body, re.I) else 'WARN', 'no week line (expected only after some history)')
    return reached


def flow_after_episode(s, rep, lang):
    """From the calm stop outward: My moves, challenges, the saved tab, the voice door, then Home."""
    pg = s.pg
    # My moves from the calm stop
    if s.exists('moves'):
        s.click('moves', wait=1500)
        rep.add('Calm stop -> My moves', lang, 'entry', 'PASS' if '/learn/moves' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
        s.check('My moves (with a pledge and a saved reel)', expect={'en': 'My moves', 'hi': 'मेरे काम'})
        if s.exists(re.compile(r'^(Remind me|याद दिलाएँ)', re.I)):
            s.click(re.compile(r'^(Remind me|याद दिलाएँ)', re.I), wait=900)
            s.check('Remind me sheet (My moves)', modal=True, expect={'en': 'When will you do it', 'hi': 'कब'})
            # pick a moment: on the web there are no phone reminders, so the sheet must say so instead of staying silent
            n0 = len(pg.evaluate(MODAL_TEXTS))
            opt = s.button(re.compile(r'Tomorrow morning|कल सुबह', re.I))
            if opt.count():
                opt.first.click(); pg.wait_for_timeout(1500)
                n1 = len(pg.evaluate(MODAL_TEXTS))
                rep.add('Remind me sheet (My moves)', lang, 'says what happened after a pick', 'PASS' if n1 > n0 else 'FAIL', '' if n1 > n0 else 'picking a moment changed nothing on screen')
            s.click('notnow', wait=600)
        s.click(BACK_RX, wait=1200)
        rep.add('My moves', lang, 'back to the calm stop', 'PASS' if '/learn/reels' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
    # Challenges from the calm stop
    if s.has(re.compile(r'enough for today|आज के लिए इतना काफ़ी'), 2) and s.exists('challenge'):
        s.click('challenge', wait=1500)
        rep.add('Calm stop -> Challenges', lang, 'entry', 'PASS' if '/learn/challenges' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
        flow_challenges(s, rep, lang)
        s.click(BACK_RX, wait=1200)
    # Saved tab
    if '/learn/reels' not in pg.url:
        s.goto('/learn/reels', wait=2500)
    s.click(re.compile(r'Saved|सेव'), wait=1500, nth=0)
    s.check('Saved tab (one saved reel)', hindi_a11y=False)
    rep.add('Saved tab', lang, 'lists the saved reel', 'PASS' if s.has(re.compile(r'Saving myths|बचत|Cash flow|1 / 1|1 / [1-9]'), 2) else 'FAIL', '')
    # voice door: long press on the voice switch
    sw = pg.get_by_role('switch').first
    bb = sw.bounding_box()
    pg.mouse.move(bb['x'] + 22, bb['y'] + 22); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(1500)
    rep.add('Voice switch long-press -> voice settings', lang, 'entry', 'PASS' if '/learn/voice' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
    if '/learn/voice' in pg.url:
        s.check('Voice settings (via long-press)', expect={'en': 'Reel voice', 'hi': 'आवाज़'})
        s.click(BACK_RX, wait=1200)
        rep.add('Voice settings', lang, 'back to the feed', 'PASS' if '/learn/reels' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
    # close the feed
    s.click(CLOSE_FEED, wait=1500)
    rep.add('Reels feed', lang, 'close', 'PASS' if '/learn/reels' not in pg.url else 'FAIL', pg.url.replace(BASE, ''))


def flow_challenges(s, rep, lang):
    pg = s.pg
    s.check('Challenges (before any start)', expect={'en': '7-day challenges', 'hi': '7 दिन की चुनौतियाँ'})
    n = pg.get_by_role('button', name=re.compile(r'^(Start|शुरू करें)', re.I)).count()
    rep.add('Challenges', lang, 'eight challenges listed', 'PASS' if n == 8 else 'FAIL', f'{n} Start buttons')
    # one challenge Start button has no name of its own: all of them are just "Start"
    names = {c['name'] for c in s.controls() if re.match(r'^(Start|शुरू करें)', c['name'], re.I)}
    rep.add('Challenges', lang, 'Start buttons name their challenge', 'PASS' if len(names) > 1 else 'FAIL', 'all eight buttons are named just "Start": a screen reader cannot tell them apart' if len(names) <= 1 else '')
    started = 0
    for i in range(8):
        loc = pg.get_by_role('button', name=re.compile(r'^(Start|शुरू करें)', re.I))
        if loc.count() == 0:
            break
        loc.first.click(); pg.wait_for_timeout(500); started += 1
    rep.add('Challenges', lang, 'all eight open (day 1 shown)', 'PASS' if started == 8 and len(re.findall(r'DAY 1 OF 7|दिन 1 / 7', s.text())) == 8 else 'FAIL', f'{started} started; {len(re.findall(r"DAY 1 OF 7|दिन 1 / 7", s.text()))} day-1 cards')
    s.check('Challenges (all eight open)', expect={'en': 'DAY 1 OF 7', 'hi': 'दिन 1 / 7'})
    # a task link works: the first "Open ->" or "Watch first" link
    link = pg.get_by_role('button', name=re.compile(r'Watch first|पहले देखें|→$')).first
    before = pg.url
    if link.count() and link.is_visible():
        link.scroll_into_view_if_needed(); link.click(); pg.wait_for_timeout(2000)
        moved = pg.url != before
        rep.add('Challenges: a task link', lang, 'opens its screen', 'PASS' if moved else 'FAIL', pg.url.replace(BASE, ''))
        if moved:
            ok = s.has(re.compile('.'), 1) and not smoke.UNMATCHED.search(s.text())
            rep.add('Challenges: task link target', lang, 'is a real screen', 'PASS' if ok else 'FAIL', pg.url.replace(BASE, ''))
            pg.go_back(); pg.wait_for_timeout(1500)
    else:
        rep.add('Challenges: a task link', lang, 'present', 'FAIL', 'no task link on day 1')


def flow_learn_entries(s, rep, lang):
    """Every reels screen from its documented entry card on the Learn index, with Back returning to it."""
    pg = s.pg
    s.goto('/learn', wait=2000)
    s.check('Learn index cards', expect={'en': 'Money reels', 'hi': 'मनी रील्स'}, hindi_a11y=True)
    cards = [
        ('Money Map', r'Money Map|मनी मैप', '/learn/map', {'en': 'Money Map', 'hi': 'मनी मैप'}),
        ('Story series', r'Story series|कहानी', '/learn/series', {'en': 'Story series', 'hi': 'कहानी'}),
        ('Reel voice', r'Reel voice|रील की आवाज़|आवाज़', '/learn/voice', {'en': 'Reel voice', 'hi': 'आवाज़'}),
        ('What the reels know', r'What the reels know|रीलें.*बारे|रील.*आपके बारे', '/learn/reels-data', {'en': 'What the reels know', 'hi': 'आपके बारे'}),
        ('My moves', r'My moves|मेरे काम', '/learn/moves', {'en': 'My moves', 'hi': 'मेरे काम'}),
        ('7-day challenges', r'7-day challenges|7 दिन की चुनौतियाँ', '/learn/challenges', {'en': '7-day challenges', 'hi': '7 दिन'}),
        ('Money reels', r'Money reels|मनी रील्स', '/learn/reels', {'en': 'Money reels', 'hi': 'मनी रील्स'}),
    ]
    for name, rx, path, expect in cards:
        s.goto('/learn', wait=1500)
        card = pg.get_by_role('button', name=re.compile(rx, re.I)).first
        if card.count() == 0:
            rep.add(f'Learn card: {name}', lang, 'entry', 'FAIL', 'no card on the Learn index'); continue
        card.click(); pg.wait_for_timeout(2200)
        ok = path in pg.url
        rep.add(f'Learn card: {name}', lang, 'entry', 'PASS' if ok else 'FAIL', '' if ok else pg.url.replace(BASE, ''))
        if not ok:
            continue
        if path == '/learn/series':
            s.check('Story series (from Learn)', expect=expect)
            first = pg.get_by_role('button', name=re.compile(r'First Salary|पहली सैलरी|पहली', re.I)).first
            if first.count():
                first.click(); pg.wait_for_timeout(2000)
                rep.add('Series list -> a series', lang, 'entry', 'PASS' if '/learn/series/' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
                s.check('Series screen (from the list)')
                if re.search(r'/learn/series/[^/]+$', pg.url):
                    s.click(BACK_RX, wait=1200)
                    rep.add('Series screen', lang, 'back to the list', 'PASS' if pg.url.rstrip('/').endswith('/learn/series') else 'FAIL', pg.url.replace(BASE, ''))
        elif path == '/learn/reels':
            if re.search(r'enough|इतना काफ़ी', s.text(), re.I) or True:
                s.check('Reels feed (from Learn, resumed)', expect=expect)
        elif path == '/learn/reels-data':
            flow_reels_data(s, rep, lang)
        else:
            nm = {'/learn/map': 'Money Map', '/learn/voice': 'Voice settings', '/learn/moves': 'My moves', '/learn/challenges': 'Challenges'}[path]
            if path != '/learn/challenges':
                s.check(nm + ' (from Learn)', expect=expect)
        # Back (or close) returns to the Learn index
        back = pg.get_by_role('button', name=re.compile(r'^(← )?(Back|वापस|पीछे)|Close reels|रील बंद', re.I)).first
        if back.count():
            back.click(); pg.wait_for_timeout(1500)
            ok = pg.url.rstrip('/').endswith('/learn')
            rep.add(f'Learn card: {name}', lang, 'back to Learn', 'PASS' if ok else 'FAIL', '' if ok else pg.url.replace(BASE, ''))
        else:
            rep.add(f'Learn card: {name}', lang, 'back to Learn', 'FAIL', 'no Back button')
    # Money Map: a topic opens the feed on that topic
    s.goto('/learn/map', wait=1800)
    row = pg.get_by_role('button', name=re.compile(r'^(Basics|बुनियादी)', re.I)).first
    if row.count():
        row.click(); pg.wait_for_timeout(2200)
        rep.add('Money Map: a topic', lang, 'opens the feed', 'PASS' if '/learn/reels' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
        s.check('Reels feed (from the Money Map topic)')


def flow_reels_data(s, rep, lang):
    pg = s.pg
    s.check('What the reels know about you', expect={'en': 'What the reels know about you', 'hi': 'आपके बारे'})
    # one reset, with the confirmation both ways: Cancel keeps it, OK forgets it
    btns = pg.get_by_role('button', name=re.compile(r'^(Empty my saved list|मेरी सेव सूची)', re.I))
    if btns.count() == 0:
        btns = pg.get_by_role('button', name=re.compile(r'^(Forget|Empty|Clear)', re.I))
    if btns.count() == 0:
        rep.add('Reels data: reset', lang, 'button found', 'FAIL', 'no reset button'); return
    before = pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('finos_session_reels')).map(k => k + ':' + localStorage.getItem(k).length).join(',')")
    s.dialogs.clear()
    s.dialog_answer = False
    btns.first.scroll_into_view_if_needed(); btns.first.click(); pg.wait_for_timeout(900)
    kept = pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('finos_session_reels')).map(k => k + ':' + localStorage.getItem(k).length).join(',')")
    rep.add('Reels data: reset', lang, 'asks before forgetting', 'PASS' if s.dialogs else 'FAIL', (s.dialogs[0][:80].replace('\n', ' ') if s.dialogs else 'no confirmation dialog'))
    rep.add('Reels data: reset', lang, 'Cancel keeps the data', 'PASS' if kept == before else 'FAIL', '' if kept == before else 'data changed after Cancel')
    if s.dialogs and lang == 'hi':
        left = hindi_leftovers(s.dialogs)
        rep.add('Reels data: confirmation text', lang, 'hindi-text', 'FAIL' if left else 'PASS', ' | '.join(left[:2]))
    s.dialog_answer = True
    btns.first.click(); pg.wait_for_timeout(1500)
    after = pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('finos_session_reels')).map(k => k + ':' + localStorage.getItem(k).length).join(',')")
    s.dialog_answer = False
    rep.add('Reels data: reset', lang, 'OK forgets it (and says so)', 'PASS' if after != before else 'FAIL', '' if after != before else 'storage unchanged after OK')
    s.check('What the reels know (after a reset)')


def flow_home_card_done(s, rep, lang):
    s.goto('/dashboard', wait=3000)
    s.check('Home card (after the first episode)', region=HOME_CARD_JS)
    card = s.pg.get_by_role('button').filter(has_text='🎬').first
    if card.count():
        card.click(); s.pg.wait_for_timeout(2200)
        rep.add('Home card -> feed', lang, 'entry', 'PASS' if '/learn/reels' in s.pg.url else 'FAIL', s.pg.url.replace(BASE, ''))
        s.pg.go_back(); s.pg.wait_for_timeout(1500)
    else:
        rep.add('Home card -> feed', lang, 'entry', 'FAIL', 'no card with the reels icon on Home')


def flow_health_and_diagnostics(s, rep, lang):
    pg = s.pg
    s.goto('/dashboard', wait=2000)
    s.pg.get_by_role('button', name=re.compile(r'^(Settings|सेटिंग)', re.I)).first.click(); pg.wait_for_timeout(1800)
    open_btn = pg.get_by_role('button', name=re.compile(r'^(Open|खोलें)$', re.I))
    # the Diagnostics "Open" is one of several "Open" buttons on Settings: find it by what its row says
    row = pg.locator('text=/Diagnostics|डायग्नोस्टिक|निदान/').first
    reached = False
    if row.count():
        row.scroll_into_view_if_needed()
        near = row.locator('xpath=ancestor::*[.//*[@role="button"]][1]').get_by_role('button', name=re.compile(r'^(Open|खोलें)$', re.I)).first
        if near.count():
            near.click(); pg.wait_for_timeout(2000); reached = '/diagnostics' in pg.url
    rep.add('Settings -> Diagnostics', lang, 'entry', 'PASS' if reached else 'FAIL', '' if reached else f'{pg.url.replace(BASE, "")}: no Diagnostics row with Open on Settings')
    if not reached:
        s.goto('/diagnostics', wait=2000)
    s.check('Diagnostics (from Settings)', expect={'en': 'Diagnostics', 'hi': 'डायग्नोस्टिक|Diagnostics'})
    # the link to Reels health
    link = pg.get_by_role('button', name=re.compile(r'Open reels health|रील.*सेहत|रील.*हेल्थ', re.I)).first
    if link.count():
        link.click(); pg.wait_for_timeout(2000)
        rep.add('Diagnostics -> Reels health', lang, 'entry', 'PASS' if '/learn/health' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
        s.check('Reels health (after an episode)', expect={'en': 'Reels health', 'hi': 'रील'})
        pg.get_by_role('button', name=BACK_RX).first.click(); pg.wait_for_timeout(1200)
        rep.add('Reels health', lang, 'back to Diagnostics', 'PASS' if '/diagnostics' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
    else:
        rep.add('Diagnostics -> Reels health', lang, 'entry', 'FAIL', 'no "Open reels health" link')
    link = pg.get_by_role('button', name=re.compile(r'What the reels know|रील.*बारे', re.I)).first
    if link.count():
        link.click(); pg.wait_for_timeout(2000)
        rep.add('Diagnostics -> What the reels know', lang, 'entry', 'PASS' if '/learn/reels-data' in pg.url else 'FAIL', pg.url.replace(BASE, ''))


def flow_arya_chip(s, rep, lang):
    pg = s.pg
    s.goto('/arya', wait=3000)
    q = 'What is a SIP?' if lang == 'en' else 'SIP क्या है?'
    inp = pg.locator('input,textarea').first
    inp.fill(q)
    pg.get_by_role('button', name=re.compile(r'Send message|संदेश भेजें|भेजें', re.I)).first.click()
    chip_rx = re.compile(r'Watch a 30-second reel|30 सेकंड की रील', re.I)
    end = time.time() + 90
    while time.time() < end and not s.exists(chip_rx):
        pg.wait_for_timeout(1000)
    if not s.exists(chip_rx):
        answered = not re.search(r'thinking|सोच', s.text())
        rep.add('Arya chip on a basic question', lang, 'chip shown', 'SKIP' if not answered else 'FAIL',
                'Arya did not answer in 90 s (backend not running?)' if not answered else 'Arya answered but no reel chip under it')
        return None
    s.check('Arya answer with the reel chip', hindi_a11y=False, region=ARYA_CHIP_JS, hindi_scope="""() => [...document.querySelectorAll('[role=button]')].filter(e => e.innerText.includes('🎬')).map(e => e.innerText.trim())""")
    s.click(chip_rx, wait=2500)
    rep.add('Arya chip -> reel', lang, 'opens the reel', 'PASS' if '/learn/reels' in pg.url else 'FAIL', pg.url.replace(BASE, ''))
    return True


def flow_together_via_reel(s, rep, lang):
    """The reel the Arya chip opens has a guess beat: use it to open Play together (the first episode may have none)."""
    pg = s.pg
    kind = wait_for_beat_or_quiz(s, 60)
    if kind == 'beat':
        s.check('Guess beat (SIP reel): question', hindi_a11y=False)
        beat_play(s, 'SIP reel')
    if not (s.has(re.compile(r'ONE QUICK QUESTION|एक छोटा सवाल', re.I), 1) or jump_to_quiz(s)):
        rep.add('Play together', lang, 'reached', 'FAIL', 'question never came'); return
    answer_quiz(s)
    if not s.exists('together'):
        rep.add('Play together', lang, 'button on a guess reel', 'FAIL', 'no Play together button after the question of the SIP reel'); return
    s.click('together', wait=900)
    s.check('Play together sheet: intro', modal=True, expect={'en': 'Play together', 'hi': 'साथ में खेलें'})
    s.click('start', wait=700)
    s.check('Play together sheet: first guess', modal=True)
    s.click('lock', wait=700)
    s.click(re.compile(r'second player|दूसरा खिलाड़ी हूँ', re.I), wait=700)
    s.click('lock', wait=900)
    s.check('Play together sheet: result', modal=True)
    s.click(SHEET_CLOSE, wait=600)


def flow_web_page(b, rep, lang):
    """html/reels.html (the website's version of the reels), at the same phone width."""
    import urllib.request
    try:
        urllib.request.urlopen(SITE + '/html/reels.html', timeout=4).read(100)
    except Exception as e:  # noqa: BLE001
        rep.add('html/reels.html', lang, 'served', 'SKIP', f'no static server at {SITE} ({str(e)[:50]}): run `python3 -m http.server 4200` in the repository root')
        return
    s = Session(b, rep, lang)
    s.pg.add_init_script(f"try {{ localStorage.setItem('finos_lang','{lang}'); }} catch (e) {{}}")
    s.goto('/html/reels.html', base=SITE, wait=3500)
    s.check('Web page html/reels.html', expect={'en': 'reel|Reel', 'hi': 'रील'}, skip=())
    s.close()


# ── the run ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

def preflight():
    import urllib.request
    try:
        html = urllib.request.urlopen(BASE + '/learn/reels', timeout=8).read(4000).decode('utf8', 'ignore')
    except Exception as e:  # noqa: BLE001
        print(f'The phone app\'s web preview is not answering at {BASE} ({str(e)[:70]}).\n'
              f'Start it (in mobile/): npx expo start --web --port 8082   (or the finos-mobile-web preview), or set BASE=http://localhost:<port>.')
        return False
    return True


def main():
    args = sys.argv[1:]
    langs = LANGS_ALL
    if '--lang' in args:
        langs = (args[args.index('--lang') + 1],)
    routes_only = '--routes' in args
    large = '--large' in args
    if not preflight():
        return 2
    rep = Report()
    t0 = time.time()
    with sync_playwright() as pw:
        try:
            b = pw.chromium.launch(channel='chromium')
        except Exception as e:  # noqa: BLE001
            print(f'Could not start Chromium ({str(e)[:90]}). Run: playwright install chromium')
            return 2
        for lang in langs:
            print(f'\n=== {lang.upper()} at {VIEW_W}x{VIEW_H}, text x{TEXT_SCALE} ===')
            if not routes_only:
                s = flow_cold_start(b, rep, lang)
                if s:
                    try:
                        if flow_episode(s, rep, lang):
                            flow_after_episode(s, rep, lang)
                        flow_home_card_done(s, rep, lang)
                        flow_learn_entries(s, rep, lang)
                        flow_health_and_diagnostics(s, rep, lang)
                        if flow_arya_chip(s, rep, lang):
                            flow_together_via_reel(s, rep, lang)
                    except Exception as e:  # noqa: BLE001
                        rep.add('flow crashed', lang, 'script', 'FAIL', f'{type(e).__name__}: {str(e)[:200]}')
                        s.shot('crash')
                    s.close()
                flow_web_page(b, rep, lang)
        run_routes(b, rep, langs)
        if large:
            print('\n=== 320 px wide, text x2 (routes) ===')
            run_routes(b, rep, langs, w=320, h=700, scale=2.0, tag=' @320/x2')
        b.close()
    c = rep.counts()
    os.makedirs(SHOTS, exist_ok=True)
    with open(os.path.join(SHOTS, 'results.json'), 'w') as f:
        json.dump({'view': [VIEW_W, VIEW_H], 'text_scale': TEXT_SCALE, 'counts': c, 'harmless_warnings': rep.warn_kinds, 'rows': rep.rows}, f, indent=1, ensure_ascii=False)
    with open(os.path.join(SHOTS, 'results.md'), 'w') as f:
        f.write(rep.markdown() + '\n')
    print(f"\n{c['PASS']} PASS, {c['FAIL']} FAIL, {c['WARN']} warn, {c['SKIP']} skip in {int(time.time() - t0)} s. Known harmless web-only warnings: {rep.warn_kinds or 'none seen'}. Details: {SHOTS}/results.json")
    return 1 if c['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
