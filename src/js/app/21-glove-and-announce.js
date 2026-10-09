/* Glove mode. Bigger score controls, switched on from the scoring screen
   itself -- the moment you need it is with a glove on and a club in the other
   hand, not in Settings before the round. Stored per device. */
function gloveOn() {
  try {
    return "1" === localStorage.getItem("gloveMode");
  } catch (e) {
    return !1;
  }
}
function applyGlove() {
  const on = gloveOn();
  on
    ? (document.documentElement.dataset.glove = "on")
    : delete document.documentElement.dataset.glove;
  const b = document.getElementById("glove-btn");
  b && b.setAttribute("aria-pressed", on ? "true" : "false");
}
function toggleGlove() {
  const on = !gloveOn();
  (safeSetItem("gloveMode", on ? "1" : "0"), applyGlove(), haptic());
  showToast(on ? "Glove mode on: bigger score buttons" : "Glove mode off");
}
applyGlove();

/* Confirming a hole moves real money, and said so only visually: the
   result card is a dialog that closes itself, and the ribbon redraws on every
   tap, so marking it live would read the whole table out on each "+". One
   polite sentence per confirmed hole instead, with the sign in words so it
   does not depend on the colour. */
function announce(msg) {
  const r = document.getElementById("sr-announce");
  if (!r) return;
  r.textContent = "";
  /* A fresh node, a tick later: screen readers skip a live region whose text
     is set to what it already was. */
  setTimeout(() => {
    r.textContent = msg;
  }, 60);
}
function moneyWords(v) {
  const c = Math.round(100 * v) / 100;
  if (Math.abs(c) < 0.005) return "even";
  const a = Math.abs(c),
    s = Number.isInteger(a) ? String(a) : a.toFixed(2);
  return (c > 0 ? "up $" : "down $") + s;
}
function announceHoleMoney(hole, deltas) {
  if ("none" === state.gameType && !anySideBetActive()) return;
  const moved = state.players
    .map((p, i) => ({ name: p.name, d: deltas[i] }))
    .filter((x) => Math.abs(x.d) >= 0.005);
  const total = calcMoney(),
    me = myRosterIdx();
  let msg =
    "Hole " +
    hLbl(hole) +
    " confirmed. " +
    (moved.length
      ? moved.map((x) => x.name + " " + moneyWords(x.d)).join(", ") + " on the hole."
      : "No money changed hands.");
  state.players[me] && (msg += " You are " + moneyWords(total[me]) + " for the round.");
  announce(msg);
}
