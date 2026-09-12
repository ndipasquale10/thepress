#!/usr/bin/env node
'use strict';
// Wolf Hammer stress test — five players, every pick shape the game offers, with
// hammers stacked on top and combined with birdie/eagle score factors, uneven
// stakes, concedes and handicap strokes. Wolf Hammer is the money game most
// prone to a settle bug: the stakes multiply (hammer 2^n × blind/lone × score),
// the teams are uneven at an odd roster (2 v 3), and the losers' pot is split
// across the winners in whole dollars. The two properties that must always hold
// are (1) every hole settles exactly zero-sum and (2) each multiplier lands at
// the documented value. This file drives calcWolfMoney directly, the same way
// calc.test.js does, so the math is exercised without the UI in the way.
//
// Run with: node test/wolf-hammer.test.js
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
function makeDocumentMock() {
  const own = {
    getElementById: (id) => (id === 'handicap-mode' ? null : makeElementMock()),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeElementMock(),
    addEventListener() {}, removeEventListener() {},
    body: makeElementMock(), documentElement: makeElementMock(),
  };
  return new Proxy(own, { get(target, prop) { return (prop in target) ? target[prop] : () => makeElementMock(); } });
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
  return new Proxy(function () {}, { get() { return makeGenericMock(); }, apply() { return makeGenericMock(); } });
}
const sandbox = {
  console, localStorage: memoryStorage, document: makeDocumentMock(),
  navigator: makeGenericMock(), location: makeGenericMock(), firebase: makeGenericMock(),
  requestAnimationFrame: () => 0, setTimeout, clearTimeout, setInterval, clearInterval,
  alert() {}, confirm() { return true; },
};
sandbox.window = sandbox;
const context = vm.createContext(sandbox);
scriptBlocks.forEach((code, i) => {
  try { vm.runInContext(code, context, { filename: `inline-script-${i}.js` }); }
  catch (err) { console.warn(`(warning) inline script block ${i} threw during load: ${err.message}`); }
});

for (const fn of ['calcWolfMoney', 'getNetScore', 'getWolfTeams']) {
  if (typeof context[fn] !== 'function') {
    console.error(`FATAL: ${fn} was not found in the loaded script context. Aborting tests.`);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok - ${msg}`); }
  else { fail++; console.log(`  FAIL - ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function assertZeroSum(vec, msg) {
  const s = vec.reduce((a, b) => a + b, 0);
  if (Math.abs(s) < 1e-9) { pass++; console.log(`  ok - ${msg} (zero-sum)`); }
  else { fail++; console.log(`  FAIL - ${msg} — not zero-sum, sum=${s}\n    vec: ${JSON.stringify(vec)}`); }
}

function freshStateLiteral(overrides) {
  const base = {
    players: [], scores: {}, pars: Array(18).fill(4),
    hdcps: Array.from({ length: 18 }, (_, i) => i + 1),
    handicapMode: 'none', gameType: 'wolf', gameOpts: {},
    bonusPoints: {}, wolfHoles: {}, bankerHoles: {}, bankerPresses: {},
    matchPresses: [], pairings: [], currentHole: 0, holeCount: 18, selectedTee: null,
  };
  return Object.assign(base, overrides);
}
function loadState(stateObj) {
  vm.runInContext(`
    Object.assign(state, ${JSON.stringify(stateObj)});
    if (typeof invalidateHdcpCache === 'function') invalidateHdcpCache();
    if (typeof invalidateMoneyCache === 'function') invalidateMoneyCache();
    if (typeof undoStack !== 'undefined') undoStack.length = 0;
  `, context);
}
function call(fnName, ...args) {
  vm.runInContext(`globalThis.__args = ${JSON.stringify(args)};`, context);
  try { return vm.runInContext(`${fnName}(...globalThis.__args)`, context); }
  catch (err) { throw new Error(`${fnName}(${args.map((a) => JSON.stringify(a)).join(', ')}) threw: ${err.message}`); }
}
// Five players, scratch by default.
const FIVE = (hdcps = [0, 0, 0, 0, 0]) =>
  ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ name, hdcp: hdcps[i] }));
