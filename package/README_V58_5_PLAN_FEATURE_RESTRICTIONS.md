# BIGJOE v58.5 — Plan-Based Feature Restrictions

## What changed
Previously, `PLANS` in `server.js` only defined pricing — every API route was reachable
regardless of a business's subscription tier, so the Free/Business/Pro plan cards on the
Plans page were cosmetic only. This update makes each plan card an accurate description of
what that plan actually unlocks.

## How it works

### Server (`server.js`) — the real enforcement
- `PLANS` now carries a `features` array per plan (the same bullets shown on the plan card).
- `requiredPlanForPath(pathname)` classifies every API route into one of:
  - **Open** — always reachable (login/auth, `/api/plans`, business profile, and anything
    related to paying for or checking the subscription itself, so a locked-out business can
    always upgrade).
  - **Free** (default / unlisted) — dashboard, Sales/POS, products, categories, customers,
    basic inventory operations, the basic AI assistant.
  - **Business** — branches, staff, purchases/procurement, accounting, budget control,
    financial centre, cash flow forecast, business planner, customer intelligence, marketing,
    loyalty, invoices/quotations, receivables, analytics/reports.
  - **Pro** — predictive intelligence, decision automation, smart actions, automation centre,
    command centre, system health, data & audit.
- `requireUser()` — already the single choke point used by essentially every authenticated
  route — now rejects requests with `402 { upgrade_required: true, required_plan, current_plan }`
  when the business's current plan doesn't cover the requested route. No individual route
  handlers needed to change.

### Client (`public/app.js`) — matching UX
- `PAGE_PLAN_REQUIREMENT` mirrors the server's classification per page id.
- `showPage()` blocks navigation into a locked page, shows a toast explaining which plan
  unlocks it, and redirects to the Plans page instead.
- `applyPlanUI()` marks locked items in the main nav and the Features menu with a small
  "🔒 Business" / "🔒 Pro" badge (items stay visible — so people can see what upgrading
  unlocks — rather than being hidden outright). Runs on app render and after `/api/plans`
  loads (so it reflects a plan change from a Flutterwave payment right away).
- `renderPlans()` now renders each card's feature list from the server's `PLANS[k].features`
  when available, falling back to a local copy if the API call fails — so the marketing copy
  and the actual restriction can never drift apart.

## Notes
- Staff accounts are bound to their business owner's plan (staff sessions resolve to the
  owner's `user` record), so a staff member is capped by the same plan as the owner —
  independently of their own role permissions.
- Payment/subscription endpoints (`/api/payments/flutterwave/initialize`,
  `/api/subscriptions/flutterwave/verify`, the Flutterwave webhook, `/payment/callback`) are
  intentionally left unrestricted so a business on any plan can always check out or verify a
  new subscription.
