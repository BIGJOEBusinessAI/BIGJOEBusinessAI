# BIGJOE v58.11 — Refresh Buttons on Every Page

## What I found
BIGJOE already had a JS fallback (`ensurePageRefreshButtons()`) that auto-injects a
"↻ Refresh" button into any page missing one, run every time a page is shown — so in
principle every page should have gotten one dynamically already. To find out why some still
looked like they didn't, I audited all 38 pages directly against the actual HTML rather than
trusting the fallback, and found two real gaps:

1. **9 pages had no refresh action anywhere at all**: Expenses, Invoices & Quotations
   (documents), Financial Intelligence Centre, Products, Categories, Suppliers, Customers,
   and Business Profile & Settings. The JS fallback would have caught these at runtime, but
   they had no explicit, permanent one in the markup — inconsistent with how the rest of the
   app is built (nearly every other page has its refresh button hand-authored directly in
   `index.html`, not relying on the JS injector).
2. **2 pages had a refresh button, but not for the whole page**: Overview only had one
   buried inside its "Activity History" card (only refreshes history, not the branches/
   inventory/dashboard data on the rest of the page), and Staff only had one inside its
   "Team Members" card (misses the staff stats above it). Because *some* button on the page
   matched the word "refresh", the JS fallback correctly left these alone — so they silently
   stayed partial.

## What changed (`public/index.html`)
Added explicit "↻ Refresh" buttons, matching the exact style/placement convention already
used elsewhere in the app (inside each page's `.section-head` action row):

- **Expenses** → calls `loadExpenses()`
- **Invoices & Quotations** → calls `loadDocuments()`
- **Financial Intelligence Centre** → calls `loadFinancialCenter()` (alongside the existing
  "Apply" button, which did the same thing but wasn't labeled as a refresh)
- **Products**, **Categories**, **Suppliers** → all call `loadInventory()` (they share the
  same underlying data load, matching `pageLoader()`'s existing mapping)
- **Customers** → calls `loadCustomers()`
- **Business Profile & Settings** → calls `loadBusinessProfile()`
- **Staff** → added a page-level refresh next to "+ Add Staff", calling `loadStaff()`
  (in addition to the existing one scoped to just the Team Members card)
- **Overview** → added a dedicated refresh bar at the top of the page using the existing
  `refreshPage('overview')` helper, which reloads everything the page shows (branches,
  inventory, activity history, and dashboard stats) in one click — not just history.

**Left as-is:** the AI Tools page (Ad Generator / Customer Reply / etc.) has no server data
to refresh — it's a one-shot generation form, not a data listing — so it's intentionally left
to the JS fallback, which still gives it a button but is honest that there's nothing to
reload if clicked.

I verified every new `onclick` handler points to a real, existing function, and confirmed
the page loads and renders correctly after the changes.