// One hole of scores: pass the five gross numbers for hole 0.
const hole0 = (arr) => { const s = {}; arr.forEach((v, p) => { s[p] = { 0: v }; }); return s; };
// Build a wolf round with 5 players, one hole, and run the settle.
function wolf(wolfHole, scores, opts = {}, extra = {}) {
  loadState(freshStateLiteral(Object.assign({
    players: FIVE(extra.hdcps),
    holeCount: 1,
    pars: [4, ...Array(17).fill(4)],
    handicapMode: extra.handicapMode || 'none',
    hdcps: extra.strokeIdx || Array.from({ length: 18 }, (_, i) => i + 1),
    scores: hole0(scores),
    wolfHoles: { 0: wolfHole },
    gameOpts: Object.assign({ wolfVal: 1 }, opts),
  }, extra.state || {})));
  return call('calcWolfMoney');
}

console.log('=== Wolf Hammer, 5 players ===\n');

// --------------------------------------------------------------------------
console.log('Lone Wolf (1 v 4): hammer stacks as 2^n on top of the base');
// --------------------------------------------------------------------------
// A goes lone and pars to beat a field that all bogey. Base is $1 from each of
// the 4 field players; every hammer doubles the whole hole.
assertEqual(wolf({ wolf: 0, partners: [], hammers: 0 }, [4, 5, 5, 5, 5]),
  [4, -1, -1, -1, -1], 'lone par win, 0 hammers: +$1 from each of 4');
assertEqual(wolf({ wolf: 0, partners: [], hammers: 1 }, [4, 5, 5, 5, 5]),
  [8, -2, -2, -2, -2], 'lone par win, 1 hammer (2×)');
assertEqual(wolf({ wolf: 0, partners: [], hammers: 2 }, [4, 5, 5, 5, 5]),
  [16, -4, -4, -4, -4], 'lone par win, 2 hammers (4×)');
assertEqual(wolf({ wolf: 0, partners: [], hammers: 3 }, [4, 5, 5, 5, 5]),
  [32, -8, -8, -8, -8], 'lone par win, 3 hammers (8×)');

console.log('Lone Wolf: hammer multiplies with the Lone (2×) option');
assertEqual(wolf({ wolf: 0, partners: [], hammers: 1 }, [4, 5, 5, 5, 5], { lone2x: true }),
  [16, -4, -4, -4, -4], 'lone2x (2×) × 1 hammer (2×) = 4× on a par win');

console.log('Lone Wolf: hammer multiplies with birdie/eagle score factors');
assertEqual(wolf({ wolf: 0, partners: [], hammers: 1 }, [3, 5, 5, 5, 5]),
  [16, -4, -4, -4, -4], 'lone birdie (2×) × 1 hammer (2×) = 4×');
assertEqual(wolf({ wolf: 0, partners: [], hammers: 2 }, [2, 5, 5, 5, 5]),
  [48, -12, -12, -12, -12], 'lone eagle (3×) × 2 hammers (4×) = 12×');

console.log('Lone Wolf: a hammered loss swings the doubled stake against the wolf');
assertEqual(wolf({ wolf: 0, partners: [], hammers: 1 }, [6, 4, 5, 5, 5]),
  [-8, 2, 2, 2, 2], 'lone loses to the field best (B), 1 hammer: wolf pays $2 to each');
// The field winner made only a par (B=4), so no score factor on the field side.
assertEqual(wolf({ wolf: 0, partners: [], hammers: 1 }, [6, 3, 5, 5, 5]),
  [-16, 4, 4, 4, 4], 'field beats the lone wolf WITH a birdie (B=3): factor follows the winner → 2× on top of the hammer');

// --------------------------------------------------------------------------
console.log('\nWolf + partner (2 v 3): even stakes, hammer, and the odd-dollar split');
// --------------------------------------------------------------------------
// A + B vs C,D,E. A 3-player field pays a whole-dollar pot that a 2-player
// winning team cannot split evenly, so the odd dollar goes to the lowest index.
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 0 }, [4, 4, 5, 5, 5]),
  [2, 1, -1, -1, -1], '2v3 wolf-team par win, 0 hammers: $3 pot → $2/$1 to A/B');
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 1 }, [4, 4, 5, 5, 5]),
  [3, 3, -2, -2, -2], '2v3 wolf-team win, 1 hammer: $6 pot splits evenly $3/$3');
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 2 }, [4, 4, 5, 5, 5]),
  [6, 6, -4, -4, -4], '2v3 wolf-team win, 2 hammers: $12 pot → $6/$6');
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 1 }, [3, 4, 5, 5, 5]),
  [6, 6, -4, -4, -4], '2v3 wolf-team birdie (A=3, 2×) × 1 hammer: $12 pot → $6/$6');

