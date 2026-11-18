# Bar Code Finder

A phone web app for bar inventory counts: snap a bottle that won't scan and get its barcode from the inventory sheets, count bottles together as a team, and keep a shared list of bottles that need a SKU.

- Runs in Chrome on any phone; add it to the home screen to use it like an app. It opens from the phone's own copy (quick on a weak signal) and offers **Reload** when a newer version has downloaded.
- Labels and bottle barcodes are read on the phone itself, so snaps work offline. **Live scan** reads bottle barcodes from the camera continuously.
- When online, and a manager has turned AI on in the manager page, the photo is also matched by Gemini through **Firebase AI Logic** (`ai.js`). The Gemini key lives in the Firebase project, not on phones. Turn it on in the Firebase console: **AI Logic → Get started → Gemini Developer API**. Optional but recommended: set up **App Check** (reCAPTCHA Enterprise), put its site key in `config.js` as `APP_CHECK_SITE_KEY`, and enforce App Check for AI Logic.
- The item list is encrypted in `data/items.enc.json` and only opens with the team code that comes in the team's app link (`…/#t=<code>`). The code is not stored in this repository.
- Shared photos, linked barcodes, counts, the No SKU list and uploaded sheet lists are kept in Firebase (Firestore) under a team id derived from that code. Paste `firestore.rules` into the Firebase console's Firestore → Rules tab, replacing `ADMIN_PASSWORD` with the manager password (it is checked there and kept out of this repository). Only managers can change the item list.
- Counts are shared: each phone's number for an item is kept separately and added up. Pinned and recent items stay on each phone.
- Shared changes are logged for 30 days so a manager can undo them, and a manager can turn off access for individual phones.

## Code

Firebase settings go in `config.js`. The app's code is in `js/`, loaded in order by `index.html` (each file can use what the earlier ones set up):

| File | What it does |
|---|---|
| `js/core.js` | Barcode drawing, helpers, team code, item list, text matching |
| `js/scan.js` | Bottle barcodes, label reading, photo matching, snap, shelf scan, AI |
| `js/ui.js` | Item cards, taps, tabs, full-screen barcode, help, search, photos |
| `js/count.js` | Count tab (shared team count) |
| `js/nosku.js` | No SKU list |
| `js/sheets.js` | Uploading new inventory sheets (managers) |
| `js/shared.js` | Firebase connection, change history, access |
| `js/admin.js` | Manager page |
| `js/livescan.js` | Live camera scan |
| `js/main.js` | Start-up |

`store.js` (Firebase), `ai.js` (Gemini) and `config.js` are modules loaded when needed. `sw.js` keeps the app working offline: when you add a new file to `js/`, add it to `APP` in `sw.js` too.
