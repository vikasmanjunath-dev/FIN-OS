# FIN-OS Build Scripts

> Node.js utilities for deployment preparation  
> **Updated:** July 2026

---

## Scripts

### `inject-sw-version.js`

Stamps the current git SHA (or timestamp fallback) into `sw.js` as the cache version string before each Vercel deploy.

**Why this exists:** The service worker (`sw.js`) caches all static assets for offline use. When files change, browsers need a new cache version to evict the old cache and fetch fresh files. Without this, users get stuck on old cached versions after deploy.

**How it works:**

```
1. Read git SHA:  git rev-parse --short HEAD  →  "a3f9c12"
2. Build version: "finos-a3f9c12"
3. Replace __CACHE_VERSION__ placeholder in sw.js with the version string
4. Write sw.js back to disk
```

If git is not available (e.g., CI environment without git history), it falls back to a base-36 timestamp (`finos-lz4k8p`).

**Usage:**

```bash
# Run before deploying
node scripts/inject-sw-version.js

# Or add to package.json as a pre-build hook:
# "prebuild": "node scripts/inject-sw-version.js"
```

**Expected output:**

```
✅ sw.js cache version stamped: finos-a3f9c12
```

---

## Adding New Scripts

Place any new build/deploy utilities here. Common additions:

| Script | Purpose |
|---|---|
| `validate-calculators.js` | Check all 88 calculator filenames match `js/calculators.js` |
| `check-fouc.js` | Verify anti-FOUC script is present in all HTML pages |
| `audit-tokens.js` | Check CSS token usage across all 45 stylesheets |
