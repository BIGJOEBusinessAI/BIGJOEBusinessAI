# BIGJOE v21 — Accounting Classification Fix

This version improves the Accounting & Cashbook module so manual transactions are classified by their real accounting meaning instead of being treated as generic income or expense.

## Supported manual transaction types

- Other Income — appears in Profit & Loss as Other Income.
- Business Expense — appears in Profit & Loss as Operating Expenses.
- Owner Capital Introduced — increases Owner's Equity and cash; does not affect profit.
- Owner Withdrawal — reduces Owner's Equity and cash; does not affect profit.
- Loan Received — increases liabilities and cash; does not affect profit.
- Loan Repayment — reduces liabilities and cash; does not affect profit.
- Purchase of Business Asset — increases the selected asset and reduces cash; does not affect profit.

## Opening balances

Opening balances entered on accounts remain Balance Sheet opening balances. They are not treated as revenue or expenses.

Existing pre-v21 manual entries remain compatible: entries without a classification are interpreted using their previous income/expense type.

## Important

Keep your existing `data/db.json` when installing this version if you want to preserve your current business records.
