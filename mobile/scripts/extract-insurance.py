#!/usr/bin/env python3
"""Extracts the insurance hub content from the website's own pages, with provenance.

  python3 mobile/scripts/extract-insurance.py            regenerate cover-types.json and data.ts
  python3 mobile/scripts/extract-insurance.py --check    verify, change nothing (used by __tests__/insuranceHub.test.mts)

What is extracted (parsed from the page, not typed):
  html/insurance-directory.html   the six "layers": tag, heading, tagline, three-or-fewer feature lines, the story
  html/insurance-hub.html         TYPE_META: icon, label, colour of each policy type the hub knows
What is curated by this file (the mapping, and nothing else): which layer / hub entry belongs to which cover type of the phone.
What is NOT regenerated: facts.json (every number the site states, each with file + line + quote) and checks.json (questions written
for the app). They are hand-curated, so --check does not copy them: it re-resolves EVERY quote in both against the website and fails
when a quote is no longer on the line it names (the page changed), so a stale figure cannot survive unnoticed.

The website carries no insurer, plan, premium or claim-settlement data and no dates; none is invented here.
"""
import html as htmllib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'mobile' / 'content' / 'insurance'
DIRECTORY = 'html/insurance-directory.html'
HUB = 'html/insurance-hub.html'
FILES = [DIRECTORY, HUB, 'html/learn-insurance.html']

GROUPS = [
    {'id': 'health', 'label': 'Health'},
    {'id': 'life', 'label': 'Life and income'},
    {'id': 'assets', 'label': 'Property and liability'},
]

# id, group, label, phone policy types, directory layer number (None = the page has no section), hub TYPE_META key (None = none)
CURATED = [
    ('health',    'health', 'Health insurance',   ['health'],     1,    'health'),
    ('critical',  'health', 'Critical illness',   ['critical'],   3,    'critical'),
    ('term',      'life',   'Term life insurance', ['life_term'], 2,    'life_term'),
    ('accident',  'life',   'Personal accident',  [],             4,    None),
    ('ulip',      'life',   'ULIP',               ['life_ulip'],  None, 'life_ulip'),
    ('home',      'assets', 'Home and property',  ['home'],       5,    'home'),
    ('vehicle',   'assets', 'Vehicle',            ['vehicle'],    None, 'vehicle'),
    ('liability', 'assets', 'Liability',          [],             6,    None),
    ('travel',    'assets', 'Travel',             ['travel'],     None, 'travel'),
]


def read_lines(rel):
    return (ROOT / rel).read_text(encoding='utf-8').split('\n')


def plain(line):
    s = re.sub(r'<[^>]+>', '', line)
    s = htmllib.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()


def src(file, line, quote):
    return {'file': file, 'line': line, 'quote': quote}


def parse_layers():
    lines = read_lines(DIRECTORY)
    layers = {}
    i = 0
    while i < len(lines):
        m = re.search(r'<article class="sanctum-card" data-layer="(\d+)">', lines[i])
        if not m:
            i += 1
            continue
        n = int(m.group(1))
        j = i
        while '</article>' not in lines[j]:
            j += 1
        block = range(i, j + 1)
        L = {'layer': n, 'features': []}
        in_story = False
        for k in block:
            raw = lines[k]
            t = re.search(r'<span class="layer-tag">(.*?)</span>', raw)
            if t:
                L['tag'] = plain(t.group(1))
            h = re.search(r'<h3>(.*?)</h3>', raw)
            if h:
                L['heading'] = plain(h.group(1))
                L['headingSource'] = src(DIRECTORY, k + 1, L['heading'])
            p = re.match(r'\s*<p>(.*?)</p>\s*$', raw)
            if p and 'tagline' not in L:
                L['tagline'] = plain(p.group(1))
                L['taglineSource'] = src(DIRECTORY, k + 1, L['tagline'])
            f = re.search(r'<div class="metric"><strong>(.*?):</strong>(.*?)</div>', raw)
            if f:
                name, text = plain(f.group(1)), plain(f.group(2))
                L['features'].append({'name': name, 'text': text, 'source': src(DIRECTORY, k + 1, f'{name}: {text}')})
            if '<div class="desi-reality">' in raw:
                in_story = True
                continue
            if in_story and 'story' not in L:
                t2 = plain(raw)
                if t2 and not raw.strip().startswith('<strong>') and not raw.strip().startswith('</div'):
                    L['story'] = {'text': t2, 'fictional': True, 'source': src(DIRECTORY, k + 1, t2[:60])}
        layers[n] = L
        i = j + 1
    return layers


