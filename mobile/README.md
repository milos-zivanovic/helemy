# mobile — Life Tracker mobile app (planned)

> **Status:** not started. This folder is empty apart from this README.

Android and iOS app for Life Tracker, built with Expo (React Native + TypeScript). Like the web client,
it uses only the REST API in [`../api`](../api/README.md).

## Planned stack

| Tool | Role |
|---|---|
| Expo + React Native + TypeScript | Native app for Android and iOS from one codebase |
| Expo Router | File-based navigation between screens |
| TanStack Query | Calling the API, caching, loading/error states |
| expo-secure-store | Storing JWT tokens securely on the device |
| expo-camera | Barcode scanning for foods (later) |
| EAS Build | Building and publishing to app stores (later) |

## Planned way to run

The Expo dev server runs on port **8081**. CORS only matters for Expo's web preview, and the API already
allows that origin; the native app on a phone is not subject to CORS.

```bash
cd mobile
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app on a phone, or press `a` for an Android emulator.

### Why not Docker for mobile

The API (and later the web client) run in Docker, but the Expo dev server should run on the host:

- The phone has to reach the dev server over the local network. From a container this needs extra
  network setup or a slower tunnel (`npx expo start --tunnel`).
- Android emulators and iOS simulators run on the host, not in a container.
- Native builds go through EAS (cloud) or Android Studio / Xcode, not through Compose.

The usual setup is: start the API with Docker (`../infrastructure`), run `npx expo start` on the host.

## Configuration (planned)

| Variable | Example | Meaning |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.10:8000/api/v1` | API base URL |

On a physical phone `localhost` means the phone itself, so use your computer's LAN IP address, and add it
to the API's `ALLOWED_HOSTS`.

## First steps when starting

1. `npx create-expo-app@latest mobile` from the repo root (the default template uses TypeScript and Expo Router)
2. Login screen and token storage
3. Quick "add expense" screen (the most frequent action on a phone)
4. Transactions list and budgets overview