console.log('Wolf + partner (2 v 3): the field (3) wins — pot splits across three');
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 0 }, [5, 5, 4, 5, 5]),
  [-1, -1, 1, 1, 0], '3-player field par win, 0 hammers: $2 pot from the wolf team → $1/$1/$0');
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 1 }, [5, 5, 4, 5, 5]),
  [-2, -2, 2, 1, 1], '3-player field win, 1 hammer: $4 pot → $2/$1/$1');

// --------------------------------------------------------------------------
console.log('\nUneven stakes (wolfTeamVal ≠ fieldVal): the losing team size picks the stake');
// --------------------------------------------------------------------------
const UNEVEN = { wolfVal: 1, wolfTeamVal: 3, fieldVal: 1 };
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 0 }, [4, 4, 5, 5, 5], UNEVEN),
  [2, 1, -1, -1, -1], 'wolf team wins: the losing field (3) pays fieldVal $1 each → $3 pot');
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 0 }, [5, 5, 4, 5, 5], UNEVEN),
  [-3, -3, 2, 2, 2], 'field wins: the losing wolf team (2) pays wolfTeamVal $3 each → $6 pot → $2 each');
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 1 }, [5, 5, 4, 5, 5], UNEVEN),
  [-6, -6, 4, 4, 4], 'field wins, 1 hammer: wolf team pays $6 each → $12 pot → $4 each');
// The heaviest realistic stack: uneven stakes, field eagle, two hammers.
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 2 }, [5, 5, 2, 5, 5], UNEVEN),
  [-36, -36, 24, 24, 24], 'field eagle (3×) × 2 hammers (4×) at wolfTeamVal $3: wolf team pays $36 each');

// --------------------------------------------------------------------------
console.log('\nShuck (1 v everyone): base is always 2×, hammer and score factor stack');
// --------------------------------------------------------------------------
assertEqual(wolf({ wolf: 0, partners: [], shuck: 0, hammers: 0 }, [4, 5, 5, 5, 5]),
  [8, -2, -2, -2, -2], 'shuck par win, 0 hammers: 2× base collected from each of 4');
assertEqual(wolf({ wolf: 0, partners: [], shuck: 0, hammers: 1 }, [4, 5, 5, 5, 5]),
  [16, -4, -4, -4, -4], 'shuck par win, 1 hammer: 2× × 2× = 4×');
assertEqual(wolf({ wolf: 0, partners: [], shuck: 0, hammers: 1 }, [3, 5, 5, 5, 5]),
  [32, -8, -8, -8, -8], 'shuck birdie (2×) × 1 hammer (2×) on a 2× base = 8×');
assertEqual(wolf({ wolf: 0, partners: [], shuck: 0, hammers: 0 }, [2, 5, 5, 5, 5]),
  [24, -6, -6, -6, -6], 'shuck eagle (3×) on a 2× base = 6×');
assertEqual(wolf({ wolf: 0, partners: [], shuck: 0, hammers: 1 }, [6, 4, 5, 5, 5]),
  [-16, 4, 4, 4, 4], 'shuck loses to a field par, 1 hammer: shucker pays 2×2 = $4 to each');

console.log('Shuck: the score factor follows the WINNER, not the shucker (parity with Lone Wolf)');
// Shucker pars but a field player birdies to win. As with a lone wolf losing to
// a field birdie, the winner's birdie must double the stake.
assertEqual(wolf({ wolf: 0, partners: [], shuck: 0, hammers: 0 }, [4, 3, 5, 5, 5]),
  [-16, 4, 4, 4, 4], 'shucker pars, field birdies to win: 2× base × 2× birdie = $4 from the shucker to each');
// Shucker birdies but a field player eagles to win: the winner's eagle triples.
assertEqual(wolf({ wolf: 0, partners: [], shuck: 0, hammers: 0 }, [3, 2, 5, 5, 5]),
  [-24, 6, 6, 6, 6], 'shucker birdies, field eagles to win: 2× base × 3× eagle = $6 from the shucker to each');

// --------------------------------------------------------------------------
console.log('\nConcede at the current (hammered) stakes — no score factor');
// --------------------------------------------------------------------------
// Field concedes to a lone wolf after a hammer: wolf collects the doubled base
// from each, and a concede never applies a birdie/eagle multiplier.
assertEqual(wolf({ wolf: 0, partners: [], hammers: 1, conceded: 'field' }, [4, 5, 5, 5, 5]),
  [8, -2, -2, -2, -2], 'field concedes a lone wolf, 1 hammer: 2× base from each of 4');
