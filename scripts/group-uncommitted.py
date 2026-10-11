#!/usr/bin/env python3
"""Sort the uncommitted files into reviewable commit groups and print a `git add` for each.

Several people and sessions edit this tree at once, so the list is generated, not written down. Nothing is staged or committed.

  python3 scripts/group-uncommitted.py            # groups with file counts
  python3 scripts/group-uncommitted.py --files    # also list the files in each group
"""
import re
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAG = re.compile(r'^[+-]\s*<(script|link)\b[^>]*>\s*(</script>)?\s*$')


def git(*a):
    return subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True).stdout


def entries():
    out = []
    for e in git('status', '--short', '-z').split('\0'):
        if e:
            out.append((e[:2].strip(), e[3:]))
    return out


def only_asset_tags(path):
    changed = [l for l in git('diff', '-U0', '--', path).split('\n') if l and l[0] in '+-' and not l.startswith(('+++', '---'))]
    return bool(changed) and all(TAG.match(l) or re.search(r'\?v=\d+', l) for l in changed)


GROUPS = OrderedDict([
    ('search-lazy-index', ('Search index loads on first use; perf budgets tightened; pending-work note',
        lambda f: f in {'js/finos-search.js', 'js/finos-search-index.js', 'scripts/build-search-index.js', 'tests/static_audit.py', 'tests/README.md',
                        'README.md', 'tests/perf_budget.json', 'tests/test_search_lazy.py', 'docs/PENDING.md', 'scripts/group-uncommitted.py'})),
    ('mobile-supabase-sync', ('Mobile app, Supabase SQL, tracker sync (web v2 + mobile)',
        lambda f: f.startswith(('mobile/', 'supabase/')) or f in {'js/finos-tracker-sync.js', 'js/supabase-config.js', 'tests/tracker-sync.test.js',
                        'docs/MOBILE_APP.md', 'docs/DATABASE.md', 'docs/PRD.md', 'docs/BRD.md', 'docs/ARD.md', 'docs/NFRD.md'})),
    ('backend', ('arya-ai backend and alerts schema',
        lambda f: f.startswith(('arya-ai/', 'alerts/')) and not f.endswith(('.db-shm', '.db-wal')))),
    ('runtime-db-files', ('SQLite runtime files tracked by mistake: untrack and ignore, do not commit changes',
        lambda f: f.endswith(('.db-shm', '.db-wal', '.db')))),
    ('scratch-at-root', ('Patches and commit-message scratch files at the repo root: delete or keep outside the repo',
        lambda f: '/' not in f and f.endswith(('.patch', '.txt')))),
])


def main():
    show = '--files' in sys.argv
    buckets = OrderedDict((k, []) for k in GROUPS)
    buckets['asset-tags'] = []
    buckets['review'] = []
    for st, f in entries():
        for k, (_, pred) in GROUPS.items():
            if pred(f):
                buckets[k].append(f)
                break
        else:
            (buckets['asset-tags'] if st != '??' and f.endswith('.html') and only_asset_tags(f) else buckets['review']).append(f)
    titles = {k: v[0] for k, v in GROUPS.items()}
    titles['asset-tags'] = 'Cache-busting ?v= bumps and script/link tags only (commit WITH the js/css they refer to)'
    titles['review'] = 'Everything else: needs a human look at what changed and why'
    for k, files in buckets.items():
        if not files:
            continue
        print(f'\n## {k} ({len(files)}): {titles[k]}')
        if show or k in ('search-lazy-index', 'backend', 'runtime-db-files', 'scratch-at-root'):
            for f in files:
                print('   ', f)
        elif k == 'review':                                   # too long to list by default: show where they are
            per = {}
            for f in files:
                per.setdefault(f.split('/')[0] if '/' in f else '(root)', []).append(f)
            for d, fs in sorted(per.items(), key=lambda x: -len(x[1])):
                print(f'    {len(fs):4}  {d}/   (use --files to list)')
    print('\nNothing was staged. Stage a group with: git add -- <files>')


if __name__ == '__main__':
    main()
