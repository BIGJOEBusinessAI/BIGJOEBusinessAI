# BIGJOE Android & iOS Apps

## How this works

BIGJOE is a full server app (Node + a JSON data store), not a static site — so the
Android/iOS apps aren't a separate rewrite. They're a **Capacitor** wrapper: a thin native
shell that opens your deployed BIGJOE website (`public/` + `server.js`) inside a native
WebView, using the device's native app icon, splash screen, and app-store presence. Your
existing website stays the single "consolidated" BIGJOE — the apps just point at it.

This is why `capacitor.config.json` uses `"server": { "url": "https://your-domain" }`
instead of bundling the `public/` folder into the app: the apps always load the live site,
so a deploy to your server instantly updates every app without an app-store release.

Payment Hub is already hidden inside the apps automatically — see **Payment Hub restriction**
below. Nothing further to configure for that.

## What I could not do for you here

Building and shipping real Android/iOS binaries requires tools this sandboxed environment
doesn't have: Android Studio + the Android SDK, and for iOS specifically a Mac with Xcode
(Apple does not allow iOS builds anywhere else) plus an Apple Developer Program membership.
I've scaffolded everything up to that point — you (or whoever has those tools) runs the
commands below to actually produce the `.apk`/`.aab` and `.ipa` files.

## Prerequisites

- A BIGJOE deployment reachable over **HTTPS** at a real domain (both app stores block
  plain HTTP). Deploy `server.js` + `public/` + `data/` to a host of your choice (a VPS
  with a domain and TLS cert, Render, Railway, Fly.io, etc.) — the existing
  `README_V58_FINAL_BUILD.md` / network docs in the project root cover local/LAN hosting;
  for the apps you need a public HTTPS URL, not the local network address.
- Node.js 18+ on your build machine.
- **Android:** Android Studio (includes the SDK) — free. A Google Play Developer account
  ($25 one-time) to publish.
- **iOS:** a Mac with Xcode installed — free. An Apple Developer Program membership
  ($99/year) to run on a real device or publish to the App Store.

## Setup

```bash
cd mobile
npm install
```

Edit `capacitor.config.json` and replace the placeholder with your real deployed URL:

```json
"server": { "url": "https://your-real-bigjoe-domain.com" }
```

Also change `appId` (`com.bigjoe.businessai`) to your own reverse-domain identifier if
`com.bigjoe.businessai` isn't yours to use on the app stores.

Generate icons and a splash screen for both platforms from the single source image already
included at `resources/icon.png` (BIGJOE's existing master icon):

```bash
npm run assets
```

## Android

```bash
npm run add:android      # generates the android/ native project (first time only)
npm run sync              # re-run this after any capacitor.config.json change
npm run open:android      # opens Android Studio
```

In Android Studio: `Build → Generate Signed Bundle / APK` to produce a release `.aab` for
the Play Store, or run directly on a device/emulator with the ▶ button to test first.

## iOS (Mac + Xcode required)

```bash
npm run add:ios           # generates the ios/ native project (first time only)
npm run sync
npm run open:ios          # opens Xcode
```

In Xcode: set your Team under **Signing & Capabilities**, then `Product → Archive` to
produce a build for TestFlight / App Store submission, or run directly on a connected
device/simulator to test first.

## Re-syncing after changes

Whenever you edit `capacitor.config.json` (e.g. change the server URL) or add a Capacitor
plugin, run `npm run sync` again before rebuilding in Android Studio / Xcode.

## Payment Hub restriction

Payment Hub (configuring which gateway receives your customers' payments) is deliberately
**web-only** — available on the BIGJOE website, hidden from the Android and iOS apps. This
is already wired up on both ends, nothing to do here:

- **Client:** `public/app.js` detects the native shell via Capacitor's injected
  `window.Capacitor.getPlatform()` (`'ios'` / `'android'` vs `'web'`) and hides every button
  that opens Payment Hub, and blocks direct navigation to the page.
- **Server:** every request now carries an `X-BigJoe-Platform` header; `server.js` rejects
  Payment Hub API calls (`/api/payments/hub`, `/api/payments/flutterwave/connection`,
  `/api/payments/paystack/connection`, `/api/payments/receiving/config`,
  `/api/payments/reconcile`) with `403` unless the header says `web`. This is the real
  enforcement — the client-side hiding is just so the app doesn't show a dead end.
- Subscription checkout (upgrading your BIGJOE plan) is a **separate** feature and is
  intentionally left open on the apps — only the receiving-payment configuration is
  restricted.

You can verify this without building the native apps at all: open your deployed BIGJOE URL
in a normal desktop browser (Payment Hub visible), then load the same URL with Chrome's
mobile device emulator — it'll still show Payment Hub, because platform detection depends
on Capacitor's injected bridge, not the browser/viewport. It only truly disappears once
running inside an actual Capacitor-built app.
