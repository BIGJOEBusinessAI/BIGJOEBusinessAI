# BIGJOE v24 — Asset Purchase Ledger Fix

## Fixed
- Prevents `Purchase of Business Asset` from using Cash, Bank, POS, or Flutterwave as the asset account.
- Asset purchases now debit the actual asset account and credit the selected payment account.
- Automatically repairs older asset-purchase records that were incorrectly saved against a payment account such as CASH by moving them to a safe `Other Assets` account.
- This corrects the Cash General Ledger, Trial Balance, Balance Sheet cash figure, and double-entry totals without deleting business records.

## Expected example
For a ₦150,000 refrigerator purchased with cash:
- Other Assets / Refrigerator: Debit ₦150,000
- Cash: Credit ₦150,000
- Cash net movement remains reduced by ₦150,000
- Cash General Ledger does not contain both a debit and credit for the same purchase.

Keep the existing `data/db.json` when installing so current business records are preserved.
