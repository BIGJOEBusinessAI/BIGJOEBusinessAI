# BIGJOE v58.8 — Searchable on the Internet + Installable PC App

## 1. Making BIGJOE searchable on the internet

Being "searchable" needs three things in order — BIGJOE already had #2 mostly done, this
update adds the rest:

### Step 1 — Deploy to a public HTTPS domain (you still need to do this)
Right now, `APP_BASE_URL` in `.env` is only ever set to `http://127.0.0.1:8000` (local), and
the server log literally says *"Not configured yet — deploy with a domain to make BIGJOE
searchable on the internet."* Search engines can't index `localhost` or a LAN IP — nothing
below matters until BIGJOE is running on a real domain with HTTPS (a VPS + your own domain +
a TLS cert, or a host like Render/Railway/Fly.io). Once deployed, set:
```
APP_BASE_URL=https://your-real-domain.com
```

### Step 2 — Already in place: on-page SEO
`public/index.html` already has a title, meta description, `robots` tag, Open Graph tags,
and JSON-LD structured data (`SoftwareApplication`) on the public landing page — no changes
needed there.

### Step 3 — Added now: sitemap + robots.txt pointer
- `public/sitemap.xml` — lists the one publicly crawlable URL (`/`, the marketing landing
  page). BIGJOE is a single-page app and everything past login is behind auth, so there's
  only one page search engines should index — that's normal and fine.
- `public/robots.txt` now points at it (`Sitemap: .../sitemap.xml`).
- Server now serves `.xml`/`.txt`/`.webmanifest` with correct content types (previously only
  `.html`/`.js`/`.css`/`.json` had explicit types).

**Replace the placeholder domain** in both `public/sitemap.xml` and `public/robots.txt`
with your real deployed domain once you have one.

### Step 4 — After deploying (outside this codebase)
- Submit your domain + `sitemap.xml` to [Google Search Console](https://search.google.com/search-console) and Bing Webmaster Tools — this is what actually gets you indexed and searchable, not just having the files.
- Optional but helps ranking: a real `og:image` (currently there's no Open Graph image set),
  backlinks, and consistent NAP (name/address/phone) info if you want local search too.

## 2. Installable PC app

Two options, both usable:

**Option A — already works, no build needed.** BIGJOE already ships `manifest.json` +
`sw.js` (from the mobile-app work), which makes it a valid PWA. Once deployed on HTTPS,
Chrome/Edge/Brave on Windows, macOS, or Linux will offer an **Install BIGJOE** button that
installs a real desktop app — own window, own taskbar/dock icon. Nothing to build.

**Option B — a real downloadable installer.** Added `desktop/` — an Electron scaffold (same
pattern as `mobile/`'s Capacitor wrapper): a thin native shell that opens your deployed
BIGJOE website in its own app window, producing a Windows `.exe`/`.msi`, macOS `.dmg`, or
Linux `.AppImage` you can host as a direct download. See `desktop/README_DESKTOP_APP.md` for
the exact `npm install` → set your domain → `npm run dist:win`/`dist:mac`/`dist:linux` steps.
Building real installers needs Node on the target OS (macOS builds specifically need a Mac)
— that part is on whoever runs the build, same caveat as the mobile apps.

## Notes
- Desktop (both the PWA install and the Electron app) is treated as a normal website surface
  — Payment Hub stays visible there; only the Android/iOS apps hide it (see
  `README_V58_6_MOBILE_APPS_PAYMENT_HUB_RESTRICTION.md`).
- Both "searchable" and "installable" ultimately depend on the same prerequisite: a real
  public HTTPS domain. That's the one manual step nothing here can do for you.
