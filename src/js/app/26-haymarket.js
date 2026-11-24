/* Haymarket -- a Chicago-style quota game.

   Each player's quota is 39 minus their course handicap (on a nine, 20 minus
   the nine's course handicap). Gross points per hole: bogey 1, par 2, birdie
   4, eagle or better 8, anything worse 0. Whoever beats their quota by the
   most takes the pot -- every player's buy-in; second place pays nothing and
   a tie splits it. Mid-round the quota is pro-rated by holes played, so the
   standings read as "on pace".

   Par 3s carry a Greenie (closest to the pin) and a Kenny (furthest from the
   hole who still makes par), each paid to the winner by every other player.
   A par 3 finished with no winner carries its value to the next par 3;
   Greenie and Kenny carry separately, and a carry left after the last par 3
   is not paid. The picks live in bonusPoints under their own keys, so undo,
   saved rounds and live rounds carry them the way they carry junk. */
// The bonusPoints keys: "hmG" is a Greenie, "hmK" a Kenny.
function isHaymarketKey(k) {
  return "hmG" === k || "hmK" === k;
}
function haymarketBase(r) {
  return 9 === r.holeCount ? 20 : 39;
}
// Base minus the full course handicap (no allowance) on the round's tees.
function haymarketQuotas(r) {
  r = r || state;
  const base = haymarketBase(r),
    ps = r.players || [];
  if ("none" === r.handicapMode) return ps.map(() => base);
  const go = r.gameOpts || {},
    rr = Object.assign({}, r, {
      gameOpts: Object.assign({}, go, { strokeRule: Math.max(STROKE_RULE, go.strokeRule || 0) }),
    });
  return ps.map((p) => base - roundHcp(courseHandicapExact(rr, p)));
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
function haymarketPotWinners(st) {
  if (!st.some((s) => s.played)) return [];
  const best = Math.max(...st.map((s) => s.diff));
  return st.filter((s) => Math.abs(s.diff - best) < 1e-9).map((s) => s.i);
}
function bonusHolder(h, key) {
  if (!state.bonusPoints) return -1;
  for (let i = 0; i < state.players.length; i++) if (isBonusAwarded(i, h, key)) return i;
  return -1;
}
/* Every par 3 in order, with what its Greenie and Kenny are worth (the
   hole's own value plus whatever carried in) and who won them. A hole only
   passes its value on once everyone has a score on it, so the hole being
   played never looks like it carried. A Kenny pick whose player did not make
   par wins nothing. */
function haymarketPar3Log() {
  const o = state.gameOpts || {},
    out = [];
  let carryG = 0,
    carryK = 0;
  for (let h = 0; h < maxHole(); h++) {
    if (3 !== +state.pars[h]) continue;
    const vG = +stakeAt(o, "greenieVal", h) || 0,
      vK = +stakeAt(o, "kennyVal", h) || 0,
      done = !state.players.some((p, i) => null == state.scores[i]?.[h]),
      g = bonusHolder(h, "hmG"),
      kp = bonusHolder(h, "hmK"),
      kg = kp >= 0 ? state.scores[kp]?.[h] : null,
      kOk = kp >= 0 && null != kg && kg <= state.pars[h],
      rec = {
        h,
        done,
        greenie: g,
        kenny: kOk ? kp : -1,
        kennyPick: kp,
        kennyVoid: kp >= 0 && null != kg && !kOk,
        greeniePot: vG + carryG,
        kennyPot: vK + carryK,
        greenieCarryIn: carryG,
        kennyCarryIn: carryK,
      };
    g >= 0 ? (carryG = 0) : done && (carryG += vG);
    kOk ? (carryK = 0) : done && (carryK += vK);
    rec.greenieCarryOut = carryG;
    rec.kennyCarryOut = carryK;
    out.push(rec);
  }
  return out;
}
function calcHaymarketMoney() {
  const n = state.players.length,
    out = Array(n).fill(0);
  if (n < 2) return out;
  const buy = +(state.gameOpts || {}).buyIn || 0,
    w = haymarketPotWinners(haymarketStandings());
  if (w.length && buy) {
    const share = (buy * n) / w.length;
    for (let i = 0; i < n; i++) out[i] += (w.includes(i) ? share : 0) - buy;
  }
  haymarketPar3Log().forEach((r) => {
    [
      [r.greenie, r.greeniePot],
      [r.kenny, r.kennyPot],
    ].forEach(([p, v]) => {
      if (p < 0 || !v) return;
      for (let i = 0; i < n; i++) out[i] += i === p ? v * (n - 1) : -v;
    });
  });
  return out;
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
  const n = state.players.length,
    block = (key, title, rule, pot, carryIn, holder, note) =>
      `<div class="wolf-section hm-award" data-award="${key}"><div class="wolf-header">${title}: <strong>$${pot}</strong> <span class="wolf-hole-num">from each · $${pot * (n - 1)} total</span></div><div class="wolf-pick-label">${rule}${carryIn > 0 ? ` · includes $${carryIn} carried over` : ""}</div><div class="wolf-choices">${state.players
        .map(
          (pl, pi) =>
            `<button class="wolf-pick ${pi === holder ? "selected" : ""}" aria-pressed="${pi === holder ? "true" : "false"}" data-act="setHaymarketAward(${h},'${key}',${pi})">${avatarHTML(pl, 10)}${esc(pl.name)}${pi === holder ? " " + ico("check") : ""}</button>`,
        )
        .join(
          "",
        )}</div><div class="hint" style="margin-top:6px">${note || "No winner? Leave it blank and it carries to the next par 3."}</div></div>`;
  const kp = rec.kennyPick;
  return (
    block("hmG", "Greenie", "Closest to the pin", rec.greeniePot, rec.greenieCarryIn, rec.greenie) +
    block(
      "hmK",
      "Kenny",
      "Furthest from the hole and makes par",
      rec.kennyPot,
      rec.kennyCarryIn,
      kp,
      rec.kennyVoid
        ? `${esc(state.players[kp].name)} didn’t make par — no Kenny, so it carries to the next par 3.`
        : "",
    )
  );
}
function renderHaymarketDetail() {
  const st = haymarketStandings(),
    n = state.players.length,
    buy = +(state.gameOpts || {}).buyIn || 0,
    w = haymarketPotWinners(st),
    allDone = st.every((s) => s.played === maxHole()),
    log = haymarketPar3Log(),
    last = log.length ? log[log.length - 1] : null;
  let t = '<div class="game-detail">';
  t += `<div class="detail-bet"><span class="detail-label">Pot</span><span class="detail-status">$${buy * n} · winner takes all${w.length ? " · " + (allDone ? "won by " : "leader: ") + w.map((i) => esc(state.players[i].name)).join(" & ") : ""}</span></div>`;
  st.slice()
    .sort((a, b) => b.diff - a.diff)
    .forEach((s) => {
      const p = state.players[s.i],
        vs = s.played === maxHole() ? "vs quota" : "on pace";
      t += `<div class="detail-bet"><span class="detail-label">${esc(p.name)}</span><span class="detail-status">${s.pts} pts · quota ${s.quota}${s.played ? " · " + _hmNum(s.diff) + " " + vs : ""}</span></div>`;
    });
  const won = (key) =>
    log
      .filter((r) => r[key] >= 0)
      .map((r) => esc(state.players[r[key]].name.split(" ")[0]) + " #" + hLbl(r.h))
      .join(", ");
  if (log.length) {
    const g = won("greenie"),
      k = won("kenny");
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
  const hm = document.getElementById("handicap-mode"),
    r = Object.assign({}, state, { handicapMode: (hm && hm.value) || state.handicapMode }),
    q = haymarketQuotas(r),
    base = haymarketBase(r);
  el.innerHTML = state.players.length
    ? '<div class="wolf-pick-label" style="margin:6px 0 4px">Quotas (' +
      base +
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
  hm &&
    !hm._hmBound &&
    ((hm._hmBound = !0), hm.addEventListener("change", () => renderHaymarketQuotas()));
}
