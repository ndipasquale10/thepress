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

const required = ['calcVegasMoney', 'calcNassauMoney', 'calcSkins', 'calcBonusMoney', 'addBonus', 'removeBonus', 'getBonusCount', 'getPlayingHandicaps', 'readGameOpts', 'computeScoringStats', 'esc', 'safeParseJSON', 'mergeByName'];
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
const hasConditionalLabel = html.includes('🐺 Lone Wolf (${state.gameOpts.lone2x?"2×":"1×"})');
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
assertEqual(call('calcWolfMoney'), [4, 4, -4, -4], 'wolf(A)+partner(B) birdie beats field 2x multiplier, split $1 x2 field members each');

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
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }],
  gameType: 'match',
  holeCount: 3,
  scores: scoresFor([[4, 4, 4], [5, 5, 4]]), // A wins holes 0-1, hole2 ties -> A wins the only segment (front==overall on a 3-hole round)
  gameOpts: { matchFormat: 'nassau', matchFront: 1, matchBack: 1, matchOverall: 2 },
}));
assertEqual(call('calcMatchMoney'), [3, -3], 'A wins both the front-9 bet ($1) and overall bet ($2) as the unique segment winner, not per-hole');

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

console.log('Nassau: 2v2 team best-ball mode still settles correctly after extracting settleTeamSegment (regression)');
loadState(freshStateLiteral({
  players: [{ name: 'A', hdcp: 0 }, { name: 'B', hdcp: 0 }, { name: 'C', hdcp: 0 }, { name: 'D', hdcp: 0 }],
  holeCount: 3,
  scores: scoresFor([
    [4, 5, 4], // team0 (A,B) best-ball per hole: 4, 5, 4
    [5, 5, 4],
    [5, 4, 5], // team1 (C,D) best-ball per hole: 5, 4, 5
    [5, 5, 5],
  ]),
  gameOpts: { front: 5, back: 0, overall: 3, press: false, nassauTeams: true, nassauTeamRoster: [[0, 1], [2, 3]] },
}));
assertEqual(call('calcNassauMoney'), [16, 16, -16, -16], 'team0 wins the hole-count 2-1 on both the front and overall bets ($5+$3 x2 members)');

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
