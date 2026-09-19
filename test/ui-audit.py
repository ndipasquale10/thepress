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

# Slice at the real <style> boundaries. This used to be hardcoded to lines
# 8..15, which silently left the last ~4.5KB of the stylesheet -- including the
# touch-target rules -- being audited as if it were JS, so none of the geometry
# budgets applied to it.
_open = next(i for i, l in enumerate(lines) if "<style>" in l)
_close = next(i for i, l in enumerate(lines) if "</style>" in l)
css = "\n".join(lines[_open : _close + 1])
js = "\n".join(lines[_close + 1 :])

# Comments are not declarations: left in, a comment's text lands in whatever
# selector capture follows it, which silently breaks selector matching. (The
# base64 font payloads cannot contain "/*" -- "*" is not in the alphabet.)
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

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

# --- Pseudo-element collisions --------------------------------------------
# The hit-area expander paints an invisible box over each listed element via a
# pseudo-element. If an element ALSO uses that same pseudo-element for a badge,
# the two rules fight over one box: the expander's min-width/min-height and
# centring leak into the badge, because the badge rule never thinks to reset
# them. That is what turned the Wolf checkmark into a 44px blob over the chip.
tap_rules = re.findall(r"([^{}]*)\{[^{}]*min-width:var\(--tap\)[^{}]*\}", css)
collisions = []
checked = 0
checked_none = []
for sel_list in tap_rules:
    for sel in sel_list.split(","):
        sel = sel.strip()
        # Handles every form in the list -- .class, #id, and compound
        # selectors like `.game-opt label:has(input)` -- so the check is not
        # silently partial.
        m = re.match(r"(.+)::(after|before)$", sel)
        if not m:
            checked_none.append(sel)
            continue
        base, pseudo = m.group(1), m.group(2)
        # Any other rule that styles the same subject on the same pseudo-element.
        other = [
            s
            for s, b in re.findall(r"([^{}]+)\{([^{}]*)\}", css)
            if re.search(re.escape(base) + r"[^,]*::" + pseudo + r"\b", s)
            and "min-width:var(--tap)" not in b
        ]
        checked += 1
        if other:
            collisions.append(f"{sel} is both a hit-area expander and {other[0].strip()[:60]}")

report.append(f"{'tap/badge pseudo collisions':<34}: {len(collisions):>4}  (of {checked} expanders)")
if checked_none:
    failures.append(
        f"tap-target selectors not understood, so unchecked: {checked_none}. "
        "Widen the pattern rather than leaving them silently skipped."
    )
for c in collisions:
    failures.append(
        f"pseudo-element collision: {c}. Move the expander to the other "
        "pseudo-element -- min-width/min-height and centring leak otherwise."
    )

# --- Player palettes: colour-blind separation -----------------------------
# The eight player colours are a categorical scale, and a categorical scale is
# only doing its job if the categories stay apart. An earlier revision of the
# comment above PLAYER_PALETTES claimed they passed a CVD check; measured, the
# worst clubhouse pair sat at CIE76 dE 1.9 under deuteranopia and the worst
# broadcast pair at 1.1 -- indistinguishable. Broadcast was re-stepped; the
# clubhouse trade was left for a person to make.
#
# This budgets what is there now so the next palette edit has to face the same
# number. Floors sit just under the measured values: raise them when a palette
# improves, and argue for it in the diff when one would lower them.
def _srgb_to_lin(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _lin_to_srgb(v):
    v = max(0.0, min(1.0, v))
    return 255 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)


def _mul(M, v):
    return [sum(M[r][c] * v[c] for c in range(3)) for r in range(3)]


_RGB2LMS = [[0.31399022, 0.63951294, 0.04649755],
            [0.15537241, 0.75789446, 0.08670142],
            [0.01775239, 0.10944209, 0.87256922]]
_LMS2RGB = [[5.47221206, -4.6419601, 0.16963708],
            [-1.1252419, 2.29317094, -0.1678952],
            [0.02980165, -0.19318073, 1.16364789]]
# Brettel/Vienot dichromat projections.
_SIM = {
    "protan": [[0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]],
    "deutan": [[1, 0, 0], [0.9513092, 0, 0.04866992], [0, 0, 1]],
    "tritan": [[1, 0, 0], [0, 1, 0], [-0.86744736, 1.86727089, 0]],
}


