# BIGJOE v15 — Customer Payments & Receivables

Adds customer receivables management to BIGJOE v14.

- Receivables dashboard: invoiced, collected, outstanding and overdue.
- Automatic invoice balance calculation.
- Sent -> Partially Paid -> Paid status progression.
- Automatic overdue detection.
- Record payments against invoices.
- Cash, Bank Transfer, POS, Flutterwave, Bank and Other payment methods.
- Payment reference, date and notes.
- Customer-level outstanding balances.
- Recent payment history.
- Printable payment receipts / Save as PDF.
- Delete payments with automatic balance recalculation.
- Existing BIGJOE modules preserved.

API testing confirmed a ₦1,100 invoice with a ₦500 payment produces ₦600 outstanding and partially_paid status.

Run start.bat and open http://127.0.0.1:8000
