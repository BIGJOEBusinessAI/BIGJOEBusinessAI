# BIGJOE v58.9 — Subscriptions Expire After One Month, Renewable

## What was already there
`subscriptionExpiryFrom()` already computed "+1 month from activation" and stored it on
`user.subscription_expires_at` — but nothing ever checked it. A Business/Pro account stayed
upgraded forever once activated, expiry date or not.

## What changed

### Automatic expiry (server.js)
- `applySubscriptionExpiry(db, user)` runs on every authenticated request (wired into
  `currentUser()`, the single place every session lookup goes through). If
  `subscription_expires_at` has passed, the account drops back to `plan: 'free'` and
  `subscription_status: 'expired'` immediately — no waiting for a scheduled job, correct
  even right after a server restart.
- `subscription_plan` is deliberately **kept** (not cleared) when a subscription expires, so
  the app always knows which plan to offer for one-click renewal.
- Once downgraded, all the plan-gated Business/Pro features (branches, reports, predictive
  intelligence, etc. — from the earlier plan-restriction work) become unavailable again
  automatically, since they check `user.plan` directly.

### Renewable, extends instead of resetting if you renew early (server.js)
`activateSubscriptionPayment()` now checks whether the account is still on an **active,
unexpired** subscription for the **same plan** being paid for:
- **Renew before expiry** → the new month is added on top of the remaining time (renewing 3
  days before expiry gives you 1 month + 3 days, not just 1 month — you don't lose paid-for
  days).
- **Renew after expiry, or subscribe to a different plan** → a fresh month starts from the
  payment date, as expected.

I verified both cases arithmetically and the live expiry downgrade end-to-end (forced an
account's `subscription_expires_at` into the past → `/api/me` correctly showed `plan: free`,
`subscription_status: expired`, and a previously-open Business route immediately returned
`402`).

### Renewal UI (public/app.js, public/style.css)
- The Plans page now shows **"Renews/expires in N days: <date>"** on your current paid
  plan's card, with a warning tone inside 7 days of expiry.
- The current paid plan's button changes from a disabled "✓ Current plan" to an active
  **"Renew for another month"** — so renewing early (to bank the extra days above) is always
  one click away, not just something you can do after it lapses.
- If a plan has expired, a banner appears at the top of the Plans page — *"⚠ Your Business
  plan expired on \<date\>. You're back on Free Forever until you renew."* — with a direct
  **Renew** button, and that plan's own card also switches to a "Renew" call-to-action
  instead of "Subscribe."
- All of this reuses the existing `pay(plan)` Flutterwave checkout flow from the previous
  update (popup window, auto-refresh on close) — renewing is just paying again for the same
  plan; the server-side extend/reset logic above handles the rest.