// Wolf team concedes a 2v3 after a hammer: the 3-player field collects the
// hammered pot from the wolf pair.
assertEqual(wolf({ wolf: 0, partners: [1], hammers: 1, conceded: 'wolf' }, [5, 5, 4, 5, 5]),
  [-2, -2, 2, 1, 1], 'wolf team concedes 2v3, 1 hammer: wolf pair pays $2 each → $4 pot → $2/$1/$1');

// --------------------------------------------------------------------------
console.log('\nHandicap strokes drive the net result under a hammer');
// --------------------------------------------------------------------------
// E plays off 5 and strokes on hole 0 (stroke index 1). Lone wolf A pars gross
// but E's gross 5 becomes net 4, tying the wolf → nobody is beaten, no money.
assertEqual(
  wolf({ wolf: 0, partners: [], hammers: 2 }, [4, 5, 5, 5, 5], { wolfVal: 1 },
    { handicapMode: 'full', hdcps: [0, 0, 0, 0, 5], strokeIdx: [1, ...Array(17).fill(18)] }),
  [0, 0, 0, 0, 0], 'a stroke ties the hole on net, so even a 4× hammer moves no money');
// Same stroke, but the wolf birdies (net 3) and beats every net score.
assertEqual(
  wolf({ wolf: 0, partners: [], hammers: 1 }, [3, 5, 5, 5, 5], { wolfVal: 1 },
    { handicapMode: 'full', hdcps: [0, 0, 0, 0, 5], strokeIdx: [1, ...Array(17).fill(18)] }),
  [16, -4, -4, -4, -4], 'wolf net birdie beats the field (incl. E net 4) under a hammer: 2× birdie × 2× hammer');

// --------------------------------------------------------------------------
console.log('\nHammer doubling invariant: one more hammer doubles the whole settle');
// --------------------------------------------------------------------------
// For any single hole, N+1 hammers must produce exactly twice the money of N.
// (True per-player for lone/shuck; true as a team total for the 2v3 split, so
// this is checked on shapes whose per-player amounts double cleanly.)
const invariantShapes = [
  { label: 'lone par win', wh: { wolf: 0, partners: [] }, sc: [4, 5, 5, 5, 5], opts: {} },
  { label: 'lone birdie win + lone2x', wh: { wolf: 0, partners: [] }, sc: [3, 5, 5, 5, 5], opts: { lone2x: true } },
  { label: 'lone loss', wh: { wolf: 0, partners: [] }, sc: [6, 4, 5, 5, 5], opts: {} },
  { label: 'shuck win', wh: { wolf: 0, partners: [], shuck: 0 }, sc: [3, 5, 5, 5, 5], opts: {} },
  { label: 'shuck loss', wh: { wolf: 0, partners: [], shuck: 0 }, sc: [6, 4, 5, 5, 5], opts: {} },
];
for (const shp of invariantShapes) {
  for (const n of [0, 1, 2]) {
    const lo = wolf(Object.assign({}, shp.wh, { hammers: n }), shp.sc, shp.opts);
    const hi = wolf(Object.assign({}, shp.wh, { hammers: n + 1 }), shp.sc, shp.opts);
    const doubled = lo.map((v) => v * 2);
    assertEqual(hi, doubled, `${shp.label}: ${n + 1} hammers = 2× of ${n} hammers`);
  }
}

// --------------------------------------------------------------------------
console.log('\nEvery scenario settles zero-sum');
// --------------------------------------------------------------------------
for (const shp of [
  ...invariantShapes,
  { label: '2v3 wolf win', wh: { wolf: 0, partners: [1] }, sc: [4, 4, 5, 5, 5], opts: {} },
  { label: '2v3 field win', wh: { wolf: 0, partners: [1] }, sc: [5, 5, 4, 5, 5], opts: {} },
  { label: '2v3 uneven field win', wh: { wolf: 0, partners: [1] }, sc: [5, 5, 4, 5, 5], opts: UNEVEN },
  { label: 'field concede', wh: { wolf: 0, partners: [], conceded: 'field' }, sc: [4, 5, 5, 5, 5], opts: {} },
  { label: 'wolf concede 2v3', wh: { wolf: 0, partners: [1], conceded: 'wolf' }, sc: [5, 5, 4, 5, 5], opts: {} },
]) {
  for (const n of [0, 1, 2, 3]) {
    assertZeroSum(wolf(Object.assign({}, shp.wh, { hammers: n }), shp.sc, shp.opts),
      `${shp.label}, ${n} hammers`);
  }
}

