function showStrokes() {
  const el = document.getElementById("strokes-content"),
    mode = state.handicapMode || document.getElementById("handicap-mode")?.value || "full";
  if ("none" === mode) {
    el.innerHTML = '<div class="strokes-meta">Playing scratch — no strokes given this round.</div>';
    return (
      document.getElementById("strokes-modal").classList.remove("hidden"),
      void openModalA11y("strokes-modal")
    );
  }
  const hc = state.players.map((e) => e.hdcp),
    low = Math.min(...hc),
    lowName = state.players[hc.indexOf(low)]?.name || "",
    note = "80pct" === mode ? " · 80% handicap" : "course" === mode ? " · course handicap" : "";
  let s = `<div class="strokes-meta"><strong>${esc(lowName)}</strong> plays scratch (off the low man)${note}. Everyone else gets strokes on their hardest-rated holes.</div><div class="strokes-players">`;
  strokesData().forEach((d) => {
    s += `<div class="strokes-player"><div class="strokes-player-top">${avatarHTML(d.player, 12)}<span class="strokes-name">${esc(d.name)}</span><span class="strokes-count">${d.h > 0 ? d.h + " stroke" + (d.h > 1 ? "s" : "") : "Scratch"}</span></div>`;
    if (d.h > 0) {
      s += '<div class="strokes-holes">';
      d.singles.length &&
        (s += `<div><span class="stroke-dot-label">●</span> Hole${d.singles.length > 1 ? "s" : ""} ${d.singles.join(", ")}</div>`);
      d.doubles.length &&
        (s += `<div><span class="stroke-dot-label double">●●</span> Hole${d.doubles.length > 1 ? "s" : ""} ${d.doubles.join(", ")} (2 strokes)</div>`);
      s += "</div>";
    }
    s += "</div>";
  });
  s += "</div>";
  el.innerHTML = s;
  (document.getElementById("strokes-modal").classList.remove("hidden"),
    openModalA11y("strokes-modal"));
}
function maybeShowStrokesAtStart() {
  try {
    if ("none" === (state.handicapMode || "full")) return;
    getPlayingHandicaps().some((h) => h > 0) && setTimeout(showStrokes, 350);
  } catch (e) {}
}
function scorecardMoneyHTML() {
  if ("none" === state.gameType) return "";
  const rows = computeHoleMoney();
  if (!rows.length) return "";
  const mh = {};
  rows.forEach((r) => (mh[r.h] = r.deltas));
  const n = Math.min(9, maxHole()),
    hasBack = maxHole() > 9,
    mc = (v) => (v > 0.01 ? "sc-win" : v < -0.01 ? "sc-lose" : ""),
    cell = (v) =>
      null == v
        ? "<td>·</td>"
        : '<td class="' + mc(v) + '">' + (Math.abs(v) < 0.01 ? "·" : fmtMoney(v)) + "</td>";
  let s =
    '<div class="scorecard-money-title">Hole-by-Hole Money</div><table class="scorecard-tbl"><thead><tr><th></th>';
  for (let h = 0; h < n; h++) s += "<th>" + ((state.holeStart || 0) + h + 1) + "</th>";
  s += '<th class="total-col">OUT</th>';
  if (hasBack) {
    for (let h = 9; h < maxHole(); h++) s += "<th>" + ((state.holeStart || 0) + h + 1) + "</th>";
    s += '<th class="total-col">IN</th>';
  }
  s += '<th class="total-col">TOT</th></tr></thead><tbody>';
  state.players.forEach((p, i) => {
    s += '<tr><td style="white-space:nowrap">' + esc(p.name) + "</td>";
    let out = 0,
      inn = 0,
      haveOut = !1,
      haveIn = !1;
    for (let h = 0; h < n; h++) {
      const v = mh[h] ? mh[h][i] : null;
      null != v && ((out += v), (haveOut = !0));
      s += cell(v);
    }
    s +=
      '<td class="total-col ' +
      (haveOut ? mc(out) : "") +
      '">' +
      (haveOut ? fmtMoney(out) : "·") +
      "</td>";
    if (hasBack) {
      for (let h = 9; h < maxHole(); h++) {
        const v = mh[h] ? mh[h][i] : null;
        null != v && ((inn += v), (haveIn = !0));
        s += cell(v);
      }
      s +=
        '<td class="total-col ' +
        (haveIn ? mc(inn) : "") +
        '">' +
        (haveIn ? fmtMoney(inn) : "·") +
        "</td>";
    }
    const tot = out + inn;
    s +=
      '<td class="total-col ' +
      (haveOut || haveIn ? mc(tot) : "") +
      '">' +
      (haveOut || haveIn ? fmtMoney(tot) : "·") +
      "</td></tr>";
  });
  s += "</tbody></table>";
  return s;
}
function showScorecard() {
  const e = document.getElementById("scorecard-modal"),
    t = document.getElementById("scorecard-table-wrap"),
    a = getPlayingHandicaps();
  let s = '<table class="scorecard-tbl"><thead><tr><th></th>';
  const n = Math.min(9, maxHole()),
    o = maxHole() > 9;
  for (let e = 0; e < n; e++) s += `<th>${hLbl(e)}</th>`;
  if (((s += '<th class="total-col">OUT</th>'), o)) {
    for (let e = 9; e < maxHole(); e++) s += `<th>${hLbl(e)}</th>`;
    s += '<th class="total-col">IN</th>';
  }
  ((s += '<th class="total-col">TOT</th><th class="total-col">NET</th></tr></thead><tbody>'),
    (s += '<tr class="par-row"><td>Par</td>'));
  let l = 0,
    r = 0;
  for (let e = 0; e < n; e++) ((s += `<td>${state.pars[e]}</td>`), (l += state.pars[e]));
  if (((s += `<td class="total-col">${l}</td>`), o)) {
    for (let e = 9; e < maxHole(); e++) ((s += `<td>${state.pars[e]}</td>`), (r += state.pars[e]));
    s += `<td class="total-col">${r}</td>`;
  }
  ((s += `<td class="total-col">${l + r}</td><td></td></tr>`),
    state.players.forEach((e, t) => {
      s += `<tr><td style="white-space:nowrap">${esc(e.name)} (${a[t]})</td>`;
      let l = 0,
        r = 0,
        i = 0;
      for (let e = 0; e < n; e++) {
        const a = state.scores[t][e],
          n = cellClass(a, state.pars[e]);
        ((s += `<td class="${n}">${a ?? "-"}</td>`), null != a && (l += a));
      }
      if (((s += `<td class="total-col">${l || "-"}</td>`), o)) {
        for (let e = 9; e < maxHole(); e++) {
          const a = state.scores[t][e],
            n = cellClass(a, state.pars[e]);
          ((s += `<td class="${n}">${a ?? "-"}</td>`), null != a && (r += a));
        }
        s += `<td class="total-col">${r || "-"}</td>`;
      }
      for (let e = 0; e < maxHole(); e++) {
        const a = getNetScore(t, e);
        null != a && (i += a);
      }
      s += `<td class="total-col">${l + r || "-"}</td><td class="total-col">${i || "-"}</td></tr>`;
    }),
    "wolf" === state.gameType &&
      (() => {
        const _wm = {};
        computeHoleMoney().forEach((r) => (_wm[r.h] = r.deltas));
        const _wc = (v) =>
          null == v
            ? "<td>-</td>"
            : `<td class="${v > 0.01 ? "hl-win" : v < -0.01 ? "hl-lose" : ""}">${Math.abs(v) < 0.01 ? "·" : (v > 0 ? "+" : "") + v.toFixed(0)}</td>`;
        const _wt = (v, have) =>
          `<td class="total-col ${v > 0.01 ? "hl-win" : v < -0.01 ? "hl-lose" : ""}">${have ? (Math.abs(v) < 0.01 ? "·" : (v > 0 ? "+" : "") + v.toFixed(0)) : "·"}</td>`;
        state.players.forEach((e, t) => {
          s += `<tr><td style="white-space:nowrap;color:${esc(e.color)};font-weight:700">${esc(e.name.slice(0, 6))}</td>`;
          let a = 0,
            l = 0,
            haveOut = !1,
            haveIn = !1;
          for (let h = 0; h < n; h++) {
            const v = _wm[h] ? _wm[h][t] : null;
            if (null != v) {
              a += v;
              haveOut = !0;
            }
            s += _wc(v);
          }
          s += _wt(a, haveOut);
          if (o) {
            for (let h = 9; h < maxHole(); h++) {
              const v = _wm[h] ? _wm[h][t] : null;
              if (null != v) {
                l += v;
                haveIn = !0;
              }
              s += _wc(v);
            }
            s += _wt(l, haveIn);
          }
          s += _wt(a + l, haveOut || haveIn) + "<td></td></tr>";
        });
      })(),
    (s += "</tbody></table>"),
    (s += scorecardMoneyHTML()),
    (t.innerHTML = s),
    e.classList.remove("hidden"),
    openModalA11y("scorecard-modal"));
}
function shareRoundRecap() {
  if (!roundHasScores()) return void showToast("Play a few holes first.", { type: "info" });
  showToast("Building recap…", { type: "info", duration: 6000 });
  loadHtml2Canvas()
    .then(() => {
      const nets = roundNetsToCents(calcMoney()),
        order = state.players.map((p, i) => i).sort((a, b) => nets[b] - nets[a]),
        pays = computeSettlement(nets),
        rows = computeHoleMoney(),
        card = document.createElement("div");
      const _bg = cssVar("--card", "#141e18"),
        _ink = cssVar("--ink", "#eaf4ee"),
        _acc = cssVar("--accent", "#f5c451"),
        _mut = cssVar("--muted", "#93a89b"),
        _rule = cssVar("--rule-strong", "rgba(255,255,255,.18)"),
        _ruleS = cssVar("--rule", "rgba(255,255,255,.08)"),
        _up = cssVar("--up", "#35e08a"),
        _dn = cssVar("--down", "#ff6a58");
      card.style.cssText =
        "width:420px;padding:22px;background:" +
        _bg +
        ";color:" +
        _ink +
        ";font-family:var(--font-display);";
      let html =
        '<div style="font-size:12px;letter-spacing:3px;color:"+_acc+";text-transform:uppercase">The Press</div>' +
        '<div style="font-size:24px;font-weight:700;margin:4px 0 2px">' +
        esc(state.course || "Round") +
        "</div>" +
        '<div style="font-size:12px;color:"+_mut+";margin-bottom:16px">' +
        esc(GAME_NAMES[state.gameType] || state.gameType || "") +
        " · " +
        rows.length +
        " holes · " +
        new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }) +
        "</div>";
      html += '<div style="border-top:1px solid "+_rule+"">';
      order.forEach((i, k) => {
        const v = nets[i];
        html +=
          '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid "+_ruleS+"">' +
          '<span style="width:16px;color:"+_acc+";font-weight:700">' +
          (k + 1) +
          "</span>" +
          '<span style="flex:1;font-weight:700">' +
          esc(state.players[i].name) +
          "</span>" +
          '<span style="font-family:monospace;font-weight:700;color:' +
          (v > 0.005 ? _up : v < -0.005 ? _dn : _mut) +
          '">' +
          fmtMoney(v) +
          "</span></div>";
      });
      html += "</div>";
      pays.length &&
        (html +=
          '<div style="margin-top:14px;font-size:11px;letter-spacing:2px;color:"+_acc+";text-transform:uppercase">Settle up</div>' +
          pays
            .map(
              (t) =>
                '<div style="font-size:13px;padding:4px 0">' +
                esc(state.players[t.from].name) +
                " → " +
                esc(state.players[t.to].name) +
                ' <span style="font-family:monospace;font-weight:700">' +
                fmtMoney(t.amt).replace("+", "") +
                "</span></div>",
            )
            .join(""));
      card.innerHTML = html;
      document.body.appendChild(card);
      html2canvas(card, { scale: 2, backgroundColor: _bg })
        .then((cv) => {
          document.body.removeChild(card);
          cv.toBlob((bl) => {
            const f = new File([bl], "thepress-recap.png", { type: "image/png" });
            navigator.share && navigator.canShare?.({ files: [f] })
              ? navigator.share({ files: [f], title: "Round recap" }).catch(() => downloadBlob(bl))
              : downloadBlob(bl);
          });
        })
        .catch(() => {
          (document.body.removeChild(card),
            showToast("Could not build the recap.", { type: "error" }));
        });
    })
    .catch(() => showToast("Could not load image library.", { type: "error" }));
}
function shareScorecard() {
  const e = document.getElementById("scorecard-table-wrap");
  e &&
    (showToast("Generating image…", { type: "info", duration: 6000 }),
    loadHtml2Canvas()
      .then(() => {
        const t = document.createElement("div");
        const _sbg = cssVar("--card", "#fff"),
          _sink = cssVar("--ink", "#111");
        ((t.style.cssText =
          "padding:16px;background:" +
          _sbg +
          ";color:" +
          _sink +
          ";font-family:Archivo,-apple-system,sans-serif;"),
          (t.innerHTML =
            '<div style="text-align:center;margin-bottom:10px;font-weight:700;font-size:14px">' +
            esc(state.course || "The Press") +
            "</div>" +
            e.innerHTML),
          document.body.appendChild(t),
          html2canvas(t, { scale: 2, backgroundColor: _sbg })
            .then((e) => {
              (document.body.removeChild(t),
                e.toBlob((e) => {
                  const t = new File([e], "thepress-scorecard.png", { type: "image/png" });
                  navigator.share && navigator.canShare?.({ files: [t] })
                    ? navigator
                        .share({ files: [t], title: "Scorecard" })
                        .catch(() => downloadBlob(e))
                    : downloadBlob(e);
                }));
            })
            .catch(() => {
              (document.body.removeChild(t),
                showToast("Could not capture scorecard.", { type: "error" }));
            }));
      })
      .catch(() => showToast("Could not load image library.", { type: "error" })));
}
function cellClass(e, t) {
  if (null == e) return "";
  const a = e - t;
  return a <= -2
    ? "eagle-cell"
    : -1 === a
      ? "birdie-cell"
      : 1 === a
        ? "bogey-cell"
        : a >= 2
          ? "double-cell"
          : "";
}
function roundNetsToCents(nets) {
  if (!nets.length) return nets;
  const cents = nets.map((v) => Math.floor(v * 100)),
    rem = nets.map((v, i) => ({ i: i, r: v * 100 - cents[i] }));
  let short = Math.round(nets.reduce((s, v) => s + v, 0) * 100) - cents.reduce((s, v) => s + v, 0);
  rem.sort((a, b) => b.r - a.r);
  for (let k = 0; k < short; k++) cents[rem[k % rem.length].i] += 1;
  return cents.map((c) => c / 100);
} /* Settle in whole cents. Repeatedly subtracting floats drifted the running
   balances, and the "close enough" cutoff (<$0.01) then abandoned a genuine
   remaining cent -- so "who pays who" could fail to reconcile with the payout
   table above it by a penny. Integer cents drain exactly. */
