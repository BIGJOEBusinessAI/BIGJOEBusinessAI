# BIGJOE Business AI v58.0 — Final Executive Build

## What changed
- Executive leaderboard redesigned to match the approved reference: logo + welcome identity, operating-branch selector, logout, and seven primary navigation controls.
- Dashboard supports Active Branch, All Branches, and individual branch reporting.
- Dashboard stock intelligence now uses branch stock instead of global product stock.
- Product and inventory counts are branch-aware; POS product availability follows the selected operating branch.
- Product creation keeps category, supplier, opening stock and selected branch together.
- Plans page always renders Free Forever, Business and Pro cards and now checks Flutterwave connection status.
- Flutterwave checkout uses the account-specific Flutterwave credential saved in Payment Hub, with the server environment key as fallback. Credentials are never exposed in frontend code.
- Optional recurring billing is supported when Flutterwave payment-plan IDs are supplied through environment variables. Without those IDs, BIGJOE uses secure monthly checkout and the customer can renew manually.
- Payment callback verifies transaction status, tx_ref, currency and minimum amount before upgrading the plan.
- Business backup redacts payment secrets.
- Responsive navigation and plan cards were hardened for smaller screens.

## Flutterwave setup
1. Copy `.env.example` to `.env`.
2. Set `APP_BASE_URL` to the actual URL users will use. For local testing this can be `http://127.0.0.1:8000`; for public use it should be your HTTPS domain.
3. In BIGJOE open **Features → Payment Hub → Configure Flutterwave** and save the business receiving account secret key.
4. Click **Test** in Payment Hub.
5. Open **Plans** and confirm the status shows Flutterwave connected.
6. For automatic recurring billing, create Flutterwave payment plans and set `FLW_BUSINESS_PAYMENT_PLAN_ID` and `FLW_PRO_PAYMENT_PLAN_ID`. Otherwise the paid plans use secure monthly hosted checkout.

Flutterwave Standard creates a hosted checkout link server-side and returns the customer to the configured redirect URL. BIGJOE verifies the final transaction server-side before changing the user's plan.

## Data safety
Keep the existing `data/db.json` when upgrading an existing BIGJOE installation. Do not replace it with a blank test database. Keep `.env` private.
