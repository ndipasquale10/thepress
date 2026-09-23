# Upgrade redesign plan

A plan for the next major version of The Press, written against the shipped
`index.html` (623 KB: 216 KB of styles, 358 KB of script, 48 KB of course
data) and the three earlier passes in this folder. Items those passes already
shipped are not repeated. Items they proposed and that are still absent from
the shell are folded in here with the evidence re-checked, so this document
can stand on its own as the backlog for the upgrade.

The app is in good shape on the things a golf-bet tracker must get right: the
money math is tested, the launch path is offline-clean, the scoring hot path
is measured. The upgrade is therefore not a rescue. It is about three things:

1. **Closing the product loop.** The app is named after settling up and
   cannot record that anyone settled.
2. **Making the hot path one tap.** Score entry is the interaction repeated
   72 times a round and it still asks for arithmetic.
3. **Paying down the platform.** One 623 KB file with minified JavaScript
   committed as source is at the edge of what can be safely changed.

Everything below is a bullet with enough detail to be picked up. Effort is
XS (an hour), S (a day), M (a few days), L (a week or more).

---

## 1. Settlement: finish the loop the app is named after

The gap `design-ideas-2.md` §A identified is still there: there is no paid
state anywhere in the code (`settledPayments` and `markPaid` appear zero
times). The Settle screen renders payment deep links and the story ends.

- **Mark-as-paid on every settlement row (M).** A `settledPayments` map on the
  round, `{fromIdx-toIdx: timestamp}`, a tappable check on each row, and a
  "2 of 3 paid" pill on the section head. Honour system, no integration,
  which is the right altitude for a foursome.
- **An outstanding-money band on Home (S).** The one number people open the
  app to see and cannot get today: what is still owed to or by you across
  every round. Derived from the map above.
- **Make "Nothing outstanding" true (XS).** Today it is derived from
  `finished:true`. Once paid state exists it should be derived from that.
- **Split the season money table into ledger and scoreboard (S).** It is
  presented as a ledger and computed as a scoreboard. Show "won" and "collected"
  as separate columns, or label it as the scoreboard it is.
- **Ask for the payment handle at the moment of payment (S).** A row for a
  payee with no Venmo/Cash App/PayPal handle should show an inline "add
  @handle" affordance on the Settle screen. Handles already persist by name in
  `golfProfiles`, so it is a one-time ask per playing partner. #108 folded the
  handles away in the roster card, which was the right half of this change.
- **A shareable settlement summary (S).** `navigator.share` is already wired
  for the scorecard. A one-tap "send the tab to the group" text summary of
  who owes whom is the natural companion, and it works from the clubhouse bar.
- **Reopen a finished round and see what you already tapped (XS).** Falls
  out of the map; listed so it is not forgotten.

## 2. Scoring: the hot path

The audit measured the scoring screen and found it fast. What remains is
interaction design, not performance.

- **Relative-to-par entry as the primary row (M).** Golfers say "bogey", not
  "six". A primary row of −1 · Par · +1 · +2 · Pick up covers most entries in
  one tap with no arithmetic and reads identically on a par 3 and a par 5.
  Absolute numbers stay as a secondary row. This also dissolves the
  birdie-is-red problem in §3, because a button labelled "Birdie" needs no
  colour to say so.
- **One input model per row (S).** The picker auto-advances to the next
  unscored player; the stepper does not. Decide once. The stepper is for
  corrections, so the cleanest rule is: the picker advances, the stepper
  never does, and the row says which one you are in.
- **Sticky confirm bar (XS).** Confirm is the action taken on every hole and
  it scrolls away under the ledger cards. Make it a bottom action bar on the
  scoring screen only.
- **Ledger cards behind a segment control (M).** Hole info, score inputs,
  preview, game status, money log, and play feed are six stacked cards of
  equal weight. Only score inputs are needed on every hole. Put the rest
  behind a Scores · Money · Feed segment and reclaim the scroll.
- **Make the handicap stroke impossible to miss (S).** The single
  highest-stakes fact on the screen is who strokes on this hole. Today it is
  a small badge, and every other row says "No strokes". Drop the negative
  chips, give the stroking row a coloured left rule and the net result in
  full weight.
- **Landscape scoring for the cart (M).** There is no landscape media query
  in the shell. On a cart mount in landscape the sticky header and hole dots
  eat the viewport and zero score rows are visible. A two-column landscape
  layout, roster left and ledger right, turns the cart into the best place
  to use the app.
