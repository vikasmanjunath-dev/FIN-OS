#!/usr/bin/env python3
"""Contrast audit of the phone app's light theme, run against the Expo web preview.

    npx expo start --web --port 8082            # in mobile/
    python3 mobile/scripts/theme-audit.py       # all routes, or:  ... /dashboard /tools/score

For every visible text node it composites the text colour and the nearest backgrounds, and reports pairs under WCAG AA
(4.5:1, or 3:1 for large / bold text). Exits 1 if anything is found. Screenshots go to $THEME_AUDIT_SHOTS (default /tmp/theme-audit).
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8082')
SHOTS = os.environ.get('THEME_AUDIT_SHOTS', '/tmp/theme-audit')
MODE = os.environ.get('THEME', 'light')
ROUTES = sys.argv[1:] or ['/dashboard', '/markets', '/portfolio', '/arya', '/track', '/settings', '/search', '/profile', '/tools/score', '/tools/calculators',
    '/tools/calc/sip', '/tools/calc/hra', '/tools/realestate', '/tools/report', '/tools/retirement', '/tools/taxplanner', '/tools/dna', '/tools/calendar',
    '/tracker/health', '/tracker/budget', '/tracker/networth', '/tracker/transactions', '/tracker/insurance', '/tracker/harvest', '/tracker/emergency',
    '/tools/homeloan', '/tools/debt']

JS = r"""
() => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const lum = c => { const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const over = (top, bot) => ({ r: top.r*top.a+bot.r*(1-top.a), g: top.g*top.a+bot.g*(1-top.a), b: top.b*top.a+bot.b*(1-top.a), a:1 });
  const bgOf = el => { const chain=[]; for(let e=el;e;e=e.parentElement){ const c=parse(getComputedStyle(e).backgroundColor); if(c&&c.a>0){chain.push(c); if(c.a>=1) break;} } let bg={r:244,g:246,b:250,a:1}; for(let i=chain.length-1;i>=0;i--) bg=over(chain[i],bg); return bg; };
  const out=[]; const seen=new Set();
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let n; while(n=walker.nextNode()){
    const t=n.textContent.trim(); if(!t) continue; const el=n.parentElement; if(!el) continue;
    const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0) continue;
    const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) continue;
    let fg=parse(cs.color); if(!fg) continue;
    const bg=bgOf(el); const f=over(fg,bg);
    const L1=lum(f), L2=lum(bg); const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const size=parseFloat(cs.fontSize); const bold=parseInt(cs.fontWeight)>=700;
    const need=(size>=18||(size>=14&&bold))?3:4.5;
    if(ratio<need){ const k=t.slice(0,30)+'|'+cs.color; if(!seen.has(k)){seen.add(k); out.push({t:t.slice(0,40), fg:cs.color, bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, ratio:+ratio.toFixed(2), size}); } }
  }
  return out;
}
"""


def main():
    os.makedirs(SHOTS, exist_ok=True)
    total = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel='chromium')
        ctx = b.new_context(viewport={'width': 430, 'height': 900})
        ctx.add_init_script(f"localStorage.setItem('finos_theme_mobile','{MODE}')")
        pg = ctx.new_page()
        for r in ROUTES:
            pg.goto(BASE + r, wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
            bad = pg.evaluate(JS)
            pg.screenshot(path=os.path.join(SHOTS, MODE + r.replace('/', '_') + '.png'))
            print(r, 'low-contrast:', len(bad))
            for x in bad[:6]: print('   ', x)
            total += len(bad)
        b.close()
    print('TOTAL', total)
    return 1 if total else 0

if __name__ == '__main__':
    sys.exit(main())