function computeSettlement(nets) {
  const c = nets.map((v) => Math.round(100 * v)),
    out = [];
  for (;;) {
    let hi = 0,
      lo = 0;
    for (let i = 1; i < c.length; i++) (c[i] > c[hi] && (hi = i), c[i] < c[lo] && (lo = i));
    if (c[hi] <= 0 || c[lo] >= 0) break;
    const amt = Math.min(c[hi], -c[lo]);
    (out.push({ from: lo, to: hi, amt: amt / 100 }), (c[hi] -= amt), (c[lo] += amt));
  }
  return out;
}
/* Swing grid: a colour field of each player's money on each played hole --
   green won, red lost, deeper = bigger swing. Pure CSS cells so it also renders
   into the shared results image (html2canvas). */
function swingHeatmapHTML() {
  const rows = computeHoleMoney();
  if (rows.length < 2 || "none" === state.gameType) return "";
  let maxAbs = 0;
  rows.forEach((r) =>
    r.deltas.forEach((v) => {
      const a = Math.abs(v);
      a > maxAbs && (maxAbs = a);
    }),
  );
  if (maxAbs < 0.01) return "";
  const cell = (v) => {
    const a = Math.abs(v);
    if (a < 0.01) return '<div class="sg-cell" title="—"></div>';
    const op = (0.3 + 0.6 * Math.min(1, a / maxAbs)).toFixed(2);
    return (
      '<div class="sg-cell ' +
      (v > 0 ? "win" : "lose") +
      '" style="opacity:' +
      op +
      '" title="' +
      fmtMoney(v) +
      '"></div>'
    );
  };
  let h =
    '<div class="swing-grid-wrap"><div class="swing-grid-title">Swing grid · money won per hole</div><div class="swing-grid-scroll"><div class="swing-grid" style="grid-template-columns:auto repeat(' +
    rows.length +
    ',var(--sg-cw))">';
  h += "<div></div>";
  rows.forEach((r) => {
    h += '<div class="sg-hole">' + ((state.holeStart || 0) + r.h + 1) + "</div>";
  });
  state.players.forEach((p, i) => {
    h +=
      '<div class="sg-player">' +
      avatarHTML(p, 8) +
      "<span>" +
      esc(p.name.split(" ")[0]) +
      "</span></div>";
    rows.forEach((r) => {
      h += cell(r.deltas[i]);
    });
  });
  h +=
    '</div></div><div class="sg-legend"><span class="sg-key lose"></span>Lost<span class="sg-key win" style="margin-left:10px"></span>Won<span class="sg-note">deeper = bigger swing</span></div></div>';
  return h;
}
/* Per-player box score for the finish screen. */
function statCardsHTML() {
  const N = maxHole();
  let any = !1;
  const cards = state.players.map((p, i) => {
    const c = { eagle: 0, birdie: 0, par: 0, bogey: 0, worse: 0 };
    let best = 99,
      bestH = -1,
      gross = 0,
      net = 0,
      parSum = 0,
      junk = 0;
    for (let h = 0; h < N; h++) {
      const s = state.scores[i]?.[h];
      if (null == s) continue;
      any = !0;
      const d = s - state.pars[h];
      gross += s;
      net += getNetScore(i, h) ?? 0;
      parSum += state.pars[h];
      d <= -2
        ? c.eagle++
        : -1 === d
          ? c.birdie++
          : 0 === d
            ? c.par++
            : 1 === d
              ? c.bogey++
              : c.worse++;
      d < best && ((best = d), (bestH = h));
      junk += getBonusCount(i, h);
    }
    const toPar = gross - parSum,
      tpl = 0 === toPar ? "E" : (toPar > 0 ? "+" : "") + toPar,
      bl =
        best <= -2
          ? "Eagle"
          : -1 === best
            ? "Birdie"
            : 0 === best
              ? "Par"
              : 1 === best
                ? "Bogey"
                : "+" + best;
    let line = "";
    c.eagle &&
      (line += "<span><b>" + c.eagle + "</b> eagle" + (c.eagle > 1 ? "s" : "") + "</span>");
    line +=
      "<span><b>" +
      c.birdie +
      "</b> birdie" +
      (1 === c.birdie ? "" : "s") +
      "</span><span><b>" +
      c.par +
      "</b> par" +
      (1 === c.par ? "" : "s") +
      "</span><span><b>" +
      c.bogey +
      "</b> bogey" +
      (1 === c.bogey ? "" : "s") +
      "</span>";
    c.worse && (line += "<span><b>" + c.worse + "</b> double+</span>");
    junk > 0 && (line += "<span><b>" + junk + "</b> junk</span>");
    return (
      '<div class="stat-card"><div class="stat-card-top">' +
      avatarHTML(p, 10) +
      '<span class="stat-card-name">' +
      esc(p.name) +
      '</span><span class="stat-card-net">' +
      tpl +
      " · net " +
      net +
      '</span></div><div class="stat-line">' +
      line +
      "</div>" +
      (bestH >= 0
        ? '<div class="stat-best">Best hole: <b>' +
          bl +
          "</b> on " +
          ((state.holeStart || 0) + bestH + 1) +
          "</div>"
        : "") +
      "</div>"
    );
  });
  return any
    ? '<div class="stat-cards-title">Player cards</div><div class="stat-cards">' +
        cards.join("") +
        "</div>"
    : "";
}
/* Who-pays-whom as bars sized by amount, with the pay button inline. */
function settlementFlowHTML(nets, withPay) {
  const s = computeSettlement(nets);
  if (!s.length) return '<div class="hint">All square — no payments needed!</div>';
  const max = Math.max(...s.map((x) => x.amt));
  let h = '<div class="flow-diagram">';
  s.forEach((t) => {
    const w = Math.max(6, Math.round((100 * t.amt) / max)),
      from = state.players[t.from],
      to = state.players[t.to],
      pay = withPay ? venmoBtn(t.to, t.amt) : "",
      amt = fmtMoney(t.amt).replace("+", "");
    h +=
      '<div class="flow-row" aria-label="' +
      esc(from.name) +
      " pays " +
      esc(to.name) +
      " " +
      amt +
      '"><div class="flow-head"><span class="flow-person">' +
      avatarHTML(from, 9) +
      '<span class="flow-nm">' +
      esc(from.name) +
      '</span></span><span class="flow-arrow" aria-hidden="true"><i data-ico="arrowRight"></i></span><span class="flow-person">' +
      avatarHTML(to, 9) +
      '<span class="flow-nm">' +
      esc(to.name) +
      '</span></span><span class="flow-amt">' +
      amt +
      '</span></div><div class="flow-track"><div class="flow-fill" style="width:' +
      w +
      '%"></div></div>' +
      (pay ? '<div class="flow-pay">' + pay + "</div>" : "") +
      "</div>";
  });
  h += "</div>";
  return h;
}
/* Skins by hole: a winner's token on each hole they took the skin, a hollow
   dashed pin where the skin carried. */
