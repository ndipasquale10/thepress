# The Press

**Score. Bet. Settle up.**

An offline-first PWA for keeping a golf bet honest. Enter scores hole by hole,
pick a game, and the app tracks the money as you play — then shows exactly who
owes whom, in the fewest transactions, when you walk off 18.

Games: Wolf (with Hammer and Breakout), Nassau with presses, Skins, Match Play,
Stableford, Vegas, Snake, Bingo Bango Bongo, Sixes, Banker, and Trash/Dots.

## Running it

There is no build step for the app. `index.html` is the whole thing — open it,
or serve the repository root over HTTP so the service worker registers:

```sh
python3 -m http.server 8000
```

## Tests

The money math is the product, so it has the most tests.

| Command | What it covers |
| --- | --- |
| `npm test` | Money math, Wolf/Hammer settlement, the course-data build check, and a static design-system audit. A few seconds, no dependencies. |
| `npm run test:flows` | Drives a real browser (Playwright) through complete rounds — the only check that sees bugs in the seam between two screens. |
| `npm run test:rules` | Runs `firestore.rules` through the real rules engine in the Firestore emulator. Requires Java. |

All three run in CI on every push.

## Course data

`data/courses.json` is the single source of truth for the built-in course list;
it is inlined into `index.html` at build time because the app reads `COURSE_DB`
synchronously and has to work with no signal. After editing it, run
`npm run build:courses` and commit both files — `npm test` fails if they drift.

See [`data/README.md`](data/README.md) for the schema and validation rules.

## Architecture

- **`index.html`** — the entire application: markup, styles, and logic in one
  file, so the service worker caches one shell and the app opens on a course
  with no signal.
- **`sw.js`** — the service worker. Caches the shell and static assets
  individually (never `addAll`, which fails atomically) and announces updates
  through the cache so a reloaded page still sees them.
- **`data/`, `scripts/`** — the course database and its build/validation step.
- **`test/`** — money math, Wolf/Hammer settlement, security rules, browser
  flows, and a static design-system audit.

Local storage is the source of truth. Everything in Firestore is a mirror of
what is already on the device, which is why a signed-out player loses nothing.

## Backend and security model

Google Sign-In (Firebase Auth) is optional and unlocks cross-device sync, live
rounds, and the shared course library. Three Firestore collections:

| Collection | Contents | Who can read it |
| --- | --- | --- |
| `users/{uid}` | A private mirror of one player's profiles, courses, and round history | That player only |
| `liveRounds/{code}` | A round in progress. **The document ID is the six-character share code.** | Anyone holding the code |
| `sharedCourses/{slug}` | The community course library — course data only, no personal information | Any signed-in player |

The share code being the document ID is load-bearing. A round can be fetched by
its code and the collection can never be listed by anyone but its own owner, so
there is no query that returns rounds you were not invited to.

`firestore.rules` is the deployed policy, not a copy of it: it is tested in CI
(`test/rules.test.mjs`, 26 cases against the real rules engine) and deployed
from `.github/workflows/deploy-rules.yml` on every push to `main` that touches
it. Editing rules in the Firebase console is how the repository and production
drift apart — don't.

Deploying requires a `FIREBASE_SERVICE_ACCOUNT` repository secret (a service
account JSON key with the Firebase Rules Admin role). Without it the workflow
still tests the rules and warns instead of deploying.

## Legal

- [`privacy.html`](privacy.html) and [`terms.html`](terms.html) are served from
  the site root so they have stable public URLs — app stores require a reachable
  privacy policy link, and a policy that only exists inside a modal has no URL.
  The in-app Settings → Legal screens summarise the same text.
- [`LICENSE`](LICENSE) — proprietary, all rights reserved.

**Before publishing:** both policy pages carry a `CONTACT EMAIL` placeholder and
name "The Press" rather than a legal entity. Replace both with the real contact
address and the company's registered name once it exists.

The Press is a scorekeeper and a calculator. It never accepts, holds, or
transfers money — the settle-up buttons hand off to Venmo, Cash App, or PayPal
with an amount pre-filled, and the payment happens between the players in those
apps. Keeping it that way is what keeps this a utility rather than a regulated
money transmitter or gambling operator.
