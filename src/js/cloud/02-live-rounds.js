let liveUnsubscribe = null;
let _lastLiveUpdateMs = 0;
function goLiveTap() {
  if (isSpectator) return;
  currentUser
    ? shareRoundLive()
    : appConfirm(
        "Sharing your round live requires a Google sign-in, so friends can follow along or watch read-only.",
        { title: "Go Live", confirmLabel: "Sign in with Google" },
      ).then((e) => {
        e && "function" == typeof signInWithGoogle && signInWithGoogle(null);
      });
} /* The six-character share code IS the document ID, not a slice of one.
   When the code only lived inside a longer ID, there was no way to look a round
   up by it -- joining had to pull the whole collection down and match in the
   browser, which handed anyone who opened the join dialog every round played
   that day: names, scores and money. Addressing a round by its code makes the
   code the entire permission model, and lets firestore.rules refuse to list the
   collection at all rather than trying (and failing) to filter it. */
const LIVE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0 or I/1: it gets read aloud on the first tee
function newLiveCode() {
  const c = self.crypto || window.crypto,
    n = LIVE_CODE_CHARS.length;
  let out = "";
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(6);
    c.getRandomValues(buf);
    for (let i = 0; i < 6; i++) out += LIVE_CODE_CHARS[buf[i] % n];
  } else {
    for (let i = 0; i < 6; i++) out += LIVE_CODE_CHARS[Math.floor(Math.random() * n)];
  }
  return out;
}
/* Payment handles never go into a live round. The document is readable by
   anyone holding the code -- watch links included -- and writable by anyone who
   joined, so a handle stored there could be read by strangers, or swapped for
   someone else's and paid out by the next phone to open the round. Each phone
   fills handles in from its own saved profiles instead. firestore.rules refuses
   a roster that carries them. */
const PAY_KEYS = ["venmo", "cashapp", "paypal"];
function stripPayHandles(ps) {
  return (ps || []).map((p) => {
    const o = { ...p };
    PAY_KEYS.forEach((k) => delete o[k]);
    return o;
  });
}
function withOwnPayHandles(ps) {
  const key = (n) =>
      String(n || "")
        .trim()
        .toLowerCase(),
    prof = getSavedProfiles();
  return stripPayHandles(ps).map((p) => {
    const m = prof.find((q) => key(q.name) === key(p.name));
    PAY_KEYS.forEach((k) => (p[k] = (m && m[k]) || ""));
    return p;
  });
}
/* The in-play part of a live round: what changes hole by hole. */
function liveProgress() {
  return {
    scores: state.scores || {},
    wolfHoles: state.wolfHoles || {},
    wolfBreakouts: state.wolfBreakouts || {},
    bankerHoles: state.bankerHoles || {},
    bankerPresses: state.bankerPresses || {},
    bonusPoints: state.bonusPoints || {},
    pickedUp: state.pickedUp || {},
    matchPresses: state.matchPresses || [],
    currentHole: state.currentHole || 0,
  };
}
/* How deep each field is written. Sending whole maps meant two phones scoring
   the same second each replaced the other's scores with their own copy, and the
   snapshot then carried the loss to both. Writing only the entries that changed
   -- scores.<player>.<hole>, wolfHoles.<hole> -- lets both land. Arrays cannot
   be addressed by path, so matchPresses still goes whole. */
