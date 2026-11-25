/* Haymarket -- a Chicago-style quota game.

   Each player's quota is 39 minus their course handicap (on a nine, 20 minus
   the nine's course handicap). Gross points per hole: bogey 1, par 2, birdie
   4, eagle or better 8, anything worse 0. Mid-round the quota is pro-rated
   by holes played, so the standings read as "on pace".

   The money is the pot and nothing more: every player's buy-in, paid out
   exactly once. Whoever beats their quota by the most takes half the pot --
   the most anyone can win, Greenies and Kennys included. The other half is
   second place's: it pays every Greenie and Kenny won by anyone outside first
   place, and second place keeps what is left. Ties split their place's half.

   Par 3s carry a Greenie (closest to the pin and makes par) and a Kenny
   (furthest from the hole and makes par). A par 3 finished with no
   qualifying winner carries its value to the next par 3, Greenie and Kenny
   separately. The last par 3 always has a
   winner: whoever the group picks takes it, par or not, with everything that
   carried in. The picks live in bonusPoints under their own keys, so undo,
   saved rounds and live rounds carry them the way they carry junk. */
// The bonusPoints keys: "hmG" is a Greenie, "hmK" a Kenny.
function isHaymarketKey(k) {
  return "hmG" === k || "hmK" === k;
}
function haymarketBase(r) {
  return 9 === r.holeCount ? 20 : 39;
}
// Base minus the full course handicap (no allowance) on the round's tees.
// Haymarket is always played off handicaps, so the scratch mode is ignored.
function haymarketQuotas(r) {
  r = r || state;
  const base = haymarketBase(r),
    go = r.gameOpts || {},
    rr = Object.assign({}, r, {
      gameOpts: Object.assign({}, go, { strokeRule: Math.max(STROKE_RULE, go.strokeRule || 0) }),
    });
  return (r.players || []).map((p) => base - roundHcp(courseHandicapExact(rr, p)));
}
function haymarketHolePoints(gross, par) {
  if (null == gross) return 0;
  const d = gross - par;
  return d <= -2 ? 8 : -1 === d ? 4 : 0 === d ? 2 : 1 === d ? 1 : 0;
}
function haymarketStandings() {
  const nh = maxHole(),
    q = haymarketQuotas(state);
  return state.players.map((p, i) => {
    let pts = 0,
      played = 0;
    for (let h = 0; h < nh; h++) {
      const g = state.scores[i]?.[h];
      null != g && (played++, (pts += haymarketHolePoints(g, state.pars[h])));
    }
    const pace = nh ? (q[i] * played) / nh : 0;
    return { i, pts, played, quota: q[i], pace, diff: pts - pace };
  });
}
// First and second place, each a list of player indexes (ties share a place).
function haymarketPlaces(st) {
  const eq = (a, b) => Math.abs(a - b) < 1e-9,
    best = Math.max(...st.map((s) => s.diff)),
    first = st.filter((s) => eq(s.diff, best)).map((s) => s.i),
    rest = st.filter((s) => !first.includes(s.i)),
    next = rest.length ? Math.max(...rest.map((s) => s.diff)) : null,
    second = rest.filter((s) => eq(s.diff, next)).map((s) => s.i);
  return { first, second };
}
function haymarketPotWinners(st) {
  return st.some((s) => s.played) ? haymarketPlaces(st).first : [];
}
// Whose half pays the Greenies and Kennys: second place, or -- with everyone
// tied for first -- the whole (tied) field.
function haymarketPayers(st) {
  if (!st.length) return [];
  const pl = haymarketPlaces(st);
  return pl.second.length ? pl.second : pl.first;
}
function bonusHolder(h, key) {
  if (!state.bonusPoints) return -1;
  for (let i = 0; i < state.players.length; i++) if (isBonusAwarded(i, h, key)) return i;
  return -1;
}
function haymarketLastPar3() {
  for (let h = maxHole() - 1; h >= 0; h--) if (3 === +state.pars[h]) return h;
  return -1;
}
/* Every par 3 in order, with what its Greenie and Kenny are worth (the
   hole's own value plus whatever carried in) and who won them. A pick only
   wins if that player made par, except on the last par 3, where the pick
   always stands. A hole passes its value on only once everyone has a score
   on it, so the hole being played never looks like it carried. */
