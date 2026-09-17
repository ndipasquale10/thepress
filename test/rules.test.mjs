// Security-rule regression tests for firestore.rules.
//
// These run against the Firestore emulator, which evaluates the real rules
// engine -- not a mock -- so a rule that passes here is the rule that ships.
// Run with: npm run test:rules
//
// The money math has had regression tests since the beginning; this is the same
// idea pointed at the other place a bug costs real people something. A round
// holds names, scores and who owes whom, so "can a stranger read it" deserves a
// failing test, not a console setting nobody reviews.

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [host, port] = HOST.split(":");

const testEnv = await initializeTestEnvironment({
  projectId: "thepress-rules-test",
  firestore: {
    rules: readFileSync("firestore.rules", "utf8"),
    host,
    port: Number(port),
  },
});

// Two signed-in players and one person who never signed in.
const host_ = () => testEnv.authenticatedContext("host-uid").firestore();
const guest = () => testEnv.authenticatedContext("guest-uid").firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

const CODE = "ABC123";

function roundDoc(overrides = {}) {
  return {
    course: { name: "Pebble Beach Golf Links" },
    gameType: "wolf",
    gameOpts: {},
    sideBets: {},
    players: [{ name: "Nick" }, { name: "Pat" }],
    pars: Array(18).fill(4),
    hdcps: Array.from({ length: 18 }, (_, i) => i + 1),
    scores: {},
    wolfHoles: {},
    bankerHoles: {},
    bankerPresses: {},
    bonusPoints: {},
    matchPresses: [],
    holeCount: 18,
    holeStart: 0,
    handicapMode: "low",
    currentHole: 0,
    owner: "host-uid",
    code: CODE,
    ...overrides,
  };
}

function courseDoc(overrides = {}) {
  return {
    name: "Bethpage Black",
    city: "Farmingdale",
    state: "NY",
    tees: [{ name: "Black", rating: 77.5, slope: 155, yds: 7468 }],
    pars: Array(18).fill(4),
    hdcps: Array.from({ length: 18 }, (_, i) => i + 1),
    ...overrides,
  };
}

// A live round seeded with rules bypassed, so each test starts from a known
// document without depending on the create rules it is not testing.
async function seedRound(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("liveRounds").doc(CODE).set(roundDoc(overrides));
  });
}

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

test.after(async () => {
  await testEnv.cleanup();
});

// ---------------------------------------------------------------- users

test("users: the owner reads and writes their own document", async () => {
  await assertSucceeds(host_().collection("users").doc("host-uid").set({ profiles: [] }));
  await assertSucceeds(host_().collection("users").doc("host-uid").get());
});

test("users: another signed-in player cannot read or write it", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("host-uid").set({ profiles: [{ name: "Nick" }] });
  });
  await assertFails(guest().collection("users").doc("host-uid").get());
  await assertFails(guest().collection("users").doc("host-uid").set({ profiles: [] }));
});

test("users: a signed-out visitor cannot read it", async () => {
  await assertFails(anon().collection("users").doc("host-uid").get());
});

test("users: the collection cannot be listed", async () => {
  await assertFails(host_().collection("users").get());
});

// ----------------------------------------------------------- liveRounds

test("liveRounds: the host creates a round under its share code", async () => {
  await assertSucceeds(host_().collection("liveRounds").doc(CODE).set(roundDoc()));
});

test("liveRounds: a round cannot be created under someone else's uid", async () => {
  await assertFails(
    host_().collection("liveRounds").doc(CODE).set(roundDoc({ owner: "guest-uid" }))
  );
});

test("liveRounds: the code in the body must match the document ID", async () => {
  await assertFails(
    host_().collection("liveRounds").doc(CODE).set(roundDoc({ code: "ZZZ999" }))
  );
});

test("liveRounds: a document ID that is not a six-character code is refused", async () => {
  await assertFails(
    host_().collection("liveRounds").doc("round_1748").set(roundDoc({ code: "round_1748" }))
  );
});

test("liveRounds: a signed-out visitor cannot create one", async () => {
  await assertFails(anon().collection("liveRounds").doc(CODE).set(roundDoc()));
});

test("liveRounds: anyone holding the code can read that round", async () => {
  await seedRound();
  await assertSucceeds(anon().collection("liveRounds").doc(CODE).get());
  await assertSucceeds(guest().collection("liveRounds").doc(CODE).get());
});

