# BIGJOE v23 — Trial Balance & General Ledger

This version adds the next accounting foundation on top of v22.

## New features
- Trial Balance with debit, credit and balance columns.
- Automatic balanced/unbalanced control check.
- General Ledger with account selection.
- Running debit/credit balance for each account.
- CSV export for Trial Balance.
- Automatic journal construction from sales, COGS, expenses, purchases, customer payments, supplier payments and manual accounting entries.
- Adds the standard Cost of Goods Sold account to the Chart of Accounts.

## Important
Keep your existing `data/db.json` when upgrading so your business records, account balances and transactions are preserved.

## Test
1. Open Accounting.
2. Set the desired From/To dates.
3. Confirm Trial Balance shows equal Total Debits and Total Credits.
4. Select Cash, Sales Revenue, COGS or another account in General Ledger.
5. Confirm each transaction shows its debit, credit and running balance.
