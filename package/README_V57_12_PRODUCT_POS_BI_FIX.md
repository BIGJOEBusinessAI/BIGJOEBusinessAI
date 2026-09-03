# BIGJOE v57.12 — Product, POS Branch & Business Intelligence Integration

This build is based on the tested v57.11 core-stability package.

## Fixes
- Product creation no longer fails because optional batch/expiry fields are missing; the fields are now present and optional.
- Product creation sends the current active branch so opening stock is assigned to the correct branch.
- Sales/POS now displays a Branch selector and reloads products/stock when the branch changes.
- Advanced Business Intelligence now defaults to **All branches**, while still providing a branch dropdown for individual branches.
- Advanced BI inventory value is calculated from branch stock, aggregated across active branches when All branches is selected.
- Advanced BI receivables are filtered by selected branch when a branch is selected.
- Advanced BI no longer references branch stock helpers before they are initialized.
- Cache version updated to force the browser to load the v57.12 frontend.

## Preserve
Keep the existing `data/db.json` and `.env` from the working installation. Do not replace production/test business data with a blank database.

## Suggested test
1. Select a branch.
2. Add a product with opening quantity.
3. Confirm it appears in Inventory.
4. Open Sales/POS and confirm the branch appears in the selector and the product is available.
5. Change POS branch and confirm products/quantities change accordingly.
6. Open Advanced Business Intelligence. Confirm All branches is available and populated.
7. Select an individual branch and confirm KPI values update.
8. Test Today, 7 Days, This Month and This Year.
