# FIN·OS Mobile

Expo (SDK 53) / React Native app that mirrors the FIN·OS website's trackers and portfolio on a phone.
Full documentation: [`../docs/MOBILE_APP.md`](../docs/MOBILE_APP.md).

```bash
npm install --legacy-peer-deps
npx expo start --web --port 8082     # or: npm run ios / npm run android
```

- Backend: start `../arya-ai/start.sh` (port 7475). Set a different host in the app's Settings if it isn't on this machine.
- Cloud login/sync is optional: copy `.env.example` to `.env` and fill in a Supabase URL + anon key. Without it the app runs in guest mode.
  Run `../supabase/holdings.sql` in that project first.
- Checks: `npm test` (parity tests against the website's JS) and `npm run typecheck`.
- Device builds: `eas.json` has development / preview / production profiles (none run yet).
- Layout: `app/` screens · `components/` · `hooks/` · `lib/` pure logic and storage · `constants/` endpoints and theme.

Status: works in guest mode; Supabase sync untested against a live project; EAS build profiles exist but no device build has been run.
