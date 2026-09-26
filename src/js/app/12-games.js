let _moneyCache = null,
  _moneyCacheVer = 0;
function invalidateMoneyCache() {
  (_moneyCacheVer++, (_moneyCache = null));
}
const SIDE_CATS = ["3-Putt", "Greenie", "Sandy", "Barkie", "Birdie", "Eagle", "Polie"];
const JUNK_CATS = [1, 2, 3, 4, 5, 6];
const SIDE_BET_DEFAULTS = {
  skins: { on: !1, val: 2, carry: !0 },
  snake: { on: !1, val: 5 },
  junk: { on: !1, val: 2 },
};
function defaultSideBets() {
  return JSON.parse(JSON.stringify(SIDE_BET_DEFAULTS));
}
// A side bet is suppressed when the main game already settles it, so the
// same wager can never be counted twice.
function sideBetActive(key) {
  const sb = state.sideBets && state.sideBets[key];
  if (!sb || !sb.on) return !1;
  const g = state.gameType;
  if ("skins" === key && "skins" === g) return !1;
  if ("snake" === key && "snake" === g) return !1;
  if ("junk" === key && ("dots" === g || "bingo" === g)) return !1;
  return !0;
}
function anySideBetActive() {
  return Object.keys(SIDE_BET_DEFAULTS).some(sideBetActive);
}
function sideBetMoney() {
  const out = state.players.map(() => 0);
  if (sideBetActive("skins")) {
    const sb = state.sideBets.skins;
    calcSkinsMoney({ skinVal: +sb.val || 0, carry: !!sb.carry }).forEach((v, i) => (out[i] += v));
  }
  if (sideBetActive("snake")) {
    const sb = state.sideBets.snake;
    calcSnakeMoney({ potVal: +sb.val || 0 }).forEach((v, i) => (out[i] += v));
  }
  if (sideBetActive("junk")) {
    const sb = state.sideBets.junk;
    calcBonusMoney({ val: +sb.val || 0, cats: JUNK_CATS }).forEach((v, i) => (out[i] += v));
  }
  return out;
}
function mainGameMoney() {
  const e = state.gameType;
  return "nassau" === e
    ? calcNassauMoney()
    : "skins" === e
      ? calcSkinsMoney()
      : "match" === e
        ? calcMatchMoney()
        : "stableford" === e
          ? calcStablefordMoney()
          : "bingo" === e || "dots" === e
            ? calcBonusMoney()
            : "wolf" === e
              ? calcWolfMoney()
              : "vegas" === e
                ? calcVegasMoney()
                : "snake" === e
                  ? calcSnakeMoney()
                  : "sixes" === e
                    ? calcSixesMoney()
                    : "banker" === e
                      ? calcBankerMoney()
                      : state.players.map(() => 0);
}
function calcMoney() {
  if (_moneyCache) return _moneyCache;
  const main = mainGameMoney();
  if (!anySideBetActive()) return (_moneyCache = main);
  const side = sideBetMoney();
  return (_moneyCache = main.map((v, i) => v + side[i]));
}
function settleTeamSegment(e, t, a, s, n, o) {
  let l = 0,
    r = 0;
  for (let i = e; i <= t; i++) {
    const e = netRow(i);
    if (e.some((e) => null == e)) continue;
    const t2 = Math.min(...a.map((t) => e[t])),
      c = Math.min(...s.map((e2) => e[e2]));
    t2 < c ? l++ : c < t2 && r++;
  }
  l > r
    ? a.forEach((e) => {
        s.forEach((t) => {
          ((o[e] += n), (o[t] -= n));
        });
      })
    : r > l &&
      s.forEach((e) => {
        a.forEach((t) => {
          ((o[e] += n), (o[t] -= n));
        });
      });
}
function calcSixesMoney() {
  const e = state.players.length,
    t = Array(e).fill(0);
  if (4 !== e) return t;
  const a = state.gameOpts.sixesVal || 5,
    s = [
      [
        [0, 1],
        [2, 3],
      ],
      [
        [0, 2],
        [1, 3],
      ],
      [
        [0, 3],
        [1, 2],
      ],
    ],
    n = Math.floor(maxHole() / 3);
  return (
    s.forEach((e, s) => {
      const o = s * n,
        l = 2 === s ? maxHole() - 1 : o + n - 1;
      settleTeamSegment(o, l, e[0], e[1], a, t);
    }),
    t
  );
}
function getBankerTeams() {
  const o = state.gameOpts || {};
  if (o.bankerTeams && Array.isArray(o.bankerTeamRoster) && o.bankerTeamRoster.length)
    return o.bankerTeamRoster.map((t) => t.slice());
  return state.players.map((e, i) => [i]);
} /* Takes the hole's net row when the caller already has it. Banker asks for
   every team's net on every hole, and each of those was re-fetching the same
   row. */
function bankerTeamNet(team, h, row) {
  const r = row || netRow(h);
  let m = null;
  for (let k = 0; k < team.length; k++) {
    const v = r[team[k]];
    null != v && (null == m || v < m) && (m = v);
  }
  return m;
}
function bankerWinnerOfHole(h, row) {
  const teams = getBankerTeams(),
    r = row || netRow(h),
    nets = teams.map((t) => bankerTeamNet(t, h, r));
  if (nets.some((v) => null == v)) return null;
  const min = Math.min(...nets),
    w = nets.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0);
  return 1 === w.length ? w[0] : null;
} /* Resolving who banks a hole was quadratic in holes. bankerForHole() fell
   through to here, which asked for the previous hole's winner and, when that
   hole was tied or unscored, recursed to the hole before it -- back to the
   first if need be, recomputing every team's net on the way. calcBankerMoney()
   does that once per hole, and the money replay runs calcBankerMoney() once
   per completed hole, so an 18-hole card resolved the same chain thousands of
   times. It is a plain linear recurrence, so settle the whole sequence in one
   forward pass and cache it against the money-cache version.

   Holes past the end of the round keep the original recursive answer: the
   sequence only covers the holes being played. */
let _bankerSeq = null,
  _bankerSeqVer = -1;
