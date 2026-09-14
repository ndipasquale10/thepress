# Design & usability ideas, round two

Companion to `design-ideas.md`. That pass was about **where the pixels go**.
This one is about **what happens when you touch them** — read out of the
behaviour in `index.html` and driven in Chromium at 390×844 against the seeded
demo round.

The findings group into seven themes. Five of them are interaction defects
that look like design problems from the user's seat. Two are genuine new
design opportunities the token layer has already paid for.

---

## A. The app is named "Settle up" and cannot tell you if you got paid

This is the biggest gap in the product, and it is a design gap, not an
engineering one.

**There is no paid state anywhere in the codebase.** `computeSettlement()`
produces a minimal set of payments, `venmoBtn()` deep-links each one out to
Venmo / Cash App / PayPal — and the loop ends there. Nothing is recorded, and
nothing comes back.

The knock-on effects are all visible in the UI:

- The Settle empty state says **"Nothing outstanding · Every round is
  settled."** That string is derived from `finished:true`, not from anyone
  having paid. A round you finished and nobody settled reports as settled.
- The season money table on Home sums `r.money` across finished rounds. It is
  presented as a ledger ("The Group · money table") but it's a
  *scoreboard* — it counts money that may never have moved. The distinction
  matters enormously to the one social situation this app exists to manage.
- Re-opening a finished round re-renders the same payment buttons with no
  memory of whether you already tapped them.

**The change:** a `settledPayments` map on the round — `{fromIdx-toIdx: ts}`.
A tappable check on each `.settlement-row`, a "2 of 3 paid" pill in the
section head, and a Home-screen band for **outstanding across all rounds**,
which is the number people actually want and currently cannot get anywhere.
Then "Nothing outstanding" becomes true.

Worth noting the tone opportunity: the app can stay deliberately naïve —
"marked paid" is an honour-system checkbox, not a payment integration. That's
the right call for a foursome, and it's one afternoon of work.

### A2. The payment handles are collected from the wrong person, at the wrong time

`venmoLink()` reads `state.players[toIdx].venmo` — the **payee's** handle.
That field lives in a collapsed per-player edit panel on the setup screen
(`.pvenmo`, three text inputs), which means: for a pay button to appear, *you*
must have typed *Big Dave's* Venmo handle into *your* phone, before the round
started, while standing on the first tee.

Nobody does this. The three brand-coloured buttons the design system
carefully tokenised (`--brand-venmo`, `--brand-cash`, `--brand-paypal`, plus
hover variants) are, in practice, almost never rendered.

Move the ask to the moment of need: on the Settle screen, a payment row for
someone with no handle shows an inline **"add @handle"** affordance instead of
a dead space. Handles already persist to `golfProfiles` by name, so it's a
one-time cost per playing partner, asked at the moment the user actually wants
to pay them.

---

## B. Two red/green systems are fighting on the same screen

Golf's convention: **red is under par — red is good.** Money's convention:
**red is down — red is bad.** The scoring screen shows both at once, drawn
from the same tokens.

```css
.match-dn   { color:var(--red-t); }   /* "-$14"  — you are losing money */
.qp-birdie  { color:var(--red-t); background:var(--danger-surface); }
.qp-eagle   { color:var(--red-t); background:var(--danger-surface); }
```

The birdie button in the quick picker is literally painted on
`--danger-surface`. In the screenshot of hole 8 you can see `-$14` in the
standings ribbon and a red-ringed birdie chip on Tommy's row, eleven
millimetres apart, in the same colour, meaning opposite things.

Both conventions are correct. The problem is that they share tokens.

**The fix is already half-built.** `--up` and `--down` exist in both theme
blocks — and are used **7 times**, against **70** uses of `--green-t` /
`--red-t` carrying both meanings:

| Token | Uses |
|---|---|
| `var(--red-t)` | 39 |
| `var(--green-t)` | 31 |
| `var(--down)` | 3 |
| `var(--up)` | 4 |

Finish the split someone started:

- `--up` / `--down` — money only.
- New `--under` / `--over` — score relative to par only.
- `--green-t` / `--red-t` become raw ramp values referenced only by the token
  layer. `ui-audit.py` can enforce that last part the same way it enforces the
  radius and z-index budgets.

