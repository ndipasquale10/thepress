#!/usr/bin/env python3
"""Build a testable/previewable copy of the app.

The app is a single self-contained index.html, but two things stop it running
outside a real deployment:

  * the Firebase CDN bundles, which fail with no network (and are blocked
    outright by the artifact sandbox's CSP), and
  * an empty localStorage, which leaves every screen on an empty state.

The app no longer loads those bundles from blocking <script src> tags: it lists
them in a FIREBASE_SDK array and fetches them on idle, so the seam this script
rewrites is that array. Emptying it makes ensureFirebase() resolve to "no
Firebase" without a request. A fixed demo season covers the second, so both
`test/flows.mjs` and a published preview drive a populated app.

There is a second mode. `--live` keeps Firebase instead of stripping it, points
FIREBASE_SDK at the copies in node_modules, and hooks the SDK to the local
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
#
# __FB_AFTER_INIT__ is the app's own hook, called the instant db and auth exist
# and before anything reads them. It replaced injecting this block at a text
# offset after `firebase.initializeApp(`: initialisation now happens inside a
# promise, so there is no longer a point in the source that is also a point in
# time.
EMULATOR_WIRING = """<script>
window.__FB_AFTER_INIT__ = function(){
  var e = window.__EMU__ || {};
  try { if (typeof db !== "undefined" && db) db.useEmulator(e.host || "127.0.0.1", e.firestorePort || 8080); } catch (err) { console.error("firestore emulator", err); }
  try { if (typeof auth !== "undefined" && auth) auth.useEmulator("http://" + (e.host || "127.0.0.1") + ":" + (e.authPort || 9099), { disableWarnings: true }); } catch (err) { console.error("auth emulator", err); }
};
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

    # The one seam: the array ensureFirebase() walks. Rewritten rather than
    # deleted, so the loader, the retry and every await ensureFirebase() call
    # site under test are the same code paths production runs.
    decl = re.search(r'var FIREBASE_SDK=\[([^\]]*)\];', body)
    if not decl:
        print(
            "warning: no FIREBASE_SDK declaration found — "
            "check whether index.html changed how it loads the SDK",
            file=sys.stderr,
        )
        removed = 0
    else:
        removed = len(re.findall(r'firebase-[a-z]+-compat\.js', decl.group(1)))
        if removed != 3:
            print(
                f"warning: FIREBASE_SDK lists {removed} bundles, expected 3 — "
                "check whether index.html changed its CDN imports",
                file=sys.stderr,
            )
        # Live mode serves the same bundles from next to the page, so the
        # browser runs the real SDK with no network.
        urls = ",".join(f'"./{b}"' for b in FIREBASE_BUNDLES) if live else ""
        body = body.replace(decl.group(0), f"var FIREBASE_SDK=[{urls}];")
        # Nothing to preconnect to once the CDN is out of the picture.
        head = re.sub(r'<link rel="preconnect" href="https://www\.gstatic\.com"[^>]*>', "", head)
        body = re.sub(r'<link rel="preconnect" href="https://www\.gstatic\.com"[^>]*>', "", body)

    if live:
        # Defined before the app's script runs, called the moment db and auth
        # exist -- see EMULATOR_WIRING.
        head = EMULATOR_WIRING + head
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
    verb = "repointed at node_modules" if args.live else "dropped"
    print(f"{out} — {mode}, {len(html):,} bytes, {removed} Firebase bundles {verb}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
