# BIGJOE v28.2 — Login & Session Fix

This update fixes the v28 login experience without changing existing account credentials or business data.

## Important
Keep your existing `data/db.json`. Do not replace it with a new database.

## Changes
- More reliable login form submission
- Prevents accidental page submission while authenticating
- Shows a visible error if authentication fails
- Shows a loading state while logging in
- Handles missing/invalid session responses
- Cache-busts the browser to ensure the corrected app.js is loaded
- Keeps Customer & Sales Intelligence features
