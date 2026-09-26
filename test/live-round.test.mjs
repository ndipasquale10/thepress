/**
 * Live-round tests — two real browsers sharing one round.
 *
 * Everything else in the suite runs with Firebase stripped out: `flows.mjs`
 * drives a single offline page, and `rules.test.mjs` talks to Firestore with no
 * browser at all. So the seam between them -- the host publishing a round, a
 * second player joining by code, scores crossing the wire, the security rules
 * saying yes or no to a real client -- was the one part of the app nothing
 * executed.
 *
 * That is the seam where the Wolf Breakout bug lived: the field was written to
 * localStorage, read by the scoring code, and simply never sent, so the host and
 * the joiner scored the same hole against different teams for different money.
 * No unit test could see it and no rules test could either. This one can.
 *
 * Runs against the Firestore and Auth emulators with the real firestore.rules:
 *   npm run test:live
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname, normalize } from "node:path";
import { existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = resolve(ROOT, "build");
const PAGE = resolve(BUILD, "live.html");

if (!existsSync(PAGE)) {
  console.error(`missing ${PAGE}\nrun: python3 scripts/build-preview.py --live -o build/live.html`);
  process.exit(1);
}

const [, FIRESTORE_PORT = "8080"] = (process.env.FIRESTORE_EMULATOR_HOST || "").split(":");
const [, AUTH_PORT = "9099"] = (process.env.FIREBASE_AUTH_EMULATOR_HOST || "").split(":");

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

// The app is served over HTTP rather than file:// because the Firestore SDK
// sends an Origin header the emulator has to accept, and file:// sends "null".
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = resolve(BUILD, "." + path);
  if (!file.startsWith(BUILD)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const contexts = [];

/**
 * A browser with its own storage, on the app, optionally signed in.
 *
 * Signing in goes through the Auth emulator with an unsigned Google credential
 * rather than a popup: the app only ever reads auth.currentUser, so this is the
 * same signed-in state a real Google sign-in produces.
 */
