# BIGJOE v22 – Accounting Cash Direction Fix

## Fix
Manual accounting entries now determine Cashbook direction from their accounting classification rather than a stale/legacy `entry_type` value.

### Money In
- Other Income
- Owner Capital Introduced
- Loan Received

### Money Out
- Business Expense
- Owner Withdrawal
- Loan Repayment
- Purchase of Business Asset

## Backward compatibility
On loading the Accounting module, existing manual entries are normalized so their `entry_type` matches their classification. This fixes older Owner Capital entries that were incorrectly saved as `expense` and therefore appeared as Money Out.

## Financial statements
Cashbook, Cash & Bank Movement, Net Cash Movement and Cash Flow now use the corrected direction automatically.

## Data safety
Keep the existing `data/db.json` when installing this version so existing BIGJOE business records remain intact.
