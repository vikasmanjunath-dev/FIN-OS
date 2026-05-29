#!/usr/bin/env bash
# inject-arya-ai.sh — Adds AryaAI explainer to every calculator HTML file
# Run once from the /calculators/ directory: bash inject-arya-ai.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JS_PATH="../../js/arya-ai.js"

# Calculate depth relative to each subdirectory
added=0; skipped=0

while IFS= read -r -d '' file; do
  # Skip files already injected
  if grep -q "arya-ai.js" "$file"; then
    ((skipped++))
    continue
  fi

  # Determine relative path to js/arya-ai.js based on depth
  dir=$(dirname "$file")
  rel=$(python3 -c "
import os, sys
file = sys.argv[1]
root = sys.argv[2]
rel = os.path.relpath(root + '/js/arya-ai.js', os.path.dirname(file))
print(rel)
" "$file" "$SCRIPT_DIR/..")

  # Inject <script> tag after first Chart.js or after </style> or before </head>
  if grep -q "chart.js" "$file"; then
    sed -i '' "s|<script src=\"https://cdn.jsdelivr.net/npm/chart.js\"></script>|<script src=\"https://cdn.jsdelivr.net/npm/chart.js\"></script>\n  <script src=\"$rel\"></script>|g" "$file"
  elif grep -q "</style>" "$file"; then
    sed -i '' "s|</style>|</style>\n  <script src=\"$rel\"></script>|" "$file"
  else
    sed -i '' "s|</head>|  <script src=\"$rel\"></script>\n</head>|" "$file"
  fi

  echo "  ✅ Injected → $file"
  ((added++))
done < <(find "$SCRIPT_DIR" -name "*.html" -not -path "*node_modules*" -print0)

echo ""
echo "Done: $added files injected, $skipped already had arya-ai.js"
