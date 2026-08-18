/**
 * Flow tests — drive the app through complete rounds in a real browser.
 *
 * These exist because of a specific bug. Wolf's uneven-team stake fields are
 * gated on `players.length >= 5 && odd`, and game setup used to run BEFORE the
 * roster was entered, so that check always saw an empty roster and the fields
 * never appeared. The money math for uneven teams was correct and well unit
 * tested; the inputs were simply unreachable.
 *
 * Nothing in the existing suite could see it. `calc.test.js` tests pure
 * functions, `ui-audit.py` reads the stylesheet, and neither walks the app. A
 * static check would not have helped either: the roster markup already came
 * before the game options in the document while the bug was live -- the break
 * was purely in which screen you reach first.
 *
 * So these tests assert on behaviour, not appearance: that a round can be set
 * up and settled, and that every control which depends on the roster is
 * actually reachable and populated by the time you need it.
 *
 *   npm run test:flows
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW = resolve(ROOT, "build/preview.html");
const NAMES = ["You", "Big Dave", "Tommy P", "Sanjay", "Rich", "Marco", "Nate", "Pete"];

if (!existsSync(PREVIEW)) {
  console.error(`missing ${PREVIEW}\nrun: python3 scripts/build-preview.py`);
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (cond, msg, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok - ${msg}`);
  } else {
    fail++;
    console.log(`  FAIL - ${msg}${detail ? `\n    ${detail}` : ""}`);
  }
};
const section = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();

/** A fresh page with a clean profile; page errors are fatal. */
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Offline: the Firebase tags are stripped, but block anything else that tries.
  await ctx.route("**://**", (r) =>
    new URL(r.request().url()).protocol === "file:" ? r.continue() : r.abort()
  );
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(() => {
    try {
      localStorage.setItem("onboarded", "1");
    } catch (e) {}
  });
  await p.goto(`file://${PREVIEW}`, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  return { ctx, p, errors };
}

const screenOf = (p) =>
  p.evaluate(
    () =>
      [...document.querySelectorAll('[id$="-screen"]')]
        .filter((e) => !e.classList.contains("hidden"))
        .map((e) => e.id)[0]
  );

/** Enter a roster on the setup screen and continue to the game screen. */
const enterRoster = (p, n, extra = {}) =>
  p.evaluate((a) => {
    state.players = a.names.slice(0, a.n).map((name) => ({ name, hdcp: 8, color: "", venmo: "" }));
    enterScreen("setup");
    if (a.holes) setHoleCount(a.holes);
    if (a.holes === 9 && typeof setNine === "function") setNine(a.nine || 0);
    if (typeof renderPlayers === "function") renderPlayers();
    document.getElementById("start-btn").click();
  }, { names: NAMES, n, ...extra });

/** Fill every hole, resolving the wolf pick each hole demands. */
const scoreEveryHole = (p) =>
  p.evaluate(() => {
    const holes = maxHole();
    for (let h = 0; h < holes; h++) {
      if (state.gameType === "wolf") {
        const w = h % state.players.length;
        state.wolfHoles[h] = { wolf: w, partners: [(w + 1) % state.players.length] };
      }
      for (let i = 0; i < state.players.length; i++) {
        state.scores[i] = state.scores[i] || {};
        state.scores[i][h] = 4 + ((h + i) % 3 === 0 ? 1 : 0);
      }
    }
    invalidateMoneyCache();
    const money = calcMoney();
    return {
      holes,
      holeStart: state.holeStart || 0,
      // Summed raw. Rounding each net first can manufacture a phantom
      // imbalance that is not in the app.
      rawSum: money.reduce((a, b) => a + b, 0),
      centSum: roundNetsToCents(money).reduce((a, b) => a + b, 0),
    };
  });

// --------------------------------------------------------------------------
section("Every game settles zero-sum, at every roster size it accepts");
// --------------------------------------------------------------------------
const GAMES = [
  "wolf", "nassau", "skins", "match", "stableford",
  "bingo", "dots", "vegas", "snake", "sixes", "none",
];
// Vegas and Sixes are 4-player formats by rule; the rest take any roster.
const EXACTLY_FOUR = new Set(["vegas", "sixes"]);

for (const game of GAMES) {
  for (const n of game === "wolf" ? [4, 5, 6] : [4, 5]) {
    const { ctx, p, errors } = await page();
    await enterRoster(p, n);
    await p.waitForTimeout(200);
    await p.evaluate((g) => selectGameType(g), game);
    await p.waitForTimeout(200);
    await p.evaluate(() => startRound());
    await p.waitForTimeout(350);

    const at = await screenOf(p);
    const mustRefuse = EXACTLY_FOUR.has(game) && n !== 4;

    if (mustRefuse) {
      ok(at === "games-screen", `${game}/${n}p: refused, with the roster still editable`, `landed on ${at}`);
    } else {
      ok(at === "scoring-screen", `${game}/${n}p: round starts`, `landed on ${at}`);
      if (at === "scoring-screen") {
        const r = await scoreEveryHole(p);
        ok(Math.abs(r.rawSum) < 1e-9, `${game}/${n}p: settles exactly zero-sum`, `sum was ${r.rawSum}`);
        ok(Math.abs(r.centSum) < 1e-9, `${game}/${n}p: cent-rounded nets stay zero-sum`, `sum was ${r.centSum}`);
      }
    }
    ok(errors.length === 0, `${game}/${n}p: no page errors`, errors[0] || "");
    await ctx.close();
  }
}

