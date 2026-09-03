# BIGJOE v58.1 — Branch Dashboard, Product/POS Scope & Subscription Payment Separation

- Dashboard reports now expose active branch, all branches, and individual branch scope.
- Dashboard includes branch-scoped product count and stock units.
- Products page shows selected-branch product count/stock metrics.
- Product branch selector is preserved during refreshes and opening-stock assignment remains explicit.
- Current Sales duplicate/empty branch field removed; POS toolbar is the single branch control.
- POS product availability remains branch-specific and follows the selected operating branch.
- Payment Hub is strictly for customer-receiving gateway configuration.
- BIGJOE subscription checkout uses server-side subscription Flutterwave configuration and no longer depends on Payment Hub credentials or UI.
- Subscription checkout errors no longer redirect users into Payment Hub.
