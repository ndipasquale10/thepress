import re,sys
src=open('/home/user/thepress/index.html').read()
lines=src.split('\n')
# CSS lives on lines 8..15 (1-indexed); JS app code is everything after the vendor blob.
css='\n'.join(lines[7:15])
# strip :root blocks - those are the legitimate token layer
roots=re.findall(r':root(?:\[data-theme="[a-z]+"\])?\{[^}]*\}',css)
css_wo=css
for r in roots: css_wo=css_wo.replace(r,'')
def colors(t):
    return re.findall(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)',t)
css_lits=[c for c in colors(css_wo)]
# ignore pure neutral shadows
def neutral(c):
    m=re.match(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)',c)
    if not m: return False
    r,g,b=int(m.group(1)),int(m.group(2)),int(m.group(3))
    return r==g==b
css_nonneutral=[c for c in css_lits if not neutral(c)]
# JS: after the vendored html2canvas blob
js='\n'.join(lines[15:])
js_lits=[c for c in colors(js)]
print(f"CSS literals outside :root      : {len(css_lits)}  (non-neutral: {len(css_nonneutral)}, distinct: {len(set(css_nonneutral))})")
print(f"JS  colour literals             : {len(js_lits)}  (distinct: {len(set(js_lits))})")
nbd=css.count("body.dark")
print("body.dark selectors           :", nbd)
print(f"TOTAL non-neutral literals      : {len(css_nonneutral)+len(js_lits)}")

# Regression guard: colour must flow through the token layer.
# Baseline when the colour system was rebuilt: 151 non-neutral literals.
LIMIT=80
total=len(css_nonneutral)+len(js_lits)
if total>LIMIT:
    print(f"\nFAIL: {total} non-neutral colour literals exceeds the {LIMIT} budget.")
    print("New colours belong in the :root token blocks, not inline.")
    raise SystemExit(1)
print(f"\nOK: {total} non-neutral literals (budget {LIMIT})")