- **Glove mode (S).** Wind, gloves, one hand, three people waiting. A setting
  that raises `--tap` and the picker's button size, turned on from the
  scoring screen itself, not buried in Settings.
- **Announce money moves (XS).** Four `aria-live` regions exist, all on
  toasts and the offline chip. Confirming a hole moves real money and says so
  only visually. The standings ribbon should be `aria-live="polite"`.

## 3. Visual system: one language, three skins

The token layer is strong and the audit enforces it. The upgrade is about the
places two meanings share one token, and about the chrome that never got a
system.

- **Split money colour from score colour (M).** Red is good in golf and bad
  in money, and both draw from `--red-t`. `--up`/`--down` exist for money and
  are barely used. Add `--under`/`--over` for score-to-par, make `--green-t`/
  `--red-t` raw ramp values only the token layer may reference, and have
  `ui-audit.py` enforce that. This single change fixes three separate
  collisions (scorecard cells, quick picker, standings ribbon).
- **Birdie and eagle still render identically (XS).** `.qp-birdie` and
  `.qp-eagle` have byte-identical declarations, and `.qp-par` is declared
  twice with the first rule dead. Fix in the same commit as the token split.
- **One icon set (M).** The chrome mixes inline SVG (12), emoji (14 code
  points, including the ⛳ and 👁 in load-bearing positions), and text glyphs
  (◀ ▶ ✕ ＋). Emoji render differently on every platform and cannot take the
  skin's ink colour. Draw a small stroke-icon set in the style of the existing
  onboarding icons and use it for everything in the chrome, the game grid
  included.
