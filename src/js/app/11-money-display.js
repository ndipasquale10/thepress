/* Replaying the card hole by hole is the most expensive thing the scoring
   screen does, and it was uncached: one renderHole() ran it three times over,
   because the hole preview, the play feed and the money log each asked for it
   independently, and the standings and results modals each ran it twice more
   (once to decide whether to draw the chart, once to draw it).

   Both results are pure functions of the same state calcMoney() reads, so they
   cache against the version counter invalidateMoneyCache() already bumps.
   computeRunningTotals() bumps that counter itself as it unwinds the round, so
   the key is read back after the replay, not before. Callers only ever read
   these rows -- nothing mutates them in place. */
let _rtCache = null,
  _rtCacheVer = -1,
  _hmCache = null,
  _hmCacheVer = -1;
function computeHoleMoney() {
  if (_hmCache && _hmCacheVer === _moneyCacheVer) return _hmCache;
  const rt = computeRunningTotals(),
    rows = [];
  let prev = state.players.map(() => 0);
  rt.forEach(({ h, totals }) => {
    const deltas = totals.map((v, i) => +(v - prev[i]).toFixed(2));
    rows.push({ h: h, deltas: deltas });
    prev = totals;
  });
  return ((_hmCache = rows), (_hmCacheVer = _moneyCacheVer), rows);
}
function computeRunningTotals() {
  if (_rtCache && _rtCacheVer === _moneyCacheVer) return _rtCache;
  const done = [];
  for (let h = 0; h < maxHole(); h++) {
    const w = state.wolfHoles && state.wolfHoles[h];
    ((w && w.conceded) || !state.players.some((p, i) => null == state.scores[i]?.[h])) &&
      done.push(h);
  }
  if (!done.length) return ((_rtCache = []), (_rtCacheVer = _moneyCacheVer), _rtCache);
  const snap = JSON.parse(JSON.stringify(state.scores)),
    bsnap2 = JSON.parse(JSON.stringify(state.bonusPoints || {})),
    wsnap = state.wolfHoles ? JSON.parse(JSON.stringify(state.wolfHoles)) : null,
    out = []; /* Same unwinding as holeDelta, and the same hazard: restore in a finally so a
   throw part-way cannot leave the card permanently short a hole. */
  try {
    for (let di = done.length - 1; di >= 0; di--) {
      invalidateMoneyCache();
      out[di] = { h: done[di], totals: calcMoney().map((v) => +v.toFixed(2)) };
      const h = done[di];
      (state.players.forEach((p, i) => {
        state.scores[i] && delete state.scores[i][h];
        state.bonusPoints && state.bonusPoints[i] && delete state.bonusPoints[i][h];
      }),
        state.wolfHoles && state.wolfHoles[h] && (state.wolfHoles[h].conceded = null));
    }
  } finally {
    (Object.assign(state.scores, snap),
      bsnap2 && state.bonusPoints && Object.assign(state.bonusPoints, bsnap2),
      wsnap && Object.assign(state.wolfHoles, wsnap),
      invalidateMoneyCache());
  }
  return ((_rtCache = out), (_rtCacheVer = _moneyCacheVer), out);
}
function drawMoneyFlow(cv) {
  if (!cv) return;
  const data = computeRunningTotals();
  if (data.length < 2) return void (cv.parentElement && cv.parentElement.classList.add("hidden"));
  cv.parentElement && cv.parentElement.classList.remove("hidden");
  const dpr = window.devicePixelRatio || 1,
    w = cv.clientWidth || 300,
    h = 170;
  ((cv.width = w * dpr), (cv.height = h * dpr), (cv.style.height = h + "px"));
  const ctx = cv.getContext("2d");
  (ctx.setTransform(dpr, 0, 0, dpr, 0, 0), ctx.clearRect(0, 0, w, h));
  const series = state.players.map((p, i) => [0].concat(data.map((d) => d.totals[i])));
  let mx = 1,
    mn = -1;
  series.forEach((e) =>
    e.forEach((v) => {
      (v > mx && (mx = v), v < mn && (mn = v));
    }),
  );
  const padL = 6,
    padR = 58,
    padT = 12,
    padB = 22,
    n = series[0].length,
    X = (i) => padL + (w - padL - padR) * (i / (n - 1)),
    Y = (v) =>
      mx === mn
        ? padT + (h - padT - padB) / 2
        : padT + (h - padT - padB) * (1 - (v - mn) / (mx - mn)),
    cs = getComputedStyle(document.documentElement),
    rule = cs.getPropertyValue("--rule").trim() || "rgba(0,0,0,.15)",
    muted = cs.getPropertyValue("--muted").trim() || "rgba(0,0,0,.45)",
    numFont = cs.getPropertyValue("--font-num") || "monospace";
  const ranked = series
    .map((sr, i) => ({ i: i, end: sr[sr.length - 1] }))
    .sort((a, b) => b.end - a.end);
  const L = ranked[0].i,
    ls = series[L],
    lcol = playerColor(state.players[L]),
    grad = ctx.createLinearGradient(0, padT, 0, h - padB);
  (grad.addColorStop(0, lcol + "2e"),
    grad.addColorStop(1, lcol + "00"),
    ctx.beginPath(),
    ls.forEach((v, k) => {
      k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v));
    }),
    ctx.lineTo(X(n - 1), h - padB),
    ctx.lineTo(X(0), h - padB),
    ctx.closePath(),
    (ctx.fillStyle = grad),
    ctx.fill());
  ((ctx.strokeStyle = rule),
    (ctx.lineWidth = 1),
    ctx.setLineDash([3, 3]),
    ctx.beginPath(),
    ctx.moveTo(padL, Y(0)),
    ctx.lineTo(w - padR, Y(0)),
    ctx.stroke(),
    ctx.setLineDash([]));
  ((ctx.font = "600 9px " + numFont),
    (ctx.fillStyle = muted),
    (ctx.textAlign = "left"),
    ctx.fillText("$0", padL, Y(0) - 3));
  const holes = data.map((d) => d.h + 1),
    step = Math.max(1, Math.ceil((n - 1) / 9));
  ctx.textAlign = "center";
  for (let k = 1; k < n; k++) {
    if ((k - 1) % step != 0 && k != n - 1) continue;
    const x = X(k);
    ((ctx.strokeStyle = rule),
      (ctx.lineWidth = 1),
      ctx.beginPath(),
      ctx.moveTo(x, h - padB),
      ctx.lineTo(x, h - padB + 3),
      ctx.stroke(),
      ctx.fillText(String(holes[k - 1]), x, h - padB + 13));
  }
  ((ctx.textAlign = "left"), (ctx.font = "600 10px " + numFont));
  series.forEach((sr, i) => {
    const col = playerColor(state.players[i]);
    (ctx.beginPath(),
      sr.forEach((v, k) => {
        k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v));
      }),
      (ctx.strokeStyle = col),
      (ctx.lineWidth = ranked[0].i === i ? 2.6 : 1.8),
      (ctx.lineJoin = "round"),
      (ctx.lineCap = "round"),
      ctx.stroke());
    const lx = X(n - 1),
      ly = Y(sr[n - 1]);
    (ctx.beginPath(),
      ctx.arc(lx, ly, ranked[0].i === i ? 3.4 : 2.6, 0, 7),
      (ctx.fillStyle = col),
      ctx.fill());
  });
  const LBL_GAP = 11,
    LBL_TOP = padT,
    LBL_BOT = h - padB - 2,
    fits = Math.max(1, Math.floor((LBL_BOT - LBL_TOP) / LBL_GAP) + 1);
  let labels = series
    .map((sr, i) => ({ i: i, v: sr[n - 1], y: Math.min(LBL_BOT, Math.max(LBL_TOP, Y(sr[n - 1]))) }))
    .sort((a, b) => a.y - b.y);
  labels.length > fits &&
    (labels = labels.filter((l, k) => k < fits - 1 || k === labels.length - 1));
  for (let k = 1; k < labels.length; k++)
    labels[k].y = Math.max(labels[k].y, labels[k - 1].y + LBL_GAP);
  const spill = labels.length ? labels[labels.length - 1].y - LBL_BOT : 0;
  spill > 0 &&
    labels.forEach((l) => {
      l.y -= spill;
    });
  for (let k = labels.length - 2; k >= 0; k--)
    labels[k].y = Math.min(
      labels[k].y,
      labels[k + 1].y - LBL_GAP,
    ); /* Push-up from a crowded bottom can drive the top label above the plot -- the
   leader's line ends highest, so its label is the one that gets clipped by the
   canvas top. Mirror the bottom-spill correction: if the stack overflowed the
   top, slide it all back down. The fits cap guarantees it clears the bottom. */
  const topSpill = labels.length ? LBL_TOP - labels[0].y : 0;
  topSpill > 0 &&
    labels.forEach((l) => {
      l.y += topSpill;
    }); /* Secondary encoding. Eight player colours cannot all stay distinct under
   red-green colour vision deficiency -- validated, the palette separates
   cleanly only up to about three simultaneous players -- and these lines are
   otherwise identified by colour alone. Prefix each end label with the
   player's initial so identity never depends on hue. */
  labels.forEach((l) => {
    const nm = (state.players[l.i]?.name || "?").trim().charAt(0).toUpperCase();
    ((ctx.fillStyle = playerColor(state.players[l.i])),
      ctx.fillText(nm + " " + fmtMoney(l.v), X(n - 1) + 6, l.y + 3.5));
  });
}
function moneyFlowHTML(id) {
  return computeRunningTotals().length < 2
    ? ""
    : '<div class="money-flow-wrap"><div class="money-flow-title">Money Flow · hole by hole</div><canvas id="' +
        id +
        '" class="money-flow-canvas"></canvas><div class="money-flow-legend">' +
        state.players
          .map(
            (p) =>
              '<span class="mf-key"><i style="background:' +
              esc(playerColor(p)) +
              '"></i>' +
              esc(p.name) +
              "</span>",
          )
          .join("") +
        "</div></div>";
}
function _pfName(p) {
  const n = (p && p.name) || "?";
  return n.length > 9 ? n.slice(0, 8) + "…" : n;
}
function renderHolePreview() {
  const el = document.getElementById("hole-preview");
  if (!el) return;
  const h = state.currentHole;
  if (("none" === state.gameType && !anySideBetActive()) || !holeIsComplete(h))
    return ((el.innerHTML = ""), void el.classList.add("hidden"));
  const d = (computeHoleMoney().find((r) => r.h === h) || { deltas: state.players.map(() => 0) })
    .deltas;
  if (d.every((v) => Math.abs(v) < 0.005))
    return (
      (el.innerHTML =
        '<div class="hp-title">This hole</div><div class="hp-none">No money changes hands on this hole.</div>'),
      void el.classList.remove("hidden")
    );
  const ranked = state.players.map((p, i) => ({ i: i, v: d[i] })).sort((a, b) => b.v - a.v);
  el.classList.remove("hidden");
  el.innerHTML =
    '<div class="hp-title">This hole' +
    (state.confirmedHoles && state.confirmedHoles[h] ? "" : " · unconfirmed") +
    '</div><div class="hp-rows">' +
    ranked
      .map(
        (r) =>
          '<div class="hp-row">' +
          avatarHTML(state.players[r.i], 18) +
          '<span class="hp-name">' +
          esc(state.players[r.i].name) +
          "</span>" +
          '<span class="hp-amt ' +
          (r.v > 0.005 ? "match-up" : r.v < -0.005 ? "match-dn" : "") +
          '">' +
          fmtMoney(r.v) +
          "</span></div>",
      )
      .join("") +
    "</div>";
}
function renderPlayFeed() {
  const el = document.getElementById("play-feed");
  if (!el) return;
  if ("none" === state.gameType) return ((el.innerHTML = ""), void el.classList.add("hidden"));
  const rows = computeHoleMoney();
  if (!rows.length) return ((el.innerHTML = ""), void el.classList.add("hidden"));
  el.className = "card sc-collapsible" + (scCollapsed("feed") ? " collapsed" : "");
  const items = rows
    .slice(-12)
    .reverse()
    .map(({ h, deltas }) => {
      const par = state.pars[h] || 4,
        wh = state.wolfHoles && state.wolfHoles[h],
        gross = state.players.map((p, i) => (state.scores[i] ? state.scores[i][h] : null)),
        story = [];
      if (wh && wh.conceded)
        story.push(
          "wolf" === wh.conceded
            ? ico("wolf") + " Lone side concedes the hole"
            : ico("wolf") + " The pack concedes the hole",
        );
      else {
        const valid = gross.filter((v) => null != v);
        if (valid.length) {
          const best = Math.min(...valid),
            who = state.players.filter((p, i) => gross[i] === best).map(_pfName),
            d = best - par,
            lbl = 0 === d ? "par" : d < 0 ? "" : "+" + d;
          who.length >= state.players.length
            ? story.push("All square at " + (lbl || best))
            : d <= -2
              ? story.push(who.join(" & ") + " — eagle!")
              : -1 === d
                ? story.push(who.join(" & ") + " — birdie")
                : story.push(
                    who.join(" & ") + (who.length > 1 ? " take" : " takes") + " low (" + lbl + ")",
                  );
        }
      }
      wh &&
        Array.isArray(wh.partners) &&
        0 === wh.partners.length &&
        story.unshift(
          ico("wolf") +
            " " +
            esc((state.players[wh.wolf] || {}).name || "Wolf") +
            " goes Lone Wolf",
        );
      wh && wh.hammers > 0 && story.push("Hammer ×" + wh.hammers);
      const winners = deltas
        .map((v, i) => ({ v: v, i: i }))
        .filter((o) => o.v > 0.005)
        .sort((a, b) => b.v - a.v);
      let money = winners.length
        ? winners.map((o) => esc(_pfName(state.players[o.i])) + " " + fmtMoney(o.v)).join(" · ")
        : "skins" === state.gameType
          ? "carries"
          : "";
      return (
        '<div class="pf-item"><div class="pf-hole"><div class="pf-hn">' +
        (h + 1) +
        '</div><div class="pf-par">PAR ' +
        par +
        '</div></div><div class="pf-text">' +
        esc(story.join(" · ")) +
        '</div><div class="pf-money' +
        (winners.length ? " up" : "") +
        '">' +
        money +
        "</div></div>"
      );
    });
  el.innerHTML =
    scHead("Play by Play", "feed") + '<div class="pf-list">' + items.join("") + "</div>";
}
let _ribPrev = null;
function animateRibbon(rb, vals) {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    prev = _ribPrev;
  _ribPrev = vals.slice();
  if (reduce || !prev) return;
  rb.querySelectorAll(".rib-amt[data-i]").forEach((el) => {
    const i = +el.dataset.i,
      from = prev[i] || 0,
      to = vals[i];
    if (Math.abs(to - from) < 0.01) return;
    const t0 = performance.now(),
      dur = 600;
    requestAnimationFrame(function step(ts) {
      const p = Math.min((ts - t0) / dur, 1),
        ease = 1 - Math.pow(1 - p, 3);
      ((el.textContent = fmtMoney(from + (to - from) * ease)),
        p < 1 ? requestAnimationFrame(step) : (el.textContent = fmtMoney(to)));
    });
  });
}
function scCollapsed(k) {
  try {
    const v = localStorage.getItem("sc-collapse-" + k);
    return "1" === v;
  } catch (e) {
    return !1;
  }
}
function toggleScCollapse(k, el) {
  const now = !scCollapsed(k);
  try {
    localStorage.setItem("sc-collapse-" + k, now ? "1" : "0");
  } catch (e) {}
  ((el = el && el.closest(".sc-collapsible")), el && el.classList.toggle("collapsed", now));
}
function scHead(title, key) {
  return (
    '<div class="sc-collapse-head" data-act="toggleScCollapse(\'' +
    key +
    '\',this)" role="button" tabindex="0" aria-label="Toggle ' +
    title +
    '"><span class="sc-collapse-title">' +
    title +
    '</span><span class="sc-chevron" aria-hidden="true"><i data-ico="down"></i></span></div>'
  );
}
/* The breakdown under each row is hidden until somebody taps it -- but it used
   to be built and parsed into the DOM for every played hole on every render.
   By the 18th, with a full roster, that is 18 breakdowns nobody asked for,
   rebuilt on every score tap. Measured on a 12-player Wolf round at hole 9 on
   a 6x-throttled CPU, this function was 4.3ms of a 13.6ms renderHole().
   The row now carries its hole number and the breakdown is built on first
   open; `deltas` comes back from computeHoleMoney(), which is memoised behind
   the same cache the rest of the screen reads. */
