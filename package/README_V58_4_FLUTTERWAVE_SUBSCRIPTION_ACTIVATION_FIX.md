# BIGJOE v58.4 — Flutterwave Subscription Activation Fix

A successful Flutterwave checkout could fail to upgrade the BIGJOE owner because the callback verified with the dedicated subscription key only. v58.4 fixes that and hardens the full activation path.

- Dedicated `FLW_SUBSCRIPTION_SECRET_KEY` remains first priority.
- Owner Payment Hub Flutterwave credentials are a fallback for the local owner build.
- Successful callback verification activates the selected plan and records subscription status, start time, expiry, payment ID and transaction reference.
- Activation is idempotent.
- Added secure webhook backup at `/webhooks/flutterwave` and `/api/flutterwave/webhook`.
- Webhook verification supports current `flutterwave-signature` HMAC-SHA256 and legacy `verif-hash` when `FLW_WEBHOOK_SECRET_HASH` is configured.
- Added owner-only recovery endpoint `/api/subscriptions/flutterwave/verify`.
- Verification checks status, tx_ref, currency and amount before upgrading the plan.

For production, set `FLW_SUBSCRIPTION_SECRET_KEY`. For webhook backup, set `FLW_WEBHOOK_SECRET_HASH` and configure the Flutterwave webhook URL to `/webhooks/flutterwave`.