function haymarketPar3Log() {
  const o = state.gameOpts || {},
    last = haymarketLastPar3(),
    out = [];
  let carryG = 0,
    carryK = 0;
  for (let h = 0; h < maxHole(); h++) {
    if (3 !== +state.pars[h]) continue;
    const isLast = h === last,
      done = !state.players.some((p, i) => null == state.scores[i]?.[h]),
      judge = (key) => {
        const p = bonusHolder(h, key),
          g = p >= 0 ? state.scores[p]?.[h] : null,
          made = null != g && g <= state.pars[h];
        return {
          pick: p,
          win: p >= 0 && (isLast || made) ? p : -1,
          void: p >= 0 && !isLast && null != g && !made,
        };
      },
      G = judge("hmG"),
      K = judge("hmK"),
      rec = {
        h,
        done,
        isLast,
        greenie: G.win,
        greeniePick: G.pick,
        greenieVoid: G.void,
        kenny: K.win,
        kennyPick: K.pick,
        kennyVoid: K.void,
        greeniePot: (+stakeAt(o, "greenieVal", h) || 0) + carryG,
        kennyPot: (+stakeAt(o, "kennyVal", h) || 0) + carryK,
        greenieCarryIn: carryG,
        kennyCarryIn: carryK,
      };
    G.win >= 0 ? (carryG = 0) : done && (carryG = rec.greeniePot);
    K.win >= 0 ? (carryK = 0) : done && (carryK = rec.kennyPot);
    rec.greenieCarryOut = carryG;
    rec.kennyCarryOut = carryK;
    out.push(rec);
  }
  return out;
}
// The last par 3 if it is still missing a Greenie or Kenny winner, else -1.
function haymarketMissingFinalPick() {
  const log = haymarketPar3Log(),
    r = log[log.length - 1];
  return r && ((r.greeniePot > 0 && r.greenie < 0) || (r.kennyPot > 0 && r.kenny < 0)) ? r.h : -1;
}
/* How the pot is paid out, as it stands now. `recv` is what each player
   takes home (their buy-in is already in the pot); `awards` is each Greenie
   and Kenny with what it actually paid. First place's half is fixed, so a
   Greenie or Kenny won by first place pays nothing extra. Second place's half
   pays the rest in hole order and can never go below zero. */
