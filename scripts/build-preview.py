#!/usr/bin/env python3
"""Build a testable/previewable copy of the app.

The app is a single self-contained index.html, but two things stop it running
outside a real deployment:

  * the three Firebase CDN <script> tags, which fail with no network (and are
    blocked outright by the artifact sandbox's CSP), and
  * an empty localStorage, which leaves every screen on an empty state.

This strips the former and seeds a fixed demo season for the latter, so both
`test/flows.mjs` and a published preview drive a populated app.

There is a second mode. `--live` keeps Firebase instead of stripping it, swaps
the CDN tags for the copies in node_modules, and points the SDK at the local
emulators -- so `test/live-round.test.mjs` can drive two real browsers through a
shared round against the real auth, the real database and the real security
rules. Nothing else exercises that code at all.

Usage:
    python3 scripts/build-preview.py [-o OUT] [--fragment | --live]

    -o/--out    where to write (default: build/preview.html)
    --fragment  emit head+body content only, without the <!doctype>/<html>
                skeleton. Artifact publishing supplies its own wrapper; tests
                must NOT use this, or the page renders in quirks mode while
                real users get standards mode.
    --live      keep Firebase, served locally and aimed at the emulators. No
                demo seed: a live-round test starts from an empty app.
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Seeding is gated on this flag in the app, so the demo data and the
# destructive clearDemoData() stay inert in the production build.
ENABLE_DEMO = (
    '<script>window.__PRESS_DEMO__=true;'
    'try{localStorage.setItem("onboarded","1");}catch(e){}</script>'
)

# Seed on a cold load only, so a test that sets up its own roster is not
# trampled, and dismiss the onboarding modal the seed would otherwise leave up.
AUTO_SEED = """<script>
(function(){
  function empty(){try{var r=localStorage.getItem("golfRounds");return !r||r==="{}"||Object.keys(JSON.parse(r)).length===0}catch(e){return true}}
  function go(){
    if(typeof seedDemoData!=="function")return;
    if(empty()){try{seedDemoData()}catch(e){console.warn("demo seed failed",e)}}
    try{document.querySelectorAll(".modal:not(.hidden)").forEach(function(m){m.classList.add("hidden")})}catch(e){}
    try{updateNavCounts();enterScreen("home",{noPush:true})}catch(e){}
  }
  if(document.readyState==="complete"||document.readyState==="interactive")setTimeout(go,120);
  else window.addEventListener("DOMContentLoaded",function(){setTimeout(go,120)});
})();
</script>"""


# Ports come from window.__EMU__, which the test sets before any page script
# runs, so the emulator ports stay owned by the test rather than duplicated here.
EMULATOR_WIRING = """<script>
(function(){
  var e = window.__EMU__ || {};
  try { if (typeof db !== "undefined" && db) db.useEmulator(e.host || "127.0.0.1", e.firestorePort || 8080); } catch (err) { console.error("firestore emulator", err); }
  try { if (typeof auth !== "undefined" && auth) auth.useEmulator("http://" + (e.host || "127.0.0.1") + ":" + (e.authPort || 9099), { disableWarnings: true }); } catch (err) { console.error("auth emulator", err); }
})();
</script>"""

FIREBASE_BUNDLES = [
    "firebase-app-compat.js",
    "firebase-auth-compat.js",
    "firebase-firestore-compat.js",
]


def build(fragment=False, live=False):
    src = (ROOT / "index.html").read_text()

    head = src[src.index("<head>") + len("<head>") : src.index("</head>")]
    body_start = src.index("<body>", src.index("</head>")) + len("<body>")
    body = src[body_start : src.rindex("</body>")]

    tags = re.findall(
        r'<script src="https://www\.gstatic\.com/firebasejs/[^"]*/(firebase-[a-z]+-compat\.js)"></script>',
        head + body,
    )
    removed = 0
    for name in tags:
        tag = re.search(
            r'<script src="https://www\.gstatic\.com/firebasejs/[^"]*/' + re.escape(name) + r'"></script>',
            head + body,
        ).group(0)
        # In live mode the same bundle is served from next to the page, so the
        # browser runs the real SDK with no network.
        replacement = f'<script src="./{name}"></script>' if live else ""
        head = head.replace(tag, replacement)
        body = body.replace(tag, replacement)
        removed += 1
    if removed != 3:
        print(
            f"warning: rewrote {removed} Firebase tags, expected 3 — "
            "check whether index.html changed its CDN imports",
            file=sys.stderr,
        )

    if live:
        # Immediately after initializeApp, before the app's own script uses
        # either handle.
        init_end = body.index("</script>", body.index("firebase.initializeApp(")) + len("</script>")
        body = body[:init_end] + EMULATOR_WIRING + body[init_end:]
        head = head.replace("<title>The Press</title>", "<title>The Press — Live</title>")
    else:
        head = head.replace("<title>The Press</title>", "<title>The Press — Preview</title>")
        head = ENABLE_DEMO + head
        body = body + AUTO_SEED

    if fragment:
        return head + "\n" + body, removed
    # A doctype is not optional for tests: without it the page renders in
    # quirks mode while real users get standards mode.
    return (
        "<!doctype html>\n<html lang=\"en\">\n<head>"
        + head
        + "</head>\n<body>"
        + body
        + "</body>\n</html>\n"
    ), removed


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-o", "--out", default=str(ROOT / "build" / "preview.html"))
    ap.add_argument("--fragment", action="store_true")
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()

    if args.fragment and args.live:
        ap.error("--fragment and --live are different builds; pick one")

    html, removed = build(fragment=args.fragment, live=args.live)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)

    # Image export loads ./html2canvas.min.js relative to the page, so the
    # preview needs its own copy next to it or "Save Image" 404s here while
    # working in production.
    lib = ROOT / "html2canvas.min.js"
    if lib.exists() and not args.fragment:
        shutil.copyfile(lib, out.parent / lib.name)

    if args.live:
        # The SDK has to sit next to the page for "./firebase-*-compat.js".
        vendor = ROOT / "node_modules" / "firebase"
        missing = [b for b in FIREBASE_BUNDLES if not (vendor / b).exists()]
        if missing:
            print(
                f"error: {', '.join(missing)} not in node_modules/firebase — run: npm install",
                file=sys.stderr,
            )
            return 1
        for b in FIREBASE_BUNDLES:
            shutil.copyfile(vendor / b, out.parent / b)

    mode = "live" if args.live else "fragment" if args.fragment else "standalone"
    verb = "rewritten" if args.live else "removed"
    print(f"{out} — {mode}, {len(html):,} bytes, {removed} Firebase tags {verb}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
