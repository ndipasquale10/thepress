#!/usr/bin/env node
'use strict';
// Zero-dependency regression check for the betting calculation bugs fixed in
// index.html. Loads the app's inline <script> blocks into a sandboxed vm
// context (stubbing just enough of document/localStorage/etc. that the app's
// top-level code doesn't throw) and exercises the pure calc functions
// directly. Run with: node test/calc.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const scriptBlocks = [];
const scriptTagRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = scriptTagRe.exec(html))) scriptBlocks.push(m[1]);

if (scriptBlocks.length === 0) {
  console.error('No inline <script> blocks found in index.html - aborting.');
  process.exit(1);
}

function makeElementMock() {
  const own = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } };
  return new Proxy(own, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'innerHTML' || prop === 'textContent' || prop === 'value') return '';
      return () => makeElementMock();
    },
    set(target, prop) { target[prop] = arguments[2]; return true; },
  });
}

// getElementById("handicap-mode") must return null so getPlayingHandicaps()
// falls back to state.handicapMode (matching how the real app behaves when
// the setup UI isn't present) - every other id gets a working mock element.
function makeDocumentMock() {
  const own = {
    getElementById: (id) => (id === 'handicap-mode' ? null : makeElementMock()),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeElementMock(),
    addEventListener() {},
    removeEventListener() {},
    body: makeElementMock(),
    documentElement: makeElementMock(),
  };
  return new Proxy(own, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => makeElementMock();
    },
  });
}

const memoryStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
})();

function makeGenericMock() {
  return new Proxy(function () {}, {
    get() { return makeGenericMock(); },
    apply() { return makeGenericMock(); },
  });
}

const sandbox = {
  console,
  localStorage: memoryStorage,
  document: makeDocumentMock(),
  navigator: makeGenericMock(),
  location: makeGenericMock(),
  firebase: makeGenericMock(),
  requestAnimationFrame: () => 0,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  alert() {},
  confirm() { return true; },
};
sandbox.window = sandbox;

const context = vm.createContext(sandbox);

scriptBlocks.forEach((code, i) => {
  try {
    vm.runInContext(code, context, { filename: `inline-script-${i}.js` });
  } catch (err) {
    // Mirrors a real browser: an error in one <script> tag doesn't stop the others.
    console.warn(`(warning) inline script block ${i} threw during load: ${err.message}`);
  }
});

const required = ['calcVegasMoney', 'calcNassauMoney', 'calcSkins', 'calcBonusMoney', 'addBonus', 'removeBonus', 'getBonusCount', 'getPlayingHandicaps', 'readGameOpts', 'computeScoringStats', 'esc', 'safeParseJSON', 'mergeByName', 'roundNetsToCents', 'sixesSetupValid', 'vegasSetupValid', 'calcBankerMoney', 'bankerForHole', 'bankerPickMissing', 'bankerScoreFactor', 'bankerPressFactor', 'pressBankerGroup', 'pressBankerUnit'];
for (const fn of required) {
  if (typeof context[fn] !== 'function') {
    console.error(`FATAL: ${fn} was not found in the loaded script context. Aborting tests.`);
    process.exit(1);
  }
}

let pass = 0;
let fail = 0;

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok - ${msg}`);
  } else {
    fail++;
    console.log(`  FAIL - ${msg}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

function freshStateLiteral(overrides) {
  const base = {
    players: [],
    scores: {},
    pars: Array(18).fill(4),
    hdcps: Array.from({ length: 18 }, (_, i) => i + 1),
    handicapMode: 'none',
    gameType: 'none',
    gameOpts: {},
    bonusPoints: {},
    wolfHoles: {},
    bankerHoles: {},
    bankerPresses: {},
    matchPresses: [],
    pairings: [],
    currentHole: 0,
    holeCount: 18,
    selectedTee: null,
  };
  return Object.assign(base, overrides);
}

function loadState(stateObj) {
  // Runs inside the same vm context so it mutates the app's own top-level
  // `state`/`undoStack` bindings (not visible as host-side properties).
  vm.runInContext(`
    Object.assign(state, ${JSON.stringify(stateObj)});
    if (typeof invalidateHdcpCache === 'function') invalidateHdcpCache();
    if (typeof invalidateMoneyCache === 'function') invalidateMoneyCache();
    if (typeof undoStack !== 'undefined') undoStack.length = 0;
  `, context);
}

function call(fnName, ...args) {
  vm.runInContext(`globalThis.__args = ${JSON.stringify(args)};`, context);
  try {
    return vm.runInContext(`${fnName}(...globalThis.__args)`, context);
  } catch (err) {
    throw new Error(`${fnName}(${args.map((a) => JSON.stringify(a)).join(', ')}) threw: ${err.message}`);
  }
}

function scoresFor(perPlayerHoles) {
  const scores = {};
  perPlayerHoles.forEach((holes, p) => {
    scores[p] = {};
    holes.forEach((v, h) => { scores[p][h] = v; });
  });
  return scores;
}

console.log('Vegas: payout is halved per player, not doubled (Bug A)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  holeCount: 1,
  scores: scoresFor([[4], [4], [5], [6]]),
  gameOpts: { vegasTeams: [[0, 1], [2, 3]], vegasVal: 1, vegasFlip: false },
}));
assertEqual(call('calcVegasMoney'), [6, 6, -6, -6], 'team0 (44) beats team1 (56) by 12pts @$1 -> $6/player, not $12/player');

console.log('Vegas: handicap strokes are applied, not ignored (Bug 2)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 10 }, { name: 'D', hdcp: 0 }],
  holeCount: 1,
  hdcps: [1, ...Array(17).fill(18)], // hole 0 is the hardest hole (stroke index 1)
  handicapMode: 'full',
  scores: scoresFor([[5], [5], [6], [5]]), // gross: team0=55, team1=65 (team0 "wins" if strokes ignored)
  gameOpts: { vegasTeams: [[0, 1], [2, 3]], vegasVal: 1, vegasFlip: false },
}));
assertEqual(call('calcVegasMoney'), [0, 0, 0, 0], 'player C (hdcp 10) gets a stroke on the hardest hole, evening the net numbers to a tie');

console.log('Bonus: repeated taps on one category cap at 1 point, not N (Bug 3)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  scores: { 0: {}, 1: {} },
  gameType: 'bingo',
  gameOpts: { ptVal: 1 },
}));
for (let i = 0; i < 5; i++) call('addBonus', 0, 0, 0); // tap "Bingo" 5x for player 0, hole 0
assertEqual(call('getBonusCount', 0, 0), 1, 'category 0 tapped 5x still counts as 1');
call('addBonus', 0, 0, 1); // Bango
call('addBonus', 0, 0, 2); // Bongo
assertEqual(call('getBonusCount', 0, 0), 3, 'all 3 distinct categories awarded once each = 3');
assertEqual(call('calcBonusMoney'), [3, -3], 'money reflects the capped 3 points, not 5+');
call('removeBonus', 0, 0);
assertEqual(call('getBonusCount', 0, 0), 0, 'undo clears the whole row for that player/hole');

console.log('Nassau: individual mode decided by holes won, not cumulative stroke deficit (Bug 4)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  holeCount: 6,
  scores: scoresFor([
    [2, 2, 4, 4, 4, 4], // A: big wins on holes 0-1, narrow losses on 2-5
    [6, 6, 3, 3, 3, 3], // B: big losses on holes 0-1, narrow wins on 2-5 -> wins 4 of 6 holes
  ]),
  gameOpts: { front: 1, back: 0, overall: 0, press: false },
}));
assertEqual(call('calcNassauMoney'), [-1, 1], 'B wins 4 holes to 2, so B collects the front-9 bet despite A having smaller cumulative stroke deficit');

console.log('Skins: carry-over on unplayed holes is gated on gameOpts.carry (Bug 5, hygiene)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  holeCount: 3,
  scores: { 0: { 0: 4, 2: 4 }, 1: { 0: 5, 2: 4 } }, // hole 1 unplayed for both
  gameOpts: { carry: false },
}));
assertEqual(call('calcSkins'), [1, 0], 'carry off: A wins hole 0, hole 1 unplayed, hole 2 tied -> 1 skin for A');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  holeCount: 3,
  scores: { 0: { 0: 4, 2: 4 }, 1: { 0: 5, 2: 4 } },
  gameOpts: { carry: true },
}));
assertEqual(call('calcSkins'), [1, 0], 'carry on: same scores still resolve deterministically (no crash, no double-count)');

console.log('Reliability: Course Handicap mode applies slope/rating, relative to the low handicapper');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 10 }, { name: 'B', hdcp: 20 }],
  pars: Array(18).fill(4), // total par 72
  handicapMode: 'course',
  selectedTee: { rating: 72.6, slope: 142 },
}));
// A: 10*(142/113)+(72.6-72) = 12.566+0.6 = 13.166 -> round 13
// B: 20*(142/113)+(72.6-72) = 25.133+0.6 = 25.733 -> round 26
// relative to the field's low value (13): A=0, B=13
assertEqual(call('getPlayingHandicaps'), [0, 13], 'Course Handicap formula computed and zeroed against the low handicapper');

loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 10 }, { name: 'B', hdcp: 20 }],
  handicapMode: 'course',
  selectedTee: null,
}));
const courseFallback = call('getPlayingHandicaps');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 10 }, { name: 'B', hdcp: 20 }],
  handicapMode: 'full',
}));
assertEqual(courseFallback, call('getPlayingHandicaps'), 'Course Handicap mode falls back to Full Handicap when no tee data is selected');

console.log('Reliability: game-option $ values clamp to a minimum of 1');
const clampDocMock = new Proxy(
  { getElementById: (id) => (id === 'opt-front' ? { value: '0' } : null) },
  { get: (target, prop) => (prop in target ? target[prop] : () => null) }
);
const originalDocument = context.document;
context.document = clampDocMock;
loadState(freshStateLiteral({ gameType: 'nassau' }));
assertEqual(call('readGameOpts').front, 1, 'a "0" front-nine bet value clamps to the $1 minimum instead of passing through as 0');
context.document = originalDocument;

console.log('Stats: cross-round scoring stats aggregate correctly (computeScoringStats)');
const fakeRounds = [
  {
    finished: true,
    players: [{ name: 'A', color: '#111' }, { name: 'B', color: '#222' }],
    pars: [4, 4, 4],
    scores: { 0: { 0: 3, 1: 4, 2: 5 }, 1: { 0: 4, 1: 4, 2: 4 } }, // A: birdie,par,bogey (even); B: par,par,par
  },
  {
    finished: true,
    players: [{ name: 'A', color: '#111' }, { name: 'B', color: '#222' }],
    pars: [4, 4, 4],
    scores: { 0: { 0: 2, 1: 4, 2: 4 }, 1: { 0: 5, 1: 5, 2: 5 } }, // A: eagle,par,par (-2); B: bogey,bogey,bogey (+3)
  },
];
const stats = call('computeScoringStats', fakeRounds);
const statsA = stats.find((s) => s.name === 'A');
const statsB = stats.find((s) => s.name === 'B');
assertEqual(statsA.rounds, 2, 'player A played 2 rounds');
assertEqual(statsA.best, 10, 'player A best round total is 10 (2+4+4)');
assertEqual(statsA.scoringAvgVsPar, -1, 'player A averages -1 vs par across the 2 rounds ((0)+(-2))/2');
assertEqual([statsA.eagles, statsA.birdies, statsA.pars, statsA.bogeys, statsA.doublePlus], [1, 1, 3, 1, 0], 'player A hole-type counts across both rounds');
assertEqual(statsB.best, 12, 'player B best round total is 12 (4+4+4)');
assertEqual(statsB.scoringAvgVsPar, 1.5, 'player B averages +1.5 vs par across the 2 rounds ((0)+(3))/2');
assertEqual([statsB.eagles, statsB.birdies, statsB.pars, statsB.bogeys, statsB.doublePlus], [0, 0, 3, 3, 0], 'player B hole-type counts across both rounds');
assertEqual(stats[0].name, 'A', 'stats are sorted best (lowest avg vs par) first');
assertEqual(statsA.trend, [0, -2], 'player A trend retains each round\'s score-vs-par diff in order');
assertEqual(statsB.trend, [0, 3], 'player B trend retains each round\'s score-vs-par diff in order');

