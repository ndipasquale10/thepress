async function goHome() {
  if (isSpectator) "function" == typeof exitSpectator && exitSpectator();
  else if (state.started) {
    if (
      !(await appConfirm("Return to home? Your round is auto-saved.", {
        title: "Leave Round",
        confirmLabel: "Go Home",
      }))
    )
      return;
    saveCurrentRound();
  }
  (["scorecard-modal", "standings-modal", "results-modal", "hole-result-overlay"].forEach((e) => {
    const t = document.getElementById(e);
    t && t.classList.add("hidden");
  }),
    enterScreen("home"));
}
function sixesSetupValid() {
  if ("sixes" !== state.gameType) return !0;
  if (4 !== state.players.length)
    return (showToast("Sixes requires exactly 4 players (rotating 2v2).", { type: "error" }), !1);
  return !0;
}
function bankerSetupValid() {
  if ("banker" !== state.gameType) return !0;
  if (!document.getElementById("opt-banker-teams")?.checked) return !0;
  const n = state.players.length;
  if (n < 4 || n % 2 !== 0)
    return (
      showToast("Banker teams need an even roster of 4, 6, or 8 players.", { type: "error" }),
      !1
    );
  const ids = [];
  for (let ti = 0; ti < Math.floor(n / 2); ti++) {
    (ids.push(+(document.getElementById("opt-banker-t" + ti + "a")?.value ?? -1)),
      ids.push(+(document.getElementById("opt-banker-t" + ti + "b")?.value ?? -2)));
  }
  return new Set(ids).size === n
    ? !0
    : (showToast("Each player must be on exactly one Banker team — check your assignments.", {
        type: "error",
      }),
      !1);
}
function vegasSetupValid() {
  if ("vegas" !== state.gameType) return !0;
  if (4 !== state.players.length)
    return (showToast("Vegas requires exactly 4 players (2 teams of 2).", { type: "error" }), !1);
  const e = ["opt-vegas-t1a", "opt-vegas-t1b", "opt-vegas-t2a", "opt-vegas-t2b"].map(
    (e) => +(document.getElementById(e)?.value ?? -1),
  );
  return new Set(e).size === 4
    ? !0
    : (showToast("Vegas teams must have 4 different players — check your team assignments.", {
        type: "error",
      }),
      !1);
}
function nassauSetupValid() {
  if ("nassau" !== state.gameType) return !0;
  if (!document.getElementById("opt-nassau-teams")?.checked) return !0;
  if (state.players.length < 4)
    return (
      showToast("Nassau teams require exactly 4 players (2 teams of 2).", { type: "error" }),
      !1
    );
  const e = ["opt-nassau-t1a", "opt-nassau-t1b", "opt-nassau-t2a", "opt-nassau-t2b"].map(
    (e) => +(document.getElementById(e)?.value ?? -1),
  );
  return new Set(e).size === 4
    ? !0
    : (showToast("Nassau teams must have 4 different players — check your team assignments.", {
        type: "error",
      }),
      !1);
}
function continueToGame() {
  if (!state.players.length)
    return void showToast("Add at least 1 player first.", { type: "error" });
  const names = state.players.map((p) => p.name.trim().toLowerCase());
  if (names.some((n) => !n)) return void showToast("All players need a name.", { type: "error" });
  if (new Set(names).size !== names.length)
    return void showToast("Two players share a name.", { type: "error" });
  state.course = document.getElementById("course-name").value || "Round";
  showScreen("games");
}
function startRound() {
  if (state.players.length < 1) return void showToast("Add at least 1 player.", { type: "error" });
  const e = state.players.map((e) => e.name.trim().toLowerCase());
  e.some((e) => !e)
    ? showToast("All players need a name.", { type: "error" })
    : new Set(e).size === e.length
      ? vegasSetupValid() && nassauSetupValid() && sixesSetupValid() && bankerSetupValid()
        ? ((state.course = document.getElementById("course-name").value || "Round"),
          (state.gameOpts = readGameOpts()),
          (state.sideBets = readSideBets()),
          saveProfiles(),
          (state.scores = {}),
          state.players.forEach((e, t) => {
            state.scores[t] = {};
          }),
          (state.bonusPoints = {}),
          state.players.forEach((e, t) => {
            state.bonusPoints[t] = {};
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
          (_unseatedMe = !1),
          enterScreen("scoring"),
          (state.roundId = generateRoundId()),
          (state.roundDate = new Date().toISOString()),
          saveCurrentRound(),
          renderStrokeSummary(),
          invalidateMoneyCache(),
          debouncedSave(),
          renderHole(),
          maybeShowStrokesAtStart())
        : void 0
      : showToast("Player names must be unique.", { type: "error" });
}
function renderStrokeSummary() {
  const e = document.getElementById("stroke-summary"),
    t = getPlayingHandicaps(),
    a = state.handicapMode,
    s = state.players.map((e) => e.hdcp),
    n = Math.min(...s),
    o = state.players[s.indexOf(n)].name;
  if ("none" === a)
    return void (e.innerHTML =
      '<div class="summary-toggle">Playing Scratch — No Strokes Given <span class="toggle-arrow"><i data-ico="down"></i></span></div>');
  let l = `<div class="summary-toggle">Stroke Summary <span class="toggle-arrow"><i data-ico="down"></i></span></div><div class="summary-body">\n    <div class="summary-meta">Low handicap: <strong>${esc(o)} (${n < 0 ? "+" + Math.abs(n) : n})</strong> — plays scratch${"80pct" === a ? " · 80% applied" : ""}</div>\n    <div class="summary-players">`;
  (state.players.forEach((e, a) => {
    const s = t[a],
      n = (e.hdcp < 0 ? Math.abs(e.hdcp) : e.hdcp, []),
      o = [];
    for (let e = 0; e < maxHole(); e++) {
      const t = getStrokesOnHole(s, e);
      2 === t ? o.push(e + 1) : 1 === t && n.push(e + 1);
    }
    l += `<div class="summary-player">\n      <div class="summary-player-top">\n        ${avatarHTML(e, 10)}\n        <span class="summary-name">${esc(e.name)}</span>\n        <span class="summary-hdcp">${0 === s ? "Scratch" : `<strong>${s}</strong> strokes`}</span>\n      </div>\n      ${s > 0 ? `<div class="summary-holes">\n        ${n.length ? `<span class="stroke-dot-label">● Holes:</span> ${n.join(", ")}` : ""}\n        ${o.length ? `<span class="stroke-dot-label double">●● Holes:</span> ${o.join(", ")}` : ""}\n      </div>` : ""}\n    </div>`;
  }),
    (l += "</div></div>"),
    (e.innerHTML = l));
}
