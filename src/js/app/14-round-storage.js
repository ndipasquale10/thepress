let _saveTimer = null;
function debouncedSave() {
  (clearTimeout(_saveTimer), (_saveTimer = setTimeout(saveCurrentRound, 1e3)));
}
function saveCurrentRound() {
  if (!canMutateRound()) return;
  state.roundId || (state.roundId = generateRoundId());
  const e = {
    id: state.roundId,
    course: state.course,
    gameType: state.gameType,
    gameOpts: state.gameOpts,
    sideBets: state.sideBets || defaultSideBets(),
    players: state.players,
    pars: state.pars,
    hdcps: state.hdcps,
    scores: state.scores,
    bonusPoints: state.bonusPoints,
    wolfHoles: state.wolfHoles,
    wolfBreakouts: state.wolfBreakouts || {},
    bankerHoles: state.bankerHoles || {},
    bankerPresses: state.bankerPresses || {},
    confirmedHoles: state.confirmedHoles || {},
    pickedUp: state.pickedUp || {},
    pairings: state.pairings,
    pairingsLocked: state.pairingsLocked,
    matchPresses: state.matchPresses,
    handicapMode: state.handicapMode,
    selectedTee: state.selectedTee || null,
    currentHole: state.currentHole,
    started: state.started,
    holeCount: state.holeCount,
    holeStart: state.holeStart || 0,
    date: state.roundDate || new Date().toISOString(),
    finished: !1,
    updatedAt: Date.now(),
  };
  safeSetItem(ACTIVE_KEY, JSON.stringify(e));
}
function saveFinishedRound(e, t) {
  (clearTimeout(_saveTimer),
    state.roundId || (state.roundId = generateRoundId()),
    saveCurrentRound());
  const a = readRounds();
  (a[state.roundId] &&
    ((a[state.roundId].finished = !0),
    (a[state.roundId].money = e),
    (a[state.roundId].debts = t),
    (a[state.roundId].finishedDate = new Date().toISOString()),
    (a[state.roundId].updatedAt = Date.now()),
    safeSetItem("golfRounds", JSON.stringify(a))),
    (state.started = !1));
}
function loadRound(e) {
  const t = readRounds()[e];
  if (!t) return;
  ((state.roundId = t.id),
    (state.course = t.course),
    (state.gameType = t.gameType),
    (state.gameOpts = t.gameOpts),
    (state.sideBets = Object.assign(defaultSideBets(), t.sideBets || {})),
    (state.players = t.players),
    (state.pars = t.pars),
    (state.hdcps = t.hdcps),
    (state.scores = t.scores),
    (state.bonusPoints = t.bonusPoints || {}),
    (state.wolfHoles = t.wolfHoles || {}),
    (state.wolfBreakouts = t.wolfBreakouts || {}),
    (state.bankerHoles = t.bankerHoles || {}),
    (state.bankerPresses = t.bankerPresses || {}),
    (state.confirmedHoles = t.confirmedHoles || {}),
    (state.pickedUp = t.pickedUp || {}),
    (state.pairings = t.pairings),
    (state.pairingsLocked = t.pairingsLocked || !1),
    (state.matchPresses = t.matchPresses || []),
    (state.handicapMode = t.handicapMode),
    (state.selectedTee = t.selectedTee || null),
    (state.currentHole = t.currentHole || 0),
    (state.started = t.started),
    (state.holeCount = t.holeCount || 18),
    (state.holeStart = t.holeStart || 0),
    (state.roundDate = t.date));
  const a = document.getElementById("handicap-mode");
  (a && (a.value = state.handicapMode || "full"),
    invalidateHdcpCache(),
    enterScreen("scoring"),
    renderStrokeSummary(),
    invalidateMoneyCache(),
    renderHole());
}
async function deleteRound(e) {
  if (
    !(await appConfirm("Delete this round?", {
      title: "Delete Round",
      confirmLabel: "Delete",
      danger: !0,
    }))
  )
    return;
  const t = readRounds();
  (delete t[e],
    safeSetItem("golfRounds", JSON.stringify(t)),
    markRoundDeleted(e),
    enterScreen(_currentScreen, { noPush: !0 }));
} /* saveCurrentRound() used to parse the whole golfRounds blob, replace one key
   and re-stringify all of it -- once a second, on a debounce, while somebody is
   tapping scores in. That is every round they have ever played, re-serialised
   for one changed number, and it grows forever. Measured on a 6x-throttled CPU:

     10 rounds   20KB   1.6ms
     50 rounds   99KB   6.1ms
    100 rounds  198KB  14.4ms   <- a dropped frame, every second
    200 rounds  397KB  25.4ms

   So the hot path writes the active round on its own, which is ~2.3KB and
   constant no matter how long the history gets. Everything else still reads
   one blob: readRounds() folds the buffer in first, so every existing reader --
   history, export, sync, the resume card -- is untouched and cannot see a
   stale round. The fold also runs on the way out (pagehide) and at launch, so
   a tab evicted mid-round comes back to the buffer rather than to nothing. */
const ACTIVE_KEY = "golfRoundActive";
function flushActiveRound() {
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (!raw) return;
  const r = safeParseJSON(raw, null);
  /* A buffer we cannot parse is not worth destroying the history over, but it
     is worth clearing, or it is retried on every read forever. */
  if (!r || !r.id) {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {}
    return;
  }
  const all = safeParseJSON(localStorage.getItem("golfRounds"), {});
  all[r.id] = r;
  /* Only drop the buffer if the merged write actually landed -- on a full
     quota it has not, and the buffer is then the only copy of this round. */
  if (safeSetItem("golfRounds", JSON.stringify(all)))
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {}
}
function readRounds() {
  flushActiveRound();
  return safeParseJSON(localStorage.getItem("golfRounds"), {});
}
/* Deleted rounds are remembered by id and time, so a sync can tell "deleted
   here" from "never seen here". Without it the cloud copy of a deleted round
   was merged straight back in on the next sign-in. */