console.log('Wolf: "Lone Wolf" button label reflects gameOpts.lone2x, not hardcoded (Bug 6)');
const hasConditionalLabel = html.includes('Lone Wolf (${state.gameOpts.lone2x?"2×":"1×"})');
if (hasConditionalLabel) { pass++; console.log('  ok - label is rendered conditionally on gameOpts.lone2x'); }
else { fail++; console.log('  FAIL - static "Lone Wolf (2×)" label found instead of a conditional one'); }

console.log('Wolf: normal-pick payout scales with birdie/eagle and splits across the field (calcWolfMoney)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  gameType: 'wolf',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[3], [4], [5], [5]]), // wolf+partner birdie (3) beats field (5,5)
  wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } },
  gameOpts: { wolfVal: 1 },
}));
assertEqual(call('calcWolfMoney'), [2, 2, -2, -2], 'wolf(A)+partner(B) birdie on a balanced 2v2: each player wins/loses the point x2 (birdie)');

console.log('Wolf: Lone Wolf pays/collects double via gameOpts.lone2x (Bug 6 follow-through)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  gameType: 'wolf',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[3], [5], [5], [5]]), // lone wolf (A) birdies, field all bogey
  wolfHoles: { 0: { wolf: 0, partners: [], hammers: 0 } },
  gameOpts: { wolfVal: 1, lone2x: true },
}));
assertEqual(call('calcWolfMoney'), [12, -4, -4, -4], 'lone wolf birdie at 2x collects double from each of the 3 field players');

console.log('Wolf: shuck (one player vs everyone) at 2x — collects/pays each opponent, with birdie/eagle + hammer multipliers');
// shuck win with a birdie: 2x base x2 birdie = 4x, collected from each of 3 opponents
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  gameType: 'wolf', holeCount: 1, pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[3], [5], [5], [5]]),
  wolfHoles: { 0: { wolf: 0, partners: [], blind: false, blindPick: false, shuck: 0, hammers: 0 } },
  gameOpts: { wolfVal: 1 },
}));
assertEqual(call('calcWolfMoney'), [12, -4, -4, -4], 'shuck(A) birdie beats field: 2x*2 = collects 4 from each of 3 opponents');

// shuck loss at par: 2x, pays each opponent (even opponents who scored worse still collect - field best ball)
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  gameType: 'wolf', holeCount: 1, pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[6], [4], [5], [5]]),
  wolfHoles: { 0: { wolf: 0, partners: [], blind: false, blindPick: false, shuck: 0, hammers: 0 } },
  gameOpts: { wolfVal: 1 },
}));
assertEqual(call('calcWolfMoney'), [-6, 2, 2, 2], 'shuck(A) loses to field best: pays 2x to each of 3 opponents');

// shuck win at par with 1 hammer: 2x base x2 hammer = 4x
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  gameType: 'wolf', holeCount: 1, pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[4], [5], [5], [5]]),
  wolfHoles: { 0: { wolf: 0, partners: [], blind: false, blindPick: false, shuck: 0, hammers: 1 } },
  gameOpts: { wolfVal: 1 },
}));
assertEqual(call('calcWolfMoney'), [12, -4, -4, -4], 'shuck(A) par win with 1 hammer: 2x*2 = collects 4 from each');

// shuck tie: nobody moves money
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  gameType: 'wolf', holeCount: 1, pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[4], [4], [5], [5]]),
  wolfHoles: { 0: { wolf: 0, partners: [], blind: false, blindPick: false, shuck: 0, hammers: 0 } },
  gameOpts: { wolfVal: 1 },
}));
assertEqual(call('calcWolfMoney'), [0, 0, 0, 0], 'shuck(A) ties field best: no money moves');

console.log('Match Play: "perhole" format pays the hole winner from every other player, ties push');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  gameType: 'match',
  holeCount: 3,
  scores: scoresFor([[4, 5, 4], [5, 4, 4]]), // A wins hole0, B wins hole1, hole2 ties
  matchPresses: [],
  gameOpts: { matchFormat: 'perhole', holeVal: 2 },
}));
assertEqual(call('calcMatchMoney'), [0, 0], 'A wins one hole and B wins one hole at $2 each, netting to zero; tied hole pushes');

console.log('Match Play: "nassau" format pays the front/back/overall segment winner once, not per-hole');
// Eighteen holes with three scored. This used to be a three-hole round, which
// worked only because front and overall then covered the same holes -- the very
// double-charge that Overall being an eighteen-hole bet removes. The point here
// is segment-once versus per-hole, so it needs a round where both segments
// genuinely exist.
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  gameType: 'match',
  holeCount: 18,
  scores: scoresFor([[4, 4, 4], [5, 5, 4]]), // A wins holes 0-1, hole 2 ties -> A takes front and overall
  gameOpts: { matchFormat: 'nassau', matchFront: 1, matchBack: 1, matchOverall: 2 },
}));
assertEqual(call('calcMatchMoney'), [3, -3], 'A wins both the front-9 bet ($1) and overall bet ($2) as the unique segment winner, not per-hole');

// --- Match Play's nassau format is the same three-segment shape as Nassau, and
// had the same defect: Back 9 was gated on maxHole() > 9 but Overall was not, so
// a nine-hole round charged Front and Overall for the identical nine holes. It
// stayed exactly zero-sum while doing it, which is why a zero-sum sweep cannot
// find this class -- the money is not invented, it is just the wrong amount. ---
console.log('Match Play (nassau format): on nine holes only the match settles');
(() => {
  const money = (H, o) => {
    const scores = { 0: {}, 1: {} };
    for (let h = 0; h < H; h++) { scores[0][h] = 4; scores[1][h] = 5; } // A wins every hole
    loadState(freshStateLiteral({ players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
      gameType: 'match', holeCount: H, holeStart: 0, handicapMode: 'none', scores,
      pars: Array(H).fill(4), hdcps: Array.from({ length: H }, (_, i) => i + 1),
      gameOpts: Object.assign({ matchFormat: 'nassau', holeVal: 2, matchPressVal: 2 }, o) }));
    return call('calcMatchMoney');
  };
  assertEqual(money(9, { matchFront: 5, matchBack: 5, matchOverall: 5 }), [5, -5],
    'nine holes: a $5 match pays $5, not $10 — back and overall are eighteen-hole bets');
  assertEqual(money(9, { matchFront: 0, matchBack: 0, matchOverall: 5 }), [0, 0],
    'nine holes: an overall stake on its own settles nothing');
  assertEqual(money(18, { matchFront: 5, matchBack: 5, matchOverall: 5 }), [15, -15],
    'eighteen holes is unchanged: front, back and overall each settle');
})();

console.log('Stableford: money is the pairwise zero-sum differential of net Stableford points x $/point');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  gameType: 'stableford',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[2], [5]]), // A: net -2 vs par -> 5 pts (eagle); B: net +1 -> -1 pt (bogey)
  gameOpts: { ptVal: 2 },
}));
assertEqual(call('calcStablefordMoney'), [12, -12], 'A (5 pts) vs B (-1 pt): (5-(-1))*$2 = $12 zero-sum');

console.log('Banker: the first hole has no default banker — the user must choose one, and it drives that hole from the chosen card');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  scores: scoresFor([[4], [5], [5]]),
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('bankerForHole', 0), null, 'hole 1 has no banker until the user picks one (no silent default to the first player)');
assertEqual(call('bankerPickMissing', 0), true, 'bankerPickMissing flags hole 1 when nobody has been chosen to bank');
assertEqual(call('calcBankerMoney'), [0, 0, 0], 'with no first-hole banker chosen, the hole pays nothing');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  scores: scoresFor([[4], [5], [5]]),
  bankerHoles: { 0: 2 }, // user chooses C to bank the first hole
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('bankerForHole', 0), 2, 'the chosen first-hole banker (C) is used');
assertEqual(call('calcBankerMoney'), [2, 0, -2], 'C banks: C(5) loses to A(4) [-2/+2] and ties B(5) [push] -> A +2, B 0, C -2');

console.log("Banker: hole 1's banker is the player who won the previous hole, not a fixed rotation");
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 2,
  // Scores kept at par-or-worse so no birdie/eagle factor muddies the rotation check.
  // Hole 0 banker = A (chosen first): A(4) beats B(5) and C(6) -> A +2, B -1, C -1
  // Hole 0 winner is A (unique low net), so Hole 1 banker = A again:
  //   A(5) loses to B(4) -> A -1, B +1; A(5) beats C(6) -> A +1, C -1
  scores: scoresFor([[4, 5], [5, 4], [6, 6]]),
  bankerHoles: { 0: 0 }, // user picks A to bank the first hole
  gameOpts: { bankerVal: 1 },
}));
assertEqual(call('calcBankerMoney'), [2, 0, -2], 'A stays banker on hole 1 because A won hole 0; A(+2, then 0) = +2, B(-1,+1)=0, C(-1,-1)=-2');

console.log('Banker: a manual per-hole override picks the banker regardless of who won last hole');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 2,
  scores: scoresFor([[4, 5], [5, 4], [6, 6]]),
  bankerHoles: { 0: 0, 1: 1 }, // A banks hole 0; force B as banker on hole 1 even though A won hole 0
  gameOpts: { bankerVal: 1 },
}));
// Hole 0 banker = A: A +2, B -1, C -1. Hole 1 banker = B(4): beats A(5) and C(6) -> B +2, A -1, C -1
assertEqual(call('calcBankerMoney'), [1, 1, -2], 'override makes B the hole-1 banker: A(+2-1)=+1, B(-1+2)=+1, C(-1-1)=-2');

console.log('Banker: a tie against the banker pushes (no money moves for that pairing)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  // Hole 0 banker = A: A(4) ties B(4) -> push; A(4) beats C(5) -> A +2, C -2
  scores: scoresFor([[4], [4], [5]]),
  bankerHoles: { 0: 0 }, // A banks hole 0
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('calcBankerMoney'), [2, 0, -2], 'banker pushes the tie with B but collects $2 from C');

console.log('Banker press: a single player pressing the banker doubles only that heads-up match on the hole');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  scores: scoresFor([[4], [5], [6]]), // banker A beats B and C
  bankerHoles: { 0: 0 },
  bankerPresses: { 0: { group: 0, units: { 1: 1 } } }, // B presses the banker (2x on A-vs-B only)
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('calcBankerMoney'), [6, -4, -2], 'A vs B is $4 (pressed 2x), A vs C stays $2 -> A +6, B -4, C -2');

console.log('Banker press: the banker pressing the group doubles every match on the hole');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  scores: scoresFor([[4], [5], [6]]),
  bankerHoles: { 0: 0 },
  bankerPresses: { 0: { group: 1, units: {} } }, // banker presses everyone
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('calcBankerMoney'), [8, -4, -4], 'every match doubles to $4 -> A +8, B -4, C -4');

console.log('Banker press: presses are multiplicative — a player press and the banker group press on one match = 4x');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  scores: scoresFor([[4], [5], [6]]), // A pars (no birdie factor); A beats B and C
  bankerHoles: { 0: 0 },
  bankerPresses: { 0: { group: 1, units: { 1: 1 } } }, // banker presses all (x2) + B presses (x2) -> A-vs-B is x4
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('calcBankerMoney'), [12, -8, -4], 'A vs B is $8 (4x: two presses double twice), A vs C is $4 (2x) -> A +12, B -8, C -4');
assertEqual(call('calcBankerMoney').reduce((a, b) => a + b, 0), 0, 'presses stay zero-sum');

console.log('Banker: the worked example — $5 base, player press -> $10, banker press -> $20, then a birdie -> $40 / eagle -> $60');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[5], [3]]), // banker A(5 bogey); B birdies (3) and beats the banker
  bankerHoles: { 0: 0 },
  bankerPresses: { 0: { group: 1, units: { 1: 1 } } }, // B pressed + banker pressed -> x4
  gameOpts: { bankerVal: 5 },
}));
// $5 base x 4 (two presses) x 2 (B's birdie wins) = $40, paid by the banker to B
assertEqual(call('calcBankerMoney'), [-40, 40], 'two presses (x4) and a birdie (x2) on a $5 base = $40 to the winner');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[5], [2]]), // same, but B makes an eagle (2)
  bankerHoles: { 0: 0 },
  bankerPresses: { 0: { group: 1, units: { 1: 1 } } },
  gameOpts: { bankerVal: 5 },
}));
// $5 base x 4 (two presses) x 3 (eagle) = $60
assertEqual(call('calcBankerMoney'), [-60, 60], 'two presses (x4) and an eagle (x3) on a $5 base = $60 to the winner');