Then the two systems can diverge visually — money stays green/red, score
notation can lean on the circle/square shape language it already owns (see
`design-ideas.md` §2a) and drop the tint entirely.

### B2. The same birdie/eagle collision, third occurrence

```css
.qp-eagle  { border-color:var(--red-dim);color:var(--red-t);background:var(--danger-surface); }
.qp-birdie { border-color:var(--red-dim);color:var(--red-t);background:var(--danger-surface); }
```

Identical. Round one found this on the scorecard cells; here it is again in
the quick picker. And `.qp-par` is declared **twice** — the first rule paints
it green-on-green, the second neutralises it, so the green par treatment is
dead code. Three places now where "eagle" and "birdie" render the same. That's
a pattern, and it's what a semantic `--under` ramp with a shape modifier would
have prevented.

---

## C. The app guesses who you are, and never asks

`getPrimaryPlayerName()` returns, in order: `localStorage.primaryPlayer` →
the name appearing in the most finished rounds → `state.players[0].name`.

**There are zero writes to `primaryPlayer` in production code.** The only
`setItem("primaryPlayer", …)` in the file is inside the demo seeder. Settings
has Round Defaults, Legal, and Help & Data — no identity row. The You screen
renders `esc(me || "Set your player")` as **plain text with no click handler**:
an instruction that cannot be followed.

So the first branch never fires, and the whole personalisation layer hangs off
a heuristic:

- Home: "Your season", the sparkline, the streak chip, "Last time out · You",
  the `lb-me` row highlight, "Your nemesis / You own"
- Settle: "Your take"
- You: your name, your handicap index and trend, head-to-head records, the
  trophy case, "Best game"

Every one of those narrates whoever your group plays with most — which, on a
shared phone where one person always enters the group, is *usually* you and
*sometimes* silently isn't. On round one of a fresh install it's
`players[0]`: whoever you happened to type first.

**The change:** ask once, plainly. A "That's me" affordance on the roster
during the first round's setup, plus a **Settings → You're playing as** row.
Make "Set your player" on the You screen a real button. The heuristic stays as
the fallback — it's a good fallback — but it should be correctable, and the
app should say when it's guessing.

---

## D. Live rounds fight the second phone

### D1. A live update yanks you to someone else's hole

```js
liveUnsubscribe = db.collection("liveRounds").doc(e).onSnapshot(e=>{
  …
  state.currentHole = t.currentHole || 0,
  invalidateMoneyCache(), renderHole()
})
```

Every snapshot overwrites `state.currentHole` with the **host's** current hole
and re-renders. So: you join as an editor, you tap back to hole 3 to fix a
score you got wrong, the host confirms hole 8 — and you're thrown to hole 8
mid-edit. There is nothing you can do about it, and no indication of what
happened.

`currentHole` is *view state*, not round data. It should not be replicated. If
the intent is "follow the host" for spectators, make it an explicit,
dismissible **"Following · jump to hole 8"** chip rather than a silent yank —
and don't apply it to editors at all.

### D2. Wholesale state replacement, last write wins, no presence

The same handler replaces `state.scores`, `wolfHoles`, `bonusPoints`,
`matchPresses` and more with the remote document, unconditionally. Two people
scoring the same hole silently clobber each other; the loser of the race sees
their own entry vanish with no message.

For a four-person foursome the realistic fix is not CRDTs — it's **presence and
a soft lock**: show who else is in the round (avatars in the topbar), and when
someone else is on your hole, surface it. Even "Big Dave is scoring hole 8"
would turn an invisible data race into a social one, which the group can
resolve themselves. That is the right altitude for this app.

### D3. The share code is the worst-presented string in the app

```js
appConfirm("Code: " + t + "\n\nFriends can join as editors with the code, …",
  {title:"Round Is Live", confirmLabel:"Copy watch link", cancelLabel:"Done"})
```

The six characters that are the entire point of the feature render as body
text inside a confirm dialog. Meanwhile joining means `appPrompt` → type six
characters correctly on a phone, outdoors, from someone reading them aloud.

A proper **Go Live sheet** costs very little and is a genuinely delightful
surface: the code at display size in the serif face, letter-spaced, tap-to-copy;
a QR of the watch URL underneath; the watch link as a third option. On a tee
box, "point your phone at mine" beats every alternative. QR generation is
~40 lines or one small dependency, and the app already builds a watch URL.

---

