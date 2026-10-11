# Privacy and consent

The privacy notice (`html/privacy.html`) is **generated from an audited registry**, `FLOWS` in `js/finos-privacy.js`, so it can only say what the code does. `html/terms.html` is a short draft in the same style.

**Both pages are drafts.** They have not been reviewed by a lawyer, and the operator name, address and grievance officer are deliberately left unset (`FinosPrivacy.ENTITY`, shown on the page as "Not set yet"). Both must be done before launch. Nothing in the registry or pages invents a company, an officer or a legal clause.

## The registry and its guard

Every outside host the app references (page assets, the account service, market data and its relay, local AI services, plain links) has a flow: what it is for, what is sent, whether it carries the user's own data (`personal`), whether it is optional, and what control the user has.

`tests/privacy.test.js` scans `js/`, `html/`, `css/`, `index.html`, `login.html`, `sw.js` and `manifest.json` for hosts and **fails if one is not covered**. Adding a script from a new CDN, an analytics tag or a new API therefore cannot ship without updating the registry, and therefore the notice. The same test proves the scan works (it must find known hosts, lookalike hosts such as `notsupabase.co` never match, and a deliberately missing host is reported).

To add a host: put it in the right flow's `hosts` (or add a flow), and be honest in `sent` and `personal`. Only `account`, `ai` and `device` may be `personal`; a test pins that list.

## Consent

`FinosPrivacy.consent` stores records under `finos_consents`. DPDP-style rules are built in:
- Everything is **off by default**; visiting the page records nothing.
- Only a literal `true` for a known purpose at the current wording `VERSION` counts as a yes, so a changed purpose never inherits an old yes.
- Withdrawal is one click and takes effect immediately (`set(id, false)`, `withdrawAll()`); each record keeps when it changed.
- If the choice cannot be saved (storage blocked), the switch snaps back and says so. It never shows "on" for something that was not recorded.
- Purposes today: `feedback` and `usage`. Anything that sends data to the team must check `FinosPrivacy.consent.get(id)` first.

## Where it is linked

Landing page footer and the sign-up line on the login page (both used to link to `#`), the Settings → Data & Privacy section ("Privacy Notice"), and the search index.

## Rights

The page maps each DPDP right to a control that already exists (export, edit, delete data or account, withdraw consent) and names the grievance officer once set. Export and deletion live in Settings (`js/finos-store.js`, `js/finos-vault.js`).

## Not done

Legal review; operator and grievance details; a cookie banner (the app sets none, only first-party storage); a data-processing agreement with the account provider; server-side retention rules (the account service is currently unreachable).
