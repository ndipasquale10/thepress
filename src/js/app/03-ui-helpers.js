window.onerror = function (e, t, a) {
  console.error("The Press error:", e, t, a);
  const s = document.getElementById("error-toast");
  return (
    s &&
      ((s.textContent = "Error: " + e + " (line " + a + "). Tap to reload."),
      s.classList.remove("hidden"),
      (s.onclick = () => location.reload())),
    !1
  );
};
function showStorageWarning() {
  const e = document.getElementById("storage-warn-toast");
  e && (e.classList.remove("hidden"), (e.onclick = () => e.classList.add("hidden")));
}
let _toastTimer = null,
  _toastQueue = [],
  _toastActive = !1,
  _updatePrompted = !1;
function showToast(e, t) {
  t = t || {};
  const last = _toastQueue[_toastQueue.length - 1];
  if (last && last.msg === e) return;
  (_toastQueue.push({ msg: e, opts: t }), _pumpToast());
}
function _pumpToast() {
  if (_toastActive) return;
  const a = document.getElementById("app-toast");
  if (!a) return;
  const next = _toastQueue.shift();
  if (!next) return;
  _toastActive = !0;
  const o = next.opts;
  ((a.textContent = next.msg), (a.className = "app-toast toast-" + (o.type || "info") + " show"));
  const done = () => {
    _toastActive &&
      ((_toastActive = !1),
      a.classList.remove("show"),
      clearTimeout(_toastTimer),
      setTimeout(_pumpToast, 260));
  };
  ((a.onclick = o.onClick
    ? () => {
        try {
          o.onClick();
        } catch (e) {}
        done();
      }
    : done),
    clearTimeout(_toastTimer),
    o.persistent || (_toastTimer = setTimeout(done, o.duration || 3500)));
}
let _modalReturnFocus = null;
let _scrollLockY = 0,
  _scrollLocked = !1;
