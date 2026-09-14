# Design update ideas

Written against `61dafb2`. Every number below was measured in Chromium at
390×844 (iPhone 14-class) on `build/preview.html`, on the seeded demo round —
hole 8 of 18, four players, Nassau.

The design system is not the problem. Tokens are clean (the `ui-audit`
budgets are all at zero), contrast is strong in both skins, tap targets are
honoured, and reduced-motion is handled. What follows is mostly about
**spend**: where the layout puts its pixels, and where the system says one
thing in one place and another thing three screens later.

---

## 1. The scoring screen spends half the screen before the first score

This is the screen a player looks at eighteen times a round, standing up, one
thumb, in the sun. Measured stack from the top:

| Band | Height | Running |
|---|---|---|
| `.round-topbar` (Home / Share) | 48px | 48 |
| `#hole-dots` (18 pills, 3 wrapped rows) | **152px** | 208 |
| `#standings-ribbon` | 66px | 288 |
| `#hole-info` (PAR · HCP / "Hole 8") | 75px | 377 |
| first `.score-row` begins | — | **391** |

391 of 844 px — **46% of the viewport is chrome** before the first thing you
came to touch. The whole hole is 1823px tall, 2.2 viewports, across 7 stacked
`.card`s of identical visual weight.

The consequence that matters: **"Confirm Hole 8 Scores" sits at y=991**, and
the tab bar cuts the viewport at 788. It is below the fold on every hole, on
every round, forever. Scoring a hole is: tap, tap, tap, tap, scroll, confirm.

### 1a. Collapse the hole navigator (152px → ~44px)

`#hole-dots` is `flex-wrap` + `justify-content:center`, so 18 pills break
7 / 7 / 4 and the last row centres — it reads ragged, and it costs more than
the score rows it pushes down. Options, cheapest first:

- **Single scrolling row**, current hole scrolled to centre, `scroll-snap-x`.
  Keeps every hole reachable, costs one row (~44px). Saves ~108px.
- **Front/back segmented**: show the active nine, tap to flip. Saves ~76px and
  matches how the scorecard is already split.
- **Progress rail**: an 18-segment bar, ~12px tall, colour-coded the way the
  dots already are, with the current hole as a marker. Tapping a segment jumps.
  Saves ~140px, and reads better at a glance than eighteen numerals.

### 1b. Make the confirm a sticky action bar

`#start-btn` on the setup screen is already `position:sticky; bottom:calc(var(--sp-6) + var(--tabbar-h) + env(safe-area-inset-bottom,0px))` and it
works well. The scoring screen's confirm — the single most-tapped control in
the app — is a static button 200px below the fold. Give it the same treatment.
The pattern is already written; it just isn't applied where it pays most.

### 1c. The par pre-fill claims a birdie you haven't made

Unscored rows render the par value at `opacity:.5` with a dashed border — but
the *result* column is computed from that placeholder. In the seeded round,
Tommy P has a stroke on hole 8, so an un-entered hole shows a dashed red
**circle** and the label **"Birdie · 5 → Net 4"**. Nothing has been entered.

Two readings, pick one and commit:

- **Placeholder**: blank the chip (show `–`), suppress the result label
  entirely until a score exists. The counter still starts from par when you
  tap `+`/`−`.
- **Default**: drop the dashed/50% treatment, treat par as a real entered
  score, and let "unscored" mean "nobody has touched this row" some other way
  (e.g. the row tinted, not the chip).

Right now it is visually a placeholder and semantically a score, which is why
it reads as a bug.

### 1d. Seven equal-weight cards, one of which you actually need

