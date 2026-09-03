# BIGJOE v58.2 — Flutterwave Subscription Checkout Fix

## What was wrong

The Plans page called `/api/payments/flutterwave/initialize`, but the server intentionally read only `FLW_SUBSCRIPTION_SECRET_KEY` (or legacy environment aliases). A Flutterwave account configured through Payment Hub was therefore invisible to BIGJOE subscription checkout. Clicking **Subscribe with Flutterwave** could show an error instead of opening checkout.

## Fix

- Dedicated environment subscription credentials still take priority.
- For the local owner build, if dedicated subscription credentials are blank, BIGJOE can use the logged-in owner's configured Flutterwave receiving account from Payment Hub.
- Staff sessions do not inherit the owner's Payment Hub credentials for subscription checkout.
- The checkout still uses Flutterwave Standard hosted checkout and redirects the browser to the returned `data.link`.
- Application/cache version is bumped to v58.2.

## Recommended production setup

Set `FLW_SUBSCRIPTION_SECRET_KEY` to the BIGJOE platform's Flutterwave secret key. If recurring billing is required, also set the Business and Pro Flutterwave payment-plan IDs.

## Test

1. Start BIGJOE.
2. Log in as the business owner.
3. Configure/test Flutterwave in Payment Hub.
4. Open Plans.
5. Confirm the status says the subscription checkout is connected.
6. Click Business or Pro.
7. Flutterwave should open/redirect to the hosted checkout page.
