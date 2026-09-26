let _navHole = !1; /* No invalidateMoneyCache() here on purpose: every calc*Money() settles the
   whole card and none of them read state.currentHole, so walking between holes
   cannot change a single figure. Dropping the cache here made each swipe replay
   the round's money from scratch. */
function goToHole(e) {
  e < 0 || e > maxHole() - 1 || ((state.currentHole = e), (_navHole = !0), haptic(), renderHole());
} /* Built as one string and assigned once. Appending with `innerHTML+=` inside
   the loop made the browser re-serialise and re-parse the whole strip on every
   hole -- eighteen times per render, and this runs on every score tap. */
/* The badge on each hole is "how did I do here", so it has to read the hole
   from the phone's owner. It read state.scores[0] -- the first name in the
   roster -- so if you were third, the strip across the top of your screen
   narrated somebody else's round, and a hole everyone but player 1 had scored
   still showed as unplayed. */
function myRosterIdx() {
  const me = getPrimaryPlayerName();
  if (me) {
    const i = state.players.findIndex(
      (p) => p && p.name && p.name.toLowerCase() === me.toLowerCase(),
    );
    if (i >= 0) return i;
  }
  return 0;
}
function renderHoleDots() {
  const e = document.getElementById("hole-dots"),
    n = maxHole();
  let h = "";
  const _me = myRosterIdx();
  for (let t = 0; t < n; t++) {
    const a = t === state.currentHole ? " active" : "";
    let s = "";
    if (!a && null != state.scores[_me]?.[t]) {
      const e = state.scores[_me][t] - state.pars[t];
      s = e < 0 ? " dot-under" : 0 === e ? " dot-par" : " dot-over";
    }
    const w =
      state.players.length &&
      state.players.every((e, a) => null != state.scores[a]?.[t]) &&
      wolfPickMissing(t)
        ? " dot-warn"
        : "";
    h += `<div class="hole-dot${a}${s}${w}" data-act="goToHole(${t})" role="button" tabindex="0" aria-label="Hole ${hLbl(t)}${w ? " — no wolf pick" : ""}">${hLbl(t)}</div>`;
  }
  e.innerHTML = h;
}
function _holeYards(h) {
  const t = state.selectedTee;
  return t && Array.isArray(t.holeYds) && t.holeYds[h] ? t.holeYds[h] : null;
}
/* The confirm is the one action taken on every hole, and it sat at the foot
   of the score card, under whichever ledger cards were open. It is a bar
   pinned above the tab bar now, on the scoring screen only. */
function renderConfirmBar(e, confd) {
  const b = document.getElementById("confirm-bar");
  if (!b) return;
  if (isSpectator) return ((b.innerHTML = ""), void b.classList.add("hidden"));
  b.classList.remove("hidden");
  if (confd)
    return void (b.innerHTML = `<div class="confirmed-badge">Hole ${hLbl(e)} locked <button class="unlock-btn" data-act="unlockHole(${e})">Edit</button></div>`);
  const tot = state.players.length,
    done = state.players.filter((p, i) => null != state.scores[i][e]).length;
  b.innerHTML = `<button class="btn primary" data-act="confirmHoleScores(${e})"><span>Confirm Hole ${hLbl(e)}</span>${done < tot ? `<span class="cb-sub">${done} of ${tot} scored</span>` : ""}</button>`;
}
/* Scores · Money · Feed. Only the score rows are needed on every hole; the
   running money and the feed are one tap away instead of a scroll. A round
   with no game has nothing to put behind the other two, so the control hides. */
