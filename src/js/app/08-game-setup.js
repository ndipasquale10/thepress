function decorateGameCards() {
  document.querySelectorAll("#game-grid .game-card").forEach((c) => {
    const g = c.dataset.game;
    if (!c.querySelector(".gc-rules")) {
      const p = document.createElement("span");
      p.className = "gc-rules";
      p.textContent = GAME_DESCS[g] || "";
      c.appendChild(p);
      const s = document.createElement("span");
      s.className = "gc-stake";
      c.appendChild(s);
    }
    const st = c.querySelector(".gc-stake");
    st && (st.textContent = c.classList.contains("selected") ? gameStakeLabel(g) : "");
  });
}
function updateGamesSummary() {
  const el = document.getElementById("games-summary");
  decorateGameCards();
  document.querySelectorAll(".sb-card").forEach((c) => {
    const cb = document.getElementById("sb-" + c.dataset.sb + "-on");
    c.classList.toggle("on", !!(cb && cb.checked));
  });
  if (!el) return;
  const main =
      state.gameType && "none" !== state.gameType
        ? [GAME_NAMES[state.gameType] || state.gameType]
        : [],
    side = [],
    sb = { skins: "Skins", snake: "Snake", junk: "Junk" };
  Object.keys(sb).forEach((k) => {
    const on = document.getElementById("sb-" + k + "-on");
    if (!on || !on.checked) return;
    const dup =
      ("skins" === k && "skins" === state.gameType) ||
      ("snake" === k && "snake" === state.gameType) ||
      ("junk" === k && ("dots" === state.gameType || "bingo" === state.gameType));
    side.push(sb[k] + (dup ? " (in main game)" : ""));
  });
  const all = main.concat(side),
    n = all.length;
  let perHole = 0;
  const sv = (k) => +((document.getElementById("sb-" + k + "-val") || {}).value || 0);
  document.getElementById("sb-skins-on")?.checked &&
    "skins" !== state.gameType &&
    (perHole += sv("skins"));
  document.getElementById("sb-junk-on")?.checked &&
    "dots" !== state.gameType &&
    "bingo" !== state.gameType &&
    (perHole += sv("junk"));
  el.innerHTML = n
    ? '<div class="gs-row"><span class="gs-count">Selected · ' +
      n +
      " game" +
      (1 === n ? "" : "s") +
      "</span>" +
      (perHole ? '<span class="gs-stake">≈ $' + perHole + " / hole in side bets</span>" : "") +
      "</div>" +
      '<div class="gs-chips">' +
      all.map((x) => '<span class="gs-chip">' + esc(x) + "</span>").join("") +
      "</div>"
    : '<div class="gs-row"><span class="gs-count">No betting — score only</span></div>';
}
function selectGameType(g) {
  const s = document.getElementById("game-type");
  s && (s.value = g);
  document.querySelectorAll("#game-grid .game-card").forEach((c) => {
    const on = c.dataset.game === g;
    c.classList.toggle("selected", on);
    c.setAttribute("aria-checked", on ? "true" : "false");
  });
  (haptic(), updateGameOptions(), dockGameOptions(), updateGamesSummary());
}
function wolfTeamsUneven() {
  return state.players.length >= 5 && state.players.length % 2 === 1;
}
function syncWolfUnevenOpts() {
  const el = document.getElementById("wolf-uneven-opts");
  if (el) el.style.display = wolfTeamsUneven() ? "" : "none";
} // Games whose roster requirement is fixed by the game itself, not by one of
// its options. Sixes and Vegas both hard-fail startRound() on anything but a
// foursome, and that used to surface only after you had picked the game,
// filled in its stakes and reached the bottom of the screen. Flag it on the
// card instead, while choosing is still cheap. Option-gated requirements
// (Nassau/Banker teams) stay with their own validators -- the base games play
// fine at any roster size, so a card-level warning would be wrong.
const GAME_FIT = {
  sixes: { ok: (n) => 4 === n, why: "Needs exactly 4 players" },
  vegas: { ok: (n) => 4 === n, why: "Needs exactly 4 players" },
};
function updateGameFit() {
  const n = state.players.length;
  document.querySelectorAll("#game-grid .game-card").forEach((c) => {
    const f = GAME_FIT[c.dataset.game],
      old = c.querySelector(".gc-fit");
    old && old.remove();
    if (!f || !n || f.ok(n)) return;
    const s = document.createElement("span");
    ((s.className = "gc-fit"), (s.textContent = f.why), c.appendChild(s));
  });
}
function updateGameOptions() {
  _gameOptsDirty();
  updateGameFit();
  ((state.gameType = document.getElementById("game-type").value),
    (document.getElementById("game-desc").textContent = ""));
  const _n9 = maxHole() <= 9;
  const e = {
    nassau: `\n      <div class="game-opt"><label for="opt-front">${_n9 ? "Match" : "Front 9"} Bet ($)</label> <input type="number" inputmode="decimal" id="opt-front" value="5" min="1"></div>\n      ${_n9 ? "" : '<div class="game-opt"><label for="opt-back">Back 9 Bet ($)</label> <input type="number" inputmode="decimal" id="opt-back" value="5" min="1"></div>'}\n      ${_n9 ? "" : '<div class="game-opt"><label for="opt-overall">Overall 18 Bet ($)</label> <input type="number" inputmode="decimal" id="opt-overall" value="5" min="1"></div>'}${_n9 ? '<div class="hint">Nine holes: one match over the nine. Back 9 and Overall 18 are eighteen-hole bets, so they are off.</div>' : ""}\n      <div class="game-opt"><label><input type="checkbox" id="opt-press" checked> Auto 2-Down Press ($)</label> <input type="number" inputmode="decimal" id="opt-press-val" value="5" min="1"></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-nassau-teams"> 2v2 Team Match (Best Ball)</label></div>\n      <div id="nassau-team-setup" class="hidden"></div>\n      <div class="hint">Press creates a new side bet from that hole forward. 2v2: best ball per team determines hole winner.</div>`,
    skins:
      '<div class="game-opt"><label for="opt-skin">$ Per Skin</label> <input type="number" inputmode="decimal" id="opt-skin" value="5" min="1"></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-carry" checked> Carry-over ties (pot grows)</label></div>',
    match: `<div class="game-opt"><label for="opt-match-format">Match Format</label>\n        <select id="opt-match-format">\n          <option value="perhole">Per Hole ($)</option>\n          <option value="nassau">Front 9 / Back 9 / Overall ($)</option>\n        </select></div>\n      <div id="match-format-perhole"><div class="game-opt"><label for="opt-match">$ Per Hole Won</label> <input type="number" inputmode="decimal" id="opt-match" value="2" min="1"></div>\n      <div class="game-opt"><label for="opt-match-press-val">Press Bet ($)</label> <input type="number" inputmode="decimal" id="opt-match-press-val" value="2" min="1"></div></div>\n      <div id="match-format-nassau" class="hidden"><div class="game-opt"><label for="opt-match-front">${_n9 ? "Match" : "Front 9"} ($)</label> <input type="number" inputmode="decimal" id="opt-match-front" value="5" min="1"></div>\n      ${_n9 ? "" : `<div class="game-opt"><label for="opt-match-back">Back 9 ($)</label> <input type="number" inputmode="decimal" id="opt-match-back" value="5" min="1"></div>\n      <div class="game-opt"><label for="opt-match-overall">Overall 18 ($)</label> <input type="number" inputmode="decimal" id="opt-match-overall" value="5" min="1"></div>`}</div>\n      <div class="hint">${_n9 ? "Per Hole: win $ each hole. Nassau on nine holes: one match over the nine — back and overall are eighteen-hole bets." : "Per Hole: win $ each hole. Nassau: 3 bets — most holes won on front, back, and overall."}</div>`,
    stableford:
      '<div class="game-opt"><label for="opt-stab-val">$ Per Point</label> <input type="number" inputmode="decimal" id="opt-stab-val" value="2" min="1"></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-quota-enabled"> Quota (net points vs personal target)</label></div>\n      <div id="quota-setup" class="hidden"></div>\n      <div class="hint">Net Double Eagle: 8 | Eagle: 5 | Birdie: 2 | Par: 0 | Bogey: −1 | Double+: −3</div>',
    bingo:
      '<div class="game-opt"><label for="opt-bingo-val">$ Per Point</label> <input type="number" inputmode="decimal" id="opt-bingo-val" value="1" min="1"></div>\n      <div class="hint">Award points manually each hole: Bingo / Bango / Bongo buttons appear during scoring.</div>',
    dots: '<div class="game-opt"><label for="opt-dot-val">$ Per Dot</label> <input type="number" inputmode="decimal" id="opt-dot-val" value="1" min="1"></div>\n      <div class="hint">Award dots manually: Greenie, Sandy, Barkie, Birdie, Eagle, Polie buttons appear during scoring.</div>',
    wolf: '<div class="game-opt"><label for="opt-wolf-val">$ Per Point</label> <input type="number" inputmode="decimal" id="opt-wolf-val" value="1" min="1"></div>\n      <div id="wolf-uneven-opts"><div class="game-opt"><label for="opt-wolf-team-val">Wolf team $/pt (smaller)</label> <input type="number" inputmode="decimal" id="opt-wolf-team-val" value="2" min="1"></div>\n      <div class="game-opt"><label for="opt-wolf-field-val">Field $/pt (larger)</label> <input type="number" inputmode="decimal" id="opt-wolf-field-val" value="1" min="1"></div>\n      <div class="hint">Shown for uneven rosters (5 or 7 players): the losing side pays its per-point amount above and the winners split the pot. Balanced holes, Lone Wolf and Shuck use $ Per Point.</div></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-wolf-lone2x" checked> Lone Wolf pays/collects 2×</label></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-wolf-blind3x"> Blind Lone Wolf (before tee shots) pays/collects 3×</label></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-wolf-pairs"> Fixed Pairings (2v2v2... set at Hole 1)</label></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-wolf-order-enabled"> Custom Wolf order (set the rotation)</label></div>\n      <div id="wolf-order-setup" class="hidden"></div>\n      <div class="hint">Wolf rotation: Wolf picks a partner or goes alone. Fixed pairings locks teams for the round — choose at Hole 1. Breakout is always on — tap any player during scoring to make them that hole’s Wolf. Custom order sets who is Wolf each hole regardless of player order.</div>',
    vegas:
      '<div class="game-opt"><label for="opt-vegas-val">$ Per Point</label> <input type="number" inputmode="decimal" id="opt-vegas-val" value="1" min="1"></div>\n      <div class="game-opt"><label for="opt-vegas-t1a">Team 1</label> <select id="opt-vegas-t1a" class="vegas-team-sel"></select> & <select id="opt-vegas-t1b" class="vegas-team-sel"></select></div>\n      <div class="game-opt"><label for="opt-vegas-t2a">Team 2</label> <select id="opt-vegas-t2a" class="vegas-team-sel"></select> & <select id="opt-vegas-t2b" class="vegas-team-sel"></select></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-vegas-flip" checked> Birdie flips losing team\'s number</label></div>\n      <div class="hint">Scores combine: if Team 1 shoots 4 & 5 = 45, Team 2 shoots 3 & 6 = 36. Difference = 9 pts to Team 2.</div>',
    snake:
      '<div class="game-opt"><label for="opt-snake-val">Pot Value ($)</label> <input type="number" inputmode="decimal" id="opt-snake-val" value="5" min="1"></div>\n      <div class="hint">Award 3-Putt manually each hole. Whoever holds it (the last to 3-putt) pays the pot to everyone else at the end.</div>',
    sixes:
      '<div class="game-opt"><label for="opt-sixes-val">$ Per Segment</label> <input type="number" inputmode="decimal" id="opt-sixes-val" value="5" min="1"></div>\n      <div class="hint">Requires exactly 4 players. Partners rotate automatically every 6 holes (best with 18 holes) - no roster picker needed.</div>',
    banker:
      '<div class="game-opt"><label for="opt-banker-val">$ Per Hole</label> <input type="number" inputmode="decimal" id="opt-banker-val" value="2" min="1"></div>\n      <div class="game-opt"><label><input type="checkbox" id="opt-banker-teams"> Teams (2v2v2 — banker is a team)</label></div>\n      <div id="banker-team-setup" class="hidden"></div>\n      <div class="hint">The Banker plays an individual match against every other player — low net beats the Banker to win the stake, the Banker beats them to collect it; ties push. Each hole the Banker defaults to whoever won the last hole, and you can override it during scoring. Teams (2v2v2) makes the Banker a 2-player side playing best ball — needs an even roster (4, 6, or 8).</div>',
  };
  if (
    ((document.getElementById("game-options").innerHTML = e[state.gameType] || ""),
    syncWolfUnevenOpts(),
    "vegas" === state.gameType)
  ) {
    const e = document.querySelectorAll(".vegas-team-sel"),
      t = state.players;
    e.forEach((e, a) => {
      e.innerHTML = t
        .map(
          (e, t) =>
            '<option value="' +
            t +
            '"' +
            (t === a ? " selected" : "") +
            ">" +
            esc(e.name) +
            "</option>",
        )
        .join("");
    });
  }
  if ("match" === state.gameType) {
    const e = document.getElementById("opt-match-format");
    e &&
      e.addEventListener("change", () => {
        (document
          .getElementById("match-format-perhole")
          .classList.toggle("hidden", "perhole" !== e.value),
          document
            .getElementById("match-format-nassau")
            .classList.toggle("hidden", "nassau" !== e.value));
      });
  }
  if ("nassau" === state.gameType) {
    const e = document.getElementById("opt-nassau-teams"),
      t = document.getElementById("nassau-team-setup");
    e &&
      t &&
      (e.addEventListener("change", () => renderNassauTeamSetup()), renderNassauTeamSetup());
  }
  if ("stableford" === state.gameType) {
    const e = document.getElementById("opt-quota-enabled"),
      t = document.getElementById("quota-setup");
    e && t && (e.addEventListener("change", () => renderQuotaSetup()), renderQuotaSetup());
  }
  if ("banker" === state.gameType) {
    const e = document.getElementById("opt-banker-teams"),
      t = document.getElementById("banker-team-setup");
    e &&
      t &&
      (e.addEventListener("change", () => renderBankerTeamSetup()), renderBankerTeamSetup());
  }
  if ("wolf" === state.gameType) {
    const e = document.getElementById("opt-wolf-order-enabled"),
      t = document.getElementById("wolf-order-setup");
    e && t && (e.addEventListener("change", () => renderWolfOrderSetup()), renderWolfOrderSetup());
  }
}
function renderNassauTeamSetup() {
  const e = document.getElementById("opt-nassau-teams"),
    t = document.getElementById("nassau-team-setup");
  if (!e || !t) return;
  if (!e.checked) return void t.classList.add("hidden");
  t.classList.remove("hidden");
  const a = state.players;
  t.innerHTML =
    '<div class="game-opt"><label for="opt-nassau-t1a">Team 1</label> <select id="opt-nassau-t1a">' +
    a
      .map(
        (e, t) =>
          '<option value="' +
          t +
          '"' +
          (0 === t ? " selected" : "") +
          ">" +
          esc(e.name) +
          "</option>",
      )
      .join("") +
    '</select> & <select id="opt-nassau-t1b">' +
    a
      .map(
        (e, t) =>
          '<option value="' +
          t +
          '"' +
          (1 === t ? " selected" : "") +
          ">" +
          esc(e.name) +
          "</option>",
      )
      .join("") +
    '</select></div><div class="game-opt"><label for="opt-nassau-t2a">Team 2</label> <select id="opt-nassau-t2a">' +
    a
      .map(
        (e, t) =>
          '<option value="' +
          t +
          '"' +
          (2 === t ? " selected" : "") +
          ">" +
          esc(e.name) +
          "</option>",
      )
      .join("") +
    '</select> & <select id="opt-nassau-t2b">' +
    a
      .map(
        (e, t) =>
          '<option value="' +
          t +
          '"' +
          (3 === t ? " selected" : "") +
          ">" +
          esc(e.name) +
          "</option>",
      )
      .join("") +
    "</select></div>";
}
function renderBankerTeamSetup() {
  const e = document.getElementById("opt-banker-teams"),
    t = document.getElementById("banker-team-setup");
  if (!e || !t) return;
  if (!e.checked) return void t.classList.add("hidden");
  t.classList.remove("hidden");
  const a = state.players;
  if (a.length < 4 || a.length % 2 !== 0)
    return void (t.innerHTML =
      '<div class="hint">Teams need an even roster of 4, 6, or 8 players (2v2, 2v2v2, 2v2v2v2).</div>');
  const n = Math.floor(a.length / 2);
  let h = "";
  for (let ti = 0; ti < n; ti++)
    h +=
      '<div class="game-opt"><label for="opt-banker-t' +
      ti +
      'a">Team ' +
      (ti + 1) +
      '</label> <select id="opt-banker-t' +
      ti +
      'a">' +
      a
        .map(
          (p, pi) =>
            '<option value="' +
            pi +
            '"' +
            (pi === 2 * ti ? " selected" : "") +
            ">" +
            esc(p.name) +
            "</option>",
        )
        .join("") +
      '</select> & <select id="opt-banker-t' +
      ti +
      'b">' +
      a
        .map(
          (p, pi) =>
            '<option value="' +
            pi +
            '"' +
            (pi === 2 * ti + 1 ? " selected" : "") +
            ">" +
            esc(p.name) +
            "</option>",
        )
        .join("") +
      "</select></div>";
  t.innerHTML = h;
}
let _wolfOrder = null;
function _ensureWolfOrder() {
  const n = state.players.length;
  if (
    !Array.isArray(_wolfOrder) ||
    _wolfOrder.length !== n ||
    new Set(_wolfOrder).size !== n ||
    _wolfOrder.some((i) => !Number.isInteger(i) || i < 0 || i >= n)
  )
    _wolfOrder = state.players.map((e, i) => i);
  return _wolfOrder;
}
function renderWolfOrderSetup() {
  const e = document.getElementById("opt-wolf-order-enabled"),
    t = document.getElementById("wolf-order-setup");
  if (!e || !t) return;
  if (!e.checked) return void t.classList.add("hidden");
  (t.classList.remove("hidden"),
    _ensureWolfOrder(),
    (t.innerHTML =
      '<div class="hint" style="margin:2px 0 8px">The Wolf rotates through this order across the round.</div>' +
      _wolfOrder
        .map(
          (pi, pos) =>
            '<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span style="width:22px;color:var(--muted);font-weight:700;text-align:right">' +
            (pos + 1) +
            '.</span><span style="flex:1">' +
            esc(state.players[pi]?.name || "Player " + (pi + 1)) +
            '</span><button type="button" class="reorder-btn" data-act="moveWolfOrder(' +
            pos +
            ',-1)"' +
            (0 === pos ? " disabled" : "") +
            ' aria-label="Move earlier"><i data-ico="up"></i></button><button type="button" class="reorder-btn" data-act="moveWolfOrder(' +
            pos +
            ',1)"' +
            (pos === _wolfOrder.length - 1 ? " disabled" : "") +
            ' aria-label="Move later"><i data-ico="down"></i></button></div>',
        )
        .join("")));
}
function moveWolfOrder(e, t) {
  _ensureWolfOrder();
  const a = e + t;
  if (a < 0 || a >= _wolfOrder.length) return;
  const s = _wolfOrder[e];
  ((_wolfOrder[e] = _wolfOrder[a]),
    (_wolfOrder[a] = s),
    haptic(),
    renderWolfOrderSetup(),
    _gameOptsDirty());
}
function renderQuotaSetup() {
  const e = document.getElementById("opt-quota-enabled"),
    t = document.getElementById("quota-setup");
  if (!e || !t) return;
  if (!e.checked) return void t.classList.add("hidden");
  t.classList.remove("hidden");
  const a = state.players;
  t.innerHTML = a
    .map(
      (e, t) =>
        '<div class="game-opt"><label for="opt-quota-' +
        t +
        '">' +
        esc(e.name) +
        ' Quota</label> <input type="number" inputmode="decimal" id="opt-quota-' +
        t +
        '" value="' +
        Math.max(0, 36 - (e.hdcp || 0)) +
        '" min="0"></div>',
    )
    .join("");
}
function _gameOptsDirty() {
  setTimeout(() => {
    try {
      updateGamesSummary();
    } catch (e) {}
  }, 0);
}
function readSideBets() {
  const out = defaultSideBets();
  Object.keys(out).forEach((k) => {
    const on = document.getElementById("sb-" + k + "-on"),
      val = document.getElementById("sb-" + k + "-val"),
      carry = document.getElementById("sb-" + k + "-carry");
    on && (out[k].on = !!on.checked);
    val && "" !== val.value && (out[k].val = +val.value || 0);
    carry && (out[k].carry = !!carry.checked);
  });
  return out;
}
function readGameOpts() {
  const e = state.gameType,
    t = {};
  return (
    "nassau" === e
      ? ((t.front = Math.max(1, +(document.getElementById("opt-front")?.value || 5))),
        (t.back = Math.max(1, +(document.getElementById("opt-back")?.value || 5))),
        (t.overall = Math.max(1, +(document.getElementById("opt-overall")?.value || 5))),
        (t.press = document.getElementById("opt-press")?.checked || !1),
        (t.pressVal = Math.max(1, +(document.getElementById("opt-press-val")?.value || 5))),
        (t.nassauTeams = document.getElementById("opt-nassau-teams")?.checked || !1),
        t.nassauTeams &&
          (t.nassauTeamRoster = [
            [
              +(document.getElementById("opt-nassau-t1a")?.value || 0),
              +(document.getElementById("opt-nassau-t1b")?.value || 1),
            ],
            [
              +(document.getElementById("opt-nassau-t2a")?.value || 2),
              +(document.getElementById("opt-nassau-t2b")?.value || 3),
            ],
          ]))
      : "skins" === e
        ? ((t.skinVal = Math.max(1, +(document.getElementById("opt-skin")?.value || 5))),
          (t.carry = document.getElementById("opt-carry")?.checked ?? !0))
        : "match" === e
          ? ((t.matchFormat = document.getElementById("opt-match-format")?.value || "perhole"),
            (t.holeVal = Math.max(1, +(document.getElementById("opt-match")?.value || 2))),
            (t.matchPressVal = Math.max(
              1,
              +(document.getElementById("opt-match-press-val")?.value || 2),
            )),
            (t.matchFront = Math.max(1, +(document.getElementById("opt-match-front")?.value || 5))),
            (t.matchBack = Math.max(1, +(document.getElementById("opt-match-back")?.value || 5))),
            (t.matchOverall = Math.max(
              1,
              +(document.getElementById("opt-match-overall")?.value || 5),
            )))
          : "stableford" === e
            ? ((t.ptVal = Math.max(1, +(document.getElementById("opt-stab-val")?.value || 2))),
              (t.quotaEnabled = document.getElementById("opt-quota-enabled")?.checked || !1),
              t.quotaEnabled &&
                (t.quotas = state.players.map(
                  (e, a) =>
                    +(
                      document.getElementById("opt-quota-" + a)?.value ??
                      Math.max(0, 36 - (e.hdcp || 0))
                    ),
                )))
            : "bingo" === e
              ? (t.ptVal = Math.max(1, +(document.getElementById("opt-bingo-val")?.value || 1)))
              : "dots" === e
                ? (t.dotVal = Math.max(1, +(document.getElementById("opt-dot-val")?.value || 1)))
                : "wolf" === e
                  ? ((t.wolfVal = Math.max(
                      1,
                      +(document.getElementById("opt-wolf-val")?.value || 1),
                    )),
                    wolfTeamsUneven() &&
                      ((t.wolfTeamVal = Math.max(
                        1,
                        +(document.getElementById("opt-wolf-team-val")?.value || 2 * t.wolfVal),
                      )),
                      (t.fieldVal = Math.max(
                        1,
                        +(document.getElementById("opt-wolf-field-val")?.value || t.wolfVal),
                      ))),
                    (t.lone2x = document.getElementById("opt-wolf-lone2x")?.checked ?? !0),
                    (t.blind3x = document.getElementById("opt-wolf-blind3x")?.checked || !1),
                    (t.fixedPairs = document.getElementById("opt-wolf-pairs")?.checked || !1),
                    (t.wolfOrder =
                      document.getElementById("opt-wolf-order-enabled")?.checked &&
                      Array.isArray(_wolfOrder) &&
                      _wolfOrder.length === state.players.length
                        ? [..._wolfOrder]
                        : null))
                  : "vegas" === e
                    ? ((t.vegasVal = Math.max(
                        1,
                        +(document.getElementById("opt-vegas-val")?.value || 1),
                      )),
                      (t.vegasFlip = document.getElementById("opt-vegas-flip")?.checked ?? !0),
                      (t.vegasTeams = [
                        [
                          +(document.getElementById("opt-vegas-t1a")?.value || 0),
                          +(document.getElementById("opt-vegas-t1b")?.value || 1),
                        ],
                        [
                          +(document.getElementById("opt-vegas-t2a")?.value || 2),
                          +(document.getElementById("opt-vegas-t2b")?.value || 3),
                        ],
                      ]))
                    : "snake" === e
                      ? (t.potVal = Math.max(
                          1,
                          +(document.getElementById("opt-snake-val")?.value || 5),
                        ))
                      : "sixes" === e
                        ? (t.sixesVal = Math.max(
                            1,
                            +(document.getElementById("opt-sixes-val")?.value || 5),
                          ))
                        : "banker" === e &&
                          ((t.bankerVal = Math.max(
                            1,
                            +(document.getElementById("opt-banker-val")?.value || 2),
                          )),
                          (t.bankerTeams =
                            document.getElementById("opt-banker-teams")?.checked || !1),
                          t.bankerTeams &&
                            (t.bankerTeamRoster = Array.from(
                              { length: Math.floor(state.players.length / 2) },
                              (s, ti) => [
                                +(
                                  document.getElementById("opt-banker-t" + ti + "a")?.value ||
                                  2 * ti
                                ),
                                +(
                                  document.getElementById("opt-banker-t" + ti + "b")?.value ||
                                  2 * ti + 1
                                ),
                              ],
                            ))),
    t
  );
}
let _hdcpCache = null,
  _hdcpCacheKey = "",
  _hdcpModeEl = null;
