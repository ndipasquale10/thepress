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
async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
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
      if (state.gameType === "banker" && h === 0) {
        // Banker's first hole needs an explicit pick; the rest rotate off results.
        state.bankerHoles = state.bankerHoles || {};
        state.bankerHoles[0] = 0;
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
  "bingo", "dots", "vegas", "snake", "sixes", "banker", "none",
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

// --------------------------------------------------------------------------
section("A screen change starts at the top of that screen");
// --------------------------------------------------------------------------
// Scroll position used to carry across screens, so tapping a tab from halfway
// down one screen dropped you into the middle of the next. Where it happened to
// look right, that was only the browser clamping to a shorter page.
{
  const { ctx, p, errors } = await page();
  const toBottom = () =>
    p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrollY = () => p.evaluate(() => Math.round(window.scrollY));

  for (const tab of ["games", "settle", "you", "home"]) {
    await toBottom(p);
    await p.waitForTimeout(150);
    await p.evaluate((t) => document.querySelector(`.nav-tab[data-screen="${t}"]`).click(), tab);
    await p.waitForTimeout(350);
    ok((await scrollY()) === 0, `the ${tab} tab opens at the top`, `scrollY was ${await scrollY()}`);
  }

  // Same for the in-page routes, which are separate code paths.
  await p.evaluate(() => enterScreen("home"));
  await toBottom(p);
  await p.waitForTimeout(150);
  await p.evaluate(() =>
    [...document.querySelectorAll("#home-screen .btn")]
      .find((b) => /Start a New Round/.test(b.textContent))
      ?.click()
  );
  await p.waitForTimeout(350);
  ok((await scrollY()) === 0, "starting a new round opens at the top");

  await toBottom(p);
  await p.waitForTimeout(150);
  await p.evaluate(() => document.getElementById("start-btn").click());
  await p.waitForTimeout(350);
  ok((await scrollY()) === 0, "continuing to game setup opens at the top");

  // ...but a deliberate scroll must still work.
  await p.evaluate(() => {
    const c = document.querySelector('#resume-card [onclick*="loadRound"]');
    if (c) c.click();
  });
  await p.waitForTimeout(600);
  const dots = await p.evaluate(() => document.querySelectorAll(".hole-dot").length);
  if (dots > 11) {
    await p.evaluate(() => document.querySelectorAll(".hole-dot")[11].click());
    await p.waitForTimeout(800);
    const top = await p.evaluate(() => {
      const el = document.getElementById("hole-info");
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    });
    ok(Math.abs(top) < 160, "tapping a hole still scrolls its header into view", `header at ${top}px`);
  }
  ok(errors.length === 0, "screen scrolling: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("An open modal holds the page still behind it");
// --------------------------------------------------------------------------
// Without a scroll lock a thumb on the backdrop scrolls the page underneath, so
// closing the modal leaves you somewhere else entirely. Measured on where the
// content actually sits, not window.scrollY -- the lock pins the body, which
// legitimately reports scrollY 0 while the page has not moved.
{
  const { ctx, p, errors } = await page();
  await p.evaluate(() => enterScreen("season"));
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(200);

  const markY = () =>
    p.evaluate(() => {
      const el = document.querySelectorAll("#history-list .round-card")[2];
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    });

  const before = await markY();
  await p.evaluate(() => document.querySelector("#history-list .round-card")?.click());
  await p.waitForTimeout(600);
  const during = await markY();
  ok(Math.abs(during - before) < 3, "opening a modal does not jump the page", `moved ${during - before}px`);

  await p.evaluate(() => {
    window.scrollBy(0, 400);
    document.documentElement.scrollTop += 400;
    document.body.scrollTop += 400;
  });
  await p.waitForTimeout(300);
  const after = await markY();
  ok(after === during, "the page cannot be scrolled behind an open modal", `moved ${after - during}px`);

  await p.evaluate(() => {
    const m = document.querySelector(".modal:not(.hidden)");
    if (m) closeModal(m.id);
  });
  await p.waitForTimeout(500);
  ok(Math.abs((await markY()) - before) < 3, "closing a modal restores your place exactly");
  ok(
    (await p.evaluate(() => getComputedStyle(document.body).position)) !== "fixed",
    "the lock releases the body when the modal closes"
  );
  ok(errors.length === 0, "modal scroll lock: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("The Wolf pick checkmark is a badge, not a blob");
// --------------------------------------------------------------------------
// The chips carry a hit-area expander on one pseudo-element and the selected
// checkmark on the other. They shared ::after once, and the expander's
// min-width/min-height and centring leaked into the badge: an 18px corner tick
// became a 44px circle floating over the chip and the heading above it. The
// static audit catches that exact selector clash; this catches any other
// property that starts leaking, and proves the tap target survived the move.
{
  const { ctx, p, errors } = await page();
  await enterRoster(p, 4);
  await p.evaluate(() => selectGameType("wolf"));
  await p.waitForTimeout(300);
  await p.evaluate(() => startRound());
  await p.waitForTimeout(600);
  await p.evaluate(() =>
    document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"))
  );
  await p.waitForTimeout(200);

  const chips = await p.evaluate(() => document.querySelectorAll(".wolf-pick").length);
  ok(chips > 0, "the wolf pick chips are on the scoring screen", `found ${chips}`);

  const tap = await p.evaluate(() =>
    [...document.querySelectorAll(".wolf-pick")].map((el) => {
      const cs = getComputedStyle(el, "::before");
      return Math.round(Math.min(parseFloat(cs.width), parseFloat(cs.height)));
    })
  );
  ok(tap.length > 0 && tap.every((v) => v >= 44), "every chip keeps a 44px hit area", `got ${tap}`);

  for (const i of [0, 1, 2]) {
    await p.evaluate((k) => document.querySelectorAll(".wolf-pick")[k].click(), i);
    await p.waitForTimeout(200);
    const badges = await p.evaluate(() =>
      [...document.querySelectorAll(".wolf-pick")]
        .filter((e) => e.classList.contains("selected"))
        .map((e) => {
          const c = getComputedStyle(e, "::after");
          return { w: parseFloat(c.width), h: parseFloat(c.height), t: c.transform };
        })
    );
    ok(badges.length === 1, `pick ${i}: exactly one chip shows a checkmark`, `got ${badges.length}`);
    ok(
      badges.every((b) => b.w <= 20 && b.h <= 20),
      `pick ${i}: the checkmark stays badge-sized`,
      JSON.stringify(badges)
    );
    ok(
      badges.every((b) => b.t === "none"),
      `pick ${i}: the checkmark is not dragged off its corner`,
      JSON.stringify(badges.map((b) => b.t))
    );
  }
  ok(errors.length === 0, "wolf pick badge: no page errors", errors[0] || "");
  await ctx.close();
}

/**
 * A sparkline's canvas backing store has to match its CSS box times the device
 * pixel ratio in BOTH axes. drawSparkline used to scale width by dpr and leave
 * height alone, while scaling the drawing context by dpr in both -- so half the
 * curve was drawn past the bottom of the buffer, clipped away, and CSS stretched
 * the surviving top half to fill the box. It rendered correctly at dpr 1, which
 * is a desktop browser, and wrong at 2x and 3x, which is every phone this app is
 * actually used on. That asymmetry is why it survived: it is invisible in the
 * one place it gets looked at. Assert the invariant at the ratios real devices
 * report, not at the one the developer's monitor does.
 */
section("Sparklines fill their canvas at every device pixel ratio");
for (const dpr of [2, 3]) {
  const { ctx, p, errors } = await page({ deviceScaleFactor: dpr });
  await p.evaluate(() => showScreen("you"));
  await p.waitForTimeout(600);
  const cv = await p.evaluate(() => {
    const c = document.getElementById("hcp-spark");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: r.width, cssH: r.height };
  });
  ok(cv !== null, `${dpr}x: the handicap sparkline renders on the You screen`);
  if (cv) {
    ok(
      cv.h === Math.round(cv.cssH * dpr),
      `${dpr}x: sparkline backing height covers the whole CSS box`,
      `backing ${cv.h}px for a ${cv.cssH}px box at ${dpr}x -- expected ${Math.round(cv.cssH * dpr)}, so the curve is clipped`
    );
    ok(
      cv.w === Math.round(cv.cssW * dpr),
      `${dpr}x: sparkline backing width covers the whole CSS box`,
      `backing ${cv.w}px for a ${cv.cssW}px box at ${dpr}x`
    );
  }
  ok(errors.length === 0, `${dpr}x: no page errors`, errors[0] || "");
  await ctx.close();
}

/**
 * Course names are free text, and they do not only come from the person
 * looking at the screen -- a round arrives from sync or a shared live round
 * carrying whatever course name its author typed. Two of the six places that
 * render state.course interpolated it straight into HTML while the other four
 * escaped it, so a name like `<img src=x onerror=...>` built a real element
 * and ran its handler in the viewer's page. Player names in the very same
 * results template were already escaped, which is what made it look deliberate
 * and survive.
 */
section("A hostile course name renders as text, not markup");
{
  const { ctx, p, errors } = await page();
  const res = await p.evaluate(async () => {
    const all = JSON.parse(localStorage.getItem("golfRounds"));
    const fid = Object.keys(all).find((k) => all[k].finished);
    all[fid].course = '<img src=x onerror="window.__XSS=1">Pebble';
    localStorage.setItem("golfRounds", JSON.stringify(all));
    await viewFinishedRound(fid);
    await new Promise((r) => setTimeout(r, 700));
    const el = document.querySelector(".results-course");
    return {
      rendered: !!el,
      elements: el ? el.querySelectorAll("*").length : -1,
      executed: !!window.__XSS,
      text: el ? el.textContent : "",
    };
  });
  ok(res.rendered, "the results header renders a course name");
  ok(res.elements === 0, "the course name creates no child elements", `built ${res.elements}`);
  ok(!res.executed, "no injected handler runs");
  ok(res.text.includes("<img"), "the raw name is shown literally as text", res.text);
  ok(errors.length === 0, "hostile course name: no page errors", errors[0] || "");
  await ctx.close();
}

/**
 * Three ways a round can arrive malformed and be rendered anyway. The importer
 * accepts any JSON with a `rounds` object, and Firebase sync and the live share
 * code deliver rounds nobody on this device typed, so "the app wrote it" is not
 * a shape guarantee. A finished round whose money is not one finite number per
 * player still reaches seasonAgg and lands in the season table as -$NaN; a
 * round with no date renders the literal string "Invalid Date".
 */
section("Malformed rounds are refused rather than rendered");
{
  const { ctx, p, errors } = await page();
  const res = await p.evaluate(async () => {
    const shapes = {
      noPlayers:   { id: "m1", finished: true },
      nullPlayers: { id: "m2", finished: true, players: null, money: null },
      lenMismatch: { id: "m3", finished: true, players: [{ name: "X" }], money: [1, 2, 3] },
      nonNumeric:  { id: "m4", finished: true, players: [{ name: "Y" }], money: ["a"] },
      nanMoney:    { id: "m5", finished: true, players: [{ name: "Z" }], money: [NaN] },
    };
    const legit = {
      finishedRound: { id: "g", finished: true, players: [{ name: "A" }, { name: "B" }], money: [5, -5] },
      liveRound:     { id: "l", started: true, players: [{ name: "A" }] },
    };
    const verdicts = {};
    for (const [k, v] of Object.entries({ ...shapes, ...legit })) verdicts[k] = importableRound(v);

    // Only the survivors reach storage, exactly as the importer now does it.
    const all = JSON.parse(localStorage.getItem("golfRounds"));
    const clean = {};
    for (const [k, v] of Object.entries(shapes)) if (importableRound(v)) clean[k] = v;
    localStorage.setItem("golfRounds", JSON.stringify({ ...all, ...clean }));
    showScreen("home");
    await new Promise((r) => setTimeout(r, 600));
    const shown = document.querySelector("#home-content")?.innerText || "";
    return { verdicts, admitted: Object.keys(clean).length, nan: /NaN/.test(shown) };
  });
  for (const bad of ["noPlayers", "nullPlayers", "lenMismatch", "nonNumeric", "nanMoney"]) {
    ok(res.verdicts[bad] === false, `import refuses a round with ${bad}`);
  }
  ok(res.verdicts.finishedRound === true, "import keeps a well-formed finished round");
  ok(res.verdicts.liveRound === true, "import keeps a live round that has no money yet");
  ok(res.admitted === 0, "none of the malformed rounds reach storage", `${res.admitted} got in`);
  ok(!res.nan, "the season table renders no NaN");
  ok(errors.length === 0, "malformed rounds: no page errors", errors[0] || "");
  await ctx.close();
}

section("A round with no date does not render \"Invalid Date\"");
{
  const { ctx, p, errors } = await page();
  const res = await p.evaluate(async () => {
    const all = JSON.parse(localStorage.getItem("golfRounds"));
    const src = Object.values(all).find((r) => r.finished);
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = "nodate";
    delete clone.date;
    delete clone.finishedDate;
    all.nodate = clone;
    localStorage.setItem("golfRounds", JSON.stringify(all));
    showScreen("season");
    await new Promise((r) => setTimeout(r, 700));
    const t = document.getElementById("history-list")?.innerText || "";
    return { invalid: /Invalid Date/.test(t), dash: t.includes("\u2014") };
  });
  ok(!res.invalid, 'no row shows the literal "Invalid Date"');
  ok(res.dash, "a dateless round falls back to an em dash");
  ok(errors.length === 0, "dateless round: no page errors", errors[0] || "");
  await ctx.close();
}

/**
 * calcNassauMoney only creates the Back 9 segment when maxHole() > 9, and
 * showHoleResult guards the same way -- so on a nine-hole round that bet is
 * deliberately discarded. The setup screen still offered the input, which meant
 * you could stake money on a segment the engine had already decided to ignore.
 */
section("A nine-hole round offers only the bet that settles");
{
  const { ctx, p, errors } = await page();
  const shape = (holes) =>
    p.evaluate(async (h) => {
      showScreen("setup");
      await new Promise((r) => setTimeout(r, 200));
      setHoleCount(h);
      setNine(0);
      showScreen("games");
      await new Promise((r) => setTimeout(r, 200));
      selectGameType("nassau");
      await new Promise((r) => setTimeout(r, 350));
      return {
        back: !!document.getElementById("opt-back"),
        front: !!document.getElementById("opt-front"),
        overall: !!document.getElementById("opt-overall"),
      };
    }, holes);
  const eighteen = await shape(18);
  const nine = await shape(9);
  ok(eighteen.back && eighteen.overall, "eighteen holes offers back nine and overall");
  ok(!nine.back, "nine holes does not offer a back-nine bet");
  ok(!nine.overall, "nine holes does not offer an overall bet either — Overall is an eighteen-hole bet");
  ok(nine.front, "nine holes offers the one bet that settles: the match");
  ok(errors.length === 0, "nine-hole nassau: no page errors", errors[0] || "");
  await ctx.close();
}

/**
 * The home screen used to be an index: a season total, a static ranking, two
 * buttons. It reported state and told no story -- the number had no trajectory,
 * the round you played on Saturday was invisible, and the rivalries and streaks
 * the app already computes lived on other tabs. These assertions cover the
 * story it tells now, and -- just as important -- that rebuilding it kept the
 * group table's collapse, edit mode and remove buttons working.
 */
section("The home screen tells the season's story");
{
  const { ctx, p, errors } = await page();
  // A season where the rival leads early, then you win the last three and pass them.
  const built = await p.evaluate(async () => {
    const me = getPrimaryPlayerName();
    const names = [me, "Rival R"];
    const rounds = {};
    [[-30, 30], [-30, 30], [-10, 10], [25, -25], [30, -30], [40, -40]].forEach((money, i) => {
      const iso = new Date(2026, 0, i + 1).toISOString();
      rounds["s" + i] = { id: "s" + i, finished: true, course: "Test GC", gameType: "skins",
        date: iso, finishedDate: iso, scores: {},
        players: names.map((n, k) => ({ name: n, color: k })), money };
    });
    localStorage.setItem("golfRounds", JSON.stringify(rounds));
    showScreen("home");
    await new Promise((r) => setTimeout(r, 700));
    const t = document.querySelector("#home-content").innerText;
    return {
      spark: !!document.getElementById("ss-spark"),
      delta: /\+\$40 last round/.test(t),
      heater: /3-round heater/.test(t),
      lastOut: document.querySelector(".lr-name")?.textContent || "",
      lastOutOpens: (document.querySelector(".lr-card")?.getAttribute("onclick") || "").includes("viewFinishedRound"),
      moves: [...document.querySelectorAll(".lb-move")].map((e) => e.textContent),
      rivalAmt: document.querySelector(".rv-amt")?.textContent || "",
    };
  });
  ok(built.spark, "the season total carries a sparkline of the money by round");
  ok(built.delta, "the hero names what the last round did to you");
  ok(built.heater, "a winning streak surfaces as a heater chip");
  ok(built.lastOut.includes("took it"), "the last round played is on the home screen", built.lastOut);
  ok(built.lastOutOpens, "tapping it opens that round's results");
  ok(built.moves.join(",") === "▲1,▼1", "the table shows rank movement since the last round", built.moves.join(","));
  ok(/up on them/.test(built.rivalAmt), "a rival line names where you stand head to head", built.rivalAmt);

  // Rebuilding renderHome must not have cost the group table its controls.
  const kept = await p.evaluate(async () => {
    toggleGroupTable(); await new Promise((r) => setTimeout(r, 200));
    const collapsed = !document.getElementById("lb-body");
    toggleGroupTable(); await new Promise((r) => setTimeout(r, 200));
    const reopened = !!document.getElementById("lb-body");
    toggleGroupEdit(); await new Promise((r) => setTimeout(r, 200));
    const editing = !!document.querySelector(".lb-card.is-editing");
    const removable = !!document.querySelector(".lb-del[data-name]");
    const movesHidden = !document.querySelector(".lb-move");
    toggleGroupEdit(); await new Promise((r) => setTimeout(r, 200));
    return { collapsed, reopened, editing, removable, movesHidden };
  });
  ok(kept.collapsed, "the group table still collapses");
  ok(kept.reopened, "and reopens");
  ok(kept.editing && kept.removable, "edit mode still offers a remove button");
  ok(kept.movesHidden, "rank movement steps aside for the remove buttons in edit mode");
  ok(errors.length === 0, "home screen: no page errors", errors[0] || "");
  await ctx.close();
}

/**
 * The card. You set the stakes on the game screen, and until now you did that
 * with no idea who was hot, who owns you, or how this particular course has
 * treated you -- all of which the app already knew, on the You and Season tabs,
 * nowhere near the moment it matters. The interesting assertions here are the
 * quiet ones: a group with no history gets no card rather than an empty shell,
 * and a player name is data, not markup.
 */
section("The card reads the roster back before the stakes are set");
{
  const { ctx, p, errors } = await page();
  const open = (players, course) =>
    p.evaluate(async (a) => {
      state.players = a.players.map((n, i) => ({ name: n, color: i }));
      state.course = a.course;
      showScreen("games");
      await new Promise((r) => setTimeout(r, 450));
      const el = document.getElementById("the-card");
      return { html: el.innerHTML, text: el.innerText, imgs: el.querySelectorAll("img").length };
    }, { players, course });

  const full = await open(["You", "Big Dave", "Tommy P", "Sanjay"], "City Park G.C.");
  ok(/THE CARD|The card/i.test(full.text), "the card renders for a group with history");
  ok(/vs you/.test(full.text), "it names each player's head-to-head record against you");
  ok(/down to you|up on you|all square/.test(full.text),
    "the head-to-head money says which way it runs, rather than a bare signed number", full.text.slice(0, 120));
  ok(/R here/.test(full.text), "it shows how this course has treated each player");
  ok(/City Park/.test(full.text), "the course is named once the group has played it");
  ok(/up\b/.test(full.text) || /down\b/.test(full.text), "a run of results surfaces as a streak");

  const noCourse = await open(["You", "Big Dave"], "");
  ok(!/R here/.test(noCourse.text), "no course, no course line");

  const unplayed = await open(["You", "Big Dave"], "Never Played GC");
  ok(!/R here/.test(unplayed.text), "a course nobody has played gets no course line");

  const newcomer = await open(["You", "Brand New"], "City Park G.C.");
  ok(/first round with the group/.test(newcomer.text), "someone with no history is called out, not left blank");

  const hostile = await open(['<img src=x onerror="window.__TCX=1">Bad', "You"], "City Park G.C.");
  const ran = await p.evaluate(() => !!window.__TCX);
  ok(hostile.imgs === 0, "a hostile player name builds no elements", `built ${hostile.imgs}`);
  ok(!ran, "and runs no handler");
  ok(/<img/.test(hostile.text), "it is shown literally as text");

  // A group with nothing behind it should get no card at all -- an empty
  // bordered shell above the game picker is worse than nothing.
  const empty = await p.evaluate(async () => {
    const saved = localStorage.getItem("golfRounds");
    localStorage.setItem("golfRounds", "{}");
    state.players = [{ name: "You", color: 0 }, { name: "Someone", color: 1 }];
    state.course = "Anywhere";
    showScreen("games");
    await new Promise((r) => setTimeout(r, 450));
    const html = document.getElementById("the-card").innerHTML;
    localStorage.setItem("golfRounds", saved);
    return html;
  });
  ok(empty === "", "a group with no finished rounds gets no card at all", `got ${empty.length} chars`);
  ok(errors.length === 0, "the card: no page errors", errors[0] || "");
  await ctx.close();
}


// --------------------------------------------------------------------------
section("The scoring screen reports your round, and shows the stroke");
// --------------------------------------------------------------------------
// Driven through the DOM and pre-existing globals only: a test that calls the
// helper it is testing cannot tell you the old behaviour was wrong.
{
  const { ctx, p, errors } = await page();
  await enterRoster(p, 4);
  await p.waitForTimeout(200);
  // Nassau lists every player in the hole-result overlay, which is where the
  // gross/net labelling shows.
  await p.evaluate(() => { selectGameType("nassau"); startRound(); });
  await p.waitForTimeout(300);

  // The strip is "how did I do here", so it has to read the phone owner's
  // card. It was hardcoded to state.scores[0]: give player 3 a birdie and
  // player 1 a double, and the strip used to report the double.
  const dots = await p.evaluate(() => {
    localStorage.setItem("primaryPlayer", state.players[2].name);
    state.players.forEach((_, i) => { state.scores[i][0] = state.pars[0] + (i === 2 ? -1 : 2); });
    state.currentHole = 8; // the current hole is drawn active, so park it away
    renderHoleDots();
    return document.querySelector(".hole-dot").className;
  });
  ok(/dot-under/.test(dots), "the strip reports the phone owner's hole, not player 1's", dots);

  const orphan = await p.evaluate(() => {
    state.players.forEach((_, i) => { state.scores[i][1] = i === 0 ? null : state.pars[1]; });
    renderHoleDots();
    return document.querySelectorAll(".hole-dot")[1].className;
  });
  ok(/dot-par/.test(orphan), "a hole only player 1 skipped is not reported as unplayed", orphan);

  // Gross number, net label: a 4 and a stroke-adjusted 5 both printed
  // "(Birdie)", on the screen that announces the money. Hole 4 is stroke
  // index 1, so anyone getting shots is getting one here.
  const seen = await p.evaluate(async () => {
    const ph = getPlayingHandicaps();
    const strokes = state.players.map((_, i) => getStrokesOnHole(ph[i], 3));
    state.players.forEach((_, i) => { state.scores[i][3] = state.pars[3]; });
    state.currentHole = 3;
    await confirmHoleScores(3);
    await new Promise((r) => setTimeout(r, 300));
    return { strokes, rows: [...document.querySelectorAll(".hr-score")].map((e) => e.textContent.trim()) };
  });
  const stroking = seen.strokes.filter((n) => n > 0).length;
  ok(seen.rows.length === 4, "the overlay lists the whole group", seen.rows.join(" | "));
  ok(stroking > 0 && stroking < 4, "the roster has both stroking and scratch players", seen.strokes.join(","));

  const arrows = seen.rows.filter((t) => /→/.test(t));
  ok(arrows.length === stroking, "every player getting a shot shows gross and net", seen.rows.join(" | "));
  ok(
    arrows.every((t) => /^(\d+) → (\d+) \(/.test(t) && RegExp.$1 !== RegExp.$2),
    "written as gross, then the net it settles on, then the label",
    arrows.join(" | ")
  );
  ok(
    seen.rows.filter((t) => !/→/.test(t)).length === 4 - stroking,
    "players without a shot keep the single number",
    seen.rows.join(" | ")
  );

  ok(errors.length === 0, "scoring screen: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("Building a roster from the player database");
// --------------------------------------------------------------------------
// Adding four regulars used to leave a roster of eight -- four names plus the
// four "Player N" placeholders the app seeds -- and nothing stopped two of
// them wearing the same avatar colour, which is the only thing telling players
// apart in the ribbon, the scorecard and the settlement rows.
{
  const { ctx, p, errors } = await page();
  const NAMES10 = ["Ann", "Bo", "Cy", "Di", "Ed", "Fi", "Gus", "Hal", "Ivy", "Jo"];
  // The fixed auth banner and tab bar overlay the roster card, so a real
  // pointer click lands on them. Drive the same elements through the DOM --
  // still no calls into the helpers under test.
  const tap = (sel) =>
    p.evaluate((q) => { const el = document.querySelector(q); if (!el) return false; el.click(); return true; }, sel);
  const type = (sel, v) =>
    p.evaluate(
      ({ q, val }) => {
        const el = document.querySelector(q);
        if (!el) return false;
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { q: sel, val: v }
    );
  const reset = () =>
    p.evaluate((ns) => {
      localStorage.setItem(
        "golfProfiles",
        JSON.stringify(ns.map((name, i) => ({ name, hdcp: i, colorIdx: 0 })))
      );
      enterScreen("setup");
      state.players = [];
      addPlayer(); addPlayer(); addPlayer(); addPlayer();
      renderPlayers();
    }, NAMES10);

  await reset();

  // Click the chips the way a user does. Every seeded profile carries
  // colorIdx 0, so keeping it would paint the whole roster one colour.
  for (let i = 0; i < 4; i++) {
    await tap(".saved-profile-btn");
    await p.waitForTimeout(60);
  }
  const filled = await p.evaluate(() => ({
    names: state.players.map((x) => x.name),
    colours: state.players.map((x) => colorIdxOf(x)),
  }));
  ok(filled.names.length === 4, "four taps fill the four blank slots, not append to them", filled.names.join(","));
  ok(!filled.names.some((n) => /^Player \d+$/.test(n)), "no placeholder survives", filled.names.join(","));
  ok(new Set(filled.colours).size === 4, "no two players share an avatar colour", filled.colours.join(","));

  const mixed = await p.evaluate(() => {
    addPlayer();
    return state.players.map((x) => colorIdxOf(x));
  });
  ok(new Set(mixed).size === mixed.length, "a hand-added player takes a free colour", mixed.join(","));

  // A long database must not push the roster itself off the screen.
  await reset();
  const capped = await p.evaluate(() => ({
    chips: document.querySelectorAll(".saved-profile-btn").length,
    more: !!document.querySelector(".pdb-more"),
    search: !!document.querySelector(".pdb-search"),
  }));
  ok(capped.chips <= 8, "a long database shows a capped list", `${capped.chips} chips`);
  ok(capped.more, "with a way to see the rest");
  ok(capped.search, "a long database offers a search box");

  if (capped.search) {
    await type(".pdb-search", "iv");
    await p.waitForTimeout(120);
    const hits = await p.evaluate(() =>
      [...document.querySelectorAll(".saved-profile-btn")].map((b) => b.textContent)
    );
    ok(hits.length === 1 && /Ivy/.test(hits[0]), "search narrows the database", hits.join(","));
    await type(".pdb-search", "");
    await p.waitForTimeout(120);
  }

  // One row, one tap -- this used to be two sequential modal prompts.
  await tap(".manage-profiles-btn");
  await p.waitForTimeout(120);
  const hasRow = await p.evaluate(() => !!document.querySelector(".mp-new-name"));
  ok(hasRow, "Manage offers an inline row for a new player");
  if (hasRow) {
    await type(".mp-new-name", "Wendell");
    await type(".mp-new-hdcp", "+2");
    await tap(".mp-new-go");
    await p.waitForTimeout(200);
    const added = await p.evaluate(() => ({
      saved: getSavedProfiles().find((x) => x.name === "Wendell"),
      roster: state.players.map((x) => x.name),
    }));
    ok(!!added.saved, "the inline row saves a new player to the database");
    ok(added.saved && added.saved.hdcp === -2, "a plus handicap is stored as a plus handicap", String(added.saved && added.saved.hdcp));
    ok(added.roster.includes("Wendell"), "and puts them in the round you are setting up", added.roster.join(","));
  }


  // The likeliest roster by a mile is the same names as last Saturday, so it
  // should be one tap rather than four searches.
  await reset();
  const offer = await p.evaluate(() => {
    const b = document.querySelector(".pdb-group");
    return b ? b.textContent.replace(/\s+/g, " ").trim() : null;
  });
  ok(!!offer, "a previous round is offered as a one-tap group", String(offer));
  if (offer) {
    await tap(".pdb-group");
    await p.waitForTimeout(200);
    const grouped = await p.evaluate(() => ({
      names: state.players.map((x) => x.name),
      colours: state.players.map((x) => colorIdxOf(x)),
    }));
    ok(grouped.names.length >= 2, "tapping it builds the roster", grouped.names.join(","));
    ok(
      !grouped.names.some((n) => /^Player \d+$/.test(n)) || grouped.names.length === 4,
      "and fills the blank slots rather than appending past them",
      grouped.names.join(",")
    );
    ok(
      new Set(grouped.colours).size === grouped.colours.length,
      "the group arrives in distinct colours",
      grouped.colours.join(",")
    );
    ok(
      offer.split(",").length >= 2 && grouped.names.some((n) => offer.includes(n)),
      "the names it promised are the names it added",
      `${offer} -> ${grouped.names.join(",")}`
    );
  }

  ok(errors.length === 0, "player database: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("The database cannot reopen the locked roster");
// --------------------------------------------------------------------------
// Scores and bets are keyed by player index, which is why addPlayer and
// removePlayer refuse once a round is under way. The saved-profile chips were
// not guarded, so tapping one mid-round pushed a player onto the roster and
// desynced every index behind it.
{
  const { ctx, p, errors } = await page();
  await p.evaluate(() => {
    localStorage.setItem("golfProfiles", JSON.stringify([{ name: "Latecomer", hdcp: 5 }]));
  });
  await enterRoster(p, 4);
  await p.waitForTimeout(200);
  await p.evaluate(() => { selectGameType("skins"); startRound(); });
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => {
    const before = state.players.length;
    addProfileByIndex(0);
    return { before, after: state.players.length, started: state.started };
  });
  ok(after.started, "the round is under way");
  ok(after.after === after.before, "a profile chip refuses to grow a locked roster", `${after.before} -> ${after.after}`);
  ok(errors.length === 0, "locked roster: no page errors", errors[0] || "");
  await ctx.close();
}

// --------------------------------------------------------------------------
section("Saying who you are");
// --------------------------------------------------------------------------
// Every "your" surface -- the season card, your take, your nemesis, the
// handicap index, the hole strip -- reads one name, and nothing ever wrote
// it: it was guessed from round history with no way to correct it. Driven
// through the DOM and pre-existing globals only.
{
  const { ctx, p, errors } = await page();
  const clear = () => p.evaluate(() => { try { localStorage.removeItem("primaryPlayer"); } catch (e) {} });

  // A roster of blank slots is not a question anyone can answer.
  await clear();
  await p.evaluate(() => {
    enterScreen("setup");
    state.players = [];
    addPlayer(); addPlayer();
    renderPlayers();
  });
  await p.waitForTimeout(150);
  ok(
    !(await p.evaluate(() => !!document.querySelector(".whoami"))),
    "placeholder slots raise no question"
  );

  await enterRoster(p, 4);
  await p.evaluate(() => enterScreen("setup"));
  await p.waitForTimeout(200);
  const asked = await p.evaluate(() => ({
    shown: !!document.querySelector(".whoami"),
    names: [...document.querySelectorAll(".whoami-pick")].map((b) => b.dataset.name),
  }));
  ok(asked.shown, "a real roster is asked which one is you");
  ok(asked.names.length === 4, "every player in the round is offered", asked.names.join(","));

  // Guarded so the rest of the section still runs (and still reports) when the
  // prompt is missing entirely, rather than taking the suite down with it.
  const picked = await p.evaluate(() => {
    const btns = [...document.querySelectorAll(".whoami-pick")];
    if (!btns.length) return null;
    const want = btns[2].dataset.name;
    btns[2].click();
    return {
      want,
      stored: localStorage.getItem("primaryPlayer"),
      resolved: getPrimaryPlayerName(),
      stillAsking: !!document.querySelector(".whoami"),
    };
  });
  ok(!!picked, "there is something to pick");
  if (picked) {
    ok(picked.stored === picked.want, "picking writes it down", `${picked.stored} vs ${picked.want}`);
    ok(picked.resolved === picked.want, "and it is what the app reads back", picked.resolved);
    ok(!picked.stillAsking, "and the question retires once answered");
  }

  // The point of all this: it has to move the numbers.
  const downstream = await p.evaluate(async () => {
    const read = async (who) => {
      localStorage.setItem("primaryPlayer", who);
      showScreen("home");
      await new Promise((r) => setTimeout(r, 250));
      const el = document.querySelector(".ss-v");
      return el ? el.textContent.trim() : null;
    };
    const names = state.players.map((x) => x.name);
    return { a: await read(names[0]), b: await read(names[1]), names };
  });
  ok(
    downstream.a && downstream.b && downstream.a !== downstream.b,
    "the season card follows whoever you say you are",
    `${downstream.names[0]}=${downstream.a} ${downstream.names[1]}=${downstream.b}`
  );

  // Settings is where you go to change it later.
  const settings = await p.evaluate(() => {
    showSettings();
    const sel = document.getElementById("settings-me");
    return {
      exists: !!sel,
      value: sel && sel.value,
      options: sel ? [...sel.options].map((o) => o.value) : [],
    };
  });
  ok(settings.exists, "Settings offers a way to change it");
  if (settings.exists) {
    ok(
      settings.value === downstream.names[1],
      "it opens on whoever you currently are",
      `${settings.value} vs ${downstream.names[1]}`
    );
    ok(
      !settings.options.some((n) => /^Player \d+$/.test(n)),
      "blank roster slots are not offered as people you could be",
      settings.options.join(",")
    );
  }

  // The You screen used to render "Set your player" as text with no handler --
  // an instruction that could not be followed.
  const youSet = await p.evaluate(() => {
    closeModal("settings-modal");
    showScreen("you");
    const b = document.querySelector(".you-whoami");
    return { tag: b && b.tagName, text: b && b.textContent };
  });
  ok(youSet.tag === "BUTTON", "the You screen identity line is a button", String(youSet.tag));
  ok(/change/i.test(youSet.text || ""), "which offers to change it", String(youSet.text));

  await clear();
  const youUnset = await p.evaluate(() => {
    showScreen("you");
    const b = document.querySelector(".you-whoami");
    return b && b.textContent;
  });
  ok(/set who you are/i.test(youUnset || ""), "and says so plainly when nobody has said", String(youUnset));

  ok(errors.length === 0, "who you are: no page errors", errors[0] || "");
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