console.log('Banker birdie/eagle: the match winner\'s gross score multiplies the bet — birdie x2, eagle x3');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[3], [5], [6]]), // banker A makes a gross birdie (3 on a par 4) and wins both matches
  bankerHoles: { 0: 0 },
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('calcBankerMoney'), [8, -4, -4], 'A birdies: each match doubles to $4 -> A +8, B -4, C -4');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[2], [5], [6]]), // banker A makes a gross eagle (2 on a par 4)
  bankerHoles: { 0: 0 },
  gameOpts: { bankerVal: 2 },
}));
assertEqual(call('calcBankerMoney'), [12, -6, -6], 'A eagles: each match triples to $6 -> A +12, B -6, C -6');

console.log('Banker birdie: the multiplier follows the match WINNER, so an opponent who beats the banker with a birdie doubles their own win');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[5], [3], [6]]), // banker A(5). B(3) birdies and beats A; C(6) loses to A
  bankerHoles: { 0: 0 },
  gameOpts: { bankerVal: 2 },
}));
// A vs B: B wins with a birdie -> $4 to B; A vs C: A wins with a bogey (no factor) -> $2 to A
assertEqual(call('calcBankerMoney'), [-2, 4, -2], 'B birdies to beat the banker for $4; A beats C for $2 -> A -2, B +4, C -2');

console.log('Banker birdie x press: score factor and press factor multiply together');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[3], [5], [6]]), // banker A birdies (x2)
  bankerHoles: { 0: 0 },
  bankerPresses: { 0: { group: 0, units: { 1: 1 } } }, // B presses (x2 on that match)
  gameOpts: { bankerVal: 2 },
}));
// A vs B: birdie(2) x press(2) = 4x -> $8; A vs C: birdie(2) x 1 = 2x -> $4
assertEqual(call('calcBankerMoney'), [12, -8, -4], 'birdie x press multiply: A vs B is $8 (4x), A vs C is $4 (2x) -> A +12, B -8, C -4');

console.log("Banker birdie: the bet doubles when EITHER side makes it — even a gross birdie by the player who loses the match on net");
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 19 }],
  gameType: 'banker',
  holeCount: 1,
  handicapMode: 'full', // B plays off 19 -> two strokes on the index-1 hole
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[3], [4]]), // banker A makes a gross birdie (3) but B (gross 4, net 2) wins the hole
  bankerHoles: { 0: 0 },
  gameOpts: { bankerVal: 2 },
}));
// A's gross birdie doubles the bet even though A loses the match: B wins $2 x 2 = $4
assertEqual(call('calcBankerMoney'), [-4, 4], "the banker's gross birdie doubles the bet (x2) though B wins on net -> B +4, A -4");

console.log('Banker (2v2v2 teams): banker team plays best-ball vs each other team; the swing splits within each team');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }, { name: 'E', hdcp: 0 }, { name: 'F', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 1,
  // Teams: [A,B]=best 4, [C,D]=best 5, [E,F]=best 6 (all par-or-worse, no score factor).
  // team0(4) beats team1(5) and team2(6) at $2/team; each side splits over its 2 members.
  scores: scoresFor([[4], [5], [5], [6], [6], [6]]),
  bankerHoles: { 0: 0 }, // team 0 (A&B) banks hole 0
  gameOpts: { bankerVal: 2, bankerTeams: true, bankerTeamRoster: [[0, 1], [2, 3], [4, 5]] },
}));
assertEqual(call('calcBankerMoney'), [2, 2, -1, -1, -1, -1], 'banker team A&B win $2 from each of the other two teams (=$4 split $2/each); each losing pair drops $1/player');

console.log('Banker: full 4-hole round settles to the exact per-player dollars, carrying the banker through a tied hole');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  gameType: 'banker',
  holeCount: 4,
  gameOpts: { bankerVal: 2 },
  scores: scoresFor([
    [4, 5, 5, 6], // A
    [5, 4, 5, 5], // B
    [6, 6, 5, 7], // C
    [5, 7, 5, 8], // D
  ]),
  bankerHoles: { 0: 0 }, // user picks A to bank the first hole
  // Scores kept par-or-worse so no birdie/eagle factor; $2/hole per match.
  // Hole 0: banker A (chosen) beats B,C,D -> A +6, others -2 each
  // Hole 1: banker A (won hole 0). A(5) loses to B(4), beats C(6) & D(7) -> A +2, B +2, C -2, D -2
  // Hole 2: banker B (won hole 1). Everyone shoots 5 -> all push; hole is tied
  // Hole 3: banker carries to B (hole 2 tied). B(5) beats A(6), C(7) & D(8) -> A -2, B +6, C -2, D -2
  // Totals: A 6+2+0-2=6, B -2+2+0+6=6, C -2-2+0-2=-6, D -2-2+0-2=-6
}));
assertEqual(call('calcBankerMoney'), [6, 6, -6, -6], 'exact settle across 4 holes with a tied hole carrying the banker forward');
assertEqual(call('calcBankerMoney').reduce((a, b) => a + b, 0), 0, 'the 4-hole banker round is zero-sum');

console.log('Banker: money is driven by NET score — a handicap stroke pushes hole 0, and the banker (carried on the tie) wins hole 1 on net');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 1 }],
  gameType: 'banker',
  holeCount: 2,
  handicapMode: 'full', // playing hdcps [0,1]; B strokes on hole 0 (stroke index 1) only
  scores: scoresFor([[4, 4], [5, 5]]),
  bankerHoles: { 0: 0 }, // A banks hole 0
  gameOpts: { bankerVal: 2 },
  // Hole 0 (idx 1): A net 4, B net 5-1=4 -> tie, push. Banker A.
  // Hole 1 (idx 2): hole 0 tied so banker carries to A. A net 4, B net 5 (no stroke) -> A wins +2/-2
}));
assertEqual(call('calcBankerMoney'), [2, -2], 'gross would tie hole 1 too; net gives A the hole because B only gets a stroke on hole 0');

console.log('Skins: money formula pays skin-holders from the field proportional to $/skin (calcSkinsMoney)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  holeCount: 3,
  scores: scoresFor([[3, 3, 5], [4, 4, 3], [5, 4, 5]]), // A wins skins on holes 0-1, B wins hole 2 -> skins=[2,1,0]
  gameOpts: { carry: false, skinVal: 5 },
}));
assertEqual(call('calcSkinsMoney'), [15, 0, -15], 'A (2 skins) nets $15, B (1 skin) breaks even, C (0 skins) pays $15 at $5/skin');

console.log('Security: esc() escapes HTML-significant characters, tolerates null/non-string input');
assertEqual(call('esc', '<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;', 'angle brackets are escaped so a payload cannot break out of innerHTML');
assertEqual(call('esc', `O'Brien "Ace" <script>`), 'O&#39;Brien &quot;Ace&quot; &lt;script&gt;', 'quotes and angle brackets are all escaped together');
assertEqual(call('esc', null), '', 'null coerces to an empty string instead of the literal "null"');
assertEqual(call('esc', undefined), '', 'undefined coerces to an empty string instead of the literal "undefined"');
assertEqual(call('esc', 42), '42', 'numbers are coerced to strings unchanged');

console.log('Reliability: safeParseJSON falls back gracefully instead of throwing on malformed storage');
assertEqual(call('safeParseJSON', '{"a":1}', []), { a: 1 }, 'valid JSON parses normally');
assertEqual(call('safeParseJSON', '{not json', []), [], 'malformed JSON returns the fallback instead of throwing');
assertEqual(call('safeParseJSON', null, {}), {}, 'null input (missing localStorage key) returns the fallback');

console.log('Reliability: mergeByName dedupes by case-insensitive name, first argument wins ties');
assertEqual(
  call('mergeByName', [{ name: 'Alice', hdcp: 5 }], [{ name: 'alice', hdcp: 99 }, { name: 'Bob', hdcp: 8 }]),
  [{ name: 'Alice', hdcp: 5 }, { name: 'Bob', hdcp: 8 }],
  'a case-insensitive name collision keeps the base array\'s entry, not the addition\'s'
);
assertEqual(call('mergeByName', [{ name: 'Alice' }], []), [{ name: 'Alice' }], 'an empty additions array leaves the base unchanged');
assertEqual(call('mergeByName', [], [{ name: 'Alice' }]), [{ name: 'Alice' }], 'an empty base array just adopts all additions');

console.log('Stableford: Quota variant subtracts each player\'s personal target before settling');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  gameType: 'stableford',
  holeCount: 1,
  pars: [4, ...Array(17).fill(4)],
  scores: scoresFor([[2], [5]]), // A: 5 pts (eagle); B: -1 pt (bogey) -- same fixture as the non-quota test
  gameOpts: { ptVal: 2, quotaEnabled: true, quotas: [3, -2] }, // A needs 3 to break even, B needs -2
}));
// effective points: A = 5-3 = 2, B = -1-(-2) = 1 -> diff = 1, at $2/pt = $2 (vs $12 without quotas)
assertEqual(call('calcStablefordMoney'), [2, -2], 'quotas shrink the gap from $12 (no quota) to $2 once each player\'s target is subtracted');

console.log('Snake: whoever holds the snake on the chronologically-last 3-putt pays the pot');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }],
  scores: { 0: {}, 1: {}, 2: {} },
  gameType: 'snake',
  holeCount: 6,
  gameOpts: { potVal: 10 },
}));
call('addBonus', 0, 1, 0); // A 3-putts hole 2
call('addBonus', 2, 4, 0); // C 3-putts hole 5 (later) -- C now holds the snake
assertEqual(call('calcSnakeMoney'), [10, 10, -20], 'C holds the snake (last 3-putt) and pays $10 to each of A and B');

console.log('Snake: no 3-putts at all means nobody owes anything');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  scores: { 0: {}, 1: {} },
  gameType: 'snake',
  holeCount: 3,
  gameOpts: { potVal: 10 },
}));
assertEqual(call('calcSnakeMoney'), [0, 0], 'a snake-less round settles at zero for everyone');

// --- Overall is an eighteen-hole bet. On nine holes the front segment IS the
// whole round, so Front and Overall used to cover identical holes and a player
// who set three $5 bets had $10 change hands on one result, with the Back 9
// stake silently dropped. A $5 nine-hole match now pays $5. ---
console.log('Nassau: on nine holes only the match settles; Overall is eighteen-hole only');
(() => {
  const two = [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }];
  const money = (H, opts) => {
    const scores = {};
    for (let p = 0; p < 2; p++) { scores[p] = {}; for (let h = 0; h < H; h++) scores[p][h] = p === 0 ? 4 : 5; }
    loadState(freshStateLiteral({ players: two, scores, pars: Array(H).fill(4),
      hdcps: Array.from({ length: H }, (_, i) => i + 1), gameType: 'nassau', holeCount: H, holeStart: 0,
      handicapMode: 'none', gameOpts: Object.assign({ press: false, pressVal: 5, nassauTeams: false }, opts) }));
    return call('calcNassauMoney');
  };
  // A wins every hole, so each live segment pays its full stake.
  assertEqual(money(9, { front: 5, back: 5, overall: 5 }), [5, -5],
    'nine holes: a $5 match pays $5, not $10 — back and overall are eighteen-hole bets');
  assertEqual(money(9, { front: 5, back: 0, overall: 0 }), [5, -5],
    'nine holes: the match alone pays the same, so the other two stakes were dead weight');
  assertEqual(money(18, { front: 5, back: 5, overall: 5 }), [15, -15],
    'eighteen holes is unchanged: front, back and overall each settle');
  assertEqual(money(18, { front: 0, back: 0, overall: 5 }), [5, -5],
    'eighteen holes: overall still settles on its own');
  const labels = (H) => { money(H, { front: 5, back: 5, overall: 5 });
    return JSON.parse(vm.runInContext('JSON.stringify(state._nassauBets)', context)).map((b) => b.label); };
  assertEqual(labels(9), ['Match'], 'nine holes builds one segment, named Match rather than Front 9');
  assertEqual(labels(18), ['Front 9', 'Back 9', 'Overall'], 'eighteen holes still builds all three');
})();

