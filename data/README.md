# Course database

`data/courses.json` is the **single source of truth** for the app's built-in
course list. The app (`index.html`) is an offline-first PWA that reads its
`COURSE_DB` synchronously, so the data is **inlined into `index.html`** at build
time rather than fetched at runtime.

## Editing courses

1. Edit `data/courses.json`.
2. Rebuild `index.html`, which inlines the list:

   ```sh
   npm run build
   ```

3. Commit both `data/courses.json` and `index.html`.

`npm test` runs `build.js --check`, which fails if `index.html` is out
of sync with `data/courses.json` — so a forgotten rebuild is caught in CI.
(`npm run build:courses` still works and does the same thing.)

## Course shape

Each entry is one object:

```json
{
  "name": "Pebble Beach Golf Links",
  "city": "Pebble Beach",
  "state": "CA",
  "tees": [
    { "name": "Blue", "rating": 73.8, "slope": 142, "yds": 6497 }
  ],
  "pars":  [4,5,4,4,3,5,3,4,4,4,4,3,4,5,4,4,3,5],
  "hdcps": [7,11,3,13,15,1,9,17,5,4,16,10,2,8,18,12,6,14]
}
```

Validation enforced by `scripts/build-courses.js`:

| field   | rule                                                        |
| ------- | ----------------------------------------------------------- |
| `name`  | required, unique (case-insensitive)                         |
| `city`  | required (may be empty string)                              |
| `state` | required (2-letter code, e.g. `NY`)                         |
| `tees`  | ≥1 tee; each has `name`, `rating` 55–85, `slope` 55–155, `yds` 1000–8500 |
| `pars`  | exactly 18 integers, each 3–6                               |
| `hdcps` | exactly 18 integers — a permutation of 1..18 (stroke index) |

Tee `rating`/`slope` drive course-handicap math: `(gross − rating) × 113 / slope`.

> Ratings, slopes and yardages are best-effort published values. Players are
> prompted in-app to verify against their scorecard; pars and stroke indexes are
> editable per round.

## Adding a course from a scorecard

Copy an existing entry, then fill in from the scorecard: the tee name, its
course rating / slope / total yardage, the 18 pars, and the 18 stroke-index
(handicap) values. Run `npm run build:courses` and commit.
