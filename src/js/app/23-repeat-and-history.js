/* "Same as last time?" -- the commonest setup is the same course, the same
   four people and the same game as last Saturday. "Add last group" made the
   roster one tap; this makes the whole round one tap, straight to the first
   tee. Handicaps come from each player's saved profile, not the old round, so
   a number changed since then is the one used. */
function repeatableRound() {
  /* Not while a round is open on this phone; an older unfinished round has its
     own resume card and does not stop a new one. */
  if (state.started) return null;
  const r = mostRecentRound(!0);
  return r && (r.players || []).length && r.pars && r.pars.length ? r : null;
}
function repeatCardHTML() {
  const r = repeatableRound();
  if (!r) return "";
  const names = (r.players || []).map((p) => esc(String(p.name || "").split(" ")[0])).join(", ");
  return (
    '<div class="repeat-card"><div class="repeat-text"><div class="repeat-k">Same as last time?</div>' +
    '<div class="repeat-course">' +
    esc(r.course || "Round") +
    "</div>" +
    '<div class="repeat-meta">' +
    esc(GAME_NAMES[r.gameType] || r.gameType || "") +
    " · " +
    (r.holeCount || 18) +
    " holes · " +
    names +
    "</div></div>" +
    '<button class="btn primary repeat-go" data-act="repeatLastRound()">Tee off</button></div>'
  );
}
function repeatLastRound() {
  const r = repeatableRound();
  if (!r) return void showToast("Nothing to repeat yet.", { type: "info" });
  const copy = (v) => (null == v ? v : JSON.parse(JSON.stringify(v))),
    key = (n) =>
      String(n || "")
        .trim()
        .toLowerCase(),
    profs = getSavedProfiles();
  ((state.players = r.players.map((p) => {
    const saved = profs.find((q) => key(q.name) === key(p.name)),
      o = { ...copy(p) };
    if (saved) {
      null != saved.hdcp && isFinite(saved.hdcp) && (o.hdcp = saved.hdcp);
      ["venmo", "cashapp", "paypal"].forEach((k) => (o[k] = saved[k] || o[k] || ""));
    }
    return o;
  })),
    (state.course = r.course || "Round"),
    (state.selectedTee = copy(r.selectedTee) || null),
    (state.pars = copy(r.pars)),
    (state.hdcps = copy(r.hdcps)),
    (state.holeCount = r.holeCount || 18),
    (state.holeStart = r.holeStart || 0),
    (state.gameType = r.gameType || "none"),
    (state.gameOpts = copy(r.gameOpts) || {}),
    (state.sideBets = Object.assign(defaultSideBets(), copy(r.sideBets) || {})),
    (state.handicapMode = r.handicapMode),
    (state.pairings = copy(r.pairings)),
    (state.liveId = state.liveCode = state.liveOwner = null),
    (state.pickedUp = {}),
    (state.scores = {}),
    (state.bonusPoints = {}));
  (state.players.forEach((p, i) => {
    ((state.scores[i] = {}), (state.bonusPoints[i] = {}));
  }),
    (state.wolfHoles = {}),
    (state.wolfBreakouts = {}),
    (state.bankerHoles = {}),
    (state.bankerPresses = {}),
    (state.confirmedHoles = {}),
    (state.pairingsLocked = !1),
    (state.matchPresses = []),
    (state.currentHole = 0),
    (state.started = !0),
    (state.roundId = generateRoundId()),
    (state.roundDate = new Date().toISOString()));
  const cn = document.getElementById("course-name");
  (cn && (cn.value = state.course),
    invalidateHdcpCache(),
    invalidateMoneyCache(),
    enterScreen("scoring"),
    saveCurrentRound(),
    renderStrokeSummary(),
    renderHole(),
    haptic(),
    showToast("Same game as last time. Change anything from Edit.", { type: "success" }),
    maybeShowStrokesAtStart());
}

