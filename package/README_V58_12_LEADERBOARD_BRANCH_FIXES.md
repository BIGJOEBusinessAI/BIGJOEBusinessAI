# BIGJOE v58.12 — Leaderboard Fix (Verified), Branch Awareness

## 1. Leaderboard — actually fixed this time, and verified

Earlier attempts (v57.5, v57.7, v57.8, v58.0, v58.10) all touched CSS but none were verified
against a real render, so a couple of things kept it broken:

- **Row count was unbounded.** CSS `max-height` alone doesn't stop a table from having 50+
  rows in the DOM — it just makes them scroll internally, and the box can still feel huge.
  `renderCustomerLeaderboard()` / `renderLikelyToBuy()` in `public/app.js` now cap the
  default view to **8 rows**, with a "Show all N customers ↓" toggle for anyone who wants
  the full list. This is the primary fix.
- **`vh` units are unreliable to verify and risky in embedded contexts.** v58.10 capped the
  table at `38vh`/`30vh`. I tested this properly this time (built a static harness using the
  real `style.css` and rendered it at an actual phone width) and found `vh` doesn't resolve
  consistently outside a normal top-level browser tab. Switched to a fixed
  `max-height:230px` on phones (320px otherwise) instead — unambiguous everywhere.
- **Restructured the DOM** so the "Show all" toggle sits *outside* the scrollable box
  (`.table-scroll` now wraps just the `<table>`; the toggle button is a sibling). Previously
  the toggle would have been trapped inside the same tiny scrolling box as the table.

I verified the fix visually: rendered the actual CSS/markup at a 390px-wide viewport with 15
seeded customers, confirmed the table clips to a small box with a visible internal scrollbar
instead of growing to fit all rows.

## 2. Branch awareness — audited against the backend, not guessed

Checked every page against what the backend actually supports before adding anything:

- **Expenses** — backend already accepted `branch_id` but the page had no selector. Added
  one (`#expenseBranchSelect`), wired the same way as the existing Products/Purchases branch
  selectors. Verified with real API calls: filtering to Branch 1 vs Branch 2 returns the
  correct subset.
- **Receivables — found and fixed a real bug, not just a missing nicety.** The
  `/api/receivables` endpoint already accepted `branch_id`, but when the frontend sent none
  at all (which it always did), the backend defaulted to **just the active branch** —
  silently. A multi-branch business opening Receivables was only ever seeing one branch's
  outstanding invoices, with no indication anything was hidden. Added a branch selector that
  defaults to **all branches**, and verified with real data: before the fix, a ₦17,000
  two-branch scenario showed only ₦7,000; after, it correctly shows the full ₦17,000 with
  the option to filter down.

**Checked but not yet touched:** Cash Flow, Budget Control, Customer Intelligence,
Procurement Intelligence, and Business Planner have no `branch_id` support in their backend
handlers at all — adding a selector there means adding real filtering logic to each, which
is a larger, separate piece of work I haven't done yet.