def _hex(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _simulate(rgb, kind):
    if kind == "normal":
        return rgb
    lin = [_srgb_to_lin(c) for c in rgb]
    return tuple(_lin_to_srgb(c) for c in _mul(_LMS2RGB, _mul(_SIM[kind], _mul(_RGB2LMS, lin))))


def _lab(rgb):
    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    r, g, b = [_srgb_to_lin(c) for c in rgb]
    x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
    y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
    z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
    return (116 * y - 16, 500 * (x - y), 200 * (y - z))


def _worst_pair(cols, kind):
    pts = [_lab(_simulate(_hex(c), kind)) for c in cols]
    return min(
        sum((a - b) ** 2 for a, b in zip(pts[i], pts[j])) ** 0.5
        for i in range(len(pts)) for j in range(i + 1, len(pts))
    )


_pal_src = re.search(r"const PLAYER_PALETTES=\{(.*?)\};", js, re.S)
if not _pal_src:
    failures.append("PLAYER_PALETTES not found -- the CVD budget is not running.")
else:
    PALETTE_FLOORS = {
        # skin        normal protan deutan tritan
        "clubhouse": (30.0, 4.5, 1.8, 1.9),
        "broadcast": (29.0, 15.0, 10.0, 18.0),
        # Sunlight's high-contrast floor pushes every entry dark, which frees
        # lightness to do the separating -- so it is the best of the three.
        "sunlight": (18.0, 10.0, 15.0, 18.0),
    }
    for skin, floors in PALETTE_FLOORS.items():
        m = re.search(skin + r":\[([^\]]*)\]", _pal_src.group(1))
        if not m:
            failures.append("palette %s: not found in PLAYER_PALETTES." % skin)
            continue
        cols = re.findall(r"#[0-9a-fA-F]{6}", m.group(1))
        if len(cols) != 8:
            failures.append("palette %s: %d colours, expected 8." % (skin, len(cols)))
            continue
        got = [_worst_pair(cols, k) for k in ("normal", "protan", "deutan", "tritan")]
        report.append(
            "palette %-11s dE" % skin
            + "".join("%7.1f" % v for v in got)
            + "   (floors" + "".join("%6.1f" % v for v in floors) + ")"
        )
        for kind, value, floor in zip(("normal", "protan", "deutan", "tritan"), got, floors):
            if value < floor:
                failures.append(
                    "palette %s: worst pair under %s is dE %.1f, below the %.1f floor. "
                    "Two players would look the same." % (skin, kind, value, floor)
                )

# --- Legacy skin layer ----------------------------------------------------
dark = css.count("body.dark")
report.append(f"{'body.dark selectors':<34}: {dark:>4}")
if dark:
    failures.append(
        f"body.dark selectors: {dark}. The skin layer is "
        ':root[data-theme="broadcast"].'
    )

# --- Structural integrity -------------------------------------------------
# Everything above is a text scan, which is blind to whether a rule still
# parses. A rule inserted between two selectors of an existing list voids that
# whole list, and every declaration it carried silently stops applying -- that
# is how the 44px tap-target expanders were switched off while this audit
# still reported a clean sheet. These two checks read the stylesheet as
# structure, so a rule that can no longer apply fails the build.
_body = re.sub(r"</?style[^>]*>", "", css)
# Quoted payloads (data URIs, content:"...") may hold braces and semicolons.
_scan = re.sub(r'"(?:[^"\\]|\\.)*"', '""', _body)
_scan = re.sub(r"'(?:[^'\\]|\\.)*'", "''", _scan)
# Statement at-rules end at a semicolon and carry no block of their own.
_scan = re.sub(r"@(?:import|charset|namespace)[^;{}]*;", "", _scan)

_open_n, _close_n = _scan.count("{"), _scan.count("}")
report.append(f"{'css brace balance':<34}: {_open_n:>4} open / {_close_n} close")
if _open_n != _close_n:
    failures.append(
        f"css braces unbalanced: {_open_n} open vs {_close_n} close. A rule is "
        "cut in half, so the stylesheet no longer parses as written."
    )

_malformed = []
for _m in re.finditer(r"([^{}]*)\{", _scan):
    _sel = _m.group(1).strip()
    if not _sel:
        _malformed.append("(empty selector)")
    elif ("@" in _sel and not _sel.startswith("@")) or ";" in _sel:
        _malformed.append(" ".join(_sel.split())[:70])
report.append(f"{'malformed selectors':<34}: {len(_malformed):>4}")
for _s in _malformed:
    failures.append(
        f"malformed selector {_s!r}: an at-rule or declaration landed inside a "
        "selector list, which voids the entire rule. Add new rules between "
        "complete rules, never between two selectors."
    )

print("\n".join(report))

if failures:
    print("\nFAIL:")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("\nOK: every budget met.")
