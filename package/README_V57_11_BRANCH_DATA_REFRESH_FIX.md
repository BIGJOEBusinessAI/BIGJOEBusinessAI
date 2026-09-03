# BIGJOE v57.11 — Branch, Inventory, CRUD, Refresh & Cross-Module Stability Fix

This build is based on the tested v57.10 package and fixes the branch/data synchronization issues found during real-world testing.

## Main fixes
- Added the missing branch state and branch-loading functions in the frontend.
- Added active branch selection and synchronized it with the server.
- All active branches now render in the Branches cards, with the selected branch clearly marked ACTIVE.
- Active branch selection refreshes inventory, POS, dashboard, analytics, expenses, documents and receivables.
- Global leaderboard refresh now has a valid loader for Overview and the active page and has a finite timeout.
- Inventory requests now explicitly use the selected branch.
- Inventory/product tables display branch quantity rather than only the global product quantity.
- Dashboard revenue, expenses, sales and inventory value can follow the selected branch.
- Receivables can follow the selected branch.
- Invoice/quotation creation carries the active branch into the document record.
- Product creation carries the active branch into opening stock.
- Business Intelligence period controls remain connected and default to the active branch.

## Important
Preserve your existing `data/db.json` and `.env` when updating the project. Do not replace them with blank files.

## Suggested test sequence
1. Login and confirm Overview is highlighted.
2. Open Branches and confirm all branches are visible in cards.
3. Select another branch and confirm the ACTIVE marker changes.
4. Add a product with opening stock.
5. Confirm Inventory quantity/value update.
6. Open Sales/POS and confirm the product is available for the selected branch.
7. Record a sale and confirm stock decreases.
8. Add an expense and confirm the branch expense changes.
9. Create an invoice and quotation.
10. Test the leaderboard refresh on Overview, Inventory, POS and Business Intelligence.
11. Test Business Intelligence: Today, 7 Days, This Month.
12. Switch branches and verify Dashboard/Inventory/Receivables update.
