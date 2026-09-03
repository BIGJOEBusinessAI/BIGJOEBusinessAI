# BIGJOE v58.7 — Subscribe Buttons Open a Flutterwave Window

## What was already there
Every paid plan card's **"Subscribe with Flutterwave"** button was already wired to a full
checkout flow, built in earlier versions:
`pay(plan)` → `POST /api/payments/flutterwave/initialize` → Flutterwave hosted checkout link
→ payment → `/payment/callback` (or the `/webhooks/flutterwave` backup) verifies the
transaction server-side and only then upgrades the account (`activateSubscriptionPayment`
sets `user.plan`). A business can't upgrade without a verified successful payment — there's
no client-side "mark as paid" path.

## What changed
The button used to navigate the whole BIGJOE tab away to Flutterwave and back. It now opens
Flutterwave's checkout in **its own popup window**, so the person doesn't lose their place in
BIGJOE:
- `pay()` in `public/app.js` calls `window.open(checkout_url, ...)` for a dedicated
  checkout window on web.
- While that window is open, BIGJOE polls until it's closed, then automatically calls
  `loadPlans()` to refresh the account's plan and shows a confirmation toast.
- If the browser blocks the popup, or the app is running inside the native Android/iOS
  shell (`isNativeApp()`), it falls back to the original full-page redirect — payment still
  completes normally either way, just without the popup convenience.

## Making sure it pays into *your* Flutterwave account
Subscription checkout is intentionally separate from Payment Hub (which is for a *business
owner's own customers*' payments). It always uses `getSubscriptionFlutterwaveConfig()`,
which reads, in order:
1. `FLW_SUBSCRIPTION_SECRET_KEY` (or legacy alias `SUBSCRIPTION_FLW_SECRET_KEY`) in `.env` —
   **this is what you should set to your Flutterwave secret key** so every subscriber's
   payment goes to your account.
2. Local/prototype fallback only: the platform owner's own Payment Hub Flutterwave
   connection, if no dedicated key is set — convenient for testing, not recommended once
   you have real subscribers.

`.env.example` already documents this:
```
FLW_SUBSCRIPTION_SECRET_KEY=
FLW_SUBSCRIPTION_MODE=test
FLW_SUBSCRIPTION_BUSINESS_PAYMENT_PLAN_ID=
FLW_SUBSCRIPTION_PRO_PAYMENT_PLAN_ID=
FLW_WEBHOOK_SECRET_HASH=
```
Set `FLW_SUBSCRIPTION_SECRET_KEY` to your real Flutterwave secret key (test key while
testing, live key once you're ready for real subscribers), switch
`FLW_SUBSCRIPTION_MODE=live` when you go live, and set `FLW_WEBHOOK_SECRET_HASH` from
Flutterwave Dashboard → Settings → Webhooks (pointed at `/webhooks/flutterwave`) so
activation still happens even if someone closes the checkout window before the redirect
fires.

I verified the wiring end-to-end in this sandbox up to Flutterwave's API boundary (the
sandbox itself can't reach api.flutterwave.com over the network) — the server correctly
picks up the configured key, builds the checkout payload, and calls Flutterwave. It'll
return a working checkout link on a real deployment.