console.log('Nassau: 2v2 team best-ball mode still settles correctly after extracting settleTeamSegment (regression)');
// Eighteen holes with only three scored: the point is that BOTH the front and
// the overall bet pay a winning team, and Overall is an eighteen-hole bet, so a
// short fixture would now exercise one segment instead of two.
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  holeCount: 18,
  scores: scoresFor([
    [4, 5, 4], // team0 (A,B) best-ball per hole: 4, 5, 4
    [5, 5, 4],
    [5, 4, 5], // team1 (C,D) best-ball per hole: 5, 4, 5
    [5, 5, 5],
  ]),
  gameOpts: { front: 5, back: 0, overall: 3, press: false, nassauTeams: true, nassauTeamRoster: [[0, 1], [2, 3]] },
}));
assertEqual(call('calcNassauMoney'), [16, 16, -16, -16], 'team0 wins the hole-count 2-1 on both the front and overall bets ($5+$3 x2 members)');

console.log('Nassau: the 2v2 running-money detail names the whole leading team, not one member (Bug: dropped teammate)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  holeCount: 3,
  scores: scoresFor([
    [4, 5, 4],
    [5, 5, 4],
    [5, 4, 5],
    [5, 5, 5],
  ]),
  gameOpts: { front: 5, back: 0, overall: 3, press: false, nassauTeams: true, nassauTeamRoster: [[0, 1], [2, 3]] },
}));
call('calcNassauMoney'); // populates state._nassauBets that the detail view reads
const teamDetail = call('renderNassauDetail');
assertEqual(/A &amp; B|A & B/.test(teamDetail), true, 'team detail lists both winning-team members (A & B), not a lone player');
assertEqual(/>\s*A 1 UP\s*</.test(teamDetail), false, 'team detail no longer reports a single individual as the segment leader');

console.log('Sixes: rotating partners settle each 6-hole segment via the shared settleTeamSegment helper');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  holeCount: 18,
  // Segment 1 (holes 0-5, pairing [A,B] vs [C,D]): A/B best-ball beats C/D every hole -> team0 wins
  // Segment 2 (holes 6-11, pairing [A,C] vs [B,D]): tie every hole -> no payout
  // Segment 3 (holes 12-17, pairing [A,D] vs [B,C]): B/C best-ball beats A/D every hole -> team1 wins
  scores: scoresFor([
    [3, 3, 3, 3, 3, 3, /*seg1 A*/ 4, 4, 4, 4, 4, 4, /*seg2 A*/ 5, 5, 5, 5, 5, 5 /*seg3 A*/],
    [3, 3, 3, 3, 3, 3, /*seg1 B*/ 5, 5, 5, 5, 5, 5, /*seg2 B*/ 3, 3, 3, 3, 3, 3 /*seg3 B*/],
    [5, 5, 5, 5, 5, 5, /*seg1 C*/ 5, 5, 5, 5, 5, 5, /*seg2 C*/ 3, 3, 3, 3, 3, 3 /*seg3 C*/],
    [5, 5, 5, 5, 5, 5, /*seg1 D*/ 4, 4, 4, 4, 4, 4, /*seg2 D*/ 5, 5, 5, 5, 5, 5 /*seg3 D*/],
  ]),
  gameOpts: { sixesVal: 10 },
}));
// seg1: [A,B] (best 3) beats [C,D] (best 5) every hole -> A,B each +10 per opponent = +20; C,D each -20
// seg2: [A,C] best=min(4,5)=4 vs [B,D] best=min(5,4)=4 -> tie every hole, no payout
// seg3: [A,D] best=min(5,5)=5 vs [B,C] best=min(3,3)=3 -> [B,C] wins, B,C each +20; A,D each -20
// totals: A = +20-20 = 0; B = +20+20 = 40; C = -20+20 = 0; D = -20-20 = -40
assertEqual(call('calcSixesMoney'), [0, 40, 0, -40], 'segment 1 goes to team A/B, segment 2 ties, segment 3 goes to team B/C');

// ===== Comprehensive money-conservation regression: every game/variant is zero-sum =====
console.log('Money conservation: every game and variant nets to zero (money is only transferred, never created/destroyed)');
const _P2 = [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }];
const _P3 = [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }];
const _P4 = [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }];
function assertZeroSum(fnName, msg) {
  const r = call(fnName), s = r.reduce((x, y) => x + y, 0);
  if (Math.abs(s) < 1e-9) { pass++; console.log(`  ok - ${msg} nets to zero  [${r.join(', ')}]`); }
  else { fail++; console.log(`  FAIL - ${msg} sum=${s} not zero  [${r.join(', ')}]`); }
}

loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: scoresFor([[3], [4], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertZeroSum('calcWolfMoney', 'Wolf (partner pick)');
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: scoresFor([[3], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [], hammers: 0 } }, gameOpts: { wolfVal: 1, lone2x: true } }));
assertZeroSum('calcWolfMoney', 'Wolf (lone wolf 2x)');
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: scoresFor([[3], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [], shuck: 0, hammers: 2 } }, gameOpts: { wolfVal: 1 } }));
assertZeroSum('calcWolfMoney', 'Wolf (shuck + 2 hammers)');

// --- Wolf teams: every player stakes the same point amount; there is no doubling for the
// smaller team. base = wolfVal x hammer/blind/birdie (or the Home Screen wolfTeamVal/fieldVal
// when set). Losers pay their stake; the winners split the pot in whole dollars (odd dollar
// goes to the lowest-index winners). Balanced teams => +/-point per player. ---
console.log('Wolf: balanced holes = the point; uneven holes stake the point with no smaller-team doubling (calcWolfMoney)');
const _W5 = [..._P4, { name: 'E', hdcp: 0 }];
const _W6 = [..._W5, { name: 'F', hdcp: 0 }];
const _W7 = [..._W6, { name: 'G', hdcp: 0 }];
const _W8 = [..._W7, { name: 'H', hdcp: 0 }];
function assertWolf(expected, msg) {
  const r = call('calcWolfMoney');
  const same = Array.isArray(r) && r.length === expected.length && r.every((v, i) => Math.abs(v - expected[i]) < 1e-9);
  const whole = r.every((v) => Number.isInteger(v));
  if (same && whole) { pass++; console.log(`  ok - ${msg}  [${r.join(', ')}]`); }
  else { fail++; console.log(`  FAIL - ${msg}${whole ? '' : ' (non-integer payout!)'}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(r)}`); }
}
// 5-player 2v3: wolf(0)+partner(1) vs field(2,3,4).
// three (majority) lose -> each pays the base $1; the winning pair splits the $3 pot -> +2/+1.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([2, 1, -1, -1, -1], '5p 2v3: three lose -> each pays base $1; winning pair splits the $3 pot (+2/+1)');
// pair (outnumbered) lose -> each pays the point $1 (no doubling); the three split the $2 pot -> +1/+1/+0.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[5], [5], [4], [4], [4]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([-1, -1, 1, 1, 0], '5p 2v3: pair lose -> each pays the point $1 (no doubling); the three split the $2 pot');
// $5 point, pair wins: the three each pay the base $5; the pair split the $15 pot -> +8/+7.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 5 } }));
assertWolf([8, 7, -5, -5, -5], '5p 2v3 $5: three each -$5 (base); winning pair splits $15 -> +8/+7');
// $5 point, pair loses: the pair each pay the point $5 (no doubling); the three split the $10 pot -> +4/+3/+3.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[5], [5], [4], [4], [4]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 5 } }));
assertWolf([-5, -5, 4, 3, 3], '5p 2v3 $5: pair each -$5 (no doubling); the three split $10 -> +4/+3/+3');
// Blind pick (x2) scales the base: three each -$2, pair split the $6 pot -> +3/+3.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], blindPick: true, hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([3, 3, -2, -2, -2], '5p 2v3 blind pick: base x2');
// One hammer (x2) scales the base.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 1 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([3, 3, -2, -2, -2], '5p 2v3 one hammer: base x2');
// Birdie (x2) on the winning pair.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[3], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([3, 3, -2, -2, -2], '5p 2v3 birdie win: base x2');
// 6-player balanced 3v3 -> each player wins/loses the point (no doubling).
loadState(freshStateLiteral({ players: _W6, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1, 2], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([1, 1, 1, -1, -1, -1], '6p 3v3 balanced: each player wins/loses the point');
// 6-player 2v4: four each -$1 (base); pair split the $4 pot -> +2/+2 (divides evenly).
loadState(freshStateLiteral({ players: _W6, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [5], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([2, 2, -1, -1, -1, -1], '6p 2v4: four each -$1; pair split the $4 pot -> +2/+2');
// 7-player 3v4 and 8-player 3v5 (odd dollar to the lowest-index winners).
loadState(freshStateLiteral({ players: _W7, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [4], [5], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1, 2], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([2, 1, 1, -1, -1, -1, -1], '7p 3v4: four each -$1; trio split the $4 pot -> +2/+1/+1');
assertZeroSum('calcWolfMoney', 'Wolf 7p 3v4');
loadState(freshStateLiteral({ players: _W8, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [4], [5], [5], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1, 2], hammers: 0 } }, gameOpts: { wolfVal: 1 } }));
assertWolf([2, 2, 1, -1, -1, -1, -1, -1], '8p 3v5: five each -$1; trio split the $5 pot -> +2/+2/+1');
assertZeroSum('calcWolfMoney', 'Wolf 8p 3v5');

// --- Concede: a team can give up the hole; the other team wins at the current
// stakes (blind/lone/hammer multipliers apply, but no birdie/eagle bonus), and
// the payout is awarded even when no scores have been entered for the hole. ---
console.log('Wolf: a team can concede the hole and the other team is paid without needing scores (calcWolfMoney)');
// 4p 2v2, wolf pack concedes with NO scores entered -> field wins the point.
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0, conceded: 'wolf' } }, gameOpts: { wolfVal: 1 } }));
assertWolf([-1, -1, 1, 1], '4p 2v2 wolf concedes (no scores): pack pays the point, field wins');
// 4p 2v2, field concedes -> wolf pack wins the point.
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0, conceded: 'sheep' } }, gameOpts: { wolfVal: 1 } }));
assertWolf([1, 1, -1, -1], '4p 2v2 field concedes: pack wins the point');
// Hammer multiplier still applies to a conceded hole (1 hammer = 2x).
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 1, conceded: 'wolf' } }, gameOpts: { wolfVal: 1 } }));
assertWolf([-2, -2, 2, 2], '4p 2v2 wolf concedes with 1 hammer: stakes doubled');
// Lone wolf concedes (lone2x) -> lone pays each of the 3 opponents at 2x base.
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [], hammers: 0, conceded: 'wolf' } }, gameOpts: { wolfVal: 1, lone2x: true } }));
assertWolf([-6, 2, 2, 2], 'lone wolf concedes at 2x: pays 2 to each of the 3 field players');
// Shuck concede: the shucker concedes and pays every opponent at the 2x shuck stake.
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [], shuck: 0, hammers: 0, conceded: 'wolf' } }, gameOpts: { wolfVal: 1 } }));
assertWolf([-6, 2, 2, 2], 'shuck concede: shucker pays 2 to each of the 3 opponents');
// 5p 2v3 concede uses the point amount with no smaller-team doubling (pair concedes -> pays $1 each).
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0, conceded: 'wolf' } }, gameOpts: { wolfVal: 1 } }));
assertWolf([-1, -1, 1, 1, 0], '5p 2v3 pair concedes: pair pays the point $1 (no doubling), the three split the pot');
assertZeroSum('calcWolfMoney', 'Wolf concede zero-sum (5p 2v3)');
// A conceded field (majority) still stakes the base $1 each while the pair splits the pot.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0, conceded: 'sheep' } }, gameOpts: { wolfVal: 1 } }));
assertWolf([2, 1, -1, -1, -1], '5p 2v3 field concedes: three each pay $1, winning pair splits the $3 pot');

// --- A betting hole needs somebody on both sides of it. -------------------
// With a two-player roster the wolf can take the only opponent as partner,
// which leaves the field empty. Scoring such a hole paid nobody (harmless),
// but CONCEDING it charged both players with nobody to collect -- $10 simply
// destroyed on a 2-player $5 hole. The fixed-pairs code paths already guarded
// an empty field; the ordinary ones did not.
console.log('Wolf: a hole with an empty side settles nothing (calcWolfMoney)');
(() => {
  const one = { holeCount: 1, handicapMode: 'none', pars: Array(18).fill(4),
    hdcps: Array.from({ length: 18 }, (_, i) => i + 1), gameType: 'wolf' };
  [['conceded', { wolf: 0, partners: [1], hammers: 0, conceded: 'wolf' }],
   ['conceded by field', { wolf: 0, partners: [1], hammers: 0, conceded: 'field' }],
   ['scored', { wolf: 0, partners: [1], hammers: 0 }]].forEach(([label, wh]) => {
    loadState(freshStateLiteral(Object.assign({}, one, { players: _P2,
      scores: scoresFor([[4], [5]]), wolfHoles: { 0: wh }, gameOpts: { wolfVal: 5 } })));
    const r = call('calcWolfMoney'), sum = r.reduce((a, b) => a + b, 0);
    if (Math.abs(sum) < 1e-9) { pass++; console.log(`  ok - 2p wolf+partner, ${label}: nets to zero  [${r.join(', ')}]`); }
    else { fail++; console.log(`  FAIL - 2p wolf+partner, ${label}: sum=${sum}  [${r.join(', ')}]`); }
  });
})();

