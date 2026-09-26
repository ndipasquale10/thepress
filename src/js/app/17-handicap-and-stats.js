// Rounds with real tee data use (gross - rating) * 113 / slope; the rest fall
// back to strokes over par normalized to 18 holes.
const HCP_MIN_ROUNDS = 3;
const HCP_BEST_OF = [0, 1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8];
function roundDifferential(r, name) {
  const idx = (r.players || []).findIndex((p) => p.name === name);
  if (idx < 0) return null;
  const sc = r.scores && r.scores[idx],
    pars = r.pars || [];
  if (!sc) return null;
  let gross = 0,
    par = 0,
    holes = 0;
  for (let h = 0; h < pars.length; h++) {
    const v = sc[h];
    null != v && ((gross += v), (par += pars[h]), holes++);
  }
  if (holes < 1) return null;
  const tee = r.selectedTee;
  if (tee && tee.rating && tee.slope && holes > 0) {
    const g18 = (gross * 18) / holes;
    return ((g18 - tee.rating) * 113) / tee.slope;
  }
  return ((gross - par) * 18) / holes;
}
function computeHandicapIndex(name, rounds) {
  const rs = (rounds || getAllRounds())
    .filter((r) => r.finished)
    .sort((a, b) => new Date(a.finishedDate || a.date) - new Date(b.finishedDate || b.date));
  const diffs = [],
    series = [];
  rs.forEach((r) => {
    const d = roundDifferential(r, name);
    if (null == d) return;
    diffs.push(d);
    if (diffs.length < HCP_MIN_ROUNDS) return;
    const win = diffs.slice(-20),
      n = Math.min(win.length, 20),
      take = HCP_BEST_OF[n] || 1,
      best = [...win].sort((a, b) => a - b).slice(0, take);
    series.push(Math.round(10 * (best.reduce((a, b) => a + b, 0) / best.length) * 0.96) / 10);
  });
  return {
    index: series.length ? series[series.length - 1] : null,
    series: series,
    rounds: diffs.length,
  };
}
function bestGameFor(name, rounds) {
  const by = {};
  (rounds || getAllRounds())
    .filter((r) => r.finished && r.money)
    .forEach((r) => {
      const i = (r.players || []).findIndex((p) => p.name === name);
      if (i < 0) return;
      const g = r.gameType || "none";
      (by[g] || (by[g] = { game: g, money: 0, rounds: 0 }),
        (by[g].money += r.money[i] || 0),
        by[g].rounds++);
    });
  const list = Object.values(by).sort((a, b) => b.money - a.money);
  return list.length ? list[0] : null;
}
function trophiesFor(name, rounds) {
  const rs = (rounds || getAllRounds()).filter((r) => r.finished),
    out = [];
  const stats = computeScoringStats(rs).find((s) => s.name === name);
  const withMoney = rs
    .filter((r) => r.money && (r.players || []).some((p) => p.name === name))
    .sort((a, b) => new Date(a.finishedDate || a.date) - new Date(b.finishedDate || b.date));
  let streak = 0,
    bestStreak = 0,
    best = { v: 0, course: null };
  withMoney.forEach((r) => {
    const i = (r.players || []).findIndex((p) => p.name === name),
      m = i < 0 ? 0 : r.money[i] || 0;
    m > 0.005 ? (streak++, streak > bestStreak && (bestStreak = streak)) : (streak = 0);
    m > best.v && (best = { v: m, course: r.course });
  });
  stats &&
    stats.eagles > 0 &&
    out.push({ ico: ico("eagle"), label: "Eagle" + (stats.eagles > 1 ? " ×" + stats.eagles : "") });
  stats && stats.birdies >= 5 && out.push({ ico: ico("bird"), label: stats.birdies + " birdies" });
  bestStreak >= 3 && out.push({ ico: ico("flame"), label: bestStreak + "-round heater" });
  best.v > 0 && out.push({ ico: ico("trophy"), label: "Best take " + fmtMoney(best.v) });
  rs.length >= 10 && out.push({ ico: ico("flag"), label: rs.length + " rounds" });
  stats && null != stats.best && out.push({ ico: ico("target"), label: "Low round " + stats.best });
  return out;
}
function computeScoringStats(e) {
  const t = {};
  e.forEach((e) => {
    const a = e.scores || {},
      s = e.pars || [];
    (e.players || []).forEach((n, o) => {
      t[n.name] ||
        (t[n.name] = {
          rounds: 0,
          totalDiff: 0,
          holesPlayed: 0,
          best: 1 / 0,
          eagles: 0,
          birdies: 0,
          pars: 0,
          bogeys: 0,
          doublePlus: 0,
          color: n.color,
          trend: [],
        });
      const l = t[n.name];
      let r = 0,
        i = 0,
        c = 0;
      for (let t = 0; t < s.length; t++) {
        const e = a[o]?.[t];
        if (null == e) continue;
        const n = e - s[t];
        ((r += e),
          (i += s[t]),
          c++,
          n <= -2
            ? l.eagles++
            : -1 === n
              ? l.birdies++
              : 0 === n
                ? l.pars++
                : 1 === n
                  ? l.bogeys++
                  : l.doublePlus++);
      }
      c > 0 &&
        (l.rounds++,
        (l.totalDiff += r - i),
        (l.holesPlayed += c),
        (l.best = Math.min(l.best, r)),
        l.trend.push(r - i));
    });
  });
  return Object.entries(t)
    .map(([e, t]) => ({
      name: e,
      ...t,
      scoringAvgVsPar: t.rounds > 0 ? t.totalDiff / t.rounds : null,
      best: t.best === 1 / 0 ? null : t.best,
    }))
    .sort((e, t) => (e.scoringAvgVsPar ?? 1 / 0) - (t.scoringAvgVsPar ?? 1 / 0));
}
function renderScoringStats() {
  const e = document.getElementById("scoring-stats");
  if (!e) return;
  const t = getAllRounds().filter((e) => e.finished && e.scores);
  if (t.length < 2) return void (e.innerHTML = "");
  const a = computeScoringStats(t);
  let s = '<div class="season-stats-card"><div class="season-title">Scoring Stats</div>';
  (a.forEach((t) => {
    const n =
        null == t.scoringAvgVsPar
          ? "—"
          : (t.scoringAvgVsPar >= 0 ? "+" : "") + t.scoringAvgVsPar.toFixed(1),
      o = null == t.best ? "—" : t.best,
      l = t.bogeys + t.doublePlus;
    s +=
      '<div class="scoring-stat-card">' +
      '<div class="scoring-stat-head">' +
      avatarHTML(t, 10) +
      '<span class="scoring-name">' +
      esc(t.name) +
      '</span><span class="scoring-rounds">' +
      t.rounds +
      "R</span></div>" +
      '<div class="scoring-stat-pills">' +
      '<span class="stat-pill"><strong>' +
      n +
      "</strong><small>Avg</small></span>" +
      '<span class="stat-pill"><strong>' +
      o +
      "</strong><small>Best</small></span>" +
      '<span class="stat-pill"><strong>' +
      t.eagles +
      "</strong><small>Eagles</small></span>" +
      '<span class="stat-pill"><strong>' +
      t.birdies +
      "</strong><small>Birdies</small></span>" +
      '<span class="stat-pill"><strong>' +
      t.pars +
      "</strong><small>Pars</small></span>" +
      '<span class="stat-pill"><strong>' +
      l +
      "</strong><small>Bogeys+</small></span>" +
      "</div>" +
      (t.trend.length
        ? '<div class="scoring-trend">' +
          t.trend
            .map(
              (e) =>
                '<span class="trend-bar ' +
                (e < 0 ? "trend-under" : e > 0 ? "trend-over" : "trend-even") +
                '" style="height:' +
                Math.max(4, Math.min(20, 4 + 2 * Math.abs(e))) +
                'px" title="' +
                (0 === e ? "E" : (e > 0 ? "+" : "") + e) +
                '"></span>',
            )
            .join("") +
          "</div>"
        : "") +
      "</div>";
  }),
    (s += "</div>"),
    (e.innerHTML = s));
}
function renderSeasonStats() {
  const e = document.getElementById("season-stats");
  if (!e) return;
  const t = getAllRounds().filter((e) => e.finished && e.money);
  if (t.length < 2)
    return void (e.innerHTML =
      '<div class="season-stats-card"><div class="hint">One round in the books. Play another to unlock season standings, rivalries and scoring stats.</div></div>');
  const a = {};
  t.forEach((e) => {
    (e.players || []).forEach((t, s) => {
      (a[t.name] || (a[t.name] = { money: 0, rounds: 0, color: t.color }),
        (a[t.name].money += e.money[s] || 0),
        a[t.name].rounds++);
    });
  });
  const s = Object.entries(a)
    .map(([e, t]) => ({ name: e, ...t }))
    .sort((e, t) => t.money - e.money);
  let n =
    '<div class="season-stats-card"><div class="season-title">Season Stats (' +
    t.length +
    " rounds)</div>";
  (s.forEach((e, t) => {
    const a = e.money > 0.01 ? "match-up" : e.money < -0.01 ? "match-dn" : "";
    n +=
      '<div class="season-row' +
      (0 === t ? " lead" : "") +
      '">' +
      rankChip(t + 1) +
      avatarHTML(e, 16) +
      '<span class="season-name">' +
      esc(e.name) +
      '</span><span class="season-rounds">' +
      e.rounds +
      'R</span><span class="season-money ' +
      a +
      '">' +
      fmtMoney(e.money) +
      "</span></div>";
  }),
    (n += "</div>"),
    (e.innerHTML = n));
}
function renderSeasonExtras() {
  const el = document.getElementById("season-extras");
  if (!el) return;
  const rounds = getAllRounds().filter(
    (e) => e.finished && e.money && e.players && e.players.length,
  );
  if (rounds.length < 2) return void (el.innerHTML = "");
  const pairs = {};
  rounds.forEach((r) => {
    r.players.forEach((a, i) => {
      r.players.forEach((b, j) => {
        if (j <= i) return;
        const ns = [a.name, b.name].sort(),
          key = ns.join("|");
        pairs[key] || (pairs[key] = { a: ns[0], b: ns[1], shared: 0, wa: 0, wb: 0, diff: 0 });
        const P = pairs[key],
          ma = r.money[i] || 0,
          mb = r.money[j] || 0,
          d = a.name === ns[0] ? ma - mb : mb - ma;
        (P.shared++, (P.diff += d), d > 0.005 ? P.wa++ : d < -0.005 && P.wb++);
      });
    });
  });
  const top = Object.values(pairs)
    .filter((p) => p.shared >= 2)
    .sort((x, y) => y.shared - x.shared)
    .slice(0, 3);
  let best = { v: 0, name: null },
    streaks = {},
    cur = {};
  [...rounds]
    .sort((x, y) => new Date(x.finishedDate || x.date) - new Date(y.finishedDate || y.date))
    .forEach((r) => {
      r.players.forEach((p, i) => {
        const m = r.money[i] || 0;
        (m > best.v && (best = { v: m, name: p.name, course: r.course }),
          (cur[p.name] = m > 0.005 ? (cur[p.name] || 0) + 1 : 0),
          cur[p.name] > (streaks[p.name] || 0) && (streaks[p.name] = cur[p.name]));
      });
    });
  const hot = Object.entries(cur).sort((a, b) => b[1] - a[1])[0];
  let h = "";
  (top.length &&
    (h +=
      '<div class="season-stats-card"><div class="season-title">Rivalries</div>' +
      top
        .map((P) => {
          const lead = P.diff > 0.005 ? P.a : P.diff < -0.005 ? P.b : null;
          return (
            '<div class="season-row h2h-row"><span class="season-name">' +
            esc(P.a) +
            ' <span class="h2h-vs">vs</span> ' +
            esc(P.b) +
            '</span><span class="season-rounds num">' +
            P.wa +
            "–" +
            P.wb +
            '</span><span class="season-money ' +
            (lead ? "match-up" : "") +
            '">' +
            (lead ? esc(lead.split(" ")[0]) + " " + fmtMoney(Math.abs(P.diff)) : "all square") +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"),
    (best.name || (hot && hot[1] > 1)) &&
      (h +=
        '<div class="season-stats-card"><div class="season-title">Superlatives</div>' +
        (best.name
          ? '<div class="season-row"><span class="sup-ico">' +
            ico("trophy") +
            '</span><span class="season-name">Best round — ' +
            esc(best.name) +
            (best.course ? " at " + esc(best.course) : "") +
            '</span><span class="season-money match-up">' +
            fmtMoney(best.v) +
            "</span></div>"
          : "") +
        (hot && hot[1] > 1
          ? '<div class="season-row"><span class="sup-ico">' +
            ico("flame") +
            '</span><span class="season-name">' +
            esc(hot[0]) +
            " — " +
            hot[1] +
            "-round heater, still alive</span></div>"
          : "") +
        "</div>"),
    (el.innerHTML = h));
} // Demo season for preview builds. Gated on window.__PRESS_DEMO__, which the
