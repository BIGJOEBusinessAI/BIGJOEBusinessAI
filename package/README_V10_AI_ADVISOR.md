# BIGJOE v10 — Sales Velocity + AI Business Advisor

This version adds two improvements to BIGJOE Business AI:

## 1. Reliable sales-velocity classification
Products are no longer automatically called "slow-moving" simply because they have fewer sales than another product.

BIGJOE now requires sales on at least **2 different selling days** before assigning a Fast-moving, Normal-moving, or Slow-moving classification.

Products without enough history are labelled **Insufficient data**.

## 2. AI Business Advisor
The dashboard now produces practical recommendations from the business data, including:
- expense pressure
- negative net profit
- fast-moving products
- slow-moving products
- insufficient sales history
- low-stock risks
- stable-business status

## Updating an existing BIGJOE installation
1. Back up your current BIGJOE folder.
2. Extract this ZIP into a new folder first.
3. Keep your current `data/db.json` because it contains your business records.
4. Replace the application files with the v10 files, especially `server.js`, `public/app.js`, `public/index.html`, and `public/style.css`.
5. Start BIGJOE with `node server.js` or `start.bat`.
6. Open `http://127.0.0.1:8000`.

The existing Sales/POS, Inventory, Customers, Suppliers, Expenses, payment integration and dashboard calculations are retained.