## E. The hole-result overlay reports things that aren't true

Driven on hole 8 with Big Dave at 4 and Tommy P at 5 (Tommy gets a stroke),
the overlay renders:

> **Hole halved**
> You — 5 (Par)
> Big Dave — **4 (Birdie)**
> Tommy P — **5 (Birdie)**
> Sanjay — 5 (Par)

Two problems, both from the same line:

```js
`<span class="hr-score">${e.gross} (${e.lbl})</span>`   // gross number, NET label
```

1. **"5 (Birdie)" next to "4 (Birdie)"** reads as a bug. The label is computed
   from the net score, the number shown is gross. Show the work:
   `5 → 4 (Birdie)`, or put the stroke dot back next to the number. The
   handicap stroke is the single most-argued-about thing in a betting round —
   this is exactly where to be explicit.

2. **"Hole halved"** is the result of the *match* (two sides), printed above a
   list of four individuals two of whom made net birdie and two of whom made
   par. Nothing about that list is halved. Name the comparison:
   "Front 9 match · halved", or show the two sides rather than four names.

---

## F. Two input models on one row, and a placeholder that becomes real

### F1. The stepper and the picker disagree

Same row, two controls, different behaviour:

| | `−` / `+` (`adjScore`) | tap the number (`quickScore`) |
|---|---|---|
| After entry | stays on this player | **auto-advances to the next unscored player and reopens** |
| Range | unbounded upward | **`par−2` … `par+5`** (3–10 on a par 5) |

The auto-advance is the better interaction — tap-tap-tap-tap through the
foursome is exactly right. But it only exists on one of the two controls, so
which pattern you get depends on which pixel you hit. And a blow-up 12 is
enterable with `+` and not with the picker.

Pick the auto-advance model, make the stepper feed it, and let the picker's
last cell be an explicit **"other"** that opens a number field — which also
gives you somewhere to put the thing casual golfers need most:

### F2. There is no way to pick up

Every casual round has someone who puts it in their pocket. Today you must
invent a number. A **"Pick up / X"** option that records max score (or net
double bogey, the standard) would be honest about what happened and stop
people entering fictional 9s that the money engine then settles on.

### F3. Confirming a hole silently writes par for anyone unscored

```js
state.scores[a][e] = null != _sv[a] ? _sv[a] : state.pars[e]
```