function holeMoneyDetailHTML(hole) {
  const rows = computeHoleMoney(),
    row = rows.find((r) => r.h === hole);
  if (!row) return "";
  const hc = getPlayingHandicaps(),
    deltas = row.deltas,
    isWolf = "wolf" === state.gameType;
  let s = "";
  if (isWolf) {
    const wh = state.wolfHoles[hole] || {},
      wolf = Number.isInteger(wh.wolf) ? wh.wolf : getWolfForHole(hole),
      shuck = null != wh.shuck,
      lone = wh.partners && 0 === wh.partners.length && !shuck,
      blindPick = wh.blindPick,
      blindLone = wh.blind,
      hammers = wh.hammers || 0,
      mult = [];
    shuck
      ? mult.push("Shuck 2×")
      : blindLone
        ? mult.push("Blind Lone 3×")
        : lone
          ? mult.push("Lone Wolf 2×")
          : blindPick
            ? mult.push("Blind Pick 2×")
            : mult.push("Normal 1×");
    hammers > 0 && mult.push("Hammer " + Math.pow(2, hammers) + "×");
    const rawScores = state.players.map((p, i) => state.scores[i][hole]),
      best =
        (shuck ? (state.scores[wh.shuck]?.[hole] ?? 99) : Math.min(...rawScores)) -
        state.pars[hole];
    -1 === best && deltas.some((v) => Math.abs(v) > 0.01)
      ? mult.push("Birdie 2×")
      : best <= -2 && deltas.some((v) => Math.abs(v) > 0.01) && mult.push("Eagle 3×");
    let res;
    if (deltas.every((v) => Math.abs(v) < 0.01)) res = "Tie — no money moves";
    else if (shuck)
      res = esc(state.players[wh.shuck].name) + (deltas[wh.shuck] > 0 ? " wins" : " loses");
    else {
      const winTeam = lone || blindLone ? [wolf] : [wolf, ...(wh.partners || [])],
        others = state.players.map((p, i) => i).filter((i) => !winTeam.includes(i));
      res =
        deltas[wolf] > 0
          ? winTeam.map((i) => esc(state.players[i].name)).join(" & ") + " win"
          : others.map((i) => esc(state.players[i].name)).join(" & ") + " win";
    }
    s += "<div><strong>Wolf:</strong> " + esc(state.players[wolf].name) + "</div>";
    shuck
      ? (s +=
          "<div><strong>Shuck:</strong> " +
          esc(state.players[wh.shuck].name) +
          " vs everyone</div>")
      : lone || blindLone
        ? (s += "<div><strong>Lone Wolf</strong></div>")
        : wh.partners &&
          wh.partners.length &&
          (s +=
            "<div><strong>Partner:</strong> " +
            wh.partners.map((i) => esc(state.players[i].name)).join(", ") +
            "</div>");
    s +=
      "<div><strong>Result:</strong> " +
      res +
      "</div><div><strong>Multiplier:</strong> " +
      mult.join(" × ") +
      "</div>";
  } else {
    const winners = state.players.map((p, i) => i).filter((i) => deltas[i] > 0.01),
      res = deltas.every((v) => Math.abs(v) < 0.01)
        ? "Tie — no money moved"
        : winners.map((i) => esc(state.players[i].name)).join(" & ") + " won the hole";
    s += "<div><strong>Result:</strong> " + res + "</div>";
  }
  s +=
    "<div><strong>Scores:</strong> " +
    state.players
      .map(
        (p, i) =>
          esc(p.name.slice(0, 3)) +
          ":" +
          state.scores[i][hole] +
          "(net " +
          (state.scores[i][hole] - getStrokesOnHole(hc[i], hole)) +
          ")",
      )
      .join(" | ") +
    "</div>";
  return s;
}
/* Built once per open. A later render replaces the row wholesale, which drops
   the built flag with it -- correct, because the numbers underneath may have
   changed. */