function lockBodyScroll() {
  if (_scrollLocked) return;
  ((_scrollLockY = window.scrollY || 0), (_scrollLocked = !0));
  // overflow:hidden alone does not hold on iOS Safari, so pin the body and
  // offset it to keep the page visually where it was.
  ((document.body.style.position = "fixed"),
    (document.body.style.top = -_scrollLockY + "px"),
    (document.body.style.left = "0"),
    (document.body.style.right = "0"),
    (document.body.style.width = "100%"));
}
function unlockBodyScroll() {
  if (!_scrollLocked) return;
  _scrollLocked = !1;
  ((document.body.style.position = ""),
    (document.body.style.top = ""),
    (document.body.style.left = ""),
    (document.body.style.right = ""),
    (document.body.style.width = ""));
  window.scrollTo(0, _scrollLockY);
}
function openModalA11y(e) {
  const t = document.getElementById(e);
  if (!t) return;
  _modalReturnFocus = document.activeElement;
  const a = t.querySelectorAll(
    'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
  );
  (a[0] || t).focus({ preventScroll: !0 });
}
function trapModalTab(e) {
  if ("Tab" !== e.key) return;
  const _m = document.querySelectorAll(".modal:not(.hidden)"),
    t = _m[_m.length - 1];
  if (!t) return;
  const a = Array.from(
    t.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),
  ).filter((e) => !e.disabled && e.offsetParent);
  if (!a.length) return;
  const s = a[0],
    n = a[a.length - 1];
  e.shiftKey && document.activeElement === s
    ? (e.preventDefault(), n.focus())
    : e.shiftKey || document.activeElement !== n || (e.preventDefault(), s.focus());
}
document.addEventListener("keydown", trapModalTab);
document.addEventListener("keydown", (e) => {
  if (
    ("Enter" === e.key || " " === e.key) &&
    e.target &&
    e.target.matches &&
    e.target.matches('[role="button"][tabindex="0"],[role="switch"][tabindex="0"]')
  ) {
    (e.preventDefault(), e.target.click());
  }
});
function closeModal(e) {
  const t = document.getElementById(e);
  t &&
    !t.classList.contains("hidden") &&
    (t.classList.add("closing"),
    setTimeout(() => {
      (t.classList.remove("closing"),
        t.classList.add("hidden"),
        _modalReturnFocus && (_modalReturnFocus.focus(), (_modalReturnFocus = null)));
    }, 200));
}
let _dlgResolve = null;
function _openAppDialog(msg, o, isPrompt) {
  return new Promise((res) => {
    _dlgResolve && _dlgResolve(isPrompt ? null : !1);
    const d = document.getElementById("app-dialog"),
      t = document.getElementById("app-dialog-title"),
      m = document.getElementById("app-dialog-msg"),
      i = document.getElementById("app-dialog-input"),
      ok = document.getElementById("app-dialog-ok"),
      no = document.getElementById("app-dialog-cancel");
    if (!d || !ok) return res(isPrompt ? null : !1);
    t.textContent = o.title || (isPrompt ? "Enter" : "Confirm");
    m.textContent = msg || "";
    i.classList.toggle("hidden", !isPrompt);
    i.value = o.initial || "";
    i.placeholder = o.placeholder || "";
    o.maxLength ? i.setAttribute("maxlength", o.maxLength) : i.removeAttribute("maxlength");
    ok.textContent = o.confirmLabel || "OK";
    no.textContent = o.cancelLabel || "Cancel";
    ok.classList.toggle("danger-btn", !!o.danger);
    const done = (v) => {
      _dlgResolve = null;
      d.classList.add("hidden");
      d.onkeydown = null;
      d.onclick = null;
      _modalReturnFocus && (_modalReturnFocus.focus(), (_modalReturnFocus = null));
      res(v);
    };
    _dlgResolve = done;
    ok.onclick = () => done(isPrompt ? i.value.trim() : !0);
    no.onclick = () => done(isPrompt ? null : !1);
    d.onclick = (e) => {
      e.target === d && done(isPrompt ? null : !1);
    };
    d.onkeydown = (e) => {
      "Escape" === e.key
        ? (e.preventDefault(), done(isPrompt ? null : !1))
        : "Enter" === e.key && (e.preventDefault(), done(isPrompt ? i.value.trim() : !0));
    };
    d.classList.remove("hidden");
    openModalA11y("app-dialog");
    isPrompt && i.focus();
  });
}
function appConfirm(msg, o) {
  return _openAppDialog(msg, o || {}, !1);
}
function appPrompt(msg, o) {
  return _openAppDialog(msg, o || {}, !0);
}
let isSpectator = !1;
function canMutateRound() {
  return !isSpectator;
}
function wolfPickMissing(t) {
  if ("wolf" !== state.gameType) return !1;
  const o = state.wolfHoles && state.wolfHoles[t];
  return !o || void 0 === o.partners;
}
function haptic(p) {
  navigator.vibrate && navigator.vibrate(p || 15);
}
function animateScreenIn(id) {
  const el = document.getElementById(id);
  el &&
    (el.classList.remove("hidden"),
    el.classList.remove("screen-enter"),
    void el.offsetWidth,
    el.classList.add("screen-enter"));
}
function celebrate() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("div");
  c.className = "confetti-layer";
  const cols = paletteFor()
    .slice(0, 4)
    .concat([cssVar("--accent", "#f5c451")]);
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("i");
    p.style.left = 40 + 20 * Math.random() + "%";
    p.style.background = cols[i % 4];
    p.style.setProperty("--dx", 160 * Math.random() - 80 + "px");
    p.style.animationDelay = 0.15 * Math.random() + "s";
    c.appendChild(p);
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 1300);
}
function safeSetItem(e, t) {
  try {
    return (localStorage.setItem(e, t), !0);
  } catch (a) {
    return (showStorageWarning(), !1);
  }
}
function safeParseJSON(e, t) {
  if (null == e) return t;
  try {
    return JSON.parse(e);
  } catch (a) {
    return t;
  }
}
function mergeByName(e, t) {
  const a = [...e];
  return (
    (t || []).forEach((e) => {
      a.find((t) => t.name.toLowerCase() === e.name.toLowerCase()) || a.push(e);
    }),
    a
  );
}
let _pressListCollapsed = !1;
function togglePressList() {
  ((_pressListCollapsed = !_pressListCollapsed), renderHole());
}
function fmtMoney(e) {
  const t = Math.round(100 * e) / 100,
    s = Math.abs(t),
    a = Number.isInteger(s) ? String(s) : s.toFixed(2);
  return (t >= 0 ? "+$" : "-$") + a;
}
function esc(e) {
  return String(e ?? "").replace(
    /[&<>"']/g,
    (e) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[e],
  );
} // The player palette is tuned so the dots stay tellable apart, which leaves the
// mid-tone swatches too light to carry white initials (measured 2.97:1 on the
// teal). Pick the initial's ink from the swatch's own luminance instead of
// always using white, so every avatar clears contrast without touching the
// palette that identifies each player.
function inkOn(hex) {
  const h = String(hex).replace("#", "");
  if (6 !== h.length) return "var(--on-solid)";
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L =
    0.2126 * f(parseInt(h.slice(0, 2), 16)) +
    0.7152 * f(parseInt(h.slice(2, 4), 16)) +
    0.0722 * f(parseInt(h.slice(4, 6), 16));
  return (L + 0.05) / 0.05 > 4.5 ? "#000" : "#fff";
}
/* The dot carries an initial from 8px up, and every surface that draws one also
   prints the player's name beside it -- which is what actually keeps players
   apart, because eight colours cannot all stay distinct for a dichromat (see
   PLAYER_PALETTES). The exception was the skins strip, a row of dots and hole
   numbers with no names at all, so the dot takes an accessible name of its own:
   free for sighted users, and the only identification a screen reader ever had. */
function avatarHTML(e, t, label) {
  t = t || 10;
  const c = playerColor(e),
    a = esc(c),
    ink = inkOn(c),
    nm = e && e.name ? String(e.name).trim() : "",
    s = esc(t >= 8 ? (nm ? nm.charAt(0).toUpperCase() : "?") : "");
  return (
    '<span class="avatar-dot"' +
    (label && nm ? ' role="img" aria-label="' + esc(nm) + '"' : ' aria-hidden="true"') +
    ' style="background:' +
    a +
    ";color:" +
    ink +
    ";width:" +
    t +
    "px;height:" +
    t +
    "px;font-size:" +
    Math.max(6, Math.round(0.62 * t)) +
    'px">' +
    s +
    "</span>"
  );
} // Two categorical palettes sharing one hue order, each stepped for its own
