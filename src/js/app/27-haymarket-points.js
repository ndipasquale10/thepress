/* Haymarket points -- the heart of the game: every player chasing their quota.

   Everything here is read off the gross scores on each render, so a fixed
   score or an Undo puts the points right with nothing stored to drift. */
function haymarketGrossLabel(gross, par) {
  const d = gross - par;
  return d <= -3
    ? "Albatross"
    : -2 === d
      ? "Eagle"
      : -1 === d
        ? "Birdie"
        : 0 === d
          ? "Par"
          : 1 === d
            ? "Bogey"
            : 2 === d
              ? "Double"
              : "+" + d;
}
function _hmPts(p) {
  return "+" + p + " pt" + (1 === p ? "" : "s");
}
// A player's points on one hole; null when the hole has no score yet.
function haymarketPointsOn(i, h) {
  const g = state.scores[i]?.[h];
  return null == g ? null : isPickedUp(i, h) ? 0 : haymarketHolePoints(g, state.pars[h]);
}
// The result box on a score row: the gross result and the points it earns.
function haymarketResultHTML(gross, par, pickedUp) {
  const d = gross - par,
    p = pickedUp ? 0 : haymarketHolePoints(gross, par),
    cls =
      pickedUp || d >= 2
        ? "double"
        : d <= -2
          ? "eagle"
          : -1 === d
            ? "birdie"
            : 0 === d
              ? "par"
              : "bogey";
  return `<div class="score-result ${cls} hm-res">${pickedUp ? "Picked up" : haymarketGrossLabel(gross, par)}<br><span class="hm-res-pts">${_hmPts(p)}</span></div>`;
}
// Strokes play no part in Haymarket -- the handicap is in the quota -- so the
// score rows drop them unless a side bet is settling on net.
function haymarketHidesStrokes() {
  return "haymarket" === state.gameType && !anySideBetActive();
}
function _hmStatus(s, nh) {
  const left = s.quota - s.pts;
  return s.played === nh
    ? left <= 0
      ? `<span class="up">Made it · ${_hmNum(-left)}</span>`
      : `<span class="down">Short by ${left}</span>`
    : left <= 0
      ? `<span class="up">${_hmNum(-left)} over quota</span>`
      : `Needs <b>${left}</b>`;
}
/* Points vs quota for every player, leader first: points so far against the
   quota as a bar, a tick where they should be by now, what they still need,
   and how far ahead of or behind that pace they are. `h` is the hole on
   screen, whose points are called out; null leaves them out. */
function haymarketBoardHTML(h) {
  const st = haymarketStandings(),
    nh = maxHole(),
    w = haymarketPotWinners(st),
    buy = +(state.gameOpts || {}).buyIn || 0,
    rows = st
      .slice()
      .sort((a, b) => b.diff - a.diff || b.pts - a.pts)
      .map((s) => {
        const p = state.players[s.i],
          q = Math.max(1, s.quota),
          fill = Math.min(100, (100 * s.pts) / q),
          tick = Math.min(100, (100 * s.played) / (nh || 1)),
          ph = null != h ? haymarketPointsOn(s.i, h) : null,
          here = null != ph ? ` · <span class="hm-here">${_hmPts(ph)} on ${hLbl(h)}</span>` : "",
          lead = s.played && w.includes(s.i),
          pace = s.played
            ? `<span class="${s.diff > 0.05 ? "up" : s.diff < -0.05 ? "down" : ""}">${_hmNum(s.diff)} ${s.played === nh ? "vs quota" : "on pace"}</span>`
            : "<span>Not started</span>";
        return `<div class="hm-row${lead ? " lead" : ""}"><div class="hm-row-top"><span class="hm-name">${avatarHTML(p, 10)}${esc(p.name)}${lead ? ' <span class="hm-lead">Leader</span>' : ""}</span><span class="hm-score"><b>${s.pts}</b> / ${s.quota}</span></div><div class="hm-bar${s.pts >= s.quota ? " made" : ""}" role="img" aria-label="${esc(p.name)}: ${s.pts} of ${s.quota} points"><i style="width:${fill.toFixed(1)}%"></i>${s.played && s.played < nh ? `<b class="hm-tick" style="left:${tick.toFixed(1)}%"></b>` : ""}</div><div class="hm-row-sub"><span>${_hmStatus(s, nh)} · thru ${s.played}${here}</span>${pace}</div></div>`;
      })
      .join("");
  return `<div class="hm-board"><div class="hm-board-head"><span class="hm-board-title">Points vs Quota</span><span class="hm-board-sub">Bogey 1 · Par 2 · Birdie 4 · Eagle 8${buy ? ` · $${buy * st.length} pot` : ""}</span></div>${rows}<div class="hm-board-key"><b class="hm-tick-key"></b> where you should be by now</div></div>`;
}
// Scorecard: each player's points by hole, then the total and what is left of the quota.
function haymarketScorecardRows(n, o) {
  const st = haymarketStandings(),
    cell = (i, h) => {
      const p = haymarketPointsOn(i, h);
      return null == p ? "<td>-</td>" : `<td class="hm-sc">${p}</td>`;
    },
    sum = (i, a, b) => {
      let t = 0;
      for (let h = a; h < b; h++) t += haymarketPointsOn(i, h) || 0;
      return t;
    },
    cols = 1 + n + 1 + (o ? maxHole() - 9 + 1 : 0) + 2;
  let s = `<tr class="hm-sc-head"><td colspan="${cols}">Haymarket points — last column is left to reach quota</td></tr>`;
  state.players.forEach((p, i) => {
    const t = st[i],
      left = t.quota - t.pts;
    s += `<tr><td style="white-space:nowrap;font-weight:700">${esc(p.name.slice(0, 8))} <small>Q${t.quota}</small></td>`;
    for (let h = 0; h < n; h++) s += cell(i, h);
    s += `<td class="total-col">${sum(i, 0, n)}</td>`;
    if (o) {
      for (let h = 9; h < maxHole(); h++) s += cell(i, h);
      s += `<td class="total-col">${sum(i, 9, maxHole())}</td>`;
    }
    s += `<td class="total-col">${t.pts}</td><td class="total-col ${left <= 0 ? "hl-win" : t.played === maxHole() ? "hl-lose" : ""}">${left <= 0 ? "+" + -left : "−" + left}</td></tr>`;
  });
  return s;
}