// --------------------------------------------------------------------------
console.log('\nA full 18-hole round with rotating wolves, mixed picks and hammers stays zero-sum');
// --------------------------------------------------------------------------
(() => {
  const players = FIVE();
  const scores = {};
  const wolfHoles = {};
  // Deterministic pseudo-random-ish spread across the 18 holes.
  for (let h = 0; h < 18; h++) {
    const w = h % 5; // rotate the wolf
    const kind = h % 4;
    if (kind === 0) wolfHoles[h] = { wolf: w, partners: [], hammers: h % 3 }; // lone, 0-2 hammers
    else if (kind === 1) wolfHoles[h] = { wolf: w, partners: [(w + 1) % 5], hammers: h % 2 }; // 2v3
    else if (kind === 2) wolfHoles[h] = { wolf: w, partners: [], shuck: w, hammers: h % 2 }; // shuck
    else wolfHoles[h] = { wolf: w, partners: [(w + 1) % 5], hammers: 0, conceded: h % 2 ? 'wolf' : 'field' };
    for (let p = 0; p < 5; p++) {
      scores[p] = scores[p] || {};
      // Vary scores so wins/losses/birdies/eagles all occur.
      scores[p][h] = 3 + ((h + p) % 4); // 3..6
    }
  }
  loadState(freshStateLiteral({
    players, holeCount: 18, pars: Array(18).fill(4),
    scores, wolfHoles, gameOpts: { wolfVal: 2, wolfTeamVal: 3, fieldVal: 1, lone2x: true },
  }));
  const money = call('calcWolfMoney');
  assertZeroSum(money, '18-hole mixed Wolf Hammer round');
  console.log(`    (final settle: ${JSON.stringify(money)})`);
})();

// ==========================================================================
// Every roster size and the fixed-pairs (team wolf) mode
// ==========================================================================
// Generic builders so the same shapes can be driven at any roster size.
const roster = (n, hdcps) =>
  Array.from({ length: n }, (_, i) => ({ name: String.fromCharCode(65 + i), hdcp: hdcps ? hdcps[i] : 0 }));
const holeScores = (arr) => { const s = {}; arr.forEach((v, p) => { s[p] = { 0: v }; }); return s; };
function runWolf({ players, holeCount = 1, scores, wolfHoles, opts = {}, pairings = [], handicapMode = 'none', strokeIdx }) {
  loadState(freshStateLiteral({
    players, holeCount, pars: Array(18).fill(4),
    handicapMode, hdcps: strokeIdx || Array.from({ length: 18 }, (_, i) => i + 1),
    scores, wolfHoles, pairings,
    gameOpts: Object.assign({ wolfVal: 1 }, opts),
  }));
  return call('calcWolfMoney');
}

// --------------------------------------------------------------------------
console.log('\n=== Roster sweep: 4–8 players, every pick shape, settles zero-sum ===');
// --------------------------------------------------------------------------
// Two score patterns per size: one where the wolf/first index wins outright
// (a birdie), one where it loses to the field. Full scores on the hole, so any
// valid settle must be exactly zero-sum. Hammers stacked 0..3 on top.
for (const n of [4, 5, 6, 7, 8]) {
  const win = Array.from({ length: n }, (_, i) => (i === 0 ? 3 : 5)); // wolf birdies, field bogeys
  const lose = Array.from({ length: n }, (_, i) => (i === 0 ? 6 : (i === 1 ? 3 : 5))); // wolf blows up, B birdies
  const maxPartners = n < 6 ? 1 : 2;
  const shapes = [
    { label: 'lone', wh: { wolf: 0, partners: [] } },
    { label: 'partner', wh: { wolf: 0, partners: [1] } },
    { label: 'blind (3×)', wh: { wolf: 0, partners: [], blind: true } },
    { label: 'blindPick (2×)', wh: { wolf: 0, partners: [1], blindPick: true } },
    { label: 'shuck', wh: { wolf: 0, partners: [], shuck: 0 } },
    { label: 'concede→field', wh: { wolf: 0, partners: [1], conceded: 'field' } },
    { label: 'concede→wolf', wh: { wolf: 0, partners: [1], conceded: 'wolf' } },
  ];
  if (maxPartners === 2) shapes.push({ label: '2 partners', wh: { wolf: 0, partners: [1, 2] } });
  let sizeOk = true;
  for (const shp of shapes) {
    for (const sc of [win, lose]) {
      for (const ham of [0, 1, 2, 3]) {
        const money = runWolf({
          players: roster(n), scores: holeScores(sc),
          wolfHoles: { 0: Object.assign({}, shp.wh, { hammers: ham }) },
          opts: wolfTeamsUnevenSize(n) ? { wolfVal: 1, wolfTeamVal: 3, fieldVal: 1, lone2x: true } : { wolfVal: 1, lone2x: true },
        });
        const s = money.reduce((a, b) => a + b, 0);
        if (Math.abs(s) > 1e-9 || money.length !== n) {
          sizeOk = false;
          console.log(`  FAIL - ${n}p ${shp.label} ${sc === win ? 'win' : 'lose'} ${ham}h → ${JSON.stringify(money)} (sum ${s})`);
        }
      }
    }
  }
  if (sizeOk) { pass++; console.log(`  ok - ${n} players: all pick shapes × win/lose × 0–3 hammers settle zero-sum`); }
  else fail++;
}
function wolfTeamsUnevenSize(n) { return n >= 5 && n % 2 === 1; }

