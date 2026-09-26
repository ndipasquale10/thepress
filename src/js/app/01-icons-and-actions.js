/* One drawn icon set. `ico(name)` returns an inline stroke SVG; static markup
   writes `<i data-ico="name">` and is hydrated once here and again for
   anything rendered later, so there is one source of truth for every glyph. */
const ICONS = {
  close: "M6 6l12 12M18 6L6 18",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  up: "M5 15l7-7 7 7",
  arrowRight: "M4 12h16M13 5l7 7-7 7",
  arrowLeft: "M20 12H4M11 5l-7 7 7 7",
  plus: "M12 5v14M5 12h14",
  check: "M4 12.5l5 5L20 6.5",
  pencil: "M4 20l4-1L19 8l-3-3L5 16l-1 4zM14 7l3 3",
  star: "M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.3l-5.6 3 1.2-6.3L3 9.6l6.3-.8z",
  flame:
    "M12 3c.6 3.2 4 4.8 4 9a4 4 0 0 1-8 0c0-1.6.6-2.8 1.5-3.8.3 1.3.9 2.1 1.8 2.5C11.8 8.8 11 6 12 3z",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8",
  flag: "M6 21V4M6 4l10 3-10 3M3 21h7",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  wolf: "M4 3l5 4h6l5-4-1 9.5a7 7 0 0 1-14 0zM9.5 12h.01M14.5 12h.01M12 15.5l-1.5 1.5h3z",
  snake: "M6 5h9a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8l2-2M17 17l2 2",
  eagle:
    "M12 4c-2 3-5 4.5-9 4.5 3 1.5 5 3 6 6-1 1.5-2 3.5-2 5.5l5-3 5 3c0-2-1-4-2-5.5 1-3 3-4.5 6-6-4 0-7-1.5-9-4.5z",
  bird: "M3 12c3 0 5-1.5 7-4.5 1 3 3 4.5 6 4.5h5l-3 2c-1 4-4 6-8 6-4.5 0-7-3.5-7-8z",
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  signal: "M2 9a14 14 0 0 1 20 0M5.5 12.5a9 9 0 0 1 13 0M9 16a4.5 4.5 0 0 1 6 0M12 19.5h.01",
  dollar: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  palette:
    "M12 3a9 9 0 0 0 0 18c1.2 0 2-.8 2-2 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.3 0-1 .8-1.5 2-1.5h1.5A4.5 4.5 0 0 0 21 10.5C21 6.4 17 3 12 3zM7.5 11h.01M10.5 7h.01M15.5 7h.01",
  "g-wolf": "M4 3l5 4h6l5-4-1 9.5a7 7 0 0 1-14 0zM9.5 12h.01M14.5 12h.01M12 15.5l-1.5 1.5h3z",
  "g-nassau": "M4 7h7M13 7h7M4 12h16M4 17h7M13 17h7",
  "g-skins":
    "M12 9.5c3.9 0 7-1.1 7-2.5S15.9 4.5 12 4.5 5 5.6 5 7s3.1 2.5 7 2.5zM5 7v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7M5 12v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5",
  "g-match": "M5 21V4l7 3-7 3M19 21V4l-7 3 7 3",
  "g-stableford": "M4 20v-9M9 20V4M14 20v-7M19 20V8",
  "g-bingo":
    "M6 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  "g-dots":
    "M7 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  "g-vegas": "M3 3h18v18H3zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01",
  "g-snake": "M6 5h9a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8l2-2M17 17l2 2",
  "g-sixes": "M15 4h-4l-3 7a4 4 0 1 0 6.5 2.5",
  "g-banker": "M3 10l9-6 9 6M5 10v8M12 10v8M19 10v8M3 21h18",
  "g-none": "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
};
function ico(n, c) {
  return (
    '<svg class="ico' +
    (c ? " " + c : "") +
    '" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
    (ICONS[n] || "") +
    '"/></svg>'
  );
}
function hydrateIcons(root) {
  (root || document).querySelectorAll("i[data-ico]").forEach((el) => {
    el.outerHTML = ico(el.dataset.ico, el.className);
  });
}
hydrateIcons();
"undefined" != typeof MutationObserver &&
  new MutationObserver((ms) => {
    for (const m of ms)
      for (const n of m.addedNodes)
        1 === n.nodeType &&
          (n.matches("i[data-ico]")
            ? (n.outerHTML = ico(n.dataset.ico, n.className))
            : n.querySelector("i[data-ico]") && hydrateIcons(n));
  }).observe(document.documentElement, { childList: !0, subtree: !0 });
