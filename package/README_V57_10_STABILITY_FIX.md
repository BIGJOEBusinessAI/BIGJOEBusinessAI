# BIGJOE v57.10 — Core Data, Inventory, Sales & Navigation Stability Fix

This build is based on the tested v57.9 project.

## Fixed
- Branch creation modal and save workflow restored.
- Product, category, supplier and expense save workflows verified against the server APIs.
- Invoice and quotation creation APIs verified.
- Inventory summary is now branch-aware and reports units, stock value and potential profit for the active branch.
- Product opening stock is synchronized with branch stock when a product is created.
- Editing a product quantity adjusts the active branch stock and records an inventory movement.
- Sales/POS workflow verified; payment validation now occurs before stock is changed, preventing failed split payments from reducing inventory.
- System Health frontend loader restored and connected to `/api/system-health` and `/api/security-review`.
- Global leaderboard refresh now has a loader for every application page, including the Tools page.
- Dashboard period buttons restored: Today, 7 Days, This Month and This Year.
- Business Intelligence now supports Today, 7 Days, This Month and This Year presets.
- Overview is the active highlighted navigation item immediately after login.
- Expense creation now sends the active branch ID.
- Service-worker cache version bumped to force the v57.10 frontend assets to refresh.

## Data preservation
Keep your existing `data/db.json` and `.env` when upgrading. Do not replace them with a blank database or expose private Flutterwave secret credentials in the frontend.

## Test priority
1. Login → Overview highlight.
2. Add branch.
3. Add category.
4. Add supplier.
5. Add product with opening stock.
6. Confirm Inventory quantity and stock value.
7. Record an expense.
8. Make a POS sale and confirm inventory decreases.
9. Create invoice and quotation.
10. Open System Health.
11. Use the leaderboard refresh on multiple pages.
12. Test Business Intelligence Today / 7 Days / This Month.