// --------------------------------------------------------------------------
console.log('\n=== 4 players: exact multipliers ===');
// --------------------------------------------------------------------------
const r4 = () => roster(4);
assertEqual(runWolf({ players: r4(), scores: holeScores([4, 5, 5, 5]), wolfHoles: { 0: { wolf: 0, partners: [], hammers: 1 } } }),
  [6, -2, -2, -2], 'lone par win, 1 hammer: +$2 from each of 3');
assertEqual(runWolf({ players: r4(), scores: holeScores([4, 4, 5, 5]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 1 } } }),
  [2, 2, -2, -2], '2v2 wolf win, 1 hammer: $4 pot splits evenly');
assertEqual(runWolf({ players: r4(), scores: holeScores([3, 5, 5, 5]), wolfHoles: { 0: { wolf: 0, partners: [], shuck: 0, hammers: 1 } } }),
  [24, -8, -8, -8], 'shuck birdie (2×) × 1 hammer on a 2× base = 8× from each of 3');

// --------------------------------------------------------------------------
console.log('\n=== 7 players (odd/uneven): exact stakes and pot splits ===');
// --------------------------------------------------------------------------
assertEqual(runWolf({ players: roster(7), scores: holeScores([4, 4, 5, 5, 5, 5, 5]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } } }),
  [3, 2, -1, -1, -1, -1, -1], '2v5 wolf-team win, even stakes: $5 pot → $3/$2');
assertEqual(runWolf({ players: roster(7), scores: holeScores([4, 4, 4, 5, 5, 5, 5]), wolfHoles: { 0: { wolf: 0, partners: [1, 2], hammers: 0 } } }),
  [2, 1, 1, -1, -1, -1, -1], '3v4 wolf-team win, even stakes: $4 pot → $2/$1/$1');
assertEqual(runWolf({ players: roster(7), scores: holeScores([5, 5, 4, 5, 5, 5, 5]), wolfHoles: { 0: { wolf: 0, partners: [1], hammers: 0 } }, opts: { wolfVal: 1, wolfTeamVal: 3, fieldVal: 1 } }),
  [-3, -3, 2, 1, 1, 1, 1], '2v5 field win, uneven: losing wolf pair pays wolfTeamVal $3 → $6 pot across 5');