/* When search misses, the round should not stall on the first screen. Take
   the name as typed, fill a standard par 72, and let the pars be fixed on the
   card -- they are editable below, and on every hole. */
function useTypedCourse() {
  const s = document.getElementById("course-search"),
    typed = (s && s.value.trim()) || "";
  if (!typed) return;
  clearCourse();
  ((document.getElementById("course-name").value = typed),
    (s.value = ""),
    document.getElementById("course-results").classList.add("hidden"),
    showToast("Par " + state.pars.reduce((a, b) => a + b, 0) + " filled in. Fix any hole below."));
}

/* Your courses: where you play, how you score there, and which hole has your
   number. Read from the phone owner's card in every finished round. */
function courseHistory(me) {
  const by = {},
    k = (s) =>
      String(s || "")
        .trim()
        .toLowerCase();
  getAllRounds()
    .filter((r) => r.finished && r.scores && Array.isArray(r.pars))
    .forEach((r) => {
      const i = (r.players || []).findIndex((p) => k(p.name) === k(me));
      if (i < 0 || !k(r.course) || "round" === k(r.course)) return;
      const c = (by[k(r.course)] = by[k(r.course)] || {
          name: r.course,
          rounds: 0,
          money: 0,
          best18: null,
          best9: null,
          sumVsPar: 0,
          holesPlayed: 0,
          hole: {},
          last: 0,
        }),
        n = r.holeCount || r.pars.length,
        row = r.scores[i] || {};
      ((c.rounds += 1),
        (c.money += (Array.isArray(r.money) && r.money[i]) || 0),
        (c.last = Math.max(c.last, _rTime(r))));
      let gross = 0,
        all = !0;
      for (let h = 0; h < n; h++) {
        const v = row[h],
          par = r.pars[h];
        if (null == v || !isFinite(v) || !par) {
          all = !1;
          continue;
        }
        const num = h + (r.holeStart || 0) + 1,
          slot = (c.hole[num] = c.hole[num] || { n: 0, sum: 0, par });
        ((slot.n += 1),
          (slot.sum += v - par),
          (gross += v),
          (c.sumVsPar += v - par),
          (c.holesPlayed += 1));
      }
      all &&
        (18 === n
          ? (c.best18 = null == c.best18 ? gross : Math.min(c.best18, gross))
          : 9 === n && (c.best9 = null == c.best9 ? gross : Math.min(c.best9, gross)));
    });
  return Object.values(by).sort((a, b) => b.rounds - a.rounds || b.last - a.last);
}
function renderCourseHistory() {
  const el = document.getElementById("course-history");
  if (!el) return;
  const me = getPrimaryPlayerName(),
    list = me ? courseHistory(me) : [];
  if (!list.length) return void (el.innerHTML = "");
  const sg = (v) => (Math.abs(v) < 0.05 ? "E" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(1));
  el.innerHTML =
    '<div class="section-head"><h2>Your courses</h2><span class="hint">as ' +
    esc(me) +
    "</span></div>" +
    list
      .slice(0, 8)
      .map((c) => {
        const holes = Object.keys(c.hole)
            .map(Number)
            .sort((a, b) => a - b)
            .map((h) => ({ h, avg: c.hole[h].sum / c.hole[h].n, par: c.hole[h].par })),
          worst = holes.reduce((a, b) => (!a || b.avg > a.avg ? b : a), null),
          best = holes.reduce((a, b) => (!a || b.avg < a.avg ? b : a), null),
          per18 = c.holesPlayed ? (18 * c.sumVsPar) / c.holesPlayed : 0;
        return (
          '<details class="card ch-card"><summary class="ch-head"><span class="ch-name">' +
          esc(c.name) +
          '</span><span class="ch-money ' +
          (c.money > 0.005 ? "match-up" : c.money < -0.005 ? "match-dn" : "") +
          '">' +
          fmtMoney(c.money) +
          "</span></summary>" +
          '<div class="scoring-stat-pills">' +
          '<span class="stat-pill"><strong>' +
          c.rounds +
          "</strong><small>Rounds</small></span>" +
          '<span class="stat-pill"><strong>' +
          (null != c.best18 ? c.best18 : null != c.best9 ? c.best9 : "—") +
          "</strong><small>" +
          (null == c.best18 && null != c.best9 ? "Best 9" : "Best 18") +
          "</small></span>" +
          '<span class="stat-pill"><strong>' +
          sg(per18) +
          "</strong><small>Avg /18</small></span></div>" +
          (worst && worst !== best
            ? '<div class="ch-line">Has your number: <b>Hole ' +
              worst.h +
              "</b> (par " +
              worst.par +
              ", " +
              sg(worst.avg) +
              ") · Your best: <b>Hole " +
              best.h +
              "</b> (" +
              sg(best.avg) +
              ")</div>"
            : "") +
          '<div class="ch-grid" role="list" aria-label="Average against par, by hole">' +
          holes
            .map(
              (x) =>
                '<span class="ch-cell ' +
                (x.avg <= -0.05 ? "under" : x.avg >= 0.95 ? "over2" : x.avg >= 0.05 ? "over" : "") +
                '" role="listitem"><small>' +
                x.h +
                "</small>" +
                sg(x.avg) +
                "</span>",
            )
            .join("") +
          "</div></details>"
        );
      })
      .join("");
}