function haymarketPayout() {
  const n = state.players.length,
    st = haymarketStandings(),
    buy = +(state.gameOpts || {}).buyIn || 0,
    pot = buy * n,
    half = pot / 2,
    recv = Array(n).fill(0),
    pl = st.length ? haymarketPlaces(st) : { first: [], second: [] },
    first = pl.first,
    second = pl.second.length ? pl.second : first,
    awards = [];
  haymarketPar3Log().forEach((r) => {
    r.greenie >= 0 && awards.push({ h: r.h, kind: "Greenie", p: r.greenie, v: r.greeniePot });
    r.kenny >= 0 && awards.push({ h: r.h, kind: "Kenny", p: r.kenny, v: r.kennyPot });
  });
  let left = half;
  first.forEach((i) => (recv[i] += half / first.length));
  awards.forEach((a) => {
    a.toFirst = first.includes(a.p);
    a.paid = a.toFirst ? 0 : Math.min(a.v, left);
    left -= a.paid;
    recv[a.p] += a.paid;
  });
  second.forEach((i) => (recv[i] += left / second.length));
  return { pot, half, buy, first, second, awards, left, recv, started: st.some((s) => s.played) };
}
function calcHaymarketMoney() {
  const n = state.players.length;
  if (n < 2) return Array(n).fill(0);
  const po = haymarketPayout();
  return po.started ? po.recv.map((v) => v - po.buy) : Array(n).fill(0);
}
// Tap a player to give them the hole's Greenie or Kenny; tap them again to clear it.
function setHaymarketAward(h, key, p) {
  if (!canMutateRound() || !isHaymarketKey(key)) return;
  pushUndo();
  haptic();
  const cur = bonusHolder(h, key);
  state.bonusPoints || (state.bonusPoints = {});
  state.players.forEach((pl, i) => {
    const r = getBonusRecord(i, h);
    r && delete r[key];
  });
  if (p !== cur && Number.isInteger(p) && p >= 0 && p < state.players.length) {
    state.bonusPoints[p] || (state.bonusPoints[p] = {});
    let s = state.bonusPoints[p][h];
    (s && "object" == typeof s) || ((s = {}), (state.bonusPoints[p][h] = s));
    s[key] = !0;
  }
  invalidateMoneyCache();
  debouncedSave();
  renderHole();
}
function _hmNum(v) {
  const r = Math.round(10 * v) / 10;
  return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r);
}
// The Greenie and Kenny pickers, shown on par 3s only.
function haymarketHoleHTML(h) {
  if (3 !== +state.pars[h] || state.players.length < 2) return "";
  const rec = haymarketPar3Log().find((r) => r.h === h);
  if (!rec) return "";
  const payers = haymarketPayers(haymarketStandings()),
    payBy = "from 2nd place’s half: " + payers.map((i) => esc(state.players[i].name)).join(" & "),
    lastNote =
      "Last par 3 — there’s always a winner. Pick who takes it; everything carrying goes with it.",
    voidNote = (i, what) =>
      `${esc(state.players[i].name)} didn’t make par — no ${what}, so it carries to the next par 3.`,
    block = (key, title, rule, pot, carryIn, holder, note) =>
      `<div class="wolf-section hm-award" data-award="${key}"><div class="wolf-header">${title}: <strong>$${pot}</strong> <span class="wolf-hole-num">${payBy}</span></div><div class="wolf-pick-label">${rule}${carryIn > 0 ? ` · includes $${carryIn} carried over` : ""}</div><div class="wolf-choices">${state.players
        .map(
          (pl, pi) =>
            `<button class="wolf-pick ${pi === holder ? "selected" : ""}" aria-pressed="${pi === holder ? "true" : "false"}" data-act="setHaymarketAward(${h},'${key}',${pi})">${avatarHTML(pl, 10)}${esc(pl.name)}${pi === holder ? " " + ico("check") : ""}</button>`,
        )
        .join("")}</div><div class="hint" style="margin-top:6px">${note}</div></div>`;
  return (
    block(
      "hmG",
      "Greenie",
      "Closest to the pin and makes par",
      rec.greeniePot,
      rec.greenieCarryIn,
      rec.greeniePick,
      rec.isLast
        ? lastNote
        : rec.greenieVoid
          ? voidNote(rec.greeniePick, "Greenie")
          : "Closest didn’t make par? Leave it blank and it carries to the next par 3.",
    ) +
    block(
      "hmK",
      "Kenny",
      "Furthest from the hole and makes par",
      rec.kennyPot,
      rec.kennyCarryIn,
      rec.kennyPick,
      rec.isLast
        ? lastNote
        : rec.kennyVoid
          ? voidNote(rec.kennyPick, "Kenny")
          : "No one made par? Leave it blank and it carries to the next par 3.",
    )
  );
}
function _hm$(v) {
  const r = Math.round(100 * v) / 100;
  return "$" + (r % 1 ? r.toFixed(2) : r);
}
function renderHaymarketDetail() {
  const st = haymarketStandings(),
    po = haymarketPayout(),
    allDone = st.every((s) => s.played === maxHole()),
    log = haymarketPar3Log(),
    last = log.length ? log[log.length - 1] : null,
    names = (ix) => ix.map((i) => esc(state.players[i].name)).join(" & "),
    // What 2nd's half paid to other players; 2nd's own Greenies/Kennys stay in its take.
    paidOut = po.awards.reduce((a, x) => a + (po.second.includes(x.p) ? 0 : x.paid), 0);
  let t = '<div class="game-detail">';
  t += `<div class="detail-bet"><span class="detail-label">Pot</span><span class="detail-status">${_hm$(po.pot)} · 1st ${_hm$(po.half)} · 2nd ${_hm$(po.half)} less Greenies/Kennys</span></div>`;
  po.started &&
    ((t += `<div class="detail-bet"><span class="detail-label">${allDone ? "1st" : "1st now"}</span><span class="detail-status">${names(po.first)} · ${_hm$(po.half)}</span></div>`),
    (t += `<div class="detail-bet"><span class="detail-label">${allDone ? "2nd" : "2nd now"}</span><span class="detail-status">${names(po.second)} · ${_hm$(po.half - paidOut)}${paidOut ? ` (${_hm$(po.half)} − ${_hm$(paidOut)} Greenies/Kennys to others)` : ""}</span></div>`));
  st.slice()
    .sort((a, b) => b.diff - a.diff)
    .forEach((s) => {
      const p = state.players[s.i],
        vs = s.played === maxHole() ? "vs quota" : "on pace";
      t += `<div class="detail-bet"><span class="detail-label">${esc(p.name)}</span><span class="detail-status">${s.pts} pts · quota ${s.quota}${s.played ? " · " + _hmNum(s.diff) + " " + vs : ""}</span></div>`;
    });
  const won = (kind) =>
    po.awards
      .filter((a) => a.kind === kind)
      .map(
        (a) =>
          esc(state.players[a.p].name.split(" ")[0]) +
          " #" +
          hLbl(a.h) +
          " " +
          (a.toFirst ? "(1st — no extra)" : _hm$(a.paid)),
      )
      .join(", ");
  if (log.length) {
    const g = won("Greenie"),
      k = won("Kenny");
    t += `<div class="detail-bet" style="margin-top:4px;border-top:1px solid var(--rule);padding-top:4px"><span class="detail-label">Greenies</span><span class="detail-status">${g || "None yet"}${last && last.greenieCarryOut ? ` · $${last.greenieCarryOut} carrying` : ""}</span></div>`;
    t += `<div class="detail-bet"><span class="detail-label">Kennys</span><span class="detail-status">${k || "None yet"}${last && last.kennyCarryOut ? ` · $${last.kennyCarryOut} carrying` : ""}</span></div>`;
  } else
    t +=
      '<div class="detail-bet"><span class="detail-label">Greenies &amp; Kennys</span><span class="detail-status">No par 3s on this card</span></div>';
  return t + "</div>";
}
// Setup: show each player's quota so the group can check it before teeing off.
function renderHaymarketQuotas() {
  const el = document.getElementById("hm-quotas");
  if (!el) return;
  const q = haymarketQuotas(state);
  el.innerHTML = state.players.length
    ? '<div class="wolf-pick-label" style="margin:6px 0 4px">Quotas (' +
      haymarketBase(state) +
      " − course handicap)</div>" +
      state.players
        .map(
          (p, i) =>
            '<div class="detail-bet hm-quota"><span class="detail-label">' +
            esc(p.name) +
            '</span><span class="detail-status">' +
            q[i] +
            " pts</span></div>",
        )
        .join("")
    : "";
}
