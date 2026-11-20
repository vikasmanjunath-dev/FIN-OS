#!/bin/bash
# One command that proves the SML work is intact (ROADMAP F10). Prints both test totals; exits non-zero on any failure.
#   sml/scripts/verify.sh
# Checks: (1) tracked model checksums (SHA256SUMS per router version; missing binaries are reported, not failed: they are git-ignored),
# (2) python: sml tests (they also check sml/data/MANIFEST.json hashes and held-out coverage) + rag-engine/evaluation, (3) node tests.
cd "$(dirname "$0")/../.." || exit 2
fail=0

echo "== router model checksums"
for d in sml/models/router/*/; do
  v=$(basename "$d")
  [ -f "$d/SHA256SUMS" ] || { echo "  $v: no SHA256SUMS"; fail=1; continue; }
  missing=0; bad=0
  while read -r sum file; do
    if [ ! -f "$d/$file" ]; then missing=$((missing+1)); continue; fi
    got=$(shasum -a 256 "$d/$file" | cut -d' ' -f1)
    [ "$got" = "$sum" ] || { echo "  $v: $file CHANGED (expected ${sum:0:12}, got ${got:0:12})"; bad=1; }
  done < "$d/SHA256SUMS"
  [ "$bad" = 0 ] || fail=1
  note=""; [ "$missing" -gt 0 ] && note=" ($missing file(s) not present locally)"
  [ "$bad" = 0 ] && echo "  $v: ok$note"
done

echo "== python (sml + rag-engine evaluation)"
py=$(rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q 2>&1 | tail -1)
echo "  $py"
case "$py" in *failed*|*error*) fail=1;; esac

echo "== javascript"
js=$(node --test tests/*.test.js sml/tests/js/*.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail) " | tr '\n' ' ')
echo "  $js"
case "$js" in *"fail 0"*) ;; *) fail=1;; esac

[ "$fail" = 0 ] && echo "ALL GOOD" || echo "PROBLEMS FOUND"
exit $fail
