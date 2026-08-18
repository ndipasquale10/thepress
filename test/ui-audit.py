"""Design-system regression guard.

Colour, type, geometry and layering all flow through the :root token layer.
This budgets the raw literals that leak out of it, so a value added by hand
in a hurry shows up as a failing test rather than as drift six months later.

Budgets sit at the current count. A category at zero stays at zero, so any
new raw value fails the build; a genuine exception is added by raising the
budget in the same commit, which puts the decision in the diff.
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "index.html"
src = SRC.read_text()
lines = src.split("\n")

# CSS lives on lines 8..15 (1-indexed); JS app code is everything after the
# vendored html2canvas blob, which must never be reformatted.
css = "\n".join(lines[7:15])
js = "\n".join(lines[15:])

# The :root blocks are the token layer -- the one place raw values belong.
roots = re.findall(r':root(?:\[data-theme="[a-z]+"\])?\{[^}]*\}', css)
css_wo = css
for r in roots:
    css_wo = css_wo.replace(r, "")

failures = []
report = []


def budget(label, values, limit, hint):
    n = len(values)
    distinct = len(set(values))
    report.append(f"{label:<34}: {n:>4}  (distinct: {distinct})")
    if n > limit:
        failures.append(f"{label}: {n} exceeds the {limit} budget. {hint}")
    return n


# --- Colour ---------------------------------------------------------------
def colours(t):
    return re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)", t)


def neutral(c):
    m = re.match(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", c)
    return bool(m) and m.group(1) == m.group(2) == m.group(3)


css_colour = [c for c in colours(css_wo) if not neutral(c)]
js_colour = colours(js)
budget(
    "colour literals",
    css_colour + js_colour,
    80,
    "New colours belong in the :root token blocks.",
)

# --- Geometry -------------------------------------------------------------
radius = [
    v.strip()
    for m in re.finditer(r"border-radius:\s*([^;}]+)", css_wo)
    for v in [m.group(1)]
    if re.search(r"\dpx", v)
]
budget(
    "raw border-radius",
    radius,
    0,
    "Use --radius-xs/-sm/--radius/--radius-lg/-xl/--radius-pill.",
)

SPACING = (
    r"(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?"
)
spacing = []
for m in re.finditer(SPACING + r":\s*([^;}]+)", css_wo):
    v = m.group(1)
    # calc()/env() carry safe-area maths and are legitimately outside the scale
    if re.search(r"calc|env", v):
        continue
    spacing += re.findall(r"-?\d+px", v)
budget("raw spacing px", spacing, 2, "Use the --sp-1..--sp-13 scale.")

shadow = [
    m.group(1).strip()
    for m in re.finditer(r"box-shadow:\s*([^;}]+)", css_wo)
    if "var(--" not in m.group(1) and m.group(1).strip() != "none"
]
budget(
    "raw box-shadow",
    shadow,
    0,
    "Use --shadow-sm/--shadow/--shadow-lg/--shadow-up/--shadow-accent*/--ring.",
)

borders = re.findall(r"border(?:-[a-z]+)?:\s*([\d.]+px)", css_wo)
budget("raw border widths", borders, 0, "Use --bw (hairline) or --bw-strong.")

zidx = [
    m.group(1).strip()
    for m in re.finditer(r"z-index:\s*([^;}]+)", css_wo)
    if "var(--" not in m.group(1)
]
budget(
    "raw z-index",
    zidx,
    0,
    "Use --z-raised/-sticky/-nav/-overlay/-modal/-toast/-confetti.",
)

# --- Type -----------------------------------------------------------------
fontsize = [
    m.group(1).strip()
    for m in re.finditer(r"font-size:\s*([^;}]+)", css_wo)
    if "var(--" not in m.group(1) and "inherit" not in m.group(1)
]
budget("raw font-size", fontsize, 2, "Use the --fs-3xs..--fs-4xl scale.")

# The display face is a two-level treatment; applying it broadly is what made
# the type read as inconsistent in the first place.
display_rules = len(re.findall(r"font-family:var\(--font-display\)", css))
report.append(f"{'display-face rules':<34}: {display_rules:>4}")
if display_rules > 6:
    failures.append(
        f"display-face rules: {display_rules} exceeds 6. "
        "The serif is for section headings and the wordmark, not body levels."
    )

# --- Flow wiring ----------------------------------------------------------
# Several game options are built from state.players: Wolf's uneven-team stakes,
# the Vegas team pickers, the Nassau roster, the Stableford quota. They shipped
# unreachable once because game setup ran BEFORE the roster was entered, so the
# roster was always empty when they rendered.
#
# This only catches a regression of that exact wiring -- test/flows.mjs is what
# actually walks the app and would catch a new variant. But it is free, so it
# runs here too. Deliberately not a document-order check: the roster markup
# already preceded the game options while the bug was live.
FLOW = [
    (
        r'nav-tab" onclick="showScreen\(.setup.\)" data-screen="games"',
        "the Games tab opens the roster, not the game picker",
    ),
    (
        r'getElementById\("start-btn"\)\.addEventListener\("click",continueToGame\)',
        "the roster screen continues to game setup (not straight into the round)",
    ),
    (
        r'onclick="startRound\(\)"',
        "the game screen is what starts the round",
    ),
    (
        r'games:\{id:"games-screen".*?updateGameOptions\(\)',
        "entering the game screen rebuilds options from the current roster",
    ),
]
for pattern, why in FLOW:
    found = bool(re.search(pattern, src, re.S))
    report.append(f"{why[:32]:<34}: {'ok' if found else 'MISSING':>4}")
    if not found:
        failures.append(
            f"flow wiring: {why}. Roster-dependent game options render empty if "
            "game setup precedes the roster. See test/flows.mjs."
        )

# --- Legacy skin layer ----------------------------------------------------
dark = css.count("body.dark")
report.append(f"{'body.dark selectors':<34}: {dark:>4}")
if dark:
    failures.append(
        f"body.dark selectors: {dark}. The skin layer is "
        ':root[data-theme="broadcast"].'
    )

print("\n".join(report))

if failures:
    print("\nFAIL:")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("\nOK: every budget met.")