/* CSV for the people who keep the spreadsheet. One row per player per
   finished round, hole by hole, with the money. */
function csvCell(v) {
  const s = null == v ? "" : String(v);
  /* A leading = + - @ is a formula to a spreadsheet; a course or a name is
     not, so it is made inert with a quote. */
  const safe = /^[=+\-@]/.test(s) && isNaN(Number(s)) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}
function roundsCSV() {
  const rounds = getAllRounds()
      .filter((r) => r.finished)
      .sort((a, b) => _rTime(a) - _rTime(b)),
    maxH = rounds.reduce((m, r) => Math.max(m, r.holeCount || (r.pars || []).length || 0), 0),
    head = ["Date", "Course", "Game", "Holes", "Player", "Handicap", "Gross", "To par", "Money"];
  for (let h = 1; h <= maxH; h++) head.push("H" + h);
  const rows = [head];
  rounds.forEach((r) => {
    const n = r.holeCount || (r.pars || []).length,
      date = String(r.finishedDate || r.date || "").slice(0, 10);
    (r.players || []).forEach((p, i) => {
      const row = (r.scores && r.scores[i]) || {},
        cells = [];
      let gross = 0,
        par = 0;
      for (let h = 0; h < maxH; h++) {
        const v = h < n ? row[h] : null;
        (cells.push(null == v ? "" : v),
          null != v && ((gross += v), (par += (r.pars && r.pars[h]) || 0)));
      }
      rows.push(
        [
          date,
          r.course || "",
          GAME_NAMES[r.gameType] || r.gameType || "",
          n,
          p.name,
          null == p.hdcp ? "" : p.hdcp,
          gross || "",
          gross ? gross - par : "",
          Array.isArray(r.money) ? (Math.round(100 * (r.money[i] || 0)) / 100).toFixed(2) : "",
        ].concat(cells),
      );
    });
  });
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
function exportCSV() {
  if (!getAllRounds().some((r) => r.finished))
    return void showToast("Finish a round first.", { type: "info" });
  const blob = new Blob(["﻿" + roundsCSV()], { type: "text/csv;charset=utf-8" }),
    link = document.createElement("a");
  ((link.download = "thepress-rounds-" + new Date().toISOString().slice(0, 10) + ".csv"),
    (link.href = URL.createObjectURL(blob)),
    link.click(),
    setTimeout(() => URL.revokeObjectURL(link.href), 1e3),
    showToast("Rounds exported as CSV.", { type: "success" }));
}
