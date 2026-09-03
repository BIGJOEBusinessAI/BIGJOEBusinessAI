# BIGJOE v57.9 — Plans, Global Refresh & Data Reliability Fix

- Added explicit subscription price points to Free Forever, Business and Pro cards.
- Paid cards retain secure Flutterwave checkout.
- Global leaderboard refresh now has a timeout and always returns to the normal state.
- Added request timeouts so a stalled API cannot leave the UI loading forever.
- Core login data preload now uses allSettled so one non-critical module cannot prevent other data from loading.
- Product/category/supplier saves now show Saving feedback and await the inventory reload.
- Updated browser/service-worker cache version to 57.9.

Keep the existing `data/db.json` and `.env` from the working installation when replacing the application.