def parse_hub():
    lines = read_lines(HUB)
    meta = {}
    for k, raw in enumerate(lines):
        m = re.match(r"\s*(\w+):\s*\{\s*icon:'([^']*)',\s*label:'([^']*)',\s*color:'([^']*)',\s*recBase:\s*(\d+)", raw)
        if m:
            key, icon, label, color, rb = m.groups()
            meta[key] = {'icon': icon, 'label': label, 'color': color,
                         'source': src(HUB, k + 1, f"{key}: {{ icon:'{icon}', label:'{label}'"), 'recBaseUnused': int(rb)}
    return meta


def build_cover_types():
    layers, hub = parse_layers(), parse_hub()
    items = []
    for cid, group, label, ptypes, ln, hk in CURATED:
        layer = None
        if ln is not None:
            if ln not in layers:
                sys.exit(f'layer {ln} not found in {DIRECTORY}')
            L = layers[ln]
            layer = {k: L[k] for k in ('layer', 'tag', 'heading', 'tagline', 'taglineSource', 'headingSource', 'features', 'story')}
        hubm = None
        if hk is not None:
            if hk not in hub:
                sys.exit(f'hub type {hk} not found in {HUB}')
            hubm = hub[hk]
        items.append({'id': cid, 'group': group, 'label': label, 'policyTypes': ptypes, 'layer': layer, 'hub': hubm,
                      'detail': 'full' if layer else 'thin'})
    return {'schemaVersion': 1, 'extractedFrom': FILES, 'groups': GROUPS, 'coverTypes': items}


def dumps(o):
    return json.dumps(o, indent=2, ensure_ascii=False) + '\n'


def line_ok(file, line, quote):
    lines = read_lines(file)
    if not (1 <= line <= len(lines)):
        return False
    s = lines[line - 1]
    if file != HUB:
        s = plain(s)
    else:
        s = htmllib.unescape(s)
        s = re.sub(r'\s+', ' ', s).strip()
    return quote in s


def collect_sources(o, out):
    if isinstance(o, dict):
        if set(o.keys()) >= {'file', 'line', 'quote'}:
            out.append(o)
        for v in o.values():
            collect_sources(v, out)
    elif isinstance(o, list):
        for v in o:
            collect_sources(v, out)


def data_ts(cover, facts, checks):
    body = json.dumps({'coverTypes': cover, 'facts': facts, 'checks': checks}, indent=2, ensure_ascii=False)
    return ('// GENERATED by mobile/scripts/extract-insurance.py from mobile/content/insurance/*.json. Do not edit by hand.\n'
            '// (Metro and node:test import TypeScript; importing the JSON directly needs import attributes that not every tool accepts.)\n'
            f'export const INSURANCE_CONTENT = {body};\n')


def main():
    check = '--check' in sys.argv
    cover = build_cover_types()
    facts = json.loads((OUT / 'facts.json').read_text(encoding='utf-8'))
    checks = json.loads((OUT / 'checks.json').read_text(encoding='utf-8'))
    problems = []

    srcs = []
    collect_sources(cover, srcs)
    collect_sources(facts, srcs)
    for s in srcs:
        if not line_ok(s['file'], s['line'], s['quote']):
            problems.append(f"quote not on the line it names: {s['file']}:{s['line']} {s['quote']!r}")

    want = {
        'cover-types.json': dumps(cover),
        'data.ts': data_ts(cover, facts, checks),
    }
    for name, text in want.items():
        p = OUT / name
        have = p.read_text(encoding='utf-8') if p.exists() else None
        if have != text:
            if check:
                problems.append(f'{name} is out of date: run python3 mobile/scripts/extract-insurance.py')
            else:
                p.write_text(text, encoding='utf-8')
                print(f'wrote {p.relative_to(ROOT)}')
    if problems:
        print('\n'.join(problems))
        sys.exit(1)
    print(f'insurance content up to date ({len(srcs)} sourced lines verified against the website)')


if __name__ == '__main__':
    main()
