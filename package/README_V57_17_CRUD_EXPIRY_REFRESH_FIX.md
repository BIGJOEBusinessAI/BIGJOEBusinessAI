# BIGJOE v57.17 — CRUD, Product Expiry & Page Refresh Fix

Based directly on the uploaded BIGJOE build. The existing architecture and navigation are preserved.

## Corrections
- Restored reliable Add Product flow and preserved category/supplier/branch selections.
- Added Batch Number and Expiry Date to the dynamic Add/Edit Product form.
- Product list now displays the saved expiry date and marks expired dates for attention.
- Added explicit branch selection to Add/Edit Expense and persists the selected branch.
- Hardened the shared modal save flow so Product, Category, Supplier and Expense saves are acknowledged immediately and refreshed safely.
- Added a Refresh button to Receivables. Marketing already retains its Refresh control.
- Product branch view continues to use the existing branch architecture.
- Cache/version bumped to v57.17.

Keep your existing `data/db.json` and `.env`.