function skinsStripHTML() {
  if ("skins" !== state.gameType) return "";
  const cells = [];
  for (let h = 0; h <= state.currentHole; h++) {
    const s = netRow(h);
    if (s.some((v) => null == v)) continue;
    const mn = Math.min(...s);
    cells.push(1 === s.filter((v) => v === mn).length ? { w: s.indexOf(mn) } : { carry: !0 });
  }
  if (!cells.length) return "";
  let h =
    '<div class="skins-strip-wrap"><div class="skins-strip-title">Skins by hole</div><div class="skins-strip">';
  let hole = 0,
    shown = 0;
  for (let i = 0; i <= state.currentHole; i++) {
    const s = netRow(i);
    if (s.some((v) => null == v)) continue;
    const lbl = (state.holeStart || 0) + i + 1,
      c = cells[shown++];
    h +=
      '<div class="skin-pin"' +
      (c.carry ? "" : ' title="Hole ' + lbl + ": " + esc(state.players[c.w].name) + '"') +
      ">" +
      (c.carry
        ? '<span class="skin-carry" title="Hole ' + lbl + ': carried"></span>'
        : avatarHTML(state.players[c.w], 20, !0)) +
      "<span>" +
      lbl +
      "</span></div>";
  }
  h += "</div></div>";
  return h;
}
/* Fun single-round "awards" for the finish screen. Purely descriptive: every
   number is derived from the same scores/pars/money the rest of the results
   already show, so this never changes what anyone owes. Each award is gated by
   a threshold and only shows a real, non-trivial standout, and a few are
   specific to the game that was played (skins, wolf). */