// --- Vegas needs four seats. ----------------------------------------------
// The team pairing defaults to [[0,1],[2,3]]. On a shorter roster those
// missing seats made every combined number NaN, which spread to every payout
// and was persisted, and writing a[2]/a[3] grew the result past the roster.
// Setup refuses a Vegas round without exactly four players, but a stored round
// whose roster no longer matches still reaches the calculator.
console.log('Vegas: a roster that does not cover both teams settles nothing (calcVegasMoney)');
[2, 3].forEach((n) => {
  const players = Array.from({ length: n }, (_, i) => ({ name: String.fromCharCode(65 + i), hdcp: 0 }));
  loadState(freshStateLiteral({ players, gameType: 'vegas', holeCount: 1, handicapMode: 'none',
    pars: Array(18).fill(4), hdcps: Array.from({ length: 18 }, (_, i) => i + 1),
    scores: scoresFor(players.map((_, i) => [4 + i])), gameOpts: { vegasVal: 1 } }));
  const r = call('calcVegasMoney');
  const ok = r.length === n && r.every((v) => Number.isFinite(v)) && Math.abs(r.reduce((a, b) => a + b, 0)) < 1e-9;
  if (ok) { pass++; console.log(`  ok - ${n} players: finite, roster-sized, nets to zero  [${r.join(', ')}]`); }
  else { fail++; console.log(`  FAIL - ${n} players: [${r.join(', ')}] (length ${r.length}, expected ${n})`); }
});

// --- Nassau automatic presses fire once per 2-down event, not once per hole. ---
// A press starts one new bet for the rest of the segment when a player goes 2
// down. The trigger used to be level-based, so a player who merely STAYED 2
// down minted a fresh press every remaining hole, and two players down on the
// same hole pushed two identical segments that each settled. A $5 Nassau with
// $5 presses produced $375 of action against a $30 base. It stays zero-sum
// either way -- the bug is that nobody agreed to those stakes.
console.log('Nassau: an automatic press fires once per 2-down event (calcNassauMoney)');
(() => {
  const nine = { holeCount: 9, holeStart: 0, handicapMode: 'none',
    pars: Array(18).fill(4), hdcps: Array.from({ length: 18 }, (_, i) => i + 1) };
  // A pars every hole; B bogeys; C and D double. Everyone trails A by 2+.
  const cards = scoresFor([Array(9).fill(4), Array(9).fill(5), Array(9).fill(6), Array(9).fill(6)]);
  const run = (press) => {
    loadState(freshStateLiteral(Object.assign({}, nine, { players: _P4, gameType: 'nassau',
      scores: cards, gameOpts: { front: 5, back: 5, overall: 5, press, pressVal: 5 } })));
    return call('calcNassauMoney');
  };
  const off = run(false), on = run(true);
  const sum = on.reduce((a, b) => a + b, 0);
  const added = on[0] - off[0];
  // Count the press bets rather than compare dollars. The bug this guards is
  // "a press re-fires every hole you stay 2 down", which is a statement about
  // how many bets exist, so assert that directly. The old bound compared the
  // press total against the base, which quietly depended on a nine-hole round
  // charging both Front and Overall for the same nine holes -- once Overall
  // became eighteen-hole-only the base halved and the bound broke, though the
  // presses themselves never changed.
  const presses = JSON.parse(vm.runInContext('JSON.stringify(state._nassauBets)', context)).filter((b) => b.isPress);
  if (Math.abs(sum) < 1e-9) { pass++; console.log(`  ok - pressed Nassau still nets to zero  [${on.join(', ')}]`); }
  else { fail++; console.log(`  FAIL - pressed Nassau sum=${sum}  [${on.join(', ')}]`); }
  // Three players trail A, so at most three presses can ever open. The
  // avalanche opened one per player per remaining hole (~$345 of action).
  if (presses.length <= _P4.length - 1) { pass++; console.log(`  ok - ${presses.length} presses opened on a 9-hole front, one per 2-down event (was one per hole)`); }
  else { fail++; console.log(`  FAIL - ${presses.length} press bets opened, more than one per player - per-hole re-trigger is back`); }
  if (added === presses.length * off[0]) { pass++; console.log(`  ok - presses add $${added}: ${presses.length} x the $${off[0]} base match`); }
  else { fail++; console.log(`  FAIL - presses added $${added}, not ${presses.length} x the $${off[0]} base`); }
})();

// --- Fractional stakes must not invent money. The uneven split pays in whole
// dollars while the pot is whole dollars (asserted above), but the stake inputs
// take decimals -- $2.50/point is an ordinary bet. The split used to floor the
// pot to dollars and then treat the leftover DOLLARS as a COUNT of winners, so
// 2 winners over 3 losers at $2.50 paid out $8 against $7.50 collected: fifty
// cents conjured on every uneven hole, all round. A fractional pot splits in
// cents instead, and stays exactly zero-sum. ---
console.log('Wolf: uneven teams stay zero-sum on fractional stakes (no money invented)');
[
  [2.5, '2.50'], [1.5, '1.50'], [3.33, '3.33'], [0.25, '0.25'], [7.5, '7.50'],
].forEach(([val, label]) => {
  // 5 players, 2v3: three losers pay `val` each, the winning pair split the pot.
  loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[3], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: val } }));
  const r = call('calcWolfMoney'), sum = r.reduce((x, y) => x + y, 0);
  if (Math.abs(sum) < 1e-9) { pass++; console.log(`  ok - $${label}/point 2v3 nets to zero  [${r.join(', ')}]`); }
  else { fail++; console.log(`  FAIL - $${label}/point 2v3 sum=${sum} not zero  [${r.join(', ')}]`); }
});

// --- Uneven teams: the per-player stake for each side is configurable via
// gameOpts.wolfTeamVal (the smaller/outnumbered team) and gameOpts.fieldVal
// (the larger team), set from the two Home Screen inputs. The losing side pays
// its per-player amount (x hammer/blind/birdie multipliers); the winners split
// the pot. When the opts are absent both sides default to wolfVal (no smaller-team
// doubling), so all the tests above still hold. ---
console.log('Wolf: uneven-team payouts honor configurable wolfTeamVal (smaller) / fieldVal (larger) (calcWolfMoney)');
// 5p 2v3, wolfTeamVal=3 (pair), fieldVal=2 (the three). Pair (smaller) wins:
// the three each pay fieldVal $2 -> $6 pot, the pair split it -> +3/+3.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[4], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1, wolfTeamVal: 3, fieldVal: 2 } }));
assertWolf([3, 3, -2, -2, -2], '5p 2v3: pair win -> the three each pay fieldVal $2; pair split the $6 pot -> +3/+3');
assertZeroSum('calcWolfMoney', 'Wolf uneven configurable (pair win)');
// Same opts, pair (smaller) loses: each pays wolfTeamVal $3 -> $6 pot, the three split it -> +2/+2/+2.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[5], [5], [4], [4], [4]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1, wolfTeamVal: 3, fieldVal: 2 } }));
assertWolf([-3, -3, 2, 2, 2], '5p 2v3: pair lose -> each pays wolfTeamVal $3; the three split the $6 pot -> +2/+2/+2');
// Birdie (x2) scales the configured field amount: pair birdie -> the three each pay $4, pair split $12 -> +6/+6.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: scoresFor([[3], [4], [5], [5], [5]]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, gameOpts: { wolfVal: 1, wolfTeamVal: 3, fieldVal: 2 } }));
assertWolf([6, 6, -4, -4, -4], '5p 2v3: pair birdie -> fieldVal $2 doubled to $4 each; pair split the $12 pot -> +6/+6');
// Configurable amounts also apply to a conceded uneven hole: pair concedes -> each pays wolfTeamVal $3.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf', holeCount: 1, scores: {}, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0, conceded: 'wolf' } }, gameOpts: { wolfVal: 1, wolfTeamVal: 3, fieldVal: 2 } }));
assertWolf([-3, -3, 2, 2, 2], '5p 2v3 pair concedes: each pays wolfTeamVal $3; the three split the $6 pot');
assertZeroSum('calcWolfMoney', 'Wolf uneven configurable concede zero-sum');

// --- The two uneven-team dollar fields (opt-wolf-team-val / opt-wolf-field-val) are
// only shown, and only read into gameOpts, when the roster is odd and >= 5 players
// (5 or 7) so Wolf teams are necessarily uneven. wolfTeamsUneven() drives both the
// Home Screen field visibility (syncWolfUnevenOpts) and the readGameOpts gate. For
// even rosters the fields are absent from gameOpts, so calcWolfMoney falls back to the
// default where both sides stake wolfVal (no smaller-team doubling). ---
console.log('Wolf: uneven-team dollar fields are gated on odd rosters of 5+ (wolfTeamsUneven / readGameOpts)');
[[_P4, false, '4'], [_W5, true, '5'], [_W6, false, '6'], [_W7, true, '7'], [_W8, false, '8']].forEach(([roster, expected, n]) => {
  loadState(freshStateLiteral({ players: roster, gameType: 'wolf' }));
  assertEqual(call('wolfTeamsUneven'), expected, `${n} players -> wolfTeamsUneven() === ${expected}`);
});
// readGameOpts: odd roster (5) reads the two fields (defaults from blank mocked inputs: 2 / 1);
// even roster (4) leaves them undefined so the calc uses the classic default.
loadState(freshStateLiteral({ players: _W5, gameType: 'wolf' }));
const _goOdd = call('readGameOpts');
assertEqual([_goOdd.wolfTeamVal, _goOdd.fieldVal], [2, 1], '5 players: readGameOpts sets wolfTeamVal/fieldVal');
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf' }));
const _goEven = call('readGameOpts');
assertEqual([_goEven.wolfTeamVal ?? null, _goEven.fieldVal ?? null], [null, null], '4 players: readGameOpts leaves wolfTeamVal/fieldVal unset (both sides default to wolfVal)');

// Per-hole money attribution must reflect a concede. computeHoleMoney diffs money
// with vs. without a hole's scores; since concede money is awarded independently of
// scores, the baseline must also drop the concede flag or the hole shows $0 (Bug:
// "money doesn't get awarded to the winning team" in the per-hole log / result popup).
console.log('Wolf concede: computeHoleMoney attributes the concede award to the hole (not $0)');
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, scores: { 0: [], 1: [], 2: [], 3: [] }, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0, conceded: 'sheep' } }, gameOpts: { wolfVal: 5 } }));
const _chm = call('computeHoleMoney');
const _chmDeltas = Array.isArray(_chm) && _chm.length === 1 && _chm[0] ? _chm[0].deltas : _chm;
assertEqual(_chmDeltas, [5, 5, -5, -5], 'computeHoleMoney: field concedes -> conceded hole shows wolf pack +$5 each (not $0)');

// --- Deselecting a Wolf partner returns to "no pick", not silent Lone Wolf ---
console.log('Wolf: deselecting the last partner reopens the picker (partners:undefined), not Lone Wolf (partners:[])');
// toggleWolfPartner ends by calling renderHole() (DOM-heavy) and gates on canMutateRound()
// (which is `!isSpectator`); stub the render and ensure we're not in spectator mode.
vm.runInContext('renderHole=function(){};isSpectator=false;', context);
function wolfPartners0() { return JSON.parse(vm.runInContext('JSON.stringify(state.wolfHoles[0]&&state.wolfHoles[0].partners===undefined?"__undef__":state.wolfHoles[0].partners)', context)); }
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, wolfHoles: {}, gameOpts: { wolfVal: 1 } }));
call('toggleWolfPartner', 0, 1);
assertEqual(wolfPartners0(), [1], 'selecting player 1 as partner sets partners:[1]');
call('toggleWolfPartner', 0, 1); // deselect the same player
assertEqual(wolfPartners0(), '__undef__', 'deselecting the only partner resets partners to undefined (picker stays), not []');
assertEqual(call('wolfPickMissing', 0), true, 'after deselect the hole is flagged as needing a pick');
// 6-player: deselecting one of two partners keeps the other
loadState(freshStateLiteral({ players: _W6, gameType: 'wolf', holeCount: 1, wolfHoles: {}, gameOpts: { wolfVal: 1 } }));
call('toggleWolfPartner', 0, 1);
call('toggleWolfPartner', 0, 2);
assertEqual(wolfPartners0(), [1, 2], '6p: two partners selected');
call('toggleWolfPartner', 0, 1); // deselect one
assertEqual(wolfPartners0(), [2], '6p: deselecting one of two partners keeps the other, not undefined');

