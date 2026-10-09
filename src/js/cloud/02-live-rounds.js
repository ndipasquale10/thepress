let liveUnsubscribe = null;
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
  /* Point your phone at mine: where the browser can read a QR code, the
     camera comes first and typing is the fallback. */
  let entered = canScanCodes() ? await scanLiveCode() : "type";
  if (null === entered) return;
  "type" === entered &&
    (entered = await appPrompt("Enter 6-character share code:", {
      title: "Join Live Round",
      maxLength: 6,
      placeholder: "ABC123",
    }));
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
    (liveUnsubscribe = db
      .collection("liveRounds")
      .doc(e)
      .onSnapshot((e) => {
        if (!e.exists) return;
        const t = e.data();
        /* Every snapshot is applied. This used to skip any whose updatedAt was
           not newer than the last one seen, to drop "stale" updates -- but a
           single document's snapshots already arrive in order, and updatedAt is
           whichever write stamped it last, not the newest. When two phones
           scored in the same moment, the snapshot carrying the other phone's
           score could hold the older stamp and was thrown away, so one phone
           went on missing a score the server had until some later write
           happened to arrive. Measured: 5 to 8 of 40 simultaneous entries. */
        ((_livePresence = t.presence || {}),
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
          renderHole(),
          refreshWatchScreen());
      })));
}
/* The Watch screen drew itself once, on the way in, and the snapshot handler
   only ever redrew the scoring screen behind it -- so a spectator's money board
   sat on whatever it said when they opened the link. */
function refreshWatchScreen() {
  const w = document.getElementById("watch-screen");
  w && !w.classList.contains("hidden") && renderWatch();
}

/* Presence. The snapshot replaces scores cell by cell now, so two phones no
   longer erase each other, but nothing told you someone else was on your hole
   until a number changed under your thumb. Each signed-in scorer keeps one
   entry -- presence.<uid> = {name, hole, at} -- and firestore.rules lets a write
   touch only the writer's own. It turns a data race into a social one: "Dave is
   scoring this hole too" is something a foursome sorts out by talking. */
let _livePresence = {},
  _presenceHole = -1,
  _presenceAt = 0;
const PRESENCE_FRESH_MS = 3 * 60 * 1000;
function presenceName() {
  const n =
    getPrimaryPlayerName() ||
    String((currentUser && currentUser.displayName) || "").split(" ")[0] ||
    "A scorer";
  return n.slice(0, 40);
}
function pushPresence(force) {
  if (!state.liveId || isSpectator || !currentUser || "undefined" == typeof db || !db) return;
  const h = state.currentHole || 0,
    now = Date.now();
  if (!force && h === _presenceHole && now - _presenceAt < 60000) return;
  ((_presenceHole = h), (_presenceAt = now));
  const ref = db.collection("liveRounds").doc(state.liveId);
  ref
    .update(new firebase.firestore.FieldPath("presence", currentUser.uid), {
      name: presenceName(),
      hole: h,
      at: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .catch(() => {});
}
/* Others in the round, freshest first. A pending server timestamp reads as
   null on the writer's own snapshot; it is "now" by definition. */
function livePresenceOthers() {
  const me = currentUser && currentUser.uid,
    now = Date.now();
  return Object.keys(_livePresence || {})
    .filter((uid) => uid !== me)
    .map((uid) => {
      const p = _livePresence[uid] || {},
        at = p.at && p.at.toMillis ? p.at.toMillis() : now;
      return { uid, name: String(p.name || "Someone"), hole: Number(p.hole) || 0, at };
    })
    .filter((p) => now - p.at < PRESENCE_FRESH_MS)
    .sort((a, b) => b.at - a.at);
}
function renderPresence() {
  const slots = document.querySelectorAll(".live-presence");
  if (!slots.length) return;
  const who = state.liveId ? livePresenceOthers() : [],
    here = isSpectator ? [] : who.filter((p) => p.hole === (state.currentHole || 0));
  const html = who.length
    ? '<div class="presence-row"><span class="presence-k">' +
      (isSpectator ? "Scoring now" : "Also scoring") +
      "</span>" +
      who
        .map(
          (p) =>
            '<span class="presence-chip' +
            (here.includes(p) ? " same-hole" : "") +
            '"><span class="presence-dot" aria-hidden="true"></span>' +
            esc(p.name) +
            " · H" +
            hLbl(p.hole) +
            "</span>",
        )
        .join("") +
      "</div>" +
      (here.length
        ? '<div class="presence-warn">' +
          esc(
            here.map((p) => p.name).join(" and ") +
              (1 === here.length ? " is" : " are") +
              " on this hole too. Agree who enters which scores before confirming.",
          ) +
          "</div>"
        : "")
    : "";
  /* Only write when it changed: the slot is polite-live, and renderHole runs
     on every tap. */
  slots.forEach((el) => {
    el._presence !== html && ((el.innerHTML = html), (el._presence = html));
    el.classList.toggle("hidden", !html);
  });
}
setInterval(() => {
  "visible" === document.visibilityState && state.liveId && (pushPresence(), renderPresence());
}, 30000);
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

/* Scan to join. The Go Live sheet shows a QR of the watch link; this reads it
   back with BarcodeDetector, which Chrome on Android ships and Safari does not
   -- so where it is missing the join is the typed code, exactly as before. */
function canScanCodes() {
  return (
    "BarcodeDetector" in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  );
}
/* The QR carries the watch URL (?watch=CODE); a bare code is accepted too. */
function codeFromScan(raw) {
  const t = String(raw || "").trim();
  try {
    const w = new URL(t).searchParams.get("watch");
    if (w) return normalizeLiveCode(w);
  } catch (e) {}
  const c = normalizeLiveCode(t);
  return 6 === c.length ? c : "";
}
/* Resolves to a code, "type" to fall back to typing, or null for cancel. */
function scanLiveCode() {
  return new Promise(async (resolve) => {
    let stream = null,
      timer = null,
      done = !1;
    const m = document.getElementById("scan-modal"),
      v = document.getElementById("scan-video"),
      msg = document.getElementById("scan-msg");
    const finish = (val) => {
      if (done) return;
      ((done = !0), clearTimeout(timer));
      stream && stream.getTracks().forEach((t) => t.stop());
      ((v.srcObject = null), (m.onclick = null), (m.onkeydown = null));
      (closeModal("scan-modal"), resolve(val));
    };
    ((document.getElementById("scan-type").onclick = () => finish("type")),
      (document.getElementById("scan-cancel").onclick = () => finish(null)),
      (m.onclick = (e) => e.target === m && finish(null)),
      (m.onkeydown = (e) => "Escape" === e.key && (e.preventDefault(), finish(null))),
      (msg.textContent = "Point the camera at the code on the host’s phone."),
      m.classList.remove("hidden"),
      openModalA11y("scan-modal"));
    try {
      const det = new BarcodeDetector({ formats: ["qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: !1,
      });
      if (done) return void stream.getTracks().forEach((t) => t.stop());
      ((v.srcObject = stream), await v.play());
      const tick = async () => {
        if (done) return;
        try {
          const found = await det.detect(v);
          for (const f of found) {
            const c = codeFromScan(f.rawValue);
            if (c) return (haptic(), finish(c));
          }
        } catch (e) {}
        timer = setTimeout(tick, 250);
      };
      tick();
    } catch (e) {
      msg.textContent = "The camera isn’t available. Type the code instead.";
    }
  });
}