function roundSuperlativesHTML() {
  const P = state.players,
    N = maxHole();
  if (!P || P.length < 2 || N < 1) return "";
  const holeLbl = (h) => (state.holeStart || 0) + h + 1;
  const first = (i) => esc(P[i].name.split(" ")[0]);
  /* Per-player scoring aggregates over the holes that have a score. */
  const agg = P.map(() => ({
    gross: 0,
    parSum: 0,
    played: 0,
    birdiePlus: 0,
    pars: 0,
    best: 99,
    worst: -99,
    worstHole: -1,
    junk: 0,
    bounce: 0,
    bestStreak: 0,
  }));
  let anyScore = !1;
  for (let i = 0; i < P.length; i++) {
    const a = agg[i];
    let streak = 0,
      prevOver = !1;
    for (let h = 0; h < N; h++) {
      const s = state.scores[i]?.[h];
      if (null == s) {
        streak = 0;
        prevOver = !1;
        continue;
      }
      anyScore = !0;
      const d = s - state.pars[h];
      a.gross += s;
      a.parSum += state.pars[h];
      a.played++;
      if (d <= -1) a.birdiePlus++;
      if (0 === d) a.pars++;
      if (d < a.best) a.best = d;
      if (d > a.worst) {
        a.worst = d;
        a.worstHole = h;
      }
      a.junk += getBonusCount(i, h);
      if (d <= 0) {
        streak++;
        if (streak > a.bestStreak) a.bestStreak = streak;
      } else streak = 0;
      if (d <= 0 && prevOver) a.bounce++;
      prevOver = d > 0;
    }
  }
  if (!anyScore) return "";
  const toPar = agg.map((a) => (a.played ? a.gross - a.parSum : null));
  /* Money per player: total, biggest single-hole win, holes won. */
  let money = null;
  if ("none" !== state.gameType) {
    money = P.map(() => ({ total: 0, bigWin: 0, bigHole: -1 }));
    computeHoleMoney().forEach((r) => {
      r.deltas.forEach((v, i) => {
        money[i].total += v;
        if (v > money[i].bigWin) {
          money[i].bigWin = v;
          money[i].bigHole = r.h;
        }
      });
    });
  }
  /* Skins won per player (mirrors skinsStripHTML's low-net logic). */
  let skins = null;
  if ("skins" === state.gameType) {
    skins = P.map(() => 0);
    for (let h = 0; h < N; h++) {
      const ns = P.map((p, i) => getNetScore(i, h));
      if (ns.some((v) => null == v)) continue;
      const mn = Math.min(...ns);
      if (1 === ns.filter((v) => v === mn).length) skins[ns.indexOf(mn)]++;
    }
  }
  /* Lone-wolf count: holes the wolf took on the field with no partner. */
  let lone = null;
  if ("wolf" === state.gameType && state.wolfHoles) {
    lone = P.map(() => 0);
    for (let h = 0; h < N; h++) {
      const w = state.wolfHoles[h];
      if (w && !w.fixedPairs && null != w.wolf && (null == w.partners || 0 === w.partners.length))
        lone[w.wolf]++;
    }
  }
  /* Pick the leader for a metric. cmp<0 keeps the smaller value (best score),
     cmp>0 the larger. Returns null below the threshold or on an all-tie. */
  const lead = (vals, dir, thr) => {
    let best = dir < 0 ? 1 / 0 : -1 / 0,
      idx = [];
    vals.forEach((v, i) => {
      if (null == v) return;
      if (dir < 0 ? v < best : v > best) {
        best = v;
        idx = [i];
      } else v === best && idx.push(i);
    });
    if (!idx.length || idx.length >= P.length) return null;
    if (null != thr && (dir < 0 ? best > thr : best < thr)) return null;
    return { idx: idx, val: best };
  };
  const out = [];
  const push = (award, desc, r, detail) => {
    if (!r) return;
    const names = r.idx.map((i) => esc(P[i].name)).join(" & "),
      av = 1 === r.idx.length ? avatarHTML(P[r.idx[0]], 9) : "";
    out.push(
      '<div class="sup-card"><div class="sup-body"><div class="sup-award">' +
        award +
        "</div>" +
        (desc ? '<div class="sup-desc">' + desc + "</div>" : "") +
        '<div class="sup-winner">' +
        av +
        '<span class="sup-name">' +
        names +
        "</span></div>" +
        (detail ? '<div class="sup-detail">' + detail + "</div>" : "") +
        "</div></div>",
    );
  };
  const tp = (v) => (0 === v ? "E" : (v > 0 ? "+" : "") + v);
  /* Lowest score of the day. */
  const med = lead(toPar, -1, null);
  if (med)
    push(
      "Medalist",
      "Lowest score of the day",
      med,
      agg[med.idx[0]].gross + " (" + tp(med.val) + ")" + (med.idx.length > 1 ? " · tied" : ""),
    );
  /* Most birdies-or-better. */
  push(
    "Birdie Hunter",
    "Racked up the most birdies",
    lead(
      agg.map((a) => a.birdiePlus),
      1,
      1,
    ),
    ((r) => r && r.val + " birdie" + (1 === r.val ? "" : "s") + " or better")(
      lead(
        agg.map((a) => a.birdiePlus),
        1,
        1,
      ),
    ),
  );
  /* Longest run of par-or-better. */
  push(
    "On a Heater",
    "Longest run of solid holes",
    lead(
      agg.map((a) => a.bestStreak),
      1,
      3,
    ),
    ((r) => r && r.val + " straight holes at par or better")(
      lead(
        agg.map((a) => a.bestStreak),
        1,
        3,
      ),
    ),
  );
  /* Most recoveries right after a blow-up. */
  push(
    "Bounce-Back",
    "Best at recovering after a bad hole",
    lead(
      agg.map((a) => a.bounce),
      1,
      2,
    ),
    ((r) => r && "clawed back " + r.val + " times after going over")(
      lead(
        agg.map((a) => a.bounce),
        1,
        2,
      ),
    ),
  );
  /* Biggest single-hole money swing. */
  if (money) {
    const r = lead(
      money.map((m) => m.bigWin),
      1,
      0.009,
    );
    push(
      "Biggest Swing",
      "Won the most on a single hole",
      r,
      r && fmtMoney(r.val) + " on hole " + holeLbl(money[r.idx[0]].bigHole),
    );
  }
  /* Skins collected. */
  if (skins)
    push(
      "Skin Collector",
      "Pocketed the most skins",
      lead(skins, 1, 1),
      ((r) => r && r.val + " skin" + (1 === r.val ? "" : "s") + " pocketed")(lead(skins, 1, 1)),
    );
  /* Lone wolf. */
  if (lone)
    push(
      "Lone Wolf",
      "Took on the field solo the most",
      lead(lone, 1, 1),
      ((r) => r && "went solo " + r.val + " time" + (1 === r.val ? "" : "s"))(lead(lone, 1, 1)),
    );
  /* Most junk / side-bet points. */
  push(
    "Trash King",
    "Cleaned up the side bets",
    lead(
      agg.map((a) => a.junk),
      1,
      1,
    ),
    ((r) => r && r.val + " junk point" + (1 === r.val ? "" : "s"))(
      lead(
        agg.map((a) => a.junk),
        1,
        1,
      ),
    ),
  );
  /* Biggest single-hole blow-up (a gentle roast). */
  const blow = lead(
    agg.map((a) => a.worst),
    1,
    3,
  );
  if (blow)
    push(
      "Blow-Up of the Day",
      "Roughest hole of the round",
      blow,
      "+" + blow.val + " on hole " + holeLbl(agg[blow.idx[0]].worstHole),
    );
  if (!out.length) return "";
  const gname = GAME_NAMES[state.gameType] || state.gameType;
  return (
    '<div class="superlatives-wrap"><div class="superlatives-head"><span class="sup-kicker">Superlatives</span>' +
    ("none" === state.gameType ? "" : '<span class="sup-game">' + esc(gname) + "</span>") +
    '</div><div class="superlatives-note">Bragging rights from this round — just for fun, they don&rsquo;t change the money.</div><div class="sup-grid">' +
    out.join("") +
    "</div></div>"
  );
}
function showStandings() {
  const e = document.getElementById("standings-modal"),
    t = document.getElementById("standings-content"),
    a = roundNetsToCents(calcMoney());
  state.players.length;
  let s = moneyFlowHTML("standings-flow-chart");
  s += swingHeatmapHTML();
  ((s += "<h3>Final Settlement</h3>"),
    (s += payoutTable(a)),
    (s += "<h3>Who Pays Whom</h3>"),
    (s += settlementFlowHTML(a, !0)),
    (t.innerHTML = s),
    e.classList.remove("hidden"),
    openModalA11y("standings-modal"),
    requestAnimationFrame(() => drawMoneyFlow(document.getElementById("standings-flow-chart"))));
}
function payoutTable(e) {
  let t = '<table class="payout-table"><thead><tr><th>Player</th><th>Net</th></tr></thead><tbody>';
  return (
    state.players
      .map((t, a) => ({ name: t.name, payout: e[a], color: t.color }))
      .sort((e, t) => t.payout - e.payout)
      .forEach((e, ri) => {
        const a = e.payout > 0.01 ? "positive" : e.payout < -0.01 ? "negative" : "";
        t += `<tr${0 === ri ? ' class="lead"' : ""}><td><span class="pt-player">${rankChip(ri + 1)}${avatarHTML(e, 18)}${esc(e.name)}</span></td><td class="${a}">${fmtMoney(e.payout)}</td></tr>`;
      }),
    (t += "</tbody></table>"),
    t
  );
}
function venmoLink(toIdx, amt) {
  const h = (state.players[toIdx]?.venmo || "").replace(/^@/, "").trim();
  if (!h) return null;
  const note = encodeURIComponent("Golf" + (state.course ? " \u2014 " + state.course : ""));
  return (
    "https://venmo.com/" +
    encodeURIComponent(h) +
    "?txn=pay&amount=" +
    Math.abs(amt).toFixed(2) +
    "&note=" +
    note
  );
}
function cashappLink(toIdx, amt) {
  const h = (state.players[toIdx]?.cashapp || "").replace(/^\$/, "").trim();
  return h ? "https://cash.app/$" + encodeURIComponent(h) + "/" + Math.abs(amt).toFixed(2) : null;
}
function paypalLink(toIdx, amt) {
  const h = (state.players[toIdx]?.paypal || "").replace(/^@/, "").trim();
  return h ? "https://paypal.me/" + encodeURIComponent(h) + "/" + Math.abs(amt).toFixed(2) : null;
}
function venmoBtn(toIdx, amt) {
  const n = esc(state.players[toIdx].name),
    links = [
      ["venmo", venmoLink(toIdx, amt), "Venmo"],
      ["cash", cashappLink(toIdx, amt), "Cash App"],
      ["pp", paypalLink(toIdx, amt), "PayPal"],
    ].filter((l) => l[1]);
  return links
    .map(
      (l) =>
        '<a class="settle-pay ' +
        l[0] +
        '" href="' +
        l[1] +
        '" target="_blank" rel="noopener" data-act="event.stopPropagation()" aria-label="Pay ' +
        n +
        " on " +
        l[2] +
        '">' +
        l[2] +
        "</a>",
    )
    .join("");
}
async function finishRound(e) {
  if (!canMutateRound()) return;
  /* Finishing fabricates par for every unplayed hole, settles the money and
     persists finished:true -- there is no undo, and the round leaves the resume
     list. It used to do all that on a single unguarded tap, so a mis-tap on
     hole 4 of 18 silently scored the other 14. Say exactly how many holes are
     about to be filled in and let it be cancelled. `e` marks the internal call
     from viewing an already-finished round, which must not prompt. */
  if (!e) {
    const _left = (() => {
      let n = 0;
      for (let h = 0; h < maxHole(); h++)
        state.players.some((p, i) => null == state.scores[i]?.[h]) && n++;
      return n;
    })();
    if (
      _left &&
      !(await appConfirm(
        _left +
          " hole" +
          (1 === _left ? "" : "s") +
          " ha" +
          (1 === _left ? "s" : "ve") +
          "n't been scored. Finishing now records par for " +
          (1 === _left ? "it" : "them") +
          " and settles the round for good.",
        { title: "Finish Round?", confirmLabel: "Finish Anyway", cancelLabel: "Keep Playing" },
      ))
    )
      return;
  }
  for (let e = 0; e < maxHole(); e++)
    state.players.forEach((t, a) => {
      null == state.scores[a][e] && (state.scores[a][e] = state.pars[e]);
    });
  invalidateMoneyCache();
  const t = roundNetsToCents(calcMoney()),
    a = getPlayingHandicaps(),
    s = state.pars.slice(0, maxHole()).reduce((e, t) => e + t, 0),
    n = new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  let o = `<div class="results-header">\n    <div class="results-course">${esc(state.course)}</div>\n    <div class="results-date">${n} · Par ${s} · ${GAME_NAMES[state.gameType] || state.gameType}</div>\n  </div>`;
  {
    const _w = t.length ? Math.max(...t) : 0,
      _wi = t.indexOf(_w);
    if (_w > 0.009 && "none" !== state.gameType) {
      const _p = state.players[_wi];
      ((o += `<div class="champion-card"><div class="champ-eyebrow">Champion</div><div class="champ-row">${avatarHTML(_p, 26)}<span class="champ-name">${esc(_p.name)}</span></div><div class="champ-amt" data-amt="${_w}">${fmtMoney(_w)}</div></div>`),
        e || setTimeout(celebrate, 300));
    }
  }
  ((o += '<div class="results-scores">'),
    state.players.forEach((e, t) => {
      let n = 0,
        l = 0;
      for (let e = 0; e < maxHole(); e++)
        ((n += state.scores[t][e] || 0), (l += getNetScore(t, e) || 0));
      const r = n - s,
        i = 0 === r ? "E" : (r > 0 ? "+" : "") + r;
      o += `<div class="results-player-row">\n      ${avatarHTML(e, 10)}\n      <span class="results-pname">${esc(e.name)}</span>\n      <span class="results-phdcp">(${a[t]} strokes)</span>\n      <span class="results-pgross">${n} (${i})</span>\n      <span class="results-pnet">Net ${l}</span>\n    </div>`;
    }),
    (o += "</div>"),
    (o += '<div class="results-money-title">Round Stats</div>'));
  const l = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, other: 0 };
  if (
    (state.players.forEach((e, t) => {
      for (let e = 0; e < maxHole(); e++) {
        const a = state.scores[t]?.[e];
        if (null == a) continue;
        const s = a - state.pars[e];
        s <= -2
          ? l.eagle++
          : -1 === s
            ? l.birdie++
            : 0 === s
              ? l.par++
              : 1 === s
                ? l.bogey++
                : 2 === s
                  ? l.double++
                  : l.other++;
      }
    }),
    (o += `<div class="group-stats-bar">\n    ${l.eagle ? `<div class="gs-item eagle"><div class="gs-val">${l.eagle}</div><div class="gs-label">Eagles</div></div>` : ""}\n    <div class="gs-item birdie"><div class="gs-val">${l.birdie}</div><div class="gs-label">Birdies</div></div>\n    <div class="gs-item par"><div class="gs-val">${l.par}</div><div class="gs-label">Pars</div></div>\n    <div class="gs-item bogey"><div class="gs-val">${l.bogey}</div><div class="gs-label">Bogeys</div></div>\n    <div class="gs-item double"><div class="gs-val">${l.double + l.other}</div><div class="gs-label">Double+</div></div>\n  </div>`),
    (o += statCardsHTML()),
    (o += roundSuperlativesHTML()),
    "match" === state.gameType && state._matchPresses && state._matchPresses.length > 0)
  ) {
    const e = state.players.length,
      t = state._matchPresses;
    ((o += `<div class="results-money-title">Match Breakdown (${t.length} bet${t.length > 1 ? "s" : ""})</div>`),
      t.forEach((t, a) => {
        const s = Array(e).fill(0),
          n = Array(e).fill(0),
          l = Array(e).fill(0);
        let r = 0;
        for (let a = t.start; a <= t.end; a++) {
          const o = netRow(a);
          if (o.some((e) => null == e)) continue;
          r++;
          const i = Math.min(...o);
          if (1 === o.filter((e) => e === i).length) {
            const a = o.indexOf(i);
            n[a]++;
            for (let n = 0; n < e; n++)
              n === a ? (l[n]++, (s[a] += t.val)) : (l[n]--, (s[n] -= t.val));
          }
        }
        ((o += `<div class="results-match-block ${a > 0 ? "press" : ""}">\n        <div class="rmb-header">${t.label}</div>\n        <div class="rmb-meta">$${t.val}/hole · H${t.start + 1}–${t.end + 1} · ${r} holes played</div>\n        <div class="rmb-players">`),
          state.players
            .map((e, t) => ({ name: e.name, color: e.color, wins: n[t], cum: l[t], money: s[t] }))
            .sort((e, t) => t.cum - e.cum)
            .forEach((e) => {
              const t = e.cum > 0 ? `${e.cum} UP` : e.cum < 0 ? `${Math.abs(e.cum)} DN` : "AS",
                a = e.cum > 0 ? "match-up" : e.cum < 0 ? "match-dn" : "match-as",
                s = e.money > 0.01 ? "match-up" : e.money < -0.01 ? "match-dn" : "";
              o += `<div class="rmb-row">\n            ${avatarHTML(e, 8)}\n            <span class="rmb-name">${esc(e.name)}</span>\n            <span class="rmb-wins">${e.wins}W</span>\n            <span class="rmb-status ${a}">${t}</span>\n            <span class="rmb-money ${s}">${fmtMoney(e.money)}</span>\n          </div>`;
            }),
          (o += "</div></div>"));
      }));
  }
  ((o += '<div class="results-money-block">'),
    (o += moneyFlowHTML("results-flow-chart")),
    (o += swingHeatmapHTML()),
    (o += '<div class="results-money-title">Total Money (All Bets Combined)</div>'),
    (o += payoutTable(t)));
  const i = computeSettlement(t);
  if (i.length) {
    ((o += `<div class="results-money-title">Settlement — ${i.length} transaction${i.length > 1 ? "s" : ""}</div>`),
      (o += '<div class="settlement-note">Minimum payments to settle all bets</div>'),
      (o += '<div class="settlement-list">'));
    let e = 0;
    (i.forEach((t) => {
      (e++,
        (o += `<div class="settlement-row">\n        <span class="settlement-num">${e}</span>\n        <span class="settlement-from">${avatarHTML(state.players[t.from], 9)}${esc(state.players[t.from].name)}</span>\n        <span class="settlement-arrow"><i data-ico="arrowRight"></i></span>\n        <span class="settlement-to">${esc(state.players[t.to].name)}${avatarHTML(state.players[t.to], 9)}</span>\n        <span class="settlement-amt">${fmtMoney(t.amt).replace("+", "")}</span>${venmoBtn(t.to, t.amt)}\n      </div>`));
    }),
      (o += "</div>"));
  } else
    ((o += '<div class="results-money-title">Settlement</div>'),
      (o += '<div class="settlement-note">All square — no payments needed!</div>'));
  o += "</div>";
  if ("wolf" === state.gameType && state.wolfHoles) {
    let e = 0,
      t = 0,
      a = 0,
      s = 0,
      n = 0;
    for (let o = 0; o < maxHole(); o++) {
      const l = state.wolfHoles[o];
      l &&
        l.hammers &&
        ((e += l.hammers),
        n++,
        l.hammers > s && (s = l.hammers),
        (l.hammerLog || []).forEach((e) => {
          "wolf" === e ? t++ : a++;
        }));
    }
    if (e > 0) {
      const l = Math.pow(2, s);
      o += `<div class="results-money-title">Hammer Stats</div>\n        <div class="hammer-stats-grid">\n          <div class="hammer-stat"><div class="hammer-stat-val">${e}</div><div class="hammer-stat-label">Total Hammers</div></div>\n          <div class="hammer-stat"><div class="hammer-stat-val">${n}</div><div class="hammer-stat-label">Holes Hammered</div></div>\n          <div class="hammer-stat"><div class="hammer-stat-val">${t}</div><div class="hammer-stat-label">Wolf Hammers</div></div>\n          <div class="hammer-stat"><div class="hammer-stat-val">${a}</div><div class="hammer-stat-label">Field Hammers</div></div>\n          <div class="hammer-stat"><div class="hammer-stat-val">${l}×</div><div class="hammer-stat-label">Max Multiplier</div></div>\n          <div class="hammer-stat"><div class="hammer-stat-val">${s}</div><div class="hammer-stat-label">Most on 1 Hole</div></div>\n        </div>`;
    }
  }
  ((window._resultsText = buildShareText(t, i, s, n)),
    e || saveFinishedRound(t, i),
    (document.getElementById("results-content").innerHTML = o),
    requestAnimationFrame(() => drawMoneyFlow(document.getElementById("results-flow-chart"))),
    (() => {
      const _c = document.getElementById("results-content"),
        _mb = _c && _c.querySelector(".results-money-block");
      if (_mb && _c.children[1])
        _c.insertBefore(
          _mb,
          (_c.querySelector(".champion-card") ? _c.children[2] : _c.children[1]) || null,
        );
    })(),
    document.getElementById("results-modal").classList.remove("hidden"),
    openModalA11y("results-modal"),
    animateChampAmt());
}
function animateChampAmt() {
  const el = document.querySelector("#results-modal .champ-amt[data-amt]");
  if (!el) return;
  const to = parseFloat(el.dataset.amt) || 0;
  if (!to || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches))
    return void (el.textContent = fmtMoney(to));
  const dur = 700,
    t0 = performance.now();
  el.textContent = fmtMoney(0);
  requestAnimationFrame(function step(t) {
    const k = Math.min(1, (t - t0) / dur),
      e = 1 - Math.pow(1 - k, 3);
    ((el.textContent = fmtMoney(to * e)),
      k < 1 ? requestAnimationFrame(step) : (el.textContent = fmtMoney(to)));
  });
}
function closeFinishRound() {
  (closeModal("results-modal"),
    (state.started = !1),
    (state.roundId = null),
    enterScreen("season"));
} /* Both of these overwrite players/scores/pars/gameOpts wholesale and then
   repoint state.roundId, so doing either while a round is in progress
   silently abandons it -- and touching a score afterwards writes under the
   NEW id, which for a finished round un-finishes it. Ask first. */
