# BIGJOE v9 Advanced Business Analytics

This version adds an advanced analytics layer to the existing BIGJOE v8 project.

## New analytics
- Business Health Score (0-100)
- Gross margin, net margin and expense-to-revenue ratio
- Daily net-profit trend
- Daily expense trend
- Fast-moving products
- Slow-moving products
- Most profitable products
- Additional management insights
- Daily dashboard data now includes expenses and net profit

## Important data note
Keep your existing `data/db.json` when updating an already-used BIGJOE installation. The analytics code reads the existing sales, products, customers and expenses data; it does not require a new database.

## Formula
Net Profit = Gross Profit - Operating Expenses

The health score is a decision-support indicator, not an accounting or financial statement.
