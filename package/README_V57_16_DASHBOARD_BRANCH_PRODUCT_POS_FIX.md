# BIGJOE v57.16 — Dashboard Branch View & Product/POS Synchronization

## Changes
- Dashboard now has a Branch selector: Active Branch, All Branches, or a specific branch.
- Dashboard reports, trends, alerts, product performance and stock risk respect the selected dashboard scope.
- Product/Inventory branch selection now queries the selected branch instead of accidentally reusing the active branch.
- Inventory/Product total product count is branch-aware and counts products with stock in the selected scope.
- POS continues to load products and quantities from the selected operating branch, so product availability matches the branch being sold from.
- Application cache/version updated to v57.16.

## Data safety
Keep the existing `data/db.json` and `.env` files when upgrading.