async function openApp({ uid, email, query = "" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(ctx);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(
    ([fsPort, authPort]) => {
      window.__EMU__ = { host: "127.0.0.1", firestorePort: +fsPort, authPort: +authPort };
      try {
        localStorage.setItem("onboarded", "1");
      } catch (e) {}
    },
    [FIRESTORE_PORT, AUTH_PORT]
  );
  await p.goto(`${ORIGIN}/live.html${query}`, { waitUntil: "load" });
  // The live-round write path is wrapped onto saveCurrentRound at load and
  // marks itself _patched; wait for the mark so a test never scores unwrapped.
  await p.waitForFunction(() => typeof saveCurrentRound === "function" && saveCurrentRound._patched);
  // The SDK is no longer loaded by a blocking script tag -- it arrives on idle,
  // and anything that touches `firebase`, `db` or `auth` has to ask for it
  // first. This test reaches straight for `auth` to mint a credential, which no
  // app code does, so it has to make the same promise the app's own call sites
  // make. Without this the sign-in below races the loader and fails on whichever
  // run loses.
  await p.evaluate(() => ensureFirebase());

  if (uid) {
    await p.evaluate(
      async ({ uid, email }) => {
        const cred = firebase.auth.GoogleAuthProvider.credential(
          JSON.stringify({ sub: uid, email, email_verified: true, name: email.split("@")[0] })
        );
        await auth.signInWithCredential(cred);
      },
      { uid, email }
    );
    await p.waitForFunction(() => !!currentUser);
  }
  return { p, errors, uid: uid ? await p.evaluate(() => currentUser.uid) : null };
}

const COURSE = "Emulator National";

const setUpRound = (p, names) =>
  p.evaluate(
    ({ names, course }) => {
      state.gameType = "wolf";
      state.players = names.map((name) => ({ name, hdcp: 8, color: "#16412c", venmo: "" }));
      state.pars = Array(18).fill(4);
      state.hdcps = Array.from({ length: 18 }, (_, i) => i + 1);
      enterScreen("setup");
      document.getElementById("course-name").value = course;
      renderPlayers();
      startRound();
      saveCurrentRound();
      return { roundId: state.roundId, course: state.course };
    },
    { names, course: COURSE }
  );

// --------------------------------------------------------------------------
section("A host shares a round and a second player joins it");
// --------------------------------------------------------------------------

const host = await openApp({ uid: "host-uid", email: "host@example.com" });
const roundSetUp = await setUpRound(host.p, ["You", "Big Dave", "Tommy P", "Sanjay"]);
ok(roundSetUp.course === COURSE, "the host's round is on the course they typed", roundSetUp.course);

const shared = await host.p.evaluate(async () => {
  // The host has Big Dave's Venmo saved; it must stay on the host's phone.
  state.players[1].venmo = "big-dave-golf";
  // appConfirm shows the "copy the watch link" dialog after the round is live;
  // the test is not the clipboard, so answer it and move on.
  window.appConfirm = async () => false;
  await shareRoundLive();
  return { code: state.liveCode, liveId: state.liveId, owner: state.liveOwner };
});

ok(/^[A-Z0-9]{6}$/.test(shared.code || ""), "sharing produces a six-character code", `got ${shared.code}`);
ok(shared.liveId === shared.code, "the code is the document ID", `${shared.liveId} vs ${shared.code}`);
ok(shared.owner === host.uid, "the round records its host", `${shared.owner} vs ${host.uid}`);
ok(!/[O0I1]/.test(shared.code || ""), "the code avoids characters that are misheard", shared.code);

const CODE = shared.code;

const joiner = await openApp({ uid: "guest-uid", email: "guest@example.com" });
const joined = await joiner.p.evaluate(async (code) => {
  window.appPrompt = async () => code;
  window.confirmLeaveActiveRound = async () => true;
  await joinLiveRound();
  return true;
}, CODE);
ok(joined, "joining with the code returns without throwing");

const arrived = await joiner.p
  .waitForFunction(() => state.started && state.liveId, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
ok(arrived, "the joiner lands in the round");

const joinedState = await joiner.p.evaluate(() => ({
  players: state.players.map((p) => p.name),
  course: state.course,
  code: state.liveCode,
  owner: state.liveOwner,
  screen: [...document.querySelectorAll('[id$="-screen"]')]
    .filter((e) => !e.classList.contains("hidden"))
    .map((e) => e.id)[0],
}));
ok(
  JSON.stringify(joinedState.players) === JSON.stringify(["You", "Big Dave", "Tommy P", "Sanjay"]),
  "the joiner sees the host's roster",
  JSON.stringify(joinedState.players)
);
ok(joinedState.course === COURSE, "and the host's course", joinedState.course);
ok(joinedState.screen === "scoring-screen", "on the scoring screen", joinedState.screen);
ok(joinedState.owner === host.uid, "and knows who the host is", `${joinedState.owner} vs ${host.uid}`);
ok(joinedState.owner !== joiner.uid, "which is not the joiner");

// --------------------------------------------------------------------------
section("Payment handles stay on the phone they were saved on");
// The round is readable by anyone with the code and writable by anyone who
// joined. A handle in it could be read by a stranger, or swapped for someone
// else's and paid out by the next phone to open the round.
// --------------------------------------------------------------------------

const published = await joiner.p.evaluate(async (code) => {
  const snap = await db.collection("liveRounds").doc(code).get();
  return snap.data().players;
}, CODE);
ok(
  published.every((p) => !("venmo" in p) && !("cashapp" in p) && !("paypal" in p)),
  "the published roster carries no payment handles",
  JSON.stringify(published)
);
const handles = {
  host: await host.p.evaluate(() => state.players[1].venmo),
  joiner: await joiner.p.evaluate(() => state.players[1].venmo),
};
ok(handles.host === "big-dave-golf", "the host still has Big Dave's handle to settle up with", handles.host);
ok(handles.joiner === "", "the joiner does not receive it", handles.joiner);

const swap = await joiner.p.evaluate(async (code) => {
  const players = state.players.map((p) => ({ name: p.name, hdcp: p.hdcp }));
  players[1].venmo = "guest-handle";
  try {
    await db.collection("liveRounds").doc(code).update({ players });
    return "allowed";
  } catch (e) {
    return e.code || "denied";
  }
}, CODE);
ok(swap === "permission-denied", "the rules refuse a joiner writing a handle into the roster", swap);

// --------------------------------------------------------------------------
section("Scores cross the wire");
// --------------------------------------------------------------------------

await host.p.evaluate(() => {
  state.scores[0] = { 0: 4 };
  state.scores[1] = { 0: 5 };
  state.scores[2] = { 0: 3 };
  state.scores[3] = { 0: 6 };
  state.wolfHoles[0] = { wolf: 0, partners: [1] };
  saveCurrentRound();
});

const gotScores = await joiner.p
  .waitForFunction(() => state.scores && state.scores[2] && state.scores[2][0] === 3, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
ok(gotScores, "the host's scores reach the joiner");

// --------------------------------------------------------------------------
section("Wolf Breakouts cross the wire");
// The regression this file was written for, and it bit harder than it looked.
// A Breakout changes who the Wolf is, which changes the teams, which changes the
// money. The field was never written to the live document, and every device in a
// live round -- including the host -- overwrites state.wolfBreakouts from each
// snapshot. So the host set a Breakout, its own write echoed back without the
// field, and the Breakout vanished from the host's screen a second later. The
// joiner never had it at all. Both assertions below failed before the fix.
// --------------------------------------------------------------------------

await host.p.evaluate(() => {
  setWolfBreakout(2, 3);
  saveCurrentRound();
});

const hostWolf = await host.p.evaluate(() => ({
  breakouts: state.wolfBreakouts,
  wolfForHole2: getWolfForHole(2),
}));
ok(hostWolf.breakouts && hostWolf.breakouts[2] === 3, "the host keeps the Breakout after its own write echoes back");
ok(hostWolf.wolfForHole2 === 3, "and the Breakout decides who the Wolf is", String(hostWolf.wolfForHole2));

const breakoutArrived = await joiner.p
  .waitForFunction(() => state.wolfBreakouts && state.wolfBreakouts[2] === 3, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
ok(breakoutArrived, "the Breakout reaches the joiner");

const joinerWolf = await joiner.p.evaluate(() => getWolfForHole(2));
ok(
  joinerWolf === hostWolf.wolfForHole2,
  "both devices agree who the Wolf is on that hole",
  `host ${hostWolf.wolfForHole2}, joiner ${joinerWolf}`
);

// --------------------------------------------------------------------------
section("A joiner can keep score, and cannot take the round over");
// --------------------------------------------------------------------------

await joiner.p.evaluate(() => {
  state.scores[1][1] = 4;
  saveCurrentRound();
});
const joinerScoreLanded = await host.p
  .waitForFunction(() => state.scores && state.scores[1] && state.scores[1][1] === 4, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
ok(joinerScoreLanded, "the joiner's score reaches the host");

// Both phones score the same hole in the same moment. Each used to send its
// whole scorecard, so whichever write landed second erased the other's score,
// and the snapshot then carried the loss back to both phones.
await Promise.all([
  host.p.evaluate(() => {
    state.scores[0][5] = 4;
    saveCurrentRound();
  }),
  joiner.p.evaluate(() => {
    state.scores[1][5] = 6;
    saveCurrentRound();
  }),
]);
const bothScores = () => state.scores[0] && state.scores[0][5] === 4 && state.scores[1] && state.scores[1][5] === 6;
const bothOnHost = await host.p
  .waitForFunction(bothScores, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
const bothOnJoiner = await joiner.p
  .waitForFunction(bothScores, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
ok(bothOnHost && bothOnJoiner, "scores entered at the same moment on two phones both survive", `host ${bothOnHost}, joiner ${bothOnJoiner}`);
const onServer = await joiner.p.evaluate(async (code) => {
  const s = (await db.collection("liveRounds").doc(code).get({ source: "server" })).data().scores;
  return [s[0] && s[0][5], s[1] && s[1][5]];
}, CODE);
ok(onServer[0] === 4 && onServer[1] === 6, "and both are on the server", JSON.stringify(onServer));

const takeover = await joiner.p.evaluate(async ({ code, uid }) => {
  try {
    await db.collection("liveRounds").doc(code).update({ owner: uid });
    return "allowed";
  } catch (e) {
    return e.code || "denied";
  }
}, { code: CODE, uid: joiner.uid });
ok(takeover === "permission-denied", "the rules refuse a takeover from a real client", takeover);

const enumerate = await joiner.p.evaluate(async () => {
  try {
    const snap = await db.collection("liveRounds").get();
    return `allowed: ${snap.size} rounds`;
  } catch (e) {
    return e.code || "denied";
  }
});
ok(enumerate === "permission-denied", "and refuse to hand over the whole collection", enumerate);

// --------------------------------------------------------------------------
section("The watch link works without signing in");
// --------------------------------------------------------------------------

const watcher = await openApp({ query: `?watch=${CODE}` });
const watching = await watcher.p
  .waitForFunction(() => typeof isSpectator !== "undefined" && isSpectator && state.players.length, null, {
    timeout: 15000,
  })
  .then(() => true)
  .catch(() => false);
ok(watching, "a signed-out watcher reaches the round");

if (watching) {
  const seen = await watcher.p.evaluate(() => ({
    players: state.players.map((p) => p.name),
    breakout: state.wolfBreakouts && state.wolfBreakouts[2],
    signedIn: !!currentUser,
  }));
  ok(!seen.signedIn, "without an account");
  ok(seen.players.length === 4, "and sees the roster", JSON.stringify(seen.players));
  ok(seen.breakout === 3, "including the Breakout", String(seen.breakout));

  const watcherWrite = await watcher.p.evaluate(async (code) => {
    try {
      await db.collection("liveRounds").doc(code).update({ currentHole: 17 });
      return "allowed";
    } catch (e) {
      return e.code || "denied";
    }
  }, CODE);
  ok(watcherWrite === "permission-denied", "but cannot write to it", watcherWrite);
}

// --------------------------------------------------------------------------
section("A wrong code fails cleanly");
// --------------------------------------------------------------------------

const stranger = await openApp({ uid: "stranger-uid", email: "stranger@example.com" });
const wrongCode = await stranger.p.evaluate(async () => {
  window.appPrompt = async () => "ZZZZZZ";
  window.confirmLeaveActiveRound = async () => true;
  await joinLiveRound();
  await new Promise((r) => setTimeout(r, 1500));
  return { started: !!state.started, liveId: state.liveId || null };
});
ok(!wrongCode.started && !wrongCode.liveId, "an unknown code does not start a round", JSON.stringify(wrongCode));

// --------------------------------------------------------------------------
section("Round history syncs deletions and edits between one player's devices");
// Deleting a round only removed it from the phone, and the upload merged into
// the cloud copy without removing anything, so the round came back on the next
// sign-in. And when both devices had a round, the local copy always won, so an
// edit made on the other device never arrived.
// --------------------------------------------------------------------------

const SYNC = { uid: "sync-uid", email: "sync@example.com" };
const phone = await openApp(SYNC);
await phone.p.evaluate(async () => {
  localStorage.setItem(
    "golfRounds",
    JSON.stringify({
      keep: { id: "keep", course: "Keeper CC", finished: true, updatedAt: 2000 },
      drop: { id: "drop", course: "Mistake Muni", finished: true, updatedAt: 1000 },
    })
  );
  await syncRoundsToFirestore();
  window.appConfirm = async () => true;
  window.enterScreen = () => {};
  await deleteRound("drop");
});
// Polled by hand: waitForFunction treats an async predicate's promise as a
// truthy answer and returns at once.
const cloudAfterDelete = await phone.p.evaluate(async () => {
  let r = {};
  for (let i = 0; i < 30; i++) {
    r = (await userDoc().get({ source: "server" })).data().rounds || {};
    if (!("drop" in r) && "keep" in r) return "ok";
    await new Promise((res) => setTimeout(res, 500));
  }
  return JSON.stringify(Object.keys(r));
});
ok(cloudAfterDelete === "ok", "a deleted round is removed from the cloud copy", cloudAfterDelete);

// A second device, signed out, still holding the deleted round and an older
// copy of the kept one, then signing in to the same account.
const tablet = await openApp();
await tablet.p.evaluate(() => {
  localStorage.setItem(
    "golfRounds",
    JSON.stringify({
      keep: { id: "keep", course: "Old Name", finished: true, updatedAt: 1500 },
      drop: { id: "drop", course: "Mistake Muni", finished: true, updatedAt: 1000 },
    })
  );
});
await tablet.p.evaluate(async ({ uid, email }) => {
  const cred = firebase.auth.GoogleAuthProvider.credential(
    JSON.stringify({ sub: uid, email, email_verified: true, name: "sync" })
  );
  await auth.signInWithCredential(cred);
}, SYNC);
const tabletSynced = await tablet.p
  .waitForFunction(() => {
    const r = readRounds();
    return !("drop" in r) && r.keep && r.keep.course === "Keeper CC";
  }, null, { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
const tabletRounds = await tablet.p.evaluate(() => readRounds());
ok(tabletSynced, "the other device drops the deleted round and takes the newer edit", JSON.stringify(tabletRounds));
const cloudStillClean = await tablet.p.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const r = (await userDoc().get({ source: "server" })).data().rounds || {};
  return !("drop" in r);
});
ok(cloudStillClean, "and does not upload the deleted round again");

// --------------------------------------------------------------------------
section("Deleting the host's account takes the round with it");
// --------------------------------------------------------------------------

const deleted = await host.p.evaluate(async () => {
  window.appConfirm = async () => true;
  await deleteAccount();
  await new Promise((r) => setTimeout(r, 800));
  return true;
});
ok(deleted, "deletion runs to completion");

const roundGone = await stranger.p.evaluate(async (code) => {
  for (let i = 0; i < 30; i++) {
    if (!(await db.collection("liveRounds").doc(code).get({ source: "server" })).exists) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}, CODE);
ok(roundGone, "the hosted live round is gone from the server");

const profileGone = await stranger.p.evaluate(async (hostUid) => {
  try {
    await db.collection("users").doc(hostUid).get();
    return "readable";
  } catch (e) {
    return e.code || "denied";
  }
}, host.uid);
ok(profileGone === "permission-denied", "and another account still cannot read the host's document", profileGone);

// --------------------------------------------------------------------------
for (const [name, h] of [["host", host], ["joiner", joiner], ["watcher", watcher], ["stranger", stranger], ["phone", phone], ["tablet", tablet]]) {
  const real = h.errors.filter((e) => !/permission-denied|Missing or insufficient/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${name}`, real.join("\n    "));
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
