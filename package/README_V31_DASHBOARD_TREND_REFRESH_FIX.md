# BIGJOE v31 — Dashboard Trend Refresh Fix

## Problem fixed
The Dashboard **Revenue Trend** and **Gross Profit Trend** could remain on an older snapshot (for example, showing a sale only on 10 August) even after newer sales were recorded.

## Changes
- Dashboard/API GET requests now use `cache: no-store` so the browser cannot reuse stale GET responses.
- Completing a sale while the Dashboard is open now refreshes the Dashboard automatically.
- Returning a sale while the Dashboard is open now refreshes the Dashboard automatically.
- Existing date-range controls remain unchanged; the fix does not overwrite a user-selected reporting period.

## Expected behaviour
1. Open Dashboard.
2. Record a new sale.
3. Return to/observe Dashboard — Revenue Trend should show the new sale on its actual sale date.
4. Gross Profit Trend should update on the same date.
5. Returning a sale should remove/reverse that sale from the trend because returned sales are excluded from dashboard sales data.

## Test
- Start the application with `start.bat`.
- Log in.
- Open Dashboard.
- Record a new POS sale dated by the system's current date.
- Confirm Revenue Trend and Gross Profit Trend update immediately.
- Return the sale and confirm both trends reverse/remove the returned sale.