loadState(freshStateLiteral({ players: _P2, gameType: 'nassau', holeCount: 6, scores: scoresFor([[4, 4, 5, 4, 5, 4], [5, 5, 4, 5, 4, 5]]), gameOpts: { front: 5, back: 0, overall: 3, press: false } }));
assertZeroSum('calcNassauMoney', 'Nassau (individual)');
loadState(freshStateLiteral({ players: _P4, gameType: 'nassau', holeCount: 3, scores: scoresFor([[4, 5, 4], [5, 5, 4], [5, 4, 5], [5, 5, 5]]), gameOpts: { front: 5, back: 0, overall: 3, press: false, nassauTeams: true, nassauTeamRoster: [[0, 1], [2, 3]] } }));
assertZeroSum('calcNassauMoney', 'Nassau (2v2 team)');

loadState(freshStateLiteral({ players: _P3, gameType: 'skins', holeCount: 3, scores: scoresFor([[3, 3, 5], [4, 4, 3], [5, 4, 5]]), gameOpts: { carry: false, skinVal: 5 } }));
assertZeroSum('calcSkinsMoney', 'Skins (no carry)');
loadState(freshStateLiteral({ players: _P3, gameType: 'skins', holeCount: 3, scores: scoresFor([[4, 3, 4], [4, 4, 4], [4, 4, 4]]), gameOpts: { carry: true, skinVal: 5 } }));
assertZeroSum('calcSkinsMoney', 'Skins (carryover)');
assertEqual(call('calcSkinsMoney').map((v) => Math.round(v * 100) / 100), [20, -10, -10], 'Skins carry: A sweeps holes 0-1 for 2 skins ($20); the hole-2 all-3 tie carry splits evenly (money-neutral, at cent precision) so B/C still each pay $10');

// Unresolved carry that ends on a *subset* tie is split among just those tied leaders.
loadState(freshStateLiteral({ players: _P3, gameType: 'skins', holeCount: 2, scores: scoresFor([[4, 3], [4, 3], [4, 5]]), gameOpts: { carry: true, skinVal: 5 } }));
assertZeroSum('calcSkinsMoney', 'Skins (unresolved carry, subset tie)');
assertEqual(call('calcSkins'), [1, 1, 0], 'hole 0 ties (carry), hole 1 A&B tie for low -> the 2-skin carry pot splits between A and B, C never contended');
assertEqual(call('calcSkinsMoney'), [5, 5, -10], 'A and B each net $5 from the split carry; C pays $10');

loadState(freshStateLiteral({ players: _P2, gameType: 'match', holeCount: 3, scores: scoresFor([[4, 5, 4], [5, 4, 4]]), gameOpts: { matchFormat: 'perhole', holeVal: 2 } }));
assertZeroSum('calcMatchMoney', 'Match (per-hole)');
loadState(freshStateLiteral({ players: _P2, gameType: 'match', holeCount: 3, scores: scoresFor([[4, 4, 4], [5, 5, 4]]), gameOpts: { matchFormat: 'nassau', matchFront: 1, matchBack: 1, matchOverall: 2 } }));
assertZeroSum('calcMatchMoney', 'Match (nassau format)');

loadState(freshStateLiteral({ players: _P2, gameType: 'stableford', holeCount: 1, pars: [4, ...Array(17).fill(4)], scores: scoresFor([[2], [5]]), gameOpts: { ptVal: 2 } }));
assertZeroSum('calcStablefordMoney', 'Stableford');
loadState(freshStateLiteral({ players: _P2, gameType: 'stableford', holeCount: 1, pars: [4, ...Array(17).fill(4)], scores: scoresFor([[2], [5]]), gameOpts: { ptVal: 2, quotaEnabled: true, quotas: [3, -2] } }));
assertZeroSum('calcStablefordMoney', 'Stableford (quota)');

loadState(freshStateLiteral({ players: _P4, gameType: 'vegas', holeCount: 1, scores: scoresFor([[4], [4], [5], [6]]), gameOpts: { vegasTeams: [[0, 1], [2, 3]], vegasVal: 1, vegasFlip: false } }));
assertZeroSum('calcVegasMoney', 'Vegas');

loadState(freshStateLiteral({ players: _P3, gameType: 'bingo', scores: { 0: {}, 1: {}, 2: {} }, gameOpts: { ptVal: 1 } }));
call('addBonus', 0, 0, 0); call('addBonus', 0, 0, 1); call('addBonus', 0, 0, 2); call('addBonus', 1, 1, 0); // A=3 pts, B=1 pt, C=0
assertZeroSum('calcBonusMoney', 'Bingo-Bango-Bongo (unequal points)');
assertEqual(call('calcBonusMoney'), [5, -1, -4], 'bingo pairwise: A(3) collects the point-diff from B(1) and C(0) at $1/pt');
loadState(freshStateLiteral({ players: _P4, gameType: 'dots', scores: { 0: {}, 1: {}, 2: {}, 3: {} }, gameOpts: { dotVal: 2 } }));
call('addBonus', 0, 0, 0); call('addBonus', 0, 0, 1); call('addBonus', 2, 1, 0);
assertZeroSum('calcBonusMoney', 'Dots (multi-category)');

loadState(freshStateLiteral({ players: _P3, gameType: 'snake', scores: { 0: {}, 1: {}, 2: {} }, holeCount: 6, gameOpts: { potVal: 10 } }));
call('addBonus', 0, 1, 0); call('addBonus', 2, 4, 0);
assertZeroSum('calcSnakeMoney', 'Snake');

loadState(freshStateLiteral({ players: _P4, gameType: 'sixes', holeCount: 18, scores: scoresFor([
  [3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5],
  [3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3],
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3],
  [5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5],
]), gameOpts: { sixesVal: 10 } }));
assertZeroSum('calcSixesMoney', 'Sixes (rotating partners)');

// ===== Setup guards: games with a fixed team size must reject wrong player counts =====
console.log('Setup guards: Sixes and Vegas require exactly 4 players (no silently-$0 rounds)');
loadState(freshStateLiteral({ players: _P3, gameType: 'sixes' }));
assertEqual(call('sixesSetupValid'), false, 'Sixes with 3 players is rejected at setup');
const _P5 = [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }, { name: 'E', hdcp: 0 }];
loadState(freshStateLiteral({ players: _P5, gameType: 'sixes' }));
assertEqual(call('sixesSetupValid'), false, 'Sixes with 5 players is rejected at setup');
loadState(freshStateLiteral({ players: _P4, gameType: 'sixes' }));
assertEqual(call('sixesSetupValid'), true, 'Sixes with exactly 4 players is allowed');
loadState(freshStateLiteral({ players: _P2, gameType: 'nassau' }));
assertEqual(call('sixesSetupValid'), true, 'sixesSetupValid is a no-op when the game is not Sixes');
loadState(freshStateLiteral({ players: _P3, gameType: 'vegas' }));
assertEqual(call('vegasSetupValid'), false, 'Vegas with 3 players is rejected at setup');
loadState(freshStateLiteral({ players: _P5, gameType: 'vegas' }));
assertEqual(call('vegasSetupValid'), false, 'Vegas with 5 players is rejected (the 5th would be silently dropped from the teams)');

// ===== Cent-accurate settlement: rounded nets stay whole cents and total exactly zero =====
console.log('Settlement: roundNetsToCents rounds to whole cents while preserving an exact $0 total');
const rcThirds = call('roundNetsToCents', [10 / 3, 10 / 3, 10 / 3, -10]);
assertEqual(rcThirds, [3.34, 3.33, 3.33, -10], 'a $10 pot split three ways rounds to cents that still total exactly $0');
assertEqual(Math.abs(rcThirds.reduce((x, y) => x + y, 0)) < 1e-9, true, 'the rounded thirds sum to exactly zero');
const rcHalves = call('roundNetsToCents', [5.5, 5.5, -5.5, -5.5]);
assertEqual(rcHalves, [5.5, 5.5, -5.5, -5.5], 'values already on a cent boundary are returned unchanged');
const rcMessy = call('roundNetsToCents', [1 / 3, 1 / 3, 1 / 3, 2 / 3, -5 / 3]);
assertEqual(rcMessy.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9), true, 'every returned value is a whole number of cents');
assertEqual(Math.abs(rcMessy.reduce((x, y) => x + y, 0)) < 1e-9, true, 'a messy fractional vector still reconciles to exactly zero');
assertEqual(call('roundNetsToCents', []), [], 'an empty net vector is handled without throwing');

// ===== Nassau auto-press generation + payout (previously untested path) =====
console.log('Nassau: an auto-press is generated when a player falls 2 down, then pays out on the pressed holes');
const nassauPressOpts = { front: 5, back: 0, overall: 0, pressVal: 5 };
loadState(freshStateLiteral({
  players: _P2, gameType: 'nassau', holeCount: 3,
  scores: scoresFor([[6, 3, 3], [4, 4, 4]]), // A loses hole 0 (2 down -> press), then wins holes 1 & 2
  gameOpts: Object.assign({ press: true }, nassauPressOpts),
}));
assertEqual(call('calcNassauMoney'), [10, -10], 'A wins the $5 front bet (2 holes to 1) plus the $5 auto-press on holes 1-2 = $10');
loadState(freshStateLiteral({
  players: _P2, gameType: 'nassau', holeCount: 3,
  scores: scoresFor([[6, 3, 3], [4, 4, 4]]),
  gameOpts: Object.assign({ press: false }, nassauPressOpts),
}));
assertEqual(call('calcNassauMoney'), [5, -5], 'with presses off, the identical round pays only the $5 front bet');

// ===== Spectator mode: mutation guards make watching strictly read-only =====
console.log('Spectator: mutation guards block scoring changes while watching');
assertEqual(call('canMutateRound'), true, 'canMutateRound defaults to true (not spectating)');
loadState(freshStateLiteral({ players: _P2, gameType: 'bingo', scores: { 0: {}, 1: {} }, gameOpts: { ptVal: 1 } }));
vm.runInContext('isSpectator=true', context);
assertEqual(call('canMutateRound'), false, 'canMutateRound flips false while spectating');
call('addBonus', 0, 0, 0);
assertEqual(call('getBonusCount', 0, 0), 0, 'addBonus is a no-op for spectators');
vm.runInContext('isSpectator=false', context);
call('addBonus', 0, 0, 0);
assertEqual(call('getBonusCount', 0, 0), 1, 'addBonus works again once no longer spectating');
assertEqual(typeof context.appConfirm === 'function' && typeof context.appPrompt === 'function', true, 'themed appConfirm/appPrompt dialog helpers are defined');
assertEqual(typeof context.startSpectator === 'function' && typeof context.exitSpectator === 'function', true, 'spectator entry/exit functions are defined');

// ===== Wolf pick guard: unpicked wolf holes are detectable =====
console.log('Wolf: wolfPickMissing flags holes where the wolf never made a decision');
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 3, wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 }, 1: { wolf: 1, hammers: 0 } } }));
assertEqual(call('wolfPickMissing', 0), false, 'a hole with a partner pick is not flagged');
assertEqual(call('wolfPickMissing', 1), true, 'a hole where only a hammer/entry exists but partners is undefined is flagged');
assertEqual(call('wolfPickMissing', 2), true, 'a hole with no wolfHoles entry at all is flagged');
loadState(freshStateLiteral({ players: _P4, gameType: 'wolf', holeCount: 1, wolfHoles: { 0: { wolf: 0, partners: [], hammers: 0 } } }));
assertEqual(call('wolfPickMissing', 0), false, 'lone wolf (partners: []) counts as a made decision');
loadState(freshStateLiteral({ players: _P2, gameType: 'skins', holeCount: 1 }));
assertEqual(call('wolfPickMissing', 0), false, 'non-wolf games are never flagged');