/* getNetScore() asks for this on every player/hole pair and the money replay
   walks the whole card once per completed hole, so this runs well over a
   thousand times per render. Keep the guard cheap: hold on to the <select>
   instead of looking it up each time, and build the key by concatenation
   rather than allocating a map/join pair. The key is byte-for-byte what it
   was, so a handicap edited in the roster still busts the cache on its own. */
function getPlayingHandicaps() {
  (_hdcpModeEl && _hdcpModeEl.isConnected) ||
    (_hdcpModeEl = document.getElementById("handicap-mode"));
  const e = _hdcpModeEl?.value || state.handicapMode;
  state.handicapMode = e;
  const p = state.players;
  let t = e + "|";
  for (let i = 0; i < p.length; i++) t += (i ? "," : "") + p[i].hdcp;
  t += "|" + (state.selectedTee ? state.selectedTee.rating + "/" + state.selectedTee.slope : "");
  if (_hdcpCache && _hdcpCacheKey === t) return _hdcpCache;
  const a = state.players.map((e) => e.hdcp);
  if ("none" === e) return ((_hdcpCache = a.map(() => 0)), (_hdcpCacheKey = t), _hdcpCache);
  let s = [...a];
  if ("80pct" === e) s = a.map((e) => 0.8 * e);
  else if ("course" === e && state.selectedTee?.rating && state.selectedTee?.slope) {
    const n = state.pars.reduce((e, t) => e + t, 0);
    s = a.map((e) => e * (state.selectedTee.slope / 113) + (state.selectedTee.rating - n));
  }
  const n = Math.min(...s);
  return ((_hdcpCache = s.map((e) => Math.round(e - n))), (_hdcpCacheKey = t), _hdcpCache);
}
function invalidateHdcpCache() {
  ((_hdcpCache = null), (_hdcpCacheKey = ""));
}
function getStrokesOnHole(e, t) {
  const a = state.hdcps[t];
  return e >= 18 + a ? 2 : e >= a ? 1 : 0;
}
/* Every format settles by walking holes and asking for a net score, and the
   money replay repeats that walk once per completed hole, so the same few
   hundred values were recomputed thousands of times per render -- Banker asked
   for 14,000 of them, Nassau 10,700. Memoise the table instead.

   Keyed on the counter invalidateMoneyCache() bumps, which every score
   mutation already calls, plus two identities that make a missed call
   harmless: the handicap array (rebuilt whenever a handicap, mode or tee
   changes) and state.scores itself (replaced wholesale by a round load or a
   live-sync push). Holes outside the round fall through to the live
   calculation so out-of-range lookups answer exactly as they did. */