// The one that matters: before the code became the document ID, joining ran a
// collection-wide query and filtered client-side, so opening the join dialog
// downloaded every round played in the last 24 hours.
test("liveRounds: the collection cannot be listed, by anyone, however narrowed", async () => {
  await seedRound();
  await assertFails(anon().collection("liveRounds").get());
  await assertFails(guest().collection("liveRounds").get());
  await assertFails(guest().collection("liveRounds").limit(1).get());
  await assertFails(guest().collection("liveRounds").where("code", "==", CODE).get());
  await assertFails(
    guest().collection("liveRounds").where("updatedAt", ">", new Date(0)).get()
  );
});

test("liveRounds: a host can list their own rounds, which is what deletion needs", async () => {
  await seedRound();
  await assertSucceeds(host_().collection("liveRounds").where("owner", "==", "host-uid").get());
  // ...and cannot widen that into everyone else's.
  await assertFails(guest().collection("liveRounds").where("owner", "==", "host-uid").get());
});

test("liveRounds: a player who joined with the code can keep score", async () => {
  await seedRound();
  await assertSucceeds(
    guest().collection("liveRounds").doc(CODE).update({ scores: { 0: [4, 5] }, currentHole: 1 })
  );
});

test("liveRounds: a signed-out watcher cannot write scores", async () => {
  await seedRound();
  await assertFails(anon().collection("liveRounds").doc(CODE).update({ scores: { 0: [4, 5] } }));
});

test("liveRounds: a joiner cannot take the round over or re-point its code", async () => {
  await seedRound();
  await assertFails(guest().collection("liveRounds").doc(CODE).update({ owner: "guest-uid" }));
  await assertFails(guest().collection("liveRounds").doc(CODE).update({ code: "ZZZ999" }));
});

test("liveRounds: unknown fields cannot be smuggled into a round", async () => {
  await seedRound();
  await assertFails(
    guest().collection("liveRounds").doc(CODE).update({ stowaway: "anything" })
  );
});

test("liveRounds: a round with no players, or a crowd, is refused", async () => {
  await assertFails(host_().collection("liveRounds").doc(CODE).set(roundDoc({ players: [] })));
  await assertFails(
    host_()
      .collection("liveRounds")
      .doc(CODE)
      .set(roundDoc({ players: Array.from({ length: 13 }, (_, i) => ({ name: "P" + i })) }))
  );
});

test("liveRounds: only the host can delete the round", async () => {
  await seedRound();
  await assertFails(guest().collection("liveRounds").doc(CODE).delete());
  await assertFails(anon().collection("liveRounds").doc(CODE).delete());
  await assertSucceeds(host_().collection("liveRounds").doc(CODE).delete());
});

// -------------------------------------------------------- sharedCourses

test("sharedCourses: a signed-in player reads the library and adds a course", async () => {
  await assertSucceeds(host_().collection("sharedCourses").doc("bethpage-black").set(courseDoc()));
  await assertSucceeds(host_().collection("sharedCourses").get());
});

test("sharedCourses: a signed-out visitor cannot read or write the library", async () => {
  await assertFails(anon().collection("sharedCourses").get());
  await assertFails(anon().collection("sharedCourses").doc("bethpage-black").set(courseDoc()));
});

test("sharedCourses: a malformed course cannot poison the library", async () => {
  const bad = [
    courseDoc({ pars: Array(17).fill(4) }),
    courseDoc({ hdcps: "not-a-list" }),
    courseDoc({ tees: [] }),
    courseDoc({ name: "" }),
    { city: "Nowhere" },
  ];
  for (const doc of bad) {
    await assertFails(host_().collection("sharedCourses").doc("junk").set(doc));
  }
});

test("sharedCourses: courses cannot be deleted", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("sharedCourses").doc("bethpage-black").set(courseDoc());
  });
  await assertFails(host_().collection("sharedCourses").doc("bethpage-black").delete());
});

// ------------------------------------------------------------- default

test("a collection with no rule of its own is unreachable", async () => {
  await assertFails(host_().collection("anythingElse").doc("x").set({ a: 1 }));
  await assertFails(host_().collection("anythingElse").doc("x").get());
});

test("the rules file is the one the app deploys", () => {
  const fb = JSON.parse(readFileSync("firebase.json", "utf8"));
  assert.equal(fb.firestore.rules, "firestore.rules");
});

