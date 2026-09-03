# BIGJOE Sales / POS — Sprint 2

This update adds a Sales / POS module to the existing BIGJOE Node.js Inventory Edition.

## IMPORTANT
Do NOT replace `data/db.json`. Your existing products, categories, suppliers, account and inventory data live there.

## What this update adds
- Sales / POS tab
- Product search and one-click add to cart
- Quantity controls
- Customer name and phone (optional)
- Cash, Bank Transfer, POS and Flutterwave payment method selection
- Optional discount
- Automatic stock deduction after a completed sale
- Prevents selling more than available stock
- Today's sales count, revenue and profit
- Recent sales history
- Invoice numbers
- Printable receipts
- Sale activity recorded in BIGJOE history

## Installation
1. Stop BIGJOE with Ctrl+C in the Command Prompt.
2. Make a backup copy of your current BIGJOE folder.
3. In your existing BIGJOE project folder, replace ONLY these files with the files in this package:
   - `server.js`
   - `public/index.html`
   - `public/app.js`
   - `public/style.css`
4. Do NOT replace `data/db.json`.
5. Start BIGJOE with `start.bat`.
6. Open http://127.0.0.1:8000 and log in.
7. Click `Sales / POS`.

## First test
Use a small quantity so your inventory is easy to verify:
- Coca-Cola Big Bottle: sell 2 bottles
- Payment method: Cash
- Customer: Walk-in customer
- Complete Sale

Expected effect:
- Big Bottle stock decreases from 1,000 to 998 (if your current stock is 1,000).
- A new invoice appears in Recent Sales.
- Revenue = 2 × current selling price.
- Profit = 2 × (selling price - cost price).

Then click Inventory to confirm the stock reduction.