`#hole-info`, `#score-inputs`, `#hole-preview`, `#game-status`,
`#hole-money-log`, `#play-feed` all share `.card` — same background, radius,
border, shadow. The hole's ledger and the play-by-play are reference material;
they sit between the scores and the actions. Fold `#game-status` /
`#hole-money-log` / `#play-feed` behind a small segmented control ("Match ·
Money · Feed") below the confirm, one open at a time. Saves roughly 600px of
scroll per hole and gives `#score-inputs` the hierarchy it deserves.

### 1e. Landscape currently shows zero score rows

At 844×390 (phone in a cart holder, or a Plus-size phone turned sideways) the
topbar + hole dots + ribbon + hole-info fill the viewport exactly. Not one
`.score-row` is visible; the tab bar covers what's left. There is no
`orientation` media query anywhere in the stylesheet. Even without a full
landscape layout, an `@media (orientation:landscape) and (max-height:480px)`
that drops the hole dots to the compact rail and hides the topbar would make
the screen usable.

---

## 2. Say the same thing twice, the same way

### 2a. The scorecard forgets the notation the score chip invented

In-round, `.score-val` has a genuinely nice type-led language: birdie is a
**circle**, eagle a circle with an outer ring, bogey a **square**, double a
square with an outer ring. That is the notation on every paper scorecard in
the world, and the app draws it correctly.

In the Full Scorecard modal, all of that is thrown away for background tints —
and the tints collide:

```css
.scorecard-tbl .birdie-cell { background:var(--danger-surface);color:var(--red-t);font-weight:700; }
.scorecard-tbl .eagle-cell  { background:var(--danger-surface);color:var(--red-t);font-weight:700; }
.scorecard-tbl .bogey-cell  { background:var(--surface-2); }
.scorecard-tbl .double-cell { background:var(--surface-2); }
```

Birdie and eagle are pixel-identical. So are bogey and double. An eagle — the
best thing that happens in a round of golf — is indistinguishable from a
birdie on the artefact people screenshot and send to the group chat.

Port the ring/square treatment to the table cells. It's the highest
brand-value change in this document for the least code: the app already owns
the drawing, it just isn't used where the round gets memorialised.

### 2b. Sticky CTA on setup, static CTA on games

Setup's "Continue → Game & Bets" is sticky. The Games screen — **2276px tall,
2.7 viewports**, twelve game cards in a flat list plus the side-bet stack —
ends in a plain `.btn primary large`. Pick a game at the top and the button
that acts on it is three screens away. Same sticky treatment, same reasons.

While there: twelve equal cards in one column is the reason it's 2.7 screens.
Grouping them (Team · Individual · Points · Side) or collapsing unchosen games
to a one-line chip would cut it roughly in half.

### 2c. Iconography is three systems at once

- The nav bar uses a considered inline-SVG line set (1.7 stroke, round caps).
- The logo is a typographic seal (`.brand-seal`, the display serif "P" inside
  two rings) — lovely, and the strongest brand asset here.
- Everything else is **emoji and geometric glyphs**: 🐺 🐍 🔥 🏆 ⛳ 🦅 🐦 🎯 👁 📡
  💰 for game and empty-state icons, and `◀ ▶ ✕ ✓ ▼ ▾ ▲ → ✎ ●` for chrome.

Emoji render as Apple's glossy colour set on iOS and Noto's on Android — the
one part of the UI the design system has no control over, dropped into a
restrained ink-on-paper aesthetic. The geometric glyphs are worse: they're
font-dependent, optically off-centre in their boxes, and don't inherit the
nav's stroke weight.

Extending the existing SVG set to cover the ~10 chrome glyphs (chevron, close,
check, caret, arrow) plus the dozen game marks would make the icon layer feel
authored. The game marks especially — a wolf, a snake, a flag — are a chance
for the app to have a real visual voice instead of borrowing the OS's.

### 2d. The hole-dot shape language has no legend

Played holes render as rounded rectangles, unplayed as circles, with
`.dot-under` / `.dot-over` pseudo-element badges on top. On screen it reads as
noise — you can see that holes 1, 5, 6, 7 differ from 2, 3, 4, but not what
that means. Either give it a one-line key, or let the compact rail from §1a
carry it as colour only.

---

## 3. Token-layer work

### 3a. Honour `prefers-color-scheme` on first launch

The `broadcast` skin is genuinely good — gold on near-black, and the money
greens/reds hold up. But it's reachable only by tapping the moon, and the
stylesheet has **no `prefers-color-scheme` query at all**. A player who opens
the app at dusk with the phone in dark mode gets a full-brightness cream page.

Keep the manual toggle as the override; make the *initial* value follow the
system when nothing is stored. Three lines in the boot script plus a media
query mirroring the `[data-theme="broadcast"]` block.

### 3b. `--blue` fails contrast in broadcast

Measured against `--card`:

| Token | On `--card` (broadcast) | Used as |
|---|---|---|
| `--blue` `#5b86e0` | **3.99** | text — `.stroke-dot-label`, `.results-pnet`, `.qp-bogey` |

Under 4.5:1 for body-size text. Everything else in both skins clears
comfortably (`--muted` is 5.6–6.3, `--red-t` 4.68, the rest 5–17). Lightening
`--blue` to roughly `#7ba0ea` in the broadcast block clears it without moving
the light theme.

### 3c. 52 selector-lists are declared more than once

The stylesheet has accreted a sediment layer — each design pass appended
overrides rather than editing the base rule. Worst offenders:

```
3x  .scoring-actions .btn       overrides: flex, font-size, padding, min-width
3x  header h1                   overrides: font-size, letter-spacing
3x  .rib-amt                    overrides: font-weight, font-size
2x  .game-card                  overrides: display, flex-direction, gap, text-align, padding
2x  .score-counter .score-val.birdie   — the second rule fully replaces the first
```

`.score-val.birdie` is the sharp example: the first rule paints it green with
a tinted fill, the second (350 rules later) makes it a red-outlined circle.
Only the second applies. Anyone reading the first one is reading dead code.

This is exactly what `test/ui-audit.py` exists to catch, and it currently
can't see it. A `duplicate selector-lists` budget in the same style as the
others — set at the count after a flattening pass, so it can only go down —
would hold the line. ~30 minutes of work; keeps the next design pass honest.

### 3d. The viewport lock is now redundant, and costs pinch-zoom

```html
<meta name="viewport" content="... maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

`#100` fixed the iOS focus-zoom properly, by flooring every control at 16px
under `@media (pointer:coarse)`. The viewport lock was the old fix for the
same problem. It's now belt-and-braces — iOS has ignored `user-scalable=no`
since iOS 10, but **Android still honours it**, so on Android the app cannot
be pinch-zoomed at all. That's WCAG 1.4.4, on an app whose core surface is a
dense numeric table read outdoors by people who mostly need reading glasses.

Dropping `maximum-scale` and `user-scalable` should now be a no-op on the bug
they were added for.

---

## 4. Surfaces worth building

### 4a. Make "Watch" actually broadcast

The dark skin is *named* `broadcast`. There's a spectator mode, a watch code,
a live money board, a `LIVE` pill with a blinking dot. Then it renders in a
540px column with 740px of empty cream either side on any laptop.

The obvious payoff: a `@media (min-width:900px)` layout for `#watch-screen`
only — money board and thru-count on the left, hole-by-hole ledger on the
right, type scaled up, no tab bar. Someone in the clubhouse props a laptop up
and the group follows the round. That is a feature the app already has
90% of, presented at 20% of its value.

### 4b. A print stylesheet for the scorecard

`@media print` appears zero times. The Full Scorecard modal is the app's
shareable artefact — there's already a Share Scorecard button and an
html2canvas image export. A print sheet (drop chrome, force the light skin,
lay the table out full-width with the OUT/IN/TOT columns, one page) costs
maybe 40 lines and makes "print it for the clubhouse board" work.

### 4c. Desktop: use the space or shape it

The 540px cap is a legitimate choice for a phone-first PWA, but 1280px of
viewport currently gets 540px of app and two cream margins. Two cheap options:

- **Shape it**: a subtle centred frame — a paper edge, a faint rule — so the
  column reads as intentional rather than as a phone app someone opened wrong.
- **Use it**: at `min-width:900px`, the Home screen's season card + group
  table side by side, and the setup screen's course card + roster side by
  side. Both are already independent blocks; it's a grid wrapper and a
  breakpoint.

---

## Suggested order

| # | Change | Effort | Payoff |
|---|---|---|---|
| 1 | Sticky confirm on scoring (§1b) | XS | Every hole, every round |
| 2 | Scorecard notation parity (§2a) | S | Brand; the shared artefact |
| 3 | Compact hole navigator (§1a) | S | ~110px back above the fold |
| 4 | Par pre-fill semantics (§1c) | S | Removes a real misread |
| 5 | `prefers-color-scheme` (§3a) | XS | First-launch impression |
| 6 | Sticky CTA on games (§2b) | XS | Consistency |
| 7 | Drop the viewport lock (§3d) | XS | Accessibility |
| 8 | `--blue` in broadcast (§3b) | XS | Contrast |
| 9 | Flatten dupes + audit budget (§3c) | M | Stops the next pass drifting |
| 10 | Ledger cards behind a segment (§1d) | M | ~600px of scroll per hole |
| 11 | Icon set for chrome + games (§2c) | M | Visual voice |
| 12 | Wide Watch layout (§4a) | M | New surface from existing code |
| 13 | Landscape scoring (§1e) | M | Cart use |
| 14 | Print scorecard (§4b) | S | Clubhouse |
