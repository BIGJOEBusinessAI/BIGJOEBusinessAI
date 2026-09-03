# BIGJOE v57.13 — Branch Context, Finance, Reports & Overview Corrections

Implemented:
- Removed the universal leaderboard refresh button as requested.
- Added a dedicated Overview refresh button via Activity History card.
- Overview loads and displays recent Activity History and active branch.
- Product save no longer overwrites the server-enriched product/category data after reload; category names remain visible.
- Inventory now has a Branch selector with Active branch and All branches views.
- Financial Centre uses the selected active branch and has a branch selector matching the Business Intelligence format.
- Accounting Centre uses the selected active branch and has a branch selector matching Business Intelligence.
- Accounting journal, cashbook, financial statements, trial balance and general ledger support branch context.
- Business Report aggregates all branches and displays branch performance summaries.
- Business Advisor context is branch-aware and reports low-stock items for the active branch.
- Purchases page has a refresh button.
- Branch changes trigger refreshes of relevant connected modules.

Keep the existing `data/db.json` and `.env` when upgrading so business records and credentials are preserved.