let _scoreSeg = "scores";
function setScoreSeg(k, quiet) {
  _scoreSeg = k;
  const sc = document.getElementById("scoring-screen");
  sc && (sc.dataset.seg = k);
  document.querySelectorAll("#score-seg .seg-btn").forEach((b) => {
    const on = b.dataset.seg === k;
    (b.classList.toggle("active", on),
      b.setAttribute("aria-selected", on ? "true" : "false"),
      (b.tabIndex = on ? 0 : -1));
  });
  quiet || haptic();
}
function syncScoreSeg() {
  const seg = document.getElementById("score-seg");
  if (!seg) return;
  const has = "none" !== state.gameType || anySideBetActive();
  seg.classList.toggle("hidden", !has);
  setScoreSeg(has ? _scoreSeg : "scores", !0);
  const fe = document.getElementById("feed-empty"),
    pf = document.getElementById("play-feed");
  fe && pf && fe.classList.toggle("hidden", !pf.classList.contains("hidden"));
  const sub = document.getElementById("seg-money-sub");
  if (sub) {
    let v = "",
      cls = "seg-sub";
    if (has) {
      const i = myRosterIdx(),
        m = state.players[i] ? calcMoney()[i] : 0;
      ((v = fmtMoney(m)), (cls += m > 0.01 ? " up" : m < -0.01 ? " down" : ""));
    }
    ((sub.textContent = v), (sub.className = cls));
  }
}
function renderHole() {
  const e = state.currentHole,
    _lb = document.getElementById("live-btn");
  _lb && _lb.classList.toggle("live-on", !!state.liveId);
  const _ll = document.getElementById("live-btn-label");
  _ll && (_ll.textContent = state.liveId ? "Live" : "Share");
  ((document.getElementById("hole-indicator").textContent =
    `Hole ${hLbl(e)} of ${(state.holeStart || 0) + maxHole()}`),
    (document.getElementById("prev-hole").disabled = 0 === e),
    (document.getElementById("next-hole").disabled = e === maxHole() - 1),
    (document.getElementById("hole-info").innerHTML =
      `<div class="hole-head-l"><div class="hole-meta">PAR <b>${state.pars[e]}</b> · HCP <b>${state.hdcps[e]}</b>${_holeYards(e) ? ` · <b>${_holeYards(e)}</b>y` : ""}</div><div class="hole-big">Hole ${hLbl(e)}</div></div><div class="hole-head-r"><div class="hole-of">of ${(state.holeStart || 0) + maxHole()}</div></div>`));
  const t = getPlayingHandicaps(),
    a = document.getElementById("score-inputs");
  let _h = "";
  if (
    (state.players.forEach((s, n) => {
      const o = getStrokesOnHole(t[n], e),
        hs = null != state.scores[n][e],
        _pu = isPickedUp(n, e),
        l = state.scores[n][e] ?? state.pars[e],
        r = l - o,
        i = r - state.pars[e],
        c = _pu
          ? "double"
          : i <= -2
            ? "eagle"
            : -1 === i
              ? "birdie"
              : 0 === i
                ? "par"
                : 1 === i
                  ? "bogey"
                  : "double",
        d = _pu
          ? "Picked up"
          : i <= -2
            ? "" + (-i > 2 ? "Albatross" : "Eagle")
            : -1 === i
              ? "Birdie"
              : 0 === i
                ? "Par"
                : 1 === i
                  ? "Bogey"
                  : `+${i}`,
        m = o > 0 ? `<span class="stroke-dots">${"●".repeat(o)}</span>` : "";
      _h += `<div class="score-row${hs ? "" : " unscored"}${o ? " gets-stroke" : ""}"${o ? ` style="--pc:${esc(playerColor(s))}"` : ""}>\n      <div class="player-info" data-act="quickScore(${n},${e})" role="button" tabindex="0" aria-label="Enter score for ${esc(s.name)}${o ? `, ${o} stroke${o > 1 ? "s" : ""} on this hole` : ""}">\n        <div class="player-name">${avatarHTML(s, 12)}${esc(s.name)}</div>\n        ${o ? `<div class="strokes-badge">${m} ${o} stroke${o > 1 ? "s" : ""}</div>` : ""}\n      </div>\n      <div class="score-counter">\n        <button data-act="adjScore(${n},${e},-1)">−</button>\n        <div class="score-val ${c}${_pu ? " picked-up" : ""}"${o ? ` data-dots="${"●".repeat(o)}"` : ""} data-act="quickScore(${n},${e})" role="button" tabindex="0" aria-label="${_pu ? `Picked up, scored ${l}. Edit score` : "Edit score"}">${_pu ? "X" : l}</div>\n        <button data-act="adjScore(${n},${e},1)">+</button>\n      </div>\n      <div class="score-result ${c}">${d}<br><span class="net-label">${_pu ? `max ${l} → Net ${r}` : `${l} → Net ${r}`}</span></div>\n    </div>`;
    }),
    "match" === state.gameType)
  ) {
    const t = state.matchPresses || [],
      s = t.filter((t) => t.start <= e);
    _h += `<div class="match-press-section">\n      <button class="btn secondary" data-act="addMatchPress(${e})" style="width:100%;margin-bottom:6px">Press from Hole ${hLbl(e)}</button>\n      ${
      s.length
        ? `<div class="summary-toggle" data-act="togglePressList()" style="font-size:0.78rem;margin-bottom:6px" role="button" tabindex="0">Active Presses (${s.length}) <span class="toggle-arrow" style="transform:${_pressListCollapsed ? "rotate(-90deg)" : "none"}"><i data-ico="down"></i></span></div>${
            _pressListCollapsed
              ? ""
              : `<div class="active-presses">${s
                  .map((e, a) => {
                    const s = t.indexOf(e);
                    return `<span class="press-badge">Press #${s + 1}: ${e.by} H${hLbl(e.start)}→${hLbl(maxHole() - 1)} <button class="press-remove" data-act="removeMatchPress(${s})"><i data-ico="close"></i></button></span>`;
                  })
                  .join("")}</div>`
          }`
        : ""
    }\n    </div>`;
  }
  if (
    "bingo" === state.gameType ||
    "dots" === state.gameType ||
    "snake" === state.gameType ||
    anySideBetActive()
  ) {
    const _side =
        anySideBetActive() &&
        !("bingo" === state.gameType || "dots" === state.gameType || "snake" === state.gameType),
      _idx = _side
        ? [].concat(sideBetActive("snake") ? [0] : [], sideBetActive("junk") ? JUNK_CATS : [])
        : null,
      t = _side
        ? _idx.map((i) => SIDE_CATS[i])
        : "bingo" === state.gameType
          ? ["Bingo", "Bango", "Bongo"]
          : "snake" === state.gameType
            ? ["3-Putt"]
            : ["Greenie", "Sandy", "Barkie", "Birdie", "Eagle", "Polie"];
    const _ci = (c) => (_idx ? _idx[c] : c);
    _h += `<div class="bonus-section">\n      <div class="bonus-header">${_side ? (sideBetActive("snake") && sideBetActive("junk") ? "Award Junk &amp; 3-Putts" : sideBetActive("snake") ? "Award 3-Putts" : "Award Junk") : "bingo" === state.gameType ? "Award Points" : "snake" === state.gameType ? "Award 3-Putts" : "Award Dots"}</div>\n      ${state.players
      .map((a, s) => {
        const n = getBonusCount(s, e);
        return `<div class="bonus-row">\n          <span class="bonus-player">${avatarHTML(a, 10)}${esc(a.name)} <strong class="bonus-count">${n} pt${1 !== n ? "s" : ""}</strong></span>\n          <div class="bonus-btns">${t.map((l, c) => `<button class="bonus-btn${isBonusAwarded(s, e, _ci(c)) ? " awarded" : ""}" aria-pressed="${isBonusAwarded(s, e, _ci(c)) ? "true" : "false"}" data-act="${isBonusAwarded(s, e, _ci(c)) ? `removeBonusCategory(${s},${e},${_ci(c)})` : `addBonus(${s},${e},${c})`}">${l}</button>`).join("")}<button class="bonus-btn undo" data-act="removeBonus(${s},${e})" aria-label="Clear bonus points for this hole">Clear</button></div>\n        </div>`;
      })
      .join("")}\n    </div>`;
  }
  if ("wolf" === state.gameType && state.players.length >= 2)
    if (state.gameOpts.fixedPairs) {
      const t = state.players.length,
        s = Math.floor(t / 2);
      if (state.pairingsLocked) {
        const t = state.pairings.length,
          s = e % t,
          n = state.pairings[s].map((e) => esc(state.players[e].name)).join(" & ");
        state.wolfHoles[e] ||
          (state.wolfHoles[e] = {
            fixedPairs: !0,
            wolfTeam: s,
            allyTeams: void 0,
            hammers: 0,
            lastHammerTeam: null,
            hammerLog: [],
          });
        const o = state.wolfHoles[e],
          l = o.allyTeams,
          r = void 0 !== l,
          i = r && 0 === l.length,
          c = r ? [s, ...l] : [s],
          d = [];
        for (let e = 0; e < t; e++) c.includes(e) || d.push(e);
        const m = c.flatMap((e) => state.pairings[e]),
          p = d.flatMap((e) => state.pairings[e]),
          u = o.hammers || 0,
          h = u > 0 ? Math.pow(2, u) : 1,
          g = i && state.gameOpts.lone2x ? 2 : 1,
          v = state.players.map((t, a) => state.scores[a]?.[e]),
          f = v.some((e) => null == e) ? null : Math.min(...v),
          y = null != f ? f - state.pars[e] : 0,
          b = y <= -2 ? 3 : -1 === y ? 2 : 1,
          $ = 3 === b ? "3×" : 2 === b ? "2×" : "",
          w = g * h * b;
        _h += `<div class="wolf-section">\n        <div class="wolf-header">Wolf Team: ${n} <span class="wolf-hole-num">Hole ${hLbl(e)}</span></div>\n        <div class="wolf-pick-label">Pick ally team(s) or go Lone Pair:</div>\n        <div class="wolf-choices">\n          ${state.pairings
          .map((t, a) => {
            if (a === s) return "";
            const n = t.map((e) => esc(state.players[e].name)).join(" & "),
              o = Array.isArray(l) && l.includes(a);
            return `<button class="wolf-pick ${o ? "selected" : ""}" data-act="toggleAllyTeam(${e},${a})">\n              Team ${a + 1}: ${n}${o ? " " + ico("check") : ""}\n            </button>`;
          })
          .join(
            "",
          )}\n          <button class="wolf-pick lone ${i ? "selected" : ""}" data-act="setLonePair(${e})">\n            Lone Pair${i ? " " + ico("check") : ""}\n          </button>\n        </div>\n        ${r && !i ? `<div class="wolf-teams">\n          <span class="wolf-team-label">Wolf Side (${m.length}):</span> ${m.map((e) => esc(state.players[e].name)).join(", ")}\n          <span class="wolf-team-label" style="margin-left:10px">Field (${p.length}):</span> ${p.map((e) => esc(state.players[e].name)).join(", ")}\n        </div>` : ""}\n        ${i ? `<div class="wolf-teams">\n          <span class="wolf-team-label">Lone Pair:</span> ${n} vs ${p.length} opponents (2×)\n        </div>` : ""}\n        ${r ? `<div class="hammer-zone">\n          <div class="hammer-status">\n            <span class="hammer-multiplier">${w}×</span>\n            <span class="hammer-label">$${state.gameOpts.wolfVal * w}/pt${u > 0 ? ` (${u})` : ""}${$}</span>\n          </div>\n          <div class="hammer-btns">\n            ${"wolf" !== o.lastHammerTeam ? `<button class="hammer-btn wolf-hammer" data-act="hammer(${e},'wolf')">Wolf Side Hammers!</button>` : ""}\n            ${"sheep" !== o.lastHammerTeam ? `<button class="hammer-btn sheep-hammer" data-act="hammer(${e},'sheep')">Field Hammers Back!</button>` : ""}\n          </div>\n          ${u > 0 ? `<div class="hammer-history">${getHammerHistory(o)}\n            <button class="hammer-undo" data-act="undoHammer(${e})" aria-label="Undo hammer">Undo</button>\n          </div>` : ""}\n        </div>` : ""}\n      </div>`;
      } else {
        if (!state.pairings || state.pairings.length !== s) {
          state.pairings = [];
          for (let e = 0; e < s; e++) state.pairings.push([2 * e, 2 * e + 1]);
        }
        _h += `<div class="wolf-section">\n        <div class="wolf-header">Set Pairings <span class="wolf-hole-num">Hole ${hLbl(e)}</span></div>\n        <div class="hint" style="margin-bottom:10px">Choose your teams for the round, then lock them in.</div>\n        <div class="pairing-grid">\n          ${state.pairings.map((e, t) => `<div class="pairing-team">\n            <div class="pairing-team-label">Team ${t + 1}</div>\n            <select class="pairing-select" data-team="${t}" data-slot="0" data-change="updatePairing(this)">\n              ${state.players.map((t, a) => `<option value="${a}" ${a === e[0] ? "selected" : ""}>${esc(t.name)}</option>`).join("")}\n            </select>\n            <span class="pairing-amp">&</span>\n            <select class="pairing-select" data-team="${t}" data-slot="1" data-change="updatePairing(this)">\n              ${state.players.map((t, a) => `<option value="${a}" ${a === e[1] ? "selected" : ""}>${esc(t.name)}</option>`).join("")}\n            </select>\n          </div>`).join("")}\n        </div>\n        <button class="btn primary" data-act="lockPairings()" style="width:100%;margin-top:10px">Lock Pairings for Round</button>\n      </div>`;
      }
    } else {
      const t = getWolfForHole(e),
        s = state.wolfHoles[e] || { wolf: t, partners: void 0, blind: !1, hammers: 0 },
        n = state.players[t],
        o = s.partners,
        l = void 0 !== o && (null === o || 0 === o.length),
        r = !0 === s.blind,
        i = void 0 !== o,
        c = s.hammers || 0,
        d = c > 0 ? Math.pow(2, c) : 1,
        m = r ? 3 : s.blindPick || (l && state.gameOpts.lone2x) ? 2 : 1,
        p = state.players.map((t, a) => state.scores[a]?.[e]),
        u = p.some((e) => null == e) ? null : Math.min(...p),
        h = null != u ? u - state.pars[e] : 0,
        g = h <= -2 ? 3 : -1 === h ? 2 : 1,
        v = 3 === g ? " Eagle 3×" : 2 === g ? " Birdie 2×" : "",
        f = m * d * g,
        y = state.players.length,
        b = i && o ? [t, ...o] : [t],
        $ = state.players.map((e, t) => t).filter((e) => !b.includes(e)),
        w = s.lastHammerTeam,
        H = i && "wolf" !== w,
        k = i && "sheep" !== w,
        S = (e) => Array.isArray(o) && o.includes(e),
        E = state._wolfBlindMode && state._wolfBlindMode[e],
        x = null != s.shuck ? s.shuck : null,
        M = null != x;
      let P = "";
      ((P = M
        ? '<div class="wolf-teams" style="margin-bottom:10px"><span style="color:var(--danger);font-weight:700">SHUCK!</span> <strong>' +
          esc(state.players[x].name) +
          '</strong> vs everyone (2×)<button class="btn secondary" data-act="cancelShuck(' +
          e +
          ')" style="margin-left:8px;padding:4px 10px;font-size:0.7rem">Cancel</button></div>'
        : `\n      <div class="wolf-pick-label">Step 1: Choose pick type</div>\n      <div class="wolf-choices">\n        <button class="wolf-pick ${E || l || r ? "" : "selected"}" data-act="setWolfPickMode(${e},'normal')">\n          Normal Pick\n        </button>\n        <button class="wolf-pick blind ${E ? "selected" : ""}" data-act="setWolfPickMode(${e},'blind')">\n          Blind Pick (2×)\n        </button>\n        <button class="wolf-pick lone ${l && !r ? "selected" : ""}" data-act="setWolfLone(${e},false)">\n          Lone Wolf (${state.gameOpts.lone2x ? "2×" : "1×"})\n        </button>\n        ${state.gameOpts.blind3x ? `<button class="wolf-pick blind ${r ? "selected" : ""}" data-act="setWolfLone(${e},true)">\n          Blind Lone (3×)\n        </button>` : ""}\n      </div>\n      ${l || r ? "" : `<div class="wolf-pick-label" style="margin-top:10px">Step 2: Select partner${E ? ' <span style="color:var(--accent);font-weight:700">(BLIND 2×)</span>' : ""}</div>`}`),
        (_h += `<div class="wolf-section">\n      <div class="wolf-header">Wolf: <strong style="color:${esc(n.color)}">${esc(n.name)}</strong>\n        <span class="wolf-hole-num">Hole ${hLbl(e)}</span>${e + 1 < maxHole() ? `\n        <div class="wolf-up-next">Up next: <strong>${esc(state.players[getWolfForHole(e + 1)].name)}</strong></div>` : ""}\n      </div>\n      ${M ? "" : `<div class="wolf-breakout" style="margin-bottom:10px"><div class="wolf-pick-label">Breakout — tap any player to make them the Wolf:</div><div class="wolf-choices">${state.players.map((pl, pi) => `<button class="wolf-bk ${pi === t ? "wolf-now" : ""}" data-act="setWolfBreakout(${e},${pi})">${avatarHTML(pl, 10)}${esc(pl.name)}${pi === t ? (state.wolfBreakouts && Number.isInteger(state.wolfBreakouts[e]) ? " " + ico("star") : " — Wolf") : ""}</button>`).join("")}</div></div>`}\n      ${P}\n      ${
          M || l || r
            ? ""
            : `<div class="wolf-choices">\n        ${state.players
                .map((a, n) => {
                  if (n === t) return "";
                  const o = S(n);
                  return `<button class="wolf-pick ${o ? "selected" : ""}" data-act="${E ? "blindPickPartner" : "toggleWolfPartner"}(${e},${n})" style="border-color:${o ? a.color : "var(--rule-strong)"}">\n            ${avatarHTML(a, 10)}${esc(a.name)}${o ? (s.blindPick ? "2×" : " " + ico("check")) : ""}\n          </button>`;
                })
                .join("")}\n      </div>`
        }\n      </div>\n      ${i && !l && o.length > 0 ? `<div class="wolf-teams">\n        <span class="wolf-team-label">Wolf Pack (${b.length}):</span> ${b.map((e) => esc(state.players[e].name)).join(" & ")}${s.blindPick ? ' <span style="color:var(--accent);font-weight:700">BLIND 2×</span>' : ""}\n        <span class="wolf-team-label" style="margin-left:12px">Field (${$.length}):</span> ${$.map((e) => esc(state.players[e].name)).join(" & ")}\n        ${y >= 5 && b.length !== $.length ? `<div class="team-stakes-note">Smaller team (${Math.min(b.length, $.length)}) bets 2× · Larger team (${Math.max(b.length, $.length)}) bets 1×</div>` : ""}\n      </div>` : ""}\n      ${l && !M ? `<div class="wolf-teams">\n        <span class="wolf-team-label">Lone Wolf:</span> ${esc(n.name)} vs ${$.length} opponents ${r ? "(3×)" : "(2×)"}\n      </div>` : ""}\n      ${(i || l) && !M ? (state._shuckPick && state._shuckPick[e] ? `<div class="shuck-picker" style="margin:8px 0"><div class="wolf-pick-label">Who’s shucking? (2×)</div><div class="wolf-choices">${state.players.map((pl, pi) => `<button class="wolf-pick" data-act="setShuck(${e},${pi})">${esc(pl.name)}</button>`).join("")}<button class="wolf-pick" style="opacity:.7" data-act="showShuckPicker(${e})">Cancel</button></div></div>` : `<div style="margin:8px 0"><button class="wolf-pick" style="color:var(--danger);border-color:var(--danger)" data-act="showShuckPicker(${e})">Anyone Shuck? (2×)</button></div>`) : ""}\n      ${i ? `<div class="hammer-zone">\n        <div class="hammer-status">\n          <span class="hammer-multiplier">${f}×</span>\n          <span class="hammer-label">$${state.gameOpts.wolfVal * f}/pt${c > 0 ? ` (${c})` : ""}${v}</span>\n        </div>\n        <div class="hammer-btns">\n          ${H ? `<button class="hammer-btn wolf-hammer" data-act="hammer(${e},'wolf')">\n            Wolf Pack Hammers!\n          </button>` : ""}\n          ${k ? `<button class="hammer-btn sheep-hammer" data-act="hammer(${e},'sheep')">\n            Field Hammers Back!\n          </button>` : ""}\n        </div>\n        ${c > 0 ? `<div class="hammer-history">${getHammerHistory(s)}\n          <button class="hammer-undo" data-act="undoHammer(${e})" aria-label="Undo hammer">Undo Last Hammer</button>\n        </div>` : ""}${s.conceded ? `<div class="concede-zone"><div class="concede-status"><span class="concede-badge">${s.conceded === "wolf" ? (M ? esc(state.players[x].name) : l ? "Lone Wolf" : "Wolf Pack") : "Field"} conceded — ${s.conceded === "wolf" ? "Field" : M ? esc(state.players[x].name) : l ? "Lone Wolf" : "Wolf Pack"} wins the hole</span><button class="hammer-undo" data-act="concedeWolf(${e},'${s.conceded}')" aria-label="Undo concede">Undo</button></div></div>` : `<div class="concede-zone"><div class="concede-label">Concede the hole</div><div class="hammer-btns"><button class="concede-btn" data-act="concedeWolf(${e},'wolf')">${M ? esc(state.players[x].name) + " Concedes" : l ? "Lone Wolf Concedes" : "Wolf Pack Concedes"}</button><button class="concede-btn" data-act="concedeWolf(${e},'sheep')">Field Concedes</button></div></div>`}\n      </div>` : ""}\n    </div>`));
    }
  if ("banker" === state.gameType && state.players.length >= 2) {
    const teams = getBankerTeams(),
      bt = bankerForHole(e),
      teamMode = !!(state.gameOpts && state.gameOpts.bankerTeams),
      unitFull = (i) => teams[i].map((p) => esc(state.players[p].name)).join(" & "),
      prevWin = e > 0 ? bankerWinnerOfHole(e - 1) : null,
      overridden = !!(state.bankerHoles && null != state.bankerHoles[e]),
      lbl =
        0 === e
          ? null == bt
            ? "Choose who banks the first hole — tap a player:"
            : "First-hole banker — tap to change:"
          : (overridden
              ? "Banker set manually"
              : null != prevWin
                ? "Defaults to last hole’s winner"
                : "Last hole tied/unscored — carried over") + " — tap to change:";
    let bh = `<div class="wolf-section"><div class="wolf-header">Banker: <strong>${null == bt ? "— choose below —" : unitFull(bt)}</strong><span class="wolf-hole-num">Hole ${hLbl(e)}</span></div>`;
    bh += `<div class="wolf-pick-label">${lbl}</div>`;
    bh +=
      `<div class="wolf-choices">` +
      teams
        .map(
          (t, ti) =>
            `<button class="wolf-pick ${ti === bt ? "selected" : ""}" data-act="setBanker(${e},${ti})">${teamMode ? `Team ${ti + 1}: ` : ""}${unitFull(ti)}${ti === bt ? " " + ico("check") : ""}</button>`,
        )
        .join("") +
      `</div>`;
    overridden &&
      e > 0 &&
      (bh += `<div style="margin-top:8px"><button class="wolf-pick" style="opacity:.8" data-act="clearBanker(${e})">Reset to last winner</button></div>`);
    if (null != bt) {
      const pr = (state.bankerPresses && state.bankerPresses[e]) || { group: 0, units: {} },
        gp = pr.group ? 1 : 0;
      bh +=
        `<div class="wolf-pick-label" style="margin-top:var(--sp-6)">Presses — tap to double a bet (birdie ×2, eagle ×3 apply automatically). Tap again to undo:</div><div class="hammer-zone"><div class="banker-press-row">Banker</div><div class="hammer-btns"><button class="hammer-btn ${gp ? "wolf-hammer" : "sheep-hammer"}" data-act="pressBankerGroup(${e})">${gp ? ico("check") + " Pressed the whole group (2×)" : "Press the whole group (2×)"}</button></div><div class="banker-press-row">Each ${teamMode ? "team" : "player"} vs the banker</div><div class="hammer-btns">` +
        teams
          .map((t, ti) => {
            if (ti === bt) return "";
            const up = pr.units && pr.units[ti] ? 1 : 0,
              fac = Math.pow(2, gp + up);
            return `<button class="hammer-btn ${up ? "wolf-hammer" : "sheep-hammer"}" data-act="pressBankerUnit(${e},${ti})">${up ? ico("check") + " " : ""}${teamMode ? `Team ${ti + 1}` : esc(state.players[teams[ti][0]].name.split(" ")[0])}${fac > 1 ? ` · ${fac}× bet` : ` · press`}</button>`;
          })
          .join("") +
        `</div></div>`;
    }
    bh += `</div>`;
    _h += bh;
  }
  const n = state.players.every((t, a) => null != state.scores[a][e]),
    _confd = !!(state.confirmedHoles && state.confirmedHoles[e]) || (isSpectator && n);
  a.innerHTML = _h;
  renderConfirmBar(e, _confd);
  (renderGameStatus(),
    renderHolePreview(),
    renderHoleMoneyLog(),
    renderPlayFeed(),
    renderHoleDots(),
    syncScoreSeg());
  const s = document.getElementById("hole-info");
  (_navHole && s && s.scrollIntoView({ behavior: "smooth", block: "start" }), (_navHole = !1));
} /* Picking up is the most common thing that happens on a golf course that this
   app had no way to record. Today you invent a number -- and because the money
   engine settles on whatever you invent, a made-up 9 is a real transfer of
   money between two people. So record what actually happened, and score it by
   the one rule everybody already accepts: net double bogey, the USGA maximum.
   The gross stored is par + 2 + the strokes that player gets on the hole, so
   the NET works out to par + 2 exactly, and every game's money math keeps
   reading plain numbers with no idea anything unusual happened. */
function pickUpKey(p, h) {
  return h + ":" + p;
}
function isPickedUp(p, h) {
  return !!(state.pickedUp && state.pickedUp[pickUpKey(p, h)]);
}
function pickUpGross(p, h) {
  const t = getPlayingHandicaps();
  return state.pars[h] + 2 + getStrokesOnHole(t[p], h);
}
function clearPickUp(p, h) {
  state.pickedUp && delete state.pickedUp[pickUpKey(p, h)];
}
function setPickUp(p, h) {
  if (!canMutateRound()) return;
  pushUndo();
  ((state.pickedUp = state.pickedUp || {}),
    (state.pickedUp[pickUpKey(p, h)] = 1),
    (state.scores[p][h] = pickUpGross(p, h)));
  (invalidateMoneyCache(), debouncedSave(), haptic(), closeQuickPicker(), renderHole());
}
function adjScore(e, t, a) {
  if (!canMutateRound()) return;
  pushUndo("s" + e + ":" + t);
  const s = state.scores[e][t] ?? state.pars[t],
    n = Math.max(1, s + a);
  ((state.scores[e][t] = n),
    clearPickUp(e, t),
    invalidateMoneyCache(),
    debouncedSave(),
    haptic(),
    renderHole());
} /* This used to be a modal in everything but name: no role, no scrim, Escape
   did nothing, and the tap that dismissed it went on to hit whatever was
   underneath -- including a "+" button, so one tap both closed the sheet and
   changed a score. The scrim is what fixes that: the dismissing tap lands on
   it, not on the row behind.

   It also used to open focus on the FIRST cell, which is par-2, so every hole
   began on "double eagle" for anyone using a keyboard or a switch. Focus now
   starts on the current score, or par when there is none. */
let _qpPlayer = -1,
  _qpHole = -1,
  _qpHi = 0;
function quickScore(e, t, hiBase) {
  if (!canMutateRound()) return;
  closeQuickPicker();
  ((_qpPlayer = e), (_qpHole = t));
  const a = state.pars[t],
    s = state.scores[e][t];
  /* The stepper has always been unbounded upward while the grid stopped at
     par+5, so a blow-up 12 was enterable with "+" and not here. "More" walks
     the window up instead of capping it. */
  const lo = Math.max(1, a - 2 + (_qpHi = hiBase || 0)),
    hi = lo + 7,
    n = [];
  for (let k = lo; k <= hi; k++) n.push(k);
  const scrim = document.createElement("div");
  ((scrim.id = "quick-picker-scrim"),
    (scrim.className = "qp-scrim"),
    (scrim.onclick = closeQuickPicker));
  const l = document.createElement("div");
  ((l.id = "quick-picker"),
    (l.className = "quick-picker"),
    l.setAttribute("role", "dialog"),
    l.setAttribute("aria-modal", "true"),
    l.setAttribute("aria-label", "Score for " + (state.players[e]?.name || "player")));
  l.innerHTML = `<div class="qp-label">${esc(state.players[e].name)} — Hole ${hLbl(t)}</div>
    <div class="qp-grid">${n
      .map((v) => {
        const o = v - a;
        return `<button class="qp-btn ${o <= -2 ? "qp-eagle" : -1 === o ? "qp-birdie" : 0 === o ? "qp-par" : 1 === o ? "qp-bogey" : 2 === o ? "qp-double" : "qp-other"} ${v === s && !isPickedUp(e, t) ? "qp-active" : ""}" data-score="${v}" data-act="setQuickScore(${e},${t},${v})">${v}</button>`;
      })
      .join(
        "",
      )}<button class="qp-btn qp-more" data-act="quickScore(${e},${t},${_qpHi + 6})" aria-label="Higher scores"><i data-ico="right"></i></button></div>
    <div class="qp-foot"><button class="qp-pickup${isPickedUp(e, t) ? " on" : ""}" data-act="setPickUp(${e},${t})">Picked up — score net double bogey (${pickUpGross(e, t)})</button></div>`;
  (document.body.appendChild(scrim), document.body.appendChild(l));
  const want =
    l.querySelector(".qp-active") ||
    l.querySelector('.qp-btn[data-score="' + a + '"]') ||
    l.querySelector(".qp-btn");
  want && want.focus();
}
function qpKeydown(ev) {
  if ("Escape" === ev.key && document.getElementById("quick-picker")) {
    (ev.preventDefault(), closeQuickPicker());
  }
}
document.addEventListener("keydown", qpKeydown);
function setQuickScore(e, t, a) {
  if (!canMutateRound()) return;
  (pushUndo("s" + e + ":" + t),
    (state.scores[e][t] = a),
    clearPickUp(e, t),
    invalidateMoneyCache(),
    debouncedSave(),
    haptic(),
    renderHole());
  let s = -1;
  for (let a = 1; a <= state.players.length; a++) {
    const n = (e + a) % state.players.length;
    if (null == state.scores[n]?.[t]) {
      s = n;
      break;
    }
  }
  s >= 0 ? quickScore(s, t) : closeQuickPicker();
}
function closeQuickPicker() {
  _qpPlayer = _qpHole = -1;
  const e = document.getElementById("quick-picker");
  e && e.remove();
  const t = document.getElementById("quick-picker-scrim");
  t && t.remove();
}
function closeColorPicker(ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest("#color-picker")) return;
  const e = document.getElementById("color-picker");
  e && e.remove();
}
function openColorPicker(kind, idx) {
  (closeColorPicker(), document.removeEventListener("click", closeColorPicker));
  const cur =
      "roster" === kind
        ? state.players[idx]?.color
        : document.querySelector('.mp-color[data-idx="' + idx + '"]')?.dataset.color,
    pal = [...COLORS];
  cur && !pal.includes(cur) && pal.push(cur);
  const l = document.createElement("div");
  ((l.id = "color-picker"),
    (l.className = "quick-picker color-picker"),
    l.setAttribute("role", "dialog"),
    l.setAttribute("aria-label", "Choose player color"),
    (l.innerHTML =
      '<div class="qp-label">Player Color</div><div class="cp-grid">' +
      pal
        .map(
          (c) =>
            '<button type="button" class="cp-swatch' +
            (c === cur ? " cp-active" : "") +
            '" style="background:' +
            esc(c) +
            '" aria-label="' +
            esc(c) +
            '" aria-pressed="' +
            (c === cur) +
            '" data-act="pickColor(\'' +
            kind +
            "'," +
            idx +
            ",'" +
            esc(c) +
            "')\"></button>",
        )
        .join("") +
      "</div>"),
    (l.onkeydown = (e) => {
      "Escape" === e.key && (e.preventDefault(), closeColorPicker());
    }),
    document.body.appendChild(l),
    (l.querySelector(".cp-active") || l.querySelector(".cp-swatch"))?.focus(),
    setTimeout(() => document.addEventListener("click", closeColorPicker, { once: !0 }), 10));
}
function pickColor(kind, idx, c) {
  if ("roster" === kind) (state.players[idx] && (state.players[idx].color = c), renderPlayers());
  else {
    const e = document.querySelector('.mp-color[data-idx="' + idx + '"]');
    e && ((e.dataset.color = c), (e.style.background = c));
  }
  (haptic(), closeColorPicker());
}
async function confirmHoleScores(e) {
  if (!canMutateRound()) return;
  if (
    wolfPickMissing(e) &&
    !(await appConfirm(
      "No wolf pick was made for this hole, so no money will change hands on it.",
      { title: "No Wolf Pick", confirmLabel: "Confirm Anyway", cancelLabel: "Go Back" },
    ))
  )
    return;
  if (
    bankerPickMissing(e) &&
    !(await appConfirm("No banker was chosen for this hole, so no money will change hands on it.", {
      title: "No Banker Picked",
      confirmLabel: "Confirm Anyway",
      cancelLabel: "Go Back",
    }))
  )
    return;
  /* The par pre-fill under an unscored player is a dashed 50%-opacity
     placeholder, but confirming turned it into a real score with no prompt --
     and the money on this hole settled on it. finishRound() already asks
     before fabricating par for unplayed holes; a per-hole confirm owes the
     same courtesy, by name, because here it is one specific person's bet. */
  {
    const _blank = state.players
      .map((p, i) => (null == state.scores[i][e] ? p.name : null))
      .filter(Boolean);
    if (_blank.length) {
      const _who =
        _blank.length === 1
          ? _blank[0]
          : _blank.slice(0, -1).join(", ") + " and " + _blank[_blank.length - 1];
      if (
        !(await appConfirm(
          _who +
            (1 === _blank.length ? " has" : " have") +
            " no score on this hole. Confirming records par (" +
            state.pars[e] +
            ")" +
            (1 === _blank.length ? "" : " each") +
            ", and the money settles on that.",
          { title: "Record Par?", confirmLabel: "Record Par", cancelLabel: "Go Back" },
        ))
      )
        return;
    }
  }
  (pushUndo(), haptic());
  const _sv = state.players.map((t, a) => state.scores[a][e]),
    _wh = state.wolfHoles && state.wolfHoles[e],
    _conc = _wh && _wh.conceded;
  (state.players.forEach((t, a) => {
    delete state.scores[a][e];
  }),
    _wh && (_wh.conceded = null),
    invalidateMoneyCache());
  const t = [...calcMoney()];
  (state.players.forEach((t, a) => {
    state.scores[a][e] = null != _sv[a] ? _sv[a] : state.pars[e];
  }),
    _wh && (_wh.conceded = _conc),
    invalidateMoneyCache());
  const a = calcMoney(),
    s = state.players.map((e, s) => a[s] - t[s]);
  (state.confirmedHoles || (state.confirmedHoles = {}),
    (state.confirmedHoles[e] = !0),
    showHoleResult(e, s),
    saveCurrentRound(),
    e < maxHole() - 1 && (state.currentHole = e + 1),
    renderHole());
}
function unlockHole(e) {
  if (!canMutateRound()) return;
  (pushUndo(),
    state.confirmedHoles && delete state.confirmedHoles[e],
    invalidateMoneyCache(),
    saveCurrentRound(),
    renderHole());
} /* The label is computed from the NET score, the number beside it was the
   gross, so a 4 and a stroke-adjusted 5 both printed "(Birdie)" -- which reads
   as a bug to everyone who did not write it, on the screen where the money is
   announced. Show the stroke instead of hiding it. */
function hrScore(r) {
  return r.net !== r.gross ? `${r.gross} \u2192 ${r.net} (${r.lbl})` : `${r.gross} (${r.lbl})`;
}
function showHoleResult(e, t) {
  const a = document.getElementById("hole-result-overlay");
  a && a.remove();
  const s = getPlayingHandicaps(),
    n = state.gameOpts,
    o = ("match" === state.gameType && "nassau" === n.matchFormat) || "nassau" === state.gameType,
    l = "nassau" === state.gameType && n.nassauTeams && 2 === n.nassauTeamRoster?.length,
    r = l ? n.nassauTeamRoster : null,
    i = state.players.map((a, n) => {
      const o = state.scores[n][e],
        l = o - getStrokesOnHole(s[n], e),
        r = l - state.pars[e],
        i = r <= -2 ? "Eagle" : -1 === r ? "Birdie" : 0 === r ? "Par" : 1 === r ? "Bogey" : `+${r}`;
      return { name: a.name, color: a.color, gross: o, net: l, lbl: i, delta: t[n] };
    });
  if (!o && t.every((e) => Math.abs(e) < 0.005) && "none" === state.gameType) return;
  let c = `<div class="hole-result-header">Hole ${hLbl(e)} Results</div>`;
  if (o) {
    const t = netRow(e);
    let a = "";
    if (l && r) {
      const e = Math.min(...r[0].map((e) => t[e])),
        s = Math.min(...r[1].map((e) => t[e]));
      a = e < s ? "Team 1 wins the hole" : s < e ? "Team 2 wins the hole" : "Hole halved";
    } else {
      const e = Math.min(...t);
      a =
        1 === t.filter((t) => t === e).length
          ? "" + esc(state.players[t.indexOf(e)].name) + " wins the hole"
          : "Hole halved";
    }
    ((c += `<div style="font-size:1.05rem;font-weight:700;margin-bottom:12px">${a}</div>`),
      i.forEach((e) => {
        c += `<div class="hole-result-row">${avatarHTML(e, 10)}<span class="hr-name">${esc(e.name)}</span><span class="hr-score">${hrScore(e)}</span></div>`;
      }),
      (c +=
        '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--rule);font-size:0.85rem">'));
    const s = [{ label: maxHole() > 9 ? "Front 9" : "Match", s: 0, e: Math.min(8, maxHole() - 1) }];
    (maxHole() > 9 && s.push({ label: "Back 9", s: 9, e: maxHole() - 1 }),
      maxHole() > 9 && s.push({ label: "Overall", s: 0, e: maxHole() - 1 }),
      s.forEach((e) => {
        if (l && r) {
          const t = r;
          let a = 0,
            s = 0;
          for (let n = e.s; n <= e.e; n++) {
            const e = netRow(n);
            if (e.some((e) => null == e)) continue;
            const o = Math.min(...t[0].map((t) => e[t])),
              l = Math.min(...t[1].map((t) => e[t]));
            o < l ? a++ : l < o && s++;
          }
          const o =
              a > s
                ? "T1 leads " + a + "-" + s
                : s > a
                  ? "T2 leads " + s + "-" + a
                  : "Tied " + a + "-" + s,
            l =
              "Front 9" === e.label
                ? n.matchFront || n.front
                : "Back 9" === e.label
                  ? n.matchBack || n.back
                  : n.matchOverall || n.overall;
          c += `<div style="display:flex;justify-content:space-between"><span>${e.label} ($${l})</span><span class="${a > s ? "match-up" : s > a ? "match-dn" : "match-as"}">${o}</span></div>`;
        } else {
          const t = Array(state.players.length).fill(0);
          for (let a = e.s; a <= e.e; a++) {
            const e = netRow(a);
            if (e.some((e) => null == e)) continue;
            const s = Math.min(...e);
            1 === e.filter((e) => e === s).length && t[e.indexOf(s)]++;
          }
          const a = Math.max(...t),
            s =
              1 === t.filter((e) => e === a).length
                ? esc(state.players[t.indexOf(a)].name)
                : "Tied";
          c += `<div style="display:flex;justify-content:space-between"><span>${e.label}</span><span>${s} (${a})</span></div>`;
        }
      }),
      (c += "</div>"));
    const _sm = nassauSegmentMode()
      ? (computeHoleMoney().find((r) => r.h === e) || { deltas: state.players.map(() => 0) }).deltas
      : t;
    if (_sm.some((v) => Math.abs(v) > 0.005)) {
      c += '<div class="hole-result-section" style="margin-top:10px">';
      state.players
        .map((p, idx) => ({ name: p.name, color: p.color, v: _sm[idx] }))
        .sort((x, y) => y.v - x.v)
        .forEach((r) => {
          const cls = r.v > 0.005 ? "win" : r.v < -0.005 ? "lose" : "push";
          c += `<div class="hole-result-row ${cls}">${avatarHTML(r, 10)}<span class="hr-name">${esc(r.name)}</span><span class="hr-money ${cls}">${fmtMoney(r.v)}</span></div>`;
        });
      c += "</div>";
    } else {
      c +=
        '<div class="hole-result-push" style="margin-top:10px">No money change on this hole</div>';
    }
  } else {
    const e = [],
      t = [],
      a = [];
    (i.forEach((s) => {
      s.delta > 0.01 ? e.push(s) : s.delta < -0.01 ? t.push(s) : a.push(s);
    }),
      e.sort((e, t) => t.delta - e.delta),
      t.sort((e, t) => e.delta - t.delta),
      0 === e.length && 0 === t.length
        ? (c += '<div class="hole-result-push">All Square — No money moves</div>')
        : (e.length &&
            ((c += '<div class="hole-result-section winners">'),
            e.forEach((e) => {
              c += `<div class="hole-result-row win">${avatarHTML(e, 10)}<span class="hr-name">${esc(e.name)}</span><span class="hr-score">${hrScore(e)}</span><span class="hr-money win">${fmtMoney(e.delta)}</span></div>`;
            }),
            (c += "</div>")),
          t.length &&
            ((c += '<div class="hole-result-section losers">'),
            t.forEach((e) => {
              c += `<div class="hole-result-row lose">${avatarHTML(e, 10)}<span class="hr-name">${esc(e.name)}</span><span class="hr-score">${hrScore(e)}</span><span class="hr-money lose">${fmtMoney(-Math.abs(e.delta))}</span></div>`;
            }),
            (c += "</div>")),
          a.length &&
            ((c += '<div class="hole-result-section">'),
            a.forEach((e) => {
              c += `<div class="hole-result-row push">${avatarHTML(e, 10)}<span class="hr-name">${esc(e.name)}</span><span class="hr-score">${hrScore(e)}</span><span class="hr-money push">$0</span></div>`;
            }),
            (c += "</div>"))));
  }
  {
    let _best = 99;
    state.players.forEach((t, a) => {
      const s = state.scores[a][e] - state.pars[e];
      s < _best && (_best = s);
    });
    _best <= -2
      ? (celebrate(), haptic([40, 60, 40, 60, 120]))
      : -1 === _best && haptic([30, 40, 60]);
  }
  ("function" == typeof sendNotification &&
    state.players.forEach((t, a) => {
      const s = state.scores[a][e] - state.pars[e];
      s <= -2
        ? sendNotification("EAGLE!", t.name + " eagled Hole " + (e + 1))
        : -1 === s && sendNotification("BIRDIE!", t.name + " birdied Hole " + (e + 1));
    }),
    (c += '<div class="hr-progress" aria-hidden="true"><i></i></div>'));
  c +=
    '<button class="btn primary btn-block hr-continue" data-act="closeHoleResult()">Continue</button>';
  const d = document.createElement("div");
  ((d.id = "hole-result-overlay"),
    (d.className = "modal"),
    (d.innerHTML = `<div class="modal-content hole-result-modal" role="dialog" aria-modal="true" aria-label="Hole ${hLbl(e)} result">${c}</div>`),
    (d.onclick = (t) => {
      t.target === d && closeHoleResult();
    }),
    d.addEventListener("keydown", (t) => {
      "Escape" === t.key
        ? closeHoleResult()
        : "Tab" === t.key && (t.preventDefault(), d.querySelector(".hr-continue")?.focus());
    }),
    (_holeResultReturnFocus = document.activeElement),
    document.body.appendChild(d),
    d.querySelector(".hr-continue")?.focus());
  const _rm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches,
    _bar = d.querySelector(".hr-progress>i");
  _rm || !_bar
    ? (window._holeResultTimer = setTimeout(closeHoleResult, 6e3))
    : _bar.addEventListener("animationend", closeHoleResult);
}
let _holeResultReturnFocus = null;

function closeHoleResult() {
  clearTimeout(window._holeResultTimer);
  const e = document.getElementById("hole-result-overlay");
  e && e.remove();
  try {
    _holeResultReturnFocus && _holeResultReturnFocus.focus && _holeResultReturnFocus.focus();
  } catch (_) {}
  _holeResultReturnFocus = null;
}
function getBonusRecord(e, t) {
  const a = state.bonusPoints[e]?.[t];
  return a && "object" == typeof a ? a : null;
}
function removeBonusCategory(e, t, a) {
  if (!canMutateRound()) return;
  const s = getBonusRecord(e, t);
  s &&
    s[a] &&
    (pushUndo(), delete s[a], invalidateMoneyCache(), debouncedSave(), haptic(), renderHole());
}
function getBonusCountIn(p, h, cats) {
  const r = getBonusRecord(p, h);
  if (!r) return 0;
  let n = 0;
  for (let i = 0; i < cats.length; i++) r[cats[i]] && n++;
  return n;
}
function getBonusCount(e, t) {
  const a = state.bonusPoints[e]?.[t];
  return null == a ? 0 : "number" == typeof a ? a : Object.keys(a).length;
}
function isBonusAwarded(e, t, a) {
  const s = getBonusRecord(e, t);
  return !!(s && s[a]);
}
function addBonus(e, t, a) {
  if (!canMutateRound()) return;
  (pushUndo(), haptic(), state.bonusPoints[e] || (state.bonusPoints[e] = {}));
  let s = state.bonusPoints[e][t];
  ((s && "object" == typeof s) ||
    ((s = "number" == typeof s && s > 0 ? { __legacy: s } : {}), (state.bonusPoints[e][t] = s)),
    (s[a] = !0),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function removeBonus(e, t) {
  if (!canMutateRound()) return;
  (pushUndo(),
    state.bonusPoints[e] && (state.bonusPoints[e][t] = {}),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function getWolfForHole(e) {
  const n = state.players.length;
  if (!n) return 0;
  if (state.wolfBreakouts) {
    const b = state.wolfBreakouts[e];
    if (Number.isInteger(b) && b >= 0 && b < n) return b;
  }
  const ord = state.gameOpts && state.gameOpts.wolfOrder;
  if (Array.isArray(ord) && ord.length === n) {
    const w = ord[((e % n) + n) % n];
    if (Number.isInteger(w) && w >= 0 && w < n) return w;
  }
  return e % n;
}
function rotationWolfForHole(e) {
  const n = state.players.length;
  if (!n) return 0;
  const ord = state.gameOpts && state.gameOpts.wolfOrder;
  if (Array.isArray(ord) && ord.length === n) {
    const w = ord[((e % n) + n) % n];
    if (Number.isInteger(w) && w >= 0 && w < n) return w;
  }
  return e % n;
}
function setWolfBreakout(e, t) {
  if (!canMutateRound()) return;
  (pushUndo(), haptic(), state.wolfBreakouts || (state.wolfBreakouts = {}));
  const a = rotationWolfForHole(e),
    s = state.wolfBreakouts[e];
  (t === a || t === s ? delete state.wolfBreakouts[e] : (state.wolfBreakouts[e] = t),
    delete state.wolfHoles[e],
    state._wolfBlindMode && (state._wolfBlindMode[e] = !1),
    state._shuckPick && (state._shuckPick[e] = !1),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function updatePairing(e) {
  if (!canMutateRound()) return;
  const t = +e.dataset.team,
    a = +e.dataset.slot;
  ((state.pairings[t][a] = +e.value), debouncedSave());
}
function lockPairings() {
  if (!canMutateRound()) return;
  state.pairingsLocked = !0;
  for (let e = 0; e < maxHole(); e++) {
    const t = e % state.pairings.length;
    state.wolfHoles[e] ||
      (state.wolfHoles[e] = {
        fixedPairs: !0,
        wolfTeam: t,
        allyTeams: void 0,
        hammers: 0,
        lastHammerTeam: null,
        hammerLog: [],
      });
  }
  (invalidateMoneyCache(), debouncedSave(), renderHole());
}
function toggleAllyTeam(e, t) {
  if (!canMutateRound()) return;
  pushUndo();
  const a = state.wolfHoles[e];
  if (!a) return;
  let s = Array.isArray(a.allyTeams) ? [...a.allyTeams] : [];
  (s.includes(t) ? (s = s.filter((e) => e !== t)) : s.push(t),
    (a.allyTeams = s),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function setLonePair(e) {
  if (!canMutateRound()) return;
  pushUndo();
  const t = state.wolfHoles[e];
  t && ((t.allyTeams = []), invalidateMoneyCache(), debouncedSave(), renderHole());
}
function toggleWolfPartner(e, t) {
  if (!canMutateRound()) return;
  pushUndo();
  const a = getWolfForHole(e),
    s = state.wolfHoles[e],
    n = state.players.length < 6 ? 1 : 2;
  let o = Array.isArray(s?.partners) ? [...s.partners] : [];
  (o.includes(t) ? (o = o.filter((e) => e !== t)) : (o.length >= n && o.shift(), o.push(t)),
    (state.wolfHoles[e] = {
      wolf: a,
      partners: o.length ? o : void 0,
      blind: !1,
      blindPick: !1,
      hammers: s?.hammers || 0,
      lastHammerTeam: s?.lastHammerTeam || null,
      hammerLog: s?.hammerLog || [],
    }),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function showShuckPicker(e) {
  (state._shuckPick || (state._shuckPick = {}),
    (state._shuckPick[e] = !state._shuckPick[e]),
    renderHole());
}
function setShuck(e, t) {
  if (!canMutateRound()) return;
  pushUndo();
  const a = getWolfForHole(e);
  (state._wolfBlindMode || (state._wolfBlindMode = {}),
    (state._wolfBlindMode[e] = !1),
    (state.wolfHoles[e] = {
      wolf: a,
      partners: [],
      blind: !1,
      blindPick: !1,
      shuck: t,
      hammers: state.wolfHoles[e]?.hammers || 0,
      lastHammerTeam: state.wolfHoles[e]?.lastHammerTeam || null,
      hammerLog: state.wolfHoles[e]?.hammerLog || [],
    }),
    state._shuckPick && (state._shuckPick[e] = !1),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function cancelShuck(e) {
  if (!canMutateRound()) return;
  pushUndo();
  const t = getWolfForHole(e);
  ((state.wolfHoles[e] = {
    wolf: t,
    partners: void 0,
    blind: !1,
    blindPick: !1,
    shuck: null,
    hammers: 0,
    lastHammerTeam: null,
    hammerLog: [],
  }),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function setWolfPickMode(e, t) {
  if (!canMutateRound()) return;
  (pushUndo(),
    state._wolfBlindMode || (state._wolfBlindMode = {}),
    (state._wolfBlindMode[e] = "blind" === t));
  const a = getWolfForHole(e);
  ((state.wolfHoles[e] = {
    wolf: a,
    partners: void 0,
    blind: !1,
    blindPick: !1,
    hammers: state.wolfHoles[e]?.hammers || 0,
    lastHammerTeam: state.wolfHoles[e]?.lastHammerTeam || null,
    hammerLog: state.wolfHoles[e]?.hammerLog || [],
  }),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function blindPickPartner(e, t) {
  if (!canMutateRound()) return;
  pushUndo();
  const a = getWolfForHole(e),
    s = state.wolfHoles[e];
  state.players.length;
  let n = [t];
  ((state.wolfHoles[e] = {
    wolf: a,
    partners: n,
    blind: !1,
    blindPick: !0,
    hammers: s?.hammers || 0,
    lastHammerTeam: s?.lastHammerTeam || null,
    hammerLog: s?.hammerLog || [],
  }),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function setWolfLone(e, t) {
  if (!canMutateRound()) return;
  pushUndo();
  const a = getWolfForHole(e);
  (state._wolfBlindMode || (state._wolfBlindMode = {}),
    (state._wolfBlindMode[e] = !1),
    (state.wolfHoles[e] = {
      wolf: a,
      partners: [],
      blind: t,
      blindPick: !1,
      hammers: 0,
      lastHammerTeam: null,
      hammerLog: [],
    }),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function pickWolfBlind(e) {
  setWolfLone(e, !0);
}
function hammer(e, t) {
  if (!canMutateRound()) return;
  (pushUndo(), haptic());
  const a = state.wolfHoles[e];
  a &&
    ((a.hammers = (a.hammers || 0) + 1),
    (a.lastHammerTeam = t),
    a.hammerLog || (a.hammerLog = []),
    a.hammerLog.push(t),
    "function" == typeof sendNotification &&
      sendNotification(
        "HAMMER!",
        "Hole " + hLbl(e) + " — stakes doubled to " + Math.pow(2, a.hammers) + "×",
      ),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function undoHammer(e) {
  if (!canMutateRound()) return;
  pushUndo();
  const t = state.wolfHoles[e];
  t &&
    t.hammers &&
    (t.hammers--,
    t.hammerLog.pop(),
    (t.lastHammerTeam = t.hammerLog.length ? t.hammerLog[t.hammerLog.length - 1] : null),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function concedeWolf(e, t) {
  if (!canMutateRound()) return;
  (pushUndo(), haptic());
  const a = state.wolfHoles[e];
  a &&
    ((a.conceded = a.conceded === t ? null : t),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function getHammerHistory(e) {
  return e.hammerLog && e.hammerLog.length
    ? e.hammerLog
        .map(
          (e, t) =>
            `<span class="hammer-chip ${e}">${"wolf" === e ? "" : ""} ${"wolf" === e ? "Wolf" : "Sheep"} → ${Math.pow(2, t + 1)}×</span>`,
        )
        .join("")
    : "";
}
function getHammerHistoryPairs(e) {
  return e.hammerLog && e.hammerLog.length
    ? e.hammerLog
        .map(
          (e, t) => `<span class="hammer-chip wolf">Team ${+e + 1} → ${Math.pow(2, t + 1)}×</span>`,
        )
        .join("")
    : "";
}
function renderGameStatus() {
  const e = document.getElementById("game-status"),
    t = state.gameType;
  const _rb = document.getElementById("standings-ribbon");
  if ("none" === t) {
    _rb && _rb.classList.add("hidden");
    return void (e.innerHTML = "");
  }
  const a = calcMoney();
  if (_rb) {
    _rb.classList.remove("hidden");
    const _ix = state.players.map((p, i) => i).sort((x, y) => a[y] - a[x]),
      _me = getPrimaryPlayerName();
    _rb.innerHTML =
      '<div class="ribbon-strip">' +
      _ix
        .map((i) => {
          const v = a[i];
          return (
            '<div class="ribbon-cell' +
            (state.players[i].name === _me ? " is-me" : "") +
            '">' +
            avatarHTML(state.players[i], 18) +
            '<span class="rib-who">' +
            esc(state.players[i].name.split(" ")[0]) +
            '</span><span class="rib-amt ' +
            (v > 0.01 ? "up" : v < -0.01 ? "down" : "even") +
            '" data-i="' +
            i +
            '">' +
            fmtMoney(v) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>";
    animateRibbon(_rb, a);
  }
  let s = `<div class="money-banner">\n    <div class="money-title">Running Money</div>\n    <div class="money-grid">\n      ${state.players
    .map((e, t) => {
      const s = a[t];
      return `<div class="money-cell ${s > 0.01 ? "money-up" : s < -0.01 ? "money-down" : "money-even"}">\n          ${avatarHTML(e, 8)}\n          <span class="money-name">${esc(e.name)}</span>\n          <span class="money-val">${fmtMoney(s)}</span>\n        </div>`;
    })
    .join("")}\n    </div>\n  </div>`;
  ("nassau" === t
    ? (s += renderNassauDetail())
    : "skins" === t
      ? (s += renderSkinsDetail())
      : "match" === t
        ? (s += renderMatchDetail())
        : "stableford" === t
          ? (s += renderStablefordDetail())
          : "bingo" === t || "dots" === t
            ? (s += renderBonusDetail())
            : "wolf" === t
              ? (s += renderWolfDetail())
              : "vegas" === t
                ? (s += renderVegasDetail())
                : "snake" === t
                  ? (s += renderSnakeDetail())
                  : "sixes" === t
                    ? (s += renderSixesDetail())
                    : "banker" === t && (s += renderBankerDetail()),
    (e.innerHTML = s));
  e.classList.toggle("hidden", "wolf" === t);
  const n = document.getElementById("sticky-leaderboard");
  if (n && state.started) {
    n.classList.remove("hidden");
    const e = state.players
      .map((e, t) => ({ name: e.name, color: e.color, m: a[t] }))
      .sort((e, t) => t.m - e.m);
    n.innerHTML = e
      .map(
        (e) =>
          `<span class="lb-item ${e.m > 0.01 ? "lb-up" : e.m < -0.01 ? "lb-dn" : "lb-even"}">${avatarHTML(e, 6)}${esc(e.name)} ${fmtMoney(e.m)}</span>`,
      )
      .join("");
  }
}
function holeIsComplete(hole) {
  const _wh = state.wolfHoles && state.wolfHoles[hole];
  return !!(_wh && _wh.conceded) || !state.players.some((p, i) => null == state.scores[i]?.[hole]);
}
function holeDelta(hole) {
  const _wh = state.wolfHoles && state.wolfHoles[hole],
    _conc =
      _wh &&
      _wh.conceded; /* The hole's scores are removed so the money can be re-run without them. If
   calcMoney throws in between, an un-guarded restore never runs and the
   scores stay deleted -- which the next debounced save then persists. */
  /* Junk, dots, bingo points and the snake are recorded per hole in
   bonusPoints, not in the scores, so removing only the scores left that money
   in the 'without' figure and the hole showed a delta of zero. A pure Dots or
   Bingo round drew a flat money line and an empty hole-by-hole table while
   real money moved. Unwind the hole's awards as well. */
  const snap = JSON.parse(JSON.stringify(state.scores)),
    bsnap = JSON.parse(JSON.stringify(state.bonusPoints || {}));
  let without;
  try {
    (state.players.forEach((p, i) => {
      delete state.scores[i][hole];
      state.bonusPoints && state.bonusPoints[i] && delete state.bonusPoints[i][hole];
    }),
      _wh && (_wh.conceded = null));
    invalidateMoneyCache();
    without = [...calcMoney()];
  } finally {
    (Object.assign(state.scores, snap),
      state.bonusPoints && Object.assign(state.bonusPoints, bsnap),
      _wh && (_wh.conceded = _conc));
    invalidateMoneyCache();
  }
  const withAll = calcMoney();
  return state.players.map((p, i) => withAll[i] - without[i]);
}
function nassauSegmentMode() {
  return (
    "nassau" === state.gameType ||
    ("match" === state.gameType && state.gameOpts && "nassau" === state.gameOpts.matchFormat)
  );
} /* Per-hole money is the difference of the exact running totals (calcMoney over
   holes 0..h), not a leave-one-out diff of a single hole. Leave-one-out is
   non-additive for any game whose settlement depends on other holes -- Nassau
   and Sixes segments, and Skins carry-overs -- so its columns never summed to
   calcMoney() and the scorecard TOTAL disagreed with the money banner. Prefix
   differences telescope, so every column totals calcMoney() for every game and
   they equal the old per-hole values for independent games (Wolf, Vegas,
   Match-per-hole, Bingo/Dots). */