The dashed, 50%-opacity chip that round one flagged as an ambiguous
placeholder (§1c) doesn't just *look* like a score — **on confirm it becomes
one**, with no prompt. `finishRound()` is careful here: it counts the unplayed
holes and asks ("*3 holes haven't been scored. Finishing now records par for
them…*"). Per-hole confirm should extend the same courtesy, at minimum naming
who is about to be given a par.

### F4. The quick picker is a modal that isn't one

Measured: `position:fixed`, full-width, 179px tall, pinned to the bottom.
And:

- **No `role="dialog"`, no `aria-modal`, no scrim.**
- **Escape does not close it** (verified — still open after `keyboard.press('Escape')`).
- It dismisses on any document click, including a click that also hits a `+`
  button behind it — one tap both closes the sheet and changes a score.
- It **covers the rows below it**, including the player it is about to
  auto-advance to. You can't see the effect of the tap you just made.
- Initial focus lands on the **first** button — `par−2`, the eagle — whenever
  no score exists yet. For keyboard and switch users, every hole begins on
  "double eagle".

Give it a scrim, `role="dialog"`, an Escape handler, and focus on par.

---

## G. The hole navigator narrates player 0's round

```js
if (!a && null != state.scores[0]?.[t]) {
  const e = state.scores[0][t] - state.pars[t];
  s = e<0 ? " dot-under" : e===0 ? " dot-par" : " dot-over";
}
```

Every shape and badge in the 18-dot strip — the thing round one measured at
152px and proposed compressing — is computed from **`state.scores[0]`**:
whoever happens to be first in the roster.

- If you're third in the roster, the rail across the top of your screen is a
  visualisation of Big Dave's round.
- A hole where players 2, 3 and 4 are scored but player 1 isn't renders as
  **unplayed**.

This should key off the primary player (see §C) — or, better, off *hole
state*: unscored / partially scored / complete / confirmed. That is the thing
the navigator is actually for, it's the same information for everyone at the
table, and it makes the compressed rail from round one strictly more useful
than the thing it replaces.

---

## New design opportunities

These aren't defects. They're places the existing token layer has already paid
for something the app hasn't spent yet.

### H1. Score entry relative to par

The picker shows absolute numbers (3…10) and colours them by their
relationship to par. But golfers think in the relationship, not the number —
"I made bogey", not "I made a six". A primary row of **−1 · Par · +1 · +2 ·
Pick up** with the absolute numbers as a secondary row would cover ~85% of
entries in one tap, with no arithmetic, and would read identically on a par 3
and a par 5. It also removes the par-relative colour problem in §B: if the
button says "Birdie", it doesn't need to be red to say so.

### H2. A sunlight skin — the third theme is nearly free

The theming architecture is a single `:root[data-theme=…]` block; adding a
skin is a token table, not a refactor. `#74` went after sunlight legibility by
tuning the default theme, which means the *daylight* problem is being solved
inside a theme that also has to work indoors.

A **"Glare"** skin — near-white paper, near-black ink, money in high-chroma
green/red at maximum weight, hairlines promoted to `--bw-strong`, shadows off
— would be a couple of dozen token overrides and would make the app usable at
noon in July. Pair it with the `prefers-color-scheme` work from round one so
the skin picker becomes a real three-way choice (Clubhouse · Broadcast ·
Glare) rather than a moon icon.

### H3. Make the handicap stroke impossible to miss

`--tap` is 44px and honoured throughout, which is correct for fingers — but
this app is used in gloves, in wind, one-handed, while three people wait. The
single highest-stakes piece of information on the scoring screen is *who gets
a stroke on this hole*, because it decides the money. Today it's a small
`.strokes-badge` chip under the name, and it says "No strokes" for everyone
else — three rows of negative information to find one row of positive.

Drop the "No strokes" chips, and give the stroking player's row a visible
edge: a left rule in their colour, the dot glyph next to the number, and the
net result stated in full rather than in `--muted` at `--fs-2xs`.

### H4. Small things worth a line each

- **Settings switch semantics.** The Broadcast Skin row is a `div[role=button]`
  whose only affordance is `<span class="ui-switch" aria-hidden="true">`. The
  visual state *is* correctly bound (via `:root[data-theme="broadcast"] .ui-switch`),
  but a screen reader hears a button with no state. `role="switch"` +
  `aria-checked` on the row. (Also: `const t = document.body.classList.contains("dark")`
  at the top of `showSettings()` is dead — `body.dark` was removed and
  `ui-audit` now enforces zero such selectors.)
- **Money changes aren't announced.** Four `aria-live` regions exist, all on
  toasts and the offline chip. Confirming a hole moves real money and says so
  only visually. The standings ribbon is the natural `aria-live="polite"`.
- **`.qp-par` declared twice**, first (green) rule dead — one of the 52
  duplicates from round one, listed here because it's load-bearing for §B.

---

## Where I'd start

Ranked by (value to the user) ÷ (effort), not by severity:

| # | Change | Effort | Why first |
|---|---|---|---|
| 1 | Don't replicate `currentHole` (§D1) | XS | One line; removes a baffling bug |
| 2 | Hole dots key off hole state, not `scores[0]` (§G) | XS | One line; the rail becomes true |
| 3 | Fix `5 (Birdie)` → `5 → 4 (Birdie)` (§E1) | XS | One line; stops an argument |
| 4 | Escape + scrim + focus-on-par for the picker (§F4) | S | Basic modal hygiene |
| 5 | Name who's about to get a par on confirm (§F3) | S | Matches `finishRound`'s care |
| 6 | "You're playing as" in Settings (§C) | S | Unlocks every personalised surface |
| 7 | Mark-as-paid + outstanding total (§A) | M | **The product's headline promise** |
| 8 | Split money vs. score colour tokens (§B) | M | Fixes three collisions at the root |
| 9 | Go Live sheet with big code + QR (§D3) | M | The most shareable moment in the app |
| 10 | Relative-to-par entry (§H1) | M | The most-repeated interaction, halved |
| 11 | Handle prompt at point of payment (§A2) | S | Makes §A actually usable |
| 12 | Presence / soft lock on live rounds (§D2) | L | Turns a data race into a social one |
| 13 | Glare skin (§H2) | S | Tokens only; big real-world payoff |