// --------------------------------------------------------------------------
section("Roster-dependent controls are reachable and populated (the regression)");
// --------------------------------------------------------------------------
{
  const { ctx, p, errors } = await page();

  // Wolf uneven stakes: offered only when the teams cannot split evenly, and
  // reachable at the point the roster is known.
  for (const [n, expected] of [[4, false], [5, true], [6, false], [7, true], [8, false]]) {
    await enterRoster(p, n);
    await p.waitForTimeout(200);
    await p.evaluate(() => selectGameType("wolf"));
    await p.waitForTimeout(250);
    const visible = await p.evaluate(() => {
      const el = document.getElementById("wolf-uneven-opts");
      if (!el) return false;
      const screen = el.closest('[id$="-screen"]');
      // Visible means: on the screen you are actually looking at, with size.
      return (
        !screen.classList.contains("hidden") && el.getBoundingClientRect().height > 0
      );
    });
    ok(
      visible === expected,
      `wolf/${n}p: uneven stake fields ${expected ? "reachable" : "hidden"}`,
      visible ? "they were visible" : "they were not reachable on the screen the user is on"
    );
  }

  // Vegas team pickers must offer the real roster, not placeholder defaults.
  await enterRoster(p, 4);
  await p.waitForTimeout(200);
  await p.evaluate(() => selectGameType("vegas"));
  await p.waitForTimeout(250);
  const vegas = await p.evaluate(() => {
    const sels = [...document.querySelectorAll(".vegas-team-sel")];
    return {
      count: sels.length,
      options: sels.map((s) => s.options.length),
      labels: sels[0] ? [...sels[0].options].map((o) => o.textContent) : [],
      roster: state.players.map((pl) => pl.name),
    };
  });
  ok(vegas.count === 4, "vegas: four team slots", `saw ${vegas.count}`);
  ok(
    vegas.options.every((n) => n === 4),
    "vegas: every slot offers the whole roster",
    JSON.stringify(vegas.options)
  );
  ok(
    vegas.roster.every((name) => vegas.labels.includes(name)),
    "vegas: slots list the real player names, not placeholders",
    `labels ${JSON.stringify(vegas.labels)}`
  );

  // Nassau team rosters, same requirement.
  await p.evaluate(() => {
    selectGameType("nassau");
    const t = document.getElementById("opt-nassau-teams");
    if (t) {
      t.checked = true;
      t.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await p.waitForTimeout(250);
  const nassauMissing = await p.evaluate(() => {
    const text = document.getElementById("game-options").innerText;
    return state.players.map((pl) => pl.name).filter((n) => !text.includes(n));
  });
  ok(nassauMissing.length === 0, "nassau: team setup lists every player", JSON.stringify(nassauMissing));

  // Stableford quota renders one row per player, with a per-player default.
  await p.evaluate(() => {
    selectGameType("stableford");
    const t = document.getElementById("opt-quota-enabled");
    t.checked = true;
    t.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await p.waitForTimeout(250);
  const quota = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("#quota-setup .game-opt")];
    return { rows: rows.length, players: state.players.length };
  });
  ok(quota.rows === quota.players, "stableford: one quota row per player", `${quota.rows} rows for ${quota.players} players`);

  ok(errors.length === 0, "roster-dependent controls: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("Changing the roster after configuring the game does not leave stale state");
// --------------------------------------------------------------------------
{
  const { ctx, p, errors } = await page();
  await enterRoster(p, 5);
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    selectGameType("wolf");
    document.getElementById("opt-wolf-team-val").value = "9";
    document.getElementById("opt-wolf-field-val").value = "7";
  });
  await p.waitForTimeout(200);
  await enterRoster(p, 4); // back to setup, drop a player, continue again
  await p.waitForTimeout(300);
  const opts = await p.evaluate(() => {
    startRound();
    return JSON.stringify(state.gameOpts);
  });
  ok(
    !/wolfTeamVal|fieldVal/.test(opts),
    "uneven stakes set at 5 players do not leak into a 4-player round",
    opts
  );
  ok(errors.length === 0, "roster change: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("Leaving the roster validates it");
// --------------------------------------------------------------------------
{
  const cases = [
    [[], "an empty roster"],
    [[{ name: "", hdcp: 0 }], "a blank name"],
    [[{ name: "Dave", hdcp: 0 }, { name: "dave", hdcp: 0 }], "two players sharing a name"],
  ];
  for (const [roster, label] of cases) {
    const { ctx, p } = await page();
    await p.evaluate((r) => {
      enterScreen("setup");
      state.players = r;
      if (typeof renderPlayers === "function") renderPlayers();
      document.getElementById("start-btn").click();
    }, roster);
    await p.waitForTimeout(300);
    ok((await screenOf(p)) === "setup-screen", `${label} keeps you on the roster screen`);
    await ctx.close();
  }
  const { ctx, p } = await page();
  await enterRoster(p, 4);
  await p.waitForTimeout(300);
  ok((await screenOf(p)) === "games-screen", "a valid roster continues to the game screen");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("Hole counts and which nine");
// --------------------------------------------------------------------------
for (const [holes, nine] of [[18, 0], [9, 0], [9, 9]]) {
  const { ctx, p, errors } = await page();
  await enterRoster(p, 4, { holes, nine });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectGameType("skins"));
  await p.evaluate(() => startRound());
  await p.waitForTimeout(350);
  const r = await scoreEveryHole(p);
  ok(r.holes === holes, `${holes} holes, nine=${nine}: plays ${holes} holes`, `got ${r.holes}`);
  ok(r.holeStart === nine, `${holes} holes, nine=${nine}: starts at hole ${nine + 1}`, `got ${r.holeStart}`);
  ok(Math.abs(r.rawSum) < 1e-9, `${holes} holes, nine=${nine}: zero-sum`, `sum ${r.rawSum}`);
  ok(errors.length === 0, `${holes} holes, nine=${nine}: no page errors`, errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("A round survives the whole trip: play, finish, settle, season");
// --------------------------------------------------------------------------
{
  const { ctx, p, errors } = await page();
  await enterRoster(p, 4);
  await p.waitForTimeout(200);
  await p.evaluate(() => selectGameType("skins"));
  await p.evaluate(() => startRound());
  await p.waitForTimeout(350);
  await scoreEveryHole(p);

  const before = await p.evaluate(
    () => Object.values(JSON.parse(localStorage.getItem("golfRounds") || "{}")).filter((r) => r.finished).length
  );
  await p.evaluate(() => finishRound());
  await p.waitForTimeout(600);

  const finished = await p.evaluate(() => {
    const rounds = JSON.parse(localStorage.getItem("golfRounds") || "{}");
    const mine = Object.values(rounds).find((r) => r.id === state.roundId);
    return {
      saved: !!(mine && mine.finished),
      money: mine ? mine.money : null,
      count: Object.values(rounds).filter((r) => r.finished).length,
      modal: !!document.querySelector(".modal:not(.hidden)"),
    };
  });
  ok(finished.saved, "the finished round is persisted");
  ok(finished.modal, "the player is shown the result");
  ok(finished.count === before + 1, "exactly one round is added to the season", `${before} -> ${finished.count}`);
  ok(
    finished.money && Math.abs(finished.money.reduce((a, b) => a + b, 0)) < 0.005,
    "the saved money is zero-sum",
    JSON.stringify(finished.money)
  );

  await p.evaluate(() => enterScreen("settle"));
  await p.waitForTimeout(400);
  ok(
    (await p.evaluate(() => document.getElementById("settle-content").textContent.trim().length)) > 0,
    "settle renders something for a played round"
  );

  await p.evaluate(() => enterScreen("season"));
  await p.waitForTimeout(400);
  ok(
    (await p.evaluate(() => document.querySelectorAll("#history-list .round-card").length)) === finished.count,
    "the season lists every finished round"
  );
  ok(errors.length === 0, "full trip: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("Resuming and watching a live round");
// --------------------------------------------------------------------------
{
  const { ctx, p, errors } = await page();
  await p.evaluate(() => enterScreen("home"));
  await p.waitForTimeout(400);
  const resumed = await p.evaluate(() => {
    const card = document.querySelector('#resume-card [onclick*="loadRound"]');
    if (!card) return false;
    card.click();
    return true;
  });
  ok(resumed, "home offers a live round to resume");
  await p.waitForTimeout(600);
  ok((await screenOf(p)) === "scoring-screen", "resuming opens the scorecard");
  ok(
    (await p.evaluate(() => document.querySelectorAll(".rib-amt, .money-val").length)) > 0,
    "the resumed round shows money"
  );

  await p.evaluate(() => enterScreen("watch"));
  await p.waitForTimeout(500);
  ok(
    (await p.evaluate(() => document.querySelectorAll("#watch-content .lb-row").length)) > 0,
    "watch shows a leaderboard row per player"
  );
  ok(errors.length === 0, "resume/watch: no page errors", errors[0] || "");
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