const LIVE_DEPTH = {
  scores: 2,
  bonusPoints: 2,
  wolfHoles: 1,
  wolfBreakouts: 1,
  bankerHoles: 1,
  bankerPresses: 1,
  pickedUp: 1,
  matchPresses: 0,
  currentHole: 0,
};
/* What this phone last sent or received, to diff the next save against. */
let _liveBase = null;
const cloneLive = (o) => JSON.parse(JSON.stringify(o));
function liveDiff(base, cur) {
  const out = [],
    isMap = (v) => !!v && "object" == typeof v && !Array.isArray(v);
  const walk = (path, b, c, d) => {
    if (d > 0 && isMap(b) && isMap(c)) {
      new Set([...Object.keys(b), ...Object.keys(c)]).forEach((k) =>
        walk([...path, k], b[k], c[k], d - 1),
      );
      return;
    }
    JSON.stringify(b) !== JSON.stringify(c) && out.push([path, c]);
  };
  for (const k in LIVE_DEPTH) walk([k], base[k], cur[k], LIVE_DEPTH[k]);
  return out;
}
function pushLiveProgress() {
  if (!state.liveId) return;
  const cur = cloneLive(liveProgress()),
    changes = _liveBase ? liveDiff(_liveBase, cur) : Object.keys(cur).map((k) => [[k], cur[k]]);
  if (!changes.length) return;
  _liveBase = cur;
  const FV = firebase.firestore.FieldValue,
    args = [];
  changes.forEach(([path, v]) =>
    args.push(new firebase.firestore.FieldPath(...path), void 0 === v ? FV.delete() : v),
  );
  args.push("updatedAt", FV.serverTimestamp());
  const ref = db.collection("liveRounds").doc(state.liveId);
  ref.update.apply(ref, args).catch(() => {});
}
function liveRoundPayload(code) {
  return {
    course: state.course,
    gameType: state.gameType,
    gameOpts: state.gameOpts,
    sideBets: state.sideBets || defaultSideBets(),
    players: stripPayHandles(state.players),
    pars: state.pars,
    hdcps: state.hdcps,
    scores: state.scores,
    wolfHoles: state.wolfHoles || {},
    wolfBreakouts: state.wolfBreakouts || {},
    bankerHoles: state.bankerHoles || {},
    bankerPresses: state.bankerPresses || {},
    bonusPoints: state.bonusPoints || {},
    pickedUp: state.pickedUp || {},
    matchPresses: state.matchPresses || [],
    holeCount: state.holeCount,
    holeStart: state.holeStart || 0,
    handicapMode: state.handicapMode,
    currentHole: state.currentHole,
    owner: currentUser.uid,
    code: code,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
}
async function shareRoundLive() {
  if (!currentUser || !state.roundId)
    return void showToast("Sign in and start a round first.", { type: "error" });
  /* Re-sharing a round that is already live keeps its code. A foursome has
     already read the old one out loud; handing them a second one mid-round is
     how a joiner ends up on nobody's card. */
  let code = state.liveCode || null;
  if (code) {
    /* Only the host owns the round document. Someone who joined with the code
       already has a live round -- theirs to score, not theirs to re-publish --
       so show them the code instead of attempting a write the rules refuse. */
    if (!state.liveOwner || state.liveOwner === currentUser.uid) {
      try {
        await db.collection("liveRounds").doc(code).set(liveRoundPayload(code));
      } catch (err) {
        console.error(err);
        return void showToast("Could not update the live round.", { type: "error" });
      }
    }
  } else {
    /* A collision lands on a stranger's round, where the rules reject the write
       because the owner would change. That rejection is the retry signal. */
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = newLiveCode();
      try {
        await db.collection("liveRounds").doc(candidate).set(liveRoundPayload(candidate));
        code = candidate;
        break;
      } catch (err) {
        if (attempt === 4) {
          console.error(err);
          return void showToast("Could not start a live round. Try again.", { type: "error" });
        }
      }
    }
  }
  ((state.liveCode = code),
    (state.liveId = code),
    (state.liveOwner = state.liveOwner || currentUser.uid));
  _liveBase = cloneLive(liveProgress());
  subscribeLiveUpdates(code);
  renderHole();
  showLiveSheet(code);
}
function normalizeLiveCode(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
function applyLiveDoc(s, code) {
  const o = s.data();
  ((state.liveId = s.id),
    (state.liveCode = String(code || "").toUpperCase()),
    (state.liveOwner = o.owner || null),
    (state.course = o.course),
    (state.gameType = o.gameType),
    (state.gameOpts = o.gameOpts),
    (state.sideBets = Object.assign(defaultSideBets(), o.sideBets || {})),
    (state.players = withOwnPayHandles(o.players)),
    (state.pars = o.pars),
    (state.hdcps = o.hdcps),
    (state.scores = o.scores),
    (state.wolfHoles = o.wolfHoles || {}),
    (state.wolfBreakouts = o.wolfBreakouts || {}),
    (state.bankerHoles = o.bankerHoles || {}),
    (state.bankerPresses = o.bankerPresses || {}),
    (state.bonusPoints = o.bonusPoints || {}),
    (state.pickedUp = o.pickedUp || {}),
    (state.matchPresses = o.matchPresses || []),
    (state.holeCount = o.holeCount || 18),
    (state.holeStart = o.holeStart || 0),
    (state.handicapMode = o.handicapMode),
    (state.currentHole = o.currentHole || 0),
    (_liveBase = cloneLive(liveProgress())));
}
let _retryWatchCode = null;
async function startSpectator(code) {
  /* A ?watch= link is the one cold start that genuinely needs the SDK, so it
     asks for it rather than waiting for the idle load. */
  await ensureFirebase();
  if ("undefined" == typeof db || !db)
    return void showToast("Watching requires a connection.", { type: "error" });
  const id = normalizeLiveCode(code);
  if (id.length !== 6) return void showToast("Round not found or expired.", { type: "error" });
  db.collection("liveRounds")
    .doc(id)
    .get()
    .then((snap) => {
      if (!snap.exists) return void showToast("Round not found or expired.", { type: "error" });
      ((_retryWatchCode = null),
        applyLiveDoc(snap, id),
        (isSpectator = !0),
        (state.started = !0),
        (state.roundId = null),
        document.body.classList.add("spectator"),
        enterScreen("watch"));
      const a = document.getElementById("spectator-banner");
      (a && a.classList.remove("hidden"),
        invalidateHdcpCache(),
        invalidateMoneyCache(),
        renderStrokeSummary(),
        renderHole(),
        subscribeLiveUpdates(snap.id),
        showToast("Watching live — read-only"));
    })
    .catch((t) => {
      t && "permission-denied" === t.code
        ? ((_retryWatchCode = code),
          appConfirm("This live round requires sign-in to watch.", {
            title: "Sign In to Watch",
            confirmLabel: "Sign in with Google",
          }).then((e) => {
            e && "function" == typeof signInWithGoogle && signInWithGoogle(null);
          }))
        : (console.error(t), showToast("Round not found or expired.", { type: "error" }));
    });
}
function exitSpectator() {
  ((isSpectator = !1), (_retryWatchCode = null));
  try {
    liveUnsubscribe && liveUnsubscribe();
  } catch (e) {}
  ((liveUnsubscribe = null),
    (state.started = !1),
    (state.liveId = null),
    (state.liveCode = null),
    (state.liveOwner = null),
    document.body.classList.remove("spectator"));
  const e = document.getElementById("spectator-banner");
  e && e.classList.add("hidden");
  try {
    history.replaceState(null, "", location.pathname);
  } catch (e) {}
}
async function joinLiveRound() {
  await ensureFirebase();
  if (!currentUser) return void showToast("Sign in first to join a live round.", { type: "error" });
  if (!(await confirmLeaveActiveRound("a shared round"))) return;
  state.started && saveCurrentRound();
  const entered = await appPrompt("Enter 6-character share code:", {
    title: "Join Live Round",
    maxLength: 6,
    placeholder: "ABC123",
  });
  if (!entered) return;
  const code = normalizeLiveCode(entered);
  if (code.length !== 6)
    return void showToast("Share codes are six characters.", { type: "error" });
  showToast("Finding round…");
  /* A direct fetch by code, not a scan of the collection. See shareRoundLive. */
  db.collection("liveRounds")
    .doc(code)
    .get()
    .then((snap) => {
      if (!snap.exists)
        return void showToast("Round not found. Check the code and try again.", { type: "error" });
      (applyLiveDoc(snap, code),
        (state.started = !0),
        (state.roundId = "round_" + snap.id),
        subscribeLiveUpdates(snap.id),
        enterScreen("scoring"),
        invalidateHdcpCache(),
        invalidateMoneyCache(),
        renderStrokeSummary(),
        renderHole());
    })
    .catch((e) => {
      (console.error(e), showToast("Error joining round.", { type: "error" }));
    });
} /* Which hole you are LOOKING at is this device's view state, not the round's
   data. Replicating it meant every snapshot from the host yanked a joined
   editor to the host's hole -- tab back to 3 to fix a score, the host confirms
   8, and you are on 8 mid-edit with nothing to say why. Spectators still
   follow the host, which is the whole point of watching. */
function subscribeLiveUpdates(e) {
  (liveUnsubscribe && liveUnsubscribe(),
    (_lastLiveUpdateMs = 0),
    (liveUnsubscribe = db
      .collection("liveRounds")
      .doc(e)
      .onSnapshot((e) => {
        if (!e.exists) return;
        const t = e.data();
        const a = t.updatedAt && t.updatedAt.toMillis ? t.updatedAt.toMillis() : 0;
        (a && a <= _lastLiveUpdateMs) ||
          (a && (_lastLiveUpdateMs = a),
          (state.scores = t.scores || {}),
          (state.wolfHoles = t.wolfHoles || {}),
          (state.wolfBreakouts = t.wolfBreakouts || {}),
          (state.bankerHoles = t.bankerHoles || {}),
          (state.bankerPresses = t.bankerPresses || {}),
          (state.bonusPoints = t.bonusPoints || {}),
          (state.pickedUp = t.pickedUp || {}),
          (state.matchPresses = t.matchPresses || []),
          isSpectator && (state.currentHole = t.currentHole || 0),
          (_liveBase = cloneLive(liveProgress())),
          invalidateMoneyCache(),
          renderHole());
      })));
}
function requestNotificationPermission() {
  "Notification" in window &&
    "default" === Notification.permission &&
    Notification.requestPermission();
}
function sendNotification(e, t) {
  ("Notification" in window &&
    "granted" === Notification.permission &&
    new Notification(e, { body: t, icon: "logo-192.png", badge: "logo-64.png" }),
    navigator.vibrate && navigator.vibrate(200));
}
