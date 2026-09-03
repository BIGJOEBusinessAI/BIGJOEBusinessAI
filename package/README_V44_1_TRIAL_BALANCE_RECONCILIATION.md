# BIGJOE v44.1 — Trial Balance Diagnostic & Reconciliation

Built on v44.0.

## Fix
- Opening balances are now treated as opening accounting balances rather than ordinary dated transactions.
- If opening debit and credit balances do not offset, BIGJOE uses the standard `OPENING_BALANCE_EQUITY` account to provide the missing balancing side.
- The Trial Balance now reports the opening-balance adjustment explicitly.
- Financial Control Check shows the opening-balance equity adjustment when one is present.
- Existing sales, purchases, expenses, inventory, cashbook and accounting logic is preserved.

## Important
Keep the existing `data/db.json` when upgrading so existing business data is preserved.