// ===== Bonus tap-off: removeBonusCategory un-awards a single category =====
console.log('Bonus: removeBonusCategory removes one category without touching the rest');
loadState(freshStateLiteral({ players: _P2, gameType: 'bingo', scores: { 0: {}, 1: {} }, gameOpts: { ptVal: 1 } }));
call('addBonus', 0, 0, 0);
call('addBonus', 0, 0, 1);
assertEqual(call('getBonusCount', 0, 0), 2, 'two categories awarded');
call('removeBonusCategory', 0, 0, 1);
assertEqual(call('getBonusCount', 0, 0), 1, 'removing category 1 leaves category 0 intact');
assertEqual(call('isBonusAwarded', 0, 0, 0), true, 'category 0 still awarded');
assertEqual(call('isBonusAwarded', 0, 0, 1), false, 'category 1 no longer awarded');
call('removeBonusCategory', 0, 0, 1);
assertEqual(call('getBonusCount', 0, 0), 1, 'removing an unawarded category is a no-op');

// --- computeRunningTotals: cumulative per-player money after each completed hole ---
console.log('computeRunningTotals: cumulative money per hole (feeds the money-flow chart)');
loadState(freshStateLiteral({
  players: _P4,
  gameType: 'skins',
  holeCount: 3,
  scores: { 0: [3, 4, 4], 1: [4, 4, 3], 2: [4, 4, 4], 3: [4, 4, 4] },
  gameOpts: { skinVal: 1, skinsCarry: true },
}));
const _rt = call('computeRunningTotals');
assertEqual(_rt.map((r) => r.h), [0, 1, 2], 'one row per completed hole, in order');
assertEqual(_rt[_rt.length - 1].totals, call('calcMoney'), 'last row totals equal calcMoney() net');
const _sum = _rt[_rt.length - 1].totals.reduce((a, b) => a + b, 0);
assertEqual(Math.abs(_sum) < 0.005, true, 'running totals stay zero-sum');

// Segment-settled games (team Nassau) must still end exactly at calcMoney():
// running totals are exact prefixes, not summed per-hole diffs.
loadState(freshStateLiteral({ players: _P4, gameType: 'nassau', holeCount: 3, scores: scoresFor([[4, 5, 4], [5, 5, 4], [5, 4, 5], [5, 5, 5]]), gameOpts: { front: 5, back: 0, overall: 3, press: false, nassauTeams: true, nassauTeamRoster: [[0, 1], [2, 3]] } }));
const _rtN = call('computeRunningTotals');
assertEqual(_rtN[_rtN.length - 1].totals, call('calcMoney').map((v) => +v.toFixed(2)), 'team Nassau: final running totals equal calcMoney()');
assertEqual(JSON.parse(vm.runInContext('JSON.stringify(state.scores)', context))[0][2], 4, 'scores restored after running-total computation');

// --- computeHoleMoney: segment-settled Nassau must attribute money hole-by-hole ---
// The leave-one-out holeDelta returns 0 for every hole of a segment bet (removing
// one hole rarely flips the segment winner), so the Hole-by-Hole Money table read
// all zeros while real money moved. Team Nassau must show the swing, keep teammates
// moving together, stay zero-sum per hole, and total to calcMoney().
console.log('computeHoleMoney: 2v2 team Nassau attributes money hole-by-hole (not all zeros)');
loadState(freshStateLiteral({
  players: _P4,
  gameType: 'nassau',
  holeCount: 6,
  scores: scoresFor([[4, 5, 4, 4, 5, 4], [5, 4, 5, 5, 4, 5], [4, 6, 4, 4, 6, 4], [6, 5, 6, 6, 5, 6]]),
  gameOpts: { front: 5, back: 0, overall: 3, press: false, nassauTeams: true, nassauTeamRoster: [[0, 2], [1, 3]] },
}));
const _final = call('calcNassauMoney');
const _hm = call('computeHoleMoney');
const _colTot = [0, 0, 0, 0];
_hm.forEach(({ deltas }) => deltas.forEach((v, i) => { _colTot[i] += v; }));
assertEqual(_hm.some(({ deltas }) => deltas.some((v) => Math.abs(v) > 0.005)), true, 'at least one hole shows money moving (table is not all zeros)');
assertEqual(_hm.every(({ deltas }) => Math.abs(deltas[0] - deltas[2]) < 1e-9 && Math.abs(deltas[1] - deltas[3]) < 1e-9), true, 'teammates (0&2, 1&3) move together on every hole');
assertEqual(_hm.every(({ deltas }) => Math.abs(deltas.reduce((a, b) => a + b, 0)) < 1e-9), true, 'each hole is zero-sum');
assertEqual(_colTot.map((v) => +v.toFixed(2)), _final.map((v) => +v.toFixed(2)), 'hole-by-hole columns total to the final Nassau money');
// The per-hole result overlay reuses computeHoleMoney to show the swing; make sure
// the segment-aware money block renders for team Nassau without throwing.
let _shrOk = true;
try { call('showHoleResult', 5, [0, 0, 0, 0]); } catch (_e) { _shrOk = false; }
assertEqual(_shrOk, true, 'showHoleResult renders a team Nassau hole (with money-swing block) without throwing');

// computeHoleMoney must be additive for EVERY game, so the scorecard OUT/IN/TOT
// columns reconcile with the running-money banner. These previously failed:
// Sixes settles per 6-hole segment (all-zero holeDelta), and Skins carry-overs
// make a leave-one-out diff non-additive.
function holeMoneyColumnsMatchCalc(label) {
  call('calcMoney'); // warm/settle
  const final = call('calcMoney').map((v) => +v.toFixed(2));
  const rows = call('computeHoleMoney');
  const cols = final.map(() => 0);
  let zeroSum = true;
  rows.forEach(({ deltas }) => {
    deltas.forEach((v, i) => { cols[i] += v; });
    if (Math.abs(deltas.reduce((a, b) => a + b, 0)) > 1e-9) zeroSum = false;
  });
  assertEqual(zeroSum, true, `${label}: every hole is zero-sum`);
  assertEqual(cols.map((v) => +v.toFixed(2)), final, `${label}: hole-by-hole columns total to calcMoney()`);
}

console.log('computeHoleMoney: Sixes attributes segment money hole-by-hole (was all zeros)');
loadState(freshStateLiteral({
  players: _P4,
  gameType: 'sixes',
  holeCount: 18,
  scores: scoresFor([Array(18).fill(4), Array(18).fill(5), Array(18).fill(4), Array(18).fill(6)]),
  gameOpts: { sixesVal: 5 },
}));
holeMoneyColumnsMatchCalc('Sixes');

console.log('computeHoleMoney: Skins carry-over stays additive across holes');
loadState(freshStateLiteral({
  players: _P4,
  gameType: 'skins',
  holeCount: 9,
  scores: scoresFor([[3, 4, 4, 4, 4, 4, 4, 4, 4], [4, 3, 4, 4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4, 4, 4, 3]]),
  gameOpts: { skinVal: 2, carry: true },
}));
holeMoneyColumnsMatchCalc('Skins (carry)');

// --- computeSettlement: minimal set of payments that clears every net ---
console.log('computeSettlement: greedy min-cash-flow settlement');
const _st1 = call('computeSettlement', [48, 9, -21, -36]);
assertEqual(_st1.length <= 3, true, 'four players settle in at most 3 payments');
const _net1 = [0, 0, 0, 0];
_st1.forEach((t) => { _net1[t.from] -= t.amt; _net1[t.to] += t.amt; });
assertEqual(_net1.map((v) => Math.round(v)), [48, 9, -21, -36], 'payments reproduce the original nets');
assertEqual(_st1.every((t) => t.amt > 0), true, 'every payment is a positive amount');
assertEqual(call('computeSettlement', [0, 0, 0, 0]), [], 'all square -> no payments');

// --- Side bets: layer on top of the main game without disturbing it ---
console.log('Side bets: layer additively on the main game');
const _offBets = { skins: { on: false, val: 2, carry: true }, snake: { on: false, val: 5 }, junk: { on: false, val: 2 } };
// Wolf alone, no side bets -> the baseline every existing round must keep returning.
const _wolfState = {
  players: _P4, gameType: 'wolf', holeCount: 1,
  scores: { 0: [4], 1: [5], 2: [5], 3: [5] },
  wolfHoles: { 0: { wolf: 0, partners: [1] } },
  gameOpts: { wolfVal: 2 }, sideBets: _offBets,
};
loadState(freshStateLiteral(_wolfState));
const _wolfBase = call('calcMoney');
assertEqual(Math.abs(_wolfBase.reduce((a, b) => a + b, 0)) < 0.005, true, 'wolf baseline is zero-sum');

// Same round with a $2 skins side bet: player 0 wins the hole outright.
loadState(freshStateLiteral(Object.assign({}, _wolfState, {
  sideBets: { skins: { on: true, val: 2, carry: true }, snake: { on: false, val: 5 }, junk: { on: false, val: 2 } },
})));
const _wolfPlusSkins = call('calcMoney');
const _skinsOnly = call('calcSkinsMoney', { skinVal: 2, carry: true });
assertEqual(_wolfPlusSkins, _wolfBase.map((v, i) => v + _skinsOnly[i]), 'wolf + skins side bet == wolf money + skins money');
assertEqual(Math.abs(_wolfPlusSkins.reduce((a, b) => a + b, 0)) < 0.005, true, 'combined money stays zero-sum');

// A side bet the main game already settles must not be counted twice.
loadState(freshStateLiteral({
  players: _P4, gameType: 'skins', holeCount: 1,
  scores: { 0: [3], 1: [4], 2: [4], 3: [4] },
  gameOpts: { skinVal: 2, carry: true },
  sideBets: { skins: { on: true, val: 2, carry: true }, snake: { on: false, val: 5 }, junk: { on: false, val: 2 } },
}));
assertEqual(call('sideBetActive', 'skins'), false, 'skins side bet is suppressed when skins is the main game');
const _skinsMain = call('calcMoney');
loadState(freshStateLiteral({
  players: _P4, gameType: 'skins', holeCount: 1,
  scores: { 0: [3], 1: [4], 2: [4], 3: [4] },
  gameOpts: { skinVal: 2, carry: true }, sideBets: _offBets,
}));
assertEqual(_skinsMain, call('calcMoney'), 'main-game skins is unchanged by a duplicate skins side bet');

// Junk counts only its own categories, so Snake's 3-putt (index 0) never leaks in.
loadState(freshStateLiteral({
  players: _P4, gameType: 'wolf', holeCount: 1,
  scores: { 0: [4], 1: [4], 2: [4], 3: [4] },
  wolfHoles: { 0: { wolf: 0, partners: [1] } }, gameOpts: { wolfVal: 0 },
  bonusPoints: { 0: { 0: { 0: true, 1: true } }, 1: {}, 2: {}, 3: {} },
  sideBets: { skins: { on: false, val: 2, carry: true }, snake: { on: false, val: 5 }, junk: { on: true, val: 2 } },
}));
const _junk = call('calcMoney');
assertEqual(_junk[0], 6, 'player 0 collects only the Greenie (index 1), not the 3-putt (index 0): 3 opponents x $2');
assertEqual(Math.abs(_junk.reduce((a, b) => a + b, 0)) < 0.005, true, 'junk side bet is zero-sum');

// Rounds saved before side bets existed carry no sideBets key at all.
loadState(freshStateLiteral(Object.assign({}, _wolfState, { sideBets: undefined })));
assertEqual(call('calcMoney'), _wolfBase, 'a round with no sideBets key returns the legacy money');

// --- computeHandicapIndex: best-N-of-20 differentials x0.96 ---
console.log('computeHandicapIndex: derives an index from finished rounds');
function hcpRound(name, over, holes, when) {
  const pars = Array(holes).fill(4);
  const scores = {}; scores[0] = {};
  // spread `over` strokes across the holes so gross - par === over
  for (let h = 0; h < holes; h++) scores[0][h] = 4 + (h < over ? 1 : 0);
  return { finished: true, finishedDate: when, date: when, pars, scores, players: [{ name }] };
}
assertEqual(call('computeHandicapIndex', 'Nobody', []).index, null, 'no rounds -> null index');