/* One delegate for every handler. Markup writes data-act="fn(args)" (and
   data-change, data-input) in place of an inline handler: a call, or a few
   separated by ";", with literal arguments plus `this`, `event`, `this.value`
   and `this.dataset.*`. Bubbling is kept -- every ancestor's action runs in
   order unless one calls event.stopPropagation() -- so nested actions behave
   as inline handlers did. Nothing is eval'd: the app can run under a
   content-security policy without 'unsafe-inline', no function has to be a
   global for the markup's sake, and the wiring is one grep away. */
function _splitTop(s, sep) {
  const out = [];
  let cur = "",
    q = null,
    d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if ("\\" === c && i + 1 < s.length) {
        cur += s[++i];
        continue;
      }
      c === q && (q = null);
      continue;
    }
    if ("'" === c || '"' === c) {
      ((q = c), (cur += c));
      continue;
    }
    "(" === c || "[" === c ? d++ : (")" === c || "]" === c) && d--;
    if (c === sep && !d) {
      (out.push(cur), (cur = ""));
      continue;
    }
    cur += c;
  }
  return (cur.trim() && out.push(cur), out);
}
function _actArg(t, el, ev) {
  if ("this" === (t = t.trim())) return el;
  if ("event" === t) return ev;
  if (t.startsWith("this.")) {
    let v = el;
    for (const k of t.slice(5).split(".")) v = null == v ? v : v[k];
    return v;
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return +t;
  if ("true" === t) return !0;
  if ("false" === t) return !1;
  if ("null" === t) return null;
  if (t.length >= 2 && ("'" === t[0] || '"' === t[0]) && t[t.length - 1] === t[0])
    return t.slice(1, -1).replace(/\\(.)/g, "$1");
  return t;
}
function runAct(el, expr, ev) {
  for (const st of _splitTop(expr, ";")) {
    const s = st.trim();
    if (!s) continue;
    if ("event.stopPropagation()" === s) {
      ev.stopPropagation();
      continue;
    }
    const m = /^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(s),
      fn = m && window[m[1]];
    if ("function" != typeof fn) {
      console.error("no action for", s);
      continue;
    }
    fn.apply(
      el,
      _splitTop(m[2], ",").map((a) => _actArg(a, el, ev)),
    );
  }
}
/* Clicks are delegated in the bubble phase so an action can stop propagation
   the way an inline handler could. Change and input use the capture phase:
   code that fires a synthetic `new Event("change")` without bubbles:true
   still reached an inline handler, and the capture phase is the only one
   that reaches a document-level listener for it. */
["click", "change", "input"].forEach((type) => {
  const attr = "click" === type ? "data-act" : "data-" + type;
  document.addEventListener(
    type,
    (ev) => {
      for (
        let el = ev.target && 1 === ev.target.nodeType ? ev.target : null;
        el;
        el = el.parentElement
      ) {
        if (!el.hasAttribute(attr)) continue;
        runAct(el, el.getAttribute(attr), ev);
        if (ev.cancelBubble) return;
      }
    },
    "click" !== type,
  );
});
function openImportPicker() {
  const i = document.getElementById("import-file-input");
  i && i.click();
}
function toggleCollapsed(el) {
  el && el.classList.toggle("collapsed");
}
function pickDefaultHoles(n, el) {
  (saveDefaultHoles(n),
    el &&
      el.parentElement &&
      [...el.parentElement.children].forEach((c) => c.classList.toggle("active", c === el)));
}
function clearHistorySearch() {
  const i = document.getElementById("history-search");
  (i && (i.value = ""), renderHistory());
}