// The liveRounds rules use hasOnly(), so a field the app writes but the rules do
// not list is rejected -- and the write path swallows errors, so the failure
// would show up as "my playing partner's scores stopped arriving" rather than as
// anything in a log. Keep the two lists married.
test("every field the app writes to a live round is allowed by the rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const allowed = new Set(
    rules
      .slice(rules.indexOf("function liveFields()"))
      .match(/return\s*\[([^\]]*)\]/)[1]
      .match(/'([a-zA-Z]+)'/g)
      .map((q) => q.slice(1, -1))
  );

  const app = readFileSync("index.html", "utf8");

  // Top-level keys of the object literal starting at `from`, found by scanning
  // to the matching brace so nested objects do not contribute their own keys.
  const keysOfLiteralAt = (from) => {
    const open = app.indexOf("{", from);
    let depth = 0, end = open;
    for (let i = open; i < app.length; i++) {
      const c = app[i];
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") { depth--; if (!depth) { end = i; break; } }
    }
    const body = app.slice(open + 1, end);
    const keys = [];
    depth = 0;
    let token = "";
    for (const c of body) {
      if (c === "{" || c === "[" || c === "(") depth++;
      else if (c === "}" || c === "]" || c === ")") depth--;
      else if (!depth && c === ",") { token = ""; continue; }
      else if (!depth && c === ":") { keys.push(token.trim()); token = ""; continue; }
      if (!depth) token += c;
    }
    return keys.filter((k) => /^[a-zA-Z]+$/.test(k));
  };

  const writes = [
    ["liveRoundPayload", app.indexOf("return {", app.indexOf("function liveRoundPayload(")) + "return ".length],
    ...[...app.matchAll(/liveRounds"\)\.doc\([^)]*\)\.update\(/g)].map((m) => [
      "update at " + m.index,
      m.index + m[0].length - 1,
    ]),
  ];
  assert.ok(writes.length >= 3, "expected the payload builder and both update paths");

  for (const [what, at] of writes) {
    const keys = keysOfLiteralAt(at);
    assert.ok(keys.length, `found no fields in ${what}`);
    for (const k of keys) {
      assert.ok(allowed.has(k), `${what} writes "${k}", which firestore.rules does not allow`);
    }
  }
});

// The other direction, and the one that costs money. A joiner overwrites its
// local state from every snapshot, so a field the snapshot handler reads but no
// write path ever sends is not merely missing -- it is actively cleared on the
// joiner's device on every update. wolfBreakouts was exactly this: the host
// claimed a Breakout, the joiner's copy reset to {}, getWolfForHole fell back to
// the rotation, and the two devices played different holes for different money.
test("every field a joiner reads from a live round is one the app writes", () => {
  const app = readFileSync("index.html", "utf8");

  const readersOf = (fnName, receiver) => {
    const start = app.indexOf("function " + fnName + "(");
    assert.ok(start > -1, `could not find ${fnName}`);
    const body = app.slice(start, start + 2000);
    return new Set(
      [...body.matchAll(new RegExp("state\\.([a-zA-Z]+)\\s*=\\s*" + receiver + "\\.([a-zA-Z]+)", "g"))]
        .map((m) => m[2])
    );
  };

  const written = new Set();
  const collect = (from) => {
    const open = app.indexOf("{", from);
    let depth = 0, end = open;
    for (let i = open; i < app.length; i++) {
      const c = app[i];
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") { depth--; if (!depth) { end = i; break; } }
    }
    for (const m of app.slice(open + 1, end).matchAll(/(?:^|,)\s*([a-zA-Z]+)\s*:/g)) written.add(m[1]);
  };
  collect(app.indexOf("return {", app.indexOf("function liveRoundPayload(")));
  for (const m of app.matchAll(/liveRounds"\)\.doc\([^)]*\)\.update\(/g)) collect(m.index + m[0].length - 1);

  // State the app derives locally rather than taking from the document.
  const local = new Set(["updatedAt"]);

  for (const [fn, receiver] of [["subscribeLiveUpdates", "t"], ["applyLiveDoc", "o"]]) {
    for (const field of readersOf(fn, receiver)) {
      if (local.has(field)) continue;
      assert.ok(
        written.has(field),
        `${fn} reads "${field}" from the live round, but no write path ever sends it`
      );
    }
  }
});
