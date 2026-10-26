/* Out on your own with no game on, there is no money to keep -- but there is
   a round to learn from. A solo round records the three numbers golfers keep
   on the back of a card: fairways hit off the tee (par 4s and 5s, and which
   side a miss went), greens in regulation, and putts. They live per hole in
   state.holeStats for the one player, and are counted out of the holes that
   were actually recorded, so a hole left blank is not scored as a miss. */
const FW_SIDES = [
  ["l", "Left"],
  ["hit", "Hit"],
  ["r", "Right"],
];
const PUTT_CHIPS = [0, 1, 2, 3, 4];
function tracksSoloStats() {
  return 1 === state.players.length && "none" === state.gameType && !anySideBetActive();
}
function holeStat(h) {
  return (state.holeStats && state.holeStats[h]) || {};
}
/* Tapping the value already chosen clears it, the same way a second tap
   undoes an awarded dot. */
function setHoleStat(h, k, v) {
  if (!canMutateRound()) return;
  pushUndo("st" + k + ":" + h);
  state.holeStats = state.holeStats || {};
  const s = Object.assign({}, state.holeStats[h]);
  s[k] === v ? delete s[k] : (s[k] = v);
  Object.keys(s).length ? (state.holeStats[h] = s) : delete state.holeStats[h];
  (debouncedSave(), haptic(), renderHole());
}
function setFairway(h, v) {
  setHoleStat(h, "fw", v);
}
function setGir(h, v) {
  setHoleStat(h, "gir", v);
}
function setPutts(h, n) {
  setHoleStat(h, "putts", n);
}
function _ssChip(label, on, act, aria) {
  return `<button type="button" class="ss-chip${on ? " on" : ""}" aria-pressed="${on ? "true" : "false"}"${aria ? ` aria-label="${aria}"` : ""} data-act="${act}">${label}</button>`;
}
function soloStatsHoleHTML(h) {
  if (!tracksSoloStats() || isSpectator) return "";
  const s = holeStat(h),
    par = state.pars[h],
    fw =
      par > 3
        ? FW_SIDES.map(([v, l]) =>
            _ssChip(
              l,
              s.fw === v,
              `setFairway(${h},'${v}')`,
              "hit" === v ? "Fairway hit" : `Missed fairway ${l.toLowerCase()}`,
            ),
          ).join("")
        : '<span class="ss-na">Par 3 — no fairway</span>',
    gir =
      _ssChip("Hit", 1 === s.gir, `setGir(${h},1)`, "Green in regulation") +
      _ssChip("Missed", 0 === s.gir, `setGir(${h},0)`, "Missed the green in regulation"),
    putts = PUTT_CHIPS.map((n) =>
      _ssChip(
        4 === n ? "4+" : String(n),
        s.putts === n,
        `setPutts(${h},${n})`,
        `${4 === n ? "4 or more" : n} putt${1 === n ? "" : "s"}`,
      ),
    ).join("");
  return `<div class="solo-stats" role="group" aria-label="Hole ${hLbl(h)} stats">
      <div class="bonus-header">Your stats</div>
      <div class="ss-row"><span class="ss-label">Fairway</span><div class="ss-chips">${fw}</div></div>
      <div class="ss-row"><span class="ss-label">Green <span class="ss-sub">on in ${Math.max(1, par - 2)}</span></span><div class="ss-chips">${gir}</div></div>
      <div class="ss-row"><span class="ss-label">Putts</span><div class="ss-chips">${putts}</div></div>
    </div>`;
}
/* Totals over holes [from, to). */
function soloStatsTotals(from = 0, to = maxHole()) {
  const t = {
    fw: 0,
    fwOf: 0,
    left: 0,
    right: 0,
    gir: 0,
    girOf: 0,
    putts: 0,
    puttHoles: 0,
    one: 0,
    three: 0,
  };
  for (let h = from; h < to; h++) {
    const s = holeStat(h);
    state.pars[h] > 3 &&
      s.fw &&
      (t.fwOf++, "hit" === s.fw ? t.fw++ : "l" === s.fw ? t.left++ : t.right++);
    null != s.gir && (t.girOf++, 1 === s.gir && t.gir++);
    null != s.putts &&
      (t.puttHoles++, (t.putts += s.putts), s.putts <= 1 && t.one++, s.putts >= 3 && t.three++);
  }
  return t;
}
const _pct = (n, of) => (of ? Math.round((100 * n) / of) + "%" : "—");
function _anySoloStats() {
  return !!state.holeStats && Object.keys(state.holeStats).length > 0;
}
/* Three rows under the player's scores on the card, with OUT/IN/TOT totals. */
function soloStatsScorecardRows() {
  if (!tracksSoloStats() || !_anySoloStats()) return "";
  const n = Math.min(9, maxHole()),
    back = maxHole() > 9,
    tot = (a, b, k) => {
      const t = soloStatsTotals(a, b);
      return `<td class="total-col">${"putts" === k ? (t.puttHoles ? t.putts : "-") : "fw" === k ? (t.fwOf ? t.fw + "/" + t.fwOf : "-") : t.girOf ? t.gir + "/" + t.girOf : "-"}</td>`;
    },
    cell = (h, k) => {
      const s = holeStat(h);
      if ("fw" === k) {
        if (state.pars[h] <= 3) return '<td class="ss-cell ss-none">·</td>';
        return "hit" === s.fw
          ? '<td class="ss-cell ss-hit"><span aria-hidden="true">✓</span><span class="sr-only">hit</span></td>'
          : "l" === s.fw || "r" === s.fw
            ? `<td class="ss-cell ss-miss"><span aria-hidden="true">${"l" === s.fw ? "←" : "→"}</span><span class="sr-only">missed ${"l" === s.fw ? "left" : "right"}</span></td>`
            : "<td>-</td>";
      }
      if ("gir" === k)
        return 1 === s.gir
          ? '<td class="ss-cell ss-hit"><span aria-hidden="true">✓</span><span class="sr-only">hit</span></td>'
          : 0 === s.gir
            ? '<td class="ss-cell ss-miss"><span aria-hidden="true">✕</span><span class="sr-only">missed</span></td>'
            : "<td>-</td>";
      return null == s.putts
        ? "<td>-</td>"
        : `<td class="ss-cell${s.putts >= 3 ? " ss-miss" : s.putts <= 1 ? " ss-hit" : ""}">${4 === s.putts ? "4+" : s.putts}</td>`;
    };
  return [
    ["fw", "Fairway"],
    ["gir", "Green"],
    ["putts", "Putts"],
  ]
    .map(([k, label]) => {
      let r = `<tr class="ss-tr"><td>${label}</td>`;
      for (let h = 0; h < n; h++) r += cell(h, k);
      r += tot(0, n, k);
      if (back) {
        for (let h = 9; h < maxHole(); h++) r += cell(h, k);
        r += tot(9, maxHole(), k);
      }
      return r + tot(0, maxHole(), k) + "<td></td></tr>";
    })
    .join("");
}
/* The round's three numbers as tiles, for the card and the results. */
function soloStatsSummaryHTML() {
  if (!tracksSoloStats() || !_anySoloStats()) return "";
  const t = soloStatsTotals(),
    tile = (val, label, sub) =>
      `<div class="gs-item ss-tile"><div class="gs-val">${val}</div><div class="gs-label">${label}</div><div class="ss-tile-sub">${sub}</div></div>`,
    notes = [];
  (t.left || t.right) &&
    notes.push(`Missed fairways: <b>${t.left}</b> left · <b>${t.right}</b> right`);
  t.puttHoles &&
    notes.push(
      `<b>${t.one}</b> one-putt${1 === t.one ? "" : "s"} or better · <b>${t.three}</b> three-putt${1 === t.three ? "" : "s"}+`,
    );
  return (
    '<div class="results-money-title ss-title">Your stats</div><div class="group-stats-bar ss-summary">' +
    tile(t.fwOf ? `${t.fw}/${t.fwOf}` : "—", "Fairways", _pct(t.fw, t.fwOf)) +
    tile(t.girOf ? `${t.gir}/${t.girOf}` : "—", "Greens", _pct(t.gir, t.girOf)) +
    tile(
      t.puttHoles ? t.putts : "—",
      "Putts",
      t.puttHoles ? (t.putts / t.puttHoles).toFixed(1) + " / hole" : "—",
    ) +
    "</div>" +
    (notes.length ? `<div class="ss-notes">${notes.join("<br>")}</div>` : "")
  );
}
function soloStatsShareText() {
  if (!tracksSoloStats() || !_anySoloStats()) return "";
  const t = soloStatsTotals();
  let o = "\nSTATS\n";
  t.fwOf && (o += `Fairways  ${t.fw}/${t.fwOf} (${_pct(t.fw, t.fwOf)})\n`);
  t.girOf && (o += `Greens    ${t.gir}/${t.girOf} (${_pct(t.gir, t.girOf)})\n`);
  t.puttHoles && (o += `Putts     ${t.putts} (${(t.putts / t.puttHoles).toFixed(1)} per hole)\n`);
  return o;
}
