# BIGJOE v57.8 — Plans + Global Leaderboard Refresh Fix

## Changes
- Plans render immediately from built-in fallback definitions so the page cannot remain blank when `/api/plans` is slow/unavailable.
- Three plans are always presented: Free Forever, Business (₦1,500/month), Pro (₦3,000/month).
- Paid plans use the existing secure server-side Flutterwave checkout.
- Added a small global refresh button to the authenticated blue leaderboard. It refreshes the currently open page and remains available while navigating.
- Updated app.js cache-busting version to 57.8.
