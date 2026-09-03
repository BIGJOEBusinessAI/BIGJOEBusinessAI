# BIGJOE v46.0 — AI Business Advisor

Builds on tested v45.0 Advanced Business Intelligence & Analytics.

## New
- Context-aware AI assistant using the authenticated business's recorded sales, expenses, products, customers and stock.
- Business snapshot for today, last 7 days, this month and last 30 days.
- Deterministic local fallback when no OpenAI API key is configured.
- Product, inventory, expense and customer questions can be answered from local records.
- AI provider responses are constrained to the supplied business snapshot and fall back locally on provider errors.
- Updated Overview AI interface and prompts.

## Important
Keep the existing `data/db.json` when updating. Do not replace business records.

Run `node server.js` or `start.bat`, then open `http://127.0.0.1:8000`.