- **Give each game a mark (S).** The game grid is twelve text cards. A glyph
  per game (the wolf, the snake, the nassau's three bars) makes the grid
  scannable and gives the app a visual voice on the screen people show their
  friends.
- **Scorecard notation parity (S).** The score chip invented a circle/square
  language for under and over par. The shared scorecard, the app's one
  artefact that leaves the phone, does not use it. It should.
- **Make the skin picker a real three-way choice (XS).** Clubhouse,
  Broadcast, and Sunlight all exist as theme blocks. The picker still reads as
  a dark-mode toggle plus an extra. Present the three as equals with a
  swatch each, and honour `prefers-color-scheme` as the default, which it
  already does.
- **Flatten the duplicated selectors (M).** The earlier pass counted 52
  selector lists declared more than once. Each one is a place a future edit
  changes the wrong rule. Flatten and add a duplicate-selector budget to the
  audit so it stays flat.
- **Shape the desktop (S).** A 540 px column on a 1280 px viewport with cream
  either side reads as a phone app opened wrong. A faint paper edge and a rule
  make it read as intentional, at almost no cost.
- **A hole-dot legend (XS).** The hole strip has a shape language for
  played, current, and skipped holes and no legend. One line under the strip.

## 4. Live rounds and sharing

Live rounds work and are tested across two real browsers. The presentation
of the feature is far below its value.

- **A Go Live sheet (M).** The six-character share code is the entire point
  of the feature and it renders as body text inside a confirm dialog. Show it
  at display size in the serif face, letter-spaced, tap to copy, with a QR of
  the watch URL underneath and the link as a third option. On a tee box,
  "point your phone at mine" beats everything else. QR generation is ~40
  lines or one small precached dependency.
- **Scan to join (S).** The other half of the sheet: a "Join" that opens the
  camera via `BarcodeDetector` where available and falls back to the code
  prompt elsewhere.
- **Presence and a soft lock (L).** The snapshot handler replaces the whole
  score state on every update, last write wins, and the loser sees their
  entry vanish silently. The realistic fix for a foursome is presence, not
  CRDTs: avatars in the topbar for everyone in the round, and "Dave is
  scoring hole 8" when someone else is on your hole. It turns a data race into
  a social one, which the group can settle themselves.
- **A broadcast layout for the Watch screen (M).** The dark skin is named
  Broadcast and the Watch screen renders in a 540 px column. At
  `min-width: 900px` on Watch only: money board and thru-count on the left,
  hole-by-hole ledger on the right, type scaled up, no tab bar. A laptop in
  the clubhouse becomes a leaderboard. The app has 90% of this and shows 20%
  of it.
- **Push for live rounds (M).** `Notification` is already requested and used
  locally. A spectator who has backgrounded the tab should get "Hole 14: Tommy
  takes the skin" without staring at the screen. Needs a small Cloud Function
  or FCM topic per round; scope it as an opt-in on the Watch screen.
- **Print stylesheet (S).** `@media print` appears zero times. The full
  scorecard is the app's artefact for the clubhouse board. Drop chrome, force
  the light skin, OUT/IN/TOT columns full width, one page.

## 5. First run and setup

- **Replace the three-slide onboarding with a demo round (M).** Three slides
  explain what the app does. A pre-filled demo round on a real course with
  three named players and a Wolf game in progress shows it, and lets the
  first tap be a score. The slides survive as the fallback for a screen
  reader.
- **Setup as a stepper with a progress rail (M).** Course, players, game are
  three screens with no sense of where you are in the sequence. A three-dot
  rail at the top and a "Next: pick your game" primary button unify them and
  make the sticky-versus-static CTA inconsistency go away.
- **Repeat last round (S).** The commonest setup is the same course, the same
  four people, the same game as last Saturday. One card on Home: "Same as
  last time?" with the course, roster, and game, and a single tap to the first
  tee. "Add last group" exists in the roster; this is that idea at the level
  of the whole round.
- **Course search that works away from the list (S).** Search is over a
  built-in US list plus saved courses. When it misses, the empty state says
  "enter your course manually below". Offer the shared course library search
  inline when signed in, and a "use par 72 and fix pars later" one-tap escape
  when not.
- **Smart empty states (XS).** History has one. Settle, You, and Watch should
  each say what will appear there and offer the one action that makes it
  appear.

## 6. Data, history, and the player's own story

- **Import and restore (S).** Export exists as a JSON backup. There is no
  import. A backup nobody can restore is a file, not a backup. Add "Restore
  from backup" to Settings with a merge-by-round-id, and a CSV export for the
  people who keep a spreadsheet.
- **Head-to-head records (M).** The season table shows money by player. The
  thing people actually argue about is "I own you at Wolf". A per-pair record
  (rounds, money, holes won) on the You screen and a rivalry card on Home.
- **Per-course history (S).** Best round here, scoring average by hole, the
  hole that costs you money. The data is already stored per round with pars
  and handicap indexes.
- **Move history out of one localStorage blob (M).** The audit measured a
  200-round history at 397 KB and fixed the per-second rewrite with a
  write-behind buffer. The next ceiling is the 5 MB origin quota and the
  synchronous parse of the whole blob on launch. IndexedDB, one record per
  round, with the same `readRounds()` interface so nothing above it changes.
  The current-round buffer stays in localStorage because it must survive
  anything.
- **Handicap index, not just course handicap (S).** Players enter a
  handicap. Storing an index and computing the course handicap from the tee's
  slope and rating (the app already has both on the tee object) is what a
  golfer expects, and it makes the "80% off the low man" mode explainable.

## 7. Accessibility and resilience

- **Modals with `inert` (S).** `inert` appears zero times. Modals set
  `aria-modal` and manage focus by hand; marking the app root inert while a
  dialog is open is the standard mechanism and removes a class of focus bugs.
- **Broadcast row as a switch (XS).** Still a `role="button"` that behaves
  like a switch. `role="switch"` with `aria-checked`, as the wake-lock row
  already has.
- **Keyboard delegate keyed off roles (XS).** The Enter/Space delegate
  matches `[role="button"][tabindex="0"]` exactly. Extend it to a list of
  interactive roles so the next role added does not silently lose keyboard
  support.
- **Colour-independent money state (XS).** With the token split in §3,
  add a sign or a glyph to money deltas so a colour-blind player reads the
  ribbon correctly.
- **Storage-full handling as a first-class state (S).** `showStorageWarning`
  exists. Pair it with the IndexedDB move and a "free up space" action that
  archives old rounds to the cloud mirror when signed in.

## 8. Engineering platform

This section is the enabling work for everything above. It is listed last
because it has no user-visible payoff on its own, and first in the phasing
below because most of the M and L items are unsafe without it.

- **Keep readable source and generate `index.html` (L).** The committed
  script is minifier output: comma-operator sequences, `!0` for `true`, and
  205 functions with single-letter parameter names against 46 with real ones.
  There is no readable source in the repository. Every change is being made
  by editing minified code. Split into `src/` (styles, modules, markup) and a
  build script that emits the single-file shell the service worker depends
  on. `scripts/build-courses.js` and `scripts/build-preview.py` already
  establish the pattern of generated output checked by CI. The shipped
  artefact stays one file; only the authoring form changes.
- **Modular Firebase, still on idle (M).** The compat build of SDK 10.12
  is three bundles totalling 528 KB. The modular SDK tree-shakes to a
  fraction of that and the loader's contract (`ensureFirebase()` on idle,
  awaited only where needed) does not change.
