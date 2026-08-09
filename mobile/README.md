# Greenside — App Store / Play Store pipeline

This folder wraps the existing web app (the untouched `index.html` at the repo
root) into native iOS and Android apps using [Capacitor](https://capacitorjs.com).

**Nothing here modifies the web app.** `scripts/build-web.mjs` only *copies*
the root web assets into `mobile/www/`, which Capacitor bundles into the native
shell. The web app keeps shipping exactly as before.

```
mobile/
├── capacitor.config.json   # app id, name, web dir
├── package.json            # Capacitor deps + scripts
├── scripts/build-web.mjs   # assembles www/ from the root web app (copy-only)
├── resources/icon.png      # 1254×1254 icon source for generated icon sets
├── www/                    # generated payload (gitignored)
└── ios/ , android/         # generated native projects (gitignored)
```

---

## Prerequisites

| For | You need |
|-----|----------|
| **iOS** | A **Mac** with **Xcode**, and an **Apple Developer Program** membership (**$99/yr**) |
| **Android** | **Android Studio** + JDK 21 (works on Mac/Windows/Linux); Play Console one-time **$25** |
| **Both** | **Node 20+** |

> iOS apps can only be built and submitted from macOS. Android has no such
> restriction and is the easier first launch.

---

## One-time setup

```bash
cd mobile
npm install                 # install Capacitor
npm run build:web           # assemble www/ from the root web app

# add the native platforms you want:
npm run add:ios             # creates mobile/ios   (macOS only)
npm run add:android         # creates mobile/android

# generate all icon + splash sizes from resources/icon.png:
npm run icons
```

Set your real bundle id in `capacitor.config.json` before adding platforms
(e.g. `com.yourcompany.greenside`). It must be globally unique and match what
you register in App Store Connect / Play Console.

---

## Everyday loop (after changing the web app)

```bash
cd mobile
npm run sync                # rebuild www/ from root + copy into native projects
```

`npm run sync` is `build:web` + `cap sync`. Run it any time the root
`index.html` changes so the native apps pick up the update.

---

## Build & submit — iOS

```bash
cd mobile
npm run add:ios     # first time only
npm run sync
npm run open:ios    # opens ios/App/App.xcworkspace in Xcode
```

In Xcode:
1. **Signing & Capabilities** → select your Team; let Xcode manage signing.
2. Set the **version** and **build** numbers.
3. Confirm the **App Icon** set is populated (from `npm run icons`).
4. **Product → Archive**, then **Distribute App → App Store Connect**.
5. In [App Store Connect](https://appstoreconnect.apple.com): create the app
   record, fill metadata + screenshots, attach the build, submit for review.

---

## Build & submit — Android

```bash
cd mobile
npm run add:android   # first time only
npm run sync
npm run open:android  # opens android/ in Android Studio
```

In Android Studio: **Build → Generate Signed App Bundle** (`.aab`), then upload
to the [Play Console](https://play.google.com/console). Alternatively a PWA can
be shipped to Play as a Trusted Web Activity via
[PWABuilder](https://www.pwabuilder.com) with no native code at all.

---

## Store listing assets you'll need

- **App icon** — generated from `resources/icon.png` (already 1254×1254).
  Replace that file to rebrand, then `npm run icons`.
- **Screenshots** — iPhone 6.7" & 6.5" (and iPad if you support it); Android
  phone + tablet. Capture from the simulator/emulator.
- **Privacy Policy + Terms URLs** — the app already has these screens; they need
  to be reachable at public URLs for the store listings.
- **App Privacy “nutrition label”** (Apple) / **Data safety** (Google) — declare
  that the app uses Firebase + Google sign-in and stores round data.
- Name, subtitle, description, keywords, **category: Sports**.

---

## ⚠️ Review gotchas (read before submitting)

1. **“Minimum functionality” (Apple 4.2).** Apple rejects apps that are just a
   website in a WebView. Greenside is genuinely functional offline with
   haptics/PWA behavior — lean into that. The `@capacitor/haptics`,
   `@capacitor/status-bar`, and `@capacitor/app` plugins are included so the app
   uses real native APIs.

2. **Sign in with Apple (Apple 4.8).** Because the app offers **Google**
   sign-in, Apple usually requires you to *also* offer Sign in with Apple. The
   existing **“continue without sign-in (local only)”** option likely exempts
   you (login isn’t required to use the app) — but be ready to add Sign in with
   Apple if a reviewer pushes back.

3. **Betting / Venmo positioning.** Present this as a **scorekeeping and
   expense-settling** app for friendly rounds (think “Splitwise for golf”), not
   a gambling app. Keep “gambling/wager” language out of the store metadata.
   The Venmo hand-off is peer-to-peer real-world money, which is **exempt** from
   Apple’s in-app-purchase cut (Apple only taxes digital goods).

4. **Google Sign-In inside a WebView.** Web-popup Google auth can misbehave in a
   native WebView. If sign-in fails on device, switch to a native auth plugin
   (`@capacitor-firebase/authentication` or `@codetrix-studio/capacitor-google-auth`)
   and add your app’s bundle id / SHA-1 to the Firebase console. Local
   (no-sign-in) mode works regardless.

---

## CI

`.github/workflows/mobile.yml` assembles and verifies `mobile/www` on any change
under `mobile/**`. Native build jobs (Android on Linux, iOS on a macOS runner
with signing secrets) are included but commented out — enable them once your
signing is configured.
