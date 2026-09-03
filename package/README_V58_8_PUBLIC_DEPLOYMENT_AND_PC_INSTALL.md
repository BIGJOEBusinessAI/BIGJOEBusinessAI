# BIGJOE v58.8 — Searchable on the Internet + Installable PC App

Two separate questions, both answered below.

## 1. Making BIGJOE searchable on the internet

Right now BIGJOE only exists at `http://localhost:8000` (or your LAN IP) — that's why it
can't be found on Google. Search engines can only index something that's permanently
reachable at a public address. Steps, in order:

1. **Deploy the server somewhere that's always on**, not your own PC. Pick one:
   - Managed platforms (least setup): Railway, Render, Fly.io, DigitalOcean App Platform.
   - A VPS (more control): DigitalOcean/Linode/AWS EC2 droplet + Nginx as a reverse proxy in
     front of `node server.js` + a free TLS certificate via Let's Encrypt/Certbot.
2. **Buy a domain** (e.g. `bigjoe.ng`, `bigjoeapp.com`) and point its DNS at your host.
3. **Set `APP_BASE_URL`** in `.env` to your real `https://` domain — BIGJOE already uses
   this for Flutterwave's `redirect_url`, so this needs to be correct before payments work
   in production too.
4. The SEO groundwork is already in `public/index.html` (meta description, Open Graph tags,
   JSON-LD `SoftwareApplication` schema) and `public/robots.txt` / `public/sitemap.xml` —
   I updated `robots.txt` this round to keep crawlers out of `/api/`, `/payment/callback`
   and `/webhooks/` (nothing useful to index there, and no reason to advertise those paths).
   **Replace the placeholder domain** in both `robots.txt` and `sitemap.xml` with your real
   one once you have it.
5. **Submit the site** to [Google Search Console](https://search.google.com/search-console)
   and [Bing Webmaster Tools](https://www.bing.com/webmasters) and request indexing — this
   is what actually gets you into search results; simply being online isn't enough by
   itself. Getting other sites to link to yours (social media, business directories,
   partners) speeds this up.
6. Indexing typically takes anywhere from a few days to a few weeks after submission.

## 2. Installable PC app

BIGJOE already ships everything a PWA needs to be a real installable desktop app —
`manifest.json` and a service worker (`sw.js`) were already in place. Once served over
HTTPS, Chrome/Edge on Windows, Mac, and Linux can install it as a standalone app with its
own window, taskbar/dock icon, and Start Menu / Applications entry — no separate `.exe`
download, and it stays up to date automatically since it's just loading your live site.

**What I added this round:** a visible **"⬇ Install BIGJOE"** button (bottom-right corner)
that appears automatically once the browser says the app is installable, instead of relying
on people noticing the small icon in the address bar. Clicking it triggers the same native
install prompt Chrome/Edge would show. It hides itself once BIGJOE is already installed or
running inside the button won't appear at all on Safari/Firefox (they don't support this
prompt API — those browsers install via their own "Add to Home Screen" / menu options
instead, which still works because of the manifest).

To try it: deploy BIGJOE to HTTPS (install only works on secure origins — `localhost` during
development is the one exception Chrome allows), open it in Chrome or Edge, and the Install
button will appear.

## If you specifically want a downloadable `.exe`/`.dmg` installer instead

The PWA install above covers "installable PC app" for the vast majority of cases with zero
extra build tooling. If you'd rather have a literal downloadable installer file (e.g. to
distribute outside a browser, or for users who don't use Chrome/Edge), the next step would
be an Electron wrapper — similar in spirit to the `mobile/` Capacitor scaffold already in
this project, but for desktop. I didn't build that this round since it's a materially
bigger addition (a full Electron project, `electron-builder` packaging, code-signing
certificates for Windows SmartScreen / macOS Gatekeeper); let me know if you want it and
I'll scaffold it the same way.
