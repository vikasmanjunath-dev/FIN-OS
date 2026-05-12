# TradeBook Pro — Cloud Sync Setup Guide

## What you need
- A free Google account
- 5 minutes

---

## Step 1 — Create Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it anything (e.g. `tradebook-pro`)
4. Disable Google Analytics (not needed) → **Create project**

---

## Step 2 — Create Realtime Database

1. In your project, click **"Realtime Database"** in the left sidebar
2. Click **"Create Database"**
3. Choose your region (pick the closest to you)
4. Select **"Start in test mode"** → **Enable**

> ⚠️ Test mode allows read/write for 30 days. After that, set up security rules (see Step 4).

---

## Step 3 — Get Your Database URL

1. In Realtime Database, look at the top — you'll see a URL like:
   ```
   https://tradebook-pro-default-rtdb.firebaseio.com
   ```
2. Copy that URL.

---

## Step 4 — Update sync.js

Open `sync.js` and replace line 31:

```javascript
// BEFORE:
const FIREBASE_DB_URL = 'https://tradebook-pro-default-rtdb.firebaseio.com';

// AFTER (paste your actual URL):
const FIREBASE_DB_URL = 'https://YOUR-PROJECT-ID-default-rtdb.firebaseio.com';
```

---

## Step 5 — Set Security Rules (Important!)

In Firebase Console → Realtime Database → **Rules** tab, paste:

```json
{
  "rules": {
    "vaults": {
      "$vaultId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Click **Publish**. This allows any device with the correct vault ID (derived from the password hash) to read/write that vault.

---

## Step 6 — Deploy & Use

Put all your files on any web host (GitHub Pages, Netlify, Vercel — all free):

```bash
# GitHub Pages example:
git init
git add .
git commit -m "TradeBook Pro"
git remote add origin https://github.com/YOURNAME/tradebook.git
git push -u origin main
# Then enable GitHub Pages in repo Settings → Pages
```

---

## How the Password System Works

| Action | What happens |
|--------|-------------|
| Enter password | SHA-256 hashed in browser — never sent in plaintext |
| Hash becomes vault ID | All data stored at `/vaults/{hash}/` in Firebase |
| Same password, different device | Same vault ID → same data → real-time sync |
| Different password | Different hash → completely separate vault |
| Close browser | Session ends. Re-enter password next time. |

**Your password is never stored anywhere.** Only its SHA-256 hash is used as a database key.

---

## Multi-Device Usage

1. Open the app on Device A → enter password → start trading
2. Open the app on Device B → enter **same password** → automatically syncs all data
3. Log a trade on Device A → appears on Device B within ~1 second

---

## Data Stored Per Vault

- All trades (`tradebook_trades`)
- Settings (`tradebook_settings`)
- Trading rules, custom tags, challenges
- Mood journal, audit trail, snapshots
- Themes, badges, dismissed insights

---

## Privacy

- Your vault password is never transmitted
- Data is stored in your own Firebase project (you own it)
- You can delete your data anytime from the Firebase console
- Firebase free tier: 1GB storage, 10GB/month bandwidth — more than enough

---

## Troubleshooting

**"Connection error" on login**
→ Check your `FIREBASE_DB_URL` in sync.js is correct and includes `https://`

**Data not syncing between devices**  
→ Make sure both devices use the exact same password (case-sensitive)

**"sync failed" toast appears**  
→ Usually a temporary network issue — data is saved locally and will sync when connection restores

**After 30 days, getting permission errors**  
→ Update your Firebase security rules as shown in Step 5

---

*TradeBook Pro Sync — built on Firebase Realtime Database (free tier)*
