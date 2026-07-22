# Design Mockups — "The Action Sheet"

These are **standalone design previews** for a redesign of The Press. They are **not part of
the shipping app** and do not affect it in any way:

- The production app is `../index.html` — these files never touch it.
- They are **not** referenced by `../sw.js` or `../manifest.json`, so the PWA ignores them.
- Each file is fully self-contained (inline CSS/JS, no external requests) — just open it in a
  browser. Safe to delete at any time.

## Files

| File | What it is |
|---|---|
| `press-mockup.html` | Brand & token board + Setup / Scoring / History screens, in Light and Night editions. |
| `wolf-hammer-mockup.html` | **Interactive** Wolf Hammer scoring mockup — tap through pick types, partners, the hammer (2ⁿ doubling with turn-taking), shuck, score entry, and fixed pairings. Includes a live parity checklist. |

## The direction

"The Action Sheet" — a golf betting **tote/ledger** aesthetic: cool green-grey newsprint,
fairway green, one hot **red** reserved for the press and money owed, tabular figures, and a
heavy grotesque display voice. Light-first (sunlight-readable) with a Night edition.

## Where this is going

A full working redesign of the app — every feature preserved — is being built as
`../index-redesign.html` (a reskinned clone of `index.html`), so the redesign can be run and
tested side-by-side while production stays untouched.
