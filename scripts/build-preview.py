#!/usr/bin/env python3
"""Build a testable/previewable copy of the app.

The app is a single self-contained index.html, but two things stop it running
outside a real deployment:

  * the three Firebase CDN <script> tags, which fail with no network (and are
    blocked outright by the artifact sandbox's CSP), and
  * an empty localStorage, which leaves every screen on an empty state.

This strips the former and seeds a fixed demo season for the latter, so both
`test/flows.mjs` and a published preview drive a populated app.

Usage:
    python3 scripts/build-preview.py [-o OUT] [--fragment]

    -o/--out    where to write (default: build/preview.html)
    --fragment  emit head+body content only, without the <!doctype>/<html>
                skeleton. Artifact publishing supplies its own wrapper; tests
                must NOT use this, or the page renders in quirks mode while
                real users get standards mode.
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


def build(fragment=False):
    src = (ROOT / "index.html").read_text()

    head = src[src.index("<head>") + len("<head>") : src.index("</head>")]
    body_start = src.index("<body>", src.index("</head>")) + len("<body>")
    body = src[body_start : src.rindex("</body>")]

    removed = 0
    for tag in re.findall(
        r'<script src="https://www\.gstatic\.com/firebasejs/[^"]*"></script>', head + body
    ):
        head = head.replace(tag, "")
        body = body.replace(tag, "")
        removed += 1
    if removed != 3:
        print(
            f"warning: removed {removed} Firebase tags, expected 3 — "
            "check whether index.html changed its CDN imports",
            file=sys.stderr,
        )

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
    args = ap.parse_args()

    html, removed = build(fragment=args.fragment)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)

    # Image export loads ./html2canvas.min.js relative to the page, so the
    # preview needs its own copy next to it or "Save Image" 404s here while
    # working in production.
    lib = ROOT / "html2canvas.min.js"
    if lib.exists() and not args.fragment:
        shutil.copyfile(lib, out.parent / lib.name)

    mode = "fragment" if args.fragment else "standalone"
    print(f"{out} — {mode}, {len(html):,} bytes, {removed} Firebase tags removed")


if __name__ == "__main__":
    main()
