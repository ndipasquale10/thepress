const COLORS = PLAYER_PALETTES.clubhouse,
  STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5],
  STANDARD_HDCP = [7, 3, 15, 1, 9, 5, 17, 11, 13, 8, 4, 16, 2, 10, 6, 18, 12, 14];
let state = {
  course: "",
  pars: [...STANDARD_PARS],
  hdcps: [...STANDARD_HDCP],
  players: [],
  gameType: "nassau",
  gameOpts: {},
  sideBets: {
    skins: { on: !1, val: 2, carry: !0 },
    snake: { on: !1, val: 5 },
    junk: { on: !1, val: 2 },
  },
  handicapMode: "full",
  scores: {},
  confirmedHoles: {},
  currentHole: 0,
  started: !1,
  holeCount: 9,
  holeStart: 0,
};
var GAME_DESCS = {
  none: "No betting — just track scores, stats, and scorecard.",
  nassau:
    "Three separate match-play bets: Front 9, Back 9, and Overall 18. Individual or 2v2 teams (best ball). Optional auto-press when 2-down.",
  skins:
    "Lowest net score wins the skin on each hole. Ties carry the pot to the next hole. Each skin is worth a fixed $.",
  match: "Every hole is worth $. Lowest net score wins the hole from all other players. Ties push.",
  stableford:
    "Modified Stableford points per hole based on net score vs par. Players settle the point differential at the end.",
  bingo:
    "Three points per hole: Bingo (first on green), Bango (closest to pin once all on), Bongo (first to hole out). Each point is worth $.",
  dots: "Side bets on each hole: Greenie (closest on par 3), Sandy (up-and-down from sand), Birdie, Eagle, Polie (1-putt). Each dot is worth $.",
  wolf: "Best with 4 players. Wolf rotates each hole and picks a partner after seeing tee shots — or goes Lone Wolf for double. Wolf+partner vs the other two. Lowest combined net wins.",
  vegas:
    "Two teams of 2. Each team combines their scores into a 2-digit number (lower score first). The difference between the two numbers is the points. Birdie flips the losing team's number.",
  snake:
    "Award a 3-Putt whenever a player 3-putts a hole. Whoever holds the Snake (the last player to 3-putt) pays the pot to everyone else.",
  sixes:
    "Requires exactly 4 players. Partners rotate automatically every 6 holes through all 3 pairings (best with 18 holes). Best-ball per team settles each 6-hole segment.",
  banker:
    "One player is the Banker each hole, rotating automatically. The Banker plays a separate match against every other player — low net wins. Win or lose the stake against each opponent, hole by hole. Ties push.",
};
const undoStack = []; /* Undo captured the scores but not the flags that describe them, so undoing a
   hole confirmation put the old scores back while the hole stayed marked
   locked, and undoing across a pairing change left the new pairings in place
   scoring the restored card. Snapshot everything the money and the hole UI
   read. */
/* Nine JSON round-trips ran on every single tap of the score stepper, the
   bonus buttons and the hammer. structuredClone is the native deep copy and
   skips the string in the middle of the old parse(stringify(...)) pair; where
   it is missing the JSON path is still there. */
const _clone =
  typeof structuredClone === "function"
    ? (v) => structuredClone(v)
    : (v) => (void 0 === v ? v : JSON.parse(JSON.stringify(v)));
/* `key` coalesces a run of edits to one cell into a single undo step. Holding
   "+" to get from 4 to 9 pushed five snapshots, so undoing that one score cost
   five taps of Undo and evicted five real steps off the 30-deep stack. Same
   cell, nothing else touched in between, within a few seconds: the snapshot
   already on top is the state to go back to, so keep it and push nothing. */
let _undoKey = null,
  _undoKeyAt = 0;
