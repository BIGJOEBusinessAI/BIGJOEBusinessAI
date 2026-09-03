# BIGJOE v57.7 — Plans & Responsive Leaderboard Fix

## Changes
- Fixed subscription Plans loading with a built-in fallback for Free Forever, Business and Pro.
- Kept the secure server-side Flutterwave checkout flow for paid plans.
- Plans are now guaranteed to render when the Plans page is opened, even if the plans API temporarily fails.
- Plans remains available in the Features menu.
- Reworked the blue authenticated leaderboard/navigation to wrap cleanly at desktop, tablet and phone widths.
- Long navigation labels no longer overflow, clip, or force horizontal scrolling.

## Subscription prices
- Free Forever — ₦0
- Business — ₦1,500/month
- Pro — ₦3,000/month

Keep the existing `.env`/Flutterwave credentials on the user's local installation. Do not expose the secret key in the browser.
