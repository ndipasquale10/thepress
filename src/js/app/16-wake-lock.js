/* A round is four hours of walking between thirty seconds of typing, so the
   phone locks itself between every shot -- unlock, reopen, find the hole,
   enter the score, repeat, eighteen times. Hold a screen wake lock for as long
   as a round is the thing on screen (scoring, or watching someone else's) and
   drop it the moment it is not, so nothing is held on the home screen or in
   Settings. The lock is released by the system whenever the page is hidden and
   is NOT restored on return, so re-request on visibilitychange. Everything is
   best-effort: no support, a policy block, or a rejected request all leave the
   app exactly as it was. */
let _wakeLock = null,
  _wakeWanted = !1;
function wakeLockSupported() {
  return "wakeLock" in navigator && !!navigator.wakeLock;
}
function keepAwakeEnabled() {
  try {
    return "0" !== localStorage.getItem("keepAwake");
  } catch (e) {
    return !0;
  }
}
async function _acquireWakeLock() {
  if (!wakeLockSupported() || _wakeLock || "visible" !== document.visibilityState) return;
  try {
    const l = await navigator.wakeLock.request("screen");
    /* The round may have ended while the request was in flight. */
    if (!_wakeWanted || !keepAwakeEnabled()) {
      try {
        l.release();
      } catch (e) {}
      return;
    }
    ((_wakeLock = l),
      l.addEventListener("release", () => {
        _wakeLock === l && (_wakeLock = null);
      }));
  } catch (e) {
    _wakeLock = null;
  }
}
function _releaseWakeLock() {
  const l = _wakeLock;
  _wakeLock = null;
  if (l)
    try {
      l.release();
    } catch (e) {}
}
function setScreenAwake(want) {
  ((_wakeWanted = !!want),
    _wakeWanted && keepAwakeEnabled() ? _acquireWakeLock() : _releaseWakeLock());
}
function toggleKeepAwake(row) {
  const on = !keepAwakeEnabled();
  safeSetItem("keepAwake", on ? "1" : "0");
  if (row) {
    const sw = row.querySelector(".ui-switch");
    (sw && sw.classList.toggle("on", on), row.setAttribute("aria-checked", on ? "true" : "false"));
  }
  on ? _wakeWanted && _acquireWakeLock() : _releaseWakeLock();
  showToast(on ? "Screen stays awake during a round" : "Screen will sleep as usual");
}
document.addEventListener("visibilitychange", () => {
  "visible" === document.visibilityState && _wakeWanted && keepAwakeEnabled() && _acquireWakeLock();
});
function applyThemeColorMeta() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (!m) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  bg && m.setAttribute("content", bg);
}
function initDarkMode() {
  let t = null;
  try {
    t = localStorage.getItem("skin");
  } catch (e) {}
  if (!SKINS.includes(t)) {
    const e = localStorage.getItem("darkMode"),
      a = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    ((t = "1" === e || (null == e && a && a.matches) ? "broadcast" : "clubhouse"),
      safeSetItem("skin", t));
  }
  ((document.documentElement.dataset.theme = t), applyThemeColorMeta());
} // USGA-style: average the best N of your last 20 differentials, x0.96.
