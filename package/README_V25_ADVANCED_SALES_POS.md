# BIGJOE v25 — Advanced Sales / POS

This update builds on BIGJOE v24 and adds a complete-sale return/refund workflow to the Sales / POS module.

## New in v25
- Full-sale return/refund from Recent Sales.
- Prevents the same sale from being returned twice.
- Restores all returned quantities to inventory automatically.
- Records a return number (RET-YYYYMMDD-00001 style).
- Records the refund against the original payment channel.
- Reverses sales revenue in the accounting journal.
- Reverses COGS and restores inventory value through double-entry accounting.
- Refunds appear as cash outflows in Cashbook and Financial Statements.
- Returned sales are excluded from active sales, revenue, COGS and profit calculations.
- Sales history now shows Completed/Returned status.
- Existing receipts, inventory, accounting, trial balance and general ledger remain connected.

## Important
Do NOT replace `data/db.json` with the package copy. Keep the user's existing database and records.

## Installation
1. Stop BIGJOE with Ctrl+C.
2. Back up your current BIGJOE folder.
3. Replace only:
   - `server.js`
   - `public/index.html`
   - `public/app.js`
   - `public/style.css`
4. Keep your existing `data/db.json`.
5. Start BIGJOE with `start.bat`.
6. Open http://127.0.0.1:8000 and log in.

## Test
1. Make a small cash sale.
2. Confirm stock decreases and accounting updates.
3. In Sales / POS > Recent Sales, click **Return**.
4. Confirm the return.
5. Verify:
   - sale status becomes Returned;
   - stock is restored;
   - refund is recorded;
   - Cashbook shows the refund as money out;
   - Trial Balance remains balanced;
   - General Ledger shows the reversal;
   - Financial Statements remove the returned sale from revenue/profit.
