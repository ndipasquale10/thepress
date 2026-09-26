// committed app never sets - production ships no demo UI and touches nothing.
const DEMO_PLAYERS = [
  { name: "You", color: "#3f9a6e", hdcp: 11.4, venmo: "@you-golf", cashapp: "yougolf" },
  { name: "Big Dave", color: "#a8883f", hdcp: 6.2, venmo: "@bigdave" },
  { name: "Tommy P", color: "#5c81b5", hdcp: 14.8 },
  { name: "Sanjay", color: "#a05f4d", hdcp: 9.1, venmo: "@sanjay-g" },
];
const DEMO_COURSES = [
  { name: "CommonGround G.C.", pars: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4] },
  { name: "City Park G.C.", pars: [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4] },
  { name: "Fossil Trace G.C.", pars: [4, 3, 5, 4, 4, 3, 4, 5, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4] },
];
// Deterministic PRNG so the demo season - and the handicaps derived from it -
// stay identical across reloads and republishes.
function _demoRng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 1831565813) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    return (
      (r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r),
      ((r ^ (r >>> 14)) >>> 0) / 4294967296
    );
  };
}
function _demoRound(i, rng, finished) {
  const c = DEMO_COURSES[i % DEMO_COURSES.length],
    games = ["wolf", "skins", "nassau"],
    g = games[i % games.length],
    holes = finished ? 18 : 18,
    played = finished ? 18 : 7,
    scores = {},
    bonusPoints = {},
    wolfHoles = {};
  DEMO_PLAYERS.forEach((p, pi) => {
    scores[pi] = {};
    bonusPoints[pi] = {};
    // skill offset: lower handicap scores better, plus per-round form
    // Aim at a believable total for this player's handicap (~hdcp*0.9+3 over par),
    // with a little round-to-round form so the numbers are not identical every week.
    const q = Math.max(0.35, Math.min(1.1, (p.hdcp * 0.9 + 3) / 18 + (rng() - 0.5) * 0.18));
    const pB = Math.max(0.02, 0.16 - q * 0.11),
      pP = Math.max(0.12, 0.52 - q * 0.3),
      pBo = 0.38;
    for (let h = 0; h < played; h++) {
      const r = rng();
      let d;
      r < pB ? (d = -1) : r < pB + pP ? (d = 0) : r < pB + pP + pBo ? (d = 1) : (d = 2);
      scores[pi][h] = Math.max(2, c.pars[h] + d);
    }
  });
  if ("wolf" === g)
    for (let h = 0; h < played; h++) {
      const w = h % DEMO_PLAYERS.length,
        r = rng();
      wolfHoles[h] =
        r < 0.18
          ? { wolf: w, partners: [], hammers: 0 }
          : {
              wolf: w,
              partners: [(w + 1 + Math.floor(rng() * 3)) % DEMO_PLAYERS.length],
              hammers: rng() < 0.15 ? 1 : 0,
            };
    }
  const day = new Date(2026, 2 + Math.floor(i * 1.4), 4 + ((i * 5) % 22), 15, 30).toISOString();
  return {
    id: "demo_" + i,
    course: c.name,
    gameType: g,
    gameOpts:
      "wolf" === g
        ? { wolfVal: 2, lone2x: !0, blind3x: !1, fixedPairs: !1 }
        : "skins" === g
          ? { skinVal: 2, carry: !0 }
          : { front: 5, back: 5, overall: 5, press: !1, pressVal: 5, nassauTeams: !1 },
    sideBets: {
      skins: { on: "skins" !== g && i % 2 === 0, val: 2, carry: !0 },
      snake: { on: i % 3 === 0, val: 5 },
      junk: { on: i % 2 === 1, val: 2 },
    },
    players: DEMO_PLAYERS.map((p) => ({ ...p })),
    pars: c.pars.slice(),
    hdcps: Array.from({ length: 18 }, (_, k) => k + 1),
    scores: scores,
    bonusPoints: bonusPoints,
    wolfHoles: wolfHoles,
    confirmedHoles: {},
    pairings: [],
    pairingsLocked: !1,
    matchPresses: [],
    handicapMode: "full",
    selectedTee: null,
    currentHole: finished ? 17 : played,
    started: !0,
    holeCount: 18,
    holeStart: 0,
    date: day,
    finished: !!finished,
  };
}
function seedDemoData() {
  if (!window.__PRESS_DEMO__) return 0;
  const rng = _demoRng(1977),
    rounds = {};
  for (let i = 0; i < 8; i++) {
    const r = _demoRound(i, rng, !0),
      saved = state,
      keep = JSON.parse(JSON.stringify(state));
    // Settle each round through the app's own money math, then restore live state.
    Object.assign(state, {
      players: r.players,
      scores: r.scores,
      pars: r.pars,
      hdcps: r.hdcps,
      gameType: r.gameType,
      gameOpts: r.gameOpts,
      sideBets: r.sideBets,
      bonusPoints: r.bonusPoints,
      wolfHoles: r.wolfHoles,
      matchPresses: [],
      pairings: [],
      handicapMode: "full",
      holeCount: 18,
      holeStart: 0,
      selectedTee: null,
    });
    (invalidateHdcpCache(), invalidateMoneyCache());
    ((r.money = roundNetsToCents(calcMoney())),
      (r.debts = computeSettlement(r.money)),
      (r.finishedDate = r.date));
    (Object.assign(state, keep), invalidateHdcpCache(), invalidateMoneyCache());
    rounds[r.id] = r;
  }
  const live = _demoRound(8, rng, !1);
  ((live.id = "demo_live"), (live.course = "Arrowhead G.C."), (rounds[live.id] = live));
  safeSetItem("golfRounds", JSON.stringify(rounds));
  safeSetItem(
    "golfProfiles",
    JSON.stringify(
      DEMO_PLAYERS.map((p) => ({
        name: p.name,
        hdcp: p.hdcp,
        color: p.color,
        venmo: p.venmo || "",
        cashapp: p.cashapp || "",
        paypal: "",
      })),
    ),
  );
  safeSetItem("primaryPlayer", "You");
  safeSetItem("onboarded", "1");
  return Object.keys(rounds).length;
}
function loadDemoSeason() {
  const n = seedDemoData();
  (closeModal("settings-modal"),
    updateNavCounts(),
    enterScreen("home"),
    showToast("Loaded a demo season — " + n + " rounds."));
}
function clearDemoData() {
  if (!window.__PRESS_DEMO__) return;
  (["golfRounds", ACTIVE_KEY, "golfProfiles", "primaryPlayer"].forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  }),
    closeModal("settings-modal"),
    updateNavCounts(),
    enterScreen("home"),
    showToast("Demo data cleared."));
}