function pushUndo(key) {
  const now = Date.now();
  if (key && undoStack.length && key === _undoKey && now - _undoKeyAt < 4000) {
    _undoKeyAt = now;
    return;
  }
  ((_undoKey = key || null), (_undoKeyAt = now));
  (undoStack.push({
    scores: _clone(state.scores),
    wolfHoles: _clone(state.wolfHoles || {}),
    wolfBreakouts: _clone(state.wolfBreakouts || {}),
    bankerHoles: _clone(state.bankerHoles || {}),
    bankerPresses: _clone(state.bankerPresses || {}),
    bonusPoints: _clone(state.bonusPoints || {}),
    matchPresses: _clone(state.matchPresses || []),
    confirmedHoles: _clone(state.confirmedHoles || {}),
    pickedUp: _clone(state.pickedUp || {}),
    pairings: _clone(state.pairings || null),
    pairingsLocked: !!state.pairingsLocked,
    currentHole: state.currentHole,
  }),
    undoStack.length > 30 && undoStack.shift(),
    updateUndoBtn());
}
function doUndo() {
  if (!canMutateRound()) return;
  if (!undoStack.length) return;
  _undoKey = null;
  const e = undoStack.pop();
  ((state.scores = e.scores),
    (state.wolfHoles = e.wolfHoles),
    void 0 !== e.wolfBreakouts && (state.wolfBreakouts = e.wolfBreakouts),
    void 0 !== e.bankerHoles && (state.bankerHoles = e.bankerHoles),
    void 0 !== e.bankerPresses && (state.bankerPresses = e.bankerPresses),
    (state.bonusPoints = e.bonusPoints),
    (state.matchPresses = e.matchPresses),
    void 0 !== e.confirmedHoles && (state.confirmedHoles = e.confirmedHoles),
    void 0 !== e.pickedUp && (state.pickedUp = e.pickedUp),
    void 0 !== e.pairings && null !== e.pairings && (state.pairings = e.pairings),
    void 0 !== e.pairingsLocked && (state.pairingsLocked = e.pairingsLocked),
    (state.currentHole = e.currentHole),
    invalidateMoneyCache(),
    saveCurrentRound(),
    renderHole(),
    updateUndoBtn());
}
function updateUndoBtn() {
  const e = document.getElementById("undo-btn");
  e && e.classList.toggle("hidden", 0 === undoStack.length);
}
function maxHole() {
  return state.holeCount;
}
function hLbl(e) {
  return (state.holeStart || 0) + e + 1;
}
function applyCoursePars() {
  const c = window._selectedCourse;
  if (!c || !c.pars) return;
  ((state.pars = [...c.pars]), (state.hdcps = [...c.hdcps]));
  if (9 === state.holeCount && 9 === (state.holeStart || 0))
    for (let i = 0; i < 9; i++)
      ((state.pars[i] = c.pars[9 + i]), (state.hdcps[i] = c.hdcps[9 + i]));
  invalidateHdcpCache();
}
function setNine(e) {
  ((state.holeStart = e),
    document
      .querySelectorAll(".nine-toggle-btn")
      .forEach((t) => t.classList.toggle("active", +t.dataset.start === e)),
    applyCoursePars(),
    buildParGrid(),
    updateParTotal());
}
function setHoleCount(e) {
  ((state.holeCount = e),
    document
      .querySelectorAll(".hole-toggle-btn")
      .forEach((t) => t.classList.toggle("active", +t.dataset.holes === e)));
  const t = document.getElementById("back-nine-section");
  t && t.classList.toggle("hidden", 9 === e);
  const s = document.getElementById("nine-select");
  s && s.classList.toggle("hidden", 9 !== e);
  (18 === e &&
    ((state.holeStart = 0),
    document
      .querySelectorAll(".nine-toggle-btn")
      .forEach((t) => t.classList.toggle("active", 0 === +t.dataset.start))),
    applyCoursePars(),
    buildParGrid(),
    updateParTotal());
}
function buildParGrid() {
  const _fnh = document.getElementById("front-nine-header");
  _fnh &&
    (_fnh.textContent =
      9 === state.holeCount && 9 === (state.holeStart || 0) ? "Back Nine" : "Front Nine");
  (["front-pars", "back-pars"].forEach((e, t) => {
    const a = document.getElementById(e);
    a.innerHTML = "";
    let s = '<div class="par-row-label"></div>';
    for (let e = 0; e < 9; e++)
      s += `<div class="par-col-hdr">${9 * t + e + 1 + (9 === state.holeCount ? state.holeStart || 0 : 0)}</div>`;
    a.innerHTML += `<div class="par-table-row">${s}</div>`;
    let n = '<div class="par-row-label par-label">Par</div>';
    for (let e = 0; e < 9; e++) {
      const a = 9 * t + e;
      n += `<div class="par-cell"><input type="number" inputmode="decimal" min="3" max="6" value="${state.pars[a]}" data-hole="${a}" class="par-input" aria-label="Hole ${a + 1 + (9 === state.holeCount ? state.holeStart || 0 : 0)} par"></div>`;
    }
    a.innerHTML += `<div class="par-table-row">${n}</div>`;
    let o = '<div class="par-row-label hdcp-label">Hdcp</div>';
    for (let e = 0; e < 9; e++) {
      const a = 9 * t + e;
      o += `<div class="par-cell"><input type="number" inputmode="decimal" min="1" max="18" value="${state.hdcps[a]}" data-hole="${a}" class="hdcp-input" aria-label="Hole ${a + 1 + (9 === state.holeCount ? state.holeStart || 0 : 0)} handicap rank"></div>`;
    }
    a.innerHTML += `<div class="par-table-row">${o}</div>`;
  }),
    document.querySelectorAll(".par-input").forEach((e) =>
      e.addEventListener("change", (e) => {
        ((state.pars[+e.target.dataset.hole] = +e.target.value), updateParTotal());
      }),
    ),
    document.querySelectorAll(".hdcp-input").forEach((e) =>
      e.addEventListener("change", (e) => {
        state.hdcps[+e.target.dataset.hole] = +e.target.value;
      }),
    ),
    updateParTotal());
}
function setParDetailCollapsed(c) {
  const e = document.getElementById("par-detail"),
    t = document.querySelector(".par-toggle"),
    a = document.getElementById("par-toggle-hint");
  e &&
    (e.classList.toggle("hidden", c),
    t && t.setAttribute("aria-expanded", String(!c)),
    a && (a.textContent = c ? "Edit" : "Hide"));
}
function toggleParDetail() {
  const e = document.getElementById("par-detail");
  e && setParDetailCollapsed(!e.classList.contains("hidden"));
}
function updateParTotal() {
  const e = state.pars.slice(0, state.holeCount).reduce((e, t) => e + t, 0),
    t = document.getElementById("par-total");
  t && (t.textContent = `Par ${e} (${state.holeCount}H)`);
}
