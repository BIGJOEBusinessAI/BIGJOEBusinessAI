// Minimal preload — BIGJOE's web app (public/app.js) already detects Capacitor for the
// mobile apps; for desktop it only needs to know it's running inside Electron so Payment
// Hub etc. keep behaving like a normal website (desktop is treated as "web", not native
// mobile — Payment Hub stays visible here since this is just BIGJOE's website in a window,
// not a distinct restricted surface). Nothing is exposed to the page by default.
