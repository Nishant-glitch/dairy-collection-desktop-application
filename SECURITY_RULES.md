# Firebase Security Rules (IMPORTANT)

The app's `isAdmin()` check in `src/utils/userDb.ts` only runs in the browser,
so it controls what the UI *shows* — it does **not** protect the data. Real
protection must live in the Firebase Realtime Database security rules.

The correct rules are in [`database.rules.json`](./database.rules.json):

- `users/$uid` — a logged-in user can only read/write their **own** data
  (`auth.uid === $uid`). This stops one farmer/DCS from reading another's data.
- `globalRateConfig` — any logged-in user can read the rate chart, but only the
  admin (`auth.token.email === 'admin@nishant.com'`) can write/upload it.
- Everything else is denied by default.

## How to deploy the rules (one-time)

These rules are NOT applied automatically. Deploy them with either:

**Option A — Firebase Console**
1. Open Firebase Console → Realtime Database → Rules tab.
2. Paste the contents of `database.rules.json`.
3. Click **Publish**.

**Option B — Firebase CLI**
```bash
firebase deploy --only database
```
(ensure `firebase.json` points `"database": { "rules": "database.rules.json" }`)

> Until these rules are published, the database is unprotected regardless of the
> in-app admin check.