function bankerSequence() {
  if (_bankerSeq && _bankerSeqVer === _moneyCacheVer) return _bankerSeq;
  const teams = getBankerTeams(),
    n = maxHole(),
    seq = new Array(n);
  for (let h = 0; h < n; h++) {
    const c = state.bankerHoles && state.bankerHoles[h];
    if (null != c && c >= 0 && c < teams.length) {
      seq[h] = c;
      continue;
    }
    if (h <= 0) {
      seq[h] = null;
      continue;
    }
    const w = bankerWinnerOfHole(h - 1);
    seq[h] = null != w ? w : seq[h - 1];
  }
  return ((_bankerSeq = seq), (_bankerSeqVer = _moneyCacheVer), seq);
}
function defaultBankerForHole(h) {
  if (h <= 0) return null;
  const s = bankerSequence();
  if (h < s.length) return s[h];
  const w = bankerWinnerOfHole(h - 1);
  return null != w ? w : bankerForHole(h - 1);
}
function bankerPickMissing(h) {
  return "banker" === state.gameType && null == bankerForHole(h);
}
function bankerForHole(h) {
  const teams = getBankerTeams(),
    c = state.bankerHoles && state.bankerHoles[h];
  if (null != c && c >= 0 && c < teams.length) return c;
  return defaultBankerForHole(h);
}
function bankerUnitGross(team, h) {
  const vals = team.map((p) => state.scores[p] && state.scores[p][h]).filter((v) => null != v);
  return vals.length ? Math.min(...vals) : null;
}
function bankerScoreFactor(team, h) {
  const g = bankerUnitGross(team, h);
  if (null == g) return 1;
  const d = g - state.pars[h];
  return d <= -2 ? 3 : -1 === d ? 2 : 1;
}
function bankerPressFactor(h, ti) {
  const pr = state.bankerPresses && state.bankerPresses[h];
  if (!pr) return 1;
  return Math.pow(2, (pr.group ? 1 : 0) + (pr.units && pr.units[ti] ? 1 : 0));
}
function bankerMatchMult(h, ti, teamA, teamB) {
  return (
    Math.max(bankerScoreFactor(teamA, h), bankerScoreFactor(teamB, h)) * bankerPressFactor(h, ti)
  );
}
function calcBankerMoney() {
  const teams = getBankerTeams(),
    n = state.players.length,
    v = state.gameOpts.bankerVal || 2,
    out = Array(n).fill(0);
  for (let h = 0; h < maxHole(); h++) {
    const bt = bankerForHole(h);
    if (null == bt) continue;
    const row = netRow(h),
      bteam = teams[bt],
      bn = bankerTeamNet(bteam, h, row);
    if (null == bn) continue;
    teams.forEach((team, ti) => {
      if (ti === bt) return;
      const tn = bankerTeamNet(team, h, row);
      if (null == tn) return;
      let w = 0;
      bn < tn ? (w = 1) : bn > tn && (w = -1);
      if (0 === w) return;
      const st = v * bankerMatchMult(h, ti, bteam, team);
      bteam.forEach((p) => (out[p] += (w * st) / bteam.length));
      team.forEach((p) => (out[p] -= (w * st) / team.length));
    });
  }
  return out;
}
function calcNassauMoney() {
  const e = state.gameOpts,
    t = state.players.length,
    a = Array(t).fill(0),
    s = [];
  (s.push({
    start: 0,
    end: Math.min(8, maxHole() - 1),
    val: e.front,
    label: maxHole() > 9 ? "Front 9" : "Match",
  }),
    maxHole() > 9 && s.push({ start: 9, end: maxHole() - 1, val: e.back, label: "Back 9" }),
    maxHole() > 9 && s.push({ start: 0, end: maxHole() - 1, val: e.overall, label: "Overall" }),
    e.press &&
      [
        { s: 0, e: Math.min(8, maxHole() - 1), label: "F" },
        ...(maxHole() > 9 ? [{ s: 9, e: maxHole() - 1, label: "B" }] : []),
      ].forEach((a) => {
        /* An automatic press starts ONE new bet when a player goes 2 down. This used to
   be level-triggered rather than edge-triggered, so a player who simply stayed
   2 down minted a fresh press on every remaining hole, and two players down at
   the same hole pushed two identical start/end segments that then settled
   twice. A $5 Nassau with $5 presses measured $375 of action instead of $30.
   Fire once on the transition into 2 down, and key the segment on the holes it
   covers rather than on who triggered it. */
        const n = Array(t).fill(0),
          wasDown = Array(t).fill(!1);
        for (let o = a.s; o <= a.e; o++) {
          const l = netRow(o);
          if (l.some((e) => null == e)) continue;
          const r = Math.min(...l);
          for (let e = 0; e < t; e++) n[e] += l[e] - r;
          const bestN = Math.min(...n);
          for (let pi = 0; pi < t; pi++) {
            const isDown = n[pi] - bestN >= 2,
              st = o + 1;
            (isDown &&
              !wasDown[pi] &&
              st <= a.e &&
              !s.find((x) => x.start === st && x.end === a.e && x.isPress) &&
              s.push({
                start: st,
                end: a.e,
                val: e.pressVal,
                label: `${a.label} Press H${hLbl(st)}`,
                pressBy: pi,
                isPress: !0,
              }),
              (wasDown[pi] = isDown));
          }
        }
      }));
  const n = e.nassauTeams && e.nassauTeamRoster && 2 === e.nassauTeamRoster.length,
    o = n ? e.nassauTeamRoster : null;
  return (
    s.forEach((e) => {
      if (n) {
        settleTeamSegment(e.start, e.end, o[0], o[1], e.val, a);
      } else {
        const s = Array(t).fill(0);
        for (let a = e.start; a <= e.end; a++) {
          const e = netRow(a);
          if (e.some((e) => null == e)) continue;
          const n = Math.min(...e),
            w = e.reduce((c, v, i) => (v === n ? [...c, i] : c), []);
          1 === w.length && s[w[0]]++;
        }
        const n = Math.max(...s),
          o = s.reduce((e, t, a) => (t === n && t > 0 ? [...e, a] : e), []);
        if (1 === o.length) {
          const w = o[0];
          for (let i = 0; i < t; i++) i !== w && ((a[w] += e.val), (a[i] -= e.val));
        }
      }
    }),
    (state._nassauBets = s),
    a
  );
}
function renderNassauDetail() {
  const e = state._nassauBets || [],
    t = state.players.length,
    g = state.gameOpts || {},
    tm = g.nassauTeams && g.nassauTeamRoster && 2 === g.nassauTeamRoster.length,
    ro = tm ? g.nassauTeamRoster : null;
  let a = '<div class="game-detail">';
  return (
    e.forEach((e) => {
      let status;
      if (tm) {
        let w0 = 0,
          w1 = 0,
          pl = 0;
        for (let h = e.start; h <= e.end; h++) {
          const ns = netRow(h);
          if (ns.some((v) => null == v)) continue;
          pl++;
          const b0 = Math.min(...ro[0].map((i) => ns[i])),
            b1 = Math.min(...ro[1].map((i) => ns[i]));
          b0 < b1 ? w0++ : b1 < b0 && w1++;
        }
        const nm0 = ro[0].map((i) => esc(state.players[i]?.name || "")).join(" & "),
          nm1 = ro[1].map((i) => esc(state.players[i]?.name || "")).join(" & "),
          d = w0 - w1;
        status =
          0 === pl
            ? "Not started"
            : 0 === d
              ? "All Square"
              : d > 0
                ? `${nm0} ${d} UP`
                : `${nm1} ${-d} UP`;
      } else {
        const s = Array(t).fill(0);
        let n = 0;
        for (let a = e.start; a <= e.end; a++) {
          const e = netRow(a);
          if (e.some((e) => null == e)) continue;
          n++;
          const o = Math.min(...e);
          for (let a = 0; a < t; a++) s[a] += e[a] - o;
        }
        const o = Math.min(...s),
          l = s.indexOf(o),
          r = s.filter((e) => e !== o).length ? Math.min(...s.filter((e) => e !== o)) - o : 0;
        status =
          0 === n
            ? "Not started"
            : 0 === r
              ? "All Square"
              : `${esc(state.players[l].name)} ${r > 0 ? r + " UP" : "leads"}`;
      }
      a += `<div class="detail-bet">\n      <span class="detail-label">${e.label} ($${e.val})</span>\n      <span class="detail-status">${status}</span>\n    </div>`;
    }),
    (a += "</div>"),
    a
  );
}
function calcSkinsMoney(o) {
  const e = state.players.length,
    t = o || state.gameOpts,
    a = calcSkins(t),
    s = a.reduce((e, t) => e + t, 0);
  return state.players.map((n, o) => a[o] * t.skinVal * (e - 1) - (s - a[o]) * t.skinVal);
}
function renderSkinsDetail() {
  const e = calcSkins(),
    t = state.gameOpts;
  let a = 0,
    s = '<div class="game-detail">' + skinsStripHTML();
  for (let e = 0; e <= state.currentHole; e++) {
    const s = netRow(e);
    if (s.some((e) => null == e)) {
      a++;
      continue;
    }
    const n = Math.min(...s);
    1 === s.filter((e) => e === n).length ? (a = 0) : t.carry && a++;
  }
  return (
    a > 0 &&
      (s += `<div class="detail-bet"><span class="detail-label">Carry Pot</span><span class="detail-status">${a + 1} skins on next hole ($${(a + 1) * t.skinVal * state.players.length})</span></div>`),
    state.players.forEach((t, a) => {
      s += `<div class="detail-bet"><span class="detail-label">${esc(t.name)}</span><span class="detail-status">${e[a]} skin${1 !== e[a] ? "s" : ""}</span></div>`;
    }),
    (s += "</div>"),
    s
  );
}
function calcMatchMoney() {
  const e = state.players.length,
    t = state.gameOpts,
    a = Array(e).fill(0);
  function s(e) {
    const t = netRow(e);
    if (t.some((e) => null == e)) return { result: "skip" };
    const a = Math.min(...t);
    return 1 === t.filter((e) => e === a).length
      ? { result: "win", winner: t.indexOf(a) }
      : { result: "tie" };
  }
  function n(t, n, o) {
    const l = Array(e).fill(0);
    for (let e = n; e <= o; e++) {
      const t = s(e);
      "win" === t.result && l[t.winner]++;
    }
    const r = Math.max(...l),
      i = l.reduce((e, t, a) => (t === r && t > 0 ? [...e, a] : e), []);
    if (1 === i.length) {
      const s = i[0];
      for (let n = 0; n < e; n++) n !== s && ((a[s] += t), (a[n] -= t));
    }
  }
  if ("nassau" === t.matchFormat) {
    const e = Math.min(8, maxHole() - 1);
    (n(t.matchFront, 0, e),
      maxHole() > 9 && n(t.matchBack, 9, maxHole() - 1),
      maxHole() > 9 && n(t.matchOverall, 0, maxHole() - 1),
      (state._matchPresses = [
        { start: 0, end: e, val: t.matchFront, label: maxHole() > 9 ? "Front 9" : "Match" },
        ...(maxHole() > 9
          ? [
              { start: 9, end: maxHole() - 1, val: t.matchBack, label: "Back 9" },
              { start: 0, end: maxHole() - 1, val: t.matchOverall, label: "Overall" },
            ]
          : []),
      ]));
  } else {
    const n = [{ start: 0, end: maxHole() - 1, val: t.holeVal, label: "Main Match" }];
    ((state.matchPresses || []).forEach((e, a) => {
      n.push({
        start: e.start,
        end: maxHole() - 1,
        val: t.matchPressVal,
        label: `Press #${a + 1} (${e.by}, H${hLbl(e.start)})`,
      });
    }),
      (state._matchPresses = n),
      n.forEach((t) => {
        for (let n = t.start; n <= t.end; n++) {
          const o = s(n);
          if ("win" === o.result)
            for (let s = 0; s < e; s++) s !== o.winner && ((a[o.winner] += t.val), (a[s] -= t.val));
        }
      }));
  }
  return a;
}
function closePressPicker(ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest("#press-picker")) return;
  const e = document.getElementById("press-picker");
  e && e.remove();
}
function pickPressPlayer(e, t) {
  if (!canMutateRound()) return;
  const a = state.players[t];
  (a &&
    (pushUndo(),
    state.matchPresses || (state.matchPresses = []),
    state.matchPresses.push({ start: e, by: a.name }),
    invalidateMoneyCache(),
    debouncedSave(),
    haptic(),
    renderHole()),
    closePressPicker());
}
function addMatchPress(e) {
  if (!canMutateRound()) return;
  (closePressPicker(), document.removeEventListener("click", closePressPicker));
  const l = document.createElement("div");
  ((l.id = "press-picker"),
    (l.className = "quick-picker"),
    l.setAttribute("role", "dialog"),
    l.setAttribute("aria-label", "Who is pressing?"),
    (l.innerHTML =
      '<div class="qp-label">Who is pressing? — from Hole ' +
      (e + 1) +
      '</div><div class="cp-grid">' +
      state.players
        .map(
          (t, a) =>
            '<button type="button" class="wolf-pick" data-act="pickPressPlayer(' +
            e +
            "," +
            a +
            ')">' +
            avatarHTML(t, 12) +
            esc(t.name) +
            "</button>",
        )
        .join("") +
      "</div>"),
    (l.onkeydown = (e) => {
      "Escape" === e.key && (e.preventDefault(), closePressPicker());
    }),
    document.body.appendChild(l),
    l.querySelector("button")?.focus(),
    setTimeout(() => document.addEventListener("click", closePressPicker, { once: !0 }), 10));
}
function removeMatchPress(e) {
  if (!canMutateRound()) return;
  (pushUndo(),
    state.matchPresses.splice(e, 1),
    invalidateMoneyCache(),
    debouncedSave(),
    renderHole());
}
function renderMatchDetail() {
  const e = state.players.length,
    t = state.gameOpts,
    a = state._matchPresses || [
      { start: 0, end: maxHole() - 1, val: t.holeVal, label: "Main Match" },
    ];
  let s = '<div class="game-detail">';
  return (
    a.forEach((t, a) => {
      const n = Array(e).fill(0),
        o = Array(e).fill(0);
      let l = 0,
        r = 0;
      const i = [];
      for (let a = t.start; a <= t.end; a++) {
        const t = netRow(a);
        if (t.some((e) => null == e)) continue;
        l++;
        const s = Math.min(...t);
        let c = null;
        if (1 === t.filter((e) => e === s).length) {
          ((c = t.indexOf(s)), n[c]++);
          for (let t = 0; t < e; t++) t === c ? o[t]++ : o[t]--;
        } else r++;
        i.push({ hole: a, winner: c, cum: [...o] });
      }
      const c = Array(e).fill(0);
      for (let a = t.start; a <= t.end; a++) {
        const s = netRow(a);
        if (s.some((e) => null == e)) continue;
        const n = Math.min(...s);
        if (1 === s.filter((e) => e === n).length) {
          const a = s.indexOf(n);
          for (let s = 0; s < e; s++) s !== a && ((c[a] += t.val), (c[s] -= t.val));
        }
      }
      s += `<div class="match-block ${0 === a ? "" : "press-block"}">\n      <div class="match-block-header">\n        <span class="match-block-title">${t.label}</span>\n        <span class="match-block-meta">$${t.val}/hole · H${t.start + 1}–${t.end + 1} · ${l} played${r ? ` · ${r} tied` : ""}</span>\n      </div>`;
      const d = state.players
        .map((e, t) => ({
          name: e.name,
          color: e.color,
          idx: t,
          wins: n[t],
          cum: o[t],
          money: c[t],
        }))
        .sort((e, t) => t.cum - e.cum);
      if (
        ((s += '<div class="match-block-players">'),
        d.forEach((e) => {
          const t = e.cum > 0 ? `${e.cum} UP` : e.cum < 0 ? `${Math.abs(e.cum)} DN` : "AS",
            a = e.cum > 0 ? "match-up" : e.cum < 0 ? "match-dn" : "match-as",
            n = e.money > 0.01 ? "match-up" : e.money < -0.01 ? "match-dn" : "match-as";
          s += `<div class="match-block-row">\n        ${avatarHTML(e, 8)}\n        <span class="mb-name">${esc(e.name)}</span>\n        <span class="mb-wins">${e.wins}W</span>\n        <span class="${a} mb-status">${t}</span>\n        <span class="${n} mb-money">${fmtMoney(e.money)}</span>\n      </div>`;
        }),
        (s += "</div>"),
        i.length > 0)
      ) {
        const e = i.slice(-9);
        ((s += '<div class="match-tl-grid mini">'),
          (s += '<div class="match-tl-row"><div class="match-tl-name"></div>'),
          e.forEach((e) => (s += `<div class="match-tl-hole">${e.hole + 1}</div>`)),
          (s += "</div>"),
          state.players.forEach((t, a) => {
            ((s += `<div class="match-tl-row"><div class="match-tl-name">${avatarHTML(t, 5)}${esc(t.name)}</div>`),
              e.forEach((e) => {
                const t = e.cum[a],
                  n = e.winner === a;
                s += `<div class="match-tl-cell ${n ? "tl-win" : t > 0 ? "tl-up" : t < 0 ? "tl-dn" : "tl-as"}">${n ? "●" : t > 0 ? "+" + t : 0 === t ? "·" : t}</div>`;
              }),
              (s += "</div>"));
          }),
          (s += "</div>"));
      }
      s += "</div>";
    }),
    (s += "</div>"),
    s
  );
}
function calcStablefordMoney() {
  const r = state.gameOpts,
    e0 = calcStableford(),
    e = r.quotaEnabled && Array.isArray(r.quotas) ? e0.map((e, t) => e - r.quotas[t]) : e0,
    t = r.ptVal,
    a = state.players.length;
  return state.players.map((s, n) => {
    let o = 0;
    for (let s = 0; s < a; s++) n !== s && (o += (e[n] - e[s]) * t);
    return o;
  });
}
function renderStablefordDetail() {
  const e = calcStableford();
  let t = '<div class="game-detail">';
  state.players
    .map((t, a) => ({ name: t.name, pts: e[a], color: t.color }))
    .sort((e, t) => t.pts - e.pts)
    .forEach((e, a) => {
      t += `<div class="detail-bet"><span class="detail-label">${0 === a ? "" : ""}${esc(e.name)}</span><span class="detail-status">${e.pts} pts</span></div>`;
    });
  const a = state.currentHole,
    s = netRow(a);
  return (
    s.some((e) => null == e) ||
      ((t +=
        '<div class="detail-bet" style="margin-top:4px;border-top:1px solid var(--rule);padding-top:4px"><span class="detail-label">This Hole</span><span class="detail-status">'),
      (t += state.players
        .map((e, t) => {
          const n = s[t] - state.pars[a],
            o = n <= -3 ? 8 : -2 === n ? 5 : -1 === n ? 2 : 0 === n ? 0 : 1 === n ? -1 : -3;
          return `${esc(e.name)}: ${o > 0 ? "+" : ""}${o}`;
        })
        .join(" | ")),
      (t += "</span></div>")),
    (t += "</div>"),
    t
  );
}
function setBanker(h, unit) {
  if (!canMutateRound()) return;
  pushUndo();
  state.bankerHoles || (state.bankerHoles = {});
  state.bankerHoles[h] = unit;
  invalidateMoneyCache();
  debouncedSave();
  renderHole();
}
function clearBanker(h) {
  if (!canMutateRound()) return;
  pushUndo();
  state.bankerHoles && delete state.bankerHoles[h];
  invalidateMoneyCache();
  debouncedSave();
  renderHole();
}
function _bankerPressRec(h) {
  state.bankerPresses || (state.bankerPresses = {});
  const r = state.bankerPresses[h] || (state.bankerPresses[h] = { group: 0, units: {} });
  return (r.units || (r.units = {}), r);
}
function pressBankerGroup(h) {
  if (!canMutateRound()) return;
  if (null == bankerForHole(h)) return;
  pushUndo();
  const r = _bankerPressRec(h);
  r.group = r.group ? 0 : 1;
  invalidateMoneyCache();
  debouncedSave();
  renderHole();
}
function pressBankerUnit(h, ti) {
  if (!canMutateRound()) return;
  const bt = bankerForHole(h);
  if (null == bt || ti === bt) return;
  pushUndo();
  const r = _bankerPressRec(h);
  r.units[ti] = r.units[ti] ? 0 : 1;
  invalidateMoneyCache();
  debouncedSave();
  renderHole();
}
function renderBankerDetail() {
  const teams = getBankerTeams(),
    teamMode = !!(state.gameOpts && state.gameOpts.bankerTeams),
    v = state.gameOpts.bankerVal || 2,
    h = state.currentHole,
    bt = bankerForHole(h),
    unitShort = (i) =>
      teamMode ? "Team " + (i + 1) : esc(state.players[teams[i][0]].name.split(" ")[0]),
    unitFull = (i) => teams[i].map((p) => esc(state.players[p].name)).join(" & ");
  let t = '<div class="game-detail">';
  if (null == bt)
    return (
      (t += `<div class="detail-bet"><span class="detail-label">Banker — Hole ${hLbl(h)}</span><span class="detail-status">Pick a banker to start</span></div></div>`),
      t
    );
  t += `<div class="detail-bet"><span class="detail-label">Banker — Hole ${hLbl(h)}</span><span class="detail-status">${unitFull(bt)}</span></div>`;
  const bn = bankerTeamNet(teams[bt], h);
  if (null == bn)
    t +=
      '<div class="detail-bet"><span class="detail-label">This hole</span><span class="detail-status">Awaiting scores</span></div>';
  else
    teams.forEach((team, ti) => {
      if (ti === bt) return;
      const tn = bankerTeamNet(team, h);
      let st;
      if (null == tn) st = "—";
      else {
        let w = 0;
        bn < tn ? (w = 1) : bn > tn && (w = -1);
        if (0 === w) st = "Push";
        else {
          const mult = bankerMatchMult(h, ti, teams[bt], team),
            amt = v * mult;
          st = (1 === w ? "Banker" : unitShort(ti)) + " +$" + amt + (mult > 1 ? ` (${mult}×)` : "");
        }
      }
      t += `<div class="detail-bet"><span class="detail-label">vs ${unitFull(ti)}</span><span class="detail-status">${st}</span></div>`;
    });
  t += "</div>";
  return t;
}
function calcBonusMoney(o) {
  const e = state.players.length,
    _o = o || state.gameOpts,
    t = null != _o.val ? _o.val : "bingo" === state.gameType ? _o.ptVal : _o.dotVal,
    _cats = _o.cats || null,
    a = state.players.map((e, t) => {
      let a = 0;
      for (let e = 0; e < maxHole(); e++)
        a += _cats ? getBonusCountIn(t, e, _cats) : getBonusCount(t, e);
      return a;
    });
  return state.players.map((s, n) => {
    let o = 0;
    for (let s = 0; s < e; s++) n !== s && (o += (a[n] - a[s]) * t);
    return o;
  });
}
function calcSnakeMoney(o) {
  const e = state.players.length,
    a = Array(e).fill(0),
    t = (o || state.gameOpts).potVal;
  let s = -1;
  for (let a = 0; a < maxHole(); a++)
    for (let t = 0; t < e; t++) isBonusAwarded(t, a, 0) && (s = t);
  if (-1 === s) return a;
  for (let n = 0; n < e; n++) n !== s && ((a[s] -= t), (a[n] += t));
  return a;
}
function renderBonusDetail() {
  const e = "bingo" === state.gameType ? "Points" : "Dots",
    t = state.players.map((e, t) => {
      let a = 0;
      for (let e = 0; e < maxHole(); e++) a += getBonusCount(t, e);
      return a;
    });
  let a = '<div class="game-detail">';
  return (
    state.players.forEach((s, n) => {
      a += `<div class="detail-bet"><span class="detail-label">${esc(s.name)}</span><span class="detail-status">${t[n]} ${e.toLowerCase()}</span></div>`;
    }),
    (a += "</div>"),
    a
  );
}
function renderSnakeDetail() {
  const e = state.players.map((e, t) => {
    let a = 0;
    for (let e = 0; e < maxHole(); e++) isBonusAwarded(t, e, 0) && a++;
    return a;
  });
  let t = -1;
  for (let e = 0; e < maxHole(); e++)
    for (let a = 0; a < state.players.length; a++) isBonusAwarded(a, e, 0) && (t = a);
  let a = '<div class="game-detail">';
  return (
    (a += `<div class="detail-bet"><span class="detail-label">Holding the Snake</span><span class="detail-status">${t >= 0 ? esc(state.players[t].name) : "Nobody yet"}</span></div>`),
    state.players.forEach((t, s) => {
      a += `<div class="detail-bet"><span class="detail-label">${esc(t.name)}</span><span class="detail-status">${e[s]} 3-putt${1 !== e[s] ? "s" : ""}</span></div>`;
    }),
    (a += "</div>"),
    a
  );
}
function renderSixesDetail() {
  if (4 !== state.players.length)
    return '<div class="game-detail"><div class="hint">Sixes requires exactly 4 players.</div></div>';
  const e = [
      [
        [0, 1],
        [2, 3],
      ],
      [
        [0, 2],
        [1, 3],
      ],
      [
        [0, 3],
        [1, 2],
      ],
    ],
    t = Math.floor(maxHole() / 3);
  let a = '<div class="game-detail">';
  return (
    e.forEach((e, s) => {
      const n = s * t,
        o = 2 === s ? maxHole() - 1 : n + t - 1,
        l = e[0].map((e) => esc(state.players[e].name)).join(" & "),
        r = e[1].map((e) => esc(state.players[e].name)).join(" & ");
      a += `<div class="detail-bet"><span class="detail-label">Holes ${hLbl(n)}-${hLbl(o)}</span><span class="detail-status">${l} vs ${r}</span></div>`;
    }),
    (a += "</div>"),
    a
  );
}
function getWolfTeams(e) {
  const t = [e.wolf, ...(e.partners || [])],
    a = [];
  for (let e = 0; e < state.players.length; e++) t.includes(e) || a.push(e);
  return { wolfPack: t, field: a, isLone: !e.partners || 0 === e.partners.length };
}
function calcWolfMoney() {
  const e = state.players.length,
    t = state.gameOpts,
    a = Array(e).fill(0);
  for (let s = 0; s < maxHole(); s++) {
    const n = netRow(s);
    const o = state.wolfHoles[s];
    if (!o) continue;
    if (o.conceded) {
      const cd = (o.hammers || 0) > 0 ? Math.pow(2, o.hammers) : 1;
      if (o.fixedPairs && state.pairings) {
        if (void 0 === o.allyTeams) continue;
        const wt = [o.wolfTeam, ...(o.allyTeams || [])],
          lt = [];
        for (let k = 0; k < state.pairings.length; k++) wt.includes(k) || lt.push(k);
        const pk = wt.flatMap((k) => state.pairings[k]),
          fd = lt.flatMap((k) => state.pairings[k]);
        if (!fd.length) continue;
        const cc = 0 === (o.allyTeams || []).length && t.lone2x ? 2 : 1,
          uu = "wolf" === o.conceded ? -1 : 1,
          vv = cc * cd * t.wolfVal;
        pk.forEach((p) => {
          fd.forEach((f) => {
            ((a[p] += uu * vv), (a[f] -= uu * vv));
          });
        });
        continue;
      }
      if (null != o.shuck) {
        const sh = o.shuck,
          ot = state.players.map((x, k) => k).filter((k) => k !== sh),
          uu = "wolf" === o.conceded ? -1 : 1,
          pp = 2 * cd;
        ot.forEach((k) => {
          ((a[sh] += uu * t.wolfVal * pp), (a[k] -= uu * t.wolfVal * pp));
        });
        continue;
      }
      if (void 0 === o.partners) continue;
      const {
        wolfPack: pk,
        field: fd,
        isLone: il,
      } = getWolfTeams(
        o,
      ); /* A hole needs somebody on both sides. With a 2-player roster the wolf can
   take the only opponent as partner, leaving the field empty -- and a concede
   then charged BOTH players with nobody to collect, destroying the pot
   ($10 vanished on a 2-player $5 hole). The fixed-pairs paths already guarded
   this; the ordinary ones did not. */
      if (!pk.length || !fd.length) continue;
      const cc = o.blind ? 3 : o.blindPick || (il && t.lone2x) ? 2 : 1,
        base = cc * cd * t.wolfVal,
        uu = "wolf" === o.conceded ? -1 : 1;
      if (il)
        pk.forEach((p) => {
          fd.forEach((f) => {
            ((a[p] += uu * base), (a[f] -= uu * base));
          });
        });
      else {
        const W = uu > 0 ? pk : fd,
          L = uu > 0 ? fd : pk,
          sm = (null != t.wolfTeamVal ? t.wolfTeamVal : t.wolfVal) * cc * cd,
          lg = (null != t.fieldVal ? t.fieldVal : t.wolfVal) * cc * cd,
          st = L.length < W.length ? sm : lg,
          P = L.length * st,
          /* Split the losers' pot across the winners, odd unit to the lowest-index
   winners. The unit is a whole dollar while the pot is whole dollars (the
   intended behaviour -- golfers settle in dollars), but this used to floor to
   dollars unconditionally and then treat the leftover DOLLARS as a COUNT of
   players, which invented money on any fractional stake: $2.50/point with 2
   winners and 3 losers paid out $8 against $7.50 collected. A fractional pot
   now splits in cents, so it stays exactly zero-sum for any stake. */
          un = Number.isInteger(P) ? 1 : 0.01,
          tot = Math.round(P / un),
          per = Math.floor(tot / W.length),
          rem = tot - per * W.length;
        (L.forEach((p) => {
          a[p] -= st;
        }),
          W.forEach((p, ix) => {
            a[p] += (per + (ix < rem ? 1 : 0)) * un;
          }));
      }
      continue;
    }
    if (n.some((e) => null == e)) continue;
    if (o.fixedPairs && state.pairings) {
      if (void 0 === o.allyTeams) continue;
      const e = [o.wolfTeam, ...(o.allyTeams || [])],
        l = [];
      for (let t = 0; t < state.pairings.length; t++) e.includes(t) || l.push(t);
      const r = e.flatMap((e) => state.pairings[e]),
        i = l.flatMap((e) => state.pairings[e]);
      if (!i.length) continue;
      const c = 0 === (o.allyTeams || []).length && t.lone2x ? 2 : 1,
        d = (o.hammers || 0) > 0 ? Math.pow(2, o.hammers) : 1,
        m = Math.min(...r.map((e) => n[e])),
        p = Math.min(...i.map((e) => n[e])),
        u = m < p ? 1 : m > p ? -1 : 0,
        h =
          u > 0
            ? Math.min(...r.map((e) => state.scores[e]?.[s] ?? 99))
            : u < 0
              ? Math.min(...i.map((e) => state.scores[e]?.[s] ?? 99))
              : null,
        g = null != h ? h - state.pars[s] : 0,
        v = c * d * (g <= -2 ? 3 : -1 === g ? 2 : 1) * t.wolfVal;
      r.forEach((e) => {
        i.forEach((t) => {
          ((a[e] += u * v), (a[t] -= u * v));
        });
      });
      continue;
    }
    if (null != o.shuck) {
      const e = o.shuck,
        l = state.players.map((e, t) => t).filter((t) => t !== e),
        r = n[e],
        i = Math.min(...l.map((e) => n[e])),
        c = r < i ? 1 : r > i ? -1 : 0,
        d = (o.hammers || 0) > 0 ? Math.pow(2, o.hammers) : 1,
        m =
          (0 !== c
            ? c > 0
              ? (state.scores[e]?.[s] ?? 99)
              : Math.min(...l.map((k) => state.scores[k]?.[s] ?? 99))
            : 99) - state.pars[s],
        p = 2 * d * (0 !== c ? (m <= -2 ? 3 : -1 === m ? 2 : 1) : 1);
      l.forEach((s) => {
        ((a[e] += c * t.wolfVal * p), (a[s] -= c * t.wolfVal * p));
      });
      continue;
    }
    if (void 0 === o.partners) continue;
    const { wolfPack: l, field: r, isLone: i } = getWolfTeams(o);
    if (!l.length || !r.length) continue;
    const c = o.blind ? 3 : o.blindPick || (i && t.lone2x) ? 2 : 1,
      d = (o.hammers || 0) > 0 ? Math.pow(2, o.hammers) : 1,
      m = Math.min(...l.map((e) => n[e])),
      p = Math.min(...r.map((e) => n[e])),
      u = m < p ? 1 : m > p ? -1 : 0,
      h = Math.min(...l.map((e) => state.scores[e]?.[s] ?? 99)),
      g = Math.min(...r.map((e) => state.scores[e]?.[s] ?? 99)),
      v = u > 0 ? h : u < 0 ? g : null,
      f = null != v ? v - state.pars[s] : 0,
      y = f <= -2 ? 3 : -1 === f ? 2 : 1,
      b = c * d * y,
      $ = l.length,
      w = r.length,
      H = e >= 5 && $ !== w && !i;
    if (i)
      l.forEach((e) => {
        r.forEach((s) => {
          ((a[e] += u * t.wolfVal * b), (a[s] -= u * t.wolfVal * b));
        });
      });
    else if (0 !== u) {
      const W = u > 0 ? l : r,
        L = u > 0 ? r : l,
        sm = (null != t.wolfTeamVal ? t.wolfTeamVal : t.wolfVal) * b,
        lg = (null != t.fieldVal ? t.fieldVal : t.wolfVal) * b,
        st = L.length < W.length ? sm : lg,
        P = L.length * st,
        /* Split the losers' pot across the winners, odd unit to the lowest-index
   winners. The unit is a whole dollar while the pot is whole dollars (the
   intended behaviour -- golfers settle in dollars), but this used to floor to
   dollars unconditionally and then treat the leftover DOLLARS as a COUNT of
   players, which invented money on any fractional stake: $2.50/point with 2
   winners and 3 losers paid out $8 against $7.50 collected. A fractional pot
   now splits in cents, so it stays exactly zero-sum for any stake. */
        un = Number.isInteger(P) ? 1 : 0.01,
        tot = Math.round(P / un),
        per = Math.floor(tot / W.length),
        rem = tot - per * W.length;
      (L.forEach((p) => {
        a[p] -= st;
      }),
        W.forEach((p, ix) => {
          a[p] += (per + (ix < rem ? 1 : 0)) * un;
        }));
    }
  }
  return a;
}
function renderWolfDetail() {
  const e = state.players.length,
    t = state.currentHole;
  let a = '<div class="game-detail">';
  const s = getWolfForHole(t);
  a += `<div class="detail-bet"><span class="detail-label">Wolf Rotation</span><span class="detail-status">${state.players.map((e, t) => (t === s ? `<span class="wolf-rot-current">${esc(e.name)}</span>` : esc(e.name))).join(" · ")}</span></div>${t + 1 < maxHole() ? `<div class="detail-bet"><span class="detail-label">Up Next</span><span class="detail-status"><span class="wolf-rot-next">${esc(state.players[getWolfForHole(t + 1)].name)}</span></span></div>` : ""}`;
  let n = Array(e).fill(0),
    o = 0,
    l = 0,
    r = 0,
    i = 0;
  for (let e = 0; e < maxHole(); e++) {
    const t = netRow(e);
    if (t.some((e) => null == e)) continue;
    const a = state.wolfHoles[e];
    if (!a || void 0 === a.partners) continue;
    const { wolfPack: s, field: c, isLone: d } = getWolfTeams(a),
      m = a.hammers || 0;
    r += m;
    const p =
      (a.blind ? 3 : d && state.gameOpts.lone2x ? 2 : 1) *
      (m > 0 ? Math.pow(2, m) : 1) *
      state.gameOpts.wolfVal;
    p > i && (i = p);
    (Math.min(...s.map((e) => t[e])) < Math.min(...c.map((e) => t[e])) &&
      (s.forEach((e) => n[e]++), d && o++),
      d && l++);
  }
  return (
    state.players.forEach((e, t) => {
      a += `<div class="detail-bet"><span class="detail-label">${esc(e.name)}</span><span class="detail-status">${n[t]} hole wins</span></div>`;
    }),
    l > 0 &&
      (a += `<div class="detail-bet"><span class="detail-label">Lone Wolf</span><span class="detail-status">${o}/${l} successful</span></div>`),
    r > 0 &&
      (a += `<div class="detail-bet"><span class="detail-label">Hammers</span><span class="detail-status">${r} total · Max: $${i}/pt</span></div>`),
    (a += "</div>"),
    a
  );
}
function calcVegasMoney() {
  const e = state.players.length,
    t = state.gameOpts,
    a = Array(e).fill(0),
    s = t.vegasTeams || [
      [0, 1],
      [2, 3],
    ];
  if (s.length < 2)
    return a; /* The default pairing assumes four players. On a shorter roster the missing
   seats made every combined number NaN, which spread to every payout and got
   persisted, and writing to a[2]/a[3] grew the result past the roster. Setup
   already refuses a Vegas round without exactly four, but a stored round whose
   roster no longer matches still reaches this. Settle nothing instead. */
  if (
    s
      .slice(0, 2)
      .some(
        (tm) =>
          !Array.isArray(tm) ||
          tm.length < 2 ||
          tm.some((i) => !Number.isInteger(i) || i < 0 || i >= e),
      )
  )
    return a;
  for (let e = 0; e < maxHole(); e++) {
    const n = netRow(e);
    if (n.some((e) => null == e)) continue;
    const o = s.map((e) => {
      const t = n[e[0]],
        a = n[e[1]];
      return 10 * Math.min(t, a) + Math.max(t, a);
    });
    if (t.vegasFlip) {
      const t = state.pars[e];
      for (let e = 0; e < s.length; e++) {
        if (s[e].some((e) => n[e] < t)) {
          const t = 0 === e ? 1 : 0,
            a = n[s[t][0]],
            l = n[s[t][1]],
            r = Math.min(a, l),
            i = Math.max(a, l);
          o[t] = 10 * i + r;
        }
      }
    }
    const l = o[0] - o[1];
    (s[0].forEach((e) => {
      a[e] -= (l * t.vegasVal) / s[0].length;
    }),
      s[1].forEach((e) => {
        a[e] += (l * t.vegasVal) / s[1].length;
      }));
  }
  return a;
}
function renderVegasDetail() {
  const e = state.gameOpts.vegasTeams || [
      [0, 1],
      [2, 3],
    ],
    t = state.currentHole;
  let a = '<div class="game-detail">';
  e.length >= 2 &&
    ((a +=
      '<div class="detail-bet"><span class="detail-label">Team 1</span><span class="detail-status">' +
      e[0].map((e) => esc(state.players[e]?.name || "?")).join(" & ") +
      "</span></div>"),
    (a +=
      '<div class="detail-bet"><span class="detail-label">Team 2</span><span class="detail-status">' +
      e[1].map((e) => esc(state.players[e]?.name || "?")).join(" & ") +
      "</span></div>"));
  const s = state.players.map((e, a) => state.scores[a]?.[t]);
  return (
    !s.some((e) => null == e) &&
      e.length >= 2 &&
      e.forEach((e, t) => {
        const n = s[e[0]],
          o = s[e[1]],
          l = Math.min(n, o),
          r = Math.max(n, o);
        a +=
          '<div class="detail-bet"><span class="detail-label">Team ' +
          (t + 1) +
          ' Number</span><span class="detail-status" style="font-size:1.05rem;font-weight:700">' +
          (10 * l + r) +
          "</span></div>";
      }),
    (a += "</div>"),
    a
  );
}
function calcSkins(o) {
  o = o || state.gameOpts;
  const e = state.players.length,
    t = Array(e).fill(0);
  let a = 0,
    hadNull = !1,
    lastLeaders = null;
  for (let e = 0; e < maxHole(); e++) {
    const s = netRow(e);
    if (s.some((e) => null == e)) {
      ((hadNull = !0), (a += o.carry ? 1 : 0));
      continue;
    }
    const n = Math.min(...s),
      w = s.reduce((c, v, i) => (v === n ? [...c, i] : c), []);
    1 === w.length
      ? ((t[w[0]] += 1 + (o.carry ? a : 0)), (a = 0))
      : ((a += o.carry ? 1 : 0), (lastLeaders = w));
  }
  if (o.carry && a > 0 && !hadNull && lastLeaders && lastLeaders.length)
    lastLeaders.forEach((i) => {
      t[i] += a / lastLeaders.length;
    });
  return t;
} /* Holes outside, players inside: the old order asked for one net score per
   player per hole, so it rebuilt the same hole's row once for every player.
   Same points, same order of operations, one row lookup per hole. */
function calcStableford() {
  const np = state.players.length,
    nh = maxHole(),
    out = Array(np).fill(0);
  for (let k = 0; k < nh; k++) {
    const row = netRow(k),
      par = state.pars[k];
    for (let i = 0; i < np; i++) {
      const s = row[i];
      if (null == s) continue;
      const n = s - par;
      n <= -3
        ? (out[i] += 8)
        : -2 === n
          ? (out[i] += 5)
          : -1 === n
            ? (out[i] += 2)
            : 0 === n
              ? (out[i] += 0)
              : (out[i] -= 1 === n ? 1 : 3);
    }
  }
  return out;
}
function strokesData() {
  const h = getPlayingHandicaps();
  return state.players.map((p, i) => {
    const c = h[i],
      singles = [],
      doubles = [];
    for (let k = 0; k < maxHole(); k++) {
      const s = getStrokesOnHole(c, k);
      2 === s ? doubles.push(k + 1) : 1 === s && singles.push(k + 1);
    }
    return { player: p, name: p.name, h: c, singles, doubles };
  });
}
