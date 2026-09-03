# BIGJOE v55.1 — Login & Account Preservation Fix

This build improves login diagnostics and protects existing account data during upgrades.

## Important
The project ZIP must not replace an existing `data/db.json`. The uploaded v55 package did not contain an existing database, so a fresh installation creates an empty database and cannot contain an older BIGJOE account.

For an existing installation, copy the previously working `data/db.json` into the v55.1 `data` folder before logging in.

v55.1 now reports a clear message when no owner accounts exist, instead of showing a generic invalid-login error.