let _netTab = null,
  _netTabVer = -1,
  _netTabH = null,
  _netTabS = null,
  _netTabN = -1;
function _netTable() {
  const h = getPlayingHandicaps(),
    nh = maxHole();
  if (
    _netTab &&
    _netTabVer === _moneyCacheVer &&
    _netTabH === h &&
    _netTabS === state.scores &&
    _netTabN === nh
  )
    return _netTab;
  const np = state.players.length,
    t = new Array(nh);
  for (let k = 0; k < nh; k++) {
    const row = (t[k] = new Array(np));
    for (let i = 0; i < np; i++) {
      const sc = state.scores[i],
        v = sc ? sc[k] : null;
      row[i] = null == v ? null : v - getStrokesOnHole(h[i], k);
    }
  }
  return (
    (_netTab = t),
    (_netTabVer = _moneyCacheVer),
    (_netTabH = h),
    (_netTabS = state.scores),
    (_netTabN = nh),
    t
  );
}
function getNetScore(e, t) {
  if (t < 0 || t >= maxHole()) {
    const a = state.scores[e]?.[t];
    return null == a ? null : a - getStrokesOnHole(getPlayingHandicaps()[e], t);
  }
  const r = _netTable()[t];
  return r && null != r[e] ? r[e] : null;
}
/* Every hole a format settles needs the whole field's nets at once, and the
   callers all spelled that `state.players.map((p,i)=>getNetScore(i,h))` -- one
   closure call and one cache probe per player per hole. Hand back the row in
   one go instead. Copied, so a caller sorting or splicing its row cannot
   corrupt the table; the callers were allocating that array anyway. */
function netRow(h) {
  return h >= 0 && h < maxHole()
    ? _netTable()[h].slice()
    : state.players.map((p, i) => getNetScore(i, h));
}
