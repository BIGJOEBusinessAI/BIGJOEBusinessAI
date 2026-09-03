# BIGJOE v11 — Advanced Business Advisor

This release builds on BIGJOE v10 and adds a second layer of business decision support.

## New features
- Stock risk and reorder intelligence based on current stock, minimum stock and sales rate.
- Margin opportunity detection for products below 20% gross margin.
- Expense concentration analysis showing the largest expense category and its share.
- Recommended action plan generated from the current dashboard data.
- Existing expense calculation, Sales/POS, Inventory, Customers, Suppliers, Analytics and AI Advisor retained.

## Important
Keep the existing `data/db.json` when updating an installation that already contains business records.

Run:
- `node server.js`
- or double-click `start.bat`

Then open `http://127.0.0.1:8000`.

The advisor is decision-support logic based on recorded business data; it is not a substitute for accounting or professional financial advice.
