# BIGJOE v38.0 — Staff, Roles & Permissions

## What was added
- Staff accounts with separate email/password logins.
- Built-in roles: Manager, Cashier, Inventory, Accountant, Viewer.
- Role-based API access for core business areas.
- Branch assignment for staff accounts.
- Owner can enable/disable or delete staff accounts.
- Staff login sessions are linked to the business owner without exposing the owner password.
- Staff users see a simplified navigation based on their permissions.
- Owner login and all existing business records remain compatible.

## Important
Keep your existing `data/db.json` when upgrading so your business records are preserved. The new `staff` collection is added automatically.

## Test checklist
1. Log in as the business owner.
2. Open Features → Staff & Permissions.
3. Create a test cashier account.
4. Log out and log in with the staff email/password.
5. Confirm the staff role appears beside the plan.
6. Confirm restricted features are hidden and direct API access is rejected.
7. Return to the owner account and disable/delete the test staff account.
