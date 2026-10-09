/* Everything behind an open dialog is inert.

   The dialogs set aria-modal and trap Tab by hand, but a screen reader's
   virtual cursor, a switch device and a swipe all walk straight past a Tab
   trap into the page underneath -- and on the scoring screen that page is a
   column of "+" buttons that change money. `inert` is the platform's answer:
   it takes the background out of the accessibility tree and out of pointer
   and focus handling at once.

   There are a dozen ways a dialog opens here (a class removed, a node
   appended, the picker, the hole result), so rather than touch each of them
   this watches for the result: whichever dialog is open and last in the
   document is the top one, and every element outside its ancestor chain is
   made inert. Live regions are left alone so a toast can still be heard, and
   so is the picker's scrim, because the tap that dismisses the picker lands
   on it. */
const _inerted = new Set();
let _inertTop = null;
function topDialog() {
  const open = [
    ...document.querySelectorAll(".modal:not(.hidden):not(.closing), #quick-picker"),
  ].filter((m) => m.isConnected);
  return open.length ? open[open.length - 1] : null;
}
function _inertSkip(el) {
  return (
    "SCRIPT" === el.tagName ||
    "STYLE" === el.tagName ||
    el.hasAttribute("aria-live") ||
    el.classList.contains("qp-scrim")
  );
}
function syncInert() {
  const top = topDialog();
  if (top === _inertTop && (top ? _inerted.size > 0 : 0 === _inerted.size)) return;
  _inertTop = top;
  _inerted.forEach((el) => el.removeAttribute("inert"));
  _inerted.clear();
  if (!top) return;
  for (let n = top; n && n !== document.body && n.parentElement; n = n.parentElement)
    for (const sib of n.parentElement.children)
      sib === n ||
        _inertSkip(sib) ||
        sib.hasAttribute("inert") ||
        (sib.setAttribute("inert", ""), _inerted.add(sib));
}
"inert" in HTMLElement.prototype &&
  "function" == typeof MutationObserver &&
  new MutationObserver(syncInert).observe(document.body, {
    subtree: !0,
    childList: !0,
    attributes: !0,
    attributeFilter: ["class"],
  });

/* Enter and Space on the custom controls. The delegate matched
   role="button" exactly, so role="switch" had to be added by hand when the
   wake-lock row arrived, and the next role would have silently lost the
   keyboard. Native controls handle their own keys and are left out. */
const KEY_ROLES = ["button", "switch", "checkbox", "radio", "tab", "menuitem", "option", "link"];
const KEY_ROLE_SEL = KEY_ROLES.map(
  (r) => `[role="${r}"][tabindex="0"]:not(button):not(a[href]):not(input):not(select)`,
).join(",");

/* The full scorecard is the one thing people want on paper -- for the
   clubhouse board or the league binder. Print it alone, on the light skin
   whatever the screen is wearing, at the width of the page. */
let _printSkin = null;
function printScorecard() {
  const m = document.getElementById("scorecard-modal");
  (m && m.classList.contains("hidden") && showScorecard(),
    document.body.classList.add("print-scorecard"),
    window.print());
}
window.addEventListener("beforeprint", () => {
  _printSkin = document.documentElement.dataset.theme || null;
  document.documentElement.dataset.theme = "clubhouse";
});
window.addEventListener("afterprint", () => {
  (_printSkin && (document.documentElement.dataset.theme = _printSkin),
    (_printSkin = null),
    document.body.classList.remove("print-scorecard"));
});
