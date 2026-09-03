# BIGJOE v16 — Purchases & Supplier Payables

This release adds a complete purchasing workflow on top of BIGJOE v15.

## Features
- Purchase orders with automatic PO numbering (`PO-YYYY-00001`)
- Supplier selection and purchase item lines
- Quantity, unit cost, discount and tax/VAT
- Ordered vs Received status
- Receiving a purchase increases inventory automatically
- Received purchases update product cost using a weighted-average cost
- Supplier payment recording
- Partial and full supplier payment tracking
- Supplier outstanding balances
- Recent supplier payment history
- Protection against duplicate stock receiving and overpayment

## Important
Existing v15 data is preserved. The new `purchases` and `supplier_payments` collections are added automatically when the app starts.

## Workflow
1. Add suppliers and products first.
2. Open **Purchases** and create a purchase order.
3. Leave it as **Ordered** if the goods have not arrived.
4. Click **Receive** when the goods arrive; stock and weighted-average cost update automatically.
5. Record supplier payments against the purchase until the outstanding balance reaches zero.
