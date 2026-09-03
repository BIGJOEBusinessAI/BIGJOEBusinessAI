# BIGJOE v55.2 — Login/Data Preservation Fix

This build includes the supplied working BIGJOE data database at `data/db.json`.
Do not overwrite it with a blank database.

Login uses the existing PBKDF2-SHA256 password format (120000 iterations) used by prior BIGJOE versions.
