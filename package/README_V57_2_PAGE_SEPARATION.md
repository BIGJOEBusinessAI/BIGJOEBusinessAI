# BIGJOE Business AI v57.2 — Strict Page Separation

## Purpose
This release fixes the public-to-authentication-to-application flow so the three major experiences are visually and structurally separated.

## Changes
- Welcome page is a dedicated full-screen experience.
- The public marketing sections are no longer part of the initial welcome screen.
- The welcome page shows the BIGJOE brand, business name, description and rotating feature advert.
- The welcome header contains only the **Start Free** action on the right.
- Start Free opens a dedicated login/authentication screen.
- The login credential card is positioned near the top of the authentication screen for immediate visibility.
- Login and registration fields have explicit labels and improved spacing.
- Successful authentication opens the Overview application screen directly.
- The public header is hidden during authentication and inside the application.
- The application becomes its own scrollable workspace, preventing welcome/login/app content from appearing in one continuous page.
- Mobile and desktop layouts retain the same separation behavior.

## Validation
- `node --check public/app.js`
- `node --check server.js`

Both checks pass for this release.
