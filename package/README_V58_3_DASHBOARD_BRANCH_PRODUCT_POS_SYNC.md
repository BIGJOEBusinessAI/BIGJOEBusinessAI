# BIGJOE v58.3 — Dashboard Branch, Product Count & POS Synchronization

This build continues from v58.2 and adds:

- Dashboard branch selector for Active branch, All branches, or a specific branch.
- Separate branch-performance cards on Dashboard for every active branch in the selected period.
- Dashboard branch scope badge showing the current report scope.
- Branch performance includes sales, revenue, gross profit, expenses, net profit and inventory value.
- Products page remains branch-scoped; product counts and stock figures are based on the selected branch.
- POS explicitly reloads products using the selected active branch before rendering available products and quantities.
- Existing authentication, subscription/Flutterwave work and business data are preserved.

Keep the existing `data/db.json` and `.env` when deploying.
