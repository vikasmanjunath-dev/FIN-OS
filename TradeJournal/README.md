# TradeBook Pro (TradeJournal)

A standalone, no-build trading journal: plain HTML/CSS/JS served as static files, data kept in the browser's
`localStorage`, with optional cross-device sync through Supabase. Charts use Chart.js from cdnjs; screenshot OCR uses Tesseract.js.

- App: `index.html` (pages: Dashboard, Journal, Add Trade, Analytics hub, Psychology hub, Tools hub, Institutional hub, Settings)
- Marketing page: `landing.html`
- Cloud sync setup: [`setup.md`](setup.md) and `supabase_setup.sql`

## Run

```bash
python3 -m http.server 8090 --directory .
# open http://localhost:8090/index.html
```
(Claude Code: `preview_start tradejournal`, defined in `Finos/.claude/launch.json`.) No install step.

## Files

| File | Role |
| --- | --- |
| `app.js` | Data layer (`tradebook_*` localStorage keys), trade log, charts, analytics, psychology, tools, export, themes, gamification |
| `upgrades.js`, `features-v2.js`, `insights.js`, `stats.js`, `hub_upgrades.js`, `dynamic.js` | Feature layers loaded after `app.js` |
| `fixes.js`, `hub_fix.js` | Patches applied on top of the above |
| `scan-trade.js` (+ `.css`) | Broker-screenshot OCR (Zerodha, Groww, Upstox, Angel One, generic) → pre-fills the trade form |
| `arya-tradebook.js` | Arya AI coach. Talks to **Ollama directly** at `http://localhost:11434` (default model `qwen3:14b`), not through the `arya-ai` backend |
| `sync.js` | Supabase sync (see below) |
| `landing.*`, `showcase.*` | Landing / showcase pages |
| `design.css`, `style.css`, `features-v2.css`, `upgrades.css`, `mobile.css` | Styles |
| `test-nav.html` | Manual navigation test page |

Script order matters: `sync.js` → `dynamic.js` → `app.js` → `insights.js` → `hub_upgrades.js` → `stats.js` → … → `fixes.js` → `hub_fix.js` (see the bottom of `index.html`).

## Data

`localStorage` is the working copy. Main keys: `tradebook_trades`, `tradebook_settings`, `tradebook_tags`, `tradebook_rules`.
Clearing site data erases an un-synced journal — export before doing so.

## Cloud sync

Optional. Bring your own Supabase project, run `supabase_setup.sql`, then enter the URL and anon key under Settings → Cloud Sync.
The sync "vault" id is a PBKDF2-SHA256 hash of the user's phone number, computed in the browser; the same phone number on another
device opens the same vault. Details and troubleshooting: [`setup.md`](setup.md).

**Security caveat:** the RLS policies in `supabase_setup.sql` are `using (true)`, so anyone holding your project's anon key can read
or write every vault. Isolation relies on the vault id being unguessable, not on database rules. Fine for a single-owner project;
don't share the anon key, and don't treat this as multi-tenant-safe.

## Relationship to FIN·OS

Separate app from the main platform: it has its own localStorage keys, its own Supabase project and no shared login with `js/auth.js`.
`tradebook-pro` in `.claude/launch.json` points at a different copy at `~/Desktop/TradeBook`.
