# BIGJOE Desktop App (Windows / macOS / Linux)

## Two ways to get an installable PC app

### Option A — install it as a PWA (already works, zero build step)
BIGJOE already ships `public/manifest.json` and `public/sw.js`, which makes it a valid
Progressive Web App. Once BIGJOE is deployed on a real HTTPS domain, open it in Chrome, Edge,
or Brave on Windows/macOS/Linux and use the browser's **Install BIGJOE** button (address bar,
or the browser menu → "Install app…"). That installs a real desktop app with its own icon,
taskbar/dock entry, and window — no separate download needed. This is the fastest path and
needs nothing further from this folder.

### Option B — a proper downloadable installer (this folder)
If you want a `.exe`/`.msi` for Windows, `.dmg` for macOS, or `.AppImage` for Linux that you
can host as a direct download (rather than relying on someone clicking "Install" in their
browser), use this `desktop/` Electron scaffold. Same idea as `mobile/`: it's a thin native
shell that opens your deployed BIGJOE website — the website stays the one place you maintain,
this just gives it a standalone app window and an installer file.

## What I could not do for you here
Producing real signed installers needs platform-specific build tooling this sandboxed
environment doesn't have (and macOS builds specifically need to run on a Mac). I've
scaffolded everything up to that point — someone with Node.js on the target OS(es) runs the
commands below.

## Setup

```bash
cd desktop
npm install
```

Edit `main.js` and replace the placeholder with your real deployed URL (or set it via
environment variable at build/run time instead):

```js
const BIGJOE_URL = process.env.BIGJOE_URL || "https://your-real-bigjoe-domain.com";
```

Test it locally first:

```bash
BIGJOE_URL=https://your-real-bigjoe-domain.com npm start
```

## Building installers

```bash
npm run dist:win      # produces a Windows .exe/.msi installer (best run on Windows)
npm run dist:mac      # produces a macOS .dmg (must run on a Mac)
npm run dist:linux    # produces a Linux .AppImage
```

Installers land in `desktop/dist/`. `npm run dist` (no platform flag) builds for whichever
OS you're currently on.

The app icon comes from `build/icon.png` (BIGJOE's existing master icon, already copied in).
For a polished Windows/macOS build, convert it to `.ico`/`.icns` too (e.g. with
[electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)) and point
`package.json`'s `build.win.icon` / `build.mac.icon` at the converted files — a plain `.png`
works for a quick test build but the platform-specific formats look sharper.

## Notes
- Desktop is treated the same as the regular website — Payment Hub stays visible here (the
  web-only restriction from the Android/iOS apps doesn't apply; see
  `README_V58_6_MOBILE_APPS_PAYMENT_HUB_RESTRICTION.md`).
- Links that go outside BIGJOE (e.g. the Flutterwave checkout popup) open in the person's
  normal default browser instead of inside the app window.
- Like the mobile apps, this needs a public HTTPS domain to point at — see
  `README_V58_8_SEARCHABLE_AND_DESKTOP_APP.md` for getting BIGJOE onto one.
