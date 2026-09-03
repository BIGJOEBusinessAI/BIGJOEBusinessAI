# BIGJOE v58.13 — Sales Returns + Leaderboard Tightened Further

## 1. Sales Returns

Good news on this one: the hard part was already built. `POST /api/sales/{id}/return`
already existed in `server.js` and was already complete — it just had no button anywhere
in the UI to call it. What it already did, verified again this round:

- Restores the returned quantity to product stock (both overall and the specific branch's
  stock row) and logs an inventory movement entry.
- Reverses any loyalty points earned on the original sale.
- Records a full audit entry in `db.sales_returns` (return number, refund total, items,
  payment breakdown, branch, timestamp).
- Marks the original sale `status: "returned"`.

That last point is what makes "subtract the money from all financial calculations and
reports" already true everywhere, automatically: **every** revenue/profit calculation across
the app — Dashboard, Analytics, Reports, Financial Center, Accounting, Cash Flow, Customer
Intelligence, Predictive Intelligence, Budget Control — already filters out sales with
`status !== "returned"`. A return doesn't need dozens of separate code changes; it just needs
to flip that one status, and every report already respects it.

**What I actually built this round — the frontend:**
- A **"↩ Return"** button next to "Receipt" on each sale in the Sales/POS table, shown only
  for sales that are still `completed` (already-returned or cancelled sales don't get one).
- Clicking it shows a confirmation with the item list and refund total before doing anything
  irreversible, then calls the existing endpoint and refreshes Sales, Inventory, and
  Dashboard so the change is visible immediately everywhere.
- Sale status now renders as a colored badge (`saleStatusBadge()`) instead of plain text —
  green for completed, red "↩ Returned" for returned, gray for cancelled — so returned sales
  are easy to spot at a glance in the sales history.

**Verified end-to-end with real API calls, not just code review:**
- Sold 5 units of a product (stock 50 → 45) → processed the return → stock correctly went
  back to 50.
- Sold 8 units total across two sales (₦16,000 dashboard revenue) → returned one 5-unit sale
  → dashboard revenue correctly dropped to ₦6,000 immediately, with no dashboard code
  changes needed.

## 2. Leaderboard — tightened further

You reported this was still too tall after the last fix. That exact fix (row cap + fixed-px
fixed height, verified with a rendered screenshot) was already in the v58.12 package I sent —
if it's still showing the old behavior, the most likely explanation is the deployed instance
hasn't picked up that update yet, since I re-confirmed the code is correct and present.

As extra insurance regardless, I tightened it further this round:
- Default view is now **5 rows** (was 8) before you need to tap "Show all".
- Mobile height cap is now **180px** (was 230px) — noticeably smaller than half of any phone
  screen.