- **Replace the six `setInterval` pollers (XS).** They install the sync
  wrappers by polling for functions that are hoisted in the same script. They
  can be direct calls, and then the first 100 ms after load no longer has an
  unwrapped `saveCurrentRound`.
- **Cheaper update checks (S).** The service worker refetches the full
  shell on every launch to detect a deploy: 185 KB gzipped per launch on a
  metered connection. A `HEAD` with an ETag answers the same question for
  nothing. Pair it with a visible version string and a "what's new" sheet so
  players know the app updated.
- **Event delegation instead of 175 inline `onclick`s (M).** Inline handlers
  force every function global, block a content security policy, and hide
  the wiring from search. Move to `data-action` attributes and one delegate.
  This is best done as part of the source split.
- **Subset the embedded fonts (S).** The style block is 216 KB, most of it
  base64 font payloads. Subsetting to the glyphs the app uses (Latin, digits,
  the currency and notation glyphs) will likely halve the shell.
- **A test per game format (M).** `calc.test.js` and `wolf-hammer.test.js`
  cover the money math for the formats that have had bugs. Eleven formats
  should each have a settlement fixture: a known round, a known payout. This
  is the safety net for the source split.
- **Security review of the mirror (S).** The rules are tested. A pass on the
  client side: what a joined editor can write to `liveRounds` beyond scores,
  and whether a malicious course in `sharedCourses` can carry markup into
  `innerHTML` (85 uses). `esc()` exists; confirm it is on every path.

---

## Phasing

Ordered by value to the player divided by effort, with the platform work
placed where it unblocks the most.

| Phase | Weeks | What ships | Why this order |
|---|---|---|---|
| **1. Close the loop** | 1–3 | Mark-as-paid, outstanding band, handle at point of payment, sticky confirm, stroke visibility, Go Live sheet with QR, money/score token split, birdie/eagle fix | Every item is S or smaller in the current codebase and each is the biggest gap in its screen. No platform work required. |
| **2. Platform** | 4–7 | Source split and build, event delegation, modular Firebase, font subsetting, one test fixture per format, cheaper update check, poller cleanup | Makes phase 3 safe. Ship it as one PR with a byte-comparison of behaviour via the flows test, not as a rewrite. |
| **3. The hot path** | 8–10 | Relative-to-par entry, ledger segment control, landscape scoring, glove mode, one input model, aria-live ribbon | The most-repeated interaction, redesigned on a codebase that can now be refactored. |
| **4. Surfaces** | 11–14 | Broadcast Watch layout, print stylesheet, presence and soft lock, push for spectators, icon set and game marks, three-way skin picker | New value from features the app already has most of. |
| **5. The player's story** | 15–17 | Demo-round onboarding, repeat last round, head-to-head, per-course history, IndexedDB history, import and restore | Retention work. Depends on the storage move, which depends on phase 2. |

## What to measure

The app has a performance harness but no product metrics. Before phase 1,
add a local-only event counter (no network, exportable with the backup) so
each phase can be judged:

- Taps per hole scored, before and after relative-to-par entry.
- Seconds from app open to first score on a resumed round.
- Share of finished rounds with at least one payment marked paid.
- Share of rounds that go live, and share of those joined by code versus
  scanned.
- Share of rounds set up via "repeat last round".

## Not doing

- **Payments in-app.** The app hands off to Venmo, Cash App, and PayPal
  with an amount pre-filled and never holds money. That is what keeps it a
  calculator rather than a regulated money transmitter. Mark-as-paid is an
  honour-system checkbox, deliberately.
- **A framework.** The single-file shell, the service worker, and the
  offline promise are the product's foundation. The source split in §8
  changes how the file is authored, not what ships.
- **Surgical DOM updates on the scoring screen.** Measured at 0.63 ms per
  tap with four players. The audit was right to leave it alone.
