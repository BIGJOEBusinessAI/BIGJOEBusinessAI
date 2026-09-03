# BIGJOE Business AI v4 — Node.js Inventory Edition

This is the Node.js version of BIGJOE v4. It builds on the working project and preserves the existing authentication, AI tools and Flutterwave payment flow.

## Sprint 1 Inventory
- Products: add, edit, delete, SKU, cost price, selling price, stock quantity, low-stock level, unit, description
- Categories: add, edit, delete
- Suppliers: add, edit, delete
- Inventory summary: products, units, stock value, potential profit, low-stock count
- Low-stock alerts
- Existing users/payments/activity/sessions JSON data are preserved

## Run on Windows
1. Extract the ZIP.
2. Make sure Node.js is installed.
3. Double-click `start.bat`.
4. Open `http://127.0.0.1:8000`.
5. Log in with your existing BIGJOE account if the included `data/db.json` contains it, or create a new account.

No Python and no npm install are required.

## Flutterwave
Put your Flutterwave TEST secret key in `.env` as `FLW_SECRET_KEY=...`. Never put secret keys in browser JavaScript or send them in chat.

## AI
BIGJOE works with its built-in assistant without an AI key. Optional OpenAI integration can be enabled with `OPENAI_API_KEY` in `.env`.

## Important
This is a local development/testing build. Before public launch, use a production database, HTTPS, stronger security controls, rate limiting, backups and signed webhooks.


## v12 update
See README_V12_MANAGEMENT_REPORTS.md for the new Management Reports & Decision Center.

BIGJOE v21 — Accounting classification layer added.

# v54 payment integrations
# PAYSTACK_SECRET_KEY=your_paystack_secret_key
# PAYSTACK_MODE=test
# FLW_MODE=test
