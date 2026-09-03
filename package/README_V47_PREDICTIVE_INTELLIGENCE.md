# BIGJOE v47.0 — Predictive Business Intelligence

Built on the tested BIGJOE v46.1 AI Business Advisor release.

## New feature

Adds a **Predictive Intelligence** page under **Features**. It uses recorded business data to provide planning estimates for:

- 30-day sales forecast with lower/base/upper range
- Sales momentum and confidence level
- 30-day profit estimate
- Monthly target outlook and likelihood
- Predicted stock-cover risks from recent demand
- Early-warning predictive alerts
- Recommended management actions

## Forecast methodology

The sales estimate combines recent 30-day calendar average, recent 7-day average, active selling-day average and historical variability. The displayed range widens when historical variability is higher. This is a planning estimate, not a guarantee.

## Data safety

The existing `data/db.json` contains the business records and must be preserved when installing/upgrading.

## Test checklist

1. Log in.
2. Open **Features → Predictive Intelligence**.
3. Confirm the forecast cards load.
4. Confirm the confidence badge and momentum update from the current records.
5. Check Target Outlook (set a target in Business Planner if needed).
6. Check Predicted Stock Risk.
7. Check Predictive Alerts and Recommended Actions.
8. Confirm existing Dashboard, Business Intelligence, AI Assistant, Accounting and Cash Flow pages still work.
