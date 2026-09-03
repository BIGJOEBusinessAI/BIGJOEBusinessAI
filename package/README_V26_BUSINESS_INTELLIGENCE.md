# BIGJOE v26 — Business Intelligence & Performance Comparison

This version builds on the tested BIGJOE v25 Advanced Sales/POS release.

## New features
- Business Alerts generated from actual sales, expense and stock records.
- Current-period vs previous-period comparison for revenue, gross profit, expenses and net profit.
- Percentage change indicators for each comparison metric.
- Alerts for falling sales, rising expenses, negative profit, low stock and margin pressure.
- Preserves existing Sales/POS, Inventory, Customers, Suppliers, Expenses, Purchases, Accounting, Financial Centre, Returns and Reports.

## Installation
Replace only the application files in the existing BIGJOE installation:
- server.js
- public/index.html
- public/app.js
- public/style.css

Keep your existing `data/db.json` so business records are preserved.

Restart BIGJOE and open the Dashboard.

## Test checklist
1. Open Dashboard.
2. Select a period with sales and apply it.
3. Confirm Business Alerts appears.
4. Confirm Period Comparison shows the previous period.
5. Confirm revenue/profit/expense/net-profit percentage changes.
6. Verify existing POS, inventory and accounting workflows still work.