async function confirmLeaveActiveRound(what) {
  return (
    !state.started ||
    !!(await appConfirm(
      "You have a round in progress. Opening " + what + " leaves it \u2014 it stays saved on Home.",
      { title: "Leave Round?", confirmLabel: "Leave", cancelLabel: "Stay" },
    ))
  );
}
async function viewFinishedRound(e) {
  const t = readRounds()[e];
  if (!t) return;
  if (t.id !== state.roundId && !(await confirmLeaveActiveRound("this finished round"))) return;
  state.started && saveCurrentRound();
  ((state.roundId = t.id),
    (state.course = t.course),
    (state.gameType = t.gameType),
    (state.gameOpts = t.gameOpts),
    (state.sideBets = Object.assign(defaultSideBets(), t.sideBets || {})),
    (state.players = t.players),
    (state.pars = t.pars),
    (state.hdcps = t.hdcps),
    (state.scores = t.scores),
    (state.bonusPoints = t.bonusPoints || {}),
    (state.wolfHoles = t.wolfHoles || {}),
    (state.wolfBreakouts = t.wolfBreakouts || {}),
    (state.bankerHoles = t.bankerHoles || {}),
    (state.bankerPresses = t.bankerPresses || {}),
    (state.confirmedHoles = t.confirmedHoles || {}),
    (state.pickedUp = t.pickedUp || {}),
    (state.pairings = t.pairings),
    (state.pairingsLocked = t.pairingsLocked || !1),
    (state.matchPresses = t.matchPresses || []),
    (state.handicapMode = t.handicapMode),
    (state.holeCount = t.holeCount || 18),
    (state.holeStart = t.holeStart || 0),
    (state.started = !1));
  const a = document.getElementById("handicap-mode");
  (a && (a.value = state.handicapMode || "full"),
    invalidateHdcpCache(),
    invalidateMoneyCache(),
    finishRound(!0));
}
function buildShareText(e, t, a, s) {
  const n = getPlayingHandicaps();
  let o = `${state.course} — ${s}\n`;
  if (
    ((o += `Par ${a} · ${GAME_NAMES[state.gameType] || state.gameType}\n\n`),
    (o += "SCORES\n"),
    (o += `${"Player".padEnd(14)} ${"Gross".padEnd(7)} ${"Net".padEnd(7)} Strokes\n`),
    (o += `${"─".repeat(40)}\n`),
    state.players.forEach((e, t) => {
      let s = 0,
        l = 0;
      for (let e = 0; e < maxHole(); e++)
        ((s += state.scores[t][e] || 0), (l += getNetScore(t, e) || 0));
      const r = s - a,
        i = 0 === r ? "E" : (r > 0 ? "+" : "") + r;
      o += `${e.name.padEnd(14)} ${(s + " (" + i + ")").padEnd(7)} ${("Net " + l).padEnd(7)} ${n[t]}\n`;
    }),
    "match" === state.gameType && state._matchPresses && state._matchPresses.length > 0)
  ) {
    const e = state.players.length;
    ((o += `\nMATCH BREAKDOWN (${state._matchPresses.length} bets)\n`),
      state._matchPresses.forEach((t) => {
        const a = Array(e).fill(0),
          s = Array(e).fill(0);
        for (let n = t.start; n <= t.end; n++) {
          const o = netRow(n);
          if (o.some((e) => null == e)) continue;
          const l = Math.min(...o);
          if (1 === o.filter((e) => e === l).length) {
            const n = o.indexOf(l);
            for (let o = 0; o < e; o++)
              o === n ? (s[o]++, (a[o] += t.val)) : (s[o]--, (a[o] -= t.val));
          }
        }
        ((o += `\n${t.label} ($${t.val}/hole, H${t.start + 1}-${t.end + 1})\n`),
          state.players
            .map((e, t) => ({ name: e.name, cum: s[t], money: a[t] }))
            .sort((e, t) => t.cum - e.cum)
            .forEach((e) => {
              const t = e.cum > 0 ? `${e.cum} UP` : e.cum < 0 ? `${Math.abs(e.cum)} DN` : "AS";
              o += `  ${e.name.padEnd(12)} ${t.padEnd(5)} ${fmtMoney(e.money)}\n`;
            }));
      }));
  }
  o += "\nTOTAL MONEY\n";
  if (
    (state.players
      .map((t, a) => ({ name: t.name, m: e[a] }))
      .sort((e, t) => t.m - e.m)
      .forEach((e) => {
        o += `${e.name.padEnd(14)} ${fmtMoney(e.m)}\n`;
      }),
    t.length &&
      ((o += `\nSETTLEMENT (${t.length} transaction${t.length > 1 ? "s" : ""})\n`),
      t.forEach((e) => {
        o += `${state.players[e.from].name} pays ${state.players[e.to].name} → ${fmtMoney(e.amt).replace("+", "")}\n`;
      })),
    "wolf" === state.gameType && state.wolfHoles)
  ) {
    let e = 0,
      t = 0,
      a = 0;
    for (let s = 0; s < maxHole(); s++) {
      const n = state.wolfHoles[s];
      n &&
        n.hammers &&
        ((e += n.hammers),
        (n.hammerLog || []).forEach((e) => {
          "wolf" === e ? t++ : a++;
        }));
    }
    e > 0 && (o += `\nHAMMERS: ${e} total (${t} / ${a})\n`);
  }
  return o;
} // html2canvas is ~197KB and only image export needs it, so it ships as its own
// file instead of inline. Local copy first (the service worker caches it, so
// this still works with no signal on a course); the CDN is only a fallback for
// a client whose cache predates the split.
function loadHtml2Canvas() {
  return new Promise((res, rej) => {
    if ("undefined" != typeof html2canvas) return res();
    const add = (src, onFail) => {
      const s = document.createElement("script");
      ((s.src = src), (s.onload = () => res()), (s.onerror = onFail), document.head.appendChild(s));
    };
    add("./html2canvas.min.js", () =>
      add("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", () =>
        rej(new Error("Failed to load html2canvas")),
      ),
    );
  });
}
function downloadResultsImage() {
  const rc = document.getElementById("results-content");
  if (!rc) return;
  (showToast("Generating image…", { type: "info", duration: 6000 }),
    loadHtml2Canvas()
      .then(() => {
        const logo =
            document.querySelector(".welcome-logo")?.src ||
            document.querySelector(".header-logo")?.src ||
            "",
          cs = getComputedStyle(document.documentElement),
          bg = (cs.getPropertyValue("--surface") || "").trim() || "#173b24",
          wrap = document.createElement("div");
        ((wrap.style.cssText =
          "width:460px;padding:24px 20px;background:" +
          bg +
          ";font-family:var(--font-ui,-apple-system,sans-serif);color:var(--ink,#f0dfa8)"),
          (wrap.innerHTML =
            `<div style="text-align:center;margin-bottom:16px">${logo ? `<img src="${logo}" alt="The Press" style="width:44px;height:44px;border-radius:12px;margin-bottom:6px">` : ""}<div style="font-size:20px;font-weight:700;color:var(--accent,#dcb34a);letter-spacing:-0.5px">The Press</div></div>` +
            rc.innerHTML),
          wrap.querySelectorAll(".money-flow-wrap").forEach((el) => el.remove()),
          document.body.appendChild(wrap),
          html2canvas(wrap, { scale: 2, backgroundColor: bg, useCORS: !0 })
            .then((canvas) => {
              (wrap.parentNode && document.body.removeChild(wrap),
                canvas.toBlob((b) => {
                  const f = new File(
                    [b],
                    `thepress-${state.course.replace(/\s+/g, "-").toLowerCase()}.png`,
                    { type: "image/png" },
                  );
                  navigator.share && navigator.canShare?.({ files: [f] })
                    ? navigator
                        .share({ files: [f], title: "The Press Results" })
                        .catch(() => downloadBlob(b))
                    : downloadBlob(b);
                }));
            })
            .catch(() => {
              (wrap.parentNode && document.body.removeChild(wrap),
                showToast("Image capture failed. Try Copy Text instead.", { type: "error" }));
            }));
      })
      .catch(() => {
        showToast("Could not load image library. Try Copy Text instead.", { type: "error" });
      }));
}
function downloadBlob(e) {
  const t = document.createElement("a");
  ((t.download = `thepress-${state.course.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.png`),
    (t.href = URL.createObjectURL(e)),
    t.click());
}
function shareResults() {
  const e = window._resultsText || "";
  navigator.clipboard
    .writeText(e)
    .then(() => {
      const e = document.querySelector(".results-actions .btn.primary");
      ((e.textContent = "Copied!"),
        setTimeout(() => {
          e.textContent = "Copy Text";
        }, 2e3));
    })
    .catch(() => {
      const t = document.createElement("textarea");
      ((t.value = e),
        document.body.appendChild(t),
        t.select(),
        document.execCommand("copy"),
        document.body.removeChild(t));
      const a = document.querySelector(".results-actions .btn.primary");
      ((a.textContent = "Copied!"),
        setTimeout(() => {
          a.textContent = "Copy Text";
        }, 2e3));
    });
}
function generateRoundId() {
  return "round_" + Date.now();
}
