# BIGJOE v58.10 — Compact Mobile Customer Leaderboard

## What was wrong
The Customer Leaderboard table (`#customerLeaderboard`, on the Customer Intelligence page)
had no height cap — unlike similar data tables elsewhere in the app (Analytics, Predictive
Intelligence), which already cap at 360–380px with internal scroll. With enough customers,
the leaderboard just kept growing taller, easily exceeding half a phone screen.

## What changed (`public/style.css`)
- `.customer-intel-grid .table-wrap` now caps at `max-height:360px` with internal scroll,
  matching the pattern already used by `.analytics-grid`/`.predictive-grid`.
- On phones (`max-width:700px`) it caps further at `240px`, with tighter cell padding and
  smaller font size so more rows are visible in less space, and a narrower `min-width` on
  the table itself (540px vs 720px) since the columns don't need as much room at that
  density.
- This also improves "Customers Most Likely to Buy Again" (`#likelyToBuy`), which shares
  the same container and had the identical problem.

No data is hidden — everything still scrolls into view within the box, it just no longer
pushes the rest of the page down.
