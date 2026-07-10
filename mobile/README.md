# IPO Team Manager — Mobile (Expo)

Android / iOS / web app for IPO Team Manager. Uses the same backend API as the web app. **Audit log is not included** in the mobile app.

## Quick start

```bash
cd mobile
npm install
npm run web      # test in browser
npm run android  # Android emulator or device (Expo Go)
```

## Backend URL configuration

Edit `mobile/.env` (copy from `.env.example`):

```env
# Production — Vercel (same as web app)
EXPO_PUBLIC_API_BASE_URL=https://ipo-manager-one.vercel.app/api

# Local backend
# EXPO_PUBLIC_API_BASE_URL=http://localhost:5000/api

# Android emulator → host machine
# EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5000/api
```

Restart Expo after changing `.env`:

```bash
npm start
```

The value is read at build time via `EXPO_PUBLIC_*` and `app.config.js` → `extra.apiBaseUrl`.

## Features

| Area | Screens |
|------|---------|
| Auth | Manager login, member PAN login, register, forgot password, email verify |
| Manager | Dashboard, notifications, members, sub-groups, fund providers, wallet, IPOs, summary, profit sharing, settings |
| Member | Portal (dashboard, issues, allotment links) |
| Admin | Dashboard, registrations, tenant detail, profile settings |

**Excluded:** Audit log (manager and admin).

## Project structure

```
mobile/
  app/                 # Expo Router routes
  src/
    api/               # axios clients (same endpoints as web)
    context/           # Auth providers
    screens/           # Screen components
    components/        # Shared UI
    utils/             # format, errors, IPO helpers
  .env                 # API base URL (not committed with secrets)
  app.config.js        # Expo config + extra.apiBaseUrl
```

## Building for production

```bash
# Install EAS CLI (one time)
npm install -g eas-cli

# Configure and build Android APK/AAB
eas build -p android
```

Set `EXPO_PUBLIC_API_BASE_URL` in EAS secrets or `.env` before building so the release app points at your production backend.

## Notes

- Uses `AsyncStorage` for JWT tokens (same API auth as web).
- Web testing works via `npm run web` — useful before deploying to a device.
- When you move the backend to a new server, only update `EXPO_PUBLIC_API_BASE_URL` in `.env` and rebuild/restart.
