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

const required = ['calcVegasMoney', 'calcNassauMoney', 'calcSkins', 'calcBonusMoney', 'addBonus', 'removeBonus', 'getBonusCount'];
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
    matchPresses: [],
    pairings: [],
    currentHole: 0,
    holeCount: 18,
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

console.log('Wolf: "Lone Wolf" button label reflects gameOpts.lone2x, not hardcoded (Bug 6)');
const hasConditionalLabel = html.includes('🐺 Lone Wolf (${state.gameOpts.lone2x?"2×":"1×"})');
if (hasConditionalLabel) { pass++; console.log('  ok - label is rendered conditionally on gameOpts.lone2x'); }
else { fail++; console.log('  FAIL - static "Lone Wolf (2×)" label found instead of a conditional one'); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