function toggleHoleLogDetail(rowEl, hole) {
  const d = rowEl.nextElementSibling;
  if (!d) return;
  d.dataset.built || ((d.innerHTML = holeMoneyDetailHTML(hole)), (d.dataset.built = "1"));
  d.classList.toggle("hidden");
}
function renderHoleMoneyLog() {
  const el = document.getElementById("hole-money-log");
  if (!el) return;
  if ("none" === state.gameType) return void (el.innerHTML = "");
  const rows = computeHoleMoney();
  if (!rows.length) return void (el.innerHTML = "");
  el.className = "card sc-collapsible" + (scCollapsed("moneylog") ? " collapsed" : "");
  let s =
    scHead("Hole-by-Hole Money", "moneylog") +
    '<div class="hole-log-table"><div class="hole-log-row hole-log-header"><span class="hole-log-cell">H</span>';
  state.players.forEach((p) => {
    s += '<span class="hole-log-cell">' + esc(p.name.slice(0, 4)) + "</span>";
  });
  s += "</div>";
  rows.forEach(({ h: hole, deltas }) => {
    s +=
      '<div class="hole-log-row hole-log-clickable" data-act="toggleHoleLogDetail(this,' +
      hole +
      ')" role="button" tabindex="0"><span class="hole-log-cell">' +
      ((state.holeStart || 0) + hole + 1) +
      "</span>";
    deltas.forEach((v) => {
      s +=
        '<span class="hole-log-cell ' +
        (v > 0.01 ? "hl-win" : v < -0.01 ? "hl-lose" : "") +
        '">' +
        (Math.abs(v) < 0.01 ? "·" : fmtMoney(v)) +
        "</span>";
    });
    s += '</div><div class="hole-log-detail hidden"></div>';
  });
  s += '<div class="hole-log-row hole-log-total"><span class="hole-log-cell">Σ</span>';
  s += state.players
    .map((p, i) => {
      const tot = rows.reduce((acc, r) => acc + r.deltas[i], 0);
      return (
        '<span class="hole-log-cell ' +
        (tot > 0.01 ? "hl-win" : tot < -0.01 ? "hl-lose" : "") +
        '">' +
        (Math.abs(tot) < 0.01 ? "·" : fmtMoney(tot)) +
        "</span>"
      );
    })
    .join("");
  s += "</div></div>";
  el.innerHTML = s;
}