// Five 18-hole rounds at +10 over par: every differential is 10, so index = 10 * 0.96.
const _hcpRounds = [1, 2, 3, 4, 5].map((d) => hcpRound('Pat', 10, 18, `2026-0${d}-01T12:00:00Z`));
const _h5 = call('computeHandicapIndex', 'Pat', _hcpRounds);
assertEqual(_h5.index, 9.6, 'five rounds at +10 -> index 9.6');
assertEqual(_h5.rounds, 5, 'counts the rounds that had scores');
assertEqual(_h5.series.length, 3, 'series starts once 3 rounds exist (5 rounds -> 3 points) for the trend sparkline');

// A single blow-up round must not drag the index up: best-of takes the good ones.
const _hcpMixed = _hcpRounds.concat([hcpRound('Pat', 30, 18, '2026-06-01T12:00:00Z')]);
const _h6 = call('computeHandicapIndex', 'Pat', _hcpMixed);
assertEqual(_h6.index <= 9.6, true, 'one blow-up round does not raise the index above the good ones');

// A 9-hole round is normalized to 18 before it becomes a differential.
const _h9 = call('computeHandicapIndex', 'Pat', [1, 2, 3].map((d) => hcpRound('Pat', 5, 9, `2026-0${d}-01T12:00:00Z`)));
assertEqual(_h9.index, 9.6, 'a 9-hole round at +5 scales to an 18-hole differential of 10');

// One round is not a handicap - an index needs a minimum of 3.
assertEqual(call('computeHandicapIndex', 'Pat', [hcpRound('Pat', 10, 18, '2026-01-01T12:00:00Z')]).index, null, 'a single round does not produce an index');
assertEqual(call('computeHandicapIndex', 'Pat', _hcpRounds.slice(0, 2)).index, null, 'two rounds do not produce an index');

// Rounds the player did not play in are ignored entirely.
assertEqual(call('computeHandicapIndex', 'Pat', [hcpRound('Sam', 10, 18, '2026-01-01T12:00:00Z')]).index, null, 'other players\' rounds are ignored');

// --- Player colour: one identity, re-stepped per skin ---
console.log('playerColor: stable identity across skins, legacy hex migrates to a slot');
const _pal = JSON.parse(vm.runInContext('JSON.stringify(PLAYER_PALETTES)', context));
assertEqual(_pal.clubhouse.length, 8, 'clubhouse palette has 8 slots');
assertEqual(_pal.broadcast.length, 8, 'broadcast palette has 8 slots');
assertEqual(_pal.sunlight.length, 8, 'sunlight palette has 8 slots');
assertEqual(new Set(_pal.clubhouse).size, 8, 'clubhouse slots are all distinct');
assertEqual(new Set(_pal.broadcast).size, 8, 'broadcast slots are all distinct');
assertEqual(new Set(_pal.sunlight).size, 8, 'sunlight slots are all distinct');

// Every skin must step every slot, or a player vanishes into the background on
// whichever skin forgot them.
assertEqual(
  JSON.parse(vm.runInContext('JSON.stringify(SKINS)', context)).filter((k) => !_pal[k]).length,
  0,
  'every skin in SKINS has a player palette',
);
assertEqual(call('playerColor', { colorIdx: 5 }, 'sunlight'), _pal.sunlight[5], 'slot 5 resolves to the sunlight step');
// An unknown skin must not return undefined into a style attribute.
assertEqual(call('playerColor', { colorIdx: 3 }, 'no-such-skin'), _pal.clubhouse[3], 'an unknown skin falls back to clubhouse');

// A player carries a slot, so each skin renders its own step of the same identity.
assertEqual(call('playerColor', { colorIdx: 2 }, 'clubhouse'), _pal.clubhouse[2], 'slot 2 resolves to the clubhouse step');
assertEqual(call('playerColor', { colorIdx: 2 }, 'broadcast'), _pal.broadcast[2], 'slot 2 resolves to the broadcast step');

// Rounds saved before this change stored only a hex.
assertEqual(call('nearestColorIdx', _pal.clubhouse[5]), 5, 'an exact clubhouse hex maps back to its own slot');
assertEqual(call('nearestColorIdx', _pal.broadcast[5]), 5, 'the broadcast step of a slot maps to the same slot');
const _legacy = { color: '#3f9a6e' };
const _legacyIdx = call('colorIdxOf', _legacy);
assertEqual(_legacyIdx >= 0 && _legacyIdx < 8, true, 'a legacy hex lands on a real slot');
assertEqual(call('colorIdxOf', _legacy), _legacyIdx, 'the migrated slot is stable on re-read');
assertEqual(call('playerColor', {}, 'clubhouse'), _pal.clubhouse[0], 'a player with no colour falls back to slot 0, not an off-palette grey');


// --- Back-compat: rounds written by the pre-side-bets build ---
// A round saved by the previous production build has no `sideBets` key at all.
// loadRound() fills it via Object.assign(defaultSideBets(), saved.sideBets||{}),
// so a legacy round must settle to exactly the same money as one with every
// side bet explicitly off. If this ever diverges, upgrading the app silently
// changes what people owe each other.
console.log('Back-compat: a round saved before side bets existed still settles identically');

const _legacyRound = {
  players: _P4, gameType: 'skins', holeCount: 3,
  scores: { 0: [3, 4, 4], 1: [4, 4, 3], 2: [4, 4, 4], 3: [4, 4, 4] },
  gameOpts: { skinVal: 2, skinsCarry: true },
};

// As the old build wrote it: the key is simply absent.
loadState(freshStateLiteral(_legacyRound));
const _legacyMoney = call('calcMoney');
assertEqual(_legacyMoney.length, 4, 'a round with no sideBets key still returns money for every player');
assertEqual(Math.abs(_legacyMoney.reduce((a, b) => a + b, 0)) < 0.005, true, 'legacy round stays zero-sum');

// The same round after migration, with every side bet explicitly off.
loadState(freshStateLiteral(Object.assign({}, _legacyRound, {
  sideBets: { skins: { on: false, val: 2, carry: true }, snake: { on: false, val: 5 }, junk: { on: false, val: 2 } },
})));
assertEqual(call('calcMoney'), _legacyMoney, 'migrated round settles to the same money as the legacy one');

// defaultSideBets() is what loadRound() merges onto, so it must be all-off.
const _defaults = call('defaultSideBets');
assertEqual(Object.keys(_defaults).sort(), ['junk', 'skins', 'snake'], 'defaultSideBets covers every side bet');
assertEqual(Object.values(_defaults).every((b) => b.on === false), true, 'every side bet defaults to off, so upgrading never adds a bet nobody agreed to');

// A partially-populated sideBets object (a round saved mid-rollout) keeps its
// own values and picks up defaults for the rest.
loadState(freshStateLiteral(Object.assign({}, _legacyRound, {
  sideBets: Object.assign(call('defaultSideBets'), { skins: { on: true, val: 5, carry: false } }),
})));
const _partial = call('calcMoney');
assertEqual(_partial.length, 4, 'a partially-populated sideBets object still settles');
assertEqual(Math.abs(_partial.reduce((a, b) => a + b, 0)) < 0.005, true, 'partially-populated round stays zero-sum');


// --- wolfTeamsUneven with no roster: the regression this shipped with once ---
// The 4/5/6/7/8 cases are covered above. What was missing is the degenerate one:
// game setup used to come BEFORE the roster, so this predicate always saw an
// empty players array, returned false, and the uneven-team stake fields never
// appeared -- for any roster size. The money math was right; the inputs were
// unreachable. Any screen rendering roster-dependent options must come after
// the roster is entered.
console.log('wolfTeamsUneven: an empty roster is never uneven (options must not render before players)');

const _unevenAt = (n) => {
  loadState(freshStateLiteral({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, hdcp: 0 })), gameType: 'wolf' }));
  return call('wolfTeamsUneven');
};
assertEqual(_unevenAt(0), false, 'empty roster is not uneven -- so these fields cannot be configured before players exist');
assertEqual(_unevenAt(3), false, '3 players is wolf-vs-two, not an uneven team split');

// --- Round superlatives: descriptive per-round "awards" on the finish screen ---
// These read the same scores/pars/money the results already show, so they must
// never invent a standout that isn't there, must respect holeStart labelling,
// and must stay quiet when there's nothing to celebrate (one player / no scores).
console.log('roundSuperlatives: per-round awards derive only from the round already played');

const _sup = (state) => {
  loadState(freshStateLiteral(state));
  return call('roundSuperlativesHTML');
};
const _has = (html, award, name) =>
  new RegExp(award.replace(/[-/]/g, '\\$&') + '</div>[\\s\\S]*?<div class="sup-winner">[\\s\\S]*?<span class="sup-name">' + name)
    .test(html);

// Par-4 nine. Ann is low & birdie-heavy, Bo blows up on hole 5, Cy is all pars.
const _supPlayers = [{ name: 'Ann Lee', color: 0 }, { name: 'Bo Ray', color: 1 }, { name: 'Cy Fox', color: 2 }];
const _supPars = Array(9).fill(4);
const _supScores = scoresFor([
  [3, 3, 4, 3, 4, 4, 5, 4, 4], // Ann: 3 birdies, lowest gross
  [4, 4, 4, 4, 8, 4, 4, 4, 4], // Bo: +4 blow-up on hole 5
  [4, 4, 4, 4, 4, 4, 4, 4, 4], // Cy: nine straight pars
]);
const _skinsOut = _sup({ players: _supPlayers, pars: _supPars, scores: _supScores, hdcps: Array.from({ length: 9 }, (_, i) => i + 1), gameType: 'skins', currentHole: 8, holeCount: 9, holeStart: 0 });
assertEqual(/superlatives-wrap/.test(_skinsOut), true, 'a finished multiplayer round produces a superlatives card');
assertEqual(/superlatives-note/.test(_skinsOut), true, 'the card carries a short description of what the superlatives are');
assertEqual(/Medalist<\/div><div class="sup-desc">Lowest score of the day/.test(_skinsOut), true, 'each award carries a mini description of what it means');
assertEqual(/sup-game">Skins/.test(_skinsOut), true, 'the card names the game that was played');
assertEqual(_has(_skinsOut, 'Medalist', 'Ann Lee'), true, 'Medalist is the lowest gross of the day');
assertEqual(_has(_skinsOut, 'Birdie Hunter', 'Ann Lee'), true, 'Birdie Hunter is the most birdies-or-better');
assertEqual(_has(_skinsOut, 'On a Heater', 'Cy Fox'), true, 'On a Heater is the longest par-or-better run');
assertEqual(/Blow-Up of the Day<\/div>[\s\S]*?<div class="sup-winner">[\s\S]*?Bo Ray[\s\S]*?\+4 on hole 5/.test(_skinsOut), true, 'Blow-Up names the right player, amount and hole');
assertEqual(/Skin Collector/.test(_skinsOut), true, 'a skins round awards the Skin Collector');

// Game "none": no money awards, no game label, but scoring awards still stand.
const _noneOut = _sup({ players: [{ name: 'Ann', color: 0 }, { name: 'Bo', color: 1 }], pars: _supPars, scores: scoresFor([[3, 4, 4, 4, 4, 4, 4, 4, 4], [5, 4, 4, 4, 4, 4, 4, 4, 4]]), gameType: 'none', currentHole: 8, holeCount: 9, holeStart: 0 });
assertEqual(/sup-game/.test(_noneOut), false, 'a score-only round shows no game label');
assertEqual(/Biggest Swing/.test(_noneOut), false, 'a score-only round has no money-swing award');
assertEqual(/Medalist/.test(_noneOut), true, 'a score-only round still crowns a Medalist');

// holeStart offsets the hole labels (a back-nine round starts at hole 10).
const _backOut = _sup({ players: [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], pars: _supPars, scores: scoresFor([[4, 4, 4, 4, 4, 4, 4, 4, 4], [4, 4, 8, 4, 4, 4, 4, 4, 4]]), gameType: 'none', currentHole: 8, holeCount: 9, holeStart: 9 });
assertEqual(/\+4 on hole 12/.test(_backOut), true, 'blow-up hole labels respect holeStart');

// Degenerate rounds stay quiet rather than rendering an empty card.
assertEqual(_sup({ players: [{ name: 'Solo', color: 0 }], pars: _supPars, scores: scoresFor([[4, 4, 4, 4, 4, 4, 4, 4, 4]]), gameType: 'none', holeCount: 9 }), '', 'a solo round produces no superlatives');
assertEqual(_sup({ players: [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], pars: _supPars, scores: {}, gameType: 'none', holeCount: 9 }), '', 'a round with no scores produces no superlatives');


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
