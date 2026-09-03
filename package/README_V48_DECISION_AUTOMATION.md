# BIGJOE v48.0 — Intelligent Decision Automation

Built on the tested BIGJOE v47.0 Predictive Business Intelligence release.

## New feature

Adds **Features → Decision Automation**. It turns recorded BIGJOE data into a prioritized management action plan.

### Decision engine
- Urgent / High / Medium priorities
- Top 3 decisions to act on first
- Execution plan: Now / Today / This week
- Sales momentum and period-change signals
- Monthly target pace check
- Profitability protection
- Expense-growth warning
- Stock-availability warning
- Proven-product recommendation
- Customer-data capture recommendation
- Decision evidence showing the records used

## Design principle

Recommendations are generated from the user's recorded BIGJOE data. The feature is decision support; it does not invent business figures or claim that outcomes are guaranteed.

## Data safety

Preserve the existing `data/db.json` when upgrading. The new feature is read-only and does not modify existing business records.

## Test checklist

1. Log in.
2. Open **Features → Decision Automation**.
3. Confirm the four KPI cards load.
4. Confirm the Top 3 decisions load.
5. Check Urgent, High and Medium sections.
6. Check the Execution Plan.
7. Check Decision Evidence.
8. Add/record a business transaction and refresh to confirm recommendations respond to the data.
9. Confirm Dashboard, Predictive Intelligence, AI Assistant, Accounting, Inventory and Sales still work.
