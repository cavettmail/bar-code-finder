# Bar Code Finder

A phone web app for bar inventory counts: snap a bottle that won't scan and get its barcode from the inventory sheets, count bottles, and keep a shared list of bottles that need a SKU.

- Runs in Chrome on any phone; add it to the home screen to use it like an app.
- Labels and bottle barcodes are read on the phone itself.
- The item list is encrypted in `data/items.enc.json` and only opens with the team code that comes in the team's app link (`…/#t=<code>`). The code is not stored in this repository.
- Shared photos, linked barcodes, the No SKU list and uploaded sheet lists are kept in Firebase (Firestore) under a team id derived from that code. Paste `firestore.rules` into the Firebase console's Firestore → Rules tab.
- Counts, pinned and recent items stay on each phone.

Firebase settings go in `config.js`.