const DELETED_KEY = "golfRoundsDeleted";
function readDeletedRounds() {
  return safeParseJSON(localStorage.getItem(DELETED_KEY), {});
}
function markRoundDeleted(id) {
  const d = readDeletedRounds();
  ((d[id] = Date.now()), safeSetItem(DELETED_KEY, JSON.stringify(d)));
}
/* Two devices' rounds and deletions in, one agreed set out. The more recently
   edited copy of a round wins (a copy saved before edit times were recorded
   counts as oldest, and a tie keeps this device's), and a deletion wins over
   any copy last edited before it. */
function mergeRoundSets(local, localDel, remote, remoteDel) {
  const deleted = { ...localDel };
  for (const id in remoteDel || {}) deleted[id] = Math.max(deleted[id] || 0, remoteDel[id] || 0);
  const rounds = {},
    at = (r) => (r && +r.updatedAt) || 0;
  for (const id of new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])) {
    const l = local && local[id],
      r = remote && remote[id],
      pick = !l ? r : !r ? l : at(r) > at(l) ? r : l;
    if (!pick || (deleted[id] && deleted[id] >= at(pick))) continue;
    rounds[id] = pick;
  }
  return { rounds, deleted };
}
function getAllRounds() {
  return Object.values(readRounds());
} /* A portability export, not just a backup: whoever asks for their data should
   get everything the app holds about them. Rounds, profiles and courses are all
   mirrored from this device, so the local copy is the complete record -- except
   for who the account belongs to, which only exists once you have signed in. */
function exportAllData() {
  const payload = {
    profiles: getSavedProfiles(),
    courses: getSavedCourses(),
    rounds: readRounds(),
    exportDate: new Date().toISOString(),
    version: "1.1",
  };
  if ("undefined" != typeof currentUser && currentUser) {
    payload.account = {
      uid: currentUser.uid,
      email: currentUser.email || null,
      displayName: currentUser.displayName || null,
    };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    link = document.createElement("a");
  link.download = "thepress-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  link.href = URL.createObjectURL(blob);
  link.click();
  showToast("Data exported.", { type: "success" });
}
// A round only survives import if it is shaped like one. A finished round whose
// money is not one finite number per player still reaches seasonAgg, and lands
// in the season table as -$NaN -- so a truncated or hand-edited backup used to
// poison every total on the home screen. Reject those instead, and say so,
// rather than importing something that renders as garbage.
function importableRound(r) {
  if (!r || "object" != typeof r || Array.isArray(r)) return !1;
  if (!Array.isArray(r.players) || !r.players.length) return !1;
  if (!r.players.every((p) => p && "object" == typeof p && "string" == typeof p.name)) return !1;
  if (r.finished && !Array.isArray(r.money)) return !1;
  if (
    null != r.money &&
    (!Array.isArray(r.money) ||
      r.money.length !== r.players.length ||
      !r.money.every((v) => "number" == typeof v && isFinite(v)))
  )
    return !1;
  return !0;
}
function handleImportFile(e) {
  const t = e.target.files && e.target.files[0];
  if (((e.target.value = ""), !t)) return;
  const a = new FileReader();
  ((a.onload = () => {
    const e = safeParseJSON(a.result, null);
    if (!e || "object" != typeof e || (!e.profiles && !e.courses && !e.rounds))
      return void showToast("Import failed: not a valid backup file.", { type: "error" });
    let s = 0,
      n = 0,
      o = 0,
      d = 0;
    if (Array.isArray(e.profiles)) {
      const t = getSavedProfiles(),
        a = mergeByName(t, e.profiles);
      ((s = a.length - t.length), safeSetItem("golfProfiles", JSON.stringify(a)));
    }
    if (Array.isArray(e.courses)) {
      const t = getSavedCourses(),
        a = mergeByName(t, e.courses);
      ((n = a.length - t.length), safeSetItem("golfCourses", JSON.stringify(a)));
    }
    if (e.rounds && "object" == typeof e.rounds) {
      const t = readRounds(),
        c = {};
      Object.keys(e.rounds).forEach((k) => {
        (importableRound(e.rounds[k]) && (c[k] = e.rounds[k]), importableRound(e.rounds[k]) || d++);
      });
      const del = readDeletedRounds();
      Object.keys(c).forEach((k) => {
        del[k] && (c[k] = { ...c[k], updatedAt: Date.now() });
      });
      const a = { ...c, ...t };
      ((o = Object.keys(a).length - Object.keys(t).length),
        safeSetItem("golfRounds", JSON.stringify(a)));
    }
    ("function" == typeof renderPlayers && renderPlayers(),
      "function" == typeof renderHistory && renderHistory(),
      "function" == typeof updateNavCounts && updateNavCounts(),
      showToast(
        "Imported " +
          s +
          " profiles, " +
          n +
          " courses, " +
          o +
          " rounds" +
          (d ? " \u2014 skipped " + d + " unreadable round" + (1 === d ? "" : "s") : ""),
        { type: d ? "info" : "success" },
      ));
  }),
    (a.onerror = () => showToast("Could not read the selected file.", { type: "error" })),
    a.readAsText(t));
}