// --------------------------------------------------------------------------
console.log('\n=== Fixed-pairs (team wolf): 6 players, teams [A,B] [C,D] [E,F] ===');
// --------------------------------------------------------------------------
const P6 = [[0, 1], [2, 3], [4, 5]];
const fp6 = (wh, sc, opts = {}) => runWolf({ players: roster(6), pairings: P6, scores: holeScores(sc), wolfHoles: { 0: wh }, opts: Object.assign({ wolfVal: 1 }, opts) });
// A pick that hasn't chosen allies yet pays nothing.
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: undefined, hammers: 0 }, [4, 4, 5, 5, 5, 5]),
  [0, 0, 0, 0, 0, 0], 'no ally choice yet → hole pays nothing');
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 0 }, [4, 4, 5, 5, 5, 5]),
  [4, 4, -2, -2, -2, -2], 'lone pair (team A&B) beats both other teams: each wins $1 from each of 4 opponents');
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 1 }, [4, 4, 5, 5, 5, 5]),
  [8, 8, -4, -4, -4, -4], 'lone pair, 1 hammer: doubles');
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 0 }, [4, 4, 5, 5, 5, 5], { lone2x: true }),
  [8, 8, -4, -4, -4, -4], 'lone pair with lone2x (2×)');
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 0 }, [3, 4, 5, 5, 5, 5]),
  [8, 8, -4, -4, -4, -4], 'lone pair, wolf birdie (2×)');
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 0 }, [2, 4, 5, 5, 5, 5]),
  [12, 12, -6, -6, -6, -6], 'lone pair, wolf eagle (3×)');
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [1], hammers: 0 }, [4, 4, 4, 4, 5, 5]),
  [2, 2, 2, 2, -4, -4], 'allied (A&B + C&D) beats team E&F: 4 winners each +$2, 2 losers each -$4');
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 1, conceded: 'field' }, [4, 4, 5, 5, 5, 5]),
  [8, 8, -4, -4, -4, -4], 'field concedes the lone pair at 2× (hammer), no score factor');
// Losing side (field wins the hole against the lone pair).
assertEqual(fp6({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 0 }, [5, 5, 4, 4, 4, 4]),
  [-4, -4, 2, 2, 2, 2], 'lone pair loses: pays $1 to each opponent');
for (const ham of [0, 1, 2]) {
  assertZeroSum(fp6({ fixedPairs: true, wolfTeam: 1, allyTeams: [2], hammers: ham }, [5, 5, 4, 4, 6, 6]),
    `fixed-pairs 6p allied, ${ham} hammers`);
}

// --------------------------------------------------------------------------
console.log('\n=== Fixed-pairs (team wolf): 8 players, four pairs ===');
// --------------------------------------------------------------------------
const P8 = [[0, 1], [2, 3], [4, 5], [6, 7]];
const fp8 = (wh, sc, opts = {}) => runWolf({ players: roster(8), pairings: P8, scores: holeScores(sc), wolfHoles: { 0: wh }, opts: Object.assign({ wolfVal: 1 }, opts) });
assertEqual(fp8({ fixedPairs: true, wolfTeam: 0, allyTeams: [], hammers: 0 }, [4, 4, 5, 5, 5, 5, 5, 5]),
  [6, 6, -2, -2, -2, -2, -2, -2], 'lone pair vs three teams (6 opponents): each winner +$6, each loser -$2');
assertEqual(fp8({ fixedPairs: true, wolfTeam: 0, allyTeams: [1], hammers: 1 }, [4, 4, 4, 4, 5, 5, 5, 5]),
  [8, 8, 8, 8, -8, -8, -8, -8], 'allied (2 teams) vs 2 teams, 1 hammer: 4v4 pairwise at 2×');
for (const ham of [0, 1, 2]) {
  for (const allies of [[], [1], [1, 2]]) {
    assertZeroSum(fp8({ fixedPairs: true, wolfTeam: 0, allyTeams: allies, hammers: ham }, [3, 5, 4, 6, 5, 4, 6, 5]),
      `fixed-pairs 8p allies=${JSON.stringify(allies)}, ${ham} hammers`);
  }
}

// --------------------------------------------------------------------------
console.log('\n=== Full 18-hole team-wolf round (6 players, fixed pairs) stays zero-sum ===');
// --------------------------------------------------------------------------
(() => {
  const players = roster(6);
  const scores = {}, wolfHoles = {};
  for (let h = 0; h < 18; h++) {
    const wt = h % 3;
    const allies = h % 3 === 0 ? [] : [(wt + 1) % 3]; // alternate lone pair / allied
    wolfHoles[h] = { fixedPairs: true, wolfTeam: wt, allyTeams: allies, hammers: h % 3 };
    for (let p = 0; p < 6; p++) { scores[p] = scores[p] || {}; scores[p][h] = 3 + ((h + p) % 4); }
  }
  loadState(freshStateLiteral({
    players, holeCount: 18, pars: Array(18).fill(4), pairings: P6,
    scores, wolfHoles, gameOpts: { wolfVal: 2, lone2x: true },
  }));
  const money = call('calcWolfMoney');
  assertZeroSum(money, '18-hole fixed-pairs team-wolf round');
  console.log(`    (final settle: ${JSON.stringify(money)})`);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
