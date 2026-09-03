# BIGJOE v58.6 — Android/iOS Apps + Payment Hub Web-Only Restriction

## 1. Android, iPhone/iOS apps via a consolidated website

Added `mobile/` — a Capacitor project scaffold that ships the existing BIGJOE website as
native Android and iOS apps. Capacitor was chosen because BIGJOE is already a server-backed
web app (`server.js` + `public/`); Capacitor wraps that live site in a native shell rather
than requiring a separate native rewrite, so the website stays the single "consolidated"
place that controls what every app shows — deploy once, every app updates.

See `mobile/README_MOBILE_APPS.md` for the full setup: pointing the app at your deployed
HTTPS domain, generating icons/splash from the existing BIGJOE icon, and the exact
`npx cap add android` / `npx cap add ios` + Android Studio / Xcode steps needed to produce
installable builds. Actually compiling and signing the native binaries needs tools this
environment doesn't have (Android Studio, and a Mac + Xcode for iOS) — that part is on
whoever runs the build.

## 2. Payment Hub hidden from the apps, web-only

Payment Hub (configuring which gateway receives customer payments) is now restricted to the
BIGJOE website only.

- **Server (`server.js`):** every request now carries an `X-BigJoe-Platform` header sent by
  the client. `requestPlatform()` reads it (`ios` / `android` / defaults to `web` if absent
  or unrecognized, so existing browser sessions are unaffected). `requireUser()` rejects
  Payment Hub's API routes (`/api/payments/hub`, `/api/payments/flutterwave/connection`,
  `/api/payments/paystack/connection`, `/api/payments/receiving/config`,
  `/api/payments/reconcile`) with `403` unless the platform is `web`. This is the real
  enforcement, independent of anything the client does.
- **Client (`public/app.js`):** `bigjoePlatform()` detects the native shell via Capacitor's
  injected `window.Capacitor.getPlatform()`. On native, `applyPlatformUI()` hides every
  button that opens Payment Hub (nav, Features menu, the Plans page shortcut, the onboarding
  checklist link), and `showPage()` blocks direct navigation to it as a second layer.
- Subscription checkout (`/api/payments/flutterwave/initialize`,
  `/api/subscriptions/flutterwave/verify`) is a **separate** feature from Payment Hub and is
  intentionally left reachable everywhere — a business must still be able to upgrade its
  BIGJOE plan from the apps.

## Notes / what to double check

- The apps run in "remote server" mode (`capacitor.config.json` → `server.url`), so they
  need a real HTTPS domain to point at before they're useful — not just the local network
  address used for same-Wi-Fi phone access.
- Platform detection depends on Capacitor's injected bridge, not screen size or user agent —
  a phone-sized browser window still shows Payment Hub; it only disappears inside an actual
  Capacitor-built app.
